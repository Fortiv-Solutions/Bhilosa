// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET MODULE SHARED TYPES
// File: frontend/src/lib/budget.ts
//
// Types only. All Budget data access lives in lib/supabase-budget.ts.
//
// History: this file previously also exported a 150-line
// SAMPLE_MASTER_BUDGET_CATEGORIES mock and a full query/mutation layer whose
// functions had zero callers and returned fabricated ids (`mock-${Date.now()}`)
// whenever Supabase was unconfigured. Both were removed — the mock because it was
// dead weight, the query layer because lib/supabase-budget.ts supersedes it with
// paginated reads and transactional RPC writes.
// ============================================================================

export type ScopeTag = 'building_rcc' | 'building_finishes' | 'site_infra' | 'total';

export type ItemType = 'material' | 'labour' | 'service' | 'equipment' | 'subcontract' | 'mixed';

export type WorkStatus = 'Not Started' | 'In Progress' | 'Completed' | string;

/** A single line of the Master Budget, enriched with committed + actual figures. */
export type MasterBudgetItem = {
  id: string;
  srNo: string | number;
  category: string;
  item: string;

  // Baseline
  qtyRcc?: number | null;
  qtyFinishes?: number | null;
  qtyInfra?: number | null;
  qtyTotal: number;
  unit: string;
  rate: number;
  cost: number;
  costPerBua?: number | null;
  scopeTag?: ScopeTag;
  itemType?: ItemType;

  /** budget_variance_items.id — the row a variance save must target. */
  varianceItemId?: string;

  // Committed (purchase orders)
  poQty?: number;
  poRate?: number;
  poAmount?: number;
  committedAmount?: number;

  // Actual (verified vendor bills)
  actualBillQty?: number;
  actualBillRate?: number;
  actualTotalCost?: number;
  spentAmount?: number;

  workStatus?: WorkStatus;
  remark?: string;
};

export type MasterBudgetCategory = {
  id: string;
  categoryName: string;
  categoryCode: string;
  items: MasterBudgetItem[];
  totalCost: number;
  totalCostPerBua: number;
  totalCommitted?: number;
  totalSpent?: number;
};

export type BudgetLedgerTransactionType =
  | 'allocation'
  | 'commitment'
  | 'release'
  | 'actual'
  | 'adjustment';

/**
 * A budget_ledger row.
 *
 * NOTE: transaction_type mirrors the public.erp_budget_txn_type enum exactly.
 * An earlier version of this type listed a 'committed' value that does not exist
 * in the database, which is what the broken PO trigger was written against.
 */
export type BudgetLedgerRow = {
  id: string;
  project_id: string;
  budget_allocation_id: string;
  category_id?: string | null;
  transaction_type: BudgetLedgerTransactionType;
  source_table: string | null;
  source_id: string | null;
  amount: number;
  description: string | null;
  posted_at: string;
  financial_year?: string | null;
};

export type BudgetAlertSeverity = 'info' | 'warning' | 'critical' | 'overrun';

/** Mirrors public.budget_config — one row per project. */
export type BudgetConfig = {
  caution_threshold_percent: number;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  hard_limit_percent: number;
  hard_limit_enforcement: 'block' | 'warn_only';
  require_justification_over_budget: boolean;
  current_fy: string;
  budget_lock_enabled: boolean;
  default_retention_percent: number;
  default_gst_percent: number;
};

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  caution_threshold_percent: 50,
  warning_threshold_percent: 75,
  critical_threshold_percent: 90,
  hard_limit_percent: 100,
  hard_limit_enforcement: 'block',
  require_justification_over_budget: true,
  current_fy: '2026-27',
  budget_lock_enabled: false,
  default_retention_percent: 5,
  default_gst_percent: 18,
};

/** Scope filter options for the Master Budget sheet. */
export const SCOPE_TAG_LABELS: Record<Exclude<ScopeTag, 'total'>, string> = {
  building_rcc: 'Building RCC Work',
  building_finishes: 'Building Finishes Work',
  site_infra: 'Site Infra Work',
};
