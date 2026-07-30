-- =====================================================================
-- Procurement + Vendor module: production hardening
-- =====================================================================
-- Closes the findings of the 2026-07-30 production-readiness audit.
--
-- Sections
--   1. Role + identity helpers (SQL mirror of frontend/src/lib/roles.ts)
--   2. Atomic document numbering + uniqueness
--   3. Schema completion (purchase-bill fields, 3-way match table)
--   4. Row Level Security on every procurement + vendor table
--   5. Server-side approval guards (triggers)
--   6. Business RPCs the frontend calls (all were missing in prod)
--   7. Grants
--
-- Every statement is idempotent and non-destructive: re-running it is
-- safe, no row is deleted, and no existing column is dropped or retyped.
-- =====================================================================

-- =====================================================================
-- 1. ROLE + IDENTITY HELPERS
-- =====================================================================
-- Mirrors normalizeDatabaseRole() in frontend/src/lib/roles.ts so that a
-- role decision made in the browser cannot disagree with the database.

CREATE OR REPLACE FUNCTION public.app_normalize_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(regexp_replace(coalesce(trim(p_role), ''), '[\s-]+', '_', 'g'))
    WHEN 'upper_management'    THEN 'upper_management'
    WHEN 'admin'               THEN 'upper_management'
    WHEN 'administrator'       THEN 'upper_management'
    WHEN 'superadmin'          THEN 'upper_management'
    WHEN 'super_admin'         THEN 'upper_management'
    WHEN 'project_director'    THEN 'upper_management'
    WHEN 'director'            THEN 'upper_management'
    WHEN 'management'          THEN 'upper_management'
    WHEN 'project_manager'     THEN 'project_manager'
    WHEN 'pr_team'             THEN 'pr_team'
    WHEN 'procurement'         THEN 'pr_team'
    WHEN 'procurement_manager' THEN 'pr_team'
    WHEN 'purchase'            THEN 'pr_team'
    WHEN 'purchase_team'       THEN 'pr_team'
    -- Site-level operators. They raise material requests and record goods
    -- receipts, but hold no approval authority. 'Site Engineer' is a live value
    -- in profiles.role, so omitting it would have locked those users out of the
    -- module entirely once RLS was enabled.
    WHEN 'site_engineer'       THEN 'site_engineer'
    WHEN 'engineer'            THEN 'site_engineer'
    WHEN 'store_keeper'        THEN 'site_engineer'
    WHEN 'storekeeper'         THEN 'site_engineer'
    WHEN 'store'               THEN 'site_engineer'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.app_normalize_role(text) IS
  'Normalises a profiles.role free-text value to upper_management|project_manager|pr_team|site_engineer. Returns NULL for unrecognised roles so callers fail closed — adding a new role string requires extending this function.';

-- The authenticated profile, or NULL. Deliberately has NO fallback: the
-- previous frontend helper fell back to "any profile in the table", which
-- attributed approvals to an arbitrary user.
CREATE OR REPLACE FUNCTION public.app_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active
    AND p.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.app_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_normalize_role(p.role)
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active
    AND p.deleted_at IS NULL;
$$;

-- Any recognised procurement role may operate the pipeline (raise requests,
-- record receipts, prepare bills). Approval is separate, below.
CREATE OR REPLACE FUNCTION public.app_can_write_procurement()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_role()
    IN ('upper_management', 'project_manager', 'pr_team', 'site_engineer');
$$;

-- PO / GRN approval: management and project managers.
CREATE OR REPLACE FUNCTION public.app_can_approve()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_role() IN ('upper_management', 'project_manager');
$$;

-- Bill approval and payment release: management only, per ROLE_SCOPES.
CREATE OR REPLACE FUNCTION public.app_can_approve_financial()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_role() = 'upper_management';
$$;

-- Raises instead of returning NULL, for use at the top of every RPC.
CREATE OR REPLACE FUNCTION public.app_require_profile()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_profile uuid;
BEGIN
  v_profile := public.app_current_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Authentication required: no active profile for the current session.'
      USING ERRCODE = '28000';
  END IF;
  RETURN v_profile;
END;
$$;

-- =====================================================================
-- 2. ATOMIC DOCUMENT NUMBERING + UNIQUENESS
-- =====================================================================
-- Replaces the client-side generator, which used the last 5 digits of
-- Date.now() and therefore repeated every 100 seconds.

CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  prefix      text NOT NULL,
  period      text NOT NULL,
  last_value  bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_number_sequences_pkey PRIMARY KEY (prefix, period)
);

COMMENT ON TABLE public.document_number_sequences IS
  'Gap-free per-prefix/per-day counters backing next_document_number(). One row per (prefix, yyyymmdd).';

CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := upper(coalesce(nullif(trim(p_prefix), ''), 'DOC'));
  v_period text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');
  v_next   bigint;
BEGIN
  INSERT INTO public.document_number_sequences (prefix, period, last_value, updated_at)
  VALUES (v_prefix, v_period, 1, now())
  ON CONFLICT (prefix, period) DO UPDATE
    SET last_value = public.document_number_sequences.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s-%s', v_prefix, v_period, lpad(v_next::text, 4, '0'));
END;
$$;

COMMENT ON FUNCTION public.next_document_number(text) IS
  'Atomically allocates the next document number, e.g. PO-20260731-0001. Safe under concurrency (single upsert).';

-- Enforce uniqueness so a duplicate can never be persisted, whatever the
-- caller does. Partial indexes ignore soft-deleted rows where applicable.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('material_requests',      'mr_number',   true),
      ('purchase_requisitions',  'pr_number',   true),
      ('rfqs',                   'rfq_number',  true),
      ('vendor_quotations',      'quotation_number', false),
      ('purchase_orders',        'po_number',   true),
      ('goods_receipt_notes',    'grn_number',  true),
      ('vendor_bills',           'bill_number', true)
    ) AS t(tbl, col, has_soft_delete)
  LOOP
    CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = r.col
    );

    -- Only create the index when existing data allows it; a pre-existing
    -- duplicate must be resolved by hand rather than failing the migration.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'deleted_at'
    ) AND r.has_soft_delete THEN
      BEGIN
        EXECUTE format(
          'CREATE UNIQUE INDEX IF NOT EXISTS ux_%1$s_%2$s ON public.%1$I (%2$I) WHERE deleted_at IS NULL',
          r.tbl, r.col);
      EXCEPTION WHEN unique_violation THEN
        RAISE WARNING 'Duplicate %.% values exist; unique index not created. Resolve duplicates and re-run.', r.tbl, r.col;
      END;
    ELSE
      BEGIN
        EXECUTE format(
          'CREATE UNIQUE INDEX IF NOT EXISTS ux_%1$s_%2$s ON public.%1$I (%2$I) WHERE %2$I IS NOT NULL',
          r.tbl, r.col);
      EXCEPTION WHEN unique_violation THEN
        RAISE WARNING 'Duplicate %.% values exist; unique index not created. Resolve duplicates and re-run.', r.tbl, r.col;
      END;
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- 3. SCHEMA COMPLETION
-- =====================================================================

-- 3a. Purchase-bill (PB) fields. The Bills form collects ten sections but
-- only `status` was ever persisted. Financially meaningful scalars become
-- real columns; the repeating operational sections (payment vouchers, PO
-- details, GRN remarks, ledger postings, advance entries) are kept in a
-- single jsonb payload so nothing the user types is discarded.
ALTER TABLE public.vendor_bills
  ADD COLUMN IF NOT EXISTS bill_received_date  date,
  ADD COLUMN IF NOT EXISTS accounting_date     date,
  ADD COLUMN IF NOT EXISTS supplier_bill_no    text,
  ADD COLUMN IF NOT EXISTS supplier_bill_date  date,
  ADD COLUMN IF NOT EXISTS company_name        text,
  ADD COLUMN IF NOT EXISTS contractor_name     text,
  ADD COLUMN IF NOT EXISTS party_name          text,
  ADD COLUMN IF NOT EXISTS company_status      text,
  ADD COLUMN IF NOT EXISTS tax_status          text,
  ADD COLUMN IF NOT EXISTS work_order_type     text,
  ADD COLUMN IF NOT EXISTS work_order_no       text,
  ADD COLUMN IF NOT EXISTS area_work_order_no  text,
  ADD COLUMN IF NOT EXISTS sub_project         text,
  ADD COLUMN IF NOT EXISTS from_pos            text,
  ADD COLUMN IF NOT EXISTS from_challans       text,
  ADD COLUMN IF NOT EXISTS payment_days        integer,
  ADD COLUMN IF NOT EXISTS bill_due_date       date,
  ADD COLUMN IF NOT EXISTS auto_debit          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perc                numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lumpsum_other_charges              numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lumpsum_loading_unloading_charges  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lumpsum_freight_charges            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lumpsum_discount_amount            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roundoff_adjustment                numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_adjusted_amount              numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cheque_amount           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cheque_payments   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debit_details           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_details          numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lbt_payable_by_us       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS additional_transportation_stax_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stax_principal_amount   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transportation_stax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stax_amount             numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lbt_principal_amount    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lbt_tax_rate            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lbt_amount              numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS project_location        text,
  ADD COLUMN IF NOT EXISTS supplier_location       text,
  ADD COLUMN IF NOT EXISTS narration               text,
  ADD COLUMN IF NOT EXISTS assigned_approval_role  text,
  ADD COLUMN IF NOT EXISTS bill_has_already_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_issue_relation_count text,
  ADD COLUMN IF NOT EXISTS form_payload            jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.vendor_bills.form_payload IS
  'Repeating purchase-bill sections that have no dedicated table: advance_payment_entries, payment_vouchers, po_details_all, grn_remarks_list, ledger_posting_info.';

