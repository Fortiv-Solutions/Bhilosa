-- GRN supplier-invoice document storage + deterministic OCR extraction records.
--
-- Two problems this fixes:
--   1. goods_receipt_notes has nowhere to store the uploaded challan/invoice
--      document, so createFullGoodsReceiptNote accepted an uploaded_invoice_url
--      argument and silently dropped it.
--   2. An invoice carries facts with real downstream value (IRN, invoice number
--      and date, tax breakup, bank details) that FullGrnFormState cannot hold.
--      Those go to grn_invoice_extractions, which also becomes the duplicate-
--      invoice guard and the audit trail for what OCR read versus what a human
--      corrected.

-- ---------------------------------------------------------------------------
-- 1. Document columns on the GRN
-- ---------------------------------------------------------------------------

ALTER TABLE public.goods_receipt_notes
  ADD COLUMN IF NOT EXISTS uploaded_invoice_url  text,
  ADD COLUMN IF NOT EXISTS uploaded_invoice_path text,
  ADD COLUMN IF NOT EXISTS uploaded_invoice_name text,
  ADD COLUMN IF NOT EXISTS uploaded_challan_url  text,
  ADD COLUMN IF NOT EXISTS uploaded_challan_path text,
  ADD COLUMN IF NOT EXISTS uploaded_challan_name text;

COMMENT ON COLUMN public.goods_receipt_notes.uploaded_invoice_path IS
  'Storage path inside the procurement-documents bucket (folder grn-invoice/).';

-- ---------------------------------------------------------------------------
-- 2. Extraction records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grn_invoice_extractions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  grn_id uuid,

  -- Parties
  vendor_name  text,
  vendor_gstin text,
  vendor_pan   text,
  buyer_name   text,
  buyer_gstin  text,
  ship_to_name text,
  ship_to_site text,

  -- Document references
  invoice_number         text,
  invoice_date           date,
  due_date               date,
  credit_days            integer,
  challan_number         text,
  buyer_po_number        text,
  -- Where the PO number was found: po_field | remarks | order_no | inferred.
  -- Anything other than po_field means a human should confirm it.
  buyer_po_number_source text,
  -- The vendor's own order reference. Deliberately separate from
  -- buyer_po_number: AJIT prints 8055 in its "P.O.No." field while the real
  -- Pramukh PO (AD/PAG/PO/2026/0122) sits in the Remarks line.
  vendor_order_ref       text,
  place_of_supply        text,

  -- e-Invoice
  irn          text,
  ack_no       text,
  ack_date     timestamptz,
  eway_bill_no text,
  is_einvoice  boolean NOT NULL DEFAULT false,

  -- Transport
  transporter_name text,
  vehicle_number   text,
  lr_number        text,

  -- Money. taxable + taxes + round_off should equal grand_total.
  taxable_amount numeric,
  cgst_amount    numeric,
  sgst_amount    numeric,
  igst_amount    numeric,
  cess_amount    numeric,
  round_off      numeric,
  grand_total    numeric,
  total_quantity numeric,
  amount_in_words text,
  -- A running account balance printed by some vendors. NEVER this invoice's
  -- value: BHAGAVAT prints "Total Amount Due 21,08,663" on an 8,319 invoice.
  ledger_balance_due numeric,

  -- Structured detail
  bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  hsn_summary   jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_items    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- OCR provenance
  ocr_confidence            numeric,
  ocr_mean_word_confidence  numeric,
  ocr_engine                text,
  ocr_warnings              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Values corrected by arithmetic reconciliation, for audit.
  repaired_fields           jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Source document
  source_file_name text,
  source_file_hash text,
  page_numbers     jsonb NOT NULL DEFAULT '[]'::jsonb,
  storage_path     text,

  -- Review state: OCR output is a draft until a human accepts it.
  reviewed_at  timestamptz,
  reviewed_by  uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,

  CONSTRAINT grn_invoice_extractions_pkey PRIMARY KEY (id),
  CONSTRAINT grn_invoice_extractions_grn_id_fkey
    FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE
);

-- Duplicate-invoice guards.
--
-- The IRN is globally unique per government-registered e-invoice, so it is the
-- strongest key available. It is only populated when OCR could read all 64 hex
-- characters cleanly, which is why the index is partial rather than a NOT NULL
-- column: a corrupted IRN would be worse than a missing one.
CREATE UNIQUE INDEX IF NOT EXISTS grn_invoice_extractions_irn_key
  ON public.grn_invoice_extractions (irn)
  WHERE irn IS NOT NULL;

-- Fallback key for non-e-invoices: one invoice number per vendor.
CREATE UNIQUE INDEX IF NOT EXISTS grn_invoice_extractions_vendor_invoice_key
  ON public.grn_invoice_extractions (vendor_gstin, invoice_number)
  WHERE vendor_gstin IS NOT NULL AND invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS grn_invoice_extractions_grn_id_idx
  ON public.grn_invoice_extractions (grn_id);
CREATE INDEX IF NOT EXISTS grn_invoice_extractions_po_idx
  ON public.grn_invoice_extractions (buyer_po_number);
-- Lets a re-upload of the same file be recognised without re-running OCR.
CREATE INDEX IF NOT EXISTS grn_invoice_extractions_file_hash_idx
  ON public.grn_invoice_extractions (source_file_hash);

-- Keep updated_at fresh. set_updated_at() already exists in this schema.
DROP TRIGGER IF EXISTS set_grn_invoice_extractions_updated_at
  ON public.grn_invoice_extractions;
CREATE TRIGGER set_grn_invoice_extractions_updated_at
  BEFORE UPDATE ON public.grn_invoice_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.grn_invoice_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grn_invoice_extractions_select ON public.grn_invoice_extractions;
CREATE POLICY grn_invoice_extractions_select
  ON public.grn_invoice_extractions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS grn_invoice_extractions_insert ON public.grn_invoice_extractions;
CREATE POLICY grn_invoice_extractions_insert
  ON public.grn_invoice_extractions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS grn_invoice_extractions_update ON public.grn_invoice_extractions;
CREATE POLICY grn_invoice_extractions_update
  ON public.grn_invoice_extractions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Storage bucket for the uploaded documents
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('procurement-documents', 'procurement-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS procurement_documents_read ON storage.objects;
CREATE POLICY procurement_documents_read
  ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'procurement-documents');

DROP POLICY IF EXISTS procurement_documents_write ON storage.objects;
CREATE POLICY procurement_documents_write
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'procurement-documents');

DROP POLICY IF EXISTS procurement_documents_update ON storage.objects;
CREATE POLICY procurement_documents_update
  ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'procurement-documents');
