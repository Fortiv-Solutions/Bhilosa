-- ============================================================================
-- AUTOMATIC VARIANCE POSTING MUST RAISE A BUDGET MOVEMENT DOCUMENT
-- File: supabase/migrations/20260810122000_variance_posting_raises_budget_movement.sql
--
-- THE GAP
-- =======
-- 20260810121000 made an approved Purchase Bill post itself to the Variance
-- Sheet. It writes budget_variance_bill_bookings and refolds
-- budget_variance_items.actual_bill_qty / actual_bill_rate — and the Variance
-- Analysis tab moves correctly.
--
-- The Budget Changes tab does not, because it reads something else entirely:
--
--     budget-movements-tab.tsx -> listBudgetMovements()
--                              -> budget_movement_register
--                              -> budget_revisions (+ budget_revision_items)
--
-- The view carries no scope filter, so it shows every revision — there simply
-- was no revision to show. The MANUAL path has always created one
-- (rpc_save_variance_reconciliation inserts a budget_revisions row with
-- scope = 'variance_reconciliation'), which is why a hand-booked bill appears
-- in the register and an auto-posted one did not.
--
-- So the automation was invisible in the one register that exists to answer
-- "who moved money, and why".
--
-- WHAT THIS ADDS
-- ==============
-- Posting now also raises a movement document:
--
--     scope         = 'variance_reconciliation'   (as the manual path does)
--     movement_type = 'restatement'               -- "System correction to
--                                                    posted actuals. Never
--                                                    changes the baseline."
--                                                 exactly what this is, and it
--                                                 distinguishes an auto-posted
--                                                 actual from a hand revision
--                                                 in the register.
--     status        = 'approved'                  -- the bill was already
--                                                    certified; this records a
--                                                    fact, it does not propose
--                                                    one.
--
-- with one budget_revision_items row per variance row the bill moved, carrying
-- the before and after qty, rate and cost.
--
-- STILL IDEMPOTENT
-- ================
-- The revision is replaced exactly as the bookings are. source_bill_id makes
-- "this bill's restatement" addressable, so re-approving replaces one document
-- rather than stacking a new one on every save. A posting that changes no
-- figure raises no document at all, so a no-op repost does not litter the
-- register.
--
-- Additive: one nullable column, and a function body replacement.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '180s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.budget_revisions') IS NULL THEN
    v_missing := array_append(v_missing, 'budget_revisions'); END IF;
  IF to_regclass('public.budget_revision_items') IS NULL THEN
    v_missing := array_append(v_missing, 'budget_revision_items'); END IF;
  IF to_regclass('public.budget_movement_register') IS NULL THEN
    v_missing := array_append(v_missing,
      'budget_movement_register (apply 20260805100600)'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_post_vendor_bill_to_variance'
  ) THEN
    v_missing := array_append(v_missing,
      'fn_post_vendor_bill_to_variance (apply 20260810121000)');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Variance movement documents cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. A REVISION LEARNS WHICH BILL RESTATED IT
--
--    Without this the only handle on "the restatement this bill already raised"
--    would be a parsed document_number, which breaks the moment a bill number
--    is corrected. ON DELETE SET NULL: the movement register is an audit trail
--    and must outlive the document that caused an entry.
-- ----------------------------------------------------------------------------

