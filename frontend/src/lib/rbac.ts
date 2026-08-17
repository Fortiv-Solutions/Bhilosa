import {
  ROLE_LABELS,
  ROLE_SCOPES,
  isExecutiveRole,
  normalizeDatabaseRole,
  roleToDatabaseRole,
  type Role,
} from '@/lib/roles';

export { ROLE_LABELS, ROLE_SCOPES, normalizeDatabaseRole, roleToDatabaseRole };
export type { Role };

import { supabase } from '@/utils/supabase-client';

export async function updateProfileRole(userId: string, newRole: Role) {
  const dbRole = roleToDatabaseRole(newRole);
  const { error } = await supabase
    .from('profiles')
    .update({ role: dbRole })
    .eq('id', userId);
  
  if (error) throw error;
}

export async function updateProfileProject(userId: string, projectId: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ project_id: projectId })
    .eq('id', userId);
  
  if (error) throw error;
}

// Scoped down to Procurement (+ MRP), Work Orders, and Inventory for every
// role — see config/erp-navigation.ts for the full rationale. This used to
// include '*' for UPPER_MANAGEMENT (unrestricted); that wildcard is gone so
// direct-URL access to a removed page is actually blocked, not just hidden
// from the nav.
const CORE_ALLOWED_PATHS = ['/procurement', '/mrp', '/work-orders', '/service-bills', '/inventory', '/vendors'];

export const ROLE_ALLOWED_PATHS: Record<Role, string[]> = {
  UPPER_MANAGEMENT: CORE_ALLOWED_PATHS,
  PROJECT_MANAGER: CORE_ALLOWED_PATHS,
  PR_TEAM: CORE_ALLOWED_PATHS,
};

export function isUpperManagement(role: Role): boolean {
  return isExecutiveRole(role);
}

export function canAccessPath(role: Role, pathname: string): boolean {
  if (pathname === '/' || pathname === '/login') return true;
  const allowedPaths = ROLE_ALLOWED_PATHS[role] ?? [];
  if (allowedPaths.includes('*')) return true;

  return allowedPaths.some((allowedPath) => {
    return pathname === allowedPath || pathname.startsWith(`${allowedPath}/`);
  });
}

/**
 * Where a role lands immediately after signing in.
 *
 * Every role's allowed-path list is scoped to Procurement/MRP/Work
 * Orders/Inventory only, so every role lands on /procurement. The result is
 * validated through canAccessPath so a future ROLE_ALLOWED_PATHS change can
 * never strand a user on a page their role is then redirected away from.
 */
const ROLE_LANDING_PATH: Record<Role, string> = {
  UPPER_MANAGEMENT: '/procurement',
  PROJECT_MANAGER: '/procurement',
  PR_TEAM: '/procurement',
};

export function getRoleLandingPath(role: Role | null | undefined): string {
  if (!role) return '/procurement';
  const preferred = ROLE_LANDING_PATH[role];
  if (preferred && canAccessPath(role, preferred)) return preferred;
  return canAccessPath(role, '/procurement') ? '/procurement' : '/';
}
