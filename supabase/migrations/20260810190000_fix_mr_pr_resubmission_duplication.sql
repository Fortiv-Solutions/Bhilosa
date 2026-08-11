-- Migration: Fix MR to PR resubmission duplication & line item synchronization
-- Description:
-- 1. Updates foreign key delete rule on purchase_requisition_lines to CASCADE delete linked PR lines when MR lines are deleted.
-- 2. Enhances handle_auto_create_draft_pr_line() to purge orphan PR lines and upsert existing PR lines instead of blindly inserting duplicates.
-- 3. Enhances handle_mr_submission_from_draft() to synchronize headers, purge orphan PR lines, and upsert PR lines cleanly.
-- 4. Cleans up existing orphan PR lines in database.

BEGIN;

-- 1. Update Foreign Key Constraint to ON DELETE CASCADE
ALTER TABLE public.purchase_requisition_lines
  DROP CONSTRAINT IF EXISTS purchase_requisition_lines_material_request_line_id_fkey;

ALTER TABLE public.purchase_requisition_lines
  ADD CONSTRAINT purchase_requisition_lines_material_request_line_id_fkey
  FOREIGN KEY (material_request_line_id)
  REFERENCES public.material_request_lines(id)
  ON DELETE CASCADE;

-- 2. Clean up existing orphan PR lines
DELETE FROM public.purchase_requisition_lines prl
USING public.purchase_requisitions pr
WHERE prl.purchase_requisition_id = pr.id
  AND pr.material_request_id IS NOT NULL
  AND (
    prl.material_request_line_id IS NULL
    OR prl.material_request_line_id NOT IN (
      SELECT id FROM public.material_request_lines WHERE material_request_id = pr.material_request_id
    )
  );

-- 3. Replace handle_auto_create_draft_pr_line function
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
BEGIN
  -- 1. Check if a PR header already exists for this material_request_id
  SELECT id INTO v_pr_id 
  FROM public.purchase_requisitions 
  WHERE material_request_id = NEW.material_request_id;
  
  -- Look up parent MR details
  SELECT 
    mr_number, title, project_id, site_id, required_date, priority, site_block, raised_by, raised_by_name
  INTO 
    v_mr_number, v_mr_title, v_mr_project_id, v_mr_site_id, v_mr_required_date, v_mr_priority, v_mr_site_block, v_mr_raised_by, v_mr_raised_by_name
  FROM public.material_requests
  WHERE id = NEW.material_request_id;

  -- 2. If PR header does not exist, create it in 'under_verification' status
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
  ELSE
    -- If PR header exists, ensure status is updated from 'draft' to 'under_verification' and header info synced
    UPDATE public.purchase_requisitions
    SET 
      status = 'under_verification'::erp_procurement_status,
      title = COALESCE(v_mr_title, title),
      required_date = COALESCE(v_mr_required_date, required_date),
      priority = COALESCE(v_mr_priority, priority),
      delivery_address = COALESCE(v_mr_site_block, delivery_address),
      updated_at = NOW()
    WHERE id = v_pr_id AND (status = 'draft'::erp_procurement_status OR status = 'under_verification'::erp_procurement_status);
  END IF;

  -- 3. Purge any orphan PR lines for this PR whose material_request_line_id is NULL or no longer exists in material_request_lines
  DELETE FROM public.purchase_requisition_lines
  WHERE purchase_requisition_id = v_pr_id
    AND (
      material_request_line_id IS NULL
      OR material_request_line_id NOT IN (
        SELECT id FROM public.material_request_lines 
        WHERE material_request_id = NEW.material_request_id
      )
    );

  -- 4. Upsert/Reconcile corresponding PR line for NEW.id
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

  -- 5. Mark MR line status as approved_for_pr
  IF NEW.line_status IS DISTINCT FROM 'approved_for_pr' THEN
    UPDATE public.material_request_lines 
    SET line_status = 'approved_for_pr'
    WHERE id = NEW.id;
  END IF;

  -- 6. Ensure parent MR status is approved (PR created)
  UPDATE public.material_requests 
  SET status = 'approved'
  WHERE id = NEW.material_request_id AND status != 'approved';

  RETURN NEW;
END;
$function$;

-- Attach trigger for INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_auto_create_draft_pr_line ON public.material_request_lines;
CREATE TRIGGER trg_auto_create_draft_pr_line
AFTER INSERT OR UPDATE ON public.material_request_lines
FOR EACH ROW
EXECUTE FUNCTION handle_auto_create_draft_pr_line();

-- 4. Replace handle_mr_submission_from_draft function
CREATE OR REPLACE FUNCTION public.handle_mr_submission_from_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_line record;
BEGIN
  IF OLD.status = 'draft' AND (NEW.status = 'submitted' OR NEW.status = 'approved') THEN
    SELECT id INTO v_pr_id 
    FROM public.purchase_requisitions 
    WHERE material_request_id = NEW.id;

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
        'under_verification'::erp_procurement_status,
        CURRENT_DATE,
        NEW.required_date,
        COALESCE(NEW.priority::text, 'normal'),
        'material',
        COALESCE(NEW.site_block, 'Project Site Store'),
        COALESCE(NEW.raised_by_name, 'Site Engineer'),
        NEW.raised_by
      );
    ELSE
      UPDATE public.purchase_requisitions
      SET 
        status = 'under_verification'::erp_procurement_status,
        title = COALESCE(NEW.title, title),
        required_date = COALESCE(NEW.required_date, required_date),
        priority = COALESCE(NEW.priority::text, priority),
        delivery_address = COALESCE(NEW.site_block, delivery_address),
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

COMMIT;
