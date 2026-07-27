-- ============================================================================
-- PRAMUKH GROUP ERP — COMPLETE PROCUREMENT MODULE SUPABASE SCHEMA
-- ----------------------------------------------------------------------------
-- Safe, idempotent SQL migration script for MR, PR, RFQ, PO, GRN, and PB (Purchase Bills).
-- Execute in Supabase SQL Editor or run `supabase db push`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper to set updated_at automatically
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END $$;

-- ----------------------------------------------------------------------------
-- 1. MISSING TABLE: VENDOR BILLS (PURCHASE BILLS - PB)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.project_sites(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  bill_number text NOT NULL,
  supplier_bill_no text,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  accounting_date date,
  due_date date,
  payment_terms_days integer DEFAULT 30,
  subtotal_amount numeric(16,2) NOT NULL DEFAULT 0,
  tax_amount numeric(16,2) NOT NULL DEFAULT 0,
  cgst_amount numeric(16,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(16,2) NOT NULL DEFAULT 0,
  igst_amount numeric(16,2) NOT NULL DEFAULT 0,
  rounding_amount numeric(8,2) NOT NULL DEFAULT 0,
  total_amount numeric(16,2) NOT NULL DEFAULT 0,
  required_documents_received boolean NOT NULL DEFAULT false,
  work_completion_verified boolean NOT NULL DEFAULT false,
  qc_approval_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.vendor_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_bill_id uuid NOT NULL REFERENCES public.vendor_bills(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  grn_id uuid REFERENCES public.goods_receipt_notes(id) ON DELETE SET NULL,
  purchase_order_line_id uuid REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.item_master(id),
  description text NOT NULL,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  rate numeric(16,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,2) NOT NULL DEFAULT 0,
  line_total numeric(16,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

-- ----------------------------------------------------------------------------
-- 2. MISSING TABLE: QC INSPECTION ITEMS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qc_inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.qc_inspections(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  result text NOT NULL DEFAULT 'pending',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id)
);

-- ----------------------------------------------------------------------------
-- 3. MISSING TABLE: PR ACTIVITY LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pr_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_requisition_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_status text,
  new_status text,
  comment text,
  actor_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. ENSURE ALL COLUMN EXTENSIONS ON EXISTING TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.material_requests 
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS activity_code text;

ALTER TABLE public.material_request_lines 
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS item_group text,
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS line_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS line_rejection_reason text;

ALTER TABLE public.purchase_requisitions 
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS pr_type text DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS contractor_name text,
  ADD COLUMN IF NOT EXISTS contract_reference text,
  ADD COLUMN IF NOT EXISTS activity_name text,
  ADD COLUMN IF NOT EXISTS wbs_code text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS site_contact_person text,
  ADD COLUMN IF NOT EXISTS site_contact_number text,
  ADD COLUMN IF NOT EXISTS general_remarks text,
  ADD COLUMN IF NOT EXISTS total_amount numeric(16,2) DEFAULT 0;

ALTER TABLE public.purchase_requisition_lines 
  ADD COLUMN IF NOT EXISTS resource_type text DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS item_group text,
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS preferred_brand text,
  ADD COLUMN IF NOT EXISTS suggested_vendor text,
  ADD COLUMN IF NOT EXISTS delivery_location text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS est_qty numeric(14,4),
  ADD COLUMN IF NOT EXISTS ind_qty numeric(14,4),
  ADD COLUMN IF NOT EXISTS iss_qty numeric(14,4),
  ADD COLUMN IF NOT EXISTS pr_bal_qty numeric(14,4),
  ADD COLUMN IF NOT EXISTS lead_period_days integer,
  ADD COLUMN IF NOT EXISTS lead_period_date date,
  ADD COLUMN IF NOT EXISTS project_stock numeric(14,4),
  ADD COLUMN IF NOT EXISTS line_number integer,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total numeric(16,2) DEFAULT 0;

ALTER TABLE public.purchase_orders 
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS contractor_name text,
  ADD COLUMN IF NOT EXISTS contract_reference text,
  ADD COLUMN IF NOT EXISTS site_contact_person text,
  ADD COLUMN IF NOT EXISTS site_contact_number text,
  ADD COLUMN IF NOT EXISTS terms_and_conditions_legal text,
  ADD COLUMN IF NOT EXISTS gst_194q_clause text,
  ADD COLUMN IF NOT EXISTS rera_warranty_clause text;

ALTER TABLE public.goods_receipt_notes 
  ADD COLUMN IF NOT EXISTS vehicle_no text,
  ADD COLUMN IF NOT EXISTS volume_in_brass text,
  ADD COLUMN IF NOT EXISTS net_weight text,
  ADD COLUMN IF NOT EXISTS in_weight text,
  ADD COLUMN IF NOT EXISTS out_weight text,
  ADD COLUMN IF NOT EXISTS challan_no text,
  ADD COLUMN IF NOT EXISTS challan_date date,
  ADD COLUMN IF NOT EXISTS transporter_name text,
  ADD COLUMN IF NOT EXISTS godown_name text,
  ADD COLUMN IF NOT EXISTS dealer_name text,
  ADD COLUMN IF NOT EXISTS qc_no text;

-- ----------------------------------------------------------------------------
-- 5. INDEXES FOR HIGH-PERFORMANCE PROCUREMENT QUERIES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_vendor_bills_project ON public.vendor_bills(project_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_vendor ON public.vendor_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bill_lines_bill ON public.vendor_bill_lines(vendor_bill_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspection_items_ins ON public.qc_inspection_items(inspection_id);

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) & TRIGGERS
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_vendor_bills_all ON public.vendor_bills;
CREATE POLICY p_vendor_bills_all ON public.vendor_bills FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS p_vendor_bill_lines_all ON public.vendor_bill_lines;
CREATE POLICY p_vendor_bill_lines_all ON public.vendor_bill_lines FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS p_qc_inspection_items_all ON public.qc_inspection_items;
CREATE POLICY p_qc_inspection_items_all ON public.qc_inspection_items FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS p_pr_activity_log_all ON public.pr_activity_log;
CREATE POLICY p_pr_activity_log_all ON public.pr_activity_log FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER trg_vendor_bills_updated_at BEFORE UPDATE ON public.vendor_bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_vendor_bill_lines_updated_at BEFORE UPDATE ON public.vendor_bill_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_qc_inspection_items_updated_at BEFORE UPDATE ON public.qc_inspection_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
