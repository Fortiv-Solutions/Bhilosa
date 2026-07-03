'use client';

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
  approvePurchaseOrder,
  rejectPurchaseOrder,
  sendPurchaseOrderToVendor,
  acknowledgePurchaseOrder,
  type MaterialRequestRow,
  type ProcurementDashboardData,
  type ProcurementProjectOption,
  type PurchaseOrderRow,
  type PurchaseRequisitionRow,
  type QuotationRow,
  type GeneratePurchaseOrderInput,
  type RfqRow,
  type VendorBillRow,
  type EntityAttachmentRow,
  type InventorySnapshotRow,
} from '@/lib/procurement';
import { formatCurrency, statusLabel, StatusBadge, EmptyState, Panel } from '@/components/procurement/shared';
import { PurchaseRequisitionWorkbench } from '@/components/procurement/purchase-requisition-workbench';
import { RfqWorkbench } from '@/components/procurement/rfq-workbench';
import MaterialRequestWorkQueue from '@/components/procurement/material-request-work-queue';
import { PurchaseOrderWorkbench } from '@/components/procurement/purchase-order-workbench';
import { DeliveryTrackingWorkbench } from '@/components/procurement/delivery-tracking-workbench';
import { GrnWorkbench } from '@/components/procurement/grn-workbench';
import { InventoryWorkbench } from '@/components/procurement/inventory-workbench';
import { useAppStore } from '@/store/use-app-store';

type TabId = 'requests' | 'requisitions' | 'rfq' | 'orders' | 'grn' | 'billing' | 'inventory';

