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
