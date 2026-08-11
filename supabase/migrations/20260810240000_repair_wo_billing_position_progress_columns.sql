-- ============================================================================
-- REPAIR — wo_billing_position LOST ITS PROGRESS COLUMNS
-- File: supabase/migrations/20260810240000_repair_wo_billing_position_progress_columns.sql
--
-- WHAT WENT WRONG
-- ===============
-- 20260810140000 replaced wo_billing_position with a version carrying the
-- activity-progress columns, and created rpc_wo_progress_summary against it.
-- Stage 6 (20260808150000) was then re-applied on top. Its
--
--     DROP VIEW IF EXISTS public.wo_billing_position CASCADE;
--     CREATE VIEW  public.wo_billing_position AS ...
--
-- rebuilt the OLD shape. CASCADE drops dependent VIEWS, not functions, so
-- rpc_wo_progress_summary survived pointing at columns that no longer existed:
--
--     42703  column "unverified_quantity" does not exist
--
-- Symptom on screen: the Work Progress table renders (it selects *), the
-- headline metrics silently fall back to the client-side roll-up, and
-- rpc_wo_progress_summary fails on every call.
--
-- WHY IT IS EASY TO REDO
-- ======================
-- Two migrations create this view and the older one is not a no-op. Applying
-- them out of order, or re-running the earlier file by hand, reverts the newer
-- definition without any error. This file restores the current shape and then
-- VERIFIES it, so the same mistake fails loudly next time instead of silently.
--
-- If Stage 6 is ever re-run again, re-run this file after it.
--
-- Idempotent: recreates one view and re-checks its columns. No data is touched.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.wo_billable_items') IS NULL THEN
    v_missing := array_append(v_missing, 'wo_billable_items (apply 20260808150000)');
  END IF;

  -- The progress columns live on the table; without them the view below cannot
  -- be built and 20260810140000 has not been applied at all.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wo_billable_items'
      AND column_name = 'progress_verified_quantity'
  ) THEN
    v_missing := array_append(v_missing,
      'wo_billable_items.progress_verified_quantity (apply 20260810140000)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_billable_item_claimed_value'
  ) THEN
    v_missing := array_append(v_missing,
      'fn_billable_item_claimed_value() (apply 20260810140000)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot repair wo_billing_position. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. THE VIEW, RESTORED
--
--    Byte-for-byte the definition from 20260810140000, so the two cannot drift.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.wo_billing_position CASCADE;
CREATE VIEW public.wo_billing_position AS
WITH base AS (
  SELECT
    bi.id                AS billable_item_id,
    bi.work_order_id,
    bi.project_id,
    bi.work_order_line_id,
    bi.payment_stage_id,
    bi.sequence_no,
    bi.item_label,
    bi.basis,
    bi.eligibility_rule,
    bi.contracted_quantity,
    bi.unit,
    bi.rate,
    bi.scheduled_value,
    bi.stage_percent,
    bi.allows_partial_billing,
    bi.requires_qc_pass,
    bi.depends_on_item_id,
    bi.status,
    bi.claimed_at, bi.claimed_by, bi.verified_at, bi.verified_by, bi.rejection_reason,
    bi.progress_quantity,
    bi.progress_verified_quantity,
    bi.progress_note,
    bi.progress_recorded_at, bi.progress_recorded_by,
    bi.progress_verified_at, bi.progress_verified_by,
    wo.work_order_number,
    wo.wo_status,
    public.fn_billable_item_measured_quantity(bi.id)  AS measured_quantity,
    public.fn_billable_item_certified_quantity(bi.id) AS certified_quantity,
    public.fn_billable_item_certified_value(bi.id)    AS certified_value,
    public.fn_billable_item_claimed_value(bi.id)      AS claimed_value,
    /* Retained under its old name so any reader written against the previous
       view keeps working. It has always meant the certified figure. */
    public.fn_billable_item_certified_value(bi.id)    AS billed_value
  FROM public.wo_billable_items bi
  JOIN public.work_orders wo ON wo.id = bi.work_order_id
  WHERE wo.deleted_at IS NULL
), scored AS (
  SELECT b.*,
    /* Percent complete. Open rate-based scope has no denominator, so it stays
       NULL rather than pretending to a number. */
    CASE WHEN COALESCE(b.contracted_quantity, 0) > 0
         THEN LEAST(ROUND(b.measured_quantity / b.contracted_quantity * 100, 2), 100)
         WHEN b.status = 'verified' THEN 100
         ELSE NULL END AS percent_complete,
    /* What the site says, before anyone confirmed it. Shown alongside so an
       unverified entry reads as "awaiting verification" and not as no work. */
    CASE WHEN COALESCE(b.contracted_quantity, 0) > 0
              AND b.progress_quantity IS NOT NULL
         THEN LEAST(ROUND(b.progress_quantity / b.contracted_quantity * 100, 2), 100)
         ELSE NULL END AS recorded_percent,
    GREATEST(COALESCE(b.progress_quantity, 0)
             - COALESCE(b.progress_verified_quantity, 0), 0) AS unverified_quantity,
    /* Work still to do, in contracted units. NULL where there is no contracted
       quantity to subtract from. */
    CASE WHEN COALESCE(b.contracted_quantity, 0) > 0
         THEN GREATEST(b.contracted_quantity - b.measured_quantity, 0)
         ELSE NULL END AS pending_quantity,
    /* Balance is measured against CLAIMED, not certified: a claim in flight has
       already consumed the scope, and counting only certified value would show
       headroom that a pending bill is about to take. */
    GREATEST(COALESCE(b.scheduled_value, 0) - b.claimed_value, 0) AS balance_to_bill,
    (SELECT dep.status FROM public.wo_billable_items dep WHERE dep.id = b.depends_on_item_id)
      AS dependency_status,
    (SELECT COUNT(*) FROM public.wo_billable_items sib
      WHERE sib.work_order_id = b.work_order_id AND sib.status <> 'verified')
      AS wo_items_outstanding
  FROM base b
)
SELECT s.*,
  /* Value of the work done, whether or not it has been billed yet. This is the
     "Work Done" column on the screen; billed_value is what has been claimed. */
  ROUND(s.measured_quantity * COALESCE(s.rate, 0), 2) AS work_done_value,
  /* Why this cannot be billed right now. NULL means it can. */
  CASE
    WHEN public.wo_canonical_status(s.wo_status) NOT IN ('issued', 'active')
      THEN 'Work Order is ' || COALESCE(public.wo_canonical_status(s.wo_status), 'unknown')
    WHEN s.status = 'rejected'
      THEN COALESCE('Rejected: ' || s.rejection_reason, 'Progress was rejected')
    /* Stated before the completion rules, otherwise an activity with progress
       awaiting a second signature reads as "not complete" and the user has no
       idea a verification is pending. */
    WHEN s.unverified_quantity > 1e-6 AND s.measured_quantity <= s.certified_quantity
      THEN 'Progress recorded, awaiting verification'
    WHEN s.depends_on_item_id IS NOT NULL
         AND COALESCE(s.dependency_status, '') <> 'verified'
      THEN 'A prior stage is not certified yet'
    WHEN s.eligibility_rule = 'on_full_wo_completion' AND s.wo_items_outstanding > 0
      THEN 'Contract bills only on full completion — '
           || s.wo_items_outstanding::text || ' item(s) still outstanding'
    WHEN s.eligibility_rule = 'on_full_line_completion'
         AND COALESCE(s.contracted_quantity, 0) > 0
         AND s.measured_quantity + 1e-6 < s.contracted_quantity
      THEN 'Contract requires the activity to be 100% complete — verified '
           || COALESCE(ROUND(s.measured_quantity / s.contracted_quantity * 100, 1)::text, '0')
           || '%'
    WHEN s.eligibility_rule = 'on_milestone_event' AND s.status <> 'verified'
      THEN CASE s.status
             WHEN 'claimed' THEN 'Completion claimed, awaiting verification'
             ELSE 'Milestone not claimed yet' END
    WHEN s.eligibility_rule = 'on_measured_quantity'
         AND s.measured_quantity <= s.certified_quantity
      THEN 'No newly verified progress since the last bill'
    WHEN s.eligibility_rule <> 'on_measured_quantity' AND s.status <> 'verified'
      THEN 'Not yet complete'
    WHEN COALESCE(s.scheduled_value, 0) > 0 AND s.balance_to_bill <= 0
      THEN 'Fully billed'
    ELSE NULL
  END AS blocking_reason,

  /* Quantity that may go on the next bill. A milestone carries no quantity, so
     it claims as a single unit — otherwise it would compute to 0 and never
     appear in rpc_wo_billable_now. */
  CASE
    WHEN s.basis = 'milestone_event'
      THEN CASE WHEN s.status = 'verified' AND s.certified_quantity <= 0 THEN 1 ELSE 0 END
    WHEN s.eligibility_rule = 'on_measured_quantity'
      THEN GREATEST(s.measured_quantity - s.certified_quantity, 0)
    ELSE GREATEST(COALESCE(s.contracted_quantity, 0) - s.certified_quantity, 0)
  END AS claimable_quantity
FROM scored s;

COMMENT ON VIEW public.wo_billing_position IS
  'The position of every activity on a Work Order: contracted, recorded, verified, done, pending, certified, billed, claimable, and blocking_reason. blocking_reason IS NULL means it is billable now. recorded_percent vs percent_complete is the difference between what site says and what a second person confirmed.';

REVOKE ALL ON public.wo_billing_position FROM PUBLIC, anon;
GRANT SELECT ON public.wo_billing_position TO authenticated;
ALTER VIEW public.wo_billing_position SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 2. DEPENDENTS REBUILT
--
--    DROP ... CASCADE above removes anything that depends on the view. String
--    bodied SQL functions are not tracked dependencies and therefore survive,
--    but recreating them here is what guarantees they are planned against the
--    view that now exists rather than the one they were written for.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_wo_billable_now(p_work_order_id uuid)
RETURNS TABLE (
  billable_item_id   uuid,
  sequence_no        integer,
  item_label         text,
  unit               text,
  rate               numeric,
  claimable_quantity numeric,
  claimable_value    numeric,
  percent_complete   numeric,
  status             text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.billable_item_id, p.sequence_no, p.item_label, p.unit, p.rate,
         p.claimable_quantity,
         ROUND(p.claimable_quantity * COALESCE(p.rate, 0), 2),
         p.percent_complete, p.status
  FROM public.wo_billing_position p
  WHERE p.work_order_id = p_work_order_id
    AND p.blocking_reason IS NULL
    AND p.claimable_quantity > 0
  ORDER BY p.sequence_no;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_wo_billable_now(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. VERIFICATION — the check that was missing
--
--    Every column rpc_wo_progress_summary and the Work Progress screen read is
--    asserted here. A future out-of-order apply now fails at migration time
--    instead of at 42703 on a user's click.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_col     text;
  v_probe   integer;
BEGIN
  FOREACH v_col IN ARRAY ARRAY[
    'progress_quantity', 'progress_verified_quantity', 'progress_note',
    'progress_recorded_at', 'progress_recorded_by',
    'progress_verified_at', 'progress_verified_by',
    'recorded_percent', 'unverified_quantity', 'pending_quantity',
    'work_done_value', 'certified_value', 'claimed_value', 'billed_value',
    'percent_complete', 'balance_to_bill', 'claimable_quantity',
    'blocking_reason'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wo_billing_position'
        AND column_name = v_col
    ) THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'wo_billing_position is still missing: %',
      array_to_string(v_missing, ', ');
  END IF;

  -- Executing the summary is the only proof its body actually plans. Column
  -- checks alone would not have caught the original fault.
  SELECT COALESCE((public.rpc_wo_progress_summary(id)->>'activity_count')::integer, 0)
    INTO v_probe
  FROM public.work_orders WHERE deleted_at IS NULL LIMIT 1;

  RAISE NOTICE 'wo_billing_position repaired: all progress columns present and rpc_wo_progress_summary executes.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
