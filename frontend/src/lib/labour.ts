import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export async function getLabourAttendance(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase.from("labour_attendance").select("*, projects(name), project_sites(name)").order("attendance_date", { ascending: false });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addLabourAttendance(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from("labour_attendance").insert(record).select().single();
  if (error) throw error;
  return data;
}
