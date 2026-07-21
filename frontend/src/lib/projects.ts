import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import type { Role } from './rbac';

export async function getProjectsForRole(userId: string, role: Role) {
  if (!isLiveSupabase()) return [];
  if (role === 'UPPER_MANAGEMENT' || role === 'PR_TEAM') {
    // These roles generally need full visibility to perform company-wide tracking
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('name');
    if (error) throw error;
    return data;
  } else {
    // Other roles see assigned projects
    const { data, error } = await supabase
      .from('project_members')
      .select('project_id, project_role, projects!inner(*)')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (error) throw error;
    return data.map((m: any) => ({ ...m.projects, current_user_role: m.project_role }));
  }
}
