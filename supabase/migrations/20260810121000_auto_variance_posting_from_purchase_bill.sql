-- ============================================================================
-- APPROVED PURCHASE BILL -> VARIANCE SHEET, AUTOMATICALLY AND PER ACTIVITY
-- File: supabase/migrations/20260810121000_auto_variance_posting_from_purchase_bill.sql
--
-- WHAT EXISTED
-- ============
-- Booking a bill to the Variance Sheet was a manual act: someone opened the
-- bill drawer, chose variance rows by hand, and called
-- rpc_save_variance_reconciliation with bill_id / bill_source / bill_number.
-- budget_variance_bill_bookings recorded it and a UNIQUE (bill_id,
-- variance_item_id) stopped the same bill being booked to the same row twice.
--
-- Two consequences:
--   * a bill that nobody remembered to book never reached the sheet at all;
--   * the grain was the BILL, so a bill spanning three activities was booked
--     as one number against whichever row the operator picked.
--
-- WHAT THIS ADDS
-- ==============
-- Approval posts the bill by itself, line by line, on the two axes the bill
-- lines now carry (persisted by 20260810120000 — before that they were NULL,
-- so this could not have worked):
--
--     activity_name      -> budget_variance_items.category_name   (budget head)
--     sub_activity_name  -> budget_variance_items.sub_activity    (sub-category)
--
-- IDEMPOTENCE BY CONSTRUCTION
-- ===========================
-- Posting does not increment anything. It DELETES this bill's own automatic
-- bookings, re-derives them from the current lines, and then recomputes each
-- touched variance row as a fold over all its bookings. Re-approving,
-- re-saving, editing or reloading therefore converges on the same numbers
-- rather than doubling them. Un-approving or deleting the bill removes its
-- bookings and refolds — the sheet follows the document both ways.
--
-- This is also why bookings are not keyed on vendor_bill_lines.id:
-- save_purchase_bill deletes and reinserts every line on each save, so line ids
-- are not stable. The per-line detail is kept in source_lines instead, which
-- survives that churn.
--
-- WHAT IT REFUSES TO DO SILENTLY
-- ==============================
-- A line whose activity does not resolve to a variance row is NOT dropped. It
-- is written to variance_mapping_requests as a pending request carrying the
-- line snapshot, so unmapped spend is visible rather than absent. Unmapped
-- lines never block approval; a genuine fault still raises.
--
-- Additive and idempotent. No existing row is rewritten on apply.
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
  IF to_regclass('public.vendor_bills') IS NULL THEN
    v_missing := array_append(v_missing, 'vendor_bills'); END IF;
  IF to_regclass('public.vendor_bill_lines') IS NULL THEN
    v_missing := array_append(v_missing, 'vendor_bill_lines'); END IF;
  IF to_regclass('public.budget_variance_items') IS NULL THEN
    v_missing := array_append(v_missing, 'budget_variance_items'); END IF;
  IF to_regclass('public.budget_variance_bill_bookings') IS NULL THEN
    v_missing := array_append(v_missing,
      'budget_variance_bill_bookings (apply 20260805164000)'); END IF;

  -- The activity axis must be persisted, or every line would resolve to NULL.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendor_bill_lines'
      AND column_name = 'activity_name'
  ) THEN
    v_missing := array_append(v_missing,
      'vendor_bill_lines.activity_name (apply 20260808170000)');
  END IF;

  -- Without the compute trigger, actual_total_cost and every variance figure
  -- would stay at whatever was last written.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_compute_variance_item' AND NOT tgisinternal
  ) THEN
    v_missing := array_append(v_missing, 'trg_compute_variance_item not bound');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Automatic variance posting cannot apply. Missing: %',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. THE BOOKING ROW LEARNS WHICH LINES IT CAME FROM
--
--    One booking per (bill, variance item) — which keeps the existing UNIQUE
--    (bill_id, variance_item_id) valid and unchanged — carrying the per-line
--    breakdown that produced it.
-- ----------------------------------------------------------------------------

ALTER TABLE public.budget_variance_bill_bookings
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_line_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bvbb_booking_mode'
  ) THEN
    ALTER TABLE public.budget_variance_bill_bookings
      ADD CONSTRAINT ck_bvbb_booking_mode
      CHECK (booking_mode IN ('manual', 'auto'));
  END IF;
END $$;

COMMENT ON COLUMN public.budget_variance_bill_bookings.booking_mode IS
  'auto = posted by approving the bill; manual = booked by hand through the bill drawer. Posting only ever deletes and rewrites its OWN auto rows, so a hand booking is never destroyed by a re-approval.';
