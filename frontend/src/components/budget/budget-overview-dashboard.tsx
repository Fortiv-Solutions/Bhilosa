'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET OVERVIEW & RISK ALERTS
// File: frontend/src/components/budget/budget-overview-dashboard.tsx
//
// Modern, production-ready Overview Dashboard connected live to Supabase data.
// Features:
//   * Executive KPI Summary cards & explicit E.A.C. Forecast Cost per Sq. Ft.
//   * Pramukh AI Budget Advisory Card (live data AI insights & actionable recommendations)
//   * Category Comparison with expandable Sub-Category (line items) breakdown
//   * Harmonized committed & actual outlays across budget_allocations & variance
//   * Real-time Open Risk Alerts with acknowledge capability
//   * Key Variance Drivers & Highest Utilization rankings
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Info,
  Loader2,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { acknowledgeBudgetAlert, BudgetDataError } from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetError, BudgetGate } from './budget-states';
import AIBudgetAdvisoryCard from './ai-budget-advisory-card';

function cr(value: number): string {
  return `₹${(value / 10_000_000).toFixed(2)} Cr`;
}

function lakh(value: number): string {
  return `₹${(value / 100_000).toFixed(2)}L`;
}

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

export default function BudgetOverviewDashboard({
  permissions,
}: {
  permissions: BudgetPermissions;
}) {
  const {
    projectName,
    buaSqft,
    totals,
    categories,
    variance,
    varianceSummary,
    alerts,
    allocations,
    revisions,
    movements,
    refresh,
    refreshing,
  } = useBudgetData();

  const [driverFilter, setDriverFilter] = useState<'all' | 'overruns' | 'savings'>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});

  function toggleExpandCategory(id: string) {
    setExpandedCategoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  /**
   * Estimate at Completion, stated explicitly rather than implied:
   *   EAC = baseline + realised overruns
   */
  const eac = totals.baseline + varianceSummary.overrunAmount;

  const categoryRows = useMemo(
    () =>
      variance
        .map((cat) => {
          // Harmonize with budget_allocations if present
          const matchingAlloc = allocations.find(
            (a) =>
              (a.category_id && a.category_id === cat.id) ||
              a.allocation_name.toLowerCase().trim() === cat.categoryName.toLowerCase().trim(),
          );

          const budget = cat.totalBudgetCost;
          const committed = Math.max(cat.totalCommittedCost, matchingAlloc?.committed_amount ?? 0);
          const actual = Math.max(cat.totalActualCost, matchingAlloc?.spent_amount ?? 0);

          return {
            id: cat.id,
            category: cat.categoryName,
            budget,
            actual,
            committed,
            balance: Math.max(0, budget - actual),
            variance: budget - actual,
            utilization: budget > 0 ? Number((((actual + committed) / budget) * 100).toFixed(1)) : 0,
            billedPercent: budget > 0 ? Number(((actual / budget) * 100).toFixed(1)) : 0,
            items: cat.items,
          };
        })
        .sort((a, b) => b.budget - a.budget),
    [variance, allocations],
  );

  const drivers = useMemo(() => {
    const items = variance.flatMap((cat) =>
      cat.items
        // Only lines with real billing activity can drive variance.
        .filter((item) => item.actualTotalCost > 0)
        .map((item) => ({
          id: item.id,
          name: item.subActivity,
          category: cat.categoryName,
          amount: item.costVarianceAmount,
          percent: item.costVariancePercent,
          type: item.costVarianceAmount < 0 ? ('Overrun' as const) : ('Saving' as const),
        })),
    );

    return items
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .filter((d) =>
        driverFilter === 'all'
          ? true
          : driverFilter === 'overruns'
            ? d.type === 'Overrun'
            : d.type === 'Saving',
      )
      .slice(0, 12);
  }, [variance, driverFilter]);

  const openAlerts = useMemo(() => alerts.filter((a) => a.status === 'pending'), [alerts]);

  const topAllocations = useMemo(
    () =>
      [...allocations]
        .map((a) => ({
          ...a,
          utilization:
            a.allocated_amount > 0
              ? ((a.committed_amount + a.spent_amount) / a.allocated_amount) * 100
              : 0,
        }))
        .sort((a, b) => b.utilization - a.utilization)
        .slice(0, 6),
    [allocations],
  );

  async function handleResolve(alertId: string) {
    setResolvingId(alertId);
    setActionError(null);
    try {
      await acknowledgeBudgetAlert(alertId, 'closed');
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Unable to close the alert.',
      );
    } finally {
      setResolvingId(null);
    }
  }

  const maxCategoryBudget = Math.max(...categoryRows.map((c) => c.budget), 1);

  return (
    <BudgetGate loadingLabel="Loading budget overview from Supabase…">
      <div className="space-y-6 font-sans">
        {actionError && <BudgetError message={actionError} />}

        {/* 1. EXECUTIVE METRIC BANNER */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Baseline Budget (B.A.C)"
            icon={Building2}
            tone="blue"
            value={cr(totals.baseline)}
            subtitle={`${totals.lineItemCount} line items across ${totals.categoryCount} heads`}
            footLabel="Cost / Sqft"
            footValue={buaSqft > 0 ? `₹${totals.costPerSqft.toFixed(2)}` : 'BUA not set'}
          />

          <MetricCard
            label="Actual Billed Outflow"
            icon={CircleDollarSign}
            tone="emerald"
            value={cr(totals.spent)}
            subtitle="Verified vendor bills posted to the ledger"
            footLabel="Billed Cost / Sqft"
            footValue={buaSqft > 0 ? `₹${totals.actualCostPerSqft.toFixed(2)}` : `${totals.baseline > 0 ? ((totals.spent / totals.baseline) * 100).toFixed(1) : '0.0'}%`}
          />

          <MetricCard
            label="Committed (PO Reserved)"
            icon={ShieldCheck}
            tone="amber"
            value={cr(totals.committed)}
            subtitle="Approved purchase orders not yet billed"
            footLabel="Available to commit"
            footValue={cr(totals.available)}
          />

          <MetricCard
            label={totals.variance >= 0 ? 'Net Position (Under Budget)' : 'Net Cost Variance'}
            icon={totals.variance >= 0 ? TrendingDown : AlertTriangle}
            tone={totals.variance >= 0 ? 'emerald' : 'red'}
            value={`${totals.variance >= 0 ? '+' : '-'}${cr(Math.abs(totals.variance))}`}
            subtitle={
              totals.spent === 0
                ? 'No bills posted yet — nothing billed against the baseline'
                : `${Math.abs(totals.variancePercent).toFixed(2)}% ${
                    totals.variance >= 0 ? 'under' : 'over'
                  } baseline on billed work`
            }
            footLabel="Realised overruns"
            footValue={lakh(varianceSummary.overrunAmount)}
          />
        </div>

        {/* 2. PRAMUKH AI BUDGET ADVISORY & LIVE INSIGHTS */}
        <AIBudgetAdvisoryCard
          projectName={projectName}
          buaSqft={buaSqft}
          totals={totals}
          categories={categories}
          variance={variance}
          varianceSummary={varianceSummary}
          alerts={alerts}
          allocations={allocations}
          movements={movements}
          revisions={revisions}
          refresh={refresh}
          refreshing={refreshing}
        />

        {/* 3. FORECAST — explicit formula, no invented confidence intervals */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Estimate at Completion (E.A.C)
              </span>
              <div className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Scale className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <p className="mt-2 font-mono text-2xl font-black text-amber-950 dark:text-amber-200">
              {cr(eac)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Baseline {cr(totals.baseline)} + realised overruns {lakh(varianceSummary.overrunAmount)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px]">
              <span className="font-semibold text-muted-foreground">Forecast cost / sqft</span>
              <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                {buaSqft > 0 ? `₹${(eac / buaSqft).toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Retention &amp; Advances
              </span>
              <div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <dl className="mt-2 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="font-semibold text-muted-foreground">Retention held (DLP)</dt>
                <dd className="font-mono font-black text-amber-800 dark:text-amber-300">
                  {inr(totals.retentionHeld)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold text-muted-foreground">Advances outstanding</dt>
                <dd className="font-mono font-black text-blue-800 dark:text-blue-300">
                  {inr(totals.advanceOutstanding)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-semibold text-muted-foreground">Overrun exposure</dt>
                <dd className="font-mono font-black text-red-600">{inr(totals.overrun)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Reconciliation Progress
              </span>
              <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <dl className="mt-2 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="font-semibold text-muted-foreground">Lines with billing</dt>
                <dd className="font-mono font-black text-foreground">
                  {varianceSummary.overrunCount + varianceSummary.savingCount} /{' '}
                  {varianceSummary.itemCount}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold text-muted-foreground">Lines over budget</dt>
                <dd className="font-mono font-black text-red-600">{varianceSummary.overrunCount}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <dt className="font-semibold text-muted-foreground">Savings identified</dt>
                <dd className="font-mono font-black text-emerald-600">
                  {inr(varianceSummary.savingAmount)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {totals.spent === 0 && totals.committed === 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3.5 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-300">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" aria-hidden="true" />
            <p>
              A <strong>{cr(totals.baseline)}</strong> baseline is loaded for {projectName}, but no
              purchase orders or vendor bills have posted against it yet. Committed, spent and
              variance figures will populate automatically as POs are approved and bills verified in
              Procurement and Billing.
            </p>
          </div>
        )}

        {/* 4. CATEGORY COMPARISON + ALERTS */}
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
          {/* Budget vs actual by category */}
          <div className="flex flex-col space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-8">
            <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                  Budget vs Committed vs Actual by Head
                </h2>
                <p className="text-xs text-muted-foreground">
                  Click any head to expand its constituent sub-category line items
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Legend colour="bg-blue-600" label="Baseline" />
                <Legend colour="bg-amber-500" label="Committed" />
                <Legend colour="bg-emerald-600" label="Billed" />
              </div>
            </div>

            <div className="scrollbar-thin max-h-[520px] space-y-3.5 overflow-y-auto pr-1.5">
              {categoryRows.map((item) => {
                const isOver = item.actual > item.budget;
                const isExpanded = expandedCategoryIds[item.id] ?? false;

                return (
                  <div
                    key={item.id}
                    className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => toggleExpandCategory(item.id)}
                        className="flex items-center gap-1.5 text-left text-foreground hover:text-primary transition-colors cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-primary" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="font-bold text-foreground">{item.category}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {item.items.length} sub-items
                        </span>
                      </button>

                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-muted-foreground">
                          Budget <strong className="text-foreground">{lakh(item.budget)}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Committed <strong className="text-amber-600">{lakh(item.committed)}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          Billed{' '}
                          <strong className={isOver ? 'text-red-600' : 'text-emerald-600'}>
                            {lakh(item.actual)}
                          </strong>
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                            item.utilization > 100
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                              : item.utilization > 80
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          }`}
                          title="(committed + billed) ÷ baseline"
                        >
                          {item.utilization}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <Bar
                        widthPercent={(item.budget / maxCategoryBudget) * 100}
                        className="bg-blue-600"
                        title={`Baseline ${inr(item.budget)}`}
                      />
                      <Bar
                        widthPercent={(item.committed / maxCategoryBudget) * 100}
                        className="bg-amber-500"
                        title={`Committed ${inr(item.committed)}`}
                      />
                      <Bar
                        widthPercent={(item.actual / maxCategoryBudget) * 100}
                        className={isOver ? 'bg-red-500' : 'bg-emerald-600'}
                        title={`Billed ${inr(item.actual)}`}
                      />
                    </div>

                    {/* Expandable Sub-Categories (Line Items) Breakdown */}
                    {isExpanded && item.items.length > 0 && (
                      <div className="mt-2.5 space-y-1 rounded-md border border-border/70 bg-card p-2.5 text-[11px]">
                        <div className="flex items-center justify-between font-bold text-muted-foreground border-b border-border pb-1">
                          <span>Sub-Category / Item Description</span>
                          <div className="flex items-center gap-4 font-mono text-[10px]">
                            <span className="w-16 text-right">Est. Rate</span>
                            <span className="w-20 text-right">Budget Cost</span>
                            <span className="w-20 text-right">Committed</span>
                            <span className="w-20 text-right">Actual Billed</span>
                            <span className="w-12 text-center">Util %</span>
                          </div>
                        </div>
                        {item.items.map((subItem) => {
                          const subBudget = subItem.budgetCost;
                          const subCommitted = subItem.poAmount;
                          const subActual = subItem.actualTotalCost;
                          const subUtil = subBudget > 0 ? ((subCommitted + subActual) / subBudget) * 100 : 0;
                          const subIsOver = subActual > subBudget;

                          return (
                            <div
                              key={subItem.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-border/30 last:border-0 hover:bg-muted/40 px-1 rounded"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  #{subItem.srNo}
                                </span>
                                <span className="truncate font-semibold text-foreground" title={subItem.subActivity}>
                                  {subItem.subActivity}
                                </span>
                                <span className="text-[9px] uppercase text-muted-foreground font-mono">
                                  ({subItem.budgetQty} {subItem.unit})
                                </span>
                              </div>

                              <div className="flex items-center gap-4 font-mono text-[11px]">
                                <span className="w-16 text-right text-muted-foreground">
                                  ₹{Math.round(subItem.budgetRate).toLocaleString('en-IN')}
                                </span>
                                <span className="w-20 text-right font-bold text-foreground">
                                  ₹{Math.round(subBudget).toLocaleString('en-IN')}
                                </span>
                                <span className="w-20 text-right font-bold text-amber-600">
                                  ₹{Math.round(subCommitted).toLocaleString('en-IN')}
                                </span>
                                <span
                                  className={`w-20 text-right font-bold ${
                                    subIsOver ? 'text-red-600' : 'text-emerald-600'
                                  }`}
                                >
                                  ₹{Math.round(subActual).toLocaleString('en-IN')}
                                </span>
                                <span
                                  className={`w-12 text-center text-[10px] font-black rounded px-1 ${
                                    subUtil > 100
                                      ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                      : subUtil > 80
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  }`}
                                >
                                  {subUtil.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {categoryRows.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs font-semibold text-muted-foreground">
                  No budget heads to display.
                </p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col space-y-4 lg:col-span-4">
            {/* Open alerts */}
            <div className="flex flex-1 flex-col space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  Open Risk Alerts ({openAlerts.length})
                </h3>
              </div>

              <div className="scrollbar-thin max-h-[200px] space-y-2 overflow-y-auto pr-1">
                {openAlerts.length === 0 && (
                  <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    No budget head has breached its thresholds.
                  </p>
                )}

                {openAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`space-y-1 rounded-lg border p-2.5 ${
                      alert.severity === 'overrun' || alert.severity === 'critical'
                        ? 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20'
                        : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 text-xs font-bold">
                      <span className="text-foreground">
                        {alert.allocation_name ?? alert.alert_type.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`font-mono text-xs font-black ${
                          alert.severity === 'overrun' || alert.severity === 'critical'
                            ? 'text-red-600'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {alert.actual_percent?.toFixed(1) ?? '—'}%
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">{alert.message}</p>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                        {new Date(alert.created_at).toLocaleDateString('en-GB')}
                      </span>
                      {permissions.canResolveAlerts && (
                        <button
                          type="button"
                          onClick={() => void handleResolve(alert.id)}
                          disabled={resolvingId === alert.id}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                        >
                          {resolvingId === alert.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Most utilised heads */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                  Highest Utilisation
                </h3>
              </div>
              <div className="space-y-2">
                {topAllocations.length === 0 && (
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    No allocations provisioned yet.
                  </p>
                )}
                {topAllocations.map((alloc) => (
                  <div key={alloc.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate pr-2 font-bold text-foreground">
                        {alloc.allocation_name}
                      </span>
                      <span
                        className={`font-mono font-black ${
                          alloc.utilization > 100
                            ? 'text-red-600'
                            : alloc.utilization > 80
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                        }`}
                      >
                        {alloc.utilization.toFixed(1)}%
                      </span>
                    </div>
                    <Bar
                      widthPercent={Math.min(100, alloc.utilization)}
                      className={
                        alloc.utilization > 100
                          ? 'bg-red-500'
                          : alloc.utilization > 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-600'
                      }
                      title={`${inr(alloc.committed_amount + alloc.spent_amount)} of ${inr(alloc.allocated_amount)}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 5. VARIANCE DRIVERS */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
                <TrendingUp className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Key Variance Drivers
              </h2>
              <p className="text-xs text-muted-foreground">
                Largest signed differences between baseline and billed cost, for lines that have
                actually been billed
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              {(['all', 'overruns', 'savings'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDriverFilter(key)}
                  className={`rounded px-2 py-1 font-extrabold uppercase ${
                    driverFilter === key
                      ? key === 'overruns'
                        ? 'bg-red-600 text-white'
                        : key === 'savings'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {drivers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs font-semibold text-muted-foreground">
              No billed lines yet, so there are no variance drivers to rank. Verify vendor bills in
              Billing to populate this.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  className="space-y-1 rounded-lg border border-border bg-muted/20 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2 text-xs font-bold">
                    <span className="line-clamp-2 text-foreground">{driver.name}</span>
                    <span
                      className={`whitespace-nowrap font-mono text-xs font-black ${
                        driver.type === 'Overrun' ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {driver.type === 'Overrun' ? '-' : '+'}
                      {lakh(Math.abs(driver.amount))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                    <span className="truncate pr-2">{driver.category}</span>
                    <span
                      className={`font-bold ${
                        driver.type === 'Overrun' ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {driver.percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] font-medium text-muted-foreground">
          All figures on this page are computed live from Supabase: baseline from{' '}
          <code className="font-mono">master_budget_items</code>, committed and spent from{' '}
          <code className="font-mono">budget_ledger</code> via{' '}
          <code className="font-mono">budget_allocations</code>, and alerts from{' '}
          <code className="font-mono">budget_alerts</code>. {categories.length} budget head(s) loaded.
        </p>
      </div>
    </BudgetGate>
  );
}

// ----------------------------------------------------------------------------
// Presentational helpers
// ----------------------------------------------------------------------------

function MetricCard({
  label,
  icon: Icon,
  tone,
  value,
  subtitle,
  footLabel,
  footValue,
}: {
  label: string;
  icon: typeof Building2;
  tone: 'blue' | 'emerald' | 'amber' | 'red';
  value: string;
  subtitle: string;
  footLabel: string;
  footValue: string;
}) {
  const tones = {
    blue: {
      chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
      label: 'text-muted-foreground',
      value: 'text-foreground',
    },
    emerald: {
      chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      label: 'text-emerald-700 dark:text-emerald-400',
      value: 'text-emerald-900 dark:text-emerald-300',
    },
    amber: {
      chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
      label: 'text-amber-700 dark:text-amber-400',
      value: 'text-amber-950 dark:text-amber-200',
    },
    red: {
      chip: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      label: 'text-red-900 dark:text-red-300',
      value: 'text-red-600',
    },
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-extrabold uppercase tracking-wider ${tones.label}`}>
          {label}
        </span>
        <div className={`rounded-lg p-2 ${tones.chip}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className={`mt-2 font-mono text-2xl font-black ${tones.value}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px]">
        <span className="font-semibold text-muted-foreground">{footLabel}</span>
        <span className="font-mono font-bold text-foreground">{footValue}</span>
      </div>
    </div>
  );
}

function Bar({
  widthPercent,
  className,
  title,
}: {
  widthPercent: number;
  className: string;
  title: string;
}) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" title={title}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${className}`}
        style={{ width: `${Math.max(0, Math.min(100, widthPercent))}%` }}
      />
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-bold text-muted-foreground">
      <span className={`h-2.5 w-2.5 rounded-full ${colour}`} aria-hidden="true" /> {label}
    </span>
  );
}

