'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  Calendar,
  Send,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Layers,
  X,
  FileCheck,
  ShieldCheck,
  AlertTriangle,
  FileSpreadsheet,
  ReceiptIndianRupee,
  Printer,
  Save,
  UserCheck,
  Package,
  PackageCheck,
  DollarSign,
  FileText,
  Truck,
  Calculator,
  Receipt,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-react';
import type { VendorBillRow } from './bills-stats-bar';
import { supabase } from '@/utils/supabase-client';
import {
  printPurchaseBillReport,
  type VendorOption,
  fetchApprovedPosForProject,
  fetchApprovedGrnsForPos,
  listProcurementProjects,
  type ApprovedPoOption,
  type ApprovedGrnOption,
} from '@/lib/procurement';
import { BillsPoPickerModal } from './bills-po-picker-modal';
import { BillsGrnItemPickerModal, type SelectedGrnLineItem } from './bills-grn-item-picker-modal';

function numberToWords(num: number): string {
  if (!num || isNaN(num)) return 'Zero Only';
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : ' ');
  }

  let str = '';
  let n = Math.floor(num);

  if (n >= 10000000) {
    str += inWords(Math.floor(n / 10000000)) + 'Crore ';
    n %= 10000000;
  }
  if (n >= 100000) {
    str += inWords(Math.floor(n / 100000)) + 'Lakh ';
    n %= 100000;
  }
  if (n >= 1000) {
    str += inWords(Math.floor(n / 1000)) + 'Thousand ';
    n %= 1000;
  }
  if (n >= 100) {
    str += inWords(Math.floor(n / 100)) + 'Hundred ';
    n %= 100;
  }
  if (n > 0) {
    if (str !== '') str += 'and ';
    str += inWords(n);
  }

  return str.trim() + ' Only';
}

export type BillEntryLine = FullBillsFormState['purchase_bill_entries'][0];

export interface FullBillsFormState {
  // 1. Header Fields
  bill_no: string;
  bill_received_date: string;
  accounting_date: string;
  bill_no_of_supplier: string;
  bill_date_of_supplier: string;
  supplier_bill_no?: string;
  supplier_bill_date?: string;
  party_name?: string;
  company_status?: string;
  project_name: string;
  company_name: string;
  supplier_name: string;
  tax_status: string;
  contractor_name: string;
  work_order_type: string;
  work_order_no: string;
  area_work_order_no: string;
  perc: number;
  auto_debit: boolean;
  sub_project: string;
  from_pos: string;
  from_challans: string;
  payment_days: number;
  bill_due_date: string;

  // 2. Purchase Bills Entries Table
  purchase_bill_entries: {
    sr_no: number;
    gr_no: string;
    po_no: string;
    challan_no: string;
    item_group: string;
    item_desc: string;
    item_brand: string;
    unit: string;
    received_qty: number;
    purchase_category: string;
    po_basic_rate: number;
    po_discount_perc: number;
    po_discount_amt: number;
    po_rate: number;
    bill_rate: number;
    bill_discount_perc: number;
    bill_discount_amt: number;
    gross_amount: number;
    po_excise_duty_rate: number;
    loading_unloading_chgs: number;
    freight_chgs: number;
    others_chgs: number;
    vat_type: string;
    vat_on_all: boolean;
    po_vat_rate: number;
    vat_amt: number;
    po_lbt_rate: number;
    net_amount: number;
    purchase_ledger_add_bill_item_amt: number;
    activity_name?: string;
    sub_activity_name?: string;
    item_specification?: string;
    /* Corrections to what was certified — short supply or a rate correction
       (credit), a quality or delay debit. Both reduce the net payable and both
       reduce recognised cost in the budget ledger, unlike retention which is a
       payment-side hold. */
    credit_amount: number;
    debit_amount: number;
    credit_debit_reason?: string;
    pr_no?: string;
  }[];

  // 3. Bill Financial Summary
  lumpsum_other_charges: number;
  lumpsum_loading_unloading_charges: number;
  lumpsum_freight_charges: number;
  roundoff_adjustment: number;
  lumpsum_discount_amount: number;

  // 4. Advance Payment Entries Table
  advance_payment_entries: {
    voucher_no: string;
    voucher_date: string;
    po_no: string;
    advanced_payment: number;
    adjusted_payment: number;
    balance_amt: number;
    adjust_amt: number;
  }[];
  total_adjusted_amount: number;

  // 5. Additional / Statutory Tax Info
  additional_transportation_service_tax_applicable: boolean;
  stax_principal_amount: number;
  transportation_stax_rate: number;
  stax_amount: number;
  lbt_principal_amount: number;
  lbt_tax_rate: number;
  lbt_amount: number;
  lbt_payable_by_us?: boolean;
  project_location?: string;
  supplier_location?: string;
  narration?: string;
  total_bill_amount?: number;
  final_bill_amount?: number;

  // 6. Payment Vouchers Details Table
  payment_vouchers: {
    sr?: number;
    id?: string;
    voucher_no?: string;
    voucher_date: string;
    v_type?: string;
    ledger_name?: string;
    bank_cash_account?: string;
    payment_mode?: string;
    cheque_instrument_no?: string;
    cheque_instrument_date?: string;
    cheque_no?: string;
    bank_name?: string;
    status?: string;
    bill_no?: string;
    our_bill_no?: string;
    current_paid?: number;
    amount?: number;
  }[];
  cheque_amount: number;
  total_cheque_payments: number;
  debit_details: string | number;
  credit_details: string | number;

  // 7. PO Details Table
  po_details_all: {
    sr?: number;
    sr_no?: number;
    po_no: string;
    po_date?: string;
    po_in_the_name_of?: string;
    net_bill_amt: number;
    ret_perc?: number;
    total_ret_amt?: number;
    sr_item_group: string;
    item_desc: string;
    item_brand: string;
    approved_qty: number;
    unit_rate: number;
    net_amt: number;
    grn_balance_qty: number;
  }[];

  // 8. GRN Remarks Table
  grn_remarks_list: {
    sr: number;
    grn_no: string;
    remark: string;
  }[];

  // 9. Summary & Audit Indicators
  unlocked_fy: number;
  ledger_present: number;
  not_a_valid_bill_no: number;
  bill_has_already_signed: boolean;
  status_issue_relation_count: string;

  // 10. Ledger Posting Info Table
  ledger_posting_info: {
    id: string;
    date: string;
    ledger_main: string;
    ledger_group: string;
    account_head: string;
    project: string;
    dr: number;
    cr: number;
  }[];

  status: 'Draft' | 'Pending Verification' | 'Pending Approval' | 'Approved';
  assigned_approval_role?: string;
}

export interface BillsFormProps {
  bill: VendorBillRow;
  approvedGrns?: any[];
  vendorOptions?: VendorOption[];
  onSubmit: (formData: FullBillsFormState) => void;
  /** Generates the report-format Purchase Bill PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

function normalizeStatus(st?: string): FullBillsFormState['status'] {
  if (!st) return 'Draft';
  const s = st.toLowerCase().trim();
  if (s === 'approved' || s === 'posted' || s === 'paid') return 'Approved';
  if (s === 'pending_verification' || s === 'verification' || s === 'pending verification' || s === 'pending_approval' || s === 'pending approval') return 'Pending Verification';
  return 'Draft';
}

export function BillsForm({ bill, approvedGrns = [], vendorOptions = [], onSubmit, onPrint, onCancel }: BillsFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [selectedRole, setSelectedRole] = useState<string>('Purchase Manager');

  // Check if this is an existing bill or a clean new bill from scratch
  const isExistingBill = Boolean(bill.id || bill.bill_no || bill.invoice_no);
  const raw = ((bill as unknown as Record<string, unknown>).raw_row as Record<string, unknown>) || (bill as unknown as Record<string, unknown>);
  const fp = (raw.form_payload as Record<string, unknown>) || {};
  const dbLines = (raw.vendor_bill_lines as Record<string, unknown>[]) || [];

  /* The bill query joins purchase_order_lines for the activity axis. Rows
     billed before the GRN carried it read through to the PO line instead. */
  const poLine = (l: Record<string, unknown>) =>
    (l.purchase_order_lines as Record<string, unknown> | null) ?? null;

