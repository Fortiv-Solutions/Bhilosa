-- ============================================================================
-- STAGE 4 — VARIATION ORDERS, RATE-BASED CEILING, CONTRACT INTEGRITY
-- File: supabase/migrations/20260807130000_wo_sb_stage4_variations_and_ceiling.sql
--
-- Depends on:
--   20260805100200_work_order_budget_integration.sql (fn_post_wo_commitment)
--   20260807100100_wo_sb_stage1_governance.sql       (wo_canonical_status, guards)
--   20260807110000_wo_sb_stage2_measurement_and_certificate.sql (over-measurement)
--   20260807120000_wo_sb_stage3_release_and_treasury.sql        (releases)
--
-- THE TWO GAPS THIS CLOSES
-- ========================
--
-- A. NO VARIATION DOCUMENT.
--    purchase_orders has an `amendments` block and a re-save guard;
--    work_orders had neither. A live contract's total_amount could be edited
--    silently, and trg_wo_budget_sync would post the delta commitment with no
--    approval, no numbered document and no audit trail behind it.
--
--    Stage 1 then made the contract immutable in practice, which is safer but
--    leaves genuine scope growth with nowhere to go: the client adds 400 Rft of
--    terrace railing and the system has no answer.
--
--    A variation is that answer — a numbered, approved document that is the
--    ONLY thing permitted to move a live contract's value or scope.
--
-- B. RATE-BASED WORK ORDERS COMMIT ZERO.
--    The Colour Work order AC/WO/2025/008 carries 12 rate lines, no Qty column
--    and no total. total_amount is therefore 0, so fn_post_wo_commitment posts
--    a zero commitment: a live subcontract that reserves no budget at all.
--
--    A ceiling_amount fixes that without inventing quantities. It is the
--    not-to-exceed value the contract is encumbered at, and it flows through
--    the EXISTING commitment path rather than forking it.
--
-- HOW THE VALUE ACTUALLY MOVES
-- ============================
-- fn_post_wo_commitment computes  delta = total_amount - already_committed
-- and posts the difference. So a variation does not need its own ledger logic:
-- it approves, writes the new total_amount, and the Phase 2 trigger posts the
-- delta exactly as it always has. One posting path, one place for it to be
-- wrong.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wo_canonical_status'
  ) THEN
    v_missing := array_append(v_missing,
      'wo_canonical_status() (apply 20260807100100_wo_sb_stage1_governance.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_post_wo_commitment'
  ) THEN
    v_missing := array_append(v_missing,
      'fn_post_wo_commitment() (apply 20260805100200_work_order_budget_integration.sql)');
  END IF;

  IF to_regclass('public.work_order_status_history') IS NULL THEN
    v_missing := array_append(v_missing,
      'work_order_status_history (apply 20260807100100_wo_sb_stage1_governance.sql)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 4 cannot apply. Missing: %', array_to_string(v_missing, '; ');
  END IF;
END $$;

LOCK TABLE public.service_bills,
           public.work_order_lines,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('public.work_order_variations') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.work_order_variations IN ACCESS EXCLUSIVE MODE';
  END IF;
  IF to_regclass('public.work_order_variation_lines') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.work_order_variation_lines IN ACCESS EXCLUSIVE MODE';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. RATE-BASED CEILING + REVISION COUNTER
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_orders
  -- Not-to-exceed value for a contract with agreed rates but no fixed
  -- quantities. Encumbered exactly like a fixed-scope total, because an
  -- uncapped subcontract is an uncapped liability.
  ADD COLUMN IF NOT EXISTS ceiling_amount numeric
    CHECK (ceiling_amount IS NULL OR ceiling_amount >= 0),
  -- Bumped by each approved variation. 0 = the original contract.
  ADD COLUMN IF NOT EXISTS revision_no integer NOT NULL DEFAULT 0
    CHECK (revision_no >= 0),
  -- The contract value as originally issued, kept so the variation history can
  -- show original -> current without replaying every document.
  ADD COLUMN IF NOT EXISTS original_amount numeric;

COMMENT ON COLUMN public.work_orders.ceiling_amount IS
  'Not-to-exceed value for a rate_based Work Order, which has agreed rates but no fixed quantities (e.g. AC/WO/2025/008, 12 rate lines and no total). Copied into total_amount at issue so the existing commitment path encumbers it — a rate-based contract previously reserved zero budget.';
COMMENT ON COLUMN public.work_orders.revision_no IS
  'Number of approved variations. 0 is the original contract; original_amount holds the value it was issued at.';

-- 1b. A rate-based contract must carry a ceiling before it can be issued, and
--     the ceiling becomes the encumbered value.
--
--     This runs BEFORE the Stage 1 guard (v < g is false, so name it to sort
--     first) — it must set total_amount before guard_work_order_status runs its
--     "fixed-scope needs a value" check and before fn_wo_budget_sync posts.
CREATE OR REPLACE FUNCTION public.trg_fn_wo_apply_ceiling()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_to text := public.wo_canonical_status(NEW.wo_status);
BEGIN
  IF COALESCE(NEW.wo_type, 'fixed_scope') <> 'rate_based' THEN
    RETURN NEW;
  END IF;

  -- Only gate at the point the contract goes live; a draft may be incomplete.
  IF v_to NOT IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND public.wo_canonical_status(OLD.wo_status) IN ('issued', 'active') THEN
    RETURN NEW;  -- already live, nothing to re-apply
  END IF;

  IF COALESCE(NEW.ceiling_amount, 0) <= 0 THEN
    RAISE EXCEPTION
      'Rate-based Work Order % needs a ceiling (not-to-exceed) value before it can be issued.',
      COALESCE(NEW.work_order_number, NEW.id::text)
      USING ERRCODE = '22023',
            HINT = 'A rate-based contract has no fixed quantities, so the ceiling is what the budget is encumbered at.';
  END IF;

  -- The ceiling IS the commitment. Writing it into total_amount means
  -- fn_post_wo_commitment, remaining_balance, the variance rollup and the
  -- five-metric view all keep working untouched.
  NEW.total_amount := NEW.ceiling_amount;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS aa_wo_apply_ceiling ON public.work_orders;
CREATE TRIGGER aa_wo_apply_ceiling
  BEFORE INSERT OR UPDATE OF wo_status, ceiling_amount ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_wo_apply_ceiling();

COMMENT ON FUNCTION public.trg_fn_wo_apply_ceiling() IS
  'Copies ceiling_amount into total_amount when a rate-based Work Order goes live, so the existing commitment path encumbers it. Named aa_* so it fires before guard_work_order_status, which checks that a live contract has a value.';

-- ----------------------------------------------------------------------------
-- 2. VARIATION ORDER
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_order_variations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id),
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,

  variation_number text NOT NULL,
  variation_date   date NOT NULL DEFAULT CURRENT_DATE,
  /* Why the contract is changing. Mandatory: a variation with no justification
     is indistinguishable from an unauthorised edit, which is what this exists
     to prevent. */
  reason           text NOT NULL,

  /* Signed. A negative variation (omitted scope) is legitimate and posts a
     negative delta commitment through the same path. */
  amount           numeric NOT NULL CHECK (amount <> 0),
  /* Snapshots, so the document reads correctly years later even if the
     contract has moved on. */
  contract_value_before numeric,
  contract_value_after  numeric,

  status           text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),

  submitted_by     uuid REFERENCES public.profiles(id),
  submitted_at     timestamptz,
  approved_by      uuid REFERENCES public.profiles(id),
  approved_at      timestamptz,
  rejected_by      uuid REFERENCES public.profiles(id),
  rejected_at      timestamptz,
  rejection_reason text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.work_order_variations IS
  'The only document permitted to change a live Work Order''s value or scope. Approving one writes the new total_amount, and the Phase 2 trigger posts the delta commitment through the existing path — there is no second ledger implementation here.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_variations_number
  ON public.work_order_variations (work_order_id, lower(btrim(variation_number)));
