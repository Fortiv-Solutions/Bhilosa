-- ============================================================================
-- PRAMUKH GROUP ERP V2 — RESET BUDGET MODULE TO CENTRAL PARK BASELINE ONLY
-- File: supabase/schemma/reset_budget_module_to_central_park_baseline.sql
-- Description: Wipes out test budget ledger, test change order revisions, test allocations,
--              and test alerts. Keeps ONLY the official 24-category Central Park Master Budget
--              baseline and its synchronized Variance structure.
-- ============================================================================

DO $$
DECLARE
  v_proj_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- 1. Truncate / Clear Test Ledger, Revisions, Allocations, and Alerts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_ledger') THEN
    DELETE FROM public.budget_ledger WHERE project_id = v_proj_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_revision_items') THEN
    DELETE FROM public.budget_revision_items;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_revisions') THEN
    DELETE FROM public.budget_revisions WHERE project_id = v_proj_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_allocations') THEN
    DELETE FROM public.budget_allocations WHERE project_id = v_proj_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_alerts') THEN
    DELETE FROM public.budget_alerts WHERE project_id = v_proj_id;
  END IF;

  -- 2. Remove any legacy or orphan budget items NOT belonging to Central Park project (v_proj_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_variance_items') THEN
    DELETE FROM public.budget_variance_items WHERE project_id <> v_proj_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_budget_items') THEN
    DELETE FROM public.master_budget_items WHERE project_id <> v_proj_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_categories') THEN
    DELETE FROM public.budget_categories WHERE project_id <> v_proj_id;
  END IF;

  -- 3. Reset Master Budget Items version_number to 1 for pristine baseline state
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'master_budget_items') THEN
    UPDATE public.master_budget_items 
    SET version_number = 1 
    WHERE project_id = v_proj_id;
  END IF;

  -- 4. Re-sync Master Items to Variance Items for complete Central Park baseline coverage
  PERFORM public.fn_sync_master_item_to_variance();

END $$;
