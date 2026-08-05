'use client';

// ============================================================================
// RFQ REGISTRATION FORM & EMBEDDED MULTI-VENDOR AWARD MATRIX (PHASE 3)
// File: frontend/src/components/procurement/rfq/rfq-form.tsx
//
// Features:
// 1. All original fields & workflows preserved intact (No field removed).
// 2. Section 1: Header Details & Process Type (Direct PO vs Quotation Request).
// 3. Section 2: Line Items Table (carried from PR with previous & quoted rates).
// 4. Section 3: Supplier Quotation Submission Table (Select vendors from registry).
// 5. Section 4: EMBEDDED MULTI-VENDOR SOURCING AWARD MATRIX
//    - Dynamically shows ONLY suppliers selected in Section 3!
//    - Mode A: High-Density Dual-Axis Frozen Grid (Sticky Headers & Columns).
//    - Mode B: Single-Item Split Focus Assistant (ideal for 15+ items) with Range Sliders.
//    - Live Vendor Award Summary Bar (Total RFQ Value vs Awarded Value per Supplier).
//    - Clean Zero-Rate & Draft Quotation Cell Handling.
// 6. Sticky Bottom Action Bar with status, Close, Print PDF, Activity Log, and Issue Multi-Vendor POs.
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
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
  History,
  Award,
  Split,
  Grid,
  SlidersHorizontal,
  Search,
  Wand2,
  Coins,
  ShieldAlert,
} from 'lucide-react';
import type { PurchaseRequisitionRow, VendorRow } from '@/lib/procurement';
import { printRfqReport } from '@/lib/procurement';
import { formatCurrency } from '@/components/procurement/shared';
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
  quotation_url?: string | null;
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
  quoted_rate?: number;
  tax_rate?: number;
  tax_amount?: number;
  line_total?: number;
  unit: string;
  required_date: string;
  remarks: string;
}

export type RfqStatusType =
  | 'Auto-Draft'
  | 'Draft'
  | 'RFQ Sent'
  | 'Quotes Received'
  | 'Under Evaluation'
  | 'Awarded'
  | 'PO Issued'
  | 'Cancelled';

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
  allocations?: Record<string, EmbeddedAwardCellState>;
}

interface RfqFormProps {
  approvedPr: PurchaseRequisitionRow;
  /** Live vendor registry — the supplier picker's source of truth. */
  suppliers?: RfqSupplierOption[];
  isReadOnly?: boolean;
  onSubmit: (formData: RfqFormState, isDirectPo: boolean) => void;
  onCancel: () => void;
}

type EmbeddedAwardCellState = {
  awarded_qty: number;
  awarded_rate: number;
  non_l1_justification: string;
};

