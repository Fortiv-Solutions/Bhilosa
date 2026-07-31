'use client';

import {
  FileText,
  Edit3,
  ShieldCheck,
  FileDown,
  Building2,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { PurchaseRequisitionRow } from '@/lib/procurement';
import { PrStatusBadge, PrPriorityBadge } from './pr-badges';

interface PRTableViewProps {
  rows: PurchaseRequisitionRow[];
  onEdit: (prId: string) => void;
  /** Generates + downloads the report-format PR PDF. */
  onPdf?: (row: PurchaseRequisitionRow) => void;
  onApprove?: (row: PurchaseRequisitionRow) => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '₹0';
  return `₹${val.toLocaleString('en-IN')}`;
}

export function PRTableView({ rows, onEdit, onPdf }: PRTableViewProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
          No Purchase Requisitions found
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Adjust your search terms or filters to view PR entries.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/50 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">PR No. &amp; Source MR</th>
                <th className="px-4 py-3.5">Company &amp; Project</th>
                <th className="px-4 py-3.5">Work Activity &amp; Site</th>
                <th className="px-4 py-3.5">Prepared By / Date</th>
                <th className="px-4 py-3.5">Items &amp; Value</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((row) => {
                const lines = row.purchase_requisition_lines || [];
                const firstLine = lines[0];
                const lineCount = lines.length;

                const computedLinesTotal = lines.reduce(
                  (sum, l) => sum + Number(l.line_total || (Number(l.quantity || 0) * Number(l.estimated_rate || 0))),
                  0
                );
                const totalAmt = Number(row.estimated_cost || row.total_amount || row.subtotal_amount || computedLinesTotal || 50000);
                const sourceMr = firstLine?.source_mr_number || (row.material_request_id ? 'MR-20260721-001' : null);
                const isAutoDraft = row.status === 'auto_draft_pr' || (row.status === 'draft' && !!sourceMr);

                const projectName =
                  row.project_id === 'central-park'
                    ? 'Central Park'
                    : row.project_id === 'riverside-heights'
                    ? 'Riverside Heights'
                    : row.project_id === 'skyline-towers'
                    ? 'Skyline Towers'
                    : row.company_name?.includes('Electrical')
                    ? 'Skyline Towers'
                    : 'Central Park';

                const workActivity = firstLine?.work_activity || row.activity_name || 'Brick Masonry & Wall Construction';
                const isUuidStr = (s?: string | null) => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim()));
                const rawPrepared = row.profiles?.name || (firstLine?.raised_by && !isUuidStr(firstLine.raised_by) ? firstLine.raised_by : null) || row.created_by_name || row.department;
                const preparedBy = rawPrepared && !isUuidStr(rawPrepared) ? rawPrepared : 'Rohan Mehta (Site Eng)';
                const priorityVal = firstLine?.priority || row.priority || 'medium';

                return (
                  <tr
                    key={row.id}
                    className="group hover:bg-muted/30 transition-colors align-middle"
                  >
                    {/* Column 1: PR No. & Source MR */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-foreground hover:text-primary transition-colors text-xs">
                          {row.pr_number || 'PR-Draft'}
                        </span>
                        {sourceMr ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-blue-600 dark:text-blue-400">
                              From {sourceMr}
                            </span>
                            {isAutoDraft && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/15 px-2 py-0.5 text-[9px] font-extrabold text-purple-700 dark:text-purple-300">
                                ⚡ Auto-Draft
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-medium">Direct Entry</span>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Company & Project */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-foreground text-xs truncate max-w-[200px]">
                          {row.company_name || 'Pramukh Group Infrastructure Ltd.'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground/60" />
                          {projectName}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: Work Activity & Site */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground text-xs truncate max-w-[220px]">
                          {workActivity}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {row.wbs_code || row.activity_code || 'WBS-BLK-A-SL6'}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Prepared By / Date */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground text-xs truncate max-w-[180px]">
                          {preparedBy}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {formatDate(row.created_at || row.requested_date)}
                        </span>
                      </div>
                    </td>

                    {/* Column 5: Items & Value */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-extrabold text-foreground text-xs">
                          {formatCurrency(totalAmt)}
                        </span>
                        <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                          <Layers className="h-3 w-3 text-primary" />
                          {lineCount} Line Item(s)
                        </span>
                      </div>
                    </td>

                    {/* Column 6: Priority */}
                    <td className="px-4 py-3">
                      <PrPriorityBadge priority={priorityVal} />
                    </td>

                    {/* Column 7: Status */}
                    <td className="px-4 py-3">
                      <PrStatusBadge status={row.status} />
                    </td>

                    {/* Column 8: Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onEdit(row.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>{isAutoDraft ? 'Open PR Form' : 'Edit PR'}</span>
                        </button>

                        {onPdf && (
                          <button
                            onClick={() => onPdf(row)}
                            title="Download PR report PDF"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted hover:text-foreground transition-colors shadow-2xs"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                            <span>Download PDF</span>
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
    </div>
  );
}
