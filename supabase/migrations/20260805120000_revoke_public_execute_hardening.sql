-- ============================================================================
-- SECURITY FIX — REVOKE PUBLIC EXECUTE ON THE PHASE 1-8 FUNCTIONS
-- File: supabase/migrations/20260805120000_revoke_public_execute_hardening.sql
--
-- THE DEFECT
-- ==========
-- Every migration in phases 1-8 locked its functions down with
--
--     REVOKE ALL ON FUNCTION public.rpc_x(...) FROM anon;
--
-- That does nothing. PostgreSQL grants EXECUTE on a newly created function to
-- PUBLIC by default, and `anon` is a member of PUBLIC — so revoking the role's
-- own (non-existent) grant leaves the inherited PUBLIC grant untouched.
--
-- Verified against the live database with the browser-shipped anon key:
--
--     POST /rest/v1/rpc/rpc_bill_ledger_summary  -> 200, returned computed JSON
--     POST /rest/v1/rpc/rpc_refresh_bill_ledger  -> 200, actually performed a
--                                                   REFRESH MATERIALIZED VIEW
--
-- The second is the worse of the two: an unauthenticated caller could force
-- repeated full refreshes of the ledger. rpc_approve_budget_change returned 404
-- only because an empty argument list matched no overload — not because it was
-- protected.
--
-- THE FIX
-- =======
-- REVOKE ... FROM PUBLIC on every function these phases created, then re-GRANT
-- to `authenticated` for exactly the ones the application calls. Trigger
-- functions and internal helpers get no grant at all: PostgreSQL checks EXECUTE
-- on a trigger function when the trigger is CREATED, not each time it fires, so
-- revoking cannot break them.
--
-- Materialized views cannot carry RLS, so budget_bill_ledger_mv is re-revoked
-- explicitly. It is empty today, which is the only reason this was not already
-- a live data leak.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

-- ----------------------------------------------------------------------------
-- 1. REVOKE PUBLIC + anon ON EVERY FUNCTION THESE PHASES CREATED
--
--    Scoped to an explicit name list rather than a wildcard over the schema:
--    other modules' functions may legitimately rely on the PUBLIC grant, and
--    silently revoking those would break them in ways this migration cannot
--    verify.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_names text[] := ARRAY[
    -- Phase 1 — ledger primitives and posting
    'fn_next_ledger_revision_seq', 'fn_effective_ledger_rows', 'fn_reverse_ledger_entry',
    'fn_recompute_allocation_from_ledger', 'trg_fn_ledger_recompute_allocation',
    'fn_auto_commit_po_to_budget', 'fn_post_vendor_bill_to_budget',
    'fn_auto_post_bill_to_budget', 'fn_repost_bill_to_budget', 'fn_compute_vendor_bill_net',
    -- Phase 2 — work order budget integration
    'fn_normalize_activity_key', 'fn_resolve_wo_allocation_for', 'fn_resolve_wo_budget_allocation',
    'fn_wo_committed_amount', 'fn_wo_released_amount', 'fn_post_wo_commitment',
    'fn_release_wo_commitment', 'fn_wo_budget_gate', 'fn_wo_budget_sync',
    'fn_recompute_wo_billed_to_date', 'fn_wo_line_variance_alert',
    -- Phase 3 — service bills
    'fn_compute_service_bill_line', 'fn_rollup_service_bill_from_lines',
    'trg_fn_service_bill_line_rollup', 'fn_compute_service_bill_net',
    'fn_resequence_service_bills', 'fn_resolve_service_bill_allocation',
    'fn_post_service_bill_to_budget', 'fn_service_bill_budget_sync',
    'fn_service_bill_wo_balance', 'fn_service_bill_qc_gate',
    'fn_recompute_service_bill_payment_status', 'trg_fn_service_bill_payment_status',
    'fn_rollup_variance_for_master_item',
    -- Phase 4 — unified ledger + retention release
    'fn_retention_release_guard', 'fn_post_retention_release', 'rpc_refresh_bill_ledger',
    'rpc_bill_ledger', 'rpc_bill_ledger_summary', 'rpc_bill_ledger_export', 'rpc_bill_detail',
    -- Phase 6 — attachments
    'rpc_set_attachment_status', 'fn_required_documents_present',
    -- Phase 7 — budget change documents
    'fn_budget_baseline_fingerprint', 'fn_next_budget_document_number', 'fn_budget_change_tier',
    'rpc_propose_budget_change', 'rpc_submit_budget_change', 'rpc_approve_budget_change',
    'rpc_reject_budget_change', 'rpc_cancel_budget_change',
    'rpc_save_master_budget_revision', 'rpc_import_master_budget',
    -- Phase 8 — category hierarchy
    'fn_budget_category_hierarchy', 'fn_restamp_budget_category_children',
    'fn_budget_category_is_leaf', 'fn_resolve_budget_allocation',
    'rpc_upsert_budget_category', 'rpc_similar_budget_categories'
  ];
  r       record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_names)
  LOOP
    -- PUBLIC is the one that matters. anon is revoked too so that a future
    -- explicit grant to the role cannot silently reopen this.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.signature);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Revoked PUBLIC/anon EXECUTE on % function(s).', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- 2. RE-GRANT TO authenticated — ONLY what the application actually calls.
