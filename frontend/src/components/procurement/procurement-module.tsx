'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  PackageCheck,
  RefreshCcw,
  ReceiptIndianRupee,
  ShoppingCart,
  Truck,
  UsersRound,
  X,
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
  createRfqFromPr,
  listSourcingBasketLines,
  type SourcingBasketLine,
  listRfqLines,
  createVendorBillFromGrn,
  generatePurchaseOrderPdf,
  generatePurchaseOrder,
  generatePurchaseRequisitionPdf,
  listActiveVendorOptions,
  listBillableGrnOptions,
  printMaterialRequestReport,
  printGrnReport,
  printPurchaseBillReport,
  printPurchaseOrderReport,
  printPurchaseRequisitionReport,
  printRfqReport,
  listProcurementDashboard,
  listProcurementProjects,
  recordQuotation,
  recommendVendorSelection,
  reviewMaterialRequestInventory,
  issueMaterialFromStock,
  savePurchaseBill,
  savePurchaseOrderForm,
  updateGrnStatus,
  updateVendorBillStatus,
  type MaterialRequestRow,
  type ProcurementDashboardData,
  type ProcurementProjectOption,
  type PurchaseOrderRow,
  type PurchaseRequisitionRow,
  type QuotationRow,
  type RfqRow,
  type GrnRow,
  type GrnOption,
  type VendorOption,
} from '@/lib/procurement';
import { formatCurrency } from '@/components/procurement/shared';
import { PurchaseRequisitionWorkspace } from '@/components/procurement/purchase-requisition/purchase-requisition-workspace';
import { RFQWorkspace } from '@/components/procurement/rfq/rfq-workspace';
import { RfqBidComparisonMatrix } from '@/components/procurement/rfq/rfq-bid-comparison-matrix';
import { RfqAwardMatrixModal } from '@/components/procurement/rfq/rfq-award-matrix-modal';
import {
  RfqSourcingBasket,
  isSourceable,
  validateBasket,
  type BasketSelection,
} from '@/components/procurement/rfq/rfq-sourcing-basket';
import MaterialRequestWorkQueue from '@/components/procurement/material-request-work-queue';
import { POWorkspace } from '@/components/procurement/po/po-workspace';
import type { FullPoFormState } from '@/components/procurement/po/po-form';
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
  // Sourcing basket: which PR lines, and how much of each, this RFQ tenders.
  const [basketLines, setBasketLines] = useState<SourcingBasketLine[]>([]);
  const [basketSelection, setBasketSelection] = useState<BasketSelection>({});
  const [basketLoading, setBasketLoading] = useState(false);
  const [selectedVendorsForRfq, setSelectedVendorsForRfq] = useState<string[]>([]);

  // Selected PR state for workbench
  const [selectedPrId, setSelectedPrId] = useState<string | null>(null);
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null);
  const [openPrIdForRfq, setOpenPrIdForRfq] = useState<string | null>(null);
  const [awardMatrixRfqId, setAwardMatrixRfqId] = useState<string | null>(null);

  // Quotation and vendor finalization state
  type QuoteLineInput = {
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    /** RFQ line this bid answers — required for line-level bid comparison. */
    rfq_line_id?: string | null;
    /** Offered quantity capacity (defaults to rfq_quantity). */
    offered_qty?: number;
    /** Discount percentage (0-100). */
    discount_percent?: number;
    /** Remarks/notes from vendor on this item. */
    remarks?: string;
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
  /** Explicit vendor choice when no accepted quotation fixes the vendor. */
  const [selectedVendorForPo, setSelectedVendorForPo] = useState('');
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
    purchase_order_line_id: string | null;
    item_id: string | null;
    item_description: string;
    ordered_qty: number;
    already_received_qty: number;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    unit_rate: number;
    remarks: string;
  };
  const [grnLines, setGrnLines] = useState<GrnLineInput[]>([]);
  const [grnReceiptDate, setGrnReceiptDate] = useState('');
  const [grnChallanNumber, setGrnChallanNumber] = useState('');
  const [grnChallanDate, setGrnChallanDate] = useState('');
  const [grnVehicleNumber, setGrnVehicleNumber] = useState('');
  const [grnTransporter, setGrnTransporter] = useState('');
  const [grnGodown, setGrnGodown] = useState('Main Site Store');
  const [grnQualityDecision, setGrnQualityDecision] = useState('accepted');
  const [grnRemarks, setGrnRemarks] = useState('');
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [selectedPoForGrn, setSelectedPoForGrn] = useState<PurchaseOrderRow | null>(null);
  const [savingGrn, setSavingGrn] = useState(false);

  // Vendor + GRN option lists backing the supplier / source dropdowns.
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [billableGrns, setBillableGrns] = useState<GrnOption[]>([]);

  // Create-PB flow: pick a posted GRN (or a supplier) to raise a bill against.
  const [pbModalOpen, setPbModalOpen] = useState(false);
  const [pbSource, setPbSource] = useState<'grn' | 'manual'>('grn');
  const [pbGrnId, setPbGrnId] = useState('');
  const [pbVendorId, setPbVendorId] = useState('');
  const [pbInvoiceValue, setPbInvoiceValue] = useState('');
  const [pbTolerance, setPbTolerance] = useState('0');
  const [pbSupplierBillNo, setPbSupplierBillNo] = useState('');
  const [pbSupplierBillDate, setPbSupplierBillDate] = useState('');
  const [creatingPb, setCreatingPb] = useState(false);

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

  // Real-time subscription for mobile MR submissions & status changes
  useEffect(() => {
    if (!liveMode) return;
    const channel = supabase
      .channel('realtime-material-requests-erp')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_requests' },
        () => {
          void refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_request_lines' },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveMode, refresh]);

  /**
   * Realtime sync.
   *
   * Every change used to trigger an immediate full dashboard reload — eleven
   * queries per row — so a bulk insert produced a burst of refetches. Changes
   * are now coalesced into one reload per idle window, and vendor_bills is
   * subscribed so the Bills tab live-updates too.
   */
  useEffect(() => {
    if (!liveMode) return;
    const client = supabase;
    if (!client) return;

    let pending: number | null = null;
    const scheduleRefresh = () => {
      if (pending !== null) window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        pending = null;
        void refresh();
      }, 600);
    };

    const announce = (table: string, payload: { eventType: string; new: unknown }) => {
      if (payload.eventType !== 'INSERT') return;
      const row = (payload.new || {}) as Record<string, string | undefined>;
      const notices: Record<string, string> = {
        material_requests: `New material request ${row.mr_number || ''} submitted.`,
        purchase_requisitions: `Purchase requisition ${row.pr_number || ''} created.`,
        purchase_orders: `Purchase order ${row.po_number || ''} created.`,
        goods_receipt_notes: `Goods receipt note ${row.grn_number || ''} submitted.`,
        vendor_bills: `Purchase bill ${row.bill_number || ''} raised.`,
      };
      if (notices[table]) setMessage(notices[table].trim());
    };

    const tables = [
      'material_requests',
      'purchase_requisitions',
      'purchase_orders',
      'goods_receipt_notes',
      'vendor_bills',
    ];

    let channel = client.channel('procurement-realtime-sync');
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          announce(table, payload as unknown as { eventType: string; new: unknown });
          scheduleRefresh();
        },
      );
    }
    channel.subscribe();

    return () => {
      if (pending !== null) window.clearTimeout(pending);
      void client.removeChannel(channel);
    };
  }, [liveMode, refresh]);

  // Supplier and billable-GRN dropdown sources.
  useEffect(() => {
    if (!liveMode) return;
    let active = true;
    void listActiveVendorOptions()
      .then((options) => { if (active) setVendorOptions(options); })
      .catch(() => { /* the dashboard payload still carries a vendor list */ });
    return () => { active = false; };
  }, [liveMode]);

  useEffect(() => {
    if (!liveMode) return;
    let active = true;
    void listBillableGrnOptions(selectedProjectId)
      .then((options) => { if (active) setBillableGrns(options); })
      .catch(() => { if (active) setBillableGrns([]); });
    return () => { active = false; };
  }, [liveMode, selectedProjectId, data.grns, data.vendorBills]);

  const canApprove = activeRole === 'UPPER_MANAGEMENT' || activeRole === 'PROJECT_MANAGER';
  const canApproveBills = activeRole === 'UPPER_MANAGEMENT';

  /** Vendor list for dropdowns: the dedicated query, falling back to the dashboard payload. */
  const vendorChoices = vendorOptions.length > 0
    ? vendorOptions
    : data.vendors.map((vendor) => ({
        id: vendor.id,
        label: vendor.display_name || vendor.legal_name,
        legal_name: vendor.legal_name,
        display_name: vendor.display_name ?? null,
        gst_number: vendor.gst_number ?? null,
        city: null,
        phone: vendor.phone ?? null,
        compliance_status: vendor.compliance_status ?? null,
      }));

  /**
   * Runs a service call and surfaces its outcome honestly.
   *
   * The service layer returns `{ data, error }` and never throws, but every
   * handler here used to ignore the result and show a success banner
   * unconditionally — so a failed approval or GRN posting still reported
   * "created successfully". This helper is the single place that decides.
   */
  const runAction = useCallback(
    async <T,>(
      label: string,
      action: () => Promise<{ data: T | null; error: Error | null }>,
    ): Promise<T | null> => {
      setError(null);
      setMessage(null);
      try {
        const result = await action();
        if (result.error) {
          setError(result.error.message);
          return null;
        }
        setMessage(`${label} completed.`);
        await refresh();
        return result.data;
      } catch (unexpected) {
        setError(
          unexpected instanceof Error ? unexpected.message : 'Unexpected error.',
        );
        return null;
      }
    },
    [refresh],
  );



  async function handleReviewMr(mr: MaterialRequestRow) {
    await runAction(`Inventory check for MR ${mr.mr_number}`, () => reviewMaterialRequestInventory(mr));
  }

  async function handleIssueMr(mr: MaterialRequestRow) {
    await runAction(`Stock issue for MR ${mr.mr_number}`, () => issueMaterialFromStock(mr));
  }

  async function handleConvertMr(mr: MaterialRequestRow) {
    const lines = mr.material_request_lines ?? [];
    if (lines.length === 0) {
      setError(
        `MR ${mr.mr_number} has no material lines, so there is nothing to requisition. Add lines to the request first.`,
      );
      return;
    }

    const titleText = mr.title || mr.justification || `PR for ${mr.mr_number}`;
    const requiredDateText = mr.required_date || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // Pass the WHOLE MR line through. Projecting it down to
    // (description, qty, rate, item_id) -- as this did -- dropped the line id,
    // so purchase_requisition_lines.material_request_line_id came out NULL and
    // the PR had no link back to the MR line. Everything downstream then fell
    // back to MR *header* values: both PR rows showed the same activity, and
    // group / brand / unit rendered as blank.
    const prLinesToSave = lines.map((l) => ({
      // Identity — this is what makes the PR line traceable to its MR line.
      id: l.id ?? null,
      material_request_line_id: l.id ?? null,
      line_number: (l as { line_number?: number | null }).line_number ?? null,

      item_description: l.item_description,
      quantity: Number(l.quantity) || 0,
      estimated_rate: Number(l.estimated_rate) || 0,
      item_id: l.item_id || undefined,

      // Classification — copied 1:1 so the PR shows exactly what the MR defines.
      unit: (l as { unit?: string | null }).unit ?? null,
      item_code: (l as { item_code?: string | null }).item_code ?? null,
      item_group: (l as { item_group?: string | null }).item_group ?? null,
      item_brand: (l as { item_brand?: string | null }).item_brand ?? null,
      specification: (l as { specification?: string | null }).specification ?? null,
      activity_name: (l as { activity_name?: string | null }).activity_name ?? null,
      sub_activity_name: (l as { sub_activity_name?: string | null }).sub_activity_name ?? null,
      activity_code: (l as { activity_code?: string | null }).activity_code ?? null,
    }));

    await runAction(`Auto-draft PR for MR ${mr.mr_number}`, () =>
      convertMaterialRequestToPr({
        materialRequest: mr,
        title: titleText,
        requiredDate: requiredDateText,
        financeRequired: false,
        approvalStage: 'pr_team',
        remarks: mr.justification || '',
        lines: prLinesToSave,
        attachments: [],
      }),
    );
  }

  async function handleOpenRfqModal(pr: PurchaseRequisitionRow) {
    setSelectedPrForRfq(pr);
    setSelectedVendorsForRfq([]);
    setBasketSelection({});
    setBasketLines([]);
    setRfqModalOpen(true);

    // Availability is computed server-side, so the basket must be fetched each
    // time the modal opens — another buyer may have tendered these lines since.
    setBasketLoading(true);
    try {
      const lines = await listSourcingBasketLines(pr.id);
      setBasketLines(lines);
      // Pre-select everything still tenderable: the common case is putting the
      // whole remaining requisition out to quotation.
      const preset: BasketSelection = {};
      for (const line of lines) {
        if (isSourceable(line)) preset[line.pr_line_id] = line.available_to_source;
      }
      setBasketSelection(preset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load requisition lines.');
    } finally {
      setBasketLoading(false);
    }
  }

  async function handleSaveRfq(event: FormEvent) {
    event.preventDefault();
    if (!selectedPrForRfq) return;
    if (selectedVendorsForRfq.length === 0) {
      setError('Select at least one vendor to send this RFQ to.');
      return;
    }

    // Client-side validation for fast feedback. The RPC re-validates everything
    // server-side, so this is a convenience, never the control.
    const basketErrors = validateBasket(basketLines, basketSelection);
    if (basketErrors.length > 0) {
      setError(basketErrors[0]);
      return;
    }

    const published = await runAction('RFQ publication', () =>
      createRfqFromPr({
        purchaseRequisitionId: selectedPrForRfq.id,
        vendorIds: selectedVendorsForRfq,
        lines: Object.entries(basketSelection).map(([prLineId, quantity]) => ({
          prLineId,
          quantity,
        })),
        title: selectedPrForRfq.title ?? null,
        dueDate: selectedPrForRfq.required_date ?? null,
      }),
    );

    if (published !== null) {
      setRfqModalOpen(false);
      setSelectedPrForRfq(null);
      setBasketSelection({});
      setBasketLines([]);
    }
  }

  async function handleOpenQuoteModal(rfq: RfqRow) {
    setSelectedRfqForQuote(rfq);
    setSelectedVendorForQuote(rfq.rfq_vendors?.[0]?.vendor_id || '');
    setQuoteNumber('');
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteLeadTimeDays(7);
    setQuoteDeliveryTerms('Delivery at project site store');
    setQuotePaymentTerms('30 days from accepted GRN');
    setQuoteGstDetails('GST extra as applicable');
    setQuoteStoragePath('');
    setQuoteAttachments([]);

    // Phase 1 fix: populate quote lines from rfq_lines (the items actually
    // tendered), NOT from the PR lines. This ensures:
    //   1. Only tendered items show up in the quote form.
    //   2. Each quote line carries rfq_line_id for downstream binding.
    //   3. Quantities reflect the tendered amount, not the full PR quantity.
    try {
      const rfqLines = await listRfqLines(rfq.id);
      if (rfqLines.length > 0) {
        setQuoteLines(
          rfqLines.map((rl) => ({
            item_id: rl.item_id,
            item_description: rl.item_description,
            quantity: rl.rfq_quantity,
            offered_qty: rl.rfq_quantity,
            unit_rate: rl.estimated_rate || 0,
            discount_percent: 0,
            tax_rate: 18,
            rfq_line_id: rl.id,
            remarks: '',
          })),
        );
      } else {
        // Fallback for legacy RFQs that might not have rfq_lines yet
        const linkedPr = data.purchaseRequisitions.find((pr) => pr.id === rfq.purchase_requisition_id);
        const prLinesForQuote = linkedPr?.purchase_requisition_lines ?? [];
        setQuoteLines(
          prLinesForQuote.map((l) => ({
            item_id: l.item_id,
            item_description: l.item_description,
            quantity: Number(l.quantity) || 0,
            offered_qty: Number(l.quantity) || 0,
            unit_rate: Number(l.estimated_rate) || 0,
            discount_percent: 0,
            tax_rate: 18,
            remarks: '',
          })),
        );
      }
    } catch {
      // If rfq_lines fetch fails, fall back to PR lines
      const linkedPr = data.purchaseRequisitions.find((pr) => pr.id === rfq.purchase_requisition_id);
      const prLinesForQuote = linkedPr?.purchase_requisition_lines ?? [];
      setQuoteLines(
        prLinesForQuote.map((l) => ({
          item_id: l.item_id,
          item_description: l.item_description,
          quantity: Number(l.quantity) || 0,
          offered_qty: Number(l.quantity) || 0,
          unit_rate: Number(l.estimated_rate) || 0,
          discount_percent: 0,
          tax_rate: 18,
          remarks: '',
        })),
      );
    }

    setQuoteModalOpen(true);
  }

  async function handleSaveQuote(event: FormEvent) {
    event.preventDefault();
    if (!selectedRfqForQuote) return;

    if (!selectedVendorForQuote) {
      setError('Select the vendor this quotation is from.');
      return;
    }
    if (!quoteNumber.trim()) {
      setError("Enter the vendor's quotation reference number.");
      return;
    }
    if (quoteLines.some((line) => !(line.unit_rate > 0))) {
      setError('Enter a unit rate for every quoted line.');
      return;
    }

    const saved = await runAction('Quotation recording', () =>
      recordQuotation({
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
          discount_percent: l.discount_percent ?? 0,
          tax_rate: l.tax_rate,
          item_id: l.item_id || undefined,
          rfq_line_id: l.rfq_line_id || undefined,
          offered_qty: l.offered_qty ?? l.quantity,
          remarks: l.remarks?.trim() || undefined,
        })),
        attachments: quoteAttachments,
      }),
    );

    if (saved) {
      setQuoteModalOpen(false);
      setSelectedRfqForQuote(null);
    }
  }

  function handleOpenRecommendModal(quote: QuotationRow) {
    setSelectedQuotationForRecommendation(quote);
    setRecommendationReason('');
    setRecommendModalOpen(true);
  }

  async function handleSaveRecommendation(event: FormEvent) {
    event.preventDefault();
    if (!selectedQuotationForRecommendation) return;

    if (recommendationReason.trim().length < 10) {
      setError('Give a commercial justification for this recommendation (at least a sentence).');
      return;
    }

    const prId =
      data.rfqs.find((r) => r.id === selectedQuotationForRecommendation.rfq_id)?.purchase_requisition_id || '';
    if (!prId) {
      setError('This quotation is not linked to a purchase requisition and cannot be recommended.');
      return;
    }

    const saved = await runAction('Vendor recommendation', () =>
      recommendVendorSelection({
        quotation: selectedQuotationForRecommendation,
        purchaseRequisitionId: prId,
        reasonForSelection: recommendationReason,
      }),
    );

    if (saved) {
      setRecommendModalOpen(false);
      setSelectedQuotationForRecommendation(null);
    }
  }

  async function handleApproveSelection(selectionId: string) {
    await runAction('Vendor selection approval', () => approveVendorSelection({ selectionId }));
  }

  function handleOpenPoModal(pr: PurchaseRequisitionRow, quotation?: QuotationRow, selectionId?: string) {
    const quotedLines = quotation?.quotation_lines ?? [];
    const requisitionLines = pr.purchase_requisition_lines ?? [];

    if (quotedLines.length === 0 && requisitionLines.length === 0) {
      setError(
        `PR ${pr.pr_number} has no line items, so a purchase order cannot be raised from it.`,
      );
      return;
    }

    setSelectedPrForPo(pr);
    setSelectedQuotationForPo(quotation || null);
    setSelectedVendorSelectionIdForPo(selectionId || null);
    // Without an approved quotation the vendor must be chosen explicitly.
    setSelectedVendorForPo(quotation?.vendor_id || '');
    setPoDeliveryLocation('Project site store');
    setPoDeliveryDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPoPaymentTerms(quotation?.payment_terms || '30 days from GRN');

    // Prefer the accepted quotation's commercials; otherwise carry the
    // requisition's own estimates. Neither path invents a rate — the previous
    // fallbacks (`estimated_rate || 100`, and a 10-unit ₹100 placeholder line)
    // wrote fictitious values onto real purchase orders.
    if (quotedLines.length > 0) {
      setPoLines(
        quotedLines.map((ql) => ({
          item_id: ql.item_id || undefined,
          item_description: ql.item_description,
          quantity: Number(ql.quantity) || 0,
          unit_rate: Number(ql.unit_rate) || 0,
          tax_rate: Number(ql.tax_rate) || 0,
          line_total: Number(ql.line_total) || 0,
        })),
      );
    } else {
      setPoLines(
        requisitionLines.map((prl) => {
          const quantity = Number(prl.quantity) || 0;
          const rate = Number(prl.estimated_rate) || 0;
          const taxRate = 18;
          return {
            item_id: prl.item_id || undefined,
            item_description: prl.item_description,
            quantity,
            unit_rate: rate,
            tax_rate: taxRate,
            line_total: quantity * rate * (1 + taxRate / 100),
          };
        }),
      );
    }

    setPoModalOpen(true);
  }

  async function handleSavePo(event: FormEvent) {
    event.preventDefault();
    if (!selectedPrForPo) return;

    // The vendor is whoever was quoted or explicitly chosen. This used to fall
    // back to `data.vendors[0]`, silently issuing the order to whichever vendor
    // sorted first.
    const vendorId = selectedQuotationForPo?.vendor_id || selectedVendorForPo;
    if (!vendorId) {
      setError('Select the vendor this purchase order is being issued to.');
      return;
    }
    if (poLines.length === 0 || poLines.some((line) => !(line.quantity > 0))) {
      setError('Every purchase order line needs a quantity greater than zero.');
      return;
    }
    if (poLines.some((line) => !(line.unit_rate > 0))) {
      setError('Every purchase order line needs a unit rate.');
      return;
    }

    const created = await runAction('Purchase order creation', () =>
      generatePurchaseOrder({
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
      }),
    );

    if (created) {
      setPoModalOpen(false);
      setSelectedPrForPo(null);
    }
  }

  /** Saves the full PO form. Previously the form had no persistence path at all. */
  async function handleSavePoForm(formData: FullPoFormState) {
    const activeId = formData.id || (formData as any).po?.id || (formData as any).po_id;
    await runAction('Purchase order save', () =>
      savePurchaseOrderForm({
        id: activeId,
        project_id: selectedProjectId !== 'all' ? selectedProjectId : undefined,
        vendor_id: (formData as unknown as { vendor_id?: string }).vendor_id,
        po_date: (formData as unknown as { po_date?: string }).po_date,
        delivery_location: (formData as unknown as { delivery_location?: string }).delivery_location,
        delivery_date: (formData as unknown as { delivery_date?: string }).delivery_date,
        payment_terms: (formData as unknown as { payment_terms?: string }).payment_terms,
        terms_and_conditions: (formData as unknown as { terms_and_conditions?: string }).terms_and_conditions,
        company_name: (formData as unknown as { company_name?: string }).company_name,
        contractor_name: (formData as unknown as { contractor_name?: string }).contractor_name,
        contract_reference: (formData as unknown as { contract_reference?: string }).contract_reference,
        site_contact_person: (formData as unknown as { site_contact_person?: string }).site_contact_person,
        site_contact_number: (formData as unknown as { site_contact_number?: string }).site_contact_number,
        status: (formData as unknown as { status?: string }).status,
        lines: ((formData as unknown as { lines?: unknown[] }).lines || []).map((raw) => {
          const line = raw as Record<string, unknown>;
          const quantity = Number(line.quantity ?? line.qty ?? 0);
          const rate = Number(line.unit_rate ?? line.rate ?? 0);
          const taxRate = Number(line.tax_rate ?? 0);
          return {
            item_id: (line.item_id as string) || null,
            item_description: String(line.item_description ?? line.description ?? ''),
            quantity,
            unit_rate: rate,
            tax_rate: taxRate,
            line_total: Number(line.line_total ?? quantity * rate * (1 + taxRate / 100)),
          };
        }),
      }),
    );
  }

  async function handleApprovePo(po: PurchaseOrderRow) {
    if (!canApprove) {
      setError('Only management or a project manager may approve a purchase order.');
      return;
    }
    await runAction(`Approval of PO ${po.po_number || ''}`.trim(), () => approveAndSendPurchaseOrder(po));
  }

  async function handleGeneratePoPdf(po: PurchaseOrderRow) {
    await runAction(`PDF generation for PO ${po.po_number || ''}`.trim(), () =>
      generatePurchaseOrderPdf(po),
    );
  }

  async function handleOpenPoPdf(po: PurchaseOrderRow) {
    if (!po.pdf_storage_path) {
      await handleGeneratePoPdf(po);
      return;
    }
    setError(null);
    try {
      const urlResult = await createProcurementDocumentUrl(po.pdf_storage_path);
      if (urlResult.error) {
        setError(`Could not open the PO document: ${urlResult.error.message}`);
        return;
      }
      const signedUrl = urlResult.data?.signedUrl;
      if (!signedUrl) {
        setError('The PO document has no stored file to open yet. Generate it first.');
        return;
      }
      window.open(signedUrl, '_blank');
    } catch (openError) {
      setError(
        `Could not open the PO document: ${openError instanceof Error ? openError.message : 'Unexpected error.'}`,
      );
    }
  }

  function handleOpenGrnModal(po: PurchaseOrderRow) {
    const poLinesForGrn = po.purchase_order_lines ?? [];
    if (poLinesForGrn.length === 0) {
      setError(
        `PO ${po.po_number || ''} has no line items, so goods cannot be received against it.`.trim(),
      );
      return;
    }

    const outstanding = poLinesForGrn.filter(
      (line) => (Number(line.quantity) || 0) > (Number(line.received_qty) || 0),
    );
    if (outstanding.length === 0) {
      setError(`PO ${po.po_number || ''} is already fully received.`.trim());
      return;
    }

    setSelectedPoForGrn(po);
    setGrnReceiptDate(new Date().toISOString().split('T')[0]);
    // Challan and vehicle are transcribed from the supplier's paperwork, so
    // they start blank rather than pre-filled with an invented challan number
    // and the hardcoded vehicle 'GJ-05-AB-1234'.
    setGrnChallanNumber('');
    setGrnChallanDate(new Date().toISOString().split('T')[0]);
    setGrnVehicleNumber('');
    setGrnTransporter('');
    setGrnGodown('Main Site Store');
    setGrnQualityDecision('accepted');
    setGrnRemarks('');

    setGrnLines(
      outstanding.map((pol) => {
        const ordered = Number(pol.quantity) || 0;
        const already = Number(pol.received_qty) || 0;
        const balance = Math.max(ordered - already, 0);
        return {
          purchase_order_line_id: pol.id,
          item_id: pol.item_id || null,
          item_description: pol.item_description,
          ordered_qty: ordered,
          already_received_qty: already,
          received_qty: balance,
          accepted_qty: balance,
          rejected_qty: 0,
          unit_rate: Number(pol.unit_rate) || 0,
          remarks: '',
        };
      }),
    );

    setGrnModalOpen(true);
  }

  /**
   * Saves the goods receipt.
   *
   * Every field the modal collects is now sent. Previously this called
   * `createGrnFromPo(po)` with only the purchase order, so the received,
   * accepted and rejected quantities, the challan number, the vehicle number
   * and the inspection remarks were all discarded — and the UI still reported
   * "Goods Receipt Note created and inventory posted".
   */
  async function handleSaveGrn(event: FormEvent) {
    event.preventDefault();
    if (!selectedPoForGrn) return;

    if (!grnChallanNumber.trim()) {
      setError("Enter the supplier's delivery challan or invoice number.");
      return;
    }
    if (grnLines.every((line) => (Number(line.received_qty) || 0) <= 0)) {
      setError('Enter the received quantity for at least one line.');
      return;
    }
    for (const line of grnLines) {
      const received = Number(line.received_qty) || 0;
      const rejected = Number(line.rejected_qty) || 0;
      const accepted = Number(line.accepted_qty) || 0;
      const balance = Math.max(line.ordered_qty - line.already_received_qty, 0);
      if (received < 0 || rejected < 0 || accepted < 0) {
        setError('Quantities cannot be negative.');
        return;
      }
      if (received > balance) {
        setError(
          `Received quantity for "${line.item_description}" exceeds the outstanding ordered quantity (${balance}).`,
        );
        return;
      }
      if (accepted + rejected > received) {
        setError(
          `Accepted plus rejected quantity for "${line.item_description}" exceeds the received quantity.`,
        );
        return;
      }
    }

    setSavingGrn(true);
    const created = await runAction('Goods receipt', () =>
      createGrnFromPo(selectedPoForGrn, {
        receiptDate: grnReceiptDate,
        challanNumber: grnChallanNumber,
        challanDate: grnChallanDate,
        vehicleNumber: grnVehicleNumber,
        godownName: grnGodown,
        transporterName: grnTransporter,
        qualityDecision: grnQualityDecision,
        remarks: grnRemarks,
        lines: grnLines
          .filter((line) => (Number(line.received_qty) || 0) > 0)
          .map((line) => ({
            purchaseOrderLineId: line.purchase_order_line_id,
            itemId: line.item_id,
            receivedQty: Number(line.received_qty) || 0,
            acceptedQty: Number(line.accepted_qty) || 0,
            rejectedQty: Number(line.rejected_qty) || 0,
            unitRate: Number(line.unit_rate) || 0,
            remarks: line.remarks,
          })),
        // Only an approver's receipt posts straight to inventory; anyone else
        // submits it for approval. The server enforces this either way.
        submitForApproval: !canApprove,
      }),
    );

    setSavingGrn(false);

    if (created) {
      setMessage(
        created.status === 'posted'
          ? `GRN ${created.grnNumber} posted to inventory.`
          : `GRN ${created.grnNumber} submitted for approval.`,
      );
      setGrnModalOpen(false);
      setSelectedPoForGrn(null);
    }
  }

  async function handleApproveGrn(grnId: string) {
    if (!canApprove) {
      setError('Only management or a project manager may post a goods receipt note.');
      return;
    }
    await runAction('GRN posting', () => updateGrnStatus(grnId, 'posted'));
  }

  async function handleCreateBill(grn: GrnRow) {
    const created = await runAction('Purchase bill creation', () => createVendorBillFromGrn(grn));
    if (created) {
      setMessage(
        `Purchase bill ${created.billNumber} raised — three-way match: ${created.matchStatus.replace(/_/g, ' ')}.`,
      );
    }
  }

  // ---------------------------------------------------------------
  // Create PB
  // ---------------------------------------------------------------
  function handleOpenPbModal() {
    setPbSource(billableGrns.length > 0 ? 'grn' : 'manual');
    setPbGrnId(billableGrns[0]?.id || '');
    setPbVendorId('');
    setPbInvoiceValue('');
    setPbTolerance('0');
    setPbSupplierBillNo('');
    setPbSupplierBillDate(new Date().toISOString().split('T')[0]);
    setPbModalOpen(true);
  }

  async function handleCreatePb(event: FormEvent) {
    event.preventDefault();

    if (pbSource === 'grn') {
      const grn = billableGrns.find((option) => option.id === pbGrnId);
      if (!grn) {
        setError('Select the posted GRN this bill is being raised against.');
        return;
      }
      setCreatingPb(true);
      const created = await runAction('Purchase bill creation', () =>
        createVendorBillFromGrn({ id: grn.id } as GrnRow, {
          invoiceValue: pbInvoiceValue ? Number(pbInvoiceValue) : undefined,
          tolerance: Number(pbTolerance) || 0,
          fileName: pbSupplierBillNo.trim() || undefined,
        }),
      );
      setCreatingPb(false);

      if (created) {
        setPbModalOpen(false);
        setActiveTab('billing');
        setMessage(
          `Purchase bill ${created.billNumber} created from GRN ${grn.grn_number} — three-way match: ${created.matchStatus.replace(/_/g, ' ')}. Open it from the Bills tab to complete the remaining sections.`,
        );
      }
      return;
    }

    // Manual bill: no GRN, so a project and supplier must be chosen.
    if (selectedProjectId === 'all') {
      setError('Choose a specific project before raising a purchase bill without a GRN.');
      return;
    }
    if (!pbVendorId) {
      setError('Select the supplier this purchase bill is from.');
      return;
    }

    setCreatingPb(true);
    const created = await runAction('Purchase bill creation', () =>
      savePurchaseBill({
        project_id: selectedProjectId,
        vendor_id: pbVendorId,
        bill_date: new Date().toISOString().split('T')[0],
        bill_received_date: new Date().toISOString().split('T')[0],
        supplier_bill_no: pbSupplierBillNo.trim() || undefined,
        supplier_bill_date: pbSupplierBillDate || undefined,
        subtotal_amount: pbInvoiceValue ? Number(pbInvoiceValue) : 0,
        tax_amount: 0,
        payment_days: 30,
        status: 'draft',
      }),
    );
    setCreatingPb(false);

    if (created) {
      setPbModalOpen(false);
      setActiveTab('billing');
      setMessage(
        `Draft purchase bill ${created.billNumber} created. Open it from the Bills tab to enter the entries and commercial detail.`,
      );
    }
  }

  /** Persists the full purchase-bill form. Only `status` used to be saved. */
  async function handleSaveBillForm(billId: string, payload: Record<string, unknown>) {
    await runAction('Purchase bill save', () => savePurchaseBill({ id: billId, ...payload }));
  }

  async function handleBillStatusChange(billId: string, status: string) {
    if (['approved', 'paid', 'rejected'].includes(status) && !canApproveBills) {
      setError('Only upper management may approve a bill or release payment.');
      return;
    }
    await runAction('Purchase bill status update', () => updateVendorBillStatus(billId, status));
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
          onNavigateToRfq={(rfqId, prId) => {
            setActiveTab('rfq');
            if (prId) setOpenPrIdForRfq(prId);
          }}
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
          openPrId={openPrIdForRfq}
          onClearOpenPrId={() => setOpenPrIdForRfq(null)}
          onSelectRfq={setSelectedRfqId}
          onOpenAwardMatrix={(rfqId) => setAwardMatrixRfqId(rfqId)}
          onCreateRfq={(pr) => handleOpenRfqModal(pr)}
          onRecordQuote={(rfq) => handleOpenQuoteModal(rfq)}
          onRecommend={(quote) => handleOpenRecommendModal(quote)}
          onApproveSelection={(selection) => handleApproveSelection(selection.id)}
          onGeneratePo={(pr, quotation, selection) => handleOpenPoModal(pr, quotation, selection.id)}
          onPrintRfq={(rfqId) => {
            const rfq = data.rfqs.find((r) => r.id === rfqId);
            if (rfq) printRfqReport(rfq);
          }}
          onRefresh={refresh}
          onNavigateToPo={() => setActiveTab('orders')}
        />
      )}

      {activeTab === 'orders' && (
        <POWorkspace
          purchaseOrders={data.purchaseOrders}
          activeRole={activeRole as any}
          vendorOptions={vendorChoices}
          onSavePo={handleSavePoForm}
          onApprove={handleApprovePo}
          onReceiveGoods={handleOpenGrnModal}
          onPrintPo={(po) => printPurchaseOrderReport(po)}
          onRefresh={refresh}
        />
      )}

      {activeTab === 'grn' && (
        <GrnWorkspace
          grns={data.grns}
          activeRole={activeRole as any}
          vendorOptions={vendorChoices}
          purchaseOrders={data.purchaseOrders}
          onApproveGrn={handleApproveGrn}
          onCreateBill={(grnId) => {
            const match = data.grns.find((g) => g.id === grnId);
            if (match) void handleCreateBill(match);
          }}
          onDownloadReport={(grnId) => {
            const match = data.grns.find((g) => g.id === grnId);
            if (match) printGrnReport(match);
          }}
          onRefresh={refresh}
          onError={setError}
        />
      )}

      {activeTab === 'billing' && (
        <BillsWorkspace
          bills={data.vendorBills}
          activeRole={activeRole as any}
          vendorOptions={vendorChoices}
          billableGrns={billableGrns}
          onCreateBill={handleOpenPbModal}
          onSaveBill={handleSaveBillForm}
          onStatusChange={handleBillStatusChange}
          onPrintBill={(billId) => {
            const match = data.vendorBills.find((b) => b.id === billId);
            if (match) printPurchaseBillReport(match);
          }}
          onRefresh={refresh}
          onError={setError}
        />
      )}

      {/* MODALS */}

      {/* 1. RFQ Bid Comparison Matrix Modal (Phase 2) */}
      {selectedRfqId && (
        <RfqBidComparisonMatrix
          rfqId={selectedRfqId}
          onClose={() => setSelectedRfqId(null)}
          onOpenAwardMatrix={() => setAwardMatrixRfqId(selectedRfqId)}
          onRecommendVendor={(vendorId, quotationId) => {
            const quote = data.quotations.find((q) => q.id === quotationId);
            if (quote) {
              setSelectedRfqId(null);
              handleOpenRecommendModal(quote);
            }
          }}
        />
      )}

      {/* 1b. Multi-Vendor Sourcing Award Matrix Modal (Phase 3) */}
      {awardMatrixRfqId && (
        <RfqAwardMatrixModal
          rfqId={awardMatrixRfqId}
          onClose={() => setAwardMatrixRfqId(null)}
          onAwardSaved={() => {
            setAwardMatrixRfqId(null);
            refresh();
          }}
        />
      )}

      {/* 2. Publish RFQ Modal */}
      {rfqModalOpen && selectedPrForRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Publish RFQ ({selectedPrForRfq.pr_number})</h3>
                <p className="text-[11px] text-muted-foreground">
                  Choose the items and quantities to tender, then the vendors to invite.
                </p>
              </div>
              <button type="button" onClick={() => setRfqModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveRfq} className="mt-4 flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto pr-1">
              {/* Sourcing basket — which lines, and how much of each */}
              <div>
                <label className="text-xs font-bold text-foreground">
                  Items to Tender <span className="font-normal text-muted-foreground">(quantities are editable — tender part of a line now and the rest later)</span>
                </label>
                <div className="mt-2">
                  <RfqSourcingBasket
                    lines={basketLines}
                    loading={basketLoading}
                    selection={basketSelection}
                    onChange={setBasketSelection}
                  />
                </div>
              </div>

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
                <label className="text-xs font-bold text-foreground">Commercial Quote Line Rates & Capacity</label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Enter rates, discount %, and offered supply capacity per tendered item.
                </p>
                <div className="mt-2 space-y-3">
                  {quoteLines.map((line, idx) => {
                    const discount = line.discount_percent || 0;
                    const netRate = (line.unit_rate || 0) * (1 - discount / 100);
                    const offered = line.offered_qty ?? line.quantity;
                    const lineTotal = offered * netRate * (1 + (line.tax_rate || 0) / 100);

                    return (
                      <div key={idx} className="rounded-xl border border-border bg-background p-3 text-xs space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                          <span className="font-bold text-foreground">{line.item_description}</span>
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Tender Qty: <strong className="text-foreground">{line.quantity}</strong>
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block">Offered Qty (Capacity)</label>
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              max={line.quantity}
                              placeholder="Offered Qty"
                              value={line.offered_qty ?? line.quantity}
                              onChange={(e) => {
                                const copy = [...quoteLines];
                                copy[idx].offered_qty = Number(e.target.value);
                                setQuoteLines(copy);
                              }}
                              className="w-full rounded border border-border bg-card p-1.5 text-right font-bold text-foreground outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block">Unit Rate (₹)</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Unit Rate (₹)"
                              value={line.unit_rate}
                              onChange={(e) => {
                                const copy = [...quoteLines];
                                copy[idx].unit_rate = Number(e.target.value);
                                setQuoteLines(copy);
                              }}
                              className="w-full rounded border border-border bg-card p-1.5 text-right font-bold text-primary outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block">Disc %</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              placeholder="Disc %"
                              value={line.discount_percent ?? 0}
                              onChange={(e) => {
                                const copy = [...quoteLines];
                                copy[idx].discount_percent = Number(e.target.value);
                                setQuoteLines(copy);
                              }}
                              className="w-full rounded border border-border bg-card p-1.5 text-right outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block">Tax %</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Tax %"
                              value={line.tax_rate}
                              onChange={(e) => {
                                const copy = [...quoteLines];
                                copy[idx].tax_rate = Number(e.target.value);
                                setQuoteLines(copy);
                              }}
                              className="w-full rounded border border-border bg-card p-1.5 text-right outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block">Net Line Total</label>
                            <div className="p-1.5 text-right font-extrabold text-foreground tabular-nums bg-muted/40 rounded border border-border/60">
                              {formatCurrency(lineTotal)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <input
                            type="text"
                            placeholder="Item remarks / brand / delivery notes (optional)"
                            value={line.remarks ?? ''}
                            onChange={(e) => {
                              const copy = [...quoteLines];
                              copy[idx].remarks = e.target.value;
                              setQuoteLines(copy);
                            }}
                            className="w-full rounded border border-border/80 bg-card px-2 py-1 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    );
                  })}
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

      {/* 7. Create Purchase Bill (PB) Modal */}
      {pbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Create Purchase Bill (PB)</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Raise a bill from a posted GRN for automatic three-way matching, or start a bill without one.
                </p>
              </div>
              <button type="button" onClick={() => setPbModalOpen(false)} className="rounded-md p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleCreatePb} className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <label className="text-xs font-bold text-foreground">Bill Source</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPbSource('grn')}
                    disabled={billableGrns.length === 0}
                    className={`rounded-lg border p-3 text-left text-xs transition-all disabled:opacity-50 ${
                      pbSource === 'grn'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="block font-bold">From a posted GRN</span>
                    <span className="mt-0.5 block">
                      {billableGrns.length > 0
                        ? `${billableGrns.length} unbilled GRN(s). PO, GRN and invoice values are matched automatically.`
                        : 'No posted, unbilled GRNs available.'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPbSource('manual')}
                    className={`rounded-lg border p-3 text-left text-xs transition-all ${
                      pbSource === 'manual'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="block font-bold">Without a GRN</span>
                    <span className="mt-0.5 block">
                      Creates a draft bill against a supplier. No three-way match is possible.
                    </span>
                  </button>
                </div>
              </div>

              {pbSource === 'grn' ? (
                <div>
                  <label className="text-xs font-bold text-foreground">Posted GRN</label>
                  <select
                    required
                    value={pbGrnId}
                    onChange={(e) => setPbGrnId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none"
                  >
                    <option value="">Select a GRN…</option>
                    {billableGrns.map((grn) => (
                      <option key={grn.id} value={grn.id}>
                        {grn.grn_number} — {grn.vendor_name}
                        {grn.po_number ? ` (PO ${grn.po_number})` : ''} — {formatCurrency(grn.value)}
                      </option>
                    ))}
                  </select>
                  {pbGrnId && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      The supplier, project, purchase order and line items are taken from the GRN.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-foreground">Supplier</label>
                  <select
                    required
                    value={pbVendorId}
                    onChange={(e) => setPbVendorId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none"
                  >
                    <option value="">Select a supplier…</option>
                    {vendorChoices.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.label}</option>
                    ))}
                  </select>
                  {selectedProjectId === 'all' && (
                    <p className="mt-1.5 text-xs font-semibold text-amber-600">
                      Choose a specific project above before creating a bill without a GRN.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Supplier&rsquo;s Bill / Invoice No.</label>
                  <input
                    type="text" value={pbSupplierBillNo}
                    onChange={(e) => setPbSupplierBillNo(e.target.value)}
                    placeholder="As printed on the supplier invoice"
                    className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Supplier&rsquo;s Bill Date</label>
                  <input
                    type="date" value={pbSupplierBillDate}
                    onChange={(e) => setPbSupplierBillDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Invoice Value (₹)</label>
                  <input
                    type="number" min={0} step="any" value={pbInvoiceValue}
                    onChange={(e) => setPbInvoiceValue(e.target.value)}
                    placeholder={pbSource === 'grn' ? 'Leave blank to use the GRN value' : '0.00'}
                    className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none"
                  />
                </div>
                {pbSource === 'grn' && (
                  <div>
                    <label className="text-xs font-bold text-foreground">Match Tolerance (₹)</label>
                    <input
                      type="number" min={0} step="any" value={pbTolerance}
                      onChange={(e) => setPbTolerance(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      A variance beyond this blocks approval until it is resolved.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  The bill opens in the Bills tab, where the remaining sections can be completed.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPbModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" disabled={creatingPb} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50">
                    {creatingPb ? 'Creating…' : 'Create Purchase Bill'}
                  </button>
                </div>
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
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                <span className="font-bold text-foreground">Supplier: </span>
                <span className="text-muted-foreground">
                  {selectedPoForGrn.vendors?.display_name || selectedPoForGrn.vendors?.legal_name || 'From purchase order'}
                </span>
                <span className="mx-2 text-border">|</span>
                <span className="font-bold text-foreground">Against PO: </span>
                <span className="text-muted-foreground">{selectedPoForGrn.po_number}</span>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground">Receipt Date</label>
                  <input type="date" required value={grnReceiptDate} onChange={(e) => setGrnReceiptDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Delivery Challan / Invoice No.</label>
                  <input type="text" required value={grnChallanNumber} onChange={(e) => setGrnChallanNumber(e.target.value)} placeholder="As printed on the supplier challan" className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Challan Date</label>
                  <input type="date" value={grnChallanDate} onChange={(e) => setGrnChallanDate(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Vehicle Number</label>
                  <input type="text" value={grnVehicleNumber} onChange={(e) => setGrnVehicleNumber(e.target.value)} placeholder="e.g. GJ-05-AB-1234" className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Transporter</label>
                  <input type="text" value={grnTransporter} onChange={(e) => setGrnTransporter(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground">Godown / Store</label>
                  <input type="text" value={grnGodown} onChange={(e) => setGrnGodown(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground">Quality Decision</label>
                <select value={grnQualityDecision} onChange={(e) => setGrnQualityDecision(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none">
                  <option value="accepted">Accepted</option>
                  <option value="pending">Pending inspection</option>
                  <option value="partially_accepted">Partially accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground">Quantity Verification &amp; Inspection</label>
                <div className="mt-2 space-y-2">
                  {grnLines.map((line, idx) => {
                    const balance = Math.max(line.ordered_qty - line.already_received_qty, 0);
                    const overReceived = line.received_qty > balance;
                    const splitInvalid = line.accepted_qty + line.rejected_qty > line.received_qty;
                    return (
                      <div key={line.purchase_order_line_id ?? idx} className="rounded-md border border-border p-2 text-xs">
                        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-bold text-foreground">{line.item_description}</span>
                          <span className="text-muted-foreground">Ordered {line.ordered_qty}</span>
                          <span className="text-muted-foreground">Already received {line.already_received_qty}</span>
                          <span className="font-semibold text-primary">Outstanding {balance}</span>
                          <span className="text-muted-foreground">Rate {formatCurrency(line.unit_rate)}</span>
                        </div>
                        <div className="grid grid-cols-6 items-start gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Received</label>
                            <input
                              type="number" min={0} max={balance} step="any" value={line.received_qty}
                              onChange={(e) => {
                                const received = Number(e.target.value);
                                setGrnLines((prev) => prev.map((l, i) => i === idx
                                  ? { ...l, received_qty: received, accepted_qty: Math.max(received - l.rejected_qty, 0) }
                                  : l));
                              }}
                              className={`w-full rounded border p-1 text-right font-bold ${overReceived ? 'border-rose-500 text-rose-600' : 'border-border'}`}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Rejected</label>
                            <input
                              type="number" min={0} step="any" value={line.rejected_qty}
                              onChange={(e) => {
                                const rejected = Number(e.target.value);
                                setGrnLines((prev) => prev.map((l, i) => i === idx
                                  ? { ...l, rejected_qty: rejected, accepted_qty: Math.max(l.received_qty - rejected, 0) }
                                  : l));
                              }}
                              className="w-full rounded border border-border p-1 text-right font-bold text-rose-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Accepted</label>
                            <input
                              type="number" min={0} step="any" value={line.accepted_qty}
                              onChange={(e) => {
                                const accepted = Number(e.target.value);
                                setGrnLines((prev) => prev.map((l, i) => i === idx ? { ...l, accepted_qty: accepted } : l));
                              }}
                              className={`w-full rounded border p-1 text-right font-bold ${splitInvalid ? 'border-rose-500 text-rose-600' : 'border-border'} text-emerald-600`}
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] text-muted-foreground">Inspection Remark</label>
                            <input
                              type="text" value={line.remarks}
                              onChange={(e) => {
                                const remarks = e.target.value;
                                setGrnLines((prev) => prev.map((l, i) => i === idx ? { ...l, remarks } : l));
                              }}
                              className="w-full rounded border border-border p-1"
                            />
                          </div>
                        </div>
                        {(overReceived || splitInvalid) && (
                          <p className="mt-1 font-semibold text-rose-600">
                            {overReceived
                              ? `Received cannot exceed the outstanding quantity (${balance}).`
                              : 'Accepted plus rejected cannot exceed received.'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground">Overall Remarks</label>
                <textarea rows={2} value={grnRemarks} onChange={(e) => setGrnRemarks(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none" />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {canApprove
                    ? 'This receipt will be posted to inventory on save.'
                    : 'This receipt will be submitted for approval; inventory updates once it is posted.'}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setGrnModalOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted">Cancel</button>
                  <button type="submit" disabled={savingGrn} className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-50">
                    {savingGrn ? 'Saving…' : canApprove ? 'Save & Post GRN' : 'Submit GRN'}
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
