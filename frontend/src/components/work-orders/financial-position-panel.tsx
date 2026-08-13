'use client';

// ============================================================================
// WORK ORDER FINANCIAL POSITION + TREASURY RELEASES
//
// Four indicators, down from nine. The panel used to show five cards and then a
// second row of four balances, several of which were arithmetic the reader could
// do from the cards above — Remaining Headroom is Contract minus Certified, and
// Pending Liability restated Approved Net against Cash Paid. Thirteen money
// figures on one screen (this panel's nine plus Budget Position's four) is not a
// summary; it is a spreadsheet, and nothing in it stands out as the number to
// act on.
//
// What survives is what someone decides something with:
//
//   Contract Value    the envelope
//   Certified Gross   recognised project COST, with % of contract consumed
//   Outstanding       what the contractor is owed right now (net − paid)
//   Retention Held    money withheld that will have to be released
//
// Certified is cost; authorised and paid are cash. A release caps payment and
// never certification — if Rs 25 L is certified and Rs 10 L released, the
// budget still shows Rs 25 L spent. That separation is the whole point of the
// panel, so it is stated on screen rather than left to be inferred.
//
// Authorisation figures appear only once a release exists, since on a contract
// with no releases they are two zeroes that explain nothing.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, Loader2, AlertTriangle, BadgeIndianRupee } from 'lucide-react';
import {
  createWorkOrderRelease,
  getWorkOrderFinancialPosition,
  listWorkOrderReleases,
  setWorkOrderReleaseStatus,
  type WorkOrderFinancialPosition,
  type WorkOrderReleaseRow,
} from '@/lib/work-order-treasury';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { StatusActionBar, type StatusAction } from '@/components/work-orders/status-action-bar';
import { formatIndianCurrency } from '@/utils/format-currency';

