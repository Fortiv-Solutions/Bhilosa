'use client';

// Per-status / priority / budget badges for the Purchase Requisition workspace.
// The shared StatusBadge is single-colour; PRs need a richer status colour map.

import type { PrWorkflowStatus, PrPriority, BudgetStatus } from '@/lib/erp/purchase-requisition/types';

const BADGE_BASE =
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap';

interface StatusMeta {
  label: string;
  cls: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700' },
  under_verification: { label: 'Under Verification', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  awaiting_assignment: { label: 'Awaiting Assignment', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  pending_procurement: { label: 'Pending Procurement', cls: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
  closed: { label: 'Closed', cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800' },
  returned_to_draft: { label: 'Returned to Draft', cls: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800' },
  revision_required: { label: 'Revision Required', cls: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700' },
  on_hold: { label: 'On Hold', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800' },
  // legacy states still present in data
  submitted: { label: 'Submitted', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  in_review: { label: 'In Review', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  assigned: { label: 'Assigned', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
  rfq_sent: { label: 'RFQ Sent', cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
  vendor_selected: { label: 'Vendor Selected', cls: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
  po_issued: { label: 'PO Issued', cls: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
};

export function statusMeta(status?: string | null): StatusMeta {
  return STATUS_META[String(status || 'draft')] ?? { label: String(status || 'unknown').replaceAll('_', ' '), cls: STATUS_META.draft.cls };
}

export function PrStatusBadge({ status }: { status?: PrWorkflowStatus | string | null }) {
  const meta = statusMeta(status);
  return <span className={`${BADGE_BASE} ${meta.cls}`}>{meta.label}</span>;
}

const PRIORITY_META: Record<string, StatusMeta> = {
  normal: { label: 'Normal', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700' },
  urgent: { label: 'Urgent', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
  // MR priorities
  low: { label: 'Low', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700' },
  medium: { label: 'Medium', cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  high: { label: 'High', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
};

export function PriorityBadge({ priority }: { priority?: PrPriority | string | null }) {
  const meta = PRIORITY_META[String(priority || 'normal')] ?? PRIORITY_META.normal;
  return <span className={`${BADGE_BASE} ${meta.cls}`}>{meta.label}</span>;
}

const BUDGET_META: Record<string, StatusMeta> = {
  within_budget: { label: 'Within Budget', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  near_limit: { label: 'Near Limit', cls: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  over_budget: { label: 'Over Budget', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
  not_applicable: { label: 'Not Applicable', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700' },
};

export function BudgetStatusBadge({ status }: { status?: BudgetStatus | string | null }) {
  if (!status) return null;
  const meta = BUDGET_META[String(status)] ?? BUDGET_META.not_applicable;
  return <span className={`${BADGE_BASE} ${meta.cls}`}>{meta.label}</span>;
}

export function ConversionBadge({ pending, approved }: { pending: number; approved: number }) {
  const converted = approved - pending;
  const isPartial = converted > 0 && pending > 0;
  const cls = isPartial
    ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
    : 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  return <span className={`${BADGE_BASE} ${cls}`}>{isPartial ? 'Partially Converted' : 'Not Converted'}</span>;
}
