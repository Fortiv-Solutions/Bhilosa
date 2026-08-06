-- =====================================================================
-- Migration: 20260805163000_save_variance_by_master_or_variance_id.sql
-- Purpose: Allow rpc_save_variance_reconciliation to match by either budget_variance_items.id OR master_budget_item_id
-- =====================================================================

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

    v_qty  := COALESCE((v_item->>'actual_bill_qty')::numeric,  v_old.actual_bill_qty);
    v_rate := COALESCE((v_item->>'actual_bill_rate')::numeric, v_old.actual_bill_rate);

    IF v_qty < 0 OR v_rate < 0 THEN
      RAISE EXCEPTION 'Negative billed quantity or rate rejected for "%".', v_old.sub_activity
        USING ERRCODE = 'check_violation';
    END IF;

    v_cost := ROUND(v_qty * v_rate, 2);

    -- Skip if figures and remarks are identical
    IF v_qty = v_old.actual_bill_qty
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
