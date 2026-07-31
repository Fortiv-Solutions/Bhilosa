-- ============================================================================
-- PRAMUKH GROUP ERP V2 — DEDUPLICATE & RESTORE EXACT CENTRAL PARK BASELINE (191 ITEMS)
-- File: supabase/schemma/deduplicate_and_restore_exact_excel_baseline.sql
-- Description: Removes the 13 duplicate/legacy test budget items from Supabase
--              restoring the exact 191 baseline items matching Central_Park_Budget (1).xlsx
-- ============================================================================

DO $$
DECLARE
  v_proj_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- 1. Remove duplicate items (ID list identified from merger audit)
  DELETE FROM public.budget_variance_items 
  WHERE master_budget_item_id IN (
    'bd2e2b95-fdeb-41f7-8931-a1fb99a93dd3',
    '66293c96-e4fd-42d9-b83d-3268216b8534',
    '596dcd99-d5c3-4dee-ae66-69cf8d07a740',
    '06bf3dcc-2879-4ad3-b591-0efc76687850',
    '398a25c3-c4a1-42b5-8289-7746fdad3e44',
    'c24faa68-b644-414d-843c-726232075165',
    '2ee0ca09-2af3-4455-8443-ff8388c41e99',
    '7e2fd48c-b409-4c66-8f30-cacd03c3129e',
    '234b6860-a6f6-42a6-a984-fbebdef4a8bb',
    '06deb73d-0eac-4dfc-8ec9-4cdddb5dee55',
    '5cff8c43-bf17-4dc0-830d-a6adddcf39e3',
    '8f970841-49b6-47da-b95a-1b0748347c3d',
    '91b12f3a-5f86-47b1-b73c-376d6198b3eb'
  );

  DELETE FROM public.master_budget_items 
  WHERE id IN (
    'bd2e2b95-fdeb-41f7-8931-a1fb99a93dd3',
    '66293c96-e4fd-42d9-b83d-3268216b8534',
    '596dcd99-d5c3-4dee-ae66-69cf8d07a740',
    '06bf3dcc-2879-4ad3-b591-0efc76687850',
    '398a25c3-c4a1-42b5-8289-7746fdad3e44',
    'c24faa68-b644-414d-843c-726232075165',
    '2ee0ca09-2af3-4455-8443-ff8388c41e99',
    '7e2fd48c-b409-4c66-8f30-cacd03c3129e',
    '234b6860-a6f6-42a6-a984-fbebdef4a8bb',
    '06deb73d-0eac-4dfc-8ec9-4cdddb5dee55',
    '5cff8c43-bf17-4dc0-830d-a6adddcf39e3',
    '8f970841-49b6-47da-b95a-1b0748347c3d',
    '91b12f3a-5f86-47b1-b73c-376d6198b3eb'
  );

  -- 2. Re-sync Master Items to Variance Items for clean 1-to-1 baseline mapping
  PERFORM public.fn_sync_master_item_to_variance();

END $$;
