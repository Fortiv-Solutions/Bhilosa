-- Migration: Align GST / Tax Rate mapping from Item Master to PR, automatically through trigger, and copy PR tax_rate to RFQ lines
-- Date: 2026-08-11
-- Author: Antigravity

-- 1. Alter rfq_lines tax_rate to drop default of 18
ALTER TABLE public.rfq_lines ALTER COLUMN tax_rate DROP DEFAULT;

-- 2. Update public.handle_auto_create_draft_pr_line to fetch and insert tax_rate from items
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
  v_tax_rate numeric;
BEGIN
  -- 1. Check if a PR header already exists for this material_request_id
  SELECT id INTO v_pr_id 
  FROM public.purchase_requisitions 
  WHERE material_request_id = NEW.material_request_id;
  
  -- 2. If it does not exist, look up MR details and create the PR header
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
      'draft'::erp_procurement_status,
      CURRENT_DATE,
      v_mr_required_date,
      COALESCE(v_mr_priority, 'normal'),
      'material',
      COALESCE(v_mr_site_block, 'Project Site Store'),
      COALESCE(v_mr_raised_by_name, 'Site Engineer'),
      v_mr_raised_by
    );

    -- Automatically transition parent MR status to 'approved' so it appears as Approved in ERP list
    UPDATE public.material_requests 
    SET status = 'approved'
    WHERE id = NEW.material_request_id;
  END IF;

  -- Get tax_rate from items
  v_tax_rate := NULL;
  IF NEW.item_id IS NOT NULL THEN
    SELECT tax_rate INTO v_tax_rate
    FROM public.items
    WHERE id = NEW.item_id;
  ELSIF NEW.item_code IS NOT NULL AND NEW.item_code <> '' THEN
    SELECT tax_rate INTO v_tax_rate
    FROM public.items
    WHERE item_code = NEW.item_code
    LIMIT 1;
  END IF;

  -- 3. Now insert the corresponding PR line
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
    remaining_mr_qty,
    tax_rate
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
    NEW.quantity,
    v_tax_rate
  );

  -- 4. Update the MR line status to approved_for_pr
  IF NEW.line_status IS DISTINCT FROM 'approved_for_pr' THEN
    UPDATE public.material_request_lines 
    SET line_status = 'approved_for_pr'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update public.rpc_create_rfq_from_pr to copy tax_rate from public.purchase_requisition_lines
