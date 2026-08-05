-- ============================================================================
-- BUDGET LEDGER — GROSS-CERTIFIED BASIS + LEDGER-DERIVED ALLOCATION COUNTERS
-- File: supabase/migrations/20260805100100_budget_ledger_gross_basis_and_derived_counters.sql
--
-- Phase 1 of the Budget / Work Order / Service Bill rework.
--
-- Depends on 20260805100000_budget_ledger_txn_types.sql (new enum labels).
--
-- WHAT THIS CHANGES AND WHY
-- =========================
--
-- 1. BUDGET "SPENT" BECOMES GROSS CERTIFIED VALUE.
--    fn_auto_post_bill_to_budget posted `net_payable_amount` — the bill total
--    after retention, advance recovery and other deductions. Retention is a
--    withholding of PAYMENT, not a reduction of COST: the work is certified and
--    the cost is incurred. Posting net understated cost-to-date by the retention
--    percentage on every project, permanently.
--
--    The module already contradicted itself here, which is what makes this a bug
--    rather than a policy choice:
--        budget_allocations.spent_amount   <- net_payable  (posting trigger)
--        budget_variance_items.actual_*    <- gross line totals (variance rollup)
--    Two different "actuals" for the same bill, in the same module. This aligns
--    both on gross.
--
--    Retention now posts its own 'retention_held' row, so the withheld balance is
--    a tracked liability instead of a silent deduction from cost.
--
--    NOTE ON SCOPE: budget_ledger is empty in production (0 rows) and no
--    allocation carries any committed/spent movement, so this is a change of
--    basis going forward, NOT a restatement of posted history. The reversal
--    machinery below is still built, because it is required for future
--    corrections and it is what makes item 4 possible.
--
-- 2. ALLOCATION COUNTERS BECOME DERIVED, NOT ACCUMULATED.
--    committed_amount / spent_amount / retention_held / advance_amount were
--    incremented in-place by the posting triggers AND separately rebuilt by a
--    backfill query — two sources of truth that had already drifted once. They
--    are now recomputed from budget_ledger on every ledger write. The ledger
--    becomes the single source of truth and drift becomes structurally
--    impossible.
--
--    This also removes a latent double-count: the old PO trigger guarded its
--    increment with `IF FOUND` after an `INSERT ... ON CONFLICT DO NOTHING`,
--    and FOUND is not a reliable signal that the insert actually happened.
--
-- 3. SIGNED AMOUNTS + REVERSAL LINKAGE.
--    `CHECK (amount >= 0)` made credit notes, debit notes, retention release and
--    mis-posting corrections unrepresentable. A correction had to be an UPDATE of
--    posted history. Amounts are now signed and a correction is a reversal row
--    that points at what it reverses, so history stays append-only.
--
-- 4. revision_seq — ONE COLUMN, TWO STRUCTURAL FIXES.
--    uq_budget_ledger_source_txn allowed exactly one row per
--    (source_table, source_id, transaction_type). That blocked BOTH:
--      a) reverse-and-repost (the repost collides with the row it replaces), and
--      b) a Work Order variation posting a second commitment against the same WO.
--    Adding revision_seq to the key solves both.
--
-- 5. POST-APPROVAL EDITS NOW RE-POST.
--    Editing retention/advance/deductions on an approved bill recomputed
--    net_payable_amount, but the posting trigger fired only on `UPDATE OF status`
--    and was ON CONFLICT DO NOTHING — so budget_ledger silently diverged from the
--    bill it claimed to represent, with no reconciliation path. Amount edits on a
--    posted bill now reverse and re-post.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. LOCK DISCIPLINE
--
--     Take every table lock this migration needs immediately, in one statement,
--     in a fixed (alphabetical) order. A long DDL transaction that grabs tables
--     one at a time as it progresses will eventually deadlock against Supabase's
--     own background readers: every ALTER TABLE fires PostgREST's DDL watch,
--     which reloads the schema cache by reading across user tables, and that
--     reader may hold table B while waiting for table A that we already hold.
--
--     Acquiring everything up front leaves no window for that interleaving.
--     lock_timeout makes a genuinely contended run fail in seconds with a clear
--     message rather than hanging or deadlocking half-way through.
-- ----------------------------------------------------------------------------

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

