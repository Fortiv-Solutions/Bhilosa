-- ============================================================================
-- STAGE 1 (part 1 of 2) — WORKFLOW STATUS LABELS
-- File: supabase/migrations/20260807100000_wo_sb_workflow_status_labels.sql
--
-- THE PROBLEM
-- ===========
-- work_orders.status is erp_workflow_status, whose label set is
-- draft / pending / submitted / approved / closed. It has no 'rejected' and no
-- 'cancelled'.
--
-- rejectWorkOrder() in frontend/src/lib/work-orders.ts writes
-- { status: 'rejected' }. That cast fails at runtime with 22P02
-- (invalid input value for enum), so rejecting a Work Order has never worked —
-- the button reports a raw Postgres error. work_orders.wo_status separately
-- allows 'cancelled', which erp_workflow_status also cannot express, so the two
-- status columns cannot be kept consistent for a cancelled contract.
--
-- Stage 1's transition guard keeps the two columns in lockstep, which is only
-- possible once the enum can represent every state wo_status can reach.
--
-- WHY THIS IS A SEPARATE MIGRATION
-- ================================
-- ALTER TYPE ... ADD VALUE cannot be used by a later statement in the SAME
-- transaction ("unsafe use of new value of enum type"). Supabase CLI wraps each
-- migration file in its own transaction, so the labels must be committed by a
-- file that finishes before the guard migration
-- (20260807100100_wo_sb_stage1_governance.sql) references them.
--
-- Idempotent: ADD VALUE IF NOT EXISTS is a no-op on re-run.
-- ============================================================================

ALTER TYPE public.erp_workflow_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE public.erp_workflow_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
