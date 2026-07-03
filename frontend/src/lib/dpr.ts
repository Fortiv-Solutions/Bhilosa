import { supabase } from '@/utils/supabase-client';

export async function getDPRs(projectId?: string) {
  let query = supabase.from("daily_progress_reports").select("*, dpr_activity_lines(*), projects(name)").order("report_date", { ascending: false });
  if (projectId) {
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function approveDPR(dprId: string, approvedBy: string) {
  const { error } = await supabase
    .from("daily_progress_reports")
    .update({ 
      status: "approved", 
      updated_by: approvedBy,
      updated_at: new Date().toISOString()
    })
    .eq("id", dprId);
  if (error) throw error;
}

export async function rejectDPR(dprId: string, rejectedBy: string, remarks: string) {
  const { error } = await supabase
    .from("daily_progress_reports")
    .update({ 
      status: "rejected", 
      engineer_remarks: remarks,
      updated_by: rejectedBy,
      updated_at: new Date().toISOString()
    })
    .eq("id", dprId);
  if (error) throw error;
}
