// Live service bill desk for contractor/vendor bills raised against work orders.
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  RefreshCcw,
  ReceiptIndianRupee,
  Wrench,
  Plus,
} from 'lucide-react';
import { listServiceBills, approveServiceBill, rejectServiceBill, type ServiceBillRow } from '@/lib/service-bills';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import { CreateServiceBillModal } from '@/components/service-bills/create-service-bill-modal';

function statusLabel(value?: string | null) {
  return (value || 'pending').replaceAll('_', ' ');
}

function statusTone(status?: string | null) {
  if (status === 'approved' || status === 'paid' || status === 'verified') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20';
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20';
}

export default function ServiceBillsPage() {
  const { projects, activeProjectId } = useAppStore();
  const [bills, setBills] = useState<ServiceBillRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || projects[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const liveMode = isLiveSupabase();

  const refresh = useCallback(async () => {
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      setBills(await listServiceBills(selectedProjectId || undefined));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load service bills.');
    } finally {
      setLoading(false);
    }
  }, [liveMode, selectedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const totalBilled = bills.reduce((total, bill) => total + Number(bill.total_amount || 0), 0);
  const approvedAmount = bills
    .filter((bill) => bill.status === 'approved' || bill.status === 'paid')
    .reduce((total, bill) => total + Number(bill.total_amount || 0), 0);
  const rejectedCount = bills.filter((bill) => bill.status === 'rejected').length;

  async function handleApprove(billId: string) {
    setActioningId(billId);
    const result = await approveServiceBill(billId);
    setActioningId(null);
    if (result.error) {
      setError(result.error.message);
    } else {
      refresh();
    }
  }

  async function handleReject(billId: string) {
    const remarks = window.prompt('Reason for rejection:');
    if (!remarks) return;
    setActioningId(billId);
    await rejectServiceBill(billId, remarks);
    setActioningId(null);
    refresh();
  }

  return (
    <div className="space-y-5 relative">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">Vendor &amp; Contractor Ops</span>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Service Bills</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Record and track contractor/vendor bills raised against work orders, separate from material vendor bills.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={!liveMode || loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Record Service Bill
          </button>
        </div>
      </header>

      {!liveMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Supabase is not configured. Service Bills requires live work order and vendor records.
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Metric label="Total Bills" value={bills.length.toString()} icon={ReceiptIndianRupee} />
        <Metric label="Submitted Value" value={formatIndianCurrency(totalBilled)} icon={CircleDollarSign} />
        <Metric label="Approved Value" value={formatIndianCurrency(approvedAmount)} icon={FileCheck2} />
        <Metric label="Rejected" value={rejectedCount.toString()} icon={AlertTriangle} tone={rejectedCount ? 'danger' : 'success'} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Service Bill Desk</h2>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
              <tr>
                <th className="pb-3">Bill</th>
                <th className="pb-3">Vendor / Contractor</th>
                <th className="pb-3">Work Order</th>
                <th className="pb-3">WO Remaining</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Bill Date</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id} className="border-b border-gray-50 dark:border-gray-850 hover:bg-muted/30 transition-colors">
                  <td className="py-3 font-bold">{bill.bill_number}</td>
                  <td className="py-3 text-gray-500">{bill.vendors?.display_name || bill.vendors?.legal_name || 'Vendor'}</td>
                  <td className="py-3 text-gray-500">{bill.work_orders?.work_order_number || <PendingPill label="Unlinked" />}</td>
                  <td className="py-3 text-gray-500">{bill.work_orders ? formatIndianCurrency(Number(bill.work_orders.remaining_balance || 0)) : '-'}</td>
                  <td className="py-3 font-bold">{formatIndianCurrency(Number(bill.total_amount || 0))}</td>
                  <td className="py-3 text-gray-500">{bill.bill_date}</td>
                  <td className="py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(bill.status)}`}>
                      {statusLabel(bill.status)}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      {bill.status !== 'approved' && bill.status !== 'rejected' && bill.status !== 'paid' && (
                        <>
                          <button
                            type="button"
                            disabled={actioningId === bill.id}
                            onClick={() => handleApprove(bill.id)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 hover:bg-emerald-100 shadow-sm transition-colors text-xs disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={actioningId === bill.id}
                            onClick={() => handleReject(bill.id)}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 font-bold text-red-700 hover:bg-red-100 shadow-sm transition-colors text-xs disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bills.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
            No service bills recorded yet. Record a bill against a work order to track contractor payments.
          </div>
        )}
      </section>

      <CreateServiceBillModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => { setIsCreateModalOpen(false); refresh(); }}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof ReceiptIndianRupee;
  label: string;
  value: string;
  tone?: 'neutral' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/20'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'
        : 'bg-orange-50 text-primary dark:bg-orange-950/20';

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <Icon className={`h-4 w-4 ${toneClass}`} />
      <p className="mt-3 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase text-gray-400">{label}</p>
    </article>
  );
}

function PendingPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20">
      <Clock3 className="h-3 w-3" />
      {label}
    </span>
  );
}