CREATE OR REPLACE FUNCTION public.rpc_create_rfq_from_pr(
  p_purchase_requisition_id uuid,
  p_vendor_ids              uuid[],
  p_lines                   jsonb,
  p_title                   text DEFAULT NULL,
  p_due_date                date DEFAULT NULL,
  p_terms                   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    uuid := public.app_require_profile();
  v_pr         public.purchase_requisitions;
  v_rfq_id     uuid;
  v_rfq_number text;
  v_line       jsonb;
  v_pr_line    public.purchase_requisition_lines;
  v_qty        numeric;
  v_available  numeric;
  v_count      integer := 0;
  v_vendor     uuid;
  v_vendors    integer := 0;
  v_seen       uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not raise requests for quotation.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id = p_purchase_requisition_id;
  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'Purchase requisition not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pr.status::text <> 'approved' THEN
    RAISE EXCEPTION 'RFQ can be created only after the purchase requisition is approved (current status: %).',
      v_pr.status USING ERRCODE = '22023';
  END IF;

  IF p_vendor_ids IS NULL OR array_length(p_vendor_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one vendor before creating an RFQ.' USING ERRCODE = '22004';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Select at least one requisition line to put out to tender.' USING ERRCODE = '22004';
  END IF;

  -- ---- Header --------------------------------------------------------------
  v_rfq_number := public.next_document_number('RFQ');

  INSERT INTO public.rfqs (
    project_id, purchase_requisition_id, rfq_number, title,
    issue_date, due_date, status, terms, created_by, updated_by
  ) VALUES (
    v_pr.project_id, v_pr.id, v_rfq_number,
    COALESCE(NULLIF(btrim(p_title), ''), v_pr.title, 'Request for Quotation'),
    CURRENT_DATE,
    COALESCE(p_due_date, v_pr.required_date, CURRENT_DATE + 7),
    'rfq_sent'::erp_procurement_status,
    p_terms, v_profile, v_profile
  )
  RETURNING id INTO v_rfq_id;

  -- ---- Lines ---------------------------------------------------------------
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_pr_line
    FROM public.purchase_requisition_lines
    WHERE id = (v_line->>'prLineId')::uuid;

    IF v_pr_line.id IS NULL THEN
      RAISE EXCEPTION 'Requisition line % not found.', v_line->>'prLineId' USING ERRCODE = 'P0002';
    END IF;

    -- A line from a different PR must never end up on this RFQ.
    IF v_pr_line.purchase_requisition_id <> v_pr.id THEN
      RAISE EXCEPTION 'Line % does not belong to requisition %.',
        v_pr_line.item_description, v_pr.pr_number USING ERRCODE = '22023';
    END IF;

    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity for "%" must be greater than zero.',
        v_pr_line.item_description USING ERRCODE = '22004';
    END IF;

    -- Availability is evaluated INSIDE the transaction, so two buyers tendering
    -- the same line concurrently cannot both pass.
    v_available := public.fn_pr_line_available_to_source(v_pr_line.id);
    IF v_qty > v_available + 1e-6 THEN
      RAISE EXCEPTION
        'Cannot tender % of "%": only % remains untendered (ordered %, requisitioned %).',
        v_qty, v_pr_line.item_description, v_available,
        v_pr_line.ordered_qty, v_pr_line.quantity
        USING ERRCODE = '23514';
    END IF;

    v_count := v_count + 1;

    INSERT INTO public.rfq_lines (
      rfq_id, project_id, purchase_requisition_line_id, purchase_requisition_id,
      line_number, item_id, item_code, item_group, item_description, specification,
      preferred_brand, unit, rfq_quantity, estimated_rate,
      activity_name, sub_activity_name, activity_code,
      required_date, remarks, status, created_by, updated_by,
      tax_rate
    ) VALUES (
      v_rfq_id, v_pr.project_id, v_pr_line.id, v_pr.id,
      v_count, v_pr_line.item_id, v_pr_line.item_code, v_pr_line.item_group,
      v_pr_line.item_description, v_pr_line.specification,
      v_pr_line.preferred_brand, COALESCE(v_pr_line.unit, 'nos'),
      v_qty, COALESCE(v_pr_line.estimated_rate, 0),
      v_pr_line.activity_name, v_pr_line.sub_activity_name, v_pr_line.activity_code,
      COALESCE((NULLIF(v_line->>'requiredDate', ''))::date, v_pr_line.required_date, v_pr.required_date),
      NULLIF(v_line->>'remarks', ''),
      'open', v_profile, v_profile,
      v_pr_line.tax_rate
    );

    -- Mark the source line as out to tender, without disturbing a terminal state.
    UPDATE public.purchase_requisition_lines
    SET line_status = CASE
          WHEN line_status IN ('cancelled', 'short_closed', 'fully_ordered') THEN line_status
          ELSE 'in_rfq'
        END,
        updated_at = now(),
        updated_by = v_profile
    WHERE id = v_pr_line.id;
  END LOOP;

  -- ---- Vendors -------------------------------------------------------------
  FOREACH v_vendor IN ARRAY p_vendor_ids LOOP
    CONTINUE WHEN v_vendor IS NULL OR v_vendor = ANY(v_seen);
    v_seen := array_append(v_seen, v_vendor);

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor AND is_active) THEN
      RAISE EXCEPTION 'Vendor % does not exist or is deactivated.', v_vendor USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.rfq_vendors (
      rfq_id, project_id, vendor_id, sent_at, response_status, created_by, updated_by
    ) VALUES (
      v_rfq_id, v_pr.project_id, v_vendor, now(), 'pending'::erp_workflow_status, v_profile, v_profile
    );
    v_vendors := v_vendors + 1;
  END LOOP;

  IF v_vendors = 0 THEN
    RAISE EXCEPTION 'No valid vendors were supplied.' USING ERRCODE = '22004';
  END IF;

  -- ---- PR header -----------------------------------------------------------
  -- Only advance the header while it is still 'approved'. A PR already partially
  -- ordered must not be dragged back to 'rfq_sent' by a top-up RFQ.
  UPDATE public.purchase_requisitions
  SET status = 'rfq_sent'::erp_procurement_status,
      status_changed_at = now(),
      updated_by = v_profile,
      updated_at = now()
  WHERE id = v_pr.id
    AND status::text = 'approved';

  RETURN jsonb_build_object(
    'rfqId', v_rfq_id,
    'rfqNumber', v_rfq_number,
    'lineCount', v_count,
    'vendorCount', v_vendors
  );
END $$;
