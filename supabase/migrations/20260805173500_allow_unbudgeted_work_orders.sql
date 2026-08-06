-- =====================================================================
-- Migration: 20260805173500_allow_unbudgeted_work_orders.sql
-- Purpose: Allow Work Orders without a pre-linked budget allocation or
--          master budget line to be issued and activated smoothly.
-- =====================================================================

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
  IF NEW.wo_status NOT IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.wo_status IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cfg FROM public.budget_config WHERE project_id = NEW.project_id;

  v_allocation := public.fn_resolve_wo_allocation_for(
    NEW.project_id, NEW.budget_allocation_id, NEW.master_budget_item_id, NEW.activity_id
  );

  IF v_allocation IS NULL THEN
    RETURN NEW; -- Permit unbudgeted Work Orders to proceed smoothly
  END IF;

  NEW.budget_allocation_id := v_allocation;

  SELECT * INTO v_alloc FROM public.budget_allocations WHERE id = v_allocation;

  IF COALESCE(v_alloc.allocated_amount, 0) > 0 THEN
    v_projected := COALESCE(v_alloc.committed_amount, 0)
                 + COALESCE(v_alloc.spent_amount, 0)
                 + COALESCE(NEW.total_amount, 0);
    v_util  := (v_projected / v_alloc.allocated_amount) * 100;
    v_limit := COALESCE(v_cfg.hard_limit_percent, v_alloc.hard_limit_percent, 100);

    IF v_util >= v_limit THEN
      IF COALESCE(v_cfg.hard_limit_enforcement, 'warn_only') = 'block' THEN
        RAISE EXCEPTION
          'Work Order % would take budget head "%" to % percent of its allocation (limit % percent).',
          COALESCE(NEW.work_order_number, NEW.id::text), v_alloc.allocation_name,
          ROUND(v_util, 1), v_limit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;
