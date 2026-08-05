-- ============================================================================
-- MIGRATION: RFQ FORM PERSISTENCE COLUMNS & CONSTRAINTS
-- Description: Adds missing fields (process_type, delivery_address, remarks, selected_quotation_url,
--              email_to, email_cc, quotation_url, quoted_rate, previous_rate, tax_rate)
--              enum values, and unique constraints for RFQ tracking.
-- ============================================================================

-- 1. Ensure enum values exist in erp_procurement_status
ALTER TYPE public.erp_procurement_status ADD VALUE IF NOT EXISTS 'quotes_received';
ALTER TYPE public.erp_procurement_status ADD VALUE IF NOT EXISTS 'under_evaluation';

-- 2. Add missing columns to public.rfqs table
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS process_type text DEFAULT 'Quotation Request',
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS selected_quotation_url text;

-- 3. Add missing columns to public.rfq_vendors table
ALTER TABLE public.rfq_vendors
  ADD COLUMN IF NOT EXISTS email_to text,
  ADD COLUMN IF NOT EXISTS email_cc text,
  ADD COLUMN IF NOT EXISTS quotation_url text;

-- 4. Add missing columns to public.rfq_lines table
ALTER TABLE public.rfq_lines
  ADD COLUMN IF NOT EXISTS quoted_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 18;

-- 5. Ensure unique constraint on rfq_vendors (rfq_id, vendor_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfq_vendors_rfq_id_vendor_id_key'
  ) THEN
    ALTER TABLE public.rfq_vendors ADD CONSTRAINT rfq_vendors_rfq_id_vendor_id_key UNIQUE (rfq_id, vendor_id);
  END IF;
END $$;

-- 6. Ensure unique constraint on rfq_lines (rfq_id, line_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rfq_lines_rfq_id_line_number_key'
  ) THEN
    ALTER TABLE public.rfq_lines ADD CONSTRAINT rfq_lines_rfq_id_line_number_key UNIQUE (rfq_id, line_number);
  END IF;
END $$;
