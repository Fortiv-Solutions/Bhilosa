import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { getDbSiteId, supabase } from '@/utils/supabase-client';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

export type BudgetSummaryRow = {
  project_id: string;
  project_code?: string | null;
  project_name: string;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  remaining_amount: number;
  utilization_percent?: number;
  overrun_amount?: number;
};

export type ScopeTag = 'building_rcc' | 'building_finishes' | 'site_infra' | 'total';

export type MasterBudgetItem = {
  id: string;
  srNo: string | number;
  category: string;
  item: string;
  qtyRcc?: number | null;
  qtyFinishes?: number | null;
  qtyInfra?: number | null;
  qtyTotal: number;
  unit: string;
  rate: number;
  cost: number;
  costPerBua?: number | null;
  committedAmount?: number;
  spentAmount?: number;
  itemType?: 'material' | 'labour' | 'service' | 'mixed';
  scopeTag?: ScopeTag;
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

export type BudgetAllocationRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  phase_id?: string | null;
  budget_head_id: string;
  activity_id: string | null;
  vendor_id: string | null;
  allocation_name: string;
  category_name?: string;
  scope_tag?: ScopeTag;
  unit?: string;
  rate?: number;
  qty_total?: number;
  cost_per_bua?: number;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  advance_amount?: number;
  retention_held?: number;
  warning_threshold_percent: number;
  hard_limit_percent: number;
  financial_year?: string;
  status: string;
  created_at: string;
  updated_at: string;
  budget_heads?: {
    code: string;
    name: string;
    cost_codes?: {
      code: string;
      name: string;
    } | null;
  } | null;
  project_sites?: {
    name: string;
  } | null;
  construction_activities?: {
    title: string;
  } | null;
  vendors?: {
    display_name: string | null;
    legal_name: string;
  } | null;
};

export type BudgetLedgerRow = {
  id: string;
  project_id: string;
  budget_allocation_id: string;
  transaction_type: 'allocation' | 'commitment' | 'release' | 'actual' | 'adjustment' | 'advance' | 'retention_hold' | 'retention_release';
  source_table: string | null;
  source_id: string | null;
  amount: number;
  description: string | null;
  posted_at: string;
  financial_year?: string;
  budget_allocations?: {
    allocation_name: string;
    budget_heads?: {
      code: string;
      name: string;
    } | null;
  } | null;
};

export type BudgetAlertSeverity = 'info' | 'warning' | 'critical' | 'overrun';

export type BudgetAlertRow = {
  id: string;
  project_id: string;
  budget_allocation_id: string | null;
  alert_type: string;
  severity?: BudgetAlertSeverity;
  threshold_percent: number | null;
  actual_percent: number | null;
  message: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
  budget_allocations?: {
    allocation_name: string;
  } | null;
};

export type BudgetRevisionRow = {
  id: string;
  project_id: string;
  budget_allocation_id: string;
  revision_number: number;
  revision_type: 'increase' | 'decrease' | 'reallocation';
  original_amount: number;
  revised_amount: number;
  delta_amount: number;
  reason: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  created_at: string;
  budget_allocations?: {
    allocation_name: string;
  } | null;
};

export type BudgetConfig = {
  caution_threshold_percent: number;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  hard_limit_percent: number;
  hard_limit_enforcement: 'block' | 'warn_only';
  require_justification_over_budget: boolean;
  current_fy: string;
  budget_lock_enabled: boolean;
};

export type BudgetDashboardData = {
  summaries: BudgetSummaryRow[];
  allocations: BudgetAllocationRow[];
  ledger: BudgetLedgerRow[];
  alerts: BudgetAlertRow[];
  revisions?: BudgetRevisionRow[];
  categories?: MasterBudgetCategory[];
};

export type CreateBudgetAllocationInput = {
  projectId: string;
  allocationName: string;
  allocatedAmount: number;
  budgetHeadName: string;
  budgetHeadCode?: string;
  costCode?: string;
  costCodeName?: string;
  warningThresholdPercent: number;
  hardLimitPercent: number;
  status: 'draft' | 'approved';
  scopeTag?: ScopeTag;
  unit?: string;
  rate?: number;
  qtyTotal?: number;
};

