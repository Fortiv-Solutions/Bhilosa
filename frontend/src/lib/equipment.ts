import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export async function getEquipmentAssets(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase.from("equipment_assets").select("*, projects(name), project_sites(name)").order("created_at", { ascending: false });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getEquipmentUsageLogs(equipmentId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase.from("equipment_usage_logs").select("*").order("usage_date", { ascending: false });
  if (equipmentId) {
    query = query.eq("equipment_id", equipmentId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addEquipmentUsageLog(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from("equipment_usage_logs").insert(record).select().single();
  if (error) throw error;
  
  // Update total usage on the equipment asset
  await supabase.rpc('increment_equipment_usage', { 
    eq_id: record.equipment_id, 
    hrs: record.usage_hours, 
    fuel: record.fuel_consumed 
  });
  
  return data;
}
