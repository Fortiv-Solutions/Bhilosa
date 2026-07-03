import { supabase } from '@/utils/supabase-client';

export async function getDelays(projectId?: string) {
  let query = supabase.from("delay_events").select("*, projects(name), construction_activities(title)").order("created_at", { ascending: false });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function reviewDelay(delayId: string, reviewedBy: string, reviewNotes: string) {
  const { error } = await supabase
    .from("delay_events")
    .update({ 
      reason_details: reviewNotes,
      updated_by: reviewedBy,
      updated_at: new Date().toISOString()
    })
    .eq("id", delayId);
  if (error) throw error;
}
