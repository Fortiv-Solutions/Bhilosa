// ============================================================================
// PRAMUKH GROUP ERP V2 — TREASURY: RELEASES, PAYMENTS, RETENTION
// File: frontend/src/lib/work-order-treasury.ts
//
// THE RULE THIS MODULE EXISTS TO PROTECT
// ======================================
// A release caps PAYMENT. It never caps CERTIFICATION.
//
// If the site engineer certifies Rs 25 L and treasury releases Rs 10 L, the
// budget recognises Rs 25 L of cost immediately — the work exists and so does
// the liability. Only the disbursement is throttled. Nothing here posts to
// budget_ledger; certification remains the sole cost-recognition event.
//
// Every cap (certified-only, net payable, authorised release) is enforced by
// database triggers, so these helpers are thin doors, not a second copy of the
// rules.
// ============================================================================

import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Guard messages name the amounts involved; they are written to be shown. */
function asDbError(error: { message?: string; code?: string; hint?: string | null } | null): Error {
  if (!error) return new Error('Unknown database error.');
  const message = error.message || 'The database rejected this change.';
  if (error.hint && (error.code === '22023' || error.code === '23514')) {
    return new Error(`${message} ${error.hint}`);
  }
  return new Error(message);
}

// ---------------------------------------------------------------------------
// The five financial indicators
// ---------------------------------------------------------------------------

export type WorkOrderFinancialPosition = {
  workOrderId: string;
  workOrderNumber: string | null;
  woStatus: string;
  /** 1. The contract envelope. */
  contractValue: number;
  /** 2. Certified gross — recognised project cost. */
  certifiedGross: number;
  claimedUncertified: number;
  /** 3. Net payable across certified bills, after retention/TDS/debit. */
  approvedNetPayable: number;
  /** 4. Treasury authorisation — the "release only Rs 10 L" decision. */
  authorisedRelease: number;
  /** 5. Cash actually disbursed. */
  cashPaid: number;
  /** contract − certified. Room for future RA bills. */
  remainingHeadroom: number;
  /** net payable − paid. What the contractor is still owed. */
  pendingLiability: number;
  unusedAuthorisation: number;
  retentionHeld: number;
  certifiedBillCount: number;
  hasBillingOverrun: boolean;
  hasScopeVariance: boolean;
};

/** One row from work_order_financial_position. */
export async function getWorkOrderFinancialPosition(
  workOrderId: string,
): Promise<WorkOrderFinancialPosition | null> {
  if (!isLiveSupabase() || !workOrderId) return null;

  const { data, error } = await supabase
    .from('work_order_financial_position')
    .select('*')
    .eq('work_order_id', workOrderId)
    .maybeSingle();

  if (error) throw asDbError(error);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const num = (key: string) => Number(row[key] || 0);

  return {
    workOrderId: row.work_order_id as string,
    workOrderNumber: (row.work_order_number as string) ?? null,
    woStatus: (row.wo_status as string) ?? 'draft',
    contractValue: num('contract_value'),
    certifiedGross: num('certified_gross'),
    claimedUncertified: num('claimed_uncertified'),
    approvedNetPayable: num('approved_net_payable'),
    authorisedRelease: num('authorised_release'),
    cashPaid: num('cash_paid'),
    remainingHeadroom: num('remaining_headroom'),
    pendingLiability: num('pending_liability'),
    unusedAuthorisation: num('unused_authorisation'),
    retentionHeld: num('retention_held'),
    certifiedBillCount: num('certified_bill_count'),
    hasBillingOverrun: Boolean(row.has_billing_overrun),
    hasScopeVariance: Boolean(row.has_scope_variance),
  };
}

// ---------------------------------------------------------------------------
// Release authorisation
// ---------------------------------------------------------------------------

export type WorkOrderReleaseStatus = 'draft' | 'approved' | 'cancelled';

