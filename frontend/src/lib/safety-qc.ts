import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export async function getSafetyIncidents(projectId?: string) {
  if (!isLiveSupabase()) return [];
  try {
    let query = supabase
      .from('safety_incidents')
      .select('*, projects(name)')
      .order('incident_date', { ascending: false });
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    if (error) {
      let fallbackQuery = supabase
        .from('safety_incidents')
        .select('*')
        .order('incident_date', { ascending: false });
      if (projectId) {
        fallbackQuery = fallbackQuery.eq('project_id', projectId);
      }
      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) return [];
      return fallbackData || [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function getQCInspections(projectId?: string) {
  if (!isLiveSupabase()) return [];
  try {
    let query = supabase
      .from('qc_inspections')
      .select('*, projects(name)')
      .order('inspection_date', { ascending: false });
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    if (error) {
      let fallbackQuery = supabase
        .from('qc_inspections')
        .select('*')
        .order('inspection_date', { ascending: false });
      if (projectId) {
        fallbackQuery = fallbackQuery.eq('project_id', projectId);
      }
      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) return [];
      return fallbackData || [];
    }
    return data || [];
  } catch {
    return [];
  }
}

export async function reportSafetyIncident(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from('safety_incidents').insert(record).select().single();
  if (error) throw error;
  return data;
}

export async function logQCInspection(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from('qc_inspections').insert(record).select().single();
  if (error) throw error;
  return data;
}
