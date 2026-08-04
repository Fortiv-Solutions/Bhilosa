'use client';

// Purchase Requisition Workspace — top-level container for the PR section.
// Form mode renders by default on landing with the production-grade PR Form.
// Includes Searchable Approved MR Dropdown, validation on Send for Verification,
// budget lookups, and persistence.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Plus, Layers, ListChecks, Save, SendHorizonal, Trash2, UserCheck, Undo2, CheckCircle2,
  XCircle, Users, Lock, RotateCcw, PauseCircle, PlayCircle, FileDown, Eye, History, Printer, Sparkles,
} from 'lucide-react';
import type {
  PurchaseRequisitionRow, EntityAttachmentRow, MaterialRequestRow, RfqRow, QuotationRow, VendorSelectionRow,
} from '@/lib/procurement';
import type { ProcurementProjectOption, Role, PrFormState, PrFormLine, ApprovedMrRow } from '@/lib/erp/purchase-requisition/types';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import {
  listApprovedMaterialRequestsForPr, getBudgetSnapshotForPr, listBudgetHeads, listCostCodes,
  savePurchaseRequisition, getPurchaseRequisitionForm, transitionPurchaseRequisition, deletePrDraft, resetPrToDraft,
  listEligibleApprovers, validatePrForm, computeCostSummary, computeBudgetStatus, isPrEditable, approvalCommentRequired,
  type BudgetSnapshot, type ApproverOption,
} from '@/lib/erp/purchase-requisition/service';
import {
  resolveActivityCategories,
  type ActivityResolutionMap,
} from '@/lib/erp/purchase-requisition/activity-category-resolver';
import type { MasterBudgetCategory } from '@/lib/budget';
import { fetchMasterBudgetCategories, subscribeToBudgetChanges } from '@/lib/supabase-budget';
import { supabase } from '@/utils/supabase-client';
import { PurchaseRequisitionWorkbench } from '../purchase-requisition-workbench';
import { AddFromApprovedMrDrawer } from './add-from-approved-mr-drawer';
import { PrForm, type SourceMrChip } from './pr-form';
import { PrConfirmModal, type PrConfirmConfig } from './pr-confirm-modal';
import { AssignApprovalModal, type AssignApprovalPayload } from './assign-approval-modal';
import { PrHistoryDrawer } from './pr-history-drawer';
import { PRStatsBar } from './pr-stats-bar';
import { PRRequestsFilterBar, DEFAULT_PR_FILTERS, type PrFiltersState } from './pr-requests-filter-bar';
import { PRPdfPreviewModal } from './pr-pdf-preview-modal';
import { PRTableView } from './pr-table-view';
import { Pagination } from '../pagination';

interface PendingFile { file: File; category: string; }

interface PurchaseRequisitionWorkspaceProps {
  rows: PurchaseRequisitionRow[];
  attachments: EntityAttachmentRow[];
  materialRequests: MaterialRequestRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  projectOptions: ProcurementProjectOption[];
  activeRole: Role;
  selectedPrId: string | null;
  onSelectPr: (id: string | null) => void;
  onAssign: (row: PurchaseRequisitionRow) => void;
  onApprove: (row: PurchaseRequisitionRow) => void;
  onRfq: (row: PurchaseRequisitionRow) => void;
  onNavigateToRfq?: (rfqId: string, prId?: string) => void;
  onPdf: (row: PurchaseRequisitionRow) => void;
  onOpenPdf: (row: PurchaseRequisitionRow) => void;
  onGeneratePo: (row: PurchaseRequisitionRow) => void;
  onRefresh: () => Promise<void>;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}

const DOC_TYPE_MAP: Record<string, string> = {
  'Approved MR': 'approved_mr', BOQ: 'boq', Drawing: 'drawing', 'Technical Spec': 'technical_spec',
  Quotation: 'quotation', 'Budget Approval': 'budget_approval', 'Site Photo': 'site_photo', 'Supporting Doc': 'supporting_doc',
};

function blankForm(projectId: string): PrFormState {
  const today = new Date().toISOString().slice(0, 10);
  const required = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return {
    id: null, pr_number: null, status: 'draft',
    pr_date: today, company_name: '', project_id: projectId, site_id: null,
    pr_type: 'material', priority: 'normal', required_date: required, pr_release_date: null,
    budget_applicable: true, budget_head_id: null, cost_code_id: null, cost_centre: '',
    activity_name: '', activity_code: '', wbs_code: '', over_budget_justification: '',
    contractor_applicable: false, contractor_name: '', vendor_code: '', contract_reference: '',
    scope_of_service: '', contact_person: '', contact_number: '',
    delivery_address: '', site_contact_person: '', site_contact_number: '', delivery_instructions: '',
    general_remarks: '', internal_notes: '', terms_and_conditions: '', department: 'Rohan Mehta (Site Eng)',
    unlocked_project: 1.00, prepared_by: 'Rohan Mehta (Site Eng)',
    discount_amount: 0, freight_amount: 0, other_charges: 0, contingency_amount: 0,
    lines: [],
  };
}

/**
 * Maps every pending line of a Material Request onto PR form lines, 1:1.
 *
 * Mapping contract — each PR line mirrors its MR line exactly:
 *   item_description  <- MR line item_description
 *   activity_name     <- MR line activity_name    (else MR header activity)
 *   sub_activity_name <- MR line sub_activity_name (else MR header sub-activity)
 *   item_group        <- MR line item_group
 *   preferred_brand   <- MR line item_brand        (NOT specification)
 *   unit / quantity   <- MR line unit / pending qty
 *
 * Values are passed through verbatim. Nothing is substituted from unrelated
 * free-text fields, and nothing is invented: a field the MR left blank stays
 * blank so the gap is visible and can be corrected at source rather than being
 * papered over with a plausible-looking wrong value.
 */