CREATE INDEX IF NOT EXISTS ix_wo_variations_wo
  ON public.work_order_variations (work_order_id, status);

-- 2b. New or changed scope lines carried by the variation. Optional: a purely
--     financial variation (a negotiated lump-sum addition) needs no lines.
CREATE TABLE IF NOT EXISTS public.work_order_variation_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id         uuid NOT NULL REFERENCES public.work_order_variations(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES public.projects(id),
  /* Set when this revises an existing contracted line; NULL when it adds a new
     one. On approval the former updates the line, the latter inserts it. */
  work_order_line_id   uuid REFERENCES public.work_order_lines(id),

  description          text NOT NULL,
  unit                 text,
  /* For a revision this is the NEW contracted quantity, not the delta — that
     is what the over-measurement guard compares against. */
  quantity             numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  rate                 numeric NOT NULL DEFAULT 0 CHECK (rate >= 0),
  line_total           numeric NOT NULL DEFAULT 0,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_wo_variation_lines_variation
  ON public.work_order_variation_lines (variation_id);
CREATE INDEX IF NOT EXISTS ix_wo_variation_lines_wo_line
  ON public.work_order_variation_lines (work_order_line_id)
  WHERE work_order_line_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_compute_wo_variation_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.line_total IS NULL OR NEW.line_total = 0 THEN
      NEW.line_total := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.rate, 0), 2);
    END IF;
  ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.rate     IS DISTINCT FROM OLD.rate THEN
    IF NEW.line_total IS NOT DISTINCT FROM OLD.line_total THEN
      NEW.line_total := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.rate, 0), 2);
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wo_variation_line_total ON public.work_order_variation_lines;
CREATE TRIGGER wo_variation_line_total
  BEFORE INSERT OR UPDATE OF quantity, rate, line_total ON public.work_order_variation_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_wo_variation_line();