export type ReviseBudgetAllocationInput = {
  allocationId: string;
  newAllocatedAmount: number;
  remarks: string;
  revisionType?: 'increase' | 'decrease' | 'reallocation';
};

const allocationSelect = `
  *,
  budget_heads(code, name, cost_codes(code, name)),
  project_sites(name),
  construction_activities(title),
  vendors(display_name, legal_name)
`;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function projectFilter<T extends { eq: (column: string, value: string) => T }>(query: T, projectId?: string) {
  return projectId ? query.eq('project_id', getDbSiteId(projectId)) : query;
}

async function rpcAction<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listBudgetDashboard(projectId?: string): Promise<BudgetDashboardData> {
  if (!isLiveSupabase()) {
    return { summaries: [], allocations: [], ledger: [], alerts: [] };
  }

  const [summaries, allocations, ledger, alerts] = await Promise.all([
    projectFilter(
      supabase
        .from('portfolio_budget_summary')
        .select('*')
        .order('project_name', { ascending: true }),
      projectId,
    ),
    listBudgetAllocations(projectId),
    listBudgetLedger(projectId),
    listBudgetAlerts(projectId),
  ]);

  if ('error' in summaries && summaries.error) throw new Error(summaries.error.message);

  return {
    summaries: (summaries.data ?? []) as BudgetSummaryRow[],
    allocations,
    ledger,
    alerts,
  };
}

export async function listBudgetAllocations(projectId?: string): Promise<BudgetAllocationRow[]> {
  if (!isLiveSupabase()) return [];

  const response = await projectFilter(
    supabase
      .from('budget_allocations')
      .select(allocationSelect)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(200),
    projectId,
  );

  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []) as BudgetAllocationRow[];
}

export async function listBudgetLedger(projectId?: string, allocationId?: string): Promise<BudgetLedgerRow[]> {
  if (!isLiveSupabase()) return [];

  let query = projectFilter(
    supabase
      .from('budget_ledger')
      .select('*, budget_allocations(allocation_name, budget_heads(code, name))')
      .order('posted_at', { ascending: false })
      .limit(200),
    projectId,
  );

  if (allocationId) query = query.eq('budget_allocation_id', allocationId);
  const response = await query;
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []) as BudgetLedgerRow[];
}

export async function listBudgetAlerts(projectId?: string): Promise<BudgetAlertRow[]> {
  if (!isLiveSupabase()) return [];

  const response = await projectFilter(
    supabase
      .from('budget_alerts')
      .select('*, budget_allocations(allocation_name)')
      .order('created_at', { ascending: false })
      .limit(100),
    projectId,
  );

  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []) as BudgetAlertRow[];
}

