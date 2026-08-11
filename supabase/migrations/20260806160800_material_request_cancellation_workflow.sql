-- 1. Update recalculate_mr_parent_status trigger function to bypass cancelled parent MRs (along with draft MRs)
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

    -- Check if the parent MR is currently a draft or cancelled. If so, bypass recalculation.
    SELECT status::text INTO v_mr_status FROM public.material_requests WHERE id = v_mr_id;
    IF v_mr_status = 'draft' OR v_mr_status = 'cancelled' THEN
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
        -- Do not change parent status if there are no lines (e.g. during delete-insert sync)
        RETURN NEW;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Define the trigger function for handling MR cancellation (as AFTER trigger)
CREATE OR REPLACE FUNCTION public.handle_mr_cancellation()
RETURNS TRIGGER AS $$
DECLARE
  v_pr_count INT;
  v_pr_numbers TEXT;
  v_po_count INT;
  v_rfq_count INT;
  v_active_po_numbers TEXT;
  v_active_rfq_numbers TEXT;
BEGIN
  -- We only act if status transitioned to 'cancelled'
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    
    -- 0. Block cancellation if any linked PR has progressed beyond 'draft'
    SELECT 
      COUNT(*),
      COALESCE(string_agg(pr_number, ', '), '')
    INTO 
      v_pr_count,
      v_pr_numbers
    FROM public.purchase_requisitions
    WHERE material_request_id = NEW.id
      AND status::text <> 'draft';

    IF v_pr_count > 0 THEN
      RAISE EXCEPTION 'Cannot cancel Material Request %: Linked Purchase Requisition(s) [%] have already been processed by the PR team. Please contact the procurement department to cancel.',
        NEW.mr_number, v_pr_numbers
        USING ERRCODE = 'check_violation';
    END IF;

    -- 1. Check for active/approved Purchase Orders linked to this MR's PRs
    SELECT 
      COUNT(*),
      COALESCE(string_agg(po_number, ', '), '')
    INTO 
      v_po_count,
      v_active_po_numbers
    FROM public.purchase_orders
    WHERE purchase_requisition_id IN (
      SELECT id FROM public.purchase_requisitions WHERE material_request_id = NEW.id
    ) AND status NOT IN ('cancelled'::erp_po_status, 'rejected'::erp_po_status);

    IF v_po_count > 0 THEN
      RAISE EXCEPTION 'Cannot cancel Material Request %: Linked active Purchase Order(s) [%] must be cancelled or short-closed first.', 
        NEW.mr_number, v_active_po_numbers
        USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Check for active RFQs linked to this MR's PRs
    SELECT 
      COUNT(*),
      COALESCE(string_agg(rfq_number, ', '), '')
    INTO 
      v_rfq_count,
      v_active_rfq_numbers
    FROM public.rfqs
    WHERE purchase_requisition_id IN (
      SELECT id FROM public.purchase_requisitions WHERE material_request_id = NEW.id
    ) AND status NOT IN ('cancelled'::erp_procurement_status, 'draft'::erp_procurement_status);

    IF v_rfq_count > 0 THEN
      RAISE EXCEPTION 'Cannot cancel Material Request %: Linked active RFQ(s) [%] must be cancelled or withdrawn first.', 
        NEW.mr_number, v_active_rfq_numbers
        USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Auto-delete linked draft RFQs
    DELETE FROM public.rfq_lines 
    WHERE purchase_requisition_id IN (
      SELECT id FROM public.purchase_requisitions WHERE material_request_id = NEW.id
    );
    DELETE FROM public.rfqs 
    WHERE purchase_requisition_id IN (
      SELECT id FROM public.purchase_requisitions WHERE material_request_id = NEW.id
    ) AND status = 'draft'::erp_procurement_status;

    -- 4. Auto-delete linked draft PRs
    DELETE FROM public.purchase_requisition_lines 
    WHERE purchase_requisition_id IN (
      SELECT id FROM public.purchase_requisitions WHERE material_request_id = NEW.id
    );
    DELETE FROM public.purchase_requisitions 
    WHERE material_request_id = NEW.id 
      AND status = 'draft'::erp_procurement_status;

    -- 5. Mark MR lines as 'cancelled'
    UPDATE public.material_request_lines
    SET line_status = 'cancelled'
    WHERE material_request_id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create the trigger on public.material_requests as an AFTER UPDATE trigger
DROP TRIGGER IF EXISTS trg_mr_cancellation ON public.material_requests;
CREATE TRIGGER trg_mr_cancellation
AFTER UPDATE OF status ON public.material_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_mr_cancellation();