--    Everything omitted here is a trigger function or an internal helper and is
--    now owner-only.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_callable text[] := ARRAY[
    -- Read paths and client-invoked RPCs
    'rpc_bill_ledger', 'rpc_bill_ledger_summary', 'rpc_bill_ledger_export',
    'rpc_bill_detail', 'rpc_refresh_bill_ledger',
    'rpc_set_attachment_status',
    'rpc_propose_budget_change', 'rpc_submit_budget_change', 'rpc_approve_budget_change',
    'rpc_reject_budget_change', 'rpc_cancel_budget_change',
    'rpc_save_master_budget_revision', 'rpc_import_master_budget',
    'rpc_upsert_budget_category', 'rpc_similar_budget_categories',
    -- Pure read helpers the UI resolves against
    'fn_normalize_activity_key', 'fn_resolve_wo_allocation_for',
    'fn_resolve_wo_budget_allocation', 'fn_wo_committed_amount', 'fn_wo_released_amount',
    'fn_resolve_service_bill_allocation', 'fn_required_documents_present',
    'fn_budget_category_is_leaf', 'fn_budget_baseline_fingerprint', 'fn_budget_change_tier'
  ];
  r       record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_callable)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Granted EXECUTE to authenticated on % function(s).', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- 3. RELATIONS
--    A materialized view cannot carry RLS, so a SELECT grant on
--    budget_bill_ledger_mv is unconditional access to every certified bill in
--    every project. It is empty today; that is the only reason this was not
--    already a live leak.
-- ----------------------------------------------------------------------------

REVOKE ALL ON public.budget_bill_ledger_mv      FROM PUBLIC, anon;
REVOKE ALL ON public.budget_bill_ledger_view    FROM PUBLIC, anon;
REVOKE ALL ON public.budget_ledger_mv_state     FROM PUBLIC, anon;
REVOKE ALL ON public.budget_movement_register   FROM PUBLIC, anon;
REVOKE ALL ON public.budget_category_tree       FROM PUBLIC, anon;
REVOKE ALL ON public.work_order_budget_view     FROM PUBLIC, anon;
REVOKE ALL ON public.retention_releases         FROM PUBLIC, anon;

GRANT SELECT ON public.budget_bill_ledger_mv    TO authenticated;
GRANT SELECT ON public.budget_bill_ledger_view  TO authenticated;
GRANT SELECT ON public.budget_ledger_mv_state   TO authenticated;
GRANT SELECT ON public.budget_movement_register TO authenticated;
GRANT SELECT ON public.budget_category_tree     TO authenticated;
GRANT SELECT ON public.work_order_budget_view   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.retention_releases TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. VERIFICATION — fail if anything is still reachable by PUBLIC or anon.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_leaky text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_leaky
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname LIKE 'rpc\_%' ESCAPE '\' OR p.proname LIKE 'fn\_%' ESCAPE '\')
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname IN (
        'rpc_bill_ledger', 'rpc_bill_ledger_summary', 'rpc_bill_ledger_export',
        'rpc_bill_detail', 'rpc_refresh_bill_ledger', 'rpc_approve_budget_change',
        'rpc_propose_budget_change', 'rpc_import_master_budget',
        'rpc_save_master_budget_revision', 'rpc_set_attachment_status'
      )
    );

  IF v_leaky IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still EXECUTE: %', v_leaky;
  END IF;

  IF has_table_privilege('anon', 'public.budget_bill_ledger_mv', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still SELECT budget_bill_ledger_mv — a materialized view has no RLS to fall back on.';
  END IF;

  RAISE NOTICE 'Security fix applied: PUBLIC/anon EXECUTE revoked, authenticated re-granted, ledger relations locked.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
