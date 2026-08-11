-- Migration: Ensure contact columns exist and map site engineer contact number to PR
-- Description:
-- 1. Safely ensures contact columns exist on profiles, material_requests, and purchase_requisitions using ADD COLUMN IF NOT EXISTS.
-- 2. Updates handle_auto_create_draft_pr_line() and handle_mr_submission_from_draft() triggers to fetch the site engineer's registered contact phone number from profiles/material_requests.
-- 3. Backfills site_contact_number for all existing purchase_requisitions from profiles.

BEGIN;

-- 1. Ensure required contact columns exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS mobile text;

ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS raised_by_phone text;

ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS site_contact_person text,
  ADD COLUMN IF NOT EXISTS site_contact_number text;

-- 2. Update handle_auto_create_draft_pr_line function
CREATE OR REPLACE FUNCTION public.handle_auto_create_draft_pr_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  v_mr_raised_by_phone text;

  -- Project Details
  v_project_name text;
  v_project_location text;
  v_project_address text;
  v_project_comm_address text;
  v_project_reg_address text;
  v_project_city text;
  v_project_state text;
  v_project_pincode text;
  v_delivery_address text;

  -- Submitter/Site Engineer Details
  v_profile_name text;
  v_profile_phone text;
  v_site_contact_person text;
  v_site_contact_number text;
BEGIN
  -- Check if PR header already exists for this material_request_id
  SELECT id INTO v_pr_id 
  FROM public.purchase_requisitions 
  WHERE material_request_id = NEW.material_request_id;
  
  -- Look up parent MR details
  SELECT 
    mr_number, title, project_id, site_id, required_date, priority, site_block, raised_by, raised_by_name, raised_by_phone
  INTO 
    v_mr_number, v_mr_title, v_mr_project_id, v_mr_site_id, v_mr_required_date, v_mr_priority, v_mr_site_block, v_mr_raised_by, v_mr_raised_by_name, v_mr_raised_by_phone
  FROM public.material_requests
  WHERE id = NEW.material_request_id;

  -- Fetch Project Details from projects table
  IF v_mr_project_id IS NOT NULL THEN
    SELECT 
      name, location, project_address, communication_address, registered_address, city, state, pincode
    INTO 
      v_project_name, v_project_location, v_project_address, v_project_comm_address, v_project_reg_address, v_project_city, v_project_state, v_project_pincode
    FROM public.projects
    WHERE id = v_mr_project_id;
  END IF;

  -- Construct Delivery Address dynamically from Project Master
  v_delivery_address := COALESCE(
    v_project_address,
    v_project_comm_address,
    v_project_reg_address,
    v_project_location,
    'Project Site Store'
  );
  
  IF v_project_city IS NOT NULL AND v_project_city != '' AND v_delivery_address NOT ILIKE '%' || v_project_city || '%' THEN
    v_delivery_address := v_delivery_address || ', ' || v_project_city;
  END IF;
  IF v_project_pincode IS NOT NULL AND v_project_pincode != '' AND v_delivery_address NOT ILIKE '%' || v_project_pincode || '%' THEN
    v_delivery_address := v_delivery_address || ' - ' || v_project_pincode;
  END IF;

  IF v_mr_site_block IS NOT NULL AND TRIM(v_mr_site_block) != '' THEN
    v_delivery_address := TRIM(v_mr_site_block) || ' • ' || v_delivery_address;
  END IF;

  -- Fetch Submitter / Site Engineer Details from profiles table
  IF v_mr_raised_by IS NOT NULL THEN
    SELECT name, COALESCE(phone, phone_number, mobile)
    INTO v_profile_name, v_profile_phone
    FROM public.profiles
    WHERE id = v_mr_raised_by;
  END IF;

  v_site_contact_person := COALESCE(v_profile_name, v_mr_raised_by_name, 'Site Engineer');
  v_site_contact_number := COALESCE(v_profile_phone, v_mr_raised_by_phone, NULL);

  -- If PR header does not exist, create it in 'under_verification' status
  IF v_pr_id IS NULL THEN
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
      site_contact_person,
      site_contact_number,
      created_by_name,
      prepared_by,
      company_name
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
      v_delivery_address,
      v_site_contact_person,
      v_site_contact_number,
      v_site_contact_person,
      v_mr_raised_by,
      COALESCE(v_project_name, 'Pramukh Group')
    );
  ELSE
    -- If PR header exists, sync header info & update status
    UPDATE public.purchase_requisitions
    SET 
      status = 'under_verification'::erp_procurement_status,
      title = COALESCE(v_mr_title, title),
      required_date = COALESCE(v_mr_required_date, required_date),
      priority = COALESCE(v_mr_priority, priority),
      delivery_address = COALESCE(v_delivery_address, delivery_address),
      site_contact_person = COALESCE(v_site_contact_person, site_contact_person),
      site_contact_number = COALESCE(v_site_contact_number, site_contact_number),
      created_by_name = COALESCE(v_site_contact_person, created_by_name),
      company_name = COALESCE(v_project_name, company_name),
      updated_at = NOW()
    WHERE id = v_pr_id AND (status = 'draft'::erp_procurement_status OR status = 'under_verification'::erp_procurement_status);
  END IF;

  -- Purge orphan PR lines
  DELETE FROM public.purchase_requisition_lines
  WHERE purchase_requisition_id = v_pr_id
    AND (
      material_request_line_id IS NULL
      OR material_request_line_id NOT IN (
        SELECT id FROM public.material_request_lines 
        WHERE material_request_id = NEW.material_request_id
      )
    );

  -- Upsert corresponding PR line
  IF EXISTS (
    SELECT 1 FROM public.purchase_requisition_lines 
    WHERE purchase_requisition_id = v_pr_id AND material_request_line_id = NEW.id
  ) THEN
    UPDATE public.purchase_requisition_lines
    SET
      item_id = NEW.item_id,
      item_description = NEW.item_description,
      quantity = NEW.quantity,
      unit = NEW.unit,
      item_code = NEW.item_code,
      item_group = NEW.item_group,
      specification = NEW.specification,
      line_number = NEW.line_number,
      activity_name = NEW.activity_name,
      activity_code = NEW.activity_code,
      sub_activity_name = NEW.sub_activity_name,
      est_qty = NEW.quantity,
      ind_qty = NEW.quantity,
      pr_bal_qty = NEW.quantity,
      remaining_mr_qty = NEW.quantity,
      updated_at = NOW()
    WHERE purchase_requisition_id = v_pr_id AND material_request_line_id = NEW.id;
  ELSE
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
  END IF;

  IF NEW.line_status IS DISTINCT FROM 'approved_for_pr' THEN
    UPDATE public.material_request_lines 
    SET line_status = 'approved_for_pr'
    WHERE id = NEW.id;
  END IF;

  UPDATE public.material_requests 
  SET status = 'approved'
  WHERE id = NEW.material_request_id AND status != 'approved';

  RETURN NEW;
