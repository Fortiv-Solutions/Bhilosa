-- ============================================================================
-- PHASE 3 — SERVICE BILL STRUCTURAL PARITY + BUDGET POSTING
-- File: supabase/migrations/20260805100300_service_bill_budget_integration.sql
--
-- Depends on:
--   20260801000000_service_bills_schema.sql          (service_bills)
--   20260803000000_work_order_module_enhancement.sql (WO/QC/balance triggers)
--   20260805100000_budget_ledger_txn_types.sql       (retention_held, ...)
--   20260805100100_budget_ledger_gross_basis_...sql  (revision_seq, signed amounts)
--   20260805100200_work_order_budget_integration.sql (WO commitment, fn_wo_*)
--
-- THE PROBLEM
-- ===========
-- service_bills was created as a thin header-only table: no line items, no budget
-- head, no Master Budget link, no retention/advance/deduction block, no approval
-- audit, no soft delete, and nothing connecting it to budget_ledger. A contractor
-- RA bill therefore drew down its Work Order and then vanished — it never became
-- project cost, never released the Work Order's commitment, never appeared in the
-- variance sheet, and could never be paid (payments.vendor_bill_id is NOT NULL).
--
-- Meanwhile vendor_bills — the material bill desk — already had every one of those
-- columns. The two bill spines were structurally unequal for no reason other than
-- the order the branches were written in.
--
-- WHAT THIS MIGRATION DOES
-- ========================
-- 1. Brings service_bills to structural parity with vendor_bills.
-- 2. Adds service_bill_lines, so an RA bill can carry measured items and Phase 4's
--    UNION ledger can emit line-level rows symmetric with vendor_bill_lines.
-- 3. Adds RA (Running Account) sequencing: previous certified, this certification,
--    cumulative to date — the shape every one of the 15 Work Order templates
--    actually specifies ("RA shall be raised only for activity which is 100%
--    Complete", "Retention @ 5% will be kept in all RA bills").
-- 4. Posts to budget_ledger on certification: 'actual' at GROSS certified value,
--    'retention_held' for the withheld portion, and 'release' against the Work
--    Order's outstanding commitment.
-- 5. Generalises payments so a service bill can actually be paid.
-- 6. Feeds budget_variance_items, which previously only ever saw material bills.
-- 7. Closes the QC-gate INSERT bypass and adds approval audit columns.
--
-- ACCOUNTING RULE ENFORCED HERE
-- =============================
-- A service bill posts its actual to the SAME budget head its Work Order committed
-- against. Anything else would relieve commitment in one head while booking cost in
-- another, corrupting both. Since "no WO, no bill" is enforced at the database
-- level, that head always exists (or the WO was explicitly permitted to be
-- unbudgeted, in which case nothing posts at all).
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0a. LOCK DISCIPLINE
--
--     This migration previously deadlocked against Supabase's own background
--     readers:
--
--       process A (this migration) held AccessExclusiveLock on service_bills
--         (taken in section 1) and waited for AccessExclusiveLock on payments
--         (needed in section 9);
--       process B held payments and waited for AccessShareLock on service_bills.
--
--     Every ALTER TABLE fires PostgREST's DDL watch, which reloads the schema
--     cache by reading across the catalog and user tables, so a long DDL
--     transaction that grabs tables one at a time as it goes WILL eventually
--     interleave with a reader that wants them in the opposite order.
--
--     The fix is to take every table lock this migration needs immediately, in
--     one statement, in a fixed (alphabetical) order — there is then no window
--     in which another session can acquire one of them and block on another.
--     lock_timeout makes a genuinely contended run fail in seconds with a clear
--     message instead of hanging or deadlocking mid-way.
-- ----------------------------------------------------------------------------

--     The locks themselves are taken AFTER the precondition checks below: those
--     read only catalogs, and LOCK TABLE on a missing relation would fail with
--     "relation does not exist" instead of the actionable message naming the
--     migration to apply first.
-- ----------------------------------------------------------------------------

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
  IF to_regclass('public.service_bills') IS NULL THEN
    v_missing := array_append(v_missing,
      'table service_bills (apply 20260801000000_service_bills_schema.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_wo_committed_amount'
  ) THEN
    v_missing := array_append(v_missing,
      'fn_wo_committed_amount (apply 20260805100200_work_order_budget_integration.sql)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_ledger' AND column_name = 'revision_seq'
  ) THEN
    v_missing := array_append(v_missing,
      'budget_ledger.revision_seq (apply 20260805100100_budget_ledger_gross_basis_and_derived_counters.sql)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Service bill budget integration cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- Everything exists: now take all the locks at once, in a fixed order (see 0a).
-- payments is the one that deadlocked — it was previously reached only at
-- section 9, long after service_bills had already been held since section 1.
LOCK TABLE public.payments,
           public.service_bills,
           public.work_orders
  IN ACCESS EXCLUSIVE MODE;

-- service_bill_lines is created below, so it can only be locked here if a
-- previous (partial) run already created it.
DO $$
BEGIN
  IF to_regclass('public.service_bill_lines') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.service_bill_lines IN ACCESS EXCLUSIVE MODE';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA — parity with vendor_bills
-- ----------------------------------------------------------------------------

ALTER TABLE public.service_bills
  -- Budget classification. budget_allocation_id is a fallback only: the Work
  -- Order's head wins (see the accounting rule in the header).
  ADD COLUMN IF NOT EXISTS budget_allocation_id  uuid REFERENCES public.budget_allocations(id),
  ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id),

  -- Commercial block, mirroring vendor_bills exactly so one UNION view can read
  -- both without per-branch special cases.
  ADD COLUMN IF NOT EXISTS retention_percent  numeric NOT NULL DEFAULT 0
    CHECK (retention_percent >= 0 AND retention_percent <= 100),
  ADD COLUMN IF NOT EXISTS retention_amount   numeric NOT NULL DEFAULT 0 CHECK (retention_amount >= 0),
  ADD COLUMN IF NOT EXISTS advance_adjusted   numeric NOT NULL DEFAULT 0 CHECK (advance_adjusted >= 0),
  ADD COLUMN IF NOT EXISTS other_deductions   numeric NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  ADD COLUMN IF NOT EXISTS net_payable_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ledger_remarks     text,

  -- Running Account sequencing. An RA bill is always "cumulative minus previously
  -- certified", which is why a flat header amount was never enough.
  ADD COLUMN IF NOT EXISTS ra_sequence                 integer,
  ADD COLUMN IF NOT EXISTS previous_certified_amount   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cumulative_certified_amount numeric NOT NULL DEFAULT 0,

  -- Supplier's own reference, so the ledger can show both our number and theirs.
  ADD COLUMN IF NOT EXISTS supplier_bill_no   text,
  ADD COLUMN IF NOT EXISTS supplier_bill_date date,

  -- Approval audit. approveServiceBill() previously wrote only status + remarks,
  -- so there was no record of who certified a payment.
  ADD COLUMN IF NOT EXISTS verified_by      uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by      uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS created_by       uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by       uuid REFERENCES public.profiles(id),

  -- Financial documents are retired, never deleted.
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.service_bills.budget_allocation_id IS
  'Fallback budget head. The linked Work Order''s head takes precedence — actual, retention and commitment release must all land where the commitment was raised.';
COMMENT ON COLUMN public.service_bills.cumulative_certified_amount IS
  'Certified value of this bill plus every earlier certified bill on the same Work Order. previous_certified_amount + this bill.';

-- 1b. Status vocabularies were free text with no constraint, so a typo silently
--     created a status that no query would ever match again.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_bills_status_chk') THEN
    ALTER TABLE public.service_bills ADD CONSTRAINT service_bills_status_chk
      CHECK (status IN ('draft', 'submitted', 'verified', 'approved', 'rejected', 'paid'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_bills_payment_status_chk') THEN
    ALTER TABLE public.service_bills ADD CONSTRAINT service_bills_payment_status_chk
      CHECK (payment_status IN ('pending', 'partially_paid', 'paid'));
  END IF;

  -- One bill number per vendor. The material desk already has duplicate
  -- detection; this is the structural equivalent for services.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_service_bills_vendor_number'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX uq_service_bills_vendor_number
        ON public.service_bills (vendor_id, lower(btrim(bill_number)))
        WHERE deleted_at IS NULL AND vendor_id IS NOT NULL;
    EXCEPTION WHEN unique_violation THEN
      RAISE WARNING 'Could not create uq_service_bills_vendor_number: duplicate (vendor, bill_number) rows exist. Deduplicate then re-run.';
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_bills_allocation
  ON public.service_bills (budget_allocation_id) WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_bills_master_item
  ON public.service_bills (master_budget_item_id) WHERE master_budget_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_bills_project_billdate
  ON public.service_bills (project_id, bill_date DESC) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. SERVICE BILL LINES
--    Symmetric with vendor_bill_lines so Phase 4's UNION ledger emits one row per
--    billed item on both branches, and so measured quantities are auditable.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_bill_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_bill_id       uuid NOT NULL REFERENCES public.service_bills(id) ON DELETE CASCADE,
  project_id            uuid NOT NULL REFERENCES public.projects(id),
  /* The Work Order line being billed, so measured-vs-planned is traceable. */
  work_order_line_id    uuid REFERENCES public.work_order_lines(id),
  master_budget_item_id uuid REFERENCES public.master_budget_items(id),

  description text NOT NULL,
  unit        text,
  /* Quantity certified on THIS bill. */
  quantity    numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  rate        numeric NOT NULL DEFAULT 0 CHECK (rate >= 0),
  tax_rate    numeric NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_total  numeric NOT NULL DEFAULT 0,

  /* RA measurement: cumulative to date and what was certified before this bill.
     quantity is the difference, which is what actually gets paid. */
  cumulative_quantity numeric NOT NULL DEFAULT 0 CHECK (cumulative_quantity >= 0),
  previous_quantity   numeric NOT NULL DEFAULT 0 CHECK (previous_quantity >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_bill_lines_bill
  ON public.service_bill_lines (service_bill_id);
CREATE INDEX IF NOT EXISTS idx_service_bill_lines_wo_line
  ON public.service_bill_lines (work_order_line_id) WHERE work_order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_bill_lines_master_item
  ON public.service_bill_lines (master_budget_item_id) WHERE master_budget_item_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. DERIVED AMOUNTS
-- ----------------------------------------------------------------------------

-- 3a. line_total from quantity x rate, unless explicitly supplied.
CREATE OR REPLACE FUNCTION public.fn_compute_service_bill_line()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.line_total IS NULL OR NEW.line_total = 0 THEN
    NEW.line_total := ROUND(COALESCE(NEW.quantity, 0) * COALESCE(NEW.rate, 0), 2);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_line_total ON public.service_bill_lines;
CREATE TRIGGER trg_service_bill_line_total
  BEFORE INSERT OR UPDATE OF quantity, rate, line_total ON public.service_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_service_bill_line();

-- 3b. Header totals roll up from lines WHEN LINES EXIST. A header-only bill keeps
--     the amounts entered directly, so the simple flow is not broken.
CREATE OR REPLACE FUNCTION public.fn_rollup_service_bill_from_lines(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count    integer;
  v_subtotal numeric;
  v_tax      numeric;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*),
         COALESCE(SUM(line_total), 0),
         COALESCE(SUM(ROUND(line_total * tax_rate / 100.0, 2)), 0)
    INTO v_count, v_subtotal, v_tax
  FROM public.service_bill_lines
  WHERE service_bill_id = p_bill_id;

  IF v_count = 0 THEN
    RETURN;  -- header-only bill: leave the manually entered amounts alone
  END IF;

  UPDATE public.service_bills
  SET subtotal_amount = v_subtotal,
      tax_amount      = v_tax,
      total_amount    = v_subtotal + v_tax,
      updated_at      = now()
  WHERE id = p_bill_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_service_bill_line_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_rollup_service_bill_from_lines(OLD.service_bill_id);
    RETURN OLD;
  END IF;

  PERFORM public.fn_rollup_service_bill_from_lines(NEW.service_bill_id);
  IF TG_OP = 'UPDATE' AND OLD.service_bill_id IS DISTINCT FROM NEW.service_bill_id THEN
    PERFORM public.fn_rollup_service_bill_from_lines(OLD.service_bill_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_line_rollup ON public.service_bill_lines;
CREATE TRIGGER trg_service_bill_line_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.service_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_service_bill_line_rollup();

-- 3c. net payable. Identical arithmetic to fn_compute_vendor_bill_net, including
--     the fix that a percentage change re-derives the amount while an explicit
--     amount override is respected.
CREATE OR REPLACE FUNCTION public.fn_compute_service_bill_net()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.retention_percent, 0) > 0 AND COALESCE(NEW.retention_amount, 0) = 0 THEN
      NEW.retention_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * NEW.retention_percent / 100.0, 2);
    END IF;
  ELSE
    IF (NEW.retention_percent IS DISTINCT FROM OLD.retention_percent
        OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount)
       AND NEW.retention_amount IS NOT DISTINCT FROM OLD.retention_amount THEN
      NEW.retention_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * COALESCE(NEW.retention_percent, 0) / 100.0, 2);
    END IF;
  END IF;

  NEW.net_payable_amount := GREATEST(0,
      COALESCE(NEW.total_amount, 0)
    - COALESCE(NEW.retention_amount, 0)
    - COALESCE(NEW.advance_adjusted, 0)
    - COALESCE(NEW.other_deductions, 0));

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_net ON public.service_bills;
CREATE TRIGGER trg_service_bill_net
  BEFORE INSERT OR UPDATE OF subtotal_amount, tax_amount, total_amount,
    retention_percent, retention_amount, advance_adjusted, other_deductions
  ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_service_bill_net();

-- ----------------------------------------------------------------------------
-- 4. RA SEQUENCING
--    Renumbers every bill on a Work Order in date order and recomputes the
--    previous/cumulative pair. Cheap: the row count per Work Order is small, and
--    doing it as a set beats trying to keep a counter correct through edits,
--    rejections and deletions.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_resequence_service_bills(p_work_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_work_order_id IS NULL THEN
    RETURN;
  END IF;

  WITH ordered AS (
    SELECT
      sb.id,
      ROW_NUMBER() OVER (ORDER BY sb.bill_date, sb.created_at, sb.id) AS seq,
      -- Certified value of every EARLIER bill on this Work Order.
      COALESCE(SUM(sb.total_amount) FILTER (WHERE sb.status IN ('approved', 'paid'))
               OVER (ORDER BY sb.bill_date, sb.created_at, sb.id
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prev_certified
    FROM public.service_bills sb
    WHERE sb.work_order_id = p_work_order_id
      AND sb.deleted_at IS NULL
      AND sb.status <> 'rejected'
  )
  UPDATE public.service_bills s
  SET ra_sequence                 = o.seq,
      previous_certified_amount   = o.prev_certified,
      cumulative_certified_amount = o.prev_certified
                                    + CASE WHEN s.status IN ('approved', 'paid')
                                           THEN COALESCE(s.total_amount, 0) ELSE 0 END
  FROM ordered o
  WHERE s.id = o.id
    AND (s.ra_sequence IS DISTINCT FROM o.seq
         OR s.previous_certified_amount IS DISTINCT FROM o.prev_certified
         OR s.cumulative_certified_amount IS DISTINCT FROM
            o.prev_certified + CASE WHEN s.status IN ('approved', 'paid')
                                    THEN COALESCE(s.total_amount, 0) ELSE 0 END);
END $$;

-- ----------------------------------------------------------------------------
-- 5. BUDGET HEAD RESOLUTION
--    The Work Order's head wins. Actual, retention and commitment release must all
--    land where the commitment was raised, or the release relieves one head while
--    the cost books to another.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_resolve_service_bill_allocation(p_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill       public.service_bills;
  v_wo_alloc   uuid;
  v_allocation uuid;
BEGIN
  SELECT * INTO v_bill FROM public.service_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_bill.work_order_id IS NOT NULL THEN
    SELECT budget_allocation_id INTO v_wo_alloc
    FROM public.work_orders WHERE id = v_bill.work_order_id;
    IF v_wo_alloc IS NOT NULL THEN
      RETURN v_wo_alloc;
    END IF;
  END IF;

  -- The Work Order was permitted to be unbudgeted. Fall back to whatever the bill
  -- itself can resolve, so an explicitly classified bill is not lost entirely.
  v_allocation := public.fn_resolve_budget_allocation(
    v_bill.project_id, v_bill.budget_allocation_id, v_bill.master_budget_item_id
  );
  IF v_allocation IS NOT NULL THEN
    RETURN v_allocation;
  END IF;

  IF v_bill.activity_id IS NOT NULL THEN
    RETURN public.fn_resolve_wo_allocation_for(
      v_bill.project_id, NULL, NULL, v_bill.activity_id
    );
  END IF;

  RETURN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 6. LEDGER POSTING
--    Mirrors fn_post_vendor_bill_to_budget: cost at GROSS certified value,
--    retention as its own liability row, commitment relieved against what the
--    Work Order still has outstanding.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_service_bill_to_budget(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill        public.service_bills;
  v_allocation  uuid;
  v_category    uuid;
  v_gross       numeric;
  v_retention   numeric;
  v_committed   numeric;
  v_released    numeric;
  v_release_now numeric;
  v_master_item uuid;
BEGIN
  SELECT * INTO v_bill FROM public.service_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL OR v_bill.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Cost is recognised at certification, not at payment.
  IF v_bill.status NOT IN ('approved', 'paid') THEN
    RETURN;
  END IF;

  v_gross     := COALESCE(v_bill.total_amount, 0);
  v_retention := COALESCE(v_bill.retention_amount, 0);
  IF v_gross <= 0 THEN
    RETURN;
  END IF;

  v_allocation := public.fn_resolve_service_bill_allocation(p_bill_id);
  IF v_allocation IS NULL THEN
    RETURN;  -- unbudgeted Work Order, explicitly permitted; nothing to post
  END IF;

  SELECT category_id INTO v_category FROM public.budget_allocations WHERE id = v_allocation;

  -- Prefer the bill's own Master Budget link; otherwise inherit the Work Order's.
  v_master_item := v_bill.master_budget_item_id;
  IF v_master_item IS NULL AND v_bill.work_order_id IS NOT NULL THEN
    SELECT master_budget_item_id INTO v_master_item
    FROM public.work_orders WHERE id = v_bill.work_order_id;
  END IF;

  -- 6a. Cost, at gross certified value.
  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount,
    gross_amount, retention_amount, tax_amount, net_payable_amount,
    description, posted_at, document_date, document_no, financial_year,
    vendor_id, activity_id, master_budget_item_id, revision_seq
  ) VALUES (
    v_bill.project_id, v_allocation, v_category, 'actual'::erp_budget_txn_type,
    'service_bills', v_bill.id, v_gross,
    v_gross, v_retention, COALESCE(v_bill.tax_amount, 0), COALESCE(v_bill.net_payable_amount, 0),
    'Service bill certified: ' || COALESCE(v_bill.bill_number, v_bill.id::text),
    now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
    v_bill.vendor_id, v_bill.activity_id, v_master_item,
    public.fn_next_ledger_revision_seq('service_bills', v_bill.id, 'actual'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;

  -- 6b. Retention withheld, as a tracked liability rather than a cost reduction.
  IF v_retention > 0 THEN
    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, retention_amount,
      description, posted_at, document_date, document_no, financial_year,
      vendor_id, master_budget_item_id, revision_seq
    ) VALUES (
      v_bill.project_id, v_allocation, v_category, 'retention_held'::erp_budget_txn_type,
      'service_bills', v_bill.id, v_retention, v_retention,
      'Retention withheld on service bill ' || COALESCE(v_bill.bill_number, v_bill.id::text),
      now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
      v_bill.vendor_id, v_master_item,
      public.fn_next_ledger_revision_seq('service_bills', v_bill.id, 'retention_held'::erp_budget_txn_type)
    )
    ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;
  END IF;

  -- 6c. Relieve the Work Order's commitment, capped at what it still has open.
  --     fn_wo_released_amount already counts service_bills releases, so repeated
  --     calls converge instead of over-relieving.
  IF v_bill.work_order_id IS NOT NULL THEN
    v_committed := public.fn_wo_committed_amount(v_bill.work_order_id);
    v_released  := public.fn_wo_released_amount(v_bill.work_order_id);
    v_release_now := LEAST(v_gross, GREATEST(0, v_committed - v_released));

    IF v_release_now > 0 THEN
      INSERT INTO public.budget_ledger (
        project_id, budget_allocation_id, category_id, transaction_type,
        source_table, source_id, amount, gross_amount,
        description, posted_at, document_date, document_no, financial_year,
        vendor_id, master_budget_item_id, revision_seq
      ) VALUES (
        v_bill.project_id, v_allocation, v_category, 'release'::erp_budget_txn_type,
        'service_bills', v_bill.id, v_release_now, v_release_now,
        'Work Order commitment released against service bill '
          || COALESCE(v_bill.bill_number, v_bill.id::text),
        now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
        v_bill.vendor_id, v_master_item,
        public.fn_next_ledger_revision_seq('service_bills', v_bill.id, 'release'::erp_budget_txn_type)
      )
      ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;
    END IF;
  END IF;
END $$;

-- 6d. Certification posts; amending a certified bill reverses and re-posts.
CREATE OR REPLACE FUNCTION public.fn_service_bill_budget_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.budget_ledger;
  v_any boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('approved', 'paid') THEN
      PERFORM public.fn_post_service_bill_to_budget(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- Entering a certified state.
  IF NEW.status IN ('approved', 'paid') AND OLD.status NOT IN ('approved', 'paid') THEN
    PERFORM public.fn_post_service_bill_to_budget(NEW.id);
    RETURN NEW;
  END IF;

  -- Leaving a certified state (rejected or reverted), or amended while certified:
  -- reverse everything currently in force for this bill, then re-post if it is
  -- still certified. This is the same guarantee vendor bills got in Phase 1 —
  -- budget_ledger can never silently disagree with the document it represents.
  IF OLD.status IN ('approved', 'paid')
     AND (NEW.status NOT IN ('approved', 'paid')
          OR NEW.total_amount     IS DISTINCT FROM OLD.total_amount
          OR NEW.retention_amount IS DISTINCT FROM OLD.retention_amount
          OR NEW.tax_amount       IS DISTINCT FROM OLD.tax_amount
          OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at) THEN

    FOR v_row IN SELECT * FROM public.fn_effective_ledger_rows('service_bills', NEW.id) LOOP
      PERFORM public.fn_reverse_ledger_entry(
        v_row.id,
        'Service bill amended or de-certified (' || COALESCE(NEW.bill_number, NEW.id::text) || ')'
      );
      v_any := true;
    END LOOP;

    IF v_any AND NEW.status IN ('approved', 'paid') AND NEW.deleted_at IS NULL THEN
      PERFORM public.fn_post_service_bill_to_budget(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_budget_sync ON public.service_bills;
CREATE TRIGGER trg_service_bill_budget_sync
  AFTER INSERT OR UPDATE OF status, total_amount, tax_amount,
                            retention_percent, retention_amount,
                            advance_adjusted, other_deductions, deleted_at
  ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_budget_sync();

-- ----------------------------------------------------------------------------
-- 7. WORK ORDER BALANCE + RA RESEQUENCE
--    Replaces fn_service_bill_wo_balance so one bill-side trigger drives both the
--    Work Order drawdown (Phase 2) and the RA sequence.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_service_bill_wo_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recompute_wo_billed_to_date(OLD.work_order_id);
    PERFORM public.fn_resequence_service_bills(OLD.work_order_id);
    RETURN OLD;
  END IF;

  PERFORM public.fn_recompute_wo_billed_to_date(NEW.work_order_id);
  PERFORM public.fn_resequence_service_bills(NEW.work_order_id);

  IF TG_OP = 'UPDATE' AND OLD.work_order_id IS DISTINCT FROM NEW.work_order_id THEN
    PERFORM public.fn_recompute_wo_billed_to_date(OLD.work_order_id);
    PERFORM public.fn_resequence_service_bills(OLD.work_order_id);
  END IF;

  RETURN NEW;
END $$;

-- The original trigger was declared AFTER INSERT OR UPDATE OR DELETE with NO
-- column list, so it fired on EVERY column change. That is now a feedback loop:
-- fn_resequence_service_bills writes ra_sequence / previous_certified_amount back
-- to service_bills, and fn_recompute_service_bill_payment_status writes
-- payment_status, each of which would re-enter this trigger. Scoping it to the
-- columns that genuinely affect the Work Order balance breaks the loop at the
-- declaration instead of relying on the write-back being a no-op.
DROP TRIGGER IF EXISTS trg_service_bill_wo_balance ON public.service_bills;
CREATE TRIGGER trg_service_bill_wo_balance
  AFTER INSERT
     OR UPDATE OF work_order_id, status, subtotal_amount, total_amount, bill_date, deleted_at
     OR DELETE
  ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_wo_balance();

-- ----------------------------------------------------------------------------
-- 8. QC GATE — close the INSERT bypass.
--    The original trigger was BEFORE UPDATE OF status only, so inserting a bill
--    directly at status='approved' skipped the QC check entirely.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_service_bill_qc_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qc_ok boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RETURN NEW;  -- already approved, nothing to re-check
  END IF;
  IF NEW.activity_id IS NULL AND NEW.qc_inspection_id IS NULL THEN
    RETURN NEW;  -- no linked activity/inspection to gate on
  END IF;

  IF NEW.qc_inspection_id IS NOT NULL THEN
    SELECT status::text IN ('accepted', 'partially_accepted') INTO v_qc_ok
    FROM public.qc_inspections WHERE id = NEW.qc_inspection_id;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.qc_inspections
      WHERE activity_id = NEW.activity_id
        AND status::text IN ('accepted', 'partially_accepted')
    ) INTO v_qc_ok;
  END IF;

  IF NOT COALESCE(v_qc_ok, false) THEN
    RAISE EXCEPTION 'QC has not passed for this activity - the bill cannot be approved until QC is accepted.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_bill_qc_gate ON public.service_bills;
CREATE TRIGGER trg_service_bill_qc_gate
  BEFORE INSERT OR UPDATE OF status ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_qc_gate();

-- Re-asserted verbatim so this migration is self-contained: "no WO, no bill" is
-- the rule the whole service-bill flow rests on, and it must exist even if an
-- environment dropped it. Its surface is unchanged — deliberately, since a bill
-- on a Work Order that was closed AFTER the claim was raised is still payable.
DROP TRIGGER IF EXISTS trg_service_bill_require_active_wo ON public.service_bills;
CREATE TRIGGER trg_service_bill_require_active_wo
  BEFORE INSERT OR UPDATE OF work_order_id ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_service_bill_require_active_wo();

-- ----------------------------------------------------------------------------
-- 9. PAYMENTS — a service bill could never be paid: payments.vendor_bill_id is
--    NOT NULL and there was no service_bill_id at all.
-- ----------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS service_bill_id uuid REFERENCES public.service_bills(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'vendor_bill_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN vendor_bill_id DROP NOT NULL;
  END IF;

  -- Exactly one of the two. Existing rows all carry vendor_bill_id, so this is
  -- satisfied on day one.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_exactly_one_bill_chk') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_exactly_one_bill_chk
      CHECK (num_nonnulls(vendor_bill_id, service_bill_id) = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_service_bill
  ON public.payments (service_bill_id) WHERE service_bill_id IS NOT NULL;

-- Keep service_bills.payment_status honest against what has actually been paid.
CREATE OR REPLACE FUNCTION public.fn_recompute_service_bill_payment_status(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_net  numeric;
  v_paid numeric;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(net_payable_amount, 0), total_amount, 0)
    INTO v_net FROM public.service_bills WHERE id = p_bill_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.payments
  WHERE service_bill_id = p_bill_id AND status = 'paid'::erp_payment_status;

  UPDATE public.service_bills
  SET payment_status = CASE
        WHEN v_paid <= 0 THEN 'pending'
        WHEN v_paid >= v_net THEN 'paid'
        ELSE 'partially_paid' END,
      updated_at = now()
  WHERE id = p_bill_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_service_bill_payment_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.service_bill_id IS NOT NULL THEN
    PERFORM public.fn_recompute_service_bill_payment_status(OLD.service_bill_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.service_bill_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.service_bill_id IS DISTINCT FROM OLD.service_bill_id) THEN
    PERFORM public.fn_recompute_service_bill_payment_status(NEW.service_bill_id);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_service_bill_status ON public.payments;
CREATE TRIGGER trg_payment_service_bill_status
  AFTER INSERT OR UPDATE OF status, amount, service_bill_id OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_service_bill_payment_status();

-- ----------------------------------------------------------------------------
-- 10. VARIANCE ROLLUP — the sheet previously only ever saw material documents,
--     so every service/labour/subcontract Master Budget line showed a baseline
--     with permanently zero committed and actual figures.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_rollup_variance_for_master_item(p_master_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po_qty      numeric := 0;
  v_po_amount   numeric := 0;
  v_bill_qty    numeric := 0;
  v_bill_amount numeric := 0;
  v_wo_qty      numeric := 0;
  v_wo_amount   numeric := 0;
  v_sb_qty      numeric := 0;
  v_sb_amount   numeric := 0;
BEGIN
  IF p_master_item_id IS NULL THEN
    RETURN;
  END IF;

  -- Committed: approved POs mapped to this Master Budget line.
  SELECT COALESCE(SUM(pol.quantity), 0), COALESCE(SUM(pol.line_total), 0)
    INTO v_po_qty, v_po_amount
  FROM public.purchase_orders po
  LEFT JOIN public.purchase_order_lines pol ON pol.purchase_order_id = po.id
  WHERE po.master_budget_item_id = p_master_item_id
    AND po.deleted_at IS NULL
    AND po.status IN ('approved'::erp_po_status, 'sent_to_vendor'::erp_po_status,
                      'acknowledged'::erp_po_status, 'partially_delivered'::erp_po_status,
                      'delivered'::erp_po_status, 'closed'::erp_po_status);

  -- Committed: live Work Orders mapped to this line. A subcontract is an
  -- encumbrance exactly as a PO is.
  SELECT COALESCE(SUM(wol.quantity), 0), COALESCE(SUM(wol.total_amount), 0)
    INTO v_wo_qty, v_wo_amount
  FROM public.work_orders wo
  LEFT JOIN public.work_order_lines wol ON wol.work_order_id = wo.id
  WHERE wo.master_budget_item_id = p_master_item_id
    AND wo.deleted_at IS NULL
    AND wo.wo_status IN ('issued', 'active', 'closed');

  -- Actual: certified material bills.
  SELECT COALESCE(SUM(vbl.quantity), 0), COALESCE(SUM(vbl.line_total), 0)
    INTO v_bill_qty, v_bill_amount
  FROM public.vendor_bills vb
  LEFT JOIN public.vendor_bill_lines vbl ON vbl.vendor_bill_id = vb.id
  WHERE vb.master_budget_item_id = p_master_item_id
    AND vb.deleted_at IS NULL
    AND vb.status IN ('verified'::erp_billing_status, 'approved'::erp_billing_status,
                      'paid'::erp_billing_status);

  -- Actual: certified service bills. Line-level where lines exist, header
  -- otherwise, so a header-only bill still contributes its value.
  SELECT
    COALESCE(SUM(sbl.quantity), 0),
    COALESCE(SUM(sbl.line_total), 0)
      + COALESCE(SUM(CASE WHEN sbl.id IS NULL THEN sb.total_amount ELSE 0 END), 0)
    INTO v_sb_qty, v_sb_amount
  FROM public.service_bills sb
  LEFT JOIN public.service_bill_lines sbl ON sbl.service_bill_id = sb.id
  WHERE sb.master_budget_item_id = p_master_item_id
    AND sb.deleted_at IS NULL
    AND sb.status IN ('verified', 'approved', 'paid');

  UPDATE public.budget_variance_items
  SET po_qty           = v_po_qty + v_wo_qty,
      po_amount        = v_po_amount + v_wo_amount,
      po_rate          = CASE WHEN (v_po_qty + v_wo_qty) > 0
                              THEN ROUND((v_po_amount + v_wo_amount) / (v_po_qty + v_wo_qty), 2)
                              ELSE 0 END,
      actual_bill_qty  = v_bill_qty + v_sb_qty,
      actual_bill_rate = CASE WHEN (v_bill_qty + v_sb_qty) > 0
                              THEN ROUND((v_bill_amount + v_sb_amount) / (v_bill_qty + v_sb_qty), 2)
                              ELSE 0 END,
      remark = CASE
        WHEN (v_bill_amount + v_sb_amount) > 0 THEN 'Auto-posted from certified bills'
        WHEN (v_po_amount + v_wo_amount) > 0   THEN 'Committed via purchase / work order'
        ELSE remark
      END
  WHERE master_budget_item_id = p_master_item_id;
  -- actual_total_cost / variances are recomputed by trg_compute_variance_item.
END $$;

-- Fire the shared rollup from the two document types that never drove it before.
DROP TRIGGER IF EXISTS trg_service_bill_variance_rollup ON public.service_bills;
CREATE TRIGGER trg_service_bill_variance_rollup
  AFTER INSERT OR UPDATE OF status, master_budget_item_id, total_amount OR DELETE
  ON public.service_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rollup_variance();

DROP TRIGGER IF EXISTS trg_wo_variance_rollup ON public.work_orders;
CREATE TRIGGER trg_wo_variance_rollup
  AFTER INSERT OR UPDATE OF wo_status, master_budget_item_id, total_amount OR DELETE
  ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rollup_variance();

-- ----------------------------------------------------------------------------
-- 11. RLS + REALTIME
-- ----------------------------------------------------------------------------

ALTER TABLE public.service_bill_lines ENABLE ROW LEVEL SECURITY;
-- Deliberately NOT "FORCE ROW LEVEL SECURITY": the SECURITY DEFINER posting
-- functions run as the table owner and must keep bypassing RLS.
REVOKE ALL ON public.service_bill_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_bill_lines TO authenticated;

DROP POLICY IF EXISTS service_bill_lines_select ON public.service_bill_lines;
CREATE POLICY service_bill_lines_select ON public.service_bill_lines
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_bill_lines_insert ON public.service_bill_lines;
CREATE POLICY service_bill_lines_insert ON public.service_bill_lines
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS service_bill_lines_update ON public.service_bill_lines;
CREATE POLICY service_bill_lines_update ON public.service_bill_lines
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_bill_lines_delete ON public.service_bill_lines;
CREATE POLICY service_bill_lines_delete ON public.service_bill_lines
  FOR DELETE TO authenticated
  -- A certified bill's lines are evidence, not working data.
  USING (NOT EXISTS (
    SELECT 1 FROM public.service_bills sb
    WHERE sb.id = service_bill_lines.service_bill_id
      AND sb.status IN ('approved', 'paid')
  ));

-- service_bills itself was created with permissive policies but never had anon
-- revoked.
REVOKE ALL ON public.service_bills FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_bills TO authenticated;

-- Hard delete is permitted ONLY for a bill that never became cost. Anything that
-- has posted to budget_ledger is financial history: it is retired via deleted_at
-- (which reverses its ledger rows) and never removed. This is also what lets the
-- client roll back a header whose line insert failed, instead of stranding a
-- zero-amount bill that reads like a legitimate nil claim.
DROP POLICY IF EXISTS service_bills_delete ON public.service_bills;
CREATE POLICY service_bills_delete
  ON public.service_bills FOR DELETE TO authenticated
  USING (
    status NOT IN ('approved', 'paid')
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_ledger bl
      WHERE bl.source_table = 'service_bills' AND bl.source_id = service_bills.id
    )
  );

-- Realtime registration is deliberately NOT done here — see the trailing block
-- after COMMIT. ALTER PUBLICATION contends with the realtime worker's own
-- replication slot, and it does not need to be atomic with the schema change.

-- ----------------------------------------------------------------------------
-- 12. RECONCILE
--     No-op on the current production dataset (service_bills is empty), correct
--     for any environment that carries rows.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  -- 12a. Derive net payable on rows that predate the commercial block.
  UPDATE public.service_bills
  SET net_payable_amount = GREATEST(0,
        COALESCE(total_amount, 0) - COALESCE(retention_amount, 0)
        - COALESCE(advance_adjusted, 0) - COALESCE(other_deductions, 0))
  WHERE net_payable_amount = 0 AND COALESCE(total_amount, 0) > 0;

  -- 12b. RA sequence + Work Order drawdown per Work Order.
  FOR r IN
    SELECT DISTINCT work_order_id FROM public.service_bills WHERE work_order_id IS NOT NULL
  LOOP
    PERFORM public.fn_resequence_service_bills(r.work_order_id);
    PERFORM public.fn_recompute_wo_billed_to_date(r.work_order_id);
  END LOOP;

  -- 12c. Post already-certified bills to the ledger.
  FOR r IN
    SELECT id FROM public.service_bills
    WHERE deleted_at IS NULL AND status IN ('approved', 'paid')
  LOOP
    PERFORM public.fn_post_service_bill_to_budget(r.id);
  END LOOP;

  -- 12d. Refresh the variance sheet for every line these documents touch.
  FOR r IN
    SELECT DISTINCT master_budget_item_id FROM (
      SELECT master_budget_item_id FROM public.service_bills WHERE master_budget_item_id IS NOT NULL
      UNION
      SELECT master_budget_item_id FROM public.work_orders   WHERE master_budget_item_id IS NOT NULL
    ) s
  LOOP
    PERFORM public.fn_rollup_variance_for_master_item(r.master_budget_item_id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 13. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_post_service_bill_to_budget(uuid)            FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resequence_service_bills(uuid)               FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_rollup_service_bill_from_lines(uuid)         FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recompute_service_bill_payment_status(uuid)  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resolve_service_bill_allocation(uuid)        FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_service_bill_allocation(uuid)     TO authenticated;

-- ----------------------------------------------------------------------------
-- 14. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_key      text;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['budget_allocation_id', 'master_budget_item_id',
                               'retention_amount', 'net_payable_amount',
                               'ra_sequence', 'cumulative_certified_amount',
                               'approved_by', 'deleted_at'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'service_bills' AND column_name = v_key
    ) THEN
      v_problems := array_append(v_problems, 'service_bills.' || v_key || ' missing');
    END IF;
  END LOOP;

  IF to_regclass('public.service_bill_lines') IS NULL THEN
    v_problems := array_append(v_problems, 'service_bill_lines missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'service_bill_id'
  ) THEN
    v_problems := array_append(v_problems, 'payments.service_bill_id missing');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments'
      AND column_name = 'vendor_bill_id' AND is_nullable = 'NO'
  ) THEN
    v_problems := array_append(v_problems, 'payments.vendor_bill_id is still NOT NULL');
  END IF;

  FOREACH v_key IN ARRAY ARRAY['trg_service_bill_budget_sync', 'trg_service_bill_qc_gate',
                               'trg_service_bill_wo_balance', 'trg_service_bill_net',
                               'trg_service_bill_line_rollup', 'trg_service_bill_variance_rollup',
                               'trg_wo_variance_rollup', 'trg_payment_service_bill_status'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = v_key) THEN
      v_problems := array_append(v_problems, 'trigger ' || v_key || ' missing');
    END IF;
  END LOOP;

  -- The QC gate must now cover INSERT, not just UPDATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_service_bill_qc_gate' AND (tgtype & 4) = 4
  ) THEN
    v_problems := array_append(v_problems, 'trg_service_bill_qc_gate does not fire on INSERT');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Service bill budget integration incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Phase 3 applied: service bills now post cost, hold retention, release Work Order commitment, feed variance, and can be paid.';
END $$;

COMMIT;

-- ============================================================================
-- REALTIME REGISTRATION — outside the main transaction, on purpose.
--
-- ALTER PUBLICATION takes locks that contend with the realtime worker's
-- replication slot, and it was the second-most-likely source of the deadlock
-- this migration originally hit. It is idempotent and independent of the schema
-- change, so running it separately means a contended publication cannot roll
-- back the whole migration. If it fails, re-run just this block.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['service_bill_lines', 'payments'] LOOP
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
