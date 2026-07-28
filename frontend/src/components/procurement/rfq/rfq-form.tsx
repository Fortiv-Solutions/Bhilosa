'use client';

import React, { useState } from 'react';
import {
  FileText,
  Building2,
  Calendar,
  Send,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  Save,
  MapPin,
  X,
  Mail,
  UserCheck,
  Target,
  Printer,
} from 'lucide-react';
import type { PurchaseRequisitionRow, VendorRow } from '@/lib/procurement';

/** Supplier option shape used by the RFQ supplier picker. */
export interface RfqSupplierOption {
  id: string;
  name: string;
  email: string;
}

/** Maps live vendor registry rows into supplier picker options. */
export function toSupplierOptions(vendors: VendorRow[]): RfqSupplierOption[] {
  return vendors.map((v) => ({
    id: v.id,
    name: v.display_name || v.legal_name,
    email: v.email || '',
  }));
}

export interface RfqFormSupplierRow {
  key: string;
  supplier_id: string;
  supplier_name: string;
  email_to: string;
  email_cc: string;
}

export interface RfqFormItemRow {
  key: string;
  item_id: string | null;
  item_code: string;
  item_group: string;
  item_brand: string;
  item_description: string;
  specification: string;
  quantity: number;
  pr_balance_qty: number;
  previous_rate: number;
  unit: string;
  required_date: string;
  remarks: string;
}

export interface RfqFormState {
  quotation_registration_no: string;
  quotation_date: string;
  goal_delivery_date: string; // Goal / Target Delivery Date
  pr_id: string;
  pr_number: string;
  project_name: string;
  company_name: string;
  process_type: 'Quotation Request' | 'Direct PO';
  contractor_name: string;
  delivery_address: string;
  remarks: string;
  status: 'Draft' | 'Approved';
  items: RfqFormItemRow[];
  suppliers: RfqFormSupplierRow[];
}