COMMENT ON COLUMN public.budget_variance_bill_bookings.source_lines IS
  'The bill lines that produced this booking: sr_no, description, item_code, activity, sub-activity, qty, rate, amount. Line ids are recorded but are not the key — save_purchase_bill reinserts every line on each save, so they are not stable.';

CREATE INDEX IF NOT EXISTS idx_variance_bookings_mode
  ON public.budget_variance_bill_bookings (bill_id, booking_mode);

-- ----------------------------------------------------------------------------
-- 2. RESOLVE ONE BILL LINE TO ITS VARIANCE ROW
--
--    Most precise link first. Name matching is case- and whitespace-insensitive
--    because activity_name is free text on the PO and travels by copy.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_resolve_variance_item_for_line(
  p_project_id        uuid,
  p_master_item_id    uuid,
  p_activity_name     text,
  p_sub_activity_name text
)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id       uuid;
  v_activity text := btrim(lower(coalesce(p_activity_name, '')));
  v_sub      text := btrim(lower(coalesce(p_sub_activity_name, '')));
BEGIN
  -- 1. The explicit master budget line, when the bill carries one.
  IF p_master_item_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.budget_variance_items
    WHERE project_id = p_project_id AND master_budget_item_id = p_master_item_id
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- 2. Both axes. This is the intended path: head AND sub-category.
  IF v_activity <> '' AND v_sub <> '' THEN
    SELECT id INTO v_id FROM public.budget_variance_items
    WHERE project_id = p_project_id
      AND btrim(lower(category_name)) = v_activity
      AND btrim(lower(sub_activity))  = v_sub
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  -- 3. Sub-activity alone, but only when it is unambiguous in the project.
  --    Sub-activity names are the more specific of the two, so a unique hit is
  --    trustworthy; a repeated one is not, and falls through rather than
  --    guessing which head the money belongs to.
  IF v_sub <> '' THEN
    SELECT id INTO v_id FROM public.budget_variance_items
    WHERE project_id = p_project_id AND btrim(lower(sub_activity)) = v_sub
    LIMIT 1;
    IF v_id IS NOT NULL AND (
      SELECT count(*) FROM public.budget_variance_items
      WHERE project_id = p_project_id AND btrim(lower(sub_activity)) = v_sub
    ) = 1 THEN
      RETURN v_id;
    END IF;
    v_id := NULL;
  END IF;

  -- 4. Activity alone, again only when unambiguous.
  IF v_activity <> '' THEN
    SELECT id INTO v_id FROM public.budget_variance_items
    WHERE project_id = p_project_id AND btrim(lower(category_name)) = v_activity
    LIMIT 1;
    IF v_id IS NOT NULL AND (
      SELECT count(*) FROM public.budget_variance_items
      WHERE project_id = p_project_id AND btrim(lower(category_name)) = v_activity
    ) = 1 THEN
      RETURN v_id;
    END IF;
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.fn_resolve_variance_item_for_line(uuid, uuid, text, text) IS
  'Maps one bill line to a variance row: master budget item, then activity+sub-activity, then either axis alone when unambiguous. Returns NULL rather than guessing — an unresolved line becomes a pending variance_mapping_request, never a silent misposting.';

