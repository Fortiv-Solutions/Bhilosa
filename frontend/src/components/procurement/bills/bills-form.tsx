'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import type { VendorBillRow } from './bills-stats-bar';

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

export interface BillEntryLine {
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
}

export interface FullBillsFormState {
  // Header Fields (in exact specified order)
  bill_no: string;
  bill_received_date: string;
  accounting_date: string;
  bill_no_of_supplier: string;
  bill_date_of_supplier: string;
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

  // Section 2: Purchase Bills Entries Table
  purchase_bill_entries: BillEntryLine[];

  // Section 3: Bill Financial Summary & Roundoff
  lumpsum_other_charges: number;
  lumpsum_loading_unloading_charges: number;
  lumpsum_freight_charges: number;
  roundoff_adjustment: number;
  lumpsum_discount_amount: number;

  // Section 4: Advance Payment Entries Sub-Section
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

  // Section 5: Purchase Bill Payments Section
  supplier_bill_no: string;
  supplier_bill_date: string;
  party_name: string;
  company_status: string;
  cheque_amount: number;
  lbt_payable_by_us: boolean;
  additional_transportation_service_tax_applicable: boolean;
  stax_principal_amount: number;
  transportation_stax_rate: number;
  stax_amount: number;
  project_location: string;
  supplier_location: string;
  lbt_principal_amount: number;
  lbt_tax_rate: number;
  lbt_amount: number;
  total_bill_amount: number;
  total_cheque_payments: number;
  debit_details: number;
  credit_details: number;
  final_bill_amount: number;
  narration: string;

  // Section 6: Payment Voucher Table
  payment_vouchers: {
    sr: number;
    voucher_no: string;
    voucher_date: string;
    ledger_name: string;
    bank_cash_account: string;
    payment_mode: string;
    cheque_instrument_no: string;
    cheque_instrument_date: string;
    status: string;
    bill_no: string;
    our_bill_no: string;
    current_paid: number;
  }[];

  // Section 7: Purchase Order Details All Table
  po_details_all: {
    sr: number;
    po_no: string;
    po_date: string;
    po_in_the_name_of: string;
    net_bill_amt: number;
    sr_item_group: string;
    item_desc: string;
    item_brand: string;
    approved_qty: number;
    unit_rate: number;
    net_amt: number;
    grn_balance_qty: number;
  }[];

  status: '3_way_matched' | 'pending_verification' | 'discrepancy';
}

