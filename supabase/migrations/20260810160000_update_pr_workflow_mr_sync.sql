-- ============================================================================
-- Migration: Update PR Workflow & Auto-Sync MR Status to Draft
-- Date: 2026-08-10
-- Purpose:
--   1. Set auto-created PR status to 'under_verification' (Verified by Site Engineer) when MR is submitted.
--   2. Automatically sync parent Material Request status to 'draft' whenever PR is returned to draft.
-- ============================================================================

-- 1. Update auto-create PR trigger function to set PR status to 'under_verification'
CREATE OR REPLACE FUNCTION public.handle_auto_create_draft_pr_line()
RETURNS TRIGGER AS $$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_mr_number text;
  v_mr_title text;
  v_mr_project_id uuid;
  v_mr_site_id uuid;
  v_mr_required_date date;
  v_mr_priority text;
  v_mr_site_block text;
  v_mr_raised_by uuid;
  v_mr_raised_by_name text;
BEGIN
  -- Check if a PR header already exists for this material_request_id
  SELECT id INTO v_pr_id 
  FROM public.purchase_requisitions 
  WHERE material_request_id = NEW.material_request_id;
  
  -- If it does not exist, look up MR details and create the PR header in 'under_verification' status
  IF v_pr_id IS NULL THEN
    SELECT 
      mr_number, title, project_id, site_id, required_date, priority, site_block, raised_by, raised_by_name
    INTO 
      v_mr_number, v_mr_title, v_mr_project_id, v_mr_site_id, v_mr_required_date, v_mr_priority, v_mr_site_block, v_mr_raised_by, v_mr_raised_by_name
    FROM public.material_requests
    WHERE id = NEW.material_request_id;

    -- Generate a new PR number using next_document_number sequence RPC
    SELECT public.next_document_number('PR') INTO v_pr_number;
    
    v_pr_id := gen_random_uuid();
    INSERT INTO public.purchase_requisitions (
      id,
      project_id,
      site_id,
      material_request_id,
      pr_number,
      title,
      estimated_cost,
      status,
      requested_date,
      required_date,
      priority,
      pr_type,
      delivery_address,
      created_by_name,
      prepared_by
    ) VALUES (
      v_pr_id,
      v_mr_project_id,
      v_mr_site_id,
      NEW.material_request_id,
      v_pr_number,
      COALESCE(v_mr_title, 'PR for ' || v_mr_number),
      0,
      'under_verification'::erp_procurement_status,
      CURRENT_DATE,
      v_mr_required_date,
      COALESCE(v_mr_priority, 'normal'),
      'material',
      COALESCE(v_mr_site_block, 'Project Site Store'),
      COALESCE(v_mr_raised_by_name, 'Site Engineer'),
      v_mr_raised_by
    );

    -- Automatically transition parent MR status to 'approved'
    UPDATE public.material_requests 
    SET status = 'approved'
    WHERE id = NEW.material_request_id;
  ELSE
    -- If PR exists, ensure status is 'under_verification' (Verified by Site Engineer)
    UPDATE public.purchase_requisitions
    SET status = 'under_verification'::erp_procurement_status
    WHERE id = v_pr_id AND status = 'draft'::erp_procurement_status;
  END IF;

  -- Insert corresponding PR line
  INSERT INTO public.purchase_requisition_lines (
    id,
    purchase_requisition_id,
    project_id,
    material_request_line_id,
    item_id,
    item_description,
    quantity,
    unit,
    item_code,
    item_group,
    specification,
    line_number,
    line_status,
    activity_name,
    activity_code,
    sub_activity_name,
    est_qty,
    ind_qty,
    pr_bal_qty,
    remaining_mr_qty
  ) VALUES (
    gen_random_uuid(),
    v_pr_id,
    NEW.project_id,
    NEW.id,
    NEW.item_id,
    NEW.item_description,
    NEW.quantity,
    NEW.unit,
    NEW.item_code,
    NEW.item_group,
    NEW.specification,
    NEW.line_number,
    'open',
    NEW.activity_name,
    NEW.activity_code,
    NEW.sub_activity_name,
    NEW.quantity,
    NEW.quantity,
    NEW.quantity,
    NEW.quantity
  );

  IF NEW.line_status IS DISTINCT FROM 'approved_for_pr' THEN
    UPDATE public.material_request_lines 
    SET line_status = 'approved_for_pr'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create trigger function to sync parent Material Request status to 'draft' when PR is returned to draft
CREATE OR REPLACE FUNCTION public.handle_pr_status_sync_to_mr()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status::text IN ('draft', 'returned_to_draft')) AND NEW.material_request_id IS NOT NULL THEN
    UPDATE public.material_requests
    SET status = 'draft'
    WHERE id = NEW.material_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pr_status_sync_to_mr ON public.purchase_requisitions;
CREATE TRIGGER trg_pr_status_sync_to_mr
AFTER UPDATE OF status ON public.purchase_requisitions
FOR EACH ROW
EXECUTE FUNCTION public.handle_pr_status_sync_to_mr();
