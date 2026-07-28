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
      initial[line.id] = (line.line_status as any) || 'pending';
    });
    return initial;
  });

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

  const updateLineStatus = (lineId: string, status: 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected') => {
    setLineStatuses((prev) => ({
      ...prev,
      [lineId]: prev[lineId] === status ? 'pending' : status,
    }));
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
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold shadow-2xs">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-base font-bold text-foreground tracking-tight">{mr.mr_number}</h3>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusConfig.className}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Raised by {mr.profiles?.name ?? mr.raised_by ?? 'Site Engineer'} • {formatAge(mr.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                title="Generate the Material Request report PDF"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
              >
                <Printer className="h-3.5 w-3.5 text-primary" /> Print Report
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* DRAWER BODY: SCROLLABLE MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          {/* Overdue Warning */}
          {overdue && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-300 font-medium">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span>
                <strong>Overdue Warning:</strong> Required date was {formatDate(mr.required_date)}. Please expedite verification.
              </span>
            </div>
          )}

          {/* Quick Info Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Project
              </span>
              <p className="font-bold text-xs text-foreground truncate">{mr.projects?.name ?? mr.project_id}</p>
            </div>

            <div className="rounded-xl border border-border bg-background p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Required By
              </span>
              <p className={`font-bold text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                {formatDate(mr.required_date)}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Priority
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${priorityConfig.className}`}>
                <PriorityIcon className="h-3 w-3" /> {priorityConfig.label}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-background p-3 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                Work Activity
              </span>
              <p className="font-bold text-xs text-foreground truncate">{mr.work_activity ?? 'General Site Construction'}</p>
            </div>
          </div>

          {/* Site Engineer Notes / Justification */}
          <div className="rounded-xl border border-border bg-background p-4 space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" /> Raised By Notes & Site Justification
            </span>
            <p className="text-foreground leading-relaxed italic text-xs pt-1">
              "{mr.justification || 'No justification text provided by requester.'}"
            </p>
          </div>

          {/* Executive Management Comment Box */}
          {mr.management_comment && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> Executive Management Remark
              </span>
              <p className="text-foreground font-medium text-xs pt-1">
                {mr.management_comment}
              </p>
            </div>
          )}

          {/* LINE-ITEM LEVEL APPROVAL & REJECTION WORKBENCH TABLE */}
          <div className="rounded-xl border border-border bg-background overflow-hidden space-y-0">
            
            <div className="bg-muted/70 px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-heading text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Boxes className="h-4 w-4 text-primary" /> Line Item Decision Options ({lines.length} Items)
                </h4>
                <p className="text-[10px] text-muted-foreground">Select item decision or choose bulk action below.</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllForPr}
                  className="rounded bg-emerald-600 text-white px-2.5 py-1 text-[10px] font-bold hover:bg-emerald-700 transition-colors shadow-2xs"
                >
                  ✓ Select All ({lines.length}) for PR
                </button>
                <button
                  type="button"
                  onClick={selectAllForStock}
                  className="rounded bg-blue-600 text-white px-2.5 py-1 text-[10px] font-bold hover:bg-blue-700 transition-colors shadow-2xs"
                >
                  📦 Select All ({lines.length}) for Stock
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                <thead className="bg-muted/90 text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b border-border">
                  <tr>
                    <th className="px-3 py-2 border-r border-border/60 font-bold text-foreground">Item Description</th>
                    <th className="px-2.5 py-2 text-center border-r border-border/60">Unit</th>
                    <th className="px-3 py-2 text-right border-r border-border/60 text-primary font-bold">Qty</th>
                    <th className="px-3 py-2 text-right border-r border-border/60 text-emerald-700 font-bold">Stock</th>
                    <th className="px-3 py-2 text-center border-r border-border/60">Status</th>
                    <th className="px-3 py-2 text-center">Item Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80 bg-card">
                  {lines.map((l, idx) => {
                    const status = lineStatuses[l.id] ?? 'pending';

                    return (
                      <tr key={l.id ?? idx} className="hover:bg-muted/30 transition-colors">
                        
                        <td className="px-3 py-2.5 font-bold text-foreground border-r border-border/60">
                          {l.item_description}
                          <span className="text-[10px] text-muted-foreground block font-normal">
                            {l.item_brand ? `${l.item_brand} • ` : ''}{l.item_specification ?? ''}
                          </span>
                        </td>

                        <td className="px-2.5 py-2.5 text-center font-bold text-primary border-r border-border/60">
                          {l.unit ?? 'nos'}
                        </td>

                        <td className="px-3 py-2.5 text-right font-bold text-primary bg-primary/5 text-sm border-r border-border/60">
                          {l.quantity}
                        </td>

                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 border-r border-border/60">
                          {l.project_stock ?? 0}
                        </td>

                        {/* Status Badge */}
                        <td className="px-3 py-2.5 text-center border-r border-border/60">
                          {status === 'approved_for_pr' && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                              ✓ Approved PR
                            </span>
                          )}
                          {status === 'fulfilled_from_stock' && (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 text-[10px] font-bold">
                              📦 Stock Issue
                            </span>
                          )}
                          {status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 rounded bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 text-[10px] font-bold">
                              ✕ Rejected
                            </span>
                          )}
                          {status === 'pending' && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                              ⌛ Pending
                            </span>
                          )}
                        </td>

                        {/* Line Action Buttons */}
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateLineStatus(l.id, 'approved_for_pr')}
                              className={`px-2 py-1 rounded font-bold text-[10px] transition-all ${
                                status === 'approved_for_pr'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              }`}
                            >
                              Approve PR
                            </button>
                            <button
                              onClick={() => updateLineStatus(l.id, 'fulfilled_from_stock')}
                              className={`px-2 py-1 rounded font-bold text-[10px] transition-all ${
                                status === 'fulfilled_from_stock'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                              }`}
                            >
                              Issue Stock
                            </button>
                            <button
                              onClick={() => updateLineStatus(l.id, 'rejected')}
                              className={`px-2 py-1 rounded font-bold text-[10px] transition-all ${
                                status === 'rejected'
                                  ? 'bg-red-600 text-white shadow-xs'
                                  : 'border border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <label className="font-bold text-amber-800 dark:text-amber-400 block">Clarification Details</label>
              <textarea
                value={clarificationInput}
                onChange={(e) => setClarificationInput(e.target.value)}
                rows={2}
                placeholder="Specify what clarification is required..."
                className="w-full rounded-md border border-amber-300 bg-background px-3 py-2 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!clarificationInput.trim()) return;
                    await handleAction('Clarification requested.', () => askMrClarification(mr, clarificationInput));
                    setClarificationInput('');
                    setActiveForm(null);
                  }}
                  disabled={!clarificationInput.trim() || actionLoading}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-white font-bold"
                >
                  Send Query
                </button>
                <button onClick={() => setActiveForm(null)} className="rounded-md border px-3 py-1.5 font-bold">Cancel</button>
              </div>
            </div>
          )}

          {activeForm === 'reject' && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
              <label className="font-bold text-red-700 dark:text-red-400 block">Rejection Reason</label>
              <textarea
                value={rejectInput}
                onChange={(e) => setRejectInput(e.target.value)}
                rows={2}
                placeholder="Why is this material request rejected?"
                className="w-full rounded-md border border-red-300 bg-background px-3 py-2 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!rejectInput.trim()) return;
                    await handleAction('Material request rejected.', () => rejectMaterialRequest(mr, rejectInput));
                    setRejectInput('');
                    setActiveForm(null);
                  }}
                  disabled={!rejectInput.trim() || actionLoading}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-white font-bold"
                >
                  Confirm Reject
                </button>
                <button onClick={() => setActiveForm(null)} className="rounded-md border px-3 py-1.5 font-bold">Cancel</button>
              </div>
            </div>
          )}

          {activeForm === 'management' && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <label className="font-bold text-primary block">Add Executive Management Remark</label>
              <textarea
                value={managementCommentInput}
                onChange={(e) => setManagementCommentInput(e.target.value)}
                rows={2}
                placeholder="Add executive guidance or remark..."
                className="w-full rounded-md border border-primary/20 bg-background px-3 py-2 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!managementCommentInput.trim()) return;
                    await handleAction('Management note added.', () => addManagementComment(mr, managementCommentInput));
                    setManagementCommentInput('');
                    setActiveForm(null);
                  }}
                  disabled={!managementCommentInput.trim() || actionLoading}
                  className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground font-bold"
                >
                  Save Remark
                </button>
                <button onClick={() => setActiveForm(null)} className="rounded-md border px-3 py-1.5 font-bold">Cancel</button>
              </div>
            </div>
          )}

        </div>

        {/* DRAWER FOOTER: WORKFLOW ACTIONS */}
        {isPrTeam && canAct && (
          <div className="border-t border-border bg-muted/40 p-4 space-y-3 sticky bottom-0 z-20">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Request Workflow Decision</span>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                
                {canConvert && (
                  <button
                    onClick={() => {
                      const approvedLines = lines.filter((l) => lineStatuses[l.id] === 'approved_for_pr');
                      onConvertToPr(mr, approvedLines.length > 0 ? approvedLines : lines);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {approvedLineCount > 0
                      ? `Approve & Create Draft PR (${approvedLineCount} Item${approvedLineCount > 1 ? 's' : ''})`
                      : `Approve All (${lines.length} Items) & Create Draft PR`}
                  </button>
                )}

                {fulfilledLineCount > 0 && (
                  <button
                    onClick={() => handleAction('Selected stock items issued from store.', () => issueMaterialFromStock(mr))}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-md transition-all"
                  >
                    <ThumbsUp className="h-4 w-4" /> Issue {fulfilledLineCount} Item{fulfilledLineCount > 1 ? 's' : ''} from Stock
                  </button>
                )}

                <button
                  onClick={() => setActiveForm(activeForm === 'clarify' ? null : 'clarify')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Clarify
                </button>

                <button
                  onClick={() => setActiveForm(activeForm === 'reject' ? null : 'reject')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-800 hover:bg-red-100 transition-colors"
                >
                  <ThumbsDown className="h-3.5 w-3.5" /> Reject
                </button>
              </div>

              {isManagement && (
                <button
                  onClick={() => setActiveForm(activeForm === 'management' ? null : 'management')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
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
