import type { MasterBudgetCategory } from './budget';
import { CENTRAL_PARK_MASTER_BUDGET_CATEGORIES } from './central-park-budget-data';

export interface Orbit3VarianceItem {
  id: string;
  srNo: string;
  parentGroup?: string;
  subGroup?: string;
  headActivity?: string;
  subActivity: string;
  workStatus?: string;
  unit: string;
  budgetQty: number;
  budgetRate: number;
  budgetCost: number;
  poQty?: number;
  poRate?: number;
  poAmount?: number;
  actualBillQty: number;
  actualBillRate: number;
  actualTotalCost: number;
  qtyVariation: number;
  rateVariation: number;
  balance: number;
  costVarianceAmount: number;
  costVariancePercent: number;
  remark: string;
}

export interface Orbit3VarianceCategory {
  id: string;
  categoryName: string;
  items: Orbit3VarianceItem[];
  totalBudgetCost: number;
  totalActualCost: number;
  totalBalance: number;
  totalVarianceAmount: number;
}

/**
 * Dynamically generates a production-grade Variance Analysis table dataset
 * from any MasterBudgetCategory[] (Central Park, Orbit 3, SkyRise, etc.)
 * preserving identical column structures and calculation rules across all projects.
 */
export function generateVarianceCategoriesFromMaster(
  masterCategories: MasterBudgetCategory[]
): Orbit3VarianceCategory[] {
  return masterCategories.map((cat, cIdx) => {
    const items: Orbit3VarianceItem[] = cat.items.map((item, iIdx) => {
      const budgetQty = item.qtyTotal || 1;
      const budgetRate = item.rate || 0;
      const budgetCost = item.cost || Math.round(budgetQty * budgetRate);

      // Deterministic actual bill factors for initial state:
      // Overruns on civil labour & cement to match real-life scenario, rest 85-95% completed
      let actualBillQty = budgetQty;
      let actualBillRate = budgetRate;
      let remark = 'Aligned with Master Baseline Budget schedule.';
      let workStatus = 'In Progress';

      const catLower = cat.categoryName.toLowerCase();
      const itemLower = item.item.toLowerCase();

      if (catLower.includes('labour') || itemLower.includes('labour')) {
        actualBillQty = Math.round(budgetQty * 1.022); // +2.2% scope expansion
        remark = 'RA Bill 14 shuttering area scope expansion on Slab 12.';
      } else if (catLower.includes('cement') || itemLower.includes('cement')) {
        actualBillRate = Math.round(budgetRate * 1.06); // +6% rate hike
        remark = 'UltraTech price hike per bag in regional Gujarat market.';
      } else if (catLower.includes('steel') || itemLower.includes('steel')) {
        actualBillRate = Math.round(budgetRate * 0.931); // -6.9% bulk discount
        remark = 'Steel Rebar bulk volume purchase discount.';
      } else {
        actualBillQty = Math.round(budgetQty * 0.85); // 85% execution
      }

      const actualTotalCost = Math.round(actualBillQty * actualBillRate);
      const qtyVariation = Number((actualBillQty - budgetQty).toFixed(2));
      const rateVariation = Number((actualBillRate - budgetRate).toFixed(2));
      const balance = Math.round(budgetCost - actualTotalCost);
      const costVarianceAmount = Math.round(actualTotalCost - budgetCost);
      const costVariancePercent = budgetCost > 0 ? Number(((costVarianceAmount / budgetCost) * 100).toFixed(2)) : 0;

      return {
        id: `var-${item.id || `${cIdx}-${iIdx}`}`,
        srNo: String(item.srNo),
        parentGroup: 'Construction Work',
        subGroup: cat.categoryName,
        headActivity: cat.categoryName,
        subActivity: item.item,
        workStatus: actualBillQty >= budgetQty ? 'Completed' : 'In Progress',
        unit: item.unit || 'LS',
        budgetQty,
        budgetRate,
        budgetCost,
        poQty: budgetQty,
        poRate: budgetRate,
        poAmount: budgetCost,
        actualBillQty,
        actualBillRate,
        actualTotalCost,
        qtyVariation,
        rateVariation,
        balance,
        costVarianceAmount,
        costVariancePercent,
        remark,
      };
    });

    const totalBudgetCost = Math.round(items.reduce((sum, i) => sum + i.budgetCost, 0));
    const totalActualCost = Math.round(items.reduce((sum, i) => sum + i.actualTotalCost, 0));
    const totalBalance = Math.round(items.reduce((sum, i) => sum + i.balance, 0));
    const totalVarianceAmount = Math.round(items.reduce((sum, i) => sum + i.costVarianceAmount, 0));

    return {
      id: `var-cat-${cat.id || cIdx + 1}`,
      categoryName: cat.categoryName,
      items,
      totalBudgetCost,
      totalActualCost,
      totalBalance,
      totalVarianceAmount,
    };
  });
}

/**
 * Default Variance Dataset generated directly from Central Park Master Budget Categories
 */
export const ORBIT3_VARIANCE_CATEGORIES: Orbit3VarianceCategory[] = generateVarianceCategoriesFromMaster(
  CENTRAL_PARK_MASTER_BUDGET_CATEGORIES
);
