-- ============================================================================
-- VALUATION STRUCTURE — give the three billing structures a database
-- File: supabase/migrations/20260808160000_wo_valuation_structure_persistence.sql
--
-- Depends on:
--   20260803000000_work_order_module_enhancement.sql  (wo_templates)
--   20260807140000_wo_sb_stage5_contract_terms.sql    (wo_commercial_terms, stages)
--
-- THE BUG
-- =======
-- The Work Order form offers three valuation structures:
--
--     Standard Item Rate       rate x measured quantity
--     Stage-Wise %             milestone % of a flat/unit rate
--     Floor Lead %             base rate + % lead per floor
--
-- None of them had a column. saveWorkOrderTerms() put valuation_structure,
-- lead_percent_per_floor and stages into the wo_commercial_terms upsert, and
-- PostgREST rejects unknown columns — so the write failed. createWorkOrder()
-- then awaited that call WITHOUT checking its error, so creation reported
-- success. The only surviving copy was localStorage, keyed per browser:
--
--     localStorage['onsite_wo_valuation_terms:<work_order_id>']
--
-- Open the same Work Order on another machine and the structure was gone.
--
-- Because valuationStructure defaults to 'standard' — always truthy — that
-- branch ran on EVERY Work Order. So wo_commercial_terms was never written at
-- creation time for any Work Order at all, and fn_wo_terms() has been serving
-- its fallback defaults to the whole module, including Stage 6's eligibility
-- rules (whose default, payment_terms_type = 'on_completion', is the strictest
-- one there is).
--
-- WHAT THIS MIGRATION DOES
-- ========================
--   1. valuation_structure + lead_percent_per_floor become real columns.
--   2. wo_templates carries the DEFAULTS, so picking a template selects the
--      structure instead of the frontend guessing from a trade-name substring.
--   3. Payment stages keep living in wo_payment_stages — they were being sent
--      as a 'stages' JSON blob, which is why that table stayed empty and the
--      stage matrix never generated. Templates carry default_stages as JSON
--      because a template has no Work Order to hang stage rows on.
--   4. service_bill_lines.floor_level records WHY a floor-lead rate moved. The
--      rate factor itself belongs in the existing rate_factor_applied column,
--      which trg_sb_rate_variance_guard already treats as a declared factor —
--      floor lead was silently multiplying the rate and tripping that guard.
--
-- NO EVIDENCE NOTE
-- ================
-- Floor lead appears NOWHERE in the 13 Work Orders or the 149 Payment
-- Certificates — zero matches for lead, per-floor or floor-wise escalation. It
-- is a real commercial practice, so the structure is kept and made to work, but
-- no template is seeded with it. Stage-wise IS evidenced: both plumbing Work
-- Orders carry the 20/10/25/20/10/7.5/7.5 split, and that is seeded.
--
-- Idempotent and non-destructive: safe to re-run.
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
  IF to_regclass('public.wo_commercial_terms') IS NULL THEN
    v_missing := array_append(v_missing, 'wo_commercial_terms (apply Stage 5)');
  END IF;
  IF to_regclass('public.wo_payment_stages') IS NULL THEN
    v_missing := array_append(v_missing, 'wo_payment_stages (apply Stage 5)');
  END IF;
  IF to_regclass('public.wo_templates') IS NULL THEN
    v_missing := array_append(v_missing, 'wo_templates (apply 20260803000000)');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_bill_lines'
      AND column_name = 'rate_factor_applied'
  ) THEN
    v_missing := array_append(v_missing, 'service_bill_lines.rate_factor_applied (apply Stage 5)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Valuation persistence cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. THE CONTRACT'S VALUATION STRUCTURE
-- ----------------------------------------------------------------------------

ALTER TABLE public.wo_commercial_terms
  ADD COLUMN IF NOT EXISTS valuation_structure text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS lead_percent_per_floor numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_wo_terms_valuation_structure'
  ) THEN
    ALTER TABLE public.wo_commercial_terms
      ADD CONSTRAINT ck_wo_terms_valuation_structure
      CHECK (valuation_structure IN ('standard', 'stage_percentage', 'floor_lead'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_wo_terms_lead_percent'
  ) THEN
    ALTER TABLE public.wo_commercial_terms
      ADD CONSTRAINT ck_wo_terms_lead_percent
      CHECK (lead_percent_per_floor >= 0 AND lead_percent_per_floor <= 100);
  END IF;

  -- A lead percentage is meaningless unless the structure asks for one, and a
  -- zero lead on a floor_lead contract is a silently standard contract.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_wo_terms_lead_requires_structure'
  ) THEN
    ALTER TABLE public.wo_commercial_terms
      ADD CONSTRAINT ck_wo_terms_lead_requires_structure
      CHECK ((valuation_structure = 'floor_lead') = (lead_percent_per_floor > 0));
  END IF;
