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
};

export type BudgetAllocationRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  budget_head_id: string;
  activity_id: string | null;
  vendor_id: string | null;
  allocation_name: string;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  warning_threshold_percent: number;
  hard_limit_percent: number;
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
  transaction_type: 'allocation' | 'commitment' | 'release' | 'actual' | 'adjustment';
  source_table: string | null;
  source_id: string | null;
  amount: number;
  description: string | null;
  posted_at: string;
  budget_allocations?: {
    allocation_name: string;
    budget_heads?: {
      code: string;
      name: string;
    } | null;
  } | null;
};

export type BudgetAlertRow = {
  id: string;
  project_id: string;
  budget_allocation_id: string | null;
  alert_type: string;
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

export type BudgetDashboardData = {
  summaries: BudgetSummaryRow[];
  allocations: BudgetAllocationRow[];
  ledger: BudgetLedgerRow[];
  alerts: BudgetAlertRow[];
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
};

export type ReviseBudgetAllocationInput = {
  allocationId: string;
  newAllocatedAmount: number;
  remarks: string;
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
