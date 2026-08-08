// ============================================================================
// PRAMUKH GROUP ERP V2 — WORK ORDER / SERVICE BILL LIFECYCLE
// File: frontend/src/lib/erp/work-order/status.ts
//
// The client-side mirror of the transition tables in
// supabase/migrations/20260807100100_wo_sb_stage1_governance.sql:
//   wo_transition_allowed() / sb_transition_allowed()
//
// These decide which ACTIONS ARE OFFERED. The database decides what is
// permitted — every transition goes through set_work_order_status() /
// set_service_bill_status(), which re-validate independently. Keeping the two
// in step is what stops the UI presenting a button that the server will refuse.
// ============================================================================

export type WorkOrderStatus =
  | 'draft'
  | 'submitted'
  | 'issued'
  | 'active'
  | 'closed'
  | 'rejected'
  | 'cancelled';

export type ServiceBillStatus =
  | 'draft'
  | 'submitted'
  | 'verified'
  | 'approved'
  | 'rejected'
  | 'paid';

// ---------------------------------------------------------------------------
// Work Order
// ---------------------------------------------------------------------------

/** Mirrors wo_canonical_status(). Unknown spellings return null. */
export function canonicalWorkOrderStatus(value?: string | null): WorkOrderStatus | null {
  const key = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (key) {
    case 'draft':
      return 'draft';
    case 'submitted':
    case 'pending':
      return 'submitted';
    case 'issued':
    case 'approved':
      return 'issued';
    case 'active':
    case 'in_progress':
      return 'active';
    case 'closed':
    case 'completed':
      return 'closed';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return null;
  }
}

/**
 * Legal moves. Must stay identical to wo_transition_allowed().
 *
 * issued -> draft is absent by design: the budget commitment exists by then, so
 * the reverse of issuing is cancelling (which releases it), not un-issuing.
 */
const WO_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ['submitted', 'issued', 'cancelled'],
  submitted: ['issued', 'rejected', 'draft', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  issued: ['active', 'closed', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

/** Transitions that the database gates on app_can_approve(). */
const WO_PRIVILEGED: ReadonlySet<WorkOrderStatus> = new Set<WorkOrderStatus>([
  'issued',
  'rejected',
  'closed',
  'cancelled',
]);

export function workOrderNeedsApprover(next: WorkOrderStatus): boolean {
  return WO_PRIVILEGED.has(next);
}

/** Transitions requiring a mandatory reason, matching the guard trigger. */
export function workOrderNeedsReason(next: WorkOrderStatus): boolean {
  return next === 'rejected' || next === 'cancelled';
}

export function nextWorkOrderStatuses(
  current: string | null | undefined,
  canApprove: boolean,
): WorkOrderStatus[] {
  const normalized = canonicalWorkOrderStatus(current);
  if (!normalized) return [];
  return WO_TRANSITIONS[normalized].filter(
    (next) => canApprove || !workOrderNeedsApprover(next),
  );
}

export function isWorkOrderTerminal(current: string | null | undefined): boolean {
  const normalized = canonicalWorkOrderStatus(current);
  return normalized === 'closed' || normalized === 'cancelled';
}

/** A Work Order is billable only while it is issued or active ("no WO, no bill"). */
export function isWorkOrderBillable(current: string | null | undefined): boolean {
  const normalized = canonicalWorkOrderStatus(current);
  return normalized === 'issued' || normalized === 'active';
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  issued: 'Issued',
  active: 'Active',
  closed: 'Closed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** Verb shown on the button that performs the move. */
export const WORK_ORDER_ACTION_LABELS: Record<WorkOrderStatus, string> = {
  draft: 'Return to Draft',
  submitted: 'Submit for Approval',
  issued: 'Approve & Issue',
  active: 'Mark Active',
  closed: 'Close Work Order',
  rejected: 'Reject',
  cancelled: 'Cancel Work Order',
};

/** The four stages drawn on the detail-page timeline. */
export const WORK_ORDER_STAGES: WorkOrderStatus[] = ['draft', 'issued', 'active', 'closed'];

// ---------------------------------------------------------------------------
// Service Bill
// ---------------------------------------------------------------------------

/** Mirrors sb_canonical_status(). */
export function canonicalServiceBillStatus(value?: string | null): ServiceBillStatus | null {
  const key = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (key) {
    case 'draft':
      return 'draft';
    case 'submitted':
      return 'submitted';
    case 'verified':
      return 'verified';
    case 'approved':
    case 'certified':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'paid':
      return 'paid';
    default:
      return null;
  }
}

/**
 * Must stay identical to sb_transition_allowed().
 *
 * 'paid' is omitted from every list on purpose: the database refuses a direct
 * move to paid, which is reached only by recording a payment.
 */
const SB_TRANSITIONS: Record<ServiceBillStatus, ServiceBillStatus[]> = {
  draft: ['submitted', 'rejected'],
  submitted: ['verified', 'rejected', 'draft'],
  verified: ['approved', 'rejected', 'submitted'],
  approved: ['verified', 'rejected'],
  rejected: ['draft', 'submitted'],
  paid: [],
};

const SB_PRIVILEGED: ReadonlySet<ServiceBillStatus> = new Set<ServiceBillStatus>([
  'approved',
  'rejected',
]);

export function serviceBillNeedsApprover(next: ServiceBillStatus): boolean {
  return SB_PRIVILEGED.has(next);
}

export function serviceBillNeedsReason(next: ServiceBillStatus): boolean {
  return next === 'rejected';
}

export function nextServiceBillStatuses(
  current: string | null | undefined,
  canApprove: boolean,
): ServiceBillStatus[] {
  const normalized = canonicalServiceBillStatus(current);
  if (!normalized) return [];
  return SB_TRANSITIONS[normalized].filter(
    (next) => canApprove || !serviceBillNeedsApprover(next),
  );
}

export function isServiceBillCertified(current: string | null | undefined): boolean {
  const normalized = canonicalServiceBillStatus(current);
  return normalized === 'approved' || normalized === 'paid';
}

export const SERVICE_BILL_STATUS_LABELS: Record<ServiceBillStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  verified: 'Verified',
  approved: 'Certified',
  rejected: 'Rejected',
  paid: 'Paid',
};

export const SERVICE_BILL_ACTION_LABELS: Record<ServiceBillStatus, string> = {
  draft: 'Return to Draft',
  submitted: 'Submit',
  verified: 'Verify',
  approved: 'Certify',
  rejected: 'Reject',
  paid: 'Paid',
};
