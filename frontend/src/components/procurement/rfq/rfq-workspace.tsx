'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  FileText,
  Plus,
  Send,
  Users,
  CheckCircle2,
  ListChecks,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  PurchaseRequisitionRow,
  RfqRow,
  QuotationRow,
  VendorSelectionRow,
  PurchaseOrderRow,
  VendorRow,
} from '@/lib/procurement';
import { generatePurchaseOrder, generatePurchaseOrdersFromRfqForm, saveRfqFormDataToSupabase } from '@/lib/procurement';
import { RfqStatsBar } from './rfq-stats-bar';
import { RfqFilterBar, DEFAULT_RFQ_FILTERS, type RfqFiltersState } from './rfq-filter-bar';
import { RfqTableView } from './rfq-table-view';
import { RfqForm, toSupplierOptions, type RfqFormState } from './rfq-form';
import { AiPdfQuotationComparison } from './ai-pdf-quotation-comparison';

interface RFQWorkspaceProps {
  prs: PurchaseRequisitionRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  purchaseOrders: PurchaseOrderRow[];
  /** Live vendor registry, used for the RFQ supplier picker and Direct PO. */
  vendors?: VendorRow[];
  projectOptions: { id: string; name: string }[];
  activeRole: 'UPPER_MANAGEMENT' | 'PROJECT_MANAGER' | 'PR_TEAM' | string;
  selectedRfqId: string | null;
  openPrId?: string | null;
  onClearOpenPrId?: () => void;
  onSelectRfq: (id: string | null) => void;
  onOpenAwardMatrix?: (rfqId: string) => void;
  onCreateRfq: (pr: PurchaseRequisitionRow) => void;
  onRecordQuote: (row: RfqRow) => void;
  onRecommend: (row: QuotationRow) => void;
  onApproveSelection: (selection: VendorSelectionRow) => void;
  onGeneratePo: (pr: PurchaseRequisitionRow, quotation: QuotationRow, selection: VendorSelectionRow) => void;
  /** Generates the report-format RFQ PDF for the RFQ raised against a PR. */
  onPrintRfq?: (rfqId: string) => void;
  onRefresh?: () => void;
  onNavigateToPo?: () => void;
}

