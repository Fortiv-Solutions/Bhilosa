'use client';

// ============================================================================
// BUDGET MOVEMENT REGISTER (Phase 7)
// File: frontend/src/components/budget/budget-movements-tab.tsx
//
// Every budget change is a typed movement document under a staged approval
// lifecycle. This is the register: who moved money, from where to where, why,
// and who signed it off.
//
// That question previously had no answer, because every change was an in-place
// line edit applied the instant it was saved. The schema had a status machine
// and approval columns; both write RPCs hardcoded status='approved'.
//
// Contingency drawdown is the case this exists for: money taken FROM the
// contingency head into a work head is a transfer (net-zero, visible here),
// whereas genuinely new money is a supplement (must state its funding source).
// As a line edit those two were indistinguishable.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileClock,
  Loader2,
  XCircle,
} from 'lucide-react';
import {
  approveBudgetChange,
  cancelBudgetChange,
  fetchBudgetChangeLines,
  listBudgetMovements,
  rejectBudgetChange,
  submitBudgetChange,
  MOVEMENT_LABELS,
  type BudgetChangeStatus,
  type BudgetMovementRow,
  type BudgetRevisionItemRow,
} from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetAuthRequired, BudgetEmpty, BudgetError, BudgetLoading } from './budget-states';
import { formatIndianCurrency } from '@/utils/format-currency';

const STATUS_FILTERS: (BudgetChangeStatus | 'All')[] = [
  'All', 'submitted', 'draft', 'approved', 'rejected', 'cancelled',
];

function statusPill(status: string): string {
  switch (status) {
    case 'approved': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'submitted': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'rejected': return 'border-red-200 bg-red-50 text-red-700';
    case 'cancelled': return 'border-gray-200 bg-gray-100 text-gray-500';
    default: return 'border-amber-200 bg-amber-50 text-amber-700';
  }
}

function movementPill(type: string): string {
  switch (type) {
    case 'supplement': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'return': return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'transfer': return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'original': return 'border-purple-200 bg-purple-50 text-purple-700';
    default: return 'border-sky-200 bg-sky-50 text-sky-700';
  }
}

