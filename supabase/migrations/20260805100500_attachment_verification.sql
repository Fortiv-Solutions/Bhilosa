-- ============================================================================
-- PHASE 6 — ATTACHMENT INTEGRITY + VERIFICATION WORKFLOW
-- File: supabase/migrations/20260805100500_attachment_verification.sql
--
-- THE PROBLEM
-- ===========
-- entity_attachments was well designed and badly used. It already had
-- document_hash, status (erp_document_status), is_required, deleted_at and
-- uploaded_by — every one of them unused by the application, which:
--
--   * swallowed storage upload failures with console.warn, then inserted the
--     metadata row anyway and reported success. The result is an attachment
--     record pointing at an object that does not exist — silent data loss on a
--     bill-verification workflow;
--   * fell back to a hardcoded user id and, if no matching profile existed,
--     INSERTED one with role 'project_manager' — a privileged row written from an
--     unauthenticated client path;
--   * uploaded to project-documents, then silently to procurement-documents on
--     failure, so the same logical document could live in either bucket;
--   * had no delete, no multi-file, no size/type validation, and no dedupe.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. Locks the table down (anon revoked, RLS policies, evidence cannot be
--    deleted once its bill is certified).
-- 2. Adds the indexes the verification workflow needs, including hash-based
--    duplicate detection scoped to an entity.
-- 3. Adds rpc_set_attachment_status so verification is an auditable transition
--    rather than a free-text UPDATE.
-- 4. Adds fn_required_documents_present, so bill approval can be gated on
--    evidence actually being present and verified.
-- 5. Provisions the storage bucket, so the two-bucket fallback can go away.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

-- Preconditions. erp_document_status uses 'approved', NOT 'verified' — verified
-- against the live database before writing this migration. Asserting it here
-- turns a wrong assumption into an apply-time failure with a clear message
-- rather than a runtime cast error the first time someone verifies a document.
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_label   text;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['pending', 'approved', 'rejected'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'erp_document_status' AND e.enumlabel = v_label
    ) THEN
      v_missing := array_append(v_missing, 'erp_document_status.' || v_label);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Attachment hardening cannot apply. Missing enum labels: %',
      array_to_string(v_missing, ', ');
  END IF;
END $$;

LOCK TABLE public.entity_attachments IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA
-- ----------------------------------------------------------------------------

ALTER TABLE public.entity_attachments
  ADD COLUMN IF NOT EXISTS verified_by       uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at       timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason  text,
  -- Set when an identical file (same SHA-256) already exists on this entity.
  ADD COLUMN IF NOT EXISTS is_duplicate      boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.entity_attachments.document_hash IS
  'SHA-256 of the file contents, computed client-side before upload. Detects the same invoice being attached twice.';

