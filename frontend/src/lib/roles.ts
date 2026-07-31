export type Role =
  | 'UPPER_MANAGEMENT'
  | 'PROJECT_MANAGER'
  | 'PR_TEAM';

export type DatabaseRole =
  | 'upper_management'
  | 'project_manager'
  | 'pr_team';

export const ROLE_LABELS: Record<Role, string> = {
  UPPER_MANAGEMENT: 'Upper Management',
  PROJECT_MANAGER: 'Project Manager',
  PR_TEAM: 'PR Team',
};

export const ROLE_SCOPES: Record<Role, string> = {
  UPPER_MANAGEMENT: 'Full project and company visibility with approval, reporting, vendor, budget, and bill controls.',
  PROJECT_MANAGER: 'Assigned project execution control with tasks, DPR, delays, and limited commercial visibility.',
  PR_TEAM: 'Procurement operations: material requests, PR, RFQ, quotations, vendors, PO, GRN, inventory context, and procurement reports.',
};

export const ROLE_TO_DATABASE_ROLE: Record<Role, DatabaseRole> = {
  UPPER_MANAGEMENT: 'upper_management',
  PROJECT_MANAGER: 'project_manager',
  PR_TEAM: 'pr_team',
};

const DATABASE_ROLE_TO_ROLE: Record<DatabaseRole, Role> = {
  upper_management: 'UPPER_MANAGEMENT',
  project_manager: 'PROJECT_MANAGER',
  pr_team: 'PR_TEAM',
};

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'UPPER_MANAGEMENT',
  administrator: 'UPPER_MANAGEMENT',
  superadmin: 'UPPER_MANAGEMENT',
  super_admin: 'UPPER_MANAGEMENT',
  project_director: 'UPPER_MANAGEMENT',
  director: 'UPPER_MANAGEMENT',
  management: 'UPPER_MANAGEMENT',
  procurement: 'PR_TEAM',
  procurement_manager: 'PR_TEAM',
  purchase: 'PR_TEAM',
  purchase_team: 'PR_TEAM',
  // Site-level operators map to PR_TEAM, which carries procurement operations
  // but no approval rights. They previously fell through to the
  // PROJECT_MANAGER default below, which showed them approve controls they are
  // not entitled to — and which the database now rejects outright.
  site_engineer: 'PR_TEAM',
  engineer: 'PR_TEAM',
  store_keeper: 'PR_TEAM',
  storekeeper: 'PR_TEAM',
  store: 'PR_TEAM',
};

export function normalizeDatabaseRole(role?: string | null): Role {
  const normalized = role?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return 'PROJECT_MANAGER';
  if (normalized in DATABASE_ROLE_TO_ROLE) return DATABASE_ROLE_TO_ROLE[normalized as DatabaseRole];
  if (normalized in ROLE_ALIASES) return ROLE_ALIASES[normalized];
  const upper = normalized.toUpperCase();
  return upper in ROLE_LABELS ? (upper as Role) : 'PROJECT_MANAGER';
}

export function roleToDatabaseRole(role: Role): DatabaseRole {
  return ROLE_TO_DATABASE_ROLE[role];
}

export function isExecutiveRole(role: Role): boolean {
  return role === 'UPPER_MANAGEMENT';
}

