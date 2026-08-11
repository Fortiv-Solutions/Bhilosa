-- ============================================================================
-- ACTIVITY PROGRESS REPLACES THE MEASUREMENT BOOK AS THE PROGRESS SOURCE
-- File: supabase/migrations/20260810140000_wo_activity_progress_replaces_measurement.sql
--
-- WHY THIS EXISTS
-- ===============
-- The Measurement Book is being removed from the Work Order screen. Progress is
-- now recorded directly against the activity (the wo_billable_items row), which
-- is the grain the client actually reasons in: "inlet fitting is done in 45 of
-- 100 flats", not "sheet MS-12 measured 45 nos".
--
-- Removing the Book cannot simply delete the UI, because the Book WAS the
-- progress engine:
--
--   fn_billable_item_measured_quantity  sums measurement_sheet_items on
--                                       VERIFIED sheets. With no sheets it
--                                       returns 0 forever, so percent_complete
--                                       stays 0, every eligibility rule stays
--                                       unsatisfied, and nothing can ever be
--                                       billed.
--   fn_sb_measurement_present           gates certification on a verified
--                                       sheet existing. With no sheets, no bill
--                                       can be certified at all.
--
-- So the engine is replaced rather than removed, and both functions learn the
-- new source. Nothing is dropped: existing verified sheets keep counting, and a
-- project still running the Book behaves exactly as it does today.
--
-- THE CONTROL THAT MUST SURVIVE
-- =============================
-- Sheet verification was not paperwork — it was the SECOND PERSON. The 149
-- source Payment Certificates carry a hand-typed "% of Work Completed" that
-- reads 1 on all 603 populated lines, which is what self-certified progress
-- becomes. So recorded progress counts for nothing until a DIFFERENT person
-- confirms it:
--
--   progress_quantity           what the site engineer recorded (cumulative)
--   progress_verified_quantity  what a second person confirmed  (cumulative)
--
-- Only the verified figure feeds measured_quantity. Recording progress alone
-- moves no money and unlocks no billing.
--
-- CUMULATIVE, NOT INCREMENTAL
-- ===========================
-- Each entry states the total done to date, so re-entering a figure converges
-- instead of accumulating. A site engineer who records 45 twice has still done
-- 45. The append-only wo_progress_events trail keeps every entry for audit.
--
-- Additive and idempotent: new columns, two new RPCs, two function bodies
-- replaced. No table is dropped and no row is rewritten.
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
    v_missing := array_append(v_missing,
      'wo_billable_items (apply 20260808150000)'); END IF;
  IF to_regclass('public.wo_progress_events') IS NULL THEN
    v_missing := array_append(v_missing,
      'wo_progress_events (apply 20260808150000)'); END IF;
  IF to_regclass('public.measurement_sheets') IS NULL THEN
    v_missing := array_append(v_missing,
      'measurement_sheets (apply 20260807110000)'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_can_write_procurement'
  ) THEN
    v_missing := array_append(v_missing, 'app_can_write_procurement() (apply Stage 1)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Activity progress cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. THE ACTIVITY LEARNS ITS OWN PROGRESS
--
--    Deliberately separate from the existing verified_at / verified_by, which
--    belong to the milestone claim path (rpc_claim_billable_item). A measured
--    activity and a milestone are verified by different acts and must not share
--    one pair of columns.
-- ----------------------------------------------------------------------------

ALTER TABLE public.wo_billable_items
  ADD COLUMN IF NOT EXISTS progress_quantity          numeric,
  ADD COLUMN IF NOT EXISTS progress_verified_quantity numeric,
  ADD COLUMN IF NOT EXISTS progress_note              text,
  ADD COLUMN IF NOT EXISTS progress_recorded_at        timestamptz,
  ADD COLUMN IF NOT EXISTS progress_recorded_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS progress_verified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS progress_verified_by        uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ck_wo_billable_items_progress_non_negative') THEN
    ALTER TABLE public.wo_billable_items
      ADD CONSTRAINT ck_wo_billable_items_progress_non_negative
      CHECK ((progress_quantity IS NULL OR progress_quantity >= 0)
         AND (progress_verified_quantity IS NULL OR progress_verified_quantity >= 0));
  END IF;
END $$;

COMMENT ON COLUMN public.wo_billable_items.progress_quantity IS
  'Cumulative quantity the site engineer has recorded as done. CLAIMED, not confirmed — it feeds no billing on its own.';
COMMENT ON COLUMN public.wo_billable_items.progress_verified_quantity IS
  'Cumulative quantity a SECOND person confirmed. This is what fn_billable_item_measured_quantity reads. The 149 source certificates show what self-certified progress becomes: "% of Work Completed" reads 1 on all 603 populated lines.';

CREATE INDEX IF NOT EXISTS ix_wo_billable_items_progress_pending
  ON public.wo_billable_items (work_order_id)
  WHERE progress_quantity IS NOT NULL
    AND (progress_verified_quantity IS NULL
         OR progress_verified_quantity < progress_quantity);

-- ----------------------------------------------------------------------------
-- 2. MEASURED QUANTITY NOW HAS TWO SOURCES
--
--    GREATEST, not SUM. The two are alternative accounts of the same physical
--    work, so adding them would double-count any activity that has both a
--    legacy sheet and a new progress entry.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billable_item_measured_quantity(p_item_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    /* Legacy source: verified Measurement Book sheets. Still honoured so a
       project mid-flight does not lose the progress it already recorded. */
    COALESCE((
      SELECT SUM(i.total_quantity)
      FROM public.wo_billable_items bi
      JOIN public.measurement_sheet_items i
        ON i.billable_item_id = bi.id
        /* Fall back to the line only where the line has a single claim: a
           stage-billed line has seven, and an unattributed sheet cannot be
           apportioned between them. */
        OR (i.billable_item_id IS NULL
            AND bi.payment_stage_id IS NULL
            AND i.work_order_line_id = bi.work_order_line_id)
      JOIN public.measurement_sheets ms ON ms.id = i.measurement_sheet_id
      WHERE bi.id = p_item_id
        AND ms.status = 'verified'
        AND ms.deleted_at IS NULL
    ), 0),
    /* Current source: progress recorded against the activity and confirmed by
       a second person. */
    COALESCE((
      SELECT bi.progress_verified_quantity
      FROM public.wo_billable_items bi WHERE bi.id = p_item_id
    ), 0)
  );
$$;

COMMENT ON FUNCTION public.fn_billable_item_measured_quantity(uuid) IS
  'Quantity of an activity treated as done: the greater of verified Measurement Book sheets (legacy) and second-person-verified activity progress (current). GREATEST rather than SUM — they are two accounts of the same physical work.';

-- ----------------------------------------------------------------------------
-- 3. CERTIFICATION EVIDENCE ACCEPTS VERIFIED PROGRESS
--
--    Without this, removing the Measurement Book would block every bill:
--    trg_service_bill_evidence_gate defaults to 'block' and asked only about
--    sheets. The gate is kept — what counts as evidence is widened.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_sb_measurement_present(p_bill_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill public.service_bills;
BEGIN
  SELECT * INTO v_bill FROM public.service_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN false;
  END IF;

  -- An explicitly named sheet must itself be verified. Naming a sheet is a
  -- deliberate claim about which evidence backs the bill.
  IF v_bill.measurement_sheet_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.measurement_sheets ms
      WHERE ms.id = v_bill.measurement_sheet_id
        AND ms.status = 'verified'
        AND ms.deleted_at IS NULL);
  END IF;

  IF v_bill.work_order_id IS NULL THEN
    RETURN false;
  END IF;

  -- Otherwise: any verified sheet on the Work Order (legacy), OR verified
  -- progress on any activity the bill actually draws on. The second form is
  -- scoped to the billed activities on purpose — verified progress somewhere
  -- else on the contract is not evidence for THIS claim.
  RETURN EXISTS (
    SELECT 1 FROM public.measurement_sheets ms
    WHERE ms.work_order_id = v_bill.work_order_id
      AND ms.status = 'verified'
      AND ms.deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.service_bill_lines l
    JOIN public.wo_billable_items bi ON bi.id = l.billable_item_id
    WHERE l.service_bill_id = p_bill_id
      AND COALESCE(bi.progress_verified_quantity, 0) > 0
  ) OR EXISTS (
    -- A milestone carries no quantity, so its verification IS its evidence.
    SELECT 1
    FROM public.service_bill_lines l
    JOIN public.wo_billable_items bi ON bi.id = l.billable_item_id
    WHERE l.service_bill_id = p_bill_id
      AND bi.basis = 'milestone_event'
      AND bi.verified_at IS NOT NULL
  );
END $$;

COMMENT ON FUNCTION public.fn_sb_measurement_present(uuid) IS
  'True when confirmed evidence backs this bill: a verified Measurement Book sheet (legacy), second-person-verified progress on the activities billed, or a verified milestone. Enforced at certification by trg_service_bill_evidence_gate.';

-- ----------------------------------------------------------------------------
-- 4. RECORD PROGRESS ON AN ACTIVITY
--
--    Cumulative. Accepts a quantity or a percentage, because a site engineer
--    thinks in flats for one trade and in percent for another; the percentage
--    is resolved against the contracted quantity so only one number is stored.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_record_wo_progress(
  p_item_id  uuid,
  p_quantity numeric DEFAULT NULL,
  p_percent  numeric DEFAULT NULL,
  p_note     text    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_item  public.wo_billable_items;
  v_actor uuid := public.app_current_profile_id();
  v_qty   numeric;
  v_wo    text;
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_item FROM public.wo_billable_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Activity % not found.', p_item_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'You do not have permission to record progress.'
      USING ERRCODE = '42501';
  END IF;

  SELECT wo_status INTO v_wo FROM public.work_orders WHERE id = v_item.work_order_id;
  IF public.wo_canonical_status(v_wo) NOT IN ('issued', 'active') THEN
    RAISE EXCEPTION 'Progress can only be recorded on a live Work Order (this one is %).',
      COALESCE(public.wo_canonical_status(v_wo), 'unknown')
      USING ERRCODE = '42501';
  END IF;

  -- A milestone has no quantity to advance; it is claimed and verified whole.
  IF v_item.basis = 'milestone_event' THEN
    RAISE EXCEPTION 'This is a milestone. Claim it complete instead of recording a quantity.'
      USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NOT NULL THEN
    v_qty := p_quantity;
  ELSIF p_percent IS NOT NULL THEN
    IF COALESCE(v_item.contracted_quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'This activity has no contracted quantity, so a percentage has nothing to be a percentage OF. Record the quantity done instead.'
        USING ERRCODE = '22023';
    END IF;
    v_qty := ROUND(v_item.contracted_quantity * p_percent / 100.0, 3);
  ELSE
    RAISE EXCEPTION 'Enter the quantity or the percentage completed.' USING ERRCODE = '22023';
  END IF;

  IF v_qty < 0 THEN
    RAISE EXCEPTION 'Progress cannot be negative.' USING ERRCODE = 'check_violation';
  END IF;

  -- Over-recording is refused here rather than at billing time, where it would
  -- surface as a confusing ceiling error on a document the user did not expect
  -- to be wrong.
  IF COALESCE(v_item.contracted_quantity, 0) > 0
     AND v_qty > v_item.contracted_quantity + 1e-6 THEN
    RAISE EXCEPTION
      'Progress of % exceeds the contracted % on "%".',
      ROUND(v_qty, 3), ROUND(v_item.contracted_quantity, 3), left(v_item.item_label, 60)
      USING ERRCODE = 'check_violation',
            HINT = 'Raise a variation to extend the scope, or correct the figure.';
  END IF;

  -- Never silently reduce what a second person already confirmed. Correcting
  -- downward is legitimate but must be re-verified, so the verified figure is
  -- pulled back with it.
  UPDATE public.wo_billable_items
  SET progress_quantity   = v_qty,
      progress_note       = COALESCE(NULLIF(btrim(p_note), ''), progress_note),
      progress_recorded_at = now(),
      progress_recorded_by = v_actor,
      progress_verified_quantity =
        CASE WHEN COALESCE(progress_verified_quantity, 0) > v_qty
             THEN NULL ELSE progress_verified_quantity END,
      progress_verified_at =
        CASE WHEN COALESCE(progress_verified_quantity, 0) > v_qty
             THEN NULL ELSE progress_verified_at END,
      progress_verified_by =
        CASE WHEN COALESCE(progress_verified_quantity, 0) > v_qty
             THEN NULL ELSE progress_verified_by END,
      updated_at = now(),
      updated_by = v_actor
  WHERE id = p_item_id;

  INSERT INTO public.wo_progress_events (
    work_order_id, project_id, billable_item_id, event_type,
    claimed_quantity, claimed_percent, note, actor_id
  ) VALUES (
    v_item.work_order_id, v_item.project_id, p_item_id, 'progress',
    v_qty,
    CASE WHEN COALESCE(v_item.contracted_quantity, 0) > 0
         THEN LEAST(ROUND(v_qty / v_item.contracted_quantity * 100, 2), 100)
         ELSE NULL END,
    p_note, v_actor
  );

  -- The event trigger recomputes status from measured quantity, which only
  -- moves once the figure is verified.
  RETURN jsonb_build_object(
    'billable_item_id', p_item_id,
    'progress_quantity', v_qty,
    'awaiting_verification', true
  );
END $$;

COMMENT ON FUNCTION public.rpc_record_wo_progress(uuid, numeric, numeric, text) IS
  'Records cumulative progress on one activity. Cumulative rather than incremental, so re-entering a figure converges instead of accumulating. Unlocks no billing until verified by a different person.';

GRANT EXECUTE ON FUNCTION public.rpc_record_wo_progress(uuid, numeric, numeric, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. VERIFY PROGRESS — THE SECOND PERSON
--
--    This is the control that sheet verification used to provide. Same shape as
--    rpc_verify_billable_item, including the segregation-of-duties refusal.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_verify_wo_progress(
  p_item_id uuid,
  p_approve boolean DEFAULT true,
  p_note    text    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_item  public.wo_billable_items;
  v_actor uuid := public.app_current_profile_id();
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_item FROM public.wo_billable_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Activity % not found.', p_item_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'You do not have permission to verify progress.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item.progress_quantity IS NULL THEN
    RAISE EXCEPTION 'No progress has been recorded on this activity yet.'
      USING ERRCODE = '22023';
  END IF;

  -- The whole point of the second person. Verifying your own entry reproduces
  -- exactly the self-certification the source certificates show.
  IF v_item.progress_recorded_by IS NOT NULL
     AND v_item.progress_recorded_by = v_actor
     AND public.app_current_role() <> 'upper_management' THEN
    RAISE EXCEPTION 'Progress must be verified by someone other than the person who recorded it.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT p_approve AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'A rejection needs a reason.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.wo_billable_items
  SET progress_verified_quantity = CASE WHEN p_approve THEN v_item.progress_quantity ELSE NULL END,
      progress_verified_at       = CASE WHEN p_approve THEN now() ELSE NULL END,
      progress_verified_by       = CASE WHEN p_approve THEN v_actor ELSE NULL END,
      rejection_reason           = CASE WHEN p_approve THEN NULL ELSE p_note END,
      updated_at                 = now(),
      updated_by                 = v_actor
  WHERE id = p_item_id;

  INSERT INTO public.wo_progress_events (
    work_order_id, project_id, billable_item_id, event_type,
    claimed_quantity, note, actor_id
  ) VALUES (
    v_item.work_order_id, v_item.project_id, p_item_id,
    CASE WHEN p_approve THEN 'verification' ELSE 'rejection' END,
    v_item.progress_quantity, p_note, v_actor
  );

  -- Status is a fold over measured quantity, which has just changed.
  PERFORM public.fn_recompute_billable_item_status(p_item_id);

  RETURN jsonb_build_object(
    'billable_item_id', p_item_id,
    'approved', p_approve,
    'verified_quantity', CASE WHEN p_approve THEN v_item.progress_quantity ELSE 0 END
  );
END $$;

COMMENT ON FUNCTION public.rpc_verify_wo_progress(uuid, boolean, text) IS
  'The second-person confirmation that replaces measurement-sheet verification. Only the verified figure feeds measured quantity, so recorded progress alone can never unlock a bill. Refuses a verifier who is the recorder.';

GRANT EXECUTE ON FUNCTION public.rpc_verify_wo_progress(uuid, boolean, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5a. CLAIMED IS NOT CERTIFIED
--
--     The screen shows "Billed" and "Certified" as separate columns, and until
--     now both resolved to the same number: fn_billable_item_certified_value
--     counts approved and paid bills only. A bill that has been raised and is
--     sitting with the verifier appeared nowhere, so an activity could look
--     un-billed while a claim for it was already in flight — and be billed
--     twice.
--
--     Claimed counts every live bill; certified counts the ones that became
--     cost. Claimed >= certified always.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_billable_item_claimed_value(
  p_item_id         uuid,
  p_exclude_bill_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(l.line_total), 0)
  FROM public.service_bill_lines l
  JOIN public.service_bills b ON b.id = l.service_bill_id
  WHERE l.billable_item_id = p_item_id
    AND b.deleted_at IS NULL
    /* Rejected is dead and draft is not yet a claim. Everything else is money
       the contractor has asked for. */
    AND public.sb_canonical_status(b.status) IN ('submitted', 'verified', 'approved', 'paid')
    AND (p_exclude_bill_id IS NULL OR b.id <> p_exclude_bill_id);
$$;

COMMENT ON FUNCTION public.fn_billable_item_claimed_value(uuid, uuid) IS
  'Value claimed against an activity on any LIVE bill (submitted, verified, approved, paid). Always >= the certified value. The gap is claims in flight — work already asked for but not yet cost.';

-- ----------------------------------------------------------------------------
-- 6. THE POSITION VIEW GAINS THE PROGRESS COLUMNS
--
--    Rebuilt rather than patched: wo_billing_position is what the screen reads,
--    and the recorded-vs-verified distinction is invisible without it — a user
--    would see 0% with no indication that a figure is sitting unverified.
--
--    Everything else is carried across unchanged.
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
-- 7. WHAT MAY BE BILLED RIGHT NOW
--
--    Recreated because DROP VIEW ... CASCADE above removes anything depending
--    on the view. Body unchanged.
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
-- 8. WORK ORDER ROLL-UP
--
--    The overall completion percentage is DERIVED from the activity rows, so it
--    cannot disagree with them. Value-weighted where there are scheduled
--    values, because a 5% activity worth Rs 94,000 and one worth Rs 2,360 are
--    not equal thirds of anything.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_wo_progress_summary(p_work_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH p AS (
    SELECT * FROM public.wo_billing_position WHERE work_order_id = p_work_order_id
  ), agg AS (
    SELECT
      COUNT(*)                                              AS activity_count,
      COUNT(*) FILTER (WHERE status = 'verified')            AS completed_count,
      COUNT(*) FILTER (WHERE unverified_quantity > 1e-6)     AS awaiting_verification,
      COUNT(*) FILTER (WHERE blocking_reason IS NULL
                         AND claimable_quantity > 0)         AS billable_count,
      COALESCE(SUM(scheduled_value), 0)                      AS scheduled_value,
      COALESCE(SUM(work_done_value), 0)                      AS work_done_value,
      COALESCE(SUM(certified_value), 0)                       AS certified_value,
      COALESCE(SUM(claimed_value), 0)                         AS claimed_value,
      COALESCE(SUM(CASE WHEN blocking_reason IS NULL
                        THEN ROUND(claimable_quantity * COALESCE(rate, 0), 2)
                        ELSE 0 END), 0)                      AS claimable_value,
      COALESCE(SUM(COALESCE(scheduled_value, 0)
                   * COALESCE(percent_complete, 0) / 100.0), 0) AS weighted_done,
      AVG(percent_complete) FILTER (WHERE percent_complete IS NOT NULL)
                                                             AS mean_percent
    FROM p
  )
  SELECT jsonb_build_object(
    'activity_count',        activity_count,
    'completed_count',       completed_count,
    'awaiting_verification', awaiting_verification,
    'billable_count',        billable_count,
    'scheduled_value',       ROUND(scheduled_value, 2),
    'work_done_value',       ROUND(work_done_value, 2),
    'certified_value',       ROUND(certified_value, 2),
    'claimed_value',         ROUND(claimed_value, 2),
    'claimable_value',       ROUND(claimable_value, 2),
    'pending_value',         ROUND(GREATEST(scheduled_value - work_done_value, 0), 2),
    'balance_to_bill',       ROUND(GREATEST(scheduled_value - claimed_value, 0), 2),
    /* Value-weighted where a schedule of values exists; otherwise the plain
       mean, so an open rate-based order still reports something honest. */
    'percent_complete',      CASE
                               WHEN scheduled_value > 0
                                 THEN ROUND(weighted_done / scheduled_value * 100, 2)
                               ELSE ROUND(COALESCE(mean_percent, 0), 2)
                             END,
    'is_value_weighted',     (scheduled_value > 0)
  ) FROM agg;
$$;

COMMENT ON FUNCTION public.rpc_wo_progress_summary(uuid) IS
  'Work Order completion derived from its activity rows — value-weighted where scheduled values exist. Derived rather than entered, so the headline percentage can never disagree with the activities underneath it.';

GRANT EXECUTE ON FUNCTION public.rpc_wo_progress_summary(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. VERIFICATION
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_col record;
BEGIN
  FOR v_col IN
    SELECT * FROM (VALUES
      ('progress_quantity'),
      ('progress_verified_quantity'),
      ('progress_recorded_by'),
      ('progress_verified_by')
    ) AS t(col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'wo_billable_items'
        AND column_name = v_col.col
    ) THEN
      v_problems := array_append(v_problems, 'wo_billable_items.' || v_col.col);
    END IF;
  END LOOP;

  IF to_regclass('public.wo_billing_position') IS NULL THEN
    v_problems := array_append(v_problems, 'wo_billing_position was not recreated');
  END IF;

  -- The new columns must actually be exposed, or the screen shows 0% with no
  -- way to tell that a figure is awaiting verification.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wo_billing_position'
      AND column_name = 'recorded_percent'
  ) THEN
    v_problems := array_append(v_problems, 'wo_billing_position.recorded_percent missing');
  END IF;

  FOR v_col IN
    SELECT * FROM (VALUES
      ('rpc_record_wo_progress'),
      ('rpc_verify_wo_progress'),
      ('rpc_wo_progress_summary'),
      ('rpc_wo_billable_now')
    ) AS t(col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_col.col
    ) THEN
      v_problems := array_append(v_problems, v_col.col || '() missing');
    END IF;
  END LOOP;

  -- Widening the evidence gate must not have unbound it.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_service_bill_evidence_gate' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_service_bill_evidence_gate not bound');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_sb_eligibility_gate' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_sb_eligibility_gate not bound');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Activity progress verification failed: %',
      array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Activity progress is live: progress is recorded per activity and verified by a second person; measured quantity and certification evidence accept it alongside legacy measurement sheets.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
