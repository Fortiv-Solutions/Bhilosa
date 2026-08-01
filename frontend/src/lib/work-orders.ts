import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export async function getWorkOrders(projectId?: string) {
  if (!isLiveSupabase()) return [];
  let query = supabase
    .from('work_orders')
    .select(
      '*, projects(name), project_sites(name), vendor:vendors!work_orders_vendor_id_fkey(name), contractor:vendors!work_orders_contractor_vendor_fkey(name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addWorkOrder(record: any) {
  if (!isLiveSupabase()) return null;
  const { data, error } = await supabase.from('work_orders').insert(record).select().single();
  if (error) throw error;
  return data;
}