const VENDOR_COLOR_PALETTE = [
  { text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', bar: 'bg-purple-600' },
  { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', bar: 'bg-emerald-600' },
  { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', bar: 'bg-amber-600' },
  { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30', bar: 'bg-indigo-600' },
  { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30', bar: 'bg-sky-600' },
];

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

  // Derive initial status from RFQ DB status, falling back to approvedPr status
  const getInitialStatus = (pr: PurchaseRequisitionRow, rfqDbStatus?: string | null): RfqStatusType => {
    const rfqSt = (rfqDbStatus || '').toLowerCase().trim();
    if (rfqSt === 'published' || rfqSt === 'rfq_sent' || rfqSt === 'rfq sent') return 'RFQ Sent';
    if (rfqSt === 'quotes_received' || rfqSt === 'quotations_received' || rfqSt === 'quotes received') return 'Quotes Received';
    if (rfqSt === 'under_evaluation' || rfqSt === 'under evaluation') return 'Under Evaluation';
    if (rfqSt === 'awarded' || rfqSt === 'vendor_selected' || rfqSt === 'vendor selected') return 'Awarded';
    if (rfqSt === 'po_issued' || rfqSt === 'po issued') return 'PO Issued';
    if (rfqSt === 'cancelled') return 'Cancelled';
    if (rfqSt === 'draft') return 'Draft';

    const s = (pr?.status || '').toLowerCase().trim();
    if (s === 'rfq_sent') return 'RFQ Sent';
    if (s === 'quotes_received') return 'Quotes Received';
    if (s === 'under_evaluation') return 'Under Evaluation';
    if (s === 'vendor_selected' || s === 'awarded') return 'Awarded';
    if (s === 'po_issued') return 'PO Issued';
    if (s === 'cancelled') return 'Cancelled';
    if (s === 'draft') return 'Draft';
    return 'Auto-Draft';
  };

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
    status: getInitialStatus(approvedPr),
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
  const [historyOpen, setHistoryOpen] = useState(false);

  // SECTION 4: EMBEDDED AWARD MATRIX STATE
  const [matrixViewMode, setMatrixViewMode] = useState<'grid' | 'focus'>('grid');
  const [selectedFocusItemIdx, setSelectedFocusItemIdx] = useState<number>(0);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  
  // Load saved RFQ details (header, suppliers, line rates, status) from Supabase on mount
  useEffect(() => {
    async function loadSavedRfqData() {
      if (!approvedPr?.id) return;
      try {
        const { data: rfq } = await supabase
          .from('rfqs')
          .select('*, rfq_vendors(*), rfq_lines(*)')
          .eq('purchase_requisition_id', approvedPr.id)
          .maybeSingle();

        if (rfq) {
          setForm((prev) => {
            const savedSuppliers: RfqFormSupplierRow[] = (rfq.rfq_vendors || []).map((rv: any, idx: number) => {
              const vendorMatch = supplierMaster.find((v) => v.id === rv.vendor_id);
              return {
                key: `sup-${rv.id || idx}`,
                supplier_id: rv.vendor_id || '',
                supplier_name: vendorMatch?.name || rv.vendor_name || `Supplier #${idx + 1}`,
                email_to: rv.email_to || vendorMatch?.email || '',
                email_cc: rv.email_cc || '',
                quotation_url: rv.quotation_url || null,
              };
            });

            const savedItems: RfqFormItemRow[] = (rfq.rfq_lines || []).map((rl: any, idx: number) => {
              const existingItem = prev.items[idx] || prev.items[0];
              const prevRate = Number(rl.previous_rate ?? existingItem?.previous_rate ?? rl.estimated_rate ?? 350);
              const quotRate = Number(rl.quoted_rate ?? rl.estimated_rate ?? existingItem?.quoted_rate ?? prevRate);
              const taxRate = Number(rl.tax_rate ?? existingItem?.tax_rate ?? 18);
              return {
                ...existingItem,
                key: `line-${rl.id || idx}`,
                item_id: rl.item_id || existingItem?.item_id || null,
                item_description: rl.item_description || existingItem?.item_description || '',
                specification: rl.specification || existingItem?.specification || '',
                item_brand: rl.preferred_brand || existingItem?.item_brand || '',
                quantity: Number(rl.rfq_quantity || existingItem?.quantity || 1),
                previous_rate: prevRate,
                quoted_rate: quotRate,
                tax_rate: taxRate,
                unit: rl.unit || existingItem?.unit || 'BAGS',
                required_date: rl.required_date || existingItem?.required_date || '',
                remarks: rl.remarks || existingItem?.remarks || '',
              };
            });

            const cleanRemarks = (rfq.remarks || '').replace(/\n?\[AWARDS\]:.*/, '').trim();

            // Restore saved matrix allocations from awards_json or remarks tag
            if (rfq.awards_json && typeof rfq.awards_json === 'object' && Object.keys(rfq.awards_json).length > 0) {
              setAllocations(rfq.awards_json);
            } else if (rfq.remarks && rfq.remarks.includes('[AWARDS]:')) {
              try {
                const jsonStr = rfq.remarks.split('[AWARDS]:')[1];
                const parsed = JSON.parse(jsonStr);
                if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                  setAllocations(parsed);
                }
              } catch (e) {}
            }

            return {
              ...prev,
              quotation_registration_no: rfq.rfq_number || prev.quotation_registration_no,
              goal_delivery_date: rfq.due_date || prev.goal_delivery_date,
              delivery_address: rfq.delivery_address || prev.delivery_address,
              remarks: cleanRemarks,
              process_type: rfq.process_type || prev.process_type,
              status: getInitialStatus(approvedPr, rfq.status),
              selected_quotation_url: rfq.selected_quotation_url || prev.selected_quotation_url,
              suppliers: savedSuppliers.length > 0 ? savedSuppliers : prev.suppliers,
              items: savedItems.length > 0 ? savedItems : prev.items,
            };
          });
        }
      } catch (err) {
        console.error('Error loading saved RFQ from Supabase:', err);
      }
    }
    loadSavedRfqData();
  }, [approvedPr?.id, approvedPr?.status]);

  // Allocations Key: `${item.key}:${supplier_id_or_name}`
  const [allocations, setAllocations] = useState<Record<string, EmbeddedAwardCellState>>({});

  // --- Granular editability flags based on status + process_type ---
  const isQuotationRequest = form.process_type === 'Quotation Request';
  const isDirectPo = form.process_type === 'Direct PO';
  const st = form.status as string;

  const isFormLocked =
    isReadOnly ||
    st === 'Awarded' ||
    st === 'PO Issued' ||
    st === 'Cancelled' ||
    approvedPr?.status === 'vendor_selected' ||
    approvedPr?.status === 'po_issued';

  // Section 1: Header — editable in Auto-Draft, Draft
  const isHeaderEditable = !isFormLocked && (st === 'Auto-Draft' || st === 'Draft');

  // Section 2: Items — editable in Auto-Draft, Draft, Quotes Received
  const isItemsEditable = !isFormLocked && (st === 'Auto-Draft' || st === 'Draft' || st === 'Quotes Received');

  // Section 3: Suppliers — editable in Auto-Draft, Draft
  const isSuppliersEditable = !isFormLocked && (st === 'Auto-Draft' || st === 'Draft');

  // Section 4: Award Matrix visibility
  const isMatrixVisible = isDirectPo
    ? true  // Direct PO: always visible
    : ['Quotes Received', 'Under Evaluation', 'Awarded', 'PO Issued'].includes(st);

  // Section 4: Award Matrix editability
  const isMatrixEditable = !isFormLocked && (
    isDirectPo
      ? (st === 'Auto-Draft' || st === 'Draft')  // Direct PO: editable in Auto-Draft / Draft
      : (st === 'Quotes Received' || st === 'Under Evaluation')  // QR: editable in these
  );

  // Section 5: PDF & Remarks visibility
  const isUploadVisible = isDirectPo
    ? true  // Direct PO: always visible
    : ['Quotes Received', 'Under Evaluation', 'Awarded', 'PO Issued'].includes(st);

  // Backward compat: viewModeActive used by many disabled= props
  const viewModeActive = isFormLocked;
  const showQuotationUpload = isUploadVisible;

  // Selected suppliers in Section 3 (filtered to non-empty ones)
  const selectedSuppliers = useMemo(() => {
    return form.suppliers.filter((s) => s.supplier_id || s.supplier_name.trim());
  }, [form.suppliers]);

  // Sync / Initialize Allocations when items or selected suppliers change
  useEffect(() => {
    setAllocations((prev) => {
      const next = { ...prev };
      for (const item of form.items) {
        for (const sup of selectedSuppliers) {
          const supId = sup.supplier_id || sup.supplier_name;
          const key = `${item.key}:${supId}`;
          if (!next[key]) {
            next[key] = {
              awarded_qty: 0,
              awarded_rate: (item.quoted_rate ?? item.previous_rate) ?? 0,
              non_l1_justification: '',
            };
          }
        }
      }
      return next;
    });
  }, [form.items, selectedSuppliers]);

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

  // Handle Vendor-Specific Quotation PDF Upload to Supabase Storage
  const handleSupplierPdfUpload = async (supKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingPdf(true);
      const fileExt = file.name.split('.').pop();
      const filePath = `quotations/${form.quotation_registration_no}_${supKey}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('procurement_docs')
        .upload(filePath, file, { upsert: true });

      let pdfUrl = '';
      if (uploadError) {
        pdfUrl = URL.createObjectURL(file);
      } else {
        const { data: publicUrlData } = supabase.storage
          .from('procurement_docs')
          .getPublicUrl(filePath);
        pdfUrl = publicUrlData.publicUrl;
      }

      setForm((prev) => {
        const updatedSuppliers = prev.suppliers.map((s) =>
          s.key === supKey || s.supplier_id === supKey || s.supplier_name === supKey
            ? { ...s, quotation_url: pdfUrl }
            : s
        );
        return {
          ...prev,
          suppliers: updatedSuppliers,
          selected_quotation_url: prev.selected_quotation_url || pdfUrl,
        };
      });
    } catch (err) {
      const localBlobUrl = URL.createObjectURL(file);
      setForm((prev) => {
        const updatedSuppliers = prev.suppliers.map((s) =>
          s.key === supKey || s.supplier_id === supKey || s.supplier_name === supKey
            ? { ...s, quotation_url: localBlobUrl }
            : s
        );
        return {
          ...prev,
          suppliers: updatedSuppliers,
          selected_quotation_url: prev.selected_quotation_url || localBlobUrl,
        };
      });
    } finally {
      setUploadingPdf(false);
    }
  };

  // Trigger Action Button with Target Status Transition
  const handleAction = (targetStatus: RfqStatusType) => {
    const updatedForm: RfqFormState = { ...form, status: targetStatus, allocations };
    setForm(updatedForm);
    const shouldGeneratePo = targetStatus === 'PO Issued';
    onSubmit(updatedForm, shouldGeneratePo);
  };

  // Auto-Fill Lowest Rate Allocation (Auto L1) across matrix
  const handleAutoFillL1InForm = () => {
    if (selectedSuppliers.length === 0) return;
    const next = { ...allocations };
    for (const item of form.items) {
      const firstSupId = selectedSuppliers[0].supplier_id || selectedSuppliers[0].supplier_name;
      for (const sup of selectedSuppliers) {
        const supId = sup.supplier_id || sup.supplier_name;
        const key = `${item.key}:${supId}`;
        const isFirst = supId === firstSupId;
        next[key] = {
          awarded_qty: isFirst ? item.quantity : 0,
          awarded_rate: (item.quoted_rate ?? item.previous_rate) ?? 0,
          non_l1_justification: '',
        };
      }
    }
    setAllocations(next);
  };

  // Matrix Helpers
  const getItemAllocatedQty = (itemKey: string) => {
    return selectedSuppliers.reduce((sum, sup) => {
      const supId = sup.supplier_id || sup.supplier_name;
      const key = `${itemKey}:${supId}`;
      return sum + (allocations[key]?.awarded_qty || 0);
    }, 0);
  };

  // Total RFQ Estimated Cost Value
  const totalRfqEstCostValue = form.items.reduce(
    (sum, item) => sum + item.quantity * ((item.quoted_rate ?? item.previous_rate) ?? 0),
    0
  );

  // Total Awarded Value across selected suppliers
  const totalAwardedGrandValue = form.items.reduce((sum, item) => {
    return sum + selectedSuppliers.reduce((sSum, sup) => {
      const supId = sup.supplier_id || sup.supplier_name;
      const key = `${item.key}:${supId}`;
      const cell = allocations[key];
      if (cell && cell.awarded_qty > 0) {
        return sSum + cell.awarded_qty * cell.awarded_rate * 1.18; // 18% GST default estimate
      }
      return sSum;
    }, 0);
  }, 0);

  // Per-Vendor Award Breakdown
  const vendorBreakdowns = selectedSuppliers.map((sup, vIdx) => {
    const supId = sup.supplier_id || sup.supplier_name;
    let totalVal = 0;
    let awardedItems = 0;

    for (const item of form.items) {
      const key = `${item.key}:${supId}`;
      const cell = allocations[key];
      if (cell && cell.awarded_qty > 0) {
        totalVal += cell.awarded_qty * cell.awarded_rate * 1.18;
        awardedItems += 1;
      }
    }
    const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];
    return {
      supId,
      name: sup.supplier_name || `Supplier #${vIdx + 1}`,
      totalVal,
      awardedItems,
      color,
    };
  });

  const activeFocusItem = form.items[selectedFocusItemIdx] || form.items[0];

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
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-500/30">
            {form.status}
          </span>
          <button
            type="button"
            onClick={onCancel}
            title="Close Form"
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* ============================================================================ */}
        {/* SECTION 1: HEADER DETAILS & PROCESS TYPE                                     */}
        {/* ============================================================================ */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-muted-foreground border-b border-border/50 pb-2">
            Section 1: Header Details &amp; Process Type
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
                disabled
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono font-bold text-foreground opacity-80"
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
                disabled={!isHeaderEditable}
                onChange={(e) => updateField('quotation_date', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
              />
            </div>

            {/* Goal / Target Delivery Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> Goal Delivery Date *
              </label>
              <input
                type="date"
                value={form.goal_delivery_date}
                disabled={!isHeaderEditable}
                onChange={(e) => updateField('goal_delivery_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                required
              />
            </div>

            {/* Process Type Dropdown */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">
                Process Type *
              </label>
              <select
                value={form.process_type}
                disabled={!isHeaderEditable}
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
                disabled={!isHeaderEditable}
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
                disabled={!isHeaderEditable}
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
                disabled={!isHeaderEditable}
                onChange={(e) => updateField('contractor_name', e.target.value)}
                placeholder="Preferred contractor/vendor"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
              />
            </div>

            {/* Delivery Address */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary" /> Delivery Address
              </label>
              <input
                type="text"
                value={form.delivery_address}
                disabled={!isHeaderEditable}
                onChange={(e) => updateField('delivery_address', e.target.value)}
                placeholder="Project site delivery address"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
              />
            </div>

            {/* Remarks / Special Instructions */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Remarks / Special Terms
              </label>
              <input
                type="text"
                value={form.remarks}
                disabled={!isHeaderEditable}
                onChange={(e) => updateField('remarks', e.target.value)}
                placeholder="Special terms, payment terms, or delivery notes"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
              />
            </div>
          </div>
        </div>

        {/* ============================================================================ */}
        {/* SECTION 2: QUOTATION REGISTRATION ENTRIES TABLE (CARRIED FROM PR)            */}
        {/* ============================================================================ */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Section 2: Quotation Registration Entries Table (Carried Forward from Approved PR)
              </h3>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {form.items.length} Line Item(s) Carried Forward from PR • Items and quantities are locked from PR scope.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2.5 text-center w-10">#</th>
                  <th className="px-2 py-2.5 min-w-[100px]">Item Group</th>
                  <th className="px-2 py-2.5 min-w-[110px]">Item Brand</th>
                  <th className="px-2 py-2.5 min-w-[200px]">Item Description</th>
                  <th className="px-2 py-2.5 text-right min-w-[80px]">RFQ Qty</th>
                  <th className="px-2 py-2.5 text-center min-w-[60px]">Unit</th>
                  <th className="px-2 py-2.5 text-right min-w-[90px]">Prev Rate (₹)</th>
                  <th className="px-2 py-2.5 text-right min-w-[100px]">Quoted Rate (₹)</th>
                  <th className="px-2 py-2.5 text-center min-w-[60px]">Tax %</th>
                  <th className="px-2 py-2.5 text-right min-w-[90px]">Tax Amt (₹)</th>
                  <th className="px-2 py-2.5 text-right min-w-[100px]">Amount (₹)</th>
                  <th className="px-2 py-2.5 text-center min-w-[110px]">Delivery Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.items.map((item, idx) => {
                  const qRate = (item.quoted_rate ?? item.previous_rate) ?? 0;
                  const tRate = item.tax_rate ?? 18;
                  const lineSubtotal = item.quantity * qRate;
                  const taxAmt = (lineSubtotal * tRate) / 100;
                  const lineTot = lineSubtotal + taxAmt;

                  return (
                    <tr key={item.key} className="hover:bg-muted/30 transition-colors align-middle">
                      <td className="px-2 py-2.5 text-center font-bold text-muted-foreground">{idx + 1}</td>

                      {/* Item Group */}
                      <td className="px-2 py-2.5">
                        <input
                          type="text"
                          value={item.item_group}
                          disabled={viewModeActive}
                          onChange={(e) => handleItemChange(idx, 'item_group', e.target.value)}
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-75"
                        />
                      </td>

                      {/* Item Brand */}
                      <td className="px-2 py-2.5">
                        <input
                          type="text"
                          value={item.item_brand}
                          disabled={viewModeActive}
                          onChange={(e) => handleItemChange(idx, 'item_brand', e.target.value)}
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-75"
                        />
                      </td>

                      {/* Item Description */}
                      <td className="px-2 py-2.5 font-bold text-foreground">
                        <input
                          type="text"
                          value={item.item_description}
                          disabled={viewModeActive}
                          onChange={(e) => handleItemChange(idx, 'item_description', e.target.value)}
                          className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                          required
                        />
                      </td>

                      {/* RFQ Qty */}
                      <td className="px-2 py-2.5 text-right font-extrabold text-foreground">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={item.quantity}
                          disabled={viewModeActive}
                          onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                          className="w-20 rounded-md border border-border bg-background px-1.5 py-1.5 text-right font-extrabold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                          required
                        />
                      </td>

                      {/* Unit */}
                      <td className="px-2 py-2.5 text-center uppercase font-bold text-muted-foreground">
                        <input
                          type="text"
                          value={item.unit}
                          disabled={viewModeActive}
                          onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                          className="w-14 rounded border border-border bg-background px-1 py-1 text-center font-bold uppercase text-xs focus:border-primary focus:outline-none disabled:opacity-75"
                        />
                      </td>

                      {/* Previous Rate (₹) */}
                      <td className="px-2 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.previous_rate}
                          disabled={!isItemsEditable}
                          onChange={(e) => handleItemChange(idx, 'previous_rate', Number(e.target.value))}
                          className="w-20 rounded-md border border-border bg-background px-1.5 py-1.5 text-right font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                          required
                        />
                      </td>

                      {/* Quoted Rate (₹) */}
                      <td className="px-2 py-2.5 text-right bg-primary/5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={(item.quoted_rate ?? item.previous_rate) ?? 0}
                          disabled={!isItemsEditable}
                          onChange={(e) => handleItemChange(idx, 'quoted_rate', Number(e.target.value))}
                          className="w-24 rounded-md border-2 border-primary/40 bg-background px-1.5 py-1.5 text-right font-extrabold text-primary focus:border-primary focus:outline-none disabled:opacity-75"
                          required
                        />
                      </td>

                      {/* Tax / GST % */}
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={item.tax_rate ?? 18}
                          disabled={!isItemsEditable}
                          onChange={(e) => handleItemChange(idx, 'tax_rate', Number(e.target.value))}
                          className="w-16 rounded-md border border-border bg-background px-1.5 py-1.5 text-center font-bold text-foreground focus:border-primary focus:outline-none disabled:opacity-75"
                        />
                      </td>

                      {/* Tax Amount (₹) */}
                      <td className="px-2 py-2.5 text-right font-semibold text-muted-foreground">
                        ₹{taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Line Total / Amount (₹) */}
                      <td className="px-2 py-2.5 text-right bg-emerald-500/5">
                        <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                          ₹{lineTot.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Goal Delivery Date */}
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="date"
                          value={item.required_date}
                          disabled={viewModeActive}
                          onChange={(e) => handleItemChange(idx, 'required_date', e.target.value)}
                          className="w-28 rounded-md border border-border bg-background px-1.5 py-1.5 font-semibold text-foreground text-center focus:border-primary focus:outline-none disabled:opacity-75"
                          required
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================================ */}
        {/* SECTION 3: SUPPLIER TABLE (BOTH PROCESS TYPES)                                */}
        {/* ============================================================================ */}
        {(
          <div className="space-y-3 rounded-xl border border-border p-4 bg-background shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" />
                    Section 3: Suppliers
                  </h3>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                  Select suppliers from vendor registry.
                </p>
              </div>

              {isSuppliersEditable && (
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
                    {isSuppliersEditable && <th className="px-4 py-3 text-center w-16">Action</th>}
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
                          placeholder="supplier@vendor.com"
                          onChange={(e) => handleSupplierEmailChange(idx, 'email_to', e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="email"
                          value={sup.email_cc}
                          disabled={viewModeActive}
                          placeholder="cc@company.com"
                          onChange={(e) => handleSupplierEmailChange(idx, 'email_cc', e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
                        />
                      </td>
                      {isSuppliersEditable && (
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSupplier(idx)}
                            disabled={form.suppliers.length <= 1}
                            className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

        {/* ============================================================================ */}
        {/* SECTION 4: EMBEDDED MULTI-VENDOR SOURCING AWARD & QUANTITY SPLIT MATRIX       */}
        {/* (Dynamically filters columns to show ONLY suppliers selected in Section 3)    */}
        {/* ============================================================================ */}
        {isMatrixVisible && (
        <div className="space-y-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-500/20 pb-3">
            <div className="flex items-center gap-2">
              <Split className="h-4 w-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground">
                Section 4: Award Matrix
              </h3>
              <span className="text-[10px] text-muted-foreground font-medium">
                {selectedSuppliers.length} vendor{selectedSuppliers.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setMatrixViewMode('grid')}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-all cursor-pointer ${
                    matrixViewMode === 'grid'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Grid className="h-3 w-3" /> Grid
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixViewMode('focus')}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-all cursor-pointer ${
                    matrixViewMode === 'focus'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <SlidersHorizontal className="h-3 w-3" /> Focus
                </button>
              </div>

              {isMatrixEditable && (
                <button
                  type="button"
                  onClick={handleAutoFillL1InForm}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer"
                >
                  <Wand2 className="h-3 w-3" /> Auto L1
                </button>
              )}
            </div>
          </div>

          {selectedSuppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-border rounded-xl bg-background">
              <Info className="h-6 w-6 text-amber-500 mb-1.5" />
              <p className="text-xs font-bold text-foreground">No suppliers selected</p>
              <p className="text-[11px] text-muted-foreground">Add suppliers in Section 3 above.</p>
            </div>
          ) : (
            <>
              {/* MODE A: HIGH-DENSITY MATRIX GRID VIEW (STICKY LEFT COLUMNS + STICKY HEADER) */}
              {matrixViewMode === 'grid' && (
                <div className="relative border border-border rounded-xl overflow-auto max-h-[50vh] shadow-2xs bg-background">
                  <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border bg-muted/95 text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0 z-30 shadow-2xs backdrop-blur">
                        <th className="sticky left-0 top-0 z-40 bg-muted px-3 py-2.5 min-w-[200px] font-extrabold text-foreground border-r border-border">
                          Item Description
                        </th>
                        <th className="px-2 py-2.5 text-center min-w-[50px] font-bold">Unit</th>
                        <th className="px-2 py-2.5 text-right min-w-[70px] font-bold">Qty</th>
                        <th className="px-2 py-2.5 text-right min-w-[90px] font-bold border-r border-border">
                          Remaining
                        </th>

                        {/* Selected Supplier Columns */}
                        {selectedSuppliers.map((sup, vIdx) => {
                          const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];
                          return (
                            <th key={sup.key} className="p-2.5 min-w-[200px] text-center border-r border-border bg-muted/40">
                              <div className={`font-extrabold text-xs truncate ${color.text}`}>
                                {sup.supplier_name || `Supplier #${vIdx + 1}`}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border/60">
                      {form.items.map((item, idx) => {
                        const totalAllocated = getItemAllocatedQty(item.key);
                        const unallocated = item.quantity - totalAllocated;
                        const isFully = Math.abs(unallocated) < 0.0001;
                        const isOver = unallocated < -0.0001;

                        return (
                          <tr key={item.key} className="hover:bg-muted/20 transition-colors">
                            {/* Sticky Left Column */}
                            <td className="sticky left-0 z-20 bg-card px-3 py-2.5 font-semibold text-foreground border-r border-border shadow-2xs">
                              <div className="flex items-center gap-1.5 max-w-[190px]">
                                <span className="text-[10px] font-bold text-muted-foreground shrink-0">#{idx + 1}</span>
                                <p className="font-bold text-xs text-foreground truncate" title={item.item_description}>
                                  {item.item_description}
                                </p>
                              </div>
                            </td>

                            <td className="px-3 py-3 text-center text-muted-foreground font-medium uppercase text-[11px]">
                              {item.unit}
                            </td>

                            <td className="px-3 py-3 text-right font-bold tabular-nums text-foreground">
                              {item.quantity.toLocaleString('en-IN')}
                            </td>

                            <td className="px-3 py-3 text-right border-r border-border font-bold tabular-nums">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-black ${
                                  isOver
                                    ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                                    : isFully
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {unallocated.toLocaleString('en-IN')} {item.unit}
                              </span>
                            </td>

                            {/* Supplier Allocation Cells */}
                            {selectedSuppliers.map((sup, vIdx) => {
                              const supId = sup.supplier_id || sup.supplier_name;
                              const key = `${item.key}:${supId}`;
                              const cell = allocations[key] || {
                                awarded_qty: 0,
                                awarded_rate: (item.quoted_rate ?? item.previous_rate) ?? 0,
                                non_l1_justification: '',
                              };
                              const isAwarded = cell.awarded_qty > 0;
                              const isFirstSup = vIdx === 0;

                              return (
                                <td
                                  key={sup.key}
                                  className={`p-3 border-r border-border transition-all ${
                                    isAwarded ? 'bg-purple-500/5 dark:bg-purple-950/20' : ''
                                  }`}
                                >
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-bold text-foreground">
                                        {formatCurrency(cell.awarded_rate)}
                                      </span>
                                      {isFirstSup && (
                                        <span className="rounded bg-emerald-600 px-1 py-0.5 text-[8px] font-extrabold text-white leading-none">
                                          L1
                                        </span>
                                      )}
                                    </div>

                                    <div>
                                      <label className="text-[9px] font-bold uppercase text-muted-foreground block mb-0.5">
                                        Qty ({item.unit})
                                      </label>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        max={item.quantity}
                                        value={cell.awarded_qty || ''}
                                        placeholder="0"
                                        disabled={viewModeActive}
                                        onChange={(e) => {
                                          const val = Math.max(0, Number(e.target.value || 0));
                                          setAllocations((prev) => ({
                                            ...prev,
                                            [key]: { ...cell, awarded_qty: val },
                                          }));
                                        }}
                                        className={`w-full rounded-lg border p-1.5 text-right font-extrabold tabular-nums outline-none text-xs ${
                                          isAwarded
                                            ? 'border-purple-500 bg-purple-500/10 text-purple-900 dark:text-purple-200'
                                            : 'border-border bg-background text-foreground'
                                        }`}
                                      />
                                    </div>

                                    {isAwarded && (
                                      <div>
                                        <label className="text-[9px] font-bold text-muted-foreground block mb-0.5">
                                          Neg. Rate (₹)
                                        </label>
                                        <input
                                          type="number"
                                          step="any"
                                          min="0"
                                          value={cell.awarded_rate}
                                          disabled={viewModeActive}
                                          onChange={(e) => {
                                            const val = Number(e.target.value || 0);
                                            setAllocations((prev) => ({
                                              ...prev,
                                              [key]: { ...cell, awarded_rate: val },
                                            }));
                                          }}
                                          className="w-full rounded border border-border bg-background p-1 text-right font-bold text-foreground text-xs"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* MODE B: SINGLE-ITEM FOCUS ASSISTANT (IDEAL FOR 15+ ITEMS) */}
              {matrixViewMode === 'focus' && activeFocusItem && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 max-h-[50vh] overflow-hidden">
                  {/* Left Column Sidebar */}
                  <div className="md:col-span-4 flex flex-col rounded-xl border border-border bg-background p-3 shadow-2xs overflow-hidden">
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search item name or code..."
                        value={itemSearchQuery}
                        onChange={(e) => setItemSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary font-medium"
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                      {form.items
                        .filter((it) => !itemSearchQuery.trim() || it.item_description.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                        .map((item, idx) => {
                          const lineAllocated = getItemAllocatedQty(item.key);
                          const isFully = Math.abs(item.quantity - lineAllocated) < 0.0001;
                          const isSelected = item.key === activeFocusItem.key;

                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setSelectedFocusItemIdx(form.items.findIndex((it) => it.key === item.key))}
                              className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-primary bg-primary/10 text-foreground font-bold shadow-2xs'
                                  : 'border-border/60 bg-card hover:bg-muted/50 text-muted-foreground'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold uppercase text-muted-foreground">Item #{idx + 1}</span>
                                <span className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold ${isFully ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700'}`}>
                                  {lineAllocated} / {item.quantity} {item.unit}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-foreground truncate mt-0.5">{item.item_description}</p>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Right Column Split Assistant */}
                  <div className="md:col-span-8 flex flex-col rounded-xl border border-border bg-card p-4 shadow-2xs overflow-y-auto space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <div>
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" /> {activeFocusItem.item_description}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">
                          RFQ Quantity: <strong className="text-foreground">{activeFocusItem.quantity} {activeFocusItem.unit}</strong>
                        </p>
                      </div>

                      <span className="text-xs font-black text-primary">
                        Allocated: {getItemAllocatedQty(activeFocusItem.key)} / {activeFocusItem.quantity} {activeFocusItem.unit}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {selectedSuppliers.map((sup, vIdx) => {
                        const supId = sup.supplier_id || sup.supplier_name;
                        const key = `${activeFocusItem.key}:${supId}`;
                        const cell = allocations[key] || {
                          awarded_qty: 0,
                          awarded_rate: (activeFocusItem.quoted_rate ?? activeFocusItem.previous_rate) ?? 0,
                          non_l1_justification: '',
                        };
                        const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];

                        return (
                          <div key={sup.key} className={`p-3 rounded-xl border ${cell.awarded_qty > 0 ? color.bg : 'border-border bg-background'} space-y-2`}>
                            <div className="flex items-center justify-between text-xs">
                              <span className={`font-extrabold ${color.text}`}>{sup.supplier_name || `Supplier #${vIdx + 1}`}</span>
                              <span className="font-bold text-foreground">Rate: {formatCurrency(cell.awarded_rate)}</span>
                            </div>

                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min="0"
                                max={activeFocusItem.quantity}
                                value={cell.awarded_qty}
                                disabled={viewModeActive}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setAllocations((prev) => ({
                                    ...prev,
                                    [key]: { ...cell, awarded_qty: val },
                                  }));
                                }}
                                className="flex-1 h-2 accent-primary cursor-pointer"
                              />
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={activeFocusItem.quantity}
                                  value={cell.awarded_qty || ''}
                                  disabled={viewModeActive}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value || 0));
                                    setAllocations((prev) => ({
                                      ...prev,
                                      [key]: { ...cell, awarded_qty: val },
                                    }));
                                  }}
                                  className="w-20 rounded border border-border bg-background p-1 text-right font-bold text-xs"
                                />
                                <span className="text-xs font-bold text-muted-foreground">{activeFocusItem.unit}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* AWARD SUMMARY BAR */}
              <div className="border-t border-purple-500/20 pt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-heading font-extrabold text-foreground flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-purple-600" /> Summary
                  </span>
                  <span className="text-muted-foreground font-medium">
                    Total: <strong className="text-foreground">{formatCurrency(totalRfqEstCostValue)}</strong>
                  </span>
                  <span className="text-muted-foreground font-medium">
                    Awarded: <strong className="text-purple-700 dark:text-purple-300 font-extrabold">{formatCurrency(totalAwardedGrandValue)}</strong>
                  </span>
                  {(() => {
                    const allocatedCount = form.items.filter((it) => Math.abs(it.quantity - getItemAllocatedQty(it.key)) < 0.0001).length;
                    const totalCount = form.items.length;
                    const allDone = allocatedCount === totalCount;
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${allDone ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'}`}>
                        {allDone ? `${allocatedCount}/${totalCount} allocated` : `${allocatedCount}/${totalCount} pending`}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-1.5">
                  {vendorBreakdowns.map((vb) => (
                    <div key={vb.supId} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${vb.color.bg}`}>
                      <span className={`font-extrabold ${vb.color.text}`}>{vb.name}:</span>
                      <span className="text-foreground">{formatCurrency(vb.totalVal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        )}

        {/* SECTION 5: PDF UPLOAD & REMARKS */}
        {isUploadVisible && (
          <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider font-heading text-foreground flex items-center gap-2">
              <FileUp className="h-4 w-4 text-primary" />
              Section 5: Multi-Vendor Quotation PDFs &amp; Selection Remarks
            </h3>

            {/* Per-Vendor PDF Upload Grid */}
            {selectedSuppliers.length > 0 && (
              <div className="space-y-2 border-b border-border pb-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" /> Vendor-Wise Quotation PDF Documents ({selectedSuppliers.length} Vendor{selectedSuppliers.length === 1 ? '' : 's'})
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedSuppliers.map((sup, vIdx) => {
                    const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];
                    const supKey = sup.key || sup.supplier_id || sup.supplier_name;
                    return (
                      <div key={supKey} className={`rounded-xl border p-3 space-y-2 bg-background/80 ${color.bg}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-bold text-xs ${color.text} truncate max-w-[180px]`}>
                            {sup.supplier_name || `Supplier #${vIdx + 1}`}
                          </span>
                          {sup.quotation_url && (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Uploaded
                            </span>
                          )}
                        </div>

                        <input
                          type="file"
                          accept=".pdf,image/*"
                          disabled={viewModeActive || uploadingPdf}
                          onChange={(e) => handleSupplierPdfUpload(supKey, e)}
                          className="block w-full text-[11px] text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                        />

                        {sup.quotation_url && (
                          <a
                            href={sup.quotation_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline pt-1"
                          >
                            <Eye className="h-3.5 w-3.5" /> View {sup.supplier_name} Quote PDF
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-xs">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                Selection / Approval Remarks
              </label>
              <textarea
                rows={2}
                value={form.selection_remark || ''}
                disabled={viewModeActive}
                onChange={(e) => updateField('selection_remark', e.target.value)}
                placeholder="Enter remarks or justification for selected vendor/pricing..."
                className="w-full rounded-lg border border-border bg-background p-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none shadow-2xs disabled:opacity-75"
              />
            </div>
          </div>
        )}

        {/* ============================================================================ */}
        {/* STICKY BOTTOM CONTEXTUAL ACTION BAR                                          */}
        {/* ============================================================================ */}
        <div className="sticky bottom-0 z-30 -mx-6 -mb-6 border-t border-border bg-card/95 px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-extrabold text-foreground flex items-center gap-1.5">
              Status: <span className="rounded font-mono px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">{form.status}</span>
            </span>

            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Close Form
            </button>

            <button
              type="button"
              onClick={() => setPdfModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </button>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <History className="h-3.5 w-3.5" /> Activity Log
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isFormLocked && (
              <>
                {/* Save Draft — when status is Auto-Draft or Draft */}
                {(st === 'Auto-Draft' || st === 'Draft') ? (
                  <button
                    type="button"
                    onClick={() => handleAction('Draft')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> Save Draft
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAction(form.status as RfqStatusType)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                )}

                {/* Cancel RFQ — available once past Draft / Auto-Draft */}
                {st !== 'Auto-Draft' && st !== 'Draft' && (
                  <button
                    type="button"
                    onClick={() => handleAction('Cancelled')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel RFQ
                  </button>
                )}

                {/* === QUOTATION REQUEST STATUS FLOW === */}
                {isQuotationRequest && (st === 'Auto-Draft' || st === 'Draft') && (
                  <button
                    type="button"
                    onClick={() => handleAction('RFQ Sent')}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-md transition-all cursor-pointer font-heading"
                  >
                    <Send className="h-4 w-4" /> Send Quotation Request
                  </button>
                )}
                {isQuotationRequest && st === 'RFQ Sent' && (
                  <button
                    type="button"
                    onClick={() => handleAction('Quotes Received')}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow-md transition-all cursor-pointer font-heading"
                  >
                    <FileDown className="h-4 w-4" /> Mark Quotes Received
                  </button>
                )}
                {isQuotationRequest && (st === 'Quotes Received' || st === 'Under Evaluation') && (
                  <button
                    type="button"
                    onClick={() => handleAction('Awarded')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer font-heading"
                  >
                    <Award className="h-4 w-4" /> Finalize Award
                  </button>
                )}

                {/* === DIRECT PO STATUS FLOW === */}
                {isDirectPo && (st === 'Auto-Draft' || st === 'Draft') && (
                  <button
                    type="button"
                    onClick={() => handleAction('Awarded')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all cursor-pointer font-heading"
                  >
                    <Award className="h-4 w-4" /> Finalize Award
                  </button>
                )}
              </>
            )}

            {/* Generate POs — shown when status is Awarded (both types) */}
            {st === 'Awarded' && (
              <button
                type="button"
                onClick={() => handleAction('PO Issued')}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-700 shadow-md transition-all cursor-pointer font-heading"
              >
                <ArrowRight className="h-4 w-4" /> Generate POs
              </button>
            )}
          </div>
        </div>
      </div>

      {/* HISTORY & ACTIVITY LOG MODAL */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> RFQ Activity Log &amp; History
              </h3>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto text-xs">
              <div className="flex gap-3 items-start border-l-2 border-primary pl-3 py-1">
                <div>
                  <p className="font-bold text-foreground">RFQ Registration ({form.quotation_registration_no})</p>
                  <p className="text-muted-foreground font-mono text-[11px]">{form.quotation_date} • System Registered</p>
                </div>
              </div>
              <div className="flex gap-3 items-start border-l-2 border-blue-500 pl-3 py-1">
                <div>
                  <p className="font-bold text-foreground">Source PR Connected</p>
                  <p className="text-muted-foreground font-mono text-[11px]">{approvedPr.pr_number} • Approved Requisition</p>
                </div>
              </div>
              <div className="flex gap-3 items-start border-l-2 border-purple-500 pl-3 py-1">
                <div>
                  <p className="font-bold text-foreground">Selected Suppliers: {selectedSuppliers.length} Vendor(s)</p>
                  <p className="text-muted-foreground font-mono text-[11px]">Multi-Vendor Sourcing Award Matrix Active</p>
                </div>
              </div>
              <div className="flex gap-3 items-start border-l-2 border-emerald-500 pl-3 py-1">
                <div>
                  <p className="font-bold text-foreground">Current Workflow Status: {form.status}</p>
                  <p className="text-muted-foreground font-mono text-[11px]">Process Mode: {form.process_type}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
