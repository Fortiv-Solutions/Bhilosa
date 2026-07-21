// ============================================================================
// MATERIAL REQUEST — SERVER-SIDE LIST SERVICE
// Thin wrappers over the search_material_requests / material_request_stats RPCs.
// Everything (search, filter, sort, pagination, count) happens in Postgres so
// the client only ever loads one page at a time.
// Includes offline mock fallback when Supabase is disconnected.
// ============================================================================

import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { mockMaterialRequestsStore, type MaterialRequestRow } from '@/lib/procurement';

export type MrSort = 'newest' | 'oldest' | 'priority' | 'status' | 'updated';

export interface MrPagedParams {
  projectId?: string | null;
  status?: string | null;
  priority?: string | null;
  reviewerId?: string | null;
  myRequests?: boolean;
  pendingMyApproval?: boolean;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  sort?: MrSort;
  page: number;      // 1-based
  pageSize: number;
}

export interface MrPagedResult {
  rows: MaterialRequestRow[];
  total: number;
}

export interface MrStats {
  total: number;
  pending: number;
  critical: number;
  overdue: number;
  underReview: number;
  clarification: number;
  fulfilled: number;
  converted: number;
}

const ZERO_STATS: MrStats = {
  total: 0, pending: 0, critical: 0, overdue: 0, underReview: 0, clarification: 0, fulfilled: 0, converted: 0,
};

export async function listMaterialRequestsPaged(params: MrPagedParams): Promise<MrPagedResult> {
  if (!isLiveSupabase()) {
    let list = [...mockMaterialRequestsStore];

    if (params.search && params.search.trim()) {
      const q = params.search.toLowerCase();
      list = list.filter(mr => 
        mr.mr_number.toLowerCase().includes(q) ||
        (mr.work_activity && mr.work_activity.toLowerCase().includes(q)) ||
        (mr.profiles?.name && mr.profiles.name.toLowerCase().includes(q)) ||
        mr.material_request_lines.some(l => l.item_description.toLowerCase().includes(q))
      );
    }

    if (params.status && params.status !== 'all') {
      list = list.filter(mr => mr.status === params.status);
    }

    if (params.priority && params.priority !== 'all') {
      list = list.filter(mr => mr.priority === params.priority);
    }

    return { rows: list, total: list.length };
  }

  const { data, error } = await supabase.rpc('search_material_requests', {
    p_project_id: params.projectId || null,
    p_status: params.status || null,
    p_priority: params.priority || null,
    p_assigned_reviewer: params.reviewerId || null,
    p_my_requests: !!params.myRequests,
    p_pending_my_approval: !!params.pendingMyApproval,
    p_search: params.search?.trim() || null,
    p_date_from: params.dateFrom || null,
    p_date_to: params.dateTo || null,
    p_sort: params.sort || 'newest',
    p_limit: params.pageSize,
    p_offset: (params.page - 1) * params.pageSize,
  });

  if (error) throw new Error(error.message);
  const payload = (data ?? { total: 0, rows: [] }) as { total: number; rows: MaterialRequestRow[] };
  return { rows: payload.rows ?? [], total: Number(payload.total ?? 0) };
}

export async function getMaterialRequestStats(projectId?: string | null): Promise<MrStats> {
  if (!isLiveSupabase()) {
    const list = mockMaterialRequestsStore;
    return {
      total: list.length,
      pending: list.filter(m => m.status === 'submitted' || m.status === 'in_review').length,
      critical: list.filter(m => m.priority === 'critical' || m.priority === 'high').length,
      overdue: 0,
      underReview: list.filter(m => m.status === 'in_review').length,
      clarification: list.filter(m => m.status === 'draft').length,
      fulfilled: list.filter(m => m.status === 'closed' || m.stock_decision === 'available').length,
      converted: list.filter(m => m.status === 'approved').length,
    };
  }

  const { data, error } = await supabase.rpc('material_request_stats', { p_project_id: projectId || null });
  if (error) return ZERO_STATS;
  return { ...ZERO_STATS, ...(data as Partial<MrStats>) };
}

export interface ReviewerOption { id: string; name: string; }

export async function listReviewers(): Promise<ReviewerOption[]> {
  if (!isLiveSupabase()) {
    return [
      { id: 'u1', name: 'Rohan Mehta (Management)' },
      { id: 'u2', name: 'Vikram Patel (Sr. Engineer)' },
      { id: 'u3', name: 'Sanjay Shah (PR Team)' },
    ];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role')
    .in('role', ['upper_management', 'pr_team', 'project_manager', 'project_director', 'admin', 'administrator'])
    .order('name');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), name: String(p.name ?? 'Unnamed') }));
}
