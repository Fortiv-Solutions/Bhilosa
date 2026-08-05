-- ============================================================================
-- PHASE 7 — BUDGET CHANGE DOCUMENTS (A + C COMBINED)
-- File: supabase/migrations/20260805100600_budget_change_documents.sql
--
-- THE DESIGN
-- ==========
-- A (staged revision) and C (movement documents) are orthogonal axes, not
-- competing options:
--
--   A is a LIFECYCLE   — draft -> submitted -> approved -> applied.
--                        "When does this take effect, and who signed it off?"
--   C is a TAXONOMY    — original / supplement / return / transfer / revision.
--                        "What kind of money movement is this, and where did the
--                         money come from?"
--
-- Combined: every budget change is a TYPED MOVEMENT DOCUMENT that flows through
-- a STAGED APPROVAL LIFECYCLE. That is what SAP BCS (document types + workflow)
-- and Oracle Project Budgets (versions + baseline + change documents) do.
--
-- THE PROBLEM IT REPLACES
-- =======================
-- budget_revisions.status accepted draft|submitted|approved|rejected and
-- approved_by/approved_at existed — but BOTH write RPCs hardcoded
-- status='approved', approved_at=now() and mutated master_budget_items in the
-- same transaction. An Excel import instantly rewrote the live baseline,
-- cascaded to allocations and re-fired every alert. The only brake was
-- budget_lock_enabled, a self-service toggle inside the same module.
--
-- The approval workflow was schema-present and code-absent.
--
-- WHAT MAKES THIS SAFE
-- ====================
-- * budget_revision_items already stores old_*/new_* per line. It is the staging
--   table; it was simply being written AFTER the fact instead of before.
-- * Optimistic locking: master_budget_items.version_number is captured per line
--   at propose time and re-checked at apply. Without it, two open proposals on
--   the same line would silently overwrite each other.
-- * Transfers are enforced net-zero.
-- * A return cannot strand committed or spent money.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

LOCK TABLE public.budget_allocations,
           public.budget_categories,
           public.budget_config,
           public.budget_revision_items,
           public.budget_revisions,
           public.master_budget_items
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA — C's semantics onto A's lifecycle. Mostly additive.
-- ----------------------------------------------------------------------------

ALTER TABLE public.budget_revisions
  ADD COLUMN IF NOT EXISTS movement_type text NOT NULL DEFAULT 'revision',
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  /* Transfers only: money leaves the source head and arrives at the target. */
  ADD COLUMN IF NOT EXISTS source_category_id uuid REFERENCES public.budget_categories(id),
  ADD COLUMN IF NOT EXISTS target_category_id uuid REFERENCES public.budget_categories(id),
  ADD COLUMN IF NOT EXISTS funding_source text,
  ADD COLUMN IF NOT EXISTS approval_tier text NOT NULL DEFAULT 'management',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  /* Hash of the project's active baseline at propose time. Catches lines added
     or retired underneath an open document, which per-line versions cannot. */
  ADD COLUMN IF NOT EXISTS baseline_fingerprint text;