LOCK TABLE public.budget_allocations,
           public.budget_ledger,
           public.projects,
           public.vendor_bills
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA — budget_ledger gains correction linkage, a commercial breakdown,
--    and the cost dimensions it could not previously be sliced by.
-- ----------------------------------------------------------------------------

ALTER TABLE public.budget_ledger
  -- Correction / reversal machinery
  ADD COLUMN IF NOT EXISTS revision_seq       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reverses_ledger_id uuid REFERENCES public.budget_ledger(id),
  ADD COLUMN IF NOT EXISTS reversal_reason    text,

  -- Commercial breakdown, snapshotted at posting time so the ledger row remains
  -- self-explanatory even if the source document is later amended.
  ADD COLUMN IF NOT EXISTS gross_amount       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_amount   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable_amount numeric NOT NULL DEFAULT 0,

  -- Cost dimensions
  ADD COLUMN IF NOT EXISTS vendor_id             uuid REFERENCES public.vendors(id),
  ADD COLUMN IF NOT EXISTS activity_id           uuid REFERENCES public.construction_activities(id),
  ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id),
  ADD COLUMN IF NOT EXISTS source_line_id        uuid,

  -- Document identity. document_date is ECONOMIC time (when the cost was
  -- incurred); posted_at stays SYSTEM time. Reporting groups by document_date
  -- where it exists so a correction posted today lands in the month it belongs
  -- to, not the month we fixed it.
  ADD COLUMN IF NOT EXISTS document_no   text,
  ADD COLUMN IF NOT EXISTS document_date date;

COMMENT ON COLUMN public.budget_ledger.revision_seq IS
  'Correction generation for (source_table, source_id, transaction_type). 0 = original posting; a reversal and its replacement each take the next value. Part of the uniqueness key, so one document can post the same transaction type more than once (corrections, and Work Order variations).';
COMMENT ON COLUMN public.budget_ledger.amount IS
  'Signed. Positive = consumes budget; negative = a reversal of a prior posting. For transaction_type = actual this is the GROSS CERTIFIED value, not net of retention.';
COMMENT ON COLUMN public.budget_ledger.gross_amount IS
  'Commercial breakdown snapshot at posting time. amount = gross_amount for actual postings; the remaining columns explain how net_payable_amount was derived.';

-- 1b. Drop the non-negative constraint on amount. Looked up by definition rather
--     than by name, because the constraint was created inline and its generated
--     name is not guaranteed across environments.
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'budget_ledger'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%amount%>=%0%'
  LOOP
    EXECUTE format('ALTER TABLE public.budget_ledger DROP CONSTRAINT %I', v_conname);
    RAISE NOTICE 'Dropped non-negative amount constraint % on budget_ledger.', v_conname;
  END LOOP;
END $$;

-- 1c. A reversal must actually reverse something, and must not reverse itself.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_ledger_reversal_self_chk') THEN
    ALTER TABLE public.budget_ledger
      ADD CONSTRAINT budget_ledger_reversal_self_chk
      CHECK (reverses_ledger_id IS NULL OR reverses_ledger_id <> id);
  END IF;
END $$;

-- 1d. Uniqueness now includes revision_seq (see header item 4).
DROP INDEX IF EXISTS public.uq_budget_ledger_source_txn;
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_ledger_source_txn
  ON public.budget_ledger (source_table, source_id, transaction_type, revision_seq)
  WHERE source_id IS NOT NULL;

