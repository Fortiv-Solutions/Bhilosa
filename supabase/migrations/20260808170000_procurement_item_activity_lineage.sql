-- ============================================================================
-- PROCUREMENT ITEM & ACTIVITY LINEAGE — RFQ -> PO -> GRN -> PB
-- File: supabase/migrations/20260808170000_procurement_item_activity_lineage.sql
--
-- THE PROBLEM
-- ===========
-- rfq_lines is the reference shape. It carries the two axes SEPARATELY:
--
--     WHAT was bought   item_code · item_description · specification
--                       · preferred_brand · item_group · unit
--     WHY it was bought activity_name · sub_activity_name · activity_code
--
-- Downstream, the two axes were conflated and then progressively lost:
--
--   purchase_order_lines      has both axes as columns, but the writers filled
--                             activity_name FROM item_group (see the frontend
--                             fixes shipped alongside this migration).
--   goods_receipt_note_lines  has NO specification, NO activity_name, NO
--                             sub_activity_name. The "why" dies at receipt.
--   vendor_bill_lines         has NO item_code, NO specification, NO activity,
--                             NO sub_activity. So a certified bill cannot say
--                             which budget activity it belongs to, and
--                             fn_post_vendor_bill_to_budget had to fall back to
--                             one header-level allocation for the whole bill.
--
-- That last consequence is the important one: the budget sheet is organised by
-- activity and sub-activity, so a bill that cannot name them cannot land in the
-- right row. Adding the columns is what makes per-activity posting possible.
--
-- ALSO HERE
-- =========
-- Credit / debit notes on a Purchase Bill. The bill total is the certified
-- value; credits (shortfall, rate correction, quality debit) adjusted it only
-- inside someone's head. Both are stored per line and rolled to the header, so
-- the net payable is derived rather than typed.
--
-- Idempotent and non-destructive: additive columns only, no data is rewritten.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.rfq_lines') IS NULL THEN
    v_missing := array_append(v_missing, 'rfq_lines'); END IF;
  IF to_regclass('public.purchase_order_lines') IS NULL THEN
    v_missing := array_append(v_missing, 'purchase_order_lines'); END IF;
  IF to_regclass('public.goods_receipt_note_lines') IS NULL THEN
    v_missing := array_append(v_missing, 'goods_receipt_note_lines'); END IF;
  IF to_regclass('public.vendor_bill_lines') IS NULL THEN
    v_missing := array_append(v_missing, 'vendor_bill_lines'); END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Procurement lineage cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. GRN — carry the identity and the reason through receipt
--
--    A GRN line already knows item_code, item_group and item_brand. What it
--    could not record is WHAT SPECIFICATION was accepted (the Colour WO shows
--    three lines differing only by the material named in the sub-text, at
--    Rs 11.50 / 18.25 / 21.25 — specification IS the price) and WHICH ACTIVITY
--    the receipt belongs to.
-- ----------------------------------------------------------------------------

ALTER TABLE public.goods_receipt_note_lines
  ADD COLUMN IF NOT EXISTS item_specification text,
  ADD COLUMN IF NOT EXISTS activity_name      text,
  ADD COLUMN IF NOT EXISTS sub_activity_name  text;

COMMENT ON COLUMN public.goods_receipt_note_lines.item_specification IS
  'Specification as ordered, carried from purchase_order_lines.item_specification. Specification distinguishes otherwise identical descriptions at different rates, so a receipt without it cannot be matched to the right PO line.';
COMMENT ON COLUMN public.goods_receipt_note_lines.activity_name IS
  'Budget activity, carried from the PO line. Distinct from item_group: item_group says WHAT was bought, activity_name says WHY.';

-- ----------------------------------------------------------------------------
-- 2. PURCHASE BILL — the axes the budget sheet needs
-- ----------------------------------------------------------------------------

ALTER TABLE public.vendor_bill_lines
  ADD COLUMN IF NOT EXISTS item_code          text,
  ADD COLUMN IF NOT EXISTS item_specification text,
  ADD COLUMN IF NOT EXISTS item_description   text,
  ADD COLUMN IF NOT EXISTS unit_rate          numeric,
  ADD COLUMN IF NOT EXISTS activity_name      text,
  ADD COLUMN IF NOT EXISTS sub_activity_name  text,
  ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id);

