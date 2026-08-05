// ============================================================================
// PRAMUKH GROUP ERP V2 — SERVICE BILLS (contractor RA bills)
// File: frontend/src/lib/service-bills.ts
//
// Contractor bills raised against a Work Order. Structurally equal to the
// material bill desk (vendor_bills) since Phase 3:
//   * line items, retention / advance / deductions / net payable
//   * RA sequencing — previous certified, this certification, cumulative
//   * approval audit, soft delete
//   * certification posts to budget_ledger at GROSS certified value, holds
//     retention as a liability, and releases the Work Order's commitment
//
// Every one of those effects is enforced by the database
// (20260805100300_service_bill_budget_integration.sql). Nothing here recomputes
// budget arithmetic client-side.
// ============================================================================

import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { supabase, getDbSiteId } from '@/utils/supabase-client';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

/** PostgREST caps a single response; list reads page in blocks of this size. */
const PAGE_SIZE = 200;

export type ServiceBillStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'rejected' | 'paid';
export type ServiceBillPaymentStatus = 'pending' | 'partially_paid' | 'paid';

/** Bills whose cost has been recognised in the budget ledger. */
export const CERTIFIED_STATUSES: ServiceBillStatus[] = ['approved', 'paid'];

export type ServiceBillLineRow = {
  id: string;
  service_bill_id: string;
  work_order_line_id: string | null;
  master_budget_item_id: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  rate: number;
  tax_rate: number;
  line_total: number;
  cumulative_quantity: number;
  previous_quantity: number;
};

