-- =====================================================================
-- Migration: 20260805164000_variance_bill_bookings_table.sql
-- Purpose:
--   1. Create budget_variance_bill_bookings table to track which bills
--      have been booked to which variance line items (duplicate prevention).
--   2. Update rpc_save_variance_reconciliation to also record the booking
--      and return the booked bill source info.
--   3. Provide rpc_get_bill_variance_bookings(bill_id) to check booking status.
-- =====================================================================

-- ① Booking Ledger Table: tracks every bill-to-variance posting
CREATE TABLE IF NOT EXISTS public.budget_variance_bill_bookings (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bill_source            text        NOT NULL CHECK (bill_source IN ('material', 'service')),
  bill_id                uuid        NOT NULL,
  bill_number            text,
  variance_item_id       uuid        NOT NULL REFERENCES public.budget_variance_items(id) ON DELETE CASCADE,
  master_budget_item_id  uuid        REFERENCES public.master_budget_items(id) ON DELETE SET NULL,
  category_name          text,
  sub_activity           text,
  booked_qty             numeric     NOT NULL DEFAULT 0,
  booked_rate            numeric     NOT NULL DEFAULT 0,
  booked_amount          numeric     NOT NULL DEFAULT 0,
  booked_by_name         text,
  booked_at              timestamptz NOT NULL DEFAULT now(),
  revision_id            uuid        REFERENCES public.budget_revisions(id) ON DELETE SET NULL,
  remark                 text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: same bill cannot be booked to the same variance item twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_variance_bookings_bill_item
  ON public.budget_variance_bill_bookings (bill_id, variance_item_id);

-- Fast lookup: all bookings for a given bill
CREATE INDEX IF NOT EXISTS idx_variance_bookings_bill
  ON public.budget_variance_bill_bookings (bill_id);

-- Fast lookup: all bookings for a given variance item
CREATE INDEX IF NOT EXISTS idx_variance_bookings_variance_item
  ON public.budget_variance_bill_bookings (variance_item_id);

-- RLS
ALTER TABLE public.budget_variance_bill_bookings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'budget_variance_bill_bookings_auth_all' AND tablename = 'budget_variance_bill_bookings') THEN
    CREATE POLICY budget_variance_bill_bookings_auth_all ON public.budget_variance_bill_bookings
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ② RPC: Check if a specific bill has already been booked to variance
CREATE OR REPLACE FUNCTION public.rpc_get_bill_variance_bookings(
  p_bill_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                  bvb.id,
      'bill_source',         bvb.bill_source,
      'bill_number',         bvb.bill_number,
      'variance_item_id',    bvb.variance_item_id,
      'category_name',       bvb.category_name,
      'sub_activity',        bvb.sub_activity,
      'booked_qty',          bvb.booked_qty,
      'booked_rate',         bvb.booked_rate,
      'booked_amount',       bvb.booked_amount,
      'booked_by_name',      bvb.booked_by_name,
      'booked_at',           bvb.booked_at,
      'remark',              bvb.remark
    ) ORDER BY bvb.booked_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM public.budget_variance_bill_bookings bvb
  WHERE bvb.bill_id = p_bill_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_bill_variance_bookings(uuid) TO authenticated;


