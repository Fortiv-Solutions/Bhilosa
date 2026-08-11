// Central registry for work orders issued to vendors/contractors across project sites.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  IndianRupee,
  Plus,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { getWorkOrders, setWorkOrderStatus } from '@/lib/work-orders';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { CreateWorkOrderModal } from '@/components/work-orders/create-work-order-modal';
import { StatusActionBar, type StatusAction } from '@/components/work-orders/status-action-bar';
import { getWorkOrderPermissions } from '@/lib/work-order-permissions';
import { useAppStore } from '@/store/use-app-store';
import {
  WORK_ORDER_ACTION_LABELS,
  WORK_ORDER_STATUS_LABELS,
  canonicalWorkOrderStatus,
  nextWorkOrderStatuses,
  workOrderNeedsReason,
  type WorkOrderStatus,
} from '@/lib/erp/work-order/status';

const WO_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  issued: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
};

/** Only the move that advances the document is offered inline; the rest live on the detail page. */
const PRIMARY_NEXT: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
  draft: 'submitted',
  submitted: 'issued',
  issued: 'active',
  active: 'closed',
};

function formatAmount(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const activeRole = useAppStore((state) => state.activeRole);
  const permissions = useMemo(() => getWorkOrderPermissions(activeRole), [activeRole]);

  const refresh = useCallback(() => {
    if (!isLiveSupabase()) return;
    setLoading(true);
    getWorkOrders()
      .then((data) => setWorkOrders(data || []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load Work Orders.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Every transition goes through the database RPC, which re-validates the
   * move, the authority and the reason. A rejection here is a real business
   * rule, so its message is shown verbatim.
   */
  async function runTransition(id: string, next: WorkOrderStatus, reason?: string) {
    setActioningId(id);
    setError(null);
    const result = await setWorkOrderStatus(id, next, reason);
    setActioningId(null);
    if (result.error) setError(result.error.message);
    else refresh();
  }

  const orders = workOrders.map((wo) => ({
    id: wo.id,
    workOrderNumber: wo.work_order_number,
    scopeOfWork: wo.scope_of_work,
    projectName: wo.projects?.name || 'Unknown Project',
    projectId: wo.project_id,
    agencyName: wo.site_agencies?.agency_name || wo.vendor?.display_name || wo.vendor?.legal_name || wo.contractor?.display_name || 'Unassigned',
    woType: (wo.wo_type || 'fixed_scope') as string,
    gstPercentage: Number(wo.gst_percentage ?? 18),
    totalAmount: Number(wo.total_amount || 0),
    billedToDate: Number(wo.billed_to_date || 0),
    remainingBalance: Number(wo.remaining_balance ?? wo.total_amount ?? 0),
    hasScopeVariance: Boolean(wo.has_scope_variance),
    woStatus: (wo.wo_status || 'draft') as string,
    startDate: wo.issue_date || wo.start_date,
  }));

  const totalValue = orders.reduce((sum, wo) => sum + wo.totalAmount, 0);
  const openCount = orders.filter((wo) => !['closed', 'cancelled'].includes(wo.woStatus)).length;
  const activeCount = orders.filter((wo) => wo.woStatus === 'active').length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">Vendor &amp; Contractor Ops</span>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Work Orders</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Every work order issued to an agency across all project sites, with scope, value, billed-to-date, and remaining balance.</p>
        </div>
        {permissions.canCreateWorkOrder && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
          >
            <Plus className="h-4 w-4" /> New Work Order
          </button>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Work Orders', value: orders.length, icon: ClipboardList },
          { label: 'Open (Issued/Active)', value: openCount, icon: Briefcase },
          { label: 'Active', value: activeCount, icon: CalendarDays },
          { label: 'Total Order Value', value: formatAmount(totalValue), icon: IndianRupee },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-900">
              <Icon className="h-4 w-4 text-primary" />
              <p className="mt-3 text-xl font-semibold">{metric.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-gray-400">{metric.label}</p>
            </article>
          );
        })}
      </section>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold">All Work Orders</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
              <tr>
                <th className="pb-3">WO Number</th>
                <th className="pb-3">Project</th>
                <th className="pb-3">Agency</th>
                <th className="pb-3 min-w-[200px]">WO Type</th>
                <th className="pb-3 w-[100px]">GST %</th>
                <th className="pb-3">WO Value</th>
                <th className="pb-3">Billed to Date</th>
                <th className="pb-3">Remaining</th>
                <th className="pb-3">Issue Date</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((wo) => (
                <tr key={wo.id} className="border-b border-gray-50 dark:border-gray-850">
                  <td className="py-3 font-bold">
                    <Link href={`/work-orders/${wo.id}`} className="text-primary hover:underline">{wo.workOrderNumber}</Link>
                  </td>
                  <td className="py-3">
                    <Link href={`/projects/${wo.projectId}`} className="font-semibold text-primary">{wo.projectName}</Link>
                  </td>
                  <td className="py-3">{wo.agencyName}</td>
                  <td className="py-3">
                    <select
                      value={wo.woType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setWorkOrders((prev) =>
                          prev.map((item) => (item.id === wo.id ? { ...item, wo_type: newType } : item)),
                        );
                      }}
                      className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-semibold text-foreground cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="fixed_scope">Fixed-scope (defined quantity)</option>
                      <option value="rate_based">Rate-based (quantity at execution)</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <select
                      value={wo.gstPercentage}
                      onChange={(e) => {
                        const newGst = Number(e.target.value);
                        setWorkOrders((prev) =>
                          prev.map((item) => (item.id === wo.id ? { ...item, gst_percentage: newGst } : item)),
                        );
                      }}
                      className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-bold text-foreground cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </td>
                  <td className="py-3 font-bold">{formatAmount(wo.totalAmount)}</td>
                  <td className="py-3 text-gray-500">{formatAmount(wo.billedToDate)}</td>
                  <td className="py-3 font-bold">{formatAmount(wo.remainingBalance)}</td>
                  <td className="py-3 text-gray-500">{wo.startDate || '-'}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${WO_STATUS_STYLES[wo.woStatus] || WO_STATUS_STYLES.draft}`}
                      >
                        {WORK_ORDER_STATUS_LABELS[wo.woStatus as WorkOrderStatus] || wo.woStatus}
                      </span>
                      {wo.hasScopeVariance && (
                        <span title="Scope variance detected">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <StatusActionBar<WorkOrderStatus>
                        size="sm"
                        busy={actioningId === wo.id}
                        actions={buildRowActions(wo.woStatus, permissions.canApproveWorkOrder)}
                        onAction={(next, reason) => runTransition(wo.id, next, reason)}
                      />
                      <Link
                        href={`/work-orders/${wo.id}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-primary hover:bg-muted"
                      >
                        View <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    No work orders issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateWorkOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => { setIsCreateModalOpen(false); refresh(); }}
      />
    </div>
  );
}

/**
 * The single advancing move for a row, when it is legal from this state and the
 * role holds it. Reject / cancel are deliberately NOT offered from the list:
 * they are irreversible and belong on the detail page where the full contract
 * position is visible.
 */
function buildRowActions(
  woStatus: string,
  canApprove: boolean,
): StatusAction<WorkOrderStatus>[] {
  const current = canonicalWorkOrderStatus(woStatus);
  if (!current) return [];

  const next = PRIMARY_NEXT[current];
  if (!next) return [];
  if (!nextWorkOrderStatuses(current, canApprove).includes(next)) return [];

  return [
    {
      status: next,
      label: WORK_ORDER_ACTION_LABELS[next],
      needsReason: workOrderNeedsReason(next),
      tone: next === 'closed' ? 'neutral' : 'primary',
      hint:
        next === 'issued'
          ? 'Issues the contract and reserves its value against the budget head'
          : undefined,
    },
  ];
}
