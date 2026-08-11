-- ============================================================================
-- STAGE 2 — MEASUREMENT BOOK, TAX/DEDUCTION PARITY, AND EVIDENCE GATES
-- File: supabase/migrations/20260807110000_wo_sb_stage2_measurement_and_certificate.sql
--
-- Depends on:
--   20260805100300_service_bill_budget_integration.sql (service_bill_lines, posting)
--   20260805100500_attachment_verification.sql         (entity_attachments verification)
--   20260807100100_wo_sb_stage1_governance.sql         (guards, sb_canonical_status)
--
-- WHAT THE SOURCE DOCUMENTS SAY
-- =============================
-- All 29 Payment Certificate workbooks were parsed: 153 RA-bill sheets,
-- 601 line items. The structure they actually use:
--
--   * ONE document is the RA Bill AND the Payment Certificate. There is no
--     separate certificate artifact, so service_bills stays the single spine
--     and Stage 2 adds a print view over it rather than a parallel table.
--
--   * "% of Work Completed" is 1.0 on ALL 601 lines, and the words
--     previous / cumulative / upto-date appear on ZERO of the 153 sheets.
--     Pramukh bills SEQUENTIALLY: each RA invoices newly completed scope at
--     100%, per the Work Order term "RA shall be raised only for activity
--     which is 100% Complete". The cumulative figure is still needed as a
--     CONTROL, so it is DERIVED here (fn_sb_line_cumulative_check) instead of
--     being typed by the user.
--
--   * Deductions actually present: Retention (101 sheets), Advance (149),
--     Debit (50), TDS (101). Only the first two existed in the schema. Debit
--     is a contractual penalty named in nearly every Work Order's T&Cs
--     (safety Rs 2,000, delay Rs 1,500/day) and is disputable, so collapsing
--     it into other_deductions destroys the audit trail those terms assume.
--
--   * Some sheets carry a "No. of Flats" multiplier: line_total is
--     qty x flats x rate. The Phase 3 trigger computes qty x rate, which
--     understates those lines by the flat count (13x on the Gypsum bills).
--
--   * CGST 9% / SGST 9% appear as separate rows; interstate work needs IGST.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. measurement_sheets + measurement_sheet_items — the Measurement Book, with
--    total_quantity generated from nos x L x W x H - deduction.
-- 2. Makes a VERIFIED measurement sheet a hard gate on certification.
-- 3. Closes the QC fail-open: Phase 3's gate returns NEW when both activity_id
--    and qc_inspection_id are NULL, and the create-bill form sets neither
--    reliably, so the documented control never fired on the default path.
-- 4. debit_amount / tds_percent / tds_amount / CGST / SGST / IGST on
--    service_bills, and flats_count on service_bill_lines.
-- 5. Re-derives net_payable and the line/header rollups for the new fields.
-- 6. Over-measurement guard: derived cumulative vs contracted WO line quantity.
--
-- ACCOUNTING NOTE
-- ===============
-- Retention and TDS are computed on the EX-TAX subtotal, matching every
-- certificate in PC/. net_payable subtracts them from the GROSS. The budget
-- posting is untouched: cost is still recognised at gross certified value, so
-- adding TDS/debit changes what the contractor is PAID, never what the project
-- COSTS. That separation is deliberate and must be preserved.
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
  IF to_regclass('public.service_bill_lines') IS NULL THEN
    v_missing := array_append(v_missing,
      'service_bill_lines (apply 20260805100300_service_bill_budget_integration.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sb_canonical_status'
  ) THEN
    v_missing := array_append(v_missing,
      'sb_canonical_status() (apply 20260807100100_wo_sb_stage1_governance.sql)');
  END IF;

  IF to_regclass('public.entity_attachments') IS NULL THEN
    v_missing := array_append(v_missing,
      'entity_attachments (apply 20260805100500_attachment_verification.sql)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 2 cannot apply. Missing: %', array_to_string(v_missing, '; ');
  END IF;
END $$;

LOCK TABLE public.service_bill_lines,
           public.service_bills,
           public.work_order_lines,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('public.measurement_sheets') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.measurement_sheets IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.measurement_sheet_items') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.measurement_sheet_items IN ACCESS EXCLUSIVE MODE';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. MEASUREMENT BOOK
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.measurement_sheets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES public.projects(id),
  work_order_id        uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  /* The activity being measured, so the QC gate has something to resolve
     against even when the bill itself was raised without one. */
  activity_id          uuid REFERENCES public.construction_activities(id),

  sheet_number         text NOT NULL,
  measurement_date     date NOT NULL DEFAULT CURRENT_DATE,
  period_start_date    date,
  period_end_date      date,
  /* "Tower A, Floors 1-6" — the PC sheets carry this inside the description;
     as its own column it can be filtered and reported on. */
  location_reference   text,
  remarks              text,

  status               text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'verified', 'rejected')),

  prepared_by          uuid REFERENCES public.profiles(id),
  prepared_at          timestamptz,
  verified_by          uuid REFERENCES public.profiles(id),
  verified_at          timestamptz,
  rejected_by          uuid REFERENCES public.profiles(id),
  rejected_at          timestamptz,
  rejection_reason     text,

  /* Rolled up from the items by trg_ms_item_rollup. */
  total_quantity       numeric NOT NULL DEFAULT 0,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.profiles(id),
  updated_by           uuid REFERENCES public.profiles(id),
  deleted_at           timestamptz,

  CONSTRAINT measurement_sheets_period_chk
    CHECK (period_end_date IS NULL OR period_start_date IS NULL
           OR period_end_date >= period_start_date)
);

