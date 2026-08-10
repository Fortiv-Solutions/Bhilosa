// ============================================================================
// PRAMUKH GROUP ERP V2 — WORK ORDER SCHEDULE OF VALUES
// File: frontend/src/lib/wo-billable-items.ts
//
// The unit of claim. A Work Order is decomposed once into billable items, each
// with a scheduled value and an eligibility rule read off the contract terms;
// bills draw from them and progress is recorded against them.
//
// Grounded in the source documents:
//   * The 13 Work Orders bill four different ways — lump sum, stage
//     percentages, measured quantity, and activity-wise 100% completion. One
//     completion_percent field could serve only the first.
//   * The 149 Payment Certificates already carry a hand-typed "% of Work
//     Completed". It reads 1 on all 603 populated lines. Progress here is
//     derived from verified measurement, or claimed and then verified by a
//     DIFFERENT person — never free-typed.
//   * None of the 149 certificates references a Work Order at all. billable_
//     item_id on the bill line is the link that makes billed-vs-pending real.
// ============================================================================

import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function asDbError(error: { message?: string; code?: string; hint?: string | null } | null): Error {
  if (!error) return new Error('Unknown database error.');
  const message = error.message || 'The database rejected this change.';
  if (error.hint && (error.code === '22023' || error.code === '23514' || error.code === '42501')) {
    return new Error(`${message} ${error.hint}`);
  }
  return new Error(message);
}

export type BillableItemBasis = 'quantity' | 'stage_percent' | 'lump_sum' | 'milestone_event';

export type EligibilityRule =
  | 'on_measured_quantity'
  | 'on_full_line_completion'
  | 'on_full_wo_completion'
  | 'on_milestone_event';

export type BillableItemStatus =
  | 'not_started'
  | 'in_progress'
  | 'claimed'
  | 'verified'
  | 'rejected';

export const ELIGIBILITY_LABEL: Record<EligibilityRule, string> = {
  on_measured_quantity: 'Bill what is measured',
  on_full_line_completion: 'Activity must be 100% complete',
  on_full_wo_completion: 'Whole order must be complete',
  on_milestone_event: 'Milestone must be verified',
};

export const STATUS_LABEL: Record<BillableItemStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  claimed: 'Claimed',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** One row of wo_billing_position — the G703 column set for a unit of claim. */
export type BillingPosition = {
  billable_item_id: string;
  work_order_id: string;
  project_id: string;
  work_order_line_id: string | null;
  payment_stage_id: string | null;
  sequence_no: number;
  item_label: string;
  basis: BillableItemBasis;
  eligibility_rule: EligibilityRule;
  contracted_quantity: number | null;
  unit: string | null;
  rate: number | null;
  scheduled_value: number | null;
  stage_percent: number | null;
  allows_partial_billing: boolean;
  requires_qc_pass: boolean;
  depends_on_item_id: string | null;
  status: BillableItemStatus;
  claimed_at: string | null;
  claimed_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  work_order_number: string | null;
  wo_status: string | null;
  measured_quantity: number;
  certified_quantity: number;
  billed_value: number;
  percent_complete: number | null;
  balance_to_bill: number;
  claimable_quantity: number;
  /** NULL means it can be billed right now. Anything else is the reason it cannot. */
  blocking_reason: string | null;
};

export type BillableNowRow = {
  billable_item_id: string;
  sequence_no: number;
  item_label: string;
  unit: string | null;
  rate: number | null;
  claimable_quantity: number;
  claimable_value: number;
  percent_complete: number | null;
  status: BillableItemStatus;
};

export type ProgressEvent = {
  id: string;
  billable_item_id: string;
  event_type: 'progress' | 'completion_claim' | 'verification' | 'rejection';
  claimed_quantity: number | null;
  claimed_percent: number | null;
  measurement_sheet_id: string | null;
  note: string | null;
  actor_id: string;
  actor_name: string | null;
  created_at: string;
};

