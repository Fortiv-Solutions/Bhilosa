-- =====================================================================
-- Procurement status enum alignment
-- =====================================================================
-- The procurement UI drives four-stage workflow statuses
-- (draft → pending_verification → pending_approval → approved/posted)
-- on POs, GRNs and vendor bills, but several of those labels were never
-- added to the underlying enums. Writing them failed at runtime with
-- "invalid input value for enum".
--
-- ALTER TYPE ... ADD VALUE cannot be *used* in the same transaction that
-- adds it, so the labels live in their own migration that runs strictly
-- before 20260731090100_procurement_production_hardening.sql.
--
-- Idempotent and non-destructive: ADD VALUE IF NOT EXISTS is a no-op when
-- the label already exists, and no existing label is renamed or removed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Goods receipt note workflow
-- ---------------------------------------------------------------------
ALTER TYPE public.erp_grn_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.erp_grn_status ADD VALUE IF NOT EXISTS 'pending_verification';
ALTER TYPE public.erp_grn_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.erp_grn_status ADD VALUE IF NOT EXISTS 'posted';
ALTER TYPE public.erp_grn_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.erp_grn_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ---------------------------------------------------------------------
-- Vendor bill / purchase bill workflow
-- ---------------------------------------------------------------------
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'pending_verification';
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'verified';
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.erp_billing_status ADD VALUE IF NOT EXISTS 'paid';

-- ---------------------------------------------------------------------
-- Purchase order workflow
-- ---------------------------------------------------------------------
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'sent_to_vendor';
ALTER TYPE public.erp_po_status ADD VALUE IF NOT EXISTS 'acknowledged';
