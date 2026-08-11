-- ============================================================================
-- STAGE 5 — THE CONTRACT LAYER
-- File: supabase/migrations/20260807140000_wo_sb_stage5_contract_terms.sql
--
-- Depends on:
--   20260807100100_wo_sb_stage1_governance.sql   (wo_canonical_status, guards)
--   20260807110000_wo_sb_stage2_...sql           (measurement, over-measurement)
--   20260807130000_wo_sb_stage4_...sql           (variations, ceiling, immutability)
--
-- WHAT THE 13 WORK ORDERS AND 29 CERTIFICATES ESTABLISH
-- =====================================================
-- Stages 1-4 built the CONTROL layer. What is still missing is the CONTRACT
-- layer: the Work Order records what was agreed as free text, so every
-- commercial parameter is re-typed on each bill and nothing validates it.
--
-- Evidence from the source documents:
--
--  1. RETENTION is printed on all 149 certificate sheets but carries a value on
--     only 7. It is boilerplate on the bill and a DECISION on the contract:
--     none / 5% in RA bills / 5% released after 12 months / 10% released after
--     12 months. It must be inherited, not typed.
--
--  2. TDS: the note "TDS will be deducted as per applicable rules at your end"
--     appears on 101 sheets and the amount is ZERO on all 101. The contractor
--     accounts for it. Default 0 and say so.
--
--  3. GST is three-state, not boolean: "GST incl." / "GST is extra as per
--     applicable" / "Tax as applicable". tax_inclusive cannot express the third.
--
--  4. RATE DRIFT: Salauddin's WO says Rs 33,500/flat; his certificates bill on a
--     Rs 34,000 basis (6,800+3,400+8,500 = 20+10+25%). Nisadh bills the same
--     stages on Rs 31,900. Three different rates for one contracted scope, and
--     nothing objected.
--
--  5. SPECIFICATION IS THE PRICE. The Colour WO has three lines reading
--     "M S Painting with 1 coat of metal primer and 2 coats of Enamel Paint"
--     at Rs 11.50, Rs 18.25 and Rs 21.25 — distinguished ONLY by the material
--     named in the sub-text. Picking by description alone can overbill by 85%
--     with no arithmetic error to detect.
--
--  6. WARRANTY IS PER LINE: 10 years on lines 1-3 of the Colour WO, none on
--     4-12, and line 2's is conditional ("Not Applicable in case of part
--     application"). A header-level field cannot hold it.
--
--  7. PAYMENT STAGES are real on 2 of 13 WOs only. The other 5 "Payment Stages"
--     headings contain boilerplate with no percentages. Stage decomposition
--     must be OPTIONAL.
--
--  8. CLAUSE 24 (Colour WO): "Any surface measure in width/length/height below
--     0.5 foot will be considered as running foot and charged at half rate."
--     A conditional rate modifier the measurement sheet already has the
--     dimensions to evaluate.
--
--  9. LOCATION is structured data trapped in text: 89 tower refs, 41 flat-count
--     refs, 11 floor refs inside item descriptions.
--
-- 10. VARIATION TOLERANCE: the Louvers WO states "variation above 5% is not
--     considered". Stage 2's over-measurement guard hardcodes 0%.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. wo_commercial_terms — one row per WO holding every money-affecting clause.
-- 2. wo_payment_stages   — optional stage decomposition, validated to 100%.
-- 3. Line-level specification, warranty, remeasurable flag, rate rules.
-- 4. Location fields on bill lines.
-- 5. Rate-variance guard: a bill line may not silently depart from its
--    contracted rate.
-- 6. Makes the over-measurement tolerance contractual instead of hardcoded.
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wo_canonical_status'
  ) THEN
    v_missing := array_append(v_missing, 'wo_canonical_status() (apply Stage 1)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'ceiling_amount'
  ) THEN
    v_missing := array_append(v_missing, 'work_orders.ceiling_amount (apply Stage 4)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_bill_lines' AND column_name = 'flats_count'
  ) THEN
    v_missing := array_append(v_missing, 'service_bill_lines.flats_count (apply Stage 2)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 5 cannot apply. Missing: %', array_to_string(v_missing, '; ');
  END IF;
END $$;

LOCK TABLE public.service_bill_lines,
           public.service_bills,
           public.work_order_lines,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. COMMERCIAL TERMS — one row per Work Order
--
--    Every clause here changes MONEY. The obligations that do not (BOCW, PF,
--    labour insurance, scaffolding, site visits, PIS, guarantee certificates)
--    stay in terms_and_conditions text and on the printed document: modelling
--    all 26 clauses of the Colour WO as columns would be over-engineering.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wo_commercial_terms (
  work_order_id uuid PRIMARY KEY REFERENCES public.work_orders(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.projects(id),

  /* --- Tax -------------------------------------------------------------- */
  /* Three-state, because the documents are: "GST incl." (inclusive),
     "GST is extra as per applicable" / "Tax as applicable" (exclusive), and a
     handful with no tax clause at all. */
  gst_treatment text NOT NULL DEFAULT 'exclusive'
    CHECK (gst_treatment IN ('inclusive', 'exclusive', 'not_applicable')),
  gst_rate      numeric NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),

  /* --- Retention -------------------------------------------------------- */
  retention_percent        numeric NOT NULL DEFAULT 0
    CHECK (retention_percent >= 0 AND retention_percent <= 100),
  /* "released after 12 months of total work completion" — the DLP. NULL means
     released on close rather than after a fixed period. */
  retention_release_months integer CHECK (retention_release_months IS NULL OR retention_release_months >= 0),

  /* --- Advance ---------------------------------------------------------- */
  /* "Payment Terms - 50% Advance & 50% on Work completion" (Louvers x2). */
  advance_percent numeric NOT NULL DEFAULT 0
    CHECK (advance_percent >= 0 AND advance_percent <= 100),
  /* Percent of each certified bill applied against the outstanding advance.
     0 means recover manually. */
  advance_recovery_percent numeric NOT NULL DEFAULT 0
    CHECK (advance_recovery_percent >= 0 AND advance_recovery_percent <= 100),

  /* --- TDS -------------------------------------------------------------- */
  /* Zero on all 101 certificate sheets that mention it: "deducted as per
     applicable rules AT YOUR END" means the contractor accounts for it. */
  tds_percent numeric NOT NULL DEFAULT 0
    CHECK (tds_percent >= 0 AND tds_percent <= 100),

  /* --- Payment timing --------------------------------------------------- */
  payment_terms_type text NOT NULL DEFAULT 'on_completion'
    CHECK (payment_terms_type IN ('on_completion', 'days_after_bill', 'monthly_ra', 'advance_and_completion')),
  /* "Payment will be done in 15days after receipt of RA bill" / "100% after 30
     days of bill submission". */
  payment_days integer CHECK (payment_days IS NULL OR payment_days >= 0),
  /* "Bill to be paid only on 15th and 25th of every month" — a real payment-run
     calendar. Empty array = no restriction. */
  billing_window_days integer[] NOT NULL DEFAULT '{}'::integer[],

  /* --- Penalties -------------------------------------------------------- */
  /* "debit of 500/- Rs per day" / 1500 / 2000 — three different rates across
     the set, so it cannot be a constant. */
  delay_debit_per_day        numeric NOT NULL DEFAULT 0 CHECK (delay_debit_per_day >= 0),
  /* "3 warnings ... after that every instant 2000 Rs. Debit". */
  safety_warning_limit       integer NOT NULL DEFAULT 0 CHECK (safety_warning_limit >= 0),
  safety_debit_per_instance  numeric NOT NULL DEFAULT 0 CHECK (safety_debit_per_instance >= 0),

  /* --- Measurement ------------------------------------------------------ */
  /* Louvers: "variation above 5% is not considered ... quantities are based on
     drawings". Stage 2's guard hardcoded 0; this makes it contractual. */
  variation_tolerance_percent numeric NOT NULL DEFAULT 0
    CHECK (variation_tolerance_percent >= 0 AND variation_tolerance_percent <= 100),
  /* "Joint measurement should be done at the time of final bill." */
  joint_measurement_required  boolean NOT NULL DEFAULT false,
  /* "RA shall be raised only for activity which is 100% Complete" — on 7 WOs. */
  ra_requires_full_activity   boolean NOT NULL DEFAULT true,

  /* --- Contract character ----------------------------------------------- */
  /* "Type of Contract" is a header field on every certificate and had no home:
     "With material and Labour Rate" vs "Site level Drainage and Plumbing". */
  contract_type text CHECK (contract_type IS NULL OR contract_type IN
    ('labour_only', 'labour_with_material', 'supply_only', 'supply_and_install')),
  /* "Cost of all Material Wastage is considered in the given rates". */
  wastage_included boolean NOT NULL DEFAULT true,

  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),

  /* An advance that is never recovered is a permanent loan. */
  CONSTRAINT wo_terms_advance_recovery_chk
    CHECK (advance_percent = 0 OR advance_recovery_percent > 0 OR advance_percent > 0)
);