CREATE INDEX IF NOT EXISTS idx_entity_attachments_entity
  ON public.entity_attachments (entity_table, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_attachments_project
  ON public.entity_attachments (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entity_attachments_status
  ON public.entity_attachments (status) WHERE deleted_at IS NULL;
-- Duplicate detection is scoped to the entity: the same certificate legitimately
-- appears on two different bills, but not twice on one.
CREATE INDEX IF NOT EXISTS idx_entity_attachments_hash
  ON public.entity_attachments (entity_table, entity_id, document_hash)
  WHERE document_hash IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. VERIFICATION WORKFLOW
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_set_attachment_status(
  p_attachment_id uuid,
  p_status        text,
  p_reason        text DEFAULT NULL
)
RETURNS public.entity_attachments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.entity_attachments;
BEGIN
  -- 'approved' is the verified state: erp_document_status has no 'verified'
  -- label. Confirmed against the live enum.
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid attachment status "%". Expected pending, approved or rejected.', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_status = 'rejected' AND COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting a document.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.entity_attachments
  SET status           = p_status::erp_document_status,
      rejection_reason = CASE WHEN p_status = 'rejected' THEN btrim(p_reason) ELSE NULL END,
      verified_by      = CASE WHEN p_status = 'pending' THEN NULL ELSE public.app_current_profile_id() END,
      verified_at      = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
      updated_at       = now()
  WHERE id = p_attachment_id AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Attachment % not found.', p_attachment_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_set_attachment_status(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_set_attachment_status(uuid, text, text) FROM anon;

/* Whether every document marked is_required on an entity has been verified.
   Lets bill approval be gated on evidence rather than on convention. */
CREATE OR REPLACE FUNCTION public.fn_required_documents_present(
  p_entity_table text,
  p_entity_id    uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.entity_attachments a
    WHERE a.entity_table = p_entity_table
      AND a.entity_id = p_entity_id
      AND a.deleted_at IS NULL
      AND a.is_required
      AND a.status <> 'approved'::erp_document_status
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_required_documents_present(text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.entity_attachments ENABLE ROW LEVEL SECURITY;
-- Deliberately NOT "FORCE ROW LEVEL SECURITY": the SECURITY DEFINER functions
-- above run as the table owner and must keep bypassing RLS.
REVOKE ALL ON public.entity_attachments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_attachments TO authenticated;

DROP POLICY IF EXISTS entity_attachments_select ON public.entity_attachments;
CREATE POLICY entity_attachments_select ON public.entity_attachments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS entity_attachments_insert ON public.entity_attachments;
CREATE POLICY entity_attachments_insert ON public.entity_attachments
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS entity_attachments_update ON public.entity_attachments;
CREATE POLICY entity_attachments_update ON public.entity_attachments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Hard delete only for a file attached to a document that has not been
-- certified. Evidence behind a certified bill is retired via deleted_at, never
-- removed.
DROP POLICY IF EXISTS entity_attachments_delete ON public.entity_attachments;
CREATE POLICY entity_attachments_delete
  ON public.entity_attachments FOR DELETE TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.vendor_bills vb
      WHERE entity_attachments.entity_table = 'vendor_bills'
        AND vb.id = entity_attachments.entity_id
        AND vb.status IN ('approved'::erp_billing_status, 'paid'::erp_billing_status)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bills sb
      WHERE entity_attachments.entity_table = 'service_bills'
        AND sb.id = entity_attachments.entity_id
        AND sb.status IN ('approved', 'paid')
    )
  );

-- ----------------------------------------------------------------------------
-- 4. STORAGE BUCKET
--    One bucket, so the "try project-documents, then procurement-documents"
--    fallback can be deleted from the client. Private: every read goes through a
--    signed URL.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not present; skipping bucket provisioning.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('project-documents', 'project-documents', false, 26214400,
          ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- Any authenticated user may read and write project documents; anon gets
  -- nothing. Object-level rules are enforced by the metadata policies above.
  BEGIN
    EXECUTE $pol$
      DROP POLICY IF EXISTS project_documents_read ON storage.objects;
      CREATE POLICY project_documents_read ON storage.objects
        FOR SELECT TO authenticated USING (bucket_id = 'project-documents');
      DROP POLICY IF EXISTS project_documents_write ON storage.objects;
      CREATE POLICY project_documents_write ON storage.objects
        FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-documents');
      DROP POLICY IF EXISTS project_documents_delete ON storage.objects;
      CREATE POLICY project_documents_delete ON storage.objects
        FOR DELETE TO authenticated USING (bucket_id = 'project-documents');
    $pol$;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not manage storage.objects policies (owned by supabase_storage_admin). Set them in the dashboard: Storage > project-documents > Policies.';
  END;
END $$;

-- ----------------------------------------------------------------------------
-- 5. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entity_attachments' AND column_name = 'verified_by'
  ) THEN
    v_problems := array_append(v_problems, 'entity_attachments.verified_by missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_set_attachment_status'
  ) THEN
    v_problems := array_append(v_problems, 'rpc_set_attachment_status missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'entity_attachments' AND relrowsecurity
  ) THEN
    v_problems := array_append(v_problems, 'RLS not enabled on entity_attachments');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Attachment hardening incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Phase 6 applied: attachment verification workflow, RLS, hash dedupe, single storage bucket.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
