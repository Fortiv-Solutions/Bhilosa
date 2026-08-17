// ============================================================================
// APPROVAL LATENCY ANALYTICS
// Every timestamp this needs already exists (PR: created_at/status_changed_at/
// approved_at + pr_activity_log's full audit trail; PO: approved_at and
// friends) — nothing aggregated them before this. Makes approval latency
// visible instead of invisible, per the "approval latency invisible" friction.
// ============================================================================

import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { DEMO_APPROVAL_ANALYTICS } from './approval-analytics-demo-data';

export type ApprovalLatencyBucket = '0-24h' | '24-48h' | '>48h';

export type ApprovalStageSummary = {
  avgApprovalHours: number | null;
  pendingCount: number;
  agingBuckets: Record<ApprovalLatencyBucket, number>;
  sampleSize: number;
};

export type ApproverTurnaround = {
  actorId: string;
  actorName: string;
  actorRole: string | null;
  approvalCount: number;
  avgTurnaroundHours: number;
};

export type ApprovalAnalyticsSummary = {
  pr: ApprovalStageSummary;
  po: ApprovalStageSummary;
  perApprover: ApproverTurnaround[];
  generatedAt: string;
  isDemoData: boolean;
};

const PR_PENDING_STATUSES = ['pending_approval', 'awaiting_assignment', 'under_verification'];
const PO_PENDING_STATUSES = ['pending_approval'];

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function emptyBuckets(): Record<ApprovalLatencyBucket, number> {
  return { '0-24h': 0, '24-48h': 0, '>48h': 0 };
}

function bucketFor(hours: number): ApprovalLatencyBucket {
  if (hours <= 24) return '0-24h';
  if (hours <= 48) return '24-48h';
  return '>48h';
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export async function getApprovalAnalytics(
  projectId?: string,
  windowDays = 90,
): Promise<ApprovalAnalyticsSummary> {
  if (!isLiveSupabase()) return DEMO_APPROVAL_ANALYTICS;

  try {
    const cutoffIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const nowIso = new Date().toISOString();

    // --- PR stage ---------------------------------------------------------
    let prQuery = supabase
      .from('purchase_requisitions')
      .select('id, created_at, approved_at, status, status_changed_at')
      .gte('created_at', cutoffIso)
      .is('deleted_at', null);
    if (projectId) prQuery = prQuery.eq('project_id', projectId);
    const { data: prRows, error: prError } = await prQuery;
    if (prError) throw new Error(prError.message);

    const prApprovedHours: number[] = [];
    const prAging = emptyBuckets();
    let prPending = 0;
    for (const row of prRows ?? []) {
      const r = row as any;
      if (r.approved_at) {
        prApprovedHours.push(hoursBetween(r.created_at, r.approved_at));
      } else if (PR_PENDING_STATUSES.includes(r.status)) {
        prPending += 1;
        const since = r.status_changed_at || r.created_at;
        prAging[bucketFor(hoursBetween(since, nowIso))] += 1;
      }
    }

    // --- PO stage -----------------------------------------------------------
    let poQuery = supabase
      .from('purchase_orders')
      .select('id, created_at, approved_at, status, updated_at')
      .gte('created_at', cutoffIso)
      .is('deleted_at', null);
    if (projectId) poQuery = poQuery.eq('project_id', projectId);
    const { data: poRows, error: poError } = await poQuery;
    if (poError) throw new Error(poError.message);

    const poApprovedHours: number[] = [];
    const poAging = emptyBuckets();
    let poPending = 0;
    for (const row of poRows ?? []) {
      const r = row as any;
      if (r.approved_at) {
        poApprovedHours.push(hoursBetween(r.created_at, r.approved_at));
      } else if (PO_PENDING_STATUSES.includes(r.status)) {
        poPending += 1;
        // POs have no dedicated status_changed_at column — updated_at is an
        // approximation (it can also move on non-status edits), not exact.
        const since = r.updated_at || r.created_at;
        poAging[bucketFor(hoursBetween(since, nowIso))] += 1;
      }
    }

    // --- Per-approver turnaround, from pr_activity_log ----------------------
    // Measures time spent in the state immediately before each actor's action
    // (previous_status -> new_status gap), not total PR lifetime — a better
    // bottleneck signal, and it doesn't depend on purchase_requisition_assignments
    // (confirmed elsewhere in this codebase as a best-effort/optional insert).
    let logQuery = supabase
      .from('pr_activity_log')
      .select('purchase_requisition_id, new_status, actor_id, actor_role, created_at, profiles:actor_id(name)')
      .gte('created_at', cutoffIso)
      .eq('new_status', 'approved')
      .order('purchase_requisition_id', { ascending: true })
      .order('created_at', { ascending: true });
    const { data: logRows, error: logError } = await logQuery;
    if (logError) throw new Error(logError.message);

    // Need the previous row per PR to compute the gap — fetch full ordered
    // history per PR touched by an approval in this window.
    const prIds = Array.from(new Set((logRows ?? []).map((r: any) => r.purchase_requisition_id)));
    const turnaroundByActor = new Map<string, { name: string; role: string | null; hours: number[] }>();

    if (prIds.length > 0) {
      const { data: fullHistory, error: histError } = await supabase
        .from('pr_activity_log')
        .select('purchase_requisition_id, new_status, actor_id, actor_role, created_at, profiles:actor_id(name)')
        .in('purchase_requisition_id', prIds)
        .order('purchase_requisition_id', { ascending: true })
        .order('created_at', { ascending: true });
      if (histError) throw new Error(histError.message);

      const byPr = new Map<string, any[]>();
      for (const row of fullHistory ?? []) {
        const r = row as any;
        const list = byPr.get(r.purchase_requisition_id) ?? [];
        list.push(r);
        byPr.set(r.purchase_requisition_id, list);
      }

      for (const [, history] of byPr) {
        for (let i = 0; i < history.length; i++) {
          const row = history[i];
          if (row.new_status !== 'approved' || !row.actor_id) continue;
          const prevCreatedAt = i > 0 ? history[i - 1].created_at : row.created_at;
          const hours = hoursBetween(prevCreatedAt, row.created_at);
          const key = row.actor_id;
          const existing = turnaroundByActor.get(key) ?? {
            name: row.profiles?.name || 'Unknown',
            role: row.actor_role ?? null,
            hours: [] as number[],
          };
          existing.hours.push(hours);
          turnaroundByActor.set(key, existing);
        }
      }
    }

    const perApprover: ApproverTurnaround[] = Array.from(turnaroundByActor.entries())
      .map(([actorId, v]) => ({
        actorId,
        actorName: v.name,
        actorRole: v.role,
        approvalCount: v.hours.length,
        avgTurnaroundHours: average(v.hours) ?? 0,
      }))
      .sort((a, b) => b.avgTurnaroundHours - a.avgTurnaroundHours);

    return {
      pr: {
        avgApprovalHours: average(prApprovedHours),
        pendingCount: prPending,
        agingBuckets: prAging,
        sampleSize: prApprovedHours.length,
      },
      po: {
        avgApprovalHours: average(poApprovedHours),
        pendingCount: poPending,
        agingBuckets: poAging,
        sampleSize: poApprovedHours.length,
      },
      perApprover,
      generatedAt: nowIso,
      isDemoData: false,
    };
  } catch (error) {
    console.error('[getApprovalAnalytics] falling back to demo data:', error);
    return DEMO_APPROVAL_ANALYTICS;
  }
}