END $$;

COMMENT ON COLUMN public.wo_commercial_terms.valuation_structure IS
  'How Service Bills value a line: standard (rate x qty), stage_percentage (milestone % of a unit rate, held in wo_payment_stages), or floor_lead (base rate + % per floor). Was localStorage-only until this migration.';
COMMENT ON COLUMN public.wo_commercial_terms.lead_percent_per_floor IS
  'Percentage added per floor for vertical material carrying. Applied as service_bill_lines.rate_factor_applied = 1 + floor_level * pct/100, which trg_sb_rate_variance_guard accepts as a DECLARED factor rather than an unexplained variance.';

-- ----------------------------------------------------------------------------
-- 2. TEMPLATE DEFAULTS — so picking a template selects the structure
--
--    The frontend was guessing by substring ('plumb', 'tile', 'mason') against
--    the trade name, never reset to standard when a later template did not
--    match, and set stage_percentage without supplying any stages — which then
--    failed its own sum-to-100 check.
-- ----------------------------------------------------------------------------

ALTER TABLE public.wo_templates
  ADD COLUMN IF NOT EXISTS default_valuation_structure text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS default_lead_percent_per_floor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_stages jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_wo_templates_valuation_structure'
  ) THEN
    ALTER TABLE public.wo_templates
      ADD CONSTRAINT ck_wo_templates_valuation_structure
      CHECK (default_valuation_structure IN ('standard', 'stage_percentage', 'floor_lead'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_wo_templates_default_stages_array'
  ) THEN
    ALTER TABLE public.wo_templates
      ADD CONSTRAINT ck_wo_templates_default_stages_array
      CHECK (jsonb_typeof(default_stages) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.wo_templates.default_stages IS
  'Default milestone split as [{"name":"Inlet Fitting Work","percent":20}, ...]. JSON rather than rows because a template has no Work Order for wo_payment_stages to reference; the rows are created when the Work Order is.';

-- 2a. Seed the one structure the source documents actually evidence.
--     Both plumbing Work Orders carry this split in Terms & Conditions clause 3.
UPDATE public.wo_templates
SET default_valuation_structure = 'stage_percentage',
    default_stages = '[
      {"name": "Inlet Fitting Work",          "percent": 20},
      {"name": "Internal Drainage Line Work", "percent": 10},
      {"name": "Water Proofing Work",         "percent": 25},
      {"name": "External Vertical Line Work", "percent": 20},
      {"name": "Terrace Looping Work",        "percent": 10},
      {"name": "CP Fitting Work",             "percent": 7.5},
      {"name": "Sanitary Fitting Work",       "percent": 7.5}
    ]'::jsonb,
    updated_at = now()
WHERE trade_category ILIKE '%plumb%'
  AND default_valuation_structure = 'standard'
  AND default_stages = '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- 3. WHY A FLOOR-LEAD RATE MOVED
--
--    The rate factor already has a home (rate_factor_applied, Stage 5). What
--    was missing is the floor it came from, without which the audit trail says
--    only "the rate was higher".
-- ----------------------------------------------------------------------------

ALTER TABLE public.service_bill_lines
  ADD COLUMN IF NOT EXISTS floor_level integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_sb_lines_floor_level') THEN
    ALTER TABLE public.service_bill_lines
      ADD CONSTRAINT ck_sb_lines_floor_level
      CHECK (floor_level IS NULL OR (floor_level >= 0 AND floor_level <= 200));
  END IF;
END $$;

COMMENT ON COLUMN public.service_bill_lines.floor_level IS
  'Floor this line was executed on, for a floor_lead contract. Paired with rate_factor_applied so the inflated rate is explained rather than excused: the guard sees a declared factor, and the certificate can show the derivation.';

-- ----------------------------------------------------------------------------
-- 4. TEACH fn_wo_terms THE NEW FIELDS
--
--    The stored branch is SELECT * and picks them up for free. The synthesised
--    fallback builds its record field by field, so it must set them or every
--    Work Order without a terms row reports a NULL structure.
-- ----------------------------------------------------------------------------

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
  -- New: a Work Order with no terms row bills the plain way.
  v_row.valuation_structure         := 'standard';
  v_row.lead_percent_per_floor      := 0;
  RETURN v_row;
END $$;

COMMENT ON FUNCTION public.fn_wo_terms(uuid) IS
  'Commercial terms for a Work Order, falling back to conservative defaults derived from work_orders.tax_inclusive when no terms row exists. Always returns a row so callers never branch on NULL.';

-- ----------------------------------------------------------------------------
-- 4b. THE BILL MUST INHERIT THE STRUCTURE TOO
--
--     rpc_service_bill_defaults returned every other commercial clause but not
--     the valuation structure, so the Service Bill form read it from
--     localStorage — which is why the floor-lead selector and the stage
--     dropdown only appeared on the browser that created the Work Order.
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
                                           WHERE work_order_id = p_work_order_id),
    -- New: the structure, and the stages themselves so the bill form does not
    -- need a second round trip.
    'valuation_structure',         COALESCE(v_t.valuation_structure, 'standard'),
    'lead_percent_per_floor',      COALESCE(v_t.lead_percent_per_floor, 0),
    'stages',                      COALESCE((
                                     SELECT jsonb_agg(jsonb_build_object(
                                              'id',      s.id,
                                              'name',    s.stage_name,
                                              'percent', s.stage_percent)
                                            ORDER BY s.sequence_no)
                                     FROM public.wo_payment_stages s
                                     WHERE s.work_order_id = p_work_order_id
                                   ), '[]'::jsonb)
  );
