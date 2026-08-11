-- ============================================================================
-- FIX — drop the pre-Phase-1 unique index that forbids ledger revisions
-- File: supabase/migrations/20260807132000_drop_legacy_budget_ledger_source_index.sql
--
-- THE BUG
-- =======
-- budget_ledger carries TWO unique indexes over the same columns, and they
-- disagree about whether a document may post more than once:
--
--   budget_ledger_source_unique_idx   (source_table, source_id, transaction_type)
--     WHERE source_table IS NOT NULL AND source_id IS NOT NULL
--
--   uq_budget_ledger_source_txn       (source_table, source_id, transaction_type,
--                                      revision_seq)
--     WHERE source_id IS NOT NULL
--
-- The first predates the migration history — it is part of the base schema and
-- appears in no migration file. The second was added by Phase 1
-- (20260805100100_budget_ledger_gross_basis_and_derived_counters.sql), which
-- introduced revision_seq precisely so a document CAN post repeatedly:
--
--   * a Work Order commits, then varies, then varies again;
--   * a certified bill is amended, reversed and re-posted;
--   * fn_next_ledger_revision_seq() exists solely to number those revisions.
--
-- The legacy index makes all of that impossible. It caps every
-- (document, transaction_type) pair at exactly ONE row, so the second
-- commitment on a Work Order fails with
--
--   23505: duplicate key value violates unique constraint
--          "budget_ledger_source_unique_idx"
--
-- IMPACT
-- ======
-- Any second posting of the same type against the same document:
--   * varying a Work Order's value (Stage 4)         — the delta commitment
--   * amending a certified service bill (Phase 3)    — reverse-and-re-post
--   * a partial retention release followed by another
--
-- It went unnoticed because none of those had ever run against a budgeted
-- document: budget_ledger is empty and the only existing Work Order carries no
-- allocation.
--
-- THE FIX
-- =======
-- Drop the legacy index. uq_budget_ledger_source_txn supersedes it exactly —
-- same columns, same uniqueness intent, plus the revision dimension the design
-- requires. Idempotency of the posting functions is preserved: they arbitrate
-- on the four-column index, so a repeated call with the same revision_seq still
-- does nothing.
--
-- Safe on the current dataset: budget_ledger has zero rows, so no duplicate can
-- be introduced by removing it. The guard below refuses to proceed if that ever
-- stops being true and real duplicates exist.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  v_dupes integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'budget_ledger_source_unique_idx'
  ) THEN
    RAISE NOTICE 'budget_ledger_source_unique_idx already absent; nothing to do.';
    RETURN;
  END IF;

  -- The replacement must exist before the legacy one is removed, or the table
  -- would be left with no uniqueness at all.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_budget_ledger_source_txn'
  ) THEN
    RAISE EXCEPTION
      'uq_budget_ledger_source_txn is missing — refusing to drop the legacy index and leave budget_ledger unconstrained. Apply 20260805100100_budget_ledger_gross_basis_and_derived_counters.sql first.';
  END IF;

  -- Paranoia: if rows exist that only the legacy index was holding apart, drop
  -- it anyway is still correct (the four-column index is strictly weaker only
  -- in the revision dimension), but report the count so it is not silent.
  SELECT count(*) INTO v_dupes FROM (
    SELECT source_table, source_id, transaction_type
    FROM public.budget_ledger
    WHERE source_id IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE NOTICE 'Note: % (document, type) group(s) already carry multiple revisions.', v_dupes;
  END IF;

  DROP INDEX IF EXISTS public.budget_ledger_source_unique_idx;
  RAISE NOTICE 'Dropped budget_ledger_source_unique_idx; uq_budget_ledger_source_txn now governs uniqueness, with revision_seq.';
END $$;

-- ----------------------------------------------------------------------------
-- VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'budget_ledger_source_unique_idx'
  ) THEN
    RAISE EXCEPTION 'budget_ledger_source_unique_idx still present.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_budget_ledger_source_txn'
  ) THEN
    RAISE EXCEPTION 'uq_budget_ledger_source_txn is missing — budget_ledger would be unconstrained.';
  END IF;

  RAISE NOTICE 'budget_ledger uniqueness is now revision-aware: a document may post a commitment, vary it, and post again.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
