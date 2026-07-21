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
  const canConvert = canAct && mr.status !== 'approved';
  const lines = mr.material_request_lines ?? [];

  const updateLineStatus = (lineId: string, status: 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected') => {
    setLineStatuses((prev) => ({
      ...prev,
      [lineId]: prev[lineId] === status ? 'pending' : status,
    }));
  };

  const approvedLineCount = Object.values(lineStatuses).filter((s) => s === 'approved_for_pr').length;
  const fulfilledLineCount = Object.values(lineStatuses).filter((s) => s === 'fulfilled_from_stock').length;
  const rejectedLineCount = Object.values(lineStatuses).filter((s) => s === 'rejected').length;

  async function handleAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    setActionLoading(true);
    await onAction(label, fn);
    setActionLoading(false);
  }

  return (
    <>
      {/* Semi-transparent backdrop — Click outside to close */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* ENTERPRISE RIGHT SLIDE-OVER DRAWER (Fixed Right 0, 720px width) */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between border-b border-border bg-muted/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-lg font-bold text-foreground">{mr.mr_number}</h3>
                <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase ${STATUS_CONFIG[mr.status]?.className}`}>
                  {STATUS_CONFIG[mr.status]?.label ?? mr.status}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase ${PRIORITY_CONFIG[mr.priority]?.className}`}>
                  {PRIORITY_CONFIG[mr.priority]?.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Submitted by <strong className="text-foreground">{mr.profiles?.name ?? 'Site Team'}</strong> • {formatAge(mr.created_at)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close Drawer (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* DRAWER SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          
          {/* Status Badges Row */}
          <div className="flex flex-wrap items-center gap-2">
            {mr.stock_decision === 'available' ? (
              <span className="inline-flex rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 border border-emerald-200 px-2.5 py-1 text-xs font-bold uppercase">
                Stock Available
              </span>
            ) : (
              <span className="inline-flex rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/40 border border-amber-200 px-2.5 py-1 text-xs font-bold uppercase">
                Stock Shortage
              </span>
            )}

            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-700 dark:bg-red-950/40 border border-red-200 px-2.5 py-1 text-xs font-bold">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </span>
            )}

            {linkedPr && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 text-sky-800 dark:bg-sky-950/40 border border-sky-200 px-2.5 py-1 text-xs font-bold">
                <ShoppingCart className="h-3 w-3" /> {linkedPr.pr_number}
              </span>
            )}
          </div>

          {/* Requester & Site Context Box */}
          <div className="rounded-xl border border-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Raised By</span>
                <span className="font-bold text-foreground flex items-center gap-1.5 mt-0.5 text-sm">
                  <User className="h-4 w-4 text-primary" />
                  {mr.profiles?.name ?? 'Site Engineer'}
                </span>
                <span className="text-[11px] text-muted-foreground block">{mr.profiles?.email ?? ''}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Required On Site</span>
                <span className={`font-bold flex items-center gap-1 mt-0.5 text-sm ${overdue ? 'text-red-500' : 'text-foreground'}`}>
                  <Calendar className="h-4 w-4" />
                  {formatDate(mr.required_date)}
                </span>
                <span className="text-[10px] text-muted-foreground block">{overdue ? '⚠️ Overdue' : 'On Schedule'}</span>
              </div>
            </div>

            <div className="border-t border-border/80 pt-2.5 grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Project Location</span>
                <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  {mr.projects?.name ?? '—'}
                </span>
                <span className="text-[10px] text-muted-foreground block">{mr.site_block ?? mr.project_sites?.name ?? 'Main Site'}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Work Activity</span>
                <span className="font-semibold text-foreground mt-0.5 block">{mr.work_activity ?? '—'}</span>
              </div>
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
                <p className="text-[10px] text-muted-foreground">Approve or reject individual products based on material availability.</p>
              </div>

              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 font-bold">✓ {approvedLineCount}</span>
                <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 font-bold">📦 {fulfilledLineCount}</span>
                <span className="rounded bg-red-100 text-red-800 px-2 py-0.5 font-bold">✕ {rejectedLineCount}</span>
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
                              title="Approve item for Purchase Requisition"
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
                              title="Fulfill item from local stock"
                            >
                              Stock Issue
                            </button>

                            <button
                              onClick={() => updateLineStatus(l.id, 'rejected')}
                              className={`px-2 py-1 rounded font-bold text-[10px] transition-all ${
                                status === 'rejected'
                                  ? 'bg-red-600 text-white shadow-xs'
                                  : 'border border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                              }`}
                              title="Reject item due to availability"
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

          {/* FORMS */}
          {activeForm === 'clarify' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <label className="font-bold text-amber-800 dark:text-amber-400 block">Ask Clarification from Site Engineer</label>
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
                
                {approvedLineCount > 0 && canConvert && !linkedPr && (
                  <button
                    onClick={() => {
                      const approvedLines = lines.filter((l) => lineStatuses[l.id] === 'approved_for_pr');
                      onConvertToPr(mr, approvedLines.length > 0 ? approvedLines : lines);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
                  >
                    <ShoppingCart className="h-4 w-4" /> Convert {approvedLineCount} Approved Item{approvedLineCount > 1 ? 's' : ''} to PR
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
