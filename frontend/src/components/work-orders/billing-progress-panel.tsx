'use client';

// ============================================================================
// WORK PROGRESS & BILLING — activity by activity
//
// This section replaces the Measurement Book. Progress is recorded against the
// ACTIVITY, which is the grain people actually reason in ("inlet fitting is done
// in 45 of 100 flats"), rather than against a numbered sheet.
//
// Two figures per activity, deliberately kept apart:
//
//   Recorded   what site says is done          — moves nothing on its own
//   Verified   what a second person confirmed  — this is what unlocks billing
//
// That split is the control the Measurement Book used to provide by requiring a
// sheet to be verified. Without it, progress becomes the hand-typed "% of Work
// Completed" on the 149 source Payment Certificates, which reads 1 on all 603
// populated lines.
//
// The overall completion percentage is DERIVED from these rows (value-weighted
// where there are scheduled values), never entered, so the headline number can
// never disagree with the table underneath it.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListChecks,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Sparkles,
  PencilLine,
  ShieldCheck,
} from 'lucide-react';
import {
  getBillingPosition,
  getProgressSummary,
  generateBillableItems,
  claimBillableItem,
  verifyBillableItem,
  recordActivityProgress,
  verifyActivityProgress,
  ELIGIBILITY_LABEL,
  STATUS_LABEL,
  type BillingPosition,
  type WorkOrderProgressSummary,
} from '@/lib/wo-billable-items';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { formatIndianCurrency } from '@/utils/format-currency';
import { useAppStore } from '@/store/use-app-store';

type Props = {
  workOrderId: string;
  permissions: WorkOrderPermissions;
  /** Draft contracts may still (re)generate their schedule of values. */
  isDraft: boolean;
  /**
   * Issued or active. rpc_record_wo_progress refuses anything else, so without
   * this the Record button opens a form that can never save — which is exactly
   * how it failed in practice on a draft order.
   */
  isLive: boolean;
  /** Bumped by the parent when a bill or payment changes elsewhere on the page. */
  refreshToken?: number;
  /** Signed-in profile, for the segregation-of-duties affordance. */
  currentProfileId?: string | null;
  /** Called after anything that moves money or progress, so the page re-reads. */
  onChanged?: () => void;
};

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  claimed: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

