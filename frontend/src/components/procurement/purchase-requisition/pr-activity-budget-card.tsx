// ============================================================================
// PRAMUKH GROUP ERP V2 — ACTIVITY-WISE BUDGET PANEL
// File: frontend/src/components/procurement/purchase-requisition/pr-activity-budget-card.tsx
//
// Shows the budget for each ACTIVITY on the requisition — drawn from that
// activity's Master Budget category and Variance actuals — instead of the
// project's overall allocation.
//
// Design notes:
//   * Figures are shown in lakh / crore. At this project's scale a raw
//     toLocaleString renders "1453638820", which nobody can read at a glance.
//     Exact rupees stay available on hover via title attributes.
//   * The provenance of each mapping is stated plainly (Exact / AI / Confirmed),
//     and the "AI" label appears ONLY when a model actually resolved it. The
//     previous version showed a Sparkles "AI Matched" badge unconditionally
//     while running pure string comparison.
//   * Unmapped activities appear as an explicit Miscellaneous group rather than
//     being dropped from the breakdown.
// ============================================================================

import React, { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  HelpCircle,
  Link2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import type {
  PrBudgetAnalysisResult,
  PrActivityBudgetGroup,
} from '@/lib/erp/purchase-requisition/budget-analysis';
import { formatCurrency } from '@/components/procurement/shared';

interface PrActivityBudgetCardProps {
  analysis: PrBudgetAnalysisResult;
  /** True while activity -> category resolution is in flight. */
  resolving?: boolean;
  /** Set when AI mapping was wanted but unavailable; shown as a quiet notice. */
  modelError?: string | null;
  /** True when a model actually resolved at least one activity this session. */
  usedModel?: boolean;
  onResolveVariance?: () => void;
  readOnly?: boolean;
}

/** Indian short-scale money: 1,23,45,678 -> "1.23 Cr". */
function compactInr(value: number): string {
  const n = Math.abs(Number(value) || 0);
  const sign = value < 0 ? '-' : '';
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(1)} K`;
  return `${sign}₹${n.toFixed(0)}`;
}

const HEALTH_STYLES = {
  within_budget: {
    pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    ring: 'border-border',
    bar: 'bg-emerald-500',
    label: 'Within Budget',
    Icon: CheckCircle2,
  },
  near_limit: {
    pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    ring: 'border-amber-300 dark:border-amber-900/50',
    bar: 'bg-amber-500',
    label: 'Near Limit',
    Icon: AlertTriangle,
  },
  over_budget: {
    pill: 'bg-red-500/15 text-red-700 dark:text-red-300',
    ring: 'border-red-300 dark:border-red-900/50',
    bar: 'bg-red-500',
    label: 'Over Budget',
    Icon: AlertTriangle,
  },
  unmapped: {
    pill: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
    ring: 'border-dashed border-slate-300 dark:border-slate-700',
    bar: 'bg-slate-400',
    label: 'Unmapped',
    Icon: HelpCircle,
  },
} as const;

/** Small provenance chip: how this activity found its budget category. */
function MatchBadge({ group }: { group: PrActivityBudgetGroup }) {
  if (group.isMiscellaneous) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
        <HelpCircle className="h-3 w-3" /> No budget category
      </span>
    );
  }

  if (group.matchSource === 'manual') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3 w-3" /> Confirmed
      </span>
    );
  }

  if (group.matchSource === 'exact') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-400">
        <Link2 className="h-3 w-3" /> Exact match
      </span>
    );
  }

  // llm | cache — both originate from a model classification.
  const pct = Math.round((group.matchConfidence || 0) * 100);
  const low = pct > 0 && pct < 70;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
        low
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'bg-violet-500/10 text-violet-700 dark:text-violet-400'
      }`}
      title={group.matchReason}
    >
      <Sparkles className="h-3 w-3" /> Accuracy{pct ? ` · ${pct}%` : ''}
      {low ? ' · verify' : ''}
    </span>
  );
}

/** One headline number in the summary strip. Exact rupees on hover. */
function SummaryFigure({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'neutral' | 'sky' | 'good' | 'bad';
}) {
  const tones = {
    neutral: 'text-foreground',
    sky: 'text-sky-700 dark:text-sky-400',
    good: 'text-emerald-700 dark:text-emerald-400',
    bad: 'text-red-600 dark:text-red-400',
  } as const;

  return (
    <div className="px-3 first:pl-0 last:pr-0" title={formatCurrency(value)}>
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className={`mt-0.5 text-lg font-extrabold leading-none tabular-nums ${tones[tone]}`}>
        {compactInr(value)}
      </p>
      <span className="mt-1 block text-[10px] font-medium text-muted-foreground/80">{hint}</span>
    </div>
  );
}

