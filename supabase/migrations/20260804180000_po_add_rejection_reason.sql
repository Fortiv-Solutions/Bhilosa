-- Migration: Add dedicated rejection_reason column to purchase_orders
-- Previously, rejection reasons were stored in terms_and_conditions_legal (repurposed column)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'purchase_orders'
    AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.purchase_orders ADD COLUMN rejection_reason text;
    COMMENT ON COLUMN public.purchase_orders.rejection_reason IS 'Reason for rejection when PO status is set to rejected';
  END IF;
END $$;
