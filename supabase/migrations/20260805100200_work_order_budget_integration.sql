-- ============================================================================
-- PHASE 2 — WORK ORDER BUDGET INTEGRATION
-- File: supabase/migrations/20260805100200_work_order_budget_integration.sql
--
-- Depends on:
--   20260801000000_service_bills_schema.sql            (service_bills)
--   20260803000000_work_order_module_enhancement.sql   (wo_status, billed_to_date, ...)
--   20260805100000_budget_ledger_txn_types.sql         (new enum labels)
--   20260805100100_budget_ledger_gross_basis_...sql    (revision_seq, signed amounts)
--
-- THE PROBLEM
-- ===========
-- A Work Order was a complete contract document that was financially inert.
-- Approving a Rs 50 L Work Order moved nothing in the budget: no commitment, no
-- encumbrance, no reduction in available budget. budget_allocations.committed_amount
-- only ever reflected purchase orders, so available budget was overstated by the
-- entire open subcontract book — on a project where subcontract and labour is
-- typically 40-60% of cost.
--
-- work_orders.budget_allocation_id already existed and was never populated: the
-- create-WO form has no field for it, so it was always NULL. That also meant the
-- scope-overrun alerts raised by fn_wo_line_variance_alert carried a NULL
-- allocation, which (a) never deduplicated, because the partial unique index does
-- not treat NULLs as equal, and (b) never auto-closed, because
-- fn_check_budget_overrun_alert closes by allocation id.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. Makes the budget head RESOLVABLE and then MANDATORY at issue.
-- 2. Posts a 'commitment' ledger row when a WO is issued (encumbrance accounting,
--    matching the PO path), a delta commitment when the WO value is varied, and a
--    release of the residual when it is closed or cancelled.
-- 3. Enforces the hard limit configured in budget_config at issue time. Until now
--    hard_limit_enforcement = 'block' was configured but enforced by nothing.
-- 4. Fixes the Work Order drawdown arithmetic:
--      * tax basis — WO value is Sum(qty x rate); service bill total_amount is
--        subtotal + tax. Comparing them made a fully-billed WO read ~118% billed
--        and drove remaining_balance negative. Templates differ on whether GST is
--        included, so the basis is now declared per WO rather than assumed.
--      * certified vs claimed — billed_to_date counted every non-rejected bill,
--        including drafts, so an unsubmitted claim drew down the WO balance.
-- 5. Repairs the orphaned scope-overrun alerts.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0a. LOCK DISCIPLINE
--
--     Take every table lock this migration needs immediately, in one statement,
--     in a fixed (alphabetical) order. A long DDL transaction that grabs tables
--     one at a time as it progresses will eventually deadlock against Supabase's
--     own background readers: every ALTER TABLE fires PostgREST's DDL watch,
--     which reloads the schema cache by reading across user tables, and that
--     reader may hold table B while waiting for table A that we already hold.
--
--     Acquiring everything up front leaves no window for that interleaving.
--     lock_timeout makes a genuinely contended run fail in seconds with a clear
--     message rather than hanging or deadlocking half-way through.
-- ----------------------------------------------------------------------------

