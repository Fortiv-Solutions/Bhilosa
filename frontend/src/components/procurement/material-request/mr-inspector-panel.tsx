'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CircleX,
  CheckCircle2,
  Clock,
  Eye,
  Flame,
  MessageSquare,
  PackageCheck,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
  Zap,
  MessageCircle,
  FileText,
  Boxes,
  Check,
  Printer,
} from 'lucide-react';
import type { MaterialRequestRow, PurchaseRequisitionRow, Role } from '@/lib/erp/material-request/types';
import type { ProcurementLineRow } from '@/lib/procurement';
import {
  rejectMaterialRequest,
  markMrUnderReview,
  askMrClarification,
  addManagementComment,
  reviewMaterialRequestInventory,
  issueMaterialFromStock,
  updateSingleMrLineStatus,
} from '@/lib/procurement';

interface MRInspectorPanelProps {
  mr: MaterialRequestRow;
  linkedPr: PurchaseRequisitionRow | undefined;
  activeRole: Role;
  onClose: () => void;
  onAction: (label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) => Promise<void>;
  onConvertToPr: (mr: MaterialRequestRow, approvedLines?: ProcurementLineRow[]) => void;
  /** Generates the report-format Material Request PDF and opens it in a new tab. */
  onPrint?: () => void;
}

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800', icon: Flame },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800', icon: Zap },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800', icon: Clock },
  low: { label: 'Low', className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800', icon: ArrowRight },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Clarification Req.', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200' },
  in_review: { label: 'Under Review', className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200' },
  approved: { label: 'Converted to PR', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border-red-200' },
  closed: { label: 'Fulfilled', className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400 border-gray-200' },
};

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function isOverdue(requiredDate: string): boolean {
  return new Date(requiredDate) < new Date();
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeLineStatus(status?: string | null): 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending' {
  if (!status) return 'pending';
  if (status === 'approved' || status === 'approved_for_pr') return 'approved_for_pr';
  if (status === 'closed' || status === 'fulfilled_from_stock') return 'fulfilled_from_stock';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

export function MRInspectorPanel({
  mr,
  linkedPr,
  activeRole,
  onClose,
  onAction,
  onConvertToPr,
  onPrint,
}: MRInspectorPanelProps) {
  const [lineStatuses, setLineStatuses] = useState<Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'>>(() => {
    const initial: Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'> = {};
    (mr.material_request_lines ?? []).forEach((line) => {
      initial[line.id] = normalizeLineStatus(line.line_status);
    });
    return initial;
  });

  useEffect(() => {
    const updated: Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'> = {};
    (mr.material_request_lines ?? []).forEach((line) => {
      updated[line.id] = normalizeLineStatus(line.line_status);
    });
    setLineStatuses(updated);
  }, [mr.id, mr.material_request_lines]);

  const [clarificationInput, setClarificationInput] = useState('');
  const [rejectInput, setRejectInput] = useState('');
  const [managementCommentInput, setManagementCommentInput] = useState('');
  const [activeForm, setActiveForm] = useState<'clarify' | 'reject' | 'management' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isPrTeam = activeRole === 'PR_TEAM' || activeRole === 'UPPER_MANAGEMENT';
  const isManagement = activeRole === 'UPPER_MANAGEMENT';
  const overdue = isOverdue(mr.required_date) && mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
  const canAct = mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
  const canConvert = canAct;
  const lines = mr.material_request_lines ?? [];

  const updateLineStatus = async (lineId: string, targetStatus: 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected') => {
    const currentStatus = lineStatuses[lineId] ?? 'pending';
    const nextStatus = currentStatus === targetStatus ? 'pending' : targetStatus;

    // 1. BLOCK status change if item has already been approved for PR
    if (currentStatus === 'approved_for_pr' && nextStatus !== 'approved_for_pr') {
      alert('Action Not Allowed: This line item has already been approved for PR and converted into a Purchase Requisition. Status modification is not permitted after PR creation.');
      return;
    }

    // 2. Optional confirmation if item was previously issued from stock
    if (currentStatus === 'fulfilled_from_stock' && nextStatus !== 'fulfilled_from_stock') {
      const confirmed = window.confirm('Notice: This item was previously issued from stock. Are you sure you want to change its status decision?');
      if (!confirmed) return;
    }

    // 3. Update local state immediately for fast UI feedback
    setLineStatuses((prev) => ({
      ...prev,
      [lineId]: nextStatus,
    }));

    // 4. Persist to Supabase database (material_request_lines) and update parent MR header status
    await updateSingleMrLineStatus(lineId, nextStatus, mr.id);
  };

  const selectAllForPr = () => {
    const updated: Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'> = {};
    lines.forEach((l) => { updated[l.id] = 'approved_for_pr'; });
    setLineStatuses(updated);
  };

  const selectAllForStock = () => {
    const updated: Record<string, 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending'> = {};
    lines.forEach((l) => { updated[l.id] = 'fulfilled_from_stock'; });
    setLineStatuses(updated);
  };

  const approvedLineCount = Object.values(lineStatuses).filter((s) => s === 'approved_for_pr').length;
  const fulfilledLineCount = Object.values(lineStatuses).filter((s) => s === 'fulfilled_from_stock').length;
  const rejectedLineCount = Object.values(lineStatuses).filter((s) => s === 'rejected').length;

  async function handleAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    setActionLoading(true);
    await onAction(label, fn);
    setActionLoading(false);
  }

  const statusConfig = STATUS_CONFIG[mr.status] ?? { label: mr.status, className: 'bg-gray-100 text-gray-800' };
  const priorityConfig = PRIORITY_CONFIG[mr.priority] ?? { label: 'Medium', className: 'bg-amber-100 text-amber-800' };
  const PriorityIcon = priorityConfig.icon;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
      />

      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4.5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold shadow-2xs">
              <ShoppingCart className="h-5.5 w-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-heading text-lg font-bold text-foreground tracking-tight">{mr.mr_number}</h3>
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-bold ${statusConfig.className}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Raised by <span className="font-semibold text-foreground">{mr.profiles?.name ?? mr.raised_by ?? 'Site Engineer'}</span> • {formatAge(mr.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                title="Generate the Material Request report PDF"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-2xs"
              >
                <Printer className="h-4 w-4 text-primary" /> Print Report
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* DRAWER BODY: SCROLLABLE MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Overdue Warning Alert */}
          {overdue && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-xs text-red-800 dark:text-red-300 font-medium shadow-2xs">
              <AlertTriangle className="h-4.5 w-4.5 text-red-600 shrink-0" />
              <span>
                <strong>Overdue Warning:</strong> Required date was <strong>{formatDate(mr.required_date)}</strong>. Please expedite verification.
              </span>
            </div>
          )}

          {/* Structured Quick Info Cards Grid */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" /> Project
              </span>
              <p className="font-bold text-xs text-foreground truncate">{mr.projects?.name ?? mr.project_id}</p>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Required By
              </span>
              <p className={`font-bold text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                {formatDate(mr.required_date)}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                Priority
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${priorityConfig.className}`}>
                <PriorityIcon className="h-3 w-3" /> {priorityConfig.label}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 space-y-1 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                Work Activity
              </span>
              <p className="font-bold text-xs text-foreground truncate">{mr.work_activity ?? 'General Site Construction'}</p>
            </div>
          </div>

          {/* Site Engineer Notes / Justification */}
          <div className="rounded-xl border border-border bg-background p-4.5 space-y-2 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Raised By Notes & Site Justification
            </span>
            <p className="text-foreground leading-relaxed italic text-xs pt-1 bg-muted/40 p-3.5 rounded-lg border border-border/50">
              "{mr.justification || 'No justification text provided by requester.'}"
            </p>
          </div>

          {/* Executive Management Comment Box */}
          {mr.management_comment && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4.5 space-y-2 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <MessageCircle className="h-4 w-4" /> Executive Management Remark
              </span>
              <p className="text-foreground font-medium text-xs pt-0.5 leading-relaxed">
                {mr.management_comment}
              </p>
            </div>
          )}

          {/* LINE-ITEM LEVEL APPROVAL & REJECTION WORKBENCH TABLE */}
          <div className="rounded-xl border border-border bg-background overflow-hidden shadow-2xs space-y-0">
            
            <div className="bg-muted/50 px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div>
                <h4 className="font-heading text-xs font-bold text-foreground flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" /> Line Item Decision Options ({lines.length} Items)
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">Select item decision for each requested material line item below.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                <thead className="bg-muted/80 text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-bold text-foreground">Item Description</th>
                    <th className="px-3 py-3 text-center w-16">Unit</th>
                    <th className="px-4 py-3 text-right text-primary font-bold w-20">Qty</th>
                    <th className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-400 font-bold w-20">Stock</th>
                    <th className="px-4 py-3 text-center w-28">Status</th>
                    <th className="px-5 py-3 text-center w-64">Item Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-card">
                  {lines.map((l, idx) => {
                    const status = lineStatuses[l.id] ?? 'pending';

                    return (
                      <tr key={l.id ?? idx} className="hover:bg-muted/30 transition-colors">
                        
                        <td className="px-4 py-3 font-bold text-foreground">
                          <div>{l.item_description}</div>
                          <span className="text-[10px] text-muted-foreground font-normal block mt-0.5">
                            {l.item_brand ? `${l.item_brand} • ` : ''}{l.item_specification ?? ''}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-center font-bold text-primary">
                          {l.unit ?? 'nos'}
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-primary bg-primary/5 text-sm">
                          {l.quantity}
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {l.project_stock ?? 0}
                        </td>

                        {/* Status Badge */}
                        <td className="px-4 py-3 text-center">
                          {status === 'approved_for_pr' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1 text-[10px] font-bold">
                              ✓ Approved PR
                            </span>
                          )}
                          {status === 'fulfilled_from_stock' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-2.5 py-1 text-[10px] font-bold">
                              📦 Stock Issue
                            </span>
                          )}
                          {status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border border-red-300 dark:border-red-800 px-2.5 py-1 text-[10px] font-bold">
                              ✕ Rejected
                            </span>
                          )}
                          {status === 'pending' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2.5 py-1 text-[10px] font-bold">
                              ⌛ Pending
                            </span>
                          )}
                        </td>

                        {/* Line Action Buttons */}
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateLineStatus(l.id, 'approved_for_pr')}
                              className={`px-3 py-1.5 rounded-md font-bold text-[10px] transition-all shadow-2xs ${
                                status === 'approved_for_pr'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 hover:bg-emerald-100'
                              }`}
                            >
                              Approve PR
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLineStatus(l.id, 'fulfilled_from_stock')}
                              className={`px-3 py-1.5 rounded-md font-bold text-[10px] transition-all shadow-2xs ${
                                status === 'fulfilled_from_stock'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'border border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800 hover:bg-blue-100'
                              }`}
                            >
                              Issue Stock
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLineStatus(l.id, 'rejected')}
                              className={`px-3 py-1.5 rounded-md font-bold text-[10px] transition-all shadow-2xs ${
                                status === 'rejected'
                                  ? 'bg-red-600 text-white shadow-xs'
                                  : 'border border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800 hover:bg-red-100'
                              }`}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Modals / Embedded forms */}
          {activeForm === 'clarify' && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3 shadow-2xs animate-in fade-in duration-150">
              <label className="font-bold text-xs text-amber-900 dark:text-amber-300 block uppercase tracking-wider">
                Specify Clarification Details
              </label>
              <textarea
                value={clarificationInput}
                onChange={(e) => setClarificationInput(e.target.value)}
                rows={2}
                placeholder="Specify what clarification is required from the site team..."
                className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!clarificationInput.trim()) return;
                    await handleAction('Clarification requested.', () => askMrClarification(mr, clarificationInput));
                    setClarificationInput('');
                    setActiveForm(null);
                  }}
                  disabled={!clarificationInput.trim() || actionLoading}
                  className="rounded-lg bg-amber-600 text-white px-4 py-2 text-xs font-bold hover:bg-amber-700 transition-colors shadow-2xs"
                >
                  Send Query
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {activeForm === 'reject' && (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 p-4 space-y-3 shadow-2xs animate-in fade-in duration-150">
              <label className="font-bold text-xs text-red-900 dark:text-red-300 block uppercase tracking-wider">
                State Rejection Reason
              </label>
              <textarea
                value={rejectInput}
                onChange={(e) => setRejectInput(e.target.value)}
                rows={2}
                placeholder="State why this material request is being rejected..."
                className="w-full rounded-lg border border-red-300 dark:border-red-700 bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!rejectInput.trim()) return;
                    await handleAction('Material request rejected.', () => rejectMaterialRequest(mr, rejectInput));
                    setRejectInput('');
                    setActiveForm(null);
                  }}
                  disabled={!rejectInput.trim() || actionLoading}
                  className="rounded-lg bg-red-600 text-white px-4 py-2 text-xs font-bold hover:bg-red-700 transition-colors shadow-2xs"
                >
                  Confirm Reject
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {activeForm === 'management' && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 shadow-2xs animate-in fade-in duration-150">
              <label className="font-bold text-xs text-primary block uppercase tracking-wider">
                Add Executive Management Remark
              </label>
              <textarea
                value={managementCommentInput}
                onChange={(e) => setManagementCommentInput(e.target.value)}
                rows={2}
                placeholder="Add executive guidance, priority note, or oversight remark..."
                className="w-full rounded-lg border border-primary/30 bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!managementCommentInput.trim()) return;
                    await handleAction('Management note added.', () => addManagementComment(mr, managementCommentInput));
                    setManagementCommentInput('');
                    setActiveForm(null);
                  }}
                  disabled={!managementCommentInput.trim() || actionLoading}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 transition-colors shadow-2xs"
                >
                  Save Remark
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted transition-colors">Cancel</button>
              </div>
            </div>
          )}

        </div>

        {/* DRAWER FOOTER: WORKFLOW ACTIONS */}
        {isPrTeam && canAct && (
          <div className="border-t border-border bg-card px-6 py-4 space-y-3 sticky bottom-0 z-20 shadow-md">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Request Workflow Decision</span>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                
                {canConvert && (
                  <button
                    type="button"
                    onClick={() => {
                      const approvedLines = lines.filter((l) => lineStatuses[l.id] === 'approved_for_pr');
                      onConvertToPr(mr, approvedLines.length > 0 ? approvedLines : lines);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition-all"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {approvedLineCount > 0
                      ? `Approve PR (${approvedLineCount})`
                      : `Approve PR (${lines.length})`}
                  </button>
                )}

                {fulfilledLineCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAction('Selected stock items issued from store.', () => issueMaterialFromStock(mr))}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all"
                  >
                    <PackageCheck className="h-4 w-4" /> Issue Stock ({fulfilledLineCount})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveForm(activeForm === 'clarify' ? null : 'clarify')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Clarify
                </button>

                <button
                  type="button"
                  onClick={() => setActiveForm(activeForm === 'reject' ? null : 'reject')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs font-bold text-red-800 dark:text-red-300 hover:bg-red-100 transition-colors"
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> Reject
                </button>
              </div>

              {isManagement && (
                <button
                  type="button"
                  onClick={() => setActiveForm(activeForm === 'management' ? null : 'management')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline bg-primary/10 px-3 py-2 rounded-lg border border-primary/20 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" /> + Remark
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
