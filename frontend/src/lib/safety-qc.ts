import { supabase } from '@/utils/supabase-client';

export async function getSafetyIncidents(projectId?: string) {
  let query = supabase.from("safety_incidents").select("*, projects(name), project_sites(name)").order("incident_date", { ascending: false });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getQCInspections(projectId?: string) {
  let query = supabase.from("qc_inspections").select("*, projects(name), construction_activities(title)").order("inspection_date", { ascending: false });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function reportSafetyIncident(record: any) {
  const { data, error } = await supabase.from("safety_incidents").insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function logQCInspection(record: any) {
  const { data, error } = await supabase.from("qc_inspections").insert(record).select().single();
  if (error) throw error;
  return data;
}