-- 3b. Purchase-bill line detail. vendor_bill_lines already exists but has
-- no room for the commercial breakdown the PB entries grid captures.
ALTER TABLE public.vendor_bill_lines
  ADD COLUMN IF NOT EXISTS sr_no             integer,
  ADD COLUMN IF NOT EXISTS gr_no             text,
  ADD COLUMN IF NOT EXISTS po_no             text,
  ADD COLUMN IF NOT EXISTS challan_no        text,
  ADD COLUMN IF NOT EXISTS item_group        text,
  ADD COLUMN IF NOT EXISTS item_brand        text,
  ADD COLUMN IF NOT EXISTS purchase_category text,
  ADD COLUMN IF NOT EXISTS received_qty      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_basic_rate     numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_discount_perc  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_discount_amt   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_rate           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bill_rate         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bill_discount_perc numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bill_discount_amt  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_excise_duty_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loading_unloading_chgs numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight_chgs      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS others_chgs       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_type          text,
  ADD COLUMN IF NOT EXISTS vat_on_all        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS po_vat_rate       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amt           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_lbt_rate       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount        numeric NOT NULL DEFAULT 0;

-- vendor_bill_lines.quantity has CHECK (quantity > 0); a PB line entered
-- before quantities are known would violate it. Relax to >= 0.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vendor_bill_lines'::regclass
      AND conname = 'vendor_bill_lines_quantity_check'
  ) THEN
    ALTER TABLE public.vendor_bill_lines DROP CONSTRAINT vendor_bill_lines_quantity_check;
    ALTER TABLE public.vendor_bill_lines
      ADD CONSTRAINT vendor_bill_lines_quantity_check CHECK (quantity >= 0::numeric);
  END IF;
END $$;

-- 3c. GRN supplier free-text, kept alongside the vendor_id FK so an
-- as-printed supplier name survives even if the vendor record is edited.
ALTER TABLE public.goods_receipt_notes
  ADD COLUMN IF NOT EXISTS supplier_name text;

-- 3d. Three-way match records (PO vs GRN vs invoice). Referenced by the
-- Bills UI and by submit_vendor_bill_from_grn, but never created.
CREATE TABLE IF NOT EXISTS public.three_way_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  vendor_bill_id uuid NOT NULL,
  purchase_order_id uuid,
  grn_id uuid,
  po_value numeric NOT NULL DEFAULT 0,
  grn_value numeric NOT NULL DEFAULT 0,
  invoice_value numeric NOT NULL DEFAULT 0,
  tolerance_amount numeric NOT NULL DEFAULT 0,
  qty_variance numeric NOT NULL DEFAULT 0,
  value_variance numeric NOT NULL DEFAULT 0,
  match_status text NOT NULL DEFAULT 'pending',
  match_remarks text,
  matched_by uuid,
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT three_way_matches_pkey PRIMARY KEY (id),
  CONSTRAINT three_way_matches_status_check
    CHECK (match_status IN ('pending', 'matched', 'within_tolerance', 'mismatch')),
  CONSTRAINT three_way_matches_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT three_way_matches_vendor_bill_id_fkey
    FOREIGN KEY (vendor_bill_id) REFERENCES public.vendor_bills(id) ON DELETE CASCADE,
  CONSTRAINT three_way_matches_purchase_order_id_fkey
    FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id),
  CONSTRAINT three_way_matches_grn_id_fkey
    FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id),
  CONSTRAINT three_way_matches_matched_by_fkey
    FOREIGN KEY (matched_by) REFERENCES public.profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_three_way_matches_bill
  ON public.three_way_matches (vendor_bill_id);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_project
  ON public.three_way_matches (project_id);

-- =====================================================================
-- 4. ROW LEVEL SECURITY
-- =====================================================================
-- Audit finding: anon could SELECT and UPDATE every procurement table
-- using the publishable key that ships in the browser bundle.
--
-- Policy model:
--   SELECT  authenticated with a recognised procurement role
--   INSERT  same
--   UPDATE  same (status escalation is separately gated in section 5)
--   DELETE  upper_management only
-- anon receives no policy at all, and its table grants are revoked.

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'vendors', 'vendor_contacts', 'vendor_documents', 'vendor_selections',
    'material_requests', 'material_request_lines',
    'purchase_requisitions', 'purchase_requisition_lines',
    'rfqs', 'rfq_vendors',
    'vendor_quotations', 'quotation_lines', 'quotation_scores',
    'purchase_orders', 'purchase_order_lines',
    'goods_receipt_notes', 'goods_receipt_note_lines',
    'vendor_bills', 'vendor_bill_lines',
    'three_way_matches',
    'stock_balances', 'stock_ledger', 'inventory_locations',
    'item_master', 'item_categories',
    'entity_attachments',
    'document_number_sequences'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Deliberately NOT "FORCE ROW LEVEL SECURITY". The SECURITY DEFINER RPCs in
    -- section 6 execute as the table owner; forcing RLS would subject them to
    -- policies scoped `TO authenticated`, which no longer match once the
    -- effective role is the owner — every RPC would silently see zero rows.
    -- Owner-bypass is what lets the vetted RPCs do their work, while direct
    -- PostgREST access as anon/authenticated stays fully governed below.

    -- Drop then recreate, so re-running the migration converges.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_can_write_procurement())',
      'p_' || t || '_select', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.app_can_write_procurement())',
      'p_' || t || '_insert', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.app_can_write_procurement())
         WITH CHECK (public.app_can_write_procurement())',
      'p_' || t || '_update', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.app_can_approve_financial())',
      'p_' || t || '_delete', t);

    -- Belt and braces: strip anon's table-level grants entirely.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- =====================================================================
-- 5. SERVER-SIDE APPROVAL GUARDS
-- =====================================================================
-- Audit finding: approval authority was enforced only in the browser, and
-- updateGrnStatus/updateVendorBillStatus accepted any status with no role
-- check and no transition validation. These triggers make the database
-- the authority, whatever the client sends.

CREATE OR REPLACE FUNCTION public.trg_guard_purchase_order_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privileged text[] := ARRAY['approved', 'sent_to_vendor', 'acknowledged'];
BEGIN
  IF NEW.status::text = OLD.status::text THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = ANY(v_privileged) AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may move a purchase order to %.', NEW.status
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status::text = 'rejected' AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may reject a purchase order.'
      USING ERRCODE = '42501';
  END IF;

  -- Stamp the approver server-side so the audit trail cannot be forged.
  IF NEW.status::text = 'approved' AND OLD.status::text <> 'approved' THEN
    NEW.approved_by := coalesce(public.app_current_profile_id(), NEW.approved_by);
    NEW.approved_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_order_approval ON public.purchase_orders;
CREATE TRIGGER guard_purchase_order_approval
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_purchase_order_approval();

CREATE OR REPLACE FUNCTION public.trg_guard_grn_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Creating a GRN directly in an approved state skips inspection entirely.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text IN ('posted', 'rejected') AND NOT public.app_can_approve() THEN
      RAISE EXCEPTION 'A goods receipt note cannot be created directly as %; submit it for approval instead.', NEW.status
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status::text = OLD.status::text THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text IN ('posted', 'rejected') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may move a goods receipt note to %.', NEW.status
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status::text = 'posted' AND OLD.status::text <> 'posted' THEN
    NEW.posted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_grn_approval ON public.goods_receipt_notes;
CREATE TRIGGER guard_grn_approval
  BEFORE INSERT OR UPDATE ON public.goods_receipt_notes
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_grn_approval();

CREATE OR REPLACE FUNCTION public.trg_guard_vendor_bill_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text IN ('approved', 'paid') AND NOT public.app_can_approve_financial() THEN
      RAISE EXCEPTION 'A vendor bill cannot be created directly as %; submit it for approval instead.', NEW.status
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status::text = OLD.status::text THEN
    RETURN NEW;
  END IF;

  -- Verification may be done by any procurement operator; approval and
  -- payment release are management-only.
  IF NEW.status::text IN ('approved', 'paid', 'rejected')
     AND NOT public.app_can_approve_financial() THEN
    RAISE EXCEPTION 'Only upper management may move a vendor bill to %.', NEW.status
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status::text = 'approved' AND OLD.status::text <> 'approved' THEN
    NEW.approved_by := coalesce(public.app_current_profile_id(), NEW.approved_by);
    NEW.approved_at := now();
  END IF;

  IF NEW.status::text = 'verified' AND OLD.status::text <> 'verified' THEN
    NEW.verified_by := coalesce(public.app_current_profile_id(), NEW.verified_by);
    NEW.verified_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_vendor_bill_approval ON public.vendor_bills;
CREATE TRIGGER guard_vendor_bill_approval
  BEFORE INSERT OR UPDATE ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_vendor_bill_approval();

-- =====================================================================
-- 6. BUSINESS RPCs
-- =====================================================================
-- All five RPCs the frontend called returned HTTP 404 in production:
-- MR creation, MR inventory review, PO approve-and-send, GRN posting and
-- vendor-bill creation were therefore all dead. Three of them reported
-- success in the UI regardless.

