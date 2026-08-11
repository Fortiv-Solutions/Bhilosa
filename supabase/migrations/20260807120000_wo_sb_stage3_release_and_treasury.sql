-- ============================================================================
-- STAGE 3 — RELEASE AUTHORISATION, TREASURY GUARDS, AND THE FIVE-METRIC MODEL
-- File: supabase/migrations/20260807120000_wo_sb_stage3_release_and_treasury.sql
--
-- Depends on:
--   20260805100300_service_bill_budget_integration.sql (payments.service_bill_id)
--   20260805100400_bill_ledger_union_mv.sql            (retention_releases)
--   20260807100100_wo_sb_stage1_governance.sql         (guards, sb_canonical_status)
--   20260807110000_wo_sb_stage2_measurement_and_certificate.sql (MB, PC view)
--
-- THE REQUIREMENT
-- ===============
-- "A Work Order may have a total value of Rs 1 Crore. However, the company may
--  decide to release only Rs 10 Lakhs initially. The released/paid amount
--  should be clearly tracked and visible somewhere in the system."
--
-- That sentence conflates FIVE distinct quantities which a production ERP must
-- keep strictly apart:
--
--   1. Contract Value    Rs 1,00,00,000  work_orders.total_amount        (exists)
--   2. Certified Gross   Rs   25,00,000  billed_to_date                  (exists)
--   3. Approved Net      Rs   22,50,000  SUM(net_payable_amount)         (derivable)
--   4. Authorised        Rs   10,00,000  work_order_releases             (NEW)
--   5. Cash Paid         Rs   10,00,000  SUM(payments)                   (exists, no cap)
--
-- THE ACCOUNTING RULE THIS MIGRATION PROTECTS
-- ===========================================
-- A release caps PAYMENT. It never caps CERTIFICATION.
--
-- If the site engineer certifies Rs 25 L and treasury releases Rs 10 L, the
-- budget must recognise Rs 25 L of cost immediately — the work exists and the
-- liability exists. Capping cost to match cash would understate the project and
-- corrupt the variance sheet. Only the disbursement is throttled.
--
-- Nothing in this migration touches budget_ledger. Certification remains the
-- sole cost-recognition event, exactly as Phase 3 defined it.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. work_order_releases — a numbered, approved treasury authorisation that
--    caps cumulative payment against a Work Order.
-- 2. Payment guards: cannot pay an uncertified bill, cannot overpay a bill's
--    net payable, cannot exceed the Work Order's authorised release.
-- 3. Payment actor/audit columns and a lifecycle guard, matching Stages 1-2.
-- 4. work_order_financial_position — the five metrics in one row.
-- 5. RPCs for recording a payment and a retention release safely.
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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'service_bill_id'
  ) THEN
    v_missing := array_append(v_missing,
      'payments.service_bill_id (apply 20260805100300_service_bill_budget_integration.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sb_canonical_status'
  ) THEN
    v_missing := array_append(v_missing,
      'sb_canonical_status() (apply 20260807100100_wo_sb_stage1_governance.sql)');
  END IF;

  IF to_regclass('public.retention_releases') IS NULL THEN
    v_missing := array_append(v_missing,
      'retention_releases (apply 20260805100400_bill_ledger_union_mv.sql)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 3 cannot apply. Missing: %', array_to_string(v_missing, '; ');
  END IF;
END $$;

LOCK TABLE public.payments,
           public.retention_releases,
           public.service_bills,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('public.work_order_releases') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.work_order_releases IN ACCESS EXCLUSIVE MODE';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. RELEASE AUTHORISATION
--
--    "Release Rs 10 L of the Rs 1 Cr contract." A numbered, approved decision
--    by management that caps how much cash may flow against the Work Order.
--    Deliberately NOT tied to one bill: the client's example authorises against
--    the CONTRACT, and a single release may cover several RA bills.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_order_releases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id),
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,

  release_number  text NOT NULL,
  release_date    date NOT NULL DEFAULT CURRENT_DATE,
  /* The ceiling this authorisation adds. Cumulative across approved releases. */
  amount          numeric NOT NULL CHECK (amount > 0),
  reason          text,

  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'cancelled')),

  approved_by     uuid REFERENCES public.profiles(id),
  approved_at     timestamptz,
  cancelled_by    uuid REFERENCES public.profiles(id),
  cancelled_at    timestamptz,
  cancellation_reason text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.work_order_releases IS
  'Treasury authorisation capping cumulative PAYMENT against a Work Order. Never caps certification: certified work is project cost the moment it is certified, whatever cash policy applies.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_order_releases_number
  ON public.work_order_releases (project_id, lower(btrim(release_number)));