-- 1e. Read paths for the reversal walk and the new dimensions.
CREATE INDEX IF NOT EXISTS idx_budget_ledger_reverses
  ON public.budget_ledger (reverses_ledger_id) WHERE reverses_ledger_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_ledger_source_doc
  ON public.budget_ledger (source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_budget_ledger_master_item
  ON public.budget_ledger (master_budget_item_id) WHERE master_budget_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_ledger_document_date
  ON public.budget_ledger (project_id, document_date DESC NULLS LAST);

-- ----------------------------------------------------------------------------
-- 2. LEDGER PRIMITIVES
-- ----------------------------------------------------------------------------

-- 2a. Next correction generation for a document + transaction type.
CREATE OR REPLACE FUNCTION public.fn_next_ledger_revision_seq(
  p_source_table text,
  p_source_id    uuid,
  p_txn_type     public.erp_budget_txn_type
)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(revision_seq), -1) + 1
  FROM public.budget_ledger
  WHERE source_table = p_source_table
    AND source_id = p_source_id
    AND transaction_type = p_txn_type;
$$;

-- 2b. The rows for a document that are currently in force: original postings
--     that nothing has reversed. This is what a re-post must neutralise.
CREATE OR REPLACE FUNCTION public.fn_effective_ledger_rows(
  p_source_table text,
  p_source_id    uuid
)
RETURNS SETOF public.budget_ledger LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bl.*
  FROM public.budget_ledger bl
  WHERE bl.source_table = p_source_table
    AND bl.source_id = p_source_id
    AND bl.reverses_ledger_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.budget_ledger r WHERE r.reverses_ledger_id = bl.id
    );
$$;