-- ----------------------------------------------------------------------------
-- 3. CONTRACT IMMUTABILITY
--
--    A live contract's value and scope may change ONLY through an approved
--    variation. The flag is set transaction-locally by fn_apply_wo_variation;
--    a client reaching these triggers through PostgREST can only issue an
--    UPDATE and has no way to run set_config first, so it cannot be forged.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_guard_wo_contract_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_live   boolean := public.wo_canonical_status(OLD.wo_status) IN ('issued', 'active');
  v_system boolean := COALESCE(
    NULLIF(current_setting('app.wo_variation_apply', true), ''), 'off') = 'on';
BEGIN
  IF NOT v_live OR v_system THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION
      'Work Order % is % and its value cannot be edited directly. Raise a variation.',
      COALESCE(NEW.work_order_number, NEW.id::text), public.wo_canonical_status(OLD.wo_status)
      USING ERRCODE = '42501',
            HINT = 'Create a work_order_variations document and have it approved; the commitment delta is posted automatically.';
  END IF;

  IF NEW.ceiling_amount IS DISTINCT FROM OLD.ceiling_amount THEN
    RAISE EXCEPTION
      'The ceiling on live Work Order % cannot be edited directly. Raise a variation.',
      COALESCE(NEW.work_order_number, NEW.id::text)
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_wo_contract_immutable ON public.work_orders;
CREATE TRIGGER guard_wo_contract_immutable
  BEFORE UPDATE OF total_amount, ceiling_amount ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_wo_contract_immutable();

-- 3b. The same protection for scope lines. Editing a contracted quantity is how
--     the over-measurement guard gets defeated, so it needs the same door.
CREATE OR REPLACE FUNCTION public.trg_guard_wo_line_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_system boolean := COALESCE(
    NULLIF(current_setting('app.wo_variation_apply', true), ''), 'off') = 'on';
  v_number text;
BEGIN
  IF v_system THEN
    RETURN NEW;
  END IF;

  SELECT public.wo_canonical_status(wo_status), work_order_number
    INTO v_status, v_number
  FROM public.work_orders
  WHERE id = COALESCE(NEW.work_order_id, OLD.work_order_id);

  IF v_status NOT IN ('issued', 'active') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Work Order % is live; a new scope line must come from an approved variation.',
      COALESCE(v_number, '?') USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Work Order % is live; a contracted line cannot be deleted. Raise a variation.',
      COALESCE(v_number, '?') USING ERRCODE = '42501';
  END IF;

  -- executed_quantity is site progress recording, not a contract change, and
  -- Stage 2's variance alert depends on it staying editable.
  IF NEW.quantity     IS DISTINCT FROM OLD.quantity
     OR NEW.rate      IS DISTINCT FROM OLD.rate
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION
      'Work Order % is live; contracted quantity and rate cannot be edited. Raise a variation.',
      COALESCE(v_number, '?') USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_wo_line_immutable ON public.work_order_lines;
CREATE TRIGGER guard_wo_line_immutable
  BEFORE INSERT OR UPDATE OF quantity, rate, total_amount OR DELETE ON public.work_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_wo_line_immutable();

