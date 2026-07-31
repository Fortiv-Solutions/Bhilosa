-- ============================================================================
-- SUPERSEDED: every function and trigger defined below is replaced by
-- 20260730120000_budget_module_production_hardening.sql, which also creates the
-- budget_categories table this file forgot. Two wrong enum casts
-- ('committed'::erp_ledger_transaction_type) have been corrected in place so a
-- clean `supabase db reset` no longer leaves a landmine, but do not add logic
-- here — edit the hardening migration instead.
-- ============================================================================
-- PRAMUKH GROUP ERP V2 — PRODUCTION-GRADE BUDGET MODULE & CROSS-MODULE SCHEMA
-- File: supabase/migrations/20260729190000_budget_module_v2_schema.sql
-- Description: Comprehensive database schema for Master Budget, In-Context Revisions,
--              Variance Reconciliation, Bill-Wise Ledger & Cross-Module Triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MASTER BUDGET LINE ITEMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_head_id uuid REFERENCES public.budget_heads(id) ON DELETE SET NULL,
  category_name text NOT NULL, -- e.g. 'Civil Labour Cost', 'Steel & Rebar'
  sr_no text NOT NULL, -- e.g. '1.1', '2.3'
  item_description text NOT NULL,
  qty_rcc numeric DEFAULT 0 CHECK (qty_rcc >= 0),
  qty_finishes numeric DEFAULT 0 CHECK (qty_finishes >= 0),
  qty_infra numeric DEFAULT 0 CHECK (qty_infra >= 0),
  qty_total numeric NOT NULL DEFAULT 0 CHECK (qty_total >= 0),
  unit text NOT NULL DEFAULT 'LS',
  estimated_rate numeric NOT NULL DEFAULT 0 CHECK (estimated_rate >= 0),
  budgeted_cost numeric NOT NULL DEFAULT 0 CHECK (budgeted_cost >= 0),
  cost_per_bua numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  version_number integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_master_budget_items_project ON public.master_budget_items(project_id);
CREATE INDEX IF NOT EXISTS idx_master_budget_items_category ON public.master_budget_items(category_name);

-- ----------------------------------------------------------------------------
-- 2. BUDGET REVISIONS & CHANGE ORDERS AUDIT TRAIL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  version_label text NOT NULL, -- e.g. 'Version v2 (Change Order)'
  justification_reason text NOT NULL, -- Change Order justification text
  old_total_cost numeric NOT NULL DEFAULT 0,
  new_total_cost numeric NOT NULL DEFAULT 0,
  net_diff_amount numeric NOT NULL DEFAULT 0,
  edited_by uuid REFERENCES public.profiles(id),
  edited_by_name text NOT NULL DEFAULT 'Pramukh ERP User',
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_revision_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.budget_revisions(id) ON DELETE CASCADE,
  master_budget_item_id uuid REFERENCES public.master_budget_items(id),
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

CREATE INDEX IF NOT EXISTS idx_budget_revisions_project ON public.budget_revisions(project_id);

-- ----------------------------------------------------------------------------
-- 3. VARIANCE RECONCILIATION ITEMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_variance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  master_budget_item_id uuid REFERENCES public.master_budget_items(id) ON DELETE CASCADE,
  sr_no text NOT NULL,
  sub_activity text NOT NULL,
  category_name text NOT NULL,
  unit text NOT NULL,
  work_status text DEFAULT 'In Progress',
  
  -- Baseline Budget snapshot
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
  updated_by uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_budget_variance_project ON public.budget_variance_items(project_id);

-- ----------------------------------------------------------------------------
-- 4. CROSS-MODULE FOREIGN KEYS (Procurement, Billing, Finance)
-- ----------------------------------------------------------------------------

-- A. Link Purchase Requisitions to Budget Allocations
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_requisitions') THEN
    ALTER TABLE public.purchase_requisitions 
      ADD COLUMN IF NOT EXISTS budget_allocation_id uuid REFERENCES public.budget_allocations(id),
      ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id);
  END IF;
END $$;

-- B. Link Purchase Orders to Budget Allocations
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
    ALTER TABLE public.purchase_orders 
      ADD COLUMN IF NOT EXISTS budget_allocation_id uuid REFERENCES public.budget_allocations(id),
      ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id);
  END IF;
END $$;

-- C. Link Vendor Bills / RA Bills to Budget Allocations & Ledger
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_bills') THEN
    ALTER TABLE public.vendor_bills 
      ADD COLUMN IF NOT EXISTS budget_allocation_id uuid REFERENCES public.budget_allocations(id),
      ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. AUTOMATED POSTGRESQL TRIGGERS & FUNCTIONS
