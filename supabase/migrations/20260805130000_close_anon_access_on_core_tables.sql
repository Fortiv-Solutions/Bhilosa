-- ============================================================================
-- SECURITY FIX — CLOSE ANON ACCESS ON THE REMAINING CORE TABLES
-- File: supabase/migrations/20260805130000_close_anon_access_on_core_tables.sql
--
-- HOW THIS WAS FOUND
-- ==================
-- frontend/.env.local held a service_role key under NEXT_PUBLIC_SUPABASE_ANON_KEY.
-- Next.js inlines NEXT_PUBLIC_* into the browser bundle, so every RLS check in
-- this project had been unverifiable — and every "anon cannot reach X" probe ever
-- run against it was actually running as service_role.
--
-- With a genuine anon key in place, a read/write sweep found seven tables open to
-- unauthenticated read AND write. Three hardening passes had each covered their
-- own module and left these in the gaps between:
--
--   budget hardening      -> budget_*                     (covered)
--   procurement hardening -> vendors, PO, PR, GRN, bills  (covered)
--   phases 2-6            -> work_orders, service_bills,
--                            entity_attachments, ledger   (covered)
--   NOBODY                -> projects, profiles, payments,
--                            construction_activities,
--                            site_agencies, notifications,
--                            qc_inspections               <-- THIS MIGRATION
--
-- Measured, not inferred (zero-match PATCH probes write policy without touching
-- a row):
--
--   projects                READ-OPEN  WRITE-OPEN
--   profiles                READ-OPEN  WRITE-OPEN
--   payments                READ-OPEN  WRITE-OPEN
--   construction_activities READ-OPEN  WRITE-OPEN
--   site_agencies           READ-OPEN  WRITE-OPEN
--   notifications           READ-OPEN  WRITE-OPEN
--   qc_inspections          READ-OPEN  WRITE-OPEN
--
-- WHY TWO OF THESE ARE SEVERE
-- ===========================
-- * profiles is writable => anyone could change a profile's `role`. Every RLS
--   policy in this codebase is written `TO authenticated USING (true)`, so
--   escalating to any authenticated role grants effectively everything. This is
--   the privilege-escalation root.
-- * qc_inspections is writable => anyone could set an inspection to 'accepted'.
--   fn_service_bill_qc_gate authorises bill certification on exactly that value,
--   so the Phase 3 QC control was bypassable from outside the application.
-- * payments is writable => financial records, and since Phase 3 it drives
--   service_bills.payment_status through a trigger.
--
-- FORCE ROW LEVEL SECURITY IS DELIBERATELY NOT USED. The SECURITY DEFINER
-- functions across this schema execute as the table owner and must keep
-- bypassing RLS; forcing it subjects them to policies scoped TO authenticated,
-- which then match nothing and every function silently sees zero rows.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE public.construction_activities,
           public.notifications,
           public.payments,
           public.profiles,
           public.projects,
           public.qc_inspections,
           public.site_agencies
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. THE STANDARD LOCKDOWN
--    Same shape the budget and procurement hardening migrations use: RLS on,
--    anon and PUBLIC revoked, authenticated granted, policies scoped to
--    authenticated. profiles is handled separately below — it needs more than
--    USING (true) on writes.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'payments', 'construction_activities',
                           'site_agencies', 'notifications', 'qc_inspections'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table % not present; skipping.', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                   t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
                   t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
                   t || '_update', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. profiles — the privilege-escalation surface, so it gets real rules.
--
--    Read: any authenticated user (assignee pickers, approver names, audit
--          trails all need it).
--    Write: your OWN row, or upper_management. Without this, closing anon would
--          still leave every authenticated user able to promote themselves.
--    Insert/Delete: not granted. Profiles are provisioned by the auth trigger or
--          by an administrator, never by the client. documents.ts used to INSERT
--          a profile with role 'project_manager' from an unauthenticated path;
--          that code is gone and this makes it unrepeatable.
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = public.app_current_profile_id() OR public.app_current_role() = 'upper_management')
  WITH CHECK (id = public.app_current_profile_id() OR public.app_current_role() = 'upper_management');

DROP POLICY IF EXISTS profiles_delete ON public.profiles;

-- ----------------------------------------------------------------------------
-- 3. VERIFICATION — assert the grants are actually gone, per table.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t        text;
  v_open   text[] := ARRAY[]::text[];
  v_norls  text[] := ARRAY[]::text[];
BEGIN
  FOREACH t IN ARRAY ARRAY['projects', 'profiles', 'payments', 'construction_activities',
                           'site_agencies', 'notifications', 'qc_inspections'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t, 'DELETE') THEN
      v_open := array_append(v_open, t);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = t AND relrowsecurity) THEN
      v_norls := array_append(v_norls, t);
    END IF;
  END LOOP;

  IF array_length(v_open, 1) > 0 THEN
    RAISE EXCEPTION 'anon still holds privileges on: %', array_to_string(v_open, ', ');
  END IF;
  IF array_length(v_norls, 1) > 0 THEN
    RAISE EXCEPTION 'RLS not enabled on: %', array_to_string(v_norls, ', ');
  END IF;

  RAISE NOTICE 'Security fix applied: anon closed on projects, profiles, payments, construction_activities, site_agencies, notifications, qc_inspections.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