const tabs: { id: TabId; label: string; icon: typeof ClipboardList }[] = [
  { id: 'requests', label: 'MR', icon: ClipboardList },
  { id: 'requisitions', label: 'PR', icon: ShoppingCart },
  { id: 'rfq', label: 'RFQ', icon: UsersRound },
  { id: 'orders', label: 'PO', icon: Truck },
  { id: 'grn', label: 'GRN', icon: PackageCheck },
  { id: 'billing', label: 'Bills', icon: ReceiptIndianRupee },
  { id: 'inventory', label: 'Inventory', icon: Warehouse },
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
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || projects[0]?.id || '');
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
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      setData(await listProcurementDashboard(selectedProjectId === 'all' ? undefined : selectedProjectId));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load procurement data.');
    } finally {
      setLoading(false);
    }
  }, [liveMode, selectedProjectId]);

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

  function openPrModal(mr: MaterialRequestRow) {
    const lines = mr.material_request_lines || [];
    const initialLines = lines.map(line => ({
      item_description: line.item_description,
      quantity: Number(line.quantity || 0),
      estimated_rate: Number(line.estimated_rate || 0),
      item_id: line.item_id || null,
    }));
    setPrLines(initialLines);
    const estimatedCost = initialLines.reduce((sum, line) => sum + line.quantity * line.estimated_rate, 0);
    setSelectedMrForPr(mr);
    setPrTitle(mr.justification || mr.mr_number);
    setPrRequiredDate(mr.required_date);
    setPrFinanceRequired(estimatedCost >= 500000);
    setPrApprovalStage(estimatedCost >= 500000 ? 'upper_management' : 'pr_team');
    setPrRemarks('');
    setPrModalOpen(true);
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

  function openPoModal(pr: PurchaseRequisitionRow, quotation: QuotationRow, vendorSelectionId?: string | null) {
    const selection = vendorSelectionId
      ? data.vendorSelections.find((candidate) => candidate.id === vendorSelectionId)
      : getSelectionForPr(pr.id);
    if (!selection || selection.status !== 'approved') {
      setError('PO can be generated only after upper management approves vendor finalization.');
      return;
    }
    setSelectedPrForPo(pr);
    setSelectedQuotationForPo(quotation);
    setSelectedVendorSelectionIdForPo(selection.id);
    setPoDeliveryLocation('Project site store');
    setPoDeliveryDate(pr.required_date || new Date().toISOString().split('T')[0]);
    setPoPaymentTerms(quotation.payment_terms || '30 days from accepted GRN');
    
    const lines = pr.purchase_requisition_lines || [];
    const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    const perLineRate = totalQty > 0 ? quotation.total_amount / totalQty : 0;
    
    const initialLines = lines.map((line) => {
      const quoteLine = quotation.quotation_lines?.find(
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
    if (!selectedPrForPo || !selectedQuotationForPo || !selectedVendorSelectionIdForPo) return;
    
    const payload: GeneratePurchaseOrderInput = {
      purchaseRequisitionId: selectedPrForPo.id,
      vendorId: selectedQuotationForPo.vendor_id,
      vendorSelectionId: selectedVendorSelectionIdForPo,
      deliveryLocation: poDeliveryLocation,
      deliveryDate: poDeliveryDate,
      paymentTerms: poPaymentTerms,
      termsAndConditions: poTermsAndConditions,
      lines: poLines,
    };
    
    await runAction('Purchase order generated with details.', () => generatePurchaseOrder(payload));
    setPoModalOpen(false);
  }

  function handleGeneratePoFromPr(pr: PurchaseRequisitionRow) {
    const selection = data.vendorSelections.find(vs => vs.purchase_requisition_id === pr.id);
    if (!selection || selection.status !== 'approved') {
      setError('No management-approved vendor selection found for this purchase requisition.');
      return;
    }
    const quotation = selection.vendor_quotations || data.quotations.find(q => q.id === selection.selected_quotation_id);
    if (!quotation) {
      setError('Quotation details not found for the finalized vendor selection.');
      return;
    }
    openPoModal(pr, quotation, selection.id);
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
            disabled={!liveMode || loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {!liveMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Supabase is not configured. Procurement requires live database workflow tables before records can be viewed or mutated.
        </div>
      )}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      
      {/* Procurement Pipeline Dashboard */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h4 className="text-sm font-bold uppercase text-foreground mb-4">Procurement Pipeline</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <button onClick={() => setActiveTab('requests')} className="text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5"><ClipboardList className="w-3 h-3" /> Material Req</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{data.materialRequests.filter(m => m.status === 'approved' || m.status === 'in_review').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Pending PR</p>
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
                <p className="text-xl font-bold text-foreground">{data.rfqs.filter(r => r.status === 'submitted' /* or whatever means sent for RFQ */).length}</p>
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
          {liveMode ? (
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
          ) : (
            <EmptyState message="Configure Supabase to load and manage live material requests." />
          )}
        </Panel>
      )}

      {activeTab === 'requisitions' && (
        <Panel title="Purchase Requisitions" icon={ShoppingCart}>
          <PurchaseRequisitionWorkbench
            rows={data.purchaseRequisitions}
            attachments={data.prAttachments || []}
            materialRequests={data.materialRequests}
            rfqs={data.rfqs}
            quotations={data.quotations}
            selections={data.vendorSelections}
            selectedPrId={selectedPrId}
            onSelectPr={setSelectedPrId}
            onAssign={(row) => runAction('Purchase requisition assigned.', () => assignPrToCurrentUser(row))}
            onApprove={(row) => runAction('Purchase requisition approved.', () => approvePurchaseRequisition(row))}
            onRfq={openRfqModal}
            onPdf={(row) => void handlePrPdf(row)}
            onOpenPdf={(row) => void handleOpenPrPdf(row)}
            onGeneratePo={handleGeneratePoFromPr}
          />
        </Panel>
      )}

      {activeTab === 'rfq' && (
        <Panel title="RFQ, Quotations, and Vendor Finalization" icon={UsersRound}>
          <RfqWorkbench
            rfqs={data.rfqs}
            prs={data.purchaseRequisitions}
            quotations={data.quotations}
            selections={data.vendorSelections}
            purchaseOrders={data.purchaseOrders}
            selectedRfqId={selectedRfqId}
            onSelectRfq={setSelectedRfqId}
            onRecordQuote={openQuotationModal}
            onRecommend={openRecommendationModal}
            onApproveSelection={(selection) => runAction('Vendor finalization approved by management.', () => approveVendorSelection({ selectionId: selection.id }))}
            onGeneratePo={(pr, quotation, selection) => openPoModal(pr, quotation, selection.id)}
            canApprove={activeRole === 'UPPER_MANAGEMENT'}
          />
        </Panel>
      )}

      {activeTab === 'orders' && (
        <Panel title="Purchase Orders" icon={ShoppingCart}>
          <PurchaseOrderWorkbench
            purchaseOrders={data.purchaseOrders}
            prs={data.purchaseRequisitions}
            selections={data.vendorSelections}
            selectedPoId={selectedPoId}
            onSelectPo={setSelectedPoId}
            onApprovePo={(po) => runAction('PO approved.', () => approvePurchaseOrder(po))}
            onRejectPo={(po, reason) => runAction('PO rejected.', () => rejectPurchaseOrder(po, reason))}
            onSendPo={(po) => runAction('PO sent to vendor.', () => sendPurchaseOrderToVendor(po))}
            onAcknowledgePo={(po) => runAction('PO acknowledged.', () => acknowledgePurchaseOrder(po))}
            onPdf={(po) => void handlePoPdf(po)}
            onOpenPdf={(po) => void handleOpenPoPdf(po)}
            onTrackDelivery={(po) => runAction('Started delivery tracking.', () => trackDelivery(po))}
            canApprove={activeRole === 'UPPER_MANAGEMENT'}
          />
        </Panel>
      )}

      {activeTab === 'grn' && (
        <Panel title="Delivery Tracking" icon={Truck}>
          <DeliveryTrackingWorkbench
            purchaseOrders={data.purchaseOrders}
            deliveryTrackings={data.deliveryTrackings}
            selectedPoId={selectedDeliveryPoId}
            onSelectPo={setSelectedDeliveryPoId}
            onUpdateStatus={(id, status, reason, vehicle) => runAction('Delivery status updated.', () => updateDeliveryTrackingStatus({ id, status, reason, vehicleNumber: vehicle }))}
          />
        </Panel>
      )}

      {activeTab === 'billing' && (
        <Panel title="Goods Receipt Notes" icon={PackageCheck}>
          <GrnWorkbench
            purchaseOrders={data.purchaseOrders}
            grns={data.grns}
            selectedPoId={selectedGrnPoId}
            onSelectPo={setSelectedGrnPoId}
            onPostGrn={(grnId) => runAction('GRN posted to inventory.', () => postGrnToInventory({ grnId }))}
            onCreateGrn={(po) => {
              setSelectedPoForGrn(po);
              setGrnLines(po.purchase_order_lines?.map(l => ({
                item_id: l.item_id || '',
                ordered_qty: l.quantity,
                received_qty: l.quantity,
                accepted_qty: l.quantity,
                rejected_qty: 0,
                unit_rate: l.unit_rate || 0,
                remarks: ''
              })) || []);
              setGrnModalOpen(true);
            }}
          />
        </Panel>
      )}

      {activeTab === 'inventory' && (
        <Panel title="Inventory Impact" icon={Warehouse}>
          <InventoryWorkbench snapshots={data.inventorySnapshots} />
        </Panel>
      )}

      {prModalOpen && selectedMrForPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-xl font-bold">Generate Purchase Requisition</h3>
              <button onClick={() => setPrModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4 rounded-lg bg-muted/50 p-4 text-sm border border-border">
              <p className="font-bold text-foreground">Source: {selectedMrForPr.mr_number}</p>
              <p className="text-muted-foreground">{selectedMrForPr.justification || 'Material Request'}</p>
            </div>

            <form onSubmit={handleGeneratePrSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">PR Title *</label>
                  <input value={prTitle} onChange={e => setPrTitle(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-semibold" required />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Required Date *</label>
                    <input type="date" value={prRequiredDate} onChange={e => setPrRequiredDate(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-medium" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Approval Stage</label>
                    <select value={prApprovalStage} onChange={e => setPrApprovalStage(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-medium">
                      <option value="pr_team">PR Team Review</option>
                      <option value="upper_management">Upper Management</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Editable Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-1">
                  <label className="block text-xs font-bold uppercase text-muted-foreground">Line Items</label>
                  <button type="button" onClick={handleAddPrLine} className="inline-flex items-center gap-1 text-xs font-bold text-[#b68d40] hover:text-[#967332]">
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </button>
                </div>
                <div className="rounded-lg border border-border overflow-hidden bg-background">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground uppercase font-bold border-b border-border">
                      <tr>
                        <th className="px-3 py-2">Item Description</th>
                        <th className="px-3 py-2 text-right w-20">Qty</th>
                        <th className="px-3 py-2 text-right w-28">Est Rate (INR)</th>
                        <th className="px-3 py-2 text-right w-32">Total</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {prLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={line.item_description}
                              onChange={(e) => handlePrLineChange(idx, 'item_description', e.target.value)}
                              className="w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary font-semibold"
                              placeholder="Item description"
                              required
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              value={line.quantity}
                              min="1"
                              onChange={(e) => handlePrLineChange(idx, 'quantity', e.target.value)}
                              className="w-full text-right rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary font-bold"
                              required
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              value={line.estimated_rate}
                              min="0"
                              step="0.01"
                              onChange={(e) => handlePrLineChange(idx, 'estimated_rate', e.target.value)}
                              className="w-full text-right rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary font-bold"
                              required
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-foreground">
                            {formatCurrency(line.quantity * line.estimated_rate)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button" onClick={() => handleRemovePrLine(idx)} className="text-rose-500 hover:text-rose-600 disabled:opacity-50" disabled={prLines.length === 1}>
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="financeReq" checked={prFinanceRequired} onChange={e => setPrFinanceRequired(e.target.checked)} className="rounded border-border text-primary" />
                    <label htmlFor="financeReq" className="text-xs font-semibold select-none cursor-pointer">Requires Finance Review</label>
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">
                    Total Est. Cost: <span className="font-bold text-primary">{formatCurrency(prLines.reduce((sum, l) => sum + l.quantity * l.estimated_rate, 0))}</span>
                  </div>
                </div>

                <div className="flex gap-2 items-center">
                  <input type="file" multiple onChange={(e) => setPrAttachments(Array.from(e.target.files || []))} className="text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                  <button type="button" onClick={() => setPrModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/95">Confirm & Generate PR</button>
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