CREATE INDEX IF NOT EXISTS ix_work_order_releases_wo
  ON public.work_order_releases (work_order_id, status);

-- 1b. Cumulative authorised cash for a Work Order.
CREATE OR REPLACE FUNCTION public.fn_wo_authorised_release(p_work_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.work_order_releases
  WHERE work_order_id = p_work_order_id
    AND status = 'approved';
$$;

-- 1c. Cash actually paid against a Work Order, across all its bills.
CREATE OR REPLACE FUNCTION public.fn_wo_paid_to_date(p_work_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(p.amount), 0)
  FROM public.payments p
  JOIN public.service_bills sb ON sb.id = p.service_bill_id
  WHERE sb.work_order_id = p_work_order_id
    AND sb.deleted_at IS NULL
    AND p.status = 'paid'::erp_payment_status;
$$;

COMMENT ON FUNCTION public.fn_wo_paid_to_date(uuid) IS
  'Cash disbursed against a Work Order, summed across its service bills. Distinct from billed_to_date (certified cost) and from net payable (approved liability).';

-- 1d. Lifecycle guard, same shape as Stages 1-2.
CREATE OR REPLACE FUNCTION public.trg_guard_wo_release_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from  text := lower(COALESCE(btrim(OLD.status), ''));
  v_to    text := lower(COALESCE(btrim(NEW.status), ''));
  v_actor uuid := public.app_current_profile_id();
  v_paid  numeric;
  v_other numeric;
BEGIN
  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  -- draft -> approved | cancelled; approved -> cancelled. Nothing else.
  IF NOT ((v_from = 'draft'    AND v_to IN ('approved', 'cancelled'))
       OR (v_from = 'approved' AND v_to = 'cancelled')) THEN
    RAISE EXCEPTION 'Release % cannot move from % to %.',
      COALESCE(NEW.release_number, NEW.id::text), v_from, v_to
      USING ERRCODE = '22023';
  END IF;

  IF v_to IN ('approved', 'cancelled') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may % a payment release.',
      CASE WHEN v_to = 'approved' THEN 'approve' ELSE 'cancel' END
      USING ERRCODE = '42501';
  END IF;

  IF v_to = 'cancelled' THEN
    IF COALESCE(btrim(NEW.cancellation_reason), '') = '' THEN
      RAISE EXCEPTION 'A reason is required to cancel release %.',
        COALESCE(NEW.release_number, NEW.id::text) USING ERRCODE = '22023';
    END IF;

    -- Withdrawing authorisation that cash has already been paid against would
    -- leave the Work Order retrospectively over-disbursed.
    IF v_from = 'approved' THEN
      v_paid  := public.fn_wo_paid_to_date(NEW.work_order_id);
      v_other := public.fn_wo_authorised_release(NEW.work_order_id) - NEW.amount;
      IF v_paid > v_other THEN
        RAISE EXCEPTION
          'Release % cannot be cancelled: % already paid against this Work Order exceeds the % that would remain authorised.',
          COALESCE(NEW.release_number, NEW.id::text),
          to_char(v_paid, 'FM99,99,99,999.00'), to_char(v_other, 'FM99,99,99,999.00')
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(v_actor, NEW.updated_by);

  IF v_to = 'approved' THEN
    NEW.approved_at := now();
    NEW.approved_by := COALESCE(v_actor, NEW.approved_by);
  ELSIF v_to = 'cancelled' THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := COALESCE(v_actor, NEW.cancelled_by);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_wo_release_status ON public.work_order_releases;
CREATE TRIGGER guard_wo_release_status
  BEFORE UPDATE OF status ON public.work_order_releases
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_wo_release_status();

CREATE OR REPLACE FUNCTION public.trg_validate_wo_release_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  uuid := public.app_current_profile_id();
  v_status text;
BEGIN
  IF lower(COALESCE(btrim(NEW.status), 'draft')) NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'A release may only be created as draft or approved.'
      USING ERRCODE = '42501';
  END IF;

  IF lower(COALESCE(btrim(NEW.status), 'draft')) = 'approved' THEN
    IF NOT public.app_can_approve() THEN
      RAISE EXCEPTION 'Only management or a project manager may approve a payment release.'
        USING ERRCODE = '42501';
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, v_actor);
  END IF;

  -- Releasing against a contract that was never issued authorises cash on a
  -- document with no commitment behind it.
  SELECT public.wo_canonical_status(wo_status) INTO v_status
  FROM public.work_orders WHERE id = NEW.work_order_id;

  IF v_status IS NULL OR v_status NOT IN ('issued', 'active', 'closed') THEN
    RAISE EXCEPTION 'A payment release requires an issued Work Order; this one is %.',
      COALESCE(v_status, 'missing') USING ERRCODE = '22023';
  END IF;

  NEW.created_by := COALESCE(NEW.created_by, v_actor);
  NEW.updated_by := COALESCE(NEW.updated_by, v_actor);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_wo_release_insert ON public.work_order_releases;
