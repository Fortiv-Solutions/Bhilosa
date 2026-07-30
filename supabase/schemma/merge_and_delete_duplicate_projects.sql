-- ============================================================================
-- PRAMUKH GROUP ERP V2 — PROJECT CONSOLIDATION & CLEANUP SCRIPT (EXHAUSTIVE & BULLETPROOF)
-- File: supabase/schemma/merge_and_delete_duplicate_projects.sql
-- Description: Merges all Procurement, DPRs, Budget, QC, Tasks, and Audit items
--              from duplicate project IDs into the primary Central Park project (CP-001)
--              and safely deletes duplicate project records.
-- ============================================================================

DO $$
DECLARE
  v_primary_id uuid := '00000000-0000-0000-0000-000000000001';
  v_dup_id1 uuid := 'f6704467-df8c-4f51-a49b-ddfdc40c39af';
  v_dup_id2 uuid := '2d3fa751-2a2c-45ec-bf9e-e514079a4f43';

  tbl_name text;
  tbl_array text[] := ARRAY[
    'audit_logs',
    'profiles',
    'project_members',
    'tasks',
    'material_transactions',
    'messages',
    'daily_logs',
    'conversations',
    'conversation_members',
    'message_attachments',
    'rbac_user_roles',
    'entity_attachments',
    'notifications',
    'project_sites',
    'project_phases',
    'cost_codes',
    'budget_heads',
    'budget_allocations',
    'budget_ledger',
    'budget_alerts',
    'boq_items',
    'inventory_locations',
    'stock_balances',
    'stock_ledger',
    'construction_activities',
    'daily_progress_reports',
    'dpr_activity_lines',
    'delay_events',
    'checklists',
    'material_requests',
    'material_request_lines',
    'purchase_requisitions',
    'purchase_requisition_lines',
    'rfqs',
    'rfq_vendors',
    'vendor_quotations',
    'quotation_lines',
    'vendor_selections',
    'purchase_orders',
    'purchase_order_lines',
    'goods_receipt_notes',
    'goods_receipt_note_lines',
    'material_issue_slips',
    'material_issue_lines',
    'work_orders',
    'work_order_lines',
    'labour_attendance',
    'equipment_assets',
    'equipment_usage_logs',
    'qc_inspections',
    'qc_cube_tests',
    'vendor_bills',
    'master_budget_items',
    'budget_categories',
    'budget_variance_items',
    'materials',
    'item_master'
  ];
BEGIN

  -- 1. Ensure Primary Central Park Project (CP-001) Record Exists
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bua_sqft numeric DEFAULT 615000;

  INSERT INTO public.projects (id, code, name, location, bua_sqft, budget_amount, actual_spend_amount, status)
  VALUES (
    v_primary_id,
    'CP-001',
    'Central Park Residential Project',
    'Surat, Gujarat',
    615000,
    1453638820,
    329480000,
    'active'
  ) ON CONFLICT (id) DO NOTHING;

  -- 2. Modify audit_logs Foreign Key constraint to ON DELETE SET NULL
  ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_project_id_fkey;

  ALTER TABLE public.audit_logs 
    ADD CONSTRAINT audit_logs_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

  -- 3. Handle budget_variance_items unique constraint duplicates safely
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'budget_variance_items' AND column_name = 'project_id'
  ) THEN
    DELETE FROM public.budget_variance_items 
    WHERE project_id IN (v_dup_id1, v_dup_id2)
      AND master_budget_item_id IN (
        SELECT master_budget_item_id FROM public.budget_variance_items WHERE project_id = v_primary_id
      );
  END IF;

  -- 4. Dynamically Re-link ALL existing module tables across Supabase database to CP-001
  FOREACH tbl_name IN ARRAY tbl_array LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = tbl_name 
        AND column_name = 'project_id'
    ) THEN
      EXECUTE format(
        'UPDATE public.%I SET project_id = $1 WHERE project_id IN ($2, $3)', 
        tbl_name
      ) USING v_primary_id, v_dup_id1, v_dup_id2;
    END IF;
  END LOOP;

  -- 5. Delete Duplicate Projects cleanly
  DELETE FROM public.projects 
  WHERE id IN (v_dup_id1, v_dup_id2);

END $$;
