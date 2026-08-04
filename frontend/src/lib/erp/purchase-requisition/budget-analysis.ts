// ============================================================================
// PRAMUKH GROUP ERP V2 — PR ACTIVITY-WISE BUDGET ENGINE
// File: frontend/src/lib/erp/purchase-requisition/budget-analysis.ts
//
// Computes, per ACTIVITY on the requisition, the budget drawn from that
// activity's Master Budget category — allocated (Master Budget), already used
// (Variance: committed POs + billed actuals), this PR's impact, and what remains.
//
// Replaces a word-overlap string matcher that was labelled "AI" in the UI but
// involved no model. Against the live 24-category Master Budget it scored 0.000
// for "Masonry / Brickwork" and 0.167 for "Excavation / Foundation" — both under
// its own 0.3 threshold — so real activities resolved to nothing.
//
// Two consequences of that old design are fixed here:
//
//   * Unmatched activities were skipped entirely, so a PR whose activities all
//     failed to match reported allocated = 0 and raised a false overrun. They
//     now land in an explicit Miscellaneous group.
//
//   * The skip was guarded by `prLines.length > 0`, so an empty PR fell through
//     and summed EVERY category — displaying the entire project budget
//     (INR 145.36 Cr on the live data) as though it were the PR's allocation.
//     Totals are now derived only from categories the PR actually touches.
//
// Category resolution is not this module's job — it arrives pre-resolved via
// ActivityResolutionMap (see activity-category-resolver.ts).
// ============================================================================

import type { MasterBudgetCategory } from '@/lib/budget';
import type { PrFormLine } from './types';
import {
  MISCELLANEOUS_ID,
  MISCELLANEOUS_LABEL,
  normalizeActivityKey,
  type ActivityMatchSource,
  type ActivityResolutionMap,
} from './activity-mapping';

export type BudgetHealth = 'within_budget' | 'near_limit' | 'over_budget' | 'unmapped';

/** One activity on the PR, with the budget of the category it maps to. */
export interface PrActivityBudgetGroup {
  /** Stable key for React and for expand/collapse state. */
  key: string;
  activityName: string;

  categoryId: string | null;
  categoryName: string;
  categoryCode: string | null;

  /** How the activity was mapped, and how much to trust it. */
  matchSource: ActivityMatchSource;
  matchConfidence: number;
  matchReason: string;
  isMiscellaneous: boolean;

  /** Master Budget allocation for the mapped category. */
  allocatedCost: number;
  /** Variance actuals — committed POs and billed amounts. */
  usedCost: number;
  /** allocated - used, before this PR. */
  availableCost: number;

  /** Cost of THIS activity's lines. */
  prImpactCost: number;
  /**
   * Cost of every line on this PR hitting the same category. When two
   * activities share a category, remaining must net off both — otherwise each
   * row would independently claim the same headroom.
   */
  categoryPrImpactCost: number;
  /** available - categoryPrImpact. */
  remainingCost: number;

  usedPercentage: number;
  prImpactPercentage: number;

  status: BudgetHealth;
  /** True when another activity on this PR maps to the same category. */
  sharesCategory: boolean;

  lines: PrFormLine[];
}

export interface PrBudgetAnalysisResult {
  totalAllocated: number;
  totalUsed: number;
  totalAvailable: number;
  /** Every line's cost, mapped or not. */
  totalPrImpact: number;
  /** Only the lines that mapped to a real budget category. */
  mappedPrImpact: number;
  /** Cost sitting in Miscellaneous — no budget backing it. */
  unmappedPrImpact: number;
  totalRemaining: number;
  overallStatus: BudgetHealth;

  groups: PrActivityBudgetGroup[];
  miscellaneous: PrActivityBudgetGroup | null;

  /** True once any line has no budget category. */
  hasUnmapped: boolean;
  /** Distinct categories this PR draws from. */
  categoryCount: number;
}

