-- ============================================================================
-- BUDGET LEDGER — NEW TRANSACTION TYPES
-- File: supabase/migrations/20260805100000_budget_ledger_txn_types.sql
--
-- Ships separately from the DDL that uses these values: a new enum label cannot
-- be referenced inside the same transaction that adds it. This mirrors the
-- existing precedent in 20260731090000_procurement_status_enums.sql.
--
-- WHY THESE FOUR
-- --------------
-- public.erp_budget_txn_type currently has:
--     allocation, commitment, release, actual, adjustment
--
-- That set can express "money was reserved" and "money was spent", but not the
-- two things a construction budget does constantly:
--
--   retention_held / retention_released
--       Retention is a withholding of PAYMENT, not a reduction of COST. Posting
--       'actual' net of retention (the behaviour this migration set replaces)
--       understates cost-to-date by the retention percentage — 5% by default in
--       budget_config, 10% on several Work Order templates. Retention needs its
--       own liability track so cost stays gross and the withheld balance stays
--       reconcilable. Without 'retention_released' the balance can only ever
--       grow, which is exactly the current defect.
--
--   advance_paid / advance_recovered
--       budget_allocations.advance_amount is decremented by the bill trigger and
--       incremented by nothing, so it is permanently zero and advance recovery
--       silently erases cost. Added now — cheap here, expensive to retrofit once
--       the ledger carries live rows — so the advance document can post against
--       an already-correct model when it is built.
--
-- Idempotent: ADD VALUE IF NOT EXISTS is a no-op on re-run.
-- ============================================================================

ALTER TYPE public.erp_budget_txn_type ADD VALUE IF NOT EXISTS 'retention_held';
ALTER TYPE public.erp_budget_txn_type ADD VALUE IF NOT EXISTS 'retention_released';
ALTER TYPE public.erp_budget_txn_type ADD VALUE IF NOT EXISTS 'advance_paid';
ALTER TYPE public.erp_budget_txn_type ADD VALUE IF NOT EXISTS 'advance_recovered';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
