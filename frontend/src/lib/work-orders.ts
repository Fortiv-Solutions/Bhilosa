import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export type WorkOrderLineRow = {
  id: string;
  work_order_id: string;
  description: string;
  quantity: number;
  unit: string | null;
  rate: number;
  total_amount: number;
  executed_quantity: number | null;
};

export type WorkOrderRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  agency_id: string | null;
  activity_id: string | null;
  vendor_id: string | null;
  contractor_id: string | null;
  budget_allocation_id: string | null;
  master_budget_item_id: string | null;
  template_id: string | null;
  work_order_number: string;
  scope_of_work: string;
  wo_type: 'fixed_scope' | 'rate_based';
  wo_status: 'draft' | 'issued' | 'active' | 'closed' | 'cancelled';
  status: string;
  issue_date: string | null;
  start_date: string | null;
  end_date: string | null;
  terms_and_conditions: string | null;
  total_amount: number;
  /** true when total_amount already includes GST — decides the bill drawdown basis. */
  tax_inclusive: boolean;
  /** Certified (approved/paid) billing only. */
  billed_to_date: number;
  /** Submitted/verified claims not yet certified. */
  claimed_to_date: number;
  remaining_balance: number;
  has_scope_variance: boolean;
  has_billing_overrun: boolean;
  variance_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

const WORK_ORDER_SELECT =
  '*, projects(name), project_sites(name), site_agencies(id, agency_name, trade_category), wo_templates(id, name, trade_category), construction_activities(id, title), budget_allocations(id, allocation_name, allocated_amount, committed_amount, spent_amount), master_budget_items(id, item_description, unit), vendor:vendors!work_orders_vendor_id_fkey(id, legal_name, display_name), contractor:vendors!work_orders_contractor_vendor_fkey(id, legal_name, display_name)';

