// ============================================================================
// PRAMUKH GROUP ERP V2 — WORK ORDER VARIATIONS
// File: frontend/src/lib/work-order-variations.ts
//
// A variation is the ONLY document permitted to change a live contract's value
// or scope. Stage 4's immutability guards refuse a direct edit of
// work_orders.total_amount, work_orders.ceiling_amount, and the quantity/rate
// on any work_order_lines row belonging to an issued or active Work Order.
//
// Approving a variation writes the new contract value, and the existing Phase 2
// trigger posts the commitment DELTA — positive for added scope, negative for
// omitted scope. No ledger arithmetic happens on this side.
// ============================================================================

import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function asDbError(error: { message?: string; code?: string; hint?: string | null } | null): Error {
  if (!error) return new Error('Unknown database error.');
  const message = error.message || 'The database rejected this change.';
  if (error.hint && (error.code === '22023' || error.code === '42501')) {
    return new Error(`${message} ${error.hint}`);
  }
  return new Error(message);
}

export type VariationStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

export type VariationLineRow = {
  id: string;
  variation_id: string;
  work_order_line_id: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  rate: number;
  line_total: number;
};

export type WorkOrderVariationRow = {
  id: string;
  project_id: string;
  work_order_id: string;
  variation_number: string;
  variation_date: string;
  reason: string;
  amount: number;
  contract_value_before: number | null;
  contract_value_after: number | null;
  status: VariationStatus;
  created_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  work_order_variation_lines?: VariationLineRow[];
};

/** Legal moves. Mirrors wov_transition_allowed(). */
const VARIATION_TRANSITIONS: Record<VariationStatus, VariationStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'draft', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  // Terminal: an approved variation has moved the contract and posted a
  // commitment delta. Reversing it is another variation, not an edit.
  approved: [],
  cancelled: [],
};

export function nextVariationStatuses(
  current: string | null | undefined,
  canApprove: boolean,
): VariationStatus[] {
  const key = (current ?? '').trim().toLowerCase() as VariationStatus;
  const options = VARIATION_TRANSITIONS[key] ?? [];
  return options.filter((next) => canApprove || (next !== 'approved' && next !== 'rejected'));
}

export const VARIATION_STATUS_LABELS: Record<VariationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const VARIATION_ACTION_LABELS: Record<VariationStatus, string> = {
  draft: 'Return to Draft',
  submitted: 'Submit for Approval',
  approved: 'Approve Variation',
  rejected: 'Reject',
  cancelled: 'Cancel',
};

export async function listWorkOrderVariations(
  workOrderId: string,
): Promise<WorkOrderVariationRow[]> {
  if (!isLiveSupabase() || !workOrderId) return [];

  const { data, error } = await supabase
    .from('work_order_variations')
    .select('*, work_order_variation_lines(*)')
    .eq('work_order_id', workOrderId)
    .order('variation_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw asDbError(error);
  return (data ?? []) as unknown as WorkOrderVariationRow[];
}

export type CreateVariationLineInput = {
  description: string;
  unit?: string;
  /** For a revision this is the NEW contracted quantity, not the delta. */
  quantity: number;
  rate: number;
  /** Set to revise an existing contracted line; omit to add a new one. */
  workOrderLineId?: string;
};

export type CreateVariationInput = {
  projectId: string;
  workOrderId: string;
  variationNumber: string;
  /** Signed: negative for omitted scope. */
  amount: number;
  reason: string;
  variationDate?: string;
  lines?: CreateVariationLineInput[];
};

/**
 * Raise a variation. Always created as draft — approving is a separate,
 * privileged act, and the database enforces segregation of duties so the
 * person who raised it cannot also approve it.
 */
export async function createWorkOrderVariation(
  input: CreateVariationInput,
): Promise<MutationResult<{ id: string }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!input.variationNumber?.trim()) throw new Error('A variation number is required.');
    if (!input.reason?.trim()) throw new Error('A reason is required — a variation changes a signed contract.');
    if (!input.amount || input.amount === 0) {
      throw new Error('The variation amount must be non-zero (negative for omitted scope).');
    }

    const dbProjectId = getDbSiteId(input.projectId);

    const { data, error } = await supabase
      .from('work_order_variations')
      .insert({
        project_id: dbProjectId,
        work_order_id: input.workOrderId,
        variation_number: input.variationNumber.trim(),
        variation_date: input.variationDate || new Date().toISOString().slice(0, 10),
        amount: input.amount,
        reason: input.reason.trim(),
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) throw asDbError(error);
    const variationId = (data as { id: string }).id;

    const lines = (input.lines ?? []).filter((line) => line.description.trim());
    if (lines.length > 0) {
      const rows = lines.map((line) => ({
        variation_id: variationId,
        project_id: dbProjectId,
        work_order_line_id: line.workOrderLineId || null,
        description: line.description.trim(),
        unit: line.unit || null,
        quantity: line.quantity ?? 0,
        rate: line.rate ?? 0,
      }));

      const { error: lineError } = await supabase
        .from('work_order_variation_lines')
        .insert(rows);

      if (lineError) {
        // A variation whose scope lines failed to save would apply a value
        // change with no matching scope — worse than not existing.
        await supabase.from('work_order_variations').delete().eq('id', variationId);
        throw asDbError(lineError);
      }
    }

    return { data: { id: variationId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Move a variation through its lifecycle. Approving applies it to the contract
 * and posts the commitment delta; the database refuses if the Work Order is no
 * longer live, or if the approver raised it.
 */
export async function setWorkOrderVariationStatus(
  variationId: string,
  status: VariationStatus,
  reason?: string,
): Promise<MutationResult<{ contractValue: number; revisionNo: number }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (status === 'rejected' && !reason?.trim()) {
      throw new Error('A rejection reason is mandatory.');
    }

    const { data, error } = await supabase.rpc('set_work_order_variation_status', {
      p_variation_id: variationId,
      p_status: status,
      p_reason: reason?.trim() || null,
    });

    if (error) throw asDbError(error);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        contractValue: Number(row.contract_value || 0),
        revisionNo: Number(row.revision_no || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