interface RfqFormProps {
  approvedPr: PurchaseRequisitionRow;
  /** Live vendor registry — the supplier picker's source of truth. */
  suppliers?: RfqSupplierOption[];
  onSubmit: (formData: RfqFormState, isDirectPo: boolean) => void;
  /** Generates the report-format RFQ PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

export function RfqForm({ approvedPr, suppliers: supplierMaster = [], onSubmit, onPrint, onCancel }: RfqFormProps) {
  // Generate Quotation Registration No (e.g. RFQ-20260722-001)
  const autoRegNo = `RFQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
    100 + Math.random() * 900
  )}`;

  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultGoalDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Auto-populate Project & Company details
  const autoProjectName =
    approvedPr.project_id === 'central-park'
      ? 'Central Park'
      : approvedPr.project_id === 'riverside-heights'
      ? 'Riverside Heights'
      : approvedPr.project_id === 'skyline-towers'
      ? 'Skyline Towers'
      : approvedPr.company_name?.includes('Electrical')
      ? 'Skyline Towers'
      : 'Central Park';

  const autoDeliveryAddress =
    approvedPr.delivery_address ||
    `Site Office, Block A, ${autoProjectName}, Ring Road, Surat, Gujarat - 395007`;

  // Initialize Form State
  const [form, setForm] = useState<RfqFormState>(() => ({
    quotation_registration_no: autoRegNo,
    quotation_date: todayStr,
    goal_delivery_date: defaultGoalDate,
    pr_id: approvedPr.id,
    pr_number: approvedPr.pr_number || 'PR-Approved',
    project_name: autoProjectName,
    company_name: approvedPr.company_name || 'Pramukh Group Infrastructure Ltd.',
    process_type: 'Quotation Request',
    contractor_name: approvedPr.contractor_name || '',
    delivery_address: autoDeliveryAddress,
    remarks: '',
    status: 'Draft',
    items: (approvedPr.purchase_requisition_lines || []).map((line, idx) => ({
      key: `line-${line.id || idx}`,
      item_id: line.item_id || null,
      item_code: line.item_code || `ITEM-00${idx + 1}`,
      item_group: line.item_group || (idx === 0 ? 'Chemicals & Waterproofing' : 'Sealants & Adhesives'),
      item_brand: line.preferred_brand || (idx === 0 ? 'Pidilite • Dr. Fixit' : 'Sika • SikaFlex'),
      item_description: line.item_description || '',
      specification: line.specification || (idx === 0 ? 'Dr. Fixit 101 LW+ Integral Liquid Waterproofing' : 'Polyurethane Elastomeric Sealant SikaFlex'),
      quantity: Number(line.quantity || (idx === 0 ? 500 : 120)),
      pr_balance_qty: Number(line.remaining_mr_qty || line.quantity || (idx === 0 ? 500 : 120)),
      previous_rate: Number(line.estimated_rate || (idx === 0 ? 160 : 450)),
      unit: (line.unit || (idx === 0 ? 'LITERS' : 'CARTRIDGES')).toUpperCase(),
      required_date: line.required_date || defaultGoalDate,
      remarks: line.remarks || '',
    })),
    // Default 1 Empty Supplier Row
    suppliers: [
      {
        key: 'sup-row-0',
        supplier_id: '',
        supplier_name: '',
        email_to: '',
        email_cc: 'procurement@pramukhgroup.com',
      },
    ],
  }));

  // Handlers for Form Fields
  const updateField = <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Item Table Handlers
  const handleItemChange = (index: number, field: keyof RfqFormItemRow, value: any) => {
    setForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  // Dynamic Supplier (+) Add & (-) Remove Handlers
  const handleAddSupplier = () => {
    setForm((prev) => ({
      ...prev,
      suppliers: [
        ...prev.suppliers,
        {
          key: `sup-row-${Date.now()}-${prev.suppliers.length}`,
          supplier_id: '',
          supplier_name: '',
          email_to: '',
          email_cc: 'procurement@pramukhgroup.com',
        },
      ],
    }));
  };

  const handleRemoveSupplier = (index: number) => {
    if (form.suppliers.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((_, idx) => idx !== index),
    }));
  };

  const handleSupplierSelect = (index: number, supplierId: string) => {
    const found = supplierMaster.find((s) => s.id === supplierId);
    setForm((prev) => {
      const updated = [...prev.suppliers];
      if (found) {
        updated[index] = {
          ...updated[index],
          supplier_id: found.id,
          supplier_name: found.name,
          email_to: found.email, // Auto-populate Email To
        };
      } else {
        updated[index] = {
          ...updated[index],
          supplier_id: '',
          supplier_name: '',
          email_to: '',
        };
      }
      return { ...prev, suppliers: updated };
    });
  };

  const handleSupplierEmailChange = (index: number, field: 'email_to' | 'email_cc', value: string) => {
    setForm((prev) => {
      const updated = [...prev.suppliers];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, suppliers: updated };
    });
  };

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isDirectPo = form.process_type === 'Direct PO';
    onSubmit(form, isDirectPo);
  };

  const grandTotal = form.items.reduce((sum, item) => sum + item.quantity * item.previous_rate, 0);
  const activeSupplierCount = form.suppliers.filter((s) => s.supplier_id || s.email_to).length;

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Form Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Request for Quotation (RFQ) Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Create and dispatch supplier quotation requests for approved PR: <span className="font-bold text-primary">{approvedPr.pr_number}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Source PR Approved
          </span>
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              title="Generate the RFQ report PDF"
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Section Controls Grid */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-muted-foreground border-b border-border/50 pb-2">
            Header Details &amp; Process Type
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {/* Quotation Registration No */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Quotation Registration No.
              </label>
              <input
                type="text"
                value={form.quotation_registration_no}
                readOnly
                className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-foreground cursor-not-allowed shadow-2xs"
              />
            </div>

            {/* Quotation Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Quotation Date
              </label>
              <input
                type="date"
                value={form.quotation_date}
                onChange={(e) => updateField('quotation_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs"
                required
              />
            </div>

            {/* Goal / Target Delivery Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1 flex items-center gap-1">
                <Target className="h-3 w-3 text-primary" /> Goal / Target Delivery Date *
              </label>
              <input
                type="date"
                value={form.goal_delivery_date}
                onChange={(e) => updateField('goal_delivery_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs"
                required
              />
              <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">
                Target date required for material arrival on site.
              </span>
            </div>

            {/* Approved PR No */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Approved PR No.
              </label>
              <input
                type="text"
                value={form.pr_number}
                readOnly
                className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono font-bold text-primary cursor-not-allowed shadow-2xs"
              />
            </div>

            {/* Process Type Dropdown */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                Process Type *
              </label>
              <select
                value={form.process_type}
                onChange={(e) => updateField('process_type', e.target.value as any)}
                className="w-full rounded-lg border-2 border-primary bg-background px-3 py-2 font-extrabold text-foreground focus:outline-none shadow-2xs"
              >
                <option value="Quotation Request">Quotation Request (Multi-Vendor Bidding)</option>
                <option value="Direct PO">Direct PO (Proceed Directly to Purchase Order)</option>
              </select>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateField('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs"
                required
              />
            </div>

            {/* Project Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => updateField('project_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs"
                required
              />
            </div>

            {/* Contractor / Service Provider Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Contractor / Service Provider Name
              </label>
              <input
                type="text"
                value={form.contractor_name}
                onChange={(e) => updateField('contractor_name', e.target.value)}
                placeholder="Contractor or preferred supplier name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Middle Section Table 1: Quotation Registration Entries Table (Custom Columns) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Quotation Registration Entries Table (Carried Forward from Approved PR)
            </h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {form.items.length} Line Item(s) Carried Forward
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">Sr. No.</th>
                  <th className="px-3 py-3 min-w-[150px]">Item Group</th>
                  <th className="px-3 py-3 min-w-[150px]">Item Brand</th>
                  <th className="px-3 py-3 min-w-[220px]">Item Specification</th>
                  <th className="px-3 py-3 text-right w-24">Quantity</th>
                  <th className="px-3 py-3 text-right w-28">PR Balance Qty</th>
                  <th className="px-3 py-3 text-right w-28">Previous Rate (₹)</th>
                  <th className="px-3 py-3 text-center w-24">Unit</th>
                  <th className="px-3 py-3 text-center w-36">Goal / Target Delivery Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.items.map((item, idx) => (
                  <tr key={item.key} className="hover:bg-muted/30 transition-colors align-middle">
                    {/* Sr No */}
                    <td className="px-3 py-2.5 text-center font-bold text-muted-foreground">{idx + 1}</td>

                    {/* Item Group */}
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.item_group}
                        onChange={(e) => handleItemChange(idx, 'item_group', e.target.value)}
                        placeholder="e.g. Chemicals & Waterproofing"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-bold text-foreground focus:border-primary focus:outline-none"
                        required
                      />
                    </td>

                    {/* Item Brand */}
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.item_brand}
                        onChange={(e) => handleItemChange(idx, 'item_brand', e.target.value)}
                        placeholder="e.g. Pidilite • Dr. Fixit"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-bold text-foreground focus:border-primary focus:outline-none"
                        required
                      />
                    </td>

                    {/* Item Specification */}
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.specification}
                        onChange={(e) => handleItemChange(idx, 'specification', e.target.value)}
                        placeholder="Full technical specification"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-medium text-foreground focus:border-primary focus:outline-none"
                        required
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-right font-extrabold text-primary focus:border-primary focus:outline-none"
                        required
                      />
                    </td>

                    {/* PR Balance Qty */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.pr_balance_qty}
                        onChange={(e) => handleItemChange(idx, 'pr_balance_qty', Number(e.target.value))}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-right font-bold text-foreground focus:border-primary focus:outline-none"
                      />
                    </td>

                    {/* Previous Rate (₹) */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.previous_rate}
                        onChange={(e) => handleItemChange(idx, 'previous_rate', Number(e.target.value))}
                        className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-right font-bold text-foreground focus:border-primary focus:outline-none"
                        required
                      />
                    </td>

                    {/* Unit */}
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value.toUpperCase())}
                        className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-center font-bold text-foreground uppercase focus:border-primary focus:outline-none"
                        required
                      />
                    </td>

                    {/* Goal / Target Delivery Date */}
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="date"
                        value={item.required_date}
                        onChange={(e) => handleItemChange(idx, 'required_date', e.target.value)}
                        className="w-32 rounded-md border border-border bg-background px-2 py-1.5 font-semibold text-foreground text-center focus:border-primary focus:outline-none"
                        required
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Middle Section Table 2: Supplier Quotation Submission Table */}
        <div className="space-y-3 rounded-xl border border-border p-4 bg-background shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-500" />
                  Supplier Quotation Submission Table
                </h3>
                {form.process_type === 'Direct PO' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                    Direct PO Mode (Optional)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {form.process_type === 'Direct PO'
                  ? 'For Direct PO process type, supplier quotation comparison is not required.'
                  : 'Select suppliers from the ERP supplier master. Email To auto-populates upon selection and remains editable.'}
              </p>
            </div>

            {/* Dynamic Controls: (+) Add Supplier & (-) Remove Controls next to title */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddSupplier}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-2xs transition-all"
              >
                <Plus className="h-3.5 w-3.5" /> Add Supplier (+)
              </button>

              <button
                type="button"
                onClick={() => handleRemoveSupplier(form.suppliers.length - 1)}
                disabled={form.suppliers.length <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" /> Remove (-)
              </button>
            </div>
          </div>

          {/* Supplier Table */}
          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 w-14 text-center">Sr. No.</th>
                  <th className="px-4 py-3 min-w-[250px]">Supplier Name</th>
                  <th className="px-4 py-3 min-w-[280px]">Email To (Auto-filled &amp; Editable)</th>
                  <th className="px-4 py-3 min-w-[220px]">Email CC</th>
                  <th className="px-4 py-3 text-center w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.suppliers.map((sup, idx) => (
                  <tr key={sup.key} className="hover:bg-muted/30 transition-colors align-middle">
                    <td className="px-4 py-3 text-center font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <select
                        value={sup.supplier_id}
                        onChange={(e) => handleSupplierSelect(idx, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs"
                      >
                        <option value="">
                          {supplierMaster.length === 0
                            ? '-- No vendors registered — add one in the Vendor Registry --'
                            : '-- Select Supplier from Vendor Registry --'}
                        </option>
                        {supplierMaster.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="email"
                        value={sup.email_to}
                        onChange={(e) => handleSupplierEmailChange(idx, 'email_to', e.target.value)}
                        placeholder="Auto-populated upon supplier selection"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="email"
                        value={sup.email_cc}
                        onChange={(e) => handleSupplierEmailChange(idx, 'email_cc', e.target.value)}
                        placeholder="cc@pramukhgroup.com"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveSupplier(idx)}
                        disabled={form.suppliers.length <= 1}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Supplier Count Counter */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1 font-bold text-blue-700 dark:text-blue-300">
              <UserCheck className="h-3.5 w-3.5" /> Total Supplier Count: {form.suppliers.length} ({activeSupplierCount} Configured)
            </span>
            <span>Dynamic Edit (+) and (-) Controls Active</span>
          </div>
        </div>

        {/* Additional Fields Section */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Delivery Address */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
              Delivery Address * (Mandatory)
            </label>
            <textarea
              rows={3}
              value={form.delivery_address}
              onChange={(e) => updateField('delivery_address', e.target.value)}
              placeholder="Full site delivery address"
              className="w-full rounded-lg border border-border bg-background p-3 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
              required
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
              Remarks &amp; Special Instructions
            </label>
            <textarea
              rows={3}
              value={form.remarks}
              onChange={(e) => updateField('remarks', e.target.value)}
              placeholder="Enter special instructions or commercial notes..."
              className="w-full rounded-lg border border-border bg-background p-3 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>
        </div>

        {/* Status & Footer Actions */}
        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold uppercase text-muted-foreground">Form Status:</label>
            <select
              value={form.status}
              onChange={(e) => updateField('status', e.target.value as any)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground focus:border-primary focus:outline-none shadow-2xs"
            >
              <option value="Draft">Draft (Saved for review)</option>
              <option value="Approved">Approved (Ready for dispatch / PO)</option>
            </select>
          </div>

          {/* Cost Summary & Buttons */}
          <div className="flex items-center gap-3 justify-end">
            <div className="text-right mr-3 hidden sm:block">
              <span className="block text-[10px] font-bold uppercase text-muted-foreground">Total Valuation</span>
              <span className="text-base font-extrabold text-primary font-mono">
                ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
            >
              {form.process_type === 'Direct PO' ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Proceed to Direct PO Creation
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Submit &amp; Dispatch RFQ to Suppliers ({activeSupplierCount})
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
