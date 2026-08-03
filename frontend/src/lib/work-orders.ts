import { supabase } from '@/utils/supabase-client';
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
  billed_to_date: number;
  remaining_balance: number;
  has_scope_variance: boolean;
  variance_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

const WORK_ORDER_SELECT =
  '*, projects(name), project_sites(name), site_agencies(id, agency_name, trade_category), wo_templates(id, name, trade_category), construction_activities(id, title), vendor:vendors!work_orders_vendor_id_fkey(id, legal_name, display_name), contractor:vendors!work_orders_contractor_vendor_fkey(id, legal_name, display_name)';

export async function getWorkOrders(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase
    .from('work_orders')
    .select(WORK_ORDER_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (projectId) {
    query = query.eq('project_id', projectId);
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
    .select('id, work_order_number, scope_of_work, wo_status, total_amount, billed_to_date, remaining_balance, agency_id, site_agencies(agency_name)')
    .in('wo_status', ['issued', 'active'])
    .is('deleted_at', null)
    .order('work_order_number', { ascending: true });
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
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
  budgetAllocationId?: string;
  lines: CreateWorkOrderLineInput[];
};

/** Creates a Work Order in Draft status with its item lines. Agency is mandatory (no WO without an agency on record). */
export async function createWorkOrder(input: CreateWorkOrderInput): Promise<MutationResult<{ id: string }>> {
  try {
    if (!input.agencyId) throw new Error('Agency is mandatory for a Work Order.');
    if (!input.lines.length) throw new Error('A Work Order needs at least one item/service line.');

    const totalAmount = input.lines.reduce((sum, l) => sum + (l.totalAmount ?? (l.quantity ?? 0) * l.rate), 0);

    const { data: wo, error: woError } = await supabase
      .from('work_orders')
      .insert({
        project_id: input.projectId,
        site_id: input.siteId || null,
        agency_id: input.agencyId,
        activity_id: input.activityId || null,
        template_id: input.templateId || null,
        vendor_id: input.vendorId || null,
        budget_allocation_id: input.budgetAllocationId || null,
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
      project_id: input.projectId,
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

/** Approval step before a WO goes from Draft to Issued (same pattern as MR/PR/QC approval). */
export async function approveWorkOrder(workOrderId: string, approvedBy: string): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('work_orders')
      .update({
        status: 'approved',
        wo_status: 'issued',
        issue_date: new Date().toISOString().slice(0, 10),
        approved_by: approvedBy,
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
      .update({ status: 'rejected' })
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

/** @deprecated use createWorkOrder for the full mandatory-fields flow. Kept for callers that only need a raw insert. */
export async function addWorkOrder(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from('work_orders').insert(record).select().single();
  if (error) throw error;
  return data;
}
