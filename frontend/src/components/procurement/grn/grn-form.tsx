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
  AlertCircle,
  History as HistoryIcon,
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
import {
  uploadChallanInvoiceDocument,
  fetchPurchaseOrderOptions,
  fetchPoLinesWithBalances,
  updatePurchaseOrderLine,
  listProcurementProjects,
  type ProcurementProjectOption,
  printGrnReport,
  extractInvoiceForGrn,
  findDuplicateInvoice,
  saveGrnInvoiceExtraction,
  type VendorOption,
  type PoLineWithBalance,
} from '@/lib/procurement';
import { GrnPoItemPickerModal } from './grn-po-item-picker-modal';

export interface GrnPurchaseEntry {
  item_id?: string | null;
  purchase_order_line_id?: string | null;
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
  unit_rate?: number;
  over_tolerance_pct?: number;
  max_allowable_qty?: number;
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
  // Uploaded Invoice & Delivery Challan Document Details
  uploaded_invoice_url?: string;
  uploaded_invoice_path?: string;
  uploaded_invoice_name?: string;
  uploaded_challan_url?: string;
  uploaded_challan_path?: string;
  uploaded_challan_name?: string;

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

/** Per-page OCR telemetry returned by the extraction endpoint. */
interface PageDiagnosticSummary {
  pageNumber: number;
  rotation: number;
  width: number;
  height: number;
  wordCount: number;
  usableWordCount: number;
  meanConfidence: number;
}

/** A warning emitted by the OCR pipeline's reconciliation pass. */
export interface ExtractionNotice {
  code: string;
  message: string;
  severity: 'info' | 'warn' | 'error';
  field?: string;
}

/** What the UI shows about the most recent invoice read. */
interface ExtractionSummary {
  confidence: number;
  reviewFields: Array<{ field: string; reason: string; severity: 'info' | 'warn' | 'error' }>;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  grandTotal: number | null;
  vendorName: string | null;
  itemCount: number;
  processingMs: number;
  invoiceCount: number;
  record: Record<string, any>;
  warnings: ExtractionNotice[];
  duplicateOf: { id: string; grn_id: string | null; invoice_number: string | null } | null;
}

interface GrnFormProps {
  grn: GrnRow;
  /** Active vendors backing the supplier dropdown. */
  vendorOptions?: VendorOption[];
  onSubmit: (formData: FullGrnFormState) => void;
  /** Generates the report-format Goods Received Note PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

function normalizeGrnFormStatus(st?: string): FullGrnFormState['status'] {
  const s = (st || '').toLowerCase().trim();
  if (s === 'pending_verification' || s === 'pending verification') return 'Pending Verification';
  if (s === 'pending_approval' || s === 'pending approval') return 'Pending Approval';
  if (s === 'approved' || s === 'posted') return 'Approved';
  return 'Draft';
}

export function GrnForm({
  grn,
  vendorOptions = [],
  onSubmit,
  onPrint,
  onCancel,
}: GrnFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // Local File states (deferred upload until form submit)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isInvoiceDirty, setIsInvoiceDirty] = useState(false);

  // PO Item Picker Drawer State
  const [showPoItemPicker, setShowPoItemPicker] = useState(false);
  const [currentPoLinesWithBalance, setCurrentPoLinesWithBalance] = useState<PoLineWithBalance[]>([]);
  const [showExtraItemsTable, setShowExtraItemsTable] = useState(() => Boolean((grn as any).extra_items && ((grn as any).extra_items as any[]).length > 0));

  // Deterministic OCR extraction state.
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionSummary | null>(null);
  /** Per-page OCR telemetry, shown when a read fails so the cause is visible. */
  const [extractDiagnostics, setExtractDiagnostics] = useState<PageDiagnosticSummary[] | null>(null);

