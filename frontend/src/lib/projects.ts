import { supabase } from '@/utils/supabase-client';
import type { Role } from './rbac';

export async function getProjectsForRole(userId: string, role: Role) {
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
      .select('project_id, projects!inner(*)')
      .eq('user_id', userId);
    if (error) throw error;
    return data.map((m: any) => ({ ...m.projects, current_user_role: 'member' }));
  }
}
