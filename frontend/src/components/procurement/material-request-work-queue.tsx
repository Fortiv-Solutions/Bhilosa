// Material Request Work Queue — Full-featured PR Team and Management interface.
// Embedded inside the /procurement page as the 'Material Requests' tab.
// Provides action-driven workflow: review, clarify, reject, fulfill from stock, convert to PR.

'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleX,
  ClipboardList,
  Clock,
  Eye,
  Filter,
  Flame,
  MessageSquare,
  PackageCheck,
  Search,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
  MessageCircle,
  HardHat,
  RefreshCcw,
} from 'lucide-react';
import {
  type MaterialRequestRow,
  type ProcurementProjectOption,
  type PurchaseRequisitionRow,
  type InventorySnapshotRow,
  rejectMaterialRequest,
  markMrUnderReview,
  askMrClarification,
  addManagementComment,
  reviewMaterialRequestInventory,
  issueMaterialFromStock,
} from '@/lib/procurement';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'UPPER_MANAGEMENT' | 'PR_TEAM' | 'PROJECT_MANAGER';

interface MaterialRequestWorkQueueProps {
  materialRequests: MaterialRequestRow[];
  purchaseRequisitions: PurchaseRequisitionRow[];
  inventorySnapshots: InventorySnapshotRow[];
  projectOptions: ProcurementProjectOption[];
  activeRole: Role;
  loading: boolean;
  onConvertToPr: (mr: MaterialRequestRow) => void;
  onRefresh: () => Promise<void>;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800', icon: Flame },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800', icon: Zap },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800', icon: Clock },
  low: { label: 'Low', className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800', icon: ArrowRight },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Clarification Req.', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400' },
  in_review: { label: 'Under Review', className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400' },
  approved: { label: 'Converted to PR', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400' },
  closed: { label: 'Fulfilled', className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400' },
};

const WORK_ACTIVITIES = [
  'Slab casting',
  'Brick work',
  'Plaster work',
  'Waterproofing',
  'Electrical work',
  'Plumbing',
  'Tile work',
  'Finishing',
  'Excavation',
  'Foundation',
  'Other',
];

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function isOverdue(requiredDate: string): boolean {
  return new Date(requiredDate) < new Date();
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status.replace(/_/g, ' '), className: 'bg-muted text-muted-foreground' };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof ClipboardList; label: string; value: number; accent?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 flex items-center gap-3 ${value > 0 && accent ? 'ring-1 ' + accent : ''}`}>
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${value > 0 && accent ? 'bg-opacity-20' : ''}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-xl font-bold text-foreground leading-none">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground font-medium">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

function DetailPanel({
  mr,
  linkedPr,
  activeRole,
  onClose,
  onAction,
  onConvertToPr,
}: {
  mr: MaterialRequestRow;
  linkedPr: PurchaseRequisitionRow | undefined;
  activeRole: Role;
  onClose: () => void;
  onAction: (label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) => Promise<void>;
  onConvertToPr: (mr: MaterialRequestRow) => void;
}) {
  const [clarificationInput, setClarificationInput] = useState('');
  const [rejectInput, setRejectInput] = useState('');
  const [managementCommentInput, setManagementCommentInput] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showClarifyForm, setShowClarifyForm] = useState(false);
  const [showManagementCommentForm, setShowManagementCommentForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isPrTeam = activeRole === 'PR_TEAM' || activeRole === 'UPPER_MANAGEMENT';
  const isManagement = activeRole === 'UPPER_MANAGEMENT';
  const canAct = mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
  const canConvert = canAct && mr.status !== 'approved';
  const canFulfill = canAct && (mr.stock_decision === 'available' || mr.status === 'in_review');
  const hasPr = !!linkedPr;

  async function handleAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    setActionLoading(true);
    await onAction(label, fn);
    setActionLoading(false);
  }

  const lines = mr.material_request_lines ?? [];

  return (
    <div className="fixed inset-0 z-40 flex" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden bg-card shadow-2xl border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-bold text-foreground">{mr.mr_number}</span>
                <StatusBadge status={mr.status} />
                <PriorityBadge priority={mr.priority} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mr.projects?.name ?? 'Unknown project'} {mr.project_sites?.name ? `· ${mr.project_sites.name}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Request info */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Request Details</h3>
            <div className="rounded-lg border border-border bg-background p-4 space-y-2.5 text-sm">
              {mr.justification && (
                <div><span className="font-semibold text-foreground">Reason / Justification</span>
                  <p className="mt-1 text-muted-foreground leading-relaxed">{mr.justification}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground font-medium">Raised By</span>
                  <p className="font-semibold text-foreground mt-0.5">{mr.profiles?.name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">Required By</span>
                  <p className={`font-semibold mt-0.5 ${isOverdue(mr.required_date) ? 'text-red-500' : 'text-foreground'}`}>
                    {formatDate(mr.required_date)}
                    {isOverdue(mr.required_date) && <span className="ml-1 text-red-500">⚠ Overdue</span>}
                  </p>
                </div>
                {mr.work_activity && (
                  <div>
                    <span className="text-muted-foreground font-medium">Work Activity</span>
                    <p className="font-semibold text-foreground mt-0.5">{mr.work_activity}</p>
                  </div>
                )}
                {mr.site_block && (
                  <div>
                    <span className="text-muted-foreground font-medium">Site Block/Tower</span>
                    <p className="font-semibold text-foreground mt-0.5">{mr.site_block}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground font-medium">Submitted</span>
                  <p className="font-semibold text-foreground mt-0.5">{formatDate(mr.submitted_at ?? mr.created_at)}</p>
                </div>
                {mr.stock_decision && (
                  <div>
                    <span className="text-muted-foreground font-medium">Stock Decision</span>
                    <p className="font-semibold text-foreground mt-0.5 capitalize">{mr.stock_decision.replace(/_/g, ' ')}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Material items */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Material Items ({lines.length})
            </h3>
            {lines.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No items recorded.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted text-muted-foreground uppercase font-bold border-b border-border">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right w-16">Qty</th>
                      <th className="px-3 py-2 text-right w-24">Est. Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => (
                      <tr key={line.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-semibold text-foreground">{line.item_description}</td>
                        <td className="px-3 py-2 text-right font-bold">{line.quantity}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {line.estimated_rate ? `₹${Number(line.estimated_rate).toLocaleString('en-IN')}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Clarification thread */}
          {(mr.clarification_text || mr.clarification_reply) && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Clarification Thread</h3>
              <div className="space-y-2.5">
                {mr.clarification_text && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-400">PR Team asked</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(mr.clarification_at)}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{mr.clarification_text}</p>
                  </div>
                )}
                {mr.clarification_reply && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400">Site replied</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(mr.clarification_replied_at)}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{mr.clarification_reply}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Rejection reason */}
          {mr.rejection_reason && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Rejection Reason</h3>
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <CircleX className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-xs font-bold text-red-700 dark:text-red-400">Rejected {formatDate(mr.reviewed_at)}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{mr.rejection_reason}</p>
              </div>
            </section>
          )}

          {/* Linked PR */}
          {hasPr && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Linked Purchase Requisition</h3>
              <div className="rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">{linkedPr!.pr_number}</p>
                    <p className="text-xs text-muted-foreground">{linkedPr!.title}</p>
                  </div>
                  <StatusBadge status={linkedPr!.status} />
                </div>
              </div>
            </section>
          )}

          {/* Management comment */}
          {mr.management_comment && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Management Note</h3>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm text-foreground leading-relaxed">{mr.management_comment}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatDate(mr.management_comment_at)}</p>
              </div>
            </section>
          )}

          {/* ---- PR TEAM ACTIONS ---- */}
          {isPrTeam && canAct && (
            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">PR Team Actions</h3>
              <div className="flex flex-wrap gap-2">

                {mr.status === 'submitted' && (
                  <button
                    onClick={() => handleAction('Request marked under review.', () => markMrUnderReview(mr))}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 disabled:opacity-50 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-400 dark:hover:bg-purple-900/40 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> Mark Under Review
                  </button>
                )}

                {mr.status === 'in_review' && (
                  <button
                    onClick={() => handleAction('Stock inventory check completed.', () => reviewMaterialRequestInventory(mr))}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400 transition-colors"
                  >
                    <PackageCheck className="h-3.5 w-3.5" /> Check Stock
                  </button>
                )}

                {canFulfill && (
                  <button
                    onClick={() => handleAction('Material issued from stock. Request fulfilled.', () => issueMaterialFromStock(mr))}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 transition-colors"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> Fulfill from Stock
                  </button>
                )}

                {canConvert && !hasPr && (
                  <button
                    onClick={() => onConvertToPr(mr)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Convert to PR
                  </button>
                )}

                {!showClarifyForm && !showRejectForm && (
                  <button
                    onClick={() => setShowClarifyForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400 transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Ask Clarification
                  </button>
                )}

                {!showRejectForm && !showClarifyForm && (
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 transition-colors"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
              </div>

              {/* Clarification form */}
              {showClarifyForm && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                  <label className="text-xs font-bold text-amber-800 dark:text-amber-400">Clarification message for site engineer</label>
                  <textarea
                    value={clarificationInput}
                    onChange={(e) => setClarificationInput(e.target.value)}
                    rows={3}
                    placeholder="What information do you need from the site engineer?"
                    className="w-full rounded-md border border-amber-200 bg-white dark:bg-background dark:border-amber-800 px-3 py-2 text-sm outline-none focus:border-amber-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!clarificationInput.trim()) return;
                        await handleAction('Clarification sent to site engineer.', () => askMrClarification(mr, clarificationInput));
                        setClarificationInput('');
                        setShowClarifyForm(false);
                      }}
                      disabled={!clarificationInput.trim() || actionLoading}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Send
                    </button>
                    <button onClick={() => setShowClarifyForm(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Reject form */}
              {showRejectForm && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 space-y-2">
                  <label className="text-xs font-bold text-red-700 dark:text-red-400">Rejection reason (required)</label>
                  <textarea
                    value={rejectInput}
                    onChange={(e) => setRejectInput(e.target.value)}
                    rows={3}
                    placeholder="Provide a clear reason for rejecting this material request..."
                    className="w-full rounded-md border border-red-200 bg-white dark:bg-background dark:border-red-800 px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!rejectInput.trim()) return;
                        await handleAction('Material request rejected.', () => rejectMaterialRequest(mr, rejectInput));
                        setRejectInput('');
                        setShowRejectForm(false);
                      }}
                      disabled={!rejectInput.trim() || actionLoading}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm Reject
                    </button>
                    <button onClick={() => setShowRejectForm(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ---- MANAGEMENT COMMENT ---- */}
          {isManagement && (
            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Management Notes</h3>
              {!showManagementCommentForm ? (
                <button
                  onClick={() => setShowManagementCommentForm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Add Management Note
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={managementCommentInput}
                    onChange={(e) => setManagementCommentInput(e.target.value)}
                    rows={3}
                    placeholder="Add an executive note, escalation flag, or monitoring comment..."
                    className="w-full rounded-md border border-primary/20 bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!managementCommentInput.trim()) return;
                        await handleAction('Management note added.', () => addManagementComment(mr, managementCommentInput));
                        setManagementCommentInput('');
                        setShowManagementCommentForm(false);
                      }}
                      disabled={!managementCommentInput.trim() || actionLoading}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Save Note
                    </button>
                    <button onClick={() => setShowManagementCommentForm(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MaterialRequestWorkQueue({
  materialRequests,
  purchaseRequisitions,
  inventorySnapshots: _inventorySnapshots,
  projectOptions,
  activeRole,
  loading,
  onConvertToPr,
  onRefresh,
  onMessage,
  onError,
}: MaterialRequestWorkQueueProps) {
  const [selectedMr, setSelectedMr] = useState<MaterialRequestRow | null>(null);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Computed stats
  const stats = useMemo(() => {
    const total = materialRequests.length;
    const pending = materialRequests.filter((mr) => mr.status === 'submitted').length;
    const critical = materialRequests.filter((mr) => mr.priority === 'critical' && mr.status !== 'closed' && mr.status !== 'rejected').length;
    const overdue = materialRequests.filter((mr) => isOverdue(mr.required_date) && mr.status !== 'closed' && mr.status !== 'cancelled' && mr.status !== 'rejected').length;
    const underReview = materialRequests.filter((mr) => mr.status === 'in_review').length;
    const clarification = materialRequests.filter((mr) => mr.status === 'draft').length;
    const fulfilled = materialRequests.filter((mr) => mr.status === 'closed').length;
    const converted = materialRequests.filter((mr) => mr.status === 'approved').length;
    const rejected = materialRequests.filter((mr) => mr.status === 'rejected').length;
    return { total, pending, critical, overdue, underReview, clarification, fulfilled, converted, rejected };
  }, [materialRequests]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = [...materialRequests];

    if (filterProject) list = list.filter((mr) => mr.project_id === filterProject);
    if (filterStatus) list = list.filter((mr) => mr.status === filterStatus);
    if (filterPriority) list = list.filter((mr) => mr.priority === filterPriority);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (mr) =>
          mr.mr_number.toLowerCase().includes(q) ||
          mr.justification?.toLowerCase().includes(q) ||
          mr.profiles?.name?.toLowerCase().includes(q) ||
          mr.projects?.name?.toLowerCase().includes(q) ||
          mr.material_request_lines?.some((l) => l.item_description.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [materialRequests, filterProject, filterStatus, filterPriority, searchQuery]);

  const linkedPrFor = (mr: MaterialRequestRow) => purchaseRequisitions.find((pr) => pr.material_request_id === mr.id);

  async function runAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    const result = await fn();
    if (result.error) {
      onError(result.error.message);
      return;
    }
    onMessage(label);
    await onRefresh();
    // Refresh selected MR data from the refreshed list
    setSelectedMr(null);
  }

  return (
    <div className="space-y-5">

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard icon={ClipboardList} label="Total" value={stats.total} />
        <StatCard icon={Zap} label="New Requests" value={stats.pending} accent="ring-blue-200 dark:ring-blue-800" />
        <StatCard icon={Flame} label="Critical" value={stats.critical} accent="ring-red-200 dark:ring-red-800" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue} accent="ring-orange-200 dark:ring-orange-800" />
        <StatCard icon={Eye} label="Under Review" value={stats.underReview} />
        <StatCard icon={MessageSquare} label="Clarification" value={stats.clarification} />
        <StatCard icon={CheckCircle2} label="Fulfilled" value={stats.fulfilled} />
        <StatCard icon={ShoppingCart} label="Converted PR" value={stats.converted} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search MR#, item, requester..."
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-medium outline-none"
          >
            <option value="">All Projects</option>
            {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-medium outline-none"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">Under Review</option>
            <option value="draft">Clarification Req.</option>
            <option value="approved">Converted to PR</option>
            <option value="closed">Fulfilled</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-medium outline-none"
          >
            <option value="">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            onClick={() => { setFilterProject(''); setFilterStatus(''); setFilterPriority(''); setSearchQuery(''); }}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* MR List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-4 h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background py-16 text-center">
          <HardHat className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">No material requests found</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {materialRequests.length === 0 ? 'No requests have been raised yet.' : 'Try clearing filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((mr) => {
            const linkedPr = linkedPrFor(mr);
            const overdue = isOverdue(mr.required_date) && mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
            const lines = mr.material_request_lines ?? [];

            return (
              <button
                key={mr.id}
                onClick={() => setSelectedMr(mr)}
                className={`w-full text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group ${
                  overdue ? 'border-orange-200 dark:border-orange-800/50' : 'border-border'
                } ${selectedMr?.id === mr.id ? 'ring-2 ring-primary/30' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-sm font-bold text-foreground">{mr.mr_number}</span>
                      <StatusBadge status={mr.status} />
                      <PriorityBadge priority={mr.priority} />
                      {overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 px-2 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-400">
                          <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                        </span>
                      )}
                      {linkedPr && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-400">
                          <ShoppingCart className="h-2.5 w-2.5" /> {linkedPr.pr_number}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {mr.projects?.name ?? 'Unknown project'}
                        {mr.project_sites?.name && <> · {mr.project_sites.name}</>}
                        {mr.site_block && <> · {mr.site_block}</>}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardHat className="h-3 w-3" />
                        {mr.profiles?.name ?? 'Unknown'}
                      </span>
                      <span className={`flex items-center gap-1 ${overdue ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}`}>
                        <Calendar className="h-3 w-3" />
                        Required: {formatDate(mr.required_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatAge(mr.created_at)}
                      </span>
                    </div>

                    {lines.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{lines.length} item{lines.length !== 1 ? 's' : ''}: </span>
                        {lines.slice(0, 3).map((l) => l.item_description).join(', ')}
                        {lines.length > 3 && ` +${lines.length - 3} more`}
                      </p>
                    )}
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {selectedMr && (
        <DetailPanel
          mr={selectedMr}
          linkedPr={linkedPrFor(selectedMr)}
          activeRole={activeRole}
          onClose={() => setSelectedMr(null)}
          onAction={runAction}
          onConvertToPr={(mr) => {
            setSelectedMr(null);
            onConvertToPr(mr);
          }}
        />
      )}
    </div>
  );
}

export { WORK_ACTIVITIES };
