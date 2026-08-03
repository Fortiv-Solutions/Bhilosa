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

export const ROLE_ALLOWED_PATHS: Record<Role, string[]> = {
  UPPER_MANAGEMENT: ['*'],
  PROJECT_MANAGER: [
    '/dashboard',
    '/projects',
    '/activities',
    '/work-orders',
    '/billing',
    '/service-bills',
    '/boq',
    '/budget',
    '/materials',
    '/inventory',
    '/documents',
    '/communication',
    '/inbox',
    '/reports',
    '/notifications',
  ],
  PR_TEAM: [
    '/dashboard',
    '/procurement',
    '/vendors',
    '/budget',
    '/inventory',
    '/documents',
    '/communication',
    '/inbox',
    '/reports',
    '/notifications',
  ],
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
 * Every role can reach /dashboard, so that is the safe default; PR_TEAM is sent
 * straight to its procurement workspace instead. The result is validated through
 * canAccessPath so a future ROLE_ALLOWED_PATHS change can never strand a user on a
 * page their role is then redirected away from.
 */
const ROLE_LANDING_PATH: Record<Role, string> = {
  UPPER_MANAGEMENT: '/dashboard',
  PROJECT_MANAGER: '/dashboard',
  PR_TEAM: '/procurement',
};

export function getRoleLandingPath(role: Role | null | undefined): string {
  if (!role) return '/dashboard';
  const preferred = ROLE_LANDING_PATH[role];
  if (preferred && canAccessPath(role, preferred)) return preferred;
  return canAccessPath(role, '/dashboard') ? '/dashboard' : '/';
}
