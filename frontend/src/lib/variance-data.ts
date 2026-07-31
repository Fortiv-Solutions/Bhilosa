// ============================================================================
// PRAMUKH GROUP ERP V2 — VARIANCE RECONCILIATION DERIVATION
// File: frontend/src/lib/variance-data.ts
//
// Derives the Variance Analysis dataset from the live Master Budget.
//
// SIGN CONVENTION (used identically here, in the Overview dashboard, in the page
// header KPIs, and by the fn_compute_variance_item database trigger):
//
//     costVarianceAmount = budgetCost - actualTotalCost
//        > 0  under budget  (saving)
//        < 0  over budget   (overrun)
//
// The previous implementation clamped this with `rawDiff < 0 ? rawDiff : 0`, so
// savings were silently discarded and the sheet could only ever report overruns —
// while the Overview tab used the opposite, unclamped definition. Two tabs, two
// different answers for "variance". This module is now the single definition.
//
// DEFAULT_VARIANCE_CATEGORIES (a mock derived from the hardcoded Central Park
// seed) was removed; the Variance tab now renders live Supabase data or an
// explicit empty/error state.
// ============================================================================

import type { MasterBudgetCategory, WorkStatus } from './budget';

export interface VarianceItem {
  id: string;
  /** budget_variance_items.id — the row a save must target. */
  varianceItemId?: string;
  masterItemId: string;
  srNo: string;
  parentGroup?: string;
  subGroup?: string;
  headActivity?: string;
  subActivity: string;
  workStatus?: WorkStatus;
  unit: string;

  budgetQty: number;
  budgetRate: number;
  budgetCost: number;

  poQty: number;
  poRate: number;
  poAmount: number;

  actualBillQty: number;
  actualBillRate: number;
  actualTotalCost: number;

  qtyVariation: number;
  rateVariation: number;
  /** Unspent baseline. Floored at 0 — an overrun has no remaining balance. */
  balance: number;
  /** Signed: positive = saving, negative = overrun. */
  costVarianceAmount: number;
  /** Signed percentage of baseline. */
  costVariancePercent: number;
  remark: string;
}

export interface VarianceCategory {
  id: string;
  categoryName: string;
  items: VarianceItem[];
  totalBudgetCost: number;
  totalActualCost: number;
  totalCommittedCost: number;
  totalBalance: number;
  /** Signed net variance across the category. */
  totalVarianceAmount: number;
}

function round(value: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/**
 * Build the variance sheet from any MasterBudgetCategory[] (works for every
 * project, not just Central Park). Actuals and PO figures already come from
 * budget_variance_items via lib/supabase-budget.
 */
export function generateVarianceCategoriesFromMaster(
  masterCategories: MasterBudgetCategory[],
): VarianceCategory[] {
  return masterCategories.map((cat, cIdx) => {
    const items: VarianceItem[] = cat.items.map((item, iIdx) => {
      const budgetQty = item.qtyTotal || 0;
      const budgetRate = item.rate || 0;
      const budgetCost = item.cost ?? round(budgetQty * budgetRate);

      const actualBillQty = item.actualBillQty ?? 0;
      const actualBillRate = item.actualBillRate ?? 0;
      const actualTotalCost = item.actualTotalCost ?? round(actualBillQty * actualBillRate);

      const poQty = item.poQty ?? 0;
      const poRate = item.poRate ?? 0;
      const poAmount = item.poAmount ?? round(poQty * poRate);

      const costVarianceAmount = round(budgetCost - actualTotalCost);
      const costVariancePercent =
        budgetCost > 0 ? round((costVarianceAmount / budgetCost) * 100) : 0;

      return {
        id: item.id || `var-${cIdx}-${iIdx}`,
        varianceItemId: item.varianceItemId,
        masterItemId: item.id,
        srNo: String(item.srNo),
        parentGroup: 'Construction Work',
        subGroup: cat.categoryName,
        headActivity: cat.categoryName,
        subActivity: item.item,
        workStatus:
          item.workStatus ??
          (actualTotalCost <= 0
            ? 'Not Started'
            : actualBillQty >= budgetQty
              ? 'Completed'
              : 'In Progress'),
        unit: item.unit || 'LS',

        budgetQty,
        budgetRate,
        budgetCost,

        poQty,
        poRate,
        poAmount,

        actualBillQty,
        actualBillRate,
        actualTotalCost,

        qtyVariation: round(actualBillQty - budgetQty, 4),
        rateVariation: round(actualBillRate - budgetRate, 4),
        balance: Math.max(0, costVarianceAmount),
        costVarianceAmount,
        costVariancePercent,
        remark:
          item.remark ||
          (actualTotalCost > 0 ? 'Recorded from vendor bill' : 'Pending vendor bill entry'),
      };
    });

    return {
      id: cat.id || `var-cat-${cIdx}`,
      categoryName: cat.categoryName,
      items,
      totalBudgetCost: round(items.reduce((s, i) => s + i.budgetCost, 0)),
      totalActualCost: round(items.reduce((s, i) => s + i.actualTotalCost, 0)),
      totalCommittedCost: round(items.reduce((s, i) => s + i.poAmount, 0)),
      totalBalance: round(items.reduce((s, i) => s + i.balance, 0)),
      totalVarianceAmount: round(items.reduce((s, i) => s + i.costVarianceAmount, 0)),
    };
  });
}

/** Portfolio-level roll-up used by the Variance tab's TOTAL row. */
export function summariseVariance(categories: VarianceCategory[]) {
  const items = categories.flatMap((c) => c.items);
  const totalBudgetCost = round(categories.reduce((s, c) => s + c.totalBudgetCost, 0));
  const totalActualCost = round(categories.reduce((s, c) => s + c.totalActualCost, 0));
  const totalCommittedCost = round(categories.reduce((s, c) => s + c.totalCommittedCost, 0));
  const totalVarianceAmount = round(totalBudgetCost - totalActualCost);

  return {
    itemCount: items.length,
    totalBudgetCost,
    totalActualCost,
    totalCommittedCost,
    totalBalance: round(categories.reduce((s, c) => s + c.totalBalance, 0)),
    totalQtyVariation: round(items.reduce((s, i) => s + i.qtyVariation, 0), 4),
    totalRateVariation: round(items.reduce((s, i) => s + i.rateVariation, 0), 4),
    totalVarianceAmount,
    totalVariancePercent:
      totalBudgetCost > 0 ? round((totalVarianceAmount / totalBudgetCost) * 100) : 0,
    overrunCount: items.filter((i) => i.costVarianceAmount < 0).length,
    savingCount: items.filter((i) => i.costVarianceAmount > 0 && i.actualTotalCost > 0).length,
    /** Rupee value of overruns only (for risk reporting). */
    overrunAmount: round(
      items
        .filter((i) => i.costVarianceAmount < 0)
        .reduce((s, i) => s + Math.abs(i.costVarianceAmount), 0),
    ),
    savingAmount: round(
      items
        .filter((i) => i.costVarianceAmount > 0 && i.actualTotalCost > 0)
        .reduce((s, i) => s + i.costVarianceAmount, 0),
    ),
  };
}