-- ----------------------------------------------------------------------------
-- 4. VARIATION LIFECYCLE + APPLICATION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wov_transition_allowed(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(btrim(p_from), ''))
    WHEN 'draft'     THEN lower(COALESCE(btrim(p_to), '')) IN ('submitted', 'cancelled')
    WHEN 'submitted' THEN lower(COALESCE(btrim(p_to), '')) IN ('approved', 'rejected', 'draft', 'cancelled')
    WHEN 'rejected'  THEN lower(COALESCE(btrim(p_to), '')) IN ('draft', 'cancelled')
    -- Terminal. An approved variation has moved the contract and posted a
    -- commitment delta; reversing it is another variation, not an edit.
    WHEN 'approved'  THEN false
    WHEN 'cancelled' THEN false
    ELSE false
  END;
$$;

-- 4a. Applies an approved variation to the contract. The ONLY writer permitted
--     past the immutability guards.
CREATE OR REPLACE FUNCTION public.fn_apply_wo_variation(p_variation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_var  public.work_order_variations;
  v_wo   public.work_orders;
  r      record;
  v_new  numeric;
BEGIN
  SELECT * INTO v_var FROM public.work_order_variations WHERE id = p_variation_id;
  IF v_var.id IS NULL OR v_var.status <> 'approved' THEN
    RETURN;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = v_var.work_order_id;
  IF v_wo.id IS NULL THEN
    RETURN;
  END IF;

  v_new := COALESCE(v_wo.total_amount, 0) + v_var.amount;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Variation % would take Work Order % to a negative value.',
      v_var.variation_number, COALESCE(v_wo.work_order_number, v_wo.id::text)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Open the door for this transaction only.
  PERFORM set_config('app.wo_variation_apply', 'on', true);

  -- Scope changes first, so the contract value and the lines land together.
  FOR r IN
    SELECT * FROM public.work_order_variation_lines WHERE variation_id = p_variation_id
  LOOP
    IF r.work_order_line_id IS NOT NULL THEN
      UPDATE public.work_order_lines
      SET description  = r.description,
          unit         = COALESCE(r.unit, unit),
          quantity     = r.quantity,
          rate         = r.rate,
          total_amount = r.line_total,
          updated_at   = now()
      WHERE id = r.work_order_line_id;
    ELSE
      INSERT INTO public.work_order_lines (
        work_order_id, project_id, description, unit, quantity, rate, total_amount
      ) VALUES (
        v_var.work_order_id, v_var.project_id, r.description, r.unit,
        r.quantity, r.rate, r.line_total
      );
    END IF;
  END LOOP;

  -- The value write. trg_wo_budget_sync fires on total_amount and posts
  -- delta = new_total - already_committed, which is exactly this variation's
  -- amount. No ledger logic is duplicated here.
  UPDATE public.work_orders
  SET total_amount    = v_new,
      ceiling_amount  = CASE WHEN COALESCE(wo_type, 'fixed_scope') = 'rate_based'
                             THEN v_new ELSE ceiling_amount END,
      original_amount = COALESCE(original_amount, v_wo.total_amount),
      revision_no     = COALESCE(revision_no, 0) + 1,
      updated_at      = now()
  WHERE id = v_var.work_order_id;

  PERFORM set_config('app.wo_variation_apply', 'off', true);

  UPDATE public.work_order_variations
  SET contract_value_before = COALESCE(v_wo.total_amount, 0),
      contract_value_after  = v_new
  WHERE id = p_variation_id;

  -- The contract moved; record it on the same append-only trail that carries
  -- every other change to this document.
  INSERT INTO public.work_order_status_history (
    work_order_id, project_id, from_status, to_status, reason,
    changed_by, total_amount_at_change
  ) VALUES (
    v_var.work_order_id, v_var.project_id,
    public.wo_canonical_status(v_wo.wo_status),
    public.wo_canonical_status(v_wo.wo_status),
    format('Variation %s applied: %s to %s. %s',
           v_var.variation_number,
           to_char(COALESCE(v_wo.total_amount, 0), 'FM99,99,99,999.00'),
           to_char(v_new, 'FM99,99,99,999.00'),
           v_var.reason),
    COALESCE(v_var.approved_by, public.app_current_profile_id()),
    v_new
  );
END $$;

COMMENT ON FUNCTION public.fn_apply_wo_variation(uuid) IS
  'Applies an approved variation: updates/inserts scope lines, writes the new contract value, bumps revision_no and records the change on work_order_status_history. The commitment delta is posted by the existing Phase 2 trigger, not here.';

-- 4b. Lifecycle guard.
CREATE OR REPLACE FUNCTION public.trg_guard_wo_variation_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from   text := lower(COALESCE(btrim(OLD.status), ''));
  v_to     text := lower(COALESCE(btrim(NEW.status), ''));
  v_actor  uuid := public.app_current_profile_id();
  v_status text;
BEGIN
  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF NOT public.wov_transition_allowed(v_from, v_to) THEN
    RAISE EXCEPTION 'Variation % cannot move from % to %.',
      COALESCE(NEW.variation_number, NEW.id::text), v_from, v_to
      USING ERRCODE = '22023',
            HINT = 'An approved variation is terminal — reverse it with another variation.';
  END IF;

  IF v_to IN ('approved', 'rejected') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may % a variation.',
      CASE WHEN v_to = 'approved' THEN 'approve' ELSE 'reject' END
      USING ERRCODE = '42501';
  END IF;

  IF v_to = 'rejected' AND COALESCE(btrim(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required to reject variation %.',
      COALESCE(NEW.variation_number, NEW.id::text) USING ERRCODE = '22023';
  END IF;

  IF v_to = 'approved' THEN
    -- Varying a closed or cancelled contract is meaningless: there is nothing
    -- left to execute and the commitment has already been released.
    SELECT public.wo_canonical_status(wo_status) INTO v_status
    FROM public.work_orders WHERE id = NEW.work_order_id;

    IF v_status NOT IN ('issued', 'active') THEN
      RAISE EXCEPTION 'Work Order is % — a variation can only be applied to a live contract.',
        COALESCE(v_status, 'missing') USING ERRCODE = '22023';
    END IF;

    -- Segregation of duties, matching the service-bill rule: the person who
    -- raised the scope change may not also authorise the money for it.
    IF v_actor IS NOT NULL AND NEW.created_by IS NOT NULL AND NEW.created_by = v_actor THEN
      RAISE EXCEPTION
        'Segregation of duties: variation % was raised by you and must be approved by someone else.',
        COALESCE(NEW.variation_number, NEW.id::text) USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(v_actor, NEW.updated_by);

  CASE v_to
    WHEN 'submitted' THEN
      NEW.submitted_at := now();
      NEW.submitted_by := COALESCE(v_actor, NEW.submitted_by);
    WHEN 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := COALESCE(v_actor, NEW.approved_by);
      NEW.rejection_reason := NULL;
      NEW.rejected_at := NULL;
      NEW.rejected_by := NULL;
    WHEN 'rejected' THEN
      NEW.rejected_at := now();
      NEW.rejected_by := COALESCE(v_actor, NEW.rejected_by);
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_wo_variation_status ON public.work_order_variations;
CREATE TRIGGER guard_wo_variation_status
  BEFORE UPDATE OF status ON public.work_order_variations
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_wo_variation_status();

CREATE OR REPLACE FUNCTION public.trg_validate_wo_variation_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := public.app_current_profile_id();
BEGIN
  IF lower(COALESCE(btrim(NEW.status), 'draft')) NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'A variation may only be created as draft or submitted; approve it separately.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'A variation requires a reason.' USING ERRCODE = '22023';
  END IF;

  NEW.created_by := COALESCE(NEW.created_by, v_actor);
  NEW.updated_by := COALESCE(NEW.updated_by, v_actor);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_wo_variation_insert ON public.work_order_variations;
CREATE TRIGGER validate_wo_variation_insert
  BEFORE INSERT ON public.work_order_variations
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_wo_variation_insert();

-- 4c. Approval applies it. AFTER, so the row is committed to 'approved' before
--     fn_apply_wo_variation reads it back.
CREATE OR REPLACE FUNCTION public.trg_wo_variation_apply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.fn_apply_wo_variation(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wo_variation_apply ON public.work_order_variations;
CREATE TRIGGER wo_variation_apply
  AFTER INSERT OR UPDATE OF status ON public.work_order_variations
  FOR EACH ROW EXECUTE FUNCTION public.trg_wo_variation_apply();

-- ----------------------------------------------------------------------------
-- 5. RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_work_order_variation_status(
  p_variation_id uuid,
  p_status       text,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_to  text := lower(COALESCE(btrim(p_status), ''));
  v_row public.work_order_variations;
  v_wo  public.work_orders;
BEGIN
  PERFORM public.app_require_profile();

  IF v_to NOT IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Unrecognised variation status %.', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.work_order_variations
  SET status           = v_to,
      rejection_reason = CASE WHEN v_to = 'rejected'
                              THEN NULLIF(btrim(COALESCE(p_reason, '')), '')
                              ELSE rejection_reason END
  WHERE id = p_variation_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variation % not found, or you do not have access to it.', p_variation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = v_row.work_order_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'variation_number', v_row.variation_number,
    'status', v_row.status,
    'amount', v_row.amount,
    'contract_value', COALESCE(v_wo.total_amount, 0),
    'revision_no', COALESCE(v_wo.revision_no, 0)
  );
END $$;

COMMENT ON FUNCTION public.set_work_order_variation_status(uuid, text, text) IS
  'Deliberate entry point for a variation transition. Approving applies the change to the contract and posts the commitment delta through the existing Phase 2 path.';

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_order_variations', 'work_order_variation_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_current_role() IS NOT NULL)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.app_can_write_procurement())', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.app_can_write_procurement())
         WITH CHECK (public.app_can_write_procurement())', t || '_update', t);
  END LOOP;
END $$;

-- An approved variation is contract history. Lines may only be removed while it
-- is still being drafted.
DROP POLICY IF EXISTS work_order_variation_lines_delete ON public.work_order_variation_lines;
CREATE POLICY work_order_variation_lines_delete
  ON public.work_order_variation_lines FOR DELETE TO authenticated
  USING (
    public.app_can_write_procurement()
    AND EXISTS (
      SELECT 1 FROM public.work_order_variations v
      WHERE v.id = work_order_variation_lines.variation_id
        AND v.status IN ('draft', 'submitted', 'rejected'))
  );

GRANT DELETE ON public.work_order_variation_lines TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.set_work_order_variation_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_work_order_variation_status(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.wov_transition_allowed(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.wov_transition_allowed(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_apply_wo_variation(uuid) FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. RECONCILE
--
--    Record what live contracts were issued at, so the variation history has a
--    baseline to compare against.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.work_orders
  SET original_amount = total_amount
  WHERE deleted_at IS NULL
    AND original_amount IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'Stage 4 reconcile: original_amount seeded on % Work Order(s).', v_count;
END $$;

-- ----------------------------------------------------------------------------
-- 9. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['work_order_variations', 'work_order_variation_lines'] LOOP
    IF to_regclass('public.' || v_key) IS NULL THEN
      v_problems := array_append(v_problems, v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['guard_wo_variation_status', 'validate_wo_variation_insert',
                               'wo_variation_apply', 'guard_wo_contract_immutable',
                               'guard_wo_line_immutable', 'aa_wo_apply_ceiling'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key AND NOT tgisinternal) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  FOREACH v_key IN ARRAY ARRAY['ceiling_amount', 'revision_no', 'original_amount'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'work_orders' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'work_orders.' || v_key || ' missing');
    END IF;
  END LOOP;

  -- The ceiling trigger must fire BEFORE the Stage 1 status guard, or a
  -- rate-based Work Order is rejected for having no value before the ceiling
  -- has been copied into total_amount.
  IF NOT ('aa_wo_apply_ceiling' < 'guard_work_order_status') THEN
    v_problems := array_append(v_problems,
      'aa_wo_apply_ceiling no longer sorts before guard_work_order_status');
  END IF;

  IF public.wov_transition_allowed('approved', 'draft') THEN
    v_problems := array_append(v_problems, 'wov_transition_allowed permits approved->draft');
  END IF;
  IF NOT public.wov_transition_allowed('submitted', 'approved') THEN
    v_problems := array_append(v_problems, 'wov_transition_allowed blocks submitted->approved');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Stage 4 incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Stage 4 applied: a live contract can only change through an approved variation, and a rate-based Work Order now encumbers its ceiling instead of zero.';
END $$;

COMMIT;

-- ============================================================================
-- REALTIME REGISTRATION — outside the main transaction, on purpose.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['work_order_variations', 'work_order_variation_lines'] LOOP
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
