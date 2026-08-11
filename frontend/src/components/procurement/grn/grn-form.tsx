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
  Download,
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
  /* The identity and the WHY, carried from the PO line so the receipt — and
     the Purchase Bill after it — can name the specification accepted and the
     budget activity it belongs to. goods_receipt_note_lines has all three
     columns; nothing was writing them, so the lineage died at receipt. */
  item_specification?: string;
  activity_name?: string;
  sub_activity_name?: string;
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

// The OCR extraction types that stood here are gone with the pipeline. The
// invoice and challan slots are plain document uploads: nothing reads the file,
// so there is no confidence, no review-field list and no per-page telemetry to
// model. The pipeline itself (lib/procurement extractInvoiceForGrn and the
// grn_invoices tables) is untouched and can be reconnected without schema work.

interface GrnFormProps {
  grn: GrnRow;
  canApprove?: boolean;
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
  canApprove = true,
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
  const [poLinesLoading, setPoLinesLoading] = useState(false);
  const [poLinesError, setPoLinesError] = useState<string | null>(null);
  const [poOptionsError, setPoOptionsError] = useState<string | null>(null);

  /**
   * Single loader for the PO item picker.
   *
   * The three call sites each did `await fetchPoLinesWithBalances(...)` bare, in
   * an async event handler. That function THROWS on a failed read, so any error
   * became an unhandled rejection and the form simply did nothing — selecting a
   * Purchase Order looked inert with no message anywhere.
   *
   * Two further defects are fixed by always assigning the result:
   *   - the picker only opened when lines.length > 0, so a PO whose items were
   *     already fully received produced no picker and no explanation;
   *   - on that same path the previous PO's lines were left in state, so the
   *     picker could open showing items belonging to a DIFFERENT order.
   */
  const loadPoLines = async (poId: string | null | undefined): Promise<PoLineWithBalance[]> => {
    setPoLinesError(null);
    if (!poId) {
      setCurrentPoLinesWithBalance([]);
      return [];
    }
    setPoLinesLoading(true);
    try {
      const lines = await fetchPoLinesWithBalances(poId);
      setCurrentPoLinesWithBalance(lines);
      if (lines.length === 0) {
        setPoLinesError(
          'This Purchase Order has no lines left to receive. They may already be fully received or short-closed.',
        );
      }
      return lines;
    } catch (err) {
      // Never leave another order's lines behind on a failed read.
      setCurrentPoLinesWithBalance([]);
      setPoLinesError(err instanceof Error ? err.message : 'Unable to read the purchase order lines.');
      return [];
    } finally {
      setPoLinesLoading(false);
    }
  };
  const [showExtraItemsTable, setShowExtraItemsTable] = useState(() => Boolean((grn as any).extra_items && ((grn as any).extra_items as any[]).length > 0));

