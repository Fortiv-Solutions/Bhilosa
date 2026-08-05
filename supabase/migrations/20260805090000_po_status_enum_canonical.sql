-- =====================================================================
-- Purchase order status: canonical enum label set
-- =====================================================================
-- The PO module had three competing status vocabularies writing to the
-- single `purchase_orders.status` column:
--
--   1. erp_po_status (the real enum)  draft / pending_approval / approved /
--      rejected / sent_to_vendor / acknowledged / partially_delivered /
--      delivered / closed / cancelled
--   2. The PO form + stats bar        Draft / Verification / Issued /
--      Accepted_By_Vendor / Fulfilled / Cancelled
--   3. The partial-GRN tolerance RPC  fulfilled / partially_received /
--      accepted_by_vendor
--
-- Only (1) is a valid enum, so every transition driven by the form or by
-- refresh_purchase_order_receipt_status() failed at runtime with
-- "invalid input value for enum erp_po_status". Because the form saves the
-- whole header in one UPDATE, that enum failure rolled back the entire save
-- — line items, rates, addresses and terms included.
--
-- (1) is adopted as canonical: it is already what the deployed budget
-- commitment trigger (fn_auto_commit_po_to_budget) and post_goods_receipt_note
-- read, so choosing anything else would have silently broken budget
-- commitments and inventory posting.
--
-- This migration only guarantees the canonical labels exist. The legacy
-- labels, if any were ever added to the type, are left in place (Postgres
-- cannot drop an enum label) but no code writes them after this release, and
-- 20260805090100 rewrites any existing rows that hold one.
--
-- ALTER TYPE ... ADD VALUE cannot be *used* in the transaction that adds it,
-- so the labels live in their own migration that runs strictly before
-- 20260805090100_po_module_production_hardening.sql.
--
-- Idempotent and non-destructive: ADD VALUE IF NOT EXISTS is a no-op when the
-- label already exists, and no existing label is renamed or removed.
-- =====================================================================

DO $$
BEGIN
  IF to_regtype('public.erp_po_status') IS NULL THEN
    CREATE TYPE public.erp_po_status AS ENUM ('draft');
  END IF;
END $$;

-- Preparation / approval
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'rejected';

-- Dispatch / vendor confirmation
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'sent_to_vendor';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'acknowledged';

-- Fulfilment (written only by the goods-receipt path)
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'partially_delivered';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'delivered';

-- Terminal. 'short_closed' is a first-class status rather than something
-- derived from purchase_order_lines.is_short_closed at render time, so a badge
-- stays a pure function of the header status and the PO tab does not have to
-- load every line to colour a row.
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'short_closed';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'cancelled';
