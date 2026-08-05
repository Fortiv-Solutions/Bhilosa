-- Migration: Partial GRN Receipts, Dynamic PO Balance Tracking, and Item Tolerance Engine
-- Target Tables: item_master, purchase_order_lines, purchase_orders, goods_receipt_notes, goods_receipt_note_lines

-- 1. Extend item_master with default over/under delivery tolerance limits
ALTER TABLE item_master
  ADD COLUMN IF NOT EXISTS over_delivery_tolerance_pct NUMERIC(5,2) DEFAULT 5.00 CHECK (over_delivery_tolerance_pct >= 0),
  ADD COLUMN IF NOT EXISTS under_delivery_tolerance_pct NUMERIC(5,2) DEFAULT 0.00 CHECK (under_delivery_tolerance_pct >= 0);

-- 2. Extend purchase_order_lines with line-level tolerance & short closure flags
ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS over_tolerance_pct NUMERIC(5,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS under_tolerance_pct NUMERIC(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS is_short_closed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS short_closed_reason TEXT;

-- 3. Stored Helper Function: Compute Live PO Line Remaining Balances & Tolerances
DROP FUNCTION IF EXISTS get_po_line_remaining_balances(uuid);
DROP FUNCTION IF EXISTS refresh_purchase_order_receipt_status(uuid);

CREATE OR REPLACE FUNCTION get_po_line_remaining_balances(p_po_id UUID)
RETURNS TABLE (
  po_line_id UUID,
  ordered_qty NUMERIC,
  cumulative_received NUMERIC,
  cumulative_accepted NUMERIC,
  remaining_balance NUMERIC,
  over_tolerance_pct NUMERIC,
  max_allowable NUMERIC,
  is_short_closed BOOLEAN,
  line_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pol.id AS po_line_id,
    pol.quantity AS ordered_qty,
    COALESCE(SUM(grnl.received_qty), 0) AS cumulative_received,
    COALESCE(SUM(grnl.accepted_qty), 0) AS cumulative_accepted,
    GREATEST(0, pol.quantity - COALESCE(SUM(grnl.accepted_qty), 0)) AS remaining_balance,
    COALESCE(pol.over_tolerance_pct, 5.00) AS over_tolerance_pct,
    GREATEST(0, pol.quantity - COALESCE(SUM(grnl.accepted_qty), 0)) + (pol.quantity * COALESCE(pol.over_tolerance_pct, 5.00) / 100.0) AS max_allowable,
    COALESCE(pol.is_short_closed, false) AS is_short_closed,
    CASE 
      WHEN COALESCE(pol.is_short_closed, false) THEN 'short_closed'
      WHEN COALESCE(SUM(grnl.accepted_qty), 0) >= pol.quantity THEN 'fulfilled'
      WHEN COALESCE(SUM(grnl.accepted_qty), 0) > 0 THEN 'partially_received'
      ELSE 'issued'
    END AS line_status
  FROM purchase_order_lines pol
  LEFT JOIN goods_receipt_note_lines grnl ON grnl.purchase_order_line_id = pol.id
  LEFT JOIN goods_receipt_notes grn ON grn.id = grnl.grn_id AND grn.status != 'cancelled'
  WHERE pol.purchase_order_id = p_po_id
  GROUP BY pol.id, pol.quantity, pol.over_tolerance_pct, pol.is_short_closed;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. RPC Function to Update PO Status based on Cumulative Receipts
CREATE OR REPLACE FUNCTION refresh_purchase_order_receipt_status(p_po_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_total_lines INT;
  v_fulfilled_lines INT;
  v_received_lines INT;
  v_new_status TEXT;
BEGIN
  SELECT COUNT(*), 
         COUNT(*) FILTER (WHERE line_status IN ('fulfilled', 'short_closed')),
         COUNT(*) FILTER (WHERE cumulative_accepted > 0)
  INTO v_total_lines, v_fulfilled_lines, v_received_lines
  FROM get_po_line_remaining_balances(p_po_id);

  IF v_total_lines > 0 AND v_fulfilled_lines = v_total_lines THEN
    v_new_status := 'fulfilled';
  ELSIF v_received_lines > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := 'accepted_by_vendor';
  END IF;

  UPDATE purchase_orders
  SET status = v_new_status,
      updated_at = NOW()
  WHERE id = p_po_id;

  RETURN v_new_status;
END;
$$ LANGUAGE plpgsql VOLATILE;
