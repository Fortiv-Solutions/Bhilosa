// ============================================================================
// PRAMUKH GROUP ERP V2 — PURCHASE BILL -> VARIANCE SHEET
// File: frontend/src/lib/bill-variance.ts
//
// Approving a Purchase Bill posts it to the Variance Sheet by itself, one row
// per activity, via trg_vendor_bill_variance_post. Nothing here triggers that —
// this is the read model that shows WHERE a bill landed, plus a repost for
// bills approved before the automation existed.
//
// The mapping the database performs:
//     vendor_bill_lines.activity_name     -> budget_variance_items.category_name
//     vendor_bill_lines.sub_activity_name -> budget_variance_items.sub_activity
//
// Posting replaces its own prior bookings and refolds the actuals, so calling
// repost twice is the same as calling it once. A line whose activity resolves
// to nothing becomes a pending variance_mapping_request rather than vanishing.
// ============================================================================

import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function asDbError(error: { message?: string; hint?: string | null } | null): Error {
  if (!error) return new Error('Unknown database error.');
  const message = error.message || 'The database rejected this change.';
  return new Error(error.hint ? `${message} ${error.hint}` : message);
}

/**
 * The automation is newer than the rest of the bill desk, so an environment
 * that has not applied it must read as "not posted", not as an error banner on
 * the bill drawer.
 */
function isMissingRoutine(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42883' ||
    error.code === '42P01' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    /rpc_bill_variance_position|rpc_repost_bill_variance|does not exist|schema cache/i.test(
      error.message ?? '',
    )
  );
}

/** One line of a bill's breakdown, as recorded in source_lines. */
export type BillVarianceSourceLine = {
  vendor_bill_line_id: string | null;
  sr_no: number | null;
  description: string | null;
  item_code: string | null;
  activity_name: string | null;
  sub_activity_name: string | null;
  quantity: number;
  rate: number;
  gross_amount: number;
  credit_amount: number;
  debit_amount: number;
};

/** Where one bill landed on the variance sheet, per budget row. */
export type BillVariancePosition = {
  varianceItemId: string;
  categoryName: string | null;
  subActivity: string | null;
  bookedQty: number;
  bookedRate: number;
  bookedAmount: number;
  /** 'auto' = posted by approval; 'manual' = booked by hand in the drawer. */
  bookingMode: 'auto' | 'manual';
  sourceLineCount: number;
  sourceLines: BillVarianceSourceLine[];
  budgetCost: number;
  actualTotalCost: number;
  /** Positive = under budget, negative = overrun. */
  costVarianceAmount: number;
};

function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toSourceLines(raw: unknown): BillVarianceSourceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      vendor_bill_line_id: (row.vendor_bill_line_id as string) ?? null,
      sr_no: row.sr_no == null ? null : Number(row.sr_no),
      description: (row.description as string) ?? null,
      item_code: (row.item_code as string) ?? null,
      activity_name: (row.activity_name as string) ?? null,
      sub_activity_name: (row.sub_activity_name as string) ?? null,
      quantity: toNum(row.quantity),
      rate: toNum(row.rate),
      gross_amount: toNum(row.gross_amount),
      credit_amount: toNum(row.credit_amount),
      debit_amount: toNum(row.debit_amount),
    };
  });
}

/**
 * Every variance row this bill has been booked to, with the lines behind each.
 * Empty for a bill that is not yet approved — posting happens at approval.
 */
export async function getBillVariancePosition(
  billId: string,
): Promise<BillVariancePosition[]> {
  if (!isLiveSupabase() || !billId) return [];

  const { data, error } = await supabase.rpc('rpc_bill_variance_position', {
    p_bill_id: billId,
  });

  if (error) {
    if (isMissingRoutine(error)) return [];
    throw asDbError(error);
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    varianceItemId: row.variance_item_id as string,
    categoryName: (row.category_name as string) ?? null,
    subActivity: (row.sub_activity as string) ?? null,
    bookedQty: toNum(row.booked_qty),
    bookedRate: toNum(row.booked_rate),
    bookedAmount: toNum(row.booked_amount),
    bookingMode: (row.booking_mode as 'auto' | 'manual') ?? 'auto',
    sourceLineCount: Number(row.source_line_count ?? 0),
    sourceLines: toSourceLines(row.source_lines),
    budgetCost: toNum(row.budget_cost),
    actualTotalCost: toNum(row.actual_total_cost),
    costVarianceAmount: toNum(row.cost_variance_amount),
  }));
}

export type RepostResult = {
  billId: string;
  billNumber: string | null;
  posted: boolean;
  varianceRows: number;
  /** Lines whose activity matched no variance row; raised as pending requests. */
  unmappedLines: number;
  bookedAmount: number;
  /**
   * The Restatement raised in the Budget Changes register, or null when the
   * posting moved no figure — a repost that changes nothing raises no document.
   */
  revisionId: string | null;
  /** Budget rows the restatement covers. */
  movementLines: number;
  /** Change in recorded actual cost across those rows. */
  netDiffAmount: number;
};

/**
 * Re-derive this bill's variance bookings from its current lines.
 *
 * Safe to call repeatedly: the database deletes its own prior automatic
 * bookings and refolds the actuals, so the result converges rather than
 * accumulating. Intended for bills approved before the automation shipped, and
 * for re-running a bill after its unmapped activities have been mapped.
 */
export async function repostBillVariance(billId: string): Promise<MutationResult<RepostResult>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!billId) throw new Error('No purchase bill selected.');

    const { data, error } = await supabase.rpc('rpc_repost_bill_variance', {
      p_bill_id: billId,
    });
    if (error) throw asDbError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        billId: (row.bill_id as string) ?? billId,
        billNumber: (row.bill_number as string) ?? null,
        posted: Boolean(row.posted),
        varianceRows: Number(row.variance_rows ?? 0),
        unmappedLines: Number(row.unmapped_lines ?? 0),
        bookedAmount: toNum(row.booked_amount),
        revisionId: (row.revision_id as string) ?? null,
        movementLines: Number(row.movement_lines ?? 0),
        netDiffAmount: toNum(row.net_diff_amount),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Total booked to the variance sheet across the rows a bill touched. */
export function rollUpBillVariance(rows: BillVariancePosition[]) {
  return {
    rows: rows.length,
    bookedAmount: rows.reduce((sum, r) => sum + r.bookedAmount, 0),
    budgetCost: rows.reduce((sum, r) => sum + r.budgetCost, 0),
    // Negative = the booked rows are collectively over budget.
    costVariance: rows.reduce((sum, r) => sum + r.costVarianceAmount, 0),
    autoRows: rows.filter((r) => r.bookingMode === 'auto').length,
  };
}
