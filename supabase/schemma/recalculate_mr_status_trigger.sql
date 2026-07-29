-- =============================================================================
-- Migration: Auto-recalculate Parent MR Status from Line Items
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_mr_parent_status()
RETURNS TRIGGER AS $$
DECLARE
    v_mr_id UUID;
    v_total_count INT;
    v_approved_pr_count INT;
    v_fulfilled_stock_count INT;
    v_rejected_count INT;
    v_new_status TEXT;
BEGIN
    v_mr_id := COALESCE(NEW.material_request_id, OLD.material_request_id);

    -- Count line status distribution for this MR
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE line_status = 'approved_for_pr'),
        COUNT(*) FILTER (WHERE line_status = 'fulfilled_from_stock'),
        COUNT(*) FILTER (WHERE line_status = 'rejected')
    INTO 
        v_total_count,
        v_approved_pr_count,
        v_fulfilled_stock_count,
        v_rejected_count
    FROM public.material_request_lines
    WHERE material_request_id = v_mr_id;

    -- State Machine Logic
    IF v_total_count = 0 THEN
        v_new_status := 'draft';
    ELSIF v_rejected_count = v_total_count THEN
        v_new_status := 'rejected'; -- 100% lines rejected
    ELSIF (v_approved_pr_count + v_fulfilled_stock_count) = v_total_count THEN
        v_new_status := 'approved'; -- 100% lines approved or fulfilled
    ELSIF (v_approved_pr_count + v_fulfilled_stock_count + v_rejected_count) > 0 THEN
        v_new_status := 'partially_approved'; -- Mixed decisions (e.g. 1 approved, 1 rejected)
    ELSE
        v_new_status := 'submitted';
    END IF;

    -- Update Parent Header Status
    UPDATE public.material_requests
    SET 
        status = v_new_status::erp_procurement_status,
        updated_at = NOW()
    WHERE id = v_mr_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach Trigger to material_request_lines
DROP TRIGGER IF EXISTS trigger_recalculate_mr_status ON public.material_request_lines;

CREATE TRIGGER trigger_recalculate_mr_status
AFTER INSERT OR UPDATE OF line_status OR DELETE
ON public.material_request_lines
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_mr_parent_status();