CREATE TRIGGER validate_wo_release_insert
  BEFORE INSERT ON public.work_order_releases
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_wo_release_insert();

-- 1e. Enforcement policy. A project that has not adopted release control yet
--     should not have every payment blocked by a missing authorisation.
ALTER TABLE public.budget_config
  ADD COLUMN IF NOT EXISTS wo_release_enforcement text NOT NULL DEFAULT 'warn_only';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_config_wo_release_chk') THEN
    ALTER TABLE public.budget_config
      ADD CONSTRAINT budget_config_wo_release_chk
      CHECK (wo_release_enforcement IN ('block', 'warn_only'));
  END IF;
END $$;

COMMENT ON COLUMN public.budget_config.wo_release_enforcement IS
  'block = a payment may not exceed the Work Order''s approved releases. warn_only (default) = releases are recorded and reported but do not gate disbursement, so adopting them is opt-in per project.';

-- ----------------------------------------------------------------------------
-- 2. PAYMENT AUDIT + GUARDS
--
--    payments could previously be inserted freely: against an uncertified bill,
--    for more than the bill's net payable, and with no actor recorded.
-- ----------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS work_order_release_id uuid REFERENCES public.work_order_releases(id),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_payments_wo_release
  ON public.payments (work_order_release_id) WHERE work_order_release_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_guard_service_bill_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill       public.service_bills;
  v_actor      uuid := public.app_current_profile_id();
  v_paid_other numeric;
  v_authorised numeric;
  v_wo_paid    numeric;
  v_mode       text;