ALTER TABLE public.budget_revisions
  ADD COLUMN IF NOT EXISTS source_bill_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budget_revisions_source_bill_id_fkey'
  ) THEN
    ALTER TABLE public.budget_revisions
      ADD CONSTRAINT budget_revisions_source_bill_id_fkey
      FOREIGN KEY (source_bill_id) REFERENCES public.vendor_bills(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_budget_revisions_source_bill
  ON public.budget_revisions (source_bill_id) WHERE source_bill_id IS NOT NULL;

COMMENT ON COLUMN public.budget_revisions.source_bill_id IS
  'The Purchase Bill whose approval raised this restatement. The idempotency handle for automatic variance posting: re-approving replaces this document instead of stacking another.';

-- ----------------------------------------------------------------------------
-- 2. POSTING, NOW RAISING THE MOVEMENT DOCUMENT
--
--    Same contract as before — replace own bookings, refold, reverse on
--    un-approval — with the before/after snapshot captured around the refold so
--    the register can show what actually moved.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_post_vendor_bill_to_variance(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill      public.vendor_bills;
  v_certified boolean;
  r           record;
  v_touched   uuid[] := ARRAY[]::uuid[];
  v_item      uuid;
  v_booked    integer := 0;
  v_unmapped  integer := 0;
  v_amount    numeric := 0;
  v_actor     text;
  v_before    jsonb  := '{}'::jsonb;
  v_revision  uuid;
  v_version   integer;
  v_old_total numeric := 0;
  v_new_total numeric := 0;
  v_lines     integer := 0;
BEGIN
  SELECT * INTO v_bill FROM public.vendor_bills WHERE id = p_bill_id;
  IF v_bill.id IS NULL THEN
    RETURN jsonb_build_object('bill_id', p_bill_id, 'posted', false,
                              'reason', 'bill not found');
  END IF;

  v_certified := v_bill.deleted_at IS NULL
                 AND v_bill.status IN ('approved'::public.erp_billing_status,
                                       'paid'::public.erp_billing_status);

  -- fn_assert_budget_unlocked is deliberately NOT called. That lock guards
  -- someone EDITING the budget; this is the system recording spend that has
  -- already been certified. Asserting it here would make a locked budget block
  -- bill approval outright.

  -- Every variance row this bill currently touches must be refolded whether we
  -- are posting or reversing, so collect them BEFORE the delete.
  SELECT coalesce(array_agg(DISTINCT variance_item_id), ARRAY[]::uuid[])
    INTO v_touched
  FROM public.budget_variance_bill_bookings
  WHERE bill_id = p_bill_id AND booking_mode = 'auto';

  -- Replace, never accumulate. This single statement is what makes reload,
  -- edit and re-approval produce one set of bookings rather than three.
  DELETE FROM public.budget_variance_bill_bookings
  WHERE bill_id = p_bill_id AND booking_mode = 'auto';

  -- Withdraw any pending auto-raised mapping requests too; they are re-derived
  -- below and would otherwise pile up one per approval.
  DELETE FROM public.variance_mapping_requests
  WHERE bill_id = p_bill_id
    AND status = 'pending'
    AND coalesce(snapshot_data->>'raised_by', '') = 'auto_variance_posting';

  -- And this bill's previous restatement. budget_revision_items has no cascade
  -- on revision_id, so its rows go first.
  DELETE FROM public.budget_revision_items
  WHERE revision_id IN (
    SELECT id FROM public.budget_revisions
    WHERE source_bill_id = p_bill_id AND movement_type = 'restatement'
  );
  DELETE FROM public.budget_revisions
  WHERE source_bill_id = p_bill_id AND movement_type = 'restatement';

  IF v_certified THEN
    SELECT coalesce(p.name, p.email) INTO v_actor
    FROM public.profiles p WHERE p.id = public.app_current_profile_id();

    FOR r IN
      SELECT
        public.fn_resolve_variance_item_for_line(
          v_bill.project_id, l.master_budget_item_id,
          coalesce(l.activity_name, l.purchase_category),
          l.sub_activity_name
        ) AS variance_item_id,
        -- Ex-tax value of the goods, net of any credit or debit note. The
        -- variance sheet compares against budget_cost = budget_qty x
        -- budget_rate, which is ex-tax; booking net_amount would have shown a
        -- permanent overrun of the whole GST charge on every row.
        sum(GREATEST(
          coalesce(NULLIF(l.gross_amount, 0), l.quantity * l.rate)
            - coalesce(l.credit_amount, 0) - coalesce(l.debit_amount, 0), 0)) AS amount,
        -- Falls back to 1 for a quantity-less line (a lump-sum charge). Holding
        -- the amount matters more than the quantity here: cost variance is the
        -- headline figure, and a zero quantity would make the weighted rate
        -- below undefined and lose the money entirely.
        sum(GREATEST(coalesce(NULLIF(l.quantity, 0), NULLIF(l.received_qty, 0), 1), 0)) AS qty,
        jsonb_agg(jsonb_build_object(
          'vendor_bill_line_id', l.id,
          'sr_no',               l.sr_no,
          'description',         l.description,
          'item_code',           l.item_code,
          'activity_name',       coalesce(l.activity_name, l.purchase_category),
          'sub_activity_name',   l.sub_activity_name,
          'quantity',            l.quantity,
          'rate',                l.rate,
          'gross_amount',        l.gross_amount,
          'credit_amount',       l.credit_amount,
          'debit_amount',        l.debit_amount
        ) ORDER BY l.sr_no NULLS LAST, l.id) AS lines_detail,
        count(*)                            AS line_count,
        min(coalesce(l.activity_name, l.purchase_category)) AS activity_name,
        min(l.sub_activity_name)            AS sub_activity_name,
        min(l.master_budget_item_id::text)::uuid AS master_budget_item_id
      FROM public.vendor_bill_lines l
      WHERE l.vendor_bill_id = p_bill_id
      GROUP BY 1
    LOOP
      IF r.variance_item_id IS NULL THEN
        -- Visible, not discarded. snapshot_data carries the full line detail so
        -- the mapping can be completed without reopening the bill.
        v_unmapped := v_unmapped + r.line_count;

        INSERT INTO public.variance_mapping_requests (
          project_id, bill_source, bill_id, status, submitted_by,
          remarks, snapshot_data
        ) VALUES (
          v_bill.project_id, 'material', p_bill_id, 'pending', auth.uid(),
          format('%s line(s) on bill %s could not be matched to a variance row.',
                 r.line_count, coalesce(v_bill.bill_number, p_bill_id::text)),
          jsonb_build_object(
            'raised_by',         'auto_variance_posting',
            'bill_number',       v_bill.bill_number,
            'activity_name',     r.activity_name,
            'sub_activity_name', r.sub_activity_name,
            'amount',            r.amount,
            'quantity',          r.qty,
            'lines',             r.lines_detail
          )
        );
        CONTINUE;
      END IF;

      INSERT INTO public.budget_variance_bill_bookings (
        project_id, bill_source, bill_id, bill_number,
        variance_item_id, master_budget_item_id,
        category_name, sub_activity,
        booked_qty, booked_rate, booked_amount,
        booked_by_name, remark, booking_mode, source_lines, source_line_count
      )
      SELECT
        v_bill.project_id, 'material', p_bill_id, v_bill.bill_number,
        r.variance_item_id, coalesce(r.master_budget_item_id, bvi.master_budget_item_id),
        bvi.category_name, bvi.sub_activity,
        GREATEST(r.qty, 0),
        CASE WHEN r.qty > 0 THEN ROUND(r.amount / r.qty, 4) ELSE 0 END,
        GREATEST(r.amount, 0),
        coalesce(v_actor, 'System'),
        format('Auto-posted on approval of %s (%s line(s))',
               coalesce(v_bill.bill_number, p_bill_id::text), r.line_count),
        'auto', r.lines_detail, r.line_count
      FROM public.budget_variance_items bvi
      WHERE bvi.id = r.variance_item_id;

      v_booked := v_booked + 1;
      v_amount := v_amount + GREATEST(r.amount, 0);

      IF NOT (r.variance_item_id = ANY (v_touched)) THEN
        v_touched := array_append(v_touched, r.variance_item_id);
      END IF;
    END LOOP;
  END IF;

  -- The state of every touched row BEFORE the refold. Captured here because the
  -- refold is the only thing that changes them, and the register needs the
  -- delta rather than just the destination.
  SELECT coalesce(jsonb_object_agg(id::text, jsonb_build_object(
           'qty',  actual_bill_qty,
           'rate', actual_bill_rate,
           'cost', actual_total_cost)), '{}'::jsonb)
    INTO v_before
  FROM public.budget_variance_items
  WHERE id = ANY (v_touched);

  FOREACH v_item IN ARRAY v_touched LOOP
    PERFORM public.fn_refold_variance_item_actuals(v_item);
  END LOOP;

  -- ---- The movement document -------------------------------------------
  -- Only for rows that actually moved. A repost that changes nothing raises no
  -- document, so the register stays a record of change rather than of activity.
  SELECT count(*),
         coalesce(sum((v_before->(v.id::text)->>'cost')::numeric), 0),
         coalesce(sum(v.actual_total_cost), 0)
    INTO v_lines, v_old_total, v_new_total
  FROM public.budget_variance_items v
  WHERE v.id = ANY (v_touched)
    AND v.actual_total_cost IS DISTINCT FROM (v_before->(v.id::text)->>'cost')::numeric;

  IF coalesce(v_lines, 0) > 0 THEN
    SELECT coalesce(MAX(version_number), 0) + 1 INTO v_version
    FROM public.budget_revisions
    WHERE project_id = v_bill.project_id AND scope = 'variance_reconciliation';

    INSERT INTO public.budget_revisions (
      project_id, version_number, version_label, justification_reason,
      old_total_cost, new_total_cost, net_diff_amount,
      edited_by, edited_by_name, status, scope, movement_type,
      document_number, effective_date, approval_tier,
      approved_by, approved_at, applied_at, source_bill_id
    ) VALUES (
      v_bill.project_id, v_version,
      format('Variance restatement v%s', v_version),
      format('Purchase Bill %s certified — actuals restated on %s budget row(s) from its line activities.',
             coalesce(v_bill.bill_number, p_bill_id::text), v_lines),
      ROUND(v_old_total, 2), ROUND(v_new_total, 2),
      ROUND(v_new_total - v_old_total, 2),
      public.app_current_profile_id(), coalesce(v_actor, 'System'),
      'approved', 'variance_reconciliation', 'restatement',
      'PB-VAR/' || coalesce(v_bill.bill_number, p_bill_id::text),
      v_bill.bill_date, 'management',
      public.app_current_profile_id(), now(), now(), p_bill_id
    )
    RETURNING id INTO v_revision;

    INSERT INTO public.budget_revision_items (
      revision_id, master_budget_item_id, sub_activity, category_name,
      old_qty, new_qty, old_rate, new_rate, old_cost, new_cost,
      change_kind, category_id, unit, sr_no
    )
    SELECT
      v_revision, v.master_budget_item_id,
      coalesce(NULLIF(btrim(v.sub_activity), ''), 'Unnamed'),
      coalesce(NULLIF(btrim(v.category_name), ''), 'Uncategorised'),
      coalesce((v_before->(v.id::text)->>'qty')::numeric, 0),  v.actual_bill_qty,
      coalesce((v_before->(v.id::text)->>'rate')::numeric, 0), v.actual_bill_rate,
      coalesce((v_before->(v.id::text)->>'cost')::numeric, 0), v.actual_total_cost,
      'amend', v.category_id, v.unit, v.sr_no
    FROM public.budget_variance_items v
    WHERE v.id = ANY (v_touched)
      AND v.actual_total_cost IS DISTINCT FROM (v_before->(v.id::text)->>'cost')::numeric;
  END IF;

  RETURN jsonb_build_object(
    'bill_id',         p_bill_id,
    'bill_number',     v_bill.bill_number,
    'posted',          v_certified,
    'variance_rows',   v_booked,
    'unmapped_lines',  v_unmapped,
    'booked_amount',   ROUND(v_amount, 2),
    'refolded_rows',   coalesce(array_length(v_touched, 1), 0),
    'revision_id',     v_revision,
    'movement_lines',  coalesce(v_lines, 0),
    'net_diff_amount', ROUND(coalesce(v_new_total, 0) - coalesce(v_old_total, 0), 2)
  );
END $$;

COMMENT ON FUNCTION public.fn_post_vendor_bill_to_variance(uuid) IS
  'Posts an approved Purchase Bill to the Variance Sheet, one booking per resolved variance row, and raises a restatement movement document so the change appears in the Budget Changes register. Replaces its own bookings AND its own revision, so reload / edit / re-approval cannot double-count or stack documents. A posting that moves no figure raises no document.';

-- ----------------------------------------------------------------------------
-- 3. REBUILD THE MOVEMENT DOCUMENTS FOR BILLS ALREADY POSTED
--
--    20260810121000 posted every approved bill but raised no document. Re-run
--    them so the register is not silently missing everything before today.
--    Posting is idempotent, so this cannot double-book the sheet.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r        record;
  v_result jsonb;
  v_bills  integer := 0;
  v_docs   integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.vendor_bills
    WHERE deleted_at IS NULL
      AND status IN ('approved'::public.erp_billing_status,
                     'paid'::public.erp_billing_status)
    ORDER BY bill_date, created_at
  LOOP
    v_result := public.fn_post_vendor_bill_to_variance(r.id);
    v_bills  := v_bills + 1;
    IF v_result->>'revision_id' IS NOT NULL THEN
      v_docs := v_docs + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Movement backfill: % approved bill(s) reposted, % restatement document(s) raised.',
    v_bills, v_docs;
END $$;

-- ----------------------------------------------------------------------------
-- 4. VERIFICATION
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
  v_src text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_revisions'
      AND column_name = 'source_bill_id'
  ) THEN
    v_problems := array_append(v_problems, 'budget_revisions.source_bill_id missing');
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_post_vendor_bill_to_variance';

  IF v_src IS NULL OR position('budget_revisions' IN v_src) = 0 THEN
    v_problems := array_append(v_problems,
      'fn_post_vendor_bill_to_variance does not raise a movement document');
  END IF;

  -- The register must still be readable, and must not have been filtered.
  IF to_regclass('public.budget_movement_register') IS NULL THEN
    v_problems := array_append(v_problems, 'budget_movement_register missing');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Variance movement document verification failed: %',
      array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Approving a Purchase Bill now appears in Budget Changes as a Restatement, with one line per budget row it moved.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