export async function createBudgetAllocation(input: CreateBudgetAllocationInput): Promise<MutationResult<{ allocationId: string }>> {
  if (!isLiveSupabase()) return { data: { allocationId: `mock-${Date.now()}` }, error: null };

  try {
    const data = await rpcAction<{ allocationId: string }>('create_budget_allocation', {
      p_project_id: getDbSiteId(input.projectId),
      p_allocation_name: input.allocationName,
      p_allocated_amount: input.allocatedAmount,
      p_budget_head_name: input.budgetHeadName,
      p_budget_head_code: input.budgetHeadCode || null,
      p_cost_code: input.costCode || null,
      p_cost_code_name: input.costCodeName || null,
      p_warning_threshold_percent: input.warningThresholdPercent,
      p_hard_limit_percent: input.hardLimitPercent,
      p_status: input.status,
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function reviseBudgetAllocation(input: ReviseBudgetAllocationInput): Promise<MutationResult> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    await rpcAction('revise_budget_allocation', {
      p_budget_allocation_id: input.allocationId,
      p_new_allocated_amount: input.newAllocatedAmount,
      p_remarks: input.remarks || null,
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function approveBudgetRevision(allocationId: string): Promise<MutationResult> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    await rpcAction('approve_budget_allocation', {
      p_budget_allocation_id: allocationId,
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function resolveBudgetAlert(alertId: string, status: 'approved' | 'rejected' | 'closed' = 'closed'): Promise<MutationResult> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    await rpcAction('resolve_budget_alert', {
      p_budget_alert_id: alertId,
      p_status: status,
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Master budget sheet dataset based on user's exact uploaded schedule */
export const SAMPLE_MASTER_BUDGET_CATEGORIES: MasterBudgetCategory[] = [
  {
    id: 'cat-1',
    categoryName: 'Site Development/Pre-Construction Work',
    categoryCode: 'SITE_DEV',
    totalCost: 7500000,
    totalCostPerBua: 12.2,
    totalCommitted: 1200000,
    totalSpent: 4800000,
    items: [
      { id: 'item-1-1', srNo: 1, category: 'Site Development/Pre-Construction Work', item: 'Temporary Site Barrication/Pre.Const. Work', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 500000, cost: 500000, costPerBua: 0.81, committedAmount: 50000, spentAmount: 450000, scopeTag: 'site_infra', itemType: 'service' },
      { id: 'item-1-2', srNo: 2, category: 'Site Development/Pre-Construction Work', item: 'Initial Site Development (Hoarding/Site Office/Leveling/Cleaning)', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 5500000, cost: 5500000, costPerBua: 8.94, committedAmount: 800000, spentAmount: 3800000, scopeTag: 'site_infra', itemType: 'service' },
      { id: 'item-1-3', srNo: 3, category: 'Site Development/Pre-Construction Work', item: 'GSB/Chaaru/Slag', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 1500000, cost: 1500000, costPerBua: 2.44, committedAmount: 350000, spentAmount: 550000, scopeTag: 'site_infra', itemType: 'material' },
    ],
  },
  {
    id: 'cat-2',
    categoryName: 'Excavation/Backfilling and D-Wall/Pile Work',
    categoryCode: 'EXCAVATION',
    totalCost: 18500000,
    totalCostPerBua: 30.08,
    totalCommitted: 2500000,
    totalSpent: 14200000,
    items: [
      { id: 'item-2-1', srNo: 1, category: 'Excavation/Backfilling and D-Wall/Pile Work', item: 'Excavation/Backfilling', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 4500000, cost: 4500000, costPerBua: 7.32, committedAmount: 500000, spentAmount: 3800000, scopeTag: 'site_infra', itemType: 'labour' },
      { id: 'item-2-2', srNo: 2, category: 'Excavation/Backfilling and D-Wall/Pile Work', item: 'JCB/Poclain (Labour)', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 3200000, cost: 3200000, costPerBua: 5.2, committedAmount: 400000, spentAmount: 2600000, scopeTag: 'site_infra', itemType: 'labour' },
      { id: 'item-2-3', srNo: 3, category: 'Excavation/Backfilling and D-Wall/Pile Work', item: 'De-Watering', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 1800000, cost: 1800000, costPerBua: 2.93, committedAmount: 200000, spentAmount: 1400000, scopeTag: 'site_infra', itemType: 'service' },
      { id: 'item-2-4', srNo: 4, category: 'Excavation/Backfilling and D-Wall/Pile Work', item: 'Diaphragm Wall', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 9000000, cost: 9000000, costPerBua: 14.63, committedAmount: 1400000, spentAmount: 6400000, scopeTag: 'site_infra', itemType: 'service' },
    ],
  },
  {
    id: 'cat-3',
    categoryName: 'Civil Works',
    categoryCode: 'CIVIL_WORKS',
    totalCost: 98400000,
    totalCostPerBua: 160.0,
    totalCommitted: 12000000,
    totalSpent: 72000000,
    items: [
      { id: 'item-3-1', srNo: 1, category: 'Civil Works', item: 'Civil Labour Cost', qtyRcc: 615000, qtyTotal: 615000, unit: 'Sqft', rate: 145, cost: 89175000, costPerBua: 145.0, committedAmount: 10000000, spentAmount: 68000000, scopeTag: 'building_rcc', itemType: 'labour' },
      { id: 'item-3-2', srNo: 2, category: 'Civil Works', item: 'Rate Difference - (1.5% of Civil Cost)', qtyRcc: 615000, qtyTotal: 615000, unit: 'Sqft', rate: 2.18, cost: 1337625, costPerBua: 2.18, committedAmount: 200000, spentAmount: 900000, scopeTag: 'building_rcc', itemType: 'mixed' },
      { id: 'item-3-3', srNo: 3, category: 'Civil Works', item: 'Above Terrace Elevation Cost', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 2500000, cost: 2500000, costPerBua: 4.07, committedAmount: 500000, spentAmount: 1500000, scopeTag: 'building_rcc', itemType: 'service' },
      { id: 'item-3-4', srNo: 4, category: 'Civil Works', item: 'Core Cutting Cost', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 850000, cost: 850000, costPerBua: 1.38, committedAmount: 100000, spentAmount: 600000, scopeTag: 'building_rcc', itemType: 'labour' },
      { id: 'item-3-5', srNo: 5, category: 'Civil Works', item: 'Expansion Sheet', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 1200000, cost: 1200000, costPerBua: 1.95, committedAmount: 300000, spentAmount: 700000, scopeTag: 'building_rcc', itemType: 'material' },
      { id: 'item-3-6', srNo: 6, category: 'Civil Works', item: 'Rebar Cost', qtyInfra: 1, qtyTotal: 1, unit: 'LS', rate: 3337375, cost: 3337375, costPerBua: 5.42, committedAmount: 900000, spentAmount: 300000, scopeTag: 'building_rcc', itemType: 'material' },
    ],
  },
  {
    id: 'cat-4',
    categoryName: 'Civil Materials',
    categoryCode: 'CIVIL_MAT',
    totalCost: 42500000,
    totalCostPerBua: 69.1,
    totalCommitted: 6500000,
    totalSpent: 31000000,
    items: [
      { id: 'item-4-1', srNo: 1, category: 'Civil Materials', item: 'Cement - (Flooring Work+ Toilets,Terrace,Water Tanks,Podium Water Proofing)', qtyFinishes: 46792, qtyTotal: 46792, unit: 'Bags', rate: 380, cost: 17780960, costPerBua: 28.91, committedAmount: 2500000, spentAmount: 13500000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-4-2', srNo: 2, category: 'Civil Materials', item: 'Sand - (Flooring Work+Toilets,Terrace,Water Tanks,Podium Water Proofing)', qtyFinishes: 14476, qtyTotal: 14476, unit: 'Ton', rate: 850, cost: 12304600, costPerBua: 20.01, committedAmount: 2000000, spentAmount: 9000000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-4-3', srNo: 3, category: 'Civil Materials', item: 'Metal 10mm & 20mm - (Terrace,Water Tanks,Podium Water Proofing)', qtyFinishes: 3192, qtyTotal: 3192, unit: 'Ton', rate: 720, cost: 2298240, costPerBua: 3.74, committedAmount: 400000, spentAmount: 1600000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-4-4', srNo: 4, category: 'Civil Materials', item: 'Bricks-Waterproofing - (Toilets,Terrace,Water Tanks,Podium Water Proofing)', qtyFinishes: 530606, qtyTotal: 530606, unit: 'Nos.', rate: 8, cost: 4244848, costPerBua: 6.9, committedAmount: 600000, spentAmount: 3200000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-4-5', srNo: 5, category: 'Civil Materials', item: 'Chemical Bag For Tiles Cladding (All Toilets,Wash Area, Kitchen Wall Dedo)', qtyFinishes: 14440, qtyTotal: 14440, unit: 'Nos.', rate: 210, cost: 3032400, costPerBua: 4.93, committedAmount: 500000, spentAmount: 2200000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-4-6', srNo: 6, category: 'Civil Materials', item: 'Chemical Bag for Tile Flooring (6\'X4\' Flooring and 32" X 64")', qtyFinishes: 12500, qtyTotal: 12500, unit: 'Nos.', rate: 225, cost: 2838952, costPerBua: 4.61, committedAmount: 500000, spentAmount: 1500000, scopeTag: 'building_finishes', itemType: 'material' },
    ],
  },
  {
    id: 'cat-5',
    categoryName: 'Waterproofing',
    categoryCode: 'WATERPROOFING',
    totalCost: 14800000,
    totalCostPerBua: 24.06,
    totalCommitted: 2100000,
    totalSpent: 9800000,
    items: [
      { id: 'item-5-1', srNo: 1, category: 'Waterproofing', item: 'Water Proofing Chemical PIDIFIN-90 Kg Set-(Flat-Toilet-Wash-Balcony)', qtyFinishes: 452, qtyTotal: 452, unit: 'Bags.', rate: 4200, cost: 1898400, costPerBua: 3.09, committedAmount: 300000, spentAmount: 1400000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-5-2', srNo: 2, category: 'Waterproofing', item: 'Water Proofing Terrace, UGWT & OHWT Chemical Labour + Material-(Base Coat)', qtyFinishes: 42406, qtyTotal: 42406, unit: 'Sqft', rate: 165, cost: 6996990, costPerBua: 11.38, committedAmount: 1000000, spentAmount: 4800000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-5-3', srNo: 3, category: 'Waterproofing', item: 'Water Proofing Basement Retaining Wall', qtyFinishes: 9500, qtyTotal: 9500, unit: 'Sqft', rate: 140, cost: 1330000, costPerBua: 2.16, committedAmount: 200000, spentAmount: 900000, scopeTag: 'building_finishes', itemType: 'service' },
      { id: 'item-5-4', srNo: 4, category: 'Waterproofing', item: 'GF. Floor Podium+1st Floor Water Proofing', qtyFinishes: 42900, qtyTotal: 42900, unit: 'Sqft', rate: 95, cost: 4075500, costPerBua: 6.63, committedAmount: 500000, spentAmount: 2400000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-5-5', srNo: 5, category: 'Waterproofing', item: 'Expansion Joint Treatment', qtyFinishes: 210, qtyTotal: 210, unit: 'Rmt', rate: 2376, cost: 499110, costPerBua: 0.81, committedAmount: 100000, spentAmount: 300000, scopeTag: 'building_finishes', itemType: 'service' },
    ],
  },
  {
    id: 'cat-6',
    categoryName: 'Texture & Colour Work',
    categoryCode: 'TEXTURE_COLOUR',
    totalCost: 26500000,
    totalCostPerBua: 43.09,
    totalCommitted: 3800000,
    totalSpent: 16200000,
    items: [
      { id: 'item-6-1', srNo: 1, category: 'Texture & Colour Work', item: 'Flat Internal Putty Work (Labour)', qtyFinishes: 713057, qtyTotal: 713057, unit: 'Sqft', rate: 14, cost: 9982798, costPerBua: 16.23, committedAmount: 1500000, spentAmount: 6800000, scopeTag: 'building_finishes', itemType: 'labour' },
      { id: 'item-6-2', srNo: 2, category: 'Texture & Colour Work', item: 'Common Passage & Staircase Wall Texture & Colour Work', qtyFinishes: 135785, qtyTotal: 135785, unit: 'Sqft', rate: 32, cost: 4345120, costPerBua: 7.07, committedAmount: 600000, spentAmount: 2600000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-6-3', srNo: 3, category: 'Texture & Colour Work', item: 'External Texture Colour + Primer (Labour + Material)', qtyFinishes: 434633, qtyTotal: 434633, unit: 'Sqft', rate: 28, cost: 12169724, costPerBua: 19.79, committedAmount: 1700000, spentAmount: 6800000, scopeTag: 'building_finishes', itemType: 'mixed' },
    ],
  },
  {
    id: 'cat-7',
    categoryName: 'Stone and Tiles Work Material',
    categoryCode: 'TILES_MATERIAL',
    totalCost: 38000000,
    totalCostPerBua: 61.79,
    totalCommitted: 5200000,
    totalSpent: 24500000,
    items: [
      { id: 'item-7-1', srNo: 1, category: 'Stone and Tiles Work Material', item: 'Flat Door/Window Frames, Kitchen Platform, Balcony Patta, Washbasin Shelf, Threshold - (Granite)', qtyFinishes: 102953, qtyTotal: 102953, unit: 'Sqft', rate: 135, cost: 13898655, costPerBua: 22.6, committedAmount: 2000000, spentAmount: 9500000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-7-2', srNo: 2, category: 'Stone and Tiles Work Material', item: 'Flooring Vestibule, Living Room, Kitchen & Dining Room - (6\' x 4\') Tiles', qtyFinishes: 130945, qtyTotal: 130945, unit: 'Sqft', rate: 92, cost: 12046940, costPerBua: 19.59, committedAmount: 1800000, spentAmount: 7800000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-7-3', srNo: 3, category: 'Stone and Tiles Work Material', item: 'Flooring All Bedroom (1,2,3 and 4) - 32" X 64" Tiles', qtyFinishes: 112893, qtyTotal: 112893, unit: 'Sqft', rate: 78, cost: 8805654, costPerBua: 14.32, committedAmount: 1000000, spentAmount: 5800000, scopeTag: 'building_finishes', itemType: 'material' },
      { id: 'item-7-4', srNo: 4, category: 'Stone and Tiles Work Material', item: 'Dado All Toilet, Wash Area & Kitchen - 2\' X 4\' Tiles', qtyFinishes: 298065, qtyTotal: 298065, unit: 'Sqft', rate: 45, cost: 13412925, costPerBua: 21.81, committedAmount: 400000, spentAmount: 1400000, scopeTag: 'building_finishes', itemType: 'material' },
    ],
  },
  {
    id: 'cat-8',
    categoryName: 'Electrical',
    categoryCode: 'ELECTRICAL',
    totalCost: 32000000,
    totalCostPerBua: 52.03,
    totalCommitted: 4500000,
    totalSpent: 19800000,
    items: [
      { id: 'item-8-1', srNo: 1, category: 'Electrical', item: 'Electrical Works Flat (Material + Labour)-3BHK', qtyFinishes: 102, qtyTotal: 102, unit: 'Nos.', rate: 125000, cost: 12750000, costPerBua: 20.73, committedAmount: 1800000, spentAmount: 8500000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-8-2', srNo: 2, category: 'Electrical', item: 'Electrical Works Flat (Material + Labour)-4BHK', qtyFinishes: 64, qtyTotal: 64, unit: 'Nos.', rate: 165000, cost: 10560000, costPerBua: 17.17, committedAmount: 1500000, spentAmount: 6200000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-8-3', srNo: 3, category: 'Electrical', item: 'D.G. Set', qtyInfra: 2, qtyTotal: 2, unit: 'Nos.', rate: 2200000, cost: 4400000, costPerBua: 7.15, committedAmount: 800000, spentAmount: 3200000, scopeTag: 'site_infra', itemType: 'material' },
      { id: 'item-8-4', srNo: 4, category: 'Electrical', item: 'LT Cables & Other Materials', qtyInfra: 600, qtyTotal: 600, unit: 'Rmt', rate: 7150, cost: 4290000, costPerBua: 6.98, committedAmount: 400000, spentAmount: 1900000, scopeTag: 'site_infra', itemType: 'material' },
    ],
  },
  {
    id: 'cat-9',
    categoryName: 'Plumbing',
    categoryCode: 'PLUMBING',
    totalCost: 28500000,
    totalCostPerBua: 46.34,
    totalCommitted: 3900000,
    totalSpent: 17500000,
    items: [
      { id: 'item-9-1', srNo: 1, category: 'Plumbing', item: 'CP & Sanitary Fittings (Material + Labour)-3BHK', qtyFinishes: 102, qtyTotal: 102, unit: 'Nos.', rate: 95000, cost: 9690000, costPerBua: 15.76, committedAmount: 1400000, spentAmount: 6500000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-9-2', srNo: 2, category: 'Plumbing', item: 'CP & Sanitary Fittings (Material + Labour)-4BHK', qtyFinishes: 64, qtyTotal: 64, unit: 'Nos.', rate: 125000, cost: 8000000, costPerBua: 13.01, committedAmount: 1200000, spentAmount: 5100000, scopeTag: 'building_finishes', itemType: 'mixed' },
      { id: 'item-9-3', srNo: 3, category: 'Plumbing', item: 'Plumbing Materials - Inside Flat and Vertical Lines Work', qtyRcc: 615000, qtyTotal: 615000, unit: 'Sqft', rate: 17.5, cost: 10762500, costPerBua: 17.5, committedAmount: 1300000, spentAmount: 5900000, scopeTag: 'building_finishes', itemType: 'material' },
    ],
  },
  {
    id: 'cat-10',
    categoryName: 'Elevators',
    categoryCode: 'ELEVATORS',
    totalCost: 36000000,
    totalCostPerBua: 58.54,
    totalCommitted: 6000000,
    totalSpent: 28000000,
    items: [
      { id: 'item-10-1', srNo: 1, category: 'Elevators', item: 'Lifts', qtyFinishes: 12, qtyTotal: 12, unit: 'Nos.', rate: 3000000, cost: 36000000, costPerBua: 58.54, committedAmount: 6000000, spentAmount: 28000000, scopeTag: 'building_finishes', itemType: 'material' },
    ],
  },
];
