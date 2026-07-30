-- ============================================================================
-- PRAMUKH GROUP ERP V2 — CENTRAL PARK MASTER BUDGET SEED DATA (FULL 24 CATEGORIES)
-- File: supabase/schemma/insert_central_park_budget_data.sql
-- Description: Complete SQL script to insert all 24 categories and line items
--              for Central Park Project into Supabase master_budget_items & categories.
-- ============================================================================

DO $$
DECLARE
  v_proj_id uuid := '00000000-0000-0000-0000-000000000001';
  v_cat_id uuid;
BEGIN

  -- 1. Ensure Central Park Project Record Exists & Columns Exist on Pre-existing Tables
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bua_sqft numeric DEFAULT 615000;

  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.budget_categories(id) ON DELETE CASCADE;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS category_name text;
  ALTER TABLE public.master_budget_items ALTER COLUMN category_name DROP NOT NULL;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS sr_no text DEFAULT '1';
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS item_description text;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS qty_rcc numeric DEFAULT 0;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS qty_finishes numeric DEFAULT 0;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS qty_infra numeric DEFAULT 0;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS qty_total numeric DEFAULT 1;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS unit text DEFAULT 'LS';
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS estimated_rate numeric DEFAULT 0;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS budgeted_cost numeric DEFAULT 0;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS cost_per_bua numeric DEFAULT 0;
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS scope_tag text DEFAULT 'site_infra';
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'material';
  ALTER TABLE public.master_budget_items ADD COLUMN IF NOT EXISTS version_number integer DEFAULT 1;

  -- Ensure Unique Index exists on pre-existing budget_variance_items table for ON CONFLICT target
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unq_variance_project_item ON public.budget_variance_items (project_id, master_budget_item_id);

  INSERT INTO public.projects (id, code, name, location, bua_sqft, budget_amount, actual_spend_amount, status)
  VALUES (
    v_proj_id,
    'CP-001',
    'Central Park Residential Project',
    'Surat, Gujarat',
    615000,
    1453638820,
    329480000,
    'active'
  ) ON CONFLICT (id) DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 1: Site Development/Pre-Construction Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Site Development/Pre-Construction Work', 'SITE_DEVELOPMEN', 1)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Site Development/Pre-Construction Work', '1', 'Temporary Site Barrication/Pre.Const. Work', NULL, NULL, 1, 1, 'LS', 500000, 500000, 0.81, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Site Development/Pre-Construction Work', '2', 'Intial Site Development (Hoarding/Site Office/Leveling/Cleaning)', NULL, NULL, 1, 1, 'LS', 5500000, 5500000, 8.94, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Site Development/Pre-Construction Work', '3', 'GSB/Chaaru/Slag', NULL, NULL, 1, 1, 'LS', 1500000, 1500000, 2.44, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 2: Excavation/Backfilling and D-Wall/Pile Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Excavation/Backfilling and D-Wall/Pile Work', 'EXCAVATION_BACK', 2)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Excavation/Backfilling and D-Wall/Pile Work', '1', 'Excavation/Backfilling', NULL, NULL, NULL, 1, 'LS', 4480000, 4480000, 7.28, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Excavation/Backfilling and D-Wall/Pile Work', '2', 'JCB/Poclain (Labour)', NULL, NULL, 1, 1, 'LS', 1650000, 1650000, 2.68, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Excavation/Backfilling and D-Wall/Pile Work', '3', 'De-Watering', NULL, NULL, 1, 1, 'LS', 750000, 750000, 1.22, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Excavation/Backfilling and D-Wall/Pile Work', '2', 'Diapharm Wall', NULL, NULL, NULL, 1, 'LS', 46000000, 46000000, 74.8, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 3: Civil Works
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Civil Works', 'CIVIL_WORKS', 3)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Civil Works', '1', 'Civil Labour Cost', 615000, NULL, NULL, 615000, 'Sqft', 1233.1, 758356500, 1233.1, 'building_rcc', 'labour'),
  (v_proj_id, v_cat_id, 'Civil Works', '2', 'Rate Difference - (1.5% of Civil Cost)', NULL, NULL, NULL, 615000, 'Sqft', 18.5, 11375347, 18.5, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Civil Works', '3', 'Above Terrace Elevation Cost', NULL, NULL, NULL, 1, 'LS', 8500000, 8500000, 13.82, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Civil Works', '4', 'Core Cutting Cost', NULL, NULL, NULL, 1, 'LS', 420000, 420000, 0.68, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Civil Works', '5', 'Expansion Sheet', NULL, NULL, NULL, 1, 'LS', 280000, 280000, 0.46, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Civil Works', '6', 'Rebar Cost', NULL, NULL, NULL, 1, 'LS', 2400000, 2400000, 3.9, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 4: Civil Materials
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Civil Materials', 'CIVIL_MATERIALS', 4)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Civil Materials', '1', 'Cement - (Flooring Work+ Toilets,Terrace,Water Tanks,Podium Water Proofing)', NULL, 46792.04, NULL, 46792.04, 'Bags', 325, 15207414, 24.73, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Civil Materials', '2', 'Sand - (Flooring Work+Toilets,Terrace,Water Tanks,Podium Water Proofing)', NULL, 14475.62, NULL, 14475.62, 'Ton', 1250, 18094527, 29.42, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Civil Materials', '3', 'Metal 10mm & 20mm - (Terrace,Water Tanks,Podium Water Proofing)', NULL, 3192.48, NULL, 3192.48, 'Ton', 1200, 3830981, 6.23, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Civil Materials', '4', 'Bricks-Waterproofing - (Toilets,Terrace,Water Tanks,Podium Water Proofing)', NULL, 530606, NULL, 530606, 'Nos.', 8, 4244848, 6.9, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Civil Materials', '5', 'Chemical Bag For Tiles Cladding (All Toilets,Wash Area, Kitchen Wall Dedo)', NULL, 14440.06, NULL, 14440.06, 'Nos.', 435, 6281426, 10.21, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Civil Materials', '6', 'Chemical Bag for Tile Flooring (6''X4'' Flooring and 32" X 64")', NULL, 12500, NULL, 12500, 'Nos.', 435, 5437500, 8.84, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 5: Waterproofing
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Waterproofing', 'WATERPROOFING', 5)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Waterproofing', '1', 'Water Proofing Chemical PIDIFIN-90 Kg Set-(Flat-Toilet-Wash-Balcony)', NULL, 452.13, NULL, 452.13, 'Bags.', 6796.8, 3073013, 5, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Waterproofing', '2', 'Water Proofing Terrace, UGWT & OHWT Chemical Labour + Material-(Base Coat)', NULL, 42405.85, NULL, 42405.85, 'Sqft', 133, 5639979, 9.17, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Waterproofing', '3', 'Water Proofing Basement Retaining Wall', NULL, 9500, NULL, 9500, 'Sqft', 82.6, 784700, 1.28, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Waterproofing', '4', 'GF. Floor Podium+1st Floor Water Proofing', NULL, 42900, NULL, 42900, 'Sqft', 118, 5062200, 8.23, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Waterproofing', '5', 'Expansion Joint Treatment', NULL, 210, NULL, 210, 'Rmt', 6500, 1365000, 2.22, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 6: Texture & Colour Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Texture & Colour Work', 'TEXTURE_AND_COL', 6)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '1', 'Flat Internal Putty Work (Labour)', NULL, 713057.13, NULL, 713057.13, 'Sqft', 7.08, 5048444, 8.21, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '2', 'Common Passage & Staircase Wall Texture & Colour Work', NULL, 135784.72, NULL, 135784.72, 'Sqft', 27.14, 3685197, 5.99, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '3', 'Common Passage Ceiling Colour Work', NULL, 61008.63, NULL, 61008.63, 'Sqft', 28.32, 1727764, 2.81, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '4', 'Lower + Upper  Basement + Gr Floor (Ceiling) Wall and Column & Slab - Birla Putty + Colour Work (Lab + Mat)', NULL, 155609.77, NULL, 155609.77, 'Sqft', 19.47, 3029722, 4.93, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '5', 'Gr. Floor Colour (Labour + Material)', NULL, 96040.63, NULL, 96040.63, 'Sqft', 28.32, 2719871, 4.42, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '6', 'Gr. Floor Column Texture  (Labour + Material)', NULL, 34984.75, NULL, 34984.75, 'Sqft', 27.14, 949486, 1.54, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '7', 'Ramp Wall Colour (Labour + Material)', NULL, 8060.85, NULL, 8060.85, 'Sqft', 28.32, 228283, 0.37, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '8', 'External Texture Colour + Primer (Labour + Material)', NULL, 434632.78, NULL, 434632.78, 'Sqft', 35.4, 15386000, 25.02, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Texture & Colour Work', '9', 'Oil Paint', NULL, 35000, NULL, 35000, 'Sqft', 25, 875000, 1.42, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 7: Gypsum Punning and False Ceiling
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Gypsum Punning and False Ceiling', 'GYPSUM_PUNNING_', 7)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Gypsum Punning and False Ceiling', '1', 'False Ceiling (Common Passage)', NULL, 31021.85, NULL, 31021.85, 'Sqft', 76.7, 2379376, 3.87, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 8: Stone and Tiles Work Material
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Stone and Tiles Work Material', 'STONE_AND_TILES', 8)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '1', 'Flat Door/Window Frames, Kitchen Platform, Balcony Patta, Washbasin Shelf, Threshold - (Granite)  (Material)', NULL, 102953, NULL, 102953, 'Sqft', 84.96, 8746887, 14.22, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '2', 'Window Frames and Kitchen Platform and Vertical - Pink Marble (Material)', NULL, 24498, NULL, 24498, 'Sqft', 49.56, 1214121, 1.97, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '3', 'Flooring Vestibule, Living Room, Kitchen & Dining Room - (6'' x 4'') Tiles (Material)', NULL, 130944.64, NULL, 130944.64, 'Sqft', 68.44, 8961851, 14.57, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '4', 'Skirting Vestibule, Living Room, Kitchen & Dining Room - (6'' X 4'') Tiles (Material)-Skirting', NULL, 6444.82, NULL, 6444.82, 'Sqft', 68.44, 441084, 0.72, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '5', 'Flooring All Bedroom (1,2,3 and 4) - 32" X 64" Tiles (Material)', NULL, 112892.86, NULL, 112892.86, 'Sqft', 47.2, 5328543, 8.66, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '6', 'Flooring All Bedroom (1,2,3 and 4) -  32" X 64" Tiles (Material)-Skirting', NULL, 9666.63, NULL, 9666.63, 'Sqft', 47.2, 456265, 0.74, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '7', 'Flooring All Toilet,Wash Area -  2'' X 4'' Tiles  (Material)', NULL, 34541.43, NULL, 34541.43, 'Sqft', 47.2, 1630356, 2.65, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '8', 'Dado All Toilet, Wash Area & Kitchen - 2'' X 4''  Tiles (Material)', NULL, 298064.94, NULL, 298064.94, 'Sqft', 47.2, 14068665, 22.88, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '9', 'Flooring Balcony Deck - 200 X 1200 Tiles (Material)', NULL, 17260.46, NULL, 17260.46, 'Sqft', 64.9, 1120204, 1.82, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '10', 'Common Passage Flooring - 600 X 1200 Tiles (Material)', NULL, 35165.99, NULL, 35165.99, 'Sqft', 43.66, 1535347, 2.5, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '11', 'Common Passage Dado - 600 X 1200 Tiles (Material)', NULL, 20468, NULL, 20468, 'Sqft', 43.66, 893633, 1.45, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '12', 'Staircase Granite', NULL, 52555.05, NULL, 52555.05, 'Sqft', 84.96, 4465077, 7.26, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '13', 'Staircase Mid Landing Flooring', NULL, 16716, NULL, 16716, 'Sqft', 47.2, 788995, 1.28, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '14', 'Comm Passage Lift Frame, Duct Frames - Granite', NULL, 10306.79, NULL, 10306.79, 'Sqft', 84.96, 875665, 1.42, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '15', 'Building Portion Parking Tiles-Material', NULL, 13794.07, NULL, 13794.07, 'Sqft', 53.1, 732465, 1.19, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '16', 'Ground Floor Non Building Parking Portion Tiles', NULL, 27429.71, NULL, 27429.71, 'Sqft', 53.1, 1456517, 2.37, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Material', '17', 'Building Parking Around Granite Patta', NULL, 2239.29, NULL, 2239.29, 'Sqft', 84.96, 190250, 0.31, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 9: Stone and Tiles Work Labour
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Stone and Tiles Work Labour', 'STONE_AND_TILES', 9)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '1', 'Flat Door/Window Frames /Commen Passage Elevation Frame/Staircase passage window Frame//Service Duct/W.B. Shelves Lift Frames - (Granite)', NULL, 159017.61, NULL, 159017.61, 'Rft', 75, 11926321, 19.39, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '2', 'Flat Window Frame Work Pink Marble - Labour', NULL, 42351.62, NULL, 42351.62, 'Rft', 50, 2117581, 3.44, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '3', 'Frame Dhar Polish Labour (Lift Door, Door & Window Frame, Balcony Sill)', NULL, 208456.69, NULL, 208456.69, 'Rft', 18.88, 3935662, 6.4, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '4', 'Kitchen Platform (Granite) (Material)', NULL, 4054.71, NULL, 4054.71, 'Rft', 1050, 4257445, 6.92, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '5', 'Flooring Vestibule, Living Room, Kitchen & Dining Room - 6'' X 4'' Tiles (Labour)', NULL, 119040.58, NULL, 119040.58, 'Sqft', 80, 9523247, 15.48, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '6', 'Skirting Vestibule, Living Room, Kitchen & Dining Room - 6'' X 4'' Tiles (Labour)', NULL, 23804.4, NULL, 23804.4, 'Rft', 85, 2023374, 3.29, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '7', 'Flooring All Bedroom - 32" X 64" Tiles (Labour)', NULL, 102629.87, NULL, 102629.87, 'Sqft', 65, 6670942, 10.85, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '8', 'Skirting All Bedroom - 32" X 64" Tiles (Labour)', NULL, 35704.37, NULL, 35704.37, 'Rft', 68, 2427897, 3.95, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '9', 'Flooring All Toilet, Wash Area, Store Room 2'' X 4'' Tiles (Labour)', NULL, 31401.3, NULL, 31401.3, 'Sqft', 45, 1413059, 2.3, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '10', 'Dado All Toilet, Wash Area & Kitchen 2'' X 4'' Tiles  (Labour)', NULL, 270968.13, NULL, 270968.13, 'Sqft', 50, 13548406, 22.03, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '11', 'Flooring Balcony - 200 X 1200 Tiles (Labour)', NULL, 15691.33, NULL, 15691.33, 'Sqft', 51.92, 814694, 1.32, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '12', 'Living Room Balcony Sill - Granite Patta (Labour)', NULL, 4235.14, NULL, 4235.14, 'Rft', 75, 317635, 0.52, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '13', 'Bedroom Standing Balcony Sill - Granite Patta (Labour)', NULL, 20088.85, NULL, 20088.85, 'Rft', 75, 1506664, 2.45, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '14', 'Common Passage Flooring - 600 X 1200 Tiles (Labour)', NULL, 31969.08, NULL, 31969.08, 'Sqft', 45, 1438609, 2.34, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '15', 'Common Passage Dado - 600 X 1200 Tiles (Labour)', NULL, 18607.27, NULL, 18607.27, 'Sqft', 50, 930364, 1.51, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '16', 'Staircase Granite With Mid Landing Flooring Work Labour', NULL, 54897.64, NULL, 54897.64, 'Sqft', 75, 4117323, 6.69, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '17', 'Staircase Riser and Tread Moulding Work Labour', NULL, 40362.37, NULL, 40362.37, 'Rft', 75, 3027178, 4.92, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '18', 'Building Portion Parking Tiles-Material', NULL, 12540.06, NULL, 12540.06, 'Sqft', 33.04, 414324, 0.67, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '19', 'Ground Floor Non Building Parking Portion Tiles', NULL, 24936.1, NULL, 24936.1, 'Sqft', 33.04, 823889, 1.34, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '20', 'Building Parking Around Granite Patta', NULL, 5274.24, NULL, 5274.24, 'Rft', 41.3, 217826, 0.35, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '21', 'Flooring PCC Work - Labour', NULL, NULL, NULL, 221670.46, 'Sqft', 17, 3768398, 6.13, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '23', 'Joint Filling - Epoxy', NULL, 362143.29, NULL, 362143.29, 'Rft', 8, 2897146, 4.71, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Stone and Tiles Work Labour', '24', 'Miscellaneous Items (Spacers, Fevikwick etc)', NULL, 1, NULL, 1, 'LS', 1000000, 1000000, 1.63, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 10: Electrical
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Electrical', 'ELECTRICAL', 10)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Electrical', '1', 'Electrical Works Flat (Material + Labour)-3BHK', NULL, 102, NULL, 102, 'Nos.', 123900, 12637800, 20.55, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '2', 'Electrical Works Flat (Material + Labour)-4BHK', NULL, 64, NULL, 64, 'Nos.', 141600, 9062400, 14.74, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '3', 'Electrical Works Flat (Material + Labour)-PENTHOUSE-A-D Building', NULL, 4, NULL, 4, 'Nos.', 165200, 660800, 1.07, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '4', 'Electrical Works Flat (Material + Labour)-PENTHOUSE-B-C Building', NULL, 6, NULL, 6, 'Nos.', 171100, 1026600, 1.67, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '5', 'Commom Passage & Staircase Landing Lights', NULL, 540, NULL, 540, 'Nos.', 1200, 648000, 1.05, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '6', 'D.G. Set', NULL, 1, NULL, 2, 'Nos.', 1770000, 3540000, 5.76, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '7', 'Street Lights', NULL, 45, NULL, 45, 'Nos.', 23600, 1062000, 1.73, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '8', 'Garden Lights Bollards', NULL, 25, NULL, 25, 'Nos.', 9440, 236000, 0.38, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '9', 'Foot Lights - Ramps/Planters', NULL, 100, NULL, 100, 'Nos.', 2655, 265500, 0.43, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '10', 'LED Strip Light', NULL, 250, NULL, 250, 'Rmt', 1600, 400000, 0.65, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '11', 'Main Entry Gate Lights', NULL, 10, NULL, 10, 'Nos.', 3000, 30000, 0.05, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '12', 'Watchman Cabin Lights', NULL, 6, NULL, 6, 'Nos.', 1200, 7200, 0.01, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '13', 'Parking Lights Basement-Ground Floor (Lab + Mat)', NULL, 450, NULL, 450, 'Nos.', 1000, 450000, 0.73, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '14', 'Compound Wall Bracket Lights', NULL, 135, NULL, 135, 'Nos.', 3000, 405000, 0.66, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '15', 'Spike Lights', NULL, 100, NULL, 100, 'Nos.', 2950, 295000, 0.48, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '16', 'Decorative Lights', NULL, 4, NULL, 4, 'LS', 150000, 600000, 0.98, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '17', 'LT Cables & Other Materials', NULL, 600, NULL, 600, 'Rmt', 1750, 1050000, 1.71, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '18', 'Cable Tray', NULL, 600, NULL, 600, 'Rmt', 1200, 720000, 1.17, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '19', 'CAT 6 Wire + Labour', NULL, 1, NULL, 1, 'LS', 400000, 400000, 0.65, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '20', 'Meter Room Electric Panel', NULL, 5, NULL, 5, 'LS', 324500, 1622500, 2.64, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Electrical', '21', 'Basement & COP Electric Work Labour with Material', NULL, 1, NULL, 1, 'LS', 3750000, 3750000, 6.1, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '22', 'Temporary Site Work', NULL, 1, NULL, 1, 'LS', 2000000, 2000000, 3.25, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Electrical', '23', 'RMU Cost', NULL, 2, NULL, 2, 'Nos', 1250000, 2500000, 4.07, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 11: Plumbing
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Plumbing', 'PLUMBING', 11)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Plumbing', '1', 'CP & Sanitary Fittings (Material + Labour)-3BHK', NULL, 102, NULL, 102, 'Nos.', 85000, 8670000, 14.1, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '2', 'CP & Sanitary Fittings (Material + Labour)-4BHK', NULL, 64, NULL, 64, 'Nos.', 110000, 7040000, 11.45, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '3', 'CP & Sanitary Fittings (Material + Labour)-PENTHOUSE-A-D Building', NULL, 4, NULL, 4, 'Nos.', 130000, 520000, 0.85, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '4', 'CP & Sanitary Fittings (Material + Labour)-PENTHOUSE-B-C Building', NULL, 6, NULL, 6, 'Nos.', 130000, 780000, 1.27, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '5', 'Plumbing Materials - Inside Flat and Vertical Lines Work (Upvc/Cpvc, PVC Pipes, Valves, Traps, Clamps, MABT, FABT, PRV, ARV, Solonide, Rack Bolts, Tafflon Tape, Whitec Cement, Canvas Pipes, Temp Motors for Dewatering, Borewell etc.)', NULL, NULL, NULL, 615000, 'Sqft', 40, 24600000, 40, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '6', 'FRP ManHole Cover', NULL, NULL, NULL, 150, 'Nos.', 8000, 1200000, 1.95, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '7', 'Basement Storm WaterLine Material', NULL, NULL, NULL, 1, 'LS', 750000, 750000, 1.22, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '8', 'Podium-Basement Storm Water Line Material', NULL, NULL, NULL, 1, 'LS', 530000, 530000, 0.86, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '9', 'Water Supply Looping Line Work Material', NULL, NULL, NULL, 1, 'LS', 1200000, 1200000, 1.95, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '10', 'Outer Drainage Line Work Material', NULL, NULL, NULL, 1, 'LS', 1100000, 1100000, 1.79, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '11', 'Planter Drain and Water Supply Line Material', NULL, NULL, NULL, 1, 'LS', 530000, 530000, 0.86, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '12', 'Basement Storm WaterLine Labour', NULL, NULL, NULL, 1, 'LS', 600000, 600000, 0.98, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '13', 'Podium-Basement Storm Water Line Labour', NULL, NULL, NULL, 1, 'LS', 350000, 350000, 0.57, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '14', 'Water Supply Looping Line Work Labour', NULL, NULL, NULL, 1, 'LS', 750000, 750000, 1.22, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '15', 'Outer Drainage Line Work Labour', NULL, NULL, NULL, 1, 'LS', 600000, 600000, 0.98, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '16', 'Planter Drain and Water Supply Line Labour', NULL, NULL, NULL, 1, 'LS', 150000, 150000, 0.24, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '17', 'Pnematic Pumps', NULL, NULL, NULL, 1, 'LS', 7000000, 7000000, 11.38, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '18', 'Water Tankers', NULL, NULL, NULL, 1, 'LS', 1100000, 1100000, 1.79, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '19', 'Construction Water Pumping System', NULL, NULL, NULL, 1, 'LS', 250000, 250000, 0.41, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '20', 'Temporary Line and Borewell Cost', NULL, NULL, NULL, 1, 'LS', 700000, 700000, 1.14, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '21', 'Mud Pumps', NULL, NULL, NULL, 1, 'LS', 450000, 450000, 0.73, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Plumbing', '22', 'Plumbing Labour-(Material + Labour)-3BHK', NULL, 102, NULL, 102, 'Nos.', 60000, 6120000, 9.95, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '23', 'Plumbing Labour-(Material + Labour)-4BHK', NULL, 64, NULL, 64, 'Nos.', 80000, 5120000, 8.33, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '24', 'Plumbing Labour-(Material + Labour)-PENTHOUSE-A-D Building', NULL, 4, NULL, 4, 'Nos.', 105000, 420000, 0.68, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Plumbing', '25', 'Plumbing Labour-(Material + Labour)-PENTHOUSE-B-C Building', NULL, 6, NULL, 6, 'Nos.', 105000, 630000, 1.02, 'building_finishes', 'labour')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 12: Fabrication Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Fabrication Work', 'FABRICATION_WOR', 12)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Fabrication Work', '1', 'AC Platforms', NULL, 364, NULL, 364, 'Nos.', 5000, 1820000, 2.96, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '2', 'Staircase Railing', NULL, 8, NULL, 8, 'Nos.', 500000, 4000000, 6.5, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '3', 'Lanndscape Gazebo', NULL, NULL, 2, 2, 'Nos.', 450000, 900000, 1.46, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '4', 'Top Duct Covering', NULL, 4, NULL, 4, 'LS', 150000, 600000, 0.98, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '5', 'Temporary Site Barrication', NULL, NULL, 1, 1, 'LS', 250000, 250000, 0.41, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '6', 'Terrace & Pumproom Doors', NULL, NULL, 4, 4, 'LS', 135000, 540000, 0.88, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '7', 'OHWT and UGWT Tank Chambers', NULL, 24, NULL, 24, 'Nos.', 4000, 96000, 0.16, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '8', 'Entry Gate Fabrication Work', NULL, NULL, 1, 1, 'LS', 600000, 600000, 0.98, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '9', 'Terrace Top Pergola Fabrication', NULL, 2289.46, 2289.46, 4578.92, 'Sq.ft', 1250, 2861825, 4.65, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Fabrication Work', '10', 'Fabrication for Soil Supporting - (Protection during Rain)', NULL, NULL, NULL, 1, 'LS', 750000, 750000, 1.22, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 13: Façade Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Façade Work', 'FAÇADE_WORK', 13)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Façade Work', '1', 'Elevation Louvers Labour and Material', NULL, 25726.44, NULL, 25726.44, 'Sqft', 206.5, 5312511, 8.64, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Façade Work', '2', 'Elevation Stair passage side Louvers Labour and Material', NULL, 13484.15, NULL, 13484.15, 'Sqft', 206.5, 2784477, 4.53, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Façade Work', '3', 'Z Louvers Labour and Material (Internal Passages)', NULL, 6701.15, NULL, 6701.15, 'Sqft', 194.7, 1304714, 2.12, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Façade Work', '4', 'Elevation Deck and Standing Balcony Glass Railing Labour and Material', NULL, 25982.72, NULL, 25982.72, 'Sqft', 802.4, 20848538, 33.9, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Façade Work', '5', 'Elevation Standing Balcony MS Railing Labour and Material-Bedroom', NULL, 14833.14, NULL, 14833.14, 'Sqft', 350, 5191598, 8.44, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Façade Work', '6', '1st Floor External Wall Tiles Cladding', NULL, 22927.32, NULL, 22927.32, 'Sqft', 225, 5158647, 8.39, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 14: Façade
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Façade', 'FAÇADE', 14)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Façade', '1', 'Living Room Balcony Ceiling Labour and Material-ACP Sheet', NULL, 9500, NULL, 9500, 'Sqft', 413, 3923500, 6.38, 'building_finishes', 'labour')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 15: Door Hardware and Furniture Works
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Door Hardware and Furniture Works', 'DOOR_HARDWARE_A', 15)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Door Hardware and Furniture Works', '1', 'Laminate Doors', NULL, 1890, NULL, 1890, 'Nos.', 4897, 9255330, 15.05, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Door Hardware and Furniture Works', '2', 'Hardwares (Locks, Hinges, Screw, Magnet, Handle etc.)', NULL, 1890, NULL, 1890, 'Nos', 1770, 3345300, 5.44, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Door Hardware and Furniture Works', '3', 'Door Fitting Labour', NULL, 1890, NULL, 1890, 'Rs', 826, 1561140, 2.54, 'building_finishes', 'labour')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 16: Security & Surveillance
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Security & Surveillance', 'SECURITY_AND_SU', 16)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Security & Surveillance', '1', 'Camera & DVR', NULL, NULL, 1, 1, 'Rs', 676500, 676500, 1.1, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 17: Elevators
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Elevators', 'ELEVATORS', 17)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Elevators', '1', 'Lifts', NULL, 12, NULL, 12, 'Nos.', 3186000, 38232000, 62.17, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 18: Fire Fighting
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Fire Fighting', 'FIRE_FIGHTING', 18)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Fire Fighting', '1', 'All Building Fire Fighting (Material + Labour)', NULL, NULL, 1, 1, 'LS', 20650000, 20650000, 33.58, 'site_infra', 'labour')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 19: Aluminum Section Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Aluminum Section Work', 'ALUMINUM_SECTIO', 19)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Aluminum Section Work', '1', 'All Building Window Sections (Material + Labour)', NULL, 79941.89, NULL, 79941.89, 'Sqft', 472, 37732573, 61.35, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Aluminum Section Work', '2', 'Glass Glazing on Penthouse Living Side Balconey Window Section', NULL, 7295.19, NULL, 7295.19, 'Sqft', 914.5, 6671454, 10.85, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 20: Road & Other Works
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Road & Other Works', 'ROAD_AND_OTHER_', 20)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Road & Other Works', '1', 'Trimix Work Lower Basement-Labour', NULL, 57318.3, NULL, 57318.3, 'Sqft', 38.94, 2231975, 3.63, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Road & Other Works', '2', 'Trimix Work Upper Basement-Labour', NULL, 57318.3, NULL, 57318.3, 'Sqft', 76.7, 4396314, 7.15, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Road & Other Works', '3', 'Trimix Road Work (Labour + Material)-Ground Floor', NULL, NULL, 28427.72, 28427.72, 'Sqft', 135.7, 3857642, 6.27, 'site_infra', 'labour'),
  (v_proj_id, v_cat_id, 'Road & Other Works', '4', 'Depart Labour-Road Cleaning-Motor Shifting-Dewatering-Amenities Cleaning-Flat Cleaning', NULL, NULL, 1, 1, 'LS', 4000000, 4000000, 6.5, 'site_infra', 'labour')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 21: Amenities Interior Work
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Amenities Interior Work', 'AMENITIES_INTER', 21)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '1', 'Gym', NULL, 3028.34, NULL, 3028.34, 'Sqft', 2000, 6056688, 9.85, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '2', 'Indoor Games', NULL, 1739.03, NULL, 1739.03, 'Sqft', 1750, 3043306, 4.95, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '3', 'Toddler Play', NULL, 1752.38, NULL, 1752.38, 'Sqft', 2000, 3504758, 5.7, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '4', 'Yoga/Aerobics/Zumba', NULL, 985.98, NULL, 985.98, 'Sqft', 1750, 1725469, 2.81, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '5', 'Social Club', NULL, 987.6, NULL, 987.6, 'Sqft', 1750, 1728295, 2.81, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '6', 'Banquet Hall', NULL, 2800.58, NULL, 2800.58, 'Sqft', 2500, 7001444, 11.38, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '7', 'Male and Female Toilet', NULL, 707.52, NULL, 707.52, 'Sqft', 1500, 1061277, 1.73, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '8', 'Multi Purpose Work', NULL, 1293.62, NULL, 1293.62, 'Sqft', 1500, 1940426, 3.16, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '9', 'Steam and Jacuzzi', NULL, 562.53, NULL, 562.53, 'Sqft', 1500, 843790, 1.37, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '10', 'Foyer Area All Buildings', NULL, 2942.02, NULL, 2942.02, 'Sqft', 2750, 8090545, 13.16, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '11', 'Security Cabin', NULL, NULL, 50, 50, 'Sqft', 2000, 100000, 0.16, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '12', 'Meter Room', NULL, 742.72, NULL, 742.72, 'Sqft', 1250, 928395, 1.51, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '13', 'ODU Space Room', NULL, 145.64, NULL, 145.64, 'Sqft', 1500, 218455, 0.36, 'building_finishes', 'material'),
  (v_proj_id, v_cat_id, 'Amenities Interior Work', '14', 'Society Office', NULL, 403.76, NULL, 403.76, 'Sqft', 1500, 605636, 0.98, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 22: Landscape & Hardscape
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Landscape & Hardscape', 'LANDSCAPE_AND_H', 22)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '1', 'Party Lawn (Mat + Lab)', NULL, NULL, 7104.24, 7104.24, 'Sqft', 100, 710424, 1.16, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '2', 'Children''s Play Area', NULL, NULL, 2223.52, 2223.52, 'Sqft', 650, 1445288, 2.35, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '3', 'Skating Area', NULL, NULL, 550.69, 550.69, 'Sqft', 450, 247809, 0.4, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '4', 'Multi Sport Court Area', NULL, NULL, 2245.05, 2245.05, 'Sqft', 500, 1157524, 1.88, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '5', 'Netcricket', NULL, NULL, 554.13, 554.13, 'Sqft', 550, 304772, 0.5, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '6', 'Amphitheater', NULL, NULL, 330.99, 330.99, 'Sqft', 850, 281344, 0.46, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '7', 'Outdoor Exercise', NULL, NULL, 660.26, 660.26, 'Sqft', 450, 297119, 0.48, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '8', 'Outdoor Activity', NULL, NULL, 498.91, 498.91, 'Sqft', 450, 224510, 0.37, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '9', 'Building Lobby', NULL, NULL, 2001.14, 2001.14, 'Sqft', 235, 470267, 0.76, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '10', 'Tuck-in seatings with lawn', NULL, NULL, 624.31, 624.31, 'Sqft', 350, 218509, 0.36, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '11', 'Gazebo Outdoor Seating', NULL, NULL, 322.92, 322.92, 'Sqft', 450, 145314, 0.24, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '12', 'Seat Out Area in Lawn', NULL, NULL, 1009.34, 1009.34, 'Sqft', 600, 605604, 0.98, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '13', 'Plantations/Trees/Shrubs', NULL, NULL, 1, 1, 'LS', 2240000, 2240000, 3.64, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '14', 'Open Plaza/Tree Plaza', NULL, NULL, 2153.98, 2153.98, 'Sqft', 450, 969293, 1.58, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '15', '1st Floor Pathway/Track', NULL, NULL, 3982.68, 3982.68, 'Sqft', 450, 1792206, 2.91, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '16', 'Ramp', NULL, NULL, 1419.88, 1419.88, 'Sqft', 650, 922922, 1.5, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '17', 'Elevated Deck', NULL, NULL, 247.57, 247.57, 'Sqft', 450, 111407, 0.18, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '18', 'Water Body', NULL, NULL, 387.5, 387.5, 'Sqft', 450, 474377, 0.77, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '19', 'Swing Plaza', NULL, NULL, 306.67, 306.67, 'Sqft', 450, 138000, 0.22, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '20', 'Drain Cell', NULL, NULL, 9795.24, 9795.24, 'Sq.ft', 44.84, 439219, 0.71, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '21', 'Geo Membrane', NULL, NULL, 12830.69, 12830.69, 'Sq.ft', 17.7, 227103, 0.37, 'site_infra', 'material'),
  (v_proj_id, v_cat_id, 'Landscape & Hardscape', '22', 'Light Weight Filling Material', NULL, NULL, 1, 1, 'LS', 1000000, 1000000, 1.63, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 23: Signages
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Signages', 'SIGNAGES', 23)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Signages', '1', 'Signages', NULL, 1, NULL, 1, 'LS', 2000000, 2000000, 3.25, 'building_finishes', 'material')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------------------------
  -- Category 24: Compound Wall and Entrance Gate
  -- --------------------------------------------------------------------------
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Compound Wall and Entrance Gate', 'COMPOUND_WALL_A', 24)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat_id;

  INSERT INTO public.master_budget_items (
    project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type
  ) VALUES
  (v_proj_id, v_cat_id, 'Compound Wall and Entrance Gate', '1', 'Main Entrance Gate (Civil + Finishing Work)', NULL, 1, NULL, 1, 'LS', 6500000, 6500000, 10.57, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Compound Wall and Entrance Gate', '2', 'Compound Wall (Civil + Finishing Work)', NULL, 1, NULL, 1, 'LS', 5000000, 5000000, 8.13, 'building_finishes', 'labour'),
  (v_proj_id, v_cat_id, 'Compound Wall and Entrance Gate', '3', 'Planters & Sitting Pods (Civil Work)', NULL, 1, NULL, 1, 'LS', 6000000, 6000000, 9.76, 'building_finishes', 'labour')
  ON CONFLICT DO NOTHING;

END $$;
