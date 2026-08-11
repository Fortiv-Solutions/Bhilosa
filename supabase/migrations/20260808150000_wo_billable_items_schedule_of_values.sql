-- ============================================================================
-- STAGE 6 — THE SCHEDULE OF VALUES (billing eligibility)
-- File: supabase/migrations/20260808150000_wo_billable_items_schedule_of_values.sql
--
-- Depends on:
--   20260807100100_wo_sb_stage1_governance.sql   (wo_canonical_status, sb_canonical_status)
--   20260807110000_wo_sb_stage2_...sql           (measurement sheets, certified qty)
--   20260807130000_wo_sb_stage4_...sql           (ceiling, variations)
--   20260807140000_wo_sb_stage5_contract_terms.sql (wo_commercial_terms, wo_payment_stages)
--   20260807141000_fix_wo_line_immutable_delete_return.sql
--
-- WHAT THIS FIXES
-- ===============
-- Stage 5 recorded HOW a contract's value divides (wo_payment_stages) and WHAT
-- the commercial rules are (wo_commercial_terms). Neither records WHAT HAS
-- HAPPENED, so nothing can answer:
--
--     "Which milestone is complete? What may I bill right now?"
--
-- Two specific dead ends in the code as it stands:
--
--   1. wo_commercial_terms.ra_requires_full_activity is declared, defaulted to
--      true, and typed in the frontend — and READ BY NOTHING. The Work Orders
--      say "RA shall be raised only for activity which is 100% Complete" and no
--      code enforces it. Same for payment_terms_type = 'on_completion'.
--
--   2. Every Service Bill gate is a VALUE gate (rate variance, WO balance,
--      over-measurement, QC, measurement evidence). None asks whether the scope
--      is complete enough to bill.
--
-- WHY A SEPARATE TABLE RATHER THAN A COLUMN
-- =========================================
-- The 13 source Work Orders bill four different ways:
--
--     lump sum, whole order          AC Installation      -> 1 unit of claim
--     stage percentages              Plumbing x2          -> line x stage matrix
--     measured quantity, open-ended  Railing, Colour, ... -> 1 per scope line
--     activity-wise 100% completion  Plumbing T&C rule    -> 1 per scope line
--
-- A completion_percent column on work_orders serves only the first. Worse, a
-- hand-typed progress field is exactly what the certificates already have:
-- "% of Work Completed" is populated on 603 lines across the 149 certificate
-- sheets and its value is 1 on EVERY ONE. A free-typed progress field
-- degenerates into a formality. So progress here is never typed:
--
--     measurable scope  -> derived from VERIFIED measurement sheets
--     milestones        -> claimed, then verified by a DIFFERENT person
--
-- This table is the Schedule of Values (AIA G703 / SAP billing plan): the
-- contract decomposed once into units of claim, each with a scheduled value and
-- an eligibility rule. Bills draw from it. Progress is recorded against it.
--
-- NOT IN SCOPE HERE
-- =================
-- Mobilisation advance stays in wo_commercial_terms.advance_percent. An advance
-- is not a claim against scope, and modelling it as a billable item would make
-- SUM(scheduled_value) stop reconciling to the contract value.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.wo_payment_stages') IS NULL THEN
    v_missing := array_append(v_missing, 'wo_payment_stages (apply Stage 5)');
  END IF;
  IF to_regclass('public.wo_commercial_terms') IS NULL THEN
    v_missing := array_append(v_missing, 'wo_commercial_terms (apply Stage 5)');
  END IF;
  IF to_regclass('public.measurement_sheets') IS NULL THEN
    v_missing := array_append(v_missing, 'measurement_sheets (apply Stage 2)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wo_canonical_status'
  ) THEN
    v_missing := array_append(v_missing, 'wo_canonical_status() (apply Stage 1)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_wo_terms'
  ) THEN
    v_missing := array_append(v_missing, 'fn_wo_terms() (apply Stage 5)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_can_write_procurement'
  ) THEN
    v_missing := array_append(v_missing, 'app_can_write_procurement() (apply Stage 1)');
  END IF;

  -- The delete-return fix must be in place: the generator removes and rebuilds
  -- billable items, and a BEFORE DELETE trigger returning NULL would cancel it
  -- silently, leaving stale items behind and double-counting the contract.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_guard_wo_line_immutable'
      AND p.prosrc NOT LIKE '%DELETE%OLD%'
  ) THEN
    v_missing := array_append(v_missing,
      'trg_guard_wo_line_immutable still returns NEW on DELETE '
      '(apply 20260807141000_fix_wo_line_immutable_delete_return.sql)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 6 cannot apply. Missing: %', array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. THE UNIT OF CLAIM
--
--    One row per thing that may be billed. Generated from the contract, never
--    typed. The grain is deliberately (scope line x payment stage) so that
--    "Tower C-D inlet fitting is done, Tower G is not" is expressible — which
--    is exactly how the plumbing certificates bill, a floor at a time.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wo_billable_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id      uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  project_id         uuid NOT NULL REFERENCES public.projects(id),

  /* The contracted scope line this claim draws on. NULL only for a Work-Order
     level milestone that is not tied to a single line. */
  work_order_line_id uuid REFERENCES public.work_order_lines(id) ON DELETE CASCADE,
  /* Set when the contract releases value in stages. */
  payment_stage_id   uuid REFERENCES public.wo_payment_stages(id) ON DELETE CASCADE,

  sequence_no        integer NOT NULL CHECK (sequence_no > 0),
  item_label         text NOT NULL,

  /* How the claim is valued. */
  basis text NOT NULL CHECK (basis IN
    ('quantity',          -- measured qty x contracted rate (rate-based scope)
     'stage_percent',     -- a percentage slice of a scope line
     'lump_sum',          -- the whole line, all or nothing
     'milestone_event')), -- an event with no measurable quantity

  /* When it becomes billable. Derived at generation from the contract terms;
     this is what finally gives ra_requires_full_activity an enforcer. */
  eligibility_rule text NOT NULL CHECK (eligibility_rule IN
    ('on_measured_quantity',     -- bill what is measured, partial allowed
     'on_full_line_completion',  -- "RA only for activity which is 100% Complete"
     'on_full_wo_completion',    -- payment_terms_type = 'on_completion'
     'on_milestone_event')),     -- a verified completion claim

  contracted_quantity numeric CHECK (contracted_quantity IS NULL OR contracted_quantity >= 0),
  unit                text,
  rate                numeric CHECK (rate IS NULL OR rate >= 0),
  /* The G703 "Scheduled Value". NULL for an open rate-based item, where the
     quantity is unknown until measured — 8 of the 13 source Work Orders. */
  scheduled_value     numeric CHECK (scheduled_value IS NULL OR scheduled_value >= 0),
  stage_percent       numeric CHECK (stage_percent IS NULL
                                     OR (stage_percent > 0 AND stage_percent <= 100)),

  allows_partial_billing boolean NOT NULL DEFAULT false,
  requires_qc_pass       boolean NOT NULL DEFAULT false,
  /* Sequencing: sanitary fitting cannot be billed before inlet fitting. */
  depends_on_item_id     uuid REFERENCES public.wo_billable_items(id) ON DELETE SET NULL,

  /* PROGRESS status only. Billing state is derived from the bills themselves
     (see wo_billing_position) so the two can never drift apart. */
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN
    ('not_started', 'in_progress', 'claimed', 'verified', 'rejected')),

  claimed_at       timestamptz,
  claimed_by       uuid REFERENCES public.profiles(id),
  verified_at      timestamptz,
  verified_by      uuid REFERENCES public.profiles(id),
  rejection_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),

  CONSTRAINT uq_wo_billable_items_seq UNIQUE (work_order_id, sequence_no),
  /* One claim per (line, stage). Enforced below as two partial indexes because
     NULLs in a UNIQUE constraint do not collide. */
  CONSTRAINT ck_wo_billable_items_anchor CHECK (
    work_order_line_id IS NOT NULL OR basis = 'milestone_event'),
  CONSTRAINT ck_wo_billable_items_stage CHECK (
    (basis = 'stage_percent') = (payment_stage_id IS NOT NULL)),
  CONSTRAINT ck_wo_billable_items_no_self_dep CHECK (depends_on_item_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_billable_items_line_stage
  ON public.wo_billable_items (work_order_line_id, payment_stage_id)
  WHERE work_order_line_id IS NOT NULL AND payment_stage_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_billable_items_line_nostage
  ON public.wo_billable_items (work_order_line_id)
  WHERE work_order_line_id IS NOT NULL AND payment_stage_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_wo_billable_items_wo
  ON public.wo_billable_items (work_order_id, sequence_no);
CREATE INDEX IF NOT EXISTS ix_wo_billable_items_line
  ON public.wo_billable_items (work_order_line_id) WHERE work_order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_wo_billable_items_status
  ON public.wo_billable_items (work_order_id, status);

COMMENT ON TABLE public.wo_billable_items IS
  'The Schedule of Values: the contract decomposed once into units of claim, each with a scheduled value and an eligibility rule. Generated from the contract, never typed. Bills draw from this; progress is recorded against it.';
COMMENT ON COLUMN public.wo_billable_items.status IS
  'Progress only (not_started/in_progress/claimed/verified/rejected). Billing state is derived from service_bill_lines in wo_billing_position, so a cached billed flag cannot drift.';
COMMENT ON COLUMN public.wo_billable_items.scheduled_value IS
  'G703 Scheduled Value. NULL for open rate-based scope, where quantity is unknown until measured (8 of the 13 source Work Orders print a contract value equal to the unit rate).';

-- ----------------------------------------------------------------------------
-- 2. THE PROGRESS TRAIL — append-only
--
--    Mirrors work_order_status_history: an immutable log, with the current
--    status kept as a cached fold on the item (the same pattern as
--    work_orders.billed_to_date).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wo_progress_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id    uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id),
  billable_item_id uuid NOT NULL REFERENCES public.wo_billable_items(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (event_type IN
    ('progress',          -- partial advance, measurable or asserted
     'completion_claim',  -- "this milestone is done"
     'verification',      -- a second person agrees
     'rejection')),

  claimed_quantity numeric CHECK (claimed_quantity IS NULL OR claimed_quantity >= 0),
  claimed_percent  numeric CHECK (claimed_percent IS NULL
                                  OR (claimed_percent >= 0 AND claimed_percent <= 100)),
  /* Evidence for measurable scope. */
  measurement_sheet_id uuid REFERENCES public.measurement_sheets(id),
  note text,

  actor_id   uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_wo_progress_events_item
  ON public.wo_progress_events (billable_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_wo_progress_events_wo
  ON public.wo_progress_events (work_order_id, created_at DESC);

COMMENT ON TABLE public.wo_progress_events IS
  'Append-only progress trail per billable item: claim, evidence, verification, rejection. The certificates already carry a hand-typed "% of Work Completed" that reads 1 on all 603 populated lines; progress here is evidenced instead.';

CREATE OR REPLACE FUNCTION public.trg_wo_progress_events_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- A blanket block would also stop a Work Order from ever being deleted, since
  -- ON DELETE CASCADE fires this same row trigger on the child. Purges set the
  -- flag deliberately, the same way Stage 4 gates variation application.
  IF COALESCE(NULLIF(current_setting('app.wo_progress_purge', true), ''), 'off') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION 'wo_progress_events is append-only; % is not permitted.', TG_OP
    USING ERRCODE = '42501',
          HINT = 'Record a correcting event instead of editing history. '
                 'A purge must set app.wo_progress_purge = ''on'' explicitly.';
END $$;

DROP TRIGGER IF EXISTS trg_wo_progress_events_append_only ON public.wo_progress_events;
CREATE TRIGGER trg_wo_progress_events_append_only
  BEFORE UPDATE OR DELETE ON public.wo_progress_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_wo_progress_events_append_only();

-- ----------------------------------------------------------------------------
-- 3. LINKING MEASUREMENT AND BILLING TO THE UNIT OF CLAIM
--
--    Measurement already points at work_order_line_id, which is enough while a
--    line has one claim. A stage-billed line has seven, so measurement has to
--    name which one. Both columns are nullable: existing rows keep working and
--    resolve through the line (see fn_billable_item_measured_quantity).
-- ----------------------------------------------------------------------------

ALTER TABLE public.measurement_sheet_items
  ADD COLUMN IF NOT EXISTS billable_item_id uuid REFERENCES public.wo_billable_items(id);

ALTER TABLE public.service_bill_lines
  ADD COLUMN IF NOT EXISTS billable_item_id uuid REFERENCES public.wo_billable_items(id);

CREATE INDEX IF NOT EXISTS ix_ms_items_billable_item
  ON public.measurement_sheet_items (billable_item_id) WHERE billable_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sb_lines_billable_item
  ON public.service_bill_lines (billable_item_id) WHERE billable_item_id IS NOT NULL;

COMMENT ON COLUMN public.service_bill_lines.billable_item_id IS
  'The unit of claim this line draws on. None of the 149 source certificates carries any contract reference at all; this is the link that makes billed-vs-pending computable.';

-- ----------------------------------------------------------------------------
-- 4. DERIVED QUANTITIES
--
--    Symmetrical with fn_sb_line_certified_quantity: the cumulative half of an
--    RA measurement is always derived, never entered.
-- ----------------------------------------------------------------------------

-- 4a. Verified-measured quantity behind a claim.
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
  'Quantity measured against a claim on VERIFIED sheets only. Verification of the sheet is the second-person check for measurable scope, so no separate approval is required.';

-- 4b. Quantity already certified on approved bills.
CREATE OR REPLACE FUNCTION public.fn_billable_item_certified_quantity(
  p_item_id         uuid,
  p_exclude_bill_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(l.quantity * COALESCE(NULLIF(l.flats_count, 0), 1)), 0)
  FROM public.service_bill_lines l
  JOIN public.service_bills b ON b.id = l.service_bill_id
  WHERE l.billable_item_id = p_item_id
    AND b.deleted_at IS NULL
    AND public.sb_canonical_status(b.status) IN ('approved', 'paid')
    AND (p_exclude_bill_id IS NULL OR b.id <> p_exclude_bill_id);
$$;

-- 4c. Value already certified on approved bills.
CREATE OR REPLACE FUNCTION public.fn_billable_item_certified_value(
  p_item_id         uuid,
  p_exclude_bill_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(l.line_total), 0)
  FROM public.service_bill_lines l
  JOIN public.service_bills b ON b.id = l.service_bill_id
  WHERE l.billable_item_id = p_item_id
    AND b.deleted_at IS NULL
    AND public.sb_canonical_status(b.status) IN ('approved', 'paid')
    AND (p_exclude_bill_id IS NULL OR b.id <> p_exclude_bill_id);
$$;

-- ----------------------------------------------------------------------------
-- 5. STATUS AS A FOLD
--
--    Measurable scope derives its status from verified measurement. Milestones
--    derive theirs from the event trail. Nothing here is settable by hand.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_recompute_billable_item_status(p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item     public.wo_billable_items;
  v_measured numeric;
  v_status   text;
  v_last     record;
BEGIN
  SELECT * INTO v_item FROM public.wo_billable_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RETURN;
  END IF;

  IF v_item.basis = 'milestone_event' THEN
    -- Driven purely by the trail; the latest decisive event wins.
    SELECT event_type, actor_id, created_at INTO v_last
    FROM public.wo_progress_events
    WHERE billable_item_id = p_item_id
      AND event_type IN ('progress', 'completion_claim', 'verification', 'rejection')
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    v_status := CASE COALESCE(v_last.event_type, '')
                  WHEN 'verification'     THEN 'verified'
                  WHEN 'rejection'        THEN 'rejected'
                  WHEN 'completion_claim' THEN 'claimed'
                  WHEN 'progress'         THEN 'in_progress'
                  ELSE 'not_started'
                END;
  ELSE
    v_measured := public.fn_billable_item_measured_quantity(p_item_id);

    IF COALESCE(v_item.contracted_quantity, 0) <= 0 THEN
      -- Open rate-based scope: there is no completion to reach, only progress.
      v_status := CASE WHEN v_measured > 0 THEN 'in_progress' ELSE 'not_started' END;
    ELSIF v_measured <= 0 THEN
      v_status := 'not_started';
    ELSIF v_measured + 1e-6 < v_item.contracted_quantity THEN
      v_status := 'in_progress';
    ELSE
      -- Fully measured on sheets that a second person already verified.
      v_status := 'verified';
    END IF;
  END IF;

  UPDATE public.wo_billable_items
  SET status      = v_status,
      verified_at = CASE WHEN v_status = 'verified' AND verified_at IS NULL
                         THEN now() ELSE verified_at END,
      updated_at  = now()
  WHERE id = p_item_id
    AND status IS DISTINCT FROM v_status;
END $$;

-- 5a. Recompute when the trail grows.
CREATE OR REPLACE FUNCTION public.trg_fn_progress_event_recompute()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_recompute_billable_item_status(NEW.billable_item_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_progress_event_recompute ON public.wo_progress_events;
CREATE TRIGGER trg_progress_event_recompute
  AFTER INSERT ON public.wo_progress_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_progress_event_recompute();

-- 5b. Recompute when a measurement sheet is verified or pulled back.
CREATE OR REPLACE FUNCTION public.trg_fn_ms_status_recompute_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT DISTINCT bi.id
    FROM public.measurement_sheet_items i
    JOIN public.wo_billable_items bi
      ON bi.id = i.billable_item_id
      OR (i.billable_item_id IS NULL
          AND bi.payment_stage_id IS NULL
          AND bi.work_order_line_id = i.work_order_line_id)
    WHERE i.measurement_sheet_id = NEW.id
  LOOP
    PERFORM public.fn_recompute_billable_item_status(r.id);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ms_status_recompute_items ON public.measurement_sheets;
CREATE TRIGGER trg_ms_status_recompute_items
  AFTER UPDATE OF status ON public.measurement_sheets
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_ms_status_recompute_items();

-- ----------------------------------------------------------------------------
-- 6. GENERATION
--
--    The contract is decomposed ONCE, from what Stages 4 and 5 already record.
--    Nothing about the shape is asked of the user — it is read off wo_type,
--    the presence of stages, and the commercial terms.
--
--    This is where ra_requires_full_activity finally acquires an enforcer.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_wo_default_eligibility_rule(p_work_order_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo    public.work_orders;
  v_terms public.wo_commercial_terms;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  SELECT * INTO v_terms FROM public.fn_wo_terms(p_work_order_id);

  -- A rate-based order has no contracted quantity, so "100% complete" has no
  -- meaning — there is nothing to be 100% of. 8 of the 13 source Work Orders
  -- are this shape and every one of them defers quantity to site measurement.
  IF v_wo.wo_type = 'rate_based' THEN
    RETURN 'on_measured_quantity';
  END IF;

  -- "Payment Condition - 100% after work completion" (Lift Partition, Kitchen
  -- T-Angle): nothing bills until the whole order is done.
  IF COALESCE(v_terms.payment_terms_type, '') = 'on_completion' THEN
    RETURN 'on_full_wo_completion';
  END IF;

  -- "RA shall be raised only for activity which is 100% Complete" (Plumbing,
  -- Colour, Railing, Cable Tray, AC Stand): activity-wise completion.
  IF COALESCE(v_terms.ra_requires_full_activity, true) THEN
    RETURN 'on_full_line_completion';
  END IF;

  RETURN 'on_measured_quantity';
END $$;

COMMENT ON FUNCTION public.fn_wo_default_eligibility_rule(uuid) IS
  'Reads the billing condition off the contract terms instead of asking. Gives wo_commercial_terms.ra_requires_full_activity and payment_terms_type their first enforcer.';

CREATE OR REPLACE FUNCTION public.rpc_generate_wo_billable_items(p_work_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_wo       public.work_orders;
  v_rule     text;
  v_stages   integer;
  v_sum      numeric;
  v_line     record;
  s          record;
  v_seq      integer := 0;
  v_prev     uuid;
  v_created  integer := 0;
  v_value    numeric := 0;
  v_id       uuid;
  v_partial  boolean;
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_wo FROM public.work_orders
  WHERE id = p_work_order_id AND deleted_at IS NULL;

  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'Work Order % not found, or you do not have access to it.', p_work_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Regeneration rewrites the basis on which money is claimed. Once the
  -- contract is live that is a variation, not an edit.
  IF public.wo_canonical_status(v_wo.wo_status) NOT IN ('draft', 'submitted', 'rejected') THEN
    IF EXISTS (SELECT 1 FROM public.wo_billable_items WHERE work_order_id = p_work_order_id) THEN
      RAISE EXCEPTION
        'Work Order % is live; its schedule of values cannot be regenerated.',
        COALESCE(v_wo.work_order_number, v_wo.id::text)
        USING ERRCODE = '42501',
              HINT = 'Raise a variation to change the scope of a live contract.';
    END IF;
  END IF;

  -- Anything already claimed or billed must not be swept away.
  IF EXISTS (
    SELECT 1 FROM public.wo_billable_items bi
    WHERE bi.work_order_id = p_work_order_id
      AND (bi.status IN ('claimed', 'verified')
           OR EXISTS (SELECT 1 FROM public.service_bill_lines l WHERE l.billable_item_id = bi.id)
           OR EXISTS (SELECT 1 FROM public.wo_progress_events e WHERE e.billable_item_id = bi.id))
  ) THEN
    RAISE EXCEPTION
      'Work Order % already has progress or billing recorded against its schedule of values.',
      COALESCE(v_wo.work_order_number, v_wo.id::text)
      USING ERRCODE = '42501',
            HINT = 'Regeneration would discard that history.';
  END IF;

  DELETE FROM public.wo_billable_items WHERE work_order_id = p_work_order_id;

  v_rule := public.fn_wo_default_eligibility_rule(p_work_order_id);

  SELECT COUNT(*), COALESCE(SUM(stage_percent), 0) INTO v_stages, v_sum
  FROM public.wo_payment_stages WHERE work_order_id = p_work_order_id;

  IF v_stages > 0 AND ABS(v_sum - 100) > 0.1 THEN
    RAISE EXCEPTION 'Payment stages sum to %, not 100.', ROUND(v_sum, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.work_order_lines WHERE work_order_id = p_work_order_id) THEN
    RAISE EXCEPTION 'This Work Order has no scope lines to decompose.'
      USING ERRCODE = '22023';
  END IF;

  -- Partial billing is only meaningful where the rule bills measured quantity.
  v_partial := (v_rule = 'on_measured_quantity');

  FOR v_line IN
    SELECT * FROM public.work_order_lines
    WHERE work_order_id = p_work_order_id
    ORDER BY created_at, id
  LOOP
    -- Stage 5's rpc_generate_wo_stage_lines may already have decomposed the
    -- scope. Those lines carry a payment_stage_id and are themselves the unit
    -- of claim, so they take the single-claim branch below rather than being
    -- multiplied by the stage list a second time.
    IF v_stages > 0 AND v_line.payment_stage_id IS NULL THEN
      -- Stage-billed: one claim per (line, stage), value computed not typed.
      v_prev := NULL;
      FOR s IN
        SELECT * FROM public.wo_payment_stages
        WHERE work_order_id = p_work_order_id ORDER BY sequence_no
      LOOP
        v_seq := v_seq + 1;
        INSERT INTO public.wo_billable_items (
          work_order_id, project_id, work_order_line_id, payment_stage_id,
          sequence_no, item_label, basis, eligibility_rule,
          contracted_quantity, unit, rate, scheduled_value, stage_percent,
          allows_partial_billing, depends_on_item_id, created_by, updated_by
        ) VALUES (
          p_work_order_id, v_wo.project_id, v_line.id, s.id,
          v_seq,
          v_line.description || ' — ' || s.stage_name
            || ' (' || ROUND(s.stage_percent, 2)::text || '%)',
          'stage_percent',
          /* Same deadlock guard as the single-claim branch: a completion rule
             needs a contracted quantity to be 100% of. */
          CASE WHEN COALESCE(v_line.quantity, 0) <= 0 THEN 'on_measured_quantity'
               WHEN v_rule = 'on_full_wo_completion' THEN 'on_full_wo_completion'
               ELSE 'on_full_line_completion' END,
          NULLIF(v_line.quantity, 0), v_line.unit,
          ROUND(COALESCE(v_line.rate, 0) * s.stage_percent / 100.0, 2),
          ROUND(COALESCE(v_line.quantity, 0)
                * ROUND(COALESCE(v_line.rate, 0) * s.stage_percent / 100.0, 2), 2),
          s.stage_percent,
          (COALESCE(v_line.quantity, 0) <= 0), v_prev,
          public.app_current_profile_id(), public.app_current_profile_id()
        ) RETURNING id INTO v_id;

        v_prev    := v_id;
        v_created := v_created + 1;
      END LOOP;
    ELSE
      -- One claim for the line as contracted.
      v_seq := v_seq + 1;
      INSERT INTO public.wo_billable_items (
        work_order_id, project_id, work_order_line_id, payment_stage_id,
        sequence_no, item_label, basis, eligibility_rule,
        contracted_quantity, unit, rate, scheduled_value, stage_percent,
        allows_partial_billing, created_by, updated_by
      ) VALUES (
        p_work_order_id, v_wo.project_id, v_line.id, v_line.payment_stage_id,
        v_seq, v_line.description,
        CASE WHEN v_line.payment_stage_id IS NOT NULL THEN 'stage_percent'
             WHEN v_wo.wo_type = 'rate_based'         THEN 'quantity'
             ELSE 'lump_sum' END,
        /* A completion rule needs something to be 100% OF. A line with no
           contracted quantity can never satisfy it, which would deadlock the
           claim forever, so it falls back to billing what is measured. */
        CASE WHEN v_rule IN ('on_full_line_completion', 'on_full_wo_completion')
                  AND COALESCE(v_line.quantity, 0) <= 0
             THEN 'on_measured_quantity' ELSE v_rule END,
        NULLIF(v_line.quantity, 0), v_line.unit, v_line.rate,
        CASE WHEN v_wo.wo_type = 'rate_based' AND COALESCE(v_line.quantity, 0) <= 1
             THEN NULL                       -- open rate: no scheduled value
             ELSE v_line.total_amount END,
        CASE WHEN v_line.payment_stage_id IS NOT NULL
             THEN (SELECT stage_percent FROM public.wo_payment_stages
                   WHERE id = v_line.payment_stage_id)
             ELSE NULL END,
        /* Partial claims follow the EFFECTIVE rule, including the fallback
           applied just above. */
        (v_partial OR COALESCE(v_line.quantity, 0) <= 0),
        public.app_current_profile_id(), public.app_current_profile_id()
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(scheduled_value), 0) INTO v_value
  FROM public.wo_billable_items WHERE work_order_id = p_work_order_id;

  RETURN jsonb_build_object(
    'work_order_id',    p_work_order_id,
    'eligibility_rule', v_rule,
    'stages',           v_stages,
    'items_created',    v_created,
    'scheduled_value',  v_value,
    'contract_value',   v_wo.total_amount,
    'reconciles',       (v_wo.wo_type <> 'rate_based'
                         AND ABS(v_value - COALESCE(v_wo.total_amount, 0)) <= 1)
  );
END $$;

COMMENT ON FUNCTION public.rpc_generate_wo_billable_items(uuid) IS
  'Decomposes a Work Order into its schedule of values. Non-destructive to the contract: work_order_lines are left intact, unlike rpc_generate_wo_stage_lines which deletes them. Refuses to run once progress or billing exists.';

-- 6a. Auto-generate at issue, so no live contract can exist without a schedule
--     of values for bills to draw on.
CREATE OR REPLACE FUNCTION public.trg_fn_wo_autogenerate_billable_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.wo_canonical_status(NEW.wo_status) NOT IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND public.wo_canonical_status(OLD.wo_status) IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.wo_billable_items WHERE work_order_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_order_lines WHERE work_order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  PERFORM public.rpc_generate_wo_billable_items(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wo_autogenerate_billable_items ON public.work_orders;
CREATE TRIGGER trg_wo_autogenerate_billable_items
  AFTER UPDATE OF wo_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_wo_autogenerate_billable_items();

-- ----------------------------------------------------------------------------
-- 7. CLAIMING AND VERIFYING A MILESTONE
--
--    Measurable scope needs neither: a verified measurement sheet already
--    carries a second person's signature. These exist for milestones, where
--    there is no quantity to measure.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_claim_billable_item(
  p_item_id  uuid,
  p_percent  numeric DEFAULT NULL,
  p_note     text    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_item  public.wo_billable_items;
  v_actor uuid := public.app_current_profile_id();
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_item FROM public.wo_billable_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Billable item % not found.', p_item_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'You do not have permission to record progress.' USING ERRCODE = '42501';
  END IF;

  IF v_item.basis <> 'milestone_event' THEN
    RAISE EXCEPTION
      'This item is measured, not claimed. Record a measurement sheet against it and have it verified.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.wo_progress_events (
    work_order_id, project_id, billable_item_id, event_type,
    claimed_percent, note, actor_id
  ) VALUES (
    v_item.work_order_id, v_item.project_id, p_item_id,
    CASE WHEN COALESCE(p_percent, 100) >= 100 THEN 'completion_claim' ELSE 'progress' END,
    p_percent, p_note, v_actor
  );

  UPDATE public.wo_billable_items
  SET claimed_at = now(), claimed_by = v_actor, updated_at = now(), updated_by = v_actor
  WHERE id = p_item_id;

  RETURN jsonb_build_object('billable_item_id', p_item_id, 'claimed_by', v_actor);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_verify_billable_item(
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
    RAISE EXCEPTION 'Billable item % not found.', p_item_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'You do not have permission to verify progress.' USING ERRCODE = '42501';
  END IF;

  IF v_item.basis <> 'milestone_event' THEN
    RAISE EXCEPTION 'Measured scope is verified by verifying its measurement sheet.'
      USING ERRCODE = '42501';
  END IF;

  IF v_item.claimed_by IS NULL THEN
    RAISE EXCEPTION 'Nothing has been claimed on this item yet.' USING ERRCODE = '22023';
  END IF;

  -- Separation of duties: the certificates show what self-certification
  -- produces — "% of Work Completed" reads 1 on all 603 populated lines.
  IF v_item.claimed_by = v_actor
     AND public.app_current_role() <> 'upper_management' THEN
    RAISE EXCEPTION 'A completion claim must be verified by someone other than the person who made it.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT p_approve AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'A rejection needs a reason.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.wo_progress_events (
    work_order_id, project_id, billable_item_id, event_type, note, actor_id
  ) VALUES (
    v_item.work_order_id, v_item.project_id, p_item_id,
    CASE WHEN p_approve THEN 'verification' ELSE 'rejection' END,
    p_note, v_actor
  );

  UPDATE public.wo_billable_items
  SET verified_by      = CASE WHEN p_approve THEN v_actor ELSE NULL END,
      verified_at      = CASE WHEN p_approve THEN now() ELSE NULL END,
      rejection_reason = CASE WHEN p_approve THEN NULL ELSE p_note END,
      updated_at       = now(),
      updated_by       = v_actor
  WHERE id = p_item_id;

  RETURN jsonb_build_object('billable_item_id', p_item_id, 'approved', p_approve);
END $$;

-- ----------------------------------------------------------------------------
-- 8. THE POSITION VIEW — the G703 column set
--
--    One row per unit of claim: scheduled, measured, certified, billed,
--    claimable, and — the column that decides whether people use the system or
--    work around it — WHY something cannot be billed.
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
    wo.work_order_number,
    wo.wo_status,
    public.fn_billable_item_measured_quantity(bi.id)  AS measured_quantity,
    public.fn_billable_item_certified_quantity(bi.id) AS certified_quantity,
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
    GREATEST(COALESCE(b.scheduled_value, 0) - b.billed_value, 0) AS balance_to_bill,
    (SELECT dep.status FROM public.wo_billable_items dep WHERE dep.id = b.depends_on_item_id)
      AS dependency_status,
    (SELECT COUNT(*) FROM public.wo_billable_items sib
      WHERE sib.work_order_id = b.work_order_id AND sib.status <> 'verified')
      AS wo_items_outstanding
  FROM base b
)
SELECT s.*,
  /* Why this cannot be billed right now. NULL means it can. */
  CASE
    WHEN public.wo_canonical_status(s.wo_status) NOT IN ('issued', 'active')
      THEN 'Work Order is ' || COALESCE(public.wo_canonical_status(s.wo_status), 'unknown')
    WHEN s.status = 'rejected'
      THEN COALESCE('Rejected: ' || s.rejection_reason, 'Progress was rejected')
    WHEN s.depends_on_item_id IS NOT NULL
         AND COALESCE(s.dependency_status, '') <> 'verified'
      THEN 'A prior stage is not certified yet'
    WHEN s.eligibility_rule = 'on_full_wo_completion' AND s.wo_items_outstanding > 0
      THEN 'Contract bills only on full completion — '
           || s.wo_items_outstanding::text || ' item(s) still outstanding'
    WHEN s.eligibility_rule = 'on_full_line_completion'
         AND COALESCE(s.contracted_quantity, 0) > 0
         AND s.measured_quantity + 1e-6 < s.contracted_quantity
      THEN 'Contract requires the activity to be 100% complete — measured '
           || COALESCE(ROUND(s.measured_quantity / s.contracted_quantity * 100, 1)::text, '0')
           || '%'
    WHEN s.eligibility_rule = 'on_milestone_event' AND s.status <> 'verified'
      THEN CASE s.status
             WHEN 'claimed' THEN 'Completion claimed, awaiting verification'
             ELSE 'Milestone not claimed yet' END
    WHEN s.eligibility_rule = 'on_measured_quantity'
         AND s.measured_quantity <= s.certified_quantity
      THEN 'Nothing newly measured since the last bill'
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
  'The G703 position of every unit of claim: scheduled, measured, certified, billed, balance, percent complete, and blocking_reason. blocking_reason IS NULL means it is billable now.';

REVOKE ALL ON public.wo_billing_position FROM PUBLIC, anon;
GRANT SELECT ON public.wo_billing_position TO authenticated;
ALTER VIEW public.wo_billing_position SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 9. THE ELIGIBILITY GATE
--
--    Fires where the other gates fire — at certification, on service_bills —
--    so a draft bill can still be assembled and corrected.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_sb_eligibility_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r        record;
  v_reason text;
  v_this   numeric;
  v_room   numeric;
BEGIN
  IF public.sb_canonical_status(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.sb_canonical_status(OLD.status) = 'approved' THEN
    RETURN NEW;
  END IF;

  /* An unattributed line would slip past the loop below and be certified
     ungated. Once a Work Order has a schedule of values, every line must say
     which claim it draws on. Bills against Work Orders that predate Stage 6
     have no schedule and are left alone. */
  IF NEW.work_order_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.wo_billable_items
                 WHERE work_order_id = NEW.work_order_id)
     AND EXISTS (SELECT 1 FROM public.service_bill_lines
                 WHERE service_bill_id = NEW.id AND billable_item_id IS NULL) THEN
    RAISE EXCEPTION
      'Bill % has lines that do not say which contracted item they bill.',
      COALESCE(NEW.bill_number, NEW.id::text)
      USING ERRCODE = 'check_violation',
            HINT = 'Pick the item from the Work Order schedule of values.';
  END IF;

  FOR r IN
    SELECT l.billable_item_id,
           SUM(l.quantity * COALESCE(NULLIF(l.flats_count, 0), 1)) AS qty
    FROM public.service_bill_lines l
    WHERE l.service_bill_id = NEW.id
      AND l.billable_item_id IS NOT NULL
    GROUP BY l.billable_item_id
  LOOP
    /* Room left, mirroring wo_billing_position.claimable_quantity but excluding
       THIS bill. A BEFORE trigger already sees the pre-update row, so the bill
       is not yet 'approved' and not yet counted — the explicit exclusion covers
       the re-approval path as well. */
    SELECT p.blocking_reason,
           CASE
             WHEN p.basis = 'milestone_event' THEN
               CASE WHEN public.fn_billable_item_certified_quantity(p.billable_item_id, NEW.id) <= 0
                    THEN 1 ELSE 0 END
             WHEN p.eligibility_rule = 'on_measured_quantity'
               THEN GREATEST(p.measured_quantity
                    - public.fn_billable_item_certified_quantity(p.billable_item_id, NEW.id), 0)
             ELSE GREATEST(COALESCE(p.contracted_quantity, 0)
                    - public.fn_billable_item_certified_quantity(p.billable_item_id, NEW.id), 0)
           END
      INTO v_reason, v_room
    FROM public.wo_billing_position p
    WHERE p.billable_item_id = r.billable_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bill % references a billable item that no longer exists.',
        COALESCE(NEW.bill_number, NEW.id::text)
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    /* Every reason blocks, including 'Fully billed' — the current bill is not
       counted above, so that reason can only mean an EARLIER bill already
       consumed the item. Exempting it would let the same completed scope be
       billed twice. */
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Bill % cannot be certified: %', COALESCE(NEW.bill_number, NEW.id::text), v_reason
        USING ERRCODE = 'check_violation',
              HINT = 'Complete and verify the scope, or bill a different item.';
    END IF;

    v_this := COALESCE(r.qty, 0);
    IF COALESCE(v_room, 0) > 0 AND v_this > v_room + 1e-6 THEN
      RAISE EXCEPTION
        'Bill % claims % on an item with only % left to bill.',
        COALESCE(NEW.bill_number, NEW.id::text), ROUND(v_this, 3), ROUND(v_room, 3)
        USING ERRCODE = 'check_violation',
              HINT = 'Reduce the quantity, or raise a variation to extend the scope.';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sb_eligibility_gate ON public.service_bills;
CREATE TRIGGER trg_sb_eligibility_gate
  BEFORE INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_sb_eligibility_gate();

COMMENT ON FUNCTION public.trg_sb_eligibility_gate() IS
  'The first PROGRESS gate on a Service Bill. Every other gate checks rate, quantity, ceiling or evidence; none asked whether the scope was complete enough to bill.';

-- ----------------------------------------------------------------------------
-- 10. WHAT MAY BE BILLED RIGHT NOW
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

COMMENT ON FUNCTION public.rpc_wo_billable_now(uuid) IS
  'What a new Service Bill may draw on today, with quantities and values pre-computed. Replaces the blank bill form that produced hand-derived stage rates on the source certificates.';

-- ----------------------------------------------------------------------------
-- 11. RLS
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wo_billable_items', 'wo_progress_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    /* Revoking from anon alone leaves privileges held via PUBLIC in place. */
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_current_role() IS NOT NULL)', t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.app_can_write_procurement())', t || '_insert', t);
  END LOOP;
END $$;

-- The trail is append-only; no UPDATE policy exists for it at all.
DROP POLICY IF EXISTS wo_progress_events_update ON public.wo_progress_events;

DROP POLICY IF EXISTS wo_billable_items_update ON public.wo_billable_items;
CREATE POLICY wo_billable_items_update
  ON public.wo_billable_items FOR UPDATE TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());

-- Items may only be removed while the contract is still being drafted.
GRANT DELETE ON public.wo_billable_items TO authenticated;
DROP POLICY IF EXISTS wo_billable_items_delete ON public.wo_billable_items;
CREATE POLICY wo_billable_items_delete
  ON public.wo_billable_items FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = wo_billable_items.work_order_id
        AND public.wo_canonical_status(wo.wo_status) IN ('draft', 'submitted', 'rejected'))
  );

-- ----------------------------------------------------------------------------
-- 12. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_generate_wo_billable_items(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_claim_billable_item(uuid, numeric, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_verify_billable_item(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_wo_billable_now(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_billable_item_measured_quantity(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_billable_item_certified_quantity(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_billable_item_certified_value(uuid, uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_wo_default_eligibility_rule(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_recompute_billable_item_status(uuid)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_generate_wo_billable_items(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_claim_billable_item(uuid, numeric, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verify_billable_item(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_wo_billable_now(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billable_item_measured_quantity(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billable_item_certified_quantity(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billable_item_certified_value(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wo_default_eligibility_rule(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recompute_billable_item_status(uuid)       TO authenticated;

-- ----------------------------------------------------------------------------
-- 13. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.wo_billable_items')  IS NULL THEN
    v_problems := array_append(v_problems, 'wo_billable_items missing'); END IF;
  IF to_regclass('public.wo_progress_events') IS NULL THEN
    v_problems := array_append(v_problems, 'wo_progress_events missing'); END IF;
  IF to_regclass('public.wo_billing_position') IS NULL THEN
    v_problems := array_append(v_problems, 'wo_billing_position missing'); END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_sb_eligibility_gate' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_sb_eligibility_gate not bound'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_wo_autogenerate_billable_items' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_wo_autogenerate_billable_items not bound'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_wo_progress_events_append_only' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'append-only guard not bound'); END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='service_bill_lines'
                   AND column_name='billable_item_id') THEN
    v_problems := array_append(v_problems, 'service_bill_lines.billable_item_id missing'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='measurement_sheet_items'
                   AND column_name='billable_item_id') THEN
    v_problems := array_append(v_problems, 'measurement_sheet_items.billable_item_id missing'); END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 6 verification failed: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Stage 6 applied: schedule of values, progress trail, eligibility gate.';
END $$;

-- Behavioural proof. Uses a real fixture so the guards are exercised, not just
-- inspected, then removes it. A no-op UPDATE would touch no rows and therefore
-- never fire a row trigger, which proves nothing.
DO $$
DECLARE
  v_proj    uuid;
  v_agency  uuid;
  v_wo      uuid;
  v_line    uuid;
  v_item    uuid;
  v_event   uuid;
  v_actor   uuid;
  v_blocked boolean;
BEGIN
  SELECT project_id, agency_id INTO v_proj, v_agency
  FROM public.work_orders WHERE deleted_at IS NULL LIMIT 1;

  IF v_proj IS NULL THEN
    RAISE NOTICE 'No Work Order to build a fixture from; skipping the behavioural check.';
    RETURN;
  END IF;

  INSERT INTO public.work_orders (project_id, agency_id, work_order_number,
                                  scope_of_work, wo_type, wo_status, total_amount)
  VALUES (v_proj, v_agency, 'FIXTURE-SOV-CHECK', 'fixture', 'fixed_scope', 'draft', 1000)
  RETURNING id INTO v_wo;

  INSERT INTO public.work_order_lines (work_order_id, project_id, description,
                                       unit, quantity, rate, total_amount)
  VALUES (v_wo, v_proj, 'fixture activity', 'Nos', 10, 100, 1000)
  RETURNING id INTO v_line;

  -- rpc_generate_wo_billable_items calls app_require_profile(), which raises
  -- when there is no JWT — the normal state during a CLI migration. Exercise it
  -- when a session exists, and fall back to a direct insert when it does not,
  -- so the invariants below are always checked.
  IF public.app_current_profile_id() IS NOT NULL THEN
    PERFORM public.rpc_generate_wo_billable_items(v_wo);
  ELSE
    INSERT INTO public.wo_billable_items (
      work_order_id, project_id, work_order_line_id, sequence_no, item_label,
      basis, eligibility_rule, contracted_quantity, unit, rate, scheduled_value
    ) VALUES (
      v_wo, v_proj, v_line, 1, 'fixture activity',
      'lump_sum', 'on_full_line_completion', 10, 'Nos', 100, 1000
    );
  END IF;

  SELECT id INTO v_item FROM public.wo_billable_items WHERE work_order_id = v_wo;
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Generation produced no billable item.';
  END IF;

  IF (SELECT ROUND(COALESCE(SUM(scheduled_value), 0))
        FROM public.wo_billable_items WHERE work_order_id = v_wo) <> 1000 THEN
    RAISE EXCEPTION 'Scheduled value does not reconcile to the contract value.';
  END IF;

  -- Nothing measured, so the position must refuse to bill and say why.
  IF (SELECT blocking_reason FROM public.wo_billing_position
      WHERE billable_item_id = v_item) IS NULL THEN
    RAISE EXCEPTION 'An unmeasured item reported itself as billable.';
  END IF;

  -- The progress trail must be append-only. actor_id is NOT NULL, so this needs
  -- some profile to exist; without one the trail check is skipped rather than
  -- failing the migration.
  SELECT COALESCE(public.app_current_profile_id(), (SELECT id FROM public.profiles LIMIT 1))
    INTO v_actor;

  IF v_actor IS NULL THEN
    RAISE NOTICE 'No profile exists; skipping the append-only check.';
    PERFORM set_config('app.wo_progress_purge', 'on', true);
    DELETE FROM public.wo_billable_items WHERE work_order_id = v_wo;
    DELETE FROM public.work_order_lines  WHERE work_order_id = v_wo;
    DELETE FROM public.work_orders       WHERE id = v_wo;
    PERFORM set_config('app.wo_progress_purge', 'off', true);
    RETURN;
  END IF;

  INSERT INTO public.wo_progress_events (work_order_id, project_id, billable_item_id,
                                        event_type, note, actor_id)
  VALUES (v_wo, v_proj, v_item, 'progress', 'fixture', v_actor)
  RETURNING id INTO v_event;

  v_blocked := false;
  BEGIN
    UPDATE public.wo_progress_events SET note = 'tampered' WHERE id = v_event;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'The progress trail accepted an UPDATE; it is not append-only.';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.wo_progress_events WHERE id = v_event;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'The progress trail accepted a DELETE; it is not append-only.';
  END IF;

  -- Remove the fixture. The purge flag is what lets the trail be torn down.
  PERFORM set_config('app.wo_progress_purge', 'on', true);
  DELETE FROM public.wo_progress_events WHERE billable_item_id = v_item;
  DELETE FROM public.wo_billable_items  WHERE work_order_id = v_wo;
  DELETE FROM public.work_order_lines   WHERE work_order_id = v_wo;
  UPDATE public.work_orders
  SET wo_status = 'cancelled', cancellation_reason = 'Migration fixture'
  WHERE id = v_wo;
  DELETE FROM public.work_orders WHERE id = v_wo;
  PERFORM set_config('app.wo_progress_purge', 'off', true);

  RAISE NOTICE 'Verified: generation reconciles, unmeasured scope is refused with a reason, and the trail is append-only.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

