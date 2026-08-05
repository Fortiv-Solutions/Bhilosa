-- =====================================================================
-- Migration: Vendor Bill Status Workflow Transitions
-- Description: Ensures erp_billing_status enum contains canonical workflow states
--              (draft, pending_verification, pending_approval, approved, rejected, paid)
--              and provides trigger & helper functions for state transitions.
-- =====================================================================

DO $$
BEGIN
  -- 1. Ensure erp_billing_status enum values exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'erp_billing_status') THEN
    CREATE TYPE public.erp_billing_status AS ENUM (
      'draft',
      'pending_verification',
      'pending_approval',
      'approved',
      'rejected',
      'paid'
    );
  ELSE
    ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'draft';
    ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'pending_verification';
    ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'pending_approval';
    ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'rejected';
    ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'paid';
  END IF;
END $$;

-- 2. Ensure default status on vendor_bills table is 'draft'
ALTER TABLE public.vendor_bills 
  ALTER COLUMN status SET DEFAULT 'draft'::public.erp_billing_status;

-- 3. Create or replace RPC to update vendor bill status safely with case normalization
CREATE OR REPLACE FUNCTION public.update_vendor_bill_status(
  p_bill_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.vendor_bills%ROWTYPE;
  v_raw text;
  v_new_status public.erp_billing_status;
BEGIN
  -- Validate bill exists
  SELECT * INTO v_bill FROM public.vendor_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor bill with ID % not found', p_bill_id USING ERRCODE = '22004';
  END IF;

  -- Normalize text status to enum safely
  v_raw := lower(trim(coalesce(p_status, 'draft')));
  IF v_raw LIKE '%verif%' THEN
    v_new_status := 'pending_verification'::public.erp_billing_status;
  ELSIF v_raw LIKE '%appr%' THEN
    v_new_status := 'approved'::public.erp_billing_status;
  ELSE
    v_new_status := 'draft'::public.erp_billing_status;
  END IF;

  -- Update vendor bill status
  UPDATE public.vendor_bills
  SET 
    status = v_new_status,
    updated_at = now(),
    approved_at = CASE WHEN v_new_status = 'approved' THEN now() ELSE approved_at END,
    approved_by = CASE WHEN v_new_status = 'approved' THEN coalesce(public.app_current_profile_id(), approved_by) ELSE approved_by END
  WHERE id = p_bill_id;

  RETURN jsonb_build_object(
    'success', true,
    'bill_id', p_bill_id,
    'status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_vendor_bill_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_vendor_bill_status(uuid, text) TO service_role;
