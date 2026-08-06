-- =====================================================================
-- Migration: 20260805160000_bill_detail_po_activity_name.sql
-- Purpose: Direct mapping of activity_name from purchase_order_lines / PR lines with zero mock fallbacks
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_bill_detail(
  p_bill_source text,
  p_bill_id     uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_header  jsonb;
  v_lines   jsonb;
  v_ledger  jsonb;
  v_pays    jsonb;
  v_ret     jsonb;
  v_files   jsonb;
BEGIN
  IF p_bill_source NOT IN ('material', 'service') THEN
    RAISE EXCEPTION 'Unknown bill source "%". Expected material or service.', p_bill_source
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_bill_source = 'material' THEN
    SELECT to_jsonb(vb) || jsonb_build_object(
             'vendor_name',        COALESCE(v.display_name, v.legal_name),
             'vendor_gst',         v.gst_number,
             'po_number',          po.po_number,
             'grn_number',         grn.grn_number,
             'pr_number',          pr.pr_number,
             'head_activity',      COALESCE(
                                     (SELECT pol.activity_name FROM public.purchase_order_lines pol WHERE pol.purchase_order_id = po.id AND pol.activity_name IS NOT NULL AND trim(pol.activity_name) <> '' LIMIT 1),
                                     (SELECT prl.activity_name FROM public.purchase_requisition_lines prl JOIN public.purchase_requisitions pr_sub ON pr_sub.id = prl.purchase_requisition_id WHERE pr_sub.id = po.purchase_requisition_id AND prl.activity_name IS NOT NULL AND trim(prl.activity_name) <> '' LIMIT 1),
                                     bc.category_name,
                                     ba.allocation_name
                                   ),
             'allocation_name',    ba.allocation_name,
             'category_name',      bc.category_name,
             'master_budget_item', mbi.item_description)
      INTO v_header
    FROM public.vendor_bills vb
    LEFT JOIN public.vendors               v   ON v.id  = vb.vendor_id
    LEFT JOIN public.purchase_orders       po  ON po.id = vb.purchase_order_id
    LEFT JOIN public.goods_receipt_notes   grn ON grn.id = vb.grn_id
    LEFT JOIN public.purchase_requisitions pr  ON pr.id = po.purchase_requisition_id
    LEFT JOIN public.budget_allocations    ba  ON ba.id = vb.budget_allocation_id
    LEFT JOIN public.budget_categories     bc  ON bc.id = ba.category_id
    LEFT JOIN public.master_budget_items   mbi ON mbi.id = vb.master_budget_item_id
    WHERE vb.id = p_bill_id AND vb.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb) INTO v_lines
    FROM public.vendor_bill_lines l WHERE l.vendor_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(pm) ORDER BY pm.payment_date DESC), '[]'::jsonb) INTO v_pays
    FROM public.payments pm WHERE pm.vendor_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(rr) ORDER BY rr.release_date DESC), '[]'::jsonb) INTO v_ret
    FROM public.retention_releases rr WHERE rr.vendor_bill_id = p_bill_id;
  ELSE
    SELECT to_jsonb(sb) || jsonb_build_object(
             'vendor_name',        COALESCE(v.display_name, v.legal_name),
             'vendor_gst',         v.gst_number,
             'work_order_number',  wo.work_order_number,
             'work_order_id',      wo.id,
             'wo_total_amount',    wo.total_amount,
             'wo_billed_to_date',  wo.billed_to_date,
             'head_activity',      COALESCE(bc.category_name, ba.allocation_name),
             'allocation_name',    ba.allocation_name,
             'category_name',      bc.category_name,
             'master_budget_item', mbi.item_description,
             'qc_status',          qc.status)
      INTO v_header
    FROM public.service_bills sb
    LEFT JOIN public.vendors             v   ON v.id  = sb.vendor_id
    LEFT JOIN public.work_orders         wo  ON wo.id = sb.work_order_id
    LEFT JOIN public.budget_allocations  ba  ON ba.id = COALESCE(wo.budget_allocation_id, sb.budget_allocation_id)
    LEFT JOIN public.budget_categories   bc  ON bc.id = ba.category_id
    LEFT JOIN public.master_budget_items mbi ON mbi.id = COALESCE(sb.master_budget_item_id, wo.master_budget_item_id)
    LEFT JOIN public.qc_inspections      qc  ON qc.id = sb.qc_inspection_id
    WHERE sb.id = p_bill_id AND sb.deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb) INTO v_lines
    FROM public.service_bill_lines l WHERE l.service_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(pm) ORDER BY pm.payment_date DESC), '[]'::jsonb) INTO v_pays
    FROM public.payments pm WHERE pm.service_bill_id = p_bill_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(rr) ORDER BY rr.release_date DESC), '[]'::jsonb) INTO v_ret
    FROM public.retention_releases rr WHERE rr.service_bill_id = p_bill_id;
  END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',               bl.id,
             'transaction_type', bl.transaction_type,
             'amount',           bl.amount,
             'gross_amount',     bl.gross_amount,
             'retention_amount', bl.retention_amount,
             'description',      bl.description,
             'posted_at',        bl.posted_at,
             'document_date',    bl.document_date,
             'revision_seq',     bl.revision_seq,
             'is_reversal',      (bl.reverses_ledger_id IS NOT NULL OR bl.amount < 0),
             'allocation_name',  ba.allocation_name
           ) ORDER BY bl.posted_at DESC, bl.revision_seq DESC), '[]'::jsonb)
    INTO v_ledger
  FROM public.budget_ledger bl
  LEFT JOIN public.budget_allocations ba ON ba.id = bl.budget_allocation_id
  WHERE bl.source_table = CASE WHEN p_bill_source = 'material' THEN 'vendor_bills' ELSE 'service_bills' END
    AND bl.source_id = p_bill_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(ea) ORDER BY ea.created_at DESC), '[]'::jsonb) INTO v_files
  FROM public.entity_attachments ea
  WHERE ea.entity_table = CASE WHEN p_bill_source = 'material' THEN 'vendor_bills' ELSE 'service_bills' END
    AND ea.entity_id = p_bill_id;

  RETURN jsonb_build_object(
    'billSource',        p_bill_source,
    'header',            COALESCE(v_header, '{}'::jsonb),
    'lines',             v_lines,
    'ledger',            v_ledger,
    'payments',          v_pays,
    'retentionReleases', v_ret,
    'attachments',       v_files
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_bill_detail(text, uuid) TO authenticated;
