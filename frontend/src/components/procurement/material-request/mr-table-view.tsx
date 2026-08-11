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
  FileDown,
} from 'lucide-react';
import type { MaterialRequestRow, PurchaseRequisitionRow, Role } from '@/lib/erp/material-request/types';
import type { ProcurementLineRow } from '@/lib/procurement';
import { ProcurementSplitProgressBar } from '../procurement-split-progress-bar';
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
  onPrintMr?: (mr: MaterialRequestRow) => void;
  onAction: (label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) => Promise<{ data: unknown; error: Error | null } | void>;
  onConvertToPr: (mr: MaterialRequestRow, approvedLines?: ProcurementLineRow[]) => void;
}

const PRIORITY_CONFIG = {
  critical: { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800', icon: Flame },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800', icon: Zap },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800', icon: Clock },
  low: { label: 'Low', className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800', icon: ArrowRight },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200' },
  in_review: { label: 'Under Review', className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200' },
  approved: { label: 'MR Approved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200' },
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
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${config.className}`}>
      {config.label}
    </span>
  );
}

function normalizeLineStatus(status?: string | null): 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | 'pending' {
  if (!status) return 'pending';
  if (status === 'approved' || status === 'approved_for_pr') return 'approved_for_pr';
  if (status === 'closed' || status === 'fulfilled_from_stock') return 'fulfilled_from_stock';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function LineStatusBadge({ lineStatus, mrStatus }: { lineStatus?: string | null; mrStatus: string }) {
  const norm = normalizeLineStatus(lineStatus);
  if (norm === 'approved_for_pr') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold">
        ✓ Approved PR
      </span>
    );
  }
  if (norm === 'fulfilled_from_stock') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-2 py-0.5 text-[10px] font-bold">
        📦 Stock Issue
      </span>
    );
  }
  if (norm === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300 border border-red-300 dark:border-red-800 px-2 py-0.5 text-[10px] font-bold">
        ✕ Rejected
      </span>
    );
  }
  return <StatusBadge status={mrStatus} />;
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
  onPrintMr,
  onAction,
  onConvertToPr,
}: MRTableViewProps) {
  const [actionLoading, setActionLoading] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden space-y-0">
      <div className="overflow-x-auto max-h-[740px]">
        <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
          {/* SOLID OPAQUE ERP TABLE HEADER */}
          <thead className="bg-muted text-muted-foreground uppercase font-bold text-[10px] tracking-wider border-b-2 border-border sticky top-0 z-30">
            <tr>
              <th className="px-3.5 py-3 text-center font-bold text-foreground bg-muted sticky left-0 z-20 w-12">Sr No.</th>
              <th className="px-4 py-3 font-bold text-foreground bg-muted">Project & Site</th>
              <th className="px-3.5 py-3 text-center font-bold text-primary bg-muted">Number of Items</th>
              <th className="px-3.5 py-3 text-center bg-muted">Priority</th>
              <th className="px-3.5 py-3 text-center bg-muted">Status</th>
              <th className="px-3.5 py-3 text-center bg-muted">Required By</th>
              <th className="px-4 py-3 bg-muted">Raised By</th>
              <th className="px-4 py-3 text-center bg-muted">View Details & Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40 bg-card">
            {materialRequests.map((mr, index) => {
              const lines = mr.material_request_lines ?? [];
              const overdue = isOverdue(mr.required_date) && mr.status !== 'closed' && mr.status !== 'rejected' && mr.status !== 'cancelled';
              const isSelected = selectedMrId === mr.id;

              const isEven = index % 2 === 0;
              const baseBgClass = isSelected
                ? 'bg-amber-100 dark:bg-amber-950 font-medium'
                : isEven 
                  ? 'bg-card' 
                  : 'bg-muted/30';

              const hoverBgClass = isSelected
                ? 'hover:bg-amber-200 dark:hover:bg-amber-900'
                : 'hover:bg-muted/60';

              const cellBgClass = `${baseBgClass} ${hoverBgClass} transition-colors`;

              const itemCount = lines.length > 0 ? lines.length : 1;
              const rawRaisedByName = (mr as any).raised_by_name?.trim() ||
                mr.profiles?.full_name?.trim() ||
                mr.profiles?.name?.trim() ||
                mr.profiles?.email?.trim() ||
                (mr.justification?.match(/Raised By:\s*([^•\n\r]+)/i)?.[1]?.trim()) ||
                'Site Engineer';
              const raisedByName = rawRaisedByName.replace(/\s*\([^)]*\)/g, '').trim() || 'Site Engineer';

              return (
                <tr
                  key={mr.id}
                  onClick={() => onSelectMr?.(mr)}
                  className={`cursor-pointer ${isSelected ? 'border-l-4 border-l-primary' : ''}`}
                >
                  {/* 1. Sr No */}
                  <td className={`px-3.5 py-3 text-center font-bold text-foreground sticky left-0 z-10 w-12 ${cellBgClass}`}>
                    {index + 1}
                  </td>

                  {/* 2. Project & Site */}
                  <td className={`px-4 py-3 ${cellBgClass}`}>
                    <div className="font-bold text-foreground">{mr.projects?.name ?? '—'}</div>
                    <div className="text-[10px] text-muted-foreground">{mr.site_block ?? mr.project_sites?.name ?? 'Main Site'}</div>
                  </td>

                  {/* 3. Number of Items */}
                  <td className={`px-3.5 py-3 text-center ${cellBgClass}`}>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold border border-primary/20">
                      {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                    </span>
                  </td>

                  {/* 5. Priority */}
                  <td className={`px-3.5 py-3 text-center ${cellBgClass}`}>
                    <PriorityBadge priority={mr.priority} />
                  </td>

                  {/* 6. Status */}
                  <td className={`px-3.5 py-3 text-center ${cellBgClass}`}>
                    <div className="flex flex-col items-center justify-center gap-1 min-w-[150px]">
                      <StatusBadge status={mr.status} />
                      {mr.clarification_text && (
                        <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 max-w-[160px] truncate" title={`Back to Draft Reason: ${mr.clarification_text}`}>
                          Reason: {mr.clarification_text}
                        </span>
                      )}
                      {(mr.status === 'approved' || mr.status === 'in_review') && (
                        <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[130px]" title={(mr as any).reviewed_by_name || 'PR Team'}>
                          by {((mr as any).reviewed_by_name || (mr as any).reviewed_by_profile?.name || (mr as any).reviewed_by_profile?.full_name || 'PR Team').replace(/\s*\([^)]*\)/g, '').trim()}
                        </span>
                      )}
                      <ProcurementSplitProgressBar mrId={mr.id} compact showDetails={true} />
                    </div>
                  </td>

                  {/* 7. Required By */}
                  <td className={`px-3.5 py-3 text-center ${cellBgClass}`}>
                    <span className={`font-bold text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                      {formatDate(mr.required_date)}
                    </span>
                  </td>

                  {/* 8. Raised By */}
                  <td className={`px-4 py-3 ${cellBgClass}`}>
                    <div className="font-semibold text-foreground">{raisedByName}</div>
                    <div className="text-[10px] text-muted-foreground">{formatAge(mr.created_at)}</div>
                  </td>

                  {/* 9. View Details & Actions */}
                  <td className={`px-4 py-3 text-center ${cellBgClass}`}>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMr?.(mr);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all shadow-2xs"
                        title="View Full Material Request Details & Line Item Actions"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Details
                      </button>
                      {onPrintMr && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPrintMr?.(mr);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-all shadow-2xs"
                          title="Directly Download Material Request PDF Report"
                        >
                          <FileDown className="h-3.5 w-3.5 text-primary" /> PDF
                        </button>
                      )}
                    </div>
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