export async function getWorkOrders(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase
    .from('work_orders')
    .select(WORK_ORDER_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (projectId) {
    query = query.eq('project_id', getDbSiteId(projectId));
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Work Orders a bill can legally be raised against — "No WO, no bill" means only issued/active WOs are billable. */
export async function getBillableWorkOrders(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase
    .from('work_orders')
    .select(
      'id, work_order_number, scope_of_work, wo_status, status, wo_type, total_amount, billed_to_date, claimed_to_date, ' +
        'remaining_balance, tax_inclusive, agency_id, vendor_id, contractor_id, activity_id, ' +
        'budget_allocation_id, master_budget_item_id, site_agencies(agency_name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (projectId) {
    query = query.eq('project_id', getDbSiteId(projectId));
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data as unknown as Record<string, unknown>[]) || []).filter(
    (wo) => wo.wo_status !== 'cancelled' && wo.status !== 'cancelled'
  );
}

export async function getWorkOrder(workOrderId: string) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase
    .from('work_orders')
    .select(`${WORK_ORDER_SELECT}, work_order_lines(*), service_bills(id, bill_number, bill_date, total_amount, status)`)
    .eq('id', workOrderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type CreateWorkOrderLineInput = {
  description: string;
  quantity?: number;
  unit?: string;
  rate: number;
  totalAmount?: number;
};

export type CreateWorkOrderInput = {
  projectId: string;
  siteId?: string;
  agencyId: string;
  activityId?: string;
  templateId?: string;
  workOrderNumber: string;
  scopeOfWork: string;
  woType: 'fixed_scope' | 'rate_based';
  issueDate?: string;
  termsAndConditions?: string;
  vendorId?: string;
  /**
   * Budget head this contract draws against. Not required to save a draft, but
   * the database blocks the Draft -> Issued transition without a resolvable head
   * unless budget_config.wo_unbudgeted_enforcement is 'allow_unbudgeted'.
   */
  budgetAllocationId?: string;
  /** Master Budget line; the allocation is resolved from it when not set directly. */
  masterBudgetItemId?: string;
  /** true when the line rates already include GST (the WO templates differ). */
  taxInclusive?: boolean;
  lines: CreateWorkOrderLineInput[];
};

/** Creates a Work Order in Draft status with its item lines. Agency is mandatory (no WO without an agency on record). */
export async function createWorkOrder(input: CreateWorkOrderInput): Promise<MutationResult<{ id: string }>> {
  try {
    if (!input.agencyId) throw new Error('Agency is mandatory for a Work Order.');
    if (!input.lines.length) throw new Error('A Work Order needs at least one item/service line.');

    const totalAmount = input.lines.reduce((sum, l) => sum + (l.totalAmount ?? (l.quantity ?? 0) * l.rate), 0);
    const dbProjectId = getDbSiteId(input.projectId);

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUuidOrNull = (val: string | null | undefined): string | null =>
      val && UUID_REGEX.test(val) ? val : null;

    const { data: wo, error: woError } = await supabase
      .from('work_orders')
      .insert({
        project_id: dbProjectId,
        site_id: toUuidOrNull(input.siteId),
        agency_id: input.agencyId,
        activity_id: toUuidOrNull(input.activityId),
        template_id: toUuidOrNull(input.templateId),
        vendor_id: toUuidOrNull(input.vendorId),
        budget_allocation_id: toUuidOrNull(input.budgetAllocationId),
        master_budget_item_id: toUuidOrNull(input.masterBudgetItemId),
        tax_inclusive: input.taxInclusive ?? false,
        work_order_number: input.workOrderNumber,
        scope_of_work: input.scopeOfWork,
        wo_type: input.woType,
        wo_status: 'draft',
        status: 'draft',
        issue_date: input.issueDate || null,
        terms_and_conditions: input.termsAndConditions || null,
        total_amount: totalAmount,
      })
      .select('id')
      .single();

    if (woError) throw new Error(woError.message);
    const workOrderId = (wo as { id: string }).id;

    const lineRows = input.lines.map((l) => ({
      work_order_id: workOrderId,
      project_id: dbProjectId,
      description: l.description,
      quantity: l.quantity ?? 0,
      unit: l.unit || null,
      rate: l.rate,
      total_amount: l.totalAmount ?? (l.quantity ?? 0) * l.rate,
    }));

    const { error: lineError } = await supabase.from('work_order_lines').insert(lineRows);
    if (lineError) throw new Error(lineError.message);

    return { data: { id: workOrderId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Draft -> submitted, awaiting the Draft->Issued approval step. */
export async function submitWorkOrderForApproval(workOrderId: string): Promise<MutationResult> {
  try {
    const { error } = await supabase.from('work_orders').update({ status: 'submitted' }).eq('id', workOrderId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** The signed-in user's profile id. profiles.id mirrors the auth user id. */
async function currentProfileId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Approval step before a WO goes from Draft to Issued.
 *
 * This is the moment the Work Order becomes an encumbrance: the database
 * resolves and freezes the budget head, enforces the configured hard limit, and
 * posts the 'commitment' ledger row. A failure here is a real business rule
 * (no budget head, or the head is over its limit) and its message is written to
 * be shown to the user verbatim.
 *
 * `approvedBy` is resolved from the session; it is a uuid FK to profiles, so a
 * placeholder string cannot be used.
 */
export async function approveWorkOrder(workOrderId: string, approvedBy?: string): Promise<MutationResult> {
  try {
    const profileId = approvedBy ?? (await currentProfileId());
    if (!profileId) {
      throw new Error('You must be signed in to approve a Work Order.');
    }

    const { error } = await supabase
      .from('work_orders')
      .update({
        status: 'approved',
        wo_status: 'issued',
        issue_date: new Date().toISOString().slice(0, 10),
        approved_by: profileId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', workOrderId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function rejectWorkOrder(workOrderId: string, remarks: string): Promise<MutationResult> {
  try {
    if (!remarks.trim()) throw new Error('Rejection reason is mandatory.');
    const { error } = await supabase
      .from('work_orders')
      // The reason was previously demanded and then discarded — there was no
      // column to hold it. work_orders.rejection_reason was added in
      // 20260805100200_work_order_budget_integration.sql.
      .update({ status: 'rejected', rejection_reason: remarks.trim() })
      .eq('id', workOrderId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Issued -> Active, once execution actually starts against this WO. */
export async function activateWorkOrder(workOrderId: string): Promise<MutationResult> {
  try {
    const { error } = await supabase.from('work_orders').update({ wo_status: 'active' }).eq('id', workOrderId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Active -> Closed. Callers should confirm remaining_balance is reconciled (zero, or a deliberate write-off) before closing. */
export async function closeWorkOrder(workOrderId: string): Promise<MutationResult> {
  try {
    const { error } = await supabase.from('work_orders').update({ wo_status: 'closed' }).eq('id', workOrderId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Directly update Work Order status (e.g. draft -> active / issued / closed). */
export async function updateWorkOrderStatus(
  workOrderId: string,
  newStatus: string
): Promise<MutationResult> {
  try {
    const payload: Record<string, unknown> = {
      wo_status: newStatus,
      status: newStatus === 'draft' ? 'draft' : newStatus === 'submitted' ? 'submitted' : 'approved',
    };
    if (newStatus === 'issued' || newStatus === 'active') {
      payload.issue_date = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase
      .from('work_orders')
      .update(payload)
      .eq('id', workOrderId);

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function updateExecutedQuantity(lineId: string, executedQuantity: number): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('work_order_lines')
      .update({ executed_quantity: executedQuantity })
      .eq('id', lineId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Budget integration
//
// A Work Order is an encumbrance: issuing one reserves budget. The database
// posts the commitment (see 20260805100200_work_order_budget_integration.sql);
// these helpers let the UI show the head, its headroom, and the resulting
// position without duplicating any of that arithmetic client-side.
// ---------------------------------------------------------------------------

export type BudgetHeadOption = {
  id: string;
  allocationName: string;
  categoryId: string | null;
  categoryName: string | null;
  allocatedAmount: number;
  committedAmount: number;
  spentAmount: number;
  /** allocated - committed - spent. Negative means the head is already overrun. */
  availableAmount: number;
  utilizationPercent: number;
};

/** Budget heads a Work Order can be issued against, with live headroom. */
export async function listBudgetHeads(projectId: string): Promise<BudgetHeadOption[]> {
  if (!isLiveSupabase() || !projectId) return [];

  const { data, error } = await supabase
    .from('budget_allocations')
    .select('id, allocation_name, category_id, allocated_amount, committed_amount, spent_amount, budget_categories(category_name)')
    .eq('project_id', getDbSiteId(projectId))
    .is('deleted_at', null)
    .order('allocation_name', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const allocated = Number(row.allocated_amount || 0);
    const committed = Number(row.committed_amount || 0);
    const spent = Number(row.spent_amount || 0);
    return {
      id: row.id as string,
      allocationName: (row.allocation_name as string) ?? '',
      categoryId: (row.category_id as string) ?? null,
      categoryName:
        (row as { budget_categories?: { category_name?: string } }).budget_categories?.category_name ?? null,
      allocatedAmount: allocated,
      committedAmount: committed,
      spentAmount: spent,
      availableAmount: allocated - committed - spent,
      utilizationPercent: allocated > 0 ? ((committed + spent) / allocated) * 100 : 0,
    };
  });
}

export type MasterBudgetLineOption = {
  id: string;
  srNo: string;
  description: string;
  unit: string;
  budgetedCost: number;
  categoryId: string | null;
  categoryName: string | null;
  itemType: string | null;
};

/**
 * Master Budget lines a Work Order can be booked against. Defaults to the
 * service-shaped item types, since a Work Order is a labour/subcontract
 * instrument — pass includeAllTypes for the rare mixed case.
 */
export async function listMasterBudgetLines(
  projectId: string,
  includeAllTypes = false,
): Promise<MasterBudgetLineOption[]> {
  if (!isLiveSupabase() || !projectId) return [];

  let query = supabase
    .from('master_budget_items')
    .select('id, sr_no, item_description, unit, budgeted_cost, category_id, category_name, item_type')
    .eq('project_id', getDbSiteId(projectId))
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (!includeAllTypes) {
    query = query.in('item_type', ['service', 'labour', 'subcontract', 'mixed']);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    srNo: String(row.sr_no ?? ''),
    description: (row.item_description as string) ?? '',
    unit: (row.unit as string) ?? 'LS',
    budgetedCost: Number(row.budgeted_cost || 0),
    categoryId: (row.category_id as string) ?? null,
    categoryName: (row.category_name as string) ?? null,
    itemType: (row.item_type as string) ?? null,
  }));
}

export type WorkOrderBudgetPosition = {
  workOrderId: string;
  workOrderNumber: string;
  woStatus: string;
  totalAmount: number;
  billedToDate: number;
  claimedToDate: number;
  remainingBalance: number;
  hasBillingOverrun: boolean;
  hasScopeVariance: boolean;
  taxInclusive: boolean;
  budgetAllocationId: string | null;
  allocationName: string | null;
  headAllocatedAmount: number;
  categoryName: string | null;
  masterBudgetItem: string | null;
  committedAmount: number;
  releasedAmount: number;
  openCommitment: number;
};

/**
 * Money position for one Work Order, read from work_order_budget_view.
 * Commitment figures come from budget_ledger, so there is no second counter that
 * can drift from the journal.
 */
export async function getWorkOrderBudget(workOrderId: string): Promise<WorkOrderBudgetPosition | null> {
  if (!isLiveSupabase() || !workOrderId) return null;

  const { data, error } = await supabase
    .from('work_order_budget_view')
    .select('*')
    .eq('work_order_id', workOrderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    workOrderId: data.work_order_id as string,
    workOrderNumber: (data.work_order_number as string) ?? '',
    woStatus: (data.wo_status as string) ?? 'draft',
    totalAmount: Number(data.total_amount || 0),
    billedToDate: Number(data.billed_to_date || 0),
    claimedToDate: Number(data.claimed_to_date || 0),
    remainingBalance: Number(data.remaining_balance || 0),
    hasBillingOverrun: Boolean(data.has_billing_overrun),
    hasScopeVariance: Boolean(data.has_scope_variance),
    taxInclusive: Boolean(data.tax_inclusive),
    budgetAllocationId: (data.budget_allocation_id as string) ?? null,
    allocationName: (data.allocation_name as string) ?? null,
    headAllocatedAmount: Number(data.head_allocated_amount || 0),
    categoryName: (data.category_name as string) ?? null,
    masterBudgetItem: (data.master_budget_item as string) ?? null,
    committedAmount: Number(data.committed_amount || 0),
    releasedAmount: Number(data.released_amount || 0),
    openCommitment: Number(data.open_commitment || 0),
  };
}

/**
 * Set or change the budget head on a Work Order that has not been issued yet.
 * After issue the head is frozen, because the ledger already references it.
 */
export async function updateWorkOrderBudgetHead(
  workOrderId: string,
  patch: { budgetAllocationId?: string | null; masterBudgetItemId?: string | null; taxInclusive?: boolean },
): Promise<MutationResult> {
  try {
    const payload: Record<string, unknown> = {};
    if (patch.budgetAllocationId !== undefined) payload.budget_allocation_id = patch.budgetAllocationId || null;
    if (patch.masterBudgetItemId !== undefined) payload.master_budget_item_id = patch.masterBudgetItemId || null;
    if (patch.taxInclusive !== undefined) payload.tax_inclusive = patch.taxInclusive;
    if (Object.keys(payload).length === 0) return { data: null, error: null };

    const { error } = await supabase
      .from('work_orders')
      .update(payload)
      .eq('id', workOrderId)
      .eq('wo_status', 'draft');

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Whether this project permits issuing a Work Order with no budget head.
 * Mirrors budget_config.wo_unbudgeted_enforcement so the form can require the
 * field up front instead of letting the database reject the issue action.
 */
export async function isBudgetHeadRequiredForIssue(projectId: string): Promise<boolean> {
  if (!isLiveSupabase() || !projectId) return true;

  const { data, error } = await supabase
    .from('budget_config')
    .select('wo_unbudgeted_enforcement')
    .eq('project_id', getDbSiteId(projectId))
    .maybeSingle();

  // Default to the strict reading: the database default is 'block', and a
  // missing config row means no explicit opt-out has been made.
  if (error || !data) return true;
  return (data.wo_unbudgeted_enforcement ?? 'block') === 'block';
}

/** @deprecated use createWorkOrder for the full mandatory-fields flow. Kept for callers that only need a raw insert. */
export async function addWorkOrder(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from('work_orders').insert(record).select().single();
  if (error) throw error;
  return data;
}
