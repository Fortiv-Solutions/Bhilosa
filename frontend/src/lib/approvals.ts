import { supabase } from '@/utils/supabase-client';

export async function getPendingApprovals(projectId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  let prQuery = supabase.from("purchase_requisitions").select("id, title:pr_number, status, created_at, project_id, projects(name)").eq("status", "submitted");
  let mrQuery = supabase.from("material_requests").select("id, title:mr_number, status, created_at, project_id, projects(name)").eq("status", "submitted");
  let dprQuery = supabase.from("daily_progress_reports").select("id, title:report_no, status, created_at, project_id, projects(name)").in("status", ["draft", "submitted"]);

  if (projectId) {
    prQuery = prQuery.eq("project_id", projectId);
    mrQuery = mrQuery.eq("project_id", projectId);
    dprQuery = dprQuery.eq("project_id", projectId);
  }

  const [prs, mrs, dprs] = await Promise.all([prQuery, mrQuery, dprQuery]);

  return [
    ...(prs.data || []).map((x: any) => ({ ...x, type: 'Purchase Requisition' })),
    ...(mrs.data || []).map((x: any) => ({ ...x, type: 'Material Request' })),
    ...(dprs.data || []).map((x: any) => ({ ...x, type: 'Daily Progress Report' }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