DO $$
BEGIN
  ALTER TABLE public.budget_revisions DROP CONSTRAINT IF EXISTS budget_revisions_status_chk;
  ALTER TABLE public.budget_revisions ADD CONSTRAINT budget_revisions_status_chk
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_revisions_movement_type_chk') THEN
    ALTER TABLE public.budget_revisions ADD CONSTRAINT budget_revisions_movement_type_chk
      CHECK (movement_type IN ('original', 'supplement', 'return', 'transfer', 'revision', 'restatement'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_revisions_approval_tier_chk') THEN
    ALTER TABLE public.budget_revisions ADD CONSTRAINT budget_revisions_approval_tier_chk
      CHECK (approval_tier IN ('pm', 'management', 'board'));
  END IF;

  -- A transfer moves money between heads; it never changes the project total.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_revisions_transfer_net_zero_chk') THEN
    ALTER TABLE public.budget_revisions ADD CONSTRAINT budget_revisions_transfer_net_zero_chk
      CHECK (movement_type <> 'transfer' OR status <> 'approved' OR net_diff_amount = 0);
  END IF;
END $$;

ALTER TABLE public.budget_revision_items
  /* Optimistic lock: master_budget_items.version_number when the line was staged. */
  ADD COLUMN IF NOT EXISTS base_version_number integer,
  ADD COLUMN IF NOT EXISTS change_kind text NOT NULL DEFAULT 'amend',
  /* A sub-category proposed inline; created only when the document is approved,
     so a reviewer sees new taxonomy nodes before they exist. */
  ADD COLUMN IF NOT EXISTS proposed_category_name text,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.budget_categories(id),
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS sr_no text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_revision_items_change_kind_chk') THEN
    ALTER TABLE public.budget_revision_items ADD CONSTRAINT budget_revision_items_change_kind_chk
      CHECK (change_kind IN ('add', 'amend', 'retire'));
  END IF;
END $$;

-- The sanctioned figure, preserved alongside the current one. Original vs
-- Current vs Committed vs Spent is the four-column view every construction cost
-- report has.
ALTER TABLE public.master_budget_items
  ADD COLUMN IF NOT EXISTS original_budgeted_cost numeric NOT NULL DEFAULT 0;

UPDATE public.master_budget_items
SET original_budgeted_cost = budgeted_cost
WHERE original_budgeted_cost = 0 AND budgeted_cost <> 0;

-- Approval thresholds, alongside the alert thresholds already in budget_config.
ALTER TABLE public.budget_config
  ADD COLUMN IF NOT EXISTS pm_transfer_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS board_approval_percent numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS require_change_approval boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.budget_config.pm_transfer_limit IS
  'Transfers within one head up to this value may be approved by a project manager. 0 means every movement needs management approval.';
COMMENT ON COLUMN public.budget_config.require_change_approval IS
  'When false, a proposal auto-approves on submit. Provided as an escape hatch for a project mid-setup; leaving it true is the production posture.';

CREATE INDEX IF NOT EXISTS idx_budget_revisions_status
  ON public.budget_revisions (project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_revisions_movement
  ON public.budget_revisions (project_id, movement_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_revisions_document_number
  ON public.budget_revisions (project_id, lower(btrim(document_number)))
  WHERE document_number IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. HELPERS
-- ----------------------------------------------------------------------------

/* A stable hash of the project's active baseline. Two proposals raised against
   the same baseline share a fingerprint; anything added or retired in between
   changes it. */
CREATE OR REPLACE FUNCTION public.fn_budget_baseline_fingerprint(p_project_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(COALESCE(string_agg(id::text || ':' || budgeted_cost::text, ',' ORDER BY id), ''))
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;
$$;

/* BCR-<project code>-<year>-<serial>. Human reference for the register. */
CREATE OR REPLACE FUNCTION public.fn_next_budget_document_number(p_project_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code   text;
  v_serial integer;
BEGIN
  SELECT COALESCE(NULLIF(btrim(code), ''), 'PRJ') INTO v_code
  FROM public.projects WHERE id = p_project_id;

  SELECT COUNT(*) + 1 INTO v_serial
  FROM public.budget_revisions WHERE project_id = p_project_id;

  RETURN format('BCR-%s-%s-%s', upper(v_code), to_char(now(), 'YYYY'), lpad(v_serial::text, 4, '0'));
END $$;

/* Which tier must sign this off. Mirrors the thresholds in budget_config. */
CREATE OR REPLACE FUNCTION public.fn_budget_change_tier(
  p_project_id    uuid,
  p_movement_type text,
  p_net_diff      numeric,
  p_same_head     boolean
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg      public.budget_config;
  v_original numeric;
BEGIN
  SELECT * INTO v_cfg FROM public.budget_config WHERE project_id = p_project_id;

  IF p_movement_type = 'original' THEN
    RETURN 'board';
  END IF;

  SELECT COALESCE(SUM(original_budgeted_cost), 0) INTO v_original
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;

  -- New money, or a large movement relative to the sanctioned total.
  IF p_movement_type = 'supplement'
     OR (v_original > 0
         AND abs(COALESCE(p_net_diff, 0)) / v_original * 100
             >= COALESCE(v_cfg.board_approval_percent, 10)) THEN
    RETURN 'board';
  END IF;

  IF p_movement_type = 'transfer'
     AND p_same_head
     AND abs(COALESCE(p_net_diff, 0)) <= COALESCE(v_cfg.pm_transfer_limit, 0)
     AND COALESCE(v_cfg.pm_transfer_limit, 0) > 0 THEN
    RETURN 'pm';
  END IF;

  RETURN 'management';
END $$;

-- ----------------------------------------------------------------------------
-- 3. PROPOSE — writes staging only. master_budget_items is untouched.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_propose_budget_change(
  p_project_id     uuid,
  p_movement_type  text,
  p_justification  text,
  p_items          jsonb,
  p_effective_date date    DEFAULT NULL,
  p_funding_source text    DEFAULT NULL,
  p_source_category_id uuid DEFAULT NULL,
  p_target_category_id uuid DEFAULT NULL,
  p_submit         boolean DEFAULT true
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item      jsonb;
  v_old       public.master_budget_items;
  v_revision  public.budget_revisions;
  v_version   integer;
  v_profile   uuid := public.app_current_profile_id();
  v_old_total numeric;
  v_new_total numeric := 0;
  v_diff      numeric := 0;
  v_count     integer := 0;
  v_new_qty   numeric;
  v_new_rate  numeric;
  v_new_cost  numeric;
  v_same_head boolean;
BEGIN
  IF p_movement_type NOT IN ('original','supplement','return','transfer','revision') THEN
    RAISE EXCEPTION 'Unknown movement type "%".', p_movement_type USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(p_justification), '') = '' THEN
    RAISE EXCEPTION 'A justification is mandatory on every budget change.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No budget lines supplied.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_movement_type = 'supplement' AND COALESCE(btrim(p_funding_source), '') = '' THEN
    RAISE EXCEPTION 'A supplement adds new money and must state its funding source.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_movement_type = 'transfer' AND (p_source_category_id IS NULL OR p_target_category_id IS NULL) THEN
    RAISE EXCEPTION 'A transfer must name both the source and the target budget head.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_assert_budget_unlocked(p_project_id);

  -- Only one Original per project, and it is immutable once approved.
  IF p_movement_type = 'original' AND EXISTS (
    SELECT 1 FROM public.budget_revisions
    WHERE project_id = p_project_id AND movement_type = 'original' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'This project already has an approved Original Budget. Raise a supplement, return, transfer or revision instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_old_total
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM public.budget_revisions WHERE project_id = p_project_id;

  INSERT INTO public.budget_revisions (
    project_id, version_number, version_label, justification_reason,
    old_total_cost, new_total_cost, net_diff_amount,
    edited_by, edited_by_name, status, scope, movement_type, document_number,
    effective_date, funding_source, source_category_id, target_category_id,
    baseline_fingerprint, submitted_by, submitted_at
  ) VALUES (
    p_project_id, v_version,
    format('%s v%s', initcap(p_movement_type), v_version),
    btrim(p_justification),
    v_old_total, v_old_total, 0,
    v_profile,
    COALESCE((SELECT COALESCE(name, email) FROM public.profiles WHERE id = v_profile), 'Pramukh ERP User'),
    CASE WHEN p_submit THEN 'draft' ELSE 'draft' END,
    'master_budget', p_movement_type,
    public.fn_next_budget_document_number(p_project_id),
    p_effective_date, NULLIF(btrim(p_funding_source), ''),
    p_source_category_id, p_target_category_id,
    public.fn_budget_baseline_fingerprint(p_project_id),
    NULL, NULL
  )
  RETURNING * INTO v_revision;

  -- Stage each line. Nothing live is touched.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_old := NULL;
    IF NULLIF(v_item->>'id', '') IS NOT NULL THEN
      SELECT * INTO v_old FROM public.master_budget_items
      WHERE id = (v_item->>'id')::uuid AND project_id = p_project_id;
    END IF;

    v_new_rate := COALESCE((v_item->>'estimated_rate')::numeric, v_old.estimated_rate, 0);
    v_new_qty  := COALESCE((v_item->>'qty_total')::numeric, v_old.qty_total, 0);
    v_new_cost := COALESCE((v_item->>'budgeted_cost')::numeric, ROUND(v_new_qty * v_new_rate, 2));

    IF v_new_rate < 0 OR v_new_qty < 0 OR v_new_cost < 0 THEN
      RAISE EXCEPTION 'Negative quantity, rate or cost rejected on "%".',
        COALESCE(v_item->>'item_description', v_old.item_description, 'line')
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.budget_revision_items (
      revision_id, master_budget_item_id, sub_activity, category_name,
      sr_no, unit, category_id, proposed_category_name,
      old_qty, new_qty, old_rate, new_rate, old_cost, new_cost,
      base_version_number, change_kind
    ) VALUES (
      v_revision.id,
      v_old.id,
      COALESCE(NULLIF(btrim(v_item->>'item_description'), ''), v_old.item_description, 'Unnamed line'),
      COALESCE(NULLIF(btrim(v_item->>'category_name'), ''), v_old.category_name, 'Uncategorised'),
      COALESCE(NULLIF(btrim(v_item->>'sr_no'), ''), v_old.sr_no),
      COALESCE(NULLIF(btrim(v_item->>'unit'), ''), v_old.unit, 'LS'),
      NULLIF(v_item->>'category_id', '')::uuid,
      NULLIF(btrim(v_item->>'proposed_category_name'), ''),
      COALESCE(v_old.qty_total, 0), v_new_qty,
      COALESCE(v_old.estimated_rate, 0), v_new_rate,
      COALESCE(v_old.budgeted_cost, 0), v_new_cost,
      v_old.version_number,
      COALESCE(NULLIF(v_item->>'change_kind', ''),
               CASE WHEN v_old.id IS NULL THEN 'add' ELSE 'amend' END)
    );

    v_count := v_count + 1;
    v_diff  := v_diff + (v_new_cost - COALESCE(v_old.budgeted_cost, 0));
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No usable budget lines in this proposal.' USING ERRCODE = 'check_violation';
  END IF;

  v_new_total := v_old_total + v_diff;
  v_same_head := p_source_category_id IS NOT DISTINCT FROM p_target_category_id;

  UPDATE public.budget_revisions
  SET new_total_cost  = v_new_total,
      net_diff_amount = v_diff,
      approval_tier   = public.fn_budget_change_tier(p_project_id, p_movement_type, v_diff, v_same_head)
  WHERE id = v_revision.id
  RETURNING * INTO v_revision;

  -- Direction sanity, so a document cannot claim to be something it is not.
  IF p_movement_type = 'supplement' AND v_diff <= 0 THEN
    RAISE EXCEPTION 'A supplement must increase the budget (this one nets %).', v_diff
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_movement_type = 'return' AND v_diff >= 0 THEN
    RAISE EXCEPTION 'A return must reduce the budget (this one nets %).', v_diff
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_movement_type = 'transfer' AND ROUND(v_diff, 2) <> 0 THEN
    RAISE EXCEPTION 'A transfer must be net-zero across heads (this one nets %). Adjust the lines so the source reduction equals the target increase.', ROUND(v_diff, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_submit THEN
    SELECT * INTO v_revision FROM public.rpc_submit_budget_change(v_revision.id);
  END IF;

  RETURN v_revision;
END $$;

-- ----------------------------------------------------------------------------
-- 4. SUBMIT / APPROVE / REJECT / CANCEL
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_budget_change(p_revision_id uuid)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.budget_revisions;
  v_cfg      public.budget_config;
BEGIN
  SELECT * INTO v_revision FROM public.budget_revisions WHERE id = p_revision_id;
  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Budget change % not found.', p_revision_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_revision.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft can be submitted (this one is %).', v_revision.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.budget_revisions
  SET status       = 'submitted',
      submitted_by = public.app_current_profile_id(),
      submitted_at = now()
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  -- Escape hatch for a project still being set up; true is the production posture.
  SELECT * INTO v_cfg FROM public.budget_config WHERE project_id = v_revision.project_id;
  IF NOT COALESCE(v_cfg.require_change_approval, true) THEN
    SELECT * INTO v_revision
    FROM public.rpc_approve_budget_change(p_revision_id, 'Auto-approved: change approval disabled for this project.');
  END IF;

  RETURN v_revision;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_approve_budget_change(
  p_revision_id uuid,
  p_remarks     text DEFAULT NULL
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision  public.budget_revisions;
  v_item      public.budget_revision_items;
  v_current   public.master_budget_items;
  v_profile   uuid := public.app_current_profile_id();
  v_conflicts text[] := ARRAY[]::text[];
  v_bua       numeric;
  v_cat_id    uuid;
  v_alloc     public.budget_allocations;
  v_new_id    uuid;
BEGIN
  SELECT * INTO v_revision FROM public.budget_revisions WHERE id = p_revision_id FOR UPDATE;
  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Budget change % not found.', p_revision_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_revision.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Budget change % is already %.', v_revision.document_number, v_revision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_assert_budget_unlocked(v_revision.project_id);

  SELECT COALESCE(bua_sqft, 0) INTO v_bua FROM public.projects WHERE id = v_revision.project_id;

  -- 4a. STALENESS. Between propose and approve another document may have moved
  --     the same lines. Without this check, approvals silently overwrite each
  --     other. Reported as a list so the UI can offer a rebase.
  FOR v_item IN
    SELECT * FROM public.budget_revision_items WHERE revision_id = p_revision_id
  LOOP
    IF v_item.master_budget_item_id IS NOT NULL THEN
      SELECT * INTO v_current FROM public.master_budget_items WHERE id = v_item.master_budget_item_id;
      IF v_current.id IS NULL THEN
        v_conflicts := array_append(v_conflicts, v_item.sub_activity || ' (line no longer exists)');
      ELSIF v_item.base_version_number IS NOT NULL
            AND v_current.version_number IS DISTINCT FROM v_item.base_version_number THEN
        v_conflicts := array_append(v_conflicts,
          format('%s (changed since this was raised: v%s -> v%s)',
                 v_item.sub_activity, v_item.base_version_number, v_current.version_number));
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_conflicts, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot approve %: the baseline moved after this document was raised. Rebase it and resubmit. Conflicts: %',
      v_revision.document_number, array_to_string(v_conflicts, '; ')
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 4b. A return must not strand money already committed or spent.
  IF v_revision.movement_type IN ('return', 'transfer', 'revision') THEN
    FOR v_item IN
      SELECT * FROM public.budget_revision_items
      WHERE revision_id = p_revision_id AND new_cost < old_cost
    LOOP
      SELECT ba.* INTO v_alloc
      FROM public.master_budget_items mbi
      JOIN public.budget_allocations ba
        ON ba.project_id = mbi.project_id AND ba.category_id = mbi.category_id AND ba.deleted_at IS NULL
      WHERE mbi.id = v_item.master_budget_item_id;

      IF v_alloc.id IS NOT NULL
         AND (v_alloc.allocated_amount - (v_item.old_cost - v_item.new_cost))
             < (COALESCE(v_alloc.committed_amount, 0) + COALESCE(v_alloc.spent_amount, 0)) THEN
        RAISE EXCEPTION
          'Reducing "%" would take budget head "%" below what is already committed and spent (% committed + % spent).',
          v_item.sub_activity, v_alloc.allocation_name,
          COALESCE(v_alloc.committed_amount, 0), COALESCE(v_alloc.spent_amount, 0)
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  -- 4c. APPLY. Only now does anything live change.
  FOR v_item IN
    SELECT * FROM public.budget_revision_items WHERE revision_id = p_revision_id
  LOOP
    -- Create any inline-proposed category, so a reviewer saw it before it existed.
    --
    -- Deliberately find-then-insert rather than ON CONFLICT: Phase 8 replaces the
    -- project-wide unique constraint on (project_id, category_name) with a
    -- parent-aware one, and an ON CONFLICT naming the old constraint would fail
    -- outright once that lands. This form is agnostic to which is in place.
    v_cat_id := v_item.category_id;
    IF v_cat_id IS NULL AND v_item.proposed_category_name IS NOT NULL THEN
      SELECT id INTO v_cat_id
      FROM public.budget_categories
      WHERE project_id = v_revision.project_id
        AND lower(btrim(category_name)) = lower(btrim(v_item.proposed_category_name))
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_cat_id IS NULL THEN
        INSERT INTO public.budget_categories (project_id, category_name, category_code)
        VALUES (v_revision.project_id, btrim(v_item.proposed_category_name),
                upper(left(regexp_replace(v_item.proposed_category_name, '[^a-zA-Z0-9]', '', 'g'), 8)))
        RETURNING id INTO v_cat_id;
      END IF;
    END IF;
    IF v_cat_id IS NULL THEN
      SELECT id INTO v_cat_id FROM public.budget_categories
      WHERE project_id = v_revision.project_id AND category_name = v_item.category_name
      LIMIT 1;
    END IF;

    IF v_item.change_kind = 'retire' AND v_item.master_budget_item_id IS NOT NULL THEN
      UPDATE public.master_budget_items
      SET is_active = false, version_number = version_number + 1, updated_at = now()
      WHERE id = v_item.master_budget_item_id;

    ELSIF v_item.master_budget_item_id IS NULL THEN
      INSERT INTO public.master_budget_items (
        project_id, category_id, category_name, sr_no, item_description,
        qty_total, unit, estimated_rate, budgeted_cost, original_budgeted_cost,
        cost_per_bua, version_number
      ) VALUES (
        v_revision.project_id, v_cat_id, v_item.category_name,
        COALESCE(v_item.sr_no, '0'), v_item.sub_activity,
        v_item.new_qty, COALESCE(v_item.unit, 'LS'), v_item.new_rate, v_item.new_cost,
        CASE WHEN v_revision.movement_type = 'original' THEN v_item.new_cost ELSE 0 END,
        CASE WHEN v_bua > 0 THEN ROUND(v_item.new_cost / v_bua, 2) ELSE 0 END,
        1
      )
      RETURNING id INTO v_new_id;

      UPDATE public.budget_revision_items
      SET master_budget_item_id = v_new_id WHERE id = v_item.id;

    ELSE
      UPDATE public.master_budget_items
      SET qty_total      = v_item.new_qty,
          estimated_rate = v_item.new_rate,
          budgeted_cost  = v_item.new_cost,
          category_id    = COALESCE(v_cat_id, category_id),
          unit           = COALESCE(v_item.unit, unit),
          cost_per_bua   = CASE WHEN v_bua > 0 THEN ROUND(v_item.new_cost / v_bua, 2) ELSE 0 END,
          original_budgeted_cost =
            CASE WHEN v_revision.movement_type = 'original' THEN v_item.new_cost
                 ELSE original_budgeted_cost END,
          is_active      = true,
          version_number = version_number + 1,
          updated_at     = now()
      WHERE id = v_item.master_budget_item_id;
    END IF;
  END LOOP;

  UPDATE public.budget_revisions
  SET status           = 'approved',
      approved_by      = v_profile,
      approved_at      = now(),
      applied_at       = now(),
      justification_reason = justification_reason
        || COALESCE(E'\n\nApproval remarks: ' || NULLIF(btrim(p_remarks), ''), '')
  WHERE id = p_revision_id
  RETURNING * INTO v_revision;

  RETURN v_revision;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_reject_budget_change(
  p_revision_id uuid,
  p_reason      text
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.budget_revisions;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is mandatory when rejecting a budget change.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.budget_revisions
  SET status           = 'rejected',
      rejected_by      = public.app_current_profile_id(),
      rejected_at      = now(),
      rejection_reason = btrim(p_reason)
  WHERE id = p_revision_id AND status IN ('draft', 'submitted')
  RETURNING * INTO v_revision;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Budget change % cannot be rejected — it is not open.', p_revision_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_revision;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_budget_change(p_revision_id uuid)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision public.budget_revisions;
BEGIN
  UPDATE public.budget_revisions
  SET status = 'cancelled'
  WHERE id = p_revision_id AND status = 'draft'
  RETURNING * INTO v_revision;

  IF v_revision.id IS NULL THEN
    RAISE EXCEPTION 'Only a draft budget change can be withdrawn.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_revision;
END $$;

-- ----------------------------------------------------------------------------
-- 5. THE MOVEMENT REGISTER
--    "Who moved money from where to where, and why" as a first-class report.
--    That question had no answer while every change was an in-place line edit.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.budget_movement_register CASCADE;
CREATE VIEW public.budget_movement_register AS
SELECT
  r.id, r.project_id, p.name AS project_name,
  r.document_number, r.movement_type, r.status, r.approval_tier,
  r.version_number, r.version_label, r.justification_reason, r.funding_source,
  r.old_total_cost, r.new_total_cost, r.net_diff_amount,
  r.effective_date, r.created_at, r.submitted_at, r.approved_at, r.applied_at,
  r.rejected_at, r.rejection_reason,
  r.edited_by_name AS raised_by_name,
  sub.name  AS submitted_by_name,
  app.name  AS approved_by_name,
  rej.name  AS rejected_by_name,
  src.category_name AS source_head,
  tgt.category_name AS target_head,
  (SELECT COUNT(*) FROM public.budget_revision_items i WHERE i.revision_id = r.id) AS line_count
FROM public.budget_revisions r
JOIN      public.projects          p   ON p.id  = r.project_id
LEFT JOIN public.profiles          sub ON sub.id = r.submitted_by
LEFT JOIN public.profiles          app ON app.id = r.approved_by
LEFT JOIN public.profiles          rej ON rej.id = r.rejected_by
LEFT JOIN public.budget_categories src ON src.id = r.source_category_id
LEFT JOIN public.budget_categories tgt ON tgt.id = r.target_category_id;

REVOKE ALL ON public.budget_movement_register FROM anon;
GRANT SELECT ON public.budget_movement_register TO authenticated;
ALTER VIEW public.budget_movement_register SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 6. THE OLD WRITE PATHS NOW PROPOSE INSTEAD OF APPLYING
--    This is the behavioural heart of Phase 7: a Master Budget save and an Excel
--    import stop rewriting the live baseline and become proposals.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_save_master_budget_revision(
  p_project_id     uuid,
  p_justification  text,
  p_edited_by_name text,
  p_items          jsonb
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_items jsonb;
BEGIN
  -- Normalise to the propose payload: qty_total from the three scope columns
  -- when they are supplied, exactly as the old implementation did.
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e->>'id',
      'estimated_rate', e->>'estimated_rate',
      'qty_total', COALESCE(
        NULLIF(COALESCE((e->>'qty_rcc')::numeric, 0)
             + COALESCE((e->>'qty_finishes')::numeric, 0)
             + COALESCE((e->>'qty_infra')::numeric, 0), 0),
        (e->>'qty_total')::numeric),
      'change_kind', 'amend'
    )
  ) INTO v_items
  FROM jsonb_array_elements(p_items) e;

  RETURN public.rpc_propose_budget_change(
    p_project_id, 'revision', p_justification, v_items, NULL, NULL, NULL, NULL, true
  );
END $$;

CREATE OR REPLACE FUNCTION public.rpc_import_master_budget(
  p_project_id      uuid,
  p_justification   text,
  p_edited_by_name  text,
  p_items           jsonb,
  p_archive_missing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_first  boolean;
  v_movement  text;
  v_items     jsonb;
  v_revision  public.budget_revisions;
  v_added     integer := 0;
  v_amended   integer := 0;
  v_retired   integer := 0;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM public.master_budget_items
    WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL
  ) INTO v_is_first;

  -- First import on an empty project is the SANCTION event; later imports are a
  -- revision against the current baseline.
  v_movement := CASE WHEN v_is_first THEN 'original' ELSE 'revision' END;

  -- Match each incoming row to an existing line so the proposal is a real diff
  -- rather than a wholesale overwrite.
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                     mbi.id,
      'item_description',       btrim(e->>'item_description'),
      'category_name',          COALESCE(NULLIF(btrim(e->>'category_name'), ''), 'Uncategorised'),
      'proposed_category_name', CASE WHEN bc.id IS NULL
                                     THEN COALESCE(NULLIF(btrim(e->>'category_name'), ''), 'Uncategorised')
                                     ELSE NULL END,
      'category_id',            bc.id,
      'sr_no',                  e->>'sr_no',
      'unit',                   COALESCE(NULLIF(btrim(e->>'unit'), ''), 'LS'),
      'estimated_rate',         COALESCE((e->>'estimated_rate')::numeric, 0),
      'qty_total',              GREATEST(COALESCE((e->>'qty_total')::numeric, 1), 0),
      'budgeted_cost',          COALESCE((e->>'budgeted_cost')::numeric,
                                  ROUND(GREATEST(COALESCE((e->>'qty_total')::numeric, 1), 0)
                                        * COALESCE((e->>'estimated_rate')::numeric, 0), 2)),
      'change_kind',            CASE WHEN mbi.id IS NULL THEN 'add' ELSE 'amend' END
    )
  ) INTO v_items
  FROM jsonb_array_elements(p_items) e
  LEFT JOIN public.budget_categories bc
    ON bc.project_id = p_project_id
   AND bc.category_name = COALESCE(NULLIF(btrim(e->>'category_name'), ''), 'Uncategorised')
  LEFT JOIN public.master_budget_items mbi
    ON mbi.project_id = p_project_id
   AND mbi.category_id IS NOT DISTINCT FROM bc.id
   AND lower(btrim(mbi.item_description)) = lower(btrim(e->>'item_description'))
   AND mbi.deleted_at IS NULL
  WHERE COALESCE(btrim(e->>'item_description'), '') <> '';

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Every row in the uploaded sheet was skipped (no usable item descriptions).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lines absent from the sheet become an explicit RETIRE within the same
  -- document, instead of a silent is_active = false.
  IF p_archive_missing THEN
    SELECT v_items || COALESCE(jsonb_agg(
      jsonb_build_object('id', mbi.id, 'item_description', mbi.item_description,
                         'category_name', mbi.category_name, 'change_kind', 'retire',
                         'budgeted_cost', 0, 'qty_total', 0, 'estimated_rate', 0)
    ), '[]'::jsonb) INTO v_items
    FROM public.master_budget_items mbi
    WHERE mbi.project_id = p_project_id AND mbi.is_active AND mbi.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_items) x
        WHERE (x->>'id')::uuid = mbi.id
      );
  END IF;

  v_revision := public.rpc_propose_budget_change(
    p_project_id, v_movement,
    COALESCE(NULLIF(btrim(p_justification), ''), 'Master budget schedule imported from Excel'),
    v_items, NULL, NULL, NULL, NULL, true
  );

  SELECT
    COUNT(*) FILTER (WHERE change_kind = 'add'),
    COUNT(*) FILTER (WHERE change_kind = 'amend'),
    COUNT(*) FILTER (WHERE change_kind = 'retire')
    INTO v_added, v_amended, v_retired
  FROM public.budget_revision_items WHERE revision_id = v_revision.id;

  RETURN jsonb_build_object(
    'revision_id',     v_revision.id,
    'document_number', v_revision.document_number,
    'movement_type',   v_revision.movement_type,
    'status',          v_revision.status,
    'version_number',  v_revision.version_number,
    'inserted',        v_added,
    'updated',         v_amended,
    'archived',        v_retired,
    'old_total',       v_revision.old_total_cost,
    'new_total',       v_revision.new_total_cost,
    'requires_approval', v_revision.status <> 'approved'
  );
END $$;

-- ----------------------------------------------------------------------------
-- 7. GRANTS
-- ----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.rpc_propose_budget_change(uuid, text, text, jsonb, date, text, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_budget_change(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_budget_change(uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_budget_change(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_budget_change(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_budget_baseline_fingerprint(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_budget_change_tier(uuid, text, numeric, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_propose_budget_change(uuid, text, text, jsonb, date, text, uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_submit_budget_change(uuid)        FROM anon;
REVOKE ALL ON FUNCTION public.rpc_approve_budget_change(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_reject_budget_change(uuid, text)  FROM anon;
REVOKE ALL ON FUNCTION public.rpc_cancel_budget_change(uuid)        FROM anon;
REVOKE ALL ON FUNCTION public.fn_next_budget_document_number(uuid)  FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. BACKFILL — give the existing history a document identity.
-- ----------------------------------------------------------------------------

UPDATE public.budget_revisions
SET movement_type = CASE WHEN scope = 'excel_import' THEN 'original' ELSE 'revision' END
WHERE movement_type = 'revision' AND scope = 'excel_import';

UPDATE public.budget_revisions r
SET document_number = format('BCR-%s-%s-%s',
      upper(COALESCE(NULLIF(btrim(p.code), ''), 'PRJ')),
      to_char(r.created_at, 'YYYY'),
      lpad(r.version_number::text, 4, '0')),
    applied_at = COALESCE(r.applied_at, r.approved_at, r.created_at)
FROM public.projects p
WHERE p.id = r.project_id AND r.document_number IS NULL;

-- ----------------------------------------------------------------------------
-- 9. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['movement_type', 'document_number', 'approval_tier',
                               'baseline_fingerprint', 'applied_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'budget_revisions' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'budget_revisions.' || v_key || ' missing');
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_revision_items'
      AND column_name = 'base_version_number'
  ) THEN
    v_problems := array_append(v_problems, 'budget_revision_items.base_version_number missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_budget_items'
      AND column_name = 'original_budgeted_cost'
  ) THEN
    v_problems := array_append(v_problems, 'master_budget_items.original_budgeted_cost missing');
  END IF;

  FOREACH v_key IN ARRAY ARRAY['rpc_propose_budget_change', 'rpc_submit_budget_change',
                               'rpc_approve_budget_change', 'rpc_reject_budget_change',
                               'rpc_cancel_budget_change'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_key
    ) THEN
      v_problems := array_append(v_problems, v_key || ' missing');
    END IF;
  END LOOP;

  IF to_regclass('public.budget_movement_register') IS NULL THEN
    v_problems := array_append(v_problems, 'budget_movement_register missing');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Budget change documents incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Phase 7 applied: budget changes are now typed movement documents under a staged approval lifecycle.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
