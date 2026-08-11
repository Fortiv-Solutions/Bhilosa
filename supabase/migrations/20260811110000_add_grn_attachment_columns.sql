-- Add attachment columns to goods_receipt_notes table
ALTER TABLE public.goods_receipt_notes
  ADD COLUMN IF NOT EXISTS uploaded_challan_url text,
  ADD COLUMN IF NOT EXISTS uploaded_challan_path text,
  ADD COLUMN IF NOT EXISTS uploaded_challan_name text,
  ADD COLUMN IF NOT EXISTS uploaded_invoice_url text,
  ADD COLUMN IF NOT EXISTS uploaded_invoice_path text,
  ADD COLUMN IF NOT EXISTS uploaded_invoice_name text;
