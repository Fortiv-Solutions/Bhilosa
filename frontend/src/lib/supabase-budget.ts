// ============================================================================
// PRAMUKH GROUP ERP V2 — SUPABASE BUDGET SERVICE LAYER
// File: frontend/src/lib/supabase-budget.ts
// Description: Real-time Supabase client queries & mutations for Budget, Variance,
//              Revision History, Bill-Wise Ledger & Cross-Module sync.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SupabaseMasterBudgetItem {
  id: string;
  project_id: string;
  category_name: string;
  sr_no: string;
  item_description: string;
  qty_rcc: number;
  qty_finishes: number;
  qty_infra: number;
  qty_total: number;
  unit: string;
  estimated_rate: number;
  budgeted_cost: number;
  cost_per_bua: number;
  version_number: number;
}

export interface SupabaseBudgetRevision {
  id: string;
  project_id: string;
  version_number: number;
  version_label: string;
  justification_reason: string;
  old_total_cost: number;
  new_total_cost: number;
  net_diff_amount: number;
  edited_by_name: string;
  created_at: string;
}

// ----------------------------------------------------------------------------
// 1. FETCH MASTER BUDGET ITEMS FROM SUPABASE
// ----------------------------------------------------------------------------
export async function fetchMasterBudgetFromSupabase(projectId: string): Promise<SupabaseMasterBudgetItem[]> {
  const { data, error } = await supabase
    .from('master_budget_items')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('sr_no', { ascending: true });

  if (error) {
    console.error('Error fetching master budget from Supabase:', error);
    return [];
  }
  return data || [];
}

// ----------------------------------------------------------------------------
// 2. SAVE IN-CONTEXT BUDGET REVISION (v1 -> v2) TO SUPABASE
// ----------------------------------------------------------------------------
export async function saveBudgetRevisionToSupabase(
  projectId: string,
  newVersionNo: number,
  justificationReason: string,
  oldTotalCost: number,
  newTotalCost: number,
  editedByName: string,
  updatedItems: Partial<SupabaseMasterBudgetItem>[]
) {
  // A. Create Revision Audit Log
  const { data: revision, error: revError } = await supabase
    .from('budget_revisions')
    .insert({
      project_id: projectId,
      version_number: newVersionNo,
      version_label: `Version v${newVersionNo} (Change Order)`,
      justification_reason: justificationReason,
      old_total_cost: oldTotalCost,
      new_total_cost: newTotalCost,
      net_diff_amount: newTotalCost - oldTotalCost,
      edited_by_name: editedByName,
    })
    .select()
    .single();

  if (revError) throw revError;

  // B. Upsert Master Budget Items with updated version number
  for (const item of updatedItems) {
    if (item.id) {
      await supabase
        .from('master_budget_items')
        .update({
          qty_rcc: item.qty_rcc,
          qty_finishes: item.qty_finishes,
          qty_infra: item.qty_infra,
          qty_total: item.qty_total,
          estimated_rate: item.estimated_rate,
          budgeted_cost: item.budgeted_cost,
          cost_per_bua: item.cost_per_bua,
          version_number: newVersionNo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
    }
  }

  return revision;
}

// ----------------------------------------------------------------------------
// 3. FETCH REVISION HISTORY AUDIT LOGS
// ----------------------------------------------------------------------------
export async function fetchRevisionHistoryFromSupabase(projectId: string): Promise<SupabaseBudgetRevision[]> {
  const { data, error } = await supabase
    .from('budget_revisions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching revision history:', error);
    return [];
  }
  return data || [];
}

// ----------------------------------------------------------------------------
// 4. REAL-TIME SUBSCRIPTION LISTENER FOR CROSS-MODULE BUDGET SYNC
// ----------------------------------------------------------------------------
export function subscribeToBudgetRealtimeChanges(projectId: string, onUpdate: () => void) {
  const channel = supabase
    .channel(`realtime-budget-${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budget_allocations', filter: `project_id=eq.${projectId}` },
      () => onUpdate()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budget_ledger', filter: `project_id=eq.${projectId}` },
      () => onUpdate()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'master_budget_items', filter: `project_id=eq.${projectId}` },
      () => onUpdate()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
