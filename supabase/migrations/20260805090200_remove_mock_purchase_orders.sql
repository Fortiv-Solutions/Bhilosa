-- =====================================================================
-- Retire the seeded mock purchase orders
-- =====================================================================
-- 20260804160000_insert_2_mock_purchase_orders.sql seeded PO-2026-001
-- (₹82,600, status 'approved') and PO-2026-002 (₹306,800, 'draft') against
-- whatever project and vendors happened to sort first. Two consequences:
--
--   1. It is a migration, so it runs against production on deploy.
--   2. PO-2026-001 was inserted already-approved, which fires
--      fn_auto_commit_po_to_budget and posts a real ₹82,600 commitment into
--      budget_ledger, inflating budget_allocations.committed_amount.
--
-- That migration has been reduced to a no-op for fresh deployments. This one
-- removes the rows and reverses the budget commitment on environments where it
-- already ran.
--
-- Scoped strictly to the two seeded po_number values, so a real PO that
-- happens to be numbered similarly under the PO-YYYYMMDD-NNNN scheme issued by
-- next_document_number() is never touched.
-- =====================================================================

DO $$
DECLARE
  v_po_numbers text[] := ARRAY['PO-2026-001', 'PO-2026-002'];
  v_po         record;
  v_ledger     record;
  v_removed    integer := 0;
BEGIN
  FOR v_po IN
    SELECT id, po_number, total_amount, status::text AS status
    FROM public.purchase_orders
    WHERE po_number = ANY(v_po_numbers)
  LOOP
    -- 1. Reverse any budget commitment this PO posted, and roll the
    --    allocation counter back by exactly what the ledger recorded rather
    --    than by the PO total, so a partially released commitment stays
    --    consistent.
    FOR v_ledger IN
      SELECT id, budget_allocation_id, amount, transaction_type::text AS txn_type
      FROM public.budget_ledger
      WHERE source_table = 'purchase_orders' AND source_id = v_po.id
    LOOP
      IF v_ledger.txn_type = 'commitment' AND v_ledger.budget_allocation_id IS NOT NULL THEN
        UPDATE public.budget_allocations
        SET committed_amount = greatest(0, committed_amount - v_ledger.amount),
            updated_at = now()
        WHERE id = v_ledger.budget_allocation_id;
      END IF;

      DELETE FROM public.budget_ledger WHERE id = v_ledger.id;
    END LOOP;

    -- 2. Refuse to delete a PO that real downstream work now depends on.
    --    Cancelling it leaves the audit trail intact instead.
    IF EXISTS (SELECT 1 FROM public.goods_receipt_notes WHERE purchase_order_id = v_po.id)
       OR EXISTS (SELECT 1 FROM public.vendor_bills WHERE purchase_order_id = v_po.id)
    THEN
      RAISE WARNING 'Mock purchase order % has goods receipts or bills against it; cancelling instead of deleting.', v_po.po_number;
      -- trg_guard_purchase_order_status gates 'cancelled' on app_can_approve(),
      -- which is false inside a migration (no auth.uid()). This is the same
      -- transaction-local escape hatch refresh_purchase_order_receipt_status
      -- uses for system-derived transitions.
      PERFORM set_config('app.po_system_transition', 'on', true);
      UPDATE public.purchase_orders
      SET status = 'cancelled'::erp_po_status,
          cancellation_reason = 'Seeded demonstration record retired by migration 20260805090200.',
          cancelled_at = now(),
          deleted_at = now(),
          updated_at = now()
      WHERE id = v_po.id;
      PERFORM set_config('app.po_system_transition', 'off', true);
      CONTINUE;
    END IF;

    -- 3. Clear the status-history rows first: purchase_order_status_history
    --    cascades on PO delete, but doing it explicitly keeps the intent
    --    visible and makes this block safe if the FK is ever changed.
    DELETE FROM public.purchase_order_status_history WHERE purchase_order_id = v_po.id;

    -- 4. Release any award or requisition line that points at this PO, so the
    --    RFQ award matrix does not keep reporting it as ordered.
    UPDATE public.vendor_selection_awards
    SET purchase_order_id = NULL, purchase_order_line_id = NULL, status = 'approved'
    WHERE purchase_order_id = v_po.id;

    DELETE FROM public.purchase_order_lines WHERE purchase_order_id = v_po.id;
    DELETE FROM public.purchase_orders WHERE id = v_po.id;

    v_removed := v_removed + 1;
    RAISE NOTICE 'Removed seeded mock purchase order % (%).', v_po.po_number, v_po.total_amount;
  END LOOP;

  IF v_removed = 0 THEN
    RAISE NOTICE 'No seeded mock purchase orders present; nothing to remove.';
  END IF;
END $$;

-- The seed also created 'UltraTech Cement Ltd' and 'Tata Steel Ltd' vendor
-- rows, but only when the vendors table was empty. They are left in place:
-- they are plausible real suppliers, a live PO or RFQ may already reference
-- them, and deleting a vendor is not this migration's business. Deactivate
-- them by hand from the Vendor Registry if they are not real counterparties.
