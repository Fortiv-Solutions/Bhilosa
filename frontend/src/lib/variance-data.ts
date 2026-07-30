import type { MasterBudgetCategory } from './budget';
import { CENTRAL_PARK_MASTER_BUDGET_CATEGORIES } from './central-park-budget-data';
import { supabase, CENTRAL_PARK_PROJECT_ID } from './supabase-budget';

export interface VarianceItem {
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

export interface VarianceCategory {
  id: string;
  categoryName: string;
  items: VarianceItem[];
  totalBudgetCost: number;
  totalActualCost: number;
  totalBalance: number;
  totalVarianceAmount: number;
}

/**
 * Dynamically generates a production-grade Variance Analysis table dataset
 * from any MasterBudgetCategory[] (Central Park, Commercial Tower, SkyRise, etc.)
 * preserving identical column structures and calculation rules across all projects.
 */
export function generateVarianceCategoriesFromMaster(
  masterCategories: MasterBudgetCategory[]
): VarianceCategory[] {
  return masterCategories.map((cat, cIdx) => {
    const items: VarianceItem[] = cat.items.map((item, iIdx) => {
      const budgetQty = item.qtyTotal || 1;
      const budgetRate = item.rate || 0;
      const budgetCost = item.cost || Math.round(budgetQty * budgetRate);

      // Actual bill state: defaults to 0 until vendor bills/RA bills are logged or edited
      const actualBillQty = item.actualBillQty ?? 0;
      const actualBillRate = item.actualBillRate ?? 0;
      const actualTotalCost = item.actualTotalCost ?? Math.round(actualBillQty * actualBillRate);
      const remark = item.remark || (actualTotalCost > 0 ? 'Recorded from Vendor Bill / RA Bill' : 'Pending vendor bill entry');
      const workStatus = actualTotalCost > 0 ? (actualBillQty >= budgetQty ? 'Completed' : 'In Progress') : 'Not Started';

      // Formula matching Excel screenshot:
      // 1. Balance = Math.max(0, budgetCost - actualTotalCost)
      // 2. Cost Variance Amount = Math.min(0, budgetCost - actualTotalCost) (negative when actual > budget, 0 otherwise)
      // 3. Cost Variance % = Math.abs(costVarianceAmount) / budgetCost * 100 (when overrun occurs)
      const balance = Math.max(0, Math.round(budgetCost - actualTotalCost));
      const rawDiff = Math.round(budgetCost - actualTotalCost);
      const costVarianceAmount = rawDiff < 0 ? rawDiff : 0;
      const costVariancePercent = (costVarianceAmount < 0 && budgetCost > 0)
        ? Number(((Math.abs(costVarianceAmount) / budgetCost) * 100).toFixed(2))
        : 0;
      const qtyVariation = actualBillQty > 0 ? Number((actualBillQty - budgetQty).toFixed(2)) : 0;
      const rateVariation = actualBillRate > 0 ? Number((actualBillRate - budgetRate).toFixed(2)) : 0;

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
        poQty: item.poQty ?? 0,
        poRate: item.poRate ?? 0,
        poAmount: item.poAmount ?? Math.round((item.poQty ?? 0) * (item.poRate ?? 0)),
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
      id: cat.id || `var-cat-${cIdx}`,
      categoryName: cat.categoryName,
      items,
      totalBudgetCost,
      totalActualCost,
      totalBalance,
      totalVarianceAmount,
    };
  });
}

export const DEFAULT_VARIANCE_CATEGORIES: VarianceCategory[] =
  generateVarianceCategoriesFromMaster(CENTRAL_PARK_MASTER_BUDGET_CATEGORIES);