export function FinancialPositionPanel({
  workOrderId,
  projectId,
  permissions,
  refreshToken = 0,
}: {
  workOrderId: string;
  projectId: string;
  permissions: WorkOrderPermissions;
  /** Bump to re-read after a bill or payment changes elsewhere on the page. */
  refreshToken?: number;
}) {
  const [position, setPosition] = useState<WorkOrderFinancialPosition | null>(null);
  const [releases, setReleases] = useState<WorkOrderReleaseRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [releaseNumber, setReleaseNumber] = useState('');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [pos, rel] = await Promise.all([
        getWorkOrderFinancialPosition(workOrderId),
        listWorkOrderReleases(workOrderId),
      ]);
      setPosition(pos);
      setReleases(rel);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the financial position.');
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const metrics = useMemo(() => {
    if (!position) return [];
    return [
      {
        label: 'Contract Value',
        value: position.contractValue,
        tone: 'plain' as const,
        note: position.contractValue
          ? `${formatIndianCurrency(position.remainingHeadroom)} left to certify`
          : undefined,
      },
      {
        label: 'Certified Gross',
        value: position.certifiedGross,
        tone: 'cost' as const,
        note: position.contractValue
          ? `${((position.certifiedGross / position.contractValue) * 100).toFixed(1)}% of contract`
          : undefined,
      },
      ...(position.claimedUncertified > 0
        ? [
            {
              label: 'Pending Certification',
              value: position.claimedUncertified,
              tone: 'cost' as const,
              note: 'Submitted / Verified bills in pipeline',
            },
          ]
        : []),
      {
        // Net payable minus cash paid.
        label: 'Outstanding to Pay',
        value: position.pendingLiability,
        tone: 'cash' as const,
        note: position.cashPaid ? `${formatIndianCurrency(position.cashPaid)} paid so far` : undefined,
      },
      {
        label: 'Retention Held',
        value: position.retentionHeld,
        tone: 'plain' as const,
        note: position.retentionHeld > 0 ? 'Releasable after the defect period' : undefined,
      },
    ];
  }, [position]);

  /** Authorisation is only meaningful once someone has authorised something. */
  const showAuthorisation = releases.length > 0 || (position?.authorisedRelease ?? 0) > 0;

  async function submitRelease(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!releaseNumber.trim()) return setError('A release number is required.');
    if (!(amount > 0)) return setError('The release amount must be greater than zero.');

    setBusy(true);
    const result = await createWorkOrderRelease({
      projectId,
      workOrderId,
      releaseNumber,
      amount,
      reason: reason || undefined,
      // A PM/management user may authorise directly; anyone else raises a draft
      // for approval. The database enforces the same split.
      approveNow: permissions.canApproveRelease,
    });
    setBusy(false);

    if (result.error) setError(result.error.message);
    else {
      setShowForm(false);
      setReleaseNumber('');
      setAmount(0);
      setReason('');
      void load();
    }
  }

  async function runReleaseAction(
    releaseId: string,
    status: 'approved' | 'cancelled',
    actionReason?: string,
  ) {
    setBusy(true);
    setError(null);
    const result = await setWorkOrderReleaseStatus(releaseId, status, actionReason);
    setBusy(false);
    if (result.error) setError(result.error.message);
    else void load();
  }

  if (!position) return null;

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
          <Wallet className="h-4 w-4 text-primary" /> Financial Position
        </h2>
        {permissions.canProposeRelease && (
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Authorise Release
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className={`rounded-2xl border p-3 ${
              metric.tone === 'cost'
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                : metric.tone === 'cash'
                  ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/10'
                  : 'border-border bg-background'
            }`}
          >
            <p className="text-base font-semibold">{formatIndianCurrency(metric.value)}</p>
            <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">
              {metric.label}
            </p>
            {metric.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{metric.note}</p>}
          </article>
        ))}
      </div>

      {/* Only shown once a release exists — otherwise these are two zeroes that
          explain nothing on a contract that does not use the treasury flow. */}
      {showAuthorisation && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <Balance
            label="Authorised Release"
            value={position.authorisedRelease}
            hint="The treasury cash decision. Caps payment, never certification."
          />
          <Balance
            label="Unused Authorisation"
            value={position.unusedAuthorisation}
            hint="Authorised − paid. Cash cleared but not yet disbursed."
          />
        </div>
      )}

      <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
        <strong>Certified Gross is project cost</strong> and is recognised in the budget the moment a
        bill is certified. <strong>Authorised Release caps payment only</strong> — restricting cash
        never reduces the cost of work already certified.
      </p>

      {showForm && (
        <form
          onSubmit={submitRelease}
          className="mt-4 rounded-lg border border-border bg-background p-3"
        >
          <h3 className="flex items-center gap-1.5 text-xs font-bold">
            <BadgeIndianRupee className="h-3.5 w-3.5 text-primary" /> New Payment Release
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={releaseNumber}
              onChange={(event) => setReleaseNumber(event.target.value)}
              placeholder="Release no. (RL-001)"
              className="h-9 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              placeholder="Amount"
              className="h-9 rounded-lg border border-border bg-card px-2 text-right text-sm font-mono outline-none focus:border-primary"
            />
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (optional)"
              className="h-9 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {permissions.canApproveRelease
                ? 'Authorised immediately on save.'
                : 'Saved as a draft for management approval.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      {releases.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
              <tr>
                <th className="pb-2">Release</th>
                <th className="pb-2">Date</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2">Reason</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => {
                const actions: StatusAction<'approved' | 'cancelled'>[] = [];
                if (permissions.canApproveRelease && release.status === 'draft') {
                  actions.push({
                    status: 'approved',
                    label: 'Authorise',
                    needsReason: false,
                    tone: 'primary',
                  });
                }
                if (permissions.canApproveRelease && release.status !== 'cancelled') {
                  actions.push({
                    status: 'cancelled',
                    label: 'Cancel',
                    needsReason: true,
                    tone: 'danger',
                  });
                }

                return (
                  <tr key={release.id} className="border-b border-gray-50 dark:border-gray-850">
                    <td className="py-2 font-bold">{release.release_number}</td>
                    <td className="py-2 text-gray-500">{release.release_date}</td>
                    <td className="py-2 text-right font-semibold">
                      {formatIndianCurrency(Number(release.amount || 0))}
                    </td>
                    <td className="py-2 text-gray-500">
                      {release.status === 'cancelled'
                        ? release.cancellation_reason || release.reason || '-'
                        : release.reason || '-'}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          release.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : release.status === 'cancelled'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                        }`}
                      >
                        {release.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end">
                        <StatusActionBar<'approved' | 'cancelled'>
                          size="sm"
                          busy={busy}
                          actions={actions}
                          onAction={(status, actionReason) =>
                            runReleaseAction(release.id, status, actionReason)
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Balance({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5" title={hint}>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{formatIndianCurrency(value)}</p>
    </div>
  );
}