END $$;

COMMENT ON FUNCTION public.rpc_service_bill_defaults(uuid) IS
  'Commercial defaults a new bill inherits from its Work Order, including the valuation structure and payment stages. Retention is printed on all 149 source certificates but valued on 7 — it is a contract decision, not a per-bill entry.';

-- ----------------------------------------------------------------------------
-- 5. A STAGE-BILLED CONTRACT MUST HAVE STAGES
--
--    Declaring stage_percentage and issuing with no stages produced a contract
--    that reads as milestone-billed and behaves as lump sum — Stage 6 would
--    generate one claim per line and nobody would notice the milestones had
--    vanished.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_wo_valuation_ready()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_terms public.wo_commercial_terms;
  v_count integer;
  v_sum   numeric;
BEGIN
  IF public.wo_canonical_status(NEW.wo_status) NOT IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND public.wo_canonical_status(OLD.wo_status) IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_terms FROM public.fn_wo_terms(NEW.id);

  IF COALESCE(v_terms.valuation_structure, 'standard') <> 'stage_percentage' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(stage_percent), 0) INTO v_count, v_sum
  FROM public.wo_payment_stages WHERE work_order_id = NEW.id;

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'Work Order % is stage-billed but has no payment stages.',
      COALESCE(NEW.work_order_number, NEW.id::text)
      USING ERRCODE = 'check_violation',
            HINT = 'Add the milestone split, or set the valuation structure to Standard.';
  END IF;

  IF ABS(v_sum - 100) > 0.1 THEN
    RAISE EXCEPTION
      'Work Order % has payment stages summing to %, not 100.',
      COALESCE(NEW.work_order_number, NEW.id::text), ROUND(v_sum, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

-- Fires before Stage 6's generator, which is an AFTER trigger, so a Work Order
-- can never reach schedule-of-values generation in this state.
DROP TRIGGER IF EXISTS trg_wo_valuation_ready ON public.work_orders;
CREATE TRIGGER trg_wo_valuation_ready
  BEFORE UPDATE OF wo_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_wo_valuation_ready();

-- ----------------------------------------------------------------------------
-- 5b. STAGES EXIST ONLY ON A STAGE-BILLED CONTRACT
--
--     Stage 6's generator decides to build the line x stage matrix by asking
--     whether wo_payment_stages has rows. If a contract were switched from
--     stage_percentage to standard and its stages were left behind, that check
--     would still see them and decompose a contract that is no longer
--     stage-billed. Holding the invariant here keeps Stage 6 correct without
--     it having to know about valuation_structure.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_wo_terms_prune_stages()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.valuation_structure = 'stage_percentage' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.valuation_structure IS NOT DISTINCT FROM NEW.valuation_structure THEN
    RETURN NEW;
  END IF;

  SELECT public.wo_canonical_status(wo_status) INTO v_status
  FROM public.work_orders WHERE id = NEW.work_order_id;

  -- On a live contract the stages may already be referenced by generated lines
  -- or billable items; that is a variation, not a settings change.
  IF v_status IN ('issued', 'active')
     AND EXISTS (SELECT 1 FROM public.wo_payment_stages WHERE work_order_id = NEW.work_order_id) THEN
    RAISE EXCEPTION
      'This Work Order is live and stage-billed; its valuation structure cannot be changed.'
      USING ERRCODE = '42501',
            HINT = 'Raise a variation instead.';
  END IF;

  DELETE FROM public.wo_payment_stages WHERE work_order_id = NEW.work_order_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wo_terms_prune_stages ON public.wo_commercial_terms;
CREATE TRIGGER wo_terms_prune_stages
  AFTER INSERT OR UPDATE OF valuation_structure ON public.wo_commercial_terms
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_wo_terms_prune_stages();

-- ----------------------------------------------------------------------------
-- 6. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_seeded   integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='wo_commercial_terms'
                   AND column_name='valuation_structure') THEN
    v_problems := array_append(v_problems, 'wo_commercial_terms.valuation_structure missing');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='wo_templates'
                   AND column_name='default_valuation_structure') THEN
    v_problems := array_append(v_problems, 'wo_templates.default_valuation_structure missing');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='service_bill_lines'
                   AND column_name='floor_level') THEN
    v_problems := array_append(v_problems, 'service_bill_lines.floor_level missing');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_wo_valuation_ready' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_wo_valuation_ready not bound');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'wo_terms_prune_stages' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'wo_terms_prune_stages not bound');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Valuation persistence verification failed: %',
      array_to_string(v_problems, '; ');
  END IF;

  SELECT COUNT(*) INTO v_seeded FROM public.wo_templates
  WHERE default_valuation_structure = 'stage_percentage';

  RAISE NOTICE 'Valuation structure persisted. % template(s) seeded stage-wise.', v_seeded;
END $$;

-- The three CHECK constraints are the enforcement, so assert they exist and are
-- validated. A behavioural insert here would hit the work_order_id foreign key
-- first and "pass" for the wrong reason, which proves nothing.
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  c         text;
BEGIN
  FOREACH c IN ARRAY ARRAY['ck_wo_terms_valuation_structure',
                           'ck_wo_terms_lead_percent',
                           'ck_wo_terms_lead_requires_structure',
                           'ck_wo_templates_valuation_structure',
                           'ck_wo_templates_default_stages_array',
                           'ck_sb_lines_floor_level'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = c AND contype = 'c' AND convalidated
    ) THEN
      v_missing := array_append(v_missing, c);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Valuation constraints missing or not validated: %',
      array_to_string(v_missing, '; ');
  END IF;

  RAISE NOTICE 'Verified: all six valuation constraints exist and are validated.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
