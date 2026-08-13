-- ============================================================================
-- Migration: Fix Service Bill Live Balance & Over-Billing Protection
-- Description:
--   1. Updates fn_sb_line_certified_quantity to count ALL live bills
--      ('submitted', 'verified', 'approved', 'paid') so in-flight claims
--      are tracked immediately.
--   2. Adds line-level over-measurement guard trigger on service_bill_lines
--      to enforce quantity caps on INSERT/UPDATE for all live bills.
--   3. Updates rpc_wo_line_billing_position so Prev. Billed and Balance Qty
--      reflect live claims accurately.
--   4. Updates fn_recompute_wo_billed_to_date to ensure WO remaining balance
--      draws down cleanly on claimed_to_date.
-- ============================================================================

-- 1. LIVE CERTIFIED / BILLED QUANTITY FUNCTION
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
    AND public.sb_canonical_status(b.status) IN ('submitted', 'verified', 'approved', 'paid')
    AND (p_exclude_bill_id IS NULL OR b.id <> p_exclude_bill_id);
$$;

COMMENT ON FUNCTION public.fn_sb_line_certified_quantity(uuid, uuid) IS
  'Cumulative quantity billed/claimed against a Work Order line across all live service bills (submitted, verified, approved, paid).';

-- 2. LINE-LEVEL OVER-MEASUREMENT GUARD TRIGGER
CREATE OR REPLACE FUNCTION public.trg_sb_line_over_measurement_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_status text;
  v_wo_id       uuid;
  v_wo_type     text;
  v_contracted  numeric;
  v_description text;
  v_remeasure   boolean;
  v_tolerance   numeric := 0;
  v_prior       numeric;
  v_this       numeric;
  v_cumulative  numeric;
  v_limit       numeric;
BEGIN
  IF NEW.work_order_line_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get parent bill status and work order
  SELECT public.sb_canonical_status(status), work_order_id
    INTO v_bill_status, v_wo_id
    FROM public.service_bills
   WHERE id = NEW.service_bill_id AND deleted_at IS NULL;

  -- Ignore rejected bills
  IF v_bill_status IS NULL OR v_bill_status = 'rejected' THEN
    RETURN NEW;
  END IF;

  -- Fetch line contract details
  SELECT wol.quantity, wol.description, COALESCE(wol.is_remeasurable, false), COALESCE(wo.wo_type, 'fixed_scope')
    INTO v_contracted, v_description, v_remeasure, v_wo_type
    FROM public.work_order_lines wol
    JOIN public.work_orders wo ON wo.id = wol.work_order_id
   WHERE wol.id = NEW.work_order_line_id;

  -- Only enforce for fixed scope contracts with a defined contracted quantity
  IF v_wo_type = 'fixed_scope' AND COALESCE(v_contracted, 0) > 0 AND NOT v_remeasure THEN
    -- Get variation tolerance if set
    v_tolerance := COALESCE((public.fn_wo_terms(v_wo_id)).variation_tolerance_percent, 0);

    v_prior      := public.fn_sb_line_certified_quantity(NEW.work_order_line_id, NEW.service_bill_id);
    v_this       := COALESCE(NEW.quantity, 0) * COALESCE(NULLIF(NEW.flats_count, 0), 1);
    v_cumulative := v_prior + v_this;
    v_limit      := v_contracted * (1 + v_tolerance / 100.0);

    IF v_cumulative > (v_limit + 0.0001) THEN
      RAISE EXCEPTION
        'Over-measurement on "%": % already billed + % on this bill = % against contracted %.',
        left(COALESCE(v_description, 'Item'), 55),
        ROUND(v_prior, 3), ROUND(v_this, 3), ROUND(v_cumulative, 3),
        ROUND(v_contracted, 3)::text
          || CASE WHEN v_tolerance > 0 THEN ' (+' || ROUND(v_tolerance, 2)::text || '% tolerance)' ELSE '' END
        USING ERRCODE = 'check_violation',
              HINT = 'Correct the quantity or issue a Work Order variation before billing.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sb_line_over_measurement_guard ON public.service_bill_lines;
CREATE TRIGGER trg_sb_line_over_measurement_guard
  BEFORE INSERT OR UPDATE ON public.service_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_sb_line_over_measurement_guard();

-- 3. HEADER-LEVEL OVER-MEASUREMENT GUARD TRIGGER
CREATE OR REPLACE FUNCTION public.trg_sb_over_measurement_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r            record;
  v_tolerance  numeric;
  v_prior      numeric;
  v_this       numeric;
  v_cumulative numeric;
  v_limit      numeric;
  v_status     text;
BEGIN
  v_status := public.sb_canonical_status(NEW.status);
  IF v_status IS NULL OR v_status = 'rejected' THEN
    RETURN NEW;
  END IF;

  v_tolerance := COALESCE((public.fn_wo_terms(NEW.work_order_id)).variation_tolerance_percent, 0);

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
      AND COALESCE(wol.is_remeasurable, false) = false
    GROUP BY l.work_order_line_id
  LOOP
    v_prior      := public.fn_sb_line_certified_quantity(r.work_order_line_id, NEW.id);
    v_this       := COALESCE(r.qty, 0);
    v_cumulative := v_prior + v_this;
    v_limit      := r.contracted * (1 + v_tolerance / 100.0);

    IF v_cumulative > (v_limit + 0.0001) THEN
      RAISE EXCEPTION
        'Over-measurement on "%": % already billed + % on this bill = % against contracted %.',
        left(r.description, 55),
        ROUND(v_prior, 3), ROUND(v_this, 3), ROUND(v_cumulative, 3),
        ROUND(r.contracted, 3)::text
          || CASE WHEN v_tolerance > 0 THEN ' (+' || ROUND(v_tolerance, 2)::text || '% tolerance)' ELSE '' END
        USING ERRCODE = 'check_violation',
              HINT = 'Correct the quantity or issue a Work Order variation before billing.';
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- 4. RPC WORK ORDER LINE BILLING POSITION
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

-- 5. RECOMPUTE WO BILLED AND CLAIMED TOTALS
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

  SELECT
    COALESCE(SUM(CASE WHEN v_wo.tax_inclusive THEN sb.total_amount ELSE sb.subtotal_amount END)
             FILTER (WHERE sb.status IN ('approved', 'paid')), 0),
    COALESCE(SUM(CASE WHEN v_wo.tax_inclusive THEN sb.total_amount ELSE sb.subtotal_amount END)
             FILTER (WHERE sb.status IN ('submitted', 'verified', 'approved', 'paid')), 0)
    INTO v_certified, v_claimed
  FROM public.service_bills sb
  WHERE sb.work_order_id = p_work_order_id
    AND sb.deleted_at IS NULL;

  v_overrun := v_certified > COALESCE(v_wo.total_amount, 0);

  UPDATE public.work_orders
  SET billed_to_date      = v_certified,
      claimed_to_date     = v_claimed,
      has_billing_overrun = v_overrun,
      updated_at          = now()
  WHERE id = p_work_order_id;

  IF v_overrun AND v_wo.budget_allocation_id IS NOT NULL THEN
    INSERT INTO public.budget_alerts (
      project_id, budget_allocation_id, alert_type, severity,
      threshold_percent, actual_percent, message, status
    ) VALUES (
      v_wo.project_id, v_wo.budget_allocation_id, 'over_contract', 'critical',
      100, CASE WHEN v_wo.total_amount > 0 THEN (v_certified / v_wo.total_amount) * 100 ELSE 100 END,
      'Work Order certified amount exceeds contracted value', 'open'
    ) ON CONFLICT DO NOTHING;
  END IF;
END $$;
