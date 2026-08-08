'use client';

// ============================================================================
// PROGRESS & BILLING — the schedule of values
//
// The cockpit, deliberately NOT a data-entry form. The 149 source Payment
// Certificates already have a hand-typed progress field ("% of Work Completed")
// and it reads 1 on all 603 populated lines. A free-typed percentage
// degenerates into a formality, so nothing here accepts one:
//
//   * measurable scope   — progress comes from VERIFIED measurement sheets
//   * milestones         — claimed here, then verified by a DIFFERENT person
//
// The column set is the AIA G703 one (scheduled / done / certified / billed /
// balance), because that is what the certificates are a degenerate form of —
// theirs has no previous-vs-this-period columns at all, which is why cumulative
// figures ended up in unlabelled stray cells.
//
// blocking_reason is the load-bearing column: a gate people cannot see the
// reasoning of is a gate they work around.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListChecks,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Ruler,
  Sparkles,
} from 'lucide-react';
import {
  getBillingPosition,
  generateBillableItems,
  claimBillableItem,
  verifyBillableItem,
  rollUpPosition,
  ELIGIBILITY_LABEL,
  STATUS_LABEL,
  type BillingPosition,
} from '@/lib/wo-billable-items';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { formatIndianCurrency } from '@/utils/format-currency';

type Props = {
  workOrderId: string;
  permissions: WorkOrderPermissions;
  /** Draft contracts may still (re)generate their schedule of values. */
  isDraft: boolean;
  /** Bumped by the parent when a bill or measurement changes. */
  refreshToken?: number;
  /** Opens the measurement sheet modal, pre-aimed at one unit of claim. */
  onRecordMeasurement?: (row: BillingPosition) => void;
};

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  claimed: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground uppercase font-bold text-[10px]">{label}</dt>
      <dd className={`mt-1 font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

export function BillingProgressPanel({
  workOrderId,
  permissions,
  isDraft,
  refreshToken,
  onRecordMeasurement,
}: Props) {
  const [rows, setRows] = useState<BillingPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Reason capture, matching StatusActionBar — window.prompt cannot be
      validated, styled, or cancelled cleanly. */
  const [rejecting, setRejecting] = useState<BillingPosition | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getBillingPosition(workOrderId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const totals = useMemo(() => rollUpPosition(rows), [rows]);

  async function run(id: string, fn: () => Promise<{ error: Error | null }>) {
    setBusyId(id);
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    await load();
    setBusyId(null);
  }

  const handleGenerate = () =>
    run('generate', () => generateBillableItems(workOrderId));

  const handleClaim = (row: BillingPosition) =>
    run(row.billable_item_id, () =>
      claimBillableItem(row.billable_item_id, 100, 'Completion claimed from the Work Order'),
    );

  const handleVerify = (row: BillingPosition) =>
    run(row.billable_item_id, () => verifyBillableItem(row.billable_item_id, true));

  async function submitRejection() {
    if (!rejecting || !rejectReason.trim()) return;
    const id = rejecting.billable_item_id;
    setRejecting(null);
    const reason = rejectReason.trim();
    setRejectReason('');
    await run(id, () => verifyBillableItem(id, false, reason));
  }

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" /> Progress &amp; Billing
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            What is done, what is certified, and what may be billed today.
          </p>
        </div>

        {isDraft && permissions.canCreateWorkOrder && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busyId === 'generate'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            {busyId === 'generate' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {rows.length ? 'Regenerate' : 'Generate'} schedule of values
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading position…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No schedule of values yet. It is generated automatically when the Work Order is
          issued, and bills cannot draw on the contract until it exists.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5 text-xs">
            <Metric label="Scheduled" value={formatIndianCurrency(totals.scheduled)} />
            <Metric label="Billed to date" value={formatIndianCurrency(totals.billed)} />
            <Metric
              label="Claimable now"
              value={formatIndianCurrency(totals.claimable)}
              tone={totals.claimable > 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}
            />
            <Metric label="Balance" value={formatIndianCurrency(totals.balance)} />
            <Metric label="Complete" value={`${totals.percentComplete.toFixed(1)}%`} />
          </dl>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(Math.max(totals.percentComplete, 0), 100)}%` }}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground uppercase text-[10px] font-bold">
                <tr className="border-b border-border">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 pr-2 text-right">Scheduled</th>
                  <th className="py-2 pr-2 text-right">Done</th>
                  <th className="py-2 pr-2 text-right">Certified</th>
                  <th className="py-2 pr-2 text-right">Billed</th>
                  <th className="py-2 pr-2 text-right">Claimable</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const billable = !row.blocking_reason && row.claimable_quantity > 0;
                  const busy = busyId === row.billable_item_id;
                  return (
                    <tr
                      key={row.billable_item_id}
                      className={`border-b border-border/60 align-top ${
                        billable ? '' : 'text-muted-foreground'
                      }`}
                    >
                      <td className="py-2 pr-2 tabular-nums">{row.sequence_no}</td>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-foreground">{row.item_label}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {ELIGIBILITY_LABEL[row.eligibility_rule]}
                          {row.contracted_quantity != null && (
                            <>
                              {' · '}
                              {row.contracted_quantity} {row.unit ?? ''} @{' '}
                              {formatIndianCurrency(row.rate ?? 0)}
                            </>
                          )}
                        </div>
                        {row.blocking_reason && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                            <Lock className="h-3 w-3" /> {row.blocking_reason}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.scheduled_value == null
                          ? '—'
                          : formatIndianCurrency(row.scheduled_value)}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.percent_complete == null
                          ? `${row.measured_quantity} ${row.unit ?? ''}`
                          : `${row.percent_complete}%`}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.certified_quantity || '—'}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.billed_value ? formatIndianCurrency(row.billed_value) : '—'}
                      </td>
                      <td
                        className={`py-2 pr-2 text-right tabular-nums ${
                          billable ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''
                        }`}
                      >
                        {billable
                          ? formatIndianCurrency(row.claimable_quantity * (row.rate ?? 0))
                          : '—'}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            STATUS_STYLE[row.status] ?? STATUS_STYLE.not_started
                          }`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          {row.basis !== 'milestone_event' &&
                            onRecordMeasurement &&
                            permissions.canRecordExecution && (
                              <button
                                type="button"
                                onClick={() => onRecordMeasurement(row)}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                              >
                                <Ruler className="h-3 w-3" /> Measure
                              </button>
                            )}

                          {row.basis === 'milestone_event' &&
                            row.status !== 'verified' &&
                            row.status !== 'claimed' &&
                            permissions.canRecordExecution && (
                              <button
                                type="button"
                                onClick={() => handleClaim(row)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-50"
                              >
                                {busy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                Claim complete
                              </button>
                            )}

                          {row.basis === 'milestone_event' &&
                            row.status === 'claimed' &&
                            permissions.canApproveWorkOrder && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleVerify(row)}
                                  disabled={busy}
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  Verify
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectReason('');
                                    setRejecting(row);
                                  }}
                                  disabled={busy}
                                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground">
            Progress on measured scope comes from verified measurement sheets, never typed here.
            A milestone claim must be verified by someone other than the person who made it.
          </p>
        </>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <h3 className="text-sm font-bold">Reject “{rejecting.item_label}”</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This reason is recorded permanently in the progress trail and cannot be edited
                  later.
                </p>
              </div>
            </div>

            <textarea
              autoFocus
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Reason (required)"
              className="mt-3 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejecting(null);
                  setRejectReason('');
                }}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRejection}
                disabled={!rejectReason.trim()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject claim
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
