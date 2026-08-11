'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CircleX,
  Clock,
  Eye,
  Flame,
  MessageSquare,
  PackageCheck,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
  Zap,
  MessageCircle,
  HardHat,
  Boxes,
  User,
} from 'lucide-react';
import type { MaterialRequestRow, PurchaseRequisitionRow, Role } from '@/lib/erp/material-request/types';
import {
  rejectMaterialRequest,
  markMrUnderReview,
  addManagementComment,
  reviewMaterialRequestInventory,
  issueMaterialFromStock,
} from '@/lib/procurement';

interface MRTableRowProps {
  mr: MaterialRequestRow;
  linkedPr: PurchaseRequisitionRow | undefined;
  activeRole: Role;
  onAction: (label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) => Promise<void>;
  onConvertToPr: (mr: MaterialRequestRow) => void;
}

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800', icon: Flame },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800', icon: Zap },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800', icon: Clock },
  low: { label: 'Low', className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800', icon: ArrowRight },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400' },
  in_review: { label: 'Under Review', className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400' },
  approved: { label: 'MR Approved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400' },
  closed: { label: 'Fulfilled', className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-400' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400' },
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

function StockDecisionBadge({ decision }: { decision?: string | null }) {
  if (!decision) return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-bold uppercase">Pending Audit</span>;
  if (decision === 'available') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase">Stock Available</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase">Shortage</span>;
}

export function MRTableRow({ mr, linkedPr, activeRole, onAction, onConvertToPr }: MRTableRowProps) {
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
  const overdue = isOverdue(mr.required_date) && mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
  const lines = mr.material_request_lines ?? [];
  const firstLine = lines[0];

  async function handleAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    setActionLoading(true);
    await onAction(label, fn);
    setActionLoading(false);
  }

  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-all space-y-4 ${
      overdue ? 'border-orange-200 dark:border-orange-800/50' : 'border-border'
    }`}>
      
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-base font-bold text-foreground">{mr.mr_number}</span>
          <StatusBadge status={mr.status} />
          <PriorityBadge priority={mr.priority} />
          <StockDecisionBadge decision={mr.stock_decision} />
          
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

        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatAge(mr.created_at)}
        </span>
      </div>

      {/* METADATA GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-bold">Project & Site</span>
          <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
            <Building2 className="h-3 w-3 text-primary" />
            {mr.projects?.name ?? '—'}
          </span>
          <span className="text-[10px] text-muted-foreground block">{mr.site_block ?? mr.project_sites?.name ?? 'Main Site'}</span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-bold">Activity Name & Code</span>
          <span className="font-semibold text-foreground mt-0.5 block truncate">
            {mr.activity_name ?? firstLine?.activity_name ?? mr.work_activity ?? '—'}
            {(mr.activity_code || firstLine?.activity_code) && (
              <span className="ml-1 text-[10px] font-mono text-muted-foreground">({mr.activity_code ?? firstLine?.activity_code})</span>
            )}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-bold">Raised By</span>
          <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3 text-primary" />
            {mr.profiles?.name ?? 'Site Team'}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-bold">Required On Site</span>
          <span className={`font-semibold flex items-center gap-1 mt-0.5 ${overdue ? 'text-red-500 font-bold' : 'text-foreground'}`}>
            <Calendar className="h-3 w-3" />
            {formatDate(mr.required_date)}
          </span>
        </div>

        <div>
          <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-bold">Total Items</span>
          <span className="font-bold text-foreground mt-0.5 flex items-center gap-1">
            <Boxes className="h-3 w-3 text-primary" />
            {lines.length} Line Item{lines.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* INLINE MATERIAL ITEMS (21-COLUMN ENTERPRISE GRID) & JUSTIFICATION */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* 21-column Lines table */}
        <div className="lg:col-span-3 rounded-lg border border-border overflow-hidden bg-background">
          <div className="overflow-x-auto max-h-[340px]">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-muted/80 text-muted-foreground uppercase font-bold border-b border-border text-[10px] sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-center w-10">Sr</th>
                  <th className="px-3 py-2">Activity Name</th>
                  <th className="px-3 py-2">Item Group</th>
                  <th className="px-4 py-2 font-bold text-foreground">Item Description</th>
                  <th className="px-2 py-2 text-center text-primary font-bold">Units *</th>
                  <th className="px-3 py-2 text-center text-primary font-bold">Req Date *</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2 text-right text-primary font-bold bg-primary/5">Quantity *</th>
                  <th className="px-2.5 py-2 text-right">PR Bal Qty</th>
                  <th className="px-2.5 py-2 text-center">Lead Period</th>
                  <th className="px-3 py-2 text-center">Lead Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {lines.map((line, idx) => {
                  const srNo = line.sr_no ?? idx + 1;
                  const reqDate = line.required_date ?? mr.required_date;
                  const leadDays = line.lead_period_days ?? 3;
                  const leadDate = line.lead_period_date ?? formatDate(new Date(new Date(reqDate).getTime() - leadDays * 86400000).toISOString());

                  return (
                    <tr key={line.id} className="hover:bg-muted/30">
                      <td className="px-2 py-2 text-center font-bold text-muted-foreground">{srNo}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{line.activity_name ?? line.work_activity ?? mr.work_activity ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{line.item_group ?? '—'}</td>
                      <td className="px-4 py-2 font-bold text-foreground">{line.item_description}</td>
                      <td className="px-2 py-2 text-center font-bold text-primary">{line.unit ?? 'nos'}</td>
                      <td className="px-3 py-2 text-center font-medium text-foreground">{formatDate(reqDate)}</td>
                      <td className="px-3 py-2 text-muted-foreground font-semibold">{line.item_brand ?? line.specification ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-bold text-primary bg-primary/5 text-sm">{line.quantity}</td>
                      <td className="px-2.5 py-2 text-right font-semibold text-amber-600 dark:text-amber-400">{line.pr_bal_qty ?? '—'}</td>
                      <td className="px-2.5 py-2 text-center text-muted-foreground">{leadDays} days</td>
                      <td className="px-3 py-2 text-center font-medium text-muted-foreground">{formatDate(leadDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Justification & Comments Box */}
        <div className="rounded-lg border border-border bg-background p-3.5 text-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Justification / Purpose
            </span>
            <p className="text-foreground leading-relaxed italic">{mr.justification || 'No justification provided.'}</p>
          </div>

          {mr.management_comment && (
            <div className="mt-3 border-t border-border pt-2.5 text-[11px]">
              <span className="font-bold text-primary block">Management Note:</span>
              <p className="text-muted-foreground">{mr.management_comment}</p>
            </div>
          )}
        </div>
      </div>

      {/* CLARIFICATION & REJECTION HISTORY */}
      {(mr.clarification_text || mr.clarification_reply || mr.rejection_reason) && (
        <div className="space-y-2 pt-1 text-xs">
          {mr.clarification_text && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2.5">
              <span className="font-bold text-amber-800 dark:text-amber-400">Back to Draft / Clarification Reason {mr.clarification_at ? `(${formatDate(mr.clarification_at)})` : ''}:</span>
              <p className="mt-0.5 text-foreground">{mr.clarification_text}</p>
            </div>
          )}
          {mr.clarification_reply && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
              <span className="font-bold text-emerald-800 dark:text-emerald-400">Site Engineer Reply ({formatDate(mr.clarification_replied_at)}):</span>
              <p className="mt-0.5 text-foreground">{mr.clarification_reply}</p>
            </div>
          )}
          {mr.rejection_reason && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-2.5">
              <span className="font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                <CircleX className="h-3.5 w-3.5" /> Rejection Reason:
              </span>
              <p className="mt-0.5 text-foreground">{mr.rejection_reason}</p>
            </div>
          )}
        </div>
      )}

      {/* ACTION TOOLBAR (Hiding for view-only module) */}
      {false && isPrTeam && canAct && (
        <div className="border-t border-border pt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {mr.status === 'submitted' && (
              <button
                onClick={() => handleAction('Request marked under review.', () => markMrUnderReview(mr))}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-400"
              >
                <Eye className="h-3.5 w-3.5" /> Mark Under Review
              </button>
            )}

            {mr.status === 'in_review' && (
              <button
                onClick={() => handleAction('Stock inventory check completed.', () => reviewMaterialRequestInventory(mr))}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400"
              >
                <PackageCheck className="h-3.5 w-3.5" /> Check Stock
              </button>
            )}

            {canFulfill && (
              <button
                onClick={() => handleAction('Material issued from stock.', () => issueMaterialFromStock(mr))}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Fulfill Stock
              </button>
            )}

            {canConvert && !hasPr && (
              <button
                onClick={() => onConvertToPr(mr)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
              >
                <ShoppingCart className="h-3.5 w-3.5" /> Convert to PR
              </button>
            )}

            {!showRejectForm && (
              <button
                onClick={() => setShowRejectForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Reject
              </button>
            )}
          </div>

          {isManagement && !showManagementCommentForm && (
            <button
              onClick={() => setShowManagementCommentForm(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" /> + Executive Note
            </button>
          )}
        </div>
      )}

      {/* REJECT FORM */}
      {showRejectForm && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 space-y-2 text-xs">
          <label className="font-bold text-red-700 dark:text-red-400">Rejection Reason</label>
          <textarea
            value={rejectInput}
            onChange={(e) => setRejectInput(e.target.value)}
            rows={2}
            placeholder="Why is this request rejected?"
            className="w-full rounded-md border border-red-300 bg-background px-3 py-2 outline-none"
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
              className="rounded-md bg-red-600 px-3 py-1 text-white font-bold"
            >
              Confirm Reject
            </button>
            <button onClick={() => setShowRejectForm(false)} className="rounded-md border px-3 py-1 font-bold">Cancel</button>
          </div>
        </div>
      )}

      {/* EXECUTIVE NOTE FORM */}
      {showManagementCommentForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
          <label className="font-bold text-primary">Executive Management Note</label>
          <textarea
            value={managementCommentInput}
            onChange={(e) => setManagementCommentInput(e.target.value)}
            rows={2}
            placeholder="Add executive guidance or escalation note..."
            className="w-full rounded-md border border-primary/20 bg-background px-3 py-2 outline-none"
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
              className="rounded-md bg-primary px-3 py-1 text-primary-foreground font-bold"
            >
              Save Note
            </button>
            <button onClick={() => setShowManagementCommentForm(false)} className="rounded-md border px-3 py-1 font-bold">Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}