export type ServiceBillRow = {
  id: string;
  project_id: string;
  work_order_id: string | null;
  vendor_id: string | null;
  activity_id: string | null;
  qc_inspection_id: string | null;
  budget_allocation_id: string | null;
  master_budget_item_id: string | null;

  bill_number: string;
  bill_date: string;
  supplier_bill_no: string | null;
  supplier_bill_date: string | null;
  service_description: string | null;

  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  retention_percent: number;
  retention_amount: number;
  advance_adjusted: number;
  other_deductions: number;
  net_payable_amount: number;

  ra_sequence: number | null;
  previous_certified_amount: number;
  cumulative_certified_amount: number;

  status: ServiceBillStatus;
  payment_status: ServiceBillPaymentStatus;
  remarks: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  verified_at: string | null;
  created_at: string;

  vendors?: { id: string; legal_name: string | null; display_name: string | null } | null;
  work_orders?: {
    id: string;
    work_order_number: string | null;
    wo_status: string;
    total_amount: number;
    billed_to_date: number;
    remaining_balance: number;
    tax_inclusive: boolean;
  } | null;
  budget_allocations?: { id: string; allocation_name: string | null } | null;
  service_bill_lines?: ServiceBillLineRow[];
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const BILL_SELECT =
  '*, vendors(id, legal_name, display_name), ' +
  'work_orders(id, work_order_number, wo_status, total_amount, billed_to_date, remaining_balance, tax_inclusive), ' +
  'budget_allocations(id, allocation_name)';

/** The signed-in user's profile id. profiles.id mirrors the auth user id. */
async function currentProfileId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export type ServiceBillFilters = {
  status?: ServiceBillStatus | 'All';
  paymentStatus?: ServiceBillPaymentStatus | 'All';
  workOrderId?: string;
  search?: string;
};

/**
 * Every service bill for the selection, paged past the PostgREST row cap.
 * The previous implementation capped at 100 rows with no pagination, so a busy
 * project silently lost bills off the end of the list.
 */
export async function listServiceBills(
  projectId?: string,
  filters: ServiceBillFilters = {},
): Promise<ServiceBillRow[]> {
  if (!isLiveSupabase()) return [];

  const dbProjectId = projectId ? getDbSiteId(projectId) : null;
  const out: ServiceBillRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;

    let query = supabase
      .from('service_bills')
      .select(BILL_SELECT)
      .is('deleted_at', null)
      .order('bill_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (dbProjectId) query = query.eq('project_id', dbProjectId);
    if (filters.status && filters.status !== 'All') query = query.eq('status', filters.status);
    if (filters.paymentStatus && filters.paymentStatus !== 'All') {
      query = query.eq('payment_status', filters.paymentStatus);
    }
    if (filters.workOrderId) query = query.eq('work_order_id', filters.workOrderId);
    if (filters.search?.trim()) {
      // Escape PostgREST's or() delimiters before interpolating user input.
      const term = filters.search.trim().replace(/[(),*]/g, ' ');
      query = query.or(
        [
          `bill_number.ilike.%${term}%`,
          `supplier_bill_no.ilike.%${term}%`,
          `service_description.ilike.%${term}%`,
        ].join(','),
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // Cast through unknown: the embedded budget_allocations relation is newer
    // than the generated Supabase types, so PostgREST's inferred row type does
    // not structurally overlap ServiceBillRow.
    const rows = (data ?? []) as unknown as ServiceBillRow[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (page > 100) break; // hard stop against a pathological dataset
  }

  return out;
}

/** One bill with its lines, for the detail view. */
export async function getServiceBill(billId: string): Promise<ServiceBillRow | null> {
  if (!isLiveSupabase() || !billId) return null;

  const { data, error } = await supabase
    .from('service_bills')
    .select(`${BILL_SELECT}, service_bill_lines(*)`)
    .eq('id', billId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ServiceBillRow) ?? null;
}

export type BillableVendorOption = {
  id: string;
  name: string;
  vendorCode: string | null;
  gstNumber: string | null;
  vendorType: string;
};

/**
 * Vendors a service bill can be raised for. Contractors first, since a Work
 * Order is a labour/subcontract instrument, but suppliers are not excluded —
 * some trades are billed by the same entity that supplies the material.
 */
export async function listBillableVendors(): Promise<BillableVendorOption[]> {
  if (!isLiveSupabase()) return [];

  const { data, error } = await supabase
    .from('vendors')
    .select('id, legal_name, display_name, vendor_code, gst_number, vendor_type')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('legal_name', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      name: ((row.display_name as string) || (row.legal_name as string) || 'Unnamed vendor'),
      vendorCode: (row.vendor_code as string) ?? null,
      gstNumber: (row.gst_number as string) ?? null,
      vendorType: (row.vendor_type as string) ?? 'supplier',
    }))
    .sort((a, b) => {
      const rank = (t: string) => (t === 'contractor' ? 0 : t === 'both' ? 1 : 2);
      return rank(a.vendorType) - rank(b.vendorType) || a.name.localeCompare(b.name);
    });
}

export type CreateServiceBillLineInput = {
  description: string;
  unit?: string;
  /** Quantity certified on THIS bill (cumulative minus previous). */
  quantity: number;
  rate: number;
  taxRate?: number;
  cumulativeQuantity?: number;
  previousQuantity?: number;
  workOrderLineId?: string;
  masterBudgetItemId?: string;
};

export type CreateServiceBillInput = {
  projectId: string;
  vendorId: string;
  /** Mandatory: "No WO, no bill." The DB also enforces this (trg_service_bill_require_active_wo). */
  workOrderId: string;
  activityId?: string;
  qcInspectionId?: string;
  masterBudgetItemId?: string;
  billNumber: string;
  billDate: string;
  supplierBillNo?: string;
  supplierBillDate?: string;
  serviceDescription?: string;
  retentionPercent?: number;
  advanceAdjusted?: number;
  otherDeductions?: number;
  /** Used only when no lines are supplied — with lines the header rolls up from them. */
  subtotalAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  lines?: CreateServiceBillLineInput[];
};

/**
 * Raise a service bill. Submitted, not certified — cost is recognised only on
 * approval, which is also where the QC gate applies.
 *
 * When lines are supplied the header amounts are rolled up by a database trigger,
 * so subtotal/tax/total are not sent: a client-side total that disagreed with the
 * lines would be silently overwritten anyway.
 */
export async function createServiceBill(input: CreateServiceBillInput): Promise<MutationResult<{ id: string }>> {
  try {
    if (!input.workOrderId) {
      throw new Error('A Work Order must be selected before a bill can be raised (no WO, no bill).');
    }
    if (!input.vendorId) {
      throw new Error('Select the vendor or contractor this bill is from.');
    }
    if (!input.billNumber?.trim()) {
      throw new Error('Bill number is required.');
    }

    const lines = input.lines ?? [];
    const hasLines = lines.length > 0;

    if (hasLines && lines.some((l) => !l.description.trim())) {
      throw new Error('Every bill line needs a description.');
    }

    const dbProjectId = getDbSiteId(input.projectId);
    const profileId = await currentProfileId();

    const header: Record<string, unknown> = {
      project_id: dbProjectId,
      vendor_id: input.vendorId,
      work_order_id: input.workOrderId,
      activity_id: input.activityId || null,
      qc_inspection_id: input.qcInspectionId || null,
      master_budget_item_id: input.masterBudgetItemId || null,
      bill_number: input.billNumber.trim(),
      bill_date: input.billDate,
      supplier_bill_no: input.supplierBillNo || null,
      supplier_bill_date: input.supplierBillDate || null,
      service_description: input.serviceDescription || null,
      retention_percent: input.retentionPercent ?? 0,
      advance_adjusted: input.advanceAdjusted ?? 0,
      other_deductions: input.otherDeductions ?? 0,
      status: 'submitted',
      payment_status: 'pending',
      created_by: profileId,
      updated_by: profileId,
    };

    if (!hasLines) {
      const subtotal = input.subtotalAmount ?? 0;
      const tax = input.taxAmount ?? 0;
      header.subtotal_amount = subtotal;
      header.tax_amount = tax;
      header.total_amount = input.totalAmount ?? subtotal + tax;
    }

    const { data, error } = await supabase.from('service_bills').insert(header).select('id').single();
    if (error) throw new Error(error.message);

    const billId = (data as { id: string }).id;

    if (hasLines) {
      const lineRows = lines.map((l) => ({
        service_bill_id: billId,
        project_id: dbProjectId,
        work_order_line_id: l.workOrderLineId || null,
        master_budget_item_id: l.masterBudgetItemId || input.masterBudgetItemId || null,
        description: l.description.trim(),
        unit: l.unit || null,
        quantity: l.quantity ?? 0,
        rate: l.rate ?? 0,
        tax_rate: l.taxRate ?? 0,
        cumulative_quantity: l.cumulativeQuantity ?? l.quantity ?? 0,
        previous_quantity: l.previousQuantity ?? 0,
      }));

      const { error: lineError } = await supabase.from('service_bill_lines').insert(lineRows);
      if (lineError) {
        // Never leave a header with no lines behind: the rollup trigger would
        // keep the bill at zero and it would read as a legitimate nil bill.
        await supabase.from('service_bills').delete().eq('id', billId);
        throw new Error(lineError.message);
      }
    }

    return { data: { id: billId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Site-engineer certification of measured work, ahead of commercial approval. */
export async function verifyServiceBill(billId: string, remarks?: string): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('You must be signed in to verify a bill.');

    const { error } = await supabase
      .from('service_bills')
      .update({
        status: 'verified',
        remarks: remarks || null,
        verified_by: profileId,
        verified_at: new Date().toISOString(),
        updated_by: profileId,
      })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Certify the bill. This is the moment cost is recognised: the database posts the
 * 'actual' at gross certified value, holds retention, and releases the Work
 * Order's commitment. The QC gate also applies here, so a failure is a real
 * business rule and its message is written to be shown verbatim.
 */
export async function approveServiceBill(billId: string, remarks?: string): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('You must be signed in to approve a bill.');

    const { error } = await supabase
      .from('service_bills')
      .update({
        status: 'approved',
        remarks: remarks || null,
        approved_by: profileId,
        approved_at: new Date().toISOString(),
        updated_by: profileId,
      })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function rejectServiceBill(billId: string, reason: string): Promise<MutationResult> {
  try {
    if (!reason.trim()) throw new Error('Rejection reason is mandatory.');
    const profileId = await currentProfileId();

    const { error } = await supabase
      .from('service_bills')
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        remarks: reason.trim(),
        rejected_by: profileId,
        rejected_at: new Date().toISOString(),
        updated_by: profileId,
      })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Amend the settlement figures on a bill. On a certified bill the database
 * reverses the existing ledger rows and re-posts, so the journal can never drift
 * from the document.
 */
export async function updateServiceBillSettlement(
  billId: string,
  patch: {
    retentionPercent?: number;
    retentionAmount?: number;
    advanceAdjusted?: number;
    otherDeductions?: number;
    ledgerRemarks?: string;
  },
): Promise<MutationResult> {
  try {
    const payload: Record<string, unknown> = {};
    if (patch.retentionPercent !== undefined) payload.retention_percent = patch.retentionPercent;
    if (patch.retentionAmount !== undefined) payload.retention_amount = patch.retentionAmount;
    if (patch.advanceAdjusted !== undefined) payload.advance_adjusted = patch.advanceAdjusted;
    if (patch.otherDeductions !== undefined) payload.other_deductions = patch.otherDeductions;
    if (patch.ledgerRemarks !== undefined) payload.ledger_remarks = patch.ledgerRemarks;
    if (Object.keys(payload).length === 0) return { data: null, error: null };

    payload.updated_by = await currentProfileId();

    const { error } = await supabase.from('service_bills').update(payload).eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Retire a bill. Financial documents are soft-deleted; a certified bill's ledger
 * rows are reversed by the database rather than vanishing.
 */
export async function deleteServiceBill(billId: string): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('service_bills')
      .update({ deleted_at: new Date().toISOString(), updated_by: await currentProfileId() })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * payment_status is maintained by a database trigger off the payments table, so
 * this records an actual payment rather than just relabelling the bill.
 */
export async function recordServiceBillPayment(input: {
  projectId: string;
  billId: string;
  amount: number;
  paymentReference: string;
  paymentDate?: string;
  paymentMode?: string;
  remarks?: string;
}): Promise<MutationResult<{ id: string }>> {
  try {
    if (!(input.amount > 0)) throw new Error('Payment amount must be greater than zero.');
    if (!input.paymentReference?.trim()) throw new Error('A payment reference is required.');

    const { data, error } = await supabase
      .from('payments')
      .insert({
        project_id: getDbSiteId(input.projectId),
        service_bill_id: input.billId,
        vendor_bill_id: null,
        payment_reference: input.paymentReference.trim(),
        payment_date: input.paymentDate || new Date().toISOString().slice(0, 10),
        amount: input.amount,
        status: 'paid',
        payment_mode: input.paymentMode || null,
        remarks: input.remarks || null,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return { data: { id: (data as { id: string }).id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Live remaining balance for a Work Order, for the create-bill form. */
export async function getWorkOrderBalance(
  workOrderId: string,
): Promise<{
  totalAmount: number;
  billedToDate: number;
  claimedToDate: number;
  remainingBalance: number;
  woStatus: string;
  taxInclusive: boolean;
} | null> {
  if (!isLiveSupabase()) return null;

  const { data, error } = await supabase
    .from('work_orders')
    .select('total_amount, billed_to_date, claimed_to_date, remaining_balance, wo_status, tax_inclusive')
    .eq('id', workOrderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    totalAmount: Number(data.total_amount || 0),
    billedToDate: Number(data.billed_to_date || 0),
    claimedToDate: Number(data.claimed_to_date || 0),
    remainingBalance: Number(data.remaining_balance || 0),
    woStatus: data.wo_status as string,
    taxInclusive: Boolean(data.tax_inclusive),
  };
}

/** Work Order lines, so an RA bill can be measured against planned scope. */
export async function getWorkOrderLinesForBilling(workOrderId: string) {
  if (!isLiveSupabase() || !workOrderId) return [];

  const { data, error } = await supabase
    .from('work_order_lines')
    .select('id, description, unit, quantity, rate, total_amount, executed_quantity')
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Quantity already certified per Work Order line across earlier bills — the
 * "previous" half of an RA measurement.
 */
export async function getPreviouslyCertifiedQuantities(
  workOrderId: string,
): Promise<Record<string, number>> {
  if (!isLiveSupabase() || !workOrderId) return {};

  const { data, error } = await supabase
    .from('service_bill_lines')
    .select('work_order_line_id, quantity, service_bills!inner(work_order_id, status, deleted_at)')
    .eq('service_bills.work_order_id', workOrderId)
    .in('service_bills.status', CERTIFIED_STATUSES)
    .is('service_bills.deleted_at', null)
    .not('work_order_line_id', 'is', null);

  if (error) throw new Error(error.message);

  const totals: Record<string, number> = {};
  for (const row of data ?? []) {
    const lineId = row.work_order_line_id as string;
    totals[lineId] = (totals[lineId] ?? 0) + Number(row.quantity || 0);
  }
  return totals;
}
