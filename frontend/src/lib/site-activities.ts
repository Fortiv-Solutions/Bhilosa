import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export async function getSiteActivities(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase.from("construction_activities").select("*").order("planned_end_date", { ascending: true });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
