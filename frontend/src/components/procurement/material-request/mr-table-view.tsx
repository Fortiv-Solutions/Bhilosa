'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Flame,
  PackageCheck,
  ShoppingCart,
  ThumbsUp,
  Zap,
  Clock,
} from 'lucide-react';
import type { MaterialRequestRow, PurchaseRequisitionRow, Role } from '@/lib/erp/material-request/types';
import type { ProcurementLineRow } from '@/lib/procurement';
import {
  markMrUnderReview,
  reviewMaterialRequestInventory,
  issueMaterialFromStock,
} from '@/lib/procurement';

interface MRTableViewProps {
  materialRequests: MaterialRequestRow[];
  purchaseRequisitions: PurchaseRequisitionRow[];
  activeRole: Role;
  selectedMrId?: string | null;
  onSelectMr?: (mr: MaterialRequestRow) => void;
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

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status.replace(/_/g, ' '), className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex rounded-md border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.className}`}>
      {config.label}
    </span>
  );
}

function StockDecisionBadge({ decision }: { decision?: string | null }) {
  if (!decision) return <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-100 text-gray-700 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-bold uppercase">Pending Audit</span>;
  if (decision === 'available') {
    return <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase">Stock Available</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase">Shortage</span>;
}

export function MRTableView({
  materialRequests,
  purchaseRequisitions,
  activeRole,
  selectedMrId,
  onSelectMr,
  onAction,
  onConvertToPr,
}: MRTableViewProps) {
  const [actionLoading, setActionLoading] = useState(false);

  const isPrTeam = activeRole === 'PR_TEAM' || activeRole === 'UPPER_MANAGEMENT';

  async function handleAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    setActionLoading(true);
    await onAction(label, fn);
    setActionLoading(false);
  }

  // Flatten Material Request Header + Lines into flat Table Rows
  type FlatRow = {
    srNo: number;
    mr: MaterialRequestRow;
    line: ProcurementLineRow | null;
    lineIndex: number;
    linkedPr: PurchaseRequisitionRow | undefined;
    overdue: boolean;
    canAct: boolean;
    canConvert: boolean;
    canFulfill: boolean;
  };
  let globalRowCounter = 1;
  const flatRows = materialRequests.flatMap((mr): FlatRow[] => {
    const lines = mr.material_request_lines ?? [];
    const linkedPr = purchaseRequisitions.find((pr) => pr.material_request_id === mr.id);
    const overdue = isOverdue(mr.required_date) && mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
    const canAct = mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
    const canConvert = canAct && mr.status !== 'approved';
    const canFulfill = canAct && (mr.stock_decision === 'available' || mr.status === 'in_review');

    if (lines.length === 0) {
      const srNo = globalRowCounter++;
      return [{
        srNo,
        mr,
        line: null,
        lineIndex: 0,
        linkedPr,
        overdue,
        canAct,
        canConvert,
        canFulfill,
      }];
    }

    return lines.map((line, lineIndex) => {
      const srNo = globalRowCounter++;
      return {
        srNo,
        mr,
        line,
        lineIndex,
        linkedPr,
        overdue,
        canAct,
        canConvert,
        canFulfill,
      };
    });
  });

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto max-h-[720px]">
        <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                   {/* CLEAN ERP TABLE HEADER FOR MATERIAL REQUESTS (18 SPECIFIED MR COLUMNS) */}
          <thead className="bg-muted/90 text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b border-border sticky top-0 z-30 shadow-xs">
            <tr>
              {/* 1. Sr No (Sticky Column 1) */}
              <th className="px-3 py-3 text-center border-r border-border/70 font-bold text-foreground bg-muted/90 sticky left-0 z-20 w-12 shadow-xs">Sr No.</th>
              
              {/* 2. MR Number (Sticky Column 2) */}
              <th className="px-3.5 py-3 border-r border-border/70 font-bold text-primary bg-muted/90 sticky left-12 z-20 shadow-xs">MR Number</th>
              
              {/* 3. Status / Approval */}
              <th className="px-3 py-3 border-r border-border/70">Status / Approved</th>
              
              {/* 4. Priority */}
              <th className="px-3 py-3 border-r border-border/70">Priority</th>
              
              {/* 5. Stock Audit */}
              <th className="px-3 py-3 border-r border-border/70">Stock Audit</th>
              
              {/* 6. Project & Site */}
              <th className="px-4 py-3 border-r border-border/70 font-bold text-foreground">Project & Site</th>
              
              {/* 7. Work Activity */}
              <th className="px-3.5 py-3 border-r border-border/70">Work Activity</th>
              <th className="px-2.5 py-3 border-r border-border/70">Activity Code</th>
              
              {/* 8. Item Catalogue Columns */}
              <th className="px-2.5 py-3 border-r border-border/70">Item Code</th>
              <th className="px-3 py-3 border-r border-border/70">Item Group</th>
              <th className="px-4 py-3 border-r border-border/70 font-bold text-foreground">Item Description</th>
              <th className="px-2.5 py-3 text-center border-r border-border/70 text-primary font-bold">Units *</th>
              <th className="px-3 py-3 text-center border-r border-border/70 text-primary font-bold">Required Date *</th>
              <th className="px-3 py-3 border-r border-border/70">Item Brand</th>
              <th className="px-3 py-3 border-r border-border/70">Item Specification</th>
              
              {/* 9. Quantity */}
              <th className="px-3 py-3 text-right border-r border-border/70 text-primary font-bold bg-primary/10">Quantity *</th>
              
              {/* 10. Raised By & Submitted */}
              <th className="px-3 py-3 border-r border-border/70">Raised By</th>
              <th className="px-3 py-3 text-center">Submitted</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/80 bg-card">
            {flatRows.map(({ srNo, mr, line, lineIndex, linkedPr, overdue, canAct, canConvert, canFulfill }) => {
              const reqDate = line?.required_date ?? mr.required_date;
              const isSelected = selectedMrId === mr.id;

              return (
                <tr
                  key={`${mr.id}-${line?.id ?? lineIndex}`}
                  onClick={() => onSelectMr?.(mr)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10 font-medium border-l-4 border-l-primary' : 'hover:bg-muted/30'
                  }`}
                >
                  
                  {/* Column 1: Sr No. (Sticky Left 1) */}
                  <td className="px-3 py-2.5 text-center font-bold text-foreground border-r border-border/60 bg-card sticky left-0 z-10 w-12">
                    {srNo}
                  </td>

                  {/* Column 2: MR Number (Sticky Left 2) */}
                  <td className="px-3.5 py-2.5 font-mono font-bold text-primary border-r border-border/60 bg-card sticky left-12 z-10">
                    {mr.mr_number}
                    {linkedPr && (
                      <span className="ml-1 text-[10px] text-sky-600 font-normal">({linkedPr.pr_number})</span>
                    )}
                  </td>

                  {/* Column 3: Status / Approved */}
                  <td className="px-3 py-2.5 border-r border-border/60">
                    <StatusBadge status={mr.status} />
                  </td>

                  {/* Column 4: Priority */}
                  <td className="px-3 py-2.5 border-r border-border/60">
                    <PriorityBadge priority={mr.priority} />
                  </td>

                  {/* Column 5: Stock Audit */}
                  <td className="px-3 py-2.5 border-r border-border/60">
                    <StockDecisionBadge decision={mr.stock_decision} />
                  </td>

                  {/* Column 6: Project & Site */}
                  <td className="px-4 py-2.5 border-r border-border/60">
                    <div className="font-bold text-foreground">{mr.projects?.name ?? '—'}</div>
                    <div className="text-[10px] text-muted-foreground">({mr.site_block ?? mr.project_sites?.name ?? 'Main Site'})</div>
                  </td>

                  {/* Column 7: Work Activity */}
                  <td className="px-3.5 py-2.5 font-medium text-foreground border-r border-border/60">
                    {line?.activity_name ?? mr.work_activity ?? '—'}
                  </td>

                  {/* Activity Code */}
                  <td className="px-2.5 py-2.5 text-muted-foreground font-mono text-[11px] border-r border-border/60">
                    {line?.activity_code ?? '—'}
                  </td>

                  {/* Item Code */}
                  <td className="px-2.5 py-2.5 text-muted-foreground font-mono text-[11px] border-r border-border/60">
                    {line?.item_code ?? '—'}
                  </td>

                  {/* Item Group */}
                  <td className="px-3 py-2.5 text-muted-foreground border-r border-border/60">
                    {line?.item_group ?? '—'}
                  </td>

                  {/* Item Description */}
                  <td className="px-4 py-2.5 font-bold text-foreground border-r border-border/60">
                    {line?.item_description ?? '—'}
                  </td>

                  {/* Units (Mandatory) */}
                  <td className="px-2.5 py-2.5 text-center font-bold text-primary border-r border-border/60">
                    {line?.unit ?? 'nos'}
                  </td>

                  {/* Required Date (Mandatory) */}
                  <td className="px-3 py-2.5 text-center border-r border-border/60">
                    <span className={`font-bold ${overdue ? 'text-red-500' : 'text-foreground'}`}>
                      {formatDate(reqDate)}
                    </span>
                  </td>

                  {/* Item Brand */}
                  <td className="px-3 py-2.5 text-muted-foreground font-semibold border-r border-border/60">
                    {line?.item_brand ?? '—'}
                  </td>

                  {/* Item Specification */}
                  <td className="px-3 py-2.5 text-muted-foreground border-r border-border/60">
                    {line?.item_specification ?? '—'}
                  </td>

                  {/* Quantity (Mandatory) */}
                  <td className="px-3 py-2.5 text-right font-bold text-primary bg-primary/5 text-sm border-r border-border/60">
                    {line?.quantity ?? 0}
                  </td>

                  {/* Raised By */}
                  <td className="px-3 py-2.5 border-r border-border/60 font-medium text-foreground">
                    {mr.profiles?.name ?? 'Site Team'}
                  </td>

                  {/* Submitted Date */}
                  <td className="px-3 py-2.5 text-center text-muted-foreground">
                    {formatAge(mr.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
