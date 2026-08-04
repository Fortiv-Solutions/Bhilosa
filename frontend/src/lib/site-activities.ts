import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { CENTRAL_PARK_SCHEDULE_ACTIVITIES } from '@/lib/schedule-data';

export async function getSiteActivities(projectId?: string) {
  if (isLiveSupabase()) {
    try {
      let query = supabase.from("construction_activities").select("*").order("planned_end_date", { ascending: true });
      if (projectId) {
        query = query.eq("project_id", projectId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (err) {
      console.warn("Could not fetch construction_activities from Supabase, using schedule fallback:", err);
    }
  }

  // Return fallback timeline activities from DPR schedule Excel
  return CENTRAL_PARK_SCHEDULE_ACTIVITIES;
}

