-- Auto-create Draft Purchase Requisitions trigger with explicit Draft MR lifecycle support
CREATE OR REPLACE FUNCTION public.handle_auto_create_draft_pr_line()
RETURNS TRIGGER AS $$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_mr_status text;
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
  -- Look up MR details first
  SELECT 
    status::text, mr_number, title, project_id, site_id, required_date, priority, site_block, raised_by, raised_by_name
  INTO 
    v_mr_status, v_mr_number, v_mr_title, v_mr_project_id, v_mr_site_id, v_mr_required_date, v_mr_priority, v_mr_site_block, v_mr_raised_by, v_mr_raised_by_name
  FROM public.material_requests
  WHERE id = NEW.material_request_id;

  -- If the MR is a draft, do not create PR records yet.
  IF v_mr_status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- 1. Check if a PR header already exists for this material_request_id
  SELECT id INTO v_pr_id 
  FROM public.purchase_requisitions 
  WHERE material_request_id = NEW.material_request_id;
  
  -- 2. If it does not exist, create the PR header
  IF v_pr_id IS NULL THEN
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

    -- Transition parent MR status to 'approved' if it was submitted
    IF v_mr_status = 'submitted' THEN
      UPDATE public.material_requests 
      SET status = 'approved'
      WHERE id = NEW.material_request_id;
    END IF;
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

  -- 4. Update the MR line status to approved_for_pr
  IF NEW.line_status IS DISTINCT FROM 'approved_for_pr' THEN
    UPDATE public.material_request_lines 
    SET line_status = 'approved_for_pr'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate Trigger A
DROP TRIGGER IF EXISTS trg_auto_create_draft_pr_line ON public.material_request_lines;
CREATE TRIGGER trg_auto_create_draft_pr_line
AFTER INSERT ON public.material_request_lines
FOR EACH ROW
EXECUTE FUNCTION public.handle_auto_create_draft_pr_line();


-- Trigger B: Auto-create PR when Draft MR is submitted (status updated to 'submitted' or 'approved')
CREATE OR REPLACE FUNCTION public.handle_mr_submission_from_draft()
RETURNS TRIGGER AS $$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_line record;
BEGIN
  -- We only act if the status transitioned from 'draft' to 'submitted' or 'approved'
  IF OLD.status = 'draft' AND (NEW.status = 'submitted' OR NEW.status = 'approved') THEN
    -- Check if a PR already exists (safeguard)
    SELECT id INTO v_pr_id 
    FROM public.purchase_requisitions 
    WHERE material_request_id = NEW.id;

    IF v_pr_id IS NULL THEN
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
        NEW.project_id,
        NEW.site_id,
        NEW.id,
        v_pr_number,
        COALESCE(NEW.title, 'PR for ' || NEW.mr_number),
        0,
        'draft'::erp_procurement_status,
        CURRENT_DATE,
        NEW.required_date,
        COALESCE(NEW.priority, 'normal'),
        'material',
        COALESCE(NEW.site_block, 'Project Site Store'),
        COALESCE(NEW.raised_by_name, 'Site Engineer'),
        NEW.raised_by
      );
    END IF;

    -- Now convert all existing lines of the draft MR to PR lines
    FOR v_line IN 
      SELECT * FROM public.material_request_lines 
      WHERE material_request_id = NEW.id
      ORDER BY line_number
    LOOP
      -- Check if PR line already exists for this MR line
      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_requisition_lines 
        WHERE material_request_line_id = v_line.id
      ) THEN
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
          v_line.id,
          v_line.item_id,
          v_line.item_description,
          v_line.quantity,
          v_line.unit,
          v_line.item_code,
          v_line.item_group,
          v_line.specification,
          v_line.line_number,
          'open',
          v_line.activity_name,
          v_line.activity_code,
          v_line.sub_activity_name,
          v_line.quantity,
          v_line.quantity,
          v_line.quantity,
          v_line.quantity
        );

        -- Set MR line status to approved_for_pr
        UPDATE public.material_request_lines 
        SET line_status = 'approved_for_pr'
        WHERE id = v_line.id;
      END IF;
    END LOOP;

    -- Transition status to 'approved'
    NEW.status := 'approved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger B
DROP TRIGGER IF EXISTS trg_mr_submission_from_draft ON public.material_requests;
CREATE TRIGGER trg_mr_submission_from_draft
BEFORE UPDATE OF status ON public.material_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_mr_submission_from_draft();