  const [form, setForm] = useState<FullBillsFormState>(() => {
    const defaultLines = isExistingBill && dbLines.length > 0
      ? dbLines.map((l, idx) => ({
          sr_no: Number(l.sr_no) || idx + 1,
          gr_no: (l.gr_no as string) || (raw.from_challans as string) || '',
          po_no: (l.po_no as string) || (raw.from_pos as string) || '',
          challan_no: (l.challan_no as string) || '',
          item_group: (l.item_group as string) || '',
          item_desc: (l.description as string) || (l.item_desc as string) || 'Billed item',
          item_brand: (l.item_brand as string) || '',
          /* The bill line's own value wins. It used to read the PO line FIRST,
             so a corrected activity on the bill was overwritten by whatever the
             PO happened to carry — and while the PO's activity_name held the
             item group, that wrong value won every time. The PO line stays as
             the fallback for rows billed before the GRN carried the axis. */
          activity_name:
            ((l as any).activity_name as string) ||
            (poLine(l)?.activity_name as string) ||
            '',
          sub_activity_name:
            ((l as any).sub_activity_name as string) ||
            (poLine(l)?.sub_activity_name as string) ||
            '',
          item_specification:
            ((l as any).item_specification as string) ||
            (poLine(l)?.item_specification as string) ||
            '',
          unit: (l.unit as string) || 'PCS',
          received_qty: Number(l.received_qty ?? l.quantity) || 0,
          purchase_category: (l.purchase_category as string) || 'General',
          po_basic_rate: Number(l.po_basic_rate) || 0,
          po_discount_perc: Number(l.po_discount_perc) || 0,
          po_discount_amt: Number(l.po_discount_amt) || 0,
          po_rate: Number(l.po_rate) || 0,
          bill_rate: Number(l.bill_rate ?? l.rate) || 0,
          bill_discount_perc: Number(l.bill_discount_perc) || 0,
          bill_discount_amt: Number(l.bill_discount_amt) || 0,
          gross_amount: Number(l.gross_amount) || (Number(l.received_qty) * Number(l.bill_rate)),
          po_excise_duty_rate: Number(l.po_excise_duty_rate) || 0,
          loading_unloading_chgs: Number(l.loading_unloading_chgs) || 0,
          freight_chgs: Number(l.freight_chgs) || 0,
          others_chgs: Number(l.others_chgs) || 0,
          vat_type: (l.vat_type as string) || 'GST',
          vat_on_all: Boolean(l.vat_on_all),
          po_vat_rate: Number(l.po_vat_rate ?? l.tax_rate) || 0,
          vat_amt: Number(l.vat_amt) || 0,
          po_lbt_rate: Number(l.po_lbt_rate) || 0,
          net_amount: Number(l.net_amount ?? l.line_total) || 0,
          purchase_ledger_add_bill_item_amt: Number(l.purchase_ledger_add_bill_item_amt) || 0,
          credit_amount: Number(l.credit_amount) || 0,
          debit_amount: Number(l.debit_amount) || 0,
          credit_debit_reason: (l.credit_debit_reason as string) || '',
          pr_no: (l as any).pr_no || '',
        }))
      : [];

    return {
      // 1. Header Fields
      bill_no: isExistingBill ? ((raw.bill_number as string) || bill.invoice_no || bill.bill_no || '') : '',
      bill_received_date: (raw.bill_received_date as string) || todayStr,
      accounting_date: (raw.accounting_date as string) || todayStr,
      bill_no_of_supplier: isExistingBill ? ((raw.supplier_bill_no as string) || bill.bill_no_of_supplier || '') : '',
      bill_date_of_supplier: (raw.supplier_bill_date as string) || todayStr,
      supplier_bill_no: isExistingBill ? ((raw.supplier_bill_no as string) || bill.bill_no_of_supplier || '') : '',
      supplier_bill_date: (raw.supplier_bill_date as string) || todayStr,
      party_name: isExistingBill ? ((raw.party_name as string) || bill.vendor_name || '') : '',
      company_status: (raw.company_status as string) || 'Active Registered Company',
      project_name: isExistingBill ? ((raw.projects as { name?: string })?.name || (raw.project_name as string) || bill.project_name || '') : '',
      company_name: isExistingBill ? ((raw.company_name as string) || bill.company_name || '') : '',
      supplier_name: isExistingBill ? ((raw.vendors as { display_name?: string; legal_name?: string })?.display_name || (raw.vendors as { legal_name?: string })?.legal_name || bill.vendor_name || '') : '',
      tax_status: (raw.tax_status as string) || 'Regular GST Registered',
      contractor_name: (raw.contractor_name as string) || '',
      work_order_type: (raw.work_order_type as string) || 'Purchase Material Supply',
      work_order_no: (raw.work_order_no as string) || '',
      area_work_order_no: (raw.area_work_order_no as string) || '',
      perc: Number(raw.perc) || 0.0,
      auto_debit: Boolean(raw.auto_debit),
      sub_project: (raw.sub_project as string) || '',
      from_pos: isExistingBill ? ((raw.from_pos as string) || bill.po_number || '') : '',
      from_challans: isExistingBill ? ((raw.from_challans as string) || bill.grn_no || '') : '',
      payment_days: Number(raw.payment_days) || 30.0,
      bill_due_date: (raw.bill_due_date as string) || defaultDueDate,

      // 2. Purchase Bills Entries Table
      purchase_bill_entries: defaultLines,

      // 3. Financial Summary & Roundoff
      lumpsum_other_charges: Number(raw.lumpsum_other_charges) || 0.0,
      lumpsum_loading_unloading_charges: Number(raw.lumpsum_loading_unloading_charges) || 0.0,
      lumpsum_freight_charges: Number(raw.lumpsum_freight_charges) || 0.0,
      roundoff_adjustment: Number(raw.roundoff_adjustment) || 0.0,
      lumpsum_discount_amount: Number(raw.lumpsum_discount_amount) || 0.0,

      // 4. Advance Payment Entries Table
      advance_payment_entries: (fp.advance_payment_entries as FullBillsFormState['advance_payment_entries']) || [],
      total_adjusted_amount: Number(raw.total_adjusted_amount) || 0.0,

      // 5. Additional / Statutory Tax Info
      additional_transportation_service_tax_applicable: Boolean(raw.additional_transportation_stax_applicable),
      stax_principal_amount: Number(raw.stax_principal_amount) || 0.0,
      transportation_stax_rate: Number(raw.transportation_stax_rate) || 0.0,
      stax_amount: Number(raw.stax_amount) || 0.0,
      lbt_principal_amount: Number(raw.lbt_principal_amount) || 0.0,
      lbt_tax_rate: Number(raw.lbt_tax_rate) || 0.0,
      lbt_amount: Number(raw.lbt_amount) || 0.0,
      lbt_payable_by_us: Boolean(raw.lbt_payable_by_us),
      project_location: (raw.project_location as string) || '',
      supplier_location: (raw.supplier_location as string) || '',
      narration: (raw.narration as string) || '',
      total_bill_amount: Number(raw.total_amount) || 0.0,
      final_bill_amount: Number(raw.net_payable_amount) || Number(raw.total_amount) || 0.0,

      // 6. Payment Vouchers Table
      payment_vouchers: (fp.payment_vouchers as FullBillsFormState['payment_vouchers']) || [],
      cheque_amount: Number(raw.cheque_amount) || 0.0,
      total_cheque_payments: Number(raw.total_cheque_payments) || 0.0,
      debit_details: (raw.debit_details as string | number) ?? '',
      credit_details: (raw.credit_details as string | number) ?? '',

      // 7. PO Details Table
      po_details_all: (fp.po_details_all as FullBillsFormState['po_details_all']) || [],

      // 8. GRN Remarks Table
      grn_remarks_list: (fp.grn_remarks_list as FullBillsFormState['grn_remarks_list']) || [],

      // 9. Summary & Audit Indicators
      unlocked_fy: Number(raw.unlocked_fy) || new Date().getFullYear(),
      ledger_present: Number(fp.ledger_present) || 0,
      not_a_valid_bill_no: Number(fp.not_a_valid_bill_no) || 0,
      bill_has_already_signed: Boolean(raw.bill_has_already_signed),
      status_issue_relation_count: (raw.status_issue_relation_count as string) || '0 Issues Found',

      // 10. Ledger Posting Info Table
      ledger_posting_info: (fp.ledger_posting_info as FullBillsFormState['ledger_posting_info']) || [],

      status: normalizeStatus((raw.status as string) || bill.status),
      assigned_approval_role: (raw.assigned_approval_role as string) || 'Purchase Manager',
    };
  });

  // Selection Modal states
  const [showPoPickerModal, setShowPoPickerModal] = useState(false);
  const [showGrnItemPickerModal, setShowGrnItemPickerModal] = useState(false);

  // Dynamic Options
  const [approvedPoOptions, setApprovedPoOptions] = useState<ApprovedPoOption[]>([]);
  const [approvedGrnOptions, setApprovedGrnOptions] = useState<ApprovedGrnOption[]>([]);
  const [selectedGrnItems, setSelectedGrnItems] = useState<SelectedGrnLineItem[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);

  // Sub-module Section Tab State
  const [activeSectionTab, setActiveSectionTab] = useState<
    'bill_entries' | 'advance_payment' | 'bill_payments' | 'payment_voucher' | 'purchase_details' | 'shipping_details' | 'summary_posting'
  >('bill_entries');