--     The locks themselves are taken AFTER the precondition checks below: those
--     read only catalogs, and LOCK TABLE on a missing relation would fail with
--     "relation does not exist" instead of the actionable message naming the
--     migration to apply first.
-- ----------------------------------------------------------------------------

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS — fail with an actionable message rather than half-applying.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.service_bills') IS NULL THEN
    v_missing := array_append(v_missing,
      'table service_bills (apply 20260801000000_service_bills_schema.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'wo_status'
  ) THEN
    v_missing := array_append(v_missing,
      'work_orders.wo_status (apply 20260803000000_work_order_module_enhancement.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_ledger' AND column_name = 'revision_seq'
  ) THEN
    v_missing := array_append(v_missing,
      'budget_ledger.revision_seq (apply 20260805100100_budget_ledger_gross_basis_and_derived_counters.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'erp_budget_txn_type' AND e.enumlabel = 'retention_held'
  ) THEN
    v_missing := array_append(v_missing,
      'erp_budget_txn_type.retention_held (apply 20260805100000_budget_ledger_txn_types.sql)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Work Order budget integration cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- Everything exists: now take all the locks at once, in a fixed order (see 0a).
LOCK TABLE public.budget_alerts,
           public.budget_allocations,
           public.budget_config,
           public.service_bills,
           public.work_order_lines,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_orders
  -- Direct link to the Master Budget line this contract draws against. The
  -- allocation can be resolved from it, exactly as purchase_orders does.
  ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id),

  -- Whether total_amount already includes GST. The 15 seeded templates disagree
  -- ("GST incl." vs "GST is extra as per applicable"), so this cannot be assumed
  -- globally — it decides which figure on a service bill draws the WO down.
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,

  -- Claims raised but not yet certified. Kept separate from billed_to_date so
  -- remaining_balance reflects certified work while over-claiming can still be
  -- detected.
  ADD COLUMN IF NOT EXISTS claimed_to_date numeric NOT NULL DEFAULT 0 CHECK (claimed_to_date >= 0),

  -- Set when certified billing exceeds the WO value. Surfaced, not blocked: a
  -- genuine variation is legitimate and must be approved, not silently rejected
  -- at bill-insert time.
  ADD COLUMN IF NOT EXISTS has_billing_overrun boolean NOT NULL DEFAULT false,

  -- rejectWorkOrder() has always demanded a mandatory reason and then discarded
  -- it — there was nowhere to put it. Mirrors purchase_orders.rejection_reason
  -- added in 20260804180000.
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.work_orders.tax_inclusive IS
  'true when total_amount already includes GST. Decides whether a service bill draws down the WO on its gross (total_amount) or net-of-tax (subtotal_amount) figure.';
COMMENT ON COLUMN public.work_orders.claimed_to_date IS
  'Sum of submitted/verified but not yet certified bills. billed_to_date carries certified value only; remaining_balance derives from that.';