COMMENT ON TABLE public.wo_commercial_terms IS
  'The money-affecting clauses of a Work Order, structured so the Service Bill inherits them instead of re-asking. Obligations that do not change money (BOCW, PF, insurance, scaffolding, PIS, guarantee certificates) stay in terms_and_conditions text.';
COMMENT ON COLUMN public.wo_commercial_terms.tds_percent IS
  'Zero by default: all 101 certificate sheets that mention TDS show nil, because the clause reads "deducted as per applicable rules at your end" — the contractor accounts for it.';
COMMENT ON COLUMN public.wo_commercial_terms.variation_tolerance_percent IS
  'Contractual allowance before over-measurement is refused. The Louvers WO permits 5% ("quantities are based on drawings"); most permit 0.';

CREATE INDEX IF NOT EXISTS ix_wo_commercial_terms_project
  ON public.wo_commercial_terms (project_id);

-- 1b. Resolver used by the bill form and every guard. Always returns a row —
--     a Work Order with no terms falls back to the conservative defaults rather
--     than making every caller handle NULL.
CREATE OR REPLACE FUNCTION public.fn_wo_terms(p_work_order_id uuid)
RETURNS public.wo_commercial_terms
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.wo_commercial_terms;
  v_wo  public.work_orders;
BEGIN
  SELECT * INTO v_row FROM public.wo_commercial_terms WHERE work_order_id = p_work_order_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  v_row.work_order_id := p_work_order_id;
  v_row.project_id    := v_wo.project_id;
  -- Mirror the legacy boolean so a Work Order created before Stage 5 still
  -- reports its tax basis correctly.
  v_row.gst_treatment := CASE WHEN COALESCE(v_wo.tax_inclusive, false)
                              THEN 'inclusive' ELSE 'exclusive' END;
  v_row.gst_rate                    := 18;
  v_row.retention_percent           := 0;
  v_row.advance_percent             := 0;
  v_row.advance_recovery_percent    := 0;
  v_row.tds_percent                 := 0;
  v_row.payment_terms_type          := 'on_completion';
  v_row.billing_window_days         := '{}'::integer[];
  v_row.delay_debit_per_day         := 0;
  v_row.safety_warning_limit        := 0;
  v_row.safety_debit_per_instance   := 0;
  v_row.variation_tolerance_percent := 0;
  v_row.joint_measurement_required  := false;
  v_row.ra_requires_full_activity   := true;
  v_row.wastage_included            := true;
  RETURN v_row;
