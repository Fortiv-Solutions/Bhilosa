-- ============================================================================
-- STAGE 1 (part 2 of 2) — WORK ORDER / SERVICE BILL GOVERNANCE
-- File: supabase/migrations/20260807100100_wo_sb_stage1_governance.sql
--
-- Depends on:
--   20260803000000_work_order_module_enhancement.sql   (wo_status, service_bills gates)
--   20260805100200_work_order_budget_integration.sql   (WO commitment, budget gate)
--   20260805100300_service_bill_budget_integration.sql (SB posting, approval audit cols)
--   20260805090100_po_module_production_hardening.sql  (app_* auth helpers)
--   20260807100000_wo_sb_workflow_status_labels.sql    (rejected/cancelled labels)
--
-- THE PROBLEM
-- ===========
-- The Work Order and Service Bill money engine (Phases 2-4) is correct and
-- enforced in the database. Its CONTROL SURFACE is wide open:
--
--   A. work_orders.wo_status was driven by a free <select> in the browser
--      (app/work-orders/page.tsx, app/work-orders/[id]/page.tsx) calling
--      updateWorkOrderStatus(), a raw column write. Any authenticated user
--      could move a contract draft -> closed, or regress active -> draft while
--      commitments were live. approveWorkOrder() existed but was never called,
--      so work_orders.approved_by was NEVER populated: there is no record of
--      who authorised any subcontract.
--
--   B. Neither module had ANY role gating. Every RLS policy on work_orders,
--      work_order_lines, service_bills and service_bill_lines was
--      USING (true) / WITH CHECK (true), so any signed-in user could certify a
--      bill and post cost to the budget ledger.
--
--   C. No segregation of duties. One person could raise, verify, certify and
--      pay the same bill.
--
--   D. No audit trail of state transitions on either document.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. Legal-transition tables for wo_status and service_bills.status; anything
--    absent is rejected by a guard trigger. The database becomes the authority.
-- 2. Keeps work_orders.status (erp_workflow_status) in lockstep with wo_status,
--    derived server-side, so the two can no longer disagree.
-- 3. Stamps actor + timestamp columns server-side, so approved_by cannot be
--    forged by a client that simply posts it, and is never again left NULL.
-- 4. Gates privileged transitions on app_can_approve().
-- 5. Enforces segregation of duties on service bills:
--       certifier <> preparer  and  certifier <> verifier.
-- 6. Append-only status history on both documents.
-- 7. Role-aware RLS replacing USING (true).
-- 8. set_work_order_status() / set_service_bill_status() RPCs as the single
--    deliberate entry point for a transition.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================
-- It does not change any budget arithmetic. Commitment, release, retention,
-- drawdown and variance all keep behaving exactly as Phases 2-4 defined them.
-- The existing budget triggers fire from the same column writes as before.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0a. LOCK DISCIPLINE
--
--     Same discipline as Phases 2/3: take every table lock up front, in one
--     statement, in a fixed (alphabetical) order. Every ALTER TABLE fires
--     PostgREST's DDL watch, which reads across user tables; a long DDL
--     transaction that grabs tables one at a time WILL eventually deadlock
--     against that reader. lock_timeout makes a contended run fail in seconds
--     with a clear message instead of hanging.
-- ----------------------------------------------------------------------------

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS — fail with an actionable message rather than half-applying.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = 'wo_status'
  ) THEN
    v_missing := array_append(v_missing,
      'work_orders.wo_status (apply 20260803000000_work_order_module_enhancement.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_bills' AND column_name = 'approved_by'
  ) THEN
    v_missing := array_append(v_missing,
      'service_bills.approved_by (apply 20260805100300_service_bill_budget_integration.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'app_can_approve'
  ) THEN
    v_missing := array_append(v_missing,
      'app_can_approve() (apply 20260805090100_po_module_production_hardening.sql)');
  END IF;

  -- Part 1 of this stage must have COMMITTED, or the guard below cannot cast
  -- 'rejected' / 'cancelled' to erp_workflow_status.
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'erp_workflow_status' AND e.enumlabel = 'rejected'
  ) THEN
    v_missing := array_append(v_missing,
      'erp_workflow_status.rejected (apply 20260807100000_wo_sb_workflow_status_labels.sql first)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 1 governance cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

LOCK TABLE public.service_bill_lines,
           public.service_bills,
           public.work_order_lines,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. LIFECYCLE AUDIT COLUMNS
--
--    work_orders had approved_by/at only. A rejection reason column exists
--    (Phase 2) but nothing recorded WHO rejected, WHEN, or who submitted it for
--    approval in the first place.
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS submitted_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by         uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at         timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by           uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.work_orders.submitted_by IS
  'Actor who submitted the draft for approval. Stamped server-side by trg_guard_work_order_status; never trusted from the client.';

-- service_bills already has verified_by/at, approved_by/at, rejected_by/at and
-- rejection_reason from Phase 3. Only the submit step was unrecorded.
ALTER TABLE public.service_bills
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. LEGAL TRANSITIONS
--
--    Expressed as functions rather than a table so they are inlinable, and so
--    the frontend can mirror them without a round trip. Keep
--    frontend/src/lib/erp/work-order/status.ts in step with these two.
-- ----------------------------------------------------------------------------

-- 2a. Canonicalise a wo_status spelling. Anything unrecognised returns NULL and
--     is rejected by the guard, rather than being silently stored.
CREATE OR REPLACE FUNCTION public.wo_canonical_status(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(regexp_replace(coalesce(trim(p_status), ''), '[\s-]+', '_', 'g'))
    WHEN 'draft'      THEN 'draft'
    WHEN 'submitted'  THEN 'submitted'
    WHEN 'pending'    THEN 'submitted'
    WHEN 'issued'     THEN 'issued'
    WHEN 'approved'   THEN 'issued'
    WHEN 'active'     THEN 'active'
    WHEN 'in_progress' THEN 'active'
    WHEN 'closed'     THEN 'closed'
    WHEN 'completed'  THEN 'closed'
    WHEN 'rejected'   THEN 'rejected'
    WHEN 'cancelled'  THEN 'cancelled'
    WHEN 'canceled'   THEN 'cancelled'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.wo_canonical_status(text) IS
  'Normalises a Work Order lifecycle status spelling. Returns NULL for anything unrecognised so the guard rejects it instead of storing a value no query will match.';

-- 2b. Legal Work Order moves.
--
--     'rejected' is a terminal-ish state that can be reworked back to draft.
--     'issued' -> 'draft' is deliberately ABSENT: the commitment has been
--     posted by then, and un-issuing would strand ledger rows. Cancel instead,
--     which releases the residual commitment via the Phase 2 trigger.
CREATE OR REPLACE FUNCTION public.wo_transition_allowed(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE public.wo_canonical_status(p_from)
    WHEN 'draft'     THEN public.wo_canonical_status(p_to) IN ('submitted', 'issued', 'cancelled')
    WHEN 'submitted' THEN public.wo_canonical_status(p_to) IN ('issued', 'rejected', 'draft', 'cancelled')
    WHEN 'rejected'  THEN public.wo_canonical_status(p_to) IN ('draft', 'cancelled')
    WHEN 'issued'    THEN public.wo_canonical_status(p_to) IN ('active', 'closed', 'cancelled')
    WHEN 'active'    THEN public.wo_canonical_status(p_to) IN ('closed', 'cancelled')
    -- Terminal. A closed or cancelled contract is reopened by raising a new
    -- Work Order or (Stage 4) a variation, never by mutating this row.
    WHEN 'closed'    THEN false
    WHEN 'cancelled' THEN false
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.wo_transition_allowed(text, text) IS
  'Legal Work Order lifecycle moves. issued->draft is absent by design: the budget commitment exists by then, so the reverse of issuing is cancelling (which releases it), not un-issuing.';

-- 2c. Service bill status canonicalisation + legal moves.
CREATE OR REPLACE FUNCTION public.sb_canonical_status(p_status text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(regexp_replace(coalesce(trim(p_status), ''), '[\s-]+', '_', 'g'))
    WHEN 'draft'     THEN 'draft'
    WHEN 'submitted' THEN 'submitted'
    WHEN 'verified'  THEN 'verified'
    WHEN 'approved'  THEN 'approved'
    WHEN 'certified' THEN 'approved'
    WHEN 'rejected'  THEN 'rejected'
    WHEN 'paid'      THEN 'paid'
    ELSE NULL
  END;
$$;

-- 'paid' is reached by the payments trigger
-- (fn_recompute_service_bill_payment_status), not by a human, but it is still a
-- legal destination from 'approved' and must be permitted here or every full
-- payment would fail.
--
-- approved -> verified is permitted so a wrongly certified bill can be pulled
-- back: Phase 3's fn_service_bill_budget_sync reverses its ledger rows on the
-- way out, so this does not strand cost in the budget.
CREATE OR REPLACE FUNCTION public.sb_transition_allowed(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE public.sb_canonical_status(p_from)
    WHEN 'draft'     THEN public.sb_canonical_status(p_to) IN ('submitted', 'rejected')
    WHEN 'submitted' THEN public.sb_canonical_status(p_to) IN ('verified', 'rejected', 'draft')
    WHEN 'verified'  THEN public.sb_canonical_status(p_to) IN ('approved', 'rejected', 'submitted')
    WHEN 'approved'  THEN public.sb_canonical_status(p_to) IN ('paid', 'verified', 'rejected')
    WHEN 'rejected'  THEN public.sb_canonical_status(p_to) IN ('draft', 'submitted')
    WHEN 'paid'      THEN false
    ELSE false
  END;
$$;

-- ----------------------------------------------------------------------------
-- 3. STATUS HISTORY — append-only, mirroring purchase_order_status_history.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_order_status_history (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id          uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  project_id             uuid REFERENCES public.projects(id),
  from_status            text,
  to_status              text NOT NULL,
  reason                 text,
  changed_by             uuid REFERENCES public.profiles(id),
  changed_at             timestamptz NOT NULL DEFAULT now(),
  total_amount_at_change numeric
);

COMMENT ON TABLE public.work_order_status_history IS
  'Append-only audit trail of every work_orders.wo_status change, written by trg_wo_record_status_history. Insert-only for authenticated roles; no UPDATE or DELETE policy exists.';

CREATE INDEX IF NOT EXISTS ix_wo_status_history_wo
  ON public.work_order_status_history (work_order_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_wo_status_history_project
  ON public.work_order_status_history (project_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.service_bill_status_history (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_bill_id        uuid NOT NULL REFERENCES public.service_bills(id) ON DELETE CASCADE,
  project_id             uuid REFERENCES public.projects(id),
  work_order_id          uuid REFERENCES public.work_orders(id),
  from_status            text,
  to_status              text NOT NULL,
  reason                 text,
  changed_by             uuid REFERENCES public.profiles(id),
  changed_at             timestamptz NOT NULL DEFAULT now(),
  total_amount_at_change numeric
);

COMMENT ON TABLE public.service_bill_status_history IS
  'Append-only audit trail of every service_bills.status change, written by trg_sb_record_status_history. Insert-only for authenticated roles; no UPDATE or DELETE policy exists.';

CREATE INDEX IF NOT EXISTS ix_sb_status_history_bill
  ON public.service_bill_status_history (service_bill_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_sb_status_history_project
  ON public.service_bill_status_history (project_id, changed_at DESC);

-- ----------------------------------------------------------------------------
-- 4. WORK ORDER STATUS GUARD
--
--    BEFORE UPDATE OF wo_status, status. Validates the move, enforces
--    authority, stamps the actor, and derives work_orders.status from
--    wo_status so the two columns can never diverge again.
-- ----------------------------------------------------------------------------

-- Map the canonical lifecycle state onto the legacy erp_workflow_status column.
-- 'active' has no distinct workflow label; it stays 'approved', which is what
-- the pre-existing updateWorkOrderStatus() mapping also produced.
CREATE OR REPLACE FUNCTION public.wo_workflow_status_for(p_wo_status text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE public.wo_canonical_status(p_wo_status)
    WHEN 'draft'     THEN 'draft'
    WHEN 'submitted' THEN 'submitted'
    WHEN 'issued'    THEN 'approved'
    WHEN 'active'    THEN 'approved'
    WHEN 'closed'    THEN 'closed'
    WHEN 'rejected'  THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.trg_guard_work_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from       text := public.wo_canonical_status(OLD.wo_status);
  v_to         text := public.wo_canonical_status(NEW.wo_status);
  v_actor      uuid := public.app_current_profile_id();
  v_line_count integer;
  -- Moves that commit money or end the contract need approval authority.
  v_privileged text[] := ARRAY['issued', 'rejected', 'closed', 'cancelled'];
  -- Set transaction-locally by a SECURITY DEFINER system path (currently the
  -- backfill in §9). A client reaching this trigger through PostgREST can only
  -- issue an UPDATE and has no way to run set_config first, so this cannot be
  -- forged from the browser.
  v_system boolean := coalesce(
    nullif(current_setting('app.wo_system_transition', true), ''), 'off') = 'on';
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised Work Order status %. Valid values: draft, submitted, issued, active, closed, rejected, cancelled.',
      NEW.wo_status USING ERRCODE = '22023';
  END IF;

  -- Store canonically, so a legacy spelling from an un-upgraded client is
  -- normalised rather than rejected.
  NEW.wo_status := v_to;

  -- Always keep the legacy workflow column derived from the lifecycle column.
  -- Doing this even when the state is unchanged repairs rows whose two columns
  -- had already drifted under the old free-write path.
  NEW.status := public.wo_workflow_status_for(v_to)::erp_workflow_status;

  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF NOT public.wo_transition_allowed(v_from, v_to) THEN
    RAISE EXCEPTION 'Work Order % cannot move from % to %.',
      coalesce(NEW.work_order_number, NEW.id::text), v_from, v_to
      USING ERRCODE = '22023',
            HINT = 'Use set_work_order_status() for a deliberate transition. A closed or cancelled Work Order is terminal.';
  END IF;

  IF v_to = ANY(v_privileged) AND NOT v_system AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may move a Work Order to %.', v_to
      USING ERRCODE = '42501';
  END IF;

  -- A contract cannot be issued empty: fn_post_wo_commitment posts
  -- total_amount verbatim, so a zero-value issue would encumber nothing while
  -- presenting as a live contract.
  IF v_to = 'issued' THEN
    SELECT count(*) INTO v_line_count
    FROM public.work_order_lines WHERE work_order_id = NEW.id;

    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Work Order % has no item lines and cannot be issued.',
        coalesce(NEW.work_order_number, NEW.id::text) USING ERRCODE = '22023';
    END IF;

    IF NEW.agency_id IS NULL AND NEW.vendor_id IS NULL AND NEW.contractor_id IS NULL THEN
      RAISE EXCEPTION 'Work Order % has no agency or contractor and cannot be issued.',
        coalesce(NEW.work_order_number, NEW.id::text) USING ERRCODE = '22023';
    END IF;

    -- Rate-based Work Orders legitimately carry no fixed total (the 15 seeded
    -- templates include rate-only formats), so value is required for
    -- fixed_scope only. Stage 4 adds a ceiling for the rate-based case.
    IF coalesce(NEW.wo_type, 'fixed_scope') = 'fixed_scope'
       AND coalesce(NEW.total_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'Fixed-scope Work Order % has no value and cannot be issued.',
        coalesce(NEW.work_order_number, NEW.id::text) USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_to = 'rejected' AND coalesce(trim(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required to reject Work Order %.',
      coalesce(NEW.work_order_number, NEW.id::text) USING ERRCODE = '22023';
  END IF;

  IF v_to = 'cancelled' AND coalesce(trim(NEW.cancellation_reason), '') = '' THEN
    RAISE EXCEPTION 'A cancellation reason is required to cancel Work Order %.',
      coalesce(NEW.work_order_number, NEW.id::text) USING ERRCODE = '22023';
  END IF;

  -- Stamp actor and timestamps server-side so the trail cannot be forged by a
  -- client that simply posts approved_by.
  NEW.updated_at := now();
  NEW.updated_by := coalesce(v_actor, NEW.updated_by);

  CASE v_to
    WHEN 'submitted' THEN
      NEW.submitted_at := now();
      NEW.submitted_by := coalesce(v_actor, NEW.submitted_by);
    WHEN 'issued' THEN
      NEW.issue_date  := coalesce(NEW.issue_date, CURRENT_DATE);
      NEW.approved_at := now();
      NEW.approved_by := coalesce(v_actor, NEW.approved_by);
      -- Clear any prior rejection: this row is live now.
      NEW.rejection_reason := NULL;
      NEW.rejected_at      := NULL;
      NEW.rejected_by      := NULL;
    WHEN 'active' THEN
      NEW.activated_at := coalesce(NEW.activated_at, now());
    WHEN 'rejected' THEN
      NEW.rejected_at := now();
      NEW.rejected_by := coalesce(v_actor, NEW.rejected_by);
    WHEN 'closed' THEN
      NEW.closed_at := now();
      NEW.closed_by := coalesce(v_actor, NEW.closed_by);
    WHEN 'cancelled' THEN
      NEW.cancelled_at := now();
      NEW.cancelled_by := coalesce(v_actor, NEW.cancelled_by);
    WHEN 'draft' THEN
      -- Returned for rework. Clear the submission stamp so the next submit is
      -- recorded fresh.
      NEW.submitted_at := NULL;
      NEW.submitted_by := NULL;
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_work_order_status ON public.work_orders;
CREATE TRIGGER guard_work_order_status
  BEFORE UPDATE OF wo_status, status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_work_order_status();

-- 4b. Insert-time validation. Nothing stopped a client inserting a row already
--     in a live state, which would skip every check above while still
--     encumbering budget through fn_wo_budget_sync.
CREATE OR REPLACE FUNCTION public.trg_validate_work_order_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_to    text := public.wo_canonical_status(coalesce(NEW.wo_status, 'draft'));
  v_actor uuid := public.app_current_profile_id();
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised Work Order status %.', NEW.wo_status
      USING ERRCODE = '22023';
  END IF;

  IF v_to NOT IN ('draft', 'submitted') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'A Work Order may only be created as draft or submitted. Issue it through set_work_order_status() once it has lines.'
      USING ERRCODE = '42501';
  END IF;

  NEW.wo_status := v_to;
  NEW.status    := public.wo_workflow_status_for(v_to)::erp_workflow_status;
  NEW.created_by := coalesce(NEW.created_by, v_actor);
  NEW.updated_by := coalesce(NEW.updated_by, v_actor);

  IF v_to = 'submitted' THEN
    NEW.submitted_at := coalesce(NEW.submitted_at, now());
    NEW.submitted_by := coalesce(NEW.submitted_by, v_actor);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_work_order_insert ON public.work_orders;
CREATE TRIGGER validate_work_order_insert
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_work_order_insert();

-- 4c. History writer.
CREATE OR REPLACE FUNCTION public.trg_wo_record_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from text := CASE WHEN TG_OP = 'INSERT' THEN NULL
                      ELSE public.wo_canonical_status(OLD.wo_status) END;
  v_to   text := public.wo_canonical_status(NEW.wo_status);
BEGIN
  IF TG_OP = 'UPDATE' AND v_from IS NOT DISTINCT FROM v_to THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.work_order_status_history (
    work_order_id, project_id, from_status, to_status, reason,
    changed_by, total_amount_at_change
  ) VALUES (
    NEW.id, NEW.project_id, v_from, v_to,
    CASE v_to
      WHEN 'rejected'  THEN NEW.rejection_reason
      WHEN 'cancelled' THEN NEW.cancellation_reason
      ELSE NULL
    END,
    coalesce(public.app_current_profile_id(), NEW.updated_by, NEW.created_by),
    NEW.total_amount
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wo_record_status_history ON public.work_orders;
CREATE TRIGGER wo_record_status_history
  AFTER INSERT OR UPDATE OF wo_status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_wo_record_status_history();

-- ----------------------------------------------------------------------------
-- 5. SERVICE BILL STATUS GUARD + SEGREGATION OF DUTIES
--
--    Ordering note: this trigger is named 'guard_service_bill_status' so it
--    fires BEFORE the existing 'trg_service_bill_qc_gate' (Postgres runs
--    same-timing triggers in name order, and 'g' < 't'). An illegal or
--    unauthorised transition is therefore rejected with a governance message
--    before the QC gate reports a QC failure for a move that was never legal.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_guard_service_bill_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from       text := public.sb_canonical_status(OLD.status);
  v_to         text := public.sb_canonical_status(NEW.status);
  v_actor      uuid := public.app_current_profile_id();
  v_privileged text[] := ARRAY['approved', 'rejected'];
  -- fn_recompute_service_bill_payment_status() moves approved -> paid from the
  -- payments trigger. That is a system consequence of recorded cash, not a
  -- human decision, and the caller may be finance staff without approval
  -- rights, so it must not be gated on app_can_approve().
  v_system boolean := coalesce(
    nullif(current_setting('app.sb_system_transition', true), ''), 'off') = 'on';
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised service bill status %. Valid values: draft, submitted, verified, approved, rejected, paid.',
      NEW.status USING ERRCODE = '22023';
  END IF;

  NEW.status := v_to;

  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF NOT public.sb_transition_allowed(v_from, v_to) THEN
    RAISE EXCEPTION 'Service bill % cannot move from % to %.',
      coalesce(NEW.bill_number, NEW.id::text), v_from, v_to
      USING ERRCODE = '22023',
            HINT = 'Use set_service_bill_status() for a deliberate transition. A paid bill is terminal.';
  END IF;

  -- 'paid' is excluded from v_privileged but must still not be reachable by a
  -- client pretending cash moved; only the payments trigger may set it.
  IF v_to = 'paid' AND NOT v_system THEN
    RAISE EXCEPTION 'A service bill becomes paid by recording a payment against it, not by setting the status directly.'
      USING ERRCODE = '42501';
  END IF;

  IF v_to = ANY(v_privileged) AND NOT v_system AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may move a service bill to %.', v_to
      USING ERRCODE = '42501';
  END IF;

  IF v_to = 'rejected' AND coalesce(trim(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required to reject service bill %.',
      coalesce(NEW.bill_number, NEW.id::text) USING ERRCODE = '22023';
  END IF;

  -- SEGREGATION OF DUTIES. Certification is the moment cost is recognised and
  -- retention withheld, so the certifier must be neither the person who raised
  -- the claim nor the one who verified the measurement.
  --
  -- Enforced only when an actor is resolvable and the counterpart is known:
  -- a NULL actor means a SECURITY DEFINER system path, and a NULL counterpart
  -- means a legacy row that predates the audit columns. Failing those closed
  -- would block payment on historical bills for no control benefit.
  IF v_to = 'approved' AND NOT v_system AND v_actor IS NOT NULL THEN
    IF NEW.created_by IS NOT NULL AND NEW.created_by = v_actor THEN
      RAISE EXCEPTION 'Segregation of duties: service bill % was raised by you and must be certified by someone else.',
        coalesce(NEW.bill_number, NEW.id::text) USING ERRCODE = '42501';
    END IF;
    IF NEW.verified_by IS NOT NULL AND NEW.verified_by = v_actor THEN
      RAISE EXCEPTION 'Segregation of duties: service bill % was verified by you and must be certified by someone else.',
        coalesce(NEW.bill_number, NEW.id::text) USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := coalesce(v_actor, NEW.updated_by);

  CASE v_to
    WHEN 'submitted' THEN
      NEW.submitted_at := coalesce(NEW.submitted_at, now());
      NEW.submitted_by := coalesce(v_actor, NEW.submitted_by);
    WHEN 'verified' THEN
      NEW.verified_at := now();
      NEW.verified_by := coalesce(v_actor, NEW.verified_by);
    WHEN 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := coalesce(v_actor, NEW.approved_by);
      NEW.rejection_reason := NULL;
      NEW.rejected_at      := NULL;
      NEW.rejected_by      := NULL;
    WHEN 'rejected' THEN
      NEW.rejected_at := now();
      NEW.rejected_by := coalesce(v_actor, NEW.rejected_by);
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_service_bill_status ON public.service_bills;
CREATE TRIGGER guard_service_bill_status
  BEFORE UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_service_bill_status();

-- 5b. Insert-time validation. Phase 3 closed the QC bypass on INSERT; this
--     closes the authority bypass — a client could still insert a bill already
--     at 'approved' and post cost without approval rights.
CREATE OR REPLACE FUNCTION public.trg_validate_service_bill_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_to    text := public.sb_canonical_status(coalesce(NEW.status, 'draft'));
  v_actor uuid := public.app_current_profile_id();
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised service bill status %.', NEW.status
      USING ERRCODE = '22023';
  END IF;

  IF v_to = 'paid' THEN
    RAISE EXCEPTION 'A service bill cannot be created as paid. Record a payment against it instead.'
      USING ERRCODE = '42501';
  END IF;

  IF v_to NOT IN ('draft', 'submitted') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'A service bill may only be created as draft or submitted. Certify it through set_service_bill_status().'
      USING ERRCODE = '42501';
  END IF;

  NEW.status     := v_to;
  NEW.created_by := coalesce(NEW.created_by, v_actor);
  NEW.updated_by := coalesce(NEW.updated_by, v_actor);

  IF v_to = 'submitted' THEN
    NEW.submitted_at := coalesce(NEW.submitted_at, now());
    NEW.submitted_by := coalesce(NEW.submitted_by, v_actor);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_service_bill_insert ON public.service_bills;
CREATE TRIGGER validate_service_bill_insert
  BEFORE INSERT ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_service_bill_insert();

-- 5c. History writer.
CREATE OR REPLACE FUNCTION public.trg_sb_record_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from text := CASE WHEN TG_OP = 'INSERT' THEN NULL
                      ELSE public.sb_canonical_status(OLD.status) END;
  v_to   text := public.sb_canonical_status(NEW.status);
BEGIN
  IF TG_OP = 'UPDATE' AND v_from IS NOT DISTINCT FROM v_to THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.service_bill_status_history (
    service_bill_id, project_id, work_order_id, from_status, to_status, reason,
    changed_by, total_amount_at_change
  ) VALUES (
    NEW.id, NEW.project_id, NEW.work_order_id, v_from, v_to,
    CASE WHEN v_to = 'rejected' THEN NEW.rejection_reason ELSE NULL END,
    coalesce(public.app_current_profile_id(), NEW.updated_by, NEW.created_by),
    NEW.total_amount
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sb_record_status_history ON public.service_bills;
CREATE TRIGGER sb_record_status_history
  AFTER INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_sb_record_status_history();

-- 5d. The payments trigger must be able to reach 'paid'. Phase 3's
--     fn_recompute_service_bill_payment_status only wrote payment_status; the
--     document status stayed 'approved' forever, so a fully paid bill never
--     became terminal. Wrapping the write in the system flag both fixes that
--     and keeps 'paid' unreachable from the browser.
CREATE OR REPLACE FUNCTION public.fn_recompute_service_bill_payment_status(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_net    numeric;
  v_paid   numeric;
  v_status text;
  v_new_ps text;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(nullif(net_payable_amount, 0), total_amount, 0), status
    INTO v_net, v_status
  FROM public.service_bills WHERE id = p_bill_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT coalesce(SUM(amount), 0) INTO v_paid
  FROM public.payments
  WHERE service_bill_id = p_bill_id AND status = 'paid'::erp_payment_status;

  v_new_ps := CASE
    WHEN v_paid <= 0     THEN 'pending'
    WHEN v_paid >= v_net THEN 'paid'
    ELSE 'partially_paid' END;

  UPDATE public.service_bills
  SET payment_status = v_new_ps,
      updated_at     = now()
  WHERE id = p_bill_id
    AND payment_status IS DISTINCT FROM v_new_ps;

  -- Settle the document itself once it is fully paid. Guarded by the system
  -- flag so trg_guard_service_bill_status permits the move; cleared
  -- immediately either way.
  IF v_new_ps = 'paid' AND public.sb_canonical_status(v_status) = 'approved' THEN
    PERFORM set_config('app.sb_system_transition', 'on', true);
    UPDATE public.service_bills SET status = 'paid' WHERE id = p_bill_id;
    PERFORM set_config('app.sb_system_transition', 'off', true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. DELIBERATE TRANSITION RPCs
--
--    A single entry point that carries the reason, so the client never patches
--    status columns directly and the history row always has context.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_work_order_status(
  p_work_order_id uuid,
  p_status        text,
  p_reason        text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_to  text := public.wo_canonical_status(p_status);
  v_row public.work_orders;
BEGIN
  PERFORM public.app_require_profile();

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised Work Order status %.', p_status USING ERRCODE = '22023';
  END IF;

  -- SECURITY INVOKER: RLS still applies, so a user who cannot see the row
  -- cannot move it. The guard trigger enforces authority on the transition.
  UPDATE public.work_orders
  SET wo_status           = v_to,
      rejection_reason    = CASE WHEN v_to = 'rejected'
                                 THEN nullif(trim(coalesce(p_reason, '')), '')
                                 ELSE rejection_reason END,
      cancellation_reason = CASE WHEN v_to = 'cancelled'
                                 THEN nullif(trim(coalesce(p_reason, '')), '')
                                 ELSE cancellation_reason END
  WHERE id = p_work_order_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work Order % not found, or you do not have access to it.', p_work_order_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'work_order_number', v_row.work_order_number,
    'wo_status', v_row.wo_status,
    'status', v_row.status,
    'approved_by', v_row.approved_by,
    'approved_at', v_row.approved_at,
    'total_amount', v_row.total_amount,
    'billed_to_date', v_row.billed_to_date,
    'remaining_balance', v_row.remaining_balance
  );
END $$;

COMMENT ON FUNCTION public.set_work_order_status(uuid, text, text) IS
  'The deliberate entry point for a Work Order lifecycle transition. Validates against wo_transition_allowed, enforces approval authority, stamps the actor, and records history. Clients must not patch wo_status directly.';

CREATE OR REPLACE FUNCTION public.set_service_bill_status(
  p_bill_id uuid,
  p_status  text,
  p_reason  text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_to  text := public.sb_canonical_status(p_status);
  v_row public.service_bills;
BEGIN
  PERFORM public.app_require_profile();

  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised service bill status %.', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_bills
  SET status           = v_to,
      rejection_reason = CASE WHEN v_to = 'rejected'
                              THEN nullif(trim(coalesce(p_reason, '')), '')
                              ELSE rejection_reason END,
      remarks          = coalesce(nullif(trim(coalesce(p_reason, '')), ''), remarks)
  WHERE id = p_bill_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service bill % not found, or you do not have access to it.', p_bill_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'bill_number', v_row.bill_number,
    'status', v_row.status,
    'payment_status', v_row.payment_status,
    'approved_by', v_row.approved_by,
    'approved_at', v_row.approved_at,
    'total_amount', v_row.total_amount,
    'net_payable_amount', v_row.net_payable_amount
  );
END $$;

COMMENT ON FUNCTION public.set_service_bill_status(uuid, text, text) IS
  'The deliberate entry point for a service bill transition. Validates against sb_transition_allowed, enforces approval authority and segregation of duties, stamps the actor, and records history.';

-- ----------------------------------------------------------------------------
-- 7. ROLE-AWARE RLS
--
--    Replaces USING (true) on all four tables. Deliberately NOT "FORCE ROW
--    LEVEL SECURITY": the SECURITY DEFINER budget functions from Phases 2-4
--    execute as the table owner and must keep bypassing RLS, exactly as those
--    migrations document.
--
--    app_can_write_procurement() covers upper_management, project_manager,
--    pr_team and site_engineer — the roles that legitimately touch these
--    documents. Approval authority is enforced by the guard triggers, not by
--    RLS, because a site engineer must still be able to UPDATE a draft.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_orders', 'work_order_lines',
                           'service_bills', 'service_bill_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_current_role() IS NOT NULL)', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.app_can_write_procurement())', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.app_can_write_procurement())
         WITH CHECK (public.app_can_write_procurement())', t || '_update', t);
  END LOOP;
END $$;

-- Lines of a live document are contract/evidence, not working data. Deleting a
-- line of an issued Work Order would silently change total_amount and desync
-- the posted commitment.
DROP POLICY IF EXISTS work_order_lines_delete ON public.work_order_lines;
CREATE POLICY work_order_lines_delete
  ON public.work_order_lines FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND EXISTS (
      SELECT 1 FROM public.work_orders wo
      WHERE wo.id = work_order_lines.work_order_id
        AND public.wo_canonical_status(wo.wo_status) IN ('draft', 'submitted', 'rejected')
    )
  );

-- Work Orders are financial documents: retired via deleted_at, never removed.
-- Hard delete is permitted only for a draft that never encumbered anything.
DROP POLICY IF EXISTS work_orders_delete ON public.work_orders;
CREATE POLICY work_orders_delete
  ON public.work_orders FOR DELETE TO authenticated
  USING (
    public.app_can_approve()
    AND public.wo_canonical_status(wo_status) IN ('draft', 'rejected')
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_ledger bl
      WHERE bl.source_table = 'work_orders' AND bl.source_id = work_orders.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bills sb
      WHERE sb.work_order_id = work_orders.id AND sb.deleted_at IS NULL
    )
  );

-- service_bills_delete was created by Phase 3 with the right predicate but no
-- role condition. Re-assert it with one.
DROP POLICY IF EXISTS service_bills_delete ON public.service_bills;
CREATE POLICY service_bills_delete
  ON public.service_bills FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND public.sb_canonical_status(status) NOT IN ('approved', 'paid')
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_ledger bl
      WHERE bl.source_table = 'service_bills' AND bl.source_id = service_bills.id
    )
  );

-- Phase 3's service_bill_lines_delete predicate is preserved, plus the role.
DROP POLICY IF EXISTS service_bill_lines_delete ON public.service_bill_lines;
CREATE POLICY service_bill_lines_delete
  ON public.service_bill_lines FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bills sb
      WHERE sb.id = service_bill_lines.service_bill_id
        AND public.sb_canonical_status(sb.status) IN ('approved', 'paid')
    )
  );

-- History tables: readable by any signed-in role, insertable only by the
-- SECURITY DEFINER triggers' effective grant. No UPDATE or DELETE policy is
-- created, which makes them append-only for every non-owner role.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_order_status_history', 'service_bill_status_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_current_role() IS NOT NULL)', t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (true)', t || '_insert', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_work_order_status(uuid, text, text)   FROM anon;
GRANT EXECUTE ON FUNCTION public.set_work_order_status(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_service_bill_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_service_bill_status(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.wo_canonical_status(text)          FROM anon;
REVOKE ALL ON FUNCTION public.wo_transition_allowed(text, text)  FROM anon;
REVOKE ALL ON FUNCTION public.wo_workflow_status_for(text)       FROM anon;
REVOKE ALL ON FUNCTION public.sb_canonical_status(text)          FROM anon;
REVOKE ALL ON FUNCTION public.sb_transition_allowed(text, text)  FROM anon;
GRANT EXECUTE ON FUNCTION public.wo_canonical_status(text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.wo_transition_allowed(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wo_workflow_status_for(text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.sb_canonical_status(text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.sb_transition_allowed(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_recompute_service_bill_payment_status(uuid)
  FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. RECONCILE EXISTING ROWS
--
--    Repairs rows written under the old free-write path, then seeds an opening
--    history entry so every live document has a traceable starting point.
--    Runs with the system flag on: these are corrections, not human decisions,
--    and app_can_approve() is false inside a migration (there is no auth.uid()).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r record;
  v_fixed integer := 0;
  v_seeded integer := 0;
BEGIN
  PERFORM set_config('app.wo_system_transition', 'on', true);

  -- 9a. Re-derive work_orders.status from wo_status wherever the two drifted.
  --     The guard trigger does the mapping; touching wo_status with its own
  --     value is enough to fire it.
  FOR r IN
    SELECT id, wo_status FROM public.work_orders WHERE deleted_at IS NULL
  LOOP
    UPDATE public.work_orders
    SET wo_status = r.wo_status
    WHERE id = r.id
      AND status IS DISTINCT FROM
          public.wo_workflow_status_for(r.wo_status)::erp_workflow_status;
    IF FOUND THEN
      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  PERFORM set_config('app.wo_system_transition', 'off', true);

  -- 9b. Opening history row for Work Orders that have none, so the audit trail
  --     is contiguous from today rather than starting mid-life.
  INSERT INTO public.work_order_status_history (
    work_order_id, project_id, from_status, to_status, reason,
    changed_by, changed_at, total_amount_at_change
  )
  SELECT wo.id, wo.project_id, NULL,
         public.wo_canonical_status(wo.wo_status),
         'Opening balance recorded when the audit trail was introduced',
         wo.approved_by,
         coalesce(wo.approved_at, wo.updated_at, wo.created_at, now()),
         wo.total_amount
  FROM public.work_orders wo
  WHERE wo.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.work_order_status_history h
      WHERE h.work_order_id = wo.id
    );
  GET DIAGNOSTICS v_seeded = ROW_COUNT;

  INSERT INTO public.service_bill_status_history (
    service_bill_id, project_id, work_order_id, from_status, to_status, reason,
    changed_by, changed_at, total_amount_at_change
  )
  SELECT sb.id, sb.project_id, sb.work_order_id, NULL,
         public.sb_canonical_status(sb.status),
         'Opening balance recorded when the audit trail was introduced',
         coalesce(sb.approved_by, sb.verified_by, sb.created_by),
         coalesce(sb.approved_at, sb.verified_at, sb.created_at, now()),
         sb.total_amount
  FROM public.service_bills sb
  WHERE sb.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.service_bill_status_history h
      WHERE h.service_bill_id = sb.id
    );

  RAISE NOTICE 'Stage 1 reconcile: % work order status columns repaired, % opening history rows seeded.',
    v_fixed, v_seeded;
END $$;

-- ----------------------------------------------------------------------------
-- 10. REALTIME
-- ----------------------------------------------------------------------------
-- Registration happens after COMMIT — see the trailing block.

-- ----------------------------------------------------------------------------
-- 11. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['guard_work_order_status', 'validate_work_order_insert',
                               'wo_record_status_history', 'guard_service_bill_status',
                               'validate_service_bill_insert', 'sb_record_status_history'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key AND NOT tgisinternal) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  -- The guard must sort before the QC gate, or an illegal move reports a QC
  -- error instead of a governance one.
  IF 'guard_service_bill_status' >= 'trg_service_bill_qc_gate' THEN
    v_problems := array_append(v_problems,
      'guard_service_bill_status no longer sorts before trg_service_bill_qc_gate');
  END IF;

  FOREACH v_key IN ARRAY ARRAY['work_order_status_history', 'service_bill_status_history'] LOOP
    IF to_regclass('public.' || v_key) IS NULL THEN
      v_problems := array_append(v_problems, v_key || ' missing');
    END IF;
    -- Append-only: an UPDATE or DELETE policy would defeat the trail.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_key AND cmd IN ('UPDATE', 'DELETE')
    ) THEN
      v_problems := array_append(v_problems, v_key || ' has a mutating policy');
    END IF;
  END LOOP;

  -- No USING(true) may survive on the governed tables.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('work_orders', 'work_order_lines', 'service_bills', 'service_bill_lines')
      AND cmd = 'UPDATE'
      AND coalesce(qual, '') = 'true'
  ) THEN
    v_problems := array_append(v_problems, 'a permissive UPDATE policy survived on a governed table');
  END IF;

  -- Transition tables must agree with the documented lifecycle.
  IF public.wo_transition_allowed('draft', 'closed') THEN
    v_problems := array_append(v_problems, 'wo_transition_allowed permits draft->closed');
  END IF;
  IF public.wo_transition_allowed('issued', 'draft') THEN
    v_problems := array_append(v_problems, 'wo_transition_allowed permits issued->draft');
  END IF;
  IF NOT public.wo_transition_allowed('active', 'closed') THEN
    v_problems := array_append(v_problems, 'wo_transition_allowed blocks active->closed');
  END IF;
  IF public.sb_transition_allowed('paid', 'draft') THEN
    v_problems := array_append(v_problems, 'sb_transition_allowed permits paid->draft');
  END IF;
  IF NOT public.sb_transition_allowed('verified', 'approved') THEN
    v_problems := array_append(v_problems, 'sb_transition_allowed blocks verified->approved');
  END IF;

  -- The legacy column mapping must round-trip every lifecycle state.
  FOREACH v_key IN ARRAY ARRAY['draft', 'submitted', 'issued', 'active',
                               'closed', 'rejected', 'cancelled'] LOOP
    IF public.wo_workflow_status_for(v_key) IS NULL THEN
      v_problems := array_append(v_problems, 'wo_workflow_status_for(' || v_key || ') is NULL');
    END IF;
  END LOOP;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 1 governance incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Stage 1 applied: Work Order and Service Bill transitions are now validated, authorised, attributed and audited in the database.';
END $$;

COMMIT;

-- ============================================================================
-- REALTIME REGISTRATION — outside the main transaction, on purpose.
-- ALTER PUBLICATION contends with the realtime worker's replication slot and
-- does not need to be atomic with the schema change. Re-run this block alone
-- if it fails.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['work_order_status_history', 'service_bill_status_history'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