  const [form, setForm] = useState<FullGrnFormState>(() => {
    const isNew = !grn.id;
    return {
      uploaded_invoice_url: '',
      uploaded_invoice_path: '',
      uploaded_invoice_name: '',
      uploaded_challan_url: '',
      uploaded_challan_path: '',
      uploaded_challan_name: '',
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

      purchase_entries: (() => {
        if (isNew) return [];
        const rawLines: any[] = (grn as any).raw_lines || (grn as any).goods_receipt_note_lines || [];
        if (rawLines.length > 0) {
          return rawLines.map((l: any, idx: number) => ({
            item_id: l.item_id || null,
            purchase_order_line_id: l.purchase_order_line_id || null,
            po_no: l.po_number || grn.po_number || '',
            item_group: l.item_group || 'Material',
            item_description: l.item_description || 'Received Goods',
            item_code: l.item_code || `ITM-00${idx + 1}`,
            item_brand: l.item_brand || '',
            location: l.location || grn.godown_name || 'Main Site Store',
            unit: l.unit || 'NOS',
            purchase_category: l.purchase_category || 'Direct Material',
            open: true,
            approved_qty: Number(l.approved_qty ?? l.accepted_qty ?? 1),
            as_on_date_po_balance_qty: Number(l.po_balance_qty ?? l.accepted_qty ?? 1),
            return_qty: Number(l.rejected_qty ?? l.return_qty ?? 0),
            challan_qty: Number(l.challan_qty ?? l.received_qty ?? 1),
            received_qty: Number(l.received_qty ?? l.accepted_qty ?? 1),
            unit_rate: Number(l.unit_rate ?? 0),
            over_tolerance_pct: 5,
            max_allowable_qty: Number(l.approved_qty ?? l.received_qty ?? 1) * 1.05,
            balance_quantity_allowed: true,
            pr_no: l.pr_number || '',
            test_report_no: l.test_report_no || '',
            expiry_date: l.expiry_date || '',
            current_balance_qty: Number(l.current_balance_qty ?? 0),
          }));
        }
        return [
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
        ];
      })(),

      extra_items: [],
      total_extra_items_received: 0,
      remarks: isNew ? '' : 'Goods inspected and verified at site store gate.',
      account_posting_material_amount: isNew ? 0 : 45000,
      asset_amount: 0.0,
      asset_item: '',

      po_remarks_list: [],

      pb_lines_created: isNew ? 0 : 1,
      unlocked_fy: 2026,
      status: isNew ? 'Draft' : normalizeGrnFormStatus((grn as any).quantity_verification || (grn as any).raw_status || grn?.status),
      assigned_approval_role: '',
    };
  });

  // Supabase fetched Project Sites
  const [projectOptions, setProjectOptions] = useState<ProcurementProjectOption[]>([]);