BEGIN
  -- Material bills keep their own path; this guard is the service spine only.
  IF NEW.service_bill_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_bill FROM public.service_bills WHERE id = NEW.service_bill_id;
  IF v_bill.id IS NULL THEN
    RAISE EXCEPTION 'Service bill % does not exist.', NEW.service_bill_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'A payment amount must be greater than zero.' USING ERRCODE = '22023';
  END IF;

  -- Only a settled payment moves money; a pending/failed row is a record, not a
  -- disbursement, so the caps below apply to 'paid' only.
  IF NEW.status <> 'paid'::erp_payment_status THEN
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(v_actor, NEW.updated_by);
    RETURN NEW;
  END IF;

  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may release a payment.'
      USING ERRCODE = '42501';
  END IF;

  -- 2a. Cost must be recognised before cash leaves.
  IF public.sb_canonical_status(v_bill.status) NOT IN ('approved', 'paid') THEN
    RAISE EXCEPTION 'Bill % is % and cannot be paid until it is certified.',
      COALESCE(v_bill.bill_number, v_bill.id::text),
      public.sb_canonical_status(v_bill.status)
      USING ERRCODE = '22023';
  END IF;

  -- 2b. Never pay more than the certificate says is payable. net_payable is
  --     gross less retention, advance, debit and TDS — the figure the
  --     contractor actually receives.
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_other
  FROM public.payments
  WHERE service_bill_id = NEW.service_bill_id
    AND status = 'paid'::erp_payment_status
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_paid_other + NEW.amount
     > COALESCE(NULLIF(v_bill.net_payable_amount, 0), v_bill.total_amount, 0) + 0.01 THEN
    RAISE EXCEPTION
      'Payment of % would take bill % to % against a net payable of %.',
      to_char(NEW.amount, 'FM99,99,99,999.00'),
      COALESCE(v_bill.bill_number, v_bill.id::text),
      to_char(v_paid_other + NEW.amount, 'FM99,99,99,999.00'),
      to_char(COALESCE(NULLIF(v_bill.net_payable_amount, 0), v_bill.total_amount, 0),
              'FM99,99,99,999.00')
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2c. Treasury cap. This is the Rs 10 L of Rs 1 Cr rule.
  IF v_bill.work_order_id IS NOT NULL THEN
    SELECT COALESCE(wo_release_enforcement, 'warn_only') INTO v_mode
    FROM public.budget_config WHERE project_id = NEW.project_id;

    v_authorised := public.fn_wo_authorised_release(v_bill.work_order_id);
    v_wo_paid    := public.fn_wo_paid_to_date(v_bill.work_order_id);

    IF COALESCE(v_mode, 'warn_only') = 'block' THEN
      IF v_wo_paid + NEW.amount > v_authorised + 0.01 THEN
        RAISE EXCEPTION
          'Payment of % exceeds the authorised release on this Work Order: % paid of % authorised.',
          to_char(NEW.amount, 'FM99,99,99,999.00'),
          to_char(v_wo_paid, 'FM99,99,99,999.00'),
          to_char(v_authorised, 'FM99,99,99,999.00')
          USING ERRCODE = 'check_violation',
                HINT = 'Raise and approve a work_order_releases document for the additional amount.';
      END IF;
    ELSIF v_wo_paid + NEW.amount > v_authorised + 0.01 THEN
      RAISE WARNING
        'Payment takes Work Order disbursement to % against % authorised (wo_release_enforcement is warn_only).',
        v_wo_paid + NEW.amount, v_authorised;
    END IF;
  END IF;

  NEW.approved_at := COALESCE(NEW.approved_at, now());
  NEW.approved_by := COALESCE(NEW.approved_by, v_actor);
  NEW.updated_at  := now();
  NEW.updated_by  := COALESCE(v_actor, NEW.updated_by);
  NEW.created_by  := COALESCE(NEW.created_by, v_actor);

  RETURN NEW;
END $$;

-- BEFORE INSERT OR UPDATE: an amount or status edit must re-check the caps.
DROP TRIGGER IF EXISTS guard_service_bill_payment ON public.payments;
CREATE TRIGGER guard_service_bill_payment
  BEFORE INSERT OR UPDATE OF amount, status, service_bill_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_service_bill_payment();

-- ----------------------------------------------------------------------------
-- 3. RETENTION RELEASE — authority + payment status
--
--    Phase 4 created retention_releases with an over-release guard but no role
--    check, so any authenticated user could approve one.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_guard_retention_release_authority()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := public.app_current_profile_id();
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('approved', 'paid') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may approve a retention release.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IN ('approved', 'paid') THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, v_actor);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Sorts before trg_post_retention_release and trg_retention_release_guard, so
-- authority is checked before the arithmetic.
DROP TRIGGER IF EXISTS guard_retention_release_authority ON public.retention_releases;
CREATE TRIGGER guard_retention_release_authority
  BEFORE INSERT OR UPDATE OF status ON public.retention_releases
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_retention_release_authority();

-- 3b. Retention still outstanding on a bill: withheld, less what has been
--     released. This is the figure the Release Retention action offers.
CREATE OR REPLACE FUNCTION public.fn_sb_retention_outstanding(p_bill_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((SELECT retention_amount FROM public.service_bills WHERE id = p_bill_id), 0)
    - COALESCE((SELECT SUM(amount) FROM public.retention_releases
                WHERE service_bill_id = p_bill_id AND status IN ('approved', 'paid')), 0),
    0);
$$;