function qty(value: number | null | undefined, unit?: string | null) {
  if (value == null) return '—';
  const formatted = Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3" title={hint}>
      <p className={`text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

export function BillingProgressPanel({
  workOrderId,
  permissions,
  isDraft,
  isLive,
  refreshToken,
  currentProfileId,
  onChanged,
}: Props) {
  const activeRole = useAppStore((state) => state.activeRole);
  const [rows, setRows] = useState<BillingPosition[]>([]);
  const [summary, setSummary] = useState<WorkOrderProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The activity whose progress is being edited, and the entered figures. */
  const [editing, setEditing] = useState<BillingPosition | null>(null);
  const [entryMode, setEntryMode] = useState<'quantity' | 'percent'>('quantity');
  const [entryValue, setEntryValue] = useState('');
  const [entryNote, setEntryNote] = useState('');
  /**
   * Save state kept ON the dialog. Closing first and reporting into the panel
   * put the reason a save failed above the fold, so it read as "nothing
   * happened" — the dialog now stays open and shows it.
   */
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  /** Reason capture for a rejection — a prompt() cannot be validated or styled. */
  const [rejecting, setRejecting] = useState<BillingPosition | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const position = await getBillingPosition(workOrderId);
      setRows(position);
      setSummary(await getProgressSummary(workOrderId, position));
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

  async function run(id: string, fn: () => Promise<{ error: Error | null }>) {
    setBusyId(id);
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    await load();
    setBusyId(null);
    if (!err) onChanged?.();
  }

  function openProgressEntry(row: BillingPosition) {
    setEditing(row);
    setEntryError(null);
    setEntrySaving(false);
    // Default to whichever unit the activity can actually express. Open
    // rate-based scope has no contracted quantity, so a percentage would have
    // nothing to be a percentage of.
    const canPercent = (row.contracted_quantity ?? 0) > 0;
    setEntryMode(canPercent ? 'percent' : 'quantity');
    setEntryValue(
      canPercent
        ? row.recorded_percent != null
          ? String(row.recorded_percent)
          : ''
        : row.progress_quantity != null
          ? String(row.progress_quantity)
          : '',
    );
    setEntryNote('');
  }

  async function submitProgress() {
    if (!editing) return;
    const numeric = Number(entryValue);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setEntryError('Enter a valid figure for the work completed.');
      return;
    }
    if (entryMode === 'percent' && numeric > 100) {
      setEntryError('A percentage cannot exceed 100.');
      return;
    }

    const target = editing;
    setEntrySaving(true);
    setEntryError(null);

    const { error: err } = await recordActivityProgress(target.billable_item_id, {
      quantity: entryMode === 'quantity' ? numeric : undefined,
      percent: entryMode === 'percent' ? numeric : undefined,
      note: entryNote || undefined,
    });

    setEntrySaving(false);

    // Only dismiss on success. A refusal is the one thing the user must read.
    if (err) {
      setEntryError(err.message);
      return;
    }

    setEditing(null);
    await load();
    onChanged?.();
  }

  async function submitRejection() {
    if (!rejecting || !rejectReason.trim()) return;
    const target = rejecting;
    const reason = rejectReason.trim();
    setRejecting(null);
    setRejectReason('');
    await run(target.billable_item_id, () =>
      target.basis === 'milestone_event'
        ? verifyBillableItem(target.billable_item_id, false, reason)
        : verifyActivityProgress(target.billable_item_id, false, reason),
    );
  }

  const pendingVerification = useMemo(
    () => rows.filter((r) => r.unverified_quantity > 1e-6 || r.status === 'claimed'),
    [rows],
  );

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> Work Progress &amp; Billing
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Progress activity by activity: what is done, what is pending, and what may be billed
            today.
          </p>
        </div>

        {isDraft && permissions.canCreateWorkOrder && (
          <button
            type="button"
            onClick={() => run('generate', () => generateBillableItems(workOrderId))}
            disabled={busyId === 'generate'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            {busyId === 'generate' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {rows.length ? 'Rebuild' : 'Build'} activity list
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="text-xs text-red-800 dark:text-red-300">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading progress…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No activities yet. The activity list is built automatically when the Work Order is
          issued, and bills cannot draw on the contract until it exists.
        </p>
      ) : (
        <>
          {/* Derived from the rows below — never entered. */}
          {summary && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <Metric
                  label="Work Done"
                  value={formatIndianCurrency(summary.workDoneValue)}
                  hint="Value of verified progress, whether billed yet or not."
                  tone="text-emerald-700 dark:text-emerald-400"
                />
                <Metric
                  label="Work Pending"
                  value={formatIndianCurrency(summary.pendingValue)}
                  hint="Scheduled value still to be executed."
                />
                <Metric
                  label="Work Done %"
                  value={`${summary.percentComplete.toFixed(1)}%`}
                  hint={
                    summary.isValueWeighted
                      ? 'Value-weighted across activities, derived from the rows below.'
                      : 'Average across measurable activities — this contract has no scheduled values.'
                  }
                />
                <Metric
                  label="Certified"
                  value={formatIndianCurrency(summary.certifiedValue)}
                  hint="On approved or paid bills. This is what became project cost."
                />
                <Metric
                  label="Billed"
                  value={formatIndianCurrency(summary.claimedValue)}
                  hint="Claimed on any live bill, including ones not yet certified."
                />
                <Metric
                  label="Claimable Now"
                  value={formatIndianCurrency(summary.claimableValue)}
                  hint="May go on a bill today."
                  tone={
                    summary.claimableValue > 0 ? 'text-emerald-700 dark:text-emerald-400' : undefined
                  }
                />
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(Math.max(summary.percentComplete, 0), 100)}%` }}
                />
              </div>

              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  <strong>{summary.completedCount}</strong> of {summary.activityCount} activities
                  complete
                </span>
                {summary.awaitingVerification > 0 && (
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {summary.awaitingVerification} awaiting verification
                  </span>
                )}
                {summary.billableCount > 0 && (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {summary.billableCount} billable now
                  </span>
                )}
              </p>
            </>
          )}

          {/* Progress cannot be recorded until the contract is live — the
              database refuses it. Said here so the missing buttons are
              explained rather than looking like a permissions problem. */}
          {!isLive && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[11px] text-amber-900 dark:text-amber-300">
                This Work Order is not live yet, so progress cannot be recorded against it. Issue
                the Work Order first — the activity list below is a preview of what will be billable.
              </p>
            </div>
          )}

          {pendingVerification.length > 0 && permissions.canApproveWorkOrder && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[11px] text-amber-900 dark:text-amber-300">
                {pendingVerification.length} activit
                {pendingVerification.length === 1 ? 'y has' : 'ies have'} progress recorded but not
                yet verified. Verified progress is what makes work billable.
              </p>
            </div>
          )}

          {/* Group rows by BOQ line description for clean visual hierarchy */}
          {(() => {
            const groups: Array<{ header: string; items: BillingPosition[] }> = [];
            rows.forEach((row) => {
              const parts = row.item_label.split(' — ');
              const header = parts.length > 1 ? parts[0] : 'General Scope';
              let group = groups.find((g) => g.header === header);
              if (!group) {
                group = { header, items: [] };
                groups.push(group);
              }
              group.items.push(row);
            });

            return (
              <div className="mt-4 space-y-4">
                {groups.map((group, gIdx) => (
                  <div key={gIdx} className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                    <div className="bg-muted/40 px-4 py-2.5 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {gIdx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-foreground truncate max-w-xl" title={group.header}>
                          BOQ Item: {group.header}
                        </h4>
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
                        {group.items.length} Payment Stages
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-xs border-collapse">
                        <thead className="bg-muted/20 text-[10px] font-bold uppercase text-muted-foreground border-b border-border">
                          <tr>
                            <th className="py-2 px-3 w-[40px]">#</th>
                            <th className="py-2 px-3 min-w-[240px]">Payment Stage / Activity</th>
                            <th className="py-2 px-3 text-right w-[100px]">Scheduled</th>
                            <th className="py-2 px-3 text-right w-[90px]">Work Done %</th>
                            <th className="py-2 px-3 text-right w-[100px]">Done</th>
                            <th className="py-2 px-3 text-right w-[100px]">Pending</th>
                            <th className="py-2 px-3 text-right w-[100px]">Certified</th>
                            <th className="py-2 px-3 text-right w-[100px]">Billed</th>
                            <th className="py-2 px-3 text-right w-[100px]">Claimable</th>
                            <th className="py-2 px-3 w-[90px]">Status</th>
                            <th className="py-2 px-3 text-right w-[140px]" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {group.items.map((row) => {
                            const labelParts = row.item_label.split(' — ');
                            const stageTitle = labelParts.length > 1 ? labelParts[1] : row.item_label;

                            // If valuation structure is stage_percentage, do not let full_wo_completion lock intermediate stages
                            const isStageWise = row.basis === 'stage_percent' || row.payment_stage_id != null;
                            const blockingMsg = isStageWise && row.blocking_reason?.includes('full completion')
                              ? null
                              : row.blocking_reason;

                            const billable = !blockingMsg && row.claimable_quantity > 0;
                            const busy = busyId === row.billable_item_id;
                            const awaiting = row.unverified_quantity > 1e-6;
                            const isMilestone = row.basis === 'milestone_event';
                            const selfRecorded =
                              Boolean(currentProfileId) &&
                              (isMilestone
                                ? row.claimed_by === currentProfileId
                                : row.progress_recorded_by === currentProfileId) &&
                              activeRole !== 'UPPER_MANAGEMENT';

                            return (
                              <tr key={row.billable_item_id} className="hover:bg-muted/10 transition-colors align-top">
                                <td className="py-2.5 px-3 tabular-nums text-muted-foreground font-semibold">
                                  {row.sequence_no}
                                </td>

                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-foreground text-xs">{stageTitle}</div>
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {ELIGIBILITY_LABEL[row.eligibility_rule]}
                                    {row.contracted_quantity != null && (
                                      <>
                                        {' · '}
                                        {qty(row.contracted_quantity, row.unit)} @{' '}
                                        {formatIndianCurrency(row.rate ?? 0)}
                                      </>
                                    )}
                                  </div>
                                  {blockingMsg && (
                                    <div className="mt-1 inline-flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                                      <Lock className="mt-0.5 h-3 w-3 shrink-0" /> {blockingMsg}
                                    </div>
                                  )}
                                </td>

                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.scheduled_value == null
                          ? '—'
                          : formatIndianCurrency(row.scheduled_value)}
                      </td>

                      {/* Verified progress is the headline; an unverified figure
                          is shown underneath so it never reads as "no work". */}
                      <td className="py-2 pr-2 text-right tabular-nums">
                        <div className="font-semibold">
                          {row.percent_complete == null
                            ? qty(row.measured_quantity, row.unit)
                            : `${row.percent_complete}%`}
                        </div>
                        {awaiting && (
                          <div className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            {row.recorded_percent == null
                              ? `${qty(row.progress_quantity, row.unit)} recorded`
                              : `${row.recorded_percent}% recorded`}
                            <br />
                            awaiting check
                          </div>
                        )}
                      </td>

                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.work_done_value ? formatIndianCurrency(row.work_done_value) : '—'}
                      </td>

                      <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
                        {row.scheduled_value == null
                          ? row.pending_quantity == null
                            ? '—'
                            : qty(row.pending_quantity, row.unit)
                          : formatIndianCurrency(
                              Math.max(row.scheduled_value - row.work_done_value, 0),
                            )}
                      </td>

                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.certified_value ? formatIndianCurrency(row.certified_value) : '—'}
                      </td>

                      <td className="py-2 pr-2 text-right tabular-nums">
                        {row.claimed_value ? formatIndianCurrency(row.claimed_value) : '—'}
                        {row.claimed_value > row.certified_value && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400">
                            {formatIndianCurrency(row.claimed_value - row.certified_value)} in
                            flight
                          </div>
                        )}
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
                          {/* Record / update progress on measurable scope. */}
                          {!isMilestone && permissions.canRecordExecution && isLive && (
                            <button
                              type="button"
                              onClick={() => openProgressEntry(row)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-50"
                            >
                              <PencilLine className="h-3 w-3" />
                              {row.progress_quantity == null ? 'Record' : 'Update'}
                            </button>
                          )}

                          {/* Claim a milestone complete. */}
                          {isMilestone &&
                            row.status !== 'verified' &&
                            row.status !== 'claimed' &&
                            permissions.canRecordExecution &&
                            isLive && (
                              <button
                                type="button"
                                onClick={() =>
                                  run(row.billable_item_id, () =>
                                    claimBillableItem(
                                      row.billable_item_id,
                                      100,
                                      'Completion claimed from the Work Order',
                                    ),
                                  )
                                }
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

                          {/* The second person. */}
                          {permissions.canApproveWorkOrder &&
                            (awaiting || (isMilestone && row.status === 'claimed')) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    run(row.billable_item_id, () =>
                                      isMilestone
                                        ? verifyBillableItem(row.billable_item_id, true)
                                        : verifyActivityProgress(row.billable_item_id, true),
                                    )
                                  }
                                  disabled={busy || selfRecorded}
                                  title={
                                    selfRecorded
                                      ? 'You recorded this. It must be verified by someone else.'
                                      : 'Confirm the recorded progress'
                                  }
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                                >
                                  Verify
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectReason('');
                                    setRejecting(row);
                                  }}
                                  disabled={busy || selfRecorded}
                                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
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
                  </div>
                ))}
              </div>
            );
          })()}

          <p className="mt-3 text-[10px] text-muted-foreground">
            Recorded progress must be verified by someone other than the person who recorded it.
            Only verified progress counts towards billing — the overall percentage above is derived
            from these rows, not entered.
          </p>
        </>
      )}

      {/* --- Record progress ------------------------------------------------ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl">
            <h3 className="text-sm font-bold">Record progress</h3>
            <p className="mt-1 text-xs text-muted-foreground">{editing.item_label}</p>

            {editing.contracted_quantity != null && (
              <p className="mt-2 rounded-lg border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                Contracted {qty(editing.contracted_quantity, editing.unit)} @{' '}
                {formatIndianCurrency(editing.rate ?? 0)} · verified so far{' '}
                {qty(editing.measured_quantity, editing.unit)}
              </p>
            )}

            {(editing.contracted_quantity ?? 0) > 0 && (
              <div className="mt-3 flex gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={entryMode === 'percent'}
                    onChange={() => setEntryMode('percent')}
                  />
                  Percentage
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={entryMode === 'quantity'}
                    onChange={() => setEntryMode('quantity')}
                  />
                  Quantity {editing.unit ? `(${editing.unit})` : ''}
                </label>
              </div>
            )}

            <label className="mt-3 block">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Total completed to date{' '}
                {entryMode === 'percent' ? '(%)' : editing.unit ? `(${editing.unit})` : ''}
              </span>
              <input
                autoFocus
                type="number"
                min={0}
                step="0.01"
                max={entryMode === 'percent' ? 100 : undefined}
                value={entryValue}
                onChange={(event) => setEntryValue(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-right font-mono text-sm outline-none focus:border-primary"
              />
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Cumulative, not this period only — enter the total done so far.
              </span>
            </label>

            <textarea
              rows={2}
              value={entryNote}
              onChange={(event) => setEntryNote(event.target.value)}
              placeholder="Note (optional) — e.g. tower / floors covered"
              className="mt-3 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            />

            <p className="mt-2 text-[10px] text-muted-foreground">
              This is recorded as claimed progress. It unlocks no billing until someone else
              verifies it.
            </p>

            {entryError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-2.5 dark:border-red-900/40 dark:bg-red-950/20">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                <p className="text-[11px] font-semibold text-red-800 dark:text-red-300">
                  {entryError}
                </p>
              </div>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={entrySaving}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitProgress}
                disabled={entryValue.trim() === '' || entrySaving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {entrySaving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save progress
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Reject ---------------------------------------------------------- */}
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
                Reject progress
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