END;
$function$;

-- 3. Replace handle_mr_submission_from_draft function
CREATE OR REPLACE FUNCTION public.handle_mr_submission_from_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_line record;

  -- Project Master Details
  v_project_name text;
  v_project_location text;
  v_project_address text;
  v_project_comm_address text;
  v_project_reg_address text;
  v_project_city text;
  v_project_state text;
  v_project_pincode text;
  v_delivery_address text;

  -- Submitter/Site Engineer Details
  v_profile_name text;
  v_profile_phone text;
  v_site_contact_person text;
  v_site_contact_number text;
BEGIN
  IF OLD.status = 'draft' AND (NEW.status = 'submitted' OR NEW.status = 'approved') THEN
    SELECT id INTO v_pr_id 
    FROM public.purchase_requisitions 
    WHERE material_request_id = NEW.id;

    -- Fetch Project Details
    IF NEW.project_id IS NOT NULL THEN
      SELECT 
        name, location, project_address, communication_address, registered_address, city, state, pincode
      INTO 
        v_project_name, v_project_location, v_project_address, v_project_comm_address, v_project_reg_address, v_project_city, v_project_state, v_project_pincode
      FROM public.projects
      WHERE id = NEW.project_id;
    END IF;

    -- Construct Delivery Address
    v_delivery_address := COALESCE(
      v_project_address,
      v_project_comm_address,
      v_project_reg_address,
      v_project_location,
      'Project Site Store'
    );
    
    IF v_project_city IS NOT NULL AND v_project_city != '' AND v_delivery_address NOT ILIKE '%' || v_project_city || '%' THEN
      v_delivery_address := v_delivery_address || ', ' || v_project_city;
    END IF;
    IF v_project_pincode IS NOT NULL AND v_project_pincode != '' AND v_delivery_address NOT ILIKE '%' || v_project_pincode || '%' THEN
      v_delivery_address := v_delivery_address || ' - ' || v_project_pincode;
    END IF;

    IF NEW.site_block IS NOT NULL AND TRIM(NEW.site_block) != '' THEN
      v_delivery_address := TRIM(NEW.site_block) || ' • ' || v_delivery_address;
    END IF;

    -- Fetch Submitter / Site Engineer Details
    IF NEW.raised_by IS NOT NULL THEN
      SELECT name, COALESCE(phone, phone_number, mobile)
      INTO v_profile_name, v_profile_phone
      FROM public.profiles
      WHERE id = NEW.raised_by;
    END IF;

    v_site_contact_person := COALESCE(v_profile_name, NEW.raised_by_name, 'Site Engineer');
    v_site_contact_number := COALESCE(v_profile_phone, NEW.raised_by_phone, NULL);

    IF v_pr_id IS NULL THEN
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
        site_contact_person,
        site_contact_number,
        created_by_name,
        prepared_by,
        company_name
      ) VALUES (
        v_pr_id,
        NEW.project_id,
        NEW.site_id,
        NEW.id,
        v_pr_number,
        COALESCE(NEW.title, 'PR for ' || NEW.mr_number),
        0,
        'under_verification'::erp_procurement_status,
        CURRENT_DATE,
        NEW.required_date,
        COALESCE(NEW.priority::text, 'normal'),
        'material',
        v_delivery_address,
        v_site_contact_person,
        v_site_contact_number,
        v_site_contact_person,
        NEW.raised_by,
        COALESCE(v_project_name, 'Pramukh Group')
      );
    ELSE
      UPDATE public.purchase_requisitions
      SET 
        status = 'under_verification'::erp_procurement_status,
        title = COALESCE(NEW.title, title),
        required_date = COALESCE(NEW.required_date, required_date),
        priority = COALESCE(NEW.priority::text, priority),
        delivery_address = COALESCE(v_delivery_address, delivery_address),
        site_contact_person = COALESCE(v_site_contact_person, site_contact_person),
        site_contact_number = COALESCE(v_site_contact_number, site_contact_number),
        created_by_name = COALESCE(v_site_contact_person, created_by_name),
        company_name = COALESCE(v_project_name, company_name),
        updated_at = NOW()
      WHERE id = v_pr_id AND (status = 'draft'::erp_procurement_status OR status = 'under_verification'::erp_procurement_status);
    END IF;

    -- Purge orphan PR lines
    DELETE FROM public.purchase_requisition_lines
    WHERE purchase_requisition_id = v_pr_id
      AND (
        material_request_line_id IS NULL
        OR material_request_line_id NOT IN (
          SELECT id FROM public.material_request_lines 
          WHERE material_request_id = NEW.id
        )
      );

    FOR v_line IN 
      SELECT * FROM public.material_request_lines 
      WHERE material_request_id = NEW.id
      ORDER BY line_number
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.purchase_requisition_lines 
        WHERE purchase_requisition_id = v_pr_id AND material_request_line_id = v_line.id
      ) THEN
        UPDATE public.purchase_requisition_lines
        SET
          item_id = v_line.item_id,
          item_description = v_line.item_description,
          quantity = v_line.quantity,
          unit = v_line.unit,
          item_code = v_line.item_code,
          item_group = v_line.item_group,
          specification = v_line.specification,
          line_number = v_line.line_number,
          activity_name = v_line.activity_name,
          activity_code = v_line.activity_code,
          sub_activity_name = v_line.sub_activity_name,
          est_qty = v_line.quantity,
          ind_qty = v_line.quantity,
          pr_bal_qty = v_line.quantity,
          remaining_mr_qty = v_line.quantity,
          updated_at = NOW()
        WHERE purchase_requisition_id = v_pr_id AND material_request_line_id = v_line.id;
      ELSE
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

        UPDATE public.material_request_lines 
        SET line_status = 'approved_for_pr'
        WHERE id = v_line.id;
      END IF;
    END LOOP;

    NEW.status := 'approved';
    NEW.reviewed_by := NEW.raised_by;
    NEW.reviewed_by_name := NEW.raised_by_name;
    NEW.reviewed_at := NOW();
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Backfill site_contact_number for all purchase_requisitions from profiles
UPDATE public.purchase_requisitions pr
SET site_contact_number = (
  SELECT COALESCE(p.phone, p.phone_number, p.mobile)
  FROM public.profiles p
  WHERE p.id = pr.prepared_by
)
WHERE pr.site_contact_number IS NULL AND pr.prepared_by IS NOT NULL;

COMMIT;
