import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export async function getPendingApprovals(projectId?: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let prQuery = supabase.from("purchase_requisitions").select("id, title:pr_number, status, created_at, project_id, projects(name)").eq("status", "submitted");
    let mrQuery = supabase.from("material_requests").select("id, title:mr_number, status, created_at, project_id, projects(name)").eq("status", "submitted");
    let dprQuery = supabase.from("daily_progress_reports").select("id, title:report_no, status, created_at, project_id, projects(name)").in("status", ["draft", "submitted"]);
    let woQuery = supabase.from("work_orders").select("id, title:work_order_number, status, created_at, project_id, projects(name)").eq("status", "submitted").eq("wo_status", "draft");

    if (projectId) {
      prQuery = prQuery.eq("project_id", projectId);
      mrQuery = mrQuery.eq("project_id", projectId);
      dprQuery = dprQuery.eq("project_id", projectId);
      woQuery = woQuery.eq("project_id", projectId);
    }

    const [prs, mrs, dprs, wos] = await Promise.all([prQuery, mrQuery, dprQuery, woQuery]);

    return [
      ...(prs.data || []).map((x: any) => ({ ...x, type: 'Purchase Requisition' })),
      ...(mrs.data || []).map((x: any) => ({ ...x, type: 'Material Request' })),
      ...(dprs.data || []).map((x: any) => ({ ...x, type: 'Daily Progress Report' })),
      ...(wos.data || []).map((x: any) => ({ ...x, type: 'Work Order' })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.warn("getPendingApprovals skipped:", err);
    return [];
  }
}