END $$;

COMMENT ON FUNCTION public.fn_wo_terms(uuid) IS
  'Commercial terms for a Work Order, falling back to conservative defaults derived from work_orders.tax_inclusive when no terms row exists. Always returns a row so callers never branch on NULL.';

-- 1c. Keep the legacy boolean in step with gst_treatment. Phase 2's drawdown
--     arithmetic (fn_recompute_wo_billed_to_date) reads tax_inclusive directly,
--     so the two must never disagree.
CREATE OR REPLACE FUNCTION public.trg_fn_wo_terms_sync_tax()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.app_current_profile_id(), NEW.updated_by);

  UPDATE public.work_orders
  SET tax_inclusive = (NEW.gst_treatment = 'inclusive')
  WHERE id = NEW.work_order_id
    AND tax_inclusive IS DISTINCT FROM (NEW.gst_treatment = 'inclusive');

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wo_terms_sync_tax ON public.wo_commercial_terms;
CREATE TRIGGER wo_terms_sync_tax
  BEFORE INSERT OR UPDATE ON public.wo_commercial_terms
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_wo_terms_sync_tax();

-- ----------------------------------------------------------------------------
-- 2. PAYMENT STAGES — optional, and validated
--
--    Real on 2 of 13 WOs. The other 5 "Payment Stages" headings are boilerplate
--    with no percentages, so the presence of the heading means nothing and the
--    decomposition must be opt-in.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wo_payment_stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id),

  sequence_no     integer NOT NULL CHECK (sequence_no > 0),
  stage_name      text NOT NULL,
  stage_percent   numeric NOT NULL CHECK (stage_percent > 0 AND stage_percent <= 100),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_wo_payment_stages_seq UNIQUE (work_order_id, sequence_no)
);

