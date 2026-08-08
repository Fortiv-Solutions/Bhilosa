// ============================================================================
// PRAMUKH GROUP ERP V2 — WORK ORDER / SERVICE BILL PERMISSIONS
// File: frontend/src/lib/work-order-permissions.ts
//
// Both modules previously had NO role gating at all: every RLS policy was
// USING (true) and the pages rendered a free status <select>, so any signed-in
// user could issue a subcontract or certify a bill and post cost to the budget.
//
// Server-side enforcement lives in the database (Stage 1 governance migration):
// role-aware RLS, guard triggers gating privileged transitions on
// app_can_approve(), and segregation of duties on certification. These flags
// control AFFORDANCES, not security — they exist so the user sees a disabled
// button instead of a Postgres error.
//
// Mirrors the model in budget-permissions.ts.
// ============================================================================

import type { Role } from './roles';

export interface WorkOrderPermissions {
  /** Read either module. */
  canView: boolean;
  /** Create a Work Order, or edit one that is still draft. */
  canCreateWorkOrder: boolean;
  /** Submit a draft for approval. Deliberately wider than approval. */
  canSubmitWorkOrder: boolean;
  /**
   * Approve & issue, reject, close or cancel a Work Order.
   * Mirrors app_can_approve() — upper_management and project_manager only.
   */
  canApproveWorkOrder: boolean;
  /** Record executed quantities against Work Order lines. */
  canRecordExecution: boolean;
  /** Raise a service bill against a Work Order. */
  canCreateServiceBill: boolean;
  /** Site verification of measured work, ahead of commercial certification. */
  canVerifyServiceBill: boolean;
  /** Certify a bill: the moment cost is recognised in the budget ledger. */
  canCertifyServiceBill: boolean;
  /** Reject a submitted or verified bill. */
  canRejectServiceBill: boolean;
  /** Read the append-only status history of either document. */
  canViewAuditTrail: boolean;
  /** Raise a treasury release authorisation (draft). */
  canProposeRelease: boolean;
  /** Approve or cancel a release — the "pay only Rs 10 L" decision. */
  canApproveRelease: boolean;
  /** Record an actual disbursement against a certified bill. */
  canRecordPayment: boolean;
  /** Release retention at the end of the defects liability period. */
  canReleaseRetention: boolean;
  /** Raise a variation against a live contract (draft). */
  canProposeVariation: boolean;
  /** Approve a variation — moves the contract value and the commitment. */
  canApproveVariation: boolean;
}

const NONE: WorkOrderPermissions = {
  canView: false,
  canCreateWorkOrder: false,
  canSubmitWorkOrder: false,
  canApproveWorkOrder: false,
  canRecordExecution: false,
  canCreateServiceBill: false,
  canVerifyServiceBill: false,
  canCertifyServiceBill: false,
  canRejectServiceBill: false,
  canViewAuditTrail: false,
  canProposeRelease: false,
  canApproveRelease: false,
  canRecordPayment: false,
  canReleaseRetention: false,
  canProposeVariation: false,
  canApproveVariation: false,
};

const MATRIX: Record<Role, WorkOrderPermissions> = {
  UPPER_MANAGEMENT: {
    canView: true,
    canCreateWorkOrder: true,
    canSubmitWorkOrder: true,
    canApproveWorkOrder: true,
    canRecordExecution: true,
    canCreateServiceBill: true,
    canVerifyServiceBill: true,
    canCertifyServiceBill: true,
    canRejectServiceBill: true,
    canViewAuditTrail: true,
    canProposeRelease: true,
    canApproveRelease: true,
    canRecordPayment: true,
    canReleaseRetention: true,
    canProposeVariation: true,
    canApproveVariation: true,
  },
  PROJECT_MANAGER: {
    canView: true,
    canCreateWorkOrder: true,
    canSubmitWorkOrder: true,
    // app_can_approve() includes project_manager.
    canApproveWorkOrder: true,
    canRecordExecution: true,
    canCreateServiceBill: true,
    canVerifyServiceBill: true,
    canCertifyServiceBill: true,
    canRejectServiceBill: true,
    canViewAuditTrail: true,
    // app_can_approve() includes project_manager, so the database permits all
    // four; the matrix must agree or the UI hides a button that would work.
    canProposeRelease: true,
    canApproveRelease: true,
    canRecordPayment: true,
    canReleaseRetention: true,
    canProposeVariation: true,
    canApproveVariation: true,
  },
  PR_TEAM: {
    canView: true,
    // Site engineers and store keepers normalise to PR_TEAM (see roles.ts).
    // They raise and verify; they never authorise money.
    canCreateWorkOrder: true,
    canSubmitWorkOrder: true,
    canApproveWorkOrder: false,
    canRecordExecution: true,
    canCreateServiceBill: true,
    canVerifyServiceBill: true,
    canCertifyServiceBill: false,
    canRejectServiceBill: false,
    canViewAuditTrail: true,
    // May raise a release for management to approve, but authorises no cash.
    canProposeRelease: true,
    canApproveRelease: false,
    canRecordPayment: false,
    canReleaseRetention: false,
    // May raise a scope change for management to price and approve.
    canProposeVariation: true,
    canApproveVariation: false,
  },
};

export function getWorkOrderPermissions(role: Role | null | undefined): WorkOrderPermissions {
  if (!role) return NONE;
  return MATRIX[role] ?? NONE;
}

/**
 * Segregation of duties, mirroring trg_guard_service_bill_status: the certifier
 * may be neither the person who raised the claim nor the one who verified it.
 *
 * Returns the reason certification is blocked, or null when it is allowed. Both
 * comparisons are skipped when the counterpart is unknown, exactly as the
 * database does — a legacy row with no created_by must stay payable.
 */
export function serviceBillCertificationBlockedReason(
  bill: { created_by?: string | null; verified_by?: string | null },
  currentProfileId: string | null | undefined,
): string | null {
  if (!currentProfileId) return null;
  if (bill.created_by && bill.created_by === currentProfileId) {
    return 'You raised this bill. Segregation of duties requires someone else to certify it.';
  }
  if (bill.verified_by && bill.verified_by === currentProfileId) {
    return 'You verified this bill. Segregation of duties requires someone else to certify it.';
  }
  return null;
}