  const [form, setForm] = useState<FullGrnFormState>(() => {
    const isNew = !grn.id;
    return {
      uploaded_invoice_url: grn.uploaded_invoice_url || '',
      uploaded_invoice_path: (grn as any).uploaded_invoice_path || '',
      uploaded_invoice_name: (grn as any).uploaded_invoice_name || '',
      uploaded_challan_url: grn.uploaded_challan_url || '',
      uploaded_challan_path: (grn as any).uploaded_challan_path || '',
      uploaded_challan_name: (grn as any).uploaded_challan_name || '',
      qc_no: (grn as any).qc_no || (isNew ? `QC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : 'QC-2026-0881'),
      gr_no: grn.grn_number || '(Auto Generated on Save)',
      grn_date: grn.received_date || todayStr,
      project_name: grn.project_name && grn.project_name !== '—' ? grn.project_name : '',
      company_name: (grn as any).company_name || 'Pramukh Group Infrastructure Ltd.',
      supplier_name: grn.vendor_name && grn.vendor_name !== '—' ? grn.vendor_name : '',
      phone_no: (grn as any).phone_no || '',
      mobile_no: (grn as any).mobile_no || '',
      godown_name: grn.godown_name && grn.godown_name !== '—' ? grn.godown_name : 'Main Site Store',
      dealer_name: (grn as any).dealer_name || '',
      challan_no: grn.challan_no && grn.challan_no !== '—' ? grn.challan_no : '',
      transporter_name: (grn as any).transporter_name || '',
      vehicle_measure_required: Boolean((grn as any).vehicle_measure_required),
      vehicle_no: grn.vehicle_no && grn.vehicle_no !== '—' ? grn.vehicle_no : '',
      length_in_inches: Number((grn as any).length_in_inches || 0.0),
      breadth_in_inches: Number((grn as any).breadth_in_inches || 0.0),
      height_in_inches: Number((grn as any).height_in_inches || 0.0),
      volume_in_brass: Number((grn as any).volume_in_brass || 0.0),
      weight_required: Boolean((grn as any).weight_required),
      name_of_weight: (grn as any).name_of_weight || 'Bridge Scale 1',
      in_wt1: Number(grn.in_weight || 0.0),
      out_wt1: Number(grn.out_weight || 0.0),
      net_weight1: Number(grn.net_weight || 0.0),
      name_of_weight2: (grn as any).name_of_weight2 || '',
      in_wt2: Number((grn as any).in_wt2 || 0.0),
      out_wt2: Number((grn as any).out_wt2 || 0.0),
      net_weight2: Number((grn as any).net_weight2 || 0.0),
      avg_weight: Number((grn as any).avg_weight || 0.0),
      grn_weight: Number((grn as any).grn_weight || 0.0),
      weight_difference: Number((grn as any).weight_difference || 0.0),
      allow_wt_difference: Number((grn as any).allow_wt_difference || 0.05),
      net_wt_difference: Number((grn as any).net_wt_difference || 0.0),
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
            item_specification: l.item_specification || '',
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
            item_specification: '',
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

      extra_items: (grn as any).extra_items || [],
      total_extra_items_received: Number((grn as any).total_extra_items_received || 0),
      remarks: grn.remarks || '',
      account_posting_material_amount: Number((grn as any).account_posting_amount || 0),
      asset_amount: Number((grn as any).asset_amount || 0.0),
      asset_item: (grn as any).asset_item || '',

      po_remarks_list: (grn as any).po_remarks_list || [],

      pb_lines_created: Number((grn as any).pb_lines_created || 0),
      unlocked_fy: Number((grn as any).unlocked_fy || 2026),
      status: isNew ? 'Draft' : normalizeGrnFormStatus((grn as any).quantity_verification || (grn as any).raw_status || grn?.status),
      assigned_approval_role: (grn as any).assigned_approval_role || '',
    };
  });

  const [localInvoiceUrl, setLocalInvoiceUrl] = useState<string>('');

  useEffect(() => {
    if (!invoiceFile) {
      setLocalInvoiceUrl('');
      return;
    }
    const url = URL.createObjectURL(invoiceFile);
    setLocalInvoiceUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [invoiceFile]);

  const effectiveInvoiceUrl = form.uploaded_invoice_url || localInvoiceUrl;

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
    project_id?: string;
    project_name?: string;
    vendor_id?: string;
    vendor_name?: string;
    supplier_name?: string;
    company_name?: string;
    godown_name?: string;
    dealer_name?: string;
    material_details?: string;
    vendor_details?: {
      gst_number?: string;
      pan_number?: string;
      phone?: string;
      email?: string;
      address?: string;
      contact_person?: string;
      dealer_name?: string;
    };
  }[]>([]);

  useEffect(() => {
    let active = true;
    const selectedProj = projectOptions.find(
      (p) => p.name?.toLowerCase().trim() === form?.project_name?.toLowerCase().trim()
    );

    const supplierFilter = form?.supplier_name?.trim() ? form.supplier_name.trim() : undefined;

    setPoOptionsError(null);
    fetchPurchaseOrderOptions(selectedProj?.id, supplierFilter)
      .then((list) => {
        if (!active) return;
        setPoOptions(list);

        // Clear invalid primary PO reference if not present in new filtered PO list
        if (form?.from_pos && form.from_pos !== 'Not Exist') {
          const exists = list.some((p) => p.po_number === form.from_pos);
          if (!exists) {
            setForm((prev) => ({ ...prev, from_pos: '' }));
          }
        }
      })
      .catch((err) => {
        // Without this the list stayed empty and looked like "no approved POs".
        if (!active) return;
        setPoOptions([]);
        setPoOptionsError(err instanceof Error ? err.message : 'Unable to load purchase orders.');
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

      if (poOptions.length > 0) {
        const poObj = poOptions.find((p) => p.po_number === form.from_pos);
        if (poObj) {
          const matchedVendor = vendorOptions.find(
            (v) => (v.display_name || v.legal_name) === (poObj.vendor_name || poObj.supplier_name) || v.id === poObj.vendor_id
          );
          const phone = poObj.vendor_details?.phone || matchedVendor?.phone || '';
          const dealer = poObj.dealer_name || poObj.vendor_details?.contact_person || (matchedVendor as any)?.contact_person || '';

          setForm((prev) => ({
            ...prev,
            project_name: prev.project_name || poObj.project_name || '',
            supplier_name: prev.supplier_name || poObj.vendor_name || matchedVendor?.display_name || '',
            company_name: prev.company_name || poObj.company_name || 'Pramukh Group Infrastructure Ltd.',
            godown_name: prev.godown_name || poObj.godown_name || 'Main Site Store',
            phone_no: prev.phone_no || phone,
            mobile_no: prev.mobile_no || phone,
            dealer_name: prev.dealer_name || dealer,
            qc_no: prev.qc_no || `QC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
            gr_no: prev.gr_no || '(Auto Generated on Save)',
            grn_date: prev.grn_date || todayStr,
          }));
        }
      }
    }
  }, [form.from_pos, poOptions, vendorOptions, todayStr]);

  const [uploadingChallan, setUploadingChallan] = useState(false);
  /** Upload failure, shown rather than logged. */
  const [documentError, setDocumentError] = useState<string | null>(null);

  /**
   * Both document slots are plain uploads.
   *
   * OCR is deliberately disconnected: nothing here reads the file, extracts
   * fields, or writes anything into the form. The document is stored and
   * referenced, and every GRN field stays whatever the user typed. This removes
   * the class of defect where a misread invoice quietly rewrote quantities or
   * a vendor name that had already been entered correctly.
   *
   * PDF only, for both slots. A photograph of a challan cannot be relied on as
   * the archival copy of a financial document, and accepting images invited
   * exactly that.
   */
  const PDF_ONLY_MESSAGE = 'Only PDF files can be attached here. Convert the document to PDF first.';

  function rejectNonPdf(file: File): boolean {
    const isPdf =
      file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setDocumentError(`"${file.name}" is not a PDF. ${PDF_ONLY_MESSAGE}`);
      return true;
    }
    if (file.size === 0) {
      setDocumentError(`"${file.name}" is empty.`);
      return true;
    }
    if (file.size > 25 * 1024 * 1024) {
      setDocumentError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`,
      );
      return true;
    }
    return false;
  }

  const handleChallanFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setDocumentError(null);
    if (rejectNonPdf(file)) return;

    setUploadingChallan(true);
    try {
      const res = await uploadChallanInvoiceDocument(file, 'grn-challan');
      // The previous version console.warn'd this and left the UI reporting
      // nothing, so a failed upload was indistinguishable from a successful one.
      if (res.error || !res.data) {
        throw res.error ?? new Error('The delivery challan could not be stored.');
      }
      setForm((prev) => ({
        ...prev,
        uploaded_challan_url: res.data!.signedUrl || res.data!.publicUrl,
        uploaded_challan_path: res.data!.storagePath,
        uploaded_challan_name: file.name,
      }));
    } catch (err: any) {
      setDocumentError(`Delivery challan upload failed: ${err?.message || 'unknown error'}`);
    } finally {
      setUploadingChallan(false);
    }
  };

  /**
   * Supplier invoice: attach only. The file is uploaded on save (see
   * handleSubmit) so a GRN that is abandoned leaves no orphaned object.
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDocumentError(null);
    if (rejectNonPdf(file)) return;

    setInvoiceFile(file);
    setIsInvoiceDirty(true);
    setForm((prev) => ({ ...prev, uploaded_invoice_name: file.name }));
  };

  // Remove attached document
  const handleRemoveDocument = () => {
    setInvoiceFile(null);
    setIsInvoiceDirty(true);
    setDocumentError(null);
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
          item_specification: '',
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

    // Upload the invoice on save, so an abandoned form leaves no orphaned object.
    // No extraction is persisted: nothing reads the document.
    if (isInvoiceDirty && invoiceFile) {
      setUploadingInvoice(true);
      setDocumentError(null);
      try {
        const uploadRes = await uploadChallanInvoiceDocument(invoiceFile, 'grn-invoice');
        if (uploadRes.error || !uploadRes.data) {
          throw uploadRes.error ?? new Error('The invoice could not be stored.');
        }
        updatedInvoiceUrl = uploadRes.data.signedUrl || uploadRes.data.publicUrl;
        updatedInvoicePath = uploadRes.data.storagePath;
      } catch (err: any) {
        // Stop the save. Recording a GRN whose invoice reference points at
        // nothing is worse than making the user retry the upload.
        setDocumentError(`Invoice upload failed: ${err?.message || 'unknown error'}`);
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
                      Attach the supplier invoice as a PDF. Stored against this GRN — no fields are
                      read from it.
                    </p>
                  </div>
                </div>

                 <div className="flex items-center gap-1.5">
                  {effectiveInvoiceUrl && (
                    <>
                      <a
                        href={effectiveInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer shrink-0"
                      >
                        <FileCheck className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={effectiveInvoiceUrl}
                        download={form.uploaded_invoice_name || 'supplier-invoice.pdf'}
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </>
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
                  accept="application/pdf,.pdf"
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
                    <Upload className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> Click to attach Supplier Invoice (PDF)
                  </span>
                )}
              </label>

              {invoiceFile && !form.uploaded_invoice_url && (
                <p className="text-[10px] font-semibold text-muted-foreground">
                  Attached. It is stored when you save the GRN.
                </p>
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
                      Attach the signed delivery receipt / gate pass as a PDF. Stored against this
                      GRN — no fields are read from it.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {form.uploaded_challan_url && (
                    <>
                      <a
                        href={form.uploaded_challan_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-blue-500/50 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition-all cursor-pointer shrink-0"
                      >
                        <FileCheck className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={form.uploaded_challan_url}
                        download={form.uploaded_challan_name || 'delivery-challan.pdf'}
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-blue-500/50 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition-all cursor-pointer shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </>
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
                  accept="application/pdf,.pdf"
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
                    <Truck className="h-3.5 w-3.5 text-blue-600 shrink-0" /> Click to attach Delivery Challan (PDF)
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* One error surface for both slots. Previously a challan failure was
            console.warn'd and the UI said nothing at all. */}
        {documentError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{documentError}</span>
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

                  const matchedVendor = vendorOptions.find(
                    (v) => (v.display_name || v.legal_name) === (poObj?.vendor_name || poObj?.supplier_name) || v.id === poObj?.vendor_id
                  );

                  const phone = poObj?.vendor_details?.phone || matchedVendor?.phone || '';
                  const dealer = poObj?.dealer_name || poObj?.vendor_details?.contact_person || (matchedVendor as any)?.contact_person || '';
                  const company = poObj?.company_name || 'Pramukh Group Infrastructure Ltd.';
                  const project = poObj?.project_name || '';
                  const godown = poObj?.godown_name || 'Main Site Store';
                  const supplier = poObj?.vendor_name || matchedVendor?.display_name || matchedVendor?.legal_name || '';
                  const currentYear = new Date().getFullYear();

                  setForm((prev) => ({
                    ...prev,
                    from_pos: selectedPoNumber,
                    project_name: project || prev.project_name,
                    supplier_name: supplier || prev.supplier_name,
                    company_name: company || prev.company_name,
                    godown_name: godown || prev.godown_name,
                    phone_no: phone || prev.phone_no,
                    mobile_no: phone || prev.mobile_no,
                    dealer_name: dealer || prev.dealer_name,
                    qc_no: prev.qc_no || `QC-${currentYear}-${Math.floor(1000 + Math.random() * 9000)}`,
                    gr_no: prev.gr_no || '(Auto Generated on Save)',
                    grn_date: prev.grn_date || todayStr,
                  }));

                  // Clearing the reference must clear the lines with it,
                  // otherwise the picker keeps offering the old order's items.
                  const fetchedLines = await loadPoLines(poObj?.id);
                  if (fetchedLines.length > 0) {
                    setShowPoItemPicker(true);
                  }
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground text-xs cursor-pointer focus:ring-2 focus:ring-primary shadow-2xs"
              >
                <option value="">-- None / Multi-PO Consolidated Entry --</option>
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
              <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                Optional single PO reference. Leave blank to pick items from multiple Approved POs below.
              </p>
              {/* An empty dropdown had two very different causes — the query
                  failed, or no PO is receivable — and looked identical. */}
              {poOptionsError && (
                <p className="mt-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300">
                  Purchase orders could not be loaded: {poOptionsError}
                </p>
              )}
              {!poOptionsError && poOptions.length === 0 && (
                <p className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                  No receivable purchase orders for this project and supplier. Only POs that are
                  approved, sent to vendor, acknowledged or partially delivered appear here.
                </p>
              )}
              {/* Selecting a Purchase Order used to fail silently: the read
                  throws, the handler had no catch, and nothing appeared. */}
              {poLinesLoading && (
                <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                  Loading purchase order lines…
                </p>
              )}
              {poLinesError && !poLinesLoading && (
                <p className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                  {poLinesError}
                </p>
              )}
            </div>

            {/* 2. Select Items From PO* */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                Select Items From PO*
              </label>
              <button
                type="button"
                disabled={poLinesLoading}
                onClick={async () => {
                  if (form.from_pos && form.from_pos !== 'Not Exist') {
                    const poObj = poOptions.find((p) => p.po_number === form.from_pos);
                    await loadPoLines(poObj?.id);
                  } else {
                    // Multi-PO mode: the picker sources its own list, so any
                    // single-PO lines left in state would be stale here.
                    setCurrentPoLinesWithBalance([]);
                    setPoLinesError(null);
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
                disabled={poLinesLoading}
                onClick={async () => {
                  if (form.from_pos && form.from_pos !== 'Not Exist') {
                    const poObj = poOptions.find((p) => p.po_number === form.from_pos);
                    await loadPoLines(poObj?.id);
                  } else {
                    // Multi-PO mode: the picker sources its own list, so any
                    // single-PO lines left in state would be stale here.
                    setCurrentPoLinesWithBalance([]);
                    setPoLinesError(null);
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
                  <th className="px-3 py-2.5 min-w-[150px]">Item Specifications</th>
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
                            value={item.item_specification || ''}
                            onChange={(e) => handlePurchaseEntryChange(idx, 'item_specification', e.target.value)}
                            className="w-36 rounded border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground"
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
                            onClick={async () => {
                              // Was a floating .then() with no .catch(): a failed
                              // read rejected silently and the picker opened on
                              // whatever lines happened to be in state.
                              if (form.from_pos && form.from_pos !== 'Not Exist') {
                                const poObj = poOptions.find((p) => p.po_number === form.from_pos);
                                await loadPoLines(poObj?.id);
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

                  {canApprove && (
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
                  )}
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
            /* The picker sources lines from ANY approved PO, so the header has
               to be hydrated from whichever order the chosen lines actually
               came from. Only the "Primary Purchase Order Reference" dropdown
               did this, so picking items directly left project_name empty —
               and an empty project is what made the line insert fail its
               NOT NULL constraint and the entries disappear on save. */
            const firstLine = selectedItems[0]?.line;
            const sourcePo = poOptions.find(
              (p) => p.id === firstLine?.po_id || p.po_number === firstLine?.po_number,
            );
            const resolvedGodown = form.godown_name || sourcePo?.godown_name || '';
            const resolvedProject = form.project_name || sourcePo?.project_name || '';

            const mapped: GrnPurchaseEntry[] = selectedItems.map(({ line, receivingQty }) => ({
              item_id: line.item_id || null,
              purchase_order_line_id: line.po_line_id,
              po_no: line.po_number || form.from_pos || '',
              item_group: line.item_group || '',
              item_description: line.item_description || '',
              item_code: line.item_code || '',
              item_brand: line.item_brand || '',
              item_specification: line.item_specification || '',
              activity_name: line.activity_name || '',
              sub_activity_name: line.sub_activity_name || '',
              location: line.location || resolvedGodown || resolvedProject || '',
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
              /* Anything already typed wins; this only fills what is blank. */
              from_pos:
                prev.from_pos && prev.from_pos !== 'Not Exist'
                  ? prev.from_pos
                  : sourcePo?.po_number || prev.from_pos,
              project_name: prev.project_name || sourcePo?.project_name || '',
              supplier_name:
                prev.supplier_name || sourcePo?.vendor_name || sourcePo?.supplier_name || '',
              company_name: prev.company_name || sourcePo?.company_name || '',
              godown_name: prev.godown_name || sourcePo?.godown_name || '',
              dealer_name:
                prev.dealer_name
                || sourcePo?.dealer_name
                || sourcePo?.vendor_details?.contact_person
                || '',
              phone_no: prev.phone_no || sourcePo?.vendor_details?.phone || '',
              mobile_no: prev.mobile_no || sourcePo?.vendor_details?.phone || '',
            }));
            setShowPoItemPicker(false);
          }}
          onClose={() => setShowPoItemPicker(false)}
        />
      )}
    </div>
  );
}
