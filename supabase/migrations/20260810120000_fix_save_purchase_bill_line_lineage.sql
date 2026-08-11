-- ============================================================================
-- PURCHASE BILL — PERSIST THE ITEM AND ACTIVITY AXES
-- File: supabase/migrations/20260810120000_fix_save_purchase_bill_line_lineage.sql
--
-- THE BUG
-- =======
-- Selecting an approved GRN in the Purchase Bill form auto-fills each line with
-- its Activity and Sub-Activity — visibly, correctly, straight off the GRN line
-- and the PO line behind it. Saving the bill made both blank.
--
-- The frontend was never at fault. The chain is intact end to end:
--
--   bills-grn-item-picker-modal  puts activity_name / sub_activity_name on the
--                                selected entry
--   bills-form                   resolves them (GRN line -> PO line -> '') and
--                                renders them
--   bills-workspace              spreads `...entry` into payload.lines, so both
--                                keys reach the RPC
--   vendor_bill_lines            HAS both columns (20260808170000)
--
-- save_purchase_bill is where they died. Its INSERT INTO vendor_bill_lines names
-- an explicit column list, and that list omits every column the lineage
-- migration added:
--
--     item_code · item_specification · item_description · unit_rate
--     activity_name · sub_activity_name · master_budget_item_id
--     credit_amount · debit_amount · credit_debit_reason
--
-- jsonb has no notion of an unread key, so the payload carried them in and the
-- function quietly dropped them. The TypeScript fallback in savePurchaseBill()
-- writes all of them correctly — but it only runs when the RPC THROWS, and the
-- RPC succeeded. The bill saved, and the activity axis was gone.
--
-- That is also why fn_post_vendor_bill_to_budget kept falling back to a single
-- header-level allocation: it resolves per line from activity_name, and every
-- line had NULL.
--
-- THE FIX
-- =======
-- Identical function, identical semantics, with the missing columns read from
-- the same payload the caller already sends. Nothing else changes: the header
-- INSERT/UPDATE, the totals arithmetic, the status normalisation and the
-- delete-and-reinsert of lines are byte-for-byte the prior behaviour.
--
-- Idempotent: CREATE OR REPLACE only.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '120s';

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS
--
--    The lineage columns must exist before the function references them, or
--    every purchase bill save starts failing on an undefined column.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_col     text;
BEGIN
  IF to_regclass('public.vendor_bill_lines') IS NULL THEN
    RAISE EXCEPTION 'vendor_bill_lines does not exist.';
  END IF;

  FOREACH v_col IN ARRAY ARRAY[
    'item_code', 'item_specification', 'item_description', 'unit_rate',
    'activity_name', 'sub_activity_name', 'master_budget_item_id',
    'credit_amount', 'debit_amount', 'credit_debit_reason'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vendor_bill_lines'
        AND column_name = v_col
    ) THEN
      v_missing := array_append(v_missing, 'vendor_bill_lines.' || v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'Purchase bill lineage cannot apply. Missing: %. Apply 20260808170000_procurement_item_activity_lineage.sql first.',
      array_to_string(v_missing, '; ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. save_purchase_bill — now writing what the form has always sent
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_purchase_bill(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_exists boolean := false;
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

  -- Check if v_id exists in vendor_bills
  IF v_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.vendor_bills WHERE id = v_id) INTO v_exists;
  ELSE
    v_exists := false;
  END IF;

  IF NOT v_exists THEN
    IF v_id IS NULL THEN
      v_id := gen_random_uuid();
    END IF;

    INSERT INTO public.vendor_bills (
      id, project_id, site_id, vendor_id, purchase_order_id, grn_id, work_order_id,
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
      status_issue_relation_count, required_documents_received, work_completion_verified,
      qc_approval_verified, unlocked_fy, status, form_payload, created_by, updated_by
    ) VALUES (
      v_id, v_project, v_site, v_vendor, v_po_id, v_grn_id, nullif(p_payload->>'work_order_id', '')::uuid,
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
      coalesce(nullif(p_payload->>'required_documents_received', '')::boolean, true),
      coalesce(nullif(p_payload->>'work_completion_verified', '')::boolean, true),
      coalesce(nullif(p_payload->>'qc_approval_verified', '')::boolean, true),
      coalesce(nullif(p_payload->>'unlocked_fy', '')::numeric, 1),
      v_status,
      coalesce(p_payload->'form_payload', '{}'::jsonb),
      v_profile, v_profile
    );
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
      required_documents_received = true,
      work_completion_verified    = true,
      qc_approval_verified       = true,
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
        tax_rate, net_amount, line_total,
        -- WHAT was bought, and WHY. Present in the payload since the GRN item
        -- picker was wired; dropped here because the column list never named
        -- them. Everything below this line is the fix.
        item_code, item_specification, item_description, unit_rate,
        activity_name, sub_activity_name, master_budget_item_id,
        credit_amount, debit_amount, credit_debit_reason,
        created_by, updated_by
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
        -- purchase_category IS the activity axis on the PO side, so fall back
        -- to activity_name rather than leaving the budget mapping blind.
        coalesce(nullif(v_line->>'purchase_category', ''), nullif(v_line->>'activity_name', '')),
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

        nullif(v_line->>'item_code', ''),
        -- The GRN carries the spec under either name; accept both.
        coalesce(nullif(v_line->>'item_specification', ''), nullif(v_line->>'specification', '')),
        coalesce(nullif(v_line->>'item_desc', ''), nullif(v_line->>'description', '')),
        greatest(coalesce(nullif(v_line->>'bill_rate', '')::numeric, 0), 0),
        nullif(v_line->>'activity_name', ''),
        nullif(v_line->>'sub_activity_name', ''),
        nullif(v_line->>'master_budget_item_id', '')::uuid,
        greatest(coalesce(nullif(v_line->>'credit_amount', '')::numeric, 0), 0),
        greatest(coalesce(nullif(v_line->>'debit_amount', '')::numeric, 0), 0),
        nullif(v_line->>'credit_debit_reason', ''),

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

COMMENT ON FUNCTION public.save_purchase_bill(jsonb) IS
  'Saves a purchase bill and its lines. Persists the item axis (code, specification, description) and the activity axis (activity_name, sub_activity_name, master_budget_item_id) that the GRN item picker supplies — these were silently dropped by the previous column list, which is why Activity and Sub-Activity went blank after save and why the budget posting could only resolve one header-level allocation.';

-- ----------------------------------------------------------------------------
-- 2. THE SAFETY NET — RECOVER THE AXES AT THE TABLE
--
--    save_purchase_bill was not the only writer that dropped them.
--    submit_vendor_bill_from_grn — the RPC behind "create a bill from this
--    GRN" — names an even shorter column list: no item_code, no item_group,
--    no specification, no activity, no sub-activity, and it takes its
--    description from item_master.name rather than the description actually
--    received.
--
--    Rather than transcribe that 350-line function to add ten columns (and risk
--    a copying error in a function that also performs the three-way match), the
--    lineage is recovered where it can never be bypassed: on the row itself.
--    Every writer, present and future, now produces a complete line.
--
--    It only ever fills a NULL. A value the caller supplied is authoritative
--    and is never overwritten — the bill may legitimately be re-coded to a
--    different activity than the PO assumed.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_vbl_backfill_lineage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  /* Plain scalars, not a record. An unassigned PL/pgSQL record raises on field
     access, and the GRN branch below does not always run. */
  v_activity text;
  v_sub      text;
  v_spec     text;
  v_code     text;
  v_desc     text;
  v_group    text;
  v_brand    text;
  v_unit     text;
BEGIN
  IF NEW.activity_name       IS NOT NULL
     AND NEW.sub_activity_name  IS NOT NULL
     AND NEW.item_specification IS NOT NULL
     AND NEW.item_code          IS NOT NULL
     AND NEW.item_description   IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- The GRN line is the nearer source: it records what was actually accepted.
  IF NEW.grn_line_id IS NOT NULL THEN
    SELECT g.activity_name, g.sub_activity_name, g.item_specification,
           g.item_code, g.item_description, g.item_group, g.item_brand, g.unit
      INTO v_activity, v_sub, v_spec, v_code, v_desc, v_group, v_brand, v_unit
    FROM public.goods_receipt_note_lines g WHERE g.id = NEW.grn_line_id;
  END IF;

  -- Then the PO line, where both axes originate. Filled per column, so a GRN
  -- that carried only some of them still contributes what it had.
  IF NEW.purchase_order_line_id IS NOT NULL
     AND (v_activity IS NULL OR v_sub IS NULL OR v_spec IS NULL
          OR v_code IS NULL OR v_desc IS NULL) THEN
    SELECT coalesce(v_activity, p.activity_name),
           coalesce(v_sub,      p.sub_activity_name),
           coalesce(v_spec,     p.item_specification),
           coalesce(v_code,     p.item_code),
           coalesce(v_desc,     p.item_description),
           coalesce(v_group,    p.item_group),
           coalesce(v_brand,    p.item_brand),
           coalesce(v_unit,     p.unit)
      INTO v_activity, v_sub, v_spec, v_code, v_desc, v_group, v_brand, v_unit
    FROM public.purchase_order_lines p WHERE p.id = NEW.purchase_order_line_id;
  END IF;

  NEW.activity_name      := coalesce(NEW.activity_name,      v_activity);
  NEW.sub_activity_name  := coalesce(NEW.sub_activity_name,  v_sub);
  NEW.item_specification := coalesce(NEW.item_specification, v_spec);
  NEW.item_code          := coalesce(NEW.item_code,          v_code);
  NEW.item_description   := coalesce(NEW.item_description,   v_desc);
  NEW.item_group         := coalesce(NEW.item_group,         v_group);
  NEW.item_brand         := coalesce(NEW.item_brand,         v_brand);
  NEW.unit               := coalesce(NEW.unit,               v_unit);
  -- purchase_category is the activity axis under its PO-side name.
  NEW.purchase_category  := coalesce(NEW.purchase_category,  NEW.activity_name);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vbl_backfill_lineage ON public.vendor_bill_lines;
CREATE TRIGGER trg_vbl_backfill_lineage
  BEFORE INSERT OR UPDATE ON public.vendor_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_vbl_backfill_lineage();

COMMENT ON FUNCTION public.trg_fn_vbl_backfill_lineage() IS
  'Recovers a bill line''s item and activity axes from its GRN line, then its PO line, whenever a writer leaves them NULL. Fills only NULLs, so a deliberate re-coding on the bill always wins. Exists because submit_vendor_bill_from_grn omits all of them.';

-- Repair lines already written by either path, so bills raised before today
-- can be posted to the variance sheet rather than being permanently unmapped.
UPDATE public.vendor_bill_lines l
SET activity_name      = coalesce(l.activity_name,      g.activity_name,      p.activity_name),
    sub_activity_name  = coalesce(l.sub_activity_name,  g.sub_activity_name,  p.sub_activity_name),
    item_specification = coalesce(l.item_specification, g.item_specification, p.item_specification),
    item_code          = coalesce(l.item_code,          g.item_code,          p.item_code),
    item_description   = coalesce(l.item_description,   g.item_description,   p.item_description),
    item_group         = coalesce(l.item_group,         g.item_group,         p.item_group),
    purchase_category  = coalesce(l.purchase_category,  g.activity_name,      p.activity_name)
FROM public.vendor_bill_lines base
  LEFT JOIN public.goods_receipt_note_lines g ON g.id = base.grn_line_id
  LEFT JOIN public.purchase_order_lines     p ON p.id = base.purchase_order_line_id
WHERE l.id = base.id
  AND (l.activity_name IS NULL OR l.sub_activity_name IS NULL
       OR l.item_specification IS NULL OR l.item_code IS NULL)
  AND (g.id IS NOT NULL OR p.id IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 3. VERIFICATION
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_src text;
  v_missing text[] := ARRAY[]::text[];
  v_col text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'save_purchase_bill';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'save_purchase_bill is not present after replacement.';
  END IF;

  FOREACH v_col IN ARRAY ARRAY['activity_name', 'sub_activity_name', 'item_specification', 'item_code'] LOOP
    IF position(v_col IN v_src) = 0 THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'save_purchase_bill still does not reference: %',
      array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'save_purchase_bill now persists the item and activity axes on every bill line.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