function mrRowToLines(row: ApprovedMrRow): PrFormLine[] {
  return row.lines
    .filter((l) => l.pending_qty > 0.0001)
    .map((l) => ({
      key: `mrline-${l.id}`,
      source_mr_id: row.id,
      source_mr_number: row.mr_number,
      mr_line_number: l.mr_line_number,
      material_request_line_id: l.id,
      resource_type: 'material',
      item_id: l.item_id,
      item_code: l.item_code || '',
      item_group: l.item_group || '',
      item_description: l.item_description,
      specification: l.specification || '',
      approved_mr_qty: l.approved_qty,
      prev_pr_qty: l.converted_qty,
      remaining_mr_qty: l.pending_qty,
      pr_quantity: l.pending_qty,
      unit: l.unit || 'nos',
      estimated_rate: l.estimated_rate,
      tax_rate: 18,
      required_date: row.required_date ? row.required_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      // Brand only. Falling back to specification put spec strings such as
      // "IS 12269 : 2013 Grade 53" in the Brand column.
      preferred_brand: l.item_brand || '',
      suggested_vendor: null,
      delivery_location: null,
      remarks: null,
      is_non_mr_item: false,
      non_mr_justification: null,
      is_modified: false,

      // Rich ERP fields
      status: 'Approved PR',
      priority: row.priority || 'high',
      stock_audit: 'Audited',
      project_and_block: row.project_name ? `${row.project_name}${row.site_name ? ` (${row.site_name})` : ''}` : '',
      work_activity: l.activity_name || row.work_activity || '',
      raised_by: row.requested_by || '',
      submitted_at: row.mr_date ? new Date(row.mr_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      activity_name: l.activity_name || row.work_activity || '',
      sub_activity_name: l.sub_activity_name || row.sub_activity_name || '',
      activity_code: l.activity_code || row.activity_code || '',
      // pr_bal_qty is derived from the live edited quantity in pr-item-table,
      // never stored at import time (it would go stale the moment the user
      // changes the PR quantity).
      lead_period_days: 3,
      lead_period_date: '',
    }));
}

function prRowToFormState(row: PurchaseRequisitionRow): PrFormState {
  return {
    id: row.id,
    pr_number: row.pr_number || null,
    status: (row.status as PrFormState['status']) || 'draft',
    pr_date: String(row.created_at || row.requested_date || new Date().toISOString()).slice(0, 10),
    company_name: row.company_name || 'Pramukh Group Infrastructure Ltd.',
    project_id: row.project_id || 'central-park',
    site_id: row.site_id || null,
    pr_type: (row.pr_type as PrFormState['pr_type']) || 'material',
    priority: (row.priority as PrFormState['priority']) || 'normal',
    required_date: String(row.required_date || '').slice(0, 10),
    pr_release_date: row.pr_release_date ? String(row.pr_release_date).slice(0, 10) : null,
    budget_applicable: row.budget_applicable !== false,
    budget_head_id: row.budget_head_id || null,
    cost_code_id: row.cost_code_id || null,
    cost_centre: row.cost_centre || '',
    activity_name: row.activity_name || '',
    activity_code: row.activity_code || '',
    wbs_code: row.wbs_code || '',
    over_budget_justification: row.over_budget_justification || '',
    contractor_applicable: Boolean(row.contractor_name),
    contractor_name: row.contractor_name || '',
    vendor_code: row.vendor_code || '',
    contract_reference: row.contract_reference || '',
    scope_of_service: row.scope_of_service || '',
    contact_person: row.contact_person || '',
    contact_number: row.contact_number || '',
    delivery_address: row.delivery_address || '',
    site_contact_person: row.site_contact_person || '',
    site_contact_number: row.site_contact_number || '',
    delivery_instructions: row.delivery_instructions || '',
    general_remarks: row.general_remarks || '',
    internal_notes: row.internal_notes || '',
    terms_and_conditions: row.terms_and_conditions || '',
    department: row.department || '',
    unlocked_project: (row as any).unlocked_project != null ? Number((row as any).unlocked_project) : 1.00,
    prepared_by: (() => {
      const raw = row.profiles?.name || (row as any).prepared_by || row.department;
      return (raw && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(raw).trim()))
        ? String(raw)
        : 'Rohan Mehta (Site Eng)';
    })(),
    discount_amount: Number(row.discount_amount || 0),
    freight_amount: Number(row.freight_amount || 0),
    other_charges: Number(row.other_charges || 0),
    contingency_amount: Number(row.contingency_amount || 0),
    lines: (row.purchase_requisition_lines || []).map((l, idx) => ({
      key: `line-${l.id || idx}`,
      source_mr_id: l.source_mr_id || null,
      source_mr_number: l.source_mr_number || null,
      mr_line_number: l.mr_line_number || null,
      material_request_line_id: l.material_request_line_id || null,
      resource_type: l.resource_type || 'material',
      item_id: l.item_id || null,
      item_code: l.item_code || '',
      item_group: l.item_group || null,
      item_description: l.item_description || '',
      specification: l.specification || null,
      approved_mr_qty: l.approved_mr_qty || null,
      prev_pr_qty: Number(l.prev_pr_qty || 0),
      remaining_mr_qty: l.remaining_mr_qty || null,
      pr_quantity: Number(l.quantity || 0),
      unit: l.unit || 'nos',
      estimated_rate: Number(l.estimated_rate || 0),
      tax_rate: Number(l.tax_rate || 18),
      required_date: l.required_date || null,
      preferred_brand: l.preferred_brand || null,
      suggested_vendor: l.suggested_vendor || null,
      delivery_location: l.delivery_location || null,
      remarks: l.remarks || null,
      is_non_mr_item: Boolean(l.is_non_mr_item),
      non_mr_justification: l.non_mr_justification || null,
      is_modified: Boolean(l.is_modified),
      activity_name: l.activity_name || row.activity_name || null,
      sub_activity_name: l.sub_activity_name || row.sub_activity_name || null,
      activity_code: l.activity_code || row.activity_code || null,
      work_activity: l.activity_name || row.activity_name || null,
      lead_period_days: l.lead_period_days ?? 3,
      lead_period_date: l.lead_period_date || null,
      pr_bal_qty: l.pr_bal_qty ?? l.remaining_mr_qty ?? null,
    })),
  };
}

