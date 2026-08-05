-- =====================================================================
-- Migration: Fix Vendor Bills & Vendor Bill Lines Schema Alignment
-- Description: 1. Adds missing column `unlocked_fy` to `vendor_bills`
--              2. Adds missing column `grn_line_id` to `vendor_bill_lines`
--              3. Grants permissions and ensures schema consistency.
-- =====================================================================

BEGIN;

-- 1. Ensure unlocked_fy exists on vendor_bills
ALTER TABLE public.vendor_bills 
  ADD COLUMN IF NOT EXISTS unlocked_fy numeric NOT NULL DEFAULT 1;

-- 2. Ensure grn_line_id exists on vendor_bill_lines
ALTER TABLE public.vendor_bill_lines 
  ADD COLUMN IF NOT EXISTS grn_line_id uuid REFERENCES public.goods_receipt_note_lines(id) ON DELETE SET NULL;

-- 3. Create index for fast lookup of billed quantities by grn_line_id
CREATE INDEX IF NOT EXISTS idx_vendor_bill_lines_grn_line_id 
  ON public.vendor_bill_lines(grn_line_id) 
  WHERE grn_line_id IS NOT NULL;

COMMIT;