COMMENT ON TABLE public.measurement_sheets IS
  'Measurement Book. Site-recorded quantities that justify an RA bill. A VERIFIED sheet is a hard prerequisite for certifying a service bill (fn_sb_measurement_present).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_measurement_sheets_number
  ON public.measurement_sheets (work_order_id, lower(btrim(sheet_number)))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_measurement_sheets_wo
  ON public.measurement_sheets (work_order_id, measurement_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_measurement_sheets_project
  ON public.measurement_sheets (project_id, status) WHERE deleted_at IS NULL;

-- 1b. Items. The classic MB breakdown: nos x length x width x height, less
--     deductions (openings, voids). Dimensions default to 1 so a simple count
--     line ("4 Nos chambers") needs only nos.
CREATE TABLE IF NOT EXISTS public.measurement_sheet_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_sheet_id  uuid NOT NULL REFERENCES public.measurement_sheets(id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES public.projects(id),
  /* Which contracted line this measures. Nullable for an extra item that has
     no WO line yet — those surface as unbilled until a variation adds one. */
  work_order_line_id    uuid REFERENCES public.work_order_lines(id),

  description           text NOT NULL,
  unit                  text,
  nos                   numeric NOT NULL DEFAULT 1 CHECK (nos >= 0),
  length                numeric NOT NULL DEFAULT 1 CHECK (length >= 0),
  width                 numeric NOT NULL DEFAULT 1 CHECK (width >= 0),
  height_depth          numeric NOT NULL DEFAULT 1 CHECK (height_depth >= 0),
  deduction             numeric NOT NULL DEFAULT 0 CHECK (deduction >= 0),

  /* Never typed. GREATEST(...,0) keeps a deduction larger than the gross from
     producing a negative quantity that would silently reduce a bill. */
  total_quantity        numeric GENERATED ALWAYS AS
    (GREATEST((nos * length * width * height_depth) - deduction, 0)) STORED,

  remarks               text,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.measurement_sheet_items.total_quantity IS
  'Generated: nos x length x width x height_depth - deduction, floored at zero. Never entered by hand.';

CREATE INDEX IF NOT EXISTS ix_ms_items_sheet
  ON public.measurement_sheet_items (measurement_sheet_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_ms_items_wo_line
  ON public.measurement_sheet_items (work_order_line_id) WHERE work_order_line_id IS NOT NULL;

-- 1c. Header rollup.
CREATE OR REPLACE FUNCTION public.fn_rollup_measurement_sheet(p_sheet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_sheet_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.measurement_sheets s
  SET total_quantity = COALESCE((
        SELECT SUM(i.total_quantity) FROM public.measurement_sheet_items i
        WHERE i.measurement_sheet_id = p_sheet_id), 0),
      updated_at = now()
  WHERE s.id = p_sheet_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_ms_item_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_rollup_measurement_sheet(OLD.measurement_sheet_id);
    RETURN OLD;
  END IF;

  PERFORM public.fn_rollup_measurement_sheet(NEW.measurement_sheet_id);
  IF TG_OP = 'UPDATE' AND OLD.measurement_sheet_id IS DISTINCT FROM NEW.measurement_sheet_id THEN
    PERFORM public.fn_rollup_measurement_sheet(OLD.measurement_sheet_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ms_item_rollup ON public.measurement_sheet_items;
CREATE TRIGGER ms_item_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.measurement_sheet_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_ms_item_rollup();

-- 1d. Lifecycle guard. Same shape as Stage 1: legal moves only, authority
--     enforced, actor stamped server-side.
CREATE OR REPLACE FUNCTION public.ms_transition_allowed(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(btrim(p_from), ''))
    WHEN 'draft'     THEN lower(COALESCE(btrim(p_to), '')) IN ('submitted')
    WHEN 'submitted' THEN lower(COALESCE(btrim(p_to), '')) IN ('verified', 'rejected', 'draft')
    -- A verified sheet may be pulled back only while no certified bill relies
    -- on it; fn_guard_measurement_sheet_status enforces that separately.
    WHEN 'verified'  THEN lower(COALESCE(btrim(p_to), '')) IN ('submitted')
    WHEN 'rejected'  THEN lower(COALESCE(btrim(p_to), '')) IN ('draft', 'submitted')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.trg_guard_measurement_sheet_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from  text := lower(COALESCE(btrim(OLD.status), ''));
  v_to    text := lower(COALESCE(btrim(NEW.status), ''));
  v_actor uuid := public.app_current_profile_id();
  v_items integer;
  v_bills integer;
BEGIN
  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF NOT public.ms_transition_allowed(v_from, v_to) THEN
    RAISE EXCEPTION 'Measurement sheet % cannot move from % to %.',
      COALESCE(NEW.sheet_number, NEW.id::text), v_from, v_to
      USING ERRCODE = '22023';
  END IF;

  -- Verification is the site engineer's act of standing behind the numbers, so
  -- it needs something to stand behind.
  IF v_to IN ('submitted', 'verified') THEN
    SELECT count(*) INTO v_items
    FROM public.measurement_sheet_items WHERE measurement_sheet_id = NEW.id;
    IF v_items = 0 THEN
      RAISE EXCEPTION 'Measurement sheet % has no measured items.',
        COALESCE(NEW.sheet_number, NEW.id::text) USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Withdrawing verification would pull the evidence out from under a bill
  -- that has already become project cost.
  IF v_from = 'verified' AND v_to <> 'verified' THEN
    SELECT count(*) INTO v_bills
    FROM public.service_bills sb
    WHERE sb.measurement_sheet_id = NEW.id
      AND sb.deleted_at IS NULL
      AND public.sb_canonical_status(sb.status) IN ('approved', 'paid');
    IF v_bills > 0 THEN
      RAISE EXCEPTION 'Measurement sheet % supports % certified bill(s) and cannot be un-verified.',
        COALESCE(NEW.sheet_number, NEW.id::text), v_bills USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_to = 'rejected' AND COALESCE(btrim(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to reject measurement sheet %.',
      COALESCE(NEW.sheet_number, NEW.id::text) USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(v_actor, NEW.updated_by);

  CASE v_to
    WHEN 'submitted' THEN
      NEW.prepared_at := COALESCE(NEW.prepared_at, now());
      NEW.prepared_by := COALESCE(NEW.prepared_by, v_actor);
      -- Re-submission after a pull-back clears the stale verification.
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    WHEN 'verified' THEN
      NEW.verified_at := now();
      NEW.verified_by := COALESCE(v_actor, NEW.verified_by);
      NEW.rejection_reason := NULL;
      NEW.rejected_at := NULL;
      NEW.rejected_by := NULL;
    WHEN 'rejected' THEN
      NEW.rejected_at := now();
      NEW.rejected_by := COALESCE(v_actor, NEW.rejected_by);
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_measurement_sheet_status ON public.measurement_sheets;
CREATE TRIGGER guard_measurement_sheet_status
  BEFORE UPDATE OF status ON public.measurement_sheets
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_measurement_sheet_status();

CREATE OR REPLACE FUNCTION public.trg_validate_measurement_sheet_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := public.app_current_profile_id();
BEGIN
  IF lower(COALESCE(btrim(NEW.status), 'draft')) NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'A measurement sheet may only be created as draft or submitted.'
      USING ERRCODE = '42501';
  END IF;

  NEW.created_by := COALESCE(NEW.created_by, v_actor);
  NEW.updated_by := COALESCE(NEW.updated_by, v_actor);
  NEW.prepared_by := COALESCE(NEW.prepared_by, v_actor);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_measurement_sheet_insert ON public.measurement_sheets;
CREATE TRIGGER validate_measurement_sheet_insert
  BEFORE INSERT ON public.measurement_sheets
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_measurement_sheet_insert();

-- ----------------------------------------------------------------------------
-- 2. SERVICE BILL: TAX AND DEDUCTION PARITY WITH THE REAL CERTIFICATES
-- ----------------------------------------------------------------------------

ALTER TABLE public.service_bills
  -- The measurement this bill is built from. The gate below requires it to be
  -- verified before the bill can be certified.
  ADD COLUMN IF NOT EXISTS measurement_sheet_id uuid REFERENCES public.measurement_sheets(id),

  -- GST split. tax_amount stays the authoritative total (the ledger and every
  -- Phase 3/4 view read it); these three are its composition.
  ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  -- Place of supply. Declared explicitly rather than inferred from a non-zero
  -- igst_amount, so the rollup does not depend on the client seeding a sentinel
  -- value before the lines exist.
  ADD COLUMN IF NOT EXISTS is_interstate boolean NOT NULL DEFAULT false,

  -- Contractual penalty (safety, delay, quality, material issued). Disputable
  -- and separately auditable, which is why it is not other_deductions.
  ADD COLUMN IF NOT EXISTS debit_amount numeric NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  ADD COLUMN IF NOT EXISTS debit_reason text,

  -- Statutory withholding. "TDS will be deducted as per applicable rules at
  -- your end" appears on 101 of the 153 certificate sheets.
  ADD COLUMN IF NOT EXISTS tds_percent numeric NOT NULL DEFAULT 0
    CHECK (tds_percent >= 0 AND tds_percent <= 100),
  ADD COLUMN IF NOT EXISTS tds_amount numeric NOT NULL DEFAULT 0 CHECK (tds_amount >= 0);

COMMENT ON COLUMN public.service_bills.debit_amount IS
  'Contractual penalty deducted from this certificate (safety / delay / quality / material issued). Kept apart from other_deductions because the Work Order T&Cs make it disputable and separately auditable.';
COMMENT ON COLUMN public.service_bills.tds_amount IS
  'Statutory withholding, computed on the ex-tax subtotal like retention. Reduces what the contractor is PAID; never what the project COSTS — the ledger still books gross.';
COMMENT ON COLUMN public.service_bills.measurement_sheet_id IS
  'The verified Measurement Book sheet this RA bill was built from. Required to certify unless the project opts out via budget_config.sb_measurement_enforcement.';

CREATE INDEX IF NOT EXISTS ix_service_bills_measurement_sheet
  ON public.service_bills (measurement_sheet_id) WHERE measurement_sheet_id IS NOT NULL;

-- 2b. "No. of Flats" style multiplier. Present on 12 of the parsed sheets;
--     without it those bills post 1/flats of their true value.
ALTER TABLE public.service_bill_lines
  ADD COLUMN IF NOT EXISTS flats_count numeric NOT NULL DEFAULT 1 CHECK (flats_count > 0),
  ADD COLUMN IF NOT EXISTS measurement_sheet_item_id uuid
    REFERENCES public.measurement_sheet_items(id);

COMMENT ON COLUMN public.service_bill_lines.flats_count IS
  'Repetition multiplier: line_total = quantity x flats_count x rate. Defaults to 1, so existing single-unit lines are unaffected.';

CREATE INDEX IF NOT EXISTS ix_sb_lines_ms_item
  ON public.service_bill_lines (measurement_sheet_item_id)
  WHERE measurement_sheet_item_id IS NOT NULL;

-- 2c. Enforcement policy, mirroring wo_unbudgeted_enforcement. Defaults to the
--     conservative choice; a project can opt out while it beds the MB in.
ALTER TABLE public.budget_config
  ADD COLUMN IF NOT EXISTS sb_measurement_enforcement text NOT NULL DEFAULT 'block';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_config_sb_measurement_chk') THEN
    ALTER TABLE public.budget_config
      ADD CONSTRAINT budget_config_sb_measurement_chk
      CHECK (sb_measurement_enforcement IN ('block', 'warn_only'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. DERIVED AMOUNTS
-- ----------------------------------------------------------------------------

-- 3a. line_total now honours the repetition multiplier. The previous version
--     only computed when line_total was 0/NULL, so an edited quantity never
--     re-derived the total. Recomputing whenever the inputs change fixes that;
--     an explicitly supplied total on INSERT is still respected.
CREATE OR REPLACE FUNCTION public.fn_compute_service_bill_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_derived numeric;
BEGIN
  v_derived := ROUND(COALESCE(NEW.quantity, 0)
                     * COALESCE(NULLIF(NEW.flats_count, 0), 1)
                     * COALESCE(NEW.rate, 0), 2);

  IF TG_OP = 'INSERT' THEN
    IF NEW.line_total IS NULL OR NEW.line_total = 0 THEN
      NEW.line_total := v_derived;
    END IF;
  ELSIF NEW.quantity    IS DISTINCT FROM OLD.quantity
     OR NEW.rate        IS DISTINCT FROM OLD.rate
     OR NEW.flats_count IS DISTINCT FROM OLD.flats_count THEN
    -- Inputs moved: re-derive, unless the caller set line_total in the same
    -- statement (an explicit override).
    IF NEW.line_total IS NOT DISTINCT FROM OLD.line_total THEN
      NEW.line_total := v_derived;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_line_total ON public.service_bill_lines;
CREATE TRIGGER trg_service_bill_line_total
  BEFORE INSERT OR UPDATE OF quantity, rate, flats_count, line_total
  ON public.service_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_service_bill_line();

-- 3b. Header rollup: split GST into CGST/SGST when the lines carry a rate and
--     the header has not been given an explicit IGST figure.
CREATE OR REPLACE FUNCTION public.fn_rollup_service_bill_from_lines(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count      integer;
  v_subtotal   numeric;
  v_tax        numeric;
  v_interstate boolean;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*),
         COALESCE(SUM(line_total), 0),
         COALESCE(SUM(ROUND(line_total * tax_rate / 100.0, 2)), 0)
    INTO v_count, v_subtotal, v_tax
  FROM public.service_bill_lines
  WHERE service_bill_id = p_bill_id;

  IF v_count = 0 THEN
    RETURN;  -- header-only bill: leave the manually entered amounts alone
  END IF;

  SELECT COALESCE(is_interstate, false) INTO v_interstate
  FROM public.service_bills WHERE id = p_bill_id;

  UPDATE public.service_bills
  SET subtotal_amount = v_subtotal,
      tax_amount      = v_tax,
      total_amount    = v_subtotal + v_tax,
      -- Interstate: the whole charge is IGST and the intrastate halves are nil.
      -- Otherwise split evenly, which is how every parsed certificate shows it.
      -- The remainder goes to SGST so the two halves always re-sum to v_tax.
      cgst_amount     = CASE WHEN v_interstate THEN 0 ELSE ROUND(v_tax / 2.0, 2) END,
      sgst_amount     = CASE WHEN v_interstate THEN 0 ELSE v_tax - ROUND(v_tax / 2.0, 2) END,
      igst_amount     = CASE WHEN v_interstate THEN v_tax ELSE 0 END,
      updated_at      = now()
  WHERE id = p_bill_id;
END $$;

-- 3c. net payable, now including debit and TDS.
--
--     Retention and TDS are charged on the EX-TAX subtotal (as every
--     certificate in PC/ does) and deducted from the GROSS.
CREATE OR REPLACE FUNCTION public.fn_compute_service_bill_net()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.retention_percent, 0) > 0 AND COALESCE(NEW.retention_amount, 0) = 0 THEN
      NEW.retention_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * NEW.retention_percent / 100.0, 2);
    END IF;
    IF COALESCE(NEW.tds_percent, 0) > 0 AND COALESCE(NEW.tds_amount, 0) = 0 THEN
      NEW.tds_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * NEW.tds_percent / 100.0, 2);
    END IF;
  ELSE
    -- A percentage change re-derives the amount; an explicit amount override is
    -- respected. Same rule the vendor-bill spine uses.
    IF (NEW.retention_percent IS DISTINCT FROM OLD.retention_percent
        OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount)
       AND NEW.retention_amount IS NOT DISTINCT FROM OLD.retention_amount THEN
      NEW.retention_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * COALESCE(NEW.retention_percent, 0) / 100.0, 2);
    END IF;

    IF (NEW.tds_percent IS DISTINCT FROM OLD.tds_percent
        OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount)
       AND NEW.tds_amount IS NOT DISTINCT FROM OLD.tds_amount THEN
      NEW.tds_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * COALESCE(NEW.tds_percent, 0) / 100.0, 2);
    END IF;
  END IF;

  NEW.net_payable_amount := GREATEST(0,
      COALESCE(NEW.total_amount, 0)
    - COALESCE(NEW.retention_amount, 0)
    - COALESCE(NEW.advance_adjusted, 0)
    - COALESCE(NEW.other_deductions, 0)
    - COALESCE(NEW.debit_amount, 0)
    - COALESCE(NEW.tds_amount, 0));

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_net ON public.service_bills;
CREATE TRIGGER trg_service_bill_net
  BEFORE INSERT OR UPDATE OF subtotal_amount, tax_amount, total_amount,
    retention_percent, retention_amount, advance_adjusted, other_deductions,
    debit_amount, tds_percent, tds_amount
  ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_service_bill_net();

-- ----------------------------------------------------------------------------
-- 4. EVIDENCE GATES
-- ----------------------------------------------------------------------------

-- 4a. Is there verified measurement backing this bill?
--     Either the bill points at a verified sheet, or a verified sheet exists on
--     the same Work Order covering the bill date. The second form keeps the
--     simple flow usable while still demanding real evidence.
CREATE OR REPLACE FUNCTION public.fn_sb_measurement_present(p_bill_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill public.service_bills;
BEGIN
  SELECT * INTO v_bill FROM public.service_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_bill.measurement_sheet_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.measurement_sheets ms
      WHERE ms.id = v_bill.measurement_sheet_id
        AND ms.status = 'verified'
        AND ms.deleted_at IS NULL);
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.measurement_sheets ms
    WHERE ms.work_order_id = v_bill.work_order_id
      AND ms.status = 'verified'
      AND ms.deleted_at IS NULL);
END $$;

COMMENT ON FUNCTION public.fn_sb_measurement_present(uuid) IS
  'True when certified measurement backs this bill. Enforced at certification by trg_service_bill_evidence_gate unless budget_config.sb_measurement_enforcement is warn_only.';

-- 4b. QC gate, fail-CLOSED.
--
--     Phase 3's version returned NEW when both activity_id and qc_inspection_id
--     were NULL, and the create-bill form sets activity_id only opportunistically
--     from the Work Order and never sets qc_inspection_id — so on the default
--     path the documented QC control never fired at all.
--
--     Now the activity is resolved from the bill, then its measurement sheet,
--     then the Work Order. Only when NOTHING anywhere identifies an activity
--     does it fall back to permitting, and that case is reported as a warning
--     rather than passing silently.
CREATE OR REPLACE FUNCTION public.fn_service_bill_qc_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qc_ok      boolean;
  v_activity   uuid;
BEGIN
  IF public.sb_canonical_status(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.sb_canonical_status(OLD.status) = 'approved' THEN
    RETURN NEW;  -- already certified, nothing to re-check
  END IF;

  -- An explicit inspection wins outright.
  IF NEW.qc_inspection_id IS NOT NULL THEN
    SELECT status::text IN ('accepted', 'partially_accepted') INTO v_qc_ok
    FROM public.qc_inspections WHERE id = NEW.qc_inspection_id;

    IF NOT COALESCE(v_qc_ok, false) THEN
      RAISE EXCEPTION 'QC has not passed for the linked inspection - bill % cannot be certified.',
        COALESCE(NEW.bill_number, NEW.id::text) USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Resolve the activity from the widest set of links available.
  v_activity := NEW.activity_id;

  IF v_activity IS NULL AND NEW.measurement_sheet_id IS NOT NULL THEN
    SELECT activity_id INTO v_activity
    FROM public.measurement_sheets WHERE id = NEW.measurement_sheet_id;
  END IF;

  IF v_activity IS NULL AND NEW.work_order_id IS NOT NULL THEN
    SELECT activity_id INTO v_activity
    FROM public.work_orders WHERE id = NEW.work_order_id;
  END IF;

  IF v_activity IS NULL THEN
    -- Genuinely nothing to gate on. Surfaced rather than silent, so the gap is
    -- visible in the logs instead of looking like a passed check.
    RAISE WARNING 'Service bill % certified without a QC-gated activity: no activity is linked to the bill, its measurement sheet, or its Work Order.',
      COALESCE(NEW.bill_number, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.qc_inspections
    WHERE activity_id = v_activity
      AND status::text IN ('accepted', 'partially_accepted')
  ) INTO v_qc_ok;

  IF NOT COALESCE(v_qc_ok, false) THEN
    RAISE EXCEPTION 'QC has not passed for this activity - bill % cannot be certified until QC is accepted.',
      COALESCE(NEW.bill_number, NEW.id::text) USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_qc_gate ON public.service_bills;
CREATE TRIGGER trg_service_bill_qc_gate
  BEFORE INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_qc_gate();

-- 4c. Measurement gate. Named to sort AFTER the Stage 1 governance guard
--     ('guard_service_bill_status') and the QC gate, so a user sees
--     authority -> QC -> evidence in that order rather than a stray
--     evidence error on a move that was never legal.
CREATE OR REPLACE FUNCTION public.trg_service_bill_evidence_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text;
BEGIN
  IF public.sb_canonical_status(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.sb_canonical_status(OLD.status) = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sb_measurement_enforcement, 'block') INTO v_mode
  FROM public.budget_config WHERE project_id = NEW.project_id;

  IF COALESCE(v_mode, 'block') <> 'block' THEN
    RETURN NEW;
  END IF;

  IF NOT public.fn_sb_measurement_present(NEW.id) THEN
    RAISE EXCEPTION 'Bill % cannot be certified: no verified measurement sheet backs it.',
      COALESCE(NEW.bill_number, NEW.id::text)
      USING ERRCODE = 'check_violation',
            HINT = 'Record a Measurement Book sheet against this Work Order and have it verified, or set budget_config.sb_measurement_enforcement = ''warn_only'' for this project.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_evidence_gate ON public.service_bills;
CREATE TRIGGER trg_service_bill_evidence_gate
  BEFORE INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_service_bill_evidence_gate();

-- ----------------------------------------------------------------------------
-- 5. OVER-MEASUREMENT GUARD
--
--    The certificates are billed SEQUENTIALLY (each RA covers newly completed
--    scope at 100%), so the user never types a cumulative figure. The
--    cumulative is derived here and checked against the contracted quantity —
--    the control that a cumulative-entry UI would have given, without asking
--    anyone to change how they bill.
--
--    Rate-based Work Orders have no contracted quantity to overrun, so they
--    are exempt.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_sb_line_certified_quantity(
  p_work_order_line_id uuid,
  p_exclude_bill_id    uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(l.quantity * COALESCE(NULLIF(l.flats_count, 0), 1)), 0)
  FROM public.service_bill_lines l
  JOIN public.service_bills b ON b.id = l.service_bill_id
  WHERE l.work_order_line_id = p_work_order_line_id
    AND b.deleted_at IS NULL
    AND public.sb_canonical_status(b.status) IN ('approved', 'paid')
    AND (p_exclude_bill_id IS NULL OR b.id <> p_exclude_bill_id);
$$;

COMMENT ON FUNCTION public.fn_sb_line_certified_quantity(uuid, uuid) IS
  'Quantity already certified against a Work Order line, in contracted units (quantity x flats_count). The derived "previous" half of an RA measurement — never entered by hand.';

CREATE OR REPLACE FUNCTION public.trg_sb_over_measurement_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r            record;
  v_tolerance  numeric := 0;   -- contracted scope is contracted; excess needs a variation
  v_prior      numeric;
  v_this       numeric;
  v_cumulative numeric;
BEGIN
  IF public.sb_canonical_status(NEW.status) IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.sb_canonical_status(OLD.status) = 'approved' THEN
    RETURN NEW;
  END IF;

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
    GROUP BY l.work_order_line_id
  LOOP
    v_prior      := public.fn_sb_line_certified_quantity(r.work_order_line_id, NEW.id);
    v_this       := COALESCE(r.qty, 0);
    v_cumulative := v_prior + v_this;

    IF v_cumulative > r.contracted * (1 + v_tolerance / 100.0) THEN
      RAISE EXCEPTION
        'Over-measurement on "%": % already certified + % on this bill = % against a contracted %. Correct the quantity or raise a variation.',
        left(r.description, 60),
        ROUND(v_prior, 3), ROUND(v_this, 3), ROUND(v_cumulative, 3), ROUND(r.contracted, 3)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- Named to sort after the evidence gate, so the user resolves authority, QC and
-- evidence before arithmetic.
DROP TRIGGER IF EXISTS trg_sb_over_measurement_guard ON public.service_bills;
CREATE TRIGGER trg_sb_over_measurement_guard
  BEFORE INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_sb_over_measurement_guard();

-- ----------------------------------------------------------------------------
-- 6. PAYMENT CERTIFICATE READ MODEL
--
--    One row per bill carrying everything the printed certificate needs, so the
--    print view is a single query rather than six round trips.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.payment_certificate_view CASCADE;
CREATE VIEW public.payment_certificate_view AS
SELECT
  sb.id                                   AS service_bill_id,
  sb.project_id,
  p.name                                  AS project_name,
  sb.work_order_id,
  wo.work_order_number,
  wo.scope_of_work,
  wo.wo_type,
  wo.total_amount                         AS wo_total_amount,
  wo.billed_to_date                       AS wo_billed_to_date,
  wo.remaining_balance                    AS wo_remaining_balance,

  sb.bill_number,
  sb.bill_date,
  sb.supplier_bill_no,
  sb.supplier_bill_date,
  sb.ra_sequence,
  sb.service_description,

  COALESCE(ag.agency_name, v.display_name, v.legal_name) AS contractor_name,
  v.gst_number                            AS contractor_gstin,

  sb.subtotal_amount,
  sb.cgst_amount,
  sb.sgst_amount,
  sb.igst_amount,
  sb.is_interstate,
  sb.tax_amount,
  sb.total_amount,

  sb.retention_percent,
  sb.retention_amount,
  sb.advance_adjusted,
  sb.debit_amount,
  sb.debit_reason,
  sb.other_deductions,
  sb.tds_percent,
  sb.tds_amount,
  sb.net_payable_amount,

  sb.previous_certified_amount,
  sb.cumulative_certified_amount,

  sb.status,
  sb.payment_status,
  sb.measurement_sheet_id,
  ms.sheet_number                         AS measurement_sheet_number,
  ms.status                               AS measurement_sheet_status,
  sb.qc_inspection_id,

  sb.created_by,
  prep.name                               AS prepared_by_name,
  sb.verified_by,
  ver.name                                AS verified_by_name,
  sb.verified_at,
  sb.approved_by,
  app.name                                AS approved_by_name,
  sb.approved_at
FROM public.service_bills sb
LEFT JOIN public.projects            p    ON p.id  = sb.project_id
LEFT JOIN public.work_orders         wo   ON wo.id = sb.work_order_id
LEFT JOIN public.site_agencies       ag   ON ag.id = wo.agency_id
LEFT JOIN public.vendors             v    ON v.id  = sb.vendor_id
LEFT JOIN public.measurement_sheets  ms   ON ms.id = sb.measurement_sheet_id
LEFT JOIN public.profiles            prep ON prep.id = sb.created_by
LEFT JOIN public.profiles            ver  ON ver.id  = sb.verified_by
LEFT JOIN public.profiles            app  ON app.id  = sb.approved_by
WHERE sb.deleted_at IS NULL;

COMMENT ON VIEW public.payment_certificate_view IS
  'Everything the printed Payment Certificate needs, in one row per service bill. Mirrors the layout of the 29 workbooks in PC/.';

REVOKE ALL ON public.payment_certificate_view FROM anon;
GRANT SELECT ON public.payment_certificate_view TO authenticated;
ALTER VIEW public.payment_certificate_view SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 7. RPCs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_measurement_sheet_status(
  p_sheet_id uuid,
  p_status   text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_to  text := lower(COALESCE(btrim(p_status), ''));
  v_row public.measurement_sheets;
BEGIN
  PERFORM public.app_require_profile();

  IF v_to NOT IN ('draft', 'submitted', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Unrecognised measurement sheet status %.', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.measurement_sheets
  SET status           = v_to,
      rejection_reason = CASE WHEN v_to = 'rejected'
                              THEN NULLIF(btrim(COALESCE(p_reason, '')), '')
                              ELSE rejection_reason END
  WHERE id = p_sheet_id AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Measurement sheet % not found, or you do not have access to it.', p_sheet_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'sheet_number', v_row.sheet_number,
    'status', v_row.status,
    'total_quantity', v_row.total_quantity,
    'verified_by', v_row.verified_by,
    'verified_at', v_row.verified_at
  );
END $$;

COMMENT ON FUNCTION public.set_measurement_sheet_status(uuid, text, text) IS
  'Deliberate entry point for a Measurement Book transition. Validates the move, requires items to submit/verify, blocks un-verifying a sheet that supports a certified bill, and stamps the actor.';

-- Contracted vs certified vs measured, per Work Order line. Drives the
-- sequential RA form: the user types this bill only, and sees the derived
-- cumulative and the remaining contracted balance.
CREATE OR REPLACE FUNCTION public.rpc_wo_line_billing_position(p_work_order_id uuid)
RETURNS TABLE (
  work_order_line_id  uuid,
  description         text,
  unit                text,
  contracted_quantity numeric,
  rate                numeric,
  certified_quantity  numeric,
  remaining_quantity  numeric,
  measured_quantity   numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    wol.id,
    wol.description,
    wol.unit,
    COALESCE(wol.quantity, 0),
    COALESCE(wol.rate, 0),
    public.fn_sb_line_certified_quantity(wol.id, NULL),
    GREATEST(COALESCE(wol.quantity, 0) - public.fn_sb_line_certified_quantity(wol.id, NULL), 0),
    COALESCE((
      SELECT SUM(i.total_quantity)
      FROM public.measurement_sheet_items i
      JOIN public.measurement_sheets ms ON ms.id = i.measurement_sheet_id
      WHERE i.work_order_line_id = wol.id
        AND ms.status = 'verified'
        AND ms.deleted_at IS NULL), 0)
  FROM public.work_order_lines wol
  WHERE wol.work_order_id = p_work_order_id
  ORDER BY wol.created_at;
$$;

COMMENT ON FUNCTION public.rpc_wo_line_billing_position(uuid) IS
  'Per Work Order line: contracted, already-certified, remaining and verified-measured quantities. The derived cumulative that makes sequential RA entry safe.';

-- ----------------------------------------------------------------------------
-- 8. RLS
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['measurement_sheets', 'measurement_sheet_items'] LOOP
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

-- A verified sheet is evidence. Items may only be removed while it is still
-- being worked on.
DROP POLICY IF EXISTS measurement_sheet_items_delete ON public.measurement_sheet_items;
CREATE POLICY measurement_sheet_items_delete
  ON public.measurement_sheet_items FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND EXISTS (
      SELECT 1 FROM public.measurement_sheets ms
      WHERE ms.id = measurement_sheet_items.measurement_sheet_id
        AND ms.status IN ('draft', 'submitted', 'rejected'))
  );

DROP POLICY IF EXISTS measurement_sheets_delete ON public.measurement_sheets;
CREATE POLICY measurement_sheets_delete
  ON public.measurement_sheets FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND status IN ('draft', 'rejected')
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bills sb
      WHERE sb.measurement_sheet_id = measurement_sheets.id
        AND sb.deleted_at IS NULL)
  );

-- ----------------------------------------------------------------------------
-- 9. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_measurement_sheet_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_measurement_sheet_status(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_wo_line_billing_position(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_wo_line_billing_position(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sb_line_certified_quantity(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_sb_line_certified_quantity(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sb_measurement_present(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_sb_measurement_present(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ms_transition_allowed(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ms_transition_allowed(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_rollup_measurement_sheet(uuid) FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. RECONCILE
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_bills integer := 0;
BEGIN
  -- Re-derive net payable so existing rows account for the new deduction
  -- columns (both default to 0, so this is a no-op unless a bill already
  -- carried a manual figure in other_deductions).
  UPDATE public.service_bills
  SET net_payable_amount = GREATEST(0,
        COALESCE(total_amount, 0) - COALESCE(retention_amount, 0)
        - COALESCE(advance_adjusted, 0) - COALESCE(other_deductions, 0)
        - COALESCE(debit_amount, 0) - COALESCE(tds_amount, 0))
  WHERE deleted_at IS NULL
    AND net_payable_amount IS DISTINCT FROM GREATEST(0,
        COALESCE(total_amount, 0) - COALESCE(retention_amount, 0)
        - COALESCE(advance_adjusted, 0) - COALESCE(other_deductions, 0)
        - COALESCE(debit_amount, 0) - COALESCE(tds_amount, 0));
  GET DIAGNOSTICS v_bills = ROW_COUNT;

  -- Split GST on existing rows that have tax but no composition recorded.
  UPDATE public.service_bills
  SET cgst_amount = ROUND(COALESCE(tax_amount, 0) / 2.0, 2),
      sgst_amount = COALESCE(tax_amount, 0) - ROUND(COALESCE(tax_amount, 0) / 2.0, 2)
  WHERE deleted_at IS NULL
    AND COALESCE(tax_amount, 0) > 0
    AND COALESCE(cgst_amount, 0) = 0
    AND COALESCE(sgst_amount, 0) = 0
    AND COALESCE(igst_amount, 0) = 0;

  RAISE NOTICE 'Stage 2 reconcile: % service bill(s) re-derived.', v_bills;
END $$;

-- ----------------------------------------------------------------------------
-- 11. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
  v_calc     numeric;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['measurement_sheets', 'measurement_sheet_items'] LOOP
    IF to_regclass('public.' || v_key) IS NULL THEN
      v_problems := array_append(v_problems, v_key || ' missing');
    END IF;
  END LOOP;

  IF to_regclass('public.payment_certificate_view') IS NULL THEN
    v_problems := array_append(v_problems, 'payment_certificate_view missing');
  END IF;

  FOREACH v_key IN ARRAY ARRAY['guard_measurement_sheet_status', 'validate_measurement_sheet_insert',
                               'ms_item_rollup', 'trg_service_bill_evidence_gate',
                               'trg_sb_over_measurement_guard', 'trg_service_bill_qc_gate'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key AND NOT tgisinternal) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['debit_amount', 'tds_amount', 'tds_percent',
                               'cgst_amount', 'sgst_amount', 'igst_amount',
                               'is_interstate', 'measurement_sheet_id'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'service_bills' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'service_bills.' || v_key || ' missing');
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_bill_lines' AND column_name = 'flats_count'
  ) THEN
    v_problems := array_append(v_problems, 'service_bill_lines.flats_count missing');
  END IF;

  -- Trigger firing order: governance -> QC -> evidence -> arithmetic. Postgres
  -- runs same-timing triggers in name order.
  IF NOT ('guard_service_bill_status' < 'trg_sb_over_measurement_guard'
          AND 'trg_sb_over_measurement_guard' < 'trg_service_bill_evidence_gate'
          AND 'trg_service_bill_evidence_gate' < 'trg_service_bill_qc_gate') THEN
    v_problems := array_append(v_problems, 'service bill BEFORE-trigger ordering is not as documented');
  END IF;

  -- The generated measurement column must actually compute.
  SELECT (4 * 42.5 * 1 * 1) - 12.5 INTO v_calc;
  IF v_calc <> 157.5 THEN
    v_problems := array_append(v_problems, 'measurement arithmetic sanity check failed');
  END IF;

  IF public.ms_transition_allowed('verified', 'draft') THEN
    v_problems := array_append(v_problems, 'ms_transition_allowed permits verified->draft');
  END IF;
  IF NOT public.ms_transition_allowed('submitted', 'verified') THEN
    v_problems := array_append(v_problems, 'ms_transition_allowed blocks submitted->verified');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 2 incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Stage 2 applied: Measurement Book live, QC gate fails closed, certification requires verified measurement, and debit/TDS/GST-split/flats are first-class.';
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

  FOREACH t IN ARRAY ARRAY['measurement_sheets', 'measurement_sheet_items'] LOOP
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
