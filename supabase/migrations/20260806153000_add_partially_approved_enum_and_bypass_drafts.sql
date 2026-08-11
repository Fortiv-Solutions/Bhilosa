-- 1. Add partially_approved to erp_procurement_status enum if not exists
-- Note: We run this in a transaction-safe way or outside transactions. In pg, we can't run ALTER TYPE ADD VALUE inside a transaction block if we try to use the type in the same transaction.
-- But since python commit runs it, doing it as a standalone command is safest.
ALTER TYPE public.erp_procurement_status ADD VALUE IF NOT EXISTS 'partially_approved';

-- 2. Update recalculate_mr_parent_status to bypass draft MRs and support partially_approved status cleanly
CREATE OR REPLACE FUNCTION public.recalculate_mr_parent_status()
RETURNS TRIGGER AS $$
DECLARE
    v_mr_id UUID;
    v_mr_status TEXT;
    v_total_count INT;
    v_approved_pr_count INT;
    v_fulfilled_stock_count INT;
    v_rejected_count INT;
    v_new_status TEXT;
BEGIN
    v_mr_id := COALESCE(NEW.material_request_id, OLD.material_request_id);

    -- Check if the parent MR is currently a draft. If so, do not automatically transition it.
    SELECT status::text INTO v_mr_status FROM public.material_requests WHERE id = v_mr_id;
    IF v_mr_status = 'draft' THEN
        RETURN NEW;
    END IF;

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
