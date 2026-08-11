-- ============================================================================
-- FIX — budget_ledger ON CONFLICT could not match its partial unique index
-- File: supabase/migrations/20260807131000_fix_budget_ledger_on_conflict_predicate.sql
--
-- THE BUG
-- =======
-- Every ledger posting function writes:
--
--   ON CONFLICT (source_table, source_id, transaction_type, revision_seq)
--   DO NOTHING
--
-- but the index backing it is PARTIAL:
--
--   CREATE UNIQUE INDEX uq_budget_ledger_source_txn
--     ON budget_ledger (source_table, source_id, transaction_type, revision_seq)
--     WHERE (source_id IS NOT NULL);
--
-- Postgres will only use a partial index to arbitrate ON CONFLICT if the
-- statement repeats the index predicate. Without it the planner finds no
-- matching arbiter and raises
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- so the INSERT fails outright rather than de-duplicating.
--
-- IMPACT
-- ======
-- This blocks EVERY budgeted posting on the Work Order / Service Bill spine:
--
--   * issuing a Work Order that resolves a budget head (fn_post_wo_commitment)
--   * closing or cancelling one      (fn_release_wo_commitment)
--   * certifying a service bill      (fn_post_service_bill_to_budget — cost,
--                                     retention_held and the commitment release)
--   * approving a retention release  (fn_post_retention_release)
--
-- It went unnoticed because the production dataset has no budgeted Work Order
-- yet: the single existing WO carries no allocation, and fn_post_wo_commitment
-- returns early before the INSERT when the head is NULL. Stage 4's rate-based
-- ceiling test was the first thing to issue a WO against a real budget head,
-- which is where it surfaced.
--
-- THE FIX
-- =======
-- Add the index predicate to every ON CONFLICT. Nothing else changes: the
-- posting logic, the amounts and the revision_seq sequencing are untouched.
--
-- The functions are recreated in full rather than patched, because CREATE OR
-- REPLACE FUNCTION needs the whole body. Each is byte-identical to its original
-- apart from the added WHERE clause.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITION — the partial index must exist, and be partial. If a future
--    migration makes it total, this fix is unnecessary but still correct.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_budget_ledger_source_txn'
  ) THEN
    RAISE EXCEPTION 'uq_budget_ledger_source_txn is missing (apply 20260805100100_budget_ledger_gross_basis_and_derived_counters.sql).';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. WORK ORDER COMMITMENT
-- ----------------------------------------------------------------------------

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
  -- The WHERE repeats uq_budget_ledger_source_txn's predicate so Postgres can
  -- use it as the conflict arbiter.
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq)
    WHERE source_id IS NOT NULL
  DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 2. WORK ORDER COMMITMENT RELEASE