-- ③ Updated rpc_save_variance_reconciliation: now accepts bill source info
--    for booking tracking and duplicate prevention
CREATE OR REPLACE FUNCTION public.rpc_save_variance_reconciliation(
  p_project_id     uuid,
  p_justification  text,
  p_edited_by_name text,
  p_items          jsonb
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item     jsonb;
  v_old      public.budget_variance_items;
  v_qty      numeric;
  v_rate     numeric;
  v_cost     numeric;
  v_version  integer;
  v_revision public.budget_revisions;
  v_changed  integer := 0;
  v_net      numeric := 0;
  v_bill_id  uuid;
  v_bill_src text;
  v_bill_num text;
  v_booked_qty    numeric;
  v_booked_amount numeric;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No variance rows supplied.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_assert_budget_unlocked(p_project_id);

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM public.budget_revisions
  WHERE project_id = p_project_id AND scope = 'variance_reconciliation';

  INSERT INTO public.budget_revisions (
    project_id, version_number, version_label, justification_reason,
    old_total_cost, new_total_cost, net_diff_amount,
    edited_by_name, status, scope, approved_at
  ) VALUES (
    p_project_id, v_version, format('Recon Revision v%s', v_version),
    COALESCE(NULLIF(btrim(p_justification), ''), 'Variance reconciliation update'),
    0, 0, 0,
    COALESCE(NULLIF(btrim(p_edited_by_name), ''), 'Pramukh ERP User'),
    'approved', 'variance_reconciliation', now()
  )
  RETURNING * INTO v_revision;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_old FROM public.budget_variance_items
    WHERE (id = (v_item->>'id')::uuid OR master_budget_item_id = (v_item->>'id')::uuid)
      AND project_id = p_project_id
    LIMIT 1;

    CONTINUE WHEN v_old.id IS NULL;

    -- Extract bill tracking fields (optional — only present when booking from bill drawer)
    v_bill_id  := (v_item->>'bill_id')::uuid;
    v_bill_src := v_item->>'bill_source';
    v_bill_num := v_item->>'bill_number';

    -- Duplicate prevention: if bill_id is provided, check if already booked
    IF v_bill_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.budget_variance_bill_bookings
        WHERE bill_id = v_bill_id AND variance_item_id = v_old.id
      ) THEN
        RAISE EXCEPTION 'Bill "%" has already been booked to "%". Duplicate booking rejected.', 
          COALESCE(v_bill_num, v_bill_id::text), v_old.sub_activity
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;

    v_qty  := COALESCE((v_item->>'actual_bill_qty')::numeric,  v_old.actual_bill_qty);
    v_rate := COALESCE((v_item->>'actual_bill_rate')::numeric, v_old.actual_bill_rate);

    IF v_qty < 0 OR v_rate < 0 THEN
      RAISE EXCEPTION 'Negative billed quantity or rate rejected for "%".', v_old.sub_activity
        USING ERRCODE = 'check_violation';
    END IF;

    v_cost := ROUND(v_qty * v_rate, 2);

    -- Skip if figures and remarks are identical (only when NOT a bill booking)
    IF v_bill_id IS NULL
       AND v_qty = v_old.actual_bill_qty
       AND v_rate = v_old.actual_bill_rate
       AND COALESCE(v_item->>'remark', '') = COALESCE(v_old.remark, '') THEN
      CONTINUE;
    END IF;

    INSERT INTO public.budget_revision_items (
      revision_id, master_budget_item_id, sub_activity, category_name,
      old_qty, new_qty, old_rate, new_rate, old_cost, new_cost
    ) VALUES (
      v_revision.id, v_old.master_budget_item_id, v_old.sub_activity,
      COALESCE(v_old.category_name, 'Uncategorised'),
      v_old.actual_bill_qty, v_qty, v_old.actual_bill_rate, v_rate,
      v_old.actual_total_cost, v_cost
    );

    UPDATE public.budget_variance_items
    SET actual_bill_qty  = v_qty,
        actual_bill_rate = v_rate,
        remark           = COALESCE(NULLIF(btrim(COALESCE(v_item->>'remark', '')), ''), remark)
    WHERE id = v_old.id;

    -- Record the booking in the tracking table
    IF v_bill_id IS NOT NULL THEN
      v_booked_qty    := COALESCE((v_item->>'booked_qty')::numeric, v_qty - v_old.actual_bill_qty);
      v_booked_amount := COALESCE((v_item->>'booked_amount')::numeric, v_cost - v_old.actual_total_cost);

      INSERT INTO public.budget_variance_bill_bookings (
        project_id, bill_source, bill_id, bill_number,
        variance_item_id, master_budget_item_id,
        category_name, sub_activity,
        booked_qty, booked_rate, booked_amount,
        booked_by_name, revision_id, remark
      ) VALUES (
        p_project_id, COALESCE(v_bill_src, 'material'), v_bill_id, v_bill_num,
        v_old.id, v_old.master_budget_item_id,
        COALESCE(v_old.category_name, 'Uncategorised'), v_old.sub_activity,
        v_booked_qty, v_rate, v_booked_amount,
        COALESCE(NULLIF(btrim(p_edited_by_name), ''), 'Pramukh ERP User'),
        v_revision.id, COALESCE(v_item->>'remark', '')
      );
    END IF;

    v_net := v_net + (v_cost - v_old.actual_total_cost);
    v_changed := v_changed + 1;
  END LOOP;

  IF v_changed = 0 THEN
    RAISE EXCEPTION 'No variance rows actually changed.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.budget_revisions
  SET net_diff_amount = v_net,
      justification_reason = justification_reason
        || format(' (%s row(s), net impact %s)', v_changed, ROUND(v_net, 2))
  WHERE id = v_revision.id
  RETURNING * INTO v_revision;

  RETURN v_revision;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_save_variance_reconciliation(uuid, text, text, jsonb) TO authenticated;