function toPosition(row: Record<string, unknown>): BillingPosition {
  return {
    billable_item_id: row.billable_item_id as string,
    work_order_id: row.work_order_id as string,
    project_id: row.project_id as string,
    work_order_line_id: (row.work_order_line_id as string) ?? null,
    payment_stage_id: (row.payment_stage_id as string) ?? null,
    sequence_no: Number(row.sequence_no ?? 0),
    item_label: (row.item_label as string) ?? '',
    basis: (row.basis as BillableItemBasis) ?? 'lump_sum',
    eligibility_rule: (row.eligibility_rule as EligibilityRule) ?? 'on_measured_quantity',
    contracted_quantity:
      row.contracted_quantity == null ? null : Number(row.contracted_quantity),
    unit: (row.unit as string) ?? null,
    rate: row.rate == null ? null : Number(row.rate),
    scheduled_value: row.scheduled_value == null ? null : Number(row.scheduled_value),
    stage_percent: row.stage_percent == null ? null : Number(row.stage_percent),
    allows_partial_billing: Boolean(row.allows_partial_billing),
    requires_qc_pass: Boolean(row.requires_qc_pass),
    depends_on_item_id: (row.depends_on_item_id as string) ?? null,
    status: (row.status as BillableItemStatus) ?? 'not_started',
    claimed_at: (row.claimed_at as string) ?? null,
    claimed_by: (row.claimed_by as string) ?? null,
    verified_at: (row.verified_at as string) ?? null,
    verified_by: (row.verified_by as string) ?? null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    work_order_number: (row.work_order_number as string) ?? null,
    wo_status: (row.wo_status as string) ?? null,
    measured_quantity: Number(row.measured_quantity ?? 0),
    certified_quantity: Number(row.certified_quantity ?? 0),
    billed_value: Number(row.billed_value ?? 0),
    percent_complete: row.percent_complete == null ? null : Number(row.percent_complete),
    balance_to_bill: Number(row.balance_to_bill ?? 0),
    claimable_quantity: Number(row.claimable_quantity ?? 0),
    blocking_reason: (row.blocking_reason as string) ?? null,
  };
}

/**
 * The schedule of values is a later migration than the rest of the module, so
 * an environment that has not applied it yet must read as "no schedule", not as
 * an error banner on the Work Order page.
 */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42P01 from Postgres; PGRST20x when PostgREST has not seen the relation.
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    /wo_billing_position|wo_billable_items|does not exist|schema cache/i.test(error.message ?? '')
  );
}

/** Every unit of claim on a Work Order, billable or not, with the reason why. */
export async function getBillingPosition(workOrderId: string): Promise<BillingPosition[]> {
  if (!isLiveSupabase() || !workOrderId) return [];

  const { data, error } = await supabase
    .from('wo_billing_position')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('sequence_no', { ascending: true });

  if (error) {
    if (isMissingRelation(error)) return [];
    throw asDbError(error);
  }
  return (data ?? []).map((r) => toPosition(r as Record<string, unknown>));
}

/**
 * Only what may go on a bill today, with quantity and value pre-computed. This
 * is what replaces the blank bill form — the source certificates hand-derived
 * their stage rates (20% x 31,900 = 6,380) and typed the result.
 */
export async function getBillableNow(workOrderId: string): Promise<BillableNowRow[]> {
  if (!isLiveSupabase() || !workOrderId) return [];

  const { data, error } = await supabase.rpc('rpc_wo_billable_now', {
    p_work_order_id: workOrderId,
  });

  if (error) {
    if (isMissingRelation(error)) return [];
    throw asDbError(error);
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    billable_item_id: row.billable_item_id as string,
    sequence_no: Number(row.sequence_no ?? 0),
    item_label: (row.item_label as string) ?? '',
    unit: (row.unit as string) ?? null,
    rate: row.rate == null ? null : Number(row.rate),
    claimable_quantity: Number(row.claimable_quantity ?? 0),
    claimable_value: Number(row.claimable_value ?? 0),
    percent_complete: row.percent_complete == null ? null : Number(row.percent_complete),
    status: (row.status as BillableItemStatus) ?? 'not_started',
  }));
}

