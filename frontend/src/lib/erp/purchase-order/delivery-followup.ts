// ============================================================================
// DELIVERY FOLLOW-UP
// Pending/overdue PO deliveries + a lightweight per-PO follow-up log, so
// buyers get a "chase this" queue instead of manually remembering who to call.
// Mirrors the pr_activity_log pattern in
// frontend/src/lib/erp/purchase-requisition/service.ts for the log table.
// ============================================================================

import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { PO_RECEIVABLE_STATUSES } from './status';
import { getDeliveryUrgency, type DeliveryUrgency } from './delivery-urgency';
import {
  generateDemoPendingDeliveries,
  generateDemoFollowUps,
} from './delivery-followup-demo-data';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function currentProfileId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      if (userProfile?.id) return userProfile.id;
    }
  } catch {}
  return null;
}

async function currentRole(): Promise<string | null> {
  const id = await currentProfileId();
  if (!id) return null;
  try {
    const { data } = await supabase.from('profiles').select('role').eq('id', id).maybeSingle();
    return (data as { role?: string | null } | null)?.role ?? null;
  } catch {
    return null;
  }
}

export type PendingDeliveryRow = {
  id: string;
  po_number: string | null;
  po_date: string | null;
  delivery_date: string | null;
  status: string;
  total_amount: number;
  vendor_name: string | null;
  project_name: string | null;
  project_id: string | null;
  followUpCount: number;
  urgency: DeliveryUrgency;
};

/**
 * POs still awaiting delivery (per PO_RECEIVABLE_STATUSES) with a promised
 * delivery_date, sorted most-urgent-first (overdue first, then soonest-due).
 */
export async function listPendingDeliveries(projectId?: string): Promise<PendingDeliveryRow[]> {
  if (!isLiveSupabase()) return generateDemoPendingDeliveries(projectId);

  try {
    let query = supabase
      .from('purchase_orders')
      .select(
        `id, po_number, po_date, delivery_date, status, total_amount, project_id,
         vendors(display_name, legal_name),
         projects(name)`,
      )
      .in('status', PO_RECEIVABLE_STATUSES as unknown as string[])
      .not('delivery_date', 'is', null)
      .is('deleted_at', null)
      .order('delivery_date', { ascending: true })
      .limit(200);

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const ids = rows.map((r) => r.id);

    // Follow-up counts, one query rather than N+1.
    const countsByPoId = new Map<string, number>();
    if (ids.length > 0) {
      const { data: followUps } = await supabase
        .from('po_delivery_followups')
        .select('purchase_order_id')
        .in('purchase_order_id', ids);
      for (const f of followUps ?? []) {
        const key = (f as any).purchase_order_id as string;
        countsByPoId.set(key, (countsByPoId.get(key) ?? 0) + 1);
      }
    }

    const mapped: PendingDeliveryRow[] = rows.map((po) => ({
      id: po.id,
      po_number: po.po_number ?? null,
      po_date: po.po_date ?? null,
      delivery_date: po.delivery_date ?? null,
      status: po.status,
      total_amount: Number(po.total_amount ?? 0),
      vendor_name: po.vendors?.display_name || po.vendors?.legal_name || null,
      project_name: po.projects?.name || null,
      project_id: po.project_id ?? null,
      followUpCount: countsByPoId.get(po.id) ?? 0,
      urgency: getDeliveryUrgency(po),
    }));

    // Overdue-first, then soonest-due — daysDiff is already ascending from the
    // delivery_date sort, but re-sort explicitly so overdue (negative) always
    // leads even if the DB collation ever disagrees.
    mapped.sort((a, b) => (a.urgency.daysDiff ?? 0) - (b.urgency.daysDiff ?? 0));
    return mapped;
  } catch (error) {
    console.error('[listPendingDeliveries] falling back to demo data:', error);
    return generateDemoPendingDeliveries(projectId);
  }
}

export type PoFollowUpRow = {
  id: string;
  note: string;
  promisedDate: string | null;
  actorRole: string | null;
  actorName: string | null;
  createdAt: string;
};

/** Records a buyer's chase-up note against a PO — "called vendor, promised date X." */
export async function logPoFollowUp(
  poId: string,
  projectId: string | null,
  note: string,
  promisedDate?: string | null,
): Promise<MutationResult<{ id: string }>> {
  if (!isLiveSupabase()) {
    // Demo mode has no real persistence; the caller's optimistic UI update
    // (see delivery-followup-modal.tsx) is what makes this feel real.
    return { data: { id: `demo-followup-${Date.now()}` }, error: null };
  }

  try {
    const profileId = await currentProfileId();
    const role = await currentRole();
    const { data, error } = await supabase
      .from('po_delivery_followups')
      .insert({
        purchase_order_id: poId,
        project_id: projectId,
        note,
        promised_date: promisedDate ?? null,
        actor_id: profileId,
        actor_role: role,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { data: { id: data.id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function listPoFollowUps(poId: string): Promise<PoFollowUpRow[]> {
  if (!isLiveSupabase()) return generateDemoFollowUps(poId);

  try {
    const { data, error } = await supabase
      .from('po_delivery_followups')
      .select('id, note, promised_date, actor_role, created_at, profiles:actor_id(name)')
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      note: row.note,
      promisedDate: row.promised_date ?? null,
      actorRole: row.actor_role ?? null,
      actorName: row.profiles?.name ?? null,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('[listPoFollowUps] falling back to empty list:', error);
    return [];
  }
}
