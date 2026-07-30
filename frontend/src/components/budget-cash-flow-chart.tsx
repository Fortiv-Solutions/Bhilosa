'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET CASH-FLOW S-CURVE
// File: frontend/src/components/budget-cash-flow-chart.tsx
//
// What was wrong before:
//   * FULL_LIFECYCLE_SCURVE_DATA — a hardcoded 12-month Jan–Dec 2026 curve with
//     invented milestones ("RA Bill 14 Slab 12 & Civil Labour") used as the data.
//   * It then tried to overwrite that from `http://localhost:8000/api/budget/scurve`
//     — a hardcoded localhost URL that cannot resolve in any deployed environment
//     and is mixed-content blocked over HTTPS — and that endpoint returned the same
//     hardcoded constants anyway.
//   * KPI cards printed "₹32.95 Cr", "Jul 26 (₹7.30 Cr)", "₹4.85 Cr / mo" and
//     "SPI 1.02 (On Schedule)" as literal strings.
//   * It accepted `ledger` and `totalSpend` props and used neither.
//
// Now: the actual curve is built from budget_monthly_cashflow_view (real posted
// ledger transactions) and the planned curve is a straight-line spread of the
// baseline across the project's actual transaction window — labelled as such, with
// no invented forecast confidence.
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, Download, Info, TrendingUp } from 'lucide-react';
import { downloadCsv, toCsv } from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget/budget-data-context';
import { BudgetEmpty, BudgetGate } from './budget/budget-states';

interface CurvePoint {
  month: string;
  monthKey: string;
  /** Cumulative straight-line baseline spread, ₹ Cr. */
  plannedCumulative: number;
  /** Cumulative posted actuals, ₹ Cr. Null for months with no data yet. */
  actualCumulative: number | null;
  /** Cumulative commitments, ₹ Cr. */
  committedCumulative: number | null;
  /** Actual posted in the month, ₹ Lakhs. */
  monthlyActual: number | null;
  monthlyCommitted: number | null;
  monthlyPlanned: number;
}

const CR = 10_000_000;
const LAKH = 100_000;

function monthLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

