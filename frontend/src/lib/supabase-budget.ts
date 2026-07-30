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
export function shortenProjectName(name: string): string {
  if (!name) return 'All Projects';
  return name
    .replace(/Pramukh /gi, '')
    .replace(/ Residential Project/gi, '')
    .replace(/ Project/gi, '')
    .replace(/ Commercial Tower/gi, ' Commercial')
    .trim();
}

export async function fetchFullMasterBudgetCategoriesFromSupabase(projectId: string = CENTRAL_PARK_PROJECT_ID): Promise<MasterBudgetCategory[]> {
  try {
    const isAll = !projectId || projectId === 'all' || projectId === 'ALL';

    // A. Fetch Categories
    let catQuery = supabase.from('budget_categories').select('*').order('sort_order', { ascending: true });
    if (!isAll) {
      catQuery = catQuery.eq('project_id', projectId);
    }
    const { data: dbCategories, error: catErr } = await catQuery;

    // B. Fetch Master Items
    let itemQuery = supabase.from('master_budget_items').select('*').order('sr_no', { ascending: true });
    if (!isAll) {
      itemQuery = itemQuery.eq('project_id', projectId);
    }
    const { data: dbItems, error: itemErr } = await itemQuery;

    // C. Fetch Variance Items for Real Actual Billed Spend
    let varQuery = supabase.from('budget_variance_items').select('*');
    if (!isAll) {
      varQuery = varQuery.eq('project_id', projectId);
    }
    const { data: dbVarianceItems } = await varQuery;

    const varianceMap = new Map<string, any>();
    if (dbVarianceItems) {
      dbVarianceItems.forEach(v => {
        if (v.master_budget_item_id) varianceMap.set(v.master_budget_item_id, v);
      });
    }

    if (catErr || itemErr || !dbCategories || dbCategories.length === 0) {
      console.warn('Supabase categories or items not found, serving Central Park fallback seed');
      return CENTRAL_PARK_MASTER_BUDGET_CATEGORIES;
    }

    // Group items by category_id or category_name
    const result: MasterBudgetCategory[] = dbCategories.map((catRow) => {
      const matchingItems = (dbItems || [])
        .filter((item) => item.category_id === catRow.id || item.category_name === catRow.category_name)
        .map((itemRow): MasterBudgetItem => {
          const varRow = varianceMap.get(itemRow.id);
          return {
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
            poQty: varRow ? Number(varRow.po_qty || 0) : 0,
            poRate: varRow ? Number(varRow.po_rate || 0) : 0,
            poAmount: varRow ? Number(varRow.po_amount || 0) : 0,
            actualBillQty: varRow ? Number(varRow.actual_bill_qty || 0) : 0,
            actualBillRate: varRow ? Number(varRow.actual_bill_rate || 0) : 0,
            actualTotalCost: varRow ? Number(varRow.actual_total_cost || 0) : 0,
            remark: varRow ? varRow.remark : undefined,
          };
        });

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
  const isAll = !projectId || projectId === 'all' || projectId === 'ALL';
  const filterStr = isAll ? undefined : `project_id=eq.${projectId}`;

  const channel = supabase
    .channel(`realtime-budget-${projectId || 'all'}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budget_allocations', filter: filterStr },
      () => onUpdate()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budget_ledger', filter: filterStr },
      () => onUpdate()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'master_budget_items', filter: filterStr },
      () => onUpdate()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'budget_variance_items', filter: filterStr },
      () => onUpdate()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ----------------------------------------------------------------------------
// 5. SAVE VARIANCE ITEM EDITS TO SUPABASE REAL-TIME
// ----------------------------------------------------------------------------
export async function updateVarianceItemInSupabase(
  masterItemId: string,
  actualBillQty: number,
  actualBillRate: number,
  remark: string,
  projectId: string = CENTRAL_PARK_PROJECT_ID
) {
  const actualTotalCost = Math.round(actualBillQty * actualBillRate);

  const { data, error } = await supabase
    .from('budget_variance_items')
    .update({
      actual_bill_qty: actualBillQty,
      actual_bill_rate: actualBillRate,
      actual_total_cost: actualTotalCost,
      remark: remark,
      work_status: actualTotalCost > 0 ? 'In Progress' : 'Not Started',
      updated_at: new Date().toISOString()
    })
    .eq('master_budget_item_id', masterItemId)
    .eq('project_id', projectId);

  if (error) {
    console.error('Error updating variance item in Supabase:', error);
  }
  return { data, error };
}
