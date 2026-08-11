// Live service bill desk for contractor/vendor bills raised against work orders.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  RefreshCcw,
  ReceiptIndianRupee,
  Wrench,
  Plus,
  Eye,
} from 'lucide-react';
import {
  listServiceBills,
  setServiceBillStatus,
  type ServiceBillRow,
} from '@/lib/service-bills';
import { currentProfileId } from '@/lib/work-orders';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import { CreateServiceBillModal } from '@/components/service-bills/create-service-bill-modal';
import { PaymentCertificateView } from '@/components/service-bills/payment-certificate-view';
import { SettlementDrawer } from '@/components/service-bills/settlement-drawer';
import { ServiceBillDetailDrawer } from '@/components/service-bills/service-bill-detail-drawer';
import { isServiceBillCertified } from '@/lib/erp/work-order/status';
import { StatusActionBar, type StatusAction } from '@/components/work-orders/status-action-bar';
import {
  getWorkOrderPermissions,
  serviceBillCertificationBlockedReason,
} from '@/lib/work-order-permissions';
import {
  SERVICE_BILL_ACTION_LABELS,
  SERVICE_BILL_STATUS_LABELS,
  canonicalServiceBillStatus,
  nextServiceBillStatuses,
  serviceBillNeedsReason,
  type ServiceBillStatus,
} from '@/lib/erp/work-order/status';

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
  const activeRole = useAppStore((state) => state.activeRole);
  const [bills, setBills] = useState<ServiceBillRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || projects[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [certificateBillId, setCertificateBillId] = useState<string | null>(null);
  const [settlementBill, setSettlementBill] = useState<ServiceBillRow | null>(null);
  const [detailBillId, setDetailBillId] = useState<string | null>(null);

  const liveMode = isLiveSupabase();
  const permissions = useMemo(() => getWorkOrderPermissions(activeRole), [activeRole]);

  // Needed for the segregation-of-duties check: the certifier may be neither
  // the preparer nor the verifier, and the database enforces exactly that.
  useEffect(() => {
    let cancelled = false;
    currentProfileId()
      .then((value) => {
        if (!cancelled) setProfileId(value);
      })
      .catch(() => {
        if (!cancelled) setProfileId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  // "Certified" is the figure that has actually become project cost in the budget
  // ledger — approved and paid bills only.
  const certifiedAmount = bills
    .filter((bill) => bill.status === 'approved' || bill.status === 'paid')
    .reduce((total, bill) => total + Number(bill.total_amount || 0), 0);
  const retentionHeld = bills
    .filter((bill) => bill.status === 'approved' || bill.status === 'paid')
    .reduce((total, bill) => total + Number(bill.retention_amount || 0), 0);
  const rejectedCount = bills.filter((bill) => bill.status === 'rejected').length;

  /**
   * All transitions go through set_service_bill_status(). Server-side rules —
   * the QC gate, approval authority, segregation of duties, no-WO-no-bill —
   * surface here verbatim, because they are written to be read by the user.
   */
  async function runTransition(billId: string, next: ServiceBillStatus, reason?: string) {
    setActioningId(billId);
    setError(null);
    const result = await setServiceBillStatus(billId, next, reason);
    setActioningId(null);
    if (result.error) setError(result.error.message);
    else refresh();
  }

const PREFERRED_ACTION_ORDER: Record<string, number> = {
  approved: 1, // Certify
  rejected: 2, // Reject
  submitted: 3, // Submit
  verified: 4, // Verify
  draft: 5,
};

  /** Legal onward moves for one bill, filtered by role and segregation of duties. */
  function billActions(bill: ServiceBillRow): StatusAction<ServiceBillStatus>[] {
    const canApprove = permissions.canCertifyServiceBill || permissions.canRejectServiceBill;
    const sodReason = serviceBillCertificationBlockedReason(bill, profileId);

    const rawActions = nextServiceBillStatuses(bill.status, canApprove)
      .filter((next) => {
        if (next === 'verified') return permissions.canVerifyServiceBill;
        if (next === 'approved') return permissions.canCertifyServiceBill;
        if (next === 'rejected') return permissions.canRejectServiceBill;
        return true;
      })
      .map((next) => ({
        status: next,
        label: SERVICE_BILL_ACTION_LABELS[next],
        needsReason: serviceBillNeedsReason(next),
        tone: (next === 'rejected' ? 'danger' : next === 'approved' ? 'primary' : 'neutral') as 'danger' | 'primary' | 'neutral',
        hint:
          next === 'approved'
            ? "Certifies the bill: posts cost to the budget and releases the Work Order's commitment"
            : undefined,
        disabledReason: next === 'approved' ? sodReason : null,
      }));

    return rawActions.sort((a, b) => {
      const orderA = PREFERRED_ACTION_ORDER[a.status] ?? 99;
      const orderB = PREFERRED_ACTION_ORDER[b.status] ?? 99;
      return orderA - orderB;
    });
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
          {permissions.canCreateServiceBill && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Record Service Bill
            </button>
          )}
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
        <Metric label="Claimed Value" value={formatIndianCurrency(totalBilled)} icon={CircleDollarSign} />
        <Metric label="Certified (in budget)" value={formatIndianCurrency(certifiedAmount)} icon={FileCheck2} />
        <Metric label="Retention Held" value={formatIndianCurrency(retentionHeld)} icon={AlertTriangle} tone={rejectedCount ? 'danger' : 'neutral'} />
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
                <th className="pb-3">RA</th>
                <th className="pb-3">Vendor / Contractor</th>
                <th className="pb-3">Work Order</th>
                <th className="pb-3 text-right">Gross</th>
                <th className="pb-3 text-right">Retention</th>
                <th className="pb-3 text-right">Net Payable</th>
                <th className="pb-3">Bill Date</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id} className="border-b border-gray-50 dark:border-gray-850 hover:bg-muted/30 transition-colors">
                  <td 
                    className="py-3 font-bold text-primary hover:underline cursor-pointer"
                    onClick={() => setDetailBillId(bill.id)}
                    title="Click to view full details and attachments"
                  >
                    {bill.bill_number}
                    {bill.supplier_bill_no && (
                      <span className="ml-1 font-normal text-gray-400">/ {bill.supplier_bill_no}</span>
                    )}
                  </td>
                  <td className="py-3 text-gray-500">{bill.ra_sequence ? `RA-${bill.ra_sequence}` : '-'}</td>
                  <td className="py-3 text-gray-500">{bill.vendors?.display_name || bill.vendors?.legal_name || 'Vendor'}</td>
                  <td className="py-3 text-gray-500">{bill.work_orders?.work_order_number || <PendingPill label="Unlinked" />}</td>
                  <td className="py-3 text-right font-bold">{formatIndianCurrency(Number(bill.total_amount || 0))}</td>
                  <td className="py-3 text-right text-gray-500">
                    {Number(bill.retention_amount || 0) > 0 ? `−${formatIndianCurrency(Number(bill.retention_amount))}` : '-'}
                  </td>
                  <td className="py-3 text-right font-bold text-primary">
                    {formatIndianCurrency(Number(bill.net_payable_amount || bill.total_amount || 0))}
                  </td>
                  <td className="py-3 text-gray-500">{bill.bill_date}</td>
                  <td className="py-3">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(bill.status)}`}>
                      {SERVICE_BILL_STATUS_LABELS[
                        canonicalServiceBillStatus(bill.status) ?? 'draft'
                      ] || statusLabel(bill.status)}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailBillId(bill.id)}
                        title="View details, line items & attachments"
                        className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 flex items-center gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        Details
                      </button>
                      {/* The certificate IS this bill — one document, per the
                          29 workbooks in PC/. This prints it. */}
                      <button
                        type="button"
                        onClick={() => setCertificateBillId(bill.id)}
                        title="View / print the Payment Certificate"
                        className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Certificate
                      </button>
                      {/* Cash only moves against a certified bill, so the
                          drawer is offered only once cost is recognised. */}
                      {isServiceBillCertified(bill.status) && (
                        <button
                          type="button"
                          onClick={() => setSettlementBill(bill)}
                          title="Record a payment or release retention"
                          className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          Settle
                        </button>
                      )}
                      <StatusActionBar<ServiceBillStatus>
                        size="sm"
                        busy={actioningId === bill.id}
                        actions={billActions(bill)}
                        onAction={(next, reason) => runTransition(bill.id, next, reason)}
                      />
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

      <PaymentCertificateView
        billId={certificateBillId}
        isOpen={certificateBillId !== null}
        onClose={() => setCertificateBillId(null)}
      />

      <SettlementDrawer
        bill={settlementBill}
        isOpen={settlementBill !== null}
        onClose={() => setSettlementBill(null)}
        onChanged={refresh}
        permissions={permissions}
      />

      <ServiceBillDetailDrawer
        billId={detailBillId}
        isOpen={detailBillId !== null}
        onClose={() => setDetailBillId(null)}
        onChanged={refresh}
        onOpenCertificate={(id) => {
          setDetailBillId(null);
          setCertificateBillId(id);
        }}
        permissions={permissions}
        currentProfileId={profileId}
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