function dmy(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function BudgetMovementsTab({ permissions }: { permissions: BudgetPermissions }) {
  const { projectId, needsAuth, refresh: refreshModule } = useBudgetData();

  const [rows, setRows] = useState<BudgetMovementRow[]>([]);
  const [status, setStatus] = useState<BudgetChangeStatus | 'All'>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, BudgetRevisionItemRow[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listBudgetMovements(projectId, status));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load budget movements.');
    } finally {
      setLoading(false);
    }
  }, [projectId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!lines[id]) {
      try {
        setLines((prev) => ({ ...prev, [id]: [] }));
        const data = await fetchBudgetChangeLines(id);
        setLines((prev) => ({ ...prev, [id]: data }));
      } catch {
        /* the row stays expanded with an empty diff; the error banner covers it */
      }
    }
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setActioningId(id);
    setError(null);
    try {
      await action();
      await load();
      // The baseline may have moved; the rest of the module must re-read.
      await refreshModule();
    } catch (err) {
      // Server-side rules (staleness conflicts, net-zero, stranded commitments)
      // are written to be shown verbatim.
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActioningId(null);
    }
  }

  const pending = useMemo(() => rows.filter((r) => r.status === 'submitted').length, [rows]);

  if (needsAuth) return <BudgetAuthRequired />;
  if (loading && rows.length === 0) return <BudgetLoading label="Loading budget movements…" />;
  if (error && rows.length === 0) return <BudgetError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <FileClock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold">Movement Register</h2>
        </div>
        {pending > 0 && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
            {pending} awaiting approval
          </span>
        )}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as BudgetChangeStatus | 'All')}
          className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs capitalize"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <BudgetEmpty
          title="No budget movements yet"
          detail="Every change to the baseline — supplement, return, transfer or revision — is recorded here as an approvable document."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            const busy = actioningId === row.id;
            const canApproveThis =
              row.approval_tier === 'board'
                ? permissions.canApproveSupplement
                : permissions.canApproveBudgetChange;

            return (
              <article key={row.id} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold">{row.document_number ?? row.version_label}</span>
                      <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${movementPill(row.movement_type)}`}>
                        {MOVEMENT_LABELS[row.movement_type]?.label ?? row.movement_type}
                      </span>
                      <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${statusPill(row.status)}`}>
                        {row.status}
                      </span>
                      <span className="rounded-full border border-border px-1.5 py-px text-[9px] font-bold uppercase text-muted-foreground">
                        {row.approval_tier} approval
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {row.justification_reason}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span>Raised by {row.raised_by_name ?? '—'} · {dmy(row.created_at)}</span>
                      <span>{row.line_count} line(s)</span>
                      {row.source_head && row.target_head && (
                        <span className="inline-flex items-center gap-1">
                          {row.source_head} <ArrowRight className="h-3 w-3" /> {row.target_head}
                        </span>
                      )}
                      {row.funding_source && <span>Funded by {row.funding_source}</span>}
                      {row.approved_at && <span>Approved by {row.approved_by_name} · {dmy(row.approved_at)}</span>}
                      {row.rejected_at && <span className="text-red-600">Rejected: {row.rejection_reason}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div
                      className={`text-sm font-bold ${
                        row.net_diff_amount > 0
                          ? 'text-emerald-700'
                          : row.net_diff_amount < 0
                            ? 'text-orange-700'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {row.net_diff_amount > 0 ? '+' : ''}
                      {formatIndianCurrency(row.net_diff_amount)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatIndianCurrency(row.old_total_cost)} → {formatIndianCurrency(row.new_total_cost)}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-3 pb-3 pt-2">
                    <p className="mb-2 text-[10px] text-muted-foreground">
                      {MOVEMENT_LABELS[row.movement_type]?.hint}
                    </p>

                    {lines[row.id]?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-[11px]">
                          <thead className="border-b border-border text-muted-foreground">
                            <tr>
                              <th className="pb-1.5">Line</th>
                              <th className="pb-1.5">Head</th>
                              <th className="pb-1.5 text-right">Current</th>
                              <th className="pb-1.5 text-right">Proposed</th>
                              <th className="pb-1.5 text-right">Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines[row.id].map((line) => {
                              const delta = Number(line.new_cost) - Number(line.old_cost);
                              return (
                                <tr key={line.id} className="border-b border-border/40">
                                  <td className="py-1.5">{line.sub_activity}</td>
                                  <td className="py-1.5 text-muted-foreground">{line.category_name}</td>
                                  <td className="py-1.5 text-right text-muted-foreground">
                                    {formatIndianCurrency(Number(line.old_cost))}
                                  </td>
                                  <td className="py-1.5 text-right font-semibold">
                                    {formatIndianCurrency(Number(line.new_cost))}
                                  </td>
                                  <td
                                    className={`py-1.5 text-right font-bold ${
                                      delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-orange-700' : 'text-muted-foreground'
                                    }`}
                                  >
                                    {delta > 0 ? '+' : ''}
                                    {formatIndianCurrency(delta)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Loading the proposed changes…</p>
                    )}

                    {['draft', 'submitted'].includes(row.status) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {row.status === 'draft' && permissions.canProposeBudgetChange && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(row.id, () => submitBudgetChange(row.id))}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                          >
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Submit for approval
                          </button>
                        )}

                        {canApproveThis && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const remarks = window.prompt('Approval remarks (optional):') ?? undefined;
                              void run(row.id, () => approveBudgetChange(row.id, remarks));
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve &amp; apply
                          </button>
                        )}

                        {canApproveThis && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const reason = window.prompt('Why is this change rejected?');
                              if (!reason?.trim()) return;
                              void run(row.id, () => rejectBudgetChange(row.id, reason));
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        )}

                        {row.status === 'draft' && permissions.canProposeBudgetChange && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(row.id, () => cancelBudgetChange(row.id))}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                          >
                            Withdraw
                          </button>
                        )}

                        {!canApproveThis && row.status === 'submitted' && (
                          <span className="text-[11px] text-muted-foreground">
                            Awaiting {row.approval_tier === 'board' ? 'board' : 'management'} approval.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
