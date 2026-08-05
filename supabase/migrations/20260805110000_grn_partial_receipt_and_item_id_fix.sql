-- Migration: GRN Partial Receipts and Line Schema Fix
-- Date: 2026-08-04
-- Author: Pramukh ERP Team

BEGIN;

-- 1. Drop NOT NULL constraint on goods_receipt_note_lines.item_id to allow custom items / unmapped PO lines
ALTER TABLE public.goods_receipt_note_lines ALTER COLUMN item_id DROP NOT NULL;

-- 2. Ensure goods_receipt_note_lines has all rich table columns for slot-by-slot tracking
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS po_number text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS pr_number text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS item_group text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS item_code text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS item_brand text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS item_description text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS purchase_category text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS approved_qty numeric;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS po_balance_qty numeric;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS return_qty numeric;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS challan_qty numeric;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS balance_allowed numeric;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS current_balance_qty numeric;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS test_report_no text;
ALTER TABLE public.goods_receipt_note_lines ADD COLUMN IF NOT EXISTS expiry_date date;

-- 3. Stored function: Calculate PO line remaining balances across all non-cancelled GRNs
CREATE OR REPLACE FUNCTION public.get_po_line_remaining_balances(p_po_id uuid)
RETURNS TABLE (
  po_line_id uuid,
  ordered_qty numeric,
  cumulative_received numeric,
  cumulative_accepted numeric,
  remaining_balance numeric,
  over_tolerance_pct numeric,
  max_allowable_accept numeric,
  is_short_closed boolean,
  line_status text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH po_lines AS (
    SELECT 
      pol.id,
      pol.quantity,
      COALESCE(pol.over_tolerance_pct, 5.0) AS tol_pct,
      COALESCE(pol.is_short_closed, false) AS short_closed
    FROM public.purchase_order_lines pol
    WHERE pol.purchase_order_id = p_po_id
  ),
  grn_sums AS (
    SELECT 
      grnl.purchase_order_line_id,
      COALESCE(SUM(grnl.received_qty), 0) AS total_received,
      COALESCE(SUM(grnl.accepted_qty), 0) AS total_accepted
    FROM public.goods_receipt_note_lines grnl
    JOIN public.goods_receipt_notes grn ON grn.id = grnl.grn_id
    WHERE grn.purchase_order_id = p_po_id
      AND grn.status NOT IN ('cancelled', 'rejected')
      AND grn.deleted_at IS NULL
    GROUP BY grnl.purchase_order_line_id
  )
  SELECT 
    pl.id AS po_line_id,
    pl.quantity AS ordered_qty,
    COALESCE(gs.total_received, 0) AS cumulative_received,
    COALESCE(gs.total_accepted, 0) AS cumulative_accepted,
    GREATEST(0, pl.quantity - COALESCE(gs.total_accepted, 0)) AS remaining_balance,
    pl.tol_pct AS over_tolerance_pct,
    (pl.quantity * (1.0 + (pl.tol_pct / 100.0))) AS max_allowable_accept,
    pl.short_closed AS is_short_closed,
    CASE 
      WHEN pl.short_closed THEN 'short_closed'
      WHEN (pl.quantity - COALESCE(gs.total_accepted, 0)) <= 0 THEN 'fully_received'
      WHEN COALESCE(gs.total_accepted, 0) > 0 THEN 'partially_received'
      ELSE 'issued'
    END AS line_status
  FROM po_lines pl
  LEFT JOIN grn_sums gs ON gs.purchase_order_line_id = pl.id;
END;
$$;

COMMIT;
