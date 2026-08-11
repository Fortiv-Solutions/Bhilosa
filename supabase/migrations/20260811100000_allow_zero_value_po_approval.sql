-- Relax total_amount requirement in trg_guard_purchase_order_status to allow zero-value POs (e.g. Free-Of-Cost samples, testing)
CREATE OR REPLACE FUNCTION public.trg_guard_purchase_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from       text := public.po_canonical_status(OLD.status::text);
  v_to         text := public.po_canonical_status(NEW.status::text);
  v_actor      uuid := public.app_current_profile_id();
  v_privileged text[] := ARRAY['approved', 'rejected', 'sent_to_vendor', 'cancelled', 'closed', 'short_closed'];
  v_line_count integer;
  v_system boolean := coalesce(
    nullif(current_setting('app.po_system_transition', true), ''), 'off') = 'on';
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised purchase order status %. Valid values: draft, pending_approval, approved, rejected, sent_to_vendor, acknowledged, partially_delivered, delivered, short_closed, closed, cancelled.',
      NEW.status USING ERRCODE = '22023';
  END IF;

  NEW.status := v_to::erp_po_status;

  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF NOT public.po_transition_allowed(v_from, v_to) THEN
    RAISE EXCEPTION 'Purchase order % cannot move from % to %.', NEW.po_number, v_from, v_to
      USING ERRCODE = '22023',
            HINT = 'Re-saving a purchase order must not change its workflow state. Use set_purchase_order_status() for a deliberate transition.';
  END IF;

  IF v_to = ANY(v_privileged) AND NOT v_system AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may move a purchase order to %.', v_to
      USING ERRCODE = '42501';
  END IF;

  -- A PO cannot be approved or dispatched without value or lines: relaxed to < 0 to allow zero-value (e.g. free/FOC) POs.
  IF v_to IN ('approved', 'sent_to_vendor') THEN
    IF coalesce(NEW.total_amount, 0) < 0 THEN
      RAISE EXCEPTION 'Purchase order % has negative value and cannot be approved.', NEW.po_number
        USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_line_count
    FROM public.purchase_order_lines WHERE purchase_order_id = NEW.id;
    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Purchase order % has no line items and cannot be approved.', NEW.po_number
        USING ERRCODE = '22023';
    END IF;
    IF NEW.vendor_id IS NULL THEN
      RAISE EXCEPTION 'Purchase order % has no vendor and cannot be approved.', NEW.po_number
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_to = 'rejected' AND coalesce(trim(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required to reject purchase order %.', NEW.po_number
      USING ERRCODE = '22023';
  END IF;

  IF v_to = 'cancelled' AND coalesce(trim(NEW.cancellation_reason), '') = '' THEN
    RAISE EXCEPTION 'A cancellation reason is required to cancel purchase order %.', NEW.po_number
      USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := coalesce(v_actor, NEW.updated_by);

  CASE v_to
    WHEN 'pending_approval' THEN
      NEW.submitted_at := now();
      NEW.submitted_by := coalesce(v_actor, NEW.submitted_by);
    WHEN 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := coalesce(v_actor, NEW.approved_by);
    WHEN 'rejected' THEN
      NEW.rejected_at := now();
      NEW.rejected_by := coalesce(v_actor, NEW.rejected_by);
    WHEN 'cancelled' THEN
      NEW.cancelled_at := now();
      NEW.cancelled_by := coalesce(v_actor, NEW.cancelled_by);
    WHEN 'closed' THEN
      NEW.closed_at := now();
      NEW.closed_by := coalesce(v_actor, NEW.closed_by);
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;
