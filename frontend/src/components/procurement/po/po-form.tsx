'use client';

import React, { useState } from 'react';
import {
  ShoppingBag,
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
  FileText,
  HelpCircle,
  Printer,
} from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';

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

export interface PoLineItemEntry {
  item_group: string;
  item_desc: string;
  item_code: string;
  item_brand: string;
  item_specification: string;
  open_po: boolean;
  open_till_date: string;
  approved_qty: number;
  unit: string;
  due_on: string;
  purchase_category: string;
  estimated_rate: number;
  basic_rate: number;
  discount_perc: number;
  discount_amt: number;
  rate: number;
  hsn_code: string;
  tax_code: string;
  tax_code_amount: number;
  previous_rate: number;
  amt: number;
  freight_chgs: number;
  load_unload_chgs: number;
  others_chgs: number;
  gst_applicable: boolean;
  net_amt: number;
  gst_principal_amount: number;
  grn_balance_qty: number;
  gst_rate: number;
}

export interface FullPoFormState {
  // Header Fields (in exact specified order)
  po_number: string;
  po_date: string;
  company_name: string;
  pan_no: string;
  vat_no: string;
  cst_no: string;
  cess_no: string;
  project_name: string;
  budget_applicable: boolean;
  project_address: string;
  site_contact: string;
  supplier_name: string;
  po_in_the_name_of: string;
  phone_no: string;
  mobile_no: string;
  email_id: string;
  supplier_address: string;
  contact_person: string;
  fax_no: string;
  contractor_service_provider_name: string;
  grn_no_auto: string;
  from_pr_no: string;
  comparative_statement_no: string;
  company_currency: string;
  import_po: boolean;
  import_currency_exchange_rate: number;
  our_state: string;
  vendor_state: string;
  additional_transportation_gst_applicable: boolean;
  gst_no: string;
  location: string;

  // Active Tab Selection
  activeTab: 'entries' | 'terms' | 'comparative' | 'advance' | 'amendment';

  // Tab 1: Line Items
  items: PoLineItemEntry[];

  // Tab 1: Tabular Form Summary Fields
  tax_on_transportation_principal_amount: number;
  hsn_sac_code_for_tax_on_transportation: string;
  tax_code_for_tax_on_transportation: string;
  tax_code_amount_for_tax_on_transportation: number;
  loading_unloading_charges: number;
  other_charges: number;

  // Tab 2: Terms and Conditions
  terms_and_conditions: string[];

  // Tab 3: Comparative Statements List
  comparative_statements: {
    sr: number;
    statement_no: string;
    statement_date: string;
    quotation_reg_no: string;
    supplier_name: string;
    phone_no: string;
    mobile_no: string;
    credit_term_days: number;
    total_net_amount: number;
    effective_amount_status: string;
  }[];

  // Tab 4: Advance Payment List
  advance_payments: {
    sr: number;
    voucher_no: string;
    voucher_date: string;
    supplier_name: string;
    po_no: string;
    project_name: string;
    advance_payment: number;
    status: string;
  }[];

  // Tab 5: PO Amendments List
  po_amendments: {
    sr: number;
    supplier_name: string;
    project_name: string;
    item_group: string;
    item_desc: string;
    item_brand: string;
    item_remarks: string;
    unit: string;
    approved_qty: number;
    grn_rcvd_qty: number;
    grn_balance: number;
    po_closed_qty: number;
    grn_closing_qty: number;
    status: string;
  }[];

  // Footer Fields
  to_grn: boolean;
  credit_period: number;
  delivery_address: string;
  note_on_po: string;
  remarks: string;
  relation_count: number;
  ledger_present: number;
  status: 'Draft' | 'Verification' | 'Issued' | 'Fulfilled';
}