function ActivityRow({ group }: { group: PrActivityBudgetGroup }) {
  const [open, setOpen] = useState(false);
  const style = HEALTH_STYLES[group.status];
  const { Icon } = style;

  return (
    <div className={`rounded-xl border bg-background transition-colors ${style.ring}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full p-2.5 sm:px-4 text-left flex flex-wrap items-center justify-between gap-2.5 cursor-pointer hover:bg-muted/20 rounded-xl transition-colors"
      >
        {/* Left Side: Activity Name + AI Badge + Budget Head */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-extrabold text-xs text-foreground truncate">{group.activityName}</span>
          <MatchBadge group={group} />
          {!group.isMiscellaneous && (
            <span className="text-[11px] text-muted-foreground truncate">
              · <span className="opacity-70">Budget head:</span>{' '}
              <span className="font-semibold text-foreground/80">{group.categoryName}</span>
            </span>
          )}
        </div>

        {/* Right Side: Single-Line Numbers (Allocated | Used | Remaining) & Status Pill */}
        <div className="flex items-center gap-3.5 shrink-0 text-xs flex-wrap">
          {!group.isMiscellaneous ? (
            <div className="flex items-center gap-3 text-xs">
              <span title={`Allocated: ${formatCurrency(group.allocatedCost)}`}>
                <span className="text-[10px] text-muted-foreground uppercase font-bold mr-1">Allocated</span>
                <span className="font-extrabold text-foreground tabular-nums">{compactInr(group.allocatedCost)}</span>
              </span>
              <span className="text-border">|</span>
              <span title={`Used: ${formatCurrency(group.usedCost)}`}>
                <span className="text-[10px] text-muted-foreground uppercase font-bold mr-1">Used</span>
                <span className="font-extrabold text-sky-700 dark:text-sky-400 tabular-nums">{compactInr(group.usedCost)}</span>
              </span>
              <span className="text-border">|</span>
              <span title={`Remaining: ${formatCurrency(group.remainingCost)}`}>
                <span className="text-[10px] text-muted-foreground uppercase font-bold mr-1">Remaining</span>
                <span className={`font-extrabold tabular-nums ${group.remainingCost < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {compactInr(group.remainingCost)}
                </span>
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {group.lines.length} item{group.lines.length === 1 ? '' : 's'} · <span className="font-bold text-foreground">{compactInr(group.prImpactCost)}</span> unmapped
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-1">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${style.pill}`}>
              <Icon className="h-3 w-3" /> {style.label}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 p-2.5 space-y-1 rounded-b-xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-0.5">
            Items ({group.lines.length})
          </div>
          {group.lines.map((line, i) => (
            <div
              key={line.key || i}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5"
            >
              <span className="text-[11px] font-bold text-muted-foreground shrink-0">{i + 1}.</span>
              <span className="truncate text-xs font-semibold text-foreground">
                {line.item_description || 'Untitled item'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PrActivityBudgetCard({
  analysis,
  resolving = false,
  modelError = null,
  usedModel = false,
  onResolveVariance,
}: PrActivityBudgetCardProps) {
  const {
    totalAllocated,
    totalUsed,
    totalAvailable,
    mappedPrImpact,
    unmappedPrImpact,
    overallStatus,
    groups,
    miscellaneous,
    categoryCount,
  } = analysis;

  const overall = HEALTH_STYLES[overallStatus];
  const { Icon: OverallIcon } = overall;
  const isOver = overallStatus === 'over_budget';
  const nothingToShow = groups.length === 0 && !miscellaneous;

  // Summary triad reconciles exactly: Budget - Used = Remaining. This PR's own
  // cost is deliberately not a tile — it is shown per activity below, and as the
  // lighter segment on the bar, so the three headline numbers always add up.
  const usedPct = totalAllocated > 0 ? Math.min(100, (totalUsed / totalAllocated) * 100) : 0;
  const prPct =
    totalAllocated > 0
      ? Math.min(100 - usedPct, (mappedPrImpact / totalAllocated) * 100)
      : 0;
  const exceedsBy = mappedPrImpact - totalAvailable;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PieChart className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-extrabold tracking-tight text-foreground">
              Activity-Wise Budget
            </h3>
            <p className="text-[11px] font-medium text-muted-foreground">
              {resolving ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Matching activities to budget heads…
                </span>
              ) : nothingToShow ? (
                'Add items to see the budget for their activities'
              ) : (
                <>
                  {groups.length} activit{groups.length === 1 ? 'y' : 'ies'} across {categoryCount}{' '}
                  budget head{categoryCount === 1 ? '' : 's'} · Master Budget &amp; Variance
                  {usedModel ? ' · AI assisted' : ''}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${overall.pill}`}
          >
            <OverallIcon className="h-3.5 w-3.5" />
            {overallStatus === 'over_budget'
              ? 'Budget Overrun'
              : overallStatus === 'near_limit'
                ? 'Near Limit'
                : overallStatus === 'unmapped'
                  ? 'Not Mapped'
                  : 'Within Budget'}
          </span>
          {isOver && onResolveVariance && (
            <button
              type="button"
              onClick={onResolveVariance}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-700"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Resolve Variance
            </button>
          )}
        </div>
      </header>

      <div className="space-y-2 p-4 sm:p-5">
        {modelError && (
          <p className="flex items-start gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground mb-3">
            <HelpCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              AI activity mapping is unavailable, so only exact name matches were applied.
              Everything else is listed under Miscellaneous.
            </span>
          </p>
        )}

        {/* Activity breakdown — 1 line per activity */}
        {nothingToShow ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <PieChart className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground/50" />
            <p className="text-xs font-semibold text-muted-foreground">No items on this requisition yet</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/70">
              Budget is shown per activity once items are added.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <ActivityRow key={group.key} group={group} />
            ))}
            {miscellaneous && <ActivityRow key={miscellaneous.key} group={miscellaneous} />}
          </div>
        )}

        {/* Unmapped footnote */}
        {miscellaneous && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            <HelpCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-bold">{formatCurrency(unmappedPrImpact)}</span> sits under
              Miscellaneous and is not counted against any budget head. Set an activity that matches
              a Master Budget head to track it.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