export function RFQWorkspace(props: RFQWorkspaceProps) {
  const {
    prs,
    rfqs,
    quotations,
    selections,
    purchaseOrders,
    vendors = [],
    projectOptions,
    activeRole,
    selectedRfqId,
    openPrId,
    onClearOpenPrId,
    onSelectRfq,
    onOpenAwardMatrix,
    onCreateRfq,
    onRecordQuote,
    onRecommend,
    onApproveSelection,
    onGeneratePo,
    onPrintRfq,
    onRefresh,
    onNavigateToPo,
  } = props;

  const [viewMode, setViewMode] = useState<'list' | 'form' | 'ai_pdf' | 'workbench'>('list');
  const [openQuotationRfqId, setOpenQuotationRfqId] = useState<string | null>(null);
  const [awardMatrixRfqId, setAwardMatrixRfqId] = useState<string | null>(null);
  const [poNotification, setPoNotification] = useState<string | null>(null);

  // Form active state
  const [activeFormPr, setActiveFormPr] = useState<PurchaseRequisitionRow | null>(null);
  const [filters, setFilters] = useState<RfqFiltersState>(DEFAULT_RFQ_FILTERS);

  useEffect(() => {
    if (openPrId) {
      const pr = prs.find((p) => p.id === openPrId);
      if (pr) {
        setActiveFormPr(pr);
        setViewMode('form');
      }
      onClearOpenPrId?.();
    }
  }, [openPrId, prs, onClearOpenPrId]);

  // STRICTLY FILTER FOR APPROVED PRS ONLY (and PRs with active RFQs)
  const approvedPrs = useMemo(() => {
    return prs.filter((pr) => pr.status === 'approved' || rfqs.some((r) => r.purchase_requisition_id === pr.id));
  }, [prs, rfqs]);

  // Filtered Approved PR Rows
  const filteredApprovedPrs = useMemo(() => {
    let result = [...approvedPrs];

    // Quick Tabs
    if (filters.tab === 'ready_for_rfq') {
      result = result.filter((pr) => !rfqs.some((r) => r.purchase_requisition_id === pr.id));
    } else if (filters.tab === 'rfq_sent') {
      result = result.filter((pr) => rfqs.some((r) => r.purchase_requisition_id === pr.id));
    } else if (filters.tab === 'quotes_received') {
      result = result.filter((pr) => {
        const linkedRfq = rfqs.find((r) => r.purchase_requisition_id === pr.id);
        return linkedRfq && quotations.some((q) => q.rfq_id === linkedRfq.id);
      });
    } else if (filters.tab === 'finalized') {
      result = result.filter((pr) => selections.some((s) => s.purchase_requisition_id === pr.id && s.status === 'approved'));
    }

    // Search query
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (pr) =>
          (pr.pr_number || '').toLowerCase().includes(q) ||
          (pr.company_name || '').toLowerCase().includes(q) ||
          (pr.activity_name || '').toLowerCase().includes(q) ||
          pr.purchase_requisition_lines?.some(
            (l) => (l.item_description || '').toLowerCase().includes(q) || (l.source_mr_number || '').toLowerCase().includes(q)
          )
      );
    }

    // Project filter
    if (filters.projectId !== 'all') {
      result = result.filter((pr) => pr.project_id === filters.projectId);
    }

    // Sort
    if (filters.sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at || b.requested_date || 0).getTime() - new Date(a.created_at || a.requested_date || 0).getTime());
    } else if (filters.sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at || a.requested_date || 0).getTime() - new Date(b.created_at || b.requested_date || 0).getTime());
    } else if (filters.sortBy === 'amount_desc') {
      result.sort((a, b) => Number(b.total_amount || b.subtotal_amount || 0) - Number(a.total_amount || a.subtotal_amount || 0));
    }

    return result;
  }, [approvedPrs, rfqs, quotations, selections, filters]);

  const canApprove =
    activeRole === 'UPPER_MANAGEMENT' ||
    activeRole === 'PROJECT_MANAGER' ||
    activeRole === 'PROJECT_DIRECTOR' ||
    activeRole === 'ADMIN';

  const handleOpenFormForPr = (pr: PurchaseRequisitionRow) => {
    setActiveFormPr(pr);
    setViewMode('form');
  };

  const handleFormSubmit = async (formData: RfqFormState, shouldGeneratePo: boolean) => {
    if (!activeFormPr) return;

    // Map RFQ status → PR status for Supabase update
    const prStatusMap: Record<string, string> = {
      'Auto-Draft': 'approved',
      'Draft': 'approved',
      'RFQ Sent': 'rfq_sent',
      'Quotes Received': 'quotes_received',
      'Under Evaluation': 'under_evaluation',
      'Awarded': 'vendor_selected',
      'PO Issued': 'po_issued',
      'Cancelled': 'approved',
    };
    const nextPrStatus = prStatusMap[formData.status] || 'approved';

    // Persist RFQ header, selected suppliers, line item rates, and delivery address to Supabase
    try {
      await saveRfqFormDataToSupabase({
        pr: activeFormPr,
        formData,
        nextPrStatus,
      });
      await onRefresh?.();
    } catch (err) {
      console.error('Error saving RFQ data to Supabase:', err);
    }

    if (shouldGeneratePo) {
      try {
        const res = await generatePurchaseOrdersFromRfqForm({
          pr: activeFormPr,
          formData,
        });
        await onRefresh?.();
        const poText = res.poNumbers.length > 0 ? res.poNumbers.join(', ') : 'Draft PO';
        setPoNotification(`Purchase Order ${poText} created successfully! Redirecting to Purchase Orders...`);
        setTimeout(() => {
          setPoNotification(null);
          onNavigateToPo?.();
        }, 1500);
      } catch (err) {
        console.error('Error generating POs from RFQ form:', err);
      }

      setViewMode('list');
      setActiveFormPr(null);
    } else {
      activeFormPr.status = nextPrStatus as any;
    }
  };

  return (
    <div className="space-y-4 relative">
      {/* Toast Notification Banner */}
      {poNotification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/90 text-emerald-200 px-4 py-3 shadow-2xl backdrop-blur-md">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-bold text-white">Success</p>
            <p className="text-[11px] text-emerald-300/80">{poNotification}</p>
          </div>
        </div>
      )}
      {/* View Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs">
          <Send className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground font-heading">RFQ &amp; Vendor Sourcing Workspace</span>
          <span className="text-muted-foreground">• Showing Approved Requisitions ({approvedPrs.length})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Requisition Table View */}
          <button
            onClick={() => {
              setViewMode('list');
              setActiveFormPr(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${
              viewMode === 'list'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> Requisition Table View ({filteredApprovedPrs.length})
          </button>

          {/* AI PDF Quotation Extractor & Comparison View */}
          <button
            onClick={() => {
              setViewMode('ai_pdf');
              setActiveFormPr(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${
              viewMode === 'ai_pdf'
                ? 'border-purple-600 bg-purple-600 text-white shadow-xs'
                : 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> AI PDF Quotation Comparison
          </button>

        </div>
      </div>

      {viewMode === 'form' && activeFormPr ? (
        (() => {
          // Print is only meaningful once an RFQ exists for this PR — a brand-new,
          // unsaved RFQ has no id to render a report from.
          const existingRfq = rfqs.find((r) => r.purchase_requisition_id === activeFormPr.id);
          return (
            <RfqForm
              approvedPr={activeFormPr}
              suppliers={toSupplierOptions(vendors)}
              onSubmit={handleFormSubmit}
              onCancel={() => {
                setViewMode('list');
                setActiveFormPr(null);
              }}
            />
          );
        })()
      ) : viewMode === 'ai_pdf' ? (
        <AiPdfQuotationComparison />
      ) : (
        <>
          {/* Daily RFQ Operational Reminders & Stats Bar */}
          <RfqStatsBar
            approvedPrs={approvedPrs}
            rfqs={rfqs}
            quotations={quotations}
            selections={selections}
            onSelectTab={(tab) => setFilters((prev) => ({ ...prev, tab }))}
          />

          {/* Search, Filter & Quick Tabs Bar */}
          <RfqFilterBar
            filters={filters}
            onChangeFilters={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            projectOptions={projectOptions}
            totalCount={approvedPrs.length}
            filteredCount={filteredApprovedPrs.length}
          />

          {/* Structured Single-Row Table View */}
          <RfqTableView
            approvedPrs={filteredApprovedPrs}
            rfqs={rfqs}
            quotations={quotations}
            selections={selections}
            onCreateRfq={handleOpenFormForPr}
            onRecordQuote={onRecordQuote}
            onViewComparison={(rfqId) => {
              onSelectRfq(rfqId);
            }}
            onOpenAwardMatrix={onOpenAwardMatrix}
          />
        </>
      )}
    </div>
  );
}