export type WorkOrderReleaseRow = {
  id: string;
  work_order_id: string;
  release_number: string;
  release_date: string;
  amount: number;
  reason: string | null;
  status: WorkOrderReleaseStatus;
  approved_by: string | null;
  approved_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

export async function listWorkOrderReleases(workOrderId: string): Promise<WorkOrderReleaseRow[]> {
  if (!isLiveSupabase() || !workOrderId) return [];

  const { data, error } = await supabase
    .from('work_order_releases')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('release_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw asDbError(error);
  return (data ?? []) as unknown as WorkOrderReleaseRow[];
}

/**
 * Authorise cash against a Work Order — "release Rs 10 L of the Rs 1 Cr".
 * Created as draft unless the caller holds approval rights and asks for it.
 */
export async function createWorkOrderRelease(input: {
  projectId: string;
  workOrderId: string;
  releaseNumber: string;
  amount: number;
  releaseDate?: string;
  reason?: string;
  approveNow?: boolean;
}): Promise<MutationResult<{ id: string }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!input.releaseNumber?.trim()) throw new Error('A release number is required.');
    if (!(input.amount > 0)) throw new Error('The release amount must be greater than zero.');

    const { data, error } = await supabase
      .from('work_order_releases')
      .insert({
        project_id: getDbSiteId(input.projectId),
        work_order_id: input.workOrderId,
        release_number: input.releaseNumber.trim(),
        release_date: input.releaseDate || new Date().toISOString().slice(0, 10),
        amount: input.amount,
        reason: input.reason || null,
        status: input.approveNow ? 'approved' : 'draft',
      })
      .select('id')
      .single();

    if (error) throw asDbError(error);
    return { data: { id: (data as { id: string }).id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Approve or cancel a release. Cancelling below what has been paid is refused. */
export async function setWorkOrderReleaseStatus(
  releaseId: string,
  status: 'approved' | 'cancelled',
  reason?: string,
): Promise<MutationResult<{ authorisedTotal: number; paidToDate: number }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (status === 'cancelled' && !reason?.trim()) {
      throw new Error('A cancellation reason is mandatory.');
    }

    const { data, error } = await supabase.rpc('set_work_order_release_status', {
      p_release_id: releaseId,
      p_status: status,
      p_reason: reason?.trim() || null,
    });

    if (error) throw asDbError(error);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        authorisedTotal: Number(row.authorised_total || 0),
        paidToDate: Number(row.paid_to_date || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type ServiceBillPaymentRow = {
  id: string;
  payment_reference: string;
  payment_date: string;
  amount: number;
  status: string;
  payment_mode: string | null;
  remarks: string | null;
  approved_at: string | null;
};

export async function listServiceBillPayments(billId: string): Promise<ServiceBillPaymentRow[]> {
  if (!isLiveSupabase() || !billId) return [];

  const { data, error } = await supabase
    .from('payments')
    .select('id, payment_reference, payment_date, amount, status, payment_mode, remarks, approved_at')
    .eq('service_bill_id', billId)
    .order('payment_date', { ascending: false });

  if (error) throw asDbError(error);
  return (data ?? []) as unknown as ServiceBillPaymentRow[];
}

/**
 * Record a disbursement against a certified bill.
 *
 * The database refuses to pay an uncertified bill, to exceed the bill's net
 * payable, or (when the project sets wo_release_enforcement = block) to exceed
 * the Work Order's authorised release. Those messages name the amounts, so they
 * are surfaced verbatim.
 */
export async function recordServiceBillPayment(input: {
  billId: string;
  amount: number;
  paymentReference: string;
  paymentDate?: string;
  paymentMode?: string;
  remarks?: string;
}): Promise<MutationResult<{ id: string; paymentStatus: string; billStatus: string }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!(input.amount > 0)) throw new Error('Payment amount must be greater than zero.');
    if (!input.paymentReference?.trim()) throw new Error('A payment reference is required.');

    const { data, error } = await supabase.rpc('rpc_record_service_bill_payment', {
      p_bill_id: input.billId,
      p_amount: input.amount,
      p_payment_reference: input.paymentReference.trim(),
      p_payment_date: input.paymentDate || null,
      p_payment_mode: input.paymentMode || null,
      p_remarks: input.remarks || null,
    });

    if (error) throw asDbError(error);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        id: (row.id as string) ?? '',
        paymentStatus: (row.payment_status as string) ?? 'pending',
        billStatus: (row.bill_status as string) ?? 'approved',
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Retention release
// ---------------------------------------------------------------------------

export type RetentionReleaseRow = {
  id: string;
  release_number: string;
  release_date: string;
  amount: number;
  reason: string | null;
  status: string;
  approved_at: string | null;
};

export async function listRetentionReleases(billId: string): Promise<RetentionReleaseRow[]> {
  if (!isLiveSupabase() || !billId) return [];

  const { data, error } = await supabase
    .from('retention_releases')
    .select('id, release_number, release_date, amount, reason, status, approved_at')
    .eq('service_bill_id', billId)
    .order('release_date', { ascending: false });

  if (error) throw asDbError(error);
  return (data ?? []) as unknown as RetentionReleaseRow[];
}

/**
 * Release retention withheld on a bill, typically at the end of the defects
 * liability period ("Retention @ 5% ... released after 12 months", per the Work
 * Order terms).
 *
 * Approving emits the 'retention_released' ledger row, which is what finally
 * lets budget_allocations.retention_held decrease — it could previously only
 * ever grow.
 */
export async function releaseRetention(input: {
  billId: string;
  amount: number;
  releaseNumber: string;
  reason?: string;
  releaseDate?: string;
}): Promise<MutationResult<{ id: string; retentionOutstanding: number }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!(input.amount > 0)) throw new Error('The release amount must be greater than zero.');
    if (!input.releaseNumber?.trim()) throw new Error('A release number is required.');

    const { data, error } = await supabase.rpc('rpc_release_retention', {
      p_bill_id: input.billId,
      p_amount: input.amount,
      p_release_number: input.releaseNumber.trim(),
      p_reason: input.reason || null,
      p_release_date: input.releaseDate || null,
    });

    if (error) throw asDbError(error);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        id: (row.id as string) ?? '',
        retentionOutstanding: Number(row.retention_outstanding || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Retention withheld on a bill, less what has already been released. */
export async function getRetentionOutstanding(billId: string): Promise<number> {
  if (!isLiveSupabase() || !billId) return 0;

  const { data, error } = await supabase.rpc('fn_sb_retention_outstanding', {
    p_bill_id: billId,
  });

  if (error) throw asDbError(error);
  return Number(data || 0);
}

/**
 * Whether this project gates payment on an approved release.
 * Mirrors budget_config.wo_release_enforcement, which defaults to warn_only so
 * adopting release control is opt-in per project.
 */
export async function isReleaseRequiredForPayment(projectId: string): Promise<boolean> {
  if (!isLiveSupabase() || !projectId) return false;

  const { data, error } = await supabase
    .from('budget_config')
    .select('wo_release_enforcement')
    .eq('project_id', getDbSiteId(projectId))
    .maybeSingle();

  if (error || !data) return false;
  return (data.wo_release_enforcement ?? 'warn_only') === 'block';
}