COMMENT ON FUNCTION public.fn_sb_retention_outstanding(uuid) IS
  'Retention withheld on a bill less what has already been released. budget_allocations.retention_held could previously only grow because nothing ever emitted the release.';

-- ----------------------------------------------------------------------------
-- 4. THE FIVE-METRIC READ MODEL
--
--    Contract / Certified / Approved net / Authorised / Paid, plus the two
--    balances the client asked to see. One row per Work Order.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.work_order_financial_position CASCADE;
CREATE VIEW public.work_order_financial_position AS
SELECT
  wo.id                                    AS work_order_id,
  wo.project_id,
  wo.work_order_number,
  wo.wo_status,
  wo.wo_type,

  -- 1. Contract value.
  COALESCE(wo.total_amount, 0)             AS contract_value,
  -- 2. Certified gross — recognised project cost.
  COALESCE(wo.billed_to_date, 0)           AS certified_gross,
  -- Claimed but not yet certified.
  COALESCE(wo.claimed_to_date, 0)          AS claimed_uncertified,
  -- 3. Approved net payable across certified bills, after every deduction.
  COALESCE(bills.net_payable, 0)           AS approved_net_payable,
  -- 4. Treasury authorisation.
  public.fn_wo_authorised_release(wo.id)   AS authorised_release,
  -- 5. Cash actually disbursed.
  public.fn_wo_paid_to_date(wo.id)         AS cash_paid,

  -- Balances the client asked to see.
  COALESCE(wo.total_amount, 0) - COALESCE(wo.billed_to_date, 0)
                                           AS remaining_headroom,
  GREATEST(COALESCE(bills.net_payable, 0) - public.fn_wo_paid_to_date(wo.id), 0)
                                           AS pending_liability,
  GREATEST(public.fn_wo_authorised_release(wo.id) - public.fn_wo_paid_to_date(wo.id), 0)
                                           AS unused_authorisation,
  COALESCE(bills.retention_held, 0)        AS retention_held,

  COALESCE(bills.bill_count, 0)            AS certified_bill_count,
  wo.has_billing_overrun,
  wo.has_scope_variance,
  wo.budget_allocation_id,
  wo.master_budget_item_id
FROM public.work_orders wo
LEFT JOIN (
  SELECT sb.work_order_id,
         COUNT(*)                                  AS bill_count,
         SUM(COALESCE(NULLIF(sb.net_payable_amount, 0), sb.total_amount, 0)) AS net_payable,
         SUM(public.fn_sb_retention_outstanding(sb.id))                      AS retention_held
  FROM public.service_bills sb
  WHERE sb.deleted_at IS NULL
    AND public.sb_canonical_status(sb.status) IN ('approved', 'paid')
  GROUP BY sb.work_order_id
) bills ON bills.work_order_id = wo.id
WHERE wo.deleted_at IS NULL;

COMMENT ON VIEW public.work_order_financial_position IS
  'The five financial indicators for a Work Order: contract value, certified gross, approved net payable, authorised release and cash paid — plus remaining headroom, pending liability, unused authorisation and retention held. Certified gross is project COST; authorised/paid are CASH. They are deliberately independent.';

REVOKE ALL ON public.work_order_financial_position FROM anon;
GRANT SELECT ON public.work_order_financial_position TO authenticated;
ALTER VIEW public.work_order_financial_position SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 5. RPCs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_work_order_release_status(
  p_release_id uuid,
  p_status     text,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_to  text := lower(COALESCE(btrim(p_status), ''));
  v_row public.work_order_releases;
BEGIN
  PERFORM public.app_require_profile();

  IF v_to NOT IN ('approved', 'cancelled') THEN
    RAISE EXCEPTION 'A release may only be approved or cancelled.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.work_order_releases
  SET status              = v_to,
      cancellation_reason = CASE WHEN v_to = 'cancelled'
                                 THEN NULLIF(btrim(COALESCE(p_reason, '')), '')
                                 ELSE cancellation_reason END,
      reason              = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), reason)
  WHERE id = p_release_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release % not found, or you do not have access to it.', p_release_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'release_number', v_row.release_number,
    'status', v_row.status,
    'amount', v_row.amount,
    'authorised_total', public.fn_wo_authorised_release(v_row.work_order_id),
    'paid_to_date', public.fn_wo_paid_to_date(v_row.work_order_id)
  );