-- ----------------------------------------------------------------------------
-- 3. REFOLD ONE VARIANCE ROW FROM ITS BOOKINGS
--
--    The actuals are a fold, not a running total. That is what makes repeated
--    posting safe: the answer depends only on the bookings that exist now.
--
--    Rows with no automatic booking are left completely alone, so a sheet that
--    is maintained by hand today keeps behaving as it does today.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_refold_variance_item_actuals(p_variance_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty    numeric;
  v_amount numeric;
  v_rate   numeric;
  v_autos  integer;
BEGIN
  SELECT count(*) FILTER (WHERE booking_mode = 'auto'),
         coalesce(sum(booked_qty), 0),
         coalesce(sum(booked_amount), 0)
    INTO v_autos, v_qty, v_amount
  FROM public.budget_variance_bill_bookings
  WHERE variance_item_id = p_variance_item_id;

  -- Never touch a row the automation has no stake in.
  IF coalesce(v_autos, 0) = 0 THEN
    RETURN;
  END IF;

  -- Weighted average, so qty x rate reconciles to the booked amount exactly
  -- instead of privileging whichever line happened to be booked last.
  v_rate := CASE WHEN v_qty > 0 THEN ROUND(v_amount / v_qty, 4) ELSE 0 END;

  UPDATE public.budget_variance_items
  SET actual_bill_qty  = GREATEST(coalesce(v_qty, 0), 0),
      actual_bill_rate = GREATEST(coalesce(v_rate, 0), 0),
      updated_at       = now()
  WHERE id = p_variance_item_id
    AND (actual_bill_qty  IS DISTINCT FROM GREATEST(coalesce(v_qty, 0), 0)
      OR actual_bill_rate IS DISTINCT FROM GREATEST(coalesce(v_rate, 0), 0));
  -- actual_total_cost, both variations, balance, cost_variance_* and
  -- work_status are all derived by trg_compute_variance_item.
END $$;

-- ----------------------------------------------------------------------------
-- 4. POST ONE PURCHASE BILL
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

  -- Refold everything this bill touched, before and after.
  FOREACH v_item IN ARRAY v_touched LOOP
    PERFORM public.fn_refold_variance_item_actuals(v_item);
  END LOOP;

  RETURN jsonb_build_object(
    'bill_id',         p_bill_id,
    'bill_number',     v_bill.bill_number,
    'posted',          v_certified,
    'variance_rows',   v_booked,
    'unmapped_lines',  v_unmapped,
    'booked_amount',   ROUND(v_amount, 2),
    'refolded_rows',   coalesce(array_length(v_touched, 1), 0)
  );
END $$;

COMMENT ON FUNCTION public.fn_post_vendor_bill_to_variance(uuid) IS
  'Posts an approved Purchase Bill to the Variance Sheet, one booking per resolved variance row, from activity_name -> category_name and sub_activity_name -> sub_activity. Replaces its own prior automatic bookings and refolds the actuals, so reload / edit / re-approval cannot double-count. Reverses itself when the bill leaves approved or is deleted.';

-- ----------------------------------------------------------------------------
-- 5. APPROVAL IS THE POSTING STEP
--
--    Same principle as fn_post_vendor_bill_to_budget: there is no second
--    booking action to forget. AFTER, so the bill row is already committed to
--    its new status when the lines are read.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_vendor_bill_variance_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  PERFORM public.fn_post_vendor_bill_to_variance(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vendor_bill_variance_post ON public.vendor_bills;
CREATE TRIGGER trg_vendor_bill_variance_post
  AFTER INSERT OR UPDATE OF status, deleted_at ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_vendor_bill_variance_post();

-- Editing the lines of a bill that is ALREADY approved must move the sheet with
-- them, or the variance silently describes a previous version of the document.
--
-- Statement-level with transition tables, deliberately. save_purchase_bill
-- deletes and reinserts every line on each save, so a FOR EACH ROW trigger would
-- re-post the whole bill once per line — forty full postings for a twenty-line
-- bill, all but the last of them thrown away. Per statement it is two.
CREATE OR REPLACE FUNCTION public.trg_fn_vbl_variance_repost_new()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_id uuid;
BEGIN
  FOR v_bill_id IN SELECT DISTINCT vendor_bill_id FROM new_lines LOOP
    IF EXISTS (
      SELECT 1 FROM public.vendor_bills
      WHERE id = v_bill_id AND deleted_at IS NULL
        AND status IN ('approved'::public.erp_billing_status,
                       'paid'::public.erp_billing_status)
    ) THEN
      PERFORM public.fn_post_vendor_bill_to_variance(v_bill_id);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_vbl_variance_repost_old()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_id uuid;
BEGIN
  FOR v_bill_id IN SELECT DISTINCT vendor_bill_id FROM old_lines LOOP
    IF EXISTS (
      SELECT 1 FROM public.vendor_bills
      WHERE id = v_bill_id AND deleted_at IS NULL
        AND status IN ('approved'::public.erp_billing_status,
                       'paid'::public.erp_billing_status)
    ) THEN
      PERFORM public.fn_post_vendor_bill_to_variance(v_bill_id);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- The row-level version from an earlier draft, removed if present.
DROP TRIGGER IF EXISTS trg_vendor_bill_line_variance_repost ON public.vendor_bill_lines;

DROP TRIGGER IF EXISTS trg_vbl_variance_repost_ins ON public.vendor_bill_lines;
CREATE TRIGGER trg_vbl_variance_repost_ins
  AFTER INSERT ON public.vendor_bill_lines
  REFERENCING NEW TABLE AS new_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_vbl_variance_repost_new();

DROP TRIGGER IF EXISTS trg_vbl_variance_repost_upd ON public.vendor_bill_lines;
CREATE TRIGGER trg_vbl_variance_repost_upd
  AFTER UPDATE ON public.vendor_bill_lines
  REFERENCING NEW TABLE AS new_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_vbl_variance_repost_new();

DROP TRIGGER IF EXISTS trg_vbl_variance_repost_del ON public.vendor_bill_lines;
CREATE TRIGGER trg_vbl_variance_repost_del
  AFTER DELETE ON public.vendor_bill_lines
  REFERENCING OLD TABLE AS old_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_vbl_variance_repost_old();

-- ----------------------------------------------------------------------------
-- 6. READ MODELS
-- ----------------------------------------------------------------------------

-- 6a. Manual repost / backfill, for bills approved before this migration.
CREATE OR REPLACE FUNCTION public.rpc_repost_bill_variance(p_bill_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM public.app_require_profile();
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'You do not have permission to post bills to the variance sheet.'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_post_vendor_bill_to_variance(p_bill_id);
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_repost_bill_variance(uuid) TO authenticated;

-- 6b. Where one bill landed, per activity, with its line breakdown.
CREATE OR REPLACE FUNCTION public.rpc_bill_variance_position(p_bill_id uuid)
RETURNS TABLE (
  variance_item_id  uuid,
  category_name     text,
  sub_activity      text,
  booked_qty        numeric,
  booked_rate       numeric,
  booked_amount     numeric,
  booking_mode      text,
  source_line_count integer,
  source_lines      jsonb,
  budget_cost       numeric,
  actual_total_cost numeric,
  cost_variance_amount numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT b.variance_item_id, b.category_name, b.sub_activity,
         b.booked_qty, b.booked_rate, b.booked_amount,
         b.booking_mode, b.source_line_count, b.source_lines,
         v.budget_cost, v.actual_total_cost, v.cost_variance_amount
  FROM public.budget_variance_bill_bookings b
  JOIN public.budget_variance_items v ON v.id = b.variance_item_id
  WHERE b.bill_id = p_bill_id
  ORDER BY b.category_name, b.sub_activity;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bill_variance_position(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. BACKFILL
--
--    Bills approved before today have never been posted. Post them now, so the
--    sheet does not start from an arbitrary date. Bills a human already booked
--    by hand keep those manual rows: posting only owns the 'auto' ones, and the
--    refold in step 3 counts both.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r         record;
  v_result  jsonb;
  v_bills   integer := 0;
  v_rows    integer := 0;
  v_unmapped integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.vendor_bills
    WHERE deleted_at IS NULL
      AND status IN ('approved'::public.erp_billing_status,
                     'paid'::public.erp_billing_status)
    ORDER BY bill_date, created_at
  LOOP
    v_result   := public.fn_post_vendor_bill_to_variance(r.id);
    v_bills    := v_bills + 1;
    v_rows     := v_rows + coalesce((v_result->>'variance_rows')::integer, 0);
    v_unmapped := v_unmapped + coalesce((v_result->>'unmapped_lines')::integer, 0);
  END LOOP;

  RAISE NOTICE 'Variance backfill: % approved bill(s), % variance row(s) booked, % unmapped line(s) raised as pending mapping requests.',
    v_bills, v_rows, v_unmapped;
END $$;

-- ----------------------------------------------------------------------------
-- 8. VERIFICATION
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'trg_vendor_bill_variance_post' AND NOT tgisinternal) THEN
    v_problems := array_append(v_problems, 'trg_vendor_bill_variance_post not bound');
  END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgname IN ('trg_vbl_variance_repost_ins',
                       'trg_vbl_variance_repost_upd',
                       'trg_vbl_variance_repost_del')
        AND NOT tgisinternal) <> 3 THEN
    v_problems := array_append(v_problems,
      'the three vendor_bill_lines variance repost triggers are not all bound');
  END IF;

  -- The duplicate guard the manual path relies on must still be in force.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND indexname = 'idx_variance_bookings_bill_item') THEN
    v_problems := array_append(v_problems, 'idx_variance_bookings_bill_item missing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_variance_bill_bookings'
      AND column_name = 'source_lines'
  ) THEN
    v_problems := array_append(v_problems, 'budget_variance_bill_bookings.source_lines missing');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Automatic variance posting verification failed: %',
      array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Approving a Purchase Bill now books it to the Variance Sheet per activity, idempotently, with per-line provenance.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