export default function BudgetCashFlowChart({
  permissions,
}: {
  permissions: BudgetPermissions;
}) {
  const { cashflow, totals, projectName, isPortfolio } = useBudgetData();
  const [viewMode, setViewMode] = useState<'cumulative' | 'monthly'>('cumulative');

  const curve = useMemo<CurvePoint[]>(() => {
    if (cashflow.length === 0) return [];

    // Aggregate across projects when viewing the portfolio.
    const byMonth = new Map<string, { actual: number; committed: number }>();
    for (const row of cashflow) {
      const key = row.month_start.slice(0, 7);
      const bucket = byMonth.get(key) ?? { actual: 0, committed: 0 };
      bucket.actual += row.actual_amount ?? 0;
      bucket.committed += row.committed_amount ?? 0;
      byMonth.set(key, bucket);
    }

    const months = [...byMonth.keys()].sort();
    // Straight-line planned spread across the observed window. Labelled as a
    // straight-line spread in the UI — it is not a schedule-derived forecast.
    const plannedPerMonth = months.length > 0 ? totals.baseline / months.length : 0;

    let cumulativeActual = 0;
    let cumulativeCommitted = 0;
    let cumulativePlanned = 0;

    return months.map((key) => {
      const bucket = byMonth.get(key)!;
      cumulativeActual += bucket.actual;
      cumulativeCommitted += bucket.committed;
      cumulativePlanned += plannedPerMonth;

      return {
        month: monthLabel(`${key}-01`),
        monthKey: key,
        plannedCumulative: Number((cumulativePlanned / CR).toFixed(2)),
        actualCumulative: Number((cumulativeActual / CR).toFixed(2)),
        committedCumulative: Number((cumulativeCommitted / CR).toFixed(2)),
        monthlyActual: Number((bucket.actual / LAKH).toFixed(2)),
        monthlyCommitted: Number((bucket.committed / LAKH).toFixed(2)),
        monthlyPlanned: Number((plannedPerMonth / LAKH).toFixed(2)),
      };
    });
  }, [cashflow, totals.baseline]);

  const stats = useMemo(() => {
    if (curve.length === 0) {
      return { peakMonth: null as CurvePoint | null, averageMonthly: 0, billedPercent: 0 };
    }
    const peakMonth = curve.reduce((prev, cur) =>
      (cur.monthlyActual ?? 0) > (prev.monthlyActual ?? 0) ? cur : prev,
    );
    const monthsWithSpend = curve.filter((p) => (p.monthlyActual ?? 0) > 0).length || 1;
    return {
      peakMonth,
      averageMonthly: totals.spent / monthsWithSpend,
      billedPercent: totals.baseline > 0 ? (totals.spent / totals.baseline) * 100 : 0,
    };
  }, [curve, totals.spent, totals.baseline]);

  function handleExport() {
    const headers = [
      'Month', 'Planned Cumulative (Cr)', 'Actual Cumulative (Cr)', 'Committed Cumulative (Cr)',
      'Monthly Planned (L)', 'Monthly Actual (L)', 'Monthly Committed (L)',
    ];
    const body = curve.map((p) => [
      p.month, p.plannedCumulative, p.actualCumulative, p.committedCumulative,
      p.monthlyPlanned, p.monthlyActual, p.monthlyCommitted,
    ]);
    downloadCsv(
      `cash-flow-${isPortfolio ? 'all-projects' : projectName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(headers, body),
    );
  }

  return (
    <BudgetGate requireCategories={false} loadingLabel="Loading cash-flow data from Supabase…">
      {curve.length === 0 ? (
        <BudgetEmpty
          title="No cash-flow history yet"
          detail="The S-curve is built from posted budget ledger transactions. It will populate as purchase orders are approved and vendor bills verified."
        />
      ) : (
        <div className="space-y-6 font-sans">
          {/* KPI ROW — all derived */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Cumulative Billed Outflow"
              value={`₹${(totals.spent / CR).toFixed(2)} Cr`}
              detail={`${stats.billedPercent.toFixed(1)}% of the ₹${(totals.baseline / CR).toFixed(2)} Cr baseline`}
              tone="emerald"
            />
            <Kpi
              label="Peak Outflow Month"
              value={
                stats.peakMonth && (stats.peakMonth.monthlyActual ?? 0) > 0
                  ? `${stats.peakMonth.month} (₹${((stats.peakMonth.monthlyActual ?? 0) / 100).toFixed(2)} Cr)`
                  : '—'
              }
              detail="Highest single month of verified bills"
              tone="primary"
            />
            <Kpi
              label="Average Monthly Outflow"
              value={`₹${(stats.averageMonthly / CR).toFixed(2)} Cr`}
              detail="Across months with posted spend"
            />
            <Kpi
              label="Committed Not Yet Billed"
              value={`₹${(totals.committed / CR).toFixed(2)} Cr`}
              detail="Approved POs awaiting vendor bills"
              tone="amber"
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-300">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" aria-hidden="true" />
            <p>
              <strong>Actual</strong> and <strong>Committed</strong> curves are posted ledger
              transactions. The <strong>Planned</strong> curve is a straight-line spread of the
              approved baseline across the months that have activity — it is a reference line, not a
              schedule-derived forecast. Connect a project schedule to produce a true planned S-curve.
            </p>
          </div>

          {/* CHART */}
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
                  <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
                  Cash Outflow S-Curve
                </h3>
                <p className="text-xs text-muted-foreground">
                  {curve.length} month(s) of posted ledger activity
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('cumulative')}
                    className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                      viewMode === 'cumulative'
                        ? 'bg-card text-primary shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Cumulative (₹ Cr)
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('monthly')}
                    className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
                      viewMode === 'monthly'
                        ? 'bg-card text-primary shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Monthly (₹ Lakhs)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!permissions.canExport}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
                </button>
              </div>
            </div>

            <div className="h-[380px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === 'cumulative' ? (
                  <AreaChart data={curve} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cfActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cfPlanned" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} />
                    <YAxis tick={{ fontSize: 11, fontWeight: 600 }} unit=" Cr" />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [
                        `₹${Number(value).toFixed(2)} Cr`,
                        name === 'plannedCumulative'
                          ? 'Planned (straight-line baseline)'
                          : name === 'actualCumulative'
                            ? 'Actual billed'
                            : 'Committed',
                      ]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === 'plannedCumulative'
                          ? 'Planned (straight-line)'
                          : value === 'actualCumulative'
                            ? 'Actual billed'
                            : 'Committed'
                      }
                      wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '10px' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="plannedCumulative"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      fill="url(#cfPlanned)"
                      fillOpacity={1}
                    />
                    <Area
                      type="monotone"
                      dataKey="actualCumulative"
                      stroke="#10b981"
                      strokeWidth={3}
                      fill="url(#cfActual)"
                      fillOpacity={1}
                    />
                    <Line
                      type="monotone"
                      dataKey="committedCumulative"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      strokeDasharray="3 3"
                      dot={{ r: 3 }}
                    />
                  </AreaChart>
                ) : (
                  <AreaChart data={curve} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cfMonthly" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} />
                    <YAxis tick={{ fontSize: 11, fontWeight: 600 }} unit=" L" />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => [
                        `₹${Number(value).toFixed(2)} Lakhs`,
                        name === 'monthlyPlanned'
                          ? 'Planned (straight-line)'
                          : name === 'monthlyActual'
                            ? 'Actual billed'
                            : 'Committed',
                      ]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '10px' }} />
                    <Area
                      type="monotone"
                      dataKey="monthlyActual"
                      name="Actual billed (L)"
                      stroke="#10b981"
                      strokeWidth={3}
                      fill="url(#cfMonthly)"
                      fillOpacity={1}
                    />
                    <Line
                      type="monotone"
                      dataKey="monthlyCommitted"
                      name="Committed (L)"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="monthlyPlanned"
                      name="Planned straight-line (L)"
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* MONTHLY TABLE */}
          <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                  <Calendar className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  Monthly Disbursement Schedule
                </h3>
                <p className="text-xs text-muted-foreground">
                  Posted budget ledger transactions by month
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {curve.length} month(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="border-r border-border px-3.5 py-2.5">Month</th>
                    <th className="border-r border-border px-4 py-2.5 text-right font-mono">
                      Planned Cum. (₹ Cr)
                    </th>
                    <th className="border-r border-border px-4 py-2.5 text-right font-mono">
                      Actual Cum. (₹ Cr)
                    </th>
                    <th className="border-r border-border px-4 py-2.5 text-right font-mono">
                      Committed Cum. (₹ Cr)
                    </th>
                    <th className="border-r border-border px-4 py-2.5 text-right font-mono">
                      Month Actual (₹ L)
                    </th>
                    <th className="px-3.5 py-2.5 text-center">Variance vs Planned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {curve.map((row) => {
                    const delta = (row.actualCumulative ?? 0) - row.plannedCumulative;
                    return (
                      <tr key={row.monthKey} className="align-middle transition-colors hover:bg-muted/30">
                        <td className="border-r border-border px-3.5 py-2.5 font-bold text-foreground">
                          {row.month}
                        </td>
                        <td className="border-r border-border px-4 py-2.5 text-right font-mono font-semibold text-blue-700 dark:text-blue-300">
                          ₹{row.plannedCumulative.toFixed(2)}
                        </td>
                        <td className="border-r border-border px-4 py-2.5 text-right font-mono font-black text-emerald-700 dark:text-emerald-300">
                          ₹{(row.actualCumulative ?? 0).toFixed(2)}
                        </td>
                        <td className="border-r border-border px-4 py-2.5 text-right font-mono font-semibold text-amber-700 dark:text-amber-300">
                          ₹{(row.committedCumulative ?? 0).toFixed(2)}
                        </td>
                        <td className="border-r border-border px-4 py-2.5 text-right font-mono font-bold text-foreground">
                          ₹{(row.monthlyActual ?? 0).toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              delta > 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            }`}
                          >
                            {delta > 0 ? '+' : ''}
                            {delta.toFixed(2)} Cr
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </BudgetGate>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'emerald' | 'amber' | 'primary';
}) {
  const valueTone =
    tone === 'emerald'
      ? 'text-emerald-600'
      : tone === 'amber'
        ? 'text-amber-800 dark:text-amber-300'
        : tone === 'primary'
          ? 'text-foreground'
          : 'text-foreground';
  const labelTone =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
      <p className={`text-[11px] font-extrabold uppercase tracking-wider ${labelTone}`}>{label}</p>
      <p className={`mt-1 font-mono text-xl font-black ${valueTone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