interface BillsFormProps {
  bill: VendorBillRow;
  onSubmit: (formData: FullBillsFormState) => void;
  /** Generates the report-format Purchase Bill PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

export function BillsForm({ bill, onSubmit, onPrint, onCancel }: BillsFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState<FullBillsFormState>(() => ({
    // 1. Header Fields
    bill_no: bill.invoice_no || 'PB-20260720-0089',
    bill_received_date: '2026-07-20',
    accounting_date: `${todayStr}T18:17`,
    bill_no_of_supplier: '159',
    bill_date_of_supplier: '2026-07-14',
    project_name: bill.project_name || 'Pramukh Revanta',
    company_name: 'TANVI INFRACON PROJECT REVANTA',
    supplier_name: bill.vendor_name || 'MODERN ENGINEERING CO.',
    tax_status: 'Regular GST Registered',
    contractor_name: '',
    work_order_type: 'Purchase Material Supply',
    work_order_no: '',
    area_work_order_no: '',
    perc: 0.0,
    auto_debit: false,
    sub_project: 'Phase 1 Structural',
    from_pos: bill.po_number || 'TI/PR/PO/2026/0021',
    from_challans: bill.grn_no || '159',
    payment_days: 30.0,
    bill_due_date: defaultDueDate,

    // 2. Purchase Bills Entries Table
    purchase_bill_entries: [
      {
        sr_no: 1,
        gr_no: 'TI/PRGRN202600025',
        po_no: 'TI/PR/PO/2026/0021',
        challan_no: '159',
        item_group: 'Pumps & Plumbing',
        item_desc: 'Hydropneumatics Pump Connection Line Assembly',
        item_brand: 'Modern Eng',
        unit: 'NOS',
        received_qty: 12,
        purchase_category: 'Direct Material',
        po_basic_rate: 6020.83,
        po_discount_perc: 0,
        po_discount_amt: 0,
        po_rate: 6020.83,
        bill_rate: 6020.83,
        bill_discount_perc: 0,
        bill_discount_amt: 0,
        gross_amount: 72250.0,
        po_excise_duty_rate: 0,
        loading_unloading_chgs: 0,
        freight_chgs: 1950.0,
        others_chgs: 0,
        vat_type: 'GST',
        vat_on_all: true,
        po_vat_rate: 18,
        vat_amt: 13356.0,
        po_lbt_rate: 0,
        net_amount: 87556.0,
        purchase_ledger_add_bill_item_amt: 87556.0,
      },
    ],

    // 3. Bill Financial Summary
    lumpsum_other_charges: 0.0,
    lumpsum_loading_unloading_charges: 0.0,
    lumpsum_freight_charges: 1950.0,
    roundoff_adjustment: 0.0,
    lumpsum_discount_amount: 0.0,

    // 4. Advance Payment Entries
    advance_payment_entries: [],
    total_adjusted_amount: 0.0,

    // 5. Purchase Bill Payments Section
    supplier_bill_no: '159',
    supplier_bill_date: '2026-07-14',
    party_name: bill.vendor_name || 'MODERN ENGINEERING CO.',
    company_status: 'PARTNERSHIP FIRM',
    cheque_amount: 87556.0,
    lbt_payable_by_us: false,
    additional_transportation_service_tax_applicable: false,
    stax_principal_amount: 0.0,
    transportation_stax_rate: 0.0,
    stax_amount: 0.0,
    project_location: 'Vesu',
    supplier_location: 'Surat',
    lbt_principal_amount: 0.0,
    lbt_tax_rate: 0.0,
    lbt_amount: 0.0,
    total_bill_amount: 87556.0,
    total_cheque_payments: 87556.0,
    debit_details: 0.0,
    credit_details: 0.0,
    final_bill_amount: 87556.0,
    narration: 'MATERIAL RECEIVED BY DIVYESH',

    // 6. Payment Voucher Table
    payment_vouchers: [
      {
        sr: 1,
        voucher_no: 'PV/2026/084',
        voucher_date: '2026-07-20',
        ledger_name: 'Modern Engineering A/C',
        bank_cash_account: 'HDFC Bank - 8810',
        payment_mode: 'HDFC Cheque / NEFT',
        cheque_instrument_no: 'CHQ-448102',
        cheque_instrument_date: '2026-07-20',
        status: 'Approved',
        bill_no: '159',
        our_bill_no: bill.invoice_no || 'PB-20260720-0089',
        current_paid: 87556.0,
      },
    ],

    // 7. Purchase Order Details All Table
    po_details_all: [
      {
        sr: 1,
        po_no: 'TI/PR/PO/2026/0021',
        po_date: '2026-07-10',
        po_in_the_name_of: 'MODERN ENGINEERING CO.',
        net_bill_amt: 87556.0,
        sr_item_group: 'Pumps & Plumbing',
        item_desc: 'Hydropneumatics Pump Connection Line Assembly',
        item_brand: 'Modern Eng',
        approved_qty: 12,
        unit_rate: 6020.83,
        net_amt: 72250.0,
        grn_balance_qty: 0,
      },
    ],

    status: (bill.matching_status as FullBillsFormState['status']) || '3_way_matched',
  }));

  const updateHeader = <K extends keyof FullBillsFormState>(key: K, value: FullBillsFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBillEntryChange = (index: number, field: keyof BillEntryLine, value: any) => {
    setForm((prev) => {
      const updated = [...prev.purchase_bill_entries];
      const current = { ...updated[index], [field]: value };

      if (field === 'received_qty' || field === 'bill_rate' || field === 'bill_discount_perc' || field === 'freight_chgs') {
        const qty = Number(current.received_qty || 0);
        const bRate = Number(current.bill_rate || 0);
        const bDisc = Number(current.bill_discount_perc || 0);
        const frt = Number(current.freight_chgs || 0);

        const discAmt = (bRate * bDisc) / 100;
        const gross = qty * (bRate - discAmt);
        const tax = (gross * 0.18);
        const net = gross + tax + frt;

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

  // Financial Calculations
  const totalGrossAmount = form.purchase_bill_entries.reduce((sum, i) => sum + i.gross_amount, 0);
  const totalNetBeforeRoundoff = totalGrossAmount + form.purchase_bill_entries.reduce((sum, i) => sum + i.vat_amt, 0) + form.lumpsum_freight_charges + form.lumpsum_loading_unloading_charges + form.lumpsum_other_charges - form.lumpsum_discount_amount;
  const totalAmountPb = Math.round(totalNetBeforeRoundoff);
  const roundoffAmount = Number((totalAmountPb - totalNetBeforeRoundoff).toFixed(2));
  const finalBillAmount = totalAmountPb - form.total_adjusted_amount;
  const amountInWordsStr = numberToWords(finalBillAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Form Header */}
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-primary" /> Print Report
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Exact Field Order as Specified)                 */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Invoice Identification &amp; Vendor Header Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Bill No */}
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

            {/* 2. Bill Received Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Bill Received Date</label>
              <input
                type="text"
                value={form.bill_received_date}
                onChange={(e) => updateHeader('bill_received_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* 3. Accounting Date* */}
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

            {/* 4. Bill No of Supplier* */}
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

            {/* 5. Bill Date of Supplier* */}
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

            {/* 6. Project Name* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Project Name*</label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => updateHeader('project_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 7. Name of Company */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Company</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateHeader('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 8. Supplier Name* */}
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

            {/* 9. Tax Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Tax Status</label>
              <input
                type="text"
                value={form.tax_status}
                onChange={(e) => updateHeader('tax_status', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* 10. Contractor Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contractor Name</label>
              <input
                type="text"
                value={form.contractor_name}
                onChange={(e) => updateHeader('contractor_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 11. Work Order Type */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Work Order Type</label>
              <input
                type="text"
                value={form.work_order_type}
                onChange={(e) => updateHeader('work_order_type', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 12. Work Order No */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Work Order No</label>
              <input
                type="text"
                value={form.work_order_no}
                onChange={(e) => updateHeader('work_order_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-medium text-foreground"
              />
            </div>

            {/* 13. Area Work Order No */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Area Work Order No</label>
              <input
                type="text"
                value={form.area_work_order_no}
                onChange={(e) => updateHeader('area_work_order_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 14. Perc */}
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

            {/* 15. Auto Debit */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="auto_debit"
                checked={form.auto_debit}
                onChange={(e) => updateHeader('auto_debit', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="auto_debit" className="font-bold text-foreground text-xs cursor-pointer">
                Auto Debit
              </label>
            </div>

            {/* 16. Sub Project */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Sub Project</label>
              <input
                type="text"
                value={form.sub_project}
                onChange={(e) => updateHeader('sub_project', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 17. From POs* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">From POs*</label>
              <input
                type="text"
                value={form.from_pos}
                onChange={(e) => updateHeader('from_pos', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary"
                required
              />
            </div>

            {/* 18. From Challans* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">From Challans*</label>
              <input
                type="text"
                value={form.from_challans}
                onChange={(e) => updateHeader('from_challans', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-foreground"
                required
              />
            </div>

            {/* 19. Payment Days */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Payment Days</label>
              <input
                type="number"
                step="0.01"
                value={form.payment_days}
                onChange={(e) => updateHeader('payment_days', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 20. Bill Due Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Bill Due Date</label>
              <input
                type="text"
                value={form.bill_due_date}
                onChange={(e) => updateHeader('bill_due_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: PURCHASE BILLS ENTRIES TABLE (29 Columns)                      */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              2. Purchase Bills Entries Table ({form.purchase_bill_entries.length})
            </h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Rate Variance &amp; Financial Ledger Posting Audit
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-3 font-bold text-center w-12">1. Sr No</th>
                  <th className="px-3 py-3 min-w-[130px]">2. G.R. No</th>
                  <th className="px-3 py-3 min-w-[130px]">3. P.O. No</th>
                  <th className="px-3 py-3 min-w-[100px]">4. Challan No</th>
                  <th className="px-3 py-3 min-w-[130px]">5. Item Group</th>
                  <th className="px-3 py-3 min-w-[180px]">6. Item Desc</th>
                  <th className="px-3 py-3 min-w-[120px]">7. Item Brand</th>
                  <th className="px-3 py-3 text-center min-w-[80px]">8. Unit</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">9. Received Qty</th>
                  <th className="px-3 py-3 min-w-[130px]">10. Purchase Category</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">11. PO- Basic Rate</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">12. PO- Discount Perc.</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">13. PO- Discount Amt</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">14. PO- Rate</th>
                  <th className="px-3 py-3 font-bold text-primary text-right min-w-[110px]">15. Bill Rate*</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">16. Bill Discount Perc.</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">17. Bill Discount Amt</th>
                  <th className="px-3 py-3 text-right font-bold text-foreground min-w-[110px]">18. Gross Amount</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">19. PO- Excise Duty Rate</th>
                  <th className="px-3 py-3 text-right min-w-[120px]">20. Loading / Unloading Chgs</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">21. Freight Chgs</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">22. Others Chgs</th>
                  <th className="px-3 py-3 min-w-[90px]">23. VAT Type</th>
                  <th className="px-3 py-3 text-center min-w-[90px]">24. Vat OnAll</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">25. PO- Vat Rate</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">26. Vat Amt</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">27. PO- LBT Rate</th>
                  <th className="px-3 py-3 text-right font-bold text-foreground min-w-[120px]">28. Net Amount</th>
                  <th className="px-3 py-3 text-right min-w-[150px]">29. Purchase Ledger Add Bill Item Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.purchase_bill_entries.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                    <td className="px-3 py-2 text-center font-bold text-muted-foreground">{item.sr_no}</td>
                    <td className="px-3 py-2 font-sans font-bold text-primary">{item.gr_no}</td>
                    <td className="px-3 py-2 font-sans font-semibold text-foreground">{item.po_no}</td>
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.challan_no}</td>
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.item_group}</td>
                    <td className="px-3 py-2 font-sans font-bold text-foreground">{item.item_desc}</td>
                    <td className="px-3 py-2 font-sans font-bold text-foreground">{item.item_brand}</td>
                    <td className="px-3 py-2 text-center font-sans font-bold text-muted-foreground">{item.unit}</td>
                    <td className="px-3 py-2 text-right font-extrabold text-foreground">{item.received_qty}</td>
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.purchase_category}</td>
                    <td className="px-3 py-2 text-right font-semibold">₹{item.po_basic_rate.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{item.po_discount_perc}%</td>
                    <td className="px-3 py-2 text-right">₹{item.po_discount_amt}</td>
                    <td className="px-3 py-2 text-right font-bold">₹{item.po_rate.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.bill_rate}
                        onChange={(e) => handleBillEntryChange(idx, 'bill_rate', Number(e.target.value))}
                        className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-extrabold text-primary"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{item.bill_discount_perc}%</td>
                    <td className="px-3 py-2 text-right">₹{item.bill_discount_amt}</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">₹{item.gross_amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{item.po_excise_duty_rate}%</td>
                    <td className="px-3 py-2 text-right">₹{item.loading_unloading_chgs}</td>
                    <td className="px-3 py-2 text-right">₹{item.freight_chgs}</td>
                    <td className="px-3 py-2 text-right">₹{item.others_chgs}</td>
                    <td className="px-3 py-2 font-sans">{item.vat_type}</td>
                    <td className="px-3 py-2 text-center">{item.vat_on_all ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-right">{item.po_vat_rate}%</td>
                    <td className="px-3 py-2 text-right">₹{item.vat_amt.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{item.po_lbt_rate}%</td>
                    <td className="px-3 py-2 text-right font-extrabold text-foreground">₹{item.net_amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-bold text-primary">₹{item.purchase_ledger_add_bill_item_amt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: BILL FINANCIAL SUMMARY & ROUNDOFF                              */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            3. Bill Financial Totals &amp; Lumpsum Adjustment Summary
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

        {/* ========================================================================= */}
        {/* SECTION 4: ADVANCE PAYMENT ENTRIES SUB-SECTION                            */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              4. Advance Payment Entries ({form.advance_payment_entries.length})
            </h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Vendor Advance Adjustment Ledger
            </span>
          </div>

          {form.advance_payment_entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No advance payments adjusted against this purchase bill. Total Adjusted Amount: ₹0.00
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 font-sans">1. Voucher No</th>
                    <th className="px-3 py-3">2. Voucher Date</th>
                    <th className="px-3 py-3 font-sans">3. P.O. No</th>
                    <th className="px-3 py-3 text-right">4. Advanced Payment</th>
                    <th className="px-3 py-3 text-right">5. Adjusted Payment</th>
                    <th className="px-3 py-3 text-right">6. Balance Amt</th>
                    <th className="px-3 py-3 text-right font-bold text-primary">7. Adjust Amt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.advance_payment_entries.map((adv, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                      <td className="px-3 py-2 font-bold font-sans text-primary">{adv.voucher_no}</td>
                      <td className="px-3 py-2 text-muted-foreground">{adv.voucher_date}</td>
                      <td className="px-3 py-2 font-bold font-sans text-foreground">{adv.po_no}</td>
                      <td className="px-3 py-2 text-right">₹{adv.advanced_payment.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">₹{adv.adjusted_payment.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">₹{adv.balance_amt.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-extrabold text-primary">₹{adv.adjust_amt.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 font-bold">
            <span className="text-muted-foreground uppercase text-[11px]">Total Adjusted Amount</span>
            <span className="font-mono text-sm text-foreground">₹{form.total_adjusted_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 font-extrabold">
            <span className="text-primary uppercase text-xs">Net Amount (Rs.)</span>
            <span className="font-mono text-base text-primary">₹{finalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 5: PURCHASE BILL PAYMENTS SECTION (Bold Title)                     */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-4">
          <h3 className="font-extrabold uppercase tracking-wider text-foreground text-xs border-b border-border pb-2 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-600" />
            5. Purchase Bill Payments &amp; Tax Settlement Ledger
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

            {/* LBT Payable By Us */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="lbt_payable"
                checked={form.lbt_payable_by_us}
                onChange={(e) => updateHeader('lbt_payable_by_us', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
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
                className="h-4 w-4 rounded border-border text-primary"
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
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-border p-4 bg-muted/30 space-y-3">
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
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Debit / Credit Details</span>
                  <span className="text-sm font-mono font-bold text-foreground">Dr 0.00 | Cr 0.00</span>
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

        {/* ========================================================================= */}
        {/* SECTION 6: PAYMENT VOUCHER TABLE                                          */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              6. Payment Voucher Summary (Total {form.payment_vouchers.length})
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
                className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all"
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
                      <td className="px-3 py-2 text-center font-bold text-muted-foreground">{vIdx + 1}</td>
                      <td className="px-3 py-2 font-bold font-sans text-primary">
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
                          className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary"
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{v.voucher_date}</td>
                      <td className="px-3 py-2 font-bold font-sans text-foreground">{v.ledger_name}</td>
                      <td className="px-3 py-2 font-sans text-muted-foreground">{v.bank_cash_account}</td>
                      <td className="px-3 py-2 font-sans font-bold">{v.payment_mode}</td>
                      <td className="px-3 py-2 font-sans">{v.cheque_instrument_no}</td>
                      <td className="px-3 py-2 text-muted-foreground">{v.cheque_instrument_date}</td>
                      <td className="px-3 py-2 font-sans font-bold text-emerald-600">{v.status} / {v.bill_no}</td>
                      <td className="px-3 py-2 font-sans font-bold text-foreground">{v.our_bill_no}</td>
                      <td className="px-3 py-2 text-right font-extrabold text-foreground">
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
                          className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right font-mono font-extrabold text-emerald-600"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              payment_vouchers: prev.payment_vouchers.filter((_, i) => i !== vIdx),
                            }));
                          }}
                          className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
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

        {/* ========================================================================= */}
        {/* SECTION 7: PURCHASE ORDER DETAILS ALL                                      */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              7. Purchase Order Details All (Total {form.po_details_all.length})
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
                className="inline-flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all"
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
                  <th className="px-3 py-3 text-center">1. Sr</th>
                  <th className="px-3 py-3 font-sans">2. P.O. No.</th>
                  <th className="px-3 py-3">3. P.O. Date</th>
                  <th className="px-3 py-3 font-sans">4. PO in the name of</th>
                  <th className="px-3 py-3 text-right">5. Net Bill Amt</th>
                  <th className="px-3 py-3 font-sans">6. Item Group</th>
                  <th className="px-3 py-3 font-sans min-w-[180px]">7. Item Desc</th>
                  <th className="px-3 py-3 font-sans">8. Item Brand</th>
                  <th className="px-3 py-3 text-right">9. Approved Qty</th>
                  <th className="px-3 py-3 text-right">10. Unit Rate</th>
                  <th className="px-3 py-3 text-right font-bold text-foreground">11. Net Amt</th>
                  <th className="px-3 py-3 text-right">12. GRN Balance Qty</th>
                  <th className="px-3 py-3 text-right font-sans">13. Actions</th>
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
                    <tr key={poDet.sr || pIdx} className="hover:bg-muted/30 transition-colors align-middle">
                      <td className="px-3 py-2 text-center font-bold text-muted-foreground">{pIdx + 1}</td>
                      <td className="px-3 py-2">
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
                          className="w-28 rounded border border-border bg-background px-1.5 py-1 text-xs font-mono font-bold text-primary"
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{poDet.po_date}</td>
                      <td className="px-3 py-2 font-bold font-sans text-foreground">{poDet.po_in_the_name_of}</td>
                      <td className="px-3 py-2 text-right font-bold">₹{poDet.net_bill_amt.toLocaleString()}</td>
                      <td className="px-3 py-2 font-sans font-semibold text-muted-foreground">{poDet.sr_item_group}</td>
                      <td className="px-3 py-2">
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
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs font-sans font-bold text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2 font-sans font-bold text-foreground">{poDet.item_brand}</td>
                      <td className="px-3 py-2 text-right font-extrabold text-foreground">{poDet.approved_qty}</td>
                      <td className="px-3 py-2 text-right font-bold">₹{poDet.unit_rate.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-extrabold text-foreground">₹{poDet.net_amt.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-bold text-muted-foreground">{poDet.grn_balance_qty}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              po_details_all: prev.po_details_all.filter((_, i) => i !== pIdx),
                            }));
                          }}
                          className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
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

        {/* Form Action Buttons */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="text-xs font-bold text-muted-foreground">
            Final Bill Settlement: <span className="font-mono text-sm text-primary font-extrabold">₹{finalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all"
            >
              <CheckCircle2 className="h-4 w-4" /> Save Purchase Bill &amp; Post to Financial Ledger
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
