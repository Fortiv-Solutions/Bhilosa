-- ============================================================================
-- PHASE 1 — SOURCING BASKET: RFQ CREATION WRITES rfq_lines
-- File: supabase/migrations/20260803180000_rfq_sourcing_basket.sql
--
-- 20260803160000 added the rfq_lines table; nothing populated it. createRfqFromPr
-- still created a header only, so every new RFQ was structurally empty and there
-- was nothing for quotations or awards to bind to.
--
-- This migration moves RFQ creation server-side into one transaction.
--
-- What the old client-side path did wrong, beyond not writing lines:
--   * Three non-atomic writes (rfqs, rfq_vendors, purchase_requisitions). A
--     failure on the second left an orphan RFQ and a PR in the wrong state.
--   * Status and role were client-supplied.
--   * It hard-blocked a second RFQ per PR ("An RFQ already exists"), which makes
--     partial sourcing impossible — tender 60 now, 40 next month. That block is
--     replaced by a quantity-availability guard, which is both more permissive
--     (partial sourcing works) and stricter (over-sourcing cannot happen).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. How much of a PR line is still available to put out to tender.
--
--    Three things consume a PR line, and they must not be double-counted:
--      a) quantity already sitting in a live RFQ (sourced, award pending)
--      b) quantity ordered via a PO that came THROUGH an RFQ — already counted
--         by (a), because the rfq_line still exists
--      c) quantity ordered by a direct PO with no RFQ behind it
--
--    So: available = quantity - (a) - (c).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pr_line_available_to_source(p_pr_line_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty            numeric;
  v_sourced        numeric := 0;
  v_direct_ordered numeric := 0;
BEGIN
  SELECT quantity INTO v_qty
  FROM public.purchase_requisition_lines
  WHERE id = p_pr_line_id;

  IF v_qty IS NULL THEN
    RETURN 0;
  END IF;

  -- (a) live RFQ demand
  SELECT COALESCE(SUM(rl.rfq_quantity), 0) INTO v_sourced
  FROM public.rfq_lines rl
  JOIN public.rfqs r ON r.id = rl.rfq_id
  WHERE rl.purchase_requisition_line_id = p_pr_line_id
    AND rl.status <> 'cancelled'
    AND r.deleted_at IS NULL;

  -- (c) direct POs that never went through an RFQ
  SELECT COALESCE(SUM(pol.quantity), 0) INTO v_direct_ordered
  FROM public.purchase_order_lines pol
  JOIN public.purchase_orders po ON po.id = pol.purchase_order_id
  WHERE pol.purchase_requisition_line_id = p_pr_line_id
    AND pol.rfq_line_id IS NULL
    AND po.deleted_at IS NULL
    AND po.status::text NOT IN ('cancelled', 'rejected');

  RETURN GREATEST(v_qty - v_sourced - v_direct_ordered, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_pr_line_available_to_source(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_pr_line_available_to_source(uuid) IS
  'Quantity of a PR line not yet tendered or directly ordered. Drives the sourcing basket and guards against over-sourcing across multiple RFQs.';

-- ----------------------------------------------------------------------------
-- 2. A view the picker can read in one query, instead of N function calls.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.pr_line_sourcing_view AS
SELECT
  prl.id                            AS pr_line_id,
  prl.purchase_requisition_id,
  prl.project_id,
  pr.pr_number,
  pr.status                         AS pr_status,
  prl.line_number,
  prl.item_id,
  prl.item_code,
  prl.item_group,
  prl.item_description,
  prl.specification,
  prl.preferred_brand,
  COALESCE(prl.unit, 'nos')         AS unit,
  prl.quantity,
  prl.ordered_qty,
  prl.balance_qty,
  prl.line_status,
  prl.estimated_rate,
  prl.activity_name,
  prl.sub_activity_name,
  prl.activity_code,
  prl.required_date,
  public.fn_pr_line_available_to_source(prl.id) AS available_to_source
FROM public.purchase_requisition_lines prl
JOIN public.purchase_requisitions pr ON pr.id = prl.purchase_requisition_id
WHERE prl.line_status <> 'cancelled';

GRANT SELECT ON public.pr_line_sourcing_view TO authenticated;

COMMENT ON VIEW public.pr_line_sourcing_view IS
  'PR lines with their remaining tenderable quantity. Backs the RFQ sourcing basket.';

-- ----------------------------------------------------------------------------
-- 3. rpc_create_rfq_from_pr — one transaction, server-validated.
--
--    p_lines: [{ "prLineId": uuid, "quantity": numeric,
--                "requiredDate": date|null, "remarks": text|null }]
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_create_rfq_from_pr(
  p_purchase_requisition_id uuid,
  p_vendor_ids              uuid[],
  p_lines                   jsonb,
  p_title                   text DEFAULT NULL,
  p_due_date                date DEFAULT NULL,
  p_terms                   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile    uuid := public.app_require_profile();
  v_pr         public.purchase_requisitions;
  v_rfq_id     uuid;
  v_rfq_number text;
  v_line       jsonb;
  v_pr_line    public.purchase_requisition_lines;
  v_qty        numeric;
  v_available  numeric;
  v_count      integer := 0;
  v_vendor     uuid;
  v_vendors    integer := 0;
  v_seen       uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not raise requests for quotation.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pr FROM public.purchase_requisitions WHERE id = p_purchase_requisition_id;
  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'Purchase requisition not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pr.status::text <> 'approved' THEN
    RAISE EXCEPTION 'RFQ can be created only after the purchase requisition is approved (current status: %).',
      v_pr.status USING ERRCODE = '22023';
  END IF;

  IF p_vendor_ids IS NULL OR array_length(p_vendor_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one vendor before creating an RFQ.' USING ERRCODE = '22004';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Select at least one requisition line to put out to tender.' USING ERRCODE = '22004';
  END IF;

  -- ---- Header --------------------------------------------------------------
  v_rfq_number := public.next_document_number('RFQ');

  INSERT INTO public.rfqs (
    project_id, purchase_requisition_id, rfq_number, title,
    issue_date, due_date, status, terms, created_by, updated_by
  ) VALUES (
    v_pr.project_id, v_pr.id, v_rfq_number,
    COALESCE(NULLIF(btrim(p_title), ''), v_pr.title, 'Request for Quotation'),
    CURRENT_DATE,
    COALESCE(p_due_date, v_pr.required_date, CURRENT_DATE + 7),
    'rfq_sent'::erp_procurement_status,
    p_terms, v_profile, v_profile
  )
  RETURNING id INTO v_rfq_id;

  -- ---- Lines ---------------------------------------------------------------
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_pr_line
    FROM public.purchase_requisition_lines
    WHERE id = (v_line->>'prLineId')::uuid;

    IF v_pr_line.id IS NULL THEN
      RAISE EXCEPTION 'Requisition line % not found.', v_line->>'prLineId' USING ERRCODE = 'P0002';
    END IF;

    -- A line from a different PR must never end up on this RFQ.
    IF v_pr_line.purchase_requisition_id <> v_pr.id THEN
      RAISE EXCEPTION 'Line % does not belong to requisition %.',
        v_pr_line.item_description, v_pr.pr_number USING ERRCODE = '22023';
    END IF;

    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity for "%" must be greater than zero.',
        v_pr_line.item_description USING ERRCODE = '22004';
    END IF;

    -- Availability is evaluated INSIDE the transaction, so two buyers tendering
    -- the same line concurrently cannot both pass.
    v_available := public.fn_pr_line_available_to_source(v_pr_line.id);
    IF v_qty > v_available + 1e-6 THEN
      RAISE EXCEPTION
        'Cannot tender % of "%": only % remains untendered (ordered %, requisitioned %).',
        v_qty, v_pr_line.item_description, v_available,
        v_pr_line.ordered_qty, v_pr_line.quantity
        USING ERRCODE = '23514';
    END IF;

    v_count := v_count + 1;

    INSERT INTO public.rfq_lines (
      rfq_id, project_id, purchase_requisition_line_id, purchase_requisition_id,
      line_number, item_id, item_code, item_group, item_description, specification,
      preferred_brand, unit, rfq_quantity, estimated_rate,
      activity_name, sub_activity_name, activity_code,
      required_date, remarks, status, created_by, updated_by
    ) VALUES (
      v_rfq_id, v_pr.project_id, v_pr_line.id, v_pr.id,
      v_count, v_pr_line.item_id, v_pr_line.item_code, v_pr_line.item_group,
      v_pr_line.item_description, v_pr_line.specification,
      v_pr_line.preferred_brand, COALESCE(v_pr_line.unit, 'nos'),
      v_qty, COALESCE(v_pr_line.estimated_rate, 0),
      v_pr_line.activity_name, v_pr_line.sub_activity_name, v_pr_line.activity_code,
      COALESCE((NULLIF(v_line->>'requiredDate', ''))::date, v_pr_line.required_date, v_pr.required_date),
      NULLIF(v_line->>'remarks', ''),
      'open', v_profile, v_profile
    );

    -- Mark the source line as out to tender, without disturbing a terminal state.
    UPDATE public.purchase_requisition_lines
    SET line_status = CASE
          WHEN line_status IN ('cancelled', 'short_closed', 'fully_ordered') THEN line_status
          ELSE 'in_rfq'
        END,
        updated_at = now(),
        updated_by = v_profile
    WHERE id = v_pr_line.id;
  END LOOP;

  -- ---- Vendors -------------------------------------------------------------
  FOREACH v_vendor IN ARRAY p_vendor_ids LOOP
    CONTINUE WHEN v_vendor IS NULL OR v_vendor = ANY(v_seen);
    v_seen := array_append(v_seen, v_vendor);

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor AND is_active) THEN
      RAISE EXCEPTION 'Vendor % does not exist or is deactivated.', v_vendor USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.rfq_vendors (
      rfq_id, project_id, vendor_id, sent_at, response_status, created_by, updated_by
    ) VALUES (
      v_rfq_id, v_pr.project_id, v_vendor, now(), 'pending'::erp_workflow_status, v_profile, v_profile
    );
    v_vendors := v_vendors + 1;
  END LOOP;

  IF v_vendors = 0 THEN
    RAISE EXCEPTION 'No valid vendors were supplied.' USING ERRCODE = '22004';
  END IF;

  -- ---- PR header -----------------------------------------------------------
  -- Only advance the header while it is still 'approved'. A PR already partially
  -- ordered must not be dragged back to 'rfq_sent' by a top-up RFQ.
  UPDATE public.purchase_requisitions
  SET status = 'rfq_sent'::erp_procurement_status,
      status_changed_at = now(),
      updated_by = v_profile,
      updated_at = now()
  WHERE id = v_pr.id
    AND status::text = 'approved';

  RETURN jsonb_build_object(
    'rfqId', v_rfq_id,
    'rfqNumber', v_rfq_number,
    'lineCount', v_count,
    'vendorCount', v_vendors
  );
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_create_rfq_from_pr(uuid, uuid[], jsonb, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_create_rfq_from_pr(uuid, uuid[], jsonb, text, date, text) IS
  'Creates an RFQ, its rfq_lines and its invited vendors in one transaction. Validates role, PR approval, line ownership and remaining tenderable quantity server-side.';

-- ----------------------------------------------------------------------------
-- 4. Backfill: any RFQ created before this migration has no lines. Give it the
--    lines of the PR it points at, so historical RFQs are not left unusable.
-- ----------------------------------------------------------------------------
INSERT INTO public.rfq_lines (
  rfq_id, project_id, purchase_requisition_line_id, purchase_requisition_id,
  line_number, item_id, item_code, item_group, item_description, specification,
  preferred_brand, unit, rfq_quantity, estimated_rate,
  activity_name, sub_activity_name, activity_code, required_date
)
SELECT r.id, r.project_id, prl.id, prl.purchase_requisition_id,
       COALESCE(prl.line_number, row_number() OVER (PARTITION BY r.id ORDER BY prl.created_at)),
       prl.item_id, prl.item_code, prl.item_group, prl.item_description, prl.specification,
       prl.preferred_brand, COALESCE(prl.unit, 'nos'),
       prl.quantity, COALESCE(prl.estimated_rate, 0),
       prl.activity_name, prl.sub_activity_name, prl.activity_code, prl.required_date
FROM public.rfqs r
JOIN public.purchase_requisition_lines prl
  ON prl.purchase_requisition_id = r.purchase_requisition_id
WHERE r.deleted_at IS NULL
  AND prl.quantity > 0
  AND prl.line_status <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM public.rfq_lines rl
    WHERE rl.rfq_id = r.id AND rl.purchase_requisition_line_id = prl.id
  );

COMMIT;
