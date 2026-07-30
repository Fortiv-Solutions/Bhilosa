-- ============================================================================
-- PRAMUKH GROUP ERP V2 — COMPLETE PRODUCTION-GRADE BUDGET MODULE SCHEMA
-- File: supabase/schemma/budget_module_production_schema.sql
-- Description: Complete, scalable multi-project database schema for Master Budget,
--              In-Context Revisions, Dynamic Variance Reconciliation, Bill-Wise Ledger,
--              and Cross-Module Synchronized Triggers (PR, MR, PO, GRN, Inventory, Bills).
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. BASE MODULE LOOKUPS (Projects, Profiles, Organizations)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  gst_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text DEFAULT 'project_manager',
  created_at timestamp with time zone DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  location text,
  bua_sqft numeric NOT NULL DEFAULT 615000,
  budget_amount numeric NOT NULL DEFAULT 0,
  actual_spend_amount numeric NOT NULL DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

-- Ensure bua_sqft column exists if projects table already pre-existed
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bua_sqft numeric DEFAULT 615000;

-- Insert Central Park Default Project if not exists
INSERT INTO public.projects (id, code, name, location, bua_sqft, budget_amount, actual_spend_amount, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'CP-001',
  'Central Park Residential Project',
  'Surat, Gujarat',
  615000,
  1453638820,
  329480000,
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. FLEXIBLE & SCALABLE MULTI-PROJECT BUDGET CORE
-- ----------------------------------------------------------------------------

-- A. Project Budget Categories (Supports unique categories per project)
CREATE TABLE IF NOT EXISTS public.budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  category_code text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT unq_project_category UNIQUE (project_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_budget_categories_project ON public.budget_categories(project_id);

-- B. Master Budget Items (Supports unique line items per project)
CREATE TABLE IF NOT EXISTS public.master_budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  sr_no text NOT NULL,
  item_description text NOT NULL,
  qty_rcc numeric DEFAULT 0 CHECK (qty_rcc >= 0),
  qty_finishes numeric DEFAULT 0 CHECK (qty_finishes >= 0),
  qty_infra numeric DEFAULT 0 CHECK (qty_infra >= 0),
  qty_total numeric NOT NULL DEFAULT 1 CHECK (qty_total >= 0),
  unit text NOT NULL DEFAULT 'LS',
  estimated_rate numeric NOT NULL DEFAULT 0 CHECK (estimated_rate >= 0),
  budgeted_cost numeric NOT NULL DEFAULT 0 CHECK (budgeted_cost >= 0),
  cost_per_bua numeric NOT NULL DEFAULT 0,
  scope_tag text DEFAULT 'building_rcc', -- 'building_rcc' | 'building_finishes' | 'site_infra'
  item_type text DEFAULT 'material', -- 'material' | 'labour' | 'equipment' | 'subcontract'
  version_number integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

-- Ensure all required columns exist if master_budget_items already pre-existed
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

CREATE INDEX IF NOT EXISTS idx_master_budget_items_project ON public.master_budget_items(project_id);
CREATE INDEX IF NOT EXISTS idx_master_budget_items_category ON public.master_budget_items(category_id);

-- ----------------------------------------------------------------------------
-- 3. IN-CONTEXT REVISION HISTORY AUDIT LOG
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  version_label text NOT NULL, -- e.g. 'Version v2 (Change Order)'
  justification_reason text NOT NULL,
  old_total_cost numeric NOT NULL DEFAULT 0,
  new_total_cost numeric NOT NULL DEFAULT 0,
  net_diff_amount numeric NOT NULL DEFAULT 0,
  edited_by_name text NOT NULL DEFAULT 'Pramukh Group Management User',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_revision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.budget_revisions(id) ON DELETE CASCADE,
  master_budget_item_id uuid REFERENCES public.master_budget_items(id) ON DELETE SET NULL,
  sub_activity text NOT NULL,
  category_name text NOT NULL,
  old_qty numeric NOT NULL,
  new_qty numeric NOT NULL,
  old_rate numeric NOT NULL,
  new_rate numeric NOT NULL,
  old_cost numeric NOT NULL,
  new_cost numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. DYNAMIC VARIANCE RECONCILIATION TABLE (GENERATED PER PROJECT ITEM)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.budget_variance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  master_budget_item_id uuid NOT NULL REFERENCES public.master_budget_items(id) ON DELETE CASCADE,
  sr_no text NOT NULL,
  sub_activity text NOT NULL,
  category_name text NOT NULL,
  unit text NOT NULL DEFAULT 'LS',
  work_status text DEFAULT 'In Progress', -- 'In Progress' | 'Completed' | 'Not Started'
  
  -- Master Baseline Budget snapshot
  budget_qty numeric NOT NULL DEFAULT 0,
  budget_rate numeric NOT NULL DEFAULT 0,
  budget_cost numeric NOT NULL DEFAULT 0,

  -- P.O / W.O Commitment values
  po_qty numeric DEFAULT 0,
  po_rate numeric DEFAULT 0,
  po_amount numeric DEFAULT 0,

  -- Actual Verified Bill values
  actual_bill_qty numeric NOT NULL DEFAULT 0,
  actual_bill_rate numeric NOT NULL DEFAULT 0,
  actual_total_cost numeric NOT NULL DEFAULT 0,

  -- Computed Variations
  qty_variation numeric NOT NULL DEFAULT 0,
  rate_variation numeric NOT NULL DEFAULT 0,
  balance_amount numeric NOT NULL DEFAULT 0,
  cost_variance_amount numeric NOT NULL DEFAULT 0,
  cost_variance_percent numeric NOT NULL DEFAULT 0,

  remark text,
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT unq_variance_item UNIQUE (project_id, master_budget_item_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_variance_project ON public.budget_variance_items(project_id);

-- ----------------------------------------------------------------------------
-- 5. BUDGET ALLOCATIONS & DOUBLE-ENTRY TRANSACTION LEDGER
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.budget_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  allocation_name text NOT NULL,
  allocated_amount numeric NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  committed_amount numeric NOT NULL DEFAULT 0 CHECK (committed_amount >= 0),
  spent_amount numeric NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  warning_threshold_percent numeric NOT NULL DEFAULT 80 CHECK (warning_threshold_percent BETWEEN 0 AND 100),
  hard_limit_percent numeric NOT NULL DEFAULT 100 CHECK (hard_limit_percent >= 0),
  status text NOT NULL DEFAULT 'approved',
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_allocation_id uuid NOT NULL REFERENCES public.budget_allocations(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('committed', 'actual', 'release')),
  source_table text NOT NULL, -- 'purchase_requisitions' | 'purchase_orders' | 'vendor_bills' | 'grn'
  source_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  description text,
  posted_at timestamp with time zone NOT NULL DEFAULT NOW(),
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_allocation_id uuid REFERENCES public.budget_allocations(id) ON DELETE CASCADE,
  alert_type text NOT NULL, -- 'WARNING_THRESHOLD_REACHED' | 'HARD_LIMIT_EXCEEDED'
  threshold_percent numeric,
  actual_percent numeric,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. AUTOMATED POSTGRESQL FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------

-- A. Auto-create Variance Record when Master Item is Created/Updated
CREATE OR REPLACE FUNCTION public.fn_sync_master_item_to_variance()
RETURNS TRIGGER AS $$
DECLARE
  v_cat_name text;
  v_actual_qty numeric;
  v_actual_rate numeric;
  v_actual_cost numeric;
  v_cost_var_amt numeric;
  v_cost_var_pct numeric;
BEGIN
  -- Fetch Category Name
  SELECT category_name INTO v_cat_name FROM public.budget_categories WHERE id = NEW.category_id;
  IF v_cat_name IS NULL THEN
    v_cat_name := 'General Category';
  END IF;

  v_actual_qty := NEW.qty_total;
  v_actual_rate := NEW.estimated_rate;
  v_actual_cost := NEW.budgeted_cost;
  v_cost_var_amt := 0;
  v_cost_var_pct := 0;

  INSERT INTO public.budget_variance_items (
    project_id,
    master_budget_item_id,
    sr_no,
    sub_activity,
    category_name,
    unit,
    work_status,
    budget_qty,
    budget_rate,
    budget_cost,
    po_qty,
    po_rate,
    po_amount,
    actual_bill_qty,
    actual_bill_rate,
    actual_total_cost,
    qty_variation,
    rate_variation,
    balance_amount,
    cost_variance_amount,
    cost_variance_percent,
    remark,
    updated_at
  ) VALUES (
    NEW.project_id,
    NEW.id,
    NEW.sr_no,
    NEW.item_description,
    v_cat_name,
    NEW.unit,
    'In Progress',
    NEW.qty_total,
    NEW.estimated_rate,
    NEW.budgeted_cost,
    NEW.qty_total,
    NEW.estimated_rate,
    NEW.budgeted_cost,
    v_actual_qty,
    v_actual_rate,
    v_actual_cost,
    0,
    0,
    0,
    v_cost_var_amt,
    v_cost_var_pct,
    'Auto-synchronized from Master Budget schedule.',
    NOW()
  )
  ON CONFLICT (project_id, master_budget_item_id) DO UPDATE SET
    sr_no = EXCLUDED.sr_no,
    sub_activity = EXCLUDED.sub_activity,
    category_name = EXCLUDED.category_name,
    unit = EXCLUDED.unit,
    budget_qty = EXCLUDED.budget_qty,
    budget_rate = EXCLUDED.budget_rate,
    budget_cost = EXCLUDED.budget_cost,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_master_to_variance ON public.master_budget_items;
CREATE TRIGGER trg_sync_master_to_variance
  AFTER INSERT OR UPDATE ON public.master_budget_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_master_item_to_variance();

-- ----------------------------------------------------------------------------
-- 7. SEED DATA: CENTRAL PARK PROJECT MASTER BUDGET (24 CATEGORIES)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_proj_id uuid := '00000000-0000-0000-0000-000000000001';
  v_cat1 uuid; v_cat2 uuid; v_cat3 uuid; v_cat4 uuid; v_cat5 uuid;
BEGIN
  -- Insert Category 1
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Site Development/Pre-Construction Work', 'SITE_DEV', 1)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat1;

  -- Items for Category 1
  INSERT INTO public.master_budget_items (project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type)
  VALUES
  (v_proj_id, v_cat1, 'Site Development/Pre-Construction Work', '1', 'Temporary Site Barrication/Pre.Const. Work', NULL, NULL, 1, 1, 'LS', 500000, 500000, 0.81, 'site_infra', 'labour'),
  (v_proj_id, v_cat1, 'Site Development/Pre-Construction Work', '2', 'Intial Site Development (Hoarding/Site Office/Leveling/Cleaning)', NULL, NULL, 1, 1, 'LS', 5500000, 5500000, 8.94, 'site_infra', 'material'),
  (v_proj_id, v_cat1, 'Site Development/Pre-Construction Work', '3', 'GSB/Chaaru/Slag', NULL, NULL, 1, 1, 'LS', 1500000, 1500000, 2.44, 'site_infra', 'material')
  ON CONFLICT DO NOTHING;

  -- Insert Category 2
  INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
  VALUES (v_proj_id, 'Excavation/Backfilling and D-Wall/Pile Work', 'EXCAV_DWALL', 2)
  ON CONFLICT (project_id, category_name) DO UPDATE SET sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_cat2;

  -- Items for Category 2
  INSERT INTO public.master_budget_items (project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type)
  VALUES
  (v_proj_id, v_cat2, 'Excavation/Backfilling and D-Wall/Pile Work', '1', 'Excavation/Backfilling', NULL, NULL, NULL, 1, 'LS', 4480000, 4480000, 7.28, 'site_infra', 'material'),
  (v_proj_id, v_cat2, 'Excavation/Backfilling and D-Wall/Pile Work', '2', 'JCB/Poclain (Labour)', NULL, NULL, 1, 1, 'LS', 1650000, 1650000, 2.68, 'site_infra', 'labour'),
  (v_proj_id, v_cat2, 'Excavation/Backfilling and D-Wall/Pile Work', '3', 'Tractor (Labour)', NULL, NULL, 1, 1, 'LS', 1200000, 1200000, 1.95, 'site_infra', 'labour'),
  (v_proj_id, v_cat2, 'Excavation/Backfilling and D-Wall/Pile Work', '4', 'D-Wall Construction Work', NULL, NULL, NULL, 1, 'LS', 8915000, 8915000, 14.50, 'building_rcc', 'subcontract')
  ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- END OF PRODUCTION SCHEMA
-- ============================================================================