END $$;

-- Records an actual disbursement. Every cap lives in the guard trigger, so this
-- is a thin, auditable door rather than a second implementation of the rules.
CREATE OR REPLACE FUNCTION public.rpc_record_service_bill_payment(
  p_bill_id           uuid,
  p_amount            numeric,
  p_payment_reference text,
  p_payment_date      date DEFAULT NULL,
  p_payment_mode      text DEFAULT NULL,
  p_remarks           text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_bill    public.service_bills;
  v_payment public.payments;
  v_release uuid;
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_bill FROM public.service_bills
  WHERE id = p_bill_id AND deleted_at IS NULL;

  IF v_bill.id IS NULL THEN
    RAISE EXCEPTION 'Service bill % not found, or you do not have access to it.', p_bill_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF COALESCE(btrim(p_payment_reference), '') = '' THEN
    RAISE EXCEPTION 'A payment reference is required.' USING ERRCODE = '22023';
  END IF;

  -- Attribute the disbursement to the release it draws on, when one exists, so
  -- the audit trail shows which authorisation funded it.
  SELECT id INTO v_release
  FROM public.work_order_releases
  WHERE work_order_id = v_bill.work_order_id
    AND status = 'approved'
  ORDER BY release_date DESC, created_at DESC
  LIMIT 1;

  INSERT INTO public.payments (
    project_id, service_bill_id, vendor_bill_id, work_order_release_id,
    payment_reference, payment_date, amount, status, payment_mode, remarks
  ) VALUES (
    v_bill.project_id, p_bill_id, NULL, v_release,
    btrim(p_payment_reference), COALESCE(p_payment_date, CURRENT_DATE),
    p_amount, 'paid'::erp_payment_status, p_payment_mode, p_remarks
  )
  RETURNING * INTO v_payment;

  RETURN jsonb_build_object(
    'id', v_payment.id,
    'amount', v_payment.amount,
    'bill_id', p_bill_id,
    'payment_status', (SELECT payment_status FROM public.service_bills WHERE id = p_bill_id),
    'bill_status', (SELECT status FROM public.service_bills WHERE id = p_bill_id)
  );
END $$;

COMMENT ON FUNCTION public.rpc_record_service_bill_payment(uuid, numeric, text, date, text, text) IS
  'Records a disbursement against a certified service bill. Caps (certified-only, net payable, authorised release) are enforced by trg_guard_service_bill_payment, not duplicated here.';

CREATE OR REPLACE FUNCTION public.rpc_release_retention(
  p_bill_id        uuid,
  p_amount         numeric,
  p_release_number text,
  p_reason         text DEFAULT NULL,
  p_release_date   date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_bill        public.service_bills;
  v_outstanding numeric;
  v_row         public.retention_releases;
BEGIN
  PERFORM public.app_require_profile();

  SELECT * INTO v_bill FROM public.service_bills
  WHERE id = p_bill_id AND deleted_at IS NULL;

  IF v_bill.id IS NULL THEN
    RAISE EXCEPTION 'Service bill % not found, or you do not have access to it.', p_bill_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_outstanding := public.fn_sb_retention_outstanding(p_bill_id);
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'Bill % has no retention outstanding.',
      COALESCE(v_bill.bill_number, p_bill_id::text) USING ERRCODE = '22023';
  END IF;

  IF COALESCE(btrim(p_release_number), '') = '' THEN
    RAISE EXCEPTION 'A release number is required.' USING ERRCODE = '22023';
  END IF;

  -- Created already approved: fn_post_retention_release emits the
  -- 'retention_released' ledger row on approval, which is the whole point of
  -- the action. The over-release guard from Phase 4 still applies.
  INSERT INTO public.retention_releases (
    project_id, service_bill_id, vendor_bill_id,
    release_number, release_date, amount, reason, status
  ) VALUES (
    v_bill.project_id, p_bill_id, NULL,
    btrim(p_release_number), COALESCE(p_release_date, CURRENT_DATE),
    p_amount, p_reason, 'approved'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'release_number', v_row.release_number,
    'amount', v_row.amount,
    'retention_outstanding', public.fn_sb_retention_outstanding(p_bill_id)
  );
END $$;

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_order_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_order_releases FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.work_order_releases TO authenticated;

DROP POLICY IF EXISTS work_order_releases_select ON public.work_order_releases;
CREATE POLICY work_order_releases_select ON public.work_order_releases
  FOR SELECT TO authenticated USING (public.app_current_role() IS NOT NULL);
DROP POLICY IF EXISTS work_order_releases_insert ON public.work_order_releases;
CREATE POLICY work_order_releases_insert ON public.work_order_releases
  FOR INSERT TO authenticated WITH CHECK (public.app_can_write_procurement());
DROP POLICY IF EXISTS work_order_releases_update ON public.work_order_releases;
CREATE POLICY work_order_releases_update ON public.work_order_releases
  FOR UPDATE TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());
-- No DELETE policy: an authorisation is a financial decision, cancelled not removed.

-- payments and retention_releases predate the role model.
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated USING (public.app_current_role() IS NOT NULL);
DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated WITH CHECK (public.app_can_write_procurement());
DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());

