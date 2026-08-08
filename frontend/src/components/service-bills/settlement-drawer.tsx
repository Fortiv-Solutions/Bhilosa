'use client';

// ============================================================================
// SETTLEMENT DRAWER — payments and retention release for one certified bill
//
// Closes two gaps that survived Phases 3-4: recordServiceBillPayment() and the
// retention_releases document both existed in the database and were reachable
// from no component, so retention could be withheld but never released.
//
// Every cap is enforced server-side (certified-only, net payable, authorised
// release, over-release), so this drawer surfaces the guard messages verbatim
// rather than re-implementing the arithmetic.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, BadgeIndianRupee, Undo2 } from 'lucide-react';
import {
  getRetentionOutstanding,
  listRetentionReleases,
  listServiceBillPayments,
  recordServiceBillPayment,
  releaseRetention,
  type RetentionReleaseRow,
  type ServiceBillPaymentRow,
} from '@/lib/work-order-treasury';
import type { ServiceBillRow } from '@/lib/service-bills';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { formatIndianCurrency } from '@/utils/format-currency';

export function SettlementDrawer({
  bill,
  isOpen,
  onClose,
  onChanged,
  permissions,
}: {
  bill: ServiceBillRow | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
  permissions: WorkOrderPermissions;
}) {
  const [payments, setPayments] = useState<ServiceBillPaymentRow[]>([]);
  const [retentions, setRetentions] = useState<RetentionReleaseRow[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'payment' | 'retention'>('payment');

  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState('');
  const [mode, setMode] = useState('');
  const [retentionAmount, setRetentionAmount] = useState(0);
  const [retentionNumber, setRetentionNumber] = useState('');
  const [retentionReason, setRetentionReason] = useState('');

  const billId = bill?.id ?? null;

  const load = useCallback(async () => {
    if (!billId) return;
    try {
      const [pay, ret, out] = await Promise.all([
        listServiceBillPayments(billId),
        listRetentionReleases(billId),
        getRetentionOutstanding(billId),
      ]);
      setPayments(pay);
      setRetentions(ret);
      setOutstanding(out);
      setRetentionAmount(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settlement history.');
    }
  }, [billId]);

  useEffect(() => {
    if (!isOpen || !billId) return;
    setError(null);
    setTab('payment');
    setReference('');
    setMode('');
    setRetentionNumber('');
    setRetentionReason('');
    void load();
  }, [isOpen, billId, load]);

  // Default the payment to whatever is still owed.
  const netPayable = Number(bill?.net_payable_amount || bill?.total_amount || 0);
  const paidSoFar = payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const stillOwed = Math.max(netPayable - paidSoFar, 0);

  useEffect(() => {
    setAmount(stillOwed);
  }, [stillOwed]);

  if (!isOpen || !bill) return null;

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!billId) return;
    setBusy(true);
    setError(null);
    const result = await recordServiceBillPayment({
      billId,
      amount,
      paymentReference: reference,
      paymentMode: mode || undefined,
    });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      setReference('');
      await load();
      onChanged();
    }
  }

  async function submitRetention(event: React.FormEvent) {
    event.preventDefault();
    if (!billId) return;
    setBusy(true);
    setError(null);
    const result = await releaseRetention({
      billId,
      amount: retentionAmount,
      releaseNumber: retentionNumber,
      reason: retentionReason || undefined,
    });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      setRetentionNumber('');
      setRetentionReason('');
      await load();
      onChanged();
    }
  }

  const field = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-bold">Settlement — {bill.bill_number}</h2>
            <p className="text-xs text-muted-foreground">
              Net payable {formatIndianCurrency(netPayable)} · paid{' '}
              {formatIndianCurrency(paidSoFar)} · owed{' '}
              <strong className="text-primary">{formatIndianCurrency(stillOwed)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-4 pt-3">
          {(['payment', 'retention'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-t-lg px-3 py-2 text-xs font-bold capitalize ${
                tab === key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {key === 'payment' ? 'Payments' : 'Retention'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {tab === 'payment' ? (
            <>
              {permissions.canRecordPayment && stillOwed > 0 && (
                <form onSubmit={submitPayment} className="rounded-lg border border-border bg-background p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold">
                    <BadgeIndianRupee className="h-3.5 w-3.5 text-primary" /> Record Payment
                  </h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(Number(event.target.value))}
                      className={`${field} text-right font-mono`}
                    />
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="UTR / cheque no."
                      className={field}
                    />
                    <input
                      value={mode}
                      onChange={(event) => setMode(event.target.value)}
                      placeholder="NEFT / RTGS"
                      className={field}
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      Pay
                    </button>
                  </div>
                </form>
              )}

              {stillOwed === 0 && payments.length > 0 && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                  This bill is fully paid.
                </p>
              )}

              <HistoryTable
                empty="No payments recorded yet."
                head={['Reference', 'Date', 'Mode', 'Amount']}
                rows={payments.map((payment) => [
                  payment.payment_reference,
                  payment.payment_date,
                  payment.payment_mode || '-',
                  formatIndianCurrency(Number(payment.amount || 0)),
                ])}
              />
            </>
          ) : (
            <>
              <p className="mb-3 rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
                Retention outstanding{' '}
                <strong className="text-foreground">{formatIndianCurrency(outstanding)}</strong>.
                Released at the end of the defects liability period, per the Work Order terms.
              </p>

              {permissions.canReleaseRetention && outstanding > 0 && (
                <form onSubmit={submitRetention} className="rounded-lg border border-border bg-background p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold">
                    <Undo2 className="h-3.5 w-3.5 text-primary" /> Release Retention
                  </h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="number"
                      min={0}
                      max={outstanding}
                      step="0.01"
                      value={retentionAmount}
                      onChange={(event) => setRetentionAmount(Number(event.target.value))}
                      className={`${field} text-right font-mono`}
                    />
                    <input
                      value={retentionNumber}
                      onChange={(event) => setRetentionNumber(event.target.value)}
                      placeholder="Release no. (RR-001)"
                      className={field}
                    />
                    <input
                      value={retentionReason}
                      onChange={(event) => setRetentionReason(event.target.value)}
                      placeholder="Reason (optional)"
                      className={field}
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      Release
                    </button>
                  </div>
                </form>
              )}

              <HistoryTable
                empty="No retention released yet."
                head={['Release', 'Date', 'Status', 'Amount']}
                rows={retentions.map((release) => [
                  release.release_number,
                  release.release_date,
                  release.status,
                  formatIndianCurrency(Number(release.amount || 0)),
                ])}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
          <tr>
            {head.map((cell, index) => (
              <th key={cell} className={`pb-2 ${index === head.length - 1 ? 'text-right' : ''}`}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/50">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`py-2 ${
                    index === row.length - 1 ? 'text-right font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="py-6 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
