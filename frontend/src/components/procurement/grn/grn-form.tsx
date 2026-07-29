'use client';

import React, { useState, useEffect } from 'react';
import {
  Truck,
  Building2,
  Calendar,
  Send,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Layers,
  X,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  Scale,
  Edit3,
  Printer,
  Upload,
  Save,
  UserCheck,
  ArrowLeft,
} from 'lucide-react';
import type { GrnRow } from './grn-stats-bar';
import { uploadChallanInvoiceDocument, fetchPurchaseOrderOptions, printGrnReport } from '@/lib/procurement';

export interface GrnPurchaseEntry {
  po_no: string;
  item_group: string;
  item_description: string;
  item_code: string;
  item_brand: string;
  location: string;
  unit: string;
  purchase_category: string;
  open: boolean;
  approved_qty: number;
  as_on_date_po_balance_qty: number;
  return_qty: number;
  challan_qty: number;
  received_qty: number;
  balance_quantity_allowed: boolean;
  pr_no: string;
  test_report_no: string;
  expiry_date: string;
  current_balance_qty: number;
}

export interface GrnExtraItem {
  sr: number;
  po_no: string;
  item_group: string;
  item_desc: string;
  item_brand: string;
  purchase_category: string;
  quantity: number;
  grn_stock_unit: string;
  loading_unloading_chgs: number;
  test_report_no: string;
}

export interface GrnPoRemark {
  sr: number;
  po_no: string;
  remarks: string;
}

export interface FullGrnFormState {
  // Uploaded Invoice Document Details
  uploaded_invoice_url?: string;
  uploaded_invoice_path?: string;
  uploaded_invoice_name?: string;

  // Header Fields (in exact order)
  qc_no: string;
  gr_no: string;
  grn_date: string;
  project_name: string;
  company_name: string;
  supplier_name: string;
  phone_no: string;
  mobile_no: string;
  godown_name: string;
  dealer_name: string;
  challan_no: string;
  transporter_name: string;
  vehicle_measure_required: boolean;
  vehicle_no: string;
  length_in_inches: number;
  breadth_in_inches: number;
  height_in_inches: number;
  volume_in_brass: number;
  weight_required: boolean;
  name_of_weight: string;
  in_wt1: number;
  out_wt1: number;
  net_weight1: number;
  name_of_weight2: string;
  in_wt2: number;
  out_wt2: number;
  net_weight2: number;
  avg_weight: number;
  grn_weight: number;
  weight_difference: number;
  allow_wt_difference: number;
  net_wt_difference: number;
  po_exist: boolean;
  from_pos: string;

  // Tables
  purchase_entries: GrnPurchaseEntry[];
  extra_items: GrnExtraItem[];

  // Post-Table Fields
  total_extra_items_received: number;
  remarks: string;
  account_posting_material_amount: number;
  asset_amount: number;
  asset_item: string;

  // PO Remarks Table
  po_remarks_list: GrnPoRemark[];

  // Footer Fields
  pb_lines_created: number;
  unlocked_fy: number;
  status: 'Draft' | 'Pending Verification' | 'Pending Approval' | 'Approved';
  assigned_approval_role?: string;
}