export const EMPTY_BUDGET_ANALYSIS: PrBudgetAnalysisResult = {
  totalAllocated: 0,
  totalUsed: 0,
  totalAvailable: 0,
  totalPrImpact: 0,
  mappedPrImpact: 0,
  unmappedPrImpact: 0,
  totalRemaining: 0,
  overallStatus: 'within_budget',
  groups: [],
  miscellaneous: null,
  hasUnmapped: false,
  categoryCount: 0,
};

/** Line cost, matching computeCostSummary's base (pre-tax) convention. */
export function lineCost(line: PrFormLine): number {
  return Number(line.pr_quantity || 0) * Number(line.estimated_rate || 0);
}

/** The activity a line belongs to, falling back through the same chain as the UI. */
export function lineActivity(line: PrFormLine): string {
  return (line.activity_name || line.work_activity || '').trim();
}

function healthFor(remaining: number, allocated: number): BudgetHealth {
  if (remaining < 0) return 'over_budget';
  if (allocated > 0 && remaining / allocated < 0.1) return 'near_limit';
  return 'within_budget';
}

/**
 * Build the activity-wise budget breakdown.
 *
 * `resolution` maps a normalised activity key to its Master Budget category.
 * Anything absent or unmapped is grouped under Miscellaneous rather than being
 * dropped, so the PR total always reconciles with the sum of the groups.
 */
