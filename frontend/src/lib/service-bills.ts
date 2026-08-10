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
  /** Repetition multiplier — line_total = quantity x flats_count x rate. */
  flats_count: number;
  line_total: number;
  cumulative_quantity: number;
  previous_quantity: number;
  measurement_sheet_item_id: string | null;
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
  /** Composition of tax_amount. Interstate work puts the whole charge in IGST. */
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  is_interstate: boolean;
  tax_amount: number;
  total_amount: number;
  retention_percent: number;
  retention_amount: number;
  advance_adjusted: number;
  other_deductions: number;
  /** Contractual penalty (safety / delay / quality), separate from other_deductions. */
  debit_amount: number;
  debit_reason: string | null;
  /** Statutory withholding, computed on the ex-tax subtotal like retention. */
  tds_percent: number;
  tds_amount: number;
  net_payable_amount: number;
  /** The verified Measurement Book sheet this RA bill was built from. */
  measurement_sheet_id: string | null;

  ra_sequence: number | null;
  previous_certified_amount: number;
  cumulative_certified_amount: number;

  status: ServiceBillStatus;
  payment_status: ServiceBillPaymentStatus;
  remarks: string | null;
  rejection_reason: string | null;
  /**
   * Actor columns. created_by and verified_by drive the segregation-of-duties
   * check that decides whether the current user may certify this bill, so they
   * must be selected by the list query, not just the detail query.
   */
  created_by: string | null;
  submitted_by: string | null;
  verified_by: string | null;
  approved_by: string | null;
  rejected_by: string | null;
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

/**
 * Surfaces the Stage 1 guard messages verbatim. Those are written for the
 * person reading the screen (illegal transition, missing authority, segregation
 * of duties, QC not passed), so flattening them into a generic failure would
 * destroy the only actionable information the user gets.
 */
function asDbError(error: { message?: string; code?: string; hint?: string | null } | null): Error {
  if (!error) return new Error('Unknown database error.');
  const message = error.message || 'The database rejected this change.';
  if (error.code === '22023' && error.hint) return new Error(`${message} ${error.hint}`);
  return new Error(message);
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
  /**
   * Quantity certified on THIS bill.
   *
   * Sequential, not cumulative: all 153 parsed certificates invoice newly
   * completed scope at 100% and carry no "previous quantity" column. The
   * cumulative is derived server-side and enforced by
   * trg_sb_over_measurement_guard.
   */
  quantity: number;
  rate: number;
  taxRate?: number;
  /** Repetition multiplier — line_total = quantity x flatsCount x rate. */
  flatsCount?: number;
  cumulativeQuantity?: number;
  previousQuantity?: number;
  workOrderLineId?: string;
  /**
   * The unit of claim on the Work Order's schedule of values. Once a Work Order
   * has one, trg_sb_eligibility_gate refuses to certify a bill whose lines do
   * not say what they draw on — none of the 149 source certificates carried any
   * contract reference at all.
   */
  billableItemId?: string;
  measurementSheetItemId?: string;
  masterBudgetItemId?: string;
  /**
   * Required when the billed rate departs from the contracted one.
   * trg_sb_rate_variance_guard refuses certification without it — the source
   * certificates show three different flat rates billed against one contract
   * with nothing objecting.
   */
  rateVarianceReason?: string;
  /** Set when a contractual rule reduced the rate (e.g. a half-rate clause). */
  rateFactorApplied?: number;
  /** Location, so billing can be reported by tower/floor/unit. */
  tower?: string;
  floorRef?: string;
  unitRef?: string;
};

