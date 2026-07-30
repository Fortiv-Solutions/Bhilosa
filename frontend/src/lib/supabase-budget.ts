// ============================================================================
// PRAMUKH GROUP ERP V2 — SUPABASE BUDGET SERVICE LAYER
// File: frontend/src/lib/supabase-budget.ts
// Description: Real-time Supabase client queries & mutations for Budget, Variance,
//              Revision History, Bill-Wise Ledger & Cross-Module sync.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { MasterBudgetCategory, MasterBudgetItem } from './budget';
import { CENTRAL_PARK_MASTER_BUDGET_CATEGORIES } from './central-park-budget-data';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const CENTRAL_PARK_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

export interface SupabaseMasterBudgetItem {
  id: string;
  project_id: string;
  category_id?: string;
  category_name?: string;
  sr_no: string;
  item_description: string;
  qty_rcc: number | null;
  qty_finishes: number | null;
  qty_infra: number | null;
  qty_total: number;
  unit: string;
  estimated_rate: number;
  budgeted_cost: number;
  cost_per_bua: number;
  scope_tag?: string;
  item_type?: string;
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
// 1. FETCH FULL MASTER BUDGET CATEGORIES FROM SUPABASE
// ----------------------------------------------------------------------------
export async function fetchFullMasterBudgetCategoriesFromSupabase(projectId: string = CENTRAL_PARK_PROJECT_ID): Promise<MasterBudgetCategory[]> {
  try {
    // A. Fetch Categories
    const { data: dbCategories, error: catErr } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    // B. Fetch Master Items
    const { data: dbItems, error: itemErr } = await supabase
      .from('master_budget_items')
      .select('*')
      .eq('project_id', projectId)
      .order('sr_no', { ascending: true });

    if (catErr || itemErr || !dbCategories || dbCategories.length === 0) {
      console.warn('Supabase categories or items not found, serving Central Park fallback seed');
      return CENTRAL_PARK_MASTER_BUDGET_CATEGORIES;
    }

    // Group items by category_id or category_name
    const result: MasterBudgetCategory[] = dbCategories.map((catRow) => {
      const matchingItems = (dbItems || [])
        .filter((item) => item.category_id === catRow.id || item.category_name === catRow.category_name)
        .map((itemRow): MasterBudgetItem => ({
          id: itemRow.id,
          srNo: itemRow.sr_no,
          category: catRow.category_name,
          item: itemRow.item_description,
          qtyRcc: itemRow.qty_rcc,
          qtyFinishes: itemRow.qty_finishes,
          qtyInfra: itemRow.qty_infra,
          qtyTotal: Number(itemRow.qty_total || 1),
          unit: itemRow.unit || 'LS',
          rate: Number(itemRow.estimated_rate || 0),
          cost: Number(itemRow.budgeted_cost || 0),
          costPerBua: Number(itemRow.cost_per_bua || 0),
          scopeTag: itemRow.scope_tag as any || 'site_infra',
          itemType: itemRow.item_type as any || 'material',
        }));

      const catTotalCost = matchingItems.reduce((sum, item) => sum + item.cost, 0);

      return {
        id: catRow.id,
        categoryName: catRow.category_name,
        categoryCode: catRow.category_code || 'CAT',
        items: matchingItems,
        totalCost: catTotalCost,
        totalCostPerBua: Number((catTotalCost / 615000).toFixed(2)),
      };
    });

    return result;
  } catch (err) {
    console.error('Error fetching master budget from Supabase:', err);
    return CENTRAL_PARK_MASTER_BUDGET_CATEGORIES;
  }
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

  if (revError) console.error('Supabase revision log error:', revError);

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
export async function fetchRevisionHistoryFromSupabase(projectId: string = CENTRAL_PARK_PROJECT_ID): Promise<SupabaseBudgetRevision[]> {
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
export function subscribeToBudgetRealtimeChanges(projectId: string = CENTRAL_PARK_PROJECT_ID, onUpdate: () => void) {
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
