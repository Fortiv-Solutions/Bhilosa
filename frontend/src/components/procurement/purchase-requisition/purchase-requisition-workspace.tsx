'use client';

// Purchase Requisition Workspace — top-level container for the PR section.
// Form mode renders by default on landing with the production-grade PR Form.
// Includes Searchable Approved MR Dropdown, validation on Send for Verification,
// budget lookups, and persistence.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Plus, Layers, ListChecks, Save, SendHorizonal, Trash2, UserCheck, Undo2, CheckCircle2,
  XCircle, Users, Lock, RotateCcw, PauseCircle, PlayCircle, FileDown, Eye, History,
} from 'lucide-react';
import type {
  PurchaseRequisitionRow, EntityAttachmentRow, MaterialRequestRow, RfqRow, QuotationRow, VendorSelectionRow,
} from '@/lib/procurement';
import type { ProcurementProjectOption, Role, PrFormState, PrFormLine, ApprovedMrRow } from '@/lib/erp/purchase-requisition/types';
import {
  listApprovedMaterialRequestsForPr, getBudgetSnapshotForPr, listBudgetHeads, listCostCodes,
  savePurchaseRequisition, getPurchaseRequisitionForm, transitionPurchaseRequisition, deletePrDraft,
  listEligibleApprovers, validatePrForm, computeCostSummary, computeBudgetStatus, isPrEditable, approvalCommentRequired,
  type BudgetSnapshot, type ApproverOption,
} from '@/lib/erp/purchase-requisition/service';
import { PurchaseRequisitionWorkbench } from '../purchase-requisition-workbench';
import { AddFromApprovedMrDrawer } from './add-from-approved-mr-drawer';
import { PrForm, type SourceMrChip } from './pr-form';
import { PrConfirmModal, type PrConfirmConfig } from './pr-confirm-modal';
import { AssignApprovalModal, type AssignApprovalPayload } from './assign-approval-modal';
import { PrHistoryDrawer } from './pr-history-drawer';

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
    general_remarks: '', internal_notes: '', terms_and_conditions: '', department: '',
    discount_amount: 0, freight_amount: 0, other_charges: 0, contingency_amount: 0,
    lines: [],
  };
}

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
      item_code: l.item_code || 'MAT-CEM-001',
      item_group: l.item_group || 'Cement & Concrete',
      item_description: l.item_description,
      specification: l.specification || 'IS 12269 : 2013 Grade 53',
      approved_mr_qty: l.approved_qty,
      prev_pr_qty: l.converted_qty,
      remaining_mr_qty: l.pending_qty,
      pr_quantity: l.pending_qty,
      unit: l.unit || 'Bags',
      estimated_rate: l.estimated_rate,
      tax_rate: 18,
      required_date: row.required_date ? row.required_date.slice(0, 10) : '2026-07-28',
      preferred_brand: 'UltraTech',
      suggested_vendor: null,
      delivery_location: null,
      remarks: null,
      is_non_mr_item: false,
      non_mr_justification: null,
      is_modified: false,

      // Rich ERP 30-column fields
      status: 'Approved PR',
      priority: row.priority || 'High',
      stock_audit: 'Shortage',
      project_and_block: `${row.project_name || 'Central Park'} (${row.site_name || 'Block A'})`,
      work_activity: row.work_activity || 'Slab casting',
      raised_by: row.requested_by || 'Rohan Mehta (Site Eng)',
      submitted_at: row.mr_date ? new Date(row.mr_date).toISOString().slice(0, 10) : '21-07-2026',
      activity_name: row.work_activity || 'Slab Casting',
      activity_code: row.activity_code || 'ACT-STR-01',
      est_qty: 2500,
      ind_qty: 1200,
      iss_qty: 1000,
      extra_rec_qty: 0,
      extra_adj_qty: 0,
      pr_bal_qty: 300,
      lead_period_days: 3,
      lead_period_date: '2026-07-25',
      project_stock: 120,
      other_project_stock: 450,
      relation_count: 2,
    }));
}