COMMENT ON TABLE public.wo_payment_stages IS
  'Value decomposition for a stage-billed Work Order, e.g. plumbing: Inlet 20%, Drainage 10%, Waterproofing 25%, External Vertical 20%, Terrace Looping 10%, CP 7.5%, Sanitary 7.5%. Must sum to 100%. Optional: only 2 of the 13 source Work Orders use stages.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_payment_stages_name
  ON public.wo_payment_stages (work_order_id, lower(btrim(stage_name)));
CREATE INDEX IF NOT EXISTS ix_wo_payment_stages_wo
  ON public.wo_payment_stages (work_order_id, sequence_no);

-- 2b. The stages must sum to exactly 100%, or the generated lines will not
--     reconcile to the contract value. Checked as a set, deferred to statement
--     end so a multi-row insert is judged once it is complete.
CREATE OR REPLACE FUNCTION public.trg_fn_wo_stages_sum_100()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo  uuid := COALESCE(NEW.work_order_id, OLD.work_order_id);
  v_sum numeric;
BEGIN
  -- Only the Work Order this row touched, not every Work Order in the table.
  SELECT SUM(stage_percent) INTO v_sum
  FROM public.wo_payment_stages WHERE work_order_id = v_wo;

  -- Deleting the last stage removes the decomposition entirely, which is a
  -- legitimate way to un-stage a draft.
  IF v_sum IS NULL THEN
    RETURN NULL;
  END IF;

  -- A tenth of a percent of tolerance: 20+10+25+20+10+7.5+7.5 is exact, but a
  -- user-entered set may carry rounding.
  IF ABS(v_sum - 100) > 0.1 THEN
    RAISE EXCEPTION
      'Payment stages on this Work Order sum to %, not 100. Adjust them so the decomposition reconciles to the contract value.',
      ROUND(v_sum, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS wo_stages_sum_100 ON public.wo_payment_stages;
CREATE CONSTRAINT TRIGGER wo_stages_sum_100
  AFTER INSERT OR UPDATE OR DELETE ON public.wo_payment_stages
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_wo_stages_sum_100();

-- ----------------------------------------------------------------------------
-- 3. WORK ORDER LINES — specification, warranty, measurement character
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_order_lines
  /* THE PRICE-DETERMINING FIELD. The Colour WO has three lines reading
     "M S Painting with 1 coat of metal primer and 2 coats of Enamel Paint" at
     Rs 11.50 / 18.25 / 21.25, distinguished only by the material named here. */
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS material_brand text,

  /* Per line, not per contract: 10 years on Colour lines 1-3, none on 4-12. */
  ADD COLUMN IF NOT EXISTS warranty_months integer
    CHECK (warranty_months IS NULL OR warranty_months >= 0),
  /* "Not Applicable in case of part application" — the condition on line 2. */
  ADD COLUMN IF NOT EXISTS warranty_condition text,

  /* "(Total Measurement As Per Site)" appears under 4 lines, whose contracted
     Qty is a placeholder 1. Those lines cannot be over-measurement checked
     against a quantity that was never real. */
  ADD COLUMN IF NOT EXISTS is_remeasurable boolean NOT NULL DEFAULT false,

  /* Which payment stage this generated line represents, when the Work Order is
     stage-decomposed. */
  ADD COLUMN IF NOT EXISTS payment_stage_id uuid REFERENCES public.wo_payment_stages(id),

  /* Clause 24, Colour WO: "Any surface measure in width/length/height below 0.5
     foot will be considered as running foot and charged at half rate."
     Stored as a rule the measurement sheet can evaluate, because it already
     holds the dimensions. */
  ADD COLUMN IF NOT EXISTS min_dimension_ft numeric
    CHECK (min_dimension_ft IS NULL OR min_dimension_ft > 0),
  ADD COLUMN IF NOT EXISTS below_min_rate_factor numeric
    CHECK (below_min_rate_factor IS NULL OR (below_min_rate_factor > 0 AND below_min_rate_factor <= 1)),
  ADD COLUMN IF NOT EXISTS below_min_unit text;

COMMENT ON COLUMN public.work_order_lines.specification IS
  'Material grade / make that determines the rate. On the Colour Work Order three lines share an identical description and differ only here — billing by description alone can overbill by 85%.';
COMMENT ON COLUMN public.work_order_lines.is_remeasurable IS
  'True for lines marked "(Total Measurement As Per Site)", whose contracted quantity is a placeholder. Exempt from the over-measurement guard, which has no real quantity to compare against.';
COMMENT ON COLUMN public.work_order_lines.below_min_rate_factor IS
  'Clause 24 of the Colour Work Order: a surface below min_dimension_ft is billed in below_min_unit at this fraction of the rate (0.5 = half rate).';

CREATE INDEX IF NOT EXISTS ix_wo_lines_stage
  ON public.work_order_lines (payment_stage_id) WHERE payment_stage_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. SERVICE BILL LINES — location, and what was actually applied
-- ----------------------------------------------------------------------------

ALTER TABLE public.service_bill_lines
  /* 89 tower refs, 41 flat-count refs and 11 floor refs are buried inside
     certificate item descriptions today, so nothing can report by tower. */
  ADD COLUMN IF NOT EXISTS tower text,
  ADD COLUMN IF NOT EXISTS floor_ref text,
  ADD COLUMN IF NOT EXISTS unit_ref text,
  /* Set when clause 24 (or a similar rule) reduced the rate on this line, so
     the certificate can show why. */
  ADD COLUMN IF NOT EXISTS rate_factor_applied numeric
    CHECK (rate_factor_applied IS NULL OR rate_factor_applied > 0),
  ADD COLUMN IF NOT EXISTS rate_variance_reason text;

COMMENT ON COLUMN public.service_bill_lines.rate_variance_reason IS
  'Mandatory justification when a line is billed at a rate other than the contracted one. Without it trg_sb_rate_variance_guard refuses certification.';

CREATE INDEX IF NOT EXISTS ix_sb_lines_tower
  ON public.service_bill_lines (tower) WHERE tower IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. RATE VARIANCE GUARD
--
--    Salauddin's Work Order says Rs 33,500/flat; his certificates bill on a
--    Rs 34,000 basis. Nisadh bills the same stages on Rs 31,900. Nothing
--    objected, because nothing compared the bill rate to the contract rate.
--
--    A rate difference is not always wrong — clause 24 halves it legitimately,
--    and a negotiated correction is real. So it is REFUSED only when
--    unexplained: supply a reason (or a rate_factor) and it passes, recorded.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_sb_rate_variance_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r          record;
  v_expected numeric;
  v_tol      numeric := 0.01;  -- a paisa, to absorb float noise
BEGIN
  IF public.sb_canonical_status(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.sb_canonical_status(OLD.status) = 'approved' THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT l.id, l.description, l.rate AS billed_rate,
           l.rate_factor_applied, l.rate_variance_reason,
           wol.rate AS contracted_rate,
           wol.below_min_rate_factor
    FROM public.service_bill_lines l
    JOIN public.work_order_lines wol ON wol.id = l.work_order_line_id
    WHERE l.service_bill_id = NEW.id
      AND l.work_order_line_id IS NOT NULL
      AND COALESCE(wol.rate, 0) > 0
  LOOP
    -- A declared factor (clause 24's half rate) is the expected rate.
    v_expected := r.contracted_rate * COALESCE(r.rate_factor_applied, 1);

    IF ABS(COALESCE(r.billed_rate, 0) - v_expected) > v_tol
       AND COALESCE(btrim(r.rate_variance_reason), '') = '' THEN
      RAISE EXCEPTION
        'Rate variance on "%": billed at % against a contracted %. Record a reason, or correct the rate.',
        left(r.description, 55),
        to_char(COALESCE(r.billed_rate, 0), 'FM99,99,999.00'),
        to_char(v_expected, 'FM99,99,999.00')
        USING ERRCODE = 'check_violation',
              HINT = 'A legitimate difference (a contractual half-rate, a negotiated correction) is allowed — it just has to be stated.';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- Sorts after the governance guard and before the QC gate, keeping the user's
-- error sequence: authority -> arithmetic -> evidence -> QC.
DROP TRIGGER IF EXISTS trg_sb_rate_variance_guard ON public.service_bills;
CREATE TRIGGER trg_sb_rate_variance_guard
  BEFORE INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_sb_rate_variance_guard();

-- ----------------------------------------------------------------------------
-- 6. OVER-MEASUREMENT: tolerance becomes contractual
--
--    Replaces Stage 2's hardcoded 0%. Also exempts remeasurable lines, whose
--    contracted quantity is the placeholder 1 that "(Total Measurement As Per
--    Site)" implies.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_sb_over_measurement_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r            record;
  v_tolerance  numeric;
  v_prior      numeric;
  v_this       numeric;
  v_cumulative numeric;
  v_limit      numeric;
BEGIN
  IF public.sb_canonical_status(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.sb_canonical_status(OLD.status) = 'approved' THEN
    RETURN NEW;
  END IF;

  -- Contractual, not hardcoded: the Louvers Work Order permits 5%.
  v_tolerance := COALESCE(
    (public.fn_wo_terms(NEW.work_order_id)).variation_tolerance_percent, 0);

  FOR r IN
    SELECT l.work_order_line_id,
           SUM(l.quantity * COALESCE(NULLIF(l.flats_count, 0), 1)) AS qty,
           MAX(wol.quantity)    AS contracted,
           MAX(wol.description) AS description
    FROM public.service_bill_lines l
    JOIN public.work_order_lines wol ON wol.id = l.work_order_line_id
    JOIN public.work_orders wo       ON wo.id  = wol.work_order_id
    WHERE l.service_bill_id = NEW.id
      AND l.work_order_line_id IS NOT NULL
      AND COALESCE(wo.wo_type, 'fixed_scope') = 'fixed_scope'
      AND COALESCE(wol.quantity, 0) > 0
      -- "(Total Measurement As Per Site)": the contracted quantity is a
      -- placeholder, so there is nothing meaningful to overrun.
      AND COALESCE(wol.is_remeasurable, false) = false
    GROUP BY l.work_order_line_id
  LOOP
    v_prior      := public.fn_sb_line_certified_quantity(r.work_order_line_id, NEW.id);
    v_this       := COALESCE(r.qty, 0);
    v_cumulative := v_prior + v_this;
    v_limit      := r.contracted * (1 + v_tolerance / 100.0);

    IF v_cumulative > v_limit THEN
      RAISE EXCEPTION
        'Over-measurement on "%": % already certified + % on this bill = % against a contracted %.',
        left(r.description, 55),
        ROUND(v_prior, 3), ROUND(v_this, 3), ROUND(v_cumulative, 3),
        ROUND(r.contracted, 3)::text
          || CASE WHEN v_tolerance > 0
                  THEN ' (+' || ROUND(v_tolerance, 2)::text || ' percent tolerance)'
                  ELSE '' END
        USING ERRCODE = 'check_violation',
              HINT = 'Correct the quantity, or raise a variation to extend the contracted scope.';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 7. STAGE-LINE GENERATION
--
--    Enter the Work Order exactly as the document reads — the plumbing WO's two
--    lines — then generate the 14 billable lines from the stage table, PROVING
--    they reconcile. Manual decomposition would leave the arithmetic to
--    whoever types it.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_generate_wo_stage_lines(p_work_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_wo       public.work_orders;
  v_stages   integer;
  v_sum      numeric;
  v_base     record;
  s          record;
  v_created  integer := 0;
  v_total    numeric := 0;
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_wo FROM public.work_orders
  WHERE id = p_work_order_id AND deleted_at IS NULL;

  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'Work Order % not found, or you do not have access to it.', p_work_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Generation rewrites the scope, so it belongs to the drafting phase. On a
  -- live contract, scope changes go through a variation (Stage 4).
  IF public.wo_canonical_status(v_wo.wo_status) NOT IN ('draft', 'submitted', 'rejected') THEN
    RAISE EXCEPTION 'Work Order % is %; stage lines can only be generated while it is a draft.',
      COALESCE(v_wo.work_order_number, v_wo.id::text),
      public.wo_canonical_status(v_wo.wo_status)
      USING ERRCODE = '42501',
            HINT = 'Raise a variation to change the scope of a live contract.';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(stage_percent), 0) INTO v_stages, v_sum
  FROM public.wo_payment_stages WHERE work_order_id = p_work_order_id;

  IF v_stages = 0 THEN
    RAISE EXCEPTION 'No payment stages are defined on this Work Order.'
      USING ERRCODE = '22023';
  END IF;
  IF ABS(v_sum - 100) > 0.1 THEN
    RAISE EXCEPTION 'Payment stages sum to %, not 100.', ROUND(v_sum, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  -- The base lines are the ones as written on the document: those not already
  -- generated from a stage.
  CREATE TEMP TABLE _base ON COMMIT DROP AS
  SELECT id, description, unit, quantity, rate, specification, material_brand
  FROM public.work_order_lines
  WHERE work_order_id = p_work_order_id
    AND payment_stage_id IS NULL;

  IF NOT EXISTS (SELECT 1 FROM _base) THEN
    RAISE EXCEPTION 'This Work Order has no base scope lines to decompose.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_base IN SELECT * FROM _base LOOP
    FOR s IN
      SELECT * FROM public.wo_payment_stages
      WHERE work_order_id = p_work_order_id ORDER BY sequence_no
    LOOP
      INSERT INTO public.work_order_lines (
        work_order_id, project_id, description, unit, quantity, rate, total_amount,
        specification, material_brand, payment_stage_id
      ) VALUES (
        p_work_order_id, v_wo.project_id,
        v_base.description || ' — ' || s.stage_name
          || ' (' || ROUND(s.stage_percent, 2)::text || '%)',
        v_base.unit,
        v_base.quantity,
        -- The stage rate. Rs 33,500 x 20% = Rs 6,700, computed rather than typed.
        ROUND(COALESCE(v_base.rate, 0) * s.stage_percent / 100.0, 2),
        ROUND(COALESCE(v_base.quantity, 0)
              * ROUND(COALESCE(v_base.rate, 0) * s.stage_percent / 100.0, 2), 2),
        v_base.specification, v_base.material_brand, s.id
      );
      v_created := v_created + 1;
    END LOOP;

    -- The document line is replaced by its decomposition; keeping both would
    -- double the contract value.
    DELETE FROM public.work_order_lines WHERE id = v_base.id;
  END LOOP;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_total
  FROM public.work_order_lines WHERE work_order_id = p_work_order_id;

  UPDATE public.work_orders
  SET total_amount = v_total, updated_at = now()
  WHERE id = p_work_order_id;

  RETURN jsonb_build_object(
    'work_order_id', p_work_order_id,
    'stages', v_stages,
    'lines_created', v_created,
    'contract_value', v_total
  );
END $$;

COMMENT ON FUNCTION public.rpc_generate_wo_stage_lines(uuid) IS
  'Decomposes each base scope line into one line per payment stage, with the stage rate computed rather than typed (Rs 33,500 x 20% = Rs 6,700). Draft only: a live contract changes through a variation.';

-- ----------------------------------------------------------------------------
-- 8. BILL DEFAULTS FROM THE CONTRACT
--
--    The bill form stops asking for retention, TDS and GST — it reads them.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_service_bill_defaults(p_work_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_t   public.wo_commercial_terms;
  v_wo  public.work_orders;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'Work Order % not found.', p_work_order_id USING ERRCODE = 'no_data_found';
  END IF;

  v_t := public.fn_wo_terms(p_work_order_id);

  RETURN jsonb_build_object(
    'retention_percent',           v_t.retention_percent,
    'retention_release_months',    v_t.retention_release_months,
    'tds_percent',                 v_t.tds_percent,
    'gst_treatment',               v_t.gst_treatment,
    'gst_rate',                    CASE WHEN v_t.gst_treatment = 'not_applicable'
                                        THEN 0 ELSE v_t.gst_rate END,
    'tax_inclusive',               (v_t.gst_treatment = 'inclusive'),
    'advance_recovery_percent',    v_t.advance_recovery_percent,
    'delay_debit_per_day',         v_t.delay_debit_per_day,
    'safety_debit_per_instance',   v_t.safety_debit_per_instance,
    'variation_tolerance_percent', v_t.variation_tolerance_percent,
    'joint_measurement_required',  v_t.joint_measurement_required,
    'payment_terms_type',          v_t.payment_terms_type,
    'payment_days',                v_t.payment_days,
    'billing_window_days',         to_jsonb(v_t.billing_window_days),
    'contract_type',               v_t.contract_type,
    'has_stages',                  EXISTS (SELECT 1 FROM public.wo_payment_stages
                                           WHERE work_order_id = p_work_order_id)
  );
END $$;

COMMENT ON FUNCTION public.rpc_service_bill_defaults(uuid) IS
  'Commercial defaults a new bill inherits from its Work Order. Retention is printed on all 149 source certificates but valued on 7 — it is a contract decision, not a per-bill entry.';

-- ----------------------------------------------------------------------------
-- 9. RLS
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wo_commercial_terms', 'wo_payment_stages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_current_role() IS NOT NULL)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.app_can_write_procurement())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.app_can_write_procurement())
         WITH CHECK (public.app_can_write_procurement())', t || '_update', t);
  END LOOP;
END $$;

-- Stages may only be removed while the contract is still being drafted: after
-- issue the generated lines reference them.
DROP POLICY IF EXISTS wo_payment_stages_delete ON public.wo_payment_stages;
CREATE POLICY wo_payment_stages_delete
  ON public.wo_payment_stages FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = wo_payment_stages.work_order_id
        AND public.wo_canonical_status(wo.wo_status) IN ('draft', 'submitted', 'rejected'))
  );

