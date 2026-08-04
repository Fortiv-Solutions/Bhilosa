// Central registry for work orders issued to vendors/contractors across project sites.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarDays, ClipboardList, IndianRupee, Plus, AlertTriangle } from 'lucide-react';
import { getWorkOrders } from '@/lib/work-orders';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { CreateWorkOrderModal } from '@/components/work-orders/create-work-order-modal';

const WO_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  issued: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
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

  const refresh = useCallback(() => {
    if (!isLiveSupabase()) return;
    setLoading(true);
    getWorkOrders()
      .then((data) => setWorkOrders(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const orders = workOrders.map((wo) => ({
    id: wo.id,
    workOrderNumber: wo.work_order_number,
    scopeOfWork: wo.scope_of_work,
    projectName: wo.projects?.name || 'Unknown Project',
    projectId: wo.project_id,
    agencyName: wo.site_agencies?.agency_name || wo.vendor?.display_name || wo.vendor?.legal_name || wo.contractor?.display_name || 'Unassigned',
    woType: (wo.wo_type || 'fixed_scope') as string,
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
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
        >
          <Plus className="h-4 w-4" /> New Work Order
        </button>
      </header>

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
                <th className="pb-3">Type</th>
                <th className="pb-3">WO Value</th>
                <th className="pb-3">Billed to Date</th>
                <th className="pb-3">Remaining</th>
                <th className="pb-3">Issue Date</th>
                <th className="pb-3">Status</th>
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
                  <td className="py-3 text-gray-500">{wo.woType === 'rate_based' ? 'Rate-based' : 'Fixed-scope'}</td>
                  <td className="py-3 font-bold">{formatAmount(wo.totalAmount)}</td>
                  <td className="py-3 text-gray-500">{formatAmount(wo.billedToDate)}</td>
                  <td className="py-3 font-bold">{formatAmount(wo.remainingBalance)}</td>
                  <td className="py-3 text-gray-500">{wo.startDate || '-'}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${WO_STATUS_STYLES[wo.woStatus] || WO_STATUS_STYLES.draft}`}>{wo.woStatus}</span>
                      {wo.hasScopeVariance && (
                        <span title="Scope variance detected">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
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