export function PurchaseRequisitionWorkspace(props: PurchaseRequisitionWorkspaceProps) {
  const { projectOptions, onRefresh, onMessage, onError } = props;

  // FORM MODE DEFAULT ON LANDING
  const [mode, setMode] = useState<'list' | 'form'>('form');
  const [form, setForm] = useState<PrFormState | null>(() => blankForm(projectOptions[0]?.id ?? ''));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvedMrs, setApprovedMrs] = useState<ApprovedMrRow[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [budgetSnapshot, setBudgetSnapshot] = useState<BudgetSnapshot | null>(null);
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

  // Recompute the budget snapshot when project / head / applicability changes.
  useEffect(() => {
    if (!form || !form.budget_applicable || !form.project_id) { setBudgetSnapshot(null); return; }
    let cancelled = false;
    getBudgetSnapshotForPr(form.project_id, form.budget_head_id)
      .then((snap) => { if (!cancelled) setBudgetSnapshot(snap); })
      .catch(() => { if (!cancelled) setBudgetSnapshot(null); });
    return () => { cancelled = true; };
  }, [form?.project_id, form?.budget_head_id, form?.budget_applicable]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNewPr = useCallback(() => {
    setForm(blankForm(projectOptions[0]?.id ?? ''));
    setPendingFiles([]);
    setLastSavedAt(null);
    setMode('form');
    void loadApprovedMrs();
  }, [projectOptions, loadApprovedMrs]);

  const editPr = useCallback(async (prId: string) => {
    const res = await getPurchaseRequisitionForm(prId);
    if (res.error || !res.data) { onError(res.error?.message ?? 'Unable to load PR.'); return; }
    setForm(res.data);
    setPendingFiles([]);
    setLastSavedAt(null);
    setMode('form');
    void loadApprovedMrs();
  }, [onError, loadApprovedMrs]);

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
      onMessage(submit ? `PR ${res.data.prNumber} sent for verification!` : `PR ${res.data.prNumber} saved as draft.`);
      await onRefresh();
      if (submit) {
        setMode('list');
        setForm(null);
      } else if (!form.id) {
        setForm((f) => (f ? { ...f, id: res.data!.purchaseRequisitionId, pr_number: res.data!.prNumber } : f));
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
          const res = await transitionPurchaseRequisition({
            prId,
            action: config.title,
            newStatus: newStatus as any,
            comment: reason,
            patch: assignedTo !== undefined ? { ...(patch ?? {}), assigned_to: assignedTo } : patch,
          });
          if (res.error) { onError(res.error.message); return; }
          onMessage(message);
          await onRefresh();
          setConfirm(null);
          if (opts?.exit) {
            setMode('list');
            setForm(null);
          } else {
            void editPr(prId);
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
      const res = await transitionPurchaseRequisition({
        prId: form.id,
        action: 'Assign PR for approval',
        newStatus: targetStatus,
        comment: payload.instruction,
        assignment: { assignedTo: payload.assignedTo, role: payload.role, instruction: payload.instruction },
        notify: payload.notifyUser,
      });
      if (res.error) { onError(res.error.message); return; }
      onMessage('PR assigned successfully!');
      setAssignOpen(false);
      await onRefresh();
      void editPr(form.id);
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

  const canManage = props.activeRole === 'UPPER_MANAGEMENT' || props.activeRole === 'PROJECT_MANAGER' || props.activeRole === 'PR_TEAM' || props.activeRole === 'ADMIN';
  const canApprove = props.activeRole === 'UPPER_MANAGEMENT' || props.activeRole === 'PROJECT_MANAGER' || props.activeRole === 'PROJECT_DIRECTOR' || props.activeRole === 'ADMIN';

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
      case 'approved':
        return (<>
          {canManage && <button className={OUTLINE} onClick={() => openConfirm({ title: 'Put On Hold', action: 'put this PR on hold', fromStatus: status, toStatus: 'on_hold', reasonLabel: 'Reason', reasonRequired: true, confirmLabel: 'Put On Hold' }, 'Put on hold', 'on_hold')}><PauseCircle className="h-4 w-4" /> Hold</button>}
          {canManage && <button className={OUTLINE} onClick={() => openConfirm({ title: 'Return for Revision', action: 'return this approved PR to draft for revision (a revision will be required and reapproval reset)', fromStatus: status, toStatus: 'revision_required', reasonLabel: 'Revision reason', reasonRequired: true, confirmLabel: 'Return for Revision' }, 'Returned for revision', 'revision_required', { patch: (reason) => ({ revision_reason: reason }) })}><RotateCcw className="h-4 w-4" /> Return for Revision</button>}
          {canApprove && <button className={OUTLINE} onClick={() => openConfirm({ title: 'Reapprove PR', action: 'reapprove this PR', fromStatus: status, toStatus: 'approved', reasonLabel: 'Comment', confirmLabel: 'Reapprove' }, 'Reapproved', 'approved')}><CheckCircle2 className="h-4 w-4" /> Reapprove</button>}
          {canManage && <button className={DANGER} onClick={() => openConfirm({ title: 'Cancel PR', action: 'cancel this PR', fromStatus: status, toStatus: 'cancelled', danger: true, reasonLabel: 'Cancellation reason', reasonRequired: true, confirmLabel: 'Cancel PR' }, 'Cancelled', 'cancelled', { patch: (reason) => ({ cancellation_reason: reason }) })}><XCircle className="h-4 w-4" /> Cancel PR</button>}
          <button className={PRIMARY} onClick={() => openConfirm({ title: 'Close PR', action: 'close this PR', fromStatus: status, toStatus: 'closed', reasonLabel: 'Closing note', confirmLabel: 'Close PR' }, 'Closed', 'closed', { exit: true })}><Lock className="h-4 w-4" /> Close PR</button>
        </>);
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
    if (!form?.id) return null;
    const row = props.rows.find((r) => r.id === form.id);
    return (<>
      {row && <button onClick={() => props.onPdf(row)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-bold hover:bg-muted"><FileDown className="h-3.5 w-3.5" /> {props.attachments.some((a) => a.entity_id === row.id) ? 'Reprint' : 'Print'}</button>}
      {row && <button onClick={() => props.onOpenPdf(row)} disabled={!props.attachments.some((a) => a.entity_id === row.id)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-bold hover:bg-muted disabled:opacity-40"><Eye className="h-3.5 w-3.5" /> Preview</button>}
      <button onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-bold hover:bg-muted"><History className="h-3.5 w-3.5" /> History</button>
    </>);
  }

  // ---- FORM MODE (DEFAULT ON LANDING) ----
  if (mode === 'form' && form) {
    const editable = isPrEditable(form.status);
    const editActions = (
      <>
        {form.id && ['draft', 'returned_to_draft'].includes(form.status) && (
          <button onClick={handleDeleteDraft} className={DANGER}><Trash2 className="h-4 w-4" /> Delete Draft</button>
        )}
        <button onClick={() => void persist(false)} disabled={saving} className={OUTLINE}><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Draft'}</button>
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
      </>
    );
  }

  // ---- LIST MODE ----
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">{props.rows.length}</span> purchase requisition(s)
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startNewPr} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> + New PR Form
          </button>
        </div>
      </div>

      {props.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">No purchase requisitions yet</p>
          <p className="mt-1 mb-4 text-xs text-muted-foreground/70 font-medium">Use the PR form to import from an approved Material Requisition.</p>
          <button onClick={startNewPr} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Open PR Form
          </button>
        </div>
      ) : (
        <PurchaseRequisitionWorkbench
          rows={props.rows}
          attachments={props.attachments}
          materialRequests={props.materialRequests}
          rfqs={props.rfqs}
          quotations={props.quotations}
          selections={props.selections}
          selectedPrId={props.selectedPrId}
          onSelectPr={props.onSelectPr}
          onAssign={props.onAssign}
          onApprove={props.onApprove}
          onRfq={props.onRfq}
          onPdf={props.onPdf}
          onOpenPdf={props.onOpenPdf}
          onGeneratePo={props.onGeneratePo}
          onEdit={editPr}
        />
      )}
    </div>
  );
}
