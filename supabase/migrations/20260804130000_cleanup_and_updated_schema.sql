-- ============================================================================
-- PRAMUKH ERP: RESET & COMPLETE UPDATED SCHEMA MIGRATION
-- File: supabase/migrations/20260804130000_cleanup_and_updated_schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: DATA CLEANUP (Clears existing Purchase Orders & resets PR statuses)
-- ----------------------------------------------------------------------------

-- 1. Delete all existing Purchase Order lines and Purchase Orders
DELETE FROM purchase_order_lines;
DELETE FROM purchase_orders;

-- 2. Delete RFQ vendor and line mappings
DELETE FROM rfq_vendors;
DELETE FROM rfq_lines;
DELETE FROM rfqs;

-- 3. Delete Vendor Selections and Awards (if existing)
DELETE FROM vendor_selection_awards WHERE TRUE;
DELETE FROM vendor_selections WHERE TRUE;
DELETE FROM quotation_lines WHERE TRUE;
DELETE FROM vendor_quotations WHERE TRUE;

-- 4. Reset Purchase Requisition statuses back to 'approved' so they can be processed cleanly
UPDATE purchase_requisitions
SET status = 'approved',
    updated_at = NOW()
WHERE status IN ('rfq_sent', 'quotes_received', 'under_evaluation', 'vendor_selected', 'po_issued', 'partially_ordered');


-- ----------------------------------------------------------------------------
-- PART 2: UPDATED SCHEMA DEFINITIONS & MISSING COLUMNS
-- ----------------------------------------------------------------------------

-- Ensure enum values exist for erp_procurement_status
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'rfq_sent';
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'quotes_received';
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'under_evaluation';
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'vendor_selected';
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'po_issued';
ALTER TYPE erp_procurement_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 1. Table: rfqs
CREATE TABLE IF NOT EXISTS rfqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_requisition_id UUID REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    rfq_number TEXT NOT NULL,
    process_type TEXT DEFAULT 'Quotation Request',
    status TEXT DEFAULT 'draft',
    quotation_registration_no TEXT,
    goal_delivery_date DATE,
    delivery_address TEXT,
    remarks TEXT,
    selected_quotation_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist in rfqs if table was created previously
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS process_type TEXT DEFAULT 'Quotation Request';
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS selected_quotation_url TEXT;

-- 2. Table: rfq_lines
CREATE TABLE IF NOT EXISTS rfq_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    purchase_requisition_line_id UUID,
    project_id UUID REFERENCES projects(id),
    item_id UUID REFERENCES items(id),
    item_code TEXT,
    item_description TEXT NOT NULL,
    specification TEXT,
    quantity NUMERIC(15,2) DEFAULT 1,
    unit TEXT DEFAULT 'nos',
    required_date DATE,
    previous_rate NUMERIC(15,2) DEFAULT 0,
    quoted_rate NUMERIC(15,2) DEFAULT 0,
    tax_rate NUMERIC(5,2) DEFAULT 18,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing rate columns exist in rfq_lines
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS previous_rate NUMERIC(15,2) DEFAULT 0;
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS quoted_rate NUMERIC(15,2) DEFAULT 0;
ALTER TABLE rfq_lines ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 18;

-- 3. Table: rfq_vendors
CREATE TABLE IF NOT EXISTS rfq_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    vendor_id UUID REFERENCES vendors(id),
    supplier_name TEXT,
    email_to TEXT,
    email_cc TEXT,
    quotation_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist in rfq_vendors
ALTER TABLE rfq_vendors ADD COLUMN IF NOT EXISTS email_to TEXT;
ALTER TABLE rfq_vendors ADD COLUMN IF NOT EXISTS email_cc TEXT;
ALTER TABLE rfq_vendors ADD COLUMN IF NOT EXISTS quotation_url TEXT;

-- 4. Table: purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    site_id UUID,
    vendor_id UUID REFERENCES vendors(id),
    purchase_requisition_id UUID REFERENCES purchase_requisitions(id),
    rfq_id UUID REFERENCES rfqs(id),
    vendor_selection_id UUID,
    budget_allocation_id UUID,
    po_number TEXT NOT NULL,
    po_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'draft',
    delivery_date DATE,
    delivery_location TEXT,
    payment_terms TEXT,
    terms_and_conditions TEXT,
    subtotal_amount NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist in purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_location TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;

-- 5. Table: purchase_order_lines
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    line_number INTEGER,
    item_id UUID REFERENCES items(id),
    item_code TEXT,
    item_description TEXT NOT NULL,
    specification TEXT,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    unit_rate NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5,2) DEFAULT 18,
    subtotal_amount NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    line_total NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) DEFAULT 0,
    unit TEXT DEFAULT 'nos',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure missing columns exist in purchase_order_lines
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS line_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'nos';

-- ----------------------------------------------------------------------------
-- PART 3: PERFORMANCE INDEXES & CONSTRAINTS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchase_orders_pr ON purchase_orders(purchase_requisition_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_project ON purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_pr ON rfqs(purchase_requisition_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_rfq ON rfq_lines(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_vendors_rfq ON rfq_vendors(rfq_id);

-- Enable RLS & Permissive Policies
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access purchase_orders" ON purchase_orders;
CREATE POLICY "Allow authenticated full access purchase_orders" ON purchase_orders FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access purchase_order_lines" ON purchase_order_lines;
CREATE POLICY "Allow authenticated full access purchase_order_lines" ON purchase_order_lines FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access rfqs" ON rfqs;
CREATE POLICY "Allow authenticated full access rfqs" ON rfqs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access rfq_lines" ON rfq_lines;
CREATE POLICY "Allow authenticated full access rfq_lines" ON rfq_lines FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access rfq_vendors" ON rfq_vendors;
CREATE POLICY "Allow authenticated full access rfq_vendors" ON rfq_vendors FOR ALL USING (true);