COMMENT ON COLUMN public.vendor_bill_lines.activity_name IS
  'Budget activity for THIS line. fn_post_vendor_bill_to_budget resolves the allocation per line from this, so a bill spanning several activities lands on several budget rows instead of one.';
COMMENT ON COLUMN public.vendor_bill_lines.item_description IS
  'Mirror of description. The writers were split between the two names and description is NOT NULL, so an insert that used the wrong one failed outright.';

-- 2b. Credit / debit notes.
ALTER TABLE public.vendor_bill_lines
  ADD COLUMN IF NOT EXISTS credit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debit_amount  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_debit_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vbl_credit_debit_non_negative') THEN
    ALTER TABLE public.vendor_bill_lines
      ADD CONSTRAINT ck_vbl_credit_debit_non_negative
      CHECK (credit_amount >= 0 AND debit_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.vendor_bill_lines.credit_amount IS
  'Amount credited back to the vendor on this line (short supply, rate correction). Reduces the certified value.';
COMMENT ON COLUMN public.vendor_bill_lines.debit_amount IS
  'Amount debited to the vendor on this line (quality debit, delay, damage). Reduces the certified value.';

ALTER TABLE public.vendor_bills
  ADD COLUMN IF NOT EXISTS credit_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debit_total  numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_vbl_activity
  ON public.vendor_bill_lines (project_id, activity_name)
  WHERE activity_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_vbl_master_budget_item
  ON public.vendor_bill_lines (master_budget_item_id)
  WHERE master_budget_item_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. ROLL CREDIT / DEBIT TO THE HEADER
--
--    Derived, never typed — the same reason retention became a contract field
--    rather than a per-bill entry.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_rollup_vendor_bill_credit_debit(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_credit numeric;
  v_debit  numeric;
BEGIN
  SELECT COALESCE(SUM(credit_amount), 0), COALESCE(SUM(debit_amount), 0)
    INTO v_credit, v_debit
  FROM public.vendor_bill_lines WHERE vendor_bill_id = p_bill_id;

  UPDATE public.vendor_bills
  SET credit_total = v_credit,
      debit_total  = v_debit,
      updated_at   = now()
  WHERE id = p_bill_id
    AND (credit_total IS DISTINCT FROM v_credit OR debit_total IS DISTINCT FROM v_debit);
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_vbl_credit_debit_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_rollup_vendor_bill_credit_debit(
    COALESCE(NEW.vendor_bill_id, OLD.vendor_bill_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_vbl_credit_debit_rollup ON public.vendor_bill_lines;
CREATE TRIGGER trg_vbl_credit_debit_rollup
  AFTER INSERT OR UPDATE OF credit_amount, debit_amount OR DELETE
  ON public.vendor_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_vbl_credit_debit_rollup();

-- ----------------------------------------------------------------------------
-- 4. POST THE BILL TO BUDGET PER ACTIVITY, NOT PER BILL
--
--    fn_post_vendor_bill_to_budget resolved ONE allocation from the bill header
--    and posted the whole certified value against it. A bill covering three
--    activities landed entirely on one budget row, so the sheet — which is
--    organised by activity and sub-activity — could never be right.
--
--    Now each line resolves its own allocation and the value is posted grouped
--    by allocation. Lines that cannot resolve fall back to the header, so no
--    value is ever dropped: SUM(posted) always equals the certified total.
--
--    The trigger that fires this is unchanged and still gated on
--    status IN ('approved','paid') — approving the Purchase Bill IS the posting
--    step. There is no second booking action.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_vendor_bill_to_budget(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill          public.vendor_bills;
  v_header_alloc  uuid;
  v_gross         numeric;
  v_retention     numeric;
  v_line_total    numeric;
  v_residual      numeric;
  r               record;
  v_category_id   uuid;
  v_posted        numeric := 0;
BEGIN
  SELECT * INTO v_bill FROM public.vendor_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL OR v_bill.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Cost is recognised at certification (approved), not at payment.
  IF v_bill.status NOT IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN;
  END IF;

  -- GROSS certified value. Retention/advance are payment-side and must not
  -- reduce recorded cost. Credits and debits DO reduce it: they are corrections
  -- to what was certified, not deferrals of payment.
  v_gross     := COALESCE(v_bill.total_amount, 0)
                 - COALESCE(v_bill.credit_total, 0)
                 - COALESCE(v_bill.debit_total, 0);
  v_retention := COALESCE(v_bill.retention_amount, 0);

  IF v_gross <= 0 THEN
    RETURN;
  END IF;

  v_header_alloc := public.fn_resolve_budget_allocation(
    v_bill.project_id, v_bill.budget_allocation_id, v_bill.master_budget_item_id
  );

  -- Value that carries an identifiable allocation, line by line.
  SELECT COALESCE(SUM(l.line_total), 0) INTO v_line_total
  FROM public.vendor_bill_lines l WHERE l.vendor_bill_id = p_bill_id;

  IF v_line_total > 0 THEN
    FOR r IN
      SELECT COALESCE(
               public.fn_resolve_budget_allocation(
                 v_bill.project_id, NULL, l.master_budget_item_id),
               v_header_alloc) AS allocation_id,
             SUM(l.line_total) AS amount,
             MIN(l.activity_name) AS activity_name,
             MIN(l.sub_activity_name) AS sub_activity_name
      FROM public.vendor_bill_lines l
      WHERE l.vendor_bill_id = p_bill_id
      GROUP BY 1
    LOOP
      CONTINUE WHEN r.allocation_id IS NULL OR COALESCE(r.amount, 0) <= 0;

      SELECT category_id INTO v_category_id
      FROM public.budget_allocations WHERE id = r.allocation_id;

      -- Prorate the gross (net of credit/debit) across the lines so the posted
      -- total reconciles to the certified value exactly.
      INSERT INTO public.budget_ledger (
        project_id, budget_allocation_id, category_id, transaction_type,
        source_table, source_id, amount,
        gross_amount, retention_amount, tax_amount, net_payable_amount,
        description, posted_at, document_date, document_no, financial_year,
        vendor_id, activity_id, master_budget_item_id, revision_seq
      ) VALUES (
        v_bill.project_id, r.allocation_id, v_category_id, 'actual'::erp_budget_txn_type,
        'vendor_bills', v_bill.id,
        ROUND(v_gross * (r.amount / v_line_total), 2),
        ROUND(v_gross * (r.amount / v_line_total), 2),
        ROUND(v_retention * (r.amount / v_line_total), 2),
        ROUND(COALESCE(v_bill.tax_amount, 0) * (r.amount / v_line_total), 2),
        ROUND(COALESCE(v_bill.net_payable_amount, 0) * (r.amount / v_line_total), 2),
        'Vendor bill certified: ' || COALESCE(v_bill.bill_number, v_bill.id::text)
          || COALESCE(' — ' || r.activity_name, '')
          || COALESCE(' / ' || r.sub_activity_name, ''),
        now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
        v_bill.vendor_id, v_bill.activity_id, v_bill.master_budget_item_id,
        public.fn_next_ledger_revision_seq(
          'vendor_bills', v_bill.id, 'actual'::erp_budget_txn_type)
      );

      v_posted := v_posted + ROUND(v_gross * (r.amount / v_line_total), 2);
    END LOOP;
  END IF;

  -- Nothing resolved (a bill with no lines, or no allocation anywhere): fall
  -- back to the old header-level posting so value is never silently dropped.
  v_residual := ROUND(v_gross - v_posted, 2);
  IF v_posted = 0 AND v_header_alloc IS NOT NULL THEN
    SELECT category_id INTO v_category_id
    FROM public.budget_allocations WHERE id = v_header_alloc;

    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount,
      gross_amount, retention_amount, tax_amount, net_payable_amount,
      description, posted_at, document_date, document_no, financial_year,
      vendor_id, activity_id, master_budget_item_id, revision_seq
    ) VALUES (
      v_bill.project_id, v_header_alloc, v_category_id, 'actual'::erp_budget_txn_type,
      'vendor_bills', v_bill.id, v_gross,
      v_gross, v_retention, COALESCE(v_bill.tax_amount, 0),
      COALESCE(v_bill.net_payable_amount, 0),
      'Vendor bill certified: ' || COALESCE(v_bill.bill_number, v_bill.id::text),
      now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
      v_bill.vendor_id, v_bill.activity_id, v_bill.master_budget_item_id,
      public.fn_next_ledger_revision_seq(
        'vendor_bills', v_bill.id, 'actual'::erp_budget_txn_type)
    );

  ELSIF v_posted > 0 AND ABS(v_residual) >= 0.01 AND v_header_alloc IS NOT NULL THEN
    -- Rounding crumbs from the proration. Posted so the ledger reconciles.
    SELECT category_id INTO v_category_id
    FROM public.budget_allocations WHERE id = v_header_alloc;

    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, gross_amount,
      description, posted_at, document_date, document_no, financial_year,
      vendor_id, master_budget_item_id, revision_seq
    ) VALUES (
      v_bill.project_id, v_header_alloc, v_category_id, 'actual'::erp_budget_txn_type,
      'vendor_bills', v_bill.id, v_residual, v_residual,
      'Rounding adjustment: ' || COALESCE(v_bill.bill_number, v_bill.id::text),
      now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
      v_bill.vendor_id, v_bill.master_budget_item_id,
      public.fn_next_ledger_revision_seq(
        'vendor_bills', v_bill.id, 'actual'::erp_budget_txn_type)
    );
  END IF;

  -- Retention is a payment-side hold on the bill as a whole.
  IF v_retention > 0 AND v_header_alloc IS NOT NULL THEN
    SELECT category_id INTO v_category_id
    FROM public.budget_allocations WHERE id = v_header_alloc;

    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, gross_amount, retention_amount,
      description, posted_at, document_date, document_no, financial_year,
      vendor_id, master_budget_item_id, revision_seq
    ) VALUES (
      v_bill.project_id, v_header_alloc, v_category_id,
      'retention_held'::erp_budget_txn_type,
      'vendor_bills', v_bill.id, v_retention, v_retention, v_retention,
      'Retention held: ' || COALESCE(v_bill.bill_number, v_bill.id::text),
      now(), v_bill.bill_date, v_bill.bill_number, public.fn_budget_current_fy(),
      v_bill.vendor_id, v_bill.master_budget_item_id,
      public.fn_next_ledger_revision_seq(
        'vendor_bills', v_bill.id, 'retention_held'::erp_budget_txn_type)
    );
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_post_vendor_bill_to_budget(uuid) IS
  'Posts a certified Purchase Bill to the budget ledger, one row per resolved allocation so a multi-activity bill lands on several budget rows. Approving the bill IS the posting step; there is no separate booking action. Credits and debits reduce recognised cost; retention does not.';

-- ----------------------------------------------------------------------------
-- 5. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_col record;
BEGIN
  FOR v_col IN
    SELECT * FROM (VALUES
      ('goods_receipt_note_lines', 'item_specification'),
      ('goods_receipt_note_lines', 'activity_name'),
      ('goods_receipt_note_lines', 'sub_activity_name'),
      ('vendor_bill_lines',        'item_code'),
      ('vendor_bill_lines',        'item_specification'),
      ('vendor_bill_lines',        'activity_name'),
      ('vendor_bill_lines',        'sub_activity_name'),
      ('vendor_bill_lines',        'credit_amount'),
      ('vendor_bill_lines',        'debit_amount'),
      ('vendor_bills',             'credit_total'),
      ('vendor_bills',             'debit_total')
    ) AS t(tbl, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_col.tbl AND column_name = v_col.col
    ) THEN
      v_problems := array_append(v_problems, v_col.tbl || '.' || v_col.col);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_vbl_credit_debit_rollup' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_vbl_credit_debit_rollup not bound');
  END IF;

  -- The posting trigger must still be bound: approval IS the posting step.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_bill_budget_actual' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_bill_budget_actual not bound');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Procurement lineage verification failed: %',
      array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Procurement lineage applied: GRN and PB carry specification and activity; credit/debit roll to the header; bills post per activity.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