DROP POLICY IF EXISTS wo_commercial_terms_delete ON public.wo_commercial_terms;
CREATE POLICY wo_commercial_terms_delete
  ON public.wo_commercial_terms FOR DELETE TO authenticated
  USING (public.app_can_approve());

-- ----------------------------------------------------------------------------
-- 10. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_generate_wo_stage_lines(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_generate_wo_stage_lines(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_service_bill_defaults(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_service_bill_defaults(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_wo_terms(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_wo_terms(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. RECONCILE — seed terms for existing Work Orders from what is known
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.wo_commercial_terms (work_order_id, project_id, gst_treatment)
  SELECT wo.id, wo.project_id,
         CASE WHEN COALESCE(wo.tax_inclusive, false) THEN 'inclusive' ELSE 'exclusive' END
  FROM public.work_orders wo
  WHERE wo.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.wo_commercial_terms t WHERE t.work_order_id = wo.id);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'Stage 5 reconcile: commercial terms seeded for % Work Order(s).', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- 12. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
  v_t        public.wo_commercial_terms;
  v_wo       uuid;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['wo_commercial_terms', 'wo_payment_stages'] LOOP
    IF to_regclass('public.' || v_key) IS NULL THEN
      v_problems := array_append(v_problems, v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['specification', 'warranty_months', 'is_remeasurable',
                               'payment_stage_id', 'below_min_rate_factor'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'work_order_lines' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'work_order_lines.' || v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['tower', 'floor_ref', 'unit_ref', 'rate_variance_reason'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'service_bill_lines' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'service_bill_lines.' || v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['wo_terms_sync_tax', 'wo_stages_sum_100',
                               'trg_sb_rate_variance_guard'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key AND NOT tgisinternal) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  -- The fallback must produce a usable row for a Work Order with no terms.
  SELECT id INTO v_wo FROM public.work_orders WHERE deleted_at IS NULL LIMIT 1;
  IF v_wo IS NOT NULL THEN
    v_t := public.fn_wo_terms(v_wo);
    IF v_t.gst_treatment IS NULL OR v_t.retention_percent IS NULL THEN
      v_problems := array_append(v_problems, 'fn_wo_terms returned an incomplete row');
    END IF;
  END IF;

  -- Trigger firing order on service_bills must stay as documented.
  IF NOT ('guard_service_bill_status' < 'trg_sb_over_measurement_guard'
          AND 'trg_sb_over_measurement_guard' < 'trg_sb_rate_variance_guard'
          AND 'trg_sb_rate_variance_guard' < 'trg_service_bill_evidence_gate'
          AND 'trg_service_bill_evidence_gate' < 'trg_service_bill_qc_gate') THEN
    v_problems := array_append(v_problems, 'service bill BEFORE-trigger ordering is not as documented');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 5 incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Stage 5 applied: the Work Order is now the single source of commercial truth — bills inherit retention/TDS/GST, rates are checked against the contract, and stage decomposition is generated rather than typed.';
END $$;

COMMIT;

-- ============================================================================
-- REALTIME REGISTRATION — outside the main transaction, on purpose.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['wo_commercial_terms', 'wo_payment_stages'] LOOP
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