  useEffect(() => {
    let active = true;
    listProcurementProjects().then((projs) => {
      if (active && projs) {
        setProjectOptions(projs);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Supabase fetched Purchase Orders
  const [poOptions, setPoOptions] = useState<{
    id: string;
    po_number: string;
    project_name?: string;
    vendor_name?: string;
    company_name?: string;
    godown_name?: string;
    material_details?: string;
    vendor_details?: {
      gst_number?: string;
      pan_number?: string;
      phone?: string;
      email?: string;
      address?: string;
      contact_person?: string;
    };
  }[]>([]);

  useEffect(() => {
    let active = true;
    const selectedProj = projectOptions.find(
      (p) => p.name?.toLowerCase().trim() === form?.project_name?.toLowerCase().trim()
    );

    const supplierFilter = form?.supplier_name?.trim() ? form.supplier_name.trim() : undefined;

    fetchPurchaseOrderOptions(selectedProj?.id, supplierFilter).then((list) => {
      if (active) {
        setPoOptions(list);

        // Clear invalid primary PO reference if not present in new filtered PO list
        if (form?.from_pos && form.from_pos !== 'Not Exist') {
          const exists = list.some((p) => p.po_number === form.from_pos);
          if (!exists) {
            setForm((prev) => ({ ...prev, from_pos: '' }));
          }
        }
      }
    });

    return () => {
      active = false;
    };
  }, [form?.project_name, form?.supplier_name, projectOptions]);

  useEffect(() => {
    const total = (form.purchase_entries || []).reduce((sum, entry) => {
      const recv = Number(entry.received_qty || 0);
      const ret = Number(entry.return_qty || 0);
      const acc = Math.max(0, recv - ret);
      const rate = Number(entry.unit_rate || 0);
      return sum + acc * rate;
    }, 0);
    setForm((prev) => ({ ...prev, account_posting_material_amount: total }));
  }, [form.purchase_entries]);

  useEffect(() => {
    const totalCount = (form.purchase_entries || []).length + (form.extra_items || []).length;
    setForm((prev) => ({ ...prev, pb_lines_created: totalCount }));
  }, [form.purchase_entries.length, form.extra_items.length]);

  useEffect(() => {
    if (form.from_pos && form.from_pos !== 'Not Exist') {
      setNewPoRemark((prev) => ({ ...prev, po_no: prev.po_no || form.from_pos }));
    }
  }, [form.from_pos]);

  /**
   * Reads the uploaded invoice with the deterministic OCR pipeline and merges the
   * result into the form.
   *
   * Only fields the invoice actually supplied are written, so anything the user
   * has already typed is preserved. Quantities owned by the purchase order
   * (approved, balance, current stock) are never touched, and the status is left
   * at Pending QC — an OCR read must not approve a receipt.
   */
  const [uploadingChallan, setUploadingChallan] = useState(false);

  const handleChallanFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingChallan(true);
    try {
      const res = await uploadChallanInvoiceDocument(file, 'grn-challan');
      if (res.data) {
        const docData = res.data;
        setForm((prev) => ({
          ...prev,
          uploaded_challan_url: docData.publicUrl,
          uploaded_challan_path: docData.storagePath,
          uploaded_challan_name: file.name,
        }));
      }
    } catch (err) {
      console.warn('Challan upload failed:', err);
    } finally {
      setUploadingChallan(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setInvoiceFile(file);
    setIsInvoiceDirty(true);
    setForm((prev) => ({ ...prev, uploaded_invoice_name: file.name }));

    setExtracting(true);
    setExtractError(null);
    setExtraction(null);
    setExtractDiagnostics(null);
    try {
      const res = await extractInvoiceForGrn(file);
      if (res.error || !res.data) {
        setExtractError(res.error?.message || 'Could not read this invoice.');
        setExtractDiagnostics((res.diagnostics as PageDiagnosticSummary[] | undefined) ?? null);
        return;
      }
      setExtractDiagnostics((res.data.diagnostics as PageDiagnosticSummary[] | undefined) ?? null);
      const { grnPatch, invoice, processingMs, invoiceCount } = res.data;

      // Warn early if this invoice has already been booked.
      const dup = await findDuplicateInvoice({
        irn: grnPatch.invoiceRecord.irn,
        vendorGstin: grnPatch.invoiceRecord.vendor_gstin,
        invoiceNumber: grnPatch.invoiceRecord.invoice_number,
        fileHash: res.data.fileHash,
      });
      const duplicateOf = dup.data ?? null;

      setForm((prev) => {
        const next = { ...prev } as unknown as Record<string, unknown>;
        // Header: only overwrite what the invoice supplied, so anything the user
        // has already typed survives.
        for (const [key, value] of Object.entries(grnPatch.header)) {
          if (value === null || value === undefined || value === '') continue;
          next[key] = value;
        }
        const merged = next as unknown as FullGrnFormState;
        // Replace the line table only when the invoice yielded items.
        if (grnPatch.purchaseEntries.length) {
          merged.purchase_entries = grnPatch.purchaseEntries as unknown as GrnPurchaseEntry[];
        }
        merged.uploaded_invoice_name = file.name;
        return merged;
      });

      setExtraction({
        confidence: grnPatch.confidence,
        reviewFields: grnPatch.reviewFields,
        invoiceNumber: grnPatch.invoiceRecord.invoice_number,
        invoiceDate: grnPatch.invoiceRecord.invoice_date,
        grandTotal: grnPatch.invoiceRecord.grand_total,
        vendorName: grnPatch.invoiceRecord.vendor_name,
        itemCount: grnPatch.purchaseEntries.length,
        processingMs,
        invoiceCount,
        record: grnPatch.invoiceRecord,
        warnings: (invoice?.validation?.warnings ?? []) as ExtractionNotice[],
        duplicateOf,
      });
    } catch (err: any) {
      setExtractError(err?.message || 'Invoice extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  // Remove attached document
  const handleRemoveDocument = () => {
    setInvoiceFile(null);
    setIsInvoiceDirty(true);
    setExtraction(null);
    setExtractError(null);
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
      const entry = { ...updated[index], [field]: value };
      if (field === 'received_qty' || field === 'as_on_date_po_balance_qty') {
        const balance = Number(field === 'as_on_date_po_balance_qty' ? value : entry.as_on_date_po_balance_qty || 0);
        const received = Number(field === 'received_qty' ? value : entry.received_qty || 0);
        entry.current_balance_qty = Math.max(0, balance - received);
      }
      updated[index] = entry;
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
        if (uploadRes.error) throw uploadRes.error;
        if (uploadRes.data) {
          updatedInvoiceUrl = uploadRes.data.signedUrl || uploadRes.data.publicUrl;
          updatedInvoicePath = uploadRes.data.storagePath;
        }

        /**
         * Persist the OCR extraction alongside the document. This is what makes
         * the invoice's own facts (IRN, invoice number and date, tax breakup,
         * bank details) available for the three-way match and duplicate checks —
         * none of them fit in the GRN row itself.
         */
        if (extraction?.record) {
          const saved = await saveGrnInvoiceExtraction(extraction.record, {
            grnId: grn.id || null,
            storagePath: updatedInvoicePath || null,
          });
          if (saved.error) {
            // A duplicate invoice must stop the save, not be swallowed.
            alert(saved.error.message);
            setUploadingInvoice(false);
            return;
          }
        }
      } catch (err: any) {
        alert(`Invoice upload failed: ${err?.message || 'Error'}`);
        setUploadingInvoice(false);
        return;
      } finally {
        setUploadingInvoice(false);
      }
    }

    const finalFormState: FullGrnFormState = {
      ...form,
      uploaded_invoice_url: updatedInvoiceUrl,
      uploaded_invoice_path: updatedInvoicePath,
      uploaded_invoice_name: form.uploaded_invoice_name || invoiceFile?.name || '',
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
        {/* TOP SECTION: UPLOAD INVOICE & DELIVERY CHALLAN                           */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      Upload invoice PDF or image to extract fields, auto-populate details, and save to Supabase storage.
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
                      <FileCheck className="h-3.5 w-3.5" /> View Invoice
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
                    <FileCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Invoice: <strong className="truncate">{form.uploaded_invoice_name}</strong>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Upload className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Click to Upload Supplier Invoice
                  </span>
                )}
              </label>

              {extracting && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  <Upload className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Reading the invoice&hellip;</span>
                </div>
              )}
            </div>
          </div>

          {/* Upload Delivery Challan (grn-challan) */}
          <div className="rounded-xl border-2 border-dashed border-blue-500/40 bg-blue-500/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-xs">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-foreground text-xs flex items-center gap-1.5">
                      <span>Upload Delivery Challan</span>
                      <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] text-blue-600 dark:text-blue-400 font-mono uppercase">grn-challan</span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Upload physical delivery receipt / gate pass document signed by site engineer to Supabase storage.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {form.uploaded_challan_url && (
                    <a
                      href={form.uploaded_challan_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-blue-500/50 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition-all cursor-pointer shrink-0"
                    >
                      <FileCheck className="h-3.5 w-3.5" /> View Challan
                    </a>
                  )}
                  {form.uploaded_challan_name && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, uploaded_challan_name: '', uploaded_challan_url: '', uploaded_challan_path: '' }))}
                      title="Remove attached Delivery Challan document"
                      className="rounded-md border border-red-500/40 bg-red-500/10 p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <label className="relative flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:bg-muted/50 cursor-pointer transition-all shadow-xs">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => handleChallanFileSelect(e)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploadingChallan}
                />
                {uploadingChallan ? (
                  <span className="flex items-center gap-1.5 text-blue-600 animate-pulse font-mono text-xs">
                    <Upload className="h-3.5 w-3.5 animate-spin" /> Saving Delivery Challan to Supabase...
                  </span>
                ) : form.uploaded_challan_name ? (
                  <span className="flex items-center gap-1.5 text-blue-600 font-medium truncate text-xs">
                    <FileCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" /> Challan: <strong className="truncate">{form.uploaded_challan_name}</strong>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Truck className="h-3.5 w-3.5 text-blue-600 shrink-0" /> Click to Upload Delivery Challan
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>

              {extractError && (
                <div className="space-y-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-700 dark:text-red-300">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Could not read this invoice.</strong> {extractError} You can still fill the GRN in
                      manually.
                    </span>
                  </div>
                  {/* Word counts make an empty result diagnosable instead of mysterious. */}
                  {extractDiagnostics && extractDiagnostics.length > 0 && (
                    <div className="rounded border border-red-500/30 bg-background/50 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                      {extractDiagnostics.map((d) => (
                        <div key={d.pageNumber}>
                          page {d.pageNumber}: {d.width}×{d.height} rot={d.rotation} words={d.wordCount} usable=
                          {d.usableWordCount} conf={d.meanConfidence}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* --- OCR result summary ------------------------------------- */}
              {extraction && !extracting && (
                <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck
                        className={`h-4 w-4 shrink-0 ${
                          extraction.confidence >= 0.9
                            ? 'text-emerald-500'
                            : extraction.confidence >= 0.6
                            ? 'text-amber-500'
                            : 'text-red-500'
                        }`}
                      />
                      <span className="text-[11px] font-bold text-foreground">
                        Invoice read without AI &mdash; {Math.round(extraction.confidence * 100)}% confidence
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {(extraction.processingMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    {extraction.invoiceCount > 1 && (
                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {extraction.invoiceCount} invoices in this file &mdash; first one applied
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                    {[
                      ['Vendor', extraction.vendorName],
                      ['Invoice No.', extraction.invoiceNumber],
                      ['Invoice Date', extraction.invoiceDate],
                      [
                        'Invoice Value',
                        extraction.grandTotal === null
                          ? null
                          : `₹${extraction.grandTotal.toLocaleString('en-IN')}`,
                      ],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-md border border-border/60 bg-muted/40 px-2 py-1">
                        <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div className="truncate font-semibold text-foreground">{(value as string) || '—'}</div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {extraction.itemCount} line item(s) filled in. Approved and balance quantities come from the
                    purchase order and were deliberately left blank.
                  </p>

                  {/* A duplicate is the single most important thing to surface. */}
                  {extraction.duplicateOf && (
                    <div className="flex items-start gap-2 rounded-md border border-red-500/50 bg-red-500/10 px-2.5 py-2 text-[11px] font-semibold text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Invoice {extraction.duplicateOf.invoice_number ?? ''} has already been recorded against
                        {extraction.duplicateOf.grn_id ? ' another GRN' : ' an earlier extraction'}. Verify before
                        saving &mdash; saving will be blocked if it is a true duplicate.
                      </span>
                    </div>
                  )}

                  {extraction.reviewFields.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Please check {extraction.reviewFields.length} item(s) before saving
                      </div>
                      <ul className="space-y-1">
                        {extraction.reviewFields.slice(0, 6).map((r, i) => (
                          <li
                            key={`${r.field}-${i}`}
                            className={`flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                              r.severity === 'error'
                                ? 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300'
                                : 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>
                              <span className="font-mono font-bold">{r.field}</span> &mdash; {r.reason}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Exact Field Order as Specified)                 */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Goods Receipt &amp; Vehicle Weighbridge Logistics Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Primary Purchase Order Reference (Optional) */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Primary Purchase Order Reference (Optional)
              </label>
              <select
                value={form.from_pos === 'Not Exist' ? '' : form.from_pos}
                onChange={async (e) => {
                  const selectedPoNumber = e.target.value;
                  const poObj = poOptions.find((p) => p.po_number === selectedPoNumber);
                  updateHeader('from_pos', selectedPoNumber);

                  setForm((prev) => ({
                    ...prev,
                    from_pos: selectedPoNumber,
                    project_name: poObj?.project_name || prev.project_name,
                    supplier_name: poObj?.vendor_name || prev.supplier_name,
                    company_name: poObj?.company_name || prev.company_name,
                    godown_name: poObj?.godown_name || prev.godown_name,
                    phone_no: poObj?.vendor_details?.phone || prev.phone_no,
                    mobile_no: poObj?.vendor_details?.phone || prev.mobile_no,
                  }));

                  if (poObj?.id) {
                    const fetchedLines = await fetchPoLinesWithBalances(poObj.id);
                    if (fetchedLines && fetchedLines.length > 0) {
                      setCurrentPoLinesWithBalance(fetchedLines);
                      setShowPoItemPicker(true);
                    }
                  }
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground text-xs cursor-pointer focus:ring-2 focus:ring-primary shadow-2xs"
              >
                <option value="">-- None / Multi-PO Consolidated Entry --</option>
                {poOptions.map((po) => {
                  const desc = [po.material_details].filter(Boolean).join(' - ');
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
              <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                Optional single PO reference. Leave blank to pick items from multiple Approved POs below.
              </p>
            </div>

            {/* 2. Select Items From PO* */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                Select Items From PO*
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (form.from_pos && form.from_pos !== 'Not Exist') {
                    const poObj = poOptions.find((p) => p.po_number === form.from_pos);
                    if (poObj?.id) {
                      const lines = await fetchPoLinesWithBalances(poObj.id);
                      setCurrentPoLinesWithBalance(lines);
                    }
                  }
                  setShowPoItemPicker(true);
                }}
                className="w-full inline-flex items-center justify-between rounded-lg border-2 border-primary bg-primary/10 px-3 py-2 text-xs font-extrabold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span>
                    {form.from_pos && form.from_pos !== 'Not Exist'
                      ? `Select / Filter Items from ${form.from_pos}`
                      : 'Select Line Items from Approved POs'}
                  </span>
                </span>
                <span className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground font-extrabold shadow-xs">
                  {form.purchase_entries.length} Item(s) Selected ➔
                </span>
              </button>
            </div>

            {/* 3. LINKED SOURCE PR */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">LINKED SOURCE PR</label>
              <div className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono font-extrabold text-foreground text-xs truncate">
                {form.purchase_entries?.[0]?.pr_no || (poOptions.find((p) => p.po_number === form.from_pos) as any)?.purchase_requisitions?.pr_number || 'PR-Not Linked'}
              </div>
            </div>
            {/* 1. QC No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">QC No.</label>
              <input
                type="text"
                value={form.qc_no || '(Auto Generated)'}
                readOnly
                disabled
                className="w-full rounded-lg border border-border/70 bg-muted/50 px-3 py-2 font-mono font-bold text-muted-foreground cursor-not-allowed text-xs"
              />
              <span className="text-[9px] font-extrabold text-muted-foreground/80 block mt-0.5">⚡ Auto Generated</span>
            </div>

            {/* 2. GR No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GR No.</label>
              <input
                type="text"
                value={form.gr_no || '(Auto Generated on Save)'}
                readOnly
                disabled
                className="w-full rounded-lg border border-border/70 bg-muted/50 px-3 py-2 font-mono font-extrabold text-muted-foreground cursor-not-allowed text-xs"
              />
              <span className="text-[9px] font-extrabold text-muted-foreground/80 block mt-0.5">⚡ Auto Generated on Save</span>
            </div>

            {/* 3. GRN Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">GRN Date*</label>
              <input
                type="text"
                value={form.grn_date}
                onChange={(e) => updateHeader('grn_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground text-xs"
                required
              />
            </div>

            {/* 4. Project Name* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Project Name*</label>
              <select
                value={form.project_name}
                onChange={(e) => updateHeader('project_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground text-xs cursor-pointer"
                required
              >
                <option value="">-- Select Project Site --</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name} {p.code ? `(${p.code})` : ''}
                  </option>
                ))}
                {form.project_name && !projectOptions.some((p) => p.name === form.project_name) && (
                  <option value={form.project_name}>{form.project_name}</option>
                )}
              </select>
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

            {/* 6. Supplier Name* — chosen from the vendor registry, so the
                receipt can always be joined back to a real vendor record.
                This used to be free text. */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Supplier Name*</label>
              {vendorOptions.length > 0 ? (
                <select
                  value={form.supplier_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const vendor = vendorOptions.find((v) => (v.display_name || v.legal_name) === name);
                    updateHeader('supplier_name', name);
                    if (vendor?.phone) updateHeader('phone_no', vendor.phone);
                  }}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                  required
                >
                  <option value="">Select a supplier…</option>
                  {vendorOptions.map((vendor) => (
                    <option key={vendor.id} value={vendor.display_name || vendor.legal_name}>
                      {vendor.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={(e) => updateHeader('supplier_name', e.target.value)}
                  className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                  placeholder="No vendors loaded — add one in the Vendor Registry"
                  required
                />
              )}
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

          </div>
        </div>

        {/* SECTION 2: PURCHASE ENTRIES TABLE (21 Columns + Action) */}
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (form.from_pos && form.from_pos !== 'Not Exist') {
                    const poObj = poOptions.find((p) => p.po_number === form.from_pos);
                    if (poObj?.id) {
                      const lines = await fetchPoLinesWithBalances(poObj.id);
                      setCurrentPoLinesWithBalance(lines);
                    }
                  }
                  setShowPoItemPicker(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-xs"
              >
                <Layers className="h-4 w-4" /> Select Line Items from Purchase Orders ({form.purchase_entries.length})
              </button>

              <button
                type="button"
                onClick={handleAddPurchaseEntry}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted transition-all cursor-pointer shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Manual Entry
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-muted/80 font-heading uppercase text-muted-foreground border-b border-border">
                {/* Row 1: Group Category Banners */}
                <tr className="border-b border-border/70 text-[10px] font-extrabold tracking-wider text-center">
                  <th colSpan={3} className="bg-primary/10 text-primary py-2 border-r border-border/60">
                    📦 1. ITEM IDENTIFICATION &amp; SPECIFICATION
                  </th>
                  <th colSpan={3} className="bg-amber-500/10 text-amber-700 dark:text-amber-300 py-2 border-r border-border/60">
                    📊 2. PO &amp; CUMULATIVE POSITION
                  </th>
                  <th colSpan={4} className="bg-blue-500/10 text-blue-700 dark:text-blue-300 py-2 border-r border-border/60">
                    🚚 3. CURRENT SHIPMENT RECEIPT
                  </th>
                  <th colSpan={3} className="bg-purple-500/10 text-purple-700 dark:text-purple-300 py-2 border-r border-border/60">
                    ⚖️ 4. TOLERANCE &amp; OVER-DELIVERY
                  </th>
                  <th colSpan={2} className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 py-2">
                    📋 5. AUDIT &amp; ACTION
                  </th>
                </tr>

                {/* Row 2: Detail Sub-Headers */}
                <tr className="text-[10px] font-bold tracking-wider">
                  {/* Group 1 */}
                  <th className="px-3 py-2.5 min-w-[200px]">Item Description</th>
                  <th className="px-3 py-2.5 min-w-[110px]">Brand / Make</th>
                  <th className="px-3 py-2.5 text-center border-r border-border/60 min-w-[70px]">Unit</th>

                  {/* Group 2 */}
                  <th className="px-3 py-2.5 text-right min-w-[90px]">PO Qty</th>
                  <th className="px-3 py-2.5 text-right min-w-[110px]">Prev. Received</th>
                  <th className="px-3 py-2.5 text-right border-r border-border/60 min-w-[110px]">Open Balance</th>

                  {/* Group 3 */}
                  <th className="px-3 py-2.5 text-right min-w-[100px]">Challan Qty</th>
                  <th className="px-3 py-2.5 text-right min-w-[90px]">Return Qty</th>
                  <th className="px-3 py-2.5 text-right font-bold text-primary min-w-[110px]">Accepted Qty*</th>
                  <th className="px-3 py-2.5 text-right border-r border-border/60 min-w-[100px]">Unit Rate (₹)</th>

                  {/* Group 4 */}
                  <th className="px-3 py-2.5 text-center min-w-[80px]">Tol. %</th>
                  <th className="px-3 py-2.5 text-right min-w-[100px]">Max Allow.</th>
                  <th className="px-3 py-2.5 text-center border-r border-border/60 min-w-[140px]">Tolerance Status</th>

                  {/* Group 5 */}
                  <th className="px-3 py-2.5 text-center min-w-[80px]">Audit</th>
                  <th className="px-3 py-2.5 text-center min-w-[60px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.purchase_entries.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="px-3 py-8 text-center text-muted-foreground font-sans">
                      No purchase entries added yet. Click <strong>🛒 Select Items from PO</strong> or <strong>+ Manual Entry</strong> to add rows.
                    </td>
                  </tr>
                ) : (
                  form.purchase_entries.map((item, idx) => {
                    const approvedQty = Number(item.approved_qty || 0);
                    const prevReceived = (item as any).prev_accepted_qty ?? Math.max(0, approvedQty - Number(item.as_on_date_po_balance_qty || 0));
                    const openBalance = Number(item.as_on_date_po_balance_qty || 0);
                    const challanQty = Number(item.challan_qty || 0);
                    const returnQty = Number(item.return_qty || 0);
                    const acceptedQty = Math.max(0, challanQty - returnQty);
                    const tolerancePct = typeof item.over_tolerance_pct === 'number' ? item.over_tolerance_pct : 5;
                    const maxAllowable = approvedQty * (1 + tolerancePct / 100) - prevReceived;

                    const isOverMax = acceptedQty > maxAllowable + 0.01;
                    const isWithinTol = !isOverMax && acceptedQty > openBalance + 0.01;

                    return (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle font-mono text-xs">
                        {/* Group 1: Item Identification */}
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-foreground font-sans text-xs">
                            {item.item_description || '—'}
                          </div>
                          {item.po_no && (
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              • {item.po_no}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-sans">
                          <input
                            type="text"
                            value={item.item_brand}
                            onChange={(e) => handlePurchaseEntryChange(idx, 'item_brand', e.target.value)}
                            className="w-24 rounded border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center border-r border-border/60">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handlePurchaseEntryChange(idx, 'unit', e.target.value)}
                            className="w-14 text-center rounded border border-border bg-background px-1.5 py-1 text-xs font-bold text-foreground"
                          />
                        </td>

                        {/* Group 2: PO & Cumulative Position */}
                        <td className="px-3 py-2.5 text-right font-bold text-foreground">
                          {approvedQty.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">
                          {prevReceived.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-amber-600 dark:text-amber-400 border-r border-border/60">
                          {openBalance.toLocaleString('en-IN')}
                        </td>

                        {/* Group 3: Current Shipment Receipt */}
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.challan_qty}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              handlePurchaseEntryChange(idx, 'challan_qty', val);
                              handlePurchaseEntryChange(idx, 'received_qty', val);
                            }}
                            className="w-20 rounded border border-primary/50 bg-background px-2 py-1 text-right font-extrabold text-primary text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.return_qty}
                            onChange={(e) => handlePurchaseEntryChange(idx, 'return_qty', Number(e.target.value) || 0)}
                            className="w-16 rounded border border-border bg-background px-1.5 py-1 text-right font-bold text-red-600 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                          {acceptedQty.toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-right border-r border-border/60">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_rate || 0}
                            onChange={(e) => handlePurchaseEntryChange(idx, 'unit_rate', Number(e.target.value) || 0)}
                            className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-xs font-bold text-foreground"
                          />
                        </td>

                        {/* Group 4: Tolerance & Over-Delivery */}
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            step="0.5"
                            value={item.over_tolerance_pct ?? 5}
                            onChange={(e) => {
                              const newPct = Math.max(0, Number(e.target.value) || 0);
                              handlePurchaseEntryChange(idx, 'over_tolerance_pct', newPct);
                              const newCeiling = approvedQty * (1 + newPct / 100) - prevReceived;
                              handlePurchaseEntryChange(idx, 'max_allowable_qty', Math.max(0, newCeiling));
                              if (item.purchase_order_line_id) {
                                updatePurchaseOrderLine(item.purchase_order_line_id, { over_tolerance_pct: newPct });
                              }
                            }}
                            className="w-14 rounded border border-purple-400/50 bg-background px-1.5 py-1 text-center font-bold text-purple-600 dark:text-purple-400 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground font-semibold">
                          {maxAllowable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-center border-r border-border/60">
                          {isOverMax ? (
                            <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-extrabold text-red-600 dark:text-red-400 border border-red-500/30">
                              <AlertCircle className="h-3 w-3" /> Exceeds +{tolerancePct}% Tol
                            </span>
                          ) : isWithinTol ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              <Scale className="h-3 w-3" /> Within +{tolerancePct}% Tol
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3" /> ✓ Standard Receipt
                            </span>
                          )}
                        </td>

                        {/* Group 5: Audit & Action */}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (form.from_pos && form.from_pos !== 'Not Exist') {
                                const poObj = poOptions.find((p) => p.po_number === form.from_pos);
                                if (poObj?.id) {
                                  fetchPoLinesWithBalances(poObj.id).then((lines) => {
                                    setCurrentPoLinesWithBalance(lines);
                                  });
                                }
                              }
                              setShowPoItemPicker(true);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/10 transition-all cursor-pointer"
                            title="Audit Receipt History"
                          >
                             <HistoryIcon className="h-3.5 w-3.5" /> Audit
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemovePurchaseEntry(idx)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: EXTRA ITEM RECEIVED TABLE (10 Columns + Action) */}
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showExtraItemsTable}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowExtraItemsTable(checked);
                  if (checked && form.extra_items.length === 0) {
                    handleAddExtraItem();
                  }
                }}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                3. Include Extra / Unscheduled Bonus Material Items ({form.extra_items.length})
              </span>
            </label>

            {showExtraItemsTable && (
              <button
                type="button"
                onClick={handleAddExtraItem}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add Extra Item
              </button>
            )}
          </div>

          {showExtraItemsTable && (
            form.extra_items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground bg-background">
                No extra un-ordered items added yet. Click <strong>+ Add Extra Item</strong> to add rows.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-2xs">
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
          ))}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: POST-TABLE FIELDS & PO REMARKS TABLE                           */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            4. Post-Receipt Accounting &amp; PO Remarks Summary (Total {form.po_remarks_list.length})
          </h3>

          {/* Production-Grade Receipt Summary Card */}
          {(() => {
            const totalItems = form.purchase_entries.length;
            const totalReceived = form.purchase_entries.reduce((sum, item) => sum + (item.received_qty || 0), 0);
            const totalBalance = form.purchase_entries.reduce((sum, item) => sum + (item.as_on_date_po_balance_qty || 0), 0);
            const toleranceExceedCount = form.purchase_entries.filter((item) => (item.received_qty || 0) > (item.as_on_date_po_balance_qty || 0) * 1.05 + 0.01).length;
            const toleranceWithinCount = form.purchase_entries.filter((item) => (item.received_qty || 0) > (item.as_on_date_po_balance_qty || 0) && (item.received_qty || 0) <= (item.as_on_date_po_balance_qty || 0) * 1.05 + 0.01).length;

            return (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                  <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Receipt Summary &amp; AP Accrual Telemetry
                  </h4>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">
                    PO: {form.from_pos || 'N/A'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background p-2.5 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total Line Items</span>
                    <p className="font-mono text-sm font-extrabold text-foreground">{totalItems} Items</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current Receipt Qty</span>
                    <p className="font-mono text-sm font-extrabold text-primary">{totalReceived.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Prior PO Balance</span>
                    <p className="font-mono text-sm font-extrabold text-muted-foreground">{totalBalance.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tolerance Audit</span>
                    <p className="font-mono text-xs font-bold text-foreground">
                      {toleranceExceedCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-extrabold">❌ {toleranceExceedCount} Exceeded</span>
                      ) : toleranceWithinCount > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-extrabold">⚠️ {toleranceWithinCount} +5% Tol</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">✓ 100% In Balance</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

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

          {/* ---------- DYNAMIC WORKFLOW STATUS BUTTONS ---------- */}
          {(() => {
            const activeStatus = normalizeGrnFormStatus(form.status);

            if (activeStatus === 'Draft') {
              return (
                <div className="flex items-center gap-3">
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
                      updateHeader('status', 'Draft');
                      onSubmit({ ...form, status: 'Draft' });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                  >
                    <Save className="h-4 w-4" /> Save Draft
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
              );
            }

            if (activeStatus === 'Pending Verification') {
              return (
                <div className="flex items-center gap-3">
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
                      updateHeader('status', 'Draft');
                      onSubmit({ ...form, status: 'Draft' });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to Draft
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateHeader('status', 'Approved');
                      onSubmit({ ...form, status: 'Approved' });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                  >
                    <ShieldCheck className="h-4 w-4" /> Approve
                  </button>
                </div>
              );
            }

            if (activeStatus === 'Pending Approval') {
              return (
                <div className="flex items-center gap-3">
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
                      updateHeader('status', 'Draft');
                      onSubmit({ ...form, status: 'Draft' });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to Draft
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateHeader('status', 'Approved');
                      onSubmit({ ...form, status: 'Approved' });
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                  >
                    <ShieldCheck className="h-4 w-4" /> Approve
                  </button>
                </div>
              );
            }

            return (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  Close
                </button>
                <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-4 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> GRN Approved
                </div>
              </div>
            );
          })()}
        </div>
      </form>

      {/* Slide-over Multi-PO Item Picker & Multi-GRN Audit History Modal */}
      {showPoItemPicker && (
        <GrnPoItemPickerModal
          poNumber={form.from_pos}
          poLines={currentPoLinesWithBalance}
          availablePoOptions={poOptions}
          initialSelectedPoIds={
            form.from_pos && form.from_pos !== 'Not Exist'
              ? [poOptions.find((p) => p.po_number === form.from_pos)?.id].filter(Boolean) as string[]
              : poOptions.map((p) => p.id)
          }
          alreadySelectedPoLineIds={form.purchase_entries.map((e) => e.purchase_order_line_id || '').filter(Boolean)}
          onConfirmSelection={(selectedItems) => {
            const mapped: GrnPurchaseEntry[] = selectedItems.map(({ line, receivingQty }) => ({
              item_id: line.item_id || null,
              purchase_order_line_id: line.po_line_id,
              po_no: line.po_number || form.from_pos || '',
              item_group: line.item_group || '',
              item_description: line.item_description || '',
              item_code: line.item_code || '',
              item_brand: line.item_brand || '',
              location: line.location || form.godown_name || form.project_name || '',
              unit: line.unit || 'nos',
              purchase_category: line.purchase_category || line.item_group || '',
              open: true,
              approved_qty: line.approved_qty,
              as_on_date_po_balance_qty: line.as_on_date_po_balance_qty,
              return_qty: 0,
              challan_qty: receivingQty,
              received_qty: receivingQty,
              unit_rate: line.unit_rate || 0,
              over_tolerance_pct: typeof line.over_tolerance_pct === 'number' ? line.over_tolerance_pct : 0,
              max_allowable_qty: line.approved_qty * (1 + (typeof line.over_tolerance_pct === 'number' ? line.over_tolerance_pct : 0) / 100) - line.prev_accepted_qty,
              balance_quantity_allowed: true,
              pr_no: line.pr_no || '',
              test_report_no: '',
              expiry_date: '',
              current_balance_qty: 0,
            }));

            setForm((prev) => ({
              ...prev,
              purchase_entries: mapped,
            }));
            setShowPoItemPicker(false);
          }}
          onClose={() => setShowPoItemPicker(false)}
        />
      )}
    </div>
  );
}
