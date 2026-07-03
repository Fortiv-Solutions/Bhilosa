// Live vendor bill desk for PO/GRN/budget verification and approval.
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  RefreshCcw,
  ReceiptIndianRupee,
  ShieldCheck,
  Plus
} from 'lucide-react';
import { listBillingDashboard, type BillingDashboardData } from '@/lib/billing';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import type { VendorBillRow } from '@/lib/procurement';
import { CreateBillModal } from '@/components/billing/create-bill-modal';
import { BillDetailModal } from '@/components/billing/bill-detail-modal';

const emptyBillingData: BillingDashboardData = {
  vendorBills: [],
  budgetLedger: [],
};

function statusLabel(value?: string | null) {
  return (value || 'pending').replaceAll('_', ' ');
}

function statusTone(status?: string | null) {
  if (status === 'approved' || status === 'paid' || status === 'verified') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20';
  if (status === 'blocked' || status === 'rejected') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20';
}

export default function BillingPage() {
  const { projects, activeProjectId } = useAppStore();
  const [data, setData] = useState<BillingDashboardData>(emptyBillingData);
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || projects[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<VendorBillRow | null>(null);

  const liveMode = isLiveSupabase();

  const refresh = useCallback(async () => {
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      setData(await listBillingDashboard(selectedProjectId || undefined));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load billing data.');
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

  const liveBills = data.vendorBills;
  const visibleBills = liveBills;
  const totalBilled = liveBills.reduce((total, bill) => total + Number(bill.total_amount || 0), 0);
  const approvedAmount = liveBills.filter((bill) => bill.status === 'approved' || bill.status === 'paid').reduce((total, bill) => total + Number(bill.total_amount || 0), 0);
  const blockedCount = liveBills.filter((bill) => bill.status === 'blocked' || bill.duplicate_detected || bill.status === 'rejected').length;

  return (
    <div className="space-y-5 relative">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">Finance Control</span>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Billing & Accounts</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Verify vendor bills against PO, GRN, duplicate document checks, and budget before management approval.
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
            <Plus className="h-4 w-4" /> Create Bill
          </button>
        </div>
      </header>

      {!liveMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Supabase is not configured. Billing requires live PO, GRN, budget, duplicate-check, and vendor bill records.
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Metric label="Total Bills" value={visibleBills.length.toString()} icon={ReceiptIndianRupee} />
        <Metric label="Submitted Value" value={formatIndianCurrency(totalBilled)} icon={CircleDollarSign} />
        <Metric label="Approved Value" value={formatIndianCurrency(approvedAmount)} icon={FileCheck2} />
        <Metric label="Blocked / Rejected" value={blockedCount.toString()} icon={AlertTriangle} tone={blockedCount ? 'danger' : 'success'} />
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Vendor Bill Desk</h2>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
              <tr>
                <th className="pb-3">Bill</th>
                <th className="pb-3">Vendor / Type</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">PO</th>
                <th className="pb-3">GRN</th>
                <th className="pb-3">Duplicate</th>
                <th className="pb-3">Budget</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {liveBills.map((bill) => {
                    const match = bill.three_way_matches?.[0];
                    return (
                      <tr key={bill.id} className="border-b border-gray-50 dark:border-gray-850 hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-bold">{bill.bill_number}</td>
                        <td className="py-3 text-gray-500">{bill.vendors?.display_name || bill.vendors?.legal_name || 'Vendor'}</td>
                        <td className="py-3 font-bold">{formatIndianCurrency(Number(bill.total_amount || 0))}</td>
                        <td className="py-3">{bill.purchase_order_id ? <CheckPill label="Linked" /> : <WarnPill label="Missing" />}</td>
                        <td className="py-3">{bill.grn_id ? <CheckPill label="Linked" /> : <WarnPill label="Missing" />}</td>
                        <td className="py-3">{bill.duplicate_detected ? <WarnPill label="Duplicate" /> : <CheckPill label="Clear" />}</td>
                        <td className="py-3">{bill.budget_allocation_id ? <CheckPill label="Allocated" /> : <span className="text-gray-400">Open</span>}</td>
                        <td className="py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(bill.status)}`}>
                            {statusLabel(bill.status)}
                          </span>
                          {match && <div className="mt-1 text-[10px] text-gray-400 font-medium">Match: {statusLabel(match.match_status)}</div>}
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBill(bill)}
                              className="rounded-md border border-border px-3 py-1.5 font-bold hover:bg-muted bg-card shadow-sm transition-colors text-xs"
                            >
                              View / Process
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {visibleBills.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
            No vendor bills found. Post a GRN from Procurement, then create a vendor bill from the GRN tab.
          </div>
        )}
      </section>

      <CreateBillModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onSuccess={() => { setIsCreateModalOpen(false); refresh(); }} 
      />

      {selectedBill && (
        <BillDetailModal 
          bill={selectedBill} 
          onClose={() => setSelectedBill(null)} 
          onRefresh={refresh} 
        />
      )}
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

function CheckPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  );
}

function WarnPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20">
      <Clock3 className="h-3 w-3" />
      {label}
    </span>
  );
}