export type CreateServiceBillInput = {
  projectId: string;
  vendorId: string;
  /** Mandatory: "No WO, no bill." The DB also enforces this (trg_service_bill_require_active_wo). */
  workOrderId: string;
  activityId?: string;
  qcInspectionId?: string;
  masterBudgetItemId?: string;
  /**
   * The verified Measurement Book sheet backing this claim. Required to certify
   * unless the project sets sb_measurement_enforcement = warn_only.
   */
  measurementSheetId?: string;
  billNumber: string;
  billDate: string;
  supplierBillNo?: string;
  supplierBillDate?: string;
  serviceDescription?: string;
  retentionPercent?: number;
  advanceAdjusted?: number;
  otherDeductions?: number;
  /** Contractual penalty; requires a reason for the audit trail. */
  debitAmount?: number;
  debitReason?: string;
  tdsPercent?: number;
  /** Interstate supply: the whole tax charge is IGST rather than CGST+SGST. */
  isInterstate?: boolean;
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
      measurement_sheet_id: input.measurementSheetId || null,
      bill_number: input.billNumber.trim(),
      bill_date: input.billDate,
      supplier_bill_no: input.supplierBillNo || null,
      supplier_bill_date: input.supplierBillDate || null,
      service_description: input.serviceDescription || null,
      retention_percent: input.retentionPercent ?? 0,
      advance_adjusted: input.advanceAdjusted ?? 0,
      other_deductions: input.otherDeductions ?? 0,
      debit_amount: input.debitAmount ?? 0,
      debit_reason: input.debitReason || null,
      tds_percent: input.tdsPercent ?? 0,
      is_interstate: input.isInterstate ?? false,
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
      // With lines, fn_rollup_service_bill_from_lines derives the split from
      // is_interstate; a header-only bill has to state the amounts here.
      if (input.isInterstate) {
        header.igst_amount = tax;
      } else {
        const half = Math.round((tax / 2) * 100) / 100;
        header.cgst_amount = half;
        header.sgst_amount = Math.round((tax - half) * 100) / 100;
      }
    }

    const { data, error } = await supabase.from('service_bills').insert(header).select('id').single();
    if (error) throw asDbError(error);

    const billId = (data as { id: string }).id;

    if (hasLines) {
      const lineRows = lines.map((l) => ({
        service_bill_id: billId,
        project_id: dbProjectId,
        work_order_line_id: l.workOrderLineId || null,
        billable_item_id: l.billableItemId || null,
        master_budget_item_id: l.masterBudgetItemId || input.masterBudgetItemId || null,
        description: l.description.trim(),
        unit: l.unit || null,
        quantity: l.quantity ?? 0,
        rate: l.rate ?? 0,
        tax_rate: l.taxRate ?? 0,
        flats_count: l.flatsCount ?? 1,
        measurement_sheet_item_id: l.measurementSheetItemId || null,
        rate_variance_reason: l.rateVarianceReason?.trim() || null,
        rate_factor_applied: l.rateFactorApplied ?? null,
        tower: l.tower || null,
        floor_ref: l.floorRef || null,
        unit_ref: l.unitRef || null,
        cumulative_quantity: l.cumulativeQuantity ?? l.quantity ?? 0,
        previous_quantity: l.previousQuantity ?? 0,
      }));

      const { error: lineError } = await supabase.from('service_bill_lines').insert(lineRows);
      if (lineError) {
        // Never leave a header with no lines behind: the rollup trigger would
        // keep the bill at zero and it would read as a legitimate nil bill.
        await supabase.from('service_bills').delete().eq('id', billId);
        throw asDbError(lineError);
      }
    }

    return { data: { id: billId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** What set_service_bill_status() returns, so the caller can refresh from it. */
export type ServiceBillTransitionResult = {
  id: string;
  billNumber: string | null;
  status: ServiceBillStatus;
  paymentStatus: ServiceBillPaymentStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  totalAmount: number;
  netPayableAmount: number;
};

/**
 * The single entry point for every service bill transition.
 *
 * Routes through set_service_bill_status(), added by the Stage 1 governance
 * migration. The database:
 *   * rejects an illegal move (sb_transition_allowed),
 *   * requires approval authority to certify or reject,
 *   * enforces segregation of duties — the certifier may be neither the
 *     preparer nor the verifier,
 *   * requires a reason to reject,
 *   * stamps verified_by / approved_by / rejected_by from the session,
 *   * writes an append-only service_bill_status_history row,
 *   * refuses a direct move to 'paid' (that is reached by recording a payment).
 *
 * Certification additionally fires the Phase 3 posting: 'actual' at gross
 * certified value, 'retention_held', and the Work Order commitment release —
 * plus the QC gate. Failures are real business rules; their messages are
 * written to be shown to the user verbatim.
 */
export async function setServiceBillStatus(
  billId: string,
  newStatus: ServiceBillStatus,
  reason?: string,
): Promise<MutationResult<ServiceBillTransitionResult>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!billId) throw new Error('No service bill selected.');
    if (newStatus === 'rejected' && !reason?.trim()) {
      throw new Error('A rejection reason is mandatory.');
    }
    if (newStatus === 'paid') {
      throw new Error(
        'A bill becomes paid by recording a payment against it, not by setting the status.',
      );
    }

    const { data, error } = await supabase.rpc('set_service_bill_status', {
      p_bill_id: billId,
      p_status: newStatus,
      p_reason: reason?.trim() || null,
    });

    if (error) throw asDbError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        id: (row.id as string) ?? billId,
        billNumber: (row.bill_number as string) ?? null,
        status: (row.status as ServiceBillStatus) ?? newStatus,
        paymentStatus: (row.payment_status as ServiceBillPaymentStatus) ?? 'pending',
        approvedBy: (row.approved_by as string) ?? null,
        approvedAt: (row.approved_at as string) ?? null,
        totalAmount: Number(row.total_amount || 0),
        netPayableAmount: Number(row.net_payable_amount || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Site verification of measured work, ahead of commercial certification. */
export async function verifyServiceBill(billId: string, remarks?: string) {
  return setServiceBillStatus(billId, 'verified', remarks);
}

/** Certify the bill — the moment cost is recognised in the budget ledger. */
export async function approveServiceBill(billId: string, remarks?: string) {
  return setServiceBillStatus(billId, 'approved', remarks);
}

export async function rejectServiceBill(billId: string, reason: string) {
  return setServiceBillStatus(billId, 'rejected', reason);
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

// Payments and retention releases live in work-order-treasury.ts as of Stage 3.
//
// The raw insert that used to sit here is deliberately gone: it wrote straight
// to `payments`, bypassing the release attribution that
// rpc_record_service_bill_payment performs. Two doors to the same table is how
// the caps drift apart, so there is now exactly one.

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

// ---------------------------------------------------------------------------
// Payment Certificate
//
// The PC is not a separate document: all 29 workbooks in PC/ show one artifact
// carrying the claim, the certification and the payment authorisation, which is
// exactly what service_bills + service_bill_lines already model. This is the
// read model for printing it.
// ---------------------------------------------------------------------------

export type PaymentCertificate = {
  serviceBillId: string;
  projectName: string | null;
  workOrderNumber: string | null;
  scopeOfWork: string | null;
  woTotalAmount: number;
  woBilledToDate: number;
  woRemainingBalance: number;

  billNumber: string;
  billDate: string;
  supplierBillNo: string | null;
  raSequence: number | null;
  serviceDescription: string | null;

  contractorName: string | null;
  contractorGstin: string | null;

  subtotalAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  isInterstate: boolean;
  taxAmount: number;
  totalAmount: number;

  retentionPercent: number;
  retentionAmount: number;
  advanceAdjusted: number;
  debitAmount: number;
  debitReason: string | null;
  otherDeductions: number;
  tdsPercent: number;
  tdsAmount: number;
  netPayableAmount: number;

  previousCertifiedAmount: number;
  cumulativeCertifiedAmount: number;

  status: ServiceBillStatus;
  paymentStatus: ServiceBillPaymentStatus;
  measurementSheetNumber: string | null;
  measurementSheetStatus: string | null;

  preparedByName: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;

  lines: ServiceBillLineRow[];
};

/**
 * Everything the printed certificate needs, in one round trip.
 * Reads payment_certificate_view, which is security_invoker — RLS still applies.
 */
export async function getPaymentCertificate(billId: string): Promise<PaymentCertificate | null> {
  if (!isLiveSupabase() || !billId) return null;

  const [{ data, error }, { data: lineData, error: lineError }] = await Promise.all([
    supabase.from('payment_certificate_view').select('*').eq('service_bill_id', billId).maybeSingle(),
    supabase
      .from('service_bill_lines')
      .select('*')
      .eq('service_bill_id', billId)
      .order('created_at', { ascending: true }),
  ]);

  if (error) throw asDbError(error);
  if (lineError) throw asDbError(lineError);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const num = (key: string) => Number(row[key] || 0);

  return {
    serviceBillId: row.service_bill_id as string,
    projectName: (row.project_name as string) ?? null,
    workOrderNumber: (row.work_order_number as string) ?? null,
    scopeOfWork: (row.scope_of_work as string) ?? null,
    woTotalAmount: num('wo_total_amount'),
    woBilledToDate: num('wo_billed_to_date'),
    woRemainingBalance: num('wo_remaining_balance'),

    billNumber: (row.bill_number as string) ?? '',
    billDate: (row.bill_date as string) ?? '',
    supplierBillNo: (row.supplier_bill_no as string) ?? null,
    raSequence: row.ra_sequence == null ? null : Number(row.ra_sequence),
    serviceDescription: (row.service_description as string) ?? null,

    contractorName: (row.contractor_name as string) ?? null,
    contractorGstin: (row.contractor_gstin as string) ?? null,

    subtotalAmount: num('subtotal_amount'),
    cgstAmount: num('cgst_amount'),
    sgstAmount: num('sgst_amount'),
    igstAmount: num('igst_amount'),
    isInterstate: Boolean(row.is_interstate),
    taxAmount: num('tax_amount'),
    totalAmount: num('total_amount'),

    retentionPercent: num('retention_percent'),
    retentionAmount: num('retention_amount'),
    advanceAdjusted: num('advance_adjusted'),
    debitAmount: num('debit_amount'),
    debitReason: (row.debit_reason as string) ?? null,
    otherDeductions: num('other_deductions'),
    tdsPercent: num('tds_percent'),
    tdsAmount: num('tds_amount'),
    netPayableAmount: num('net_payable_amount'),

    previousCertifiedAmount: num('previous_certified_amount'),
    cumulativeCertifiedAmount: num('cumulative_certified_amount'),

    status: (row.status as ServiceBillStatus) ?? 'draft',
    paymentStatus: (row.payment_status as ServiceBillPaymentStatus) ?? 'pending',
    measurementSheetNumber: (row.measurement_sheet_number as string) ?? null,
    measurementSheetStatus: (row.measurement_sheet_status as string) ?? null,

    preparedByName: (row.prepared_by_name as string) ?? null,
    verifiedByName: (row.verified_by_name as string) ?? null,
    verifiedAt: (row.verified_at as string) ?? null,
    approvedByName: (row.approved_by_name as string) ?? null,
    approvedAt: (row.approved_at as string) ?? null,

    lines: (lineData ?? []) as unknown as ServiceBillLineRow[],
  };
}

/** One row of the append-only service_bill_status_history trail. */
export type ServiceBillStatusHistoryRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
  totalAmountAtChange: number | null;
};

/**
 * The append-only transition trail for one service bill. Written by
 * trg_sb_record_status_history; the table has no UPDATE or DELETE policy.
 */
export async function getServiceBillStatusHistory(
  billId: string,
): Promise<ServiceBillStatusHistoryRow[]> {
  if (!isLiveSupabase() || !billId) return [];

  const { data, error } = await supabase
    .from('service_bill_status_history')
    .select('id, from_status, to_status, reason, changed_at, changed_by, total_amount_at_change, profiles(name, email)')
    .eq('service_bill_id', billId)
    .order('changed_at', { ascending: false });

  if (error) throw asDbError(error);

  return (data ?? []).map((row) => {
    const actor = (row as { profiles?: { name?: string | null; email?: string | null } }).profiles;
    return {
      id: row.id as string,
      fromStatus: (row.from_status as string) ?? null,
      toStatus: (row.to_status as string) ?? '',
      reason: (row.reason as string) ?? null,
      changedAt: row.changed_at as string,
      changedBy: (row.changed_by as string) ?? null,
      changedByName: actor?.name || actor?.email || null,
      totalAmountAtChange:
        row.total_amount_at_change == null ? null : Number(row.total_amount_at_change),
    };
  });
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