-- 2c. Write the negative mirror of a posting. History stays append-only; the
--     original row is never edited.
CREATE OR REPLACE FUNCTION public.fn_reverse_ledger_entry(
  p_ledger_id uuid,
  p_reason    text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src public.budget_ledger;
  v_new uuid;
BEGIN
  SELECT * INTO v_src FROM public.budget_ledger WHERE id = p_ledger_id;
  IF v_src.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Already reversed: nothing to do.
  IF EXISTS (SELECT 1 FROM public.budget_ledger WHERE reverses_ledger_id = v_src.id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, source_line_id, amount, description,
    -- Economic time is preserved: a reversal belongs to the period of the
    -- posting it corrects, not to the period in which we corrected it.
    posted_at, document_date, document_no, financial_year,
    gross_amount, retention_amount, tax_amount, net_payable_amount,
    vendor_id, activity_id, master_budget_item_id,
    revision_seq, reverses_ledger_id, reversal_reason
  ) VALUES (
    v_src.project_id, v_src.budget_allocation_id, v_src.category_id, v_src.transaction_type,
    v_src.source_table, v_src.source_id, v_src.source_line_id, -v_src.amount,
    'Reversal of: ' || COALESCE(v_src.description, v_src.id::text),
    v_src.posted_at, v_src.document_date, v_src.document_no, v_src.financial_year,
    -v_src.gross_amount, -v_src.retention_amount, -v_src.tax_amount, -v_src.net_payable_amount,
    v_src.vendor_id, v_src.activity_id, v_src.master_budget_item_id,
    public.fn_next_ledger_revision_seq(v_src.source_table, v_src.source_id, v_src.transaction_type),
    v_src.id,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Correction')
  )
  RETURNING id INTO v_new;

  RETURN v_new;
END $$;

-- ----------------------------------------------------------------------------
-- 3. ALLOCATION COUNTERS DERIVED FROM THE LEDGER
--    Replaces in-place accumulation. Signed amounts mean reversals net out
--    naturally — no special-casing.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_recompute_allocation_from_ledger(p_allocation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_allocation_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.budget_allocations ba
  SET committed_amount = GREATEST(0, COALESCE(agg.committed, 0) - COALESCE(agg.released, 0)),
      spent_amount     = GREATEST(0, COALESCE(agg.actual, 0)),
      retention_held   = GREATEST(0, COALESCE(agg.ret_held, 0) - COALESCE(agg.ret_released, 0)),
      advance_amount   = GREATEST(0, COALESCE(agg.adv_paid, 0) - COALESCE(agg.adv_recovered, 0)),
      updated_at       = now()
  FROM (
    SELECT
      SUM(amount) FILTER (WHERE transaction_type = 'commitment'::public.erp_budget_txn_type)         AS committed,
      SUM(amount) FILTER (WHERE transaction_type = 'release'::public.erp_budget_txn_type)            AS released,
      SUM(amount) FILTER (WHERE transaction_type = 'actual'::public.erp_budget_txn_type)             AS actual,
      SUM(amount) FILTER (WHERE transaction_type = 'retention_held'::public.erp_budget_txn_type)     AS ret_held,
      SUM(amount) FILTER (WHERE transaction_type = 'retention_released'::public.erp_budget_txn_type) AS ret_released,
      SUM(amount) FILTER (WHERE transaction_type = 'advance_paid'::public.erp_budget_txn_type)       AS adv_paid,
      SUM(amount) FILTER (WHERE transaction_type = 'advance_recovered'::public.erp_budget_txn_type)  AS adv_recovered
    FROM public.budget_ledger
    WHERE budget_allocation_id = p_allocation_id
  ) agg
  WHERE ba.id = p_allocation_id;
END $$;

COMMENT ON FUNCTION public.fn_recompute_allocation_from_ledger(uuid) IS
  'Rebuilds budget_allocations counters from budget_ledger. The ledger is the single source of truth; these columns are a cache of it.';

CREATE OR REPLACE FUNCTION public.trg_fn_ledger_recompute_allocation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.budget_allocation_id IS NOT NULL THEN
    PERFORM public.fn_recompute_allocation_from_ledger(OLD.budget_allocation_id);
  END IF;

  -- On UPDATE where the allocation did not move, the OLD branch above already
  -- rebuilt the right row — recomputing again would be pure waste.
  IF TG_OP <> 'DELETE' AND NEW.budget_allocation_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.budget_allocation_id IS DISTINCT FROM OLD.budget_allocation_id) THEN
    PERFORM public.fn_recompute_allocation_from_ledger(NEW.budget_allocation_id);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_recompute_allocation ON public.budget_ledger;
CREATE TRIGGER trg_ledger_recompute_allocation
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_ledger
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_ledger_recompute_allocation();

-- ----------------------------------------------------------------------------
-- 4. PO COMMITMENT — unchanged semantics, counters no longer touched by hand.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_auto_commit_po_to_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation_id uuid;
  v_amount        numeric;
  v_category_id   uuid;
BEGIN
  IF NEW.status <> 'approved'::erp_po_status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved'::erp_po_status THEN
    RETURN NEW;  -- already handled
  END IF;

  v_amount := COALESCE(NEW.total_amount, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_allocation_id := public.fn_resolve_budget_allocation(
    NEW.project_id, NEW.budget_allocation_id, NEW.master_budget_item_id
  );
  IF v_allocation_id IS NULL THEN
    RETURN NEW;  -- unbudgeted PO: nothing to post against
  END IF;

  SELECT category_id INTO v_category_id FROM public.budget_allocations WHERE id = v_allocation_id;

  -- Counters are derived by trg_ledger_recompute_allocation, so this trigger
  -- only writes the journal. The old `IF FOUND THEN UPDATE ... + v_amount`
  -- block is deliberately gone: FOUND is unreliable after ON CONFLICT DO
  -- NOTHING, which made a double-count possible.
  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount, gross_amount, description,
    posted_at, document_date, document_no, financial_year,
    vendor_id, master_budget_item_id, revision_seq
  ) VALUES (
    NEW.project_id, v_allocation_id, v_category_id, 'commitment'::erp_budget_txn_type,
    'purchase_orders', NEW.id, v_amount, v_amount,
    'PO approved: ' || COALESCE(NEW.po_number, NEW.id::text),
    now(), COALESCE(NEW.po_date, CURRENT_DATE), NEW.po_number,
    public.fn_budget_current_fy(),
    NEW.vendor_id, NEW.master_budget_item_id,
    public.fn_next_ledger_revision_seq('purchase_orders', NEW.id, 'commitment'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 5. VENDOR BILL POSTING — GROSS BASIS
--    Extracted from the trigger so both the status transition and the amount-
--    edit re-post path share one implementation.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_vendor_bill_to_budget(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill          public.vendor_bills;
  v_allocation_id uuid;
  v_category_id   uuid;
  v_gross         numeric;
  v_retention     numeric;
  v_committed     numeric;
  v_released      numeric;
  v_release_now   numeric;
BEGIN
  SELECT * INTO v_bill FROM public.vendor_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL OR v_bill.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Cost is recognised at certification (approved), not at payment.
  IF v_bill.status NOT IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN;
  END IF;

  -- GROSS certified value. Retention/advance/deductions are payment-side and
  -- must not reduce recorded cost. The old NULLIF(net_payable_amount, 0)
  -- fallback also made the basis inconsistent: a fully-withheld bill fell
  -- through to total_amount and posted gross while every other bill posted net.
  v_gross     := COALESCE(v_bill.total_amount, 0);
  v_retention := COALESCE(v_bill.retention_amount, 0);

  IF v_gross <= 0 THEN
    RETURN;
  END IF;

  v_allocation_id := public.fn_resolve_budget_allocation(
    v_bill.project_id, v_bill.budget_allocation_id, v_bill.master_budget_item_id
  );
  IF v_allocation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT category_id INTO v_category_id FROM public.budget_allocations WHERE id = v_allocation_id;

  -- 5a. Cost.
  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount,
    gross_amount, retention_amount, tax_amount, net_payable_amount,
    description, posted_at, document_date, document_no, financial_year,
    vendor_id, activity_id, master_budget_item_id, revision_seq
  ) VALUES (
    v_bill.project_id, v_allocation_id, v_category_id, 'actual'::erp_budget_txn_type,
    'vendor_bills', v_bill.id, v_gross,
    v_gross, v_retention, COALESCE(v_bill.tax_amount, 0), COALESCE(v_bill.net_payable_amount, 0),
    'Vendor bill certified: ' || COALESCE(v_bill.bill_number, v_bill.id::text),
    now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
    v_bill.vendor_id, v_bill.activity_id, v_bill.master_budget_item_id,
    public.fn_next_ledger_revision_seq('vendor_bills', v_bill.id, 'actual'::erp_budget_txn_type)
  )
  ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;

  -- 5b. Retention as a tracked liability, not a silent deduction from cost.
  IF v_retention > 0 THEN
    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, retention_amount,
      description, posted_at, document_date, document_no, financial_year,
      vendor_id, master_budget_item_id, revision_seq
    ) VALUES (
      v_bill.project_id, v_allocation_id, v_category_id, 'retention_held'::erp_budget_txn_type,
      'vendor_bills', v_bill.id, v_retention, v_retention,
      'Retention withheld on bill ' || COALESCE(v_bill.bill_number, v_bill.id::text),
      now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
      v_bill.vendor_id, v_bill.master_budget_item_id,
      public.fn_next_ledger_revision_seq('vendor_bills', v_bill.id, 'retention_held'::erp_budget_txn_type)
    )
    ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;
  END IF;

  -- 5c. Relieve the PO commitment, capped at what that PO still has outstanding.
  --     Now measured on the gross basis so commitment and actual are comparable.
  IF v_bill.purchase_order_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_committed
    FROM public.budget_ledger
    WHERE source_table = 'purchase_orders'
      AND source_id = v_bill.purchase_order_id
      AND transaction_type = 'commitment'::erp_budget_txn_type;

    SELECT COALESCE(SUM(bl.amount), 0) INTO v_released
    FROM public.budget_ledger bl
    JOIN public.vendor_bills vb ON vb.id = bl.source_id
    WHERE bl.source_table = 'vendor_bills'
      AND bl.transaction_type = 'release'::erp_budget_txn_type
      AND vb.purchase_order_id = v_bill.purchase_order_id;

    v_release_now := LEAST(v_gross, GREATEST(0, v_committed - v_released));

    IF v_release_now > 0 THEN
      INSERT INTO public.budget_ledger (
        project_id, budget_allocation_id, category_id, transaction_type,
        source_table, source_id, amount, gross_amount,
        description, posted_at, document_date, document_no, financial_year,
        vendor_id, master_budget_item_id, revision_seq
      ) VALUES (
        v_bill.project_id, v_allocation_id, v_category_id, 'release'::erp_budget_txn_type,
        'vendor_bills', v_bill.id, v_release_now, v_release_now,
        'Commitment released against bill ' || COALESCE(v_bill.bill_number, v_bill.id::text),
        now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
        v_bill.vendor_id, v_bill.master_budget_item_id,
        public.fn_next_ledger_revision_seq('vendor_bills', v_bill.id, 'release'::erp_budget_txn_type)
      )
      ON CONFLICT (source_table, source_id, transaction_type, revision_seq) DO NOTHING;
    END IF;
  END IF;
END $$;

-- 5d. Status transition into approved/paid -> post.
CREATE OR REPLACE FUNCTION public.fn_auto_post_bill_to_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN NEW;  -- already posted
  END IF;

  PERFORM public.fn_post_vendor_bill_to_budget(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bill_budget_actual ON public.vendor_bills;
CREATE TRIGGER trg_bill_budget_actual
  AFTER INSERT OR UPDATE OF status ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_post_bill_to_budget();

-- 5e. Amount edits on an ALREADY-POSTED bill reverse and re-post.
--     This is the fix for the silent-drift defect: the Bill-Wise Ledger tab
--     writes retention/advance/deductions straight to vendor_bills, which
--     recomputed net_payable_amount while budget_ledger kept the stale figure
--     forever.
CREATE OR REPLACE FUNCTION public.fn_repost_bill_to_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.budget_ledger;
  v_any boolean := false;
BEGIN
  IF NEW.status NOT IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN NEW;  -- not posted yet; the status trigger will handle it
  END IF;

  IF NEW.total_amount        IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.retention_amount   IS NOT DISTINCT FROM OLD.retention_amount
     AND NEW.tax_amount         IS NOT DISTINCT FROM OLD.tax_amount
     AND NEW.net_payable_amount IS NOT DISTINCT FROM OLD.net_payable_amount THEN
    RETURN NEW;
  END IF;

  FOR v_row IN SELECT * FROM public.fn_effective_ledger_rows('vendor_bills', NEW.id) LOOP
    PERFORM public.fn_reverse_ledger_entry(
      v_row.id,
      'Bill amended after certification (bill ' || COALESCE(NEW.bill_number, NEW.id::text) || ')'
    );
    v_any := true;
  END LOOP;

  IF v_any THEN
    PERFORM public.fn_post_vendor_bill_to_budget(NEW.id);
  END IF;

  RETURN NEW;
END $$;

-- The column list must name every field the UI can write, NOT just the fields
-- whose values ultimately change. `UPDATE OF col` fires on the columns named in
-- the UPDATE STATEMENT — a value rewritten by the BEFORE trigger
-- (fn_compute_vendor_bill_net recomputing net_payable_amount) does not by itself
-- arm an AFTER trigger. The Bill-Wise Ledger tab writes retention_percent,
-- retention_amount, advance_adjusted and other_deductions, so all of them are
-- listed here; omitting any one would silently reintroduce the drift this fixes.
DROP TRIGGER IF EXISTS trg_bill_budget_repost ON public.vendor_bills;
CREATE TRIGGER trg_bill_budget_repost
  AFTER UPDATE OF subtotal_amount, total_amount, tax_amount,
                  retention_percent, retention_amount,
                  advance_adjusted, other_deductions, net_payable_amount
  ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_repost_bill_to_budget();

-- ----------------------------------------------------------------------------
-- 6. RETENTION HANDLING ON THE BILL ITSELF
--    The old guard was `IF retention_percent > 0 AND retention_amount = 0`,
--    which meant (a) changing the percentage never recomputed the amount, and
--    (b) retention could not be deliberately zeroed while a percentage was set.
--    Recompute whenever the percentage or the base changes; respect an explicit
--    override when only the amount was touched.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_compute_vendor_bill_net()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.retention_percent, 0) > 0 AND COALESCE(NEW.retention_amount, 0) = 0 THEN
      NEW.retention_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * NEW.retention_percent / 100.0, 2);
    END IF;
  ELSE
    -- Percentage or base moved, and the amount was not itself overridden in this
    -- same statement -> re-derive.
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

  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 7. REPORTING — cost vs cash were collapsed into one curve.
--    budget_monthly_cashflow_view read transaction_type = 'actual', which was
--    net_payable: neither cost (gross) nor cash (payments). Now that 'actual' is
--    gross, the view reports a true COST curve, grouped on economic time.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.budget_monthly_cashflow_view CASCADE;
CREATE VIEW public.budget_monthly_cashflow_view AS
SELECT
  bl.project_id,
  date_trunc('month', COALESCE(bl.document_date::timestamptz, bl.posted_at))::date AS month_start,
  SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'actual'::erp_budget_txn_type)     AS actual_amount,
  SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'commitment'::erp_budget_txn_type) AS committed_amount,
  -- COALESCE each side: a month with no retention rows at all would otherwise
  -- yield NULL - NULL = NULL rather than 0.
  COALESCE(SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'retention_held'::erp_budget_txn_type), 0)
    - COALESCE(SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'retention_released'::erp_budget_txn_type), 0)
                                                                                        AS retention_movement,
  COUNT(*) FILTER (WHERE bl.transaction_type = 'actual'::erp_budget_txn_type)           AS actual_txn_count
