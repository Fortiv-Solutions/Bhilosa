'use client';
// Refreshed PO form & 5-tab system

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Boxes,
  ClipboardList,
  Download,
  FileText,
  FileDown,
  Eye,
  PackageCheck,
  RefreshCcw,
  ReceiptIndianRupee,
  Send,
  ShoppingCart,
  Truck,
  UsersRound,
  Warehouse,
  X,
  UserPlus,
  Plus,
} from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { supabase } from '@/utils/supabase-client';
import {
  approveVendorSelection,
  assignPrToCurrentUser,
  approveAndSendPurchaseOrder,
  approvePurchaseRequisition,
  convertMaterialRequestToPr,
  createGrnFromPo,
  createProcurementDocumentUrl,
  createMaterialRequest,
  createRfqFromPr,
  createVendorBillFromGrn,
  generatePurchaseOrderPdf,
  generatePurchaseOrder,
  generatePurchaseRequisitionPdf,
  listProcurementDashboard,
  listProcurementProjects,
  recordQuotation,
  recommendVendorSelection,
  reviewMaterialRequestInventory,
  issueMaterialFromStock,
  trackDelivery,
  submitGrn,
  postGrnToInventory,
  updateDeliveryTrackingStatus,
  updateFullPurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  sendPurchaseOrderToVendor,
  acknowledgePurchaseOrder,
  type MaterialRequestRow,
  type ProcurementDashboardData,
  type ProcurementProjectOption,
  type PurchaseOrderRow,
  type ProcurementLineRow,
  type PurchaseRequisitionRow,
  type QuotationRow,
  type GeneratePurchaseOrderInput,
  type RfqRow,
  type VendorBillRow,
  type EntityAttachmentRow,
  type InventorySnapshotRow,
} from '@/lib/procurement';
import { formatCurrency, statusLabel, StatusBadge, EmptyState, Panel } from '@/components/procurement/shared';
import { PurchaseRequisitionWorkspace } from '@/components/procurement/purchase-requisition/purchase-requisition-workspace';
import { RFQWorkspace } from '@/components/procurement/rfq/rfq-workspace';
import { RfqWorkbench } from '@/components/procurement/rfq-workbench';
import MaterialRequestWorkQueue from '@/components/procurement/material-request-work-queue';
import { PurchaseOrderWorkbench } from '@/components/procurement/purchase-order-workbench';
import { DeliveryTrackingWorkbench } from '@/components/procurement/delivery-tracking-workbench';
import { GrnWorkbench } from '@/components/procurement/grn-workbench';
import { InventoryWorkbench } from '@/components/procurement/inventory-workbench';
import { POWorkspace } from '@/components/procurement/po/po-workspace';
import { GrnWorkspace } from '@/components/procurement/grn/grn-workspace';
import { BillsWorkspace } from '@/components/procurement/bills/bills-workspace';
import { useAppStore } from '@/store/use-app-store';

type TabId = 'requests' | 'requisitions' | 'rfq' | 'orders' | 'grn' | 'billing';

const tabs: { id: TabId; label: string; icon: typeof ClipboardList }[] = [
  { id: 'requests', label: 'MR', icon: ClipboardList },
  { id: 'requisitions', label: 'PR', icon: ShoppingCart },
  { id: 'rfq', label: 'RFQ', icon: UsersRound },
  { id: 'orders', label: 'PO', icon: Truck },
  { id: 'grn', label: 'GRN', icon: PackageCheck },
  { id: 'billing', label: 'Bills', icon: ReceiptIndianRupee },
];

const emptyData: ProcurementDashboardData = {
  materialRequests: [],
  purchaseRequisitions: [],
  rfqs: [],
  quotations: [],
  vendorSelections: [],
  purchaseOrders: [],
  grns: [],
  vendorBills: [],
  inventorySnapshots: [],
  vendors: [],
  prAttachments: [],
  deliveryTrackings: [],
};



