-- ============================================================================
-- FIX — trg_guard_wo_line_immutable silently cancelled every line DELETE
-- File: supabase/migrations/20260807141000_fix_wo_line_immutable_delete_return.sql
--
-- THE BUG
-- =======
-- Stage 4's guard is a BEFORE INSERT OR UPDATE OR DELETE trigger on
-- work_order_lines. Every one of its success paths ends in `RETURN NEW`.
--
-- In a BEFORE DELETE trigger NEW is NULL, and a BEFORE row trigger that returns
-- NULL SILENTLY CANCELS the operation. So:
--
--   DELETE FROM work_order_lines WHERE id = ...;   -- reports 0 rows, no error
--
-- on a DRAFT Work Order — precisely the case the guard was written to permit.
-- The early-exit path (`IF v_status NOT IN ('issued','active') THEN RETURN NEW`)
-- was meant to allow it and instead swallowed it.
--
-- IMPACT
-- ======
--   * A scope line cannot be removed from a draft Work Order at all. The UI
--     reports success (PostgREST returns 204 for a 0-row delete) and the line
--     stays, so the contract value silently disagrees with the visible scope.
--   * Stage 5's rpc_generate_wo_stage_lines deletes each base line after
--     decomposing it. With the delete cancelled the base line SURVIVES
--     alongside its seven generated stage lines, DOUBLING the contract value:
--     the Rs 46,50,000 plumbing Work Order generated Rs 93,00,000.
--
-- It was invisible until now because no code path had yet deleted a Work Order
-- line: Stage 4 only ever added the guard, and the create-WO form builds its
-- lines in one insert.
--
-- THE FIX
-- =======
-- Return OLD on the DELETE path. The guard's blocking behaviour is unchanged —
-- deleting a line from a LIVE contract still raises 42501 and still demands a
-- variation. Only the permitted path is repaired.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_guard_wo_line_immutable'
  ) THEN
    RAISE EXCEPTION 'trg_guard_wo_line_immutable is missing (apply 20260807130000_wo_sb_stage4_variations_and_ceiling.sql).';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_guard_wo_line_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_system boolean := COALESCE(
    NULLIF(current_setting('app.wo_variation_apply', true), ''), 'off') = 'on';
  v_number text;
BEGIN
  -- A BEFORE row trigger that returns NULL cancels the statement, and NEW is
  -- NULL on DELETE. Every RETURN below therefore has to hand back the row that
  -- actually exists for the operation in hand.
  IF v_system THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT public.wo_canonical_status(wo_status), work_order_number
    INTO v_status, v_number
  FROM public.work_orders
  WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  -- Draft / submitted / rejected: the contract is not live, so scope is still
  -- being written. This is the path that was being swallowed.
  IF v_status IS NULL OR v_status NOT IN ('issued', 'active') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Work Order % is live; a new scope line must come from an approved variation.',
      COALESCE(v_number, '?') USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Work Order % is live; a contracted line cannot be deleted. Raise a variation.',
      COALESCE(v_number, '?') USING ERRCODE = '42501';
  END IF;

  -- executed_quantity is site progress recording, not a contract change, and
  -- Stage 2's variance alert depends on it staying editable.
  IF NEW.quantity        IS DISTINCT FROM OLD.quantity
     OR NEW.rate         IS DISTINCT FROM OLD.rate
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION
      'Work Order % is live; contracted quantity and rate cannot be edited. Raise a variation.',
      COALESCE(v_number, '?') USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- VERIFICATION — prove a draft line can be removed and a live one cannot.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_proj   uuid;
  v_agency uuid;
  v_wo     uuid;
  v_line   uuid;
  v_left   integer;
  v_blocked boolean := false;
BEGIN
  SELECT project_id, agency_id INTO v_proj, v_agency
  FROM public.work_orders WHERE deleted_at IS NULL LIMIT 1;

  IF v_proj IS NULL THEN
    RAISE NOTICE 'No Work Order to build a fixture from; skipping the behavioural check.';
    RETURN;
  END IF;

  -- Draft: the delete must take effect.
  INSERT INTO public.work_orders (project_id, agency_id, work_order_number,
                                  scope_of_work, wo_type, wo_status, total_amount)
  VALUES (v_proj, v_agency, 'FIXTURE-DELETE-CHECK', 'fixture', 'fixed_scope', 'draft', 0)
  RETURNING id INTO v_wo;

  INSERT INTO public.work_order_lines (work_order_id, project_id, description,
                                       unit, quantity, rate, total_amount)
  VALUES (v_wo, v_proj, 'fixture line', 'Nos', 1, 100, 100)
  RETURNING id INTO v_line;

  DELETE FROM public.work_order_lines WHERE id = v_line;

  SELECT count(*) INTO v_left FROM public.work_order_lines WHERE id = v_line;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'Fix failed: a draft Work Order line still cannot be deleted.';
  END IF;

  -- Live: the delete must still be refused.
  INSERT INTO public.work_order_lines (work_order_id, project_id, description,
                                       unit, quantity, rate, total_amount)
  VALUES (v_wo, v_proj, 'fixture line 2', 'Nos', 1, 100, 100)
  RETURNING id INTO v_line;

  UPDATE public.work_orders SET total_amount = 100 WHERE id = v_wo;
  UPDATE public.work_orders SET wo_status = 'issued' WHERE id = v_wo;

  BEGIN
    DELETE FROM public.work_order_lines WHERE id = v_line;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Fix is too permissive: a line on a live Work Order was deleted.';
  END IF;

  -- Remove the fixture. Cancelling releases any commitment it posted.
  UPDATE public.work_orders
  SET wo_status = 'cancelled', cancellation_reason = 'Migration fixture'
  WHERE id = v_wo;
  DELETE FROM public.work_orders WHERE id = v_wo;

  RAISE NOTICE 'Verified: a draft Work Order line deletes, a live one is still refused.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