interface PoFormProps {
  po: PurchaseOrderRow;
  onSubmit: (formData: FullPoFormState) => void;
  /** Generates the report-format Purchase Order PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

export function PoForm({ po, onSubmit, onPrint, onCancel }: PoFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<FullPoFormState>(() => ({
    // 1. Header Fields
    po_number: po.po_number || 'O3C/PO3/PO/2026/0086',
    po_date: po.po_date || `${todayStr}T00:00`,
    company_name: (po as any).company_name || 'ORBIT 3 CORPORATION',
    pan_no: 'AAIFO1697D',
    vat_no: '',
    cst_no: '',
    cess_no: '',
    project_name: (po as any).project_name || 'Pramukh Orbit 3',
    budget_applicable: true,
    project_address:
      'SUB PLOT NO 1, NEW R S NO 344 TP NO 7 FP NO 72, PRAMUKH ORBIT 3, VESU MAGDALLA ROAD, Vesu, Surat, Gujarat, 395007',
    site_contact: '9825009339',
    supplier_name: po.vendors?.display_name || po.vendors?.legal_name || 'Bhagavat Enterprise',
    po_in_the_name_of: (po as any).po_in_the_name_of || 'Bhagavat Enterprise',
    phone_no: '',
    mobile_no: '919998723006',
    email_id: 'bhagavatenterprise@gmail.com',
    supplier_address: 'A-1 Anupam Kunj, Behind Someswara Enclave, Near Anupam Height, vesu, surat',
    contact_person: 'sanjay bhai',
    fax_no: '',
    contractor_service_provider_name: '',
    grn_no_auto: 'Auto',
    from_pr_no: (po as any).pr_number || (po.purchase_requisition_id ? 'O3C/PO3/PR/2026/0094' : 'O3C/PO3/PR/2026/0094'),
    comparative_statement_no: 'CS-20260720-001',
    company_currency: 'INR',
    import_po: false,
    import_currency_exchange_rate: 0.0,
    our_state: 'Gujarat',
    vendor_state: 'Gujarat',
    additional_transportation_gst_applicable: false,
    gst_no: po.vendors?.gst_number || (po as any).vendor_gstin || '24AUHPK6558N1Z1',
    location: (po as any).location || 'Gujarat',

    // Active Tab
    activeTab: 'entries',

    // Tab 1 Line Items
    items: [
      {
        item_group: 'Chemicals & Waterproofing',
        item_desc: 'Dr. Fixit 101 LW+ Liquid Waterproofing',
        item_code: 'ITM-CHEM-101',
        item_brand: 'Pidilite • Dr. Fixit',
        item_specification: 'IS 12269 Certified Grade 53 Standard Compound',
        open_po: false,
        open_till_date: '2026-08-15',
        approved_qty: 500,
        unit: 'LITERS',
        due_on: '2026-07-30',
        purchase_category: 'Direct Construction Material',
        estimated_rate: 160,
        basic_rate: 155,
        discount_perc: 0,
        discount_amt: 0,
        rate: 155,
        hsn_code: '38244090',
        tax_code: 'GST 18%',
        tax_code_amount: 13950,
        previous_rate: 160,
        amt: 77500,
        freight_chgs: 0,
        load_unload_chgs: 0,
        others_chgs: 0,
        gst_applicable: true,
        net_amt: 91450,
        gst_principal_amount: 77500,
        grn_balance_qty: 500,
        gst_rate: 18,
      },
      {
        item_group: 'Sealants & Adhesives',
        item_desc: 'Polyurethane Elastomeric Sealant SikaFlex',
        item_code: 'ITM-SEAL-435',
        item_brand: 'Sika • SikaFlex',
        item_specification: 'High Elasticity Polyurethane Sealant',
        open_po: false,
        open_till_date: '2026-08-15',
        approved_qty: 120,
        unit: 'CARTRIDGES',
        due_on: '2026-07-30',
        purchase_category: 'Direct Construction Material',
        estimated_rate: 450,
        basic_rate: 435,
        discount_perc: 0,
        discount_amt: 0,
        rate: 435,
        hsn_code: '32141000',
        tax_code: 'GST 18%',
        tax_code_amount: 9396,
        previous_rate: 450,
        amt: 52200,
        freight_chgs: 0,
        load_unload_chgs: 0,
        others_chgs: 0,
        gst_applicable: true,
        net_amt: 61596,
        gst_principal_amount: 52200,
        grn_balance_qty: 120,
        gst_rate: 18,
      },
    ],

    // Tab 1 Summaries
    tax_on_transportation_principal_amount: 0.0,
    hsn_sac_code_for_tax_on_transportation: '',
    tax_code_for_tax_on_transportation: '',
    tax_code_amount_for_tax_on_transportation: 0.0,
    loading_unloading_charges: 0.0,
    other_charges: 0.0,

    // Tab 2 Terms & Conditions
    terms_and_conditions: [
      '1. INCL. OF ALL FOR AT SITE Delivery.',
      '2. Payment Terms: 45 Days Credit Period from GRN Receipt.',
      '3. Mill Test Certificates (MTC) and Batch Quality Reports must be attached with delivery challan.',
      '4. Material subject to Site Engineer Quality Inspection & Approval before unloading.',
      '5. Any damaged or defective material will be returned at vendor cost within 7 days.',
    ],

    // Tab 3 Comparative Statements
    comparative_statements: [
      {
        sr: 1,
        statement_no: 'CS-20260720-001',
        statement_date: '2026-07-20',
        quotation_reg_no: 'RFQ-20260722-001',
        supplier_name: 'Bhagavat Enterprise',
        phone_no: '',
        mobile_no: '919998723006',
        credit_term_days: 45,
        total_net_amount: 153046,
        effective_amount_status: 'L1 Lowest Bid Approved',
      },
      {
        sr: 2,
        statement_no: 'CS-20260720-001',
        statement_date: '2026-07-20',
        quotation_reg_no: 'RFQ-20260722-001',
        supplier_name: 'UltraTech Cement Ltd.',
        phone_no: '',
        mobile_no: '919825011223',
        credit_term_days: 30,
        total_net_amount: 156120,
        effective_amount_status: 'L2 Quote Evaluated',
      },
    ],

    // Tab 4 Advance Payment List
    advance_payments: [
      {
        sr: 1,
        voucher_no: 'VCH-ADV-2026-004',
        voucher_date: '2026-07-21',
        supplier_name: 'Bhagavat Enterprise',
        po_no: 'O3C/PO3/PO/2026/0086',
        project_name: 'Pramukh Orbit 3',
        advance_payment: 0.0,
        status: 'Nil Advance (Credit Purchase)',
      },
    ],

    // Tab 5 PO Amendments List
    po_amendments: [
      {
        sr: 1,
        supplier_name: 'Bhagavat Enterprise',
        project_name: 'Pramukh Orbit 3',
        item_group: 'Chemicals & Waterproofing',
        item_desc: 'Dr. Fixit 101 LW+ Liquid Waterproofing',
        item_brand: 'Pidilite • Dr. Fixit',
        item_remarks: 'Original PO Qty Confirmed',
        unit: 'LITERS',
        approved_qty: 500,
        grn_rcvd_qty: 0,
        grn_balance: 500,
        po_closed_qty: 0,
        grn_closing_qty: 500,
        status: 'No Active Amendment',
      },
    ],

    // Footer Fields
    to_grn: true,
    credit_period: 45,
    delivery_address:
      'SUB PLOT NO 1, NEW R S NO 344 TP NO 7 FP NO 72, PRAMUKH ORBIT 3, VESU MAGDALLA ROAD, Vesu, Surat, Gujarat, 395007',
    note_on_po: 'INCL. OF ALL FOR AT SITE',
    remarks: 'use for masonry work',
    relation_count: 0.0,
    ledger_present: 1.0,
    status: ((po.status as any) === 'issued' ? 'Issued' : (po.status as any) === 'fulfilled' ? 'Fulfilled' : 'Verification') as any,
  }));

  const [newTermText, setNewTermText] = useState('');

  const updateHeader = <K extends keyof FullPoFormState>(key: K, value: FullPoFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLineItemChange = (index: number, field: keyof PoLineItemEntry, value: any) => {
    setForm((prev) => {
      const updated = [...prev.items];
      const current = { ...updated[index], [field]: value };

      // Calculate totals
      if (field === 'approved_qty' || field === 'basic_rate' || field === 'discount_perc' || field === 'gst_rate') {
        const qty = Number(current.approved_qty || 0);
        const rate = Number(current.basic_rate || 0);
        const discPct = Number(current.discount_perc || 0);
        const gstRate = Number(current.gst_rate || 18);

        const discAmt = (rate * discPct) / 100;
        const effectiveRate = rate - discAmt;
        const basicAmt = qty * effectiveRate;
        const taxAmt = (basicAmt * gstRate) / 100;

        current.rate = effectiveRate;
        current.discount_amt = discAmt;
        current.amt = basicAmt;
        current.gst_principal_amount = basicAmt;
        current.tax_code_amount = taxAmt;
        current.net_amt = basicAmt + taxAmt;
      }

      updated[index] = current;
      return { ...prev, items: updated };
    });
  };

  // Add / Remove Terms
  const handleAddTerm = () => {
    if (!newTermText.trim()) return;
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: [...prev.terms_and_conditions, `${prev.terms_and_conditions.length + 1}. ${newTermText.trim()}`],
    }));
    setNewTermText('');
  };

  const handleRemoveTerm = (index: number) => {
    setForm((prev) => ({
      ...prev,
      terms_and_conditions: prev.terms_and_conditions.filter((_, i) => i !== index),
    }));
  };

  const handleTermChange = (index: number, text: string) => {
    setForm((prev) => {
      const updated = [...prev.terms_and_conditions];
      updated[index] = text;
      return { ...prev, terms_and_conditions: updated };
    });
  };

  // Summary Math
  const totalGrossAmount = form.items.reduce((sum, i) => sum + i.amt, 0);
  const totalTaxCodeAmount = form.items.reduce((sum, i) => sum + i.tax_code_amount, 0);
  const totalDiscountAmount = form.items.reduce((sum, i) => sum + i.discount_amt * i.approved_qty, 0);
  const netAmount = totalGrossAmount + totalTaxCodeAmount + form.tax_code_amount_for_tax_on_transportation + form.loading_unloading_charges + form.other_charges;
  const totalAmountInWords = numberToWords(netAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Form Header Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Production Purchase Order (P.O.) Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Official ERP Purchase Order Entry &amp; Multi-Tab Commercial Verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              title="Generate the Purchase Order report PDF"
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
        {/* SECTION 1: HEADER FIELDS (Strict Field Order as Requested)                */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Primary Purchase Order Header Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. P.O. No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">P.O. No.</label>
              <input
                type="text"
                value={form.po_number}
                onChange={(e) => updateHeader('po_number', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                required
              />
            </div>

            {/* 2. P.O. Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">P.O. Date*</label>
              <input
                type="text"
                value={form.po_date}
                onChange={(e) => updateHeader('po_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* 3. Name of Company* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Name of Company*</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateHeader('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 4. PAN No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">PAN No.</label>
              <input
                type="text"
                value={form.pan_no}
                onChange={(e) => updateHeader('pan_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 5. VAT No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">VAT No.</label>
              <input
                type="text"
                value={form.vat_no}
                onChange={(e) => updateHeader('vat_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 6. CST No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">CST No.</label>
              <input
                type="text"
                value={form.cst_no}
                onChange={(e) => updateHeader('cst_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 7. Cess No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Cess No.</label>
              <input
                type="text"
                value={form.cess_no}
                onChange={(e) => updateHeader('cess_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 8. Project Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Name</label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => updateHeader('project_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 9. Budget Applicable */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="budget_applicable"
                checked={form.budget_applicable}
                onChange={(e) => updateHeader('budget_applicable', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="budget_applicable" className="font-bold text-foreground text-xs cursor-pointer">
                Budget Applicable
              </label>
            </div>

            {/* 10. Project Address */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Project Address</label>
              <input
                type="text"
                value={form.project_address}
                onChange={(e) => updateHeader('project_address', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                required
              />
            </div>

            {/* 11. Site Contact */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Site Contact</label>
              <input
                type="text"
                value={form.site_contact}
                onChange={(e) => updateHeader('site_contact', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 12. Supplier Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Name</label>
              <input
                type="text"
                value={form.supplier_name}
                onChange={(e) => updateHeader('supplier_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 13. PO in the name of* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">PO in the name of*</label>
              <input
                type="text"
                value={form.po_in_the_name_of}
                onChange={(e) => updateHeader('po_in_the_name_of', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                required
              />
            </div>

            {/* 14. Phone No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Phone No.</label>
              <input
                type="text"
                value={form.phone_no}
                onChange={(e) => updateHeader('phone_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 15. Mobile No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Mobile No.</label>
              <input
                type="text"
                value={form.mobile_no}
                onChange={(e) => updateHeader('mobile_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 16. Email ID */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Email ID</label>
              <input
                type="email"
                value={form.email_id}
                onChange={(e) => updateHeader('email_id', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* 17. Supplier Address */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Supplier Address</label>
              <input
                type="text"
                value={form.supplier_address}
                onChange={(e) => updateHeader('supplier_address', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 18. Contact Person */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contact Person</label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => updateHeader('contact_person', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 19. Fax No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Fax No.</label>
              <input
                type="text"
                value={form.fax_no}
                onChange={(e) => updateHeader('fax_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 20. Contractor / Service Provider Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Contractor / Service Provider Name</label>
              <input
                type="text"
                value={form.contractor_service_provider_name}
                onChange={(e) => updateHeader('contractor_service_provider_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 21. G.R.N No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">G.R.N No.</label>
              <input
                type="text"
                value={form.grn_no_auto}
                readOnly
                className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
              />
            </div>

            {/* 22. From P.R. No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">From P.R. No.</label>
              <input
                type="text"
                value={form.from_pr_no}
                onChange={(e) => updateHeader('from_pr_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-primary"
              />
            </div>

            {/* 23. Comparative Statement No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Comparative Statement No.</label>
              <input
                type="text"
                value={form.comparative_statement_no}
                onChange={(e) => updateHeader('comparative_statement_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-semibold text-foreground"
              />
            </div>

            {/* 24. Company Currency */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Company Currency</label>
              <input
                type="text"
                value={form.company_currency}
                onChange={(e) => updateHeader('company_currency', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 25. Import PO */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="import_po"
                checked={form.import_po}
                onChange={(e) => updateHeader('import_po', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="import_po" className="font-bold text-foreground text-xs cursor-pointer">
                Import PO
              </label>
            </div>

            {/* 26. Import Currency Exchange Rate */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Import Currency Exchange Rate</label>
              <input
                type="number"
                step="0.01"
                value={form.import_currency_exchange_rate}
                onChange={(e) => updateHeader('import_currency_exchange_rate', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 27. Our State */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Our State</label>
              <input
                type="text"
                value={form.our_state}
                onChange={(e) => updateHeader('our_state', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 28. Vendor State */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vendor State</label>
              <input
                type="text"
                value={form.vendor_state}
                onChange={(e) => updateHeader('vendor_state', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 29. Additional Transportation Service Tax / GST Applicable */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="additional_trans_gst"
                checked={form.additional_transportation_gst_applicable}
                onChange={(e) => updateHeader('additional_transportation_gst_applicable', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="additional_trans_gst" className="font-bold text-foreground text-xs cursor-pointer">
                Additional Transportation GST Applicable
              </label>
            </div>

            {/* 30. GST No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GST No.</label>
              <input
                type="text"
                value={form.gst_no}
                onChange={(e) => updateHeader('gst_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 31. Location */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => updateHeader('location', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: FIVE TABS NAVIGATION SYSTEM                                     */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'entries')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'entries'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Layers className="h-4 w-4" /> Purchase Order Entries ({form.items.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'terms')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'terms'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileText className="h-4 w-4" /> Terms and Conditions ({form.terms_and_conditions.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'comparative')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'comparative'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> Comparative Statements ({form.comparative_statements.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'advance')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'advance'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" /> Advance Payment ({form.advance_payments.length})
            </button>

            <button
              type="button"
              onClick={() => updateHeader('activeTab', 'amendment')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                form.activeTab === 'amendment'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> PO Amendment ({form.po_amendments.length})
            </button>
          </div>

          {/* TAB 1: PURCHASE ORDER ENTRIES (29 Columns Table) */}
          {form.activeTab === 'entries' && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3 py-3 font-bold text-primary min-w-[140px]">1. Item Group*</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[180px]">2. Item Desc*</th>
                      <th className="px-3 py-3 min-w-[110px]">3. Item Code</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[130px]">4. Item Brand*</th>
                      <th className="px-3 py-3 min-w-[160px]">5. Item Specification</th>
                      <th className="px-3 py-3 text-center min-w-[90px]">6. Open PO</th>
                      <th className="px-3 py-3 min-w-[110px]">7. Open Till Date</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">8. Approved Qty</th>
                      <th className="px-3 py-3 font-bold text-primary text-center min-w-[80px]">9. Unit*</th>
                      <th className="px-3 py-3 font-bold text-primary min-w-[100px]">10. Due On*</th>
                      <th className="px-3 py-3 min-w-[140px]">11. Purchase Category</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">12. Estimated Rate</th>
                      <th className="px-3 py-3 font-bold text-primary text-right min-w-[110px]">13. Basic Rate*</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">14. Discount Perc.</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">15. Discount Amt</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">16. Rate</th>
                      <th className="px-3 py-3 min-w-[100px]">17. HSN Code</th>
                      <th className="px-3 py-3 min-w-[100px]">18. Tax Code</th>
                      <th className="px-3 py-3 text-right min-w-[120px]">19. Tax Code Amount</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">20. Previous Rate</th>
                      <th className="px-3 py-3 text-right min-w-[110px]">21. Amt</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">22. Freight Chgs</th>
                      <th className="px-3 py-3 text-right min-w-[120px]">23. Load / Unload Chgs</th>
                      <th className="px-3 py-3 text-right min-w-[100px]">24. Others Chgs</th>
                      <th className="px-3 py-3 text-center min-w-[100px]">25. Gst Applicable</th>
                      <th className="px-3 py-3 text-right font-bold text-foreground min-w-[120px]">26. Net Amt</th>
                      <th className="px-3 py-3 text-right min-w-[130px]">27. Gst Principal Amount</th>
                      <th className="px-3 py-3 text-right min-w-[120px]">28. GRN Balance Qty</th>
                      <th className="px-3 py-3 text-right min-w-[90px]">29. GST Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {form.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                        {/* 1. Item Group* */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_group}
                            onChange={(e) => handleLineItemChange(idx, 'item_group', e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1 font-bold text-foreground font-sans"
                            required
                          />
                        </td>
                        {/* 2. Item Desc* */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_desc}
                            onChange={(e) => handleLineItemChange(idx, 'item_desc', e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1 font-bold text-foreground font-sans"
                            required
                          />
                        </td>
                        {/* 3. Item Code */}
                        <td className="px-3 py-2 text-muted-foreground">{item.item_code}</td>
                        {/* 4. Item Brand* */}
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.item_brand}
                            onChange={(e) => handleLineItemChange(idx, 'item_brand', e.target.value)}
                            className="w-full rounded border border-border bg-background px-2 py-1 font-bold text-foreground font-sans"
                            required
                          />
                        </td>
                        {/* 5. Item Specification */}
                        <td className="px-3 py-2 font-sans text-muted-foreground">{item.item_specification}</td>
                        {/* 6. Open PO */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.open_po}
                            onChange={(e) => handleLineItemChange(idx, 'open_po', e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-border"
                          />
                        </td>
                        {/* 7. Open Till Date */}
                        <td className="px-3 py-2 text-muted-foreground">{item.open_till_date}</td>
                        {/* 8. Approved Qty */}
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.approved_qty}
                            onChange={(e) => handleLineItemChange(idx, 'approved_qty', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right font-extrabold text-primary"
                          />
                        </td>
                        {/* 9. Unit* */}
                        <td className="px-3 py-2 text-center font-bold text-muted-foreground font-sans">{item.unit}</td>
                        {/* 10. Due On* */}
                        <td className="px-3 py-2 text-muted-foreground">{item.due_on}</td>
                        {/* 11. Purchase Category */}
                        <td className="px-3 py-2 font-sans text-muted-foreground">{item.purchase_category}</td>
                        {/* 12. Estimated Rate */}
                        <td className="px-3 py-2 text-right font-semibold">₹{item.estimated_rate}</td>
                        {/* 13. Basic Rate* */}
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.basic_rate}
                            onChange={(e) => handleLineItemChange(idx, 'basic_rate', Number(e.target.value))}
                            className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right font-extrabold text-foreground"
                          />
                        </td>
                        {/* 14. Discount Perc. */}
                        <td className="px-3 py-2 text-right">{item.discount_perc}%</td>
                        {/* 15. Discount Amt */}
                        <td className="px-3 py-2 text-right">₹{item.discount_amt}</td>
                        {/* 16. Rate */}
                        <td className="px-3 py-2 text-right font-extrabold text-foreground">₹{item.rate}</td>
                        {/* 17. HSN Code */}
                        <td className="px-3 py-2">{item.hsn_code}</td>
                        {/* 18. Tax Code */}
                        <td className="px-3 py-2 font-sans font-semibold">{item.tax_code}</td>
                        {/* 19. Tax Code Amount */}
                        <td className="px-3 py-2 text-right text-muted-foreground">₹{item.tax_code_amount.toLocaleString()}</td>
                        {/* 20. Previous Rate */}
                        <td className="px-3 py-2 text-right text-muted-foreground">₹{item.previous_rate}</td>
                        {/* 21. Amt */}
                        <td className="px-3 py-2 text-right font-bold text-foreground">₹{item.amt.toLocaleString()}</td>
                        {/* 22. Freight Chgs */}
                        <td className="px-3 py-2 text-right">₹{item.freight_chgs}</td>
                        {/* 23. Load / Unload Chgs */}
                        <td className="px-3 py-2 text-right">₹{item.load_unload_chgs}</td>
                        {/* 24. Others Chgs */}
                        <td className="px-3 py-2 text-right">₹{item.others_chgs}</td>
                        {/* 25. Gst Applicable */}
                        <td className="px-3 py-2 text-center">{item.gst_applicable ? 'Yes' : 'No'}</td>
                        {/* 26. Net Amt */}
                        <td className="px-3 py-2 text-right font-extrabold text-foreground">₹{item.net_amt.toLocaleString()}</td>
                        {/* 27. Gst Principal Amount */}
                        <td className="px-3 py-2 text-right text-muted-foreground">₹{item.gst_principal_amount.toLocaleString()}</td>
                        {/* 28. GRN Balance Qty */}
                        <td className="px-3 py-2 text-right font-bold">{item.grn_balance_qty}</td>
                        {/* 29. GST Rate */}
                        <td className="px-3 py-2 text-right font-bold">{item.gst_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabular Form Field Summary (Exact Specified Fields) */}
              <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
                <h4 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                  Purchase Entries Commercial Summary &amp; Transportation Tax Fields
                </h4>

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

                  {/* Total Tax Code Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Tax Code Amount</label>
                    <input
                      type="text"
                      value={`₹${totalTaxCodeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Tax On Transportation Principal Amount* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      Tax On Transportation Principal Amount*
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tax_on_transportation_principal_amount}
                      onChange={(e) => updateHeader('tax_on_transportation_principal_amount', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* HSN/SAC Code for Tax On Transportation* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      HSN/SAC Code for Tax On Transportation*
                    </label>
                    <input
                      type="text"
                      value={form.hsn_sac_code_for_tax_on_transportation}
                      onChange={(e) => updateHeader('hsn_sac_code_for_tax_on_transportation', e.target.value)}
                      placeholder="e.g. 996511"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Tax Code for Tax On Transportation* */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                      Tax Code for Tax On Transportation*
                    </label>
                    <input
                      type="text"
                      value={form.tax_code_for_tax_on_transportation}
                      onChange={(e) => updateHeader('tax_code_for_tax_on_transportation', e.target.value)}
                      placeholder="e.g. GST 18%"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                    />
                  </div>

                  {/* Tax Code Amount for Tax On Transportation */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                      Tax Code Amount for Tax On Transportation
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.tax_code_amount_for_tax_on_transportation}
                      onChange={(e) => updateHeader('tax_code_amount_for_tax_on_transportation', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Net Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Amount</label>
                    <input
                      type="text"
                      value={`₹${netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-extrabold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Total Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount</label>
                    <input
                      type="text"
                      value={`₹${netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-base cursor-not-allowed"
                    />
                  </div>

                  {/* Total Discount Amount */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Discount Amount</label>
                    <input
                      type="text"
                      value={`₹${totalDiscountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                      readOnly
                      className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed"
                    />
                  </div>

                  {/* Loading/Unloading Charges */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Loading/Unloading Charges</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.loading_unloading_charges}
                      onChange={(e) => updateHeader('loading_unloading_charges', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Other Charges */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Other Charges</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.other_charges}
                      onChange={(e) => updateHeader('other_charges', Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                    />
                  </div>

                  {/* Total Amount in Words */}
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="block text-[11px] font-bold uppercase text-primary mb-1">Total Amount in Words</label>
                    <input
                      type="text"
                      value={totalAmountInWords}
                      readOnly
                      className="w-full rounded-lg border-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-extrabold text-emerald-900 dark:text-emerald-200 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TERMS AND CONDITIONS (Fully Editable) */}
          {form.activeTab === 'terms' && (
            <div className="rounded-xl border border-border p-4 bg-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h4 className="font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Editable Terms and Conditions Master
                </h4>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  User can edit, add, or rewrite terms
                </span>
              </div>

              <div className="space-y-3">
                {form.terms_and_conditions.map((term, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={term}
                      onChange={(e) => handleTermChange(tIdx, e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTerm(tIdx)}
                      className="rounded-lg border border-border p-2 text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove Term"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Term */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={newTermText}
                  onChange={(e) => setNewTermText(e.target.value)}
                  placeholder="Enter new custom PO term or condition..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddTerm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Term
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: COMPARATIVE STATEMENTS (10 Columns Table) */}
          {form.activeTab === 'comparative' && (
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-center">1. Sr</th>
                    <th className="px-3 py-3">2. Comparative Statement No.</th>
                    <th className="px-3 py-3">3. Comparative Statement Date</th>
                    <th className="px-3 py-3">4. Quotation Reg. No.</th>
                    <th className="px-3 py-3">5. Supplier Name</th>
                    <th className="px-3 py-3">6. Phone No.</th>
                    <th className="px-3 py-3">7. Mobile No.</th>
                    <th className="px-3 py-3 text-center">8. Credit Term (InDays)</th>
                    <th className="px-3 py-3 text-right">9. Total Net Amount</th>
                    <th className="px-3 py-3">10. Effective Amount Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.comparative_statements.map((cs) => (
                    <tr key={cs.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2.5 text-center font-bold text-muted-foreground">{cs.sr}</td>
                      <td className="px-3 py-2.5 font-bold text-primary font-sans">{cs.statement_no}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{cs.statement_date}</td>
                      <td className="px-3 py-2.5 font-semibold font-sans">{cs.quotation_reg_no}</td>
                      <td className="px-3 py-2.5 font-bold text-foreground font-sans">{cs.supplier_name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{cs.phone_no || '-'}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{cs.mobile_no}</td>
                      <td className="px-3 py-2.5 text-center font-bold">{cs.credit_term_days} Days</td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-foreground">₹{cs.total_net_amount.toLocaleString()}</td>
                      <td className="px-3 py-2.5 font-bold font-sans text-emerald-600 dark:text-emerald-400">{cs.effective_amount_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: ADVANCE PAYMENT (8 Columns Table) */}
          {form.activeTab === 'advance' && (
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-center">1. Sr</th>
                    <th className="px-3 py-3">2. Voucher No.</th>
                    <th className="px-3 py-3">3. Voucher Date</th>
                    <th className="px-3 py-3">4. Supplier Name</th>
                    <th className="px-3 py-3">5. P.O. No.</th>
                    <th className="px-3 py-3">6. Project Name</th>
                    <th className="px-3 py-3 text-right">7. Advance Payment</th>
                    <th className="px-3 py-3">8. Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.advance_payments.map((adv) => (
                    <tr key={adv.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2.5 text-center font-bold text-muted-foreground">{adv.sr}</td>
                      <td className="px-3 py-2.5 font-bold text-primary font-sans">{adv.voucher_no}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{adv.voucher_date}</td>
                      <td className="px-3 py-2.5 font-bold text-foreground font-sans">{adv.supplier_name}</td>
                      <td className="px-3 py-2.5 font-semibold font-sans">{adv.po_no}</td>
                      <td className="px-3 py-2.5 font-medium font-sans text-foreground">{adv.project_name}</td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-foreground">₹{adv.advance_payment.toLocaleString()}</td>
                      <td className="px-3 py-2.5 font-bold font-sans text-muted-foreground">{adv.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: PO AMENDMENT (14 Columns Table) */}
          {form.activeTab === 'amendment' && (
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-center">1. Sr</th>
                    <th className="px-3 py-3 min-w-[150px]">2. Supplier Name</th>
                    <th className="px-3 py-3 min-w-[130px]">3. Project Name</th>
                    <th className="px-3 py-3 min-w-[130px]">4. Item Group</th>
                    <th className="px-3 py-3 min-w-[180px]">5. Item Desc</th>
                    <th className="px-3 py-3 min-w-[120px]">6. Item Brand</th>
                    <th className="px-3 py-3 min-w-[160px]">7. Item Remarks</th>
                    <th className="px-3 py-3 text-center min-w-[80px]">8. Unit</th>
                    <th className="px-3 py-3 text-right min-w-[100px]">9. Approved Qty</th>
                    <th className="px-3 py-3 text-right min-w-[110px]">10. GRN Rcvd Qty</th>
                    <th className="px-3 py-3 text-right min-w-[100px]">11. GRN Balance</th>
                    <th className="px-3 py-3 text-right min-w-[110px]">12. - P.O. Closed Qty</th>
                    <th className="px-3 py-3 text-right min-w-[110px]">13. GRN Closing Qty</th>
                    <th className="px-3 py-3 min-w-[130px]">14. Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.po_amendments.map((am) => (
                    <tr key={am.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2.5 text-center font-bold text-muted-foreground">{am.sr}</td>
                      <td className="px-3 py-2.5 font-bold text-foreground font-sans">{am.supplier_name}</td>
                      <td className="px-3 py-2.5 font-medium font-sans text-foreground">{am.project_name}</td>
                      <td className="px-3 py-2.5 font-semibold font-sans text-muted-foreground">{am.item_group}</td>
                      <td className="px-3 py-2.5 font-bold font-sans text-foreground">{am.item_desc}</td>
                      <td className="px-3 py-2.5 font-semibold font-sans text-muted-foreground">{am.item_brand}</td>
                      <td className="px-3 py-2.5 font-sans text-muted-foreground">{am.item_remarks}</td>
                      <td className="px-3 py-2.5 text-center font-bold font-sans text-muted-foreground">{am.unit}</td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-foreground">{am.approved_qty}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{am.grn_rcvd_qty}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{am.grn_balance}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{am.po_closed_qty}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{am.grn_closing_qty}</td>
                      <td className="px-3 py-2.5 font-bold font-sans text-primary">{am.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: FOOTER FORM TABULAR FIELDS (After all tab details end)          */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            3. Final Order Processing &amp; Site Logistics Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* To GRN */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="to_grn"
                checked={form.to_grn}
                onChange={(e) => updateHeader('to_grn', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="to_grn" className="font-bold text-foreground text-xs cursor-pointer">
                To GRN
              </label>
            </div>

            {/* Credit Period */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Credit Period (In Days)</label>
              <input
                type="number"
                value={form.credit_period}
                onChange={(e) => updateHeader('credit_period', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Delivery Address* */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Delivery Address*</label>
              <textarea
                rows={2}
                value={form.delivery_address}
                onChange={(e) => updateHeader('delivery_address', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background p-2.5 font-medium text-foreground"
                required
              />
            </div>

            {/* Note On PO */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Note On PO</label>
              <input
                type="text"
                value={form.note_on_po}
                onChange={(e) => updateHeader('note_on_po', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => updateHeader('remarks', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* Relation Count */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Relation Count</label>
              <input
                type="number"
                step="0.01"
                value={form.relation_count}
                onChange={(e) => updateHeader('relation_count', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Ledger Present */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Ledger Present</label>
              <input
                type="number"
                step="0.01"
                value={form.ledger_present}
                onChange={(e) => updateHeader('ledger_present', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">PO Status</label>
              <select
                value={form.status}
                onChange={(e) => updateHeader('status', e.target.value as any)}
                className="w-full rounded-lg border-2 border-primary bg-background px-3 py-2 font-extrabold text-foreground"
              >
                <option value="Draft">Draft (Saved for Editing)</option>
                <option value="Verification">Verification (Pending Audit Sign-off)</option>
                <option value="Issued">Issued (Sent to Vendor)</option>
                <option value="Fulfilled">Fulfilled (Material Delivered)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="text-xs font-bold text-muted-foreground">
            Total PO Net Amount: <span className="font-mono text-sm text-primary font-extrabold">₹{netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
            >
              <FileCheck className="h-4 w-4" /> Save Purchase Order &amp; Submit Status
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