FROM public.budget_ledger bl
GROUP BY bl.project_id, date_trunc('month', COALESCE(bl.document_date::timestamptz, bl.posted_at));

COMMENT ON VIEW public.budget_monthly_cashflow_view IS
  'Monthly COST curve from budget_ledger, on the gross-certified basis and grouped by economic date (document_date, falling back to posted_at). Cash actually disbursed lives in public.payments, not here.';

REVOKE ALL ON public.budget_monthly_cashflow_view FROM anon;
GRANT SELECT ON public.budget_monthly_cashflow_view TO authenticated;
ALTER VIEW public.budget_monthly_cashflow_view SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 8. RECONCILE — rebuild every allocation counter from the ledger.
--    A no-op on the current production dataset (budget_ledger is empty and no
--    allocation carries movement), but it is what makes the migration safe to
--    re-run and safe to apply to an environment that does have rows.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.budget_allocations WHERE deleted_at IS NULL LOOP
    PERFORM public.fn_recompute_allocation_from_ledger(r.id);
  END LOOP;
END $$;

UPDATE public.projects p
SET actual_spend_amount = COALESCE(s.spent_amount, 0)
FROM public.portfolio_budget_summary s
WHERE s.project_id = p.id
  AND p.actual_spend_amount IS DISTINCT FROM COALESCE(s.spent_amount, 0);

