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
import { supabase } from '@/utils/supabase-client';
import { generateMaterialRequestPdfBlob, downloadMaterialRequestPdfFile } from '@/lib/material-request-pdf';
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
  generateGoodsReceiptNotePdf,
  generateMaterialRequestPdf,
  printMaterialRequestReport,
  printGrnReport,
  printPurchaseBillReport,
  printPurchaseOrderReport,
  printPurchaseRequisitionReport,
  printRfqReport,
  generateRfqPdf,
  generatePurchaseBillPdf,
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
  type GrnRow,
  type VendorSelectionRow,
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

export interface ProcurementModuleProps {
  initialProjectId?: string;
  hideProjectSelector?: boolean;
}

export function ProcurementModule({ initialProjectId, hideProjectSelector = false }: ProcurementModuleProps) {
  const { projects, activeProjectId, activeRole } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>('requests');
  const [data, setData] = useState<ProcurementDashboardData>(emptyData);
  const [liveProjects, setLiveProjects] = useState<ProcurementProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || 'all');
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

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

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
        if (initialProjectId) {
          setSelectedProjectId(initialProjectId);
        } else {
          setSelectedProjectId((current) => (current && options.some((option) => option.id === current) ? current : 'all'));
        }
      })
      .catch((projectError) => {
        if (!active) return;
        setError(projectError instanceof Error ? projectError.message : 'Unable to load live projects.');
      });
    return () => {
      active = false;
    };
  }, [liveMode, initialProjectId]);

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
          setMessage(`✅ Goods Receipt Note #${(payload.new as { grn_number?: string }).grn_number || ''} submitted.`);
        }
        void refresh();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [liveMode, refresh]);

  const canApprove = activeRole === 'UPPER_MANAGEMENT' || activeRole === 'PROJECT_MANAGER';

  async function handleCreateMr(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedProject || selectedProjectId === 'all') {
      setError('Please select a project to raise a material request.');
      return;
    }

    try {
      await createMaterialRequest({
        projectId: selectedProject.id,
        siteId: mrSiteId || undefined,
        title: mrTitle,
        priority: 'high',
        requiredDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        lines: [
          {
            itemDescription: mrItem,
            quantity: Number(mrQuantity),
            estimatedRate: Number(mrRate),
          },
        ],
        attachments: mrAttachments,
      });

      setMessage(`Material Request created successfully.`);
      setMrTitle('Cement and steel requirement for upcoming slab');
      setMrAttachments([]);
      await refresh();
    } catch (mrError) {
      setError(mrError instanceof Error ? mrError.message : 'Failed to create material request.');
    }
  }

  async function handleReviewMr(mr: MaterialRequestRow) {
    setError(null);
    setMessage(null);
    try {
      await reviewMaterialRequestInventory(mr);
      setMessage(`Inventory check updated for MR ${mr.mr_number}.`);
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Inventory check failed.');
    }
  }

  async function handleIssueMr(mr: MaterialRequestRow) {
    setError(null);
    setMessage(null);
    try {
      await issueMaterialFromStock(mr);
      setMessage(`Stock issued from site inventory for MR ${mr.mr_number}.`);
      await refresh();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'Failed to issue stock.');
    }
  }

  async function handleConvertMr(mr: MaterialRequestRow) {
    setSelectedMrForPr(mr);
    setPrTitle(`PR for ${mr.justification || mr.mr_number}`);
    setPrRequiredDate(mr.required_date || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPrFinanceRequired(false);
    setPrApprovalStage('pr_team');
    setPrRemarks('');
    setPrAttachments([]);

    if (mr.material_request_lines && mr.material_request_lines.length > 0) {
      setPrLines(
        mr.material_request_lines.map((l) => ({
          item_description: l.item_description,
          quantity: l.quantity,
          estimated_rate: l.estimated_rate || 0,
          item_id: l.item_id || null,
        }))
      );
    } else {
      setPrLines([
        {
          item_description: 'General Material Requirement',
          quantity: 1,
          estimated_rate: 0,
          item_id: null,
        },
      ]);
    }

    setPrModalOpen(true);
  }

  async function handleSavePr(event: FormEvent) {
    event.preventDefault();
    if (!selectedMrForPr) return;
    setError(null);
    setMessage(null);

    try {
      await convertMaterialRequestToPr({
        materialRequest: selectedMrForPr,
        title: prTitle,
        requiredDate: prRequiredDate,
        financeRequired: prFinanceRequired,
        approvalStage: prApprovalStage,
        remarks: prRemarks,
        lines: prLines.map((l) => ({
          item_description: l.item_description,
          quantity: l.quantity,
          estimated_rate: l.estimated_rate,
          item_id: l.item_id || undefined,
        })),
        attachments: prAttachments,
      });

      setMessage(`Purchase Requisition created and assigned.`);
      setPrModalOpen(false);
      setSelectedMrForPr(null);
      await refresh();
    } catch (prError) {
      setError(prError instanceof Error ? prError.message : 'Failed to create PR.');
    }
  }

  async function handleOpenRfqModal(pr: PurchaseRequisitionRow) {
    setSelectedPrForRfq(pr);
    setSelectedVendorsForRfq([]);
    setRfqModalOpen(true);
  }

  async function handleSaveRfq(event: FormEvent) {
    event.preventDefault();
    if (!selectedPrForRfq) return;
    if (selectedVendorsForRfq.length === 0) {
      setError('Please select at least one vendor for the RFQ.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await createRfqFromPr(selectedPrForRfq, selectedVendorsForRfq);
      setMessage(`RFQ published to selected vendors.`);
      setRfqModalOpen(false);
      setSelectedPrForRfq(null);
      await refresh();
    } catch (rfqError) {
      setError(rfqError instanceof Error ? rfqError.message : 'Failed to publish RFQ.');
    }
  }

  function handleOpenQuoteModal(rfq: RfqRow) {
    setSelectedRfqForQuote(rfq);
    setSelectedVendorForQuote(rfq.rfq_vendors?.[0]?.vendor_id || data.vendors[0]?.id || '');
    setQuoteNumber(`QT-${Date.now().toString().slice(-5)}`);
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteLeadTimeDays(7);
    setQuoteDeliveryTerms('Delivery at project site store');
    setQuotePaymentTerms('30 days from accepted GRN');
    setQuoteGstDetails('GST extra as applicable');
    setQuoteStoragePath('');
    setQuoteAttachments([]);

    const linkedPr = data.purchaseRequisitions.find((pr) => pr.id === rfq.purchase_requisition_id);
    if (linkedPr?.purchase_requisition_lines && linkedPr.purchase_requisition_lines.length > 0) {
      setQuoteLines(
        linkedPr.purchase_requisition_lines.map((l) => ({
          item_id: l.item_id,
          item_description: l.item_description,
          quantity: l.quantity,
          unit_rate: l.estimated_rate || 100,
          tax_rate: 18,
        }))
      );
    } else {
      setQuoteLines([
        {
          item_description: 'Material line item',
          quantity: 100,
          unit_rate: 50,
          tax_rate: 18,
        },
      ]);
    }

    setQuoteModalOpen(true);
  }

  async function handleSaveQuote(event: FormEvent) {
    event.preventDefault();
    if (!selectedRfqForQuote || !selectedVendorForQuote) return;

    setError(null);
    setMessage(null);
    try {
      await recordQuotation({
        rfq: selectedRfqForQuote,
        vendorId: selectedVendorForQuote,
        quotationNumber: quoteNumber,
        quotationDate: quoteDate,
        leadTimeDays: Number(quoteLeadTimeDays),
        deliveryTerms: quoteDeliveryTerms,
        paymentTerms: quotePaymentTerms,
        gstDetails: quoteGstDetails,
        storagePath: quoteStoragePath || undefined,
        lines: quoteLines.map((l) => ({
          item_description: l.item_description,
          quantity: l.quantity,
          unit_rate: l.unit_rate,
          tax_rate: l.tax_rate,
          item_id: l.item_id || undefined,
        })),
        attachments: quoteAttachments,
      });

      setMessage(`Quotation submitted.`);
      setQuoteModalOpen(false);
      setSelectedRfqForQuote(null);
      await refresh();
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Failed to record quotation.');
    }
  }

  function handleOpenRecommendModal(quote: QuotationRow) {
    setSelectedQuotationForRecommendation(quote);
    setRecommendationReason('Best evaluated commercial offer considering rate, lead time, GST impact, and vendor performance.');
    setRecommendModalOpen(true);
  }

  async function handleSaveRecommendation(event: FormEvent) {
    event.preventDefault();
    if (!selectedQuotationForRecommendation) return;

    setError(null);
    setMessage(null);
    try {
      const prId = data.rfqs.find((r) => r.id === selectedQuotationForRecommendation.rfq_id)?.purchase_requisition_id || '';
      await recommendVendorSelection({
        quotation: selectedQuotationForRecommendation,
        purchaseRequisitionId: prId,
        reasonForSelection: recommendationReason,
      });
      setMessage(`Quotation recommended for PO approval.`);
      setRecommendModalOpen(false);
      setSelectedQuotationForRecommendation(null);
      await refresh();
    } catch (recError) {
      setError(recError instanceof Error ? recError.message : 'Failed to submit recommendation.');
    }
  }

  async function handleApproveSelection(selectionId: string) {
    setError(null);
    setMessage(null);
    try {
      await approveVendorSelection({ selectionId });
      setMessage(`Vendor selection approved by management.`);
      await refresh();
    } catch (appError) {
      setError(appError instanceof Error ? appError.message : 'Failed to approve vendor selection.');
    }
  }

  function handleOpenPoModal(pr: PurchaseRequisitionRow, quotation?: QuotationRow, selectionId?: string) {
    setSelectedPrForPo(pr);
    setSelectedQuotationForPo(quotation || null);
    setSelectedVendorSelectionIdForPo(selectionId || null);
    setPoDeliveryLocation('Project site store');
    setPoDeliveryDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPoPaymentTerms(quotation?.payment_terms || '30 days from GRN');

    if (quotation?.quotation_lines && quotation.quotation_lines.length > 0) {
      setPoLines(
        quotation.quotation_lines.map((ql) => ({
          item_id: ql.item_id || undefined,
          item_description: ql.item_description,
          quantity: ql.quantity,
          unit_rate: ql.unit_rate || 0,
          tax_rate: ql.tax_rate || 0,
          line_total: ql.line_total || 0,
        }))
      );
    } else if (pr.purchase_requisition_lines && pr.purchase_requisition_lines.length > 0) {
      setPoLines(
        pr.purchase_requisition_lines.map((prl) => ({
          item_id: prl.item_id || undefined,
          item_description: prl.item_description,
          quantity: prl.quantity,
          unit_rate: prl.estimated_rate || 100,
          tax_rate: 18,
          line_total: (prl.quantity * (prl.estimated_rate || 100)) * 1.18,
        }))
      );
    } else {
      setPoLines([
        {
          item_description: 'PO Material line item',
          quantity: 10,
          unit_rate: 100,
          tax_rate: 18,
          line_total: 1180,
        },
      ]);
    }

    setPoModalOpen(true);
  }

  async function handleSavePo(event: FormEvent) {
    event.preventDefault();
    if (!selectedPrForPo) return;
    const vendorId = selectedQuotationForPo?.vendor_id || data.vendors[0]?.id;
    if (!vendorId) {
      setError('Please select a vendor for the PO.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      await generatePurchaseOrder({
        purchaseRequisitionId: selectedPrForPo.id,
        vendorId,
        vendorSelectionId: selectedVendorSelectionIdForPo || undefined,
        deliveryLocation: poDeliveryLocation,
        deliveryDate: poDeliveryDate,
        paymentTerms: poPaymentTerms,
        termsAndConditions: poTermsAndConditions,
        lines: poLines.map((l) => ({
          item_id: l.item_id || undefined,
          item_description: l.item_description,
          quantity: l.quantity,
          unit_rate: l.unit_rate,
          tax_rate: l.tax_rate,
          line_total: l.line_total,
        })),
      });

      setMessage(`Purchase Order created successfully.`);
      setPoModalOpen(false);
      setSelectedPrForPo(null);
      await refresh();
    } catch (poError) {
      setError(poError instanceof Error ? poError.message : 'Failed to generate PO.');
    }
  }

  async function handleGeneratePoPdf(po: PurchaseOrderRow) {
    setError(null);
    setMessage(null);
    try {
      await generatePurchaseOrderPdf(po);
      setMessage(`PDF generated for PO ${po.po_number || ''}.`);
      await refresh();
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : 'PDF generation failed.');
    }
  }

  async function handleOpenPoPdf(po: PurchaseOrderRow) {
    if (!po.pdf_storage_path) {
      await handleGeneratePoPdf(po);
      return;
    }
    try {
      const urlResult = await createProcurementDocumentUrl(po.pdf_storage_path);
      const urlStr = typeof urlResult === 'string' ? urlResult : (urlResult as any)?.data?.signedUrl;
      if (urlStr) {
        window.open(urlStr, '_blank');
      }
    } catch (err) {
      setError('Could not open PO PDF preview.');
    }
  }

  async function handleApprovePo(po: PurchaseOrderRow) {
    setError(null);
    setMessage(null);
    try {
      await approveAndSendPurchaseOrder(po);
      setMessage(`PO ${po.po_number || ''} approved and sent to vendor.`);
      await refresh();
    } catch (appError) {
      setError(appError instanceof Error ? appError.message : 'Failed to approve PO.');
    }
  }

  function handleOpenGrnModal(po: PurchaseOrderRow) {
    setSelectedPoForGrn(po);
    setGrnReceiptDate(new Date().toISOString().split('T')[0]);
    setGrnChallanNumber(`CH-${Date.now().toString().slice(-5)}`);
    setGrnVehicleNumber('GJ-05-AB-1234');
    setGrnQualityDecision('accepted');
    setGrnAttachments([]);

    if (po.purchase_order_lines && po.purchase_order_lines.length > 0) {
      setGrnLines(
        po.purchase_order_lines.map((pol) => ({
          item_id: pol.item_id || 'item-unknown',
          ordered_qty: pol.quantity,
          received_qty: pol.quantity,
          accepted_qty: pol.quantity,
          rejected_qty: 0,
          unit_rate: pol.unit_rate || 0,
          remarks: 'Inspected and verified OK',
        }))
      );
    } else {
      setGrnLines([
        {
          item_id: 'item-general',
          ordered_qty: 10,
          received_qty: 10,
          accepted_qty: 10,
          rejected_qty: 0,
          unit_rate: 100,
          remarks: 'General material OK',
        },
      ]);
    }

    setGrnModalOpen(true);
  }

  async function handleSaveGrn(event: FormEvent) {
    event.preventDefault();
    if (!selectedPoForGrn) return;

    setError(null);
    setMessage(null);
    try {
      await createGrnFromPo(selectedPoForGrn);

      setMessage(`Goods Receipt Note created and inventory posted.`);
      setGrnModalOpen(false);
      setSelectedPoForGrn(null);
      await refresh();
    } catch (grnError) {
      setError(grnError instanceof Error ? grnError.message : 'Failed to create GRN.');
    }
  }

  async function handleCreateBill(grn: GrnRow) {
    setError(null);
    setMessage(null);
    try {
      await createVendorBillFromGrn(grn);
      setMessage(`Vendor Bill generated with 3-way matching.`);
      await refresh();
    } catch (billError) {
      setError(billError instanceof Error ? billError.message : 'Failed to generate vendor bill.');
    }
  }

  return (
    <div className="space-y-6">
      {!hideProjectSelector && (
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <ClipboardList className="h-4 w-4" />
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
      )}

      {hideProjectSelector && (
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Project Procurement & Supply Lifecycle
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Project-level Material Requests, Purchase Requisitions, RFQs, POs, GRNs, and Vendor Bills
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {/* Procurement Pipeline Dashboard */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h4 className="text-sm font-bold uppercase text-foreground mb-4">Procurement Pipeline</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric icon={ClipboardList} label="1. MR" value={data.materialRequests.length} />
          <Metric icon={ShoppingCart} label="2. PR" value={data.purchaseRequisitions.length} />
          <Metric icon={UsersRound} label="3. RFQ" value={data.rfqs.length} />
          <Metric icon={Truck} label="4. PO" value={data.purchaseOrders.length} />
          <Metric icon={PackageCheck} label="5. GRN" value={data.grns.length} />
          <Metric icon={ReceiptIndianRupee} label="6. Bills" value={data.vendorBills.length} />
        </div>
      </div>

      {/* Submodule Navigation Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-2 overflow-x-auto" aria-label="Procurement submodules">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                  active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          <Panel title="Raise Material Request (Site Engineer)" icon={ClipboardList}>
            <form onSubmit={handleCreateMr} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-foreground">Justification / Purpose</label>
                  <input type="text" required value={mrTitle} onChange={(e) => setMrTitle(e.target.value)} className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">Material Item</label>
                  <input type="text" required value={mrItem} onChange={(e) => setMrItem(e.target.value)} className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">Quantity Required</label>
                  <input type="number" required min="1" value={mrQuantity} onChange={(e) => setMrQuantity(Number(e.target.value))} className="w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                <input type="file" multiple onChange={(e) => setMrAttachments(Array.from(e.target.files || []))} className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80" />
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  Submit Material Request
                </button>
              </div>
            </form>
          </Panel>

          <MaterialRequestWorkQueue
            materialRequests={data.materialRequests}
            purchaseRequisitions={data.purchaseRequisitions}
            inventorySnapshots={data.inventorySnapshots}
            projectOptions={projectOptions as any}
            lockedProjectId={selectedProjectId !== 'all' ? selectedProjectId : undefined}
            activeRole={(activeRole as any) || 'PROJECT_MANAGER'}
            onConvertToPr={handleConvertMr}
            onPrintMr={printMaterialRequestReport}
            onRefresh={refresh}
            onMessage={setMessage}
            onError={setError}
          />
        </div>
      )}

      {activeTab === 'requisitions' && (
        <PurchaseRequisitionWorkspace
          rows={data.purchaseRequisitions}
          attachments={data.prAttachments}
          materialRequests={data.materialRequests}
          rfqs={data.rfqs}
          quotations={data.quotations}
          selections={data.vendorSelections}
          projectOptions={projectOptions as any}
          activeRole={(activeRole as any) || 'PROJECT_MANAGER'}
          selectedPrId={selectedPrId}
          onSelectPr={setSelectedPrId}
          onAssign={(row) => assignPrToCurrentUser(row).then(() => refresh())}
          onApprove={(row) => approvePurchaseRequisition(row).then(() => refresh())}
          onRfq={handleOpenRfqModal}
          onPdf={(row) => generatePurchaseRequisitionPdf(row).then(() => refresh())}
          onOpenPdf={(row) => printPurchaseRequisitionReport(row)}
          onGeneratePo={(row) => handleOpenPoModal(row)}
          onRefresh={refresh}
          onMessage={setMessage}
          onError={setError}
        />
      )}

      {activeTab === 'rfq' && (
        <RFQWorkspace
          prs={data.purchaseRequisitions}
          rfqs={data.rfqs}
          quotations={data.quotations}
          selections={data.vendorSelections}
          purchaseOrders={data.purchaseOrders}
          vendors={data.vendors}
          projectOptions={projectOptions as any}
          activeRole={activeRole as any}
          selectedRfqId={selectedRfqId}
          onSelectRfq={setSelectedRfqId}
          onCreateRfq={(pr) => handleOpenRfqModal(pr)}
          onRecordQuote={(rfq) => handleOpenQuoteModal(rfq)}
          onRecommend={(quote) => handleOpenRecommendModal(quote)}
          onApproveSelection={(selection) => handleApproveSelection(selection.id)}
          onGeneratePo={(pr, quotation, selection) => handleOpenPoModal(pr, quotation, selection.id)}
          onPrintRfq={(rfqId) => {
            const rfq = data.rfqs.find((r) => r.id === rfqId);
            if (rfq) printRfqReport(rfq);
          }}
        />
      )}

      {activeTab === 'orders' && (
        <POWorkspace
          purchaseOrders={data.purchaseOrders}
          activeRole={activeRole as any}
          onApprove={handleApprovePo}
          onPrintPo={(po) => printPurchaseOrderReport(po)}
          onRefresh={refresh}
        />
      )}

      {activeTab === 'grn' && (
        <GrnWorkspace
          grns={data.grns}
          activeRole={activeRole as any}
          onDownloadReport={(grnId) => {
            const match = data.grns.find((g) => g.id === grnId);
            if (match) printGrnReport(match);
          }}
        />
      )}

      {activeTab === 'billing' && (
        <BillsWorkspace
          bills={data.vendorBills}
          activeRole={activeRole as any}
        />
      )}

      {/* MODALS */}
      {/* 1. Convert MR to PR Modal */}
      {prModalOpen && selectedMrForPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Create Purchase Requisition (PR)</h3>
              <button type="button" onClick={() => setPrModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSavePr} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground">PR Title / Specification</label>
                <input type="text" required value={prTitle} onChange={(e) => setPrTitle(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Target Required Date</label>
                  <input type="date" required value={prRequiredDate} onChange={(e) => setPrRequiredDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Approval Stage</label>
                  <select value={prApprovalStage} onChange={(e) => setPrApprovalStage(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none">
                    <option value="pr_team">PR Team Verification</option>
                    <option value="management_review">Management Approval Required</option>
                    <option value="approved">Direct Approved</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-foreground">Remarks / Justification</label>
                <textarea rows={2} value={prRemarks} onChange={(e) => setPrRemarks(e.target.value)} placeholder="Specify brand, grade, or delivery notes" className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
              </div>
              <div className="flex justify-between items-center border-t border-border pt-4">
                <input type="file" multiple onChange={(e) => setPrAttachments(Array.from(e.target.files || []))} className="text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPrModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Generate PR</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Publish RFQ Modal */}
      {rfqModalOpen && selectedPrForRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Publish RFQ ({selectedPrForRfq.pr_number})</h3>
              <button type="button" onClick={() => setRfqModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveRfq} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground">Select Registered Vendors to Send RFQ</label>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                  {data.vendors.map((vendor) => {
                    const isChecked = selectedVendorsForRfq.includes(vendor.id);
                    return (
                      <label key={vendor.id} className="flex items-center justify-between text-xs font-semibold cursor-pointer">
                        <span>{vendor.display_name || vendor.legal_name} ({vendor.gst_number || 'No GST'})</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedVendorsForRfq([...selectedVendorsForRfq, vendor.id]);
                            else setSelectedVendorsForRfq(selectedVendorsForRfq.filter((id) => id !== vendor.id));
                          }}
                          className="h-4 w-4 rounded border-border"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setRfqModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Publish RFQ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Record Quotation Modal */}
      {quoteModalOpen && selectedRfqForQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Record Vendor Quotation ({selectedRfqForQuote.rfq_number})</h3>
              <button type="button" onClick={() => setQuoteModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveQuote} className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Quotation Vendor</label>
                  <select value={selectedVendorForQuote} onChange={(e) => setSelectedVendorForQuote(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none">
                    {data.vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.display_name || v.legal_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Vendor Quote Ref No.</label>
                  <input type="text" required value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Quote Date</label>
                  <input type="date" required value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Lead Time (Days)</label>
                  <input type="number" required min="1" value={quoteLeadTimeDays} onChange={(e) => setQuoteLeadTimeDays(Number(e.target.value))} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Payment Terms</label>
                  <input type="text" value={quotePaymentTerms} onChange={(e) => setQuotePaymentTerms(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-foreground">Commercial Quote Line Rates</label>
                <div className="mt-2 space-y-2">
                  {quoteLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 items-center rounded-md border border-border p-2 text-xs">
                      <span className="col-span-2 font-bold">{line.item_description} ({line.quantity} qty)</span>
                      <input type="number" placeholder="Unit Rate (₹)" value={line.unit_rate} onChange={(e) => {
                        const copy = [...quoteLines];
                        copy[idx].unit_rate = Number(e.target.value);
                        setQuoteLines(copy);
                      }} className="rounded border border-border p-1 text-right font-bold" />
                      <input type="number" placeholder="Tax %" value={line.tax_rate} onChange={(e) => {
                        const copy = [...quoteLines];
                        copy[idx].tax_rate = Number(e.target.value);
                        setQuoteLines(copy);
                      }} className="rounded border border-border p-1 text-right" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-border pt-4">
                <input type="file" multiple onChange={(e) => setQuoteAttachments(Array.from(e.target.files || []))} className="text-sm file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setQuoteModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Save Quotation</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Recommend Vendor Selection Modal */}
      {recommendModalOpen && selectedQuotationForRecommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Recommend Vendor Selection</h3>
              <button type="button" onClick={() => setRecommendModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveRecommendation} className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Recommending quotation <span className="font-bold text-foreground">{selectedQuotationForRecommendation.quotation_number}</span> ({formatCurrency(selectedQuotationForRecommendation.total_amount)}).
              </p>
              <div>
                <label className="text-xs font-bold text-foreground">Commercial Justification / Comparative Note</label>
                <textarea rows={3} required value={recommendationReason} onChange={(e) => setRecommendationReason(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setRecommendModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Submit Recommendation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. PO Generation Modal */}
      {poModalOpen && selectedPrForPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Generate Purchase Order (PO)</h3>
              <button type="button" onClick={() => setPoModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSavePo} className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Delivery Site Store Location</label>
                  <input type="text" required value={poDeliveryLocation} onChange={(e) => setPoDeliveryLocation(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Target Delivery Date</label>
                  <input type="date" required value={poDeliveryDate} onChange={(e) => setPoDeliveryDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-foreground">Payment Terms</label>
                <input type="text" required value={poPaymentTerms} onChange={(e) => setPoPaymentTerms(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-foreground">Terms and Conditions</label>
                <textarea rows={3} required value={poTermsAndConditions} onChange={(e) => setPoTermsAndConditions(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setPoModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Create Purchase Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. GRN Creation Modal */}
      {grnModalOpen && selectedPoForGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Receive Goods & Submit GRN ({selectedPoForGrn.po_number})</h3>
              <button type="button" onClick={() => setGrnModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveGrn} className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Receipt Date</label>
                  <input type="date" required value={grnReceiptDate} onChange={(e) => setGrnReceiptDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Delivery Challan / Invoice No.</label>
                  <input type="text" required value={grnChallanNumber} onChange={(e) => setGrnChallanNumber(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Vehicle Number</label>
                  <input type="text" value={grnVehicleNumber} onChange={(e) => setGrnVehicleNumber(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-foreground">Quantity Verification & Inspection</label>
                <div className="mt-2 space-y-2">
                  {grnLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-6 gap-2 items-center rounded-md border border-border p-2 text-xs">
                      <span className="col-span-2 font-bold">Ordered: {line.ordered_qty}</span>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Received</label>
                        <input type="number" value={line.received_qty} onChange={(e) => {
                          const copy = [...grnLines];
                          copy[idx].received_qty = Number(e.target.value);
                          copy[idx].accepted_qty = Number(e.target.value) - copy[idx].rejected_qty;
                          setGrnLines(copy);
                        }} className="w-full rounded border border-border p-1 text-right font-bold" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Rejected</label>
                        <input type="number" value={line.rejected_qty} onChange={(e) => {
                          const copy = [...grnLines];
                          copy[idx].rejected_qty = Number(e.target.value);
                          copy[idx].accepted_qty = copy[idx].received_qty - Number(e.target.value);
                          setGrnLines(copy);
                        }} className="w-full rounded border border-border p-1 text-right font-bold text-rose-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-muted-foreground">Inspection Remark</label>
                        <input type="text" value={line.remarks} onChange={(e) => {
                          const copy = [...grnLines];
                          copy[idx].remarks = e.target.value;
                          setGrnLines(copy);
                        }} className="w-full rounded border border-border p-1" />
                      </div>
                    </div>
                  ))}
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