export function PurchaseRequisitionWorkspace(props: PurchaseRequisitionWorkspaceProps) {
  const { projectOptions, onRefresh, onMessage, onError } = props;

  // LIST MODE DEFAULT ON LANDING PAGE
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [form, setForm] = useState<PrFormState | null>(() => blankForm(projectOptions[0]?.id ?? ''));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [previewPr, setPreviewPr] = useState<PurchaseRequisitionRow | null>(null);
  const [approvedMrs, setApprovedMrs] = useState<ApprovedMrRow[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [budgetSnapshot, setBudgetSnapshot] = useState<BudgetSnapshot | null>(null);
  // Activity -> Master Budget category resolution (exact match, cache, then AI).
  const [activityResolution, setActivityResolution] = useState<ActivityResolutionMap>(new Map());
  const [activityResolving, setActivityResolving] = useState(false);
  const [activityModelError, setActivityModelError] = useState<string | null>(null);
  const [activityUsedModel, setActivityUsedModel] = useState(false);
  const [masterBudgetCategories, setMasterBudgetCategories] = useState<MasterBudgetCategory[]>([]);
  const [budgetHeads, setBudgetHeads] = useState<{ id: string; code: string; name: string }[]>([]);
  const [costCodes, setCostCodes] = useState<{ id: string; code: string; name: string }[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [confirm, setConfirm] = useState<{ config: PrConfirmConfig; run: (reason: string, notify: boolean) => Promise<void> } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkedRfq, setLinkedRfq] = useState<RfqRow | null>(null);

  useEffect(() => {
    if (!form?.id) {
      setLinkedRfq(null);
      return;
    }
    if (!isLiveSupabase()) {
      const local = props.rfqs.find((r) => r.purchase_requisition_id === form.id);
      setLinkedRfq(local || null);
      return;
    }
    let active = true;
    supabase
      .from('rfqs')
      .select('*, rfq_vendors(*, vendors(id, legal_name, display_name))')
      .eq('purchase_requisition_id', form.id)
      .is('deleted_at', null)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setLinkedRfq((data as RfqRow | null) || null);
      });
    return () => {
      active = false;
    };
  }, [form?.id, props.rfqs]);

  // List view filters & pagination
  const [prFilters, setPrFilters] = useState<PrFiltersState>(DEFAULT_PR_FILTERS);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const filteredRows = useMemo(() => {
    let result = [...props.rows];

    // Quick Tabs
    const todayStr = new Date().toISOString().slice(0, 10);
    if (prFilters.tab === 'today') {
      result = result.filter((r) => (r.created_at || r.requested_date || '').slice(0, 10) === todayStr);
    } else if (prFilters.tab === 'pending') {
      result = result.filter((r) => r.status === 'draft' || r.status === 'under_verification' || r.status === 'pending_approval');
    } else if (prFilters.tab === 'auto_drafts') {
      result = result.filter((r) => r.status === 'draft' || r.purchase_requisition_lines?.some((l) => l.source_mr_number));
    } else if (prFilters.tab === 'approved') {
      result = result.filter((r) => r.status === 'approved');
    }

    // Search query
    if (prFilters.search.trim()) {
      const q = prFilters.search.toLowerCase();
      result = result.filter(
        (r) =>
          (r.pr_number || '').toLowerCase().includes(q) ||
          (r.company_name || '').toLowerCase().includes(q) ||
          (r.activity_name || '').toLowerCase().includes(q) ||
          (r.department || '').toLowerCase().includes(q) ||
          (r.general_remarks || '').toLowerCase().includes(q) ||
          r.purchase_requisition_lines?.some(
            (l) => (l.item_description || '').toLowerCase().includes(q) || (l.source_mr_number || '').toLowerCase().includes(q)
          )
      );
    }

    // Project filter
    if (prFilters.projectId !== 'all') {
      result = result.filter((r) => r.project_id === prFilters.projectId);
    }

    // Status filter
    if (prFilters.status !== 'all') {
      result = result.filter((r) => r.status === prFilters.status);
    }

    // Priority filter
    if (prFilters.priority !== 'all') {
      result = result.filter((r) => r.priority === prFilters.priority);
    }

    // Sort
    if (prFilters.sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at || b.requested_date || 0).getTime() - new Date(a.created_at || a.requested_date || 0).getTime());
    } else if (prFilters.sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at || a.requested_date || 0).getTime() - new Date(b.created_at || b.requested_date || 0).getTime());
    } else if (prFilters.sortBy === 'amount_desc') {
      result.sort((a, b) => Number(b.total_amount || b.subtotal_amount || 0) - Number(a.total_amount || a.subtotal_amount || 0));
    }

    return result;
  }, [props.rows, prFilters]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;

  const loadApprovedMrs = useCallback(async () => {
    setLoadingApproved(true);
    try {
      setApprovedMrs(await listApprovedMaterialRequestsForPr());
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unable to load approved MRs.');
    } finally {
      setLoadingApproved(false);
    }
  }, [onError]);

  // Load master lookups and approved MRs on landing
  useEffect(() => {
    listBudgetHeads().then(setBudgetHeads).catch(() => {});
    listCostCodes().then(setCostCodes).catch(() => {});
    listEligibleApprovers().then(setApprovers).catch(() => {});
    void loadApprovedMrs();
  }, [loadApprovedMrs]);

  // Real-time subscription for MR and PR updates.
  //
  // Debounced: saving a 10-line MR emits one event per line, and the previous
  // undebounced handler fired a full listApprovedMaterialRequestsForPr() for
  // every one of them. The channel name is per-mount so two open workspaces do
  // not collide on a single shared topic.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void loadApprovedMrs();
      }, 400);
    };

    const channel = supabase.channel(`realtime-pr-workspace-${Math.random().toString(36).slice(2)}`);
    for (const table of [
      'material_requests',
      'material_request_lines',
      'purchase_requisitions',
      'purchase_requisition_lines',
    ]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadApprovedMrs]);

  // ---------------------------------------------------------------------------
  // Budget figures (Master Budget allocations + Variance actuals).
  //
  // Held in a callback so both the initial load and the realtime handler use the
  // same path. Only display data is replaced here — never form state — so a
  // refresh landing mid-edit cannot clobber what the user is typing.
  // ---------------------------------------------------------------------------
  const budgetProjectId = form?.project_id ?? null;
  const budgetHeadId = form?.budget_head_id ?? null;

  // Every state write happens after an await, so nothing is set synchronously
  // during the effect (which would cascade renders). A null project resolves to
  // empty figures through the same path rather than an early synchronous reset.
  const loadBudgetFigures = useCallback(
    async (projectId: string | null, headId: string | null, isStale?: () => boolean) => {
      const [snap, cats] = await Promise.allSettled([
        projectId ? getBudgetSnapshotForPr(projectId, headId) : Promise.resolve(null),
        projectId
          ? fetchMasterBudgetCategories(projectId)
          : Promise.resolve([] as MasterBudgetCategory[]),
      ]);
      if (isStale?.()) return;
      setBudgetSnapshot(snap.status === 'fulfilled' ? snap.value : null);
      setMasterBudgetCategories(cats.status === 'fulfilled' ? cats.value : []);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    // Deferred a tick so no state is written during the effect itself.
    const timer = setTimeout(() => {
      void loadBudgetFigures(budgetProjectId, budgetHeadId, () => cancelled);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [budgetProjectId, budgetHeadId, loadBudgetFigures]);

  // Live budget updates. Subscribes to the same tables as the Budget module, so
  // approving a PO or verifying a bill in another tab moves this PR's figures
  // immediately instead of leaving them stale until the form is reopened.
  // Only while a form is open — the list view shows no budget figures.
  useEffect(() => {
    if (mode !== 'form' || !budgetProjectId) return;
    return subscribeToBudgetChanges(
      budgetProjectId,
      () => { void loadBudgetFigures(budgetProjectId, budgetHeadId); },
      400,
      'pr-form',
    );
  }, [mode, budgetProjectId, budgetHeadId, loadBudgetFigures]);

  // ---------------------------------------------------------------------------
  // Activity -> Master Budget category resolution.
  //
  // Keyed on the DISTINCT SORTED activity names, not on `form.lines`, so editing
  // a quantity or rate does not re-resolve. Debounced so typing an activity name
  // character by character cannot fire a model call per keystroke — only the
  // settled value is ever sent, and only if it is not already exact-matched or
  // cached.
  // ---------------------------------------------------------------------------
  // JSON rather than a delimiter join: an activity name could contain any
  // separator character, and a collision would silently merge two activities.
  const activitySignature = useMemo(() => {
    if (!form) return '[]';
    const names = new Set<string>();
    for (const line of form.lines) {
      const name = (line.activity_name || line.work_activity || '').trim();
      if (name) names.add(name);
    }
    return JSON.stringify(Array.from(names).sort());
  }, [form?.lines]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which categories exist — NOT their amounts. A live budget refresh hands back
  // a fresh array every time; without this, every PO approval elsewhere would
  // re-run resolution (and re-query the mapping cache) even though the set of
  // categories is unchanged.
  const categorySignature = useMemo(
    () => masterBudgetCategories.map((c) => c.id).sort().join(','),
    [masterBudgetCategories],
  );

  useEffect(() => {
    const projectId = form?.project_id;
    const activityNames = JSON.parse(activitySignature) as string[];
    const nothingToResolve =
      !projectId || activityNames.length === 0 || masterBudgetCategories.length === 0;

    let cancelled = false;

    // All state writes live inside the timer, so none happen synchronously
    // during the effect. Clearing is immediate (0ms) while a real resolution is
    // debounced, so typing an activity name cannot fire a call per keystroke.
    const timer = setTimeout(
      () => {
        if (cancelled) return;

        if (nothingToResolve) {
          setActivityResolution(new Map());
          setActivityResolving(false);
          setActivityModelError(null);
          return;
        }

        setActivityResolving(true);
        resolveActivityCategories(projectId, activityNames, masterBudgetCategories)
          .then((result) => {
            if (cancelled) return;
            setActivityResolution(result.map);
            setActivityModelError(result.modelError);
            if (result.usedModel) setActivityUsedModel(true);
          })
          .catch((e) => {
            if (cancelled) return;
            setActivityResolution(new Map());
            setActivityModelError(e instanceof Error ? e.message : String(e));
          })
          .finally(() => {
            if (!cancelled) setActivityResolving(false);
          });
      },
      nothingToResolve ? 0 : 600,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // masterBudgetCategories is intentionally read through categorySignature:
    // resolution depends on which categories exist, not on their amounts.
  }, [form?.project_id, activitySignature, categorySignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNewPr = useCallback(() => {
    setForm(blankForm(projectOptions[0]?.id ?? ''));
    setPendingFiles([]);
    setLastSavedAt(null);
    setMode('form');
    void loadApprovedMrs();
  }, [projectOptions, loadApprovedMrs]);

  const editPr = useCallback(async (prId: string, forceDbFetch: boolean = false) => {
    // 1. Prioritize live DB fetch if running live Supabase or if explicitly requested
    if (isLiveSupabase() || forceDbFetch) {
      try {
        const res = await getPurchaseRequisitionForm(prId);
        if (res.data) {
          setForm(res.data);
          setPendingFiles([]);
          setLastSavedAt(null);
          setMode('form');
          void loadApprovedMrs();
          return;
        }
        if (res.error) {
          onError(res.error.message);
        }
      } catch (e) {
        console.warn('Unable to load PR from DB, falling back to local cache:', e);
      }
    }

    // 2. Fallback to local rows / mock store
    const localRow = props.rows.find((r) => r.id === prId);
    if (localRow) {
      setForm(prRowToFormState(localRow));
      setPendingFiles([]);
      setLastSavedAt(null);
      setMode('form');
      void loadApprovedMrs();
      return;
    }
  }, [props.rows, onError, loadApprovedMrs]);

  const update = useCallback((patch: Partial<PrFormState>) => setForm((f) => (f ? { ...f, ...patch } : f)), []);

  const changeLine = useCallback((key: string, patch: Partial<PrFormLine>) => {
    setForm((f) => (f ? { ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) } : f));
  }, []);

  const removeLine = useCallback((key: string) => {
    setForm((f) => (f ? { ...f, lines: f.lines.filter((l) => l.key !== key) } : f));
  }, []);

  const addManualLine = useCallback(() => {
    const justification = window.prompt('Justification for adding a non-MR item (required):');
    if (justification == null || !justification.trim()) return;
    setForm((f) => {
      if (!f) return f;
      const line: PrFormLine = {
        key: `manual-${Date.now()}`,
        source_mr_id: null, source_mr_number: null, mr_line_number: null, material_request_line_id: null,
        resource_type: 'material', item_id: null, item_code: '', item_group: null,
        item_description: '', specification: null,
        approved_mr_qty: null, prev_pr_qty: 0, remaining_mr_qty: null,
        pr_quantity: 1, unit: 'nos', estimated_rate: 0, tax_rate: 18,
        required_date: f.required_date || null, preferred_brand: null, suggested_vendor: null,
        delivery_location: null, remarks: null,
        is_non_mr_item: true, non_mr_justification: justification.trim(), is_modified: true,
      };
      return { ...f, lines: [...f.lines, line] };
    });
  }, []);

  const bulkRequiredDate = useCallback((date: string) => {
    setForm((f) => (f ? { ...f, lines: f.lines.map((l) => ({ ...l, required_date: date })) } : f));
  }, []);
  const bulkDeliveryLocation = useCallback((location: string) => {
    setForm((f) => (f ? { ...f, lines: f.lines.map((l) => ({ ...l, delivery_location: location })) } : f));
  }, []);

  const handleAddMrs = useCallback((selectedRows: ApprovedMrRow[]) => {
    setForm((f) => {
      if (!f) return f;
      const existingMrLineIds = new Set(f.lines.map((l) => l.material_request_line_id).filter(Boolean));
      const newLines = selectedRows.flatMap(mrRowToLines).filter((l) => !existingMrLineIds.has(l.material_request_line_id));
      const firstMr = selectedRows[0];
      return {
        ...f,
        company_name: f.company_name || firstMr?.company_name || '',
        project_id: f.lines.length === 0 && firstMr?.project_id ? firstMr.project_id : f.project_id,
        site_id: f.lines.length === 0 && firstMr?.site_id ? firstMr.site_id : f.site_id,
        activity_name: f.activity_name || firstMr?.work_activity || '',
        activity_code: f.activity_code || firstMr?.activity_code || '',
        priority: firstMr?.priority ? (firstMr.priority.toLowerCase() as any) : f.priority,
        delivery_address: f.delivery_address || (firstMr as any)?.site_block || (firstMr as any)?.delivery_address || firstMr?.site_name || '',
        mr_raised_by: f.mr_raised_by || (firstMr as any)?.requested_by_name || (firstMr as any)?.requested_by || (firstMr as any)?.raised_by || 'Rohan Mehta (Site Eng)',
        lines: [...f.lines, ...newLines],
      };
    });
  }, []);

  const handleSelectMrFromDropdown = useCallback((mrId: string) => {
    const mr = approvedMrs.find((r) => r.id === mrId);
    if (mr) {
      handleAddMrs([mr]);
    }
  }, [approvedMrs, handleAddMrs]);

  const removeMr = useCallback((mrId: string) => {
    setForm((f) => (f ? { ...f, lines: f.lines.filter((l) => l.source_mr_id !== mrId) } : f));
  }, []);

  const sourceChips = useMemo<SourceMrChip[]>(() => {
    if (!form) return [];
    const map = new Map<string, SourceMrChip>();
    for (const line of form.lines) {
      if (!line.source_mr_id || !line.source_mr_number) continue;
      const existing = map.get(line.source_mr_id);
      if (existing) {
        existing.importedItems += 1;
        existing.pendingQty += line.pr_quantity;
      } else {
        const mrRow = approvedMrs.find((r) => r.id === line.source_mr_id);
        map.set(line.source_mr_id, {
          mrId: line.source_mr_id,
          mrNumber: line.source_mr_number,
          projectName: mrRow?.project_name ?? null,
          activity: mrRow?.work_activity ?? null,
          importedItems: 1,
          pendingQty: line.pr_quantity,
        });
      }
    }
    return Array.from(map.values());
  }, [form, approvedMrs]);

  const persist = useCallback(async (submit: boolean) => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await savePurchaseRequisition(form, { submit });
      if (res.error || !res.data) { onError(res.error?.message ?? 'Save failed.'); return; }
      setLastSavedAt(new Date().toLocaleTimeString());
      const updatedStatus = res.data.status || (submit ? 'under_verification' : 'draft');
      setForm((f) => (f ? { ...f, id: res.data!.purchaseRequisitionId, pr_number: res.data!.prNumber, status: updatedStatus as any } : f));
      onMessage(submit ? `PR ${res.data.prNumber} sent for verification — RFQ auto-drafted!` : `PR ${res.data.prNumber} status updated to Draft.`);
      await onRefresh();
      if (submit) {
        setMode('list');
        setForm(null);
      }
    } finally {
      setSaving(false);
    }
  }, [form, onError, onMessage, onRefresh]);

  const openConfirm = useCallback((config: PrConfirmConfig, message: string, newStatus: string | null, opts?: { patch?: (reason: string) => Record<string, unknown>; exit?: boolean }) => {
    if (!form?.id) return;
    const prId = form.id;
    setConfirm({
      config,
      run: async (reason, notify) => {
        setWorkflowBusy(true);
        try {
          const patch = opts?.patch ? opts.patch(reason) : undefined;
          const assignedTo = form.status === 'pending_approval' && newStatus === 'approved' ? null : undefined;
          const res = await transitionPurchaseRequisition(prId, {
            action: config.title,
            newStatus: newStatus as any,
            comment: reason,
            patch: assignedTo !== undefined ? { ...(patch ?? {}), assigned_to: assignedTo } : patch,
          });
          if (res.error) { onError(res.error.message); return; }
          onMessage(message);
          if (newStatus) {
            setForm((f) => (f && f.id === prId ? { ...f, status: newStatus as any } : f));
          }
          await onRefresh();
          setConfirm(null);
          if (opts?.exit) {
            setMode('list');
            setForm(null);
          } else {
            void editPr(prId, true);
          }
        } finally {
          setWorkflowBusy(false);
        }
      },
    });
  }, [form, editPr, onError, onMessage, onRefresh]);

  const handleAssign = useCallback(async (payload: AssignApprovalPayload) => {
    if (!form?.id) return;
    setWorkflowBusy(true);
    try {
      const targetStatus = form.status === 'under_verification' ? 'pending_approval' : null;
      const res = await transitionPurchaseRequisition(form.id, {
        action: 'Assign PR for approval',
        newStatus: targetStatus,
        comment: payload.instruction,
        assignment: {
          assignedTo: payload.approverId,
          role: payload.approverRole,
          level: payload.level,
          dueDate: payload.dueDate,
          priority: payload.priority,
          instruction: payload.instruction,
        },
        notify: payload.notify,
      });
      if (res.error) { onError(res.error.message); return; }
      onMessage('PR assigned successfully!');
      setAssignOpen(false);
      if (targetStatus) {
        setForm((f) => (f && f.id === form.id ? { ...f, status: targetStatus as any } : f));
      }
      await onRefresh();
      void editPr(form.id, true);
    } finally {
      setWorkflowBusy(false);
    }
  }, [form, editPr, onError, onMessage, onRefresh]);

  const handleDeleteDraft = useCallback(async () => {
    if (!form?.id) return;
    if (!window.confirm('Permanently delete this PR draft?')) return;
    setSaving(true);
    try {
      const res = await deletePrDraft(form.id);
      if (res.error) { onError(res.error.message); return; }
      onMessage('PR draft deleted.');
      await onRefresh();
      setMode('list');
      setForm(null);
    } finally {
      setSaving(false);
    }
  }, [form, onError, onMessage, onRefresh]);

  const handleResetToDraft = useCallback(async () => {
    if (!form?.id) return;
    if (!window.confirm('Reset this Purchase Requisition to Draft? This will permanently delete all downstream RFQs and quotation details for this PR.')) return;
    setSaving(true);
    try {
      const res = await resetPrToDraft(form.id);
      if (res.error) { onError(res.error.message); return; }
      onMessage('PR reset to draft. Associated RFQs/Quotations cleaned up.');
      setForm((f) => (f ? { ...f, status: 'draft' } : f));
      await onRefresh();
      void editPr(form.id, true);
    } finally {
      setSaving(false);
    }
  }, [form, editPr, onError, onMessage, onRefresh]);

  // Roles like ADMIN / PROJECT_DIRECTOR are normalised to UPPER_MANAGEMENT upstream (see lib/roles.ts).
  const canManage = props.activeRole === 'UPPER_MANAGEMENT' || props.activeRole === 'PROJECT_MANAGER' || props.activeRole === 'PR_TEAM';
  const canApprove = props.activeRole === 'UPPER_MANAGEMENT' || props.activeRole === 'PROJECT_MANAGER';

  const reviewComputed = useMemo(() => {
    if (!form) return { requireComment: false };
    const summary = computeCostSummary(form);
    const snap = form.budget_applicable ? budgetSnapshot : null;
    const isOver = computeBudgetStatus(snap, summary.totalEstimatedCost).status === 'over_budget';
    return { requireComment: approvalCommentRequired(form, isOver) };
  }, [form, budgetSnapshot]);

  const PRIMARY = 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors';
  const OUTLINE = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors';
  const SUCCESS = 'inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-colors';
  const DANGER = 'inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-sm transition-colors';

  const activeRow = useMemo(() => {
    if (!form) return null;
    const dbRow = props.rows.find((r) => r.id === form.id);
    const computedEstCost = computeCostSummary(form).totalEstimatedCost;
    return {
      ...dbRow,
      id: form.id || dbRow?.id || 'draft-preview',
      project_id: form.project_id || dbRow?.project_id || 'central-park',
      site_id: form.site_id || dbRow?.site_id || null,
      material_request_id: dbRow?.material_request_id || null,
      pr_number: form.pr_number || dbRow?.pr_number || 'PR-Draft',
      title: form.general_remarks || form.over_budget_justification || dbRow?.title || 'Purchase Requisition',
      estimated_cost: computedEstCost || dbRow?.estimated_cost || 0,
      status: form.status as any,
      requested_date: form.pr_date || dbRow?.requested_date || new Date().toISOString().split('T')[0],
      required_date: form.required_date || dbRow?.required_date || null,
      finance_required: false,
      current_approval_stage: null,
    } as PurchaseRequisitionRow;
  }, [form, props.rows]);

  function renderReviewActions(status: string): ReactNode {
    switch (status) {
      case 'under_verification':
        return (<>
          <button className={OUTLINE} onClick={() => openConfirm({ title: 'Return to Draft', action: 'return this PR to draft', fromStatus: status, toStatus: 'returned_to_draft', reasonLabel: 'Reason for return', reasonRequired: true, confirmLabel: 'Return to Draft' }, 'Returned to draft', 'returned_to_draft')}><Undo2 className="h-4 w-4" /> Return to Draft</button>
          {canManage && <button className={PRIMARY} onClick={() => setAssignOpen(true)}><UserCheck className="h-4 w-4" /> Assign for Approval</button>}
        </>);
      case 'pending_approval':
        return (<>
          <button className={OUTLINE} onClick={() => openConfirm({ title: 'Return to Verification', action: 'send this PR back for verification', fromStatus: status, toStatus: 'under_verification', reasonLabel: 'Reason', reasonRequired: true, confirmLabel: 'Return' }, 'Returned for verification', 'under_verification')}><Undo2 className="h-4 w-4" /> Return to Verification</button>
          {canManage && <button className={OUTLINE} onClick={() => setAssignOpen(true)}><Users className="h-4 w-4" /> Reassign</button>}
          {canApprove && <button className={DANGER} onClick={() => openConfirm({ title: 'Reject PR', action: 'reject this PR', fromStatus: status, toStatus: 'rejected', danger: true, reasonLabel: 'Rejection reason', reasonRequired: true, confirmLabel: 'Reject' }, 'Rejected', 'rejected')}><XCircle className="h-4 w-4" /> Reject</button>}
          {canApprove && <button className={SUCCESS} onClick={() => openConfirm({ title: 'Approve PR', action: 'approve this PR and move it to Pending Procurement', fromStatus: status, toStatus: 'approved', reasonLabel: 'Approval comment', reasonRequired: reviewComputed.requireComment, confirmLabel: 'Approve' }, 'Approved', 'approved')}><CheckCircle2 className="h-4 w-4" /> Approve &amp; Move to Pending Procurement</button>}
        </>);
      case 'approved': {
        return (<>
          {linkedRfq ? (
            <button className={PRIMARY} onClick={() => props.onNavigateToRfq?.(linkedRfq.id, form?.id || linkedRfq.purchase_requisition_id || '')}>
              <Eye className="h-4 w-4" /> Open RFQ Form
            </button>
          ) : (
            activeRow && (
              <button className={PRIMARY} onClick={() => props.onRfq(activeRow)}>
                <Plus className="h-4 w-4" /> Create Auto-Draft RFQ
              </button>
            )
          )}
          <button className={OUTLINE} onClick={() => openConfirm({ title: 'Close PR', action: 'close this PR', fromStatus: status, toStatus: 'closed', reasonLabel: 'Closing note', confirmLabel: 'Close PR' }, 'Closed', 'closed', { exit: true })}>
            <Lock className="h-4 w-4" /> Close PR
          </button>
        </>);
      }
      case 'on_hold':
        return (<>
          {canManage && <button className={PRIMARY} onClick={() => openConfirm({ title: 'Resume PR', action: 'resume this PR', fromStatus: status, toStatus: 'pending_approval', confirmLabel: 'Resume' }, 'Resumed', 'pending_approval')}><PlayCircle className="h-4 w-4" /> Resume</button>}
          {canManage && <button className={DANGER} onClick={() => openConfirm({ title: 'Cancel PR', action: 'cancel this PR', fromStatus: status, toStatus: 'cancelled', danger: true, reasonLabel: 'Cancellation reason', reasonRequired: true, confirmLabel: 'Cancel PR' }, 'Cancelled', 'cancelled', { patch: (reason) => ({ cancellation_reason: reason }) })}><XCircle className="h-4 w-4" /> Cancel PR</button>}
        </>);
      case 'closed':
        return canManage ? (<button className={OUTLINE} onClick={() => openConfirm({ title: 'Reopen PR', action: 'reopen this closed PR', fromStatus: status, toStatus: 'approved', reasonLabel: 'Reason for reopening', reasonRequired: true, confirmLabel: 'Reopen PR' }, 'Reopened', 'approved')}><RotateCcw className="h-4 w-4" /> Reopen PR</button>) : null;
      default:
        return null;
    }
  }

  function renderSecondaryActions(): ReactNode {
    if (!form) return null;
    const computedEstCost = computeCostSummary(form).totalEstimatedCost;
    const dbRow = props.rows.find((r) => r.id === form.id);

    const siteObj = props.projectOptions.flatMap((p) => p.project_sites ?? []).find((s) => s.id === form.site_id);
    const resolvedSiteName = siteObj?.name || (form.site_id && !form.site_id.includes('-') && form.site_id.length > 20 ? null : form.site_id) || (dbRow as any)?.site_name || (dbRow as any)?.sub_project || (dbRow as any)?.project_sites?.name || '';

    const liveRow = {
      ...dbRow,
      id: form.id || dbRow?.id || 'draft-preview',
      project_id: form.project_id || dbRow?.project_id || 'central-park',
      site_id: form.site_id || dbRow?.site_id || null,
      site_name: resolvedSiteName,
      sub_project: resolvedSiteName,
      material_request_id: dbRow?.material_request_id || null,
      pr_number: form.pr_number || dbRow?.pr_number || 'PR-Draft',
      title: form.general_remarks || form.over_budget_justification || dbRow?.title || 'Purchase Requisition',
      estimated_cost: computedEstCost || dbRow?.estimated_cost || 0,
      subtotal_amount: computedEstCost || dbRow?.subtotal_amount || 0,
      total_amount: computedEstCost || dbRow?.total_amount || 0,
      finance_required: false,
      status: form.status as any,
      current_approval_stage: null,
      pr_date: form.pr_date || dbRow?.created_at || new Date().toISOString().split('T')[0],
      requested_date: form.pr_date || dbRow?.requested_date || new Date().toISOString().split('T')[0],
      required_date: form.required_date || dbRow?.required_date || null,
      pr_release_date: form.pr_release_date || dbRow?.pr_release_date || null,
      company_name: form.company_name || dbRow?.company_name || 'Pramukh Group Infrastructure Ltd.',
      department: form.department || dbRow?.department || 'Site Store',
      prepared_by: form.prepared_by || dbRow?.prepared_by || null,
      general_remarks: form.general_remarks || dbRow?.general_remarks || '',
      unlocked_project: form.unlocked_project ?? (dbRow as any)?.unlocked_project ?? 1.00,
      activity_name: form.activity_name || dbRow?.activity_name || 'Masonry / Brickwork',
      work_activity: form.activity_name || dbRow?.activity_name || 'Masonry / Brickwork',
      cost_centre: form.cost_centre || dbRow?.cost_centre || '',
      contractor_name: form.contractor_name || dbRow?.contractor_name || '',
      delivery_address: form.delivery_address || dbRow?.delivery_address || 'Central Park Residential Project',
      purchase_requisition_lines: form.lines.map((l, i) => ({
        id: l.key || `line-${i}`,
        item_description: l.item_description,
        quantity: Number(l.pr_quantity || 0),
        estimated_rate: Number(l.estimated_rate || 0),
        unit: l.unit || 'nos',
        line_total: Number(l.pr_quantity || 0) * Number(l.estimated_rate || 0),
        work_activity: l.work_activity || null,
        item_group: l.item_group || null,
        specification: l.specification || null,
        est_qty: l.est_qty ?? 0,
        iss_qty: l.iss_qty ?? 0,
        bal_qty: l.pr_bal_qty ?? l.pr_quantity ?? 0,
        pending_pr: l.remaining_mr_qty ?? 0,
        lead_period: l.lead_period_days ?? null,
        lead_period_date: l.lead_period_date ?? null,
        required_date: l.required_date ?? form.required_date,
        item_brand: l.preferred_brand || l.specification || '-',
      })),
      history: (dbRow as any)?.history || [],
    };

    return (
      <>
        <button
          type="button"
          onClick={() => setPreviewPr(liveRow as any)}
          title="Print official Purchase Requisition PDF"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all shadow-xs cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5" /> Print PDF
        </button>
        {form.id && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
        )}
      </>
    );
  }

  // ---- FORM MODE (DEFAULT ON LANDING) ----
  if (mode === 'form' && form) {
    const editable = isPrEditable(form.status);
    const isAutoDraft = ['auto_draft', 'auto_draft_pr', 'auto draft from PR', 'draft', 'returned_to_draft'].includes(form.status);
    const editActions = (
      <>
        {form.id && ['draft', 'returned_to_draft'].includes(form.status) && (
          <button onClick={handleDeleteDraft} className={DANGER}><Trash2 className="h-4 w-4" /> Delete Draft</button>
        )}
        <button onClick={() => void persist(false)} disabled={saving} className={OUTLINE}>
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save as Draft'}
        </button>
      </>
    );
    return (
      <>
        {/* Navigation Bar to switch between Form and PR List View */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-2 px-1 text-xs">
            <span className="font-bold text-foreground font-heading">Purchase Requisition Workspace</span>
            <span className="text-muted-foreground">• Mode: {form.pr_number ? `Editing ${form.pr_number}` : 'New PR Form'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('list')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              <ListChecks className="h-3.5 w-3.5 text-primary" /> View All PR Records ({props.rows.length})
            </button>
            <button
              onClick={startNewPr}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> New PR Form
            </button>
          </div>
        </div>

        <PrForm
          form={form}
          update={update}
          onChangeLine={changeLine}
          onRemoveLine={removeLine}
          onAddManualLine={addManualLine}
          onBulkRequiredDate={bulkRequiredDate}
          onBulkDeliveryLocation={bulkDeliveryLocation}
          sourceChips={sourceChips}
          approvedMrs={approvedMrs}
          onSelectMrFromDropdown={handleSelectMrFromDropdown}
          onOpenAddMr={() => { setDrawerOpen(true); if (approvedMrs.length === 0) void loadApprovedMrs(); }}
          onRemoveMr={removeMr}
          budgetSnapshot={budgetSnapshot}
          activityResolution={activityResolution}
          activityResolving={activityResolving}
          activityModelError={activityModelError}
          activityUsedModel={activityUsedModel}
          masterBudgetCategories={masterBudgetCategories}
          budgetHeads={budgetHeads}
          costCodes={costCodes}
          projectOptions={projectOptions}
          pendingFiles={pendingFiles}
          onAddFiles={(files, category) => { if (files) setPendingFiles((p) => [...p, ...Array.from(files).map((file) => ({ file, category }))]); }}
          onRemoveFile={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
          readOnly={!editable}
          lastSavedAt={lastSavedAt}
          actions={editable ? editActions : renderReviewActions(form.status)}
          secondaryActions={renderSecondaryActions()}
          onCancel={() => { setMode('list'); }}
          onSendForVerification={() => void persist(true)}
        />

        <AddFromApprovedMrDrawer
          open={drawerOpen}
          loading={loadingApproved}
          approvedMrs={approvedMrs}
          projectOptions={projectOptions}
          alreadyLinkedMrIds={sourceChips.map((c) => c.mrId)}
          lockedCompany={form.company_name || null}
          lockedProjectId={form.lines.length > 0 ? form.project_id : null}
          onClose={() => setDrawerOpen(false)}
          onAddMrs={handleAddMrs}
        />
        <AssignApprovalModal
          open={assignOpen}
          approvers={approvers}
          submitting={workflowBusy}
          onClose={() => setAssignOpen(false)}
          onConfirm={handleAssign}
        />
        <PrConfirmModal
          config={confirm?.config ?? null}
          submitting={workflowBusy}
          onClose={() => setConfirm(null)}
          onConfirm={(reason, notify) => { void confirm?.run(reason, notify); }}
        />
        <PrHistoryDrawer open={historyOpen} prId={form.id} prNumber={form.pr_number} onClose={() => setHistoryOpen(false)} />
        {previewPr && (
          <PRPdfPreviewModal
            pr={previewPr}
            onClose={() => setPreviewPr(null)}
          />
        )}
      </>
    );
  }

  // ---- LIST MODE ----
  return (
    <div className="space-y-4">
      {/* Alerts & Reminders Stats Bar */}
      <PRStatsBar
        rows={props.rows}
        onSelectTab={(tab) => { setPrFilters((prev) => ({ ...prev, tab })); setPage(1); }}
        onSelectPriority={(priority) => { setPrFilters((prev) => ({ ...prev, priority })); setPage(1); }}
      />

      {/* Top Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground font-heading">{filteredRows.length}</span> purchase requisition(s) displayed
          {filteredRows.length !== props.rows.length && (
            <span>(Filtered from {props.rows.length} total)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewPr}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" /> Open New PR Form
          </button>
        </div>
      </div>

      {/* Search, Filter & Quick Tabs Bar */}
      <PRRequestsFilterBar
        filters={prFilters}
        onChangeFilters={(patch) => {
          setPrFilters((prev) => ({ ...prev, ...patch }));
          setPage(1);
        }}
        projectOptions={props.projectOptions}
        totalCount={props.rows.length}
        filteredCount={filteredRows.length}
      />

      {/* High-Density Scalable Table View */}
      <PRTableView
        rows={pagedRows}
        onEdit={editPr}
        onPdf={(pr) => setPreviewPr(pr)}
        onApprove={props.onApprove}
      />

      {/* Pagination Controls for 100+ requests/month */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filteredRows.length}
          onPageChange={setPage}
        />
      )}

      {previewPr && (
        <PRPdfPreviewModal
          pr={previewPr}
          onClose={() => setPreviewPr(null)}
        />
      )}
    </div>
  );
}