-- ----------------------------------------------------------------------------
-- 9. GRANTS
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.fn_reverse_ledger_entry(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_post_vendor_bill_to_budget(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recompute_allocation_from_ledger(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_next_ledger_revision_seq(text, uuid, public.erp_budget_txn_type) FROM anon;
REVOKE ALL ON FUNCTION public.fn_effective_ledger_rows(text, uuid) FROM anon;

-- ----------------------------------------------------------------------------
-- 10. VERIFICATION — fail loudly rather than leave the module half-migrated.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_ledger' AND column_name = 'revision_seq'
  ) THEN
    v_problems := array_append(v_problems, 'budget_ledger.revision_seq missing');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'budget_ledger' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%amount%>=%0%'
  ) THEN
    v_problems := array_append(v_problems, 'budget_ledger still has a non-negative amount CHECK');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_budget_ledger_source_txn'
      AND indexdef ILIKE '%revision_seq%'
  ) THEN
    v_problems := array_append(v_problems, 'uq_budget_ledger_source_txn does not include revision_seq');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ledger_recompute_allocation'
  ) THEN
    v_problems := array_append(v_problems, 'trg_ledger_recompute_allocation missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bill_budget_repost'
  ) THEN
    v_problems := array_append(v_problems, 'trg_bill_budget_repost missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'erp_budget_txn_type' AND e.enumlabel = 'retention_held'
  ) THEN
    v_problems := array_append(v_problems,
      'erp_budget_txn_type is missing retention_held — apply 20260805100000_budget_ledger_txn_types.sql first');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Budget ledger Phase 1 migration incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Budget ledger Phase 1 applied: gross-certified basis, derived counters, reversal machinery.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
