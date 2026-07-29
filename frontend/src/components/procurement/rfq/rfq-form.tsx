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
  FileUp,
  FileDown,
  Eye,
  Check,
  Clock,
  Loader2,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import type { PurchaseRequisitionRow, VendorRow } from '@/lib/procurement';
import { printRfqReport } from '@/lib/procurement';
import { supabase } from '@/utils/supabase-client';
import { RfqPdfPreviewModal } from './rfq-pdf-preview-modal';

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

export type RfqStatusType =
  | 'Auto-Draft'
  | 'Draft'
  | 'RFQ Sent'
  | 'Waiting for Quotation'
  | 'Quotation Received & Approved'
  | 'Approved';

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
  status: RfqStatusType;
  selected_quotation_url?: string | null;
  selection_remark?: string;
  items: RfqFormItemRow[];
  suppliers: RfqFormSupplierRow[];
}

interface RfqFormProps {
  approvedPr: PurchaseRequisitionRow;
  /** Live vendor registry — the supplier picker's source of truth. */
  suppliers?: RfqSupplierOption[];
  isReadOnly?: boolean;
  onSubmit: (formData: RfqFormState, isDirectPo: boolean) => void;
  onCancel: () => void;
}

export function RfqForm({
  approvedPr,
  suppliers: supplierMaster = [],
  isReadOnly = false,
  onSubmit,
  onCancel,
}: RfqFormProps) {
  // Generate Quotation Registration No (e.g. RFQ-20260728-001)
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
    status: 'Auto-Draft',
    selected_quotation_url: null,
    selection_remark: '',
    items: (approvedPr.purchase_requisition_lines || []).length > 0
      ? (approvedPr.purchase_requisition_lines || []).map((line, idx) => ({
          key: `line-${line.id || idx}`,
          item_id: line.item_id || null,
          item_code: line.item_code || `ITEM-00${idx + 1}`,
          item_group: line.item_group || (idx === 0 ? 'Cement' : 'Sealants & Adhesives'),
          item_brand: line.preferred_brand || (idx === 0 ? 'Pidilite • Dr. Fixit' : 'Sika • SikaFlex'),
          item_description: line.item_description || (idx === 0 ? 'Dr. Fixit 101 LW+ Integral Liquid Waterproofing' : 'Polyurethane Elastomeric Sealant SikaFlex'),
          specification: line.specification || (idx === 0 ? 'Dr. Fixit 101 LW+ Integral Liquid Waterproofing' : 'Polyurethane Elastomeric Sealant SikaFlex'),
          quantity: Number(line.quantity || 300),
          pr_balance_qty: Number(line.remaining_mr_qty || line.quantity || 300),
          previous_rate: Number(line.estimated_rate || 350),
          unit: (line.unit || 'BAGS').toUpperCase(),
          required_date: line.required_date || defaultGoalDate,
          remarks: line.remarks || '',
        }))
      : [
          {
            key: 'line-0',
            item_id: null,
            item_code: 'ITEM-001',
            item_group: 'Cement',
            item_brand: 'Pidilite • Dr. Fixit',
            item_description: 'Dr. Fixit 101 LW+ Integral Liquid Waterproofing',
            specification: 'Dr. Fixit 101 LW+ Integral Liquid Waterproofing',
            quantity: 300.05,
            pr_balance_qty: 300,
            previous_rate: 350,
            unit: 'BAGS',
            required_date: defaultGoalDate,
            remarks: '',
          },
          {
            key: 'line-1',
            item_id: null,
            item_code: 'ITEM-002',
            item_group: 'Cement',
            item_brand: 'Sika • SikaFlex',
            item_description: 'Polyurethane Elastomeric Sealant SikaFlex',
            specification: 'Polyurethane Elastomeric Sealant SikaFlex',
            quantity: 300,
            pr_balance_qty: 300,
            previous_rate: 350,
            unit: 'BAGS',
            required_date: defaultGoalDate,
            remarks: '',
          },
        ],
    // Default 1 Empty Supplier Row
    suppliers: [
      {
        key: 'sup-row-0',
        supplier_id: supplierMaster[0]?.id || '',
        supplier_name: supplierMaster[0]?.name || '',
        email_to: supplierMaster[0]?.email || '',
        email_cc: 'procurement@pramukhgroup.com',
      },
    ],
  }));

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const viewModeActive =
    isReadOnly ||
    (form.status as string) === 'Quotation Received & Approved' ||
    (form.status as string) === 'Approved' ||
    (form.status as string) === 'PO Auto-Draft' ||
    approvedPr?.status === 'vendor_selected' ||
    approvedPr?.status === 'po_issued';

  // Quotation Upload is shown if process_type is Direct PO (from start) OR if status is Waiting for Quotation (or higher)
  const showQuotationUpload =
    (form.process_type as string) === 'Direct PO' ||
    (form.status as string) === 'Waiting for Quotation' ||
    (form.status as string) === 'Quotation Received & Approved' ||
    (form.status as string) === 'Approved' ||
    (form.status as string) === 'PO Auto-Draft' ||
    viewModeActive;

  // Handlers for Form Fields
  const updateField = <K extends keyof RfqFormState>(key: K, value: RfqFormState[K]) => {
    if (viewModeActive) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Item Table Handlers
  const handleItemChange = (index: number, field: keyof RfqFormItemRow, value: any) => {
    if (viewModeActive) return;
    setForm((prev) => {
      const updated = [...prev.items];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, items: updated };
    });
  };

  // Add Item to Table
  const handleAddItem = () => {
    if (viewModeActive) return;
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: `line-${Date.now()}-${prev.items.length}`,
          item_id: null,
          item_code: `ITEM-00${prev.items.length + 1}`,
          item_group: 'Cement',
          item_brand: 'Pidilite • Dr. Fixit',
          item_description: 'New Material Specification',
          specification: 'New Material Specification',
          quantity: 100,
          pr_balance_qty: 100,
          previous_rate: 350,
          unit: 'BAGS',
          required_date: form.goal_delivery_date,
          remarks: '',
        },
      ],
    }));
  };

  // Delete Item from Table
  const handleDeleteItem = (index: number) => {
    if (viewModeActive || form.items.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  // Dynamic Supplier (+) Add & (-) Remove Handlers
  const handleAddSupplier = () => {
    if (viewModeActive) return;
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
    if (viewModeActive || form.suppliers.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((_, idx) => idx !== index),
    }));
  };

  const handleSupplierSelect = (index: number, supplierId: string) => {
    if (viewModeActive) return;
    const found = supplierMaster.find((s) => s.id === supplierId);
    setForm((prev) => {
      const updated = [...prev.suppliers];
      if (found) {
        updated[index] = {
          ...updated[index],
          supplier_id: found.id,
          supplier_name: found.name,
          email_to: found.email,
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
    if (viewModeActive) return;
    setForm((prev) => {
      const updated = [...prev.suppliers];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, suppliers: updated };
    });
  };

  // Handle Quotation PDF File Upload to Supabase Storage
  const handleQuotationPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPdf(true);
      const fileExt = file.name.split('.').pop();
      const filePath = `quotations/${form.quotation_registration_no}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('procurement_docs')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        const localBlobUrl = URL.createObjectURL(file);
        setForm((prev) => ({ ...prev, selected_quotation_url: localBlobUrl }));
      } else {
        const { data: publicUrlData } = supabase.storage
          .from('procurement_docs')
          .getPublicUrl(filePath);
        setForm((prev) => ({ ...prev, selected_quotation_url: publicUrlData.publicUrl }));
      }
    } catch (err) {
      const localBlobUrl = URL.createObjectURL(file);
      setForm((prev) => ({ ...prev, selected_quotation_url: localBlobUrl }));
    } finally {
      setUploadingPdf(false);
    }
  };

  // Trigger Action Button with Target Status Transition
  const handleAction = (targetStatus: RfqStatusType, isDirectPoSubmission: boolean = false) => {
    const updatedForm: RfqFormState = { ...form, status: targetStatus };
    setForm(updatedForm);
    const isDirectPo = form.process_type === 'Direct PO' || isDirectPoSubmission;
    onSubmit(updatedForm, isDirectPo);
  };

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
            <h2 className="font-heading text-lg font-bold text-foreground flex items-center gap-2">
              Request for Quotation (RFQ) {viewModeActive ? 'View Form' : 'Registration Form'}
              <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {form.quotation_registration_no}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Source PR: <span className="font-bold text-primary">{approvedPr.pr_number}</span> • Process Type:{' '}
              <span className="font-bold text-foreground">{form.process_type}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Source PR Approved
          </span>
          <button
            type="button"
            onClick={() => setPdfModalOpen(true)}
            title="Preview and Print RFQ Report PDF"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-primary" /> Print / PDF Report
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
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
                disabled={viewModeActive}
                onChange={(e) => updateField('quotation_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
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
                disabled={viewModeActive}
                onChange={(e) => updateField('goal_delivery_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                required
              />
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
                disabled={viewModeActive}
                onChange={(e) => updateField('process_type', e.target.value as any)}
                className="w-full rounded-lg border-2 border-primary bg-background px-3 py-2 font-extrabold text-foreground focus:outline-none shadow-2xs disabled:opacity-75"
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
                disabled={viewModeActive}
                onChange={(e) => updateField('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
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
                disabled={viewModeActive}
                onChange={(e) => updateField('project_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                required
              />
            </div>

            {/* Contractor Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Contractor / Vendor Name
              </label>
              <input
                type="text"
                value={form.contractor_name}
                disabled={viewModeActive}
                onChange={(e) => updateField('contractor_name', e.target.value)}
                placeholder="Preferred contractor/vendor"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
              />
            </div>
          </div>
        </div>

        {/* 1. Quotation Registration Entries Table */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Quotation Registration Entries Table (Carried Forward from Approved PR)
              </h3>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {form.items.length} Line Item(s) Carried Forward
              </p>
            </div>

            {!viewModeActive && (
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-2xs transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line Item (+)
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">Sr. No.</th>
                  <th className="px-3 py-3 min-w-[140px]">Item Group</th>
                  <th className="px-3 py-3 min-w-[220px]">Item Specification</th>
                  <th className="px-3 py-3 min-w-[150px]">Item Brand</th>
                  <th className="px-3 py-3 text-right w-24">Quantity</th>
                  <th className="px-3 py-3 text-center w-24">Unit</th>
                  <th className="px-3 py-3 text-right w-28">Previous Rate (₹)</th>
                  <th className="px-3 py-3 text-center w-36">Goal / Target Delivery Date</th>
                  {!viewModeActive && <th className="px-3 py-3 text-center w-14">Action</th>}
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
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'item_group', e.target.value)}
                        placeholder="e.g. Cement"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                        required
                      />
                    </td>

                    {/* Item Specification */}
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.specification}
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'specification', e.target.value)}
                        placeholder="Technical specification"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-medium text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                        required
                      />
                    </td>

                    {/* Item Brand */}
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.item_brand}
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'item_brand', e.target.value)}
                        placeholder="e.g. Pidilite • Dr. Fixit"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
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
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-right font-extrabold text-primary focus:border-primary focus:outline-none disabled:opacity-75"
                        required
                      />
                    </td>

                    {/* Unit */}
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="text"
                        value={item.unit}
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value.toUpperCase())}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-center font-bold text-foreground uppercase focus:border-primary focus:outline-none disabled:opacity-75"
                        required
                      />
                    </td>

                    {/* Previous Rate (₹) */}
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.previous_rate}
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'previous_rate', Number(e.target.value))}
                        className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-right font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                        required
                      />
                    </td>

                    {/* Goal / Target Delivery Date */}
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="date"
                        value={item.required_date}
                        disabled={viewModeActive}
                        onChange={(e) => handleItemChange(idx, 'required_date', e.target.value)}
                        className="w-32 rounded-md border border-border bg-background px-2 py-1.5 font-semibold text-foreground text-center focus:border-primary focus:outline-none disabled:opacity-75"
                        required
                      />
                    </td>

                    {/* Delete Action */}
                    {!viewModeActive && (
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(idx)}
                          disabled={form.items.length <= 1}
                          className="rounded-lg p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Supplier Quotation Submission Table (Shown ONLY for Quotation Request process type) */}
        {form.process_type === 'Quotation Request' && (
          <div className="space-y-3 rounded-xl border border-border p-4 bg-background shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-500" />
                  Supplier Quotation Submission Table
                </h3>
                {(form.process_type as string) === 'Direct PO' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300">
                    Direct PO Mode
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                Select suppliers from vendor registry. Email To auto-populates upon selection.
              </p>
            </div>

            {!viewModeActive && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddSupplier}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Supplier (+)
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoveSupplier(form.suppliers.length - 1)}
                  disabled={form.suppliers.length <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Minus className="h-3.5 w-3.5" /> Remove (-)
                </button>
              </div>
            )}
          </div>

          {/* Supplier Table */}
          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 w-14 text-center">Sr. No.</th>
                  <th className="px-4 py-3 min-w-[250px]">Supplier Name</th>
                  <th className="px-4 py-3 min-w-[280px]">Email To</th>
                  <th className="px-4 py-3 min-w-[220px]">Email CC</th>
                  {!viewModeActive && <th className="px-4 py-3 text-center w-16">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.suppliers.map((sup, idx) => (
                  <tr key={sup.key} className="hover:bg-muted/30 transition-colors align-middle">
                    <td className="px-4 py-3 text-center font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <select
                        value={sup.supplier_id}
                        disabled={viewModeActive}
                        onChange={(e) => handleSupplierSelect(idx, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                      >
                        <option value="">
                          {supplierMaster.length === 0
                            ? '-- No vendors registered --'
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
                        disabled={viewModeActive}
                        onChange={(e) => handleSupplierEmailChange(idx, 'email_to', e.target.value)}
                        placeholder="Auto-populated upon supplier selection"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="email"
                        value={sup.email_cc}
                        disabled={viewModeActive}
                        onChange={(e) => handleSupplierEmailChange(idx, 'email_cc', e.target.value)}
                        placeholder="cc@pramukhgroup.com"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                      />
                    </td>
                    {!viewModeActive && (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveSupplier(idx)}
                          disabled={form.suppliers.length <= 1}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* 3. POSITION AFTER SUPPLIER TABLE: Optional Selected Quotation PDF Upload & Justification Section */}
        {showQuotationUpload && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-primary/20 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-primary flex items-center gap-2">
                <FileUp className="h-4 w-4 text-primary" />
                Supplier Quotation PDF Attachment &amp; Selection Remarks (Optional)
              </h3>
              <span className="text-[10px] font-bold text-muted-foreground">
                Stored safely in Supabase
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase text-foreground mb-1">
                  Selected Supplier Quotation PDF
                </label>
                {viewModeActive ? (
                  form.selected_quotation_url ? (
                    <a
                      href={form.selected_quotation_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer"
                    >
                      <FileUp className="h-4 w-4 text-emerald-600" />
                      View Uploaded Quotation PDF
                    </a>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground italic">
                      No quotation PDF attached.
                    </span>
                  )
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="application/pdf"
                        disabled={uploadingPdf}
                        onChange={handleQuotationPdfUpload}
                        className="w-full text-xs font-medium text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer disabled:opacity-50"
                      />
                      {uploadingPdf && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    </div>
                    {form.selected_quotation_url && (
                      <div className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-600">
                        <Check className="h-4 w-4" /> Quotation PDF Uploaded!
                        <a
                          href={form.selected_quotation_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-primary text-[11px]"
                        >
                          View File
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-foreground mb-1">
                  Selection Remark / Justification
                </label>
                <textarea
                  rows={2}
                  value={form.selection_remark || ''}
                  disabled={viewModeActive}
                  onChange={(e) => updateField('selection_remark', e.target.value)}
                  placeholder="Reason why this supplier quotation was selected..."
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions & Dynamic Status Transition Buttons */}
        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Status Badge / Dropdown at bottom (Hidden in View Mode / Approved Status) */}
          {!viewModeActive ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-muted-foreground">Status:</span>
              <select
                value={form.status}
                disabled={viewModeActive}
                onChange={(e) => updateField('status', e.target.value as any)}
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary focus:border-primary focus:outline-none shadow-2xs cursor-pointer"
              >
                <option value="Auto-Draft">Auto-Draft</option>
                <option value="Draft">Draft</option>
                <option value="RFQ Sent">RFQ Sent</option>
                <option value="Waiting for Quotation">Waiting for Quotation</option>
                <option value="Quotation Received & Approved">Quotation Received &amp; Approved</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-muted-foreground">Form Mode:</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Read-Only View Form
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 justify-end">
            <button
              type="button"
              onClick={() => printRfqReport(form)}
              title="Print RFQ Report PDF"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-primary" /> Print / PDF Report
            </button>

            {viewModeActive ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancel
              </button>
            ) : form.process_type === 'Quotation Request' ? (
              /* FLOW A: Quotation Request (Multi-Vendor Bidding) */
              form.status === 'Auto-Draft' ? (
                <>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('Draft')}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-xs transition-all cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> Save as Draft
                  </button>
                </>
              ) : form.status === 'Draft' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleAction('Auto-Draft')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Return to Auto-Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('Waiting for Quotation')}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4.5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition-all cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" /> Send for Quotation
                  </button>
                </>
              ) : (
                /* status === 'Waiting for Quotation' */
                <>
                  <button
                    type="button"
                    onClick={() => handleAction('Draft')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Return to Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('Quotation Received & Approved')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve Quotation
                  </button>
                </>
              )
            ) : (
              /* FLOW B: Direct PO Process */
              form.status === 'Draft' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleAction('Auto-Draft')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Back to Auto-Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('Quotation Received & Approved', true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve Quotation &amp; Proceed to Direct PO
                  </button>
                </>
              ) : (
                /* status === 'Auto-Draft' or other */
                <>
                  <button
                    type="button"
                    onClick={() => handleAction('Draft')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> Save as Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction('Quotation Received & Approved', true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve Quotation &amp; Proceed to Direct PO
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </div>

      {/* PDF PREVIEW MODAL */}
      {pdfModalOpen && (
        <RfqPdfPreviewModal
          rfq={form}
          onClose={() => setPdfModalOpen(false)}
        />
      )}
    </div>
  );
}