-- 1b. Enforcement policy for a Work Order with no resolvable budget head.
--     Mirrors the existing hard_limit_enforcement pattern, and defaults to the
--     same conservative choice: a document that cannot be costed is a document
--     that should not be issued. Set to 'allow_unbudgeted' per project to fall
--     back to the previous permissive behaviour.
ALTER TABLE public.budget_config
  ADD COLUMN IF NOT EXISTS wo_unbudgeted_enforcement text NOT NULL DEFAULT 'block';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_config_wo_unbudgeted_chk') THEN
    ALTER TABLE public.budget_config
      ADD CONSTRAINT budget_config_wo_unbudgeted_chk
      CHECK (wo_unbudgeted_enforcement IN ('block', 'allow_unbudgeted'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_master_item
  ON public.work_orders (master_budget_item_id) WHERE master_budget_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_budget_allocation
  ON public.work_orders (budget_allocation_id) WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_orders_project_status
  ON public.work_orders (project_id, wo_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_bills_wo_status
  ON public.service_bills (work_order_id, status);

-- ----------------------------------------------------------------------------
-- 2. RESOLUTION — which budget head does this Work Order draw against?
-- ----------------------------------------------------------------------------

-- 2a. SQL twin of normalizeActivityKey() in
--     frontend/src/lib/erp/purchase-requisition/activity-mapping.ts.
--     Both sides must produce the same key or the cache lookup silently misses.
CREATE OR REPLACE FUNCTION public.fn_normalize_activity_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(COALESCE(p_value, '')), '[^a-z0-9]', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

COMMENT ON FUNCTION public.fn_normalize_activity_key(text) IS
  'Mirrors normalizeActivityKey() in activity-mapping.ts: lowercase, non-alphanumerics to space, collapse whitespace, trim. Keep the two implementations identical.';

-- 2b. Resolution order, most explicit first:
--       1. an allocation set directly on the Work Order
--       2. the Master Budget line -> its category -> that category's allocation
--       3. the linked construction activity -> activity_budget_category_map
--          (the durable resolution cache the PR module already populates)
--
--     Takes VALUES rather than a work order id. The gate below runs as a BEFORE
--     trigger, where the table still holds the pre-update row — resolving from a
--     re-read would use stale values and wrongly reject a statement that sets the
--     budget head and issues in one go.
CREATE OR REPLACE FUNCTION public.fn_resolve_wo_allocation_for(
  p_project_id            uuid,
  p_budget_allocation_id  uuid,
  p_master_budget_item_id uuid,
  p_activity_id           uuid
)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation   uuid;
  v_category     uuid;
  v_activity_key text;
BEGIN
  -- 1 + 2 reuse the shared resolver so Work Orders and Purchase Orders can never
  -- disagree about which allocation a given Master Budget line belongs to.
  v_allocation := public.fn_resolve_budget_allocation(
    p_project_id, p_budget_allocation_id, p_master_budget_item_id
  );
  IF v_allocation IS NOT NULL THEN
    RETURN v_allocation;
  END IF;

  -- 3. Activity -> category cache.
  IF p_activity_id IS NOT NULL THEN
    SELECT public.fn_normalize_activity_key(ca.title) INTO v_activity_key
    FROM public.construction_activities ca WHERE ca.id = p_activity_id;

    IF COALESCE(v_activity_key, '') <> '' THEN
      SELECT m.category_id INTO v_category
      FROM public.activity_budget_category_map m
      WHERE m.project_id = p_project_id
        AND m.activity_key = v_activity_key
        AND m.category_id IS NOT NULL;

      IF v_category IS NOT NULL THEN
        SELECT id INTO v_allocation
        FROM public.budget_allocations
        WHERE project_id = p_project_id
          AND category_id = v_category
          AND deleted_at IS NULL
        LIMIT 1;
        RETURN v_allocation;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END $$;

-- Convenience wrapper for callers that already have a persisted row (backfill,
-- the AFTER-trigger paths, and the UI).
CREATE OR REPLACE FUNCTION public.fn_resolve_wo_budget_allocation(p_work_order_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo public.work_orders;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF v_wo.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.fn_resolve_wo_allocation_for(
    v_wo.project_id, v_wo.budget_allocation_id, v_wo.master_budget_item_id, v_wo.activity_id
  );
END $$;

-- ----------------------------------------------------------------------------
-- 3. COMMITMENT POSTING
--     Net commitment for a WO is the signed sum of its 'commitment' rows, so a
--     downward variation is simply a negative row. Phase 1's signed amounts and
--     revision_seq are what make that expressible.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wo_committed_amount(p_work_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.budget_ledger
  WHERE source_table = 'work_orders'
    AND source_id = p_work_order_id
    AND transaction_type = 'commitment'::public.erp_budget_txn_type;
$$;

-- Commitment already relieved against this WO: by certified service bills
-- (Phase 3 posts these) and by the residual release written at close.
CREATE OR REPLACE FUNCTION public.fn_wo_released_amount(p_work_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(bl.amount), 0)
  FROM public.budget_ledger bl
  WHERE bl.transaction_type = 'release'::public.erp_budget_txn_type
    AND (
      (bl.source_table = 'work_orders' AND bl.source_id = p_work_order_id)
      OR (bl.source_table = 'service_bills' AND bl.source_id IN (
            SELECT sb.id FROM public.service_bills sb WHERE sb.work_order_id = p_work_order_id))
    );
$$;

-- 3a. Post (or vary) the encumbrance so the ledger total equals the current WO value.
CREATE OR REPLACE FUNCTION public.fn_post_wo_commitment(p_work_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo          public.work_orders;
  v_allocation  uuid;
  v_category    uuid;
  v_committed   numeric;
  v_delta       numeric;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF v_wo.id IS NULL OR v_wo.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  v_allocation := COALESCE(v_wo.budget_allocation_id,
                           public.fn_resolve_wo_budget_allocation(p_work_order_id));
  IF v_allocation IS NULL THEN
    RETURN;  -- unbudgeted and explicitly permitted; nothing to encumber
  END IF;

  SELECT category_id INTO v_category FROM public.budget_allocations WHERE id = v_allocation;

  v_committed := public.fn_wo_committed_amount(p_work_order_id);
  v_delta     := COALESCE(v_wo.total_amount, 0) - v_committed;

  IF v_delta = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount, gross_amount, description,
    posted_at, document_date, document_no, financial_year,
    vendor_id, activity_id, master_budget_item_id, revision_seq
  ) VALUES (
    v_wo.project_id, v_allocation, v_category, 'commitment'::erp_budget_txn_type,
    'work_orders', v_wo.id, v_delta, v_delta,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Work Order committed') || ': '
      || COALESCE(v_wo.work_order_number, v_wo.id::text),
    now(), COALESCE(v_wo.issue_date, CURRENT_DATE), v_wo.work_order_number,
    public.fn_budget_current_fy(),
    COALESCE(v_wo.vendor_id, v_wo.contractor_id), v_wo.activity_id, v_wo.master_budget_item_id,
    public.fn_next_ledger_revision_seq('work_orders', v_wo.id, 'commitment'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;
END $$;

-- 3b. Release whatever encumbrance is still outstanding. Called on close and on
--     cancel, so a finished contract stops reserving budget it will never use.
CREATE OR REPLACE FUNCTION public.fn_release_wo_commitment(p_work_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo         public.work_orders;
  v_allocation uuid;
  v_category   uuid;
  v_residual   numeric;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF v_wo.id IS NULL THEN
    RETURN;
  END IF;

  v_allocation := v_wo.budget_allocation_id;
  IF v_allocation IS NULL THEN
    RETURN;
  END IF;

  v_residual := public.fn_wo_committed_amount(p_work_order_id)
              - public.fn_wo_released_amount(p_work_order_id);

  IF v_residual <= 0 THEN
    RETURN;
  END IF;

  SELECT category_id INTO v_category FROM public.budget_allocations WHERE id = v_allocation;

  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount, gross_amount, description,
    posted_at, document_date, document_no, financial_year,
    vendor_id, activity_id, master_budget_item_id, revision_seq
  ) VALUES (
    v_wo.project_id, v_allocation, v_category, 'release'::erp_budget_txn_type,
    'work_orders', v_wo.id, v_residual, v_residual,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Residual commitment released') || ': '
      || COALESCE(v_wo.work_order_number, v_wo.id::text),
    now(), CURRENT_DATE, v_wo.work_order_number, public.fn_budget_current_fy(),
    COALESCE(v_wo.vendor_id, v_wo.contractor_id), v_wo.activity_id, v_wo.master_budget_item_id,
    public.fn_next_ledger_revision_seq('work_orders', v_wo.id, 'release'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 4. LIFECYCLE GATE — resolve and freeze the budget head at issue, enforce the
--    configured limits, then encumber.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wo_budget_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation uuid;
  v_alloc      public.budget_allocations;
  v_cfg        public.budget_config;
  v_projected  numeric;
  v_util       numeric;
  v_limit      numeric;
BEGIN
  -- Gate every entry into a LIVE state, not just 'issued'. A draft moved
  -- straight to 'active' would otherwise skip the budget-head requirement while
  -- still encumbering budget via fn_wo_budget_sync. INSERT is covered too:
  -- nothing stops a client inserting a row already in a live state.
  IF NEW.wo_status NOT IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.wo_status IN ('issued', 'active') THEN
    RETURN NEW;  -- already live; nothing to re-gate
  END IF;

  SELECT * INTO v_cfg FROM public.budget_config WHERE project_id = NEW.project_id;

  -- Resolve from NEW, not from a re-read: in a BEFORE trigger the table still
  -- holds the pre-update row, so a statement that sets the head and issues in one
  -- go would otherwise resolve against stale values and be rejected.
  v_allocation := public.fn_resolve_wo_allocation_for(
    NEW.project_id, NEW.budget_allocation_id, NEW.master_budget_item_id, NEW.activity_id
  );

  IF v_allocation IS NULL THEN
    IF COALESCE(v_cfg.wo_unbudgeted_enforcement, 'block') = 'block' THEN
      RAISE EXCEPTION
        'Work Order % cannot be issued: no budget head could be resolved. Set a Master Budget line or a budget allocation on the Work Order, or set wo_unbudgeted_enforcement = ''allow_unbudgeted'' for this project.',
        COALESCE(NEW.work_order_number, NEW.id::text)
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;  -- explicitly permitted to proceed unbudgeted
  END IF;

  -- Freeze the resolution onto the row so the ledger, the alerts and the UI all
  -- reference the same head even if the mapping cache later changes.
  NEW.budget_allocation_id := v_allocation;

  SELECT * INTO v_alloc FROM public.budget_allocations WHERE id = v_allocation;

  IF COALESCE(v_alloc.allocated_amount, 0) > 0 THEN
    v_projected := COALESCE(v_alloc.committed_amount, 0)
                 + COALESCE(v_alloc.spent_amount, 0)
                 + COALESCE(NEW.total_amount, 0);
    v_util  := (v_projected / v_alloc.allocated_amount) * 100;
    v_limit := COALESCE(v_cfg.hard_limit_percent, v_alloc.hard_limit_percent, 100);

    IF v_util >= v_limit THEN
      -- hard_limit_enforcement has been configurable since the budget hardening
      -- migration but was enforced by nothing. A Work Order is the first
      -- document large enough to matter, so it is enforced here.
      IF COALESCE(v_cfg.hard_limit_enforcement, 'block') = 'block' THEN
        -- Percent signs are spelled out: in RAISE, '%%%' is ambiguous to read
        -- (it parses as literal-'%' then placeholder, not placeholder then '%').
        RAISE EXCEPTION
          'Work Order % would take budget head "%" to % percent of its allocation (limit % percent). Raise the allocation, transfer budget, or set hard_limit_enforcement = ''warn_only''.',
          COALESCE(NEW.work_order_number, NEW.id::text), v_alloc.allocation_name,
          ROUND(v_util, 1), v_limit
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.budget_alerts (
        project_id, budget_allocation_id, alert_type, severity,
        threshold_percent, actual_percent, message, status
      ) VALUES (
        NEW.project_id, v_allocation, 'WO_HARD_LIMIT_WARNING', 'critical',
        v_limit, ROUND(v_util, 2),
        format('Work Order %s takes "%s" to %s%% of allocation (limit %s%%).',
               COALESCE(NEW.work_order_number, NEW.id::text), v_alloc.allocation_name,
               ROUND(v_util, 2), v_limit),
        'pending'::erp_workflow_status
      )
      ON CONFLICT (budget_allocation_id, alert_type) WHERE status = 'pending' DO UPDATE
        SET actual_percent = EXCLUDED.actual_percent,
            message        = EXCLUDED.message,
            updated_at     = now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wo_budget_gate ON public.work_orders;
CREATE TRIGGER trg_wo_budget_gate
  BEFORE INSERT OR UPDATE OF wo_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_wo_budget_gate();

-- 4b. After the row lands, move the ledger.
CREATE OR REPLACE FUNCTION public.fn_wo_budget_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- OLD is unassigned in an INSERT trigger and referencing it raises, so the two
  -- operations are handled in separate branches rather than with an OR guard.
  IF TG_OP = 'INSERT' THEN
    IF NEW.wo_status IN ('issued', 'active') THEN
      PERFORM public.fn_post_wo_commitment(NEW.id, 'Work Order issued');
    END IF;
    RETURN NEW;
  END IF;

  -- Entering the live states: encumber.
  IF NEW.wo_status IN ('issued', 'active')
     AND OLD.wo_status NOT IN ('issued', 'active') THEN
    PERFORM public.fn_post_wo_commitment(NEW.id, 'Work Order issued');
    RETURN NEW;
  END IF;

  -- Value varied while live: post the delta, positive or negative. fn_post_wo_commitment
  -- writes the difference against what is already committed, so this is safe to
  -- call repeatedly.
  IF NEW.wo_status IN ('issued', 'active')
     AND NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    PERFORM public.fn_post_wo_commitment(NEW.id, 'Work Order value varied');
    RETURN NEW;
  END IF;

  -- Closed or cancelled: stop reserving what will never be spent.
  IF NEW.wo_status IN ('closed', 'cancelled')
     AND OLD.wo_status NOT IN ('closed', 'cancelled') THEN
    PERFORM public.fn_release_wo_commitment(
      NEW.id,
      CASE WHEN NEW.wo_status = 'cancelled'
           THEN 'Work Order cancelled - commitment released'
           ELSE 'Work Order closed - residual commitment released' END);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wo_budget_sync ON public.work_orders;
CREATE TRIGGER trg_wo_budget_sync
  AFTER INSERT OR UPDATE OF wo_status, total_amount ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_wo_budget_sync();

-- ----------------------------------------------------------------------------
-- 5. DRAWDOWN ARITHMETIC
--
--    Replaces fn_recompute_wo_billed_to_date, which summed service_bills.total_amount
--    (subtotal + tax) for every bill with status <> 'rejected'.
--
--    Two defects, both of which put remaining_balance in the wrong place:
--      * a tax-inclusive bill total was compared against a tax-exclusive WO value,
--        so a fully-billed WO read roughly 118% billed;
--      * draft and submitted claims drew the balance down before anyone certified
--        them.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_recompute_wo_billed_to_date(p_work_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo        public.work_orders;
  v_certified numeric;
  v_claimed   numeric;
  v_overrun   boolean;
BEGIN
  IF p_work_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF v_wo.id IS NULL THEN
    RETURN;
  END IF;

  -- Compare like with like: if the WO value already includes GST, draw it down
  -- on the bill's gross; otherwise on the net-of-tax subtotal.
  SELECT
    COALESCE(SUM(CASE WHEN v_wo.tax_inclusive THEN sb.total_amount ELSE sb.subtotal_amount END)
             FILTER (WHERE sb.status IN ('approved', 'paid')), 0),
    COALESCE(SUM(CASE WHEN v_wo.tax_inclusive THEN sb.total_amount ELSE sb.subtotal_amount END)
             FILTER (WHERE sb.status IN ('submitted', 'verified', 'approved', 'paid')), 0)
    INTO v_certified, v_claimed
  FROM public.service_bills sb
  WHERE sb.work_order_id = p_work_order_id;

  v_overrun := v_certified > COALESCE(v_wo.total_amount, 0);

  UPDATE public.work_orders
  SET billed_to_date      = v_certified,
      claimed_to_date     = v_claimed,
      has_billing_overrun = v_overrun,
      updated_at          = now()
  WHERE id = p_work_order_id;

  -- Over-billing is surfaced, not blocked — a genuine variation is legitimate and
  -- belongs in an approval queue, not in a failed INSERT the site team cannot
  -- interpret.
  IF v_overrun AND v_wo.budget_allocation_id IS NOT NULL THEN
    INSERT INTO public.budget_alerts (
      project_id, budget_allocation_id, alert_type, severity,
      threshold_percent, actual_percent, message, status
    ) VALUES (
      v_wo.project_id, v_wo.budget_allocation_id, 'WO_BILLING_OVERRUN', 'overrun',
      100,
      CASE WHEN COALESCE(v_wo.total_amount, 0) > 0
           THEN ROUND((v_certified / v_wo.total_amount) * 100, 2) ELSE 0 END,
      format('Work Order %s is certified-billed %s against a value of %s.',
             COALESCE(v_wo.work_order_number, v_wo.id::text),
             to_char(v_certified, 'FM99,99,99,999.00'),
             to_char(COALESCE(v_wo.total_amount, 0), 'FM99,99,99,999.00')),
      'pending'::erp_workflow_status
    )
    ON CONFLICT (budget_allocation_id, alert_type) WHERE status = 'pending' DO UPDATE
      SET actual_percent = EXCLUDED.actual_percent,
          message        = EXCLUDED.message,
          updated_at     = now();
  ELSIF NOT v_overrun AND v_wo.budget_allocation_id IS NOT NULL THEN
    UPDATE public.budget_alerts
    SET status = 'closed'::erp_workflow_status, resolved_at = now()
    WHERE budget_allocation_id = v_wo.budget_allocation_id
      AND alert_type = 'WO_BILLING_OVERRUN'
      AND status = 'pending'::erp_workflow_status;
  END IF;
END $$;

-- The bill-side trigger (trg_service_bill_wo_balance) already calls this on every
-- INSERT/UPDATE/DELETE, so a status change from submitted to approved now moves
-- value from claimed_to_date into billed_to_date automatically.

-- ----------------------------------------------------------------------------
-- 6. SCOPE-VARIANCE ALERTS — deduplicate and auto-close.
--     The alert previously carried budget_allocation_id = NULL (nothing ever
--     populated it), so uq_budget_alerts_open_per_type could not deduplicate it
--     and fn_check_budget_overrun_alert could not close it. It multiplied on
--     every edit and stayed open forever.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wo_line_variance_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo              public.work_orders;
  v_overrun_percent numeric;
  v_allocation      uuid;
BEGIN
  IF NEW.executed_quantity IS NULL OR NEW.quantity IS NULL OR NEW.quantity = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = NEW.work_order_id;
  IF v_wo.id IS NULL OR v_wo.wo_type <> 'fixed_scope' THEN
    RETURN NEW;  -- rate-based WOs have no planned quantity to overrun
  END IF;

  v_overrun_percent := ((NEW.executed_quantity - NEW.quantity) / NEW.quantity) * 100;

  IF v_overrun_percent <= 0 THEN
    -- Back within scope: clear the flag and close the alert.
    UPDATE public.work_orders
    SET has_scope_variance = false, variance_notes = NULL, updated_at = now()
    WHERE id = v_wo.id
      AND NOT EXISTS (
        SELECT 1 FROM public.work_order_lines l
        WHERE l.work_order_id = v_wo.id
          AND l.executed_quantity IS NOT NULL
          AND l.quantity > 0
          AND l.executed_quantity > l.quantity
      );

    IF v_wo.budget_allocation_id IS NOT NULL THEN
      UPDATE public.budget_alerts
      SET status = 'closed'::erp_workflow_status, resolved_at = now()
      WHERE budget_allocation_id = v_wo.budget_allocation_id
        AND alert_type = 'scope_overrun'
        AND status = 'pending'::erp_workflow_status;
    END IF;
    RETURN NEW;
  END IF;

  UPDATE public.work_orders
  SET has_scope_variance = true,
      variance_notes = 'Line "' || left(NEW.description, 80) || '" executed ' || NEW.executed_quantity::text
                        || ' vs planned ' || NEW.quantity::text || ' (' || round(v_overrun_percent, 1)::text || '% over).',
      updated_at = now()
  WHERE id = v_wo.id;

  v_allocation := COALESCE(v_wo.budget_allocation_id,
                           public.fn_resolve_wo_budget_allocation(v_wo.id));

  -- Without a resolvable head the alert cannot deduplicate or auto-close, so it
  -- is deliberately not raised; the has_scope_variance flag above still surfaces
  -- it on the Work Order itself.
  IF v_allocation IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.budget_alerts (
    project_id, budget_allocation_id, alert_type, threshold_percent, actual_percent,
    message, severity, status
  ) VALUES (
    v_wo.project_id, v_allocation, 'scope_overrun', 0, ROUND(v_overrun_percent, 2),
    'Work Order ' || COALESCE(v_wo.work_order_number, v_wo.id::text)
      || ': executed scope exceeds planned scope by '
      || round(v_overrun_percent, 1)::text || '% on line "' || left(NEW.description, 80) || '".',
    CASE WHEN v_overrun_percent >= 20 THEN 'critical'
         WHEN v_overrun_percent >= 10 THEN 'overrun'
         ELSE 'warning' END,
    'pending'::erp_workflow_status
  )
  ON CONFLICT (budget_allocation_id, alert_type) WHERE status = 'pending' DO UPDATE
    SET actual_percent = EXCLUDED.actual_percent,
        message        = EXCLUDED.message,
        severity       = EXCLUDED.severity,
        updated_at     = now();

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 7. REPORTING — Work Order commitment exposed for the UI, without a second
--    stored counter that could drift from the ledger.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.work_order_budget_view CASCADE;
CREATE VIEW public.work_order_budget_view AS
SELECT
  wo.id                                            AS work_order_id,
  wo.project_id,
  wo.work_order_number,
  wo.wo_status,
  wo.total_amount,
  wo.billed_to_date,
  wo.claimed_to_date,
  wo.total_amount - wo.billed_to_date              AS remaining_balance,
  wo.has_billing_overrun,
  wo.has_scope_variance,
  wo.tax_inclusive,
  wo.budget_allocation_id,
  ba.allocation_name,
  ba.allocated_amount                              AS head_allocated_amount,
  bc.id                                            AS category_id,
  bc.category_name,
  wo.master_budget_item_id,
  mbi.item_description                             AS master_budget_item,
  COALESCE(led.committed, 0)                       AS committed_amount,
  COALESCE(led.released, 0)                        AS released_amount,
  GREATEST(0, COALESCE(led.committed, 0) - COALESCE(led.released, 0)) AS open_commitment
FROM public.work_orders wo
LEFT JOIN public.budget_allocations  ba  ON ba.id  = wo.budget_allocation_id
LEFT JOIN public.budget_categories   bc  ON bc.id  = ba.category_id
LEFT JOIN public.master_budget_items mbi ON mbi.id = wo.master_budget_item_id
LEFT JOIN (
  SELECT
    CASE WHEN bl.source_table = 'work_orders' THEN bl.source_id ELSE sb.work_order_id END AS work_order_id,
    SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'commitment'::erp_budget_txn_type) AS committed,
    SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'release'::erp_budget_txn_type)    AS released
  FROM public.budget_ledger bl
  LEFT JOIN public.service_bills sb
    ON bl.source_table = 'service_bills' AND sb.id = bl.source_id
  WHERE bl.source_table = 'work_orders'
     OR (bl.source_table = 'service_bills' AND sb.work_order_id IS NOT NULL)
  GROUP BY 1
) led ON led.work_order_id = wo.id
WHERE wo.deleted_at IS NULL;

COMMENT ON VIEW public.work_order_budget_view IS
  'Work Order money position with its budget head. Commitment figures are read from budget_ledger rather than stored on work_orders, so there is no second counter to drift.';

REVOKE ALL ON public.work_order_budget_view FROM anon;
GRANT SELECT ON public.work_order_budget_view TO authenticated;
ALTER VIEW public.work_order_budget_view SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 8. RLS + REALTIME
--     work_orders/work_order_lines predate the hardening work and were still
--     reachable by the browser-shipped anon key.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_orders', 'work_order_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Deliberately NOT "FORCE ROW LEVEL SECURITY": the SECURITY DEFINER budget
    -- functions above execute as the table owner and must keep bypassing RLS,
    -- exactly as the budget hardening migration documents.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                   t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
                   t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
                   t || '_update', t);
  END LOOP;
END $$;

-- Realtime registration is deliberately NOT done here — see the trailing block
-- after COMMIT. ALTER PUBLICATION contends with the realtime worker's own
-- replication slot, and it does not need to be atomic with the schema change.

-- ----------------------------------------------------------------------------
-- 9. RECONCILE EXISTING ROWS
--     No-op on the current production dataset (0 work orders), and correct for
--     any environment that does carry them.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  v_allocation uuid;
BEGIN
  -- 9a. Backfill the resolvable budget head on live Work Orders.
  FOR r IN
    SELECT id FROM public.work_orders
    WHERE deleted_at IS NULL AND budget_allocation_id IS NULL
      AND wo_status IN ('issued', 'active')
  LOOP
    v_allocation := public.fn_resolve_wo_budget_allocation(r.id);
    IF v_allocation IS NOT NULL THEN
      UPDATE public.work_orders SET budget_allocation_id = v_allocation WHERE id = r.id;
    END IF;
  END LOOP;

  -- 9b. Encumber Work Orders that were issued before this migration existed.
  FOR r IN
    SELECT id FROM public.work_orders
    WHERE deleted_at IS NULL AND wo_status IN ('issued', 'active')
      AND budget_allocation_id IS NOT NULL
  LOOP
    PERFORM public.fn_post_wo_commitment(r.id, 'Backfilled Work Order commitment');
  END LOOP;

  -- 9c. Release residuals on already-closed Work Orders.
  FOR r IN
    SELECT id FROM public.work_orders
    WHERE deleted_at IS NULL AND wo_status IN ('closed', 'cancelled')
      AND budget_allocation_id IS NOT NULL
  LOOP
    PERFORM public.fn_release_wo_commitment(r.id, 'Backfilled residual release');
  END LOOP;

  -- 9d. Recompute every drawdown on the corrected basis.
  FOR r IN SELECT id FROM public.work_orders WHERE deleted_at IS NULL LOOP
    PERFORM public.fn_recompute_wo_billed_to_date(r.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 10. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_post_wo_commitment(uuid, text)    FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_release_wo_commitment(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recompute_wo_billed_to_date(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resolve_wo_budget_allocation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_wo_budget_allocation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_resolve_wo_allocation_for(uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_wo_allocation_for(uuid, uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_wo_committed_amount(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_wo_committed_amount(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_wo_released_amount(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_wo_released_amount(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_normalize_activity_key(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_normalize_activity_key(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['master_budget_item_id', 'tax_inclusive',
                               'claimed_to_date', 'has_billing_overrun'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'work_orders.' || v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['trg_wo_budget_gate', 'trg_wo_budget_sync',
                               'trg_wo_line_variance_alert', 'trg_service_bill_wo_balance'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  IF to_regclass('public.work_order_budget_view') IS NULL THEN
    v_problems := array_append(v_problems, 'work_order_budget_view missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_config'
      AND column_name = 'wo_unbudgeted_enforcement'
  ) THEN
    v_problems := array_append(v_problems, 'budget_config.wo_unbudgeted_enforcement missing');
  END IF;

  -- The SQL normaliser must agree with normalizeActivityKey() in the frontend,
  -- or every activity -> category cache lookup silently misses.
  IF public.fn_normalize_activity_key('Masonry / Brickwork  Phase-2') <> 'masonry brickwork phase 2' THEN
    v_problems := array_append(v_problems, 'fn_normalize_activity_key diverges from the frontend implementation');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Work Order budget integration incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Phase 2 applied: Work Orders now encumber budget on issue, vary on amendment, and release on close.';
END $$;

COMMIT;

-- ============================================================================
-- REALTIME REGISTRATION — outside the main transaction, on purpose.
--
-- ALTER PUBLICATION takes locks that contend with the realtime worker's
-- replication slot. It is idempotent and independent of the schema change, so
-- running it separately means a contended publication cannot roll back the whole
-- migration. If it fails, re-run just this block.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['work_orders', 'work_order_lines', 'service_bills'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