  // Expandable Row State for Purchase Bill Entries Table
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRowExpand = (idx: number) => {
    setExpandedRows((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleExpandAll = () => {
    const totalEntries = form.purchase_bill_entries.length;
    const allExpanded = totalEntries > 0 && form.purchase_bill_entries.every((_, idx) => expandedRows[idx]);
    if (allExpanded) {
      setExpandedRows({});
    } else {
      const next: Record<number, boolean> = {};
      form.purchase_bill_entries.forEach((_, idx) => {
        next[idx] = true;
      });
      setExpandedRows(next);
    }
  };

  // Load project options on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const projs = await listProcurementProjects();
        setProjectOptions(projs.map((p) => ({ id: p.id, name: p.name })));
        
        const initialProjName = form.project_name || projs[0]?.name;
        if (initialProjName) {
          const matched = projs.find((p) => p.name === initialProjName);
          const pId = matched?.id || initialProjName;
          const pos = await fetchApprovedPosForProject(pId);
          setApprovedPoOptions(pos);

          const poIds = pos.map((p) => p.id);
          const grns = await fetchApprovedGrnsForPos(poIds);
          setApprovedGrnOptions(grns);
        }
      } catch (err) {
        console.warn('Failed to fetch projects for dropdown:', err);
      }
    }
    loadProjects();
  }, []);

  // Fetch approved POs for selected project
  const loadApprovedPos = async (projIdOrName: string) => {
    if (!projIdOrName) {
      const pos = await fetchApprovedPosForProject('');
      setApprovedPoOptions(pos);
      const grns = await fetchApprovedGrnsForPos([]);
      setApprovedGrnOptions(grns);
      return;
    }
    const projObj = projectOptions.find((p) => p.name === projIdOrName || p.id === projIdOrName);
    const pId = projObj?.id || projIdOrName;
    const pos = await fetchApprovedPosForProject(pId);
    setApprovedPoOptions(pos);

    const poIds = pos.map((p) => p.id);
    const grns = await fetchApprovedGrnsForPos(poIds);
    setApprovedGrnOptions(grns);
  };

  // Fetch approved GRNs for selected PO numbers/IDs
  const loadApprovedGrnsForSelectedPos = async (poNosStr: string) => {
    const nos = poNosStr.split(',').map((s) => s.trim()).filter(Boolean);
    const matchedPoIds = approvedPoOptions
      .filter((p) => nos.includes(p.po_number) || nos.includes(p.id))
      .map((p) => p.id);

    const grns = await fetchApprovedGrnsForPos(matchedPoIds);
    setApprovedGrnOptions(grns);
  };

  // Open Multi-PO Modal
  const handleOpenPoPicker = async () => {
    await loadApprovedPos(form.project_name);
    setShowPoPickerModal(true);
  };

  // Open Multi-GRN Item Modal
  const handleOpenGrnItemPicker = async () => {
    await loadApprovedGrnsForSelectedPos(form.from_pos);
    setShowGrnItemPickerModal(true);
  };

  // Confirm Multi-PO Selection
  const handleConfirmPoSelection = async (selectedPoNos: string[], selectedPoObjs: ApprovedPoOption[]) => {
    const poNosStr = selectedPoNos.join(', ');
    const vendorName = selectedPoObjs[0]?.vendor_name || form.supplier_name;
    const projName = selectedPoObjs[0]?.project_name || form.project_name;

    setForm((prev) => ({
      ...prev,
      from_pos: poNosStr,
      supplier_name: vendorName || prev.supplier_name,
      party_name: vendorName || prev.party_name,
      project_name: projName || prev.project_name,
    }));

    // Auto-fetch GRNs linked to these POs
    const matchedPoIds = selectedPoObjs.map((p) => p.id);
    const grns = await fetchApprovedGrnsForPos(matchedPoIds);
    setApprovedGrnOptions(grns);
  };

  const handleAddBillEntryRow = () => {
    setForm((prev) => {
      const nextSr = prev.purchase_bill_entries.length + 1;
      const newRow: BillEntryLine = {
        sr_no: nextSr,
        gr_no: prev.from_challans || '',
        po_no: prev.from_pos || '',
        challan_no: prev.from_challans || '',
        item_group: 'General Material',
        item_desc: '',
        item_brand: '',
        unit: 'NOS',
        received_qty: 1,
        purchase_category: 'Direct Material',
        po_basic_rate: 0,
        po_discount_perc: 0,
        po_discount_amt: 0,
        po_rate: 0,
        bill_rate: 0,
        bill_discount_perc: 0,
        bill_discount_amt: 0,
        gross_amount: 0,
        po_excise_duty_rate: 0,
        loading_unloading_chgs: 0,
        freight_chgs: 0,
        others_chgs: 0,
        vat_type: 'GST',
        vat_on_all: true,
        po_vat_rate: 18,
        vat_amt: 0,
        po_lbt_rate: 0,
        net_amount: 0,
        purchase_ledger_add_bill_item_amt: 0,
        credit_amount: 0,
        debit_amount: 0,
        pr_no: '',
      };
      return {
        ...prev,
        purchase_bill_entries: [...prev.purchase_bill_entries, newRow],
      };
    });
  };

  const handleRemoveBillEntryRow = (index: number) => {
    setForm((prev) => {
      const updated = prev.purchase_bill_entries.filter((_, idx) => idx !== index);
      return {
        ...prev,
        purchase_bill_entries: updated.map((item, idx) => ({ ...item, sr_no: idx + 1 })),
      };
    });
  };

  // Confirm Multi-GRN Selection
  const handleConfirmGrnItemSelection = (
    items: SelectedGrnLineItem[],
    selectedGrnNumbers: string[]
  ) => {
    setSelectedGrnItems(items);
    const grnNosStr = selectedGrnNumbers.join(', ');

    const mappedEntries = items.map((item, idx) => {
      const qty = item.billed_qty;
      const unitRate = item.unit_rate;
      const gross = qty * unitRate;
      const vatAmt = gross * 0.18;
      const netAmt = gross + vatAmt;

      return {
        sr_no: idx + 1,
        gr_no: item.grn_number,
        po_no: item.po_number,
        challan_no: item.challan_no,
        item_group: item.item_group,
        item_desc: item.item_description,
        item_brand: item.item_brand || '',
        activity_name: item.activity_name || '',
        sub_activity_name: item.sub_activity_name || '',
        unit: item.unit,
        received_qty: qty,
        purchase_category: item.purchase_category || 'Direct Material',
        po_basic_rate: unitRate,
        po_discount_perc: 0,
        po_discount_amt: 0,
        po_rate: unitRate,
        bill_rate: unitRate,
        bill_discount_perc: 0,
        bill_discount_amt: 0,
        gross_amount: gross,
        po_excise_duty_rate: 0,
        loading_unloading_chgs: 0,
        freight_chgs: 0,
        others_chgs: 0,
        vat_type: 'GST',
        vat_on_all: true,
        po_vat_rate: 18,
        vat_amt: vatAmt,
        po_lbt_rate: 0,
        net_amount: netAmt,
        purchase_ledger_add_bill_item_amt: netAmt,
        credit_amount: 0,
        debit_amount: 0,
        pr_no: item.pr_no || '',
      };
    });

    setForm((prev) => ({
      ...prev,
      from_challans: grnNosStr,
      purchase_bill_entries: mappedEntries.length > 0 ? mappedEntries : prev.purchase_bill_entries,
    }));
  };

  const updateHeader = <K extends keyof FullBillsFormState>(key: K, value: FullBillsFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSelectGrn = async (grnNoOrId: string) => {
    if (!grnNoOrId) {
      setForm((prev) => ({ ...prev, from_challans: '' }));
      return;
    }

    let selectedGrn = (approvedGrns || []).find(
      (g: any) => g.grn_number === grnNoOrId || g.id === grnNoOrId
    );

    let lines: any[] = selectedGrn?.goods_receipt_note_lines || [];

    if (!selectedGrn || lines.length === 0) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(grnNoOrId);
        let grnQuery = supabase
          .from('goods_receipt_notes')
          .select('*, vendors(display_name, legal_name), projects(id, name), purchase_orders(po_number), goods_receipt_note_lines(*, purchase_order_lines(activity_name, sub_activity_name, item_specification))');

        if (isUuid) {
          grnQuery = grnQuery.or(`grn_number.eq.${grnNoOrId},id.eq.${grnNoOrId}`);
        } else {
          grnQuery = grnQuery.eq('grn_number', grnNoOrId);
        }

        const { data: grnData } = await grnQuery.maybeSingle();

        if (grnData) {
          selectedGrn = grnData;
          lines = grnData.goods_receipt_note_lines || [];
        }
      } catch (err) {
        console.warn('Error fetching GRN details:', err);
      }
    }

    if (!selectedGrn) {
      setForm((prev) => ({ ...prev, from_challans: grnNoOrId }));
      return;
    }

    const poNumber = selectedGrn.purchase_orders?.po_number || selectedGrn.po_number || '';
    const supplierName =
      selectedGrn.vendors?.display_name ||
      selectedGrn.vendors?.legal_name ||
      selectedGrn.supplier_name ||
      '';
    const projectName = (selectedGrn as any).projects?.name || (selectedGrn as any).project_name || form.project_name;
    const companyName = (selectedGrn as any).company_name || form.company_name;

    const mappedEntries = lines.map((l: any, idx: number) => {
      const acceptedQty = Number(l.accepted_qty ?? l.received_qty ?? 0);
      const unitRate = Number(l.unit_rate ?? 0);
      const gross = acceptedQty * unitRate;
      const taxRate = 18;
      const vatAmt = gross * (taxRate / 100);
      const netAmt = gross + vatAmt;

      return {
        sr_no: idx + 1,
        gr_no: selectedGrn.grn_number,
        po_no: poNumber || l.po_number || '',
        challan_no: selectedGrn.challan_no || selectedGrn.grn_number,
        item_group: l.item_group || 'Material',
        item_desc: l.item_description || 'Material Item',
        item_brand: l.item_brand || '',
        activity_name: l.purchase_order_lines?.activity_name || (l as any).activity_name || '',
        sub_activity_name: l.purchase_order_lines?.sub_activity_name || (l as any).sub_activity_name || '',
        unit: l.unit || 'NOS',
        received_qty: acceptedQty,
        purchase_category: l.purchase_category || 'Direct Material',
        po_basic_rate: unitRate,
        po_discount_perc: 0,
        po_discount_amt: 0,
        po_rate: unitRate,
        bill_rate: unitRate,
        bill_discount_perc: 0,
        bill_discount_amt: 0,
        gross_amount: gross,
        po_excise_duty_rate: 0,
        loading_unloading_chgs: 0,
        freight_chgs: 0,
        others_chgs: 0,
        vat_type: 'GST',
        vat_on_all: true,
        po_vat_rate: taxRate,
        vat_amt: vatAmt,
        po_lbt_rate: 0,
        net_amount: netAmt,
        purchase_ledger_add_bill_item_amt: netAmt,
        credit_amount: 0,
        debit_amount: 0,
      };
    });

    setForm((prev) => ({
      ...prev,
      from_challans: selectedGrn.grn_number,
      from_pos: poNumber || prev.from_pos,
      supplier_name: supplierName || prev.supplier_name,
      party_name: supplierName || prev.party_name,
      project_name: projectName || prev.project_name,
      company_name: companyName || prev.company_name,
      purchase_bill_entries: mappedEntries.length > 0 ? mappedEntries : prev.purchase_bill_entries,
    }));
  };

  const handleBillEntryChange = (index: number, field: keyof BillEntryLine, value: any) => {
    setForm((prev) => {
      const updated = [...prev.purchase_bill_entries];
      const current = { ...updated[index], [field]: value };

      if (
        field === 'received_qty' ||
        field === 'bill_rate' ||
        field === 'bill_discount_perc' ||
        field === 'freight_chgs' ||
        field === 'credit_amount' ||
        field === 'debit_amount'
      ) {
        const qty = Number(current.received_qty || 0);
        const bRate = Number(current.bill_rate || 0);
        const bDisc = Number(current.bill_discount_perc || 0);
        const frt = Number(current.freight_chgs || 0);
        const credit = Number(current.credit_amount || 0);
        const debit = Number(current.debit_amount || 0);

        const discAmt = (bRate * bDisc) / 100;
        const gross = qty * (bRate - discAmt);
        const tax = gross * 0.18;
        /* Credit and debit are corrections to what was certified, so they come
           off the net and off recognised cost — unlike retention, which is a
           payment-side hold and must not reduce recorded cost. Clamped at zero
           so a correction can never invert the line. */
        const net = Math.max(gross + tax + frt - credit - debit, 0);

        current.bill_discount_amt = discAmt;
        current.gross_amount = gross;
        current.vat_amt = tax;
        current.net_amount = net;
        current.purchase_ledger_add_bill_item_amt = net;
      }

      updated[index] = current;
      return { ...prev, purchase_bill_entries: updated };
    });
  };

  // Financial & Ledger Calculations
  const totalGrossAmount = form.purchase_bill_entries.reduce((sum, i) => sum + i.gross_amount, 0);
  const totalNetBeforeRoundoff = totalGrossAmount + form.purchase_bill_entries.reduce((sum, i) => sum + i.vat_amt, 0) + form.lumpsum_freight_charges + form.lumpsum_loading_unloading_charges + form.lumpsum_other_charges - form.lumpsum_discount_amount;
  const totalAmountPb = Math.round(totalNetBeforeRoundoff);
  const roundoffAmount = Number((totalAmountPb - totalNetBeforeRoundoff).toFixed(2));
  const calculatedTotalAdjustedAmount = form.advance_payment_entries.reduce((sum, i) => sum + Number(i.adjust_amt || 0), 0);
  const finalBillAmount = Math.max(
    totalAmountPb -
      calculatedTotalAdjustedAmount +
      Number(form.credit_details || 0) -
      Number(form.debit_details || 0),
    0
  );
  const amountInWordsStr = numberToWords(finalBillAmount);

  const totalDr = form.ledger_posting_info.reduce((sum, i) => sum + Number(i.dr || 0), 0);
  const totalCr = form.ledger_posting_info.reduce((sum, i) => sum + Number(i.cr || 0), 0);

  const handleAddAdvancePayment = () => {
    setForm((prev) => ({
      ...prev,
      advance_payment_entries: [
        ...prev.advance_payment_entries,
        {
          voucher_no: '',
          voucher_date: todayStr,
          po_no: prev.from_pos || '',
          advanced_payment: 0.0,
          adjusted_payment: 0.0,
          balance_amt: 0.0,
          adjust_amt: 0.0,
        },
      ],
    }));
  };

  const handleRemoveAdvancePayment = (index: number) => {
    setForm((prev) => ({
      ...prev,
      advance_payment_entries: prev.advance_payment_entries.filter((_, i) => i !== index),
    }));
  };

  const handleAdvancePaymentChange = (index: number, field: keyof FullBillsFormState['advance_payment_entries'][0], value: any) => {
    setForm((prev) => {
      const updated = [...prev.advance_payment_entries];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, advance_payment_entries: updated };
    });
  };

  const handleAddGrnRemark = () => {
    setForm((prev) => ({
      ...prev,
      grn_remarks_list: [
        ...prev.grn_remarks_list,
        {
          sr: prev.grn_remarks_list.length + 1,
          grn_no: prev.from_challans || '',
          remark: '',
        },
      ],
    }));
  };

  const handleRemoveGrnRemark = (index: number) => {
    setForm((prev) => ({
      ...prev,
      grn_remarks_list: prev.grn_remarks_list.filter((_, i) => i !== index),
    }));
  };

  const handleAddLedgerPosting = () => {
    setForm((prev) => ({
      ...prev,
      ledger_posting_info: [
        ...prev.ledger_posting_info,
        {
          id: `LEG-00${prev.ledger_posting_info.length + 1}`,
          date: new Date().toISOString().slice(0, 10),
          ledger_main: 'General Ledger Account',
          ledger_group: 'Expenses',
          account_head: 'General Expense',
          project: prev.project_name || '',
          dr: 0.0,
          cr: 0.0,
        },
      ],
    }));
  };

  const handleRemoveLedgerPosting = (index: number) => {
    setForm((prev) => ({
      ...prev,
      ledger_posting_info: prev.ledger_posting_info.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Form Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <ReceiptIndianRupee className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Purchase Bill &amp; Vendor Invoice Entry Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              3-Way Invoice Audit (PO = GRN = Bill) &amp; Financial Ledger Voucher Processing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              title="Generate the Purchase Bill report PDF"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-primary" /> Print Report
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Core Invoice & Sourcing Identifiers)             */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4 shadow-2xs">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2 flex items-center justify-between">
            <span>Invoice Identification &amp; Vendor Header Parameters</span>
            <span className="text-[10px] font-semibold text-primary">ERP Sourcing Header</span>
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Bill No */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Bill No</label>
              <input
                type="text"
                value={form.bill_no}
                onChange={(e) => updateHeader('bill_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                required
              />
            </div>

            {/* Bill Received Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Bill Received Date</label>
              <input
                type="text"
                value={form.bill_received_date}
                onChange={(e) => updateHeader('bill_received_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* Accounting Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Accounting Date*</label>
              <input
                type="text"
                value={form.accounting_date}
                onChange={(e) => updateHeader('accounting_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* Bill No of Supplier* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Bill No of Supplier*</label>
              <input
                type="text"
                value={form.bill_no_of_supplier}
                onChange={(e) => updateHeader('bill_no_of_supplier', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-foreground"
                required
              />
            </div>

            {/* Bill Date of Supplier* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Bill Date of Supplier*</label>
              <input
                type="text"
                value={form.bill_date_of_supplier}
                onChange={(e) => updateHeader('bill_date_of_supplier', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* Project Name* (Dropdown Filter) */}
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold uppercase text-primary">Project Name*</label>
              {projectOptions.length > 0 ? (
                <select
                  value={form.project_name}
                  onChange={(e) => {
                    updateHeader('project_name', e.target.value);
                    loadApprovedPos(e.target.value);
                  }}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground focus:outline-none focus:border-primary cursor-pointer"
                  required
                >
                  <option value="">-- Select Project --</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.project_name}
                  onChange={(e) => updateHeader('project_name', e.target.value)}
                  placeholder="Enter Project Name"
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground"
                  required
                />
              )}
            </div>

            {/* Select Approved GRN (From Challans) Single-Select Dropdown (Optional) */}
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold uppercase text-primary flex items-center justify-between">
                <span>Select Approved GRN (From Challans)</span>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Optional (Auto-Fills Form)</span>
              </label>
              <select
                value={form.from_challans}
                onChange={(e) => handleSelectGrn(e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-foreground focus:outline-none focus:border-primary cursor-pointer shadow-2xs"
              >
                <option value="">-- Select Approved GRN (Optional Auto-Fill) --</option>
                {(approvedGrns && approvedGrns.length > 0 ? approvedGrns : approvedGrnOptions).map((g: any) => (
                  <option key={g.id || g.grn_number} value={g.grn_number}>
                    {g.grn_number} — {g.vendors?.display_name || g.vendors?.legal_name || g.supplier_name || g.vendor_name || 'Vendor'} {g.po_number || g.purchase_orders?.po_number ? `(PO: ${g.po_number || g.purchase_orders?.po_number})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Multi-PO Selector: From POs* */}
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold uppercase text-primary">From POs*</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.from_pos}
                  onChange={(e) => updateHeader('from_pos', e.target.value)}
                  placeholder="Select or enter PO Numbers (e.g. PO-2026-0016, PO-2026-0019)"
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary"
                  required
                />
                <button
                  type="button"
                  onClick={handleOpenPoPicker}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <Package className="h-4 w-4" /> Pick Approved POs
                </button>
              </div>
            </div>

            {/* Multi-GRN Selector: From Challans / GRNs */}
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold uppercase text-primary">From Challans / GRNs</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.from_challans}
                  onChange={(e) => updateHeader('from_challans', e.target.value)}
                  placeholder="Select or enter GRN Numbers (e.g. GRN-2026-0101, GRN-2026-0102)"
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-foreground"
                />
                <button
                  type="button"
                  onClick={handleOpenGrnItemPicker}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-2xs shrink-0 cursor-pointer"
                >
                  <PackageCheck className="h-4 w-4" /> Pick GRN Items
                </button>
              </div>
            </div>

            {/* Supplier Name* */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Supplier Name*</label>
              <input
                type="text"
                value={form.supplier_name}
                onChange={(e) => updateHeader('supplier_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                required
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SUB-MODULE SECTION TABS NAVIGATION BAR (RESPONSIVE GRID — NO HORIZONTAL SCROLL) */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-muted/20 p-2 shadow-2xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveSectionTab('bill_entries')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'bill_entries'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Purchase Bill Entries ({form.purchase_bill_entries.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSectionTab('advance_payment')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'advance_payment'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Advance Payment Entries</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSectionTab('bill_payments')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'bill_payments'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Purchase Bill Payments</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSectionTab('payment_voucher')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'payment_voucher'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <FileCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Payment Voucher</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSectionTab('purchase_details')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'purchase_details'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Purchase Details</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSectionTab('shipping_details')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'shipping_details'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Shipping Bill Details</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSectionTab('summary_posting')}
              className={`px-2.5 py-2 rounded-lg font-extrabold transition-all w-full justify-center cursor-pointer flex items-center gap-1.5 text-center ${
                activeSectionTab === 'summary_posting'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60'
              }`}
            >
              <Calculator className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Summary Posting Details</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PURCHASE BILL ENTRIES & FINANCIAL SUMMARY TABLE                    */}
        {/* ========================================================================= */}
        {activeSectionTab === 'bill_entries' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Purchase Bills Entries Table ({form.purchase_bill_entries.length})
                </h3>
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={handleAddBillEntryRow}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item Row
                  </button>
                  <button
                    type="button"
                    onClick={toggleExpandAll}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer shadow-2xs"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5 text-primary" />
                    {form.purchase_bill_entries.length > 0 && form.purchase_bill_entries.every((_, idx) => expandedRows[idx])
                      ? 'Collapse All Details'
                      : 'Expand All Details'}
                  </button>
                  <span className="hidden sm:inline text-[11px] font-semibold text-muted-foreground">
                    Rate Variance &amp; Financial Ledger Posting Audit
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 font-bold text-center w-12">Details</th>
                      <th className="px-3 py-3 font-bold text-center w-12">Sr No</th>
                      <th className="px-3 py-3 min-w-[200px]">Item Description &amp; Specification</th>
                      <th className="px-3 py-3 min-w-[150px]">Activity &amp; Sub-Activity</th>
                      <th className="px-3 py-3 text-center min-w-[130px]">Received Qty &amp; Unit</th>
                      <th className="px-3 py-3 text-right min-w-[120px] font-bold text-primary">Bill Rate* (₹)</th>
                      <th className="px-3 py-3 text-right min-w-[120px]">Gross Amount (₹)</th>
                      <th className="px-3 py-3 text-right min-w-[130px] font-bold text-foreground">Net Amount (₹)</th>
                      <th className="px-3 py-3 text-center min-w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.purchase_bill_entries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center gap-2 font-sans">
                            <Package className="h-8 w-8 text-muted-foreground/50" />
                            <p className="font-bold text-xs text-foreground">No Bill Entry Line Items Added</p>
                            <p className="text-[11px] text-muted-foreground">Pick items from GRN / PO above or click below to add line items manually.</p>
                            <button
                              type="button"
                              onClick={handleAddBillEntryRow}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add First Item Row
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {form.purchase_bill_entries.map((item, idx) => {
                      const isExpanded = !!expandedRows[idx];
                      return (
                        <React.Fragment key={idx}>
                          {/* MASTER ROW */}
                          <tr className={`transition-colors align-middle font-mono ${isExpanded ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                            {/* 1. Expand/Collapse Toggle */}
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleRowExpand(idx)}
                                className={`p-1.5 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                  isExpanded ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-foreground'
                                }`}
                                title={isExpanded ? 'Collapse row details' : 'Expand row details'}
                              >
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            </td>

                            {/* 2. Sr No */}
                            <td className="px-2 py-2 text-center font-bold text-muted-foreground">
                              {item.sr_no || idx + 1}
                            </td>

                            {/* 3. Item Description & Specification */}
                            <td className="px-2 py-2">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  placeholder="Item Description"
                                  value={item.item_desc}
                                  onChange={(e) => handleBillEntryChange(idx, 'item_desc', e.target.value)}
                                  className="w-full rounded border border-border bg-background px-2 py-1 font-sans font-bold text-foreground focus:outline-none focus:border-primary text-xs"
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground font-semibold">Specification:</span>
                                  <input
                                    type="text"
                                    placeholder="Item Specification"
                                    value={item.item_brand}
                                    onChange={(e) => handleBillEntryChange(idx, 'item_brand', e.target.value)}
                                    className="w-full rounded border border-border/70 bg-background px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground focus:outline-none focus:border-primary"
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground font-semibold">PR No:</span>
                                  <input
                                    type="text"
                                    placeholder="PR No"
                                    value={item.pr_no || ''}
                                    onChange={(e) => handleBillEntryChange(idx, 'pr_no', e.target.value)}
                                    className="w-full rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground focus:outline-none focus:border-primary font-bold"
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Activity & Sub-Activity */}
                            <td className="px-2 py-2">
                              <div className="space-y-1 text-xs whitespace-normal max-w-[180px]">
                                <p className="font-semibold text-foreground leading-tight">{item.activity_name || '—'}</p>
                                <p className="text-[10px] text-muted-foreground leading-tight">{item.sub_activity_name || '—'}</p>
                              </div>
                            </td>

                            {/* 4. Received Qty & Unit */}
                            <td className="px-2 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.received_qty}
                                  onChange={(e) => handleBillEntryChange(idx, 'received_qty', Number(e.target.value))}
                                  className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right font-bold text-foreground focus:outline-none focus:border-primary text-xs"
                                />
                                <input
                                  type="text"
                                  value={item.unit}
                                  onChange={(e) => handleBillEntryChange(idx, 'unit', e.target.value)}
                                  className="w-14 rounded border border-border bg-background px-1 py-1 text-center font-sans font-bold text-muted-foreground text-xs focus:outline-none focus:border-primary"
                                />
                              </div>
                            </td>

                            {/* 5. Bill Rate* */}
                            <td className="px-2 py-2 text-right bg-primary/5">
                              <input
                                type="number"
                                step="0.01"
                                value={item.bill_rate}
                                onChange={(e) => handleBillEntryChange(idx, 'bill_rate', Number(e.target.value))}
                                className="w-24 rounded border-2 border-primary/60 bg-background px-1.5 py-1 text-right font-extrabold text-primary focus:outline-none focus:border-primary text-xs"
                              />
                            </td>

                            {/* 6. Gross Amount */}
                            <td className="px-2 py-2 text-right font-bold text-foreground">
                              ₹{item.gross_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>

                            {/* 9. Net Amount — after credit and debit. */}
                            <td className="px-2 py-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded">
                              ₹{item.net_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>

                            {/* 8. Actions */}
                            <td className="px-2 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpand(idx)}
                                  className="text-[10px] font-extrabold text-primary hover:underline cursor-pointer"
                                >
                                  {isExpanded ? 'Hide' : '+22 Fields'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBillEntryRow(idx)}
                                  className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Remove Row"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDABLE ACCORDION DRAWER ROW */}
                          {isExpanded && (
                            <tr className="bg-muted/30 border-b-2 border-primary/20">
                              <td colSpan={8} className="p-3">
                                <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm">
                                  <div className="flex items-center justify-between border-b border-border pb-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                      <Layers className="h-3.5 w-3.5" /> Extended Item Details &amp; Tax Breakdown (Item #{idx + 1})
                                    </span>
                                    <span className="text-[10px] font-semibold text-muted-foreground">
                                      All 29 Granular Parameters Editable Below
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-sans">
                                    {/* BOX 1: SOURCING & REFERENCE IDENTIFIERS */}
                                    <div className="space-y-2 p-3 rounded-lg border border-border/80 bg-muted/20">
                                      <h4 className="font-bold text-[11px] uppercase text-muted-foreground border-b border-border/50 pb-1">
                                        Sourcing &amp; Reference
                                      </h4>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">G.R. No</label>
                                        <input
                                          type="text"
                                          value={item.gr_no}
                                          onChange={(e) => handleBillEntryChange(idx, 'gr_no', e.target.value)}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono font-bold text-primary text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">P.O. No</label>
                                        <input
                                          type="text"
                                          value={item.po_no}
                                          onChange={(e) => handleBillEntryChange(idx, 'po_no', e.target.value)}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono font-semibold text-foreground text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Challan No</label>
                                        <input
                                          type="text"
                                          value={item.challan_no}
                                          onChange={(e) => handleBillEntryChange(idx, 'challan_no', e.target.value)}
                                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Item Group</label>
                                        <input
                                          type="text"
                                          value={item.item_group}
                                          onChange={(e) => handleBillEntryChange(idx, 'item_group', e.target.value)}
                                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Purchase Category</label>
                                        <input
                                          type="text"
                                          value={item.purchase_category}
                                          onChange={(e) => handleBillEntryChange(idx, 'purchase_category', e.target.value)}
                                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </div>
                                    </div>

                                    {/* BOX 2: PO RATES & DISCOUNTS */}
                                    <div className="space-y-2 p-3 rounded-lg border border-border/80 bg-muted/20">
                                      <h4 className="font-bold text-[11px] uppercase text-muted-foreground border-b border-border/50 pb-1">
                                        PO Rates &amp; Discounts
                                      </h4>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO Basic Rate</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.po_basic_rate}
                                            onChange={(e) => handleBillEntryChange(idx, 'po_basic_rate', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO Disc %</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.po_discount_perc}
                                            onChange={(e) => handleBillEntryChange(idx, 'po_discount_perc', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO Disc Amt</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.po_discount_amt}
                                            onChange={(e) => handleBillEntryChange(idx, 'po_discount_amt', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO Rate</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.po_rate}
                                            onChange={(e) => handleBillEntryChange(idx, 'po_rate', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right font-bold text-xs"
                                          />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 pt-1">
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Bill Disc %</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.bill_discount_perc}
                                            onChange={(e) => handleBillEntryChange(idx, 'bill_discount_perc', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Bill Disc Amt</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.bill_discount_amt}
                                            onChange={(e) => handleBillEntryChange(idx, 'bill_discount_amt', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* BOX 3: FREIGHT & EXTRA CHARGES */}
                                    <div className="space-y-2 p-3 rounded-lg border border-border/80 bg-muted/20">
                                      <h4 className="font-bold text-[11px] uppercase text-muted-foreground border-b border-border/50 pb-1">
                                        Freight &amp; Extra Charges
                                      </h4>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO Excise Duty Rate</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.po_excise_duty_rate}
                                          onChange={(e) => handleBillEntryChange(idx, 'po_excise_duty_rate', Number(e.target.value))}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Loading / Unloading Chgs</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.loading_unloading_chgs}
                                          onChange={(e) => handleBillEntryChange(idx, 'loading_unloading_chgs', Number(e.target.value))}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Freight Chgs</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.freight_chgs}
                                          onChange={(e) => handleBillEntryChange(idx, 'freight_chgs', Number(e.target.value))}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Others Chgs</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.others_chgs}
                                          onChange={(e) => handleBillEntryChange(idx, 'others_chgs', Number(e.target.value))}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                        />
                                      </div>
                                    </div>

                                    {/* BOX 4: TAXES & STATUTORY LEDGER */}
                                    <div className="space-y-2 p-3 rounded-lg border border-border/80 bg-muted/20">
                                      <h4 className="font-bold text-[11px] uppercase text-muted-foreground border-b border-border/50 pb-1">
                                        Taxes &amp; Ledger Posting
                                      </h4>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">VAT Type</label>
                                          <input
                                            type="text"
                                            value={item.vat_type}
                                            onChange={(e) => handleBillEntryChange(idx, 'vat_type', e.target.value)}
                                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Vat OnAll</label>
                                          <select
                                            value={item.vat_on_all ? 'Yes' : 'No'}
                                            onChange={(e) => handleBillEntryChange(idx, 'vat_on_all', e.target.value === 'Yes')}
                                            className="w-full rounded border border-border bg-background px-1 py-1 font-bold text-xs"
                                          >
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO Vat Rate</label>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={item.po_vat_rate}
                                            onChange={(e) => handleBillEntryChange(idx, 'po_vat_rate', Number(e.target.value))}
                                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">Vat Amt</label>
                                          <div className="w-full rounded border border-border bg-muted/60 px-2 py-1 font-mono text-right font-bold text-xs">
                                            ₹{item.vat_amt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-0.5">PO LBT Rate</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.po_lbt_rate}
                                          onChange={(e) => handleBillEntryChange(idx, 'po_lbt_rate', Number(e.target.value))}
                                          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-right text-xs"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-bold uppercase text-primary mb-0.5">Purchase Ledger Add Item Amt</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.purchase_ledger_add_bill_item_amt}
                                          onChange={(e) => handleBillEntryChange(idx, 'purchase_ledger_add_bill_item_amt', Number(e.target.value))}
                                          className="w-full rounded border-2 border-primary/50 bg-background px-2 py-1 font-mono text-right font-bold text-primary text-xs"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 3: BILL FINANCIAL SUMMARY & ROUNDOFF */}
            <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
              <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Bill Financial Totals &amp; Lumpsum Adjustment Summary
              </h3>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Total Gross Amount */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Gross Amount</label>
                  <input
                    type="text"
                    value={`₹${totalGrossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    readOnly
                    className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                  />
                </div>

                {/* Lumpsum Other Charges */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Lumpsum Other Charges</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.lumpsum_other_charges}
                    onChange={(e) => updateHeader('lumpsum_other_charges', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* Lumpsum Loading/Unloading Charges */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Lumpsum Loading/Unloading Charges</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.lumpsum_loading_unloading_charges}
                    onChange={(e) => updateHeader('lumpsum_loading_unloading_charges', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* Lumpsum Freight Charges */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Lumpsum Freight Charges</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.lumpsum_freight_charges}
                    onChange={(e) => updateHeader('lumpsum_freight_charges', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* Total Amount-PB Before Roundoff */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Amount-PB Before Roundoff</label>
                  <input
                    type="text"
                    value={`₹${totalNetBeforeRoundoff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    readOnly
                    className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
                  />
                </div>

                {/* Roundoff Adjustment */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Roundoff Adjustment</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.roundoff_adjustment}
                    onChange={(e) => updateHeader('roundoff_adjustment', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* Total Amount-PB */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount-PB</label>
                  <input
                    type="text"
                    value={`₹${totalAmountPb.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    readOnly
                    className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-base cursor-not-allowed"
                  />
                </div>

                {/* Roundoff Amount */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Roundoff Amount</label>
                  <input
                    type="text"
                    value={`₹${roundoffAmount}`}
                    readOnly
                    className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
                  />
                </div>

                {/* Lump-sum Discount Amount */}
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Lump-sum Discount Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.lumpsum_discount_amount}
                    onChange={(e) => updateHeader('lumpsum_discount_amount', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ADVANCE PAYMENT ENTRIES                                            */}
        {/* ========================================================================= */}
        {activeSectionTab === 'advance_payment' && (
          <div className="space-y-4 rounded-xl border border-border p-5 bg-card shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Advance Payment Entries ({form.advance_payment_entries.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddAdvancePayment}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Advance Payment Row
                </button>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Vendor Advance Adjustment Ledger
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 font-sans">Voucher No</th>
                    <th className="px-3 py-3">Voucher Date</th>
                    <th className="px-3 py-3 font-sans">P.O. No</th>
                    <th className="px-3 py-3 text-right">Advanced Payment</th>
                    <th className="px-3 py-3 text-right">Adjusted Payment</th>
                    <th className="px-3 py-3 text-right">Balance Amt</th>
                    <th className="px-3 py-3 text-right font-bold text-primary">Adjust Amt</th>
                    <th className="px-3 py-3 text-right font-sans">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.advance_payment_entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-center text-xs font-sans text-muted-foreground">
                        No advance payment rows. Click <strong>[+ Add Advance Payment Row]</strong> above to add entries.
                      </td>
                    </tr>
                  ) : (
                    form.advance_payment_entries.map((adv, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Voucher No"
                            value={adv.voucher_no}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'voucher_no', e.target.value)}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={adv.voucher_date}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'voucher_date', e.target.value)}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="P.O. No"
                            value={adv.po_no}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'po_no', e.target.value)}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={adv.advanced_payment}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'advanced_payment', Number(e.target.value))}
                            className="w-28 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-bold text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={adv.adjusted_payment}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'adjusted_payment', Number(e.target.value))}
                            className="w-28 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-bold text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={adv.balance_amt}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'balance_amt', Number(e.target.value))}
                            className="w-28 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-bold text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold text-primary">
                          <input
                            type="number"
                            step="0.01"
                            value={adv.adjust_amt}
                            onChange={(e) => handleAdvancePaymentChange(idx, 'adjust_amt', Number(e.target.value))}
                            className="w-28 rounded border border-primary/50 bg-background px-1.5 py-1 text-right font-mono font-extrabold text-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveAdvancePayment(idx)}
                            className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove advance payment row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1 font-bold">
              <span className="text-muted-foreground uppercase text-[11px]">Total Adjusted Amount</span>
              <span className="font-mono text-sm text-foreground">₹{calculatedTotalAdjustedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 font-extrabold">
              <span className="text-primary uppercase text-xs">Net Amount (Rs.)</span>
              <span className="font-mono text-base text-primary">₹{finalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: PURCHASE BILL PAYMENTS                                            */}
        {/* ========================================================================= */}
        {activeSectionTab === 'bill_payments' && (
          <div className="rounded-xl border border-border p-5 bg-card space-y-4 shadow-2xs">
            <h3 className="font-extrabold uppercase tracking-wider text-foreground text-xs border-b border-border pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Purchase Bill Payments &amp; Tax Settlement Ledger
              </span>
              <span className="text-[11px] font-bold text-muted-foreground">Status: {form.status}</span>
            </h3>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Supplier Bill No* */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-primary mb-1">Supplier Bill No*</label>
                <input
                  type="text"
                  value={form.supplier_bill_no}
                  onChange={(e) => updateHeader('supplier_bill_no', e.target.value)}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-bold text-foreground"
                  required
                />
              </div>

              {/* Supplier Bill Date* */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-primary mb-1">Supplier Bill Date*</label>
                <input
                  type="text"
                  value={form.supplier_bill_date}
                  onChange={(e) => updateHeader('supplier_bill_date', e.target.value)}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                  required
                />
              </div>

              {/* Party Name* */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold uppercase text-primary mb-1">Party Name*</label>
                <input
                  type="text"
                  value={form.party_name}
                  onChange={(e) => updateHeader('party_name', e.target.value)}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                  required
                />
              </div>

              {/* Company Status */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Company Status</label>
                <input
                  type="text"
                  value={form.company_status}
                  onChange={(e) => updateHeader('company_status', e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                />
              </div>

              {/* Bill Amount* */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-primary mb-1">Bill Amount*</label>
                <input
                  type="text"
                  value={`₹${totalAmountPb.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  readOnly
                  className="w-full rounded-lg border-2 border-primary/50 bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                />
              </div>

              {/* Cheque Amount */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Cheque Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cheque_amount}
                  onChange={(e) => updateHeader('cheque_amount', Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                />
              </div>

              {/* Payment Days */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Payment Days (Terms)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.payment_days}
                  onChange={(e) => updateHeader('payment_days', Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                />
              </div>

              {/* Bill Due Date */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Bill Due Date</label>
                <input
                  type="text"
                  value={form.bill_due_date}
                  onChange={(e) => updateHeader('bill_due_date', e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
                />
              </div>

              {/* Auto Debit */}
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="auto_debit_tab"
                  checked={form.auto_debit}
                  onChange={(e) => updateHeader('auto_debit', e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="auto_debit_tab" className="font-bold text-foreground text-xs cursor-pointer">
                  Auto Debit Enabled
                </label>
              </div>

              {/* LBT Payable By Us */}
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="lbt_payable"
                  checked={form.lbt_payable_by_us}
                  onChange={(e) => updateHeader('lbt_payable_by_us', e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                />
                <label htmlFor="lbt_payable" className="font-bold text-foreground text-xs cursor-pointer">
                  LBT Payable By Us
                </label>
              </div>

              {/* Additional Transportation Service Tax Applicable */}
              <div className="flex items-center gap-2 pt-5 sm:col-span-2">
                <input
                  type="checkbox"
                  id="add_trans_stax"
                  checked={form.additional_transportation_service_tax_applicable}
                  onChange={(e) => updateHeader('additional_transportation_service_tax_applicable', e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                />
                <label htmlFor="add_trans_stax" className="font-bold text-foreground text-xs cursor-pointer">
                  Additional Transportation Service Tax Applicable
                </label>
              </div>

              {/* S.Tax Principal Amount & Rates */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">S.Tax Principal Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.stax_principal_amount}
                  onChange={(e) => updateHeader('stax_principal_amount', Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Transportation S.Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.transportation_stax_rate}
                  onChange={(e) => updateHeader('transportation_stax_rate', Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                />
              </div>

              {/* Project Location & Supplier Location */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Location</label>
                <input
                  type="text"
                  value={form.project_location}
                  onChange={(e) => updateHeader('project_location', e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Location</label>
                <input
                  type="text"
                  value={form.supplier_location}
                  onChange={(e) => updateHeader('supplier_location', e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                />
              </div>

              {/* Bill Details Summary Card */}
              <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-border p-4 bg-muted/30 space-y-3 mt-2">
                <h4 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-1.5">
                  Bill Financial Settlement &amp; Narration
                </h4>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-muted-foreground">Total Bill Amount</span>
                    <span className="text-sm font-mono font-extrabold text-foreground">₹{totalAmountPb.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-muted-foreground">Total Cheque Payments</span>
                    <span className="text-sm font-mono font-extrabold text-foreground">₹{form.cheque_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Debit or Credit Details</span>
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <span className="absolute left-2 text-[10px] font-extrabold text-red-500 uppercase">Dr</span>
                        <input
                          type="number"
                          value={form.debit_details || ''}
                          placeholder="0.00"
                          onChange={(e) => updateHeader('debit_details', Number(e.target.value) || 0)}
                          className="w-20 rounded border border-border bg-background pl-7 pr-1 py-1 font-mono text-[11px] font-bold text-foreground focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        />
                      </div>
                      <div className="relative flex items-center">
                        <span className="absolute left-2 text-[10px] font-extrabold text-emerald-500 uppercase">Cr</span>
                        <input
                          type="number"
                          value={form.credit_details || ''}
                          placeholder="0.00"
                          onChange={(e) => updateHeader('credit_details', Number(e.target.value) || 0)}
                          className="w-20 rounded border border-border bg-background pl-7 pr-1 py-1 font-mono text-[11px] font-bold text-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Final Bill Amount</span>
                    <span className="text-base font-mono font-extrabold text-emerald-700 dark:text-emerald-300">₹{finalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Amount in Words */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-primary mb-1">Amount in Words</label>
                  <input
                    type="text"
                    value={amountInWordsStr}
                    readOnly
                    className="w-full rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-200 text-sm"
                  />
                </div>

                {/* Narration */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-primary mb-1">Narration</label>
                  <input
                    type="text"
                    value={form.narration}
                    onChange={(e) => updateHeader('narration', e.target.value)}
                    className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: PAYMENT VOUCHER                                                    */}
        {/* ========================================================================= */}
        {activeSectionTab === 'payment_voucher' && (
          <div className="space-y-4 rounded-xl border border-border p-5 bg-card shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                Payment Voucher Summary (Total {form.payment_vouchers.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      payment_vouchers: [
                        ...prev.payment_vouchers,
                        {
                          sr: prev.payment_vouchers.length + 1,
                          voucher_no: `PV/2026/08${prev.payment_vouchers.length + 5}`,
                          voucher_date: new Date().toISOString().slice(0, 10),
                          ledger_name: form.supplier_name ? `${form.supplier_name} A/C` : 'Vendor Ledger A/C',
                          bank_cash_account: 'HDFC Bank - 8810',
                          payment_mode: 'Bank Transfer / Cheque',
                          cheque_instrument_no: 'CHQ-000000',
                          cheque_instrument_date: new Date().toISOString().slice(0, 10),
                          status: 'Approved',
                          bill_no: form.bill_no_of_supplier || '159',
                          our_bill_no: form.bill_no || 'PB-20260720-0089',
                          current_paid: form.final_bill_amount || 0,
                        },
                      ],
                    }));
                  }}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Payment Voucher Row
                </button>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Current Paid: ₹{form.payment_vouchers.reduce((sum, v) => sum + (v.current_paid || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-center">Sr</th>
                    <th className="px-3 py-3 font-sans">Voucher No</th>
                    <th className="px-3 py-3">Voucher Date</th>
                    <th className="px-3 py-3 font-sans">Ledger Name</th>
                    <th className="px-3 py-3 font-sans">Bank/Cash Account</th>
                    <th className="px-3 py-3 font-sans">Payment Mode</th>
                    <th className="px-3 py-3 font-sans">Cheque / Instrument No.</th>
                    <th className="px-3 py-3">Cheque / Instrument Date</th>
                    <th className="px-3 py-3 font-sans">Status Bill No.</th>
                    <th className="px-3 py-3 font-sans">Our Bill No.</th>
                    <th className="px-3 py-3 text-right">Current Paid</th>
                    <th className="px-3 py-3 text-right font-sans">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.payment_vouchers.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-4 text-center text-xs font-sans text-muted-foreground">
                        Payment Voucher : 0 • Click <strong>[+ Add Payment Voucher Row]</strong> above to record payment vouchers.
                      </td>
                    </tr>
                  ) : (
                    form.payment_vouchers.map((v, vIdx) => (
                      <tr key={v.sr || vIdx} className="hover:bg-muted/30 transition-colors align-middle">
                        <td className="px-2 py-2 text-center font-bold text-muted-foreground">{vIdx + 1}</td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={v.voucher_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].voucher_no = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={v.voucher_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].voucher_date = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={v.ledger_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].ledger_name = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-44 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={v.bank_cash_account}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].bank_cash_account = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-40 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans text-muted-foreground focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={v.payment_mode}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].payment_mode = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-36 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={v.cheque_instrument_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].cheque_instrument_no = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            value={v.cheque_instrument_date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].cheque_instrument_date = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={v.status}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.payment_vouchers];
                                  updated[vIdx].status = val;
                                  return { ...prev, payment_vouchers: updated };
                                });
                              }}
                              className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-emerald-600 focus:outline-none focus:border-primary"
                            />
                            <span className="text-muted-foreground">/</span>
                            <input
                              type="text"
                              value={v.bill_no}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.payment_vouchers];
                                  updated[vIdx].bill_no = val;
                                  return { ...prev, payment_vouchers: updated };
                                });
                              }}
                              className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={v.our_bill_no}
                            onChange={(e) => {
                              const val = e.target.value;
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].our_bill_no = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={v.current_paid}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setForm((prev) => {
                                const updated = [...prev.payment_vouchers];
                                updated[vIdx].current_paid = val;
                                return { ...prev, payment_vouchers: updated };
                              });
                            }}
                            className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-extrabold text-emerald-600 focus:outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                payment_vouchers: prev.payment_vouchers.filter((_, i) => i !== vIdx),
                              }));
                            }}
                            className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove voucher row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: PURCHASE DETAILS                                                   */}
        {/* ========================================================================= */}
        {activeSectionTab === 'purchase_details' && (
          <div className="space-y-6">
            {/* Purchase Terms Header Parameters */}
            <div className="rounded-xl border border-border p-4 bg-card space-y-4 shadow-2xs">
              <h3 className="font-bold uppercase tracking-wider text-muted-foreground text-xs border-b border-border pb-2">
                Purchase Order Terms &amp; Contract Parameters
              </h3>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Name of Company */}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Company</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => updateHeader('company_name', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                  />
                </div>

                {/* Contractor Name */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contractor Name</label>
                  <input
                    type="text"
                    value={form.contractor_name}
                    onChange={(e) => updateHeader('contractor_name', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                  />
                </div>

                {/* Tax Status */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Tax Status</label>
                  <input
                    type="text"
                    value={form.tax_status}
                    onChange={(e) => updateHeader('tax_status', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
                  />
                </div>

                {/* Work Order Type */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Work Order Type</label>
                  <input
                    type="text"
                    value={form.work_order_type}
                    onChange={(e) => updateHeader('work_order_type', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                  />
                </div>

                {/* Work Order No */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Work Order No</label>
                  <input
                    type="text"
                    value={form.work_order_no}
                    onChange={(e) => updateHeader('work_order_no', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-medium text-foreground"
                  />
                </div>

                {/* Area Work Order No */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Area Work Order No</label>
                  <input
                    type="text"
                    value={form.area_work_order_no}
                    onChange={(e) => updateHeader('area_work_order_no', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                  />
                </div>

                {/* Perc (%) */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Perc (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.perc}
                    onChange={(e) => updateHeader('perc', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* Sub Project */}
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Sub Project</label>
                  <input
                    type="text"
                    value={form.sub_project}
                    onChange={(e) => updateHeader('sub_project', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* PO Details All Table */}
            <div className="space-y-3 rounded-xl border border-border p-4 bg-card shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Purchase Order Details All (Total {form.po_details_all.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        po_details_all: [
                          ...prev.po_details_all,
                          {
                            sr: prev.po_details_all.length + 1,
                            po_no: form.from_pos || 'TI/PR/PO/2026/0021',
                            po_date: new Date().toISOString().slice(0, 10),
                            po_in_the_name_of: form.supplier_name || 'MODERN ENGINEERING CO.',
                            net_bill_amt: 0,
                            sr_item_group: 'General Material',
                            item_desc: 'New Item Entry',
                            item_brand: 'Brand',
                            approved_qty: 1,
                            unit_rate: 0,
                            net_amt: 0,
                            grn_balance_qty: 0,
                          },
                        ],
                      }));
                    }}
                    className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add PO Detail Row
                  </button>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Add / Edit Options Available
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3 font-sans">P.O. No.</th>
                      <th className="px-3 py-3">P.O. Date</th>
                      <th className="px-3 py-3 font-sans">PO in the name of</th>
                      <th className="px-3 py-3 text-right">Net Bill Amt</th>
                      <th className="px-3 py-3 font-sans">Item Group</th>
                      <th className="px-3 py-3 font-sans min-w-[180px]">Item Desc</th>
                      <th className="px-3 py-3 font-sans">Item Specification</th>
                      <th className="px-3 py-3 text-right">Approved Qty</th>
                      <th className="px-3 py-3 text-right">Unit Rate</th>
                      <th className="px-3 py-3 text-right font-bold text-foreground">Net Amt</th>
                      <th className="px-3 py-3 text-right">GRN Balance Qty</th>
                      <th className="px-3 py-3 text-right font-sans">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.po_details_all.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-3 py-4 text-center text-xs font-sans text-muted-foreground">
                          No Purchase Order details available. Click <strong>[+ Add PO Detail Row]</strong> above to add entries.
                        </td>
                      </tr>
                    ) : (
                      form.po_details_all.map((poDet, pIdx) => (
                        <tr key={poDet.sr || pIdx} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                          <td className="px-2 py-2 text-center font-bold text-muted-foreground">{pIdx + 1}</td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={poDet.po_no}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].po_no = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              value={poDet.po_date}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].po_date = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={poDet.po_in_the_name_of}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].po_in_the_name_of = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-48 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={poDet.net_bill_amt}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].net_bill_amt = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-bold focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={poDet.sr_item_group}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].sr_item_group = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-semibold text-muted-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={poDet.item_desc}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].item_desc = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-48 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={poDet.item_brand}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].item_brand = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={poDet.approved_qty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].approved_qty = val;
                                  updated[pIdx].net_amt = val * (updated[pIdx].unit_rate || 0);
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right font-extrabold text-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={poDet.unit_rate}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].unit_rate = val;
                                  updated[pIdx].net_amt = (updated[pIdx].approved_qty || 0) * val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-bold focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2 text-right font-extrabold text-foreground bg-emerald-500/5">
                            ₹{(poDet.net_amt || (poDet.approved_qty * poDet.unit_rate)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={poDet.grn_balance_qty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setForm((prev) => {
                                  const updated = [...prev.po_details_all];
                                  updated[pIdx].grn_balance_qty = val;
                                  return { ...prev, po_details_all: updated };
                                });
                              }}
                              className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right font-bold text-muted-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  po_details_all: prev.po_details_all.filter((_, i) => i !== pIdx),
                                }));
                              }}
                              className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Remove row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* GRN Remarks List Table */}
            <div className="space-y-4 rounded-xl border border-border p-4 bg-card shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  GRN Remarks : Total {form.grn_remarks_list.length}
                </h3>
                <button
                  type="button"
                  onClick={handleAddGrnRemark}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add GRN Remark Row
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 text-center">Sr</th>
                      <th className="px-3 py-3 font-sans">GRN No</th>
                      <th className="px-3 py-3 font-sans min-w-[260px]">Remark</th>
                      <th className="px-3 py-3 text-right font-sans">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.grn_remarks_list.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-xs font-sans text-muted-foreground">
                          No GRN remarks recorded. Click <strong>[+ Add GRN Remark Row]</strong> above to add.
                        </td>
                      </tr>
                    ) : (
                      form.grn_remarks_list.map((grnRem, rIdx) => (
                        <tr key={rIdx} className="hover:bg-muted/30 transition-colors align-middle">
                          <td className="px-3 py-2 text-center font-bold text-muted-foreground">{rIdx + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={grnRem.grn_no}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.grn_remarks_list];
                                  updated[rIdx].grn_no = val;
                                  return { ...prev, grn_remarks_list: updated };
                                });
                              }}
                              className="w-36 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={grnRem.remark}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.grn_remarks_list];
                                  updated[rIdx].remark = val;
                                  return { ...prev, grn_remarks_list: updated };
                                });
                              }}
                              className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-medium text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveGrnRemark(rIdx)}
                              className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Remove GRN remark"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: SHIPPING BILL DETAILS                                             */}
        {/* ========================================================================= */}
        {activeSectionTab === 'shipping_details' && (
          <div className="rounded-xl border border-border p-5 bg-card space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" /> Shipping Bill, LR / Balty &amp; Logistics Details
              </h3>
              <span className="text-[11px] font-semibold text-muted-foreground font-mono">
                Challans: {form.from_challans || 'None Selected'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Transport LR / Balty No</label>
                <input
                  type="text"
                  placeholder="LR-2026-881"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vehicle No</label>
                <input
                  type="text"
                  placeholder="GJ-05-XX-1234"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">E-Way Bill Number</label>
                <input
                  type="text"
                  placeholder="EWB-3910293019"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: SUMMARY POSTING DETAILS                                            */}
        {/* ========================================================================= */}
        {activeSectionTab === 'summary_posting' && (
          <div className="space-y-6">
            {/* Financial KPI Breakdown */}
            <div className="rounded-xl border border-border p-5 bg-card space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" /> Financial Summary &amp; General Ledger Posting Breakdown
                </h3>
                <span className="text-[11px] font-semibold text-primary font-mono font-extrabold">
                  Grand Net: ₹{totalAmountPb.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Gross Amount</span>
                  <span className="font-mono font-extrabold text-foreground text-sm">
                    ₹{totalGrossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Total Taxes (VAT/GST)</span>
                  <span className="font-mono font-extrabold text-foreground text-sm">
                    ₹{(form.purchase_bill_entries.reduce((sum, i) => sum + i.vat_amt, 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Round Off Adjustment</span>
                  <span className="font-mono font-extrabold text-foreground text-sm">
                    {roundoffAmount >= 0 ? `+₹${roundoffAmount.toFixed(2)}` : `-₹${Math.abs(roundoffAmount).toFixed(2)}`}
                  </span>
                </div>
                <div className="p-3 rounded-lg border border-primary/40 bg-primary/5">
                  <span className="block text-[10px] font-bold uppercase text-primary">Net Payable Ledger Total</span>
                  <span className="font-mono font-extrabold text-primary text-sm">
                    ₹{totalAmountPb.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Audit & Indicator Fields */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 pt-4 border-t border-border mt-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Unlocked FY</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unlocked_fy}
                    onChange={(e) => updateHeader('unlocked_fy', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Ledger Present</label>
                  <input
                    type="number"
                    value={form.ledger_present}
                    onChange={(e) => updateHeader('ledger_present', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Not a Valid Bill No</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.not_a_valid_bill_no}
                    onChange={(e) => updateHeader('not_a_valid_bill_no', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="bill_signed_tab"
                    checked={form.bill_has_already_signed}
                    onChange={(e) => updateHeader('bill_has_already_signed', e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary cursor-pointer"
                  />
                  <label htmlFor="bill_signed_tab" className="font-bold text-foreground text-xs cursor-pointer">
                    Bill has Already Signed
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Status Issue Relation Count</label>
                  <input
                    type="text"
                    value={form.status_issue_relation_count}
                    onChange={(e) => updateHeader('status_issue_relation_count', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Ledger Posting Info Table */}
            <div className="space-y-3 rounded-xl border border-border p-4 bg-card shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-emerald-600" />
                  Ledger Posting Info ({form.ledger_posting_info.length})
                </h3>
                <button
                  type="button"
                  onClick={handleAddLedgerPosting}
                  className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Ledger Entry
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 font-sans">ID</th>
                      <th className="px-3 py-3">DATE</th>
                      <th className="px-3 py-3 font-sans">LEDGER MAIN</th>
                      <th className="px-3 py-3 font-sans">LEDGER GROUP</th>
                      <th className="px-3 py-3 font-sans">ACCOUNT HEAD</th>
                      <th className="px-3 py-3 font-sans">PROJECT</th>
                      <th className="px-3 py-3 text-right">DR</th>
                      <th className="px-3 py-3 text-right">CR</th>
                      <th className="px-3 py-3 text-right font-sans">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.ledger_posting_info.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-4 text-center text-xs font-sans text-muted-foreground">
                          No ledger posting entries. Click <strong>[+ Add Ledger Entry]</strong> above to add.
                        </td>
                      </tr>
                    ) : (
                      form.ledger_posting_info.map((leg, lIdx) => (
                        <tr key={lIdx} className="hover:bg-muted/30 transition-colors align-middle">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={leg.id}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].id = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-24 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={leg.date}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].date = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={leg.ledger_main}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].ledger_main = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-36 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={leg.ledger_group}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].ledger_group = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-36 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-medium text-muted-foreground"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={leg.account_head}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].account_head = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-32 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-medium text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={leg.project}
                              onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].project = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-semibold text-foreground"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={leg.dr}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].dr = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-bold text-emerald-600"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={leg.cr}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setForm((prev) => {
                                  const updated = [...prev.ledger_posting_info];
                                  updated[lIdx].cr = val;
                                  return { ...prev, ledger_posting_info: updated };
                                });
                              }}
                              className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-bold text-blue-600"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveLedgerPosting(lIdx)}
                              className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Remove ledger entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Right Corner Amount Calculation */}
              <div className="flex justify-end pt-2">
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-right font-mono text-xs shadow-xs space-y-1">
                  <div className="font-extrabold text-foreground">
                    Total DR: <span className="text-emerald-600">₹{totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="font-extrabold text-foreground">
                    Total CR: <span className="text-blue-600">₹{totalCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="border-t border-border pt-1 font-black text-primary">
                    Total: ₹{totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* FORM ACTION BUTTONS & FOOTER                                              */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-4">
            {/* PRINT BUTTON AT BOTTOM LEFT CORNER */}
            <button
              type="button"
              onClick={onPrint || (() => printPurchaseBillReport(form))}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print
            </button>

            <div className="text-xs font-bold text-muted-foreground">
              Final Bill Settlement: <span className="font-mono text-sm text-primary font-extrabold">₹{finalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              const activeStatus = normalizeStatus(form.status);
              if (activeStatus === 'Pending Verification') {
                return (
                  <>
                    <button
                      type="button"
                      onClick={onCancel}
                      className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Close
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const draftForm = { ...form, status: 'Draft' as const };
                        setForm(draftForm);
                        onSubmit(draftForm);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer shadow-2xs"
                    >
                      <FileText className="h-4 w-4" /> Return to Draft
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const approvedForm = { ...form, status: 'Approved' as const };
                        setForm(approvedForm);
                        onSubmit(approvedForm);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                  </>
                );
              }

              if (activeStatus === 'Approved') {
                return (
                  <>
                    <button
                      type="button"
                      onClick={onCancel}
                      className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Close
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const verForm = { ...form, status: 'Pending Verification' as const };
                        setForm(verForm);
                        onSubmit(verForm);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition-all cursor-pointer shadow-2xs"
                    >
                      <Send className="h-4 w-4" /> Back to Verification
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const approvedForm = { ...form, status: 'Approved' as const };
                        setForm(approvedForm);
                        onSubmit(approvedForm);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Re-approve
                    </button>
                  </>
                );
              }

              // Default: Draft / New Form Creation
              return (
                <>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const draftForm = { ...form, status: 'Draft' as const };
                      setForm(draftForm);
                      onSubmit(draftForm);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer shadow-2xs"
                  >
                    <Save className="h-4 w-4" /> Save Draft
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const verForm = { ...form, status: 'Pending Verification' as const };
                      setForm(verForm);
                      onSubmit(verForm);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer"
                  >
                    <Send className="h-4 w-4" /> Send to Verification
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      </form>

      {/* Multi-PO Selection Slide-Over Modal */}
      <BillsPoPickerModal
        isOpen={showPoPickerModal}
        onClose={() => setShowPoPickerModal(false)}
        approvedPos={approvedPoOptions}
        selectedPoNumbers={form.from_pos.split(',').map((s) => s.trim()).filter(Boolean)}
        onConfirmSelection={handleConfirmPoSelection}
      />

      {/* Multi-GRN & Item Selection Slide-Over Modal */}
      <BillsGrnItemPickerModal
        isOpen={showGrnItemPickerModal}
        onClose={() => setShowGrnItemPickerModal(false)}
        approvedGrns={approvedGrnOptions}
        alreadySelectedItems={selectedGrnItems}
        onConfirmSelection={handleConfirmGrnItemSelection}
      />
    </div>
  );
}
