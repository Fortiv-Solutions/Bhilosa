-- =====================================================================
-- Migration: Fix save_purchase_bill RPC Numeric Parsing Safety
-- Description: Ensures all numeric casts use `nullif(..., '')::numeric`
--              to prevent "invalid input syntax for type numeric: ''" errors
--              when empty strings are passed in JSON payload.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.save_purchase_bill(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_project uuid;
  v_vendor uuid;
  v_po_id uuid;
  v_grn_id uuid;
  v_site uuid;
  v_profile uuid;
  v_number text;
  v_raw_status text;
  v_status public.erp_billing_status;
  v_sub numeric := 0;
  v_tax numeric := 0;
  v_net numeric := 0;
  v_line jsonb;
  v_sr integer := 0;
BEGIN
  v_profile := public.app_current_profile_id();

  -- Normalize status safely
  v_raw_status := lower(trim(coalesce(p_payload->>'status', 'draft')));
  IF v_raw_status LIKE '%verif%' THEN
    v_status := 'pending_verification'::public.erp_billing_status;
  ELSIF v_raw_status LIKE '%appr%' THEN
    v_status := 'approved'::public.erp_billing_status;
  ELSE
    v_status := 'draft'::public.erp_billing_status;
  END IF;

  v_id := nullif(p_payload->>'id', '')::uuid;
  v_project := nullif(p_payload->>'project_id', '')::uuid;
  v_vendor  := nullif(p_payload->>'vendor_id', '')::uuid;
  v_po_id   := nullif(p_payload->>'purchase_order_id', '')::uuid;
  v_grn_id  := nullif(p_payload->>'grn_id', '')::uuid;
  v_site    := nullif(p_payload->>'site_id', '')::uuid;

  -- Default project/vendor fallback if missing
  IF v_project IS NULL THEN
    SELECT id INTO v_project FROM public.projects LIMIT 1;
  END IF;
  IF v_vendor IS NULL THEN
    SELECT id INTO v_vendor FROM public.vendors LIMIT 1;
  END IF;

  IF v_project IS NULL OR v_vendor IS NULL THEN
    RAISE EXCEPTION 'A purchase bill requires an active project and vendor.' USING ERRCODE = '22004';
  END IF;

  v_number := nullif(p_payload->>'bill_number', '');
  IF v_number IS NULL THEN
    v_number := 'PB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
  END IF;

  -- Compute totals from lines array safely
  IF jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN
    SELECT
      coalesce(sum(greatest(coalesce(nullif(l->>'gross_amount', '')::numeric, (coalesce(nullif(l->>'received_qty', '')::numeric, 0) * coalesce(nullif(l->>'bill_rate', '')::numeric, 0))), 0)), 0),
      coalesce(sum(greatest(coalesce(nullif(l->>'vat_amt', '')::numeric, (coalesce(nullif(l->>'gross_amount', '')::numeric, 0) * (coalesce(nullif(l->>'po_vat_rate', '')::numeric, 0) / 100.0))), 0)), 0),
      coalesce(sum(greatest(coalesce(nullif(l->>'net_amount', '')::numeric, 0), 0)), 0)
    INTO v_sub, v_tax, v_net
    FROM jsonb_array_elements(p_payload->'lines') AS l;
  ELSE
    v_sub := greatest(coalesce(nullif(p_payload->>'subtotal_amount', '')::numeric, coalesce(nullif(p_payload->>'total_amount', '')::numeric, 0)), 0);
    v_tax := greatest(coalesce(nullif(p_payload->>'tax_amount', '')::numeric, 0), 0);
    v_net := greatest(coalesce(nullif(p_payload->>'net_payable_amount', '')::numeric, v_sub + v_tax), 0);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.vendor_bills (
      project_id, site_id, vendor_id, purchase_order_id, grn_id, work_order_id,
      bill_number, bill_date, bill_book_number, bill_received_date, accounting_date,
      supplier_bill_no, supplier_bill_date, company_name, contractor_name, party_name,
      company_status, tax_status, work_order_type, work_order_no, area_work_order_no,
      sub_project, from_pos, from_challans, payment_days, bill_due_date, auto_debit, perc,
      subtotal_amount, tax_amount, total_amount, net_payable_amount,
      lumpsum_other_charges, lumpsum_loading_unloading_charges, lumpsum_freight_charges,
      lumpsum_discount_amount, roundoff_adjustment, total_adjusted_amount,
      cheque_amount, total_cheque_payments, debit_details, credit_details,
      lbt_payable_by_us, additional_transportation_stax_applicable, stax_principal_amount,
      transportation_stax_rate, stax_amount, lbt_principal_amount, lbt_tax_rate, lbt_amount,
      project_location, supplier_location, narration, retention_percent, retention_amount,
      advance_adjusted, other_deductions, assigned_approval_role, bill_has_already_signed,
      status_issue_relation_count, unlocked_fy, status, form_payload, created_by, updated_by
    ) VALUES (
      v_project, v_site, v_vendor, v_po_id, v_grn_id, nullif(p_payload->>'work_order_id', '')::uuid,
      v_number,
      coalesce(nullif(p_payload->>'bill_date', '')::date, CURRENT_DATE),
      nullif(p_payload->>'bill_book_number', ''),
      nullif(p_payload->>'bill_received_date', '')::date,
      nullif(p_payload->>'accounting_date', '')::date,
      nullif(p_payload->>'supplier_bill_no', ''),
      nullif(p_payload->>'supplier_bill_date', '')::date,
      nullif(p_payload->>'company_name', ''),
      nullif(p_payload->>'contractor_name', ''),
      nullif(p_payload->>'party_name', ''),
      nullif(p_payload->>'company_status', ''),
      nullif(p_payload->>'tax_status', ''),
      nullif(p_payload->>'work_order_type', ''),
      nullif(p_payload->>'work_order_no', ''),
      nullif(p_payload->>'area_work_order_no', ''),
      nullif(p_payload->>'sub_project', ''),
      nullif(p_payload->>'from_pos', ''),
      nullif(p_payload->>'from_challans', ''),
      coalesce(nullif(p_payload->>'payment_days', '')::integer, 30),
      nullif(p_payload->>'bill_due_date', '')::date,
      coalesce(nullif(p_payload->>'auto_debit', '')::boolean, false),
      coalesce(nullif(p_payload->>'perc', '')::numeric, 0),
      v_sub, v_tax, v_sub + v_tax, greatest(v_net, 0),
      greatest(coalesce(nullif(p_payload->>'lumpsum_other_charges', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'lumpsum_loading_unloading_charges', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'lumpsum_freight_charges', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'lumpsum_discount_amount', '')::numeric, 0), 0),
      coalesce(nullif(p_payload->>'roundoff_adjustment', '')::numeric, 0),
      greatest(coalesce(nullif(p_payload->>'total_adjusted_amount', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'cheque_amount', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'total_cheque_payments', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'debit_details', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'credit_details', '')::numeric, 0), 0),
      coalesce(nullif(p_payload->>'lbt_payable_by_us', '')::boolean, false),
      coalesce(nullif(p_payload->>'additional_transportation_stax_applicable', '')::boolean, false),
      greatest(coalesce(nullif(p_payload->>'stax_principal_amount', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'transportation_stax_rate', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'stax_amount', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'lbt_principal_amount', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'lbt_tax_rate', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'lbt_amount', '')::numeric, 0), 0),
      nullif(p_payload->>'project_location', ''),
      nullif(p_payload->>'supplier_location', ''),
      nullif(p_payload->>'narration', ''),
      least(greatest(coalesce(nullif(p_payload->>'retention_percent', '')::numeric, 0), 0), 100),
      greatest(coalesce(nullif(p_payload->>'retention_amount', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'advance_adjusted', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_payload->>'other_deductions', '')::numeric, 0), 0),
      nullif(p_payload->>'assigned_approval_role', ''),
      coalesce(nullif(p_payload->>'bill_has_already_signed', '')::boolean, false),
      nullif(p_payload->>'status_issue_relation_count', ''),
      coalesce(nullif(p_payload->>'unlocked_fy', '')::numeric, 1),
      v_status,
      coalesce(p_payload->'form_payload', '{}'::jsonb),
      v_profile, v_profile
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.vendor_bills SET
      purchase_order_id = coalesce(v_po_id, purchase_order_id),
      grn_id            = coalesce(v_grn_id, grn_id),
      bill_date         = coalesce(nullif(p_payload->>'bill_date', '')::date, bill_date),
      bill_book_number  = coalesce(nullif(p_payload->>'bill_book_number', ''), bill_book_number),
      bill_received_date = coalesce(nullif(p_payload->>'bill_received_date', '')::date, bill_received_date),
      accounting_date   = coalesce(nullif(p_payload->>'accounting_date', '')::date, accounting_date),
      supplier_bill_no  = coalesce(nullif(p_payload->>'supplier_bill_no', ''), supplier_bill_no),
      supplier_bill_date = coalesce(nullif(p_payload->>'supplier_bill_date', '')::date, supplier_bill_date),
      company_name      = coalesce(nullif(p_payload->>'company_name', ''), company_name),
      contractor_name   = coalesce(nullif(p_payload->>'contractor_name', ''), contractor_name),
      party_name        = coalesce(nullif(p_payload->>'party_name', ''), party_name),
      company_status    = coalesce(nullif(p_payload->>'company_status', ''), company_status),
      tax_status        = coalesce(nullif(p_payload->>'tax_status', ''), tax_status),
      work_order_type   = coalesce(nullif(p_payload->>'work_order_type', ''), work_order_type),
      work_order_no     = coalesce(nullif(p_payload->>'work_order_no', ''), work_order_no),
      area_work_order_no = coalesce(nullif(p_payload->>'area_work_order_no', ''), area_work_order_no),
      sub_project       = coalesce(nullif(p_payload->>'sub_project', ''), sub_project),
      from_pos          = coalesce(nullif(p_payload->>'from_pos', ''), from_pos),
      from_challans     = coalesce(nullif(p_payload->>'from_challans', ''), from_challans),
      payment_days      = coalesce(nullif(p_payload->>'payment_days', '')::integer, payment_days),
      bill_due_date     = coalesce(nullif(p_payload->>'bill_due_date', '')::date, bill_due_date),
      auto_debit        = coalesce(nullif(p_payload->>'auto_debit', '')::boolean, auto_debit),
      perc              = coalesce(nullif(p_payload->>'perc', '')::numeric, perc),
      subtotal_amount   = v_sub,
      tax_amount        = v_tax,
      total_amount      = v_sub + v_tax,
      net_payable_amount = greatest(v_net, 0),
      lumpsum_other_charges = coalesce(nullif(p_payload->>'lumpsum_other_charges', '')::numeric, lumpsum_other_charges),
      lumpsum_loading_unloading_charges = coalesce(nullif(p_payload->>'lumpsum_loading_unloading_charges', '')::numeric, lumpsum_loading_unloading_charges),
      lumpsum_freight_charges = coalesce(nullif(p_payload->>'lumpsum_freight_charges', '')::numeric, lumpsum_freight_charges),
      lumpsum_discount_amount = coalesce(nullif(p_payload->>'lumpsum_discount_amount', '')::numeric, lumpsum_discount_amount),
      roundoff_adjustment = coalesce(nullif(p_payload->>'roundoff_adjustment', '')::numeric, roundoff_adjustment),
      total_adjusted_amount = coalesce(nullif(p_payload->>'total_adjusted_amount', '')::numeric, total_adjusted_amount),
      cheque_amount     = coalesce(nullif(p_payload->>'cheque_amount', '')::numeric, cheque_amount),
      total_cheque_payments = coalesce(nullif(p_payload->>'total_cheque_payments', '')::numeric, total_cheque_payments),
      debit_details     = coalesce(nullif(p_payload->>'debit_details', '')::numeric, debit_details),
      credit_details    = coalesce(nullif(p_payload->>'credit_details', '')::numeric, credit_details),
      lbt_payable_by_us = coalesce(nullif(p_payload->>'lbt_payable_by_us', '')::boolean, lbt_payable_by_us),
      additional_transportation_stax_applicable = coalesce(nullif(p_payload->>'additional_transportation_stax_applicable', '')::boolean, additional_transportation_stax_applicable),
      stax_principal_amount = coalesce(nullif(p_payload->>'stax_principal_amount', '')::numeric, stax_principal_amount),
      transportation_stax_rate = coalesce(nullif(p_payload->>'transportation_stax_rate', '')::numeric, transportation_stax_rate),
      stax_amount       = coalesce(nullif(p_payload->>'stax_amount', '')::numeric, stax_amount),
      lbt_principal_amount = coalesce(nullif(p_payload->>'lbt_principal_amount', '')::numeric, lbt_principal_amount),
      lbt_tax_rate      = coalesce(nullif(p_payload->>'lbt_tax_rate', '')::numeric, lbt_tax_rate),
      lbt_amount        = coalesce(nullif(p_payload->>'lbt_amount', '')::numeric, lbt_amount),
      project_location  = coalesce(nullif(p_payload->>'project_location', ''), project_location),
      supplier_location = coalesce(nullif(p_payload->>'supplier_location', ''), supplier_location),
      narration         = coalesce(nullif(p_payload->>'narration', ''), narration),
      retention_percent = coalesce(least(greatest(nullif(p_payload->>'retention_percent', '')::numeric, 0), 100), retention_percent),
      retention_amount  = coalesce(nullif(p_payload->>'retention_amount', '')::numeric, retention_amount),
      advance_adjusted  = coalesce(nullif(p_payload->>'advance_adjusted', '')::numeric, advance_adjusted),
      other_deductions  = coalesce(nullif(p_payload->>'other_deductions', '')::numeric, other_deductions),
      assigned_approval_role = coalesce(nullif(p_payload->>'assigned_approval_role', ''), assigned_approval_role),
      bill_has_already_signed = coalesce(nullif(p_payload->>'bill_has_already_signed', '')::boolean, bill_has_already_signed),
      status_issue_relation_count = coalesce(nullif(p_payload->>'status_issue_relation_count', ''), status_issue_relation_count),
      unlocked_fy       = coalesce(nullif(p_payload->>'unlocked_fy', '')::numeric, unlocked_fy),
      status            = v_status,
      form_payload      = coalesce(p_payload->'form_payload', form_payload),
      updated_by        = v_profile,
      updated_at        = now()
    WHERE id = v_id;
  END IF;

  -- Entry lines
  IF jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) > 0 THEN
    DELETE FROM public.vendor_bill_lines WHERE vendor_bill_id = v_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
      v_sr := v_sr + 1;
      INSERT INTO public.vendor_bill_lines (
        vendor_bill_id, project_id, item_id, purchase_order_line_id, grn_line_id,
        sr_no, gr_no, po_no, challan_no, item_group, item_brand,
        purchase_category, description, unit, quantity, received_qty,
        rate, po_basic_rate, po_discount_perc, po_discount_amt, po_rate,
        bill_rate, bill_discount_perc, bill_discount_amt, gross_amount,
        po_excise_duty_rate, loading_unloading_chgs, freight_chgs, others_chgs,
        vat_type, vat_on_all, po_vat_rate, vat_amt, po_lbt_rate,
        tax_rate, net_amount, line_total, created_by, updated_by
      ) VALUES (
        v_id, v_project,
        nullif(v_line->>'item_id', '')::uuid,
        nullif(v_line->>'purchase_order_line_id', '')::uuid,
        nullif(v_line->>'grn_line_id', '')::uuid,
        coalesce(nullif(v_line->>'sr_no', '')::integer, v_sr),
        nullif(v_line->>'gr_no', ''),
        nullif(v_line->>'po_no', ''),
        nullif(v_line->>'challan_no', ''),
        nullif(v_line->>'item_group', ''),
        nullif(v_line->>'item_brand', ''),
        nullif(v_line->>'purchase_category', ''),
        coalesce(nullif(v_line->>'item_desc', ''), nullif(v_line->>'description', ''), 'Billed item'),
        nullif(v_line->>'unit', ''),
        greatest(coalesce(nullif(v_line->>'received_qty', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'received_qty', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'bill_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_basic_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_discount_perc', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_discount_amt', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'bill_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'bill_discount_perc', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'bill_discount_amt', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'gross_amount', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_excise_duty_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'loading_unloading_chgs', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'freight_chgs', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'others_chgs', '')::numeric, 0), 0),
        nullif(v_line->>'vat_type', ''),
        coalesce(nullif(v_line->>'vat_on_all', '')::boolean, false),
        greatest(coalesce(nullif(v_line->>'po_vat_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'vat_amt', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_lbt_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'po_vat_rate', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'net_amount', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'net_amount', '')::numeric, 0), 0),
        v_profile, v_profile
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'vendorBillId', v_id,
    'billNumber', v_number,
    'netPayable', v_net,
    'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_purchase_bill(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_bill(jsonb) TO service_role;