export default function ProcurementPage() {
  const { projects, activeProjectId, activeRole } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>('requests');
  const [data, setData] = useState<ProcurementDashboardData>(emptyData);
  const [liveProjects, setLiveProjects] = useState<ProcurementProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [mrTitle, setMrTitle] = useState('Cement and steel requirement for upcoming slab');
  const [mrItem, setMrItem] = useState('OPC Cement');
  const [mrQuantity, setMrQuantity] = useState(500);
  const [mrRate, setMrRate] = useState(380);
  const [mrSiteId, setMrSiteId] = useState('');
  const [mrAttachments, setMrAttachments] = useState<File[]>([]);

  // PR Generation Modal State
  const [prModalOpen, setPrModalOpen] = useState(false);
  const [selectedMrForPr, setSelectedMrForPr] = useState<MaterialRequestRow | null>(null);
  const [prTitle, setPrTitle] = useState('');
  const [prRequiredDate, setPrRequiredDate] = useState('');
  const [prFinanceRequired, setPrFinanceRequired] = useState(false);
  const [prApprovalStage, setPrApprovalStage] = useState('pr_team');
  const [prRemarks, setPrRemarks] = useState('');
  const [prAttachments, setPrAttachments] = useState<File[]>([]);

  // RFQ Creation Modal State
  const [rfqModalOpen, setRfqModalOpen] = useState(false);
  const [selectedPrForRfq, setSelectedPrForRfq] = useState<PurchaseRequisitionRow | null>(null);
  const [selectedVendorsForRfq, setSelectedVendorsForRfq] = useState<string[]>([]);

  // Selected PR state for workbench
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [selectedDeliveryPoId, setSelectedDeliveryPoId] = useState<string | null>(null);
  const [selectedGrnPoId, setSelectedGrnPoId] = useState<string | null>(null);

  // Quotation and vendor finalization state
  type QuoteLineInput = {
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
  };
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [selectedRfqForQuote, setSelectedRfqForQuote] = useState<RfqRow | null>(null);
  const [selectedVendorForQuote, setSelectedVendorForQuote] = useState('');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [quoteLeadTimeDays, setQuoteLeadTimeDays] = useState(7);
  const [quoteDeliveryTerms, setQuoteDeliveryTerms] = useState('Delivery at project site store');
  const [quotePaymentTerms, setQuotePaymentTerms] = useState('30 days from accepted GRN');
  const [quoteGstDetails, setQuoteGstDetails] = useState('GST extra as applicable');
  const [quoteStoragePath, setQuoteStoragePath] = useState('');
  const [quoteLines, setQuoteLines] = useState<QuoteLineInput[]>([]);
  const [quoteAttachments, setQuoteAttachments] = useState<File[]>([]);
  const [recommendModalOpen, setRecommendModalOpen] = useState(false);
  const [selectedQuotationForRecommendation, setSelectedQuotationForRecommendation] = useState<QuotationRow | null>(null);
  const [recommendationReason, setRecommendationReason] = useState('Best evaluated commercial offer considering rate, lead time, GST impact, and vendor performance.');

  // PO Generation Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedPrForPo, setSelectedPrForPo] = useState<PurchaseRequisitionRow | null>(null);
  const [selectedQuotationForPo, setSelectedQuotationForPo] = useState<QuotationRow | null>(null);
  const [selectedVendorSelectionIdForPo, setSelectedVendorSelectionIdForPo] = useState<string | null>(null);
  const [poDeliveryLocation, setPoDeliveryLocation] = useState('Project site store');
  const [poDeliveryDate, setPoDeliveryDate] = useState('');
  const [poPaymentTerms, setPoPaymentTerms] = useState('');
  const [poTermsAndConditions, setPoTermsAndConditions] = useState(
    '1. Quality should be as per specifications.\n2. Goods must be delivered in proper packaging.\n3. Damaged goods will be rejected and returned at vendor\'s cost.'
  );
  type PoLineInput = {
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    line_total: number;
  };
  const [poLines, setPoLines] = useState<PoLineInput[]>([]);

  type PrLineInput = {
    item_description: string;
    quantity: number;
    estimated_rate: number;
    item_id: string | null;
  };
  const [prLines, setPrLines] = useState<PrLineInput[]>([]);

  // GRN Modal State
  type GrnLineInput = {
    item_id: string;
    ordered_qty: number;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    unit_rate: number;
    remarks: string;
  };
  const [grnLines, setGrnLines] = useState<GrnLineInput[]>([]);
  const [grnReceiptDate, setGrnReceiptDate] = useState('');
  const [grnChallanNumber, setGrnChallanNumber] = useState('');
  const [grnVehicleNumber, setGrnVehicleNumber] = useState('');
  const [grnQualityDecision, setGrnQualityDecision] = useState('accepted');
  const [grnAttachments, setGrnAttachments] = useState<File[]>([]);
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [selectedPoForGrn, setSelectedPoForGrn] = useState<PurchaseOrderRow | null>(null);
  const liveMode = isLiveSupabase();
  const projectOptions = liveMode && liveProjects.length > 0 ? liveProjects : projects;
  const selectedProject = projectOptions.find((project) => project.id === selectedProjectId) ?? projectOptions[0];

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listProcurementDashboard(selectedProjectId === 'all' ? undefined : selectedProjectId));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load procurement data.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!liveMode) return;
    let active = true;
    void listProcurementProjects()
      .then((options) => {
        if (!active) return;
        setLiveProjects(options);
        setSelectedProjectId((current) => (current && options.some((option) => option.id === current) ? current : 'all'));
      })
      .catch((projectError) => {
        if (!active) return;
        setError(projectError instanceof Error ? projectError.message : 'Unable to load live projects.');
      });
    return () => {
      active = false;
    };
  }, [liveMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Real-time Supabase Subscription for instant Sync with Mobile App & Submissions
  useEffect(() => {
    if (!liveMode) return;
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel('procurement-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_requests' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessage(`📱 New Material Request #${(payload.new as { mr_number?: string }).mr_number || ''} submitted from Mobile App!`);
        }
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_requisitions' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessage(`⚡ Auto-Draft Purchase Requisition #${(payload.new as { pr_number?: string }).pr_number || ''} created.`);
        }
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessage(`📦 Purchase Order #${(payload.new as { po_number?: string }).po_number || ''} created.`);
        }
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods_receipt_notes' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessage(`🚚 New GRN #${(payload.new as { grn_number?: string }).grn_number || ''} submitted from site.`);
        }
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_bills' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessage(`🧾 Vendor Bill #${(payload.new as { bill_number?: string }).bill_number || ''} generated.`);
        }
        void refresh();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [liveMode, refresh]);

  async function runAction(label: string, action: () => Promise<{ error: Error | null }>) {
    setError(null);
    setMessage(null);
    const result = await action();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(label);
    await refresh();
  }

  async function handlePoPdf(po: PurchaseOrderRow) {
    setError(null);
    setMessage(null);
    const result = await generatePurchaseOrderPdf(po);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.data?.signedUrl) {
      setError('PO PDF was generated, but the signed preview link was not returned.');
      return;
    }
    setMessage(`PO PDF generated for ${po.po_number}.`);
    await refresh();
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleOpenPoPdf(po: PurchaseOrderRow) {
    if (!po.pdf_storage_path) {
      setError('Generate the PO PDF before preview or download.');
      return;
    }
    setError(null);
    const result = await createProcurementDocumentUrl(po.pdf_storage_path);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.data?.signedUrl) {
      setError('Could not create a signed link for this PO PDF.');
      return;
    }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handlePrPdf(pr: PurchaseRequisitionRow) {
    setError(null);
    setMessage(null);
    const result = await generatePurchaseRequisitionPdf(pr);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.data?.signedUrl) {
      setError('PR PDF was generated, but the signed preview link was not returned.');
      return;
    }
    setMessage(`PR PDF generated for ${pr.pr_number}.`);
    await refresh();
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleOpenPrPdf(pr: PurchaseRequisitionRow) {
    const attachment = data.prAttachments?.find(a => a.entity_id === pr.id);
    if (!attachment?.storage_path) {
      setError('Generate the PR PDF before preview or download.');
      return;
    }
    setError(null);
    const result = await createProcurementDocumentUrl(attachment.storage_path);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!result.data?.signedUrl) {
      setError('Could not create a signed link for this PR PDF.');
      return;
    }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const updatePrLinesAndRecalculate = (newLines: PrLineInput[]) => {
    setPrLines(newLines);
    const cost = newLines.reduce((sum, line) => sum + line.quantity * line.estimated_rate, 0);
    setPrFinanceRequired(cost >= 500000);
    setPrApprovalStage(cost >= 500000 ? 'upper_management' : 'pr_team');
  };

  const handleAddPrLine = () => {
    updatePrLinesAndRecalculate([
      ...prLines,
      { item_description: '', quantity: 1, estimated_rate: 0, item_id: null }
    ]);
  };

  const handleRemovePrLine = (idx: number) => {
    updatePrLinesAndRecalculate(prLines.filter((_, i) => i !== idx));
  };

  const handlePrLineChange = (idx: number, key: keyof PrLineInput, value: string | number) => {
    const updated = prLines.map((line, i) => {
      if (i !== idx) return line;
      let val = value;
      if (key === 'quantity') val = Number(value) || 0;
      if (key === 'estimated_rate') val = Number(value) || 0;
      return { ...line, [key]: val };
    });
    updatePrLinesAndRecalculate(updated);
  };

  async function openPrModal(mr: MaterialRequestRow, approvedLines?: ProcurementLineRow[]) {
    const allLines = mr.material_request_lines || [];
    const targetLines = approvedLines && approvedLines.length > 0 
      ? approvedLines 
      : allLines.filter((l) => l.line_status === 'approved_for_pr').length > 0 
        ? allLines.filter((l) => l.line_status === 'approved_for_pr')
        : allLines;

    const initialLines = targetLines.map((line, idx) => ({
      source_mr_id: mr.id,
      source_mr_number: mr.mr_number,
      mr_line_number: idx + 1,
      material_request_line_id: line.id || null,
      resource_type: 'material',
      item_id: line.item_id || null,
      item_code: line.item_code || `MAT-${String(idx + 1).padStart(3, '0')}`,
      item_group: line.item_group || 'General Construction',
      item_description: line.item_description,
      specification: line.specification || line.item_specification || '',
      unit: line.unit || 'nos',
      quantity: Number(line.quantity || 0),
      ind_qty: Number(line.quantity || 0),
      est_qty: Number(line.quantity || 0),
      approved_mr_qty: Number(line.quantity || 0),
      estimated_rate: Number(line.estimated_rate || 0),
      line_total: Number(line.quantity || 0) * Number(line.estimated_rate || 0),
      required_date: line.required_date || mr.required_date,
      preferred_brand: line.preferred_brand || line.item_brand || '',
      suggested_vendor: line.suggested_vendor || '',
      delivery_location: line.delivery_location || mr.projects?.name || 'Site Store',
      priority: mr.priority,
      stock_audit: (line.project_stock ?? 0) > 0 ? 'Stock Available' : 'Stock Shortage',
      project_and_block: mr.projects?.name ?? mr.project_id,
      work_activity: mr.work_activity ?? 'General Site Activity',
      activity_code: mr.activity_code ?? 'ACT-001',
      raised_by: mr.profiles?.name ?? mr.raised_by ?? 'Site Engineer',
      submitted_at: mr.submitted_at ?? mr.created_at,
    }));
    
    const estimatedCost = initialLines.reduce((sum, line) => sum + line.quantity * line.estimated_rate, 0);
    const financeReq = estimatedCost >= 500000;
    const stage = financeReq ? 'upper_management' : 'pr_team';
    const title = mr.justification || mr.mr_number;

    await runAction(`⚡ Draft PR created in PR section & ${mr.mr_number} converted to PR!`, () => convertMaterialRequestToPr({
      materialRequest: mr,
      title,
      requiredDate: mr.required_date,
      financeRequired: financeReq,
      approvalStage: stage,
      remarks: 'Auto-draft generated from Approved MR in real-time.',
      lines: initialLines,
    }));

    setSelectedMrForPr(null);
    setActiveTab('requests');
  }

  async function handleGeneratePrSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMrForPr) return;
    if (prLines.length === 0) {
      setError('Please add at least one line item to the purchase requisition.');
      return;
    }
    
    await runAction('Purchase requisition created from MR.', () => convertMaterialRequestToPr({
      materialRequest: selectedMrForPr,
      title: prTitle,
      requiredDate: prRequiredDate,
      financeRequired: prFinanceRequired,
      approvalStage: prApprovalStage,
      remarks: prRemarks,
      lines: prLines,
      attachments: prAttachments,
    }));
    setPrModalOpen(false);
  }

  function openRfqModal(pr: PurchaseRequisitionRow) {
    setSelectedPrForRfq(pr);
    setSelectedVendorsForRfq([]);
    setRfqModalOpen(true);
  }

  async function handleCreateRfqSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPrForRfq) return;
    if (selectedVendorsForRfq.length === 0) {
      setError('Please select at least one vendor.');
      return;
    }
    
    await runAction('RFQ created and linked to selected vendors.', () => createRfqFromPr(selectedPrForRfq, selectedVendorsForRfq));
    setRfqModalOpen(false);
  }

  function getPrForRfq(rfq: RfqRow) {
    return data.purchaseRequisitions.find((pr) => pr.id === rfq.purchase_requisition_id) ?? null;
  }

  function getSelectionForPr(prId: string) {
    return data.vendorSelections.find((selection) => selection.purchase_requisition_id === prId) ?? null;
  }

  function openQuotationModal(rfq: RfqRow, vendorId?: string) {
    const pr = getPrForRfq(rfq);
    const defaultVendorId = vendorId || rfq.rfq_vendors?.[0]?.vendor_id || '';
    const initialLines = (pr?.purchase_requisition_lines || []).map((line) => ({
      item_id: line.item_id ?? null,
      item_description: line.item_description,
      quantity: Number(line.quantity || 0),
      unit_rate: Number(line.estimated_rate || 0),
      tax_rate: 18,
    }));
    setSelectedRfqForQuote(rfq);
    setSelectedVendorForQuote(defaultVendorId);
    setQuoteNumber('');
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteLeadTimeDays(7);
    setQuoteDeliveryTerms('Delivery at project site store');
    setQuotePaymentTerms('30 days from accepted GRN');
    setQuoteGstDetails('GST extra as applicable');
    setQuoteStoragePath('');
    setQuoteLines(initialLines.length > 0 ? initialLines : [{ item_description: '', quantity: 1, unit_rate: 0, tax_rate: 18 }]);
    setQuoteModalOpen(true);
  }

  function handleQuoteLineChange(index: number, field: keyof QuoteLineInput, value: string | number) {
    setQuoteLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (field === 'item_description') return { ...line, item_description: String(value) };
        if (field === 'quantity') return { ...line, quantity: Number(value) || 0 };
        if (field === 'unit_rate') return { ...line, unit_rate: Number(value) || 0 };
        if (field === 'tax_rate') return { ...line, tax_rate: Number(value) || 0 };
        return line;
      }),
    );
  }

  function handleRemoveQuoteLine(index: number) {
    setQuoteLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function handleAddQuoteLine() {
    setQuoteLines((current) => [...current, { item_description: '', quantity: 1, unit_rate: 0, tax_rate: 18 }]);
  }

  async function handleRecordQuoteSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedRfqForQuote) return;
    if (!selectedVendorForQuote) {
      setError('Select the vendor whose quotation is being recorded.');
      return;
    }
    if (quoteLines.length === 0) {
      setError('Add at least one quotation line.');
      return;
    }

    await runAction('Quotation recorded and linked to RFQ.', () =>
      recordQuotation({
        rfq: selectedRfqForQuote,
        vendorId: selectedVendorForQuote,
        quotationNumber: quoteNumber,
        quotationDate: quoteDate,
        leadTimeDays: quoteLeadTimeDays,
        deliveryTerms: quoteDeliveryTerms,
        paymentTerms: quotePaymentTerms,
        gstDetails: quoteGstDetails,
        storageBucket: quoteStoragePath ? 'procurement-documents' : null,
        storagePath: quoteStoragePath || null,
        lines: quoteLines,
        attachments: quoteAttachments,
      }),
    );
    setQuoteModalOpen(false);
    setQuoteModalOpen(false);
  }

  const handleGrnLineChange = (index: number, field: string, value: string) => {
    const updated = [...grnLines];
    updated[index] = { ...updated[index], [field]: field === 'remarks' || field === 'item_id' ? value : Number(value) };
    if (field === 'accepted_qty' || field === 'rejected_qty') {
      const accepted = field === 'accepted_qty' ? Number(value) : updated[index].accepted_qty;
      const rejected = field === 'rejected_qty' ? Number(value) : updated[index].rejected_qty;
      updated[index].received_qty = accepted + rejected;
    }
    setGrnLines(updated);
  };

  async function handleGrnSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedPoForGrn) return;
    
    // Validation
    for (const line of grnLines) {
      if (line.received_qty > line.ordered_qty) {
        setError(`Cannot receive more than ordered quantity for item ${line.item_id}`);
        return;
      }
      if (line.rejected_qty > 0 && !line.remarks?.trim()) {
        setError(`Must provide a rejection reason in remarks for rejected items`);
        return;
      }
    }
    
    await runAction('GRN created and recorded.', () =>
      submitGrn({
        purchaseOrderId: selectedPoForGrn.id,
        receiptDate: grnReceiptDate || new Date().toISOString().split('T')[0],
        challanNumber: grnChallanNumber,
        vehicleNumber: grnVehicleNumber,
        qualityDecision: grnQualityDecision,
        lines: grnLines,
        attachments: grnAttachments,
      }),
    );
    setGrnModalOpen(false);
  }
  function openRecommendationModal(quotation: QuotationRow) {
    setSelectedQuotationForRecommendation(quotation);
    setRecommendationReason('Best evaluated commercial offer considering rate, lead time, GST impact, and vendor performance.');
    setRecommendModalOpen(true);
  }

  async function handleRecommendVendorSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedQuotationForRecommendation) return;
    const rfq = data.rfqs.find((candidate) => candidate.id === selectedQuotationForRecommendation.rfq_id);
    const prId = rfq?.purchase_requisition_id;
    if (!prId) {
      setError('Could not find the PR linked to this quotation.');
      return;
    }
    await runAction('Vendor recommendation submitted for management approval.', () =>
      recommendVendorSelection({
        quotation: selectedQuotationForRecommendation,
        purchaseRequisitionId: prId,
        reasonForSelection: recommendationReason,
      }),
    );
    setRecommendModalOpen(false);
  }

  function openPoModal(pr: PurchaseRequisitionRow, quotation?: QuotationRow | null, vendorSelectionId?: string | null) {
    const selection = vendorSelectionId
      ? data.vendorSelections.find((candidate) => candidate.id === vendorSelectionId)
      : getSelectionForPr(pr.id);

    setSelectedPrForPo(pr);

    // Resolve to a REAL vendor id. RFQ Direct-PO passes a synthetic quotation whose
    // vendor_id is a placeholder ('v-1' / a mock-supplier id) that is not a real
    // vendors.id — inserting it would fail the purchase_orders.vendor_id FK. Trust the
    // requested vendor only if it exists in the loaded vendors; otherwise fall back.
    const requestedVendorId = quotation?.vendor_id || selection?.selected_vendor_id;
    const isRealVendor = !!requestedVendorId && data.vendors.some((v) => v.id === requestedVendorId);
    const defaultVendorId = (isRealVendor ? requestedVendorId : data.vendors[0]?.id) || '';

    const activeQuotation: QuotationRow = quotation
      ? { ...quotation, vendor_id: defaultVendorId }
      : {
          id: `quote-direct-${Date.now()}`,
          rfq_id: '',
          vendor_id: defaultVendorId,
          quotation_number: 'DIRECT-PO',
          quotation_date: new Date().toISOString().split('T')[0],
          subtotal_amount: Number(pr.subtotal_amount || pr.total_amount || 0),
          tax_amount: 0,
          total_amount: Number(pr.subtotal_amount || pr.total_amount || 0),
          lead_time_days: 7,
          payment_terms: '30 days from accepted GRN',
          status: 'submitted',
          created_at: new Date().toISOString(),
        };

    setSelectedQuotationForPo(activeQuotation);
    setSelectedVendorSelectionIdForPo(selection?.id || null);
    setPoDeliveryLocation('Project site store');
    setPoDeliveryDate(pr.required_date || new Date().toISOString().split('T')[0]);
    setPoPaymentTerms(activeQuotation.payment_terms || '30 days from accepted GRN');
    
    const lines = pr.purchase_requisition_lines || [];
    const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    const perLineRate = totalQty > 0 ? (activeQuotation.total_amount / totalQty) : 0;
    
    const initialLines = lines.map((line) => {
      const quoteLine = activeQuotation.quotation_lines?.find(
        (ql) => ql.item_description.toLowerCase() === line.item_description.toLowerCase()
      );
      const rate = quoteLine?.unit_rate ?? line.estimated_rate ?? perLineRate;
      const taxRate = 18;
      return {
        item_id: line.item_id ?? null,
        item_description: line.item_description,
        quantity: Number(line.quantity || 0),
        unit_rate: Number(rate || 0),
        tax_rate: taxRate,
        line_total: Number(line.quantity || 0) * Number(rate || 0),
      };
    });
    setPoLines(initialLines);
    setPoModalOpen(true);
  }

  function handlePoLineChange(index: number, field: keyof PoLineInput, value: string | number) {
    setPoLines(prev => {
      const copy = [...prev];
      const item = { ...copy[index] };
      if (field === 'unit_rate') {
        item.unit_rate = Number(value);
        item.line_total = item.quantity * item.unit_rate;
      } else if (field === 'tax_rate') {
        item.tax_rate = Number(value);
      } else if (field === 'quantity') {
        item.quantity = Number(value);
        item.line_total = item.quantity * item.unit_rate;
      } else if (field === 'item_description') {
        item.item_description = String(value);
      }
      copy[index] = item;
      return copy;
    });
  }

  async function handleGeneratePoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPrForPo || !selectedQuotationForPo) return;

    // vendor_id is NOT NULL + FK to vendors — a missing/placeholder id would fail at the DB.
    // Fail fast with a clear message instead of surfacing a raw uuid/FK error.
    const resolvedVendorId = selectedQuotationForPo.vendor_id || data.vendors[0]?.id || '';
    if (!resolvedVendorId || !data.vendors.some((v) => v.id === resolvedVendorId)) {
      setError('Cannot generate PO: no valid vendor is available. Add or select a real vendor first.');
      return;
    }

    const payload: GeneratePurchaseOrderInput = {
      purchaseRequisitionId: selectedPrForPo.id,
      vendorId: resolvedVendorId,
      vendorSelectionId: selectedVendorSelectionIdForPo || undefined,
      deliveryLocation: poDeliveryLocation,
      deliveryDate: poDeliveryDate,
      paymentTerms: poPaymentTerms,
      termsAndConditions: poTermsAndConditions,
      lines: poLines,
    };

    await runAction('Direct Purchase order generated cleanly.', () => generatePurchaseOrder(payload));
    setPoModalOpen(false);
  }

  function handleGeneratePoFromPr(pr: PurchaseRequisitionRow) {
    const selection = data.vendorSelections.find(vs => vs.purchase_requisition_id === pr.id);
    const quotation = selection
      ? (selection.vendor_quotations || data.quotations.find(q => q.id === selection.selected_quotation_id))
      : null;
    openPoModal(pr, quotation, selection?.id || null);
  }

  async function handleCreateMaterialRequest(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject || selectedProjectId === 'all') {
      setError('Select a specific project before submitting a new material request.');
      return;
    }
    await runAction('Material request submitted.', () =>
      createMaterialRequest({
        projectId: selectedProject.id,
        siteId: mrSiteId || null,
        title: mrTitle,
        requiredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'high',
        lines: [
          {
            itemDescription: mrItem,
            quantity: mrQuantity,
            estimatedRate: mrRate,
          },
        ],
        attachments: mrAttachments,
      }),
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary dark:border-orange-900/40 dark:bg-orange-950/30">
            Procurement Workflow
          </span>
          <h1 className="font-heading mt-2 text-2xl font-bold tracking-normal text-gray-950 dark:text-white sm:text-3xl">
            Request to GRN
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Raise material requests, convert them to PRs, collect quotations, finalize vendors, issue POs, and post GRNs into inventory.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold outline-none"
          >
            {liveMode && <option value="all">All live projects</option>}
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      
      {/* Procurement Pipeline Dashboard */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h4 className="text-sm font-bold uppercase text-foreground mb-4">Procurement Pipeline</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <button onClick={() => setActiveTab('requests')} className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5"><ClipboardList className="w-3 h-3" /> Material Req</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.materialRequests.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Requests</p>
          </button>
          
          <button onClick={() => setActiveTab('requisitions')} className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5"><ShoppingCart className="w-3 h-3" /> Purchase Req</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.purchaseRequisitions.filter(pr => pr.status === 'approved').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Waiting RFQ</p>
          </button>
          
          <button onClick={() => setActiveTab('rfq')} className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5"><UsersRound className="w-3 h-3" /> RFQs</p>
            <div className="flex gap-4 mt-1">
              <div>
                <p className="text-xl font-bold text-foreground">{data.rfqs.filter(r => r.status === 'draft').length}</p>
                <p className="text-[10px] text-muted-foreground">Draft</p>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{data.rfqs.filter(r => r.status === 'submitted').length}</p>
                <p className="text-[10px] text-muted-foreground">Sent</p>
              </div>
            </div>
          </button>

          <button onClick={() => setActiveTab('rfq')} className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5"><FileText className="w-3 h-3" /> Quotations</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.quotations.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Received</p>
          </button>

          <button onClick={() => setActiveTab('rfq')} className="text-left rounded-lg border border-emerald-500/30 bg-emerald-50/20 p-3 hover:bg-emerald-50/40 transition-colors">
            <p className="text-[10px] font-bold uppercase text-emerald-800 flex items-center gap-1.5"><BadgeCheck className="w-3 h-3" /> Selections</p>
            <div className="flex gap-4 mt-1">
              <div>
                <p className="text-xl font-bold text-emerald-700">{data.vendorSelections.filter(s => s.status === 'pending_approval').length}</p>
                <p className="text-[10px] text-emerald-800/70">Need Approval</p>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-700">{data.vendorSelections.filter(s => s.status === 'approved' && !data.purchaseOrders.some(po => po.vendor_selection_id === s.id)).length}</p>
                <p className="text-[10px] text-emerald-800/70">Ready for PO</p>
              </div>
            </div>
          </button>

          <button onClick={() => setActiveTab('orders')} className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5"><Truck className="w-3 h-3" /> Purchase Orders</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.purchaseOrders.filter(po => po.status === 'issued').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Active</p>
          </button>
        </div>
      </div>


      <div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'requests' && (
        <Panel title="Material Requests" icon={ClipboardList}>
          <MaterialRequestWorkQueue
            materialRequests={data.materialRequests}
            purchaseRequisitions={data.purchaseRequisitions}
            inventorySnapshots={data.inventorySnapshots}
            projectOptions={projectOptions}
            activeRole={activeRole as 'UPPER_MANAGEMENT' | 'PR_TEAM' | 'PROJECT_MANAGER'}
            loading={loading}
            onConvertToPr={openPrModal}
            onRefresh={refresh}
            onMessage={(msg) => setMessage(msg)}
            onError={(msg) => setError(msg)}
          />
        </Panel>
      )}

      {activeTab === 'requisitions' && (
        <Panel title="Purchase Requisitions" icon={ShoppingCart}>
          <PurchaseRequisitionWorkspace
            rows={data.purchaseRequisitions}
            attachments={data.prAttachments || []}
            materialRequests={data.materialRequests}
            rfqs={data.rfqs}
            quotations={data.quotations}
            selections={data.vendorSelections}
            projectOptions={projectOptions}
            activeRole={activeRole as 'UPPER_MANAGEMENT' | 'PROJECT_MANAGER' | 'PR_TEAM'}
            selectedPrId={selectedPrId}
            onSelectPr={setSelectedPrId}
            onAssign={(row) => runAction('Purchase requisition assigned.', () => assignPrToCurrentUser(row))}
            onApprove={(row) => runAction('Purchase requisition approved.', () => approvePurchaseRequisition(row))}
            onRfq={openRfqModal}
            onPdf={(row) => void handlePrPdf(row)}
            onOpenPdf={(row) => void handleOpenPrPdf(row)}
            onGeneratePo={handleGeneratePoFromPr}
            onRefresh={refresh}
            onMessage={(msg) => setMessage(msg)}
            onError={(msg) => setError(msg)}
          />
        </Panel>
      )}

      {activeTab === 'rfq' && (
        <Panel title="RFQ, Quotations, and Vendor Finalization" icon={UsersRound}>
          <RFQWorkspace
            prs={data.purchaseRequisitions}
            rfqs={data.rfqs}
            quotations={data.quotations}
            selections={data.vendorSelections}
            purchaseOrders={data.purchaseOrders}
            projectOptions={projectOptions}
            activeRole={activeRole}
            selectedRfqId={selectedRfqId}
            onSelectRfq={setSelectedRfqId}
            onCreateRfq={openRfqModal}
            onRecordQuote={openQuotationModal}
            onRecommend={openRecommendationModal}
            onApproveSelection={(selection) => runAction('Vendor finalization approved by management.', () => approveVendorSelection({ selectionId: selection.id }))}
            onGeneratePo={(pr, quotation, selection) => openPoModal(pr, quotation, selection.id)}
          />
        </Panel>
      )}

      {activeTab === 'orders' && (
        <Panel title="Purchase Order Management" icon={ShoppingCart}>
          <POWorkspace
            purchaseOrders={data.purchaseOrders}
            activeRole={activeRole as 'UPPER_MANAGEMENT' | 'PROJECT_MANAGER' | 'PR_TEAM'}
            onSavePo={(poData) => runAction('Purchase Order details and status updated.', () => updateFullPurchaseOrder(poData))}
            onApprove={(po) => runAction(`Purchase Order ${po.po_number} approved and sent to vendor.`, async () => {
              const approved = await approvePurchaseOrder(po);
              if (approved.error) return approved;
              return sendPurchaseOrderToVendor(po);
            })}
            onPrintPo={(po) => { void (po.pdf_storage_path ? handleOpenPoPdf(po) : handlePoPdf(po)); }}
            onRefresh={refresh}
          />
        </Panel>
      )}

      {activeTab === 'grn' && (
        <Panel title="Goods Receipt Notes & Site Gate Arrivals" icon={Truck}>
          <GrnWorkspace
            grns={data.grns}
            activeRole={activeRole as 'UPPER_MANAGEMENT' | 'PROJECT_MANAGER' | 'PR_TEAM'}
            onApproveGrn={(grnId) => {
              const grn = data.grns.find((g) => g.id === grnId);
              if (!grn) return;
              void (async () => {
                setError(null);
                setMessage(null);
                // Step 1 (required): post the GRN to inventory — direct status update, always available.
                const posted = await postGrnToInventory({ grnId });
                if (posted.error) { setError(posted.error.message); return; }
                // Step 2 (best-effort): auto-generate the vendor bill. This uses the
                // submit_vendor_bill_from_grn pipeline RPC + vendor_bills table which are
                // provisioned by the reconciliation migration; until then, degrade gracefully.
                const bill = await createVendorBillFromGrn(grn);
                setMessage(
                  bill.error
                    ? `GRN ${grn.grn_number} approved and posted to inventory. (Vendor bill auto-generation is pending the pipeline RPC/migration.)`
                    : `GRN ${grn.grn_number} approved — inventory updated and vendor bill generated.`,
                );
                await refresh();
              })();
            }}
            onRefresh={refresh}
          />
        </Panel>
      )}

      {activeTab === 'billing' && (
        <Panel title="Vendor Bills & 3-Way Matching" icon={ReceiptIndianRupee}>
          <BillsWorkspace
            bills={data.vendorBills}
            activeRole={activeRole as 'UPPER_MANAGEMENT' | 'PROJECT_MANAGER' | 'PR_TEAM'}
            onRefresh={refresh}
          />
        </Panel>
      )}

      {prModalOpen && selectedMrForPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl overflow-hidden space-y-4">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground font-heading flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" /> Generate Purchase Requisition
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Creating formal PR for approved items from {selectedMrForPr.mr_number}</p>
              </div>
              <button onClick={() => setPrModalOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Important Context Header Box */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-primary tracking-wider block">Source Request</span>
                  <span className="font-mono font-bold text-foreground text-sm">{selectedMrForPr.mr_number}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">Project Location</span>
                  <span className="font-semibold text-foreground">{selectedMrForPr.projects?.name ?? 'Main Site'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">Target Delivery</span>
                  <span className="font-semibold text-foreground">{selectedMrForPr.required_date}</span>
                </div>
              </div>
              
              {selectedMrForPr.justification && (
                <p className="text-muted-foreground italic border-t border-primary/10 pt-2 text-[11px]">
                  "{selectedMrForPr.justification}"
                </p>
              )}
            </div>

            <form onSubmit={handleGeneratePrSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">PR Title / Subject *</label>
                  <input
                    value={prTitle}
                    onChange={e => setPrTitle(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
                    required
                  />
                </div>
                
                <div>
                  <label className="block font-bold text-muted-foreground mb-1">Required On Site Date *</label>
                  <input
                    type="date"
                    value={prRequiredDate}
                    onChange={e => setPrRequiredDate(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              {/* Items Selected for PR Approval Table */}
              <div className="space-y-1.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Items Selected for PR Generation ({prLines.length})
                </span>
                
                <div className="rounded-xl border border-border overflow-hidden bg-background">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b border-border">
                      <tr>
                        <th className="px-3.5 py-2.5">Item Description</th>
                        <th className="px-3 py-2.5 text-right w-24">Qty</th>
                        <th className="px-3 py-2.5 text-right w-32">Est Rate (INR)</th>
                        <th className="px-3 py-2.5 text-right w-36 font-bold text-foreground">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/80">
                      {prLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3.5 py-2.5 font-bold text-foreground">
                            {line.item_description}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-primary">
                            {line.quantity}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-muted-foreground">
                            ₹{line.estimated_rate.toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-foreground">
                            {formatCurrency(line.quantity * line.estimated_rate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Summary & Simple Actions Footer */}
              <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
                <div className="font-medium text-muted-foreground">
                  Total Est. PR Cost: <span className="font-bold text-primary text-sm ml-1">{formatCurrency(prLines.reduce((sum, l) => sum + l.quantity * l.estimated_rate, 0))}</span>
                </div>

                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setPrModalOpen(false)}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve & Generate PR
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {rfqModalOpen && selectedPrForRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Create RFQ & Select Vendors</h3>
              <button onClick={() => setRfqModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Select vendors to invite to quote for <strong>{selectedPrForRfq.pr_number}</strong>: {selectedPrForRfq.title}
            </p>

            <div className="max-h-[300px] overflow-y-auto rounded-md border border-border mb-4">
              {data.vendors.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No vendors available.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-semibold w-10"></th>
                      <th className="px-4 py-2 font-semibold">Vendor Name</th>
                      <th className="px-4 py-2 font-semibold">Rating</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vendors.map(vendor => (
                      <tr key={vendor.id} className="border-t border-border hover:bg-muted/50 cursor-pointer" onClick={() => {
                        setSelectedVendorsForRfq(prev => 
                          prev.includes(vendor.id) ? prev.filter(id => id !== vendor.id) : [...prev, vendor.id]
                        )
                      }}>
                        <td className="px-4 py-2">
                          <input type="checkbox" checked={selectedVendorsForRfq.includes(vendor.id)} readOnly className="rounded border-border text-primary" />
                        </td>
                        <td className="px-4 py-2 font-medium">{vendor.display_name || vendor.legal_name}</td>
                        <td className="px-4 py-2">{vendor.rating} / 5</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={vendor.compliance_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border">
              <span className="text-sm font-semibold">{selectedVendorsForRfq.length} vendor(s) selected</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRfqModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                <button type="button" onClick={handleCreateRfqSubmit} disabled={selectedVendorsForRfq.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">Create RFQ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {quoteModalOpen && selectedRfqForQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-xl font-bold text-foreground">Record Vendor Quotation</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  RFQ {selectedRfqForQuote.rfq_number} - {selectedRfqForQuote.title}
                </p>
              </div>
              <button type="button" onClick={() => setQuoteModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordQuoteSubmit} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Vendor</label>
                  <select
                    value={selectedVendorForQuote}
                    onChange={(event) => setSelectedVendorForQuote(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                    required
                  >
                    <option value="">Select vendor</option>
                    {selectedRfqForQuote.rfq_vendors?.map((rfqVendor) => (
                      <option key={rfqVendor.id} value={rfqVendor.vendor_id}>
                        {rfqVendor.vendors?.display_name || rfqVendor.vendors?.legal_name || 'Vendor'} ({statusLabel(rfqVendor.response_status)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Quote No.</label>
                  <input value={quoteNumber} onChange={(event) => setQuoteNumber(event.target.value)} placeholder="Auto if blank" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Quote Date</label>
                  <input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" required />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Lead Time</label>
                  <input type="number" min="0" value={quoteLeadTimeDays} onChange={(event) => setQuoteLeadTimeDays(Number(event.target.value) || 0)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Payment Terms</label>
                  <input value={quotePaymentTerms} onChange={(event) => setQuotePaymentTerms(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">GST Details</label>
                  <input value={quoteGstDetails} onChange={(event) => setQuoteGstDetails(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Attachment Path</label>
                  <input value={quoteStoragePath} onChange={(event) => setQuoteStoragePath(event.target.value)} placeholder="Optional storage path" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Delivery Terms</label>
                <textarea value={quoteDeliveryTerms} onChange={(event) => setQuoteDeliveryTerms(event.target.value)} className="min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Quotation Lines</label>
                  <button type="button" onClick={handleAddQuoteLine} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-muted">
                    <Plus className="h-3.5 w-3.5" />
                    Add Line
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-bold uppercase">Item</th>
                        <th className="w-24 px-3 py-2 text-right font-bold uppercase">Qty</th>
                        <th className="w-32 px-3 py-2 text-right font-bold uppercase">Rate</th>
                        <th className="w-28 px-3 py-2 text-right font-bold uppercase">GST</th>
                        <th className="w-36 px-3 py-2 text-right font-bold uppercase">Line Total</th>
                        <th className="w-12 px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {quoteLines.map((line, index) => {
                        const lineBase = Number(line.quantity || 0) * Number(line.unit_rate || 0);
                        const lineTotal = lineBase + lineBase * (Number(line.tax_rate || 0) / 100);
                        return (
                          <tr key={index} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <input value={line.item_description} onChange={(event) => handleQuoteLineChange(index, 'item_description', event.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 outline-none focus:border-primary" required />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => handleQuoteLineChange(index, 'quantity', event.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-right font-semibold outline-none focus:border-primary" required />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min="0" step="0.01" value={line.unit_rate} onChange={(event) => handleQuoteLineChange(index, 'unit_rate', event.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-right font-semibold outline-none focus:border-primary" required />
                            </td>
                            <td className="px-3 py-2">
                              <select value={line.tax_rate} onChange={(event) => handleQuoteLineChange(index, 'tax_rate', event.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-right font-semibold outline-none focus:border-primary">
                                <option value="0">0%</option>
                                <option value="5">5%</option>
                                <option value="12">12%</option>
                                <option value="18">18%</option>
                                <option value="28">28%</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-foreground">{formatCurrency(lineTotal)}</td>
                            <td className="px-3 py-2 text-center">
                              <button type="button" onClick={() => handleRemoveQuoteLine(index)} disabled={quoteLines.length === 1} className="text-rose-500 hover:text-rose-600 disabled:opacity-40">
                                <X className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-semibold text-muted-foreground">Quote Total: </span>
                  <span className="font-bold text-primary">
                    {formatCurrency(quoteLines.reduce((sum, line) => {
                      const base = Number(line.quantity || 0) * Number(line.unit_rate || 0);
                      return sum + base + base * (Number(line.tax_rate || 0) / 100);
                    }, 0))}
                  </span>
                </div>
                <div className="flex justify-end gap-2 items-center">
                  <input type="file" multiple onChange={(e) => setQuoteAttachments(Array.from(e.target.files || []))} className="text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                  <button type="button" onClick={() => setQuoteModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Record Quotation</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {recommendModalOpen && selectedQuotationForRecommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-xl font-bold text-foreground">Recommend Vendor</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedQuotationForRecommendation.vendors?.display_name || selectedQuotationForRecommendation.vendors?.legal_name || 'Vendor'} - {formatCurrency(selectedQuotationForRecommendation.total_amount)}
                </p>
              </div>
              <button type="button" onClick={() => setRecommendModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRecommendVendorSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-muted-foreground">Finalisation Remarks</label>
                <textarea value={recommendationReason} onChange={(event) => setRecommendationReason(event.target.value)} className="min-h-[130px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" required />
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setRecommendModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Submit Recommendation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {poModalOpen && selectedPrForPo && selectedQuotationForPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[95vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div>
                <h3 className="text-xl font-bold text-foreground">Configure & Generate Purchase Order</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Creating PO for {selectedPrForPo.pr_number} • Vendor: {selectedQuotationForPo.vendors?.display_name || selectedQuotationForPo.vendors?.legal_name || 'Vendor'}</p>
              </div>
              <button onClick={() => setPoModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleGeneratePoSubmit} className="space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Side fields */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Delivery Location</label>
                    <input 
                      type="text" 
                      value={poDeliveryLocation} 
                      onChange={e => setPoDeliveryLocation(e.target.value)} 
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" 
                      required 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Delivery Date</label>
                      <input 
                        type="date" 
                        value={poDeliveryDate} 
                        onChange={e => setPoDeliveryDate(e.target.value)} 
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" 
                        required 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Payment Terms</label>
                      <input 
                        type="text" 
                        value={poPaymentTerms} 
                        onChange={e => setPoPaymentTerms(e.target.value)} 
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" 
                        required 
                      />
                    </div>
                  </div>
                </div>

                {/* Right Side fields */}
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Terms and Conditions</label>
                  <textarea 
                    value={poTermsAndConditions} 
                    onChange={e => setPoTermsAndConditions(e.target.value)} 
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[120px] outline-none focus:border-primary font-mono text-[11px]" 
                    required
                  />
                </div>
              </div>

              {/* Line items section */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-muted-foreground">Line Item Pricing & Taxes</label>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase font-bold">
                      <tr>
                        <th className="px-3 py-2">Item Description</th>
                        <th className="px-3 py-2 text-right w-20">Qty</th>
                        <th className="px-3 py-2 text-right w-28">Unit Rate (INR)</th>
                        <th className="px-3 py-2 text-right w-28">Tax Rate</th>
                        <th className="px-3 py-2 text-right w-32">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {poLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{line.item_description}</td>
                          <td className="px-3 py-2 text-right font-medium">{line.quantity}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              value={line.unit_rate}
                              min="0"
                              step="0.01"
                              onChange={(e) => handlePoLineChange(idx, 'unit_rate', e.target.value)}
                              className="w-full text-right rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary font-semibold"
                              required
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            <select
                              value={line.tax_rate}
                              onChange={(e) => handlePoLineChange(idx, 'tax_rate', e.target.value)}
                              className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary font-medium"
                            >
                              <option value="0">0% GST</option>
                              <option value="5">5% GST</option>
                              <option value="12">12% GST</option>
                              <option value="18">18% GST</option>
                              <option value="28">28% GST</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-foreground">
                            {formatCurrency(line.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic cost summary & actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end border-t border-border pt-4">
                <div className="rounded-lg bg-muted/40 p-3 border border-border">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-medium">Subtotal Amount:</span>
                      <span className="font-semibold text-foreground">{formatCurrency(poLines.reduce((sum, l) => sum + l.line_total, 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground font-medium">Tax Amount:</span>
                      <span className="font-semibold text-foreground">{formatCurrency(poLines.reduce((sum, l) => sum + (l.line_total * (l.tax_rate / 100)), 0))}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1.5 text-xs font-bold">
                      <span className="text-foreground">Total PO Amount:</span>
                      <span className="text-primary font-bold">{formatCurrency(
                        poLines.reduce((sum, l) => sum + l.line_total, 0) + 
                        poLines.reduce((sum, l) => sum + (l.line_total * (l.tax_rate / 100)), 0)
                      )}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mb-1">
                  <button type="button" onClick={() => setPoModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors">
                    Generate Purchase Order
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {grnModalOpen && selectedPoForGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[95vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div>
                <h3 className="text-xl font-bold text-foreground">Create Goods Receipt Note (GRN)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Receiving material for PO {selectedPoForGrn.po_number}</p>
              </div>
              <button onClick={() => setGrnModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleGrnSubmit} className="space-y-5 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Receipt Date</label>
                  <input type="date" value={grnReceiptDate} onChange={e => setGrnReceiptDate(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" required />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Challan Number</label>
                  <input type="text" value={grnChallanNumber} onChange={e => setGrnChallanNumber(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Vehicle Number</label>
                  <input type="text" value={grnVehicleNumber} onChange={e => setGrnVehicleNumber(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-2">Quality Check Decision</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="quality" value="accepted" checked={grnQualityDecision === 'accepted'} onChange={e => setGrnQualityDecision(e.target.value)} className="text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-700">Fully Accepted</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="quality" value="partially_accepted" checked={grnQualityDecision === 'partially_accepted'} onChange={e => setGrnQualityDecision(e.target.value)} className="text-amber-600" />
                    <span className="text-sm font-bold text-amber-700">Partially Accepted</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="quality" value="rejected" checked={grnQualityDecision === 'rejected'} onChange={e => setGrnQualityDecision(e.target.value)} className="text-red-600" />
                    <span className="text-sm font-bold text-red-700">Rejected</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-muted-foreground">Received Items</label>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase font-bold">
                      <tr>
                        <th className="px-3 py-2">Item Description</th>
                        <th className="px-3 py-2 text-right w-20">Ordered</th>
                        <th className="px-3 py-2 text-right w-24">Accepted</th>
                        <th className="px-3 py-2 text-right w-24">Rejected</th>
                        <th className="px-3 py-2 text-right w-24">Total Recv</th>
                        <th className="px-3 py-2 w-32">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {grnLines.map((line, idx) => {
                        const poLine = selectedPoForGrn.purchase_order_lines?.find(l => l.item_id === line.item_id);
                        return (
                          <tr key={idx} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{poLine?.item_description || 'Unknown'}</td>
                            <td className="px-3 py-2 text-right font-medium">{line.ordered_qty}</td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" min="0" value={line.accepted_qty} onChange={(e) => handleGrnLineChange(idx, 'accepted_qty', e.target.value)} className="w-full text-right rounded border border-border bg-emerald-50 text-emerald-900 px-1.5 py-1 text-xs outline-none focus:border-emerald-500 font-bold" required />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" min="0" value={line.rejected_qty} onChange={(e) => handleGrnLineChange(idx, 'rejected_qty', e.target.value)} className="w-full text-right rounded border border-border bg-red-50 text-red-900 px-1.5 py-1 text-xs outline-none focus:border-red-500 font-bold" required />
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-foreground">
                              {line.received_qty}
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={line.remarks} onChange={(e) => handleGrnLineChange(idx, 'remarks', e.target.value)} placeholder="Condition, etc." className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-border pt-4">
                <input type="file" multiple onChange={(e) => setGrnAttachments(Array.from(e.target.files || []))} className="text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setGrnModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors">
                    Save GRN
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function MaterialRequestList({
  rows,
  snapshots = [],
  onReview,
  onIssue,
  onConvert,
}: {
  rows: MaterialRequestRow[];
  snapshots?: InventorySnapshotRow[];
  onReview: (row: MaterialRequestRow) => void;
  onIssue: (row: MaterialRequestRow) => void;
  onConvert: (row: MaterialRequestRow) => void;
}) {
  if (rows.length === 0) return <EmptyState message="No material requests found." />;

  function getStockForDescription(description: string) {
    const match = snapshots.find(snap => 
      snap.item_master?.name.toLowerCase().trim() === description.toLowerCase().trim()
    );
    return match ? Number(match.available_qty || 0) : 0;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 xl:grid-cols-[1fr_auto_auto_auto_auto] xl:items-center">
          <div>
            <p className="font-bold text-foreground">{row.mr_number}</p>
            <p className="text-sm text-muted-foreground">{row.justification || 'Material requirement'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {row.material_request_lines?.map((line) => {
                const stock = getStockForDescription(line.item_description);
                const isSufficient = stock >= line.quantity;
                return (
                  <span key={line.id} className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 text-xs text-foreground font-medium">
                    {line.item_description} x {line.quantity}
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isSufficient ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                      Stock: {stock}
                    </span>
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Raised by {row.profiles?.name || row.profiles?.email || 'site team'} for {row.required_date}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              Inventory Check: 
              <span className={`capitalize font-bold ${row.stock_decision === 'available' ? 'text-emerald-500' : row.stock_decision === 'purchase_required' ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {statusLabel(row.stock_decision)}
              </span>
            </p>
          </div>
          <StatusBadge status={row.status} />
          <button type="button" onClick={() => onReview(row)} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
            Check Stock
          </button>
          <button type="button" onClick={() => onIssue(row)} disabled={row.stock_decision !== 'available'} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
            Issue Stock
          </button>
          <button type="button" onClick={() => onConvert(row)} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
            Convert to PR
          </button>
        </div>
      ))}
    </div>
  );
}

function PurchaseOrderList({
  rows,
  prs,
  selections,
  grns,
  bills,
  onTrack,
  onPdf,
  onOpenPdf,
  onApprove,
  onGrn,
  canApprove,
}: {
  rows: PurchaseOrderRow[];
  prs: PurchaseRequisitionRow[];
  selections: ProcurementDashboardData['vendorSelections'];
  grns: ProcurementDashboardData['grns'];
  bills: VendorBillRow[];
  onTrack: (row: PurchaseOrderRow) => void;
  onPdf: (row: PurchaseOrderRow) => void;
  onOpenPdf: (row: PurchaseOrderRow) => void;
  onApprove: (row: PurchaseOrderRow) => void;
  onGrn: (row: PurchaseOrderRow) => void;
  canApprove: boolean;
}) {
  if (rows.length === 0) return <EmptyState message="No purchase orders found." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const pr = prs.find((candidate) => candidate.id === row.purchase_requisition_id);
        const selection = selections.find((candidate) => candidate.id === row.vendor_selection_id || candidate.purchase_requisition_id === row.purchase_requisition_id);
        const grn = grns.find((candidate) => candidate.purchase_order_id === row.id);
        const bill = bills.find((candidate) => candidate.purchase_order_id === row.id);
        const pdfReady = Boolean(row.pdf_storage_path);

        return (
          <article key={row.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-foreground">{row.po_number}</p>
                  <StatusBadge status={row.status} />
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${pdfReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {pdfReady ? <CheckCircle2 className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    {pdfReady ? 'PDF ready' : 'PDF pending'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{row.vendors?.display_name || row.vendors?.legal_name || 'Vendor'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PR {pr?.pr_number || 'not linked'} - Vendor selection {selection?.status ? statusLabel(selection.status) : 'pending'} - Delivery {row.delivery_date || 'not scheduled'}
                </p>
                <p className="mt-2 text-sm font-bold text-primary">{formatCurrency(row.total_amount)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onPdf(row)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                  <FileDown className="h-4 w-4" />
                  {pdfReady ? 'Regenerate PDF' : 'Generate PDF'}
                </button>
                <button type="button" onClick={() => onOpenPdf(row)} disabled={!pdfReady} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
                <button type="button" onClick={() => onOpenPdf(row)} disabled={!pdfReady} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-xs md:grid-cols-4">
              <ReviewTile label="Lines" value={`${row.purchase_order_lines?.length || 0} item(s)`} />
              <ReviewTile label="GRN" value={grn?.grn_number || 'Pending'} />
              <ReviewTile label="Bill" value={bill?.bill_number || 'Pending'} />
              <ReviewTile label="Vendor GST" value={row.vendors?.gst_number || 'Not recorded'} />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => onTrack(row)} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                Track Delivery
              </button>
              <button type="button" onClick={() => onApprove(row)} disabled={!canApprove || row.status === 'sent_to_vendor' || row.status === 'delivered'} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                Approve/Send
              </button>
              <button type="button" onClick={() => onGrn(row)} disabled={row.status !== 'approved' && row.status !== 'sent_to_vendor' && row.status !== 'acknowledged'} className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
                Create GRN
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold text-foreground">{value}</p>
    </div>
  );
}

function GrnList({ rows, onBill }: { rows: ProcurementDashboardData['grns']; onBill: (row: ProcurementDashboardData['grns'][number]) => void }) {
  if (rows.length === 0) return <EmptyState message="No GRNs found." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-foreground">{row.grn_number}</p>
              <p className="text-sm text-muted-foreground">Receipt date: {row.receipt_date}</p>
            </div>
            <StatusBadge status={row.status} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {row.goods_receipt_note_lines?.length || 0} accepted line item(s), quality decision {statusLabel(row.quality_decision)}.
          </p>
          <button type="button" onClick={() => onBill(row)} disabled={row.status !== 'posted'} className="mt-3 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
            Create Vendor Bill
          </button>
        </div>
      ))}
    </div>
  );
}

function VendorBillList({ rows }: { rows: VendorBillRow[] }) {
  if (rows.length === 0) return <EmptyState message="No vendor bills created from GRNs yet." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const match = row.three_way_matches?.[0];
        return (
          <div key={row.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-foreground">{row.bill_number}</p>
                <p className="text-sm text-muted-foreground">{row.vendors?.display_name || row.vendors?.legal_name || 'Vendor'}</p>
                <p className="mt-1 text-xs font-semibold text-primary">{formatCurrency(row.total_amount)}</p>
              </div>
              <StatusBadge status={row.status} />
            </div>
            <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
              <span className="rounded-md bg-muted p-2">PO: {row.purchase_order_id ? 'Linked' : 'Missing'}</span>
              <span className="rounded-md bg-muted p-2">GRN: {row.grn_id ? 'Linked' : 'Missing'}</span>
              <span className="rounded-md bg-muted p-2">Match: {statusLabel(match?.match_status)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InventoryList({ rows }: { rows: ProcurementDashboardData['inventorySnapshots'] }) {
  if (rows.length === 0) return <EmptyState message="No inventory balances found." />;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border p-3">
          <p className="font-bold text-foreground">{row.item_master?.name || 'Stock item'}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <span className="rounded-md bg-muted p-2">Available: {row.available_qty}</span>
            <span className="rounded-md bg-muted p-2">Reserved: {row.reserved_qty}</span>
            <span className="rounded-md bg-muted p-2">Consumed: {row.consumed_qty}</span>
            <span className="rounded-md bg-muted p-2">Value: {formatCurrency(row.stock_value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