/** The append-only trail behind one unit of claim. */
export async function getProgressEvents(billableItemId: string): Promise<ProgressEvent[]> {
  if (!isLiveSupabase() || !billableItemId) return [];

  const { data, error } = await supabase
    .from('wo_progress_events')
    .select('*, actor:profiles!wo_progress_events_actor_id_fkey(name)')
    .eq('billable_item_id', billableItemId)
    .order('created_at', { ascending: false });

  if (error) throw asDbError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    billable_item_id: row.billable_item_id as string,
    event_type: row.event_type as ProgressEvent['event_type'],
    claimed_quantity: row.claimed_quantity == null ? null : Number(row.claimed_quantity),
    claimed_percent: row.claimed_percent == null ? null : Number(row.claimed_percent),
    measurement_sheet_id: (row.measurement_sheet_id as string) ?? null,
    note: (row.note as string) ?? null,
    actor_id: row.actor_id as string,
    actor_name: ((row.actor as { name?: string } | null)?.name as string) ?? null,
    created_at: row.created_at as string,
  }));
}

/**
 * Decompose the contract into its schedule of values. Draft only — on a live
 * contract this is a variation. Refuses to run once progress or billing exists,
 * so history is never swept away.
 */
export async function generateBillableItems(workOrderId: string): Promise<MutationResult> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!workOrderId) throw new Error('No Work Order selected.');

    const { data, error } = await supabase.rpc('rpc_generate_wo_billable_items', {
      p_work_order_id: workOrderId,
    });
    if (error) throw asDbError(error);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Claim progress on a milestone. Measured scope does not use this: record a
 * measurement sheet and have it verified instead.
 */
export async function claimBillableItem(
  billableItemId: string,
  percent?: number,
  note?: string,
): Promise<MutationResult> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase.rpc('rpc_claim_billable_item', {
      p_item_id: billableItemId,
      p_percent: percent ?? null,
      p_note: note ?? null,
    });
    if (error) throw asDbError(error);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Verify or reject a milestone claim. The database refuses when the verifier is
 * the person who made the claim.
 */
export async function verifyBillableItem(
  billableItemId: string,
  approve: boolean,
  note?: string,
): Promise<MutationResult> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!approve && !note?.trim()) throw new Error('A rejection needs a reason.');

    const { data, error } = await supabase.rpc('rpc_verify_billable_item', {
      p_item_id: billableItemId,
      p_approve: approve,
      p_note: note ?? null,
    });
    if (error) throw asDbError(error);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Value-weighted completion across a Work Order, for the panel header. */
export function rollUpPosition(rows: BillingPosition[]) {
  const scheduled = rows.reduce((sum, r) => sum + (r.scheduled_value ?? 0), 0);
  const billed = rows.reduce((sum, r) => sum + r.billed_value, 0);
  const claimable = rows.reduce(
    (sum, r) => sum + (r.blocking_reason ? 0 : r.claimable_quantity * (r.rate ?? 0)),
    0,
  );
  // Weight by scheduled value where there is one; fall back to a plain mean so
  // an all-rate-based order still reports something meaningful.
  const weighted = rows.reduce(
    (sum, r) => sum + (r.scheduled_value ?? 0) * ((r.percent_complete ?? 0) / 100),
    0,
  );
  const measurable = rows.filter((r) => r.percent_complete != null);
  const percentComplete =
    scheduled > 0
      ? (weighted / scheduled) * 100
      : measurable.length > 0
        ? measurable.reduce((s, r) => s + (r.percent_complete ?? 0), 0) / measurable.length
        : 0;

  return {
    scheduled,
    billed,
    claimable,
    balance: Math.max(scheduled - billed, 0),
    percentComplete,
    billableCount: rows.filter((r) => !r.blocking_reason && r.claimable_quantity > 0).length,
    total: rows.length,
  };
}