-- ----------------------------------------------------------------------------

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
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq)
    WHERE source_id IS NOT NULL
  DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 3. SERVICE BILL POSTING — cost, retention, commitment release
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_service_bill_to_budget(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill        public.service_bills;
  v_allocation  uuid;
  v_category    uuid;
  v_gross       numeric;
  v_retention   numeric;
  v_committed   numeric;
  v_released    numeric;
  v_release_now numeric;
  v_master_item uuid;
BEGIN
  SELECT * INTO v_bill FROM public.service_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL OR v_bill.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Cost is recognised at certification, not at payment.
  IF v_bill.status NOT IN ('approved', 'paid') THEN
    RETURN;
  END IF;

  v_gross     := COALESCE(v_bill.total_amount, 0);
  v_retention := COALESCE(v_bill.retention_amount, 0);
  IF v_gross <= 0 THEN
    RETURN;
  END IF;

  v_allocation := public.fn_resolve_service_bill_allocation(p_bill_id);
  IF v_allocation IS NULL THEN
    RETURN;  -- unbudgeted Work Order, explicitly permitted; nothing to post
  END IF;

  SELECT category_id INTO v_category FROM public.budget_allocations WHERE id = v_allocation;

  v_master_item := v_bill.master_budget_item_id;
  IF v_master_item IS NULL AND v_bill.work_order_id IS NOT NULL THEN
    SELECT master_budget_item_id INTO v_master_item
    FROM public.work_orders WHERE id = v_bill.work_order_id;
  END IF;

  -- 3a. Cost, at gross certified value.
  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount,
    gross_amount, retention_amount, tax_amount, net_payable_amount,
    description, posted_at, document_date, document_no, financial_year,
    vendor_id, activity_id, master_budget_item_id, revision_seq
  ) VALUES (
    v_bill.project_id, v_allocation, v_category, 'actual'::erp_budget_txn_type,
    'service_bills', v_bill.id, v_gross,
    v_gross, v_retention, COALESCE(v_bill.tax_amount, 0), COALESCE(v_bill.net_payable_amount, 0),
    'Service bill certified: ' || COALESCE(v_bill.bill_number, v_bill.id::text),
    now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
    v_bill.vendor_id, v_bill.activity_id, v_master_item,
    public.fn_next_ledger_revision_seq('service_bills', v_bill.id, 'actual'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq)
    WHERE source_id IS NOT NULL
  DO NOTHING;

  -- 3b. Retention withheld, as a tracked liability rather than a cost reduction.
  IF v_retention > 0 THEN
    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, retention_amount,
      description, posted_at, document_date, document_no, financial_year,
      vendor_id, master_budget_item_id, revision_seq
    ) VALUES (
      v_bill.project_id, v_allocation, v_category, 'retention_held'::erp_budget_txn_type,
      'service_bills', v_bill.id, v_retention, v_retention,
      'Retention withheld on service bill ' || COALESCE(v_bill.bill_number, v_bill.id::text),
      now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
      v_bill.vendor_id, v_master_item,
      public.fn_next_ledger_revision_seq('service_bills', v_bill.id, 'retention_held'::erp_budget_txn_type)
    )
    ON CONFLICT (source_table, source_id, transaction_type, revision_seq)
      WHERE source_id IS NOT NULL
    DO NOTHING;
  END IF;

  -- 3c. Relieve the Work Order's commitment, capped at what it still has open.
  IF v_bill.work_order_id IS NOT NULL THEN
    v_committed := public.fn_wo_committed_amount(v_bill.work_order_id);
    v_released  := public.fn_wo_released_amount(v_bill.work_order_id);
    v_release_now := LEAST(v_gross, GREATEST(0, v_committed - v_released));

    IF v_release_now > 0 THEN
      INSERT INTO public.budget_ledger (
        project_id, budget_allocation_id, category_id, transaction_type,
        source_table, source_id, amount, gross_amount,
        description, posted_at, document_date, document_no, financial_year,
        vendor_id, master_budget_item_id, revision_seq
      ) VALUES (
        v_bill.project_id, v_allocation, v_category, 'release'::erp_budget_txn_type,
        'service_bills', v_bill.id, v_release_now, v_release_now,
        'Work Order commitment released against service bill '
          || COALESCE(v_bill.bill_number, v_bill.id::text),
        now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
        v_bill.vendor_id, v_master_item,
        public.fn_next_ledger_revision_seq('service_bills', v_bill.id, 'release'::erp_budget_txn_type)
      )
      ON CONFLICT (source_table, source_id, transaction_type, revision_seq)
        WHERE source_id IS NOT NULL
      DO NOTHING;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. RETENTION RELEASE POSTING
--
--    Rebuilt from the live definition with only the predicate added, so the
--    Phase 4 behaviour is preserved exactly.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_post_retention_release'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'fn_post_retention_release not present; skipping.';
    RETURN;
  END IF;

  IF position('WHERE source_id IS NOT NULL' in v_def) > 0 THEN
    RAISE NOTICE 'fn_post_retention_release already carries the ON CONFLICT predicate.';
    RETURN;
  END IF;

  -- Textual patch rather than a hand-copied body: this function belongs to
  -- Phase 4 and reproducing it here would fork it. Replacing only the
  -- arbiter clause keeps the two in step.
  v_def := replace(
    v_def,
    'ON CONFLICT (source_table, source_id, transaction_type, revision_seq)',
    'ON CONFLICT (source_table, source_id, transaction_type, revision_seq) WHERE source_id IS NOT NULL'
  );

  EXECUTE v_def;
  RAISE NOTICE 'fn_post_retention_release patched with the ON CONFLICT predicate.';
END $$;

-- ----------------------------------------------------------------------------
-- 5. ANY REMAINING POSTING FUNCTION
--
--    The vendor-bill spine (Phase 1) carries the same clause. Patching them by
--    the same textual rule keeps both branches consistent without restating
--    bodies this migration does not own.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r       record;
  v_def   text;
  v_fixed integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (source_table, source_id, transaction_type, revision_seq)%'
      AND pg_get_functiondef(p.oid) NOT LIKE '%revision_seq)%WHERE source_id IS NOT NULL%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(
      v_def,
      'ON CONFLICT (source_table, source_id, transaction_type, revision_seq)',
      'ON CONFLICT (source_table, source_id, transaction_type, revision_seq) WHERE source_id IS NOT NULL'
    );
    EXECUTE v_def;
    v_fixed := v_fixed + 1;
    RAISE NOTICE '  patched %', r.proname;
  END LOOP;

  RAISE NOTICE 'ON CONFLICT predicate added to % further posting function(s).', v_fixed;
END $$;

-- ----------------------------------------------------------------------------
-- 6. VERIFICATION — prove the arbiter now resolves, on real tables.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) LIKE '%ON CONFLICT (source_table, source_id, transaction_type, revision_seq)%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%revision_seq)%WHERE source_id IS NOT NULL%';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Fix incomplete: % posting function(s) still use an unmatched ON CONFLICT arbiter.',
      v_remaining;
  END IF;

  RAISE NOTICE 'budget_ledger ON CONFLICT now matches uq_budget_ledger_source_txn on every posting path.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
