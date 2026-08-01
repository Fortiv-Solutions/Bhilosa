// Central registry for work orders issued to vendors/contractors across project sites.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarDays, ClipboardList, IndianRupee } from 'lucide-react';
import { getWorkOrders } from '@/lib/work-orders';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

function formatAmount(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLiveSupabase()) return;
    setLoading(true);
    getWorkOrders()
      .then((data) => setWorkOrders(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const orders = workOrders.map((wo) => ({
    id: wo.id,
    workOrderNumber: wo.work_order_number,
    scopeOfWork: wo.scope_of_work,
    projectName: wo.projects?.name || 'Unknown Project',
    projectId: wo.project_id,
    siteName: wo.project_sites?.name || '-',
    vendorName: wo.vendor?.name || wo.contractor?.name || 'Unassigned',
    totalAmount: Number(wo.total_amount || 0),
    status: (wo.status || 'draft') as string,
    startDate: wo.start_date,
    endDate: wo.end_date,
  }));

  const totalValue = orders.reduce((sum, wo) => sum + wo.totalAmount, 0);
  const openCount = orders.filter((wo) => !['approved', 'closed', 'rejected'].includes(wo.status)).length;
  const approvedCount = orders.filter((wo) => wo.status === 'approved').length;

  return (
    <div className="space-y-5">
      <header>
        <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">Vendor &amp; Contractor Ops</span>
        <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Work Orders</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Every work order issued to a vendor or contractor across all project sites, with scope, value, and approval status.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Work Orders', value: orders.length, icon: ClipboardList },
          { label: 'Open Work Orders', value: openCount, icon: Briefcase },
          { label: 'Approved', value: approvedCount, icon: CalendarDays },
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
                <th className="pb-3">Vendor / Contractor</th>
                <th className="pb-3">Scope of Work</th>
                <th className="pb-3">Value</th>
                <th className="pb-3">Start Date</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((wo) => (
                <tr key={wo.id} className="border-b border-gray-50 dark:border-gray-850">
                  <td className="py-3 font-bold">{wo.workOrderNumber}</td>
                  <td className="py-3">
                    <Link href={`/projects/${wo.projectId}`} className="font-semibold text-primary">{wo.projectName}</Link>
                  </td>
                  <td className="py-3">{wo.vendorName}</td>
                  <td className="py-3 max-w-xs truncate" title={wo.scopeOfWork}>{wo.scopeOfWork}</td>
                  <td className="py-3 font-bold">{formatAmount(wo.totalAmount)}</td>
                  <td className="py-3 text-gray-500">{wo.startDate || '-'}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${STATUS_STYLES[wo.status] || STATUS_STYLES.draft}`}>{wo.status}</span>
                  </td>
                </tr>
              ))}

              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    No work orders issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