-- ----------------------------------------------------------------------------

-- A. Trigger: Auto-Commit PO Amount to Budget & Ledger
CREATE OR REPLACE FUNCTION public.fn_auto_commit_po_to_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved')) THEN
    IF NEW.budget_allocation_id IS NOT NULL THEN
      -- 1. Increase committed amount on budget allocation
      UPDATE public.budget_allocations
      SET committed_amount = committed_amount + NEW.total_amount,
          updated_at = NOW()
      WHERE id = NEW.budget_allocation_id;

      -- 2. Post entry in budget ledger
      INSERT INTO public.budget_ledger (
        project_id,
        budget_allocation_id,
        transaction_type,
        source_table,
        source_id,
        amount,
        description,
        posted_at
      ) VALUES (
        NEW.project_id,
        NEW.budget_allocation_id,
        'commitment'::erp_budget_txn_type,
        'purchase_orders',
        NEW.id,
        NEW.total_amount,
        CONCAT('Purchase Order Approved: ', COALESCE(NEW.po_number, NEW.id::text)),
        NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- B. Trigger: Auto-Post Actual Vendor Bill Payment to Budget & Ledger
CREATE OR REPLACE FUNCTION public.fn_auto_post_bill_to_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'paid' OR NEW.status = 'approved') AND (OLD.status IS NULL OR OLD.status NOT IN ('paid', 'approved')) THEN
    IF NEW.budget_allocation_id IS NOT NULL THEN
      -- 1. Shift committed to spent amount on budget allocation
      UPDATE public.budget_allocations
      SET spent_amount = spent_amount + NEW.net_amount,
          committed_amount = GREATEST(0, committed_amount - NEW.net_amount),
          updated_at = NOW()
      WHERE id = NEW.budget_allocation_id;

      -- 2. Post actual transaction entry in budget ledger
      INSERT INTO public.budget_ledger (
        project_id,
        budget_allocation_id,
        transaction_type,
        source_table,
        source_id,
        amount,
        description,
        posted_at
      ) VALUES (
        NEW.project_id,
        NEW.budget_allocation_id,
        'actual'::erp_budget_txn_type,
        'vendor_bills',
        NEW.id,
        NEW.net_amount,
        CONCAT('Vendor RA Bill Verified & Paid: ', COALESCE(NEW.bill_number, NEW.id::text)),
        NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- C. Trigger: Auto-Generate Budget Overrun Alerts
CREATE OR REPLACE FUNCTION public.fn_check_budget_overrun_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_utilization numeric;
BEGIN
  IF NEW.allocated_amount > 0 THEN
    v_utilization := ((NEW.spent_amount + NEW.committed_amount) / NEW.allocated_amount) * 100;
    
    IF v_utilization >= NEW.hard_limit_percent THEN
      INSERT INTO public.budget_alerts (
        project_id,
        budget_allocation_id,
        alert_type,
        threshold_percent,
        actual_percent,
        message,
        status
      ) VALUES (
        NEW.project_id,
        NEW.id,
        'HARD_LIMIT_EXCEEDED',
        NEW.hard_limit_percent,
        v_utilization,
        CONCAT('CRITICAL OVERRUN ALERT: Allocation ', NEW.allocation_name, ' has reached ', ROUND(v_utilization, 2), '% utilization!'),
        'pending'::erp_workflow_status
      );
    ELSIF v_utilization >= NEW.warning_threshold_percent THEN
      INSERT INTO public.budget_alerts (
        project_id,
        budget_allocation_id,
        alert_type,
        threshold_percent,
        actual_percent,
        message,
        status
      ) VALUES (
        NEW.project_id,
        NEW.id,
        'WARNING_THRESHOLD_REACHED',
        NEW.warning_threshold_percent,
        v_utilization,
        CONCAT('WARNING ALERT: Allocation ', NEW.allocation_name, ' has reached ', ROUND(v_utilization, 2), '% utilization.'),
        'pending'::erp_workflow_status
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 6. ATTACH TRIGGERS
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_po_budget_commitment ON public.purchase_orders;
CREATE TRIGGER trg_po_budget_commitment
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_commit_po_to_budget();

DROP TRIGGER IF EXISTS trg_bill_budget_actual ON public.vendor_bills;
CREATE TRIGGER trg_bill_budget_actual
  AFTER UPDATE ON public.vendor_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_post_bill_to_budget();

DROP TRIGGER IF EXISTS trg_budget_overrun_alert ON public.budget_allocations;
CREATE TRIGGER trg_budget_overrun_alert
  AFTER UPDATE ON public.budget_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_budget_overrun_alert();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