export function analyzePrActivityBudgets(
  prLines: PrFormLine[],
  masterBudgetCategories: MasterBudgetCategory[],
  resolution: ActivityResolutionMap,
): PrBudgetAnalysisResult {
  if (prLines.length === 0) return EMPTY_BUDGET_ANALYSIS;

  const categoryById = new Map(masterBudgetCategories.map((c) => [c.id, c]));

  // --- Bucket lines by activity ------------------------------------------
  const byActivity = new Map<string, { activityName: string; lines: PrFormLine[] }>();
  const unmappedLines: PrFormLine[] = [];

  for (const line of prLines) {
    const activityName = lineActivity(line);
    if (!activityName) {
      unmappedLines.push(line);
      continue;
    }
    const key = normalizeActivityKey(activityName);
    const bucket = byActivity.get(key);
    if (bucket) bucket.lines.push(line);
    else byActivity.set(key, { activityName, lines: [line] });
  }

  // --- Resolve each activity, splitting off the unmapped ------------------
  interface Pending {
    key: string;
    activityName: string;
    lines: PrFormLine[];
    categoryId: string;
    category: MasterBudgetCategory;
    source: ActivityMatchSource;
    confidence: number;
    reason: string;
  }

  const pending: Pending[] = [];

  for (const [key, bucket] of byActivity) {
    const resolved = resolution.get(key);
    const category = resolved?.categoryId ? categoryById.get(resolved.categoryId) : undefined;

    if (!category) {
      unmappedLines.push(...bucket.lines);
      continue;
    }

    pending.push({
      key,
      activityName: bucket.activityName,
      lines: bucket.lines,
      categoryId: category.id,
      category,
      source: resolved?.source ?? 'exact',
      confidence: resolved?.confidence ?? 1,
      reason: resolved?.reasoning || `Mapped to "${category.categoryName}"`,
    });
  }

  // Total PR impact per category — needed so activities sharing a category do
  // not each claim the same headroom.
  const impactByCategory = new Map<string, number>();
  for (const entry of pending) {
    const cost = entry.lines.reduce((sum, l) => sum + lineCost(l), 0);
    impactByCategory.set(entry.categoryId, (impactByCategory.get(entry.categoryId) ?? 0) + cost);
  }

  const activitiesPerCategory = new Map<string, number>();
  for (const entry of pending) {
    activitiesPerCategory.set(
      entry.categoryId,
      (activitiesPerCategory.get(entry.categoryId) ?? 0) + 1,
    );
  }

  // --- Build the display groups -------------------------------------------
  const groups: PrActivityBudgetGroup[] = pending.map((entry) => {
    const cat = entry.category;

    const allocatedCost = cat.totalCost ?? cat.items.reduce((s, i) => s + (i.cost || 0), 0);
    // Committed (PO) and spent (billed) both consume the allocation. Take the
    // larger of the two per item rather than adding them: a bill raised against
    // a PO would otherwise be counted twice.
    const usedCost = Math.max(
      cat.totalCommitted ?? 0,
      cat.totalSpent ?? 0,
      cat.items.reduce((s, i) => s + Math.max(i.committedAmount || 0, i.spentAmount || 0), 0),
    );
    const availableCost = allocatedCost - usedCost;

    const prImpactCost = entry.lines.reduce((sum, l) => sum + lineCost(l), 0);
    const categoryPrImpactCost = impactByCategory.get(entry.categoryId) ?? prImpactCost;
    const remainingCost = availableCost - categoryPrImpactCost;

    return {
      key: entry.key,
      activityName: entry.activityName,
      categoryId: cat.id,
      categoryName: cat.categoryName,
      categoryCode: cat.categoryCode ?? null,
      matchSource: entry.source,
      matchConfidence: entry.confidence,
      matchReason: entry.reason,
      isMiscellaneous: false,
      allocatedCost,
      usedCost,
      availableCost,
      prImpactCost,
      categoryPrImpactCost,
      remainingCost,
      usedPercentage: allocatedCost > 0 ? (usedCost / allocatedCost) * 100 : 0,
      prImpactPercentage: allocatedCost > 0 ? (categoryPrImpactCost / allocatedCost) * 100 : 0,
      status: healthFor(remainingCost, allocatedCost),
      sharesCategory: (activitiesPerCategory.get(entry.categoryId) ?? 1) > 1,
      lines: entry.lines,
    };
  });

  groups.sort((a, b) => b.prImpactCost - a.prImpactCost);

  // --- Miscellaneous -------------------------------------------------------
  const unmappedPrImpact = unmappedLines.reduce((sum, l) => sum + lineCost(l), 0);
  const miscellaneous: PrActivityBudgetGroup | null =
    unmappedLines.length > 0
      ? {
          key: MISCELLANEOUS_ID,
          activityName: MISCELLANEOUS_LABEL,
          categoryId: null,
          categoryName: MISCELLANEOUS_LABEL,
          categoryCode: null,
          matchSource: 'miscellaneous',
          matchConfidence: 0,
          matchReason: 'No Master Budget category — map these to track them against a budget',
          isMiscellaneous: true,
          allocatedCost: 0,
          usedCost: 0,
          availableCost: 0,
          prImpactCost: unmappedPrImpact,
          categoryPrImpactCost: unmappedPrImpact,
          remainingCost: 0,
          usedPercentage: 0,
          prImpactPercentage: 0,
          status: 'unmapped',
          sharesCategory: false,
          lines: unmappedLines,
        }
      : null;

  // --- Totals --------------------------------------------------------------
  // Deduplicate by category: two activities sharing a category must not add its
  // allocation twice.
  const seenCategories = new Set<string>();
  let totalAllocated = 0;
  let totalUsed = 0;
  for (const g of groups) {
    if (!g.categoryId || seenCategories.has(g.categoryId)) continue;
    seenCategories.add(g.categoryId);
    totalAllocated += g.allocatedCost;
    totalUsed += g.usedCost;
  }

  const mappedPrImpact = groups.reduce((sum, g) => sum + g.prImpactCost, 0);
  const totalPrImpact = mappedPrImpact + unmappedPrImpact;
  const totalAvailable = totalAllocated - totalUsed;
  const totalRemaining = totalAvailable - mappedPrImpact;

  let overallStatus: BudgetHealth = 'within_budget';
  if (groups.some((g) => g.status === 'over_budget')) {
    overallStatus = 'over_budget';
  } else if (groups.length === 0 && unmappedLines.length > 0) {
    // Nothing is mapped: report that honestly instead of as an overrun.
    overallStatus = 'unmapped';
  } else if (groups.some((g) => g.status === 'near_limit')) {
    overallStatus = 'near_limit';
  }

  return {
    totalAllocated,
    totalUsed,
    totalAvailable,
    totalPrImpact,
    mappedPrImpact,
    unmappedPrImpact,
    totalRemaining,
    overallStatus,
    groups,
    miscellaneous,
    hasUnmapped: unmappedLines.length > 0,
    categoryCount: seenCategories.size,
  };
}