interface GrnFormProps {
  grn: GrnRow;
  onSubmit: (formData: FullGrnFormState) => void;
  /** Generates the report-format Goods Received Note PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

export function GrnForm({ grn, onSubmit, onPrint, onCancel }: GrnFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // Local File states (deferred upload until form submit)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isInvoiceDirty, setIsInvoiceDirty] = useState(false);

  // Supabase fetched Purchase Orders
  const [poOptions, setPoOptions] = useState<{ id: string; po_number: string; vendor_name?: string; material_details?: string }[]>([]);

  useEffect(() => {
    let active = true;
    fetchPurchaseOrderOptions().then((list) => {
      if (active) {
        setPoOptions(list);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const [form, setForm] = useState<FullGrnFormState>(() => {
    const isNew = !grn.id;
    return {

      uploaded_invoice_url: '',
      uploaded_invoice_path: '',
      uploaded_invoice_name: '',
      qc_no: isNew ? '' : 'QC-2026-0881',
      gr_no: grn.grn_number || '',
      grn_date: grn.received_date || `${todayStr} 10:00`,
      project_name: grn.project_name && grn.project_name !== '—' ? grn.project_name : '',
      company_name: 'Pramukh Group Infrastructure Ltd.',
      supplier_name: grn.vendor_name && grn.vendor_name !== '—' ? grn.vendor_name : '',
      phone_no: '',
      mobile_no: '',
      godown_name: grn.godown_name && grn.godown_name !== '—' ? grn.godown_name : 'Main Site Store',
      dealer_name: '',
      challan_no: grn.challan_no && grn.challan_no !== '—' ? grn.challan_no : '',
      transporter_name: '',
      vehicle_measure_required: false,
      vehicle_no: grn.vehicle_no && grn.vehicle_no !== '—' ? grn.vehicle_no : '',
      length_in_inches: 0.0,
      breadth_in_inches: 0.0,
      height_in_inches: 0.0,
      volume_in_brass: 0.0,
      weight_required: false,
      name_of_weight: 'Bridge Scale 1',
      in_wt1: 0.0,
      out_wt1: 0.0,
      net_weight1: 0.0,
      name_of_weight2: '',
      in_wt2: 0.0,
      out_wt2: 0.0,
      net_weight2: 0.0,
      avg_weight: 0.0,
      grn_weight: 0.0,
      weight_difference: 0.0,
      allow_wt_difference: 0.05,
      net_wt_difference: 0.0,
      po_exist: !!(grn.po_number && grn.po_number !== '—' && grn.po_number !== ''),
      from_pos: grn.po_number && grn.po_number !== '—' ? grn.po_number : 'Not Exist',

      purchase_entries: isNew ? [] : [
        {
          po_no: grn.po_number || '',
          item_group: 'Material',
          item_description: 'Received Goods',
          item_code: 'ITM-001',
          item_brand: '',
          location: 'Main Site Store',
          unit: 'NOS',
          purchase_category: 'Direct Construction Material',
          open: true,
          approved_qty: 1,
          as_on_date_po_balance_qty: 1,
          return_qty: 0,
          challan_qty: 1,
          received_qty: 1,
          balance_quantity_allowed: true,
          pr_no: '',
          test_report_no: '',
          expiry_date: '',
          current_balance_qty: 0,
        },
      ],

      extra_items: [],
      total_extra_items_received: 0,
      remarks: isNew ? '' : 'Goods inspected and verified at site store gate.',
      account_posting_material_amount: isNew ? 0 : 45000,
      asset_amount: 0.0,
      asset_item: '',

      po_remarks_list: [],

      pb_lines_created: isNew ? 0 : 1,
      unlocked_fy: 2026,
      status: isNew ? 'Draft' : ((grn as any).raw_status || 'Draft') as FullGrnFormState['status'],
      assigned_approval_role: '',
    };
  });

  // Handle local file selection without uploading immediately
  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filenameClean = file.name.toUpperCase();

    setInvoiceFile(file);
    setIsInvoiceDirty(true);
    const extractedVendor = filenameClean.includes('PIDILITE')
      ? 'Pidilite Industries Ltd.'
      : filenameClean.includes('SIKA')
      ? 'Sika India Pvt Ltd'
      : filenameClean.includes('ULTRATECH')
      ? 'UltraTech Cement Ltd.'
      : form.supplier_name || 'MODERN ENGINEERING CO.';

    setForm((prev) => ({
      ...prev,
      supplier_name: extractedVendor,
      uploaded_invoice_name: file.name,
    }));
  };

  // Remove attached document
  const handleRemoveDocument = () => {
    setInvoiceFile(null);
    setIsInvoiceDirty(true);
    setForm((prev) => ({
      ...prev,
      uploaded_invoice_name: '',
      uploaded_invoice_url: '',
      uploaded_invoice_path: '',
    }));
  };

  const updateHeader = <K extends keyof FullGrnFormState>(key: K, value: FullGrnFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePurchaseEntryChange = (index: number, field: keyof GrnPurchaseEntry, value: any) => {
    setForm((prev) => {
      const updated = [...prev.purchase_entries];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, purchase_entries: updated };
    });
  };
  const [newPoRemark, setNewPoRemark] = useState({ po_no: '', remarks: '' });

  const handleAddPoRemark = () => {
    if (!newPoRemark.remarks.trim()) return;
    setForm((prev) => ({
      ...prev,
      po_remarks_list: [
        ...prev.po_remarks_list,
        {
          sr: prev.po_remarks_list.length + 1,
          po_no: newPoRemark.po_no || form.from_pos,
          remarks: newPoRemark.remarks.trim(),
        },
      ],
    }));
    setNewPoRemark({ po_no: '', remarks: '' });
  };

  const handleRemovePoRemark = (sr: number) => {
    setForm((prev) => ({
      ...prev,
      po_remarks_list: prev.po_remarks_list.filter((r) => r.sr !== sr),
    }));
  };

  const handleAddPurchaseEntry = () => {
    setForm((prev) => ({
      ...prev,
      purchase_entries: [
        ...prev.purchase_entries,
        {
          po_no: prev.from_pos && prev.from_pos !== 'Not Exist' ? prev.from_pos : '',
          item_group: 'Material',
          item_description: 'New Material Item',
          item_code: `ITM-00${prev.purchase_entries.length + 1}`,
          item_brand: 'Standard',
          location: prev.godown_name || 'Main Site Store',
          unit: 'NOS',
          purchase_category: 'Direct Construction Material',
          open: true,
          approved_qty: 1,
          as_on_date_po_balance_qty: 1,
          return_qty: 0,
          challan_qty: 1,
          received_qty: 1,
          balance_quantity_allowed: true,
          pr_no: '',
          test_report_no: '',
          expiry_date: '',
          current_balance_qty: 0,
        },
      ],
    }));
  };

  const handleRemovePurchaseEntry = (index: number) => {
    setForm((prev) => ({
      ...prev,
      purchase_entries: prev.purchase_entries.filter((_, idx) => idx !== index),
    }));
  };

  const handleAddExtraItem = () => {
    setForm((prev) => ({
      ...prev,
      extra_items: [
        ...prev.extra_items,
        {
          sr: prev.extra_items.length + 1,
          po_no: prev.from_pos && prev.from_pos !== 'Not Exist' ? prev.from_pos : '',
          item_group: 'Bonus Material',
          item_desc: 'Extra Unscheduled Item',
          item_brand: 'Standard',
          purchase_category: 'Direct Construction Material',
          quantity: 1,
          grn_stock_unit: 'NOS',
          loading_unloading_chgs: 0,
          test_report_no: '',
        },
      ],
    }));
  };

  const handleRemoveExtraItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      extra_items: prev.extra_items
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, sr: idx + 1 })),
    }));
  };

  const handleExtraItemChange = (index: number, field: keyof GrnExtraItem, value: any) => {
    setForm((prev) => {
      const updated = [...prev.extra_items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, extra_items: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let updatedInvoiceUrl = form.uploaded_invoice_url || '';
    let updatedInvoicePath = form.uploaded_invoice_path || '';

    // Upload Invoice if dirty and new file attached
    if (isInvoiceDirty && invoiceFile) {
      setUploadingInvoice(true);
      try {
        const uploadRes = await uploadChallanInvoiceDocument(invoiceFile, 'grn-invoice');
        if (uploadRes.data) {
          updatedInvoiceUrl = uploadRes.data.signedUrl || uploadRes.data.publicUrl;
          updatedInvoicePath = uploadRes.data.storagePath;
        }
      } catch (err: any) {
        alert(`Invoice upload failed: ${err?.message || 'Error'}`);
      } finally {
        setUploadingInvoice(false);
      }
    }

    const finalFormState: FullGrnFormState = {
      ...form,
      uploaded_invoice_url: updatedInvoiceUrl,
      uploaded_invoice_path: updatedInvoicePath,
    };

    onSubmit(finalFormState);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Header Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Goods Receipt Note (GRN) Entry Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Site Material Receipt, Vehicle Weighbridge Measurement &amp; QC Audit Log
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        {/* TOP SECTION: UPLOAD SUPPLIER INVOICE (includes challan details)           */}
        {/* ========================================================================= */}
        <div>
          {/* Upload Supplier Invoice (grn-invoice) */}
          <div className="rounded-xl border-2 border-dashed border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shadow-xs">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs flex items-center gap-1.5">
                      <span>Upload Supplier Invoice</span>
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-600 dark:text-emerald-400 font-mono uppercase">grn-invoice</span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Upload invoice/challan PDF or image to extract fields, auto-populate GRN details, and connect to Supabase storage.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {form.uploaded_invoice_url && (
                    <a
                      href={form.uploaded_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer shrink-0"
                    >
                      <FileCheck className="h-3.5 w-3.5" /> View Uploaded PDF
                    </a>
                  )}
                  {form.uploaded_invoice_name && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument()}
                      title="Remove attached Supplier Invoice PDF"
                      className="rounded-md border border-red-500/40 bg-red-500/10 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <label className="relative flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 cursor-pointer transition-all shadow-xs">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => handleFileSelect(e)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploadingInvoice}
                />
                {uploadingInvoice ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 animate-pulse font-mono text-xs">
                    <Upload className="h-3.5 w-3.5 animate-spin" /> Saving Invoice to Supabase...
                  </span>
                ) : form.uploaded_invoice_name ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-medium truncate text-xs">
                    <FileCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Attached File: <strong className="truncate">{form.uploaded_invoice_name}</strong> (Click to change file)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Upload className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Drag &amp; Drop or Click to Upload Invoice
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Exact Field Order as Specified)                 */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Goods Receipt &amp; Vehicle Weighbridge Logistics Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. QC No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">QC No.</label>
              <input
                type="text"
                value={form.qc_no}
                onChange={(e) => updateHeader('qc_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 2. GR No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GR No.</label>
              <input
                type="text"
                value={form.gr_no}
                onChange={(e) => updateHeader('gr_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-extrabold text-foreground"
              />
            </div>

            {/* 3. GRN Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">GRN Date*</label>
              <input
                type="text"
                value={form.grn_date}
                onChange={(e) => updateHeader('grn_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* 4. Project Name* */}
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

            {/* 5. Name of Company */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Company</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateHeader('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 6. Supplier Name* */}
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

            {/* 7. Phone No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Phone No.</label>
              <input
                type="text"
                value={form.phone_no}
                onChange={(e) => updateHeader('phone_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 8. Mobile No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Mobile No.</label>
              <input
                type="text"
                value={form.mobile_no}
                onChange={(e) => updateHeader('mobile_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 9. Godown Name* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Godown Name*</label>
              <input
                type="text"
                value={form.godown_name}
                onChange={(e) => updateHeader('godown_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 10. Dealer Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Dealer Name</label>
              <input
                type="text"
                value={form.dealer_name}
                onChange={(e) => updateHeader('dealer_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 11. Challan No.* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Challan No.*</label>
              <input
                type="text"
                value={form.challan_no}
                onChange={(e) => updateHeader('challan_no', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-foreground"
                required
              />
            </div>

            {/* 12. Transporter Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Transporter Name</label>
              <input
                type="text"
                value={form.transporter_name}
                onChange={(e) => updateHeader('transporter_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 13. Vehicle Measure Required */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vehicle Measure Required</label>
              <select
                value={form.vehicle_measure_required ? 'Yes' : 'No'}
                onChange={(e) => updateHeader('vehicle_measure_required', e.target.value === 'Yes')}
                className="w-full rounded-lg border-2 border-primary/40 bg-background px-3 py-2 font-bold text-foreground text-xs cursor-pointer"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {form.vehicle_measure_required && (
              <>
                {/* 14. Vehicle No */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vehicle No</label>
                  <input
                    type="text"
                    value={form.vehicle_no}
                    onChange={(e) => updateHeader('vehicle_no', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
                  />
                </div>

                {/* 15. Length In Inches */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Length In Inches</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.length_in_inches}
                    onChange={(e) => updateHeader('length_in_inches', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 16. Breadth In Inches */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Breadth In Inches</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.breadth_in_inches}
                    onChange={(e) => updateHeader('breadth_in_inches', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 17. Height In Inches */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Height In Inches</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.height_in_inches}
                    onChange={(e) => updateHeader('height_in_inches', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 18. Volume In Brass */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Volume In Brass</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.volume_in_brass}
                    onChange={(e) => updateHeader('volume_in_brass', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>
              </>
            )}

            {/* 19. Weight Required */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Weight Required</label>
              <select
                value={form.weight_required ? 'Yes' : 'No'}
                onChange={(e) => updateHeader('weight_required', e.target.value === 'Yes')}
                className="w-full rounded-lg border-2 border-primary/40 bg-background px-3 py-2 font-bold text-foreground text-xs cursor-pointer"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {form.weight_required && (
              <>
                {/* 20. Name of Weight */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Weight</label>
                  <input
                    type="text"
                    value={form.name_of_weight}
                    onChange={(e) => updateHeader('name_of_weight', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
                  />
                </div>

                {/* 21. In Wt1 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">In Wt1</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.in_wt1}
                    onChange={(e) => updateHeader('in_wt1', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 22. Out Wt1 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Out Wt1</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.out_wt1}
                    onChange={(e) => updateHeader('out_wt1', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 23. Net Weight1 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Weight1</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.net_weight1}
                    onChange={(e) => updateHeader('net_weight1', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 24. Name of Weight2 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Weight2</label>
                  <input
                    type="text"
                    value={form.name_of_weight2}
                    onChange={(e) => updateHeader('name_of_weight2', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
                  />
                </div>

                {/* 25. In Wt2 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">In Wt2</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.in_wt2}
                    onChange={(e) => updateHeader('in_wt2', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 26. Out Wt2 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Out Wt2</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.out_wt2}
                    onChange={(e) => updateHeader('out_wt2', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 27. Net Weight2 */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Weight2</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.net_weight2}
                    onChange={(e) => updateHeader('net_weight2', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 28. Avg Weight */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Avg Weight</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.avg_weight}
                    onChange={(e) => updateHeader('avg_weight', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 29. GRN Weight */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GRN Weight</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.grn_weight}
                    onChange={(e) => updateHeader('grn_weight', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-extrabold text-foreground"
                  />
                </div>

                {/* 30. Weight Difference */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Weight Difference</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.weight_difference}
                    onChange={(e) => updateHeader('weight_difference', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-red-600"
                  />
                </div>

                {/* 31. Allow Wt Difference */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Allow Wt Difference</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.allow_wt_difference}
                    onChange={(e) => updateHeader('allow_wt_difference', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
                  />
                </div>

                {/* 32. Net Wt Difference */}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Wt Difference</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.net_wt_difference}
                    onChange={(e) => updateHeader('net_wt_difference', Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-red-600"
                  />
                </div>
              </>
            )}

            {/* 33. P.O. Exist */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">P.O. Exist</label>
              <select
                value={form.po_exist ? 'Yes' : 'No'}
                onChange={(e) => {
                  const exists = e.target.value === 'Yes';
                  updateHeader('po_exist', exists);
                  if (!exists) updateHeader('from_pos', 'Not Exist');
                  else if (form.from_pos === 'Not Exist') updateHeader('from_pos', '');
                }}
                className="w-full rounded-lg border-2 border-primary/40 bg-background px-3 py-2 font-bold text-foreground text-xs cursor-pointer"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {/* 34. From P.O.s */}
            {form.po_exist ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-[11px] font-bold uppercase text-primary mb-1">From P.O.s</label>
                <select
                  value={form.from_pos === 'Not Exist' ? '' : form.from_pos}
                  onChange={(e) => {
                    const selectedPo = e.target.value;
                    updateHeader('from_pos', selectedPo);
                    setForm((prev) => ({
                      ...prev,
                      from_pos: selectedPo,
                      purchase_entries: prev.purchase_entries.map((entry) => ({
                        ...entry,
                        po_no: entry.po_no ? entry.po_no : selectedPo,
                      })),
                    }));
                  }}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-xs cursor-pointer"
                >
                  <option value="">-- Select P.O. Number --</option>
                  {poOptions.map((po) => {
                    const desc = [po.vendor_name, po.material_details].filter(Boolean).join(' - ');
                    return (
                      <option key={po.id || po.po_number} value={po.po_number}>
                        {po.po_number} {desc ? `(${desc})` : ''}
                      </option>
                    );
                  })}
                  {form.from_pos && form.from_pos !== 'Not Exist' && !poOptions.some((p) => p.po_number === form.from_pos) && (
                    <option value={form.from_pos}>{form.from_pos}</option>
                  )}
                </select>
              </div>
            ) : (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">From P.O.s</label>
                <div className="w-full rounded-lg border-2 border-border bg-muted/40 px-3 py-2.5 font-mono font-extrabold text-muted-foreground text-xs">
                  Not Exist
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: PURCHASE ENTRIES TABLE (19 Columns + Action) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                2. Purchase Entries Table ({form.purchase_entries.length})
              </h3>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Quantity Verification &amp; Expiry Audit
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddPurchaseEntry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add Purchase Entry
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-3 font-bold text-primary min-w-[140px]">1. PO No.*</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[140px]">2. Item Group*</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[180px]">3. Item Description*</th>
                  <th className="px-3 py-3 min-w-[110px]">4. Item Code</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[130px]">5. Item Brand*</th>
                  <th className="px-3 py-3 min-w-[140px]">6. Location</th>
                  <th className="px-3 py-3 font-bold text-primary text-center min-w-[90px]">7. Unit*</th>
                  <th className="px-3 py-3 min-w-[140px]">8. Purchase Category</th>
                  <th className="px-3 py-3 text-center min-w-[70px]">9. Open</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">10. Approved Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[150px]">11. As on Date PO Balance Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">12. Return Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">13. Challan Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">14. Received Qty.</th>
                  <th className="px-3 py-3 text-center min-w-[140px]">15. Balance Quantity Allowed</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[120px]">16. P.RNo*</th>
                  <th className="px-3 py-3 min-w-[120px]">17. Test Report No</th>
                  <th className="px-3 py-3 min-w-[110px]">18. Expiry Date</th>
                  <th className="px-3 py-3 text-right min-w-[130px]">19. Current Balance Qty</th>
                  <th className="px-3 py-3 text-center min-w-[70px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.purchase_entries.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-3 py-6 text-center text-muted-foreground font-sans">
                      No purchase entries added yet. Click <strong>+ Add Purchase Entry</strong> to add rows.
                    </td>
                  </tr>
                ) : (
                  form.purchase_entries.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      {/* 1. PO No.* */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.po_no}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'po_no', e.target.value)}
                          className="w-32 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-primary"
                        />
                      </td>
                      {/* 2. Item Group* */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.item_group}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'item_group', e.target.value)}
                          className="w-32 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-semibold text-foreground"
                        />
                      </td>
                      {/* 3. Item Description* */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.item_description}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'item_description', e.target.value)}
                          className="w-44 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-foreground"
                        />
                      </td>
                      {/* 4. Item Code */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.item_code}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'item_code', e.target.value)}
                          className="w-24 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                        />
                      </td>
                      {/* 5. Item Brand* */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.item_brand}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'item_brand', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-foreground"
                        />
                      </td>
                      {/* 6. Location */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.location}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'location', e.target.value)}
                          className="w-32 rounded border border-border bg-background px-2 py-1 font-sans text-xs text-muted-foreground"
                        />
                      </td>
                      {/* 7. Unit* */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'unit', e.target.value)}
                          className="w-16 text-center rounded border border-border bg-background px-1.5 py-1 font-sans text-xs font-bold text-foreground"
                        />
                      </td>
                      {/* 8. Purchase Category */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.purchase_category}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'purchase_category', e.target.value)}
                          className="w-36 rounded border border-border bg-background px-2 py-1 font-sans text-xs text-muted-foreground"
                        />
                      </td>
                      {/* 9. Open */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.open}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'open', e.target.checked)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                      </td>
                      {/* 10. Approved Qty. */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.approved_qty}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'approved_qty', Number(e.target.value))}
                          className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-extrabold text-foreground"
                        />
                      </td>
                      {/* 11. As on Date PO Balance Qty. */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.as_on_date_po_balance_qty}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'as_on_date_po_balance_qty', Number(e.target.value))}
                          className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-bold text-muted-foreground"
                        />
                      </td>
                      {/* 12. Return Qty. */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.return_qty}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'return_qty', Number(e.target.value))}
                          className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-bold text-red-600"
                        />
                      </td>
                      {/* 13. Challan Qty. */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.challan_qty}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'challan_qty', Number(e.target.value))}
                          className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-extrabold text-primary"
                        />
                      </td>
                      {/* 14. Received Qty. */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.received_qty}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'received_qty', Number(e.target.value))}
                          className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-extrabold text-foreground"
                        />
                      </td>
                      {/* 15. Balance Quantity Allowed */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.balance_quantity_allowed}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'balance_quantity_allowed', e.target.checked)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                      </td>
                      {/* 16. P.RNo* */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.pr_no}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'pr_no', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-primary"
                        />
                      </td>
                      {/* 17. Test Report No */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.test_report_no}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'test_report_no', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs text-muted-foreground"
                        />
                      </td>
                      {/* 18. Expiry Date */}
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={item.expiry_date}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'expiry_date', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-1.5 py-1 font-sans text-xs text-muted-foreground"
                        />
                      </td>
                      {/* 19. Current Balance Qty */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.current_balance_qty}
                          onChange={(e) => handlePurchaseEntryChange(idx, 'current_balance_qty', Number(e.target.value))}
                          className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-bold text-foreground"
                        />
                      </td>
                      {/* Action: Remove */}
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePurchaseEntry(idx)}
                          className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Remove Purchase Entry"
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

        {/* SECTION 3: EXTRA ITEM RECEIVED TABLE (10 Columns + Action) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                3. Extra Item Received Table ({form.extra_items.length})
              </h3>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Unscheduled / Bonus Material Items
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddExtraItem}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add Extra Item
            </button>
          </div>

          {form.extra_items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No extra un-ordered items added yet. Click <strong>+ Add Extra Item</strong> to add rows.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-center">1. Sr</th>
                    <th className="px-3 py-3 min-w-[130px]">2. P.O. No</th>
                    <th className="px-3 py-3 min-w-[130px]">3. Item Group</th>
                    <th className="px-3 py-3 min-w-[180px]">4. Item Desc</th>
                    <th className="px-3 py-3 min-w-[120px]">5. Item Brand</th>
                    <th className="px-3 py-3 min-w-[140px]">6. Purchase Category</th>
                    <th className="px-3 py-3 text-right min-w-[90px]">7. Quantity</th>
                    <th className="px-3 py-3 text-center min-w-[90px]">8. GRN Stock Unit</th>
                    <th className="px-3 py-3 text-right min-w-[130px]">9. Loading / Unloading Chgs</th>
                    <th className="px-3 py-3 min-w-[120px]">10. Test Report No</th>
                    <th className="px-3 py-3 text-center min-w-[70px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.extra_items.map((ex, idx) => (
                    <tr key={ex.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2 text-center font-bold text-muted-foreground">{ex.sr}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ex.po_no}
                          onChange={(e) => handleExtraItemChange(idx, 'po_no', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-primary"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ex.item_group}
                          onChange={(e) => handleExtraItemChange(idx, 'item_group', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-semibold text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ex.item_desc}
                          onChange={(e) => handleExtraItemChange(idx, 'item_desc', e.target.value)}
                          className="w-40 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ex.item_brand}
                          onChange={(e) => handleExtraItemChange(idx, 'item_brand', e.target.value)}
                          className="w-24 rounded border border-border bg-background px-2 py-1 font-sans text-xs font-bold text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ex.purchase_category}
                          onChange={(e) => handleExtraItemChange(idx, 'purchase_category', e.target.value)}
                          className="w-32 rounded border border-border bg-background px-2 py-1 font-sans text-xs text-muted-foreground"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={ex.quantity}
                          onChange={(e) => handleExtraItemChange(idx, 'quantity', Number(e.target.value))}
                          className="w-16 text-right rounded border border-border bg-background px-1.5 py-1 text-xs font-extrabold text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="text"
                          value={ex.grn_stock_unit}
                          onChange={(e) => handleExtraItemChange(idx, 'grn_stock_unit', e.target.value)}
                          className="w-16 text-center rounded border border-border bg-background px-1.5 py-1 font-sans text-xs font-bold text-muted-foreground"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={ex.loading_unloading_chgs}
                          onChange={(e) => handleExtraItemChange(idx, 'loading_unloading_chgs', Number(e.target.value))}
                          className="w-20 text-right rounded border border-border bg-background px-1.5 py-1 text-xs font-medium text-foreground"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={ex.test_report_no}
                          onChange={(e) => handleExtraItemChange(idx, 'test_report_no', e.target.value)}
                          className="w-28 rounded border border-border bg-background px-2 py-1 font-sans text-xs text-muted-foreground"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveExtraItem(idx)}
                          className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Remove Extra Item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: POST-TABLE FIELDS & PO REMARKS TABLE                           */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            4. Post-Receipt Accounting &amp; PO Remarks Summary (Total {form.po_remarks_list.length})
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Extra Items Received */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Extra Items Received</label>
              <input
                type="number"
                step="0.01"
                value={form.total_extra_items_received}
                onChange={(e) => updateHeader('total_extra_items_received', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Account Posting Material Amount */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Account Posting Material Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.account_posting_material_amount}
                onChange={(e) => updateHeader('account_posting_material_amount', Number(e.target.value))}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-base"
              />
            </div>

            {/* Asset Amount */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Asset Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.asset_amount}
                onChange={(e) => updateHeader('asset_amount', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Asset Item */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Asset Item</label>
              <input
                type="text"
                value={form.asset_item}
                onChange={(e) => updateHeader('asset_item', e.target.value)}
                placeholder="Asset Tag (If applicable)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Remarks</label>
              <textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => updateHeader('remarks', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background p-2.5 font-medium text-foreground"
                required
              />
            </div>
          </div>

          {/* PO Remarks Table (Add or edit options only) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                PO Remarks Summary (Total {form.po_remarks_list.length})
              </h4>
              <span className="text-[11px] font-semibold text-muted-foreground">
                Add or Edit Options Only
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-12">Sr</th>
                    <th className="px-3 py-2.5 min-w-[150px]">PO No.</th>
                    <th className="px-3 py-2.5 min-w-[300px]">Remarks</th>
                    <th className="px-3 py-2.5 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.po_remarks_list.map((rem) => (
                    <tr key={rem.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2 text-center font-bold text-muted-foreground">{rem.sr}</td>
                      <td className="px-3 py-2 font-sans font-bold text-primary">{rem.po_no}</td>
                      <td className="px-3 py-2 font-sans font-medium text-foreground truncate max-w-[400px]">{rem.remarks}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemovePoRemark(rem.sr)}
                          className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove Remark"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add PO Remark Control */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="PO No (e.g. TI/PR/PO/2026/0021)"
                value={newPoRemark.po_no}
                onChange={(e) => setNewPoRemark((prev) => ({ ...prev, po_no: e.target.value }))}
                className="w-48 rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground text-xs"
              />
              <input
                type="text"
                placeholder="Enter PO remark detail..."
                value={newPoRemark.remarks}
                onChange={(e) => setNewPoRemark((prev) => ({ ...prev, remarks: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground text-xs"
              />
              <button
                type="button"
                onClick={handleAddPoRemark}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Add Remark
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 5: FOOTER FORM TABULAR FIELDS                                     */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            5. Final GRN Status &amp; FY Release Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* PB Lines Created */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">PB Lines Created</label>
              <input
                type="number"
                step="0.01"
                value={form.pb_lines_created}
                onChange={(e) => updateHeader('pb_lines_created', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Unlocked FY */}
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

            {/* Status (dropdown) */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">GRN Status</label>
              <select
                value={form.status}
                onChange={(e) => updateHeader('status', e.target.value as FullGrnFormState['status'])}
                className={`w-full rounded-lg border-2 px-3 py-2 font-extrabold text-xs cursor-pointer ${
                  form.status === 'Draft' ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                  form.status === 'Pending Verification' ? 'border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-300' :
                  form.status === 'Pending Approval' ? 'border-purple-500/60 bg-purple-500/10 text-purple-700 dark:text-purple-300' :
                  'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                <option value="Draft">📝 Draft</option>
                <option value="Pending Verification">🔍 Pending Verification</option>
                <option value="Pending Approval">📋 Pending Approval</option>
                <option value="Approved">✅ GRN Approved (PB Created)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* WORKFLOW ACTION BUTTONS                                                   */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-4">
            {/* PRINT BUTTON AT BOTTOM LEFT CORNER */}
            <button
              type="button"
              onClick={onPrint || (() => printGrnReport(form))}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Print
            </button>

            <div className="text-xs font-bold text-muted-foreground">
              Posting Material Amount: <span className="font-mono text-sm text-primary font-extrabold">₹{form.account_posting_material_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* ---------- DRAFT STATUS BUTTONS ---------- */}
          {form.status === 'Draft' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  updateHeader('status', 'Draft');
                  onSubmit({ ...form, status: 'Draft' });
                }}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
              >
                <Save className="h-4 w-4" /> Save as Draft
              </button>

              <button
                type="button"
                onClick={() => {
                  updateHeader('status', 'Pending Verification');
                  onSubmit({ ...form, status: 'Pending Verification' });
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer"
              >
                <Send className="h-4 w-4" /> Send for Verification
              </button>
            </div>
          )}

          {/* ---------- PENDING VERIFICATION STATUS BUTTONS ---------- */}
          {form.status === 'Pending Verification' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  updateHeader('status', 'Draft');
                  onSubmit({ ...form, status: 'Draft' });
                }}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> Return to Draft
              </button>

              <div className="flex items-center gap-1.5">
                <select
                  value={form.assigned_approval_role || ''}
                  onChange={(e) => updateHeader('assigned_approval_role', e.target.value)}
                  className="rounded-lg border-2 border-purple-500/50 bg-background px-3 py-2 text-xs font-bold text-foreground cursor-pointer"
                >
                  <option value="">Select Role…</option>
                  <option value="Site Engineer">Site Engineer</option>
                  <option value="Store Keeper">Store Keeper</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Purchase Manager">Purchase Manager</option>
                  <option value="QC Inspector">QC Inspector</option>
                  <option value="Upper Management">Upper Management</option>
                </select>
                <button
                  type="button"
                  disabled={!form.assigned_approval_role}
                  onClick={() => {
                    updateHeader('status', 'Pending Approval');
                    onSubmit({ ...form, status: 'Pending Approval' });
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <UserCheck className="h-4 w-4" /> Assign for Approval
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  updateHeader('status', 'Approved');
                  onSubmit({ ...form, status: 'Approved' });
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" /> Send for PB (GRN Approved)
              </button>
            </div>
          )}

          {/* ---------- PENDING APPROVAL STATUS BUTTONS ---------- */}
          {form.status === 'Pending Approval' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  updateHeader('status', 'Draft');
                  onSubmit({ ...form, status: 'Draft' });
                }}
                className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" /> Return to Draft
              </button>

              <button
                type="button"
                onClick={() => {
                  updateHeader('status', 'Approved');
                  onSubmit({ ...form, status: 'Approved' });
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" /> Send for PB (GRN Approved)
              </button>
            </div>
          )}

          {/* ---------- APPROVED STATUS BUTTONS ---------- */}
          {form.status === 'Approved' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Close
              </button>
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> GRN Approved — PB Lines Created
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
