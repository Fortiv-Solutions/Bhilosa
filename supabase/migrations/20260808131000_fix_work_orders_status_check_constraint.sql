-- ============================================================================
-- FIX WORK ORDERS STATUS CHECK CONSTRAINT
-- File: supabase/migrations/20260808131000_fix_work_orders_status_check_constraint.sql
--
-- THE PROBLEM
-- ===========
-- In the Stage 1 governance migration (20260807100100_wo_sb_stage1_governance.sql),
-- 'submitted' and 'rejected' were introduced as valid lifecycle statuses for work orders.
-- However, the table's check constraint `work_orders_wo_status_check` was not updated to
-- permit these values, causing row insertion or update to fail when status was set to
-- 'submitted' or 'rejected'.
--
-- THE SOLUTION
-- ============
-- Drop the outdated check constraint and recreate it including 'submitted' and 'rejected'
-- in the allowed list of values.
-- ============================================================================

ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_wo_status_check;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_wo_status_check 
  CHECK (wo_status IN ('draft', 'submitted', 'issued', 'active', 'closed', 'rejected', 'cancelled'));