-- Resolves a usable stock_ledger.transaction_type label at runtime. The
-- enum's labels differ between environments, so hardcoding one is how the
-- budget module previously broke.
CREATE OR REPLACE FUNCTION public.app_stock_receipt_txn_type()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  WITH preferred AS (
    SELECT unnest(ARRAY[
      'grn_receipt', 'purchase_receipt', 'receipt', 'grn', 'inward', 'in', 'purchase'
    ]) AS label, generate_series(1, 7) AS ord
  )
  SELECT p.label
  FROM preferred p
  JOIN pg_enum e ON e.enumlabel = p.label
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = (
    SELECT udt_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_ledger'
      AND column_name = 'transaction_type'
  )
  ORDER BY p.ord
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 6a. Material request submission (web + mobile)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_mobile_material_request(
  p_project_id   uuid,
  p_site_id      uuid DEFAULT NULL,
  p_title        text DEFAULT NULL,
  p_required_date date DEFAULT NULL,
  p_priority     text DEFAULT 'medium',
  p_lines        jsonb DEFAULT '[]'::jsonb,
  p_attachments  jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_mr_id   uuid;
  v_number  text;
  v_line    jsonb;
  v_count   integer := 0;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not raise material requests.' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'A project is required to raise a material request.' USING ERRCODE = '22004';
  END IF;
  IF jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one material line is required.' USING ERRCODE = '22004';
  END IF;

  v_number := public.next_document_number('MR');

  INSERT INTO public.material_requests (
    project_id, site_id, mr_number, source, title, justification,
    required_date, priority, status, raised_by, submitted_at,
    created_by, updated_by
  ) VALUES (
    p_project_id, p_site_id, v_number, 'site_engineer', p_title, p_title,
    coalesce(p_required_date, CURRENT_DATE + 7),
    coalesce(nullif(p_priority, ''), 'medium')::erp_priority,
    'submitted'::erp_procurement_status, v_profile, now(),
    v_profile, v_profile
  )
  RETURNING id INTO v_mr_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_count := v_count + 1;
    INSERT INTO public.material_request_lines (
      material_request_id, project_id, item_id, item_description, quantity,
      estimated_rate, unit, remarks, line_number, created_by, updated_by
    ) VALUES (
      v_mr_id,
      p_project_id,
      nullif(v_line->>'itemId', '')::uuid,
      coalesce(nullif(v_line->>'itemDescription', ''), 'Unspecified material'),
      greatest(coalesce((v_line->>'quantity')::numeric, 0), 0.0001),
      greatest(coalesce((v_line->>'estimatedRate')::numeric, 0), 0),
      coalesce(nullif(v_line->>'unit', ''), 'nos'),
      nullif(v_line->>'remarks', ''),
      v_count,
      v_profile, v_profile
    );
  END LOOP;

  RETURN jsonb_build_object('materialRequestId', v_mr_id, 'mrNumber', v_number, 'lineCount', v_count);
END;
$$;

-- ---------------------------------------------------------------------
-- 6b. Material request inventory review
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_material_request_inventory(
  p_material_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   uuid := public.app_require_profile();
  v_mr        public.material_requests;
  v_requested numeric := 0;
  v_available numeric := 0;
  v_decision  text;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not review material requests.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mr FROM public.material_requests WHERE id = p_material_request_id;
  IF v_mr.id IS NULL THEN
    RAISE EXCEPTION 'Material request % not found.', p_material_request_id USING ERRCODE = 'P0002';
  END IF;

  -- Compare requested quantity against on-hand stock for the same items.
  SELECT
    coalesce(sum(l.quantity), 0),
    coalesce(sum(least(l.quantity, coalesce(sb.available_qty, 0))), 0)
  INTO v_requested, v_available
  FROM public.material_request_lines l
  LEFT JOIN public.stock_balances sb
    ON sb.item_id = l.item_id
   AND sb.project_id = v_mr.project_id
  WHERE l.material_request_id = p_material_request_id;

  v_decision := CASE
    WHEN v_requested = 0            THEN 'no_lines'
    WHEN v_available >= v_requested THEN 'issue_from_stock'
    WHEN v_available > 0            THEN 'partial_stock'
    ELSE 'procure'
  END;

  UPDATE public.material_requests
  SET stock_decision = v_decision,
      status = CASE WHEN status::text = 'submitted'
                    THEN 'in_review'::erp_procurement_status
                    ELSE status END,
      reviewed_by = v_profile,
      reviewed_at = now(),
      updated_by = v_profile,
      updated_at = now()
  WHERE id = p_material_request_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'requestedQty', v_requested,
    'availableQty', v_available
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6c. Purchase order approve + send
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_and_send_purchase_order(
  p_purchase_order_id uuid,
  p_send_to_vendor    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_po      public.purchase_orders;
  v_status  text;
BEGIN
  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may approve a purchase order.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found.', p_purchase_order_id USING ERRCODE = 'P0002';
  END IF;
  IF v_po.status::text IN ('approved', 'sent_to_vendor', 'acknowledged') THEN
    RAISE EXCEPTION 'Purchase order % is already %.', v_po.po_number, v_po.status
      USING ERRCODE = '22023';
  END IF;
  IF v_po.total_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase order % has no value and cannot be approved.', v_po.po_number
      USING ERRCODE = '22023';
  END IF;

  v_status := CASE WHEN p_send_to_vendor THEN 'sent_to_vendor' ELSE 'approved' END;

  -- Two steps so the approval trigger stamps approved_by/approved_at even
  -- when the PO goes straight out to the vendor.
  UPDATE public.purchase_orders
  SET status = 'approved'::erp_po_status, updated_by = v_profile, updated_at = now()
  WHERE id = p_purchase_order_id;

  IF p_send_to_vendor THEN
    UPDATE public.purchase_orders
    SET status = 'sent_to_vendor'::erp_po_status,
        sent_at = now(), updated_by = v_profile, updated_at = now()
    WHERE id = p_purchase_order_id;
  END IF;

  RETURN jsonb_build_object(
    'purchaseOrderId', p_purchase_order_id,
    'poNumber', v_po.po_number,
    'status', v_status
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6d. Goods receipt note posting (inspection + inventory)
-- ---------------------------------------------------------------------
-- Creates the GRN against its PO, records per-line accepted/rejected
-- quantities, advances purchase_order_lines.received_qty, and posts the
-- accepted quantities into stock_balances + stock_ledger.
CREATE OR REPLACE FUNCTION public.post_goods_receipt_note(
  p_purchase_order_id uuid,
  p_receipt_date      date DEFAULT NULL,
  p_challan_no        text DEFAULT NULL,
  p_challan_date      date DEFAULT NULL,
  p_vehicle_no        text DEFAULT NULL,
  p_godown_name       text DEFAULT NULL,
  p_transporter_name  text DEFAULT NULL,
  p_quality_decision  text DEFAULT 'accepted',
  p_remarks           text DEFAULT NULL,
  p_lines             jsonb DEFAULT '[]'::jsonb,
  p_submit_for_approval boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   uuid := public.app_require_profile();
  v_po        public.purchase_orders;
  v_grn_id    uuid;
  v_number    text;
  v_line      jsonb;
  v_txn_type  text := public.app_stock_receipt_txn_type();
  v_item      uuid;
  v_recv      numeric;
  v_acc       numeric;
  v_rej       numeric;
  v_rate      numeric;
  v_po_line   uuid;
  v_total     numeric := 0;
  v_status    text;
  v_all_recv  boolean;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not receive goods.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found.', p_purchase_order_id USING ERRCODE = 'P0002';
  END IF;
  IF v_po.status::text NOT IN ('approved', 'sent_to_vendor', 'acknowledged',
                               'partially_delivered', 'delivered') THEN
    RAISE EXCEPTION 'Purchase order % is % and cannot receive goods yet.', v_po.po_number, v_po.status
      USING ERRCODE = '22023';
  END IF;

  -- A GRN is posted (and therefore hits inventory) only by an approver;
  -- everyone else submits it for approval.
  v_status := CASE
    WHEN p_submit_for_approval OR NOT public.app_can_approve() THEN 'pending_approval'
    ELSE 'posted'
  END;

  v_number := public.next_document_number('GRN');

  INSERT INTO public.goods_receipt_notes (
    project_id, site_id, purchase_order_id, vendor_id, grn_number,
    receipt_date, challan_no, challan_date, vehicle_no, godown_name,
    transporter_name, supplier_name, remarks, received_by,
    quality_decision, status, created_by, updated_by
  ) VALUES (
    v_po.project_id, v_po.site_id, v_po.id, v_po.vendor_id, v_number,
    coalesce(p_receipt_date, CURRENT_DATE), p_challan_no, p_challan_date,
    p_vehicle_no, coalesce(p_godown_name, 'Main Site Store'),
    p_transporter_name,
    (SELECT coalesce(v.display_name, v.legal_name) FROM public.vendors v WHERE v.id = v_po.vendor_id),
    p_remarks, v_profile,
    coalesce(nullif(p_quality_decision, ''), 'accepted')::erp_qc_status,
    v_status::erp_grn_status, v_profile, v_profile
  )
  RETURNING id INTO v_grn_id;

  -- Lines: use the supplied inspection payload, else fall back to the
  -- outstanding PO quantities.
  IF jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 THEN
    p_lines := (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'purchaseOrderLineId', pol.id,
               'itemId', pol.item_id,
               'receivedQty', greatest(pol.quantity - pol.received_qty, 0),
               'acceptedQty', greatest(pol.quantity - pol.received_qty, 0),
               'rejectedQty', 0,
               'unitRate', pol.unit_rate
             )), '[]'::jsonb)
      FROM public.purchase_order_lines pol
      WHERE pol.purchase_order_id = v_po.id
        AND pol.quantity > pol.received_qty
    );
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Purchase order % has no outstanding quantity to receive.', v_po.po_number
      USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_po_line := nullif(v_line->>'purchaseOrderLineId', '')::uuid;
    v_item    := nullif(v_line->>'itemId', '')::uuid;
    v_recv    := greatest(coalesce((v_line->>'receivedQty')::numeric, 0), 0);
    v_rej     := greatest(coalesce((v_line->>'rejectedQty')::numeric, 0), 0);
    v_acc     := coalesce(nullif(v_line->>'acceptedQty', '')::numeric, v_recv - v_rej);
    v_acc     := greatest(v_acc, 0);
    v_rate    := greatest(coalesce((v_line->>'unitRate')::numeric, 0), 0);

    IF v_acc + v_rej > v_recv THEN
      RAISE EXCEPTION 'Accepted (%) plus rejected (%) exceeds received (%) on a GRN line.',
        v_acc, v_rej, v_recv USING ERRCODE = '22023';
    END IF;

    -- item_id is NOT NULL on the line table; resolve it from the PO line
    -- when the client did not supply one.
    IF v_item IS NULL AND v_po_line IS NOT NULL THEN
      SELECT item_id INTO v_item FROM public.purchase_order_lines WHERE id = v_po_line;
    END IF;
    IF v_item IS NULL THEN
      RAISE EXCEPTION 'A GRN line is missing its item reference and cannot be posted.'
        USING ERRCODE = '22004';
    END IF;

    INSERT INTO public.goods_receipt_note_lines (
      grn_id, project_id, purchase_order_line_id, item_id,
      received_qty, accepted_qty, rejected_qty, unit_rate, remarks,
      created_by, updated_by
    ) VALUES (
      v_grn_id, v_po.project_id, v_po_line, v_item,
      v_recv, v_acc, v_rej, v_rate, nullif(v_line->>'remarks', ''),
      v_profile, v_profile
    );

    v_total := v_total + (v_acc * v_rate);

    IF v_po_line IS NOT NULL THEN
      UPDATE public.purchase_order_lines
      SET received_qty = least(received_qty + v_recv, quantity),
          updated_by = v_profile, updated_at = now()
      WHERE id = v_po_line;
    END IF;

    -- Inventory only moves once the GRN is actually posted.
    -- Update-then-insert rather than ON CONFLICT: stock_balances is keyed by
    -- (project, site, location, item) in practice and may legitimately hold
    -- several rows per item, so no single unique constraint can be assumed.
    IF v_status = 'posted' AND v_acc > 0 THEN
      UPDATE public.stock_balances
      SET available_qty = available_qty + v_acc,
          stock_value   = stock_value + (v_acc * v_rate),
          average_rate  = CASE
            WHEN available_qty + v_acc > 0
            THEN (stock_value + (v_acc * v_rate)) / (available_qty + v_acc)
            ELSE v_rate END,
          last_transaction_at = now(),
          updated_by = v_profile,
          updated_at = now()
      WHERE project_id = v_po.project_id
        AND item_id = v_item
        AND site_id IS NOT DISTINCT FROM v_po.site_id;

      IF NOT FOUND THEN
        INSERT INTO public.stock_balances (
          project_id, site_id, item_id, available_qty, average_rate, stock_value,
          last_transaction_at, created_by, updated_by
        ) VALUES (
          v_po.project_id, v_po.site_id, v_item, v_acc, v_rate, v_acc * v_rate,
          now(), v_profile, v_profile
        );
      END IF;

      IF v_txn_type IS NOT NULL THEN
        EXECUTE format(
          'INSERT INTO public.stock_ledger (
             project_id, site_id, item_id, transaction_type, quantity, rate, amount,
             source_table, source_id, reference_no, transaction_date, remarks, created_by
           ) VALUES ($1, $2, $3, %L, $4, $5, $6, ''goods_receipt_notes'', $7, $8, $9, $10, $11)',
          v_txn_type)
        USING v_po.project_id, v_po.site_id, v_item, v_acc, v_rate, v_acc * v_rate,
              v_grn_id, v_number, coalesce(p_receipt_date, CURRENT_DATE),
              'GRN receipt against ' || v_po.po_number, v_profile;
      ELSE
        RAISE WARNING 'No usable stock_ledger.transaction_type label found; ledger entry skipped for GRN %.', v_number;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.goods_receipt_notes
  SET account_posting_amount = v_total, updated_at = now()
  WHERE id = v_grn_id;

  -- Advance the PO's delivery state.
  SELECT bool_and(pol.received_qty >= pol.quantity) INTO v_all_recv
  FROM public.purchase_order_lines pol
  WHERE pol.purchase_order_id = v_po.id;

  IF v_status = 'posted' THEN
    UPDATE public.purchase_orders
    SET status = CASE WHEN coalesce(v_all_recv, false)
                      THEN 'delivered'::erp_po_status
                      ELSE 'partially_delivered'::erp_po_status END,
        updated_by = v_profile, updated_at = now()
    WHERE id = v_po.id
      AND status::text NOT IN ('closed', 'cancelled');
  END IF;

  RETURN jsonb_build_object(
    'grnId', v_grn_id,
    'grnNumber', v_number,
    'status', v_status,
    'acceptedValue', v_total
  );
END;
$$;

-- Supports the balance lookup performed on every GRN posting.
CREATE INDEX IF NOT EXISTS ix_stock_balances_project_item
  ON public.stock_balances (project_id, item_id);

-- ---------------------------------------------------------------------
-- 6e. Vendor bill from GRN, with real three-way matching
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_vendor_bill_from_grn(
  p_grn_id        uuid,
  p_bill_number   text DEFAULT NULL,
  p_bill_date     date DEFAULT NULL,
  p_invoice_value numeric DEFAULT NULL,
  p_document_hash text DEFAULT NULL,
  p_storage_path  text DEFAULT NULL,
  p_file_name     text DEFAULT NULL,
  p_tolerance     numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  uuid := public.app_require_profile();
  v_grn      public.goods_receipt_notes;
  v_bill_id  uuid;
  v_number   text;
  v_grn_val  numeric := 0;
  v_po_val   numeric := 0;
  v_inv_val  numeric;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_match    text;
  v_dup      boolean := false;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not raise vendor bills.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_grn FROM public.goods_receipt_notes WHERE id = p_grn_id;
  IF v_grn.id IS NULL THEN
    RAISE EXCEPTION 'Goods receipt note % not found.', p_grn_id USING ERRCODE = 'P0002';
  END IF;
  IF v_grn.status::text <> 'posted' THEN
    RAISE EXCEPTION 'GRN % must be posted before a bill can be raised against it.', v_grn.grn_number
      USING ERRCODE = '22023';
  END IF;
  IF v_grn.vendor_id IS NULL THEN
    RAISE EXCEPTION 'GRN % has no vendor and cannot be billed.', v_grn.grn_number
      USING ERRCODE = '22004';
  END IF;

  IF EXISTS (SELECT 1 FROM public.vendor_bills WHERE grn_id = p_grn_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'A vendor bill already exists for GRN %.', v_grn.grn_number
      USING ERRCODE = '23505';
  END IF;

  -- Accepted GRN value, taxed at the PO's blended rate.
  SELECT coalesce(sum(l.accepted_qty * l.unit_rate), 0)
  INTO v_grn_val
  FROM public.goods_receipt_note_lines l
  WHERE l.grn_id = p_grn_id;

  IF v_grn.purchase_order_id IS NOT NULL THEN
    SELECT coalesce(total_amount, 0) INTO v_po_val
    FROM public.purchase_orders WHERE id = v_grn.purchase_order_id;

    SELECT coalesce(sum(pol.line_total - (pol.quantity * pol.unit_rate)), 0)
    INTO v_tax
    FROM public.purchase_order_lines pol
    WHERE pol.purchase_order_id = v_grn.purchase_order_id;

    -- Pro-rate the PO tax onto the accepted value.
    IF v_po_val > 0 THEN
      v_tax := round(v_tax * (v_grn_val / nullif(v_po_val, 0)), 2);
    END IF;
  END IF;

  v_subtotal := v_grn_val;
  v_tax      := greatest(coalesce(v_tax, 0), 0);
  v_inv_val  := coalesce(p_invoice_value, v_subtotal + v_tax);
  v_number   := coalesce(nullif(trim(p_bill_number), ''), public.next_document_number('PB'));

  IF p_document_hash IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.vendor_bills
      WHERE vendor_id = v_grn.vendor_id AND deleted_at IS NULL
        AND form_payload->>'document_hash' = p_document_hash
    ) INTO v_dup;
  END IF;

  v_match := CASE
    WHEN abs(v_inv_val - (v_subtotal + v_tax)) <= greatest(coalesce(p_tolerance, 0), 0.01) THEN 'matched'
    WHEN abs(v_inv_val - (v_subtotal + v_tax)) <= greatest(coalesce(p_tolerance, 0), 0) THEN 'within_tolerance'
    ELSE 'mismatch'
  END;

  INSERT INTO public.vendor_bills (
    project_id, site_id, vendor_id, purchase_order_id, grn_id,
    bill_number, bill_date, supplier_bill_no,
    subtotal_amount, tax_amount, total_amount, net_payable_amount,
    po_value, grn_value, invoice_value, tolerance_amount,
    match_status, match_remarks, duplicate_detected,
    status, created_by, updated_by, form_payload
  ) VALUES (
    v_grn.project_id, v_grn.site_id, v_grn.vendor_id, v_grn.purchase_order_id, v_grn.id,
    v_number, coalesce(p_bill_date, CURRENT_DATE), p_file_name,
    v_subtotal, v_tax, v_subtotal + v_tax, v_subtotal + v_tax,
    v_po_val, v_grn_val, v_inv_val, greatest(coalesce(p_tolerance, 0), 0),
    v_match,
    format('Auto-generated from GRN %s. PO %s / GRN %s / Invoice %s.',
           v_grn.grn_number, v_po_val, v_grn_val, v_inv_val),
    v_dup,
    'pending_verification'::erp_billing_status, v_profile, v_profile,
    jsonb_strip_nulls(jsonb_build_object(
      'document_hash', p_document_hash,
      'storage_path', p_storage_path,
      'file_name', p_file_name,
      'source', 'grn_auto'
    ))
  )
  RETURNING id INTO v_bill_id;

  INSERT INTO public.vendor_bill_lines (
    vendor_bill_id, project_id, item_id, purchase_order_line_id,
    description, quantity, received_qty, rate, po_rate, bill_rate,
    tax_rate, gross_amount, net_amount, line_total, gr_no,
    created_by, updated_by
  )
  SELECT
    v_bill_id, v_grn.project_id, l.item_id, l.purchase_order_line_id,
    coalesce(im.name, 'Received material'),
    l.accepted_qty, l.received_qty, l.unit_rate, l.unit_rate, l.unit_rate,
    0, l.accepted_qty * l.unit_rate, l.accepted_qty * l.unit_rate,
    l.accepted_qty * l.unit_rate, v_grn.grn_number,
    v_profile, v_profile
  FROM public.goods_receipt_note_lines l
  LEFT JOIN public.item_master im ON im.id = l.item_id
  WHERE l.grn_id = p_grn_id;

  INSERT INTO public.three_way_matches (
    project_id, vendor_bill_id, purchase_order_id, grn_id,
    po_value, grn_value, invoice_value, tolerance_amount,
    value_variance, match_status, match_remarks, matched_by, matched_at
  ) VALUES (
    v_grn.project_id, v_bill_id, v_grn.purchase_order_id, v_grn.id,
    v_po_val, v_grn_val, v_inv_val, greatest(coalesce(p_tolerance, 0), 0),
    v_inv_val - (v_subtotal + v_tax), v_match,
    'Automatic three-way match on bill creation.', v_profile, now()
  )
  ON CONFLICT (vendor_bill_id) DO UPDATE
    SET po_value = excluded.po_value,
        grn_value = excluded.grn_value,
        invoice_value = excluded.invoice_value,
        value_variance = excluded.value_variance,
        match_status = excluded.match_status,
        matched_at = now(),
        updated_at = now();

  RETURN jsonb_build_object(
    'vendorBillId', v_bill_id,
    'billNumber', v_number,
    'matchStatus', v_match,
    'poValue', v_po_val,
    'grnValue', v_grn_val,
    'invoiceValue', v_inv_val,
    'duplicateDetected', v_dup
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6f. Standalone GRN create/update from the GRN form
-- ---------------------------------------------------------------------
-- The previous client-side insert omitted project_id (NOT NULL), so every
-- GRN created from the GRN tab failed; it also linked no PO, vendor or
-- lines. This RPC requires the links that make a GRN meaningful.
CREATE OR REPLACE FUNCTION public.save_goods_receipt_note(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_id      uuid := nullif(p_payload->>'id', '')::uuid;
  v_po_id   uuid := nullif(p_payload->>'purchase_order_id', '')::uuid;
  v_vendor  uuid := nullif(p_payload->>'vendor_id', '')::uuid;
  v_project uuid := nullif(p_payload->>'project_id', '')::uuid;
  v_site    uuid := nullif(p_payload->>'site_id', '')::uuid;
  v_status  text := coalesce(nullif(p_payload->>'status', ''), 'draft');
  v_number  text := nullif(p_payload->>'grn_number', '');
  v_line    jsonb;
  v_item    uuid;
  v_total   numeric := 0;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not record goods receipts.' USING ERRCODE = '42501';
  END IF;

  -- Derive the project/vendor from the PO whenever one is linked.
  IF v_po_id IS NOT NULL THEN
    SELECT project_id, site_id, vendor_id
    INTO v_project, v_site, v_vendor
    FROM public.purchase_orders WHERE id = v_po_id;
    IF v_project IS NULL THEN
      RAISE EXCEPTION 'Purchase order % not found.', v_po_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'A project (or a linked purchase order) is required to record a goods receipt.'
      USING ERRCODE = '22004';
  END IF;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'A supplier is required to record a goods receipt.' USING ERRCODE = '22004';
  END IF;

  IF v_id IS NULL THEN
    v_number := coalesce(v_number, public.next_document_number('GRN'));

    INSERT INTO public.goods_receipt_notes (
      project_id, site_id, purchase_order_id, vendor_id, grn_number,
      receipt_date, challan_no, challan_date, vehicle_no, godown_name,
      transporter_name, dealer_name, qc_no, supplier_name,
      quantity_verification, physical_inspection, damage_check,
      volume_in_brass, net_weight, in_weight, out_weight,
      asset_item, asset_amount, remarks, received_by,
      quality_decision, status,
      uploaded_invoice_url, uploaded_invoice_path, uploaded_invoice_name,
      uploaded_challan_url, uploaded_challan_path, uploaded_challan_name,
      created_by, updated_by
    ) VALUES (
      v_project, v_site, v_po_id, v_vendor, v_number,
      coalesce(nullif(p_payload->>'receipt_date', '')::date, CURRENT_DATE),
      nullif(p_payload->>'challan_no', ''),
      nullif(p_payload->>'challan_date', '')::date,
      nullif(p_payload->>'vehicle_no', ''),
      coalesce(nullif(p_payload->>'godown_name', ''), 'Main Site Store'),
      nullif(p_payload->>'transporter_name', ''),
      nullif(p_payload->>'dealer_name', ''),
      nullif(p_payload->>'qc_no', ''),
      coalesce(
        nullif(p_payload->>'supplier_name', ''),
        (SELECT coalesce(v.display_name, v.legal_name) FROM public.vendors v WHERE v.id = v_vendor)
      ),
      nullif(p_payload->>'quantity_verification', ''),
      nullif(p_payload->>'physical_inspection', ''),
      nullif(p_payload->>'damage_check', ''),
      nullif(p_payload->>'volume_in_brass', ''),
      nullif(p_payload->>'net_weight', ''),
      nullif(p_payload->>'in_weight', ''),
      nullif(p_payload->>'out_weight', ''),
      nullif(p_payload->>'asset_item', ''),
      coalesce((p_payload->>'asset_amount')::numeric, 0),
      nullif(p_payload->>'remarks', ''), v_profile,
      coalesce(nullif(p_payload->>'quality_decision', ''), 'pending')::erp_qc_status,
      v_status::erp_grn_status,
      nullif(p_payload->>'uploaded_invoice_url', ''),
      nullif(p_payload->>'uploaded_invoice_path', ''),
      nullif(p_payload->>'uploaded_invoice_name', ''),
      nullif(p_payload->>'uploaded_challan_url', ''),
      nullif(p_payload->>'uploaded_challan_path', ''),
      nullif(p_payload->>'uploaded_challan_name', ''),
      v_profile, v_profile
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.goods_receipt_notes SET
      purchase_order_id = coalesce(v_po_id, purchase_order_id),
      vendor_id         = coalesce(v_vendor, vendor_id),
      receipt_date      = coalesce(nullif(p_payload->>'receipt_date', '')::date, receipt_date),
      challan_no        = coalesce(nullif(p_payload->>'challan_no', ''), challan_no),
      challan_date      = coalesce(nullif(p_payload->>'challan_date', '')::date, challan_date),
      vehicle_no        = coalesce(nullif(p_payload->>'vehicle_no', ''), vehicle_no),
      godown_name       = coalesce(nullif(p_payload->>'godown_name', ''), godown_name),
      transporter_name  = coalesce(nullif(p_payload->>'transporter_name', ''), transporter_name),
      dealer_name       = coalesce(nullif(p_payload->>'dealer_name', ''), dealer_name),
      qc_no             = coalesce(nullif(p_payload->>'qc_no', ''), qc_no),
      supplier_name     = coalesce(nullif(p_payload->>'supplier_name', ''), supplier_name),
      quantity_verification = coalesce(nullif(p_payload->>'quantity_verification', ''), quantity_verification),
      physical_inspection   = coalesce(nullif(p_payload->>'physical_inspection', ''), physical_inspection),
      damage_check      = coalesce(nullif(p_payload->>'damage_check', ''), damage_check),
      volume_in_brass   = coalesce(nullif(p_payload->>'volume_in_brass', ''), volume_in_brass),
      net_weight        = coalesce(nullif(p_payload->>'net_weight', ''), net_weight),
      in_weight         = coalesce(nullif(p_payload->>'in_weight', ''), in_weight),
      out_weight        = coalesce(nullif(p_payload->>'out_weight', ''), out_weight),
      asset_item        = coalesce(nullif(p_payload->>'asset_item', ''), asset_item),
      asset_amount      = coalesce((p_payload->>'asset_amount')::numeric, asset_amount),
      remarks           = coalesce(nullif(p_payload->>'remarks', ''), remarks),
      quality_decision  = coalesce(nullif(p_payload->>'quality_decision', '')::erp_qc_status, quality_decision),
      status            = v_status::erp_grn_status,
      uploaded_invoice_url  = coalesce(nullif(p_payload->>'uploaded_invoice_url', ''), uploaded_invoice_url),
      uploaded_invoice_path = coalesce(nullif(p_payload->>'uploaded_invoice_path', ''), uploaded_invoice_path),
      uploaded_invoice_name = coalesce(nullif(p_payload->>'uploaded_invoice_name', ''), uploaded_invoice_name),
      uploaded_challan_url  = coalesce(nullif(p_payload->>'uploaded_challan_url', ''), uploaded_challan_url),
      uploaded_challan_path = coalesce(nullif(p_payload->>'uploaded_challan_path', ''), uploaded_challan_path),
      uploaded_challan_name = coalesce(nullif(p_payload->>'uploaded_challan_name', ''), uploaded_challan_name),
      updated_by = v_profile,
      updated_at = now()
    WHERE id = v_id;

    SELECT grn_number INTO v_number FROM public.goods_receipt_notes WHERE id = v_id;
  END IF;

  -- Replace the line set when the caller supplied one.
  IF jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN
    DELETE FROM public.goods_receipt_note_lines WHERE grn_id = v_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
      v_item := nullif(v_line->>'item_id', '')::uuid;
      IF v_item IS NULL AND nullif(v_line->>'purchase_order_line_id', '') IS NOT NULL THEN
        SELECT item_id INTO v_item FROM public.purchase_order_lines
        WHERE id = (v_line->>'purchase_order_line_id')::uuid;
      END IF;
      CONTINUE WHEN v_item IS NULL;

      INSERT INTO public.goods_receipt_note_lines (
        grn_id, project_id, purchase_order_line_id, item_id,
        received_qty, accepted_qty, rejected_qty, unit_rate, remarks,
        created_by, updated_by
      ) VALUES (
        v_id, v_project,
        nullif(v_line->>'purchase_order_line_id', '')::uuid, v_item,
        greatest(coalesce((v_line->>'received_qty')::numeric, 0), 0),
        greatest(coalesce((v_line->>'accepted_qty')::numeric, 0), 0),
        greatest(coalesce((v_line->>'rejected_qty')::numeric, 0), 0),
        greatest(coalesce((v_line->>'unit_rate')::numeric, 0), 0),
        nullif(v_line->>'remarks', ''),
        v_profile, v_profile
      );
    END LOOP;
  END IF;

  SELECT coalesce(sum(accepted_qty * unit_rate), 0) INTO v_total
  FROM public.goods_receipt_note_lines WHERE grn_id = v_id;

  UPDATE public.goods_receipt_notes
  SET account_posting_amount = v_total, updated_at = now()
  WHERE id = v_id;

  RETURN jsonb_build_object('grnId', v_id, 'grnNumber', v_number, 'status', v_status, 'value', v_total);
END;
$$;

-- ---------------------------------------------------------------------
-- 6g. Purchase bill (PB) create/update — the full ten-section form
-- ---------------------------------------------------------------------
-- Previously only `status` was persisted from a 2,166-line form. This
-- writes every scalar to a real column, every entry row to
-- vendor_bill_lines, and the repeating sections to form_payload.
CREATE OR REPLACE FUNCTION public.save_purchase_bill(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_id      uuid := nullif(p_payload->>'id', '')::uuid;
  v_project uuid := nullif(p_payload->>'project_id', '')::uuid;
  v_site    uuid := nullif(p_payload->>'site_id', '')::uuid;
  v_vendor  uuid := nullif(p_payload->>'vendor_id', '')::uuid;
  v_po_id   uuid := nullif(p_payload->>'purchase_order_id', '')::uuid;
  v_grn_id  uuid := nullif(p_payload->>'grn_id', '')::uuid;
  v_status  text := coalesce(nullif(p_payload->>'status', ''), 'draft');
  v_number  text := nullif(p_payload->>'bill_number', '');
  v_line    jsonb;
  v_sub     numeric := 0;
  v_tax     numeric := 0;
  v_gross   numeric := 0;
  v_charges numeric := 0;
  v_net     numeric := 0;
  v_sr      integer := 0;
  v_has_lines boolean := jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0;
  v_has_totals boolean := (p_payload ? 'subtotal_amount');
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not record purchase bills.' USING ERRCODE = '42501';
  END IF;

  IF v_grn_id IS NOT NULL THEN
    SELECT project_id, site_id, vendor_id, purchase_order_id
    INTO v_project, v_site, v_vendor, v_po_id
    FROM public.goods_receipt_notes WHERE id = v_grn_id;
  ELSIF v_po_id IS NOT NULL THEN
    SELECT project_id, site_id, vendor_id
    INTO v_project, v_site, v_vendor
    FROM public.purchase_orders WHERE id = v_po_id;
  END IF;

  IF v_id IS NULL THEN
    IF v_project IS NULL THEN
      RAISE EXCEPTION 'A project is required to create a purchase bill.' USING ERRCODE = '22004';
    END IF;
    IF v_vendor IS NULL THEN
      RAISE EXCEPTION 'A supplier is required to create a purchase bill.' USING ERRCODE = '22004';
    END IF;
  END IF;

  -- Line totals drive the header, so a hand-edited header cannot disagree
  -- with the entries grid.
  IF v_has_lines THEN
    SELECT
      coalesce(sum(greatest(coalesce((l->>'gross_amount')::numeric, 0), 0)), 0),
      coalesce(sum(greatest(coalesce((l->>'vat_amt')::numeric, 0), 0)), 0),
      coalesce(sum(greatest(coalesce((l->>'loading_unloading_chgs')::numeric, 0), 0)
                 + greatest(coalesce((l->>'freight_chgs')::numeric, 0), 0)
                 + greatest(coalesce((l->>'others_chgs')::numeric, 0), 0)), 0)
    INTO v_gross, v_tax, v_charges
    FROM jsonb_array_elements(p_payload->'lines') AS l;
    v_sub := v_gross + v_charges;
  ELSIF v_has_totals THEN
    v_sub := greatest(coalesce((p_payload->>'subtotal_amount')::numeric, 0), 0);
    v_tax := greatest(coalesce((p_payload->>'tax_amount')::numeric, 0), 0);
  ELSIF v_id IS NOT NULL THEN
    -- Header-only edit of an existing bill: keep the stored figures rather
    -- than silently zeroing them.
    SELECT subtotal_amount, tax_amount INTO v_sub, v_tax
    FROM public.vendor_bills WHERE id = v_id;
  END IF;

  v_charges := v_charges
    + greatest(coalesce((p_payload->>'lumpsum_other_charges')::numeric, 0), 0)
    + greatest(coalesce((p_payload->>'lumpsum_loading_unloading_charges')::numeric, 0), 0)
    + greatest(coalesce((p_payload->>'lumpsum_freight_charges')::numeric, 0), 0);

  v_net := v_sub + v_tax
    + greatest(coalesce((p_payload->>'lumpsum_other_charges')::numeric, 0), 0)
    + greatest(coalesce((p_payload->>'lumpsum_loading_unloading_charges')::numeric, 0), 0)
    + greatest(coalesce((p_payload->>'lumpsum_freight_charges')::numeric, 0), 0)
    + coalesce((p_payload->>'roundoff_adjustment')::numeric, 0)
    + greatest(coalesce((p_payload->>'stax_amount')::numeric, 0), 0)
    + greatest(coalesce((p_payload->>'lbt_amount')::numeric, 0), 0)
    - greatest(coalesce((p_payload->>'lumpsum_discount_amount')::numeric, 0), 0)
    - greatest(coalesce((p_payload->>'retention_amount')::numeric, 0), 0)
    - greatest(coalesce((p_payload->>'advance_adjusted')::numeric, 0), 0)
    - greatest(coalesce((p_payload->>'other_deductions')::numeric, 0), 0);

  IF v_id IS NULL THEN
    v_number := coalesce(v_number, public.next_document_number('PB'));

    INSERT INTO public.vendor_bills (
      project_id, site_id, vendor_id, purchase_order_id, grn_id, work_order_id,
      bill_number, bill_date, bill_book_number,
      bill_received_date, accounting_date, supplier_bill_no, supplier_bill_date,
      company_name, contractor_name, party_name, company_status, tax_status,
      work_order_type, work_order_no, area_work_order_no, sub_project,
      from_pos, from_challans, payment_days, bill_due_date, auto_debit, perc,
      subtotal_amount, tax_amount, total_amount, net_payable_amount,
      lumpsum_other_charges, lumpsum_loading_unloading_charges,
      lumpsum_freight_charges, lumpsum_discount_amount, roundoff_adjustment,
      total_adjusted_amount, cheque_amount, total_cheque_payments,
      debit_details, credit_details,
      lbt_payable_by_us, additional_transportation_stax_applicable,
      stax_principal_amount, transportation_stax_rate, stax_amount,
      lbt_principal_amount, lbt_tax_rate, lbt_amount,
      project_location, supplier_location, narration,
      retention_percent, retention_amount, advance_adjusted, other_deductions,
      assigned_approval_role, bill_has_already_signed, status_issue_relation_count,
      unlocked_fy, status, form_payload, created_by, updated_by
    ) VALUES (
      v_project, v_site, v_vendor, v_po_id, v_grn_id,
      nullif(p_payload->>'work_order_id', '')::uuid,
      v_number,
      coalesce(nullif(p_payload->>'bill_date', '')::date, CURRENT_DATE),
      nullif(p_payload->>'bill_book_number', ''),
      nullif(p_payload->>'bill_received_date', '')::date,
      nullif(p_payload->>'accounting_date', '')::date,
      nullif(p_payload->>'supplier_bill_no', ''),
      nullif(p_payload->>'supplier_bill_date', '')::date,
      nullif(p_payload->>'company_name', ''),
      nullif(p_payload->>'contractor_name', ''),
      nullif(p_payload->>'party_name', ''),
      nullif(p_payload->>'company_status', ''),
      nullif(p_payload->>'tax_status', ''),
      nullif(p_payload->>'work_order_type', ''),
      nullif(p_payload->>'work_order_no', ''),
      nullif(p_payload->>'area_work_order_no', ''),
      nullif(p_payload->>'sub_project', ''),
      nullif(p_payload->>'from_pos', ''),
      nullif(p_payload->>'from_challans', ''),
      coalesce((p_payload->>'payment_days')::integer, 30),
      nullif(p_payload->>'bill_due_date', '')::date,
      coalesce((p_payload->>'auto_debit')::boolean, false),
      coalesce((p_payload->>'perc')::numeric, 0),
      v_sub, v_tax, v_sub + v_tax, greatest(v_net, 0),
      greatest(coalesce((p_payload->>'lumpsum_other_charges')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'lumpsum_loading_unloading_charges')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'lumpsum_freight_charges')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'lumpsum_discount_amount')::numeric, 0), 0),
      coalesce((p_payload->>'roundoff_adjustment')::numeric, 0),
      greatest(coalesce((p_payload->>'total_adjusted_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'cheque_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'total_cheque_payments')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'debit_details')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'credit_details')::numeric, 0), 0),
      coalesce((p_payload->>'lbt_payable_by_us')::boolean, false),
      coalesce((p_payload->>'additional_transportation_stax_applicable')::boolean, false),
      greatest(coalesce((p_payload->>'stax_principal_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'transportation_stax_rate')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'stax_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'lbt_principal_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'lbt_tax_rate')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'lbt_amount')::numeric, 0), 0),
      nullif(p_payload->>'project_location', ''),
      nullif(p_payload->>'supplier_location', ''),
      nullif(p_payload->>'narration', ''),
      least(greatest(coalesce((p_payload->>'retention_percent')::numeric, 0), 0), 100),
      greatest(coalesce((p_payload->>'retention_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'advance_adjusted')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'other_deductions')::numeric, 0), 0),
      nullif(p_payload->>'assigned_approval_role', ''),
      coalesce((p_payload->>'bill_has_already_signed')::boolean, false),
      nullif(p_payload->>'status_issue_relation_count', ''),
      coalesce((p_payload->>'unlocked_fy')::numeric, 1),
      v_status::erp_billing_status,
      coalesce(p_payload->'form_payload', '{}'::jsonb),
      v_profile, v_profile
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.vendor_bills SET
      purchase_order_id = coalesce(v_po_id, purchase_order_id),
      grn_id            = coalesce(v_grn_id, grn_id),
      bill_date         = coalesce(nullif(p_payload->>'bill_date', '')::date, bill_date),
      bill_book_number  = coalesce(nullif(p_payload->>'bill_book_number', ''), bill_book_number),
      bill_received_date = coalesce(nullif(p_payload->>'bill_received_date', '')::date, bill_received_date),
      accounting_date   = coalesce(nullif(p_payload->>'accounting_date', '')::date, accounting_date),
      supplier_bill_no  = coalesce(nullif(p_payload->>'supplier_bill_no', ''), supplier_bill_no),
      supplier_bill_date = coalesce(nullif(p_payload->>'supplier_bill_date', '')::date, supplier_bill_date),
      company_name      = coalesce(nullif(p_payload->>'company_name', ''), company_name),
      contractor_name   = coalesce(nullif(p_payload->>'contractor_name', ''), contractor_name),
      party_name        = coalesce(nullif(p_payload->>'party_name', ''), party_name),
      company_status    = coalesce(nullif(p_payload->>'company_status', ''), company_status),
      tax_status        = coalesce(nullif(p_payload->>'tax_status', ''), tax_status),
      work_order_type   = coalesce(nullif(p_payload->>'work_order_type', ''), work_order_type),
      work_order_no     = coalesce(nullif(p_payload->>'work_order_no', ''), work_order_no),
      area_work_order_no = coalesce(nullif(p_payload->>'area_work_order_no', ''), area_work_order_no),
      sub_project       = coalesce(nullif(p_payload->>'sub_project', ''), sub_project),
      from_pos          = coalesce(nullif(p_payload->>'from_pos', ''), from_pos),
      from_challans     = coalesce(nullif(p_payload->>'from_challans', ''), from_challans),
      payment_days      = coalesce((p_payload->>'payment_days')::integer, payment_days),
      bill_due_date     = coalesce(nullif(p_payload->>'bill_due_date', '')::date, bill_due_date),
      auto_debit        = coalesce((p_payload->>'auto_debit')::boolean, auto_debit),
      perc              = coalesce((p_payload->>'perc')::numeric, perc),
      subtotal_amount   = v_sub,
      tax_amount        = v_tax,
      total_amount      = v_sub + v_tax,
      lumpsum_other_charges = coalesce((p_payload->>'lumpsum_other_charges')::numeric, lumpsum_other_charges),
      lumpsum_loading_unloading_charges = coalesce((p_payload->>'lumpsum_loading_unloading_charges')::numeric, lumpsum_loading_unloading_charges),
      lumpsum_freight_charges = coalesce((p_payload->>'lumpsum_freight_charges')::numeric, lumpsum_freight_charges),
      lumpsum_discount_amount = coalesce((p_payload->>'lumpsum_discount_amount')::numeric, lumpsum_discount_amount),
      roundoff_adjustment = coalesce((p_payload->>'roundoff_adjustment')::numeric, roundoff_adjustment),
      total_adjusted_amount = coalesce((p_payload->>'total_adjusted_amount')::numeric, total_adjusted_amount),
      cheque_amount     = coalesce((p_payload->>'cheque_amount')::numeric, cheque_amount),
      total_cheque_payments = coalesce((p_payload->>'total_cheque_payments')::numeric, total_cheque_payments),
      debit_details     = coalesce((p_payload->>'debit_details')::numeric, debit_details),
      credit_details    = coalesce((p_payload->>'credit_details')::numeric, credit_details),
      lbt_payable_by_us = coalesce((p_payload->>'lbt_payable_by_us')::boolean, lbt_payable_by_us),
      additional_transportation_stax_applicable = coalesce((p_payload->>'additional_transportation_stax_applicable')::boolean, additional_transportation_stax_applicable),
      stax_principal_amount = coalesce((p_payload->>'stax_principal_amount')::numeric, stax_principal_amount),
      transportation_stax_rate = coalesce((p_payload->>'transportation_stax_rate')::numeric, transportation_stax_rate),
      stax_amount       = coalesce((p_payload->>'stax_amount')::numeric, stax_amount),
      lbt_principal_amount = coalesce((p_payload->>'lbt_principal_amount')::numeric, lbt_principal_amount),
      lbt_tax_rate      = coalesce((p_payload->>'lbt_tax_rate')::numeric, lbt_tax_rate),
      lbt_amount        = coalesce((p_payload->>'lbt_amount')::numeric, lbt_amount),
      project_location  = coalesce(nullif(p_payload->>'project_location', ''), project_location),
      supplier_location = coalesce(nullif(p_payload->>'supplier_location', ''), supplier_location),
      narration         = coalesce(nullif(p_payload->>'narration', ''), narration),
      retention_percent = coalesce(least(greatest((p_payload->>'retention_percent')::numeric, 0), 100), retention_percent),
      retention_amount  = coalesce((p_payload->>'retention_amount')::numeric, retention_amount),
      advance_adjusted  = coalesce((p_payload->>'advance_adjusted')::numeric, advance_adjusted),
      other_deductions  = coalesce((p_payload->>'other_deductions')::numeric, other_deductions),
      assigned_approval_role = coalesce(nullif(p_payload->>'assigned_approval_role', ''), assigned_approval_role),
      bill_has_already_signed = coalesce((p_payload->>'bill_has_already_signed')::boolean, bill_has_already_signed),
      status_issue_relation_count = coalesce(nullif(p_payload->>'status_issue_relation_count', ''), status_issue_relation_count),
      unlocked_fy       = coalesce((p_payload->>'unlocked_fy')::numeric, unlocked_fy),
      status            = v_status::erp_billing_status,
      form_payload      = coalesce(p_payload->'form_payload', form_payload),
      updated_by        = v_profile,
      updated_at        = now()
    WHERE id = v_id;

    SELECT bill_number, project_id INTO v_number, v_project
    FROM public.vendor_bills WHERE id = v_id;
  END IF;

  -- Entry lines
  IF jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN
    DELETE FROM public.vendor_bill_lines WHERE vendor_bill_id = v_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
      v_sr := v_sr + 1;
      INSERT INTO public.vendor_bill_lines (
        vendor_bill_id, project_id, item_id, purchase_order_line_id,
        sr_no, gr_no, po_no, challan_no, item_group, item_brand,
        purchase_category, description, unit, quantity, received_qty,
        rate, po_basic_rate, po_discount_perc, po_discount_amt, po_rate,
        bill_rate, bill_discount_perc, bill_discount_amt, gross_amount,
        po_excise_duty_rate, loading_unloading_chgs, freight_chgs, others_chgs,
        vat_type, vat_on_all, po_vat_rate, vat_amt, po_lbt_rate,
        tax_rate, net_amount, line_total, created_by, updated_by
      ) VALUES (
        v_id, v_project,
        nullif(v_line->>'item_id', '')::uuid,
        nullif(v_line->>'purchase_order_line_id', '')::uuid,
        coalesce((v_line->>'sr_no')::integer, v_sr),
        nullif(v_line->>'gr_no', ''),
        nullif(v_line->>'po_no', ''),
        nullif(v_line->>'challan_no', ''),
        nullif(v_line->>'item_group', ''),
        nullif(v_line->>'item_brand', ''),
        nullif(v_line->>'purchase_category', ''),
        coalesce(nullif(v_line->>'item_desc', ''), nullif(v_line->>'description', ''), 'Billed item'),
        nullif(v_line->>'unit', ''),
        greatest(coalesce((v_line->>'received_qty')::numeric, 0), 0),
        greatest(coalesce((v_line->>'received_qty')::numeric, 0), 0),
        greatest(coalesce((v_line->>'bill_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_basic_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_discount_perc')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_discount_amt')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'bill_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'bill_discount_perc')::numeric, 0), 0),
        greatest(coalesce((v_line->>'bill_discount_amt')::numeric, 0), 0),
        greatest(coalesce((v_line->>'gross_amount')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_excise_duty_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'loading_unloading_chgs')::numeric, 0), 0),
        greatest(coalesce((v_line->>'freight_chgs')::numeric, 0), 0),
        greatest(coalesce((v_line->>'others_chgs')::numeric, 0), 0),
        nullif(v_line->>'vat_type', ''),
        coalesce((v_line->>'vat_on_all')::boolean, false),
        greatest(coalesce((v_line->>'po_vat_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'vat_amt')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_lbt_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'po_vat_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'net_amount')::numeric, 0), 0),
        greatest(coalesce((v_line->>'net_amount')::numeric, 0), 0),
        v_profile, v_profile
      );
    END LOOP;
  END IF;

  -- Recompute the net payable from the persisted row so it always agrees
  -- with the stored components, whatever subset of fields the payload sent.
  UPDATE public.vendor_bills SET
    net_payable_amount = greatest(
      subtotal_amount + tax_amount
      + lumpsum_other_charges + lumpsum_loading_unloading_charges
      + lumpsum_freight_charges + roundoff_adjustment
      + stax_amount + lbt_amount
      - lumpsum_discount_amount - retention_amount
      - advance_adjusted - other_deductions, 0)
  WHERE id = v_id
  RETURNING net_payable_amount INTO v_net;

  RETURN jsonb_build_object(
    'vendorBillId', v_id,
    'billNumber', v_number,
    'status', v_status,
    'subtotal', v_sub,
    'tax', v_tax,
    'netPayable', coalesce(v_net, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6h. Validated status transitions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_goods_receipt_note_status(
  p_grn_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_current text;
  v_allowed text[];
BEGIN
  SELECT status::text INTO v_current FROM public.goods_receipt_notes WHERE id = p_grn_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Goods receipt note % not found.', p_grn_id USING ERRCODE = 'P0002';
  END IF;

  v_allowed := CASE v_current
    WHEN 'draft'                THEN ARRAY['draft', 'pending_verification', 'pending_approval', 'cancelled']
    WHEN 'pending_verification' THEN ARRAY['pending_verification', 'pending_approval', 'draft', 'rejected']
    WHEN 'pending_approval'     THEN ARRAY['pending_approval', 'posted', 'rejected', 'pending_verification']
    WHEN 'posted'               THEN ARRAY['posted']
    WHEN 'rejected'             THEN ARRAY['rejected', 'draft']
    ELSE ARRAY[v_current]
  END;

  IF NOT (p_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'A goods receipt note cannot move from % to %.', v_current, p_status
      USING ERRCODE = '22023';
  END IF;

  -- The approval trigger enforces the role for posted/rejected.
  UPDATE public.goods_receipt_notes
  SET status = p_status::erp_grn_status, updated_by = v_profile, updated_at = now()
  WHERE id = p_grn_id;

  RETURN jsonb_build_object('grnId', p_grn_id, 'from', v_current, 'to', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_bill_status(
  p_bill_id uuid,
  p_status  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_current text;
  v_match   text;
  v_allowed text[];
BEGIN
  SELECT status::text, match_status INTO v_current, v_match
  FROM public.vendor_bills WHERE id = p_bill_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Vendor bill % not found.', p_bill_id USING ERRCODE = 'P0002';
  END IF;

  v_allowed := CASE v_current
    WHEN 'draft'                THEN ARRAY['draft', 'pending_verification', 'pending_approval']
    WHEN 'pending_verification' THEN ARRAY['pending_verification', 'verified', 'pending_approval', 'draft', 'rejected']
    WHEN 'verified'             THEN ARRAY['verified', 'pending_approval', 'approved', 'rejected']
    WHEN 'pending_approval'     THEN ARRAY['pending_approval', 'approved', 'rejected', 'pending_verification']
    WHEN 'approved'             THEN ARRAY['approved', 'paid']
    WHEN 'paid'                 THEN ARRAY['paid']
    WHEN 'rejected'             THEN ARRAY['rejected', 'draft']
    ELSE ARRAY[v_current]
  END;

  IF NOT (p_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'A vendor bill cannot move from % to %.', v_current, p_status
      USING ERRCODE = '22023';
  END IF;

  -- A mismatched three-way match must be resolved before approval.
  IF p_status IN ('approved', 'paid') AND v_match = 'mismatch' THEN
    RAISE EXCEPTION 'This bill fails its three-way match and cannot be approved until the variance is resolved.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.vendor_bills
  SET status = p_status::erp_billing_status, updated_by = v_profile, updated_at = now()
  WHERE id = p_bill_id;

  RETURN jsonb_build_object('vendorBillId', p_bill_id, 'from', v_current, 'to', p_status);
END;
$$;

-- ---------------------------------------------------------------------
-- 6i. Purchase order full save (the PO form had no persistence path)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_purchase_order(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_id      uuid := nullif(p_payload->>'id', '')::uuid;
  v_project uuid := nullif(p_payload->>'project_id', '')::uuid;
  v_site    uuid := nullif(p_payload->>'site_id', '')::uuid;
  v_vendor  uuid := nullif(p_payload->>'vendor_id', '')::uuid;
  v_pr_id   uuid := nullif(p_payload->>'purchase_requisition_id', '')::uuid;
  v_number  text := nullif(p_payload->>'po_number', '');
  v_status  text := coalesce(nullif(p_payload->>'status', ''), 'draft');
  v_line    jsonb;
  v_sub     numeric := 0;
  v_tax     numeric := 0;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not create purchase orders.' USING ERRCODE = '42501';
  END IF;

  -- Editing an approved PO would change a committed contractual value.
  IF v_id IS NOT NULL THEN
    IF (SELECT status::text FROM public.purchase_orders WHERE id = v_id)
       IN ('approved', 'sent_to_vendor', 'acknowledged', 'partially_delivered', 'delivered', 'closed')
       AND NOT public.app_can_approve() THEN
      RAISE EXCEPTION 'This purchase order is already issued and can no longer be edited.'
        USING ERRCODE = '42501';
    END IF;
    SELECT project_id INTO v_project FROM public.purchase_orders WHERE id = v_id;
  END IF;

  IF v_pr_id IS NOT NULL AND v_project IS NULL THEN
    SELECT project_id, site_id INTO v_project, v_site
    FROM public.purchase_requisitions WHERE id = v_pr_id;
  END IF;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'A project is required to create a purchase order.' USING ERRCODE = '22004';
  END IF;
  IF v_vendor IS NULL AND v_id IS NULL THEN
    RAISE EXCEPTION 'A vendor must be selected before a purchase order can be created.'
      USING ERRCODE = '22004';
  END IF;
  IF jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) = 0 AND v_id IS NULL THEN
    RAISE EXCEPTION 'A purchase order needs at least one line item.' USING ERRCODE = '22004';
  END IF;

  SELECT
    coalesce(sum(greatest(coalesce((l->>'quantity')::numeric, 0), 0)
               * greatest(coalesce((l->>'unit_rate')::numeric, 0), 0)), 0),
    coalesce(sum(greatest(coalesce((l->>'quantity')::numeric, 0), 0)
               * greatest(coalesce((l->>'unit_rate')::numeric, 0), 0)
               * greatest(coalesce((l->>'tax_rate')::numeric, 0), 0) / 100.0), 0)
  INTO v_sub, v_tax
  FROM jsonb_array_elements(coalesce(p_payload->'lines', '[]'::jsonb)) AS l;

  IF v_id IS NULL THEN
    v_number := coalesce(v_number, public.next_document_number('PO'));

    INSERT INTO public.purchase_orders (
      project_id, site_id, vendor_id, purchase_requisition_id, vendor_selection_id,
      po_number, po_date, delivery_location, delivery_date, payment_terms,
      terms_and_conditions, terms_and_conditions_legal, gst_194q_clause,
      rera_warranty_clause, company_name, contractor_name, contract_reference,
      site_contact_person, site_contact_number,
      subtotal_amount, tax_amount, total_amount, status, created_by, updated_by
    ) VALUES (
      v_project, v_site, v_vendor, v_pr_id,
      nullif(p_payload->>'vendor_selection_id', '')::uuid,
      v_number,
      coalesce(nullif(p_payload->>'po_date', '')::date, CURRENT_DATE),
      nullif(p_payload->>'delivery_location', ''),
      nullif(p_payload->>'delivery_date', '')::date,
      nullif(p_payload->>'payment_terms', ''),
      nullif(p_payload->>'terms_and_conditions', ''),
      nullif(p_payload->>'terms_and_conditions_legal', ''),
      nullif(p_payload->>'gst_194q_clause', ''),
      nullif(p_payload->>'rera_warranty_clause', ''),
      nullif(p_payload->>'company_name', ''),
      nullif(p_payload->>'contractor_name', ''),
      nullif(p_payload->>'contract_reference', ''),
      nullif(p_payload->>'site_contact_person', ''),
      nullif(p_payload->>'site_contact_number', ''),
      v_sub, v_tax, v_sub + v_tax, v_status::erp_po_status, v_profile, v_profile
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.purchase_orders SET
      vendor_id         = coalesce(v_vendor, vendor_id),
      delivery_location = coalesce(nullif(p_payload->>'delivery_location', ''), delivery_location),
      delivery_date     = coalesce(nullif(p_payload->>'delivery_date', '')::date, delivery_date),
      payment_terms     = coalesce(nullif(p_payload->>'payment_terms', ''), payment_terms),
      terms_and_conditions = coalesce(nullif(p_payload->>'terms_and_conditions', ''), terms_and_conditions),
      terms_and_conditions_legal = coalesce(nullif(p_payload->>'terms_and_conditions_legal', ''), terms_and_conditions_legal),
      gst_194q_clause   = coalesce(nullif(p_payload->>'gst_194q_clause', ''), gst_194q_clause),
      rera_warranty_clause = coalesce(nullif(p_payload->>'rera_warranty_clause', ''), rera_warranty_clause),
      company_name      = coalesce(nullif(p_payload->>'company_name', ''), company_name),
      contractor_name   = coalesce(nullif(p_payload->>'contractor_name', ''), contractor_name),
      contract_reference = coalesce(nullif(p_payload->>'contract_reference', ''), contract_reference),
      site_contact_person = coalesce(nullif(p_payload->>'site_contact_person', ''), site_contact_person),
      site_contact_number = coalesce(nullif(p_payload->>'site_contact_number', ''), site_contact_number),
      subtotal_amount   = CASE WHEN jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN v_sub ELSE subtotal_amount END,
      tax_amount        = CASE WHEN jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN v_tax ELSE tax_amount END,
      total_amount      = CASE WHEN jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN v_sub + v_tax ELSE total_amount END,
      status            = v_status::erp_po_status,
      updated_by        = v_profile,
      updated_at        = now()
    WHERE id = v_id;

    SELECT po_number INTO v_number FROM public.purchase_orders WHERE id = v_id;
  END IF;

  IF jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN
    -- Preserve already-received quantities across an edit.
    DELETE FROM public.purchase_order_lines
    WHERE purchase_order_id = v_id AND received_qty = 0;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
      CONTINUE WHEN coalesce((v_line->>'quantity')::numeric, 0) <= 0;

      INSERT INTO public.purchase_order_lines (
        purchase_order_id, project_id, item_id, item_description,
        quantity, unit_rate, tax_rate, line_total, created_by, updated_by
      ) VALUES (
        v_id, v_project,
        nullif(v_line->>'item_id', '')::uuid,
        coalesce(nullif(v_line->>'item_description', ''), 'Purchased item'),
        (v_line->>'quantity')::numeric,
        greatest(coalesce((v_line->>'unit_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'tax_rate')::numeric, 0), 0),
        greatest(coalesce((v_line->>'line_total')::numeric,
          (v_line->>'quantity')::numeric * coalesce((v_line->>'unit_rate')::numeric, 0)), 0),
        v_profile, v_profile
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'purchaseOrderId', v_id, 'poNumber', v_number,
    'subtotal', v_sub, 'tax', v_tax, 'total', v_sub + v_tax
  );
END;
$$;

-- =====================================================================
-- 7. GRANTS
-- =====================================================================
-- RPCs are callable only by an authenticated session. anon gets nothing:
-- every function above starts with app_require_profile() anyway, but the
-- grant makes the boundary explicit.

DO $$
DECLARE
  v_fns text[] := ARRAY[
    'app_normalize_role(text)',
    'app_current_profile_id()',
    'app_current_role()',
    'app_can_write_procurement()',
    'app_can_approve()',
    'app_can_approve_financial()',
    'app_require_profile()',
    'app_stock_receipt_txn_type()',
    'next_document_number(text)',
    'submit_mobile_material_request(uuid,uuid,text,date,text,jsonb,jsonb)',
    'review_material_request_inventory(uuid)',
    'approve_and_send_purchase_order(uuid,boolean)',
    'post_goods_receipt_note(uuid,date,text,date,text,text,text,text,text,jsonb,boolean)',
    'submit_vendor_bill_from_grn(uuid,text,date,numeric,text,text,text,numeric)',
    'save_goods_receipt_note(jsonb)',
    'save_purchase_bill(jsonb)',
    'set_goods_receipt_note_status(uuid,text)',
    'set_vendor_bill_status(uuid,text)',
    'save_purchase_order(jsonb)'
  ];
  f text;
BEGIN
  FOREACH f IN ARRAY v_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

-- Make sure PostgREST picks up the new functions immediately.
NOTIFY pgrst, 'reload schema';