ALTER TABLE public.retention_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_releases FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.retention_releases TO authenticated;

DROP POLICY IF EXISTS retention_releases_select ON public.retention_releases;
CREATE POLICY retention_releases_select ON public.retention_releases
  FOR SELECT TO authenticated USING (public.app_current_role() IS NOT NULL);
DROP POLICY IF EXISTS retention_releases_insert ON public.retention_releases;
CREATE POLICY retention_releases_insert ON public.retention_releases
  FOR INSERT TO authenticated WITH CHECK (public.app_can_write_procurement());
DROP POLICY IF EXISTS retention_releases_update ON public.retention_releases;
CREATE POLICY retention_releases_update ON public.retention_releases
  FOR UPDATE TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());

-- ----------------------------------------------------------------------------
-- 7. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_work_order_release_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_work_order_release_status(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_record_service_bill_payment(uuid, numeric, text, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_record_service_bill_payment(uuid, numeric, text, date, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_release_retention(uuid, numeric, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_release_retention(uuid, numeric, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_wo_authorised_release(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_wo_authorised_release(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_wo_paid_to_date(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_wo_paid_to_date(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_sb_retention_outstanding(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_sb_retention_outstanding(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
BEGIN
  IF to_regclass('public.work_order_releases') IS NULL THEN
    v_problems := array_append(v_problems, 'work_order_releases missing');
  END IF;
  IF to_regclass('public.work_order_financial_position') IS NULL THEN
    v_problems := array_append(v_problems, 'work_order_financial_position missing');
  END IF;

  FOREACH v_key IN ARRAY ARRAY['guard_wo_release_status', 'validate_wo_release_insert',
                               'guard_service_bill_payment',
                               'guard_retention_release_authority'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key AND NOT tgisinternal) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['work_order_release_id', 'approved_by', 'approved_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'payments.' || v_key || ' missing');
    END IF;
  END LOOP;

  -- The authority guard must sort before Phase 4's arithmetic guard, so an
  -- unauthorised user is told so rather than getting an over-release message.
  IF NOT ('guard_retention_release_authority' < 'trg_retention_release_guard') THEN
    v_problems := array_append(v_problems,
      'guard_retention_release_authority no longer sorts before trg_retention_release_guard');
  END IF;

  -- The five metrics must all be present on the view.
  FOREACH v_key IN ARRAY ARRAY['contract_value', 'certified_gross', 'approved_net_payable',
                               'authorised_release', 'cash_paid', 'remaining_headroom',
                               'pending_liability', 'retention_held'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'work_order_financial_position'
        AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'work_order_financial_position.' || v_key || ' missing');
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_config'
      AND column_name = 'wo_release_enforcement'
  ) THEN
    v_problems := array_append(v_problems, 'budget_config.wo_release_enforcement missing');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 3 incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Stage 3 applied: release authorisation caps payment (never certification), payments are guarded and attributed, retention can finally be released, and the five financial indicators are queryable.';
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

  FOREACH t IN ARRAY ARRAY['work_order_releases', 'retention_releases'] LOOP
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
