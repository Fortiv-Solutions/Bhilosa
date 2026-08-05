-- Migration: Add function to reset a Purchase Requisition back to 'draft' and clean up all downstream RFQ and Sourcing items.
-- Named: 20260804100000_reset_pr_to_draft.sql

CREATE OR REPLACE FUNCTION public.rpc_reset_pr_to_draft(p_purchase_requisition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pr_number text;
  v_rfq_ids uuid[];
  v_po_ids uuid[];
  v_mr_line_ids uuid[];
  v_count integer;
BEGIN
  -- 1. Ensure user has permission
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'You do not have permission to reset purchase requisitions.' USING ERRCODE = '42501';
  END IF;

  -- 2. Check if PR exists
  SELECT pr_number INTO v_pr_number FROM public.purchase_requisitions WHERE id = p_purchase_requisition_id;
  IF v_pr_number IS NULL THEN
    RAISE EXCEPTION 'Purchase requisition not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Gather all RFQ IDs associated with this PR
  SELECT array_agg(id) INTO v_rfq_ids FROM public.rfqs WHERE purchase_requisition_id = p_purchase_requisition_id;

  -- 4. Gather all PO IDs associated with this PR or these RFQs
  SELECT array_agg(id) INTO v_po_ids FROM public.purchase_orders 
  WHERE purchase_requisition_id = p_purchase_requisition_id
     OR id IN (
       SELECT DISTINCT purchase_order_id FROM public.purchase_order_lines 
       WHERE purchase_requisition_id = p_purchase_requisition_id
     );

  -- 5. Gather MR Line IDs from PR lines to recompute conversion balances later
  SELECT array_agg(DISTINCT material_request_line_id) INTO v_mr_line_ids 
  FROM public.purchase_requisition_lines 
  WHERE purchase_requisition_id = p_purchase_requisition_id AND material_request_line_id IS NOT NULL;

  -- 6. Clean up PO lines and POs
  IF v_po_ids IS NOT NULL AND array_length(v_po_ids, 1) > 0 THEN
    DELETE FROM public.purchase_order_lines WHERE purchase_order_id = ANY(v_po_ids);
    DELETE FROM public.purchase_orders WHERE id = ANY(v_po_ids);
  END IF;

  -- 7. Clean up RFQ/Quotation awards and selections
  IF v_rfq_ids IS NOT NULL AND array_length(v_rfq_ids, 1) > 0 THEN
    DELETE FROM public.vendor_selection_awards WHERE vendor_selection_id IN (
      SELECT id FROM public.vendor_selections WHERE rfq_id = ANY(v_rfq_ids)
    );
    DELETE FROM public.vendor_selections WHERE rfq_id = ANY(v_rfq_ids);
    DELETE FROM public.vendor_quotation_lines WHERE rfq_line_id IN (
      SELECT id FROM public.rfq_lines WHERE rfq_id = ANY(v_rfq_ids)
    );
    DELETE FROM public.vendor_quotations WHERE rfq_id = ANY(v_rfq_ids);
    DELETE FROM public.rfq_vendors WHERE rfq_id = ANY(v_rfq_ids);
    DELETE FROM public.rfq_lines WHERE rfq_id = ANY(v_rfq_ids);
    DELETE FROM public.rfqs WHERE id = ANY(v_rfq_ids);
  END IF;

  -- 8. Reset the PR status and details
  UPDATE public.purchase_requisitions
  SET status = 'draft'::erp_procurement_status,
      assigned_to = NULL,
      approved_by = NULL,
      cancellation_reason = NULL,
      revision_reason = NULL
  WHERE id = p_purchase_requisition_id;

  -- 9. Recompute MR line conversion balances
  IF v_mr_line_ids IS NOT NULL AND array_length(v_mr_line_ids, 1) > 0 THEN
    FOR v_count IN 1 .. array_length(v_mr_line_ids, 1) LOOP
      PERFORM public.recompute_mr_line_conversion(v_mr_line_ids[v_count]);
    END LOOP;
  END IF;

  -- 10. Log activity
  INSERT INTO public.pr_activity_log (
    purchase_requisition_id,
    project_id,
    action_name,
    created_by,
    payload
  ) VALUES (
    p_purchase_requisition_id,
    (SELECT project_id FROM public.purchase_requisitions WHERE id = p_purchase_requisition_id),
    'Reset to Draft & Cleaned RFQs',
    public.app_require_profile(),
    jsonb_build_object(
      'comment', 'Requisition was manually reset to draft. All associated RFQs and Quotations have been deleted.',
      'previous_status', 'approved',
      'new_status', 'draft'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'prNumber', v_pr_number,
    'deletedRfqsCount', COALESCE(array_length(v_rfq_ids, 1), 0),
    'deletedPosCount', COALESCE(array_length(v_po_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reset_pr_to_draft(uuid) TO authenticated;
