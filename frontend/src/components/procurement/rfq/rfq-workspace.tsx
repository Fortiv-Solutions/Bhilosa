'use client';

import { useState, useMemo, useCallback } from 'react';
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
} from '@/lib/procurement';
import { RfqStatsBar } from './rfq-stats-bar';
import { RfqFilterBar, DEFAULT_RFQ_FILTERS, type RfqFiltersState } from './rfq-filter-bar';
import { RfqTableView } from './rfq-table-view';
import { RfqWorkbench } from '../rfq-workbench';
import { RfqForm, type RfqFormState } from './rfq-form';
import { AiPdfQuotationComparison } from './ai-pdf-quotation-comparison';

interface RFQWorkspaceProps {
  prs: PurchaseRequisitionRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  purchaseOrders: PurchaseOrderRow[];
  projectOptions: { id: string; name: string }[];
  activeRole: 'UPPER_MANAGEMENT' | 'PROJECT_MANAGER' | 'PR_TEAM' | string;
  selectedRfqId: string | null;
  onSelectRfq: (id: string | null) => void;
  onCreateRfq: (pr: PurchaseRequisitionRow) => void;
  onRecordQuote: (row: RfqRow) => void;
  onRecommend: (row: QuotationRow) => void;
  onApproveSelection: (selection: VendorSelectionRow) => void;
  onGeneratePo: (pr: PurchaseRequisitionRow, quotation: QuotationRow, selection: VendorSelectionRow) => void;
}

export function RFQWorkspace(props: RFQWorkspaceProps) {
  const {
    prs,
    rfqs,
    quotations,
    selections,
    purchaseOrders,
    projectOptions,
    activeRole,
    selectedRfqId,
    onSelectRfq,
    onCreateRfq,
    onRecordQuote,
    onRecommend,
    onApproveSelection,
    onGeneratePo,
  } = props;

  const [viewMode, setViewMode] = useState<'list' | 'form' | 'ai_pdf' | 'workbench'>('list');
  const [activeFormPr, setActiveFormPr] = useState<PurchaseRequisitionRow | null>(null);
  const [filters, setFilters] = useState<RfqFiltersState>(DEFAULT_RFQ_FILTERS);

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

  const handleFormSubmit = (formData: RfqFormState, isDirectPo: boolean) => {
    if (isDirectPo && activeFormPr) {
      // Direct PO Workflow: Trigger PO generation directly
      const dummyQuote: QuotationRow = {
        id: `quote-direct-${Date.now()}`,
        rfq_id: `rfq-direct-${Date.now()}`,
        vendor_id: 'v-1',
        vendor_name: formData.contractor_name || 'UltraTech Direct Vendor',
        quotation_number: `QT-DIRECT-${Date.now()}`,
        subtotal_amount: formData.items.reduce((s, i) => s + i.quantity * i.previous_rate, 0),
        tax_amount: formData.items.reduce((s, i) => s + i.quantity * i.previous_rate * 0.18, 0),
        total_amount: formData.items.reduce((s, i) => s + i.quantity * i.previous_rate * 1.18, 0),
        status: 'accepted',
        quotation_lines: formData.items.map((i) => ({
          id: `line-${i.key}`,
          quotation_id: `quote-direct-${Date.now()}`,
          item_id: i.item_id,
          item_description: i.item_description,
          quantity: i.quantity,
          unit_rate: i.previous_rate,
          tax_rate: 18,
          subtotal: i.quantity * i.previous_rate,
          tax_amount: i.quantity * i.previous_rate * 0.18,
          total_amount: i.quantity * i.previous_rate * 1.18,
        })),
      };

      const dummySelection: VendorSelectionRow = {
        id: `sel-direct-${Date.now()}`,
        purchase_requisition_id: activeFormPr.id,
        selected_vendor_id: 'v-1',
        selected_quotation_id: dummyQuote.id,
        selection_reason: 'Direct PO Process Selected in RFQ Form',
        status: 'approved',
        vendor_quotations: dummyQuote,
      };

      onGeneratePo(activeFormPr, dummyQuote, dummySelection);
      setViewMode('list');
      setActiveFormPr(null);
    } else if (activeFormPr) {
      // Quotation Request Workflow: RFQ Dispatched to Suppliers
      setViewMode('list');
      setActiveFormPr(null);
    }
  };

  return (
    <div className="space-y-4">
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

          {/* Quotation Comparison Workbench View */}
          {rfqs.length > 0 && (
            <button
              onClick={() => {
                setViewMode('workbench');
                setActiveFormPr(null);
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${
                viewMode === 'workbench'
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Quotation Comparison Workbench ({rfqs.length})
            </button>
          )}
        </div>
      </div>

      {viewMode === 'form' && activeFormPr ? (
        <RfqForm
          approvedPr={activeFormPr}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setViewMode('list');
            setActiveFormPr(null);
          }}
        />
      ) : viewMode === 'ai_pdf' ? (
        <AiPdfQuotationComparison />
      ) : viewMode === 'list' ? (
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
              setViewMode('workbench');
            }}
          />
        </>
      ) : (
        <RfqWorkbench
          rfqs={rfqs}
          prs={prs}
          quotations={quotations}
          selections={selections}
          purchaseOrders={purchaseOrders}
          selectedRfqId={selectedRfqId}
          onSelectRfq={onSelectRfq}
          onRecordQuote={onRecordQuote}
          onRecommend={onRecommend}
          onApproveSelection={onApproveSelection}
          onGeneratePo={onGeneratePo}
          canApprove={canApprove}
        />
      )}
    </div>
  );
}
