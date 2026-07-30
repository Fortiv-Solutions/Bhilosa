// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET MODULE PERMISSIONS
// File: frontend/src/lib/budget-permissions.ts
//
// The Budget page previously computed a `canManageBudget` flag and then passed a
// literal `canManage={true}` to every tab, so any signed-in user — including
// read-only site staff — got Edit Mode, Excel Import, Delete and threshold config.
// This module is the single source of truth for who may do what.
//
// Server-side enforcement lives in the database: RLS policies restrict writes to
// authenticated users, and the budget_lock_enabled flag is checked inside the
// rpc_* functions. These client-side flags control affordances, not security.
// ============================================================================

import type { Role } from './roles';

export interface BudgetPermissions {
  /** Read the module at all. */
  canView: boolean;
  /** Change baseline quantities/rates (a change order). */
  canEditMasterBudget: boolean;
  /** Upload an Excel schedule. */
  canImportBudget: boolean;
  /** Enter verified billed quantities/rates on the variance sheet. */
  canEditVariance: boolean;
  /** Amend retention / advance / remarks on the bill ledger. */
  canEditLedger: boolean;
  /** Change thresholds, enforcement mode, FY and the budget lock. */
  canManageConfig: boolean;
  /** Acknowledge or close budget alerts. */
  canResolveAlerts: boolean;
  /** Export CSV. */
  canExport: boolean;
}

const NONE: BudgetPermissions = {
  canView: false,
  canEditMasterBudget: false,
  canImportBudget: false,
  canEditVariance: false,
  canEditLedger: false,
  canManageConfig: false,
  canResolveAlerts: false,
  canExport: false,
};

const MATRIX: Record<Role, BudgetPermissions> = {
  UPPER_MANAGEMENT: {
    canView: true,
    canEditMasterBudget: true,
    canImportBudget: true,
    canEditVariance: true,
    canEditLedger: true,
    canManageConfig: true,
    canResolveAlerts: true,
    canExport: true,
  },
  PROJECT_MANAGER: {
    canView: true,
    // Baseline changes are a board-level change order, not a PM action.
    canEditMasterBudget: false,
    canImportBudget: false,
    canEditVariance: true,
    canEditLedger: true,
    canManageConfig: false,
    canResolveAlerts: true,
    canExport: true,
  },
  PR_TEAM: {
    canView: true,
    canEditMasterBudget: false,
    canImportBudget: false,
    canEditVariance: false,
    canEditLedger: true,
    canManageConfig: false,
    canResolveAlerts: false,
    canExport: true,
  },
};

export function getBudgetPermissions(role: Role | null | undefined): BudgetPermissions {
  if (!role) return NONE;
  return MATRIX[role] ?? NONE;
}

/**
 * A locked budget blocks baseline and variance writes for everyone; the lock can
 * only be lifted from Config by a role holding canManageConfig. Mirrors
 * fn_assert_budget_unlocked in the database.
 */
export function applyBudgetLock(
  permissions: BudgetPermissions,
  budgetLockEnabled: boolean,
): BudgetPermissions {
  if (!budgetLockEnabled) return permissions;
  return {
    ...permissions,
    canEditMasterBudget: false,
    canImportBudget: false,
    canEditVariance: false,
  };
}
