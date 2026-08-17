import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { PO_RECEIVABLE_STATUSES } from '@/lib/erp/purchase-order/status';
import type { MrpRow } from './types';
import { generateDemoMrpRows } from './demo-data';

/** Fallback vendor lead time (days) used when no PO -> GRN history exists for an item. */
export const FALLBACK_LEAD_TIME_DAYS = 7;
/** Trailing window (days) used to compute average daily consumption from the stock ledger. */
export const CONSUMPTION_WINDOW_DAYS = 30;

const RECEIVABLE_STATUSES: readonly string[] = PO_RECEIVABLE_STATUSES;
const CONSUMPTION_TRANSACTION_TYPES = new Set(['outward', 'consumption', 'transfer_out', 'rejection']);
/** Max historical PO -> first-GRN gaps averaged per item when deriving vendor lead time. */
const LEAD_TIME_SAMPLE_SIZE = 5;

type UomLite = { code: string | null; name?: string | null };

type ItemMasterLite = {
  id: string;
  sku: string | null;
  name: string;
  min_stock_level: number | null;
  is_stock_item?: boolean | null;
  is_active?: boolean | null;
  unit_of_measurements?: UomLite | UomLite[] | null;
};

type StockBalanceLite = {
  item_id: string | null;
  project_id: string | null;
  available_qty: number | null;
};

type PoHeaderForOnOrder = { status: string | null; project_id: string | null };

type PoLineForOnOrder = {
  item_id: string | null;
  quantity: number | null;
  received_qty: number | null;
  purchase_orders?: PoHeaderForOnOrder | PoHeaderForOnOrder[] | null;
};

type StockLedgerLite = {
  item_id: string | null;
  project_id: string | null;
  transaction_type: string | null;
  quantity: number | null;
};

type BoqItemLite = {
  item_id?: string | null;
  project_id: string | null;
  description: string | null;
  code: string | null;
  estimated_qty: number | null;
};

type ProjectLite = { id: string; name: string | null };

function rowKey(projectId: string, itemId: string): string {
  return `${projectId}::${itemId}`;
}

/**
 * Normalises a Supabase embedded-resource field to a single object.
 *
 * Without generated Database types, supabase-js's select-string type
 * inference defaults every embed to an array shape at compile time even
 * though these are all many-to-one relations (a PO line has exactly one
 * purchase order, etc). This mirrors the `any`-cast pattern used elsewhere in
 * `lib/procurement.ts` for the same reason, just centralised in one helper.
 */
function embedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value ?? null;
}

/**
 * Fetches BOQ requirement lines. `item_id` may not exist yet on `boq_items`
 * (see schema.sql, shipped separately) — that column error is caught and the
 * query is retried without it, so an unmigrated database still returns BOQ
 * rows for the name/sku fallback matching performed in `computeMrpLive`.
 */
async function fetchBoqItems(): Promise<BoqItemLite[]> {
  const withItemId = await supabase
    .from('boq_items')
    .select('item_id, project_id, description, code, estimated_qty');
  if (!withItemId.error) {
    return (withItemId.data || []) as BoqItemLite[];
  }

  const withoutItemId = await supabase
    .from('boq_items')
    .select('project_id, description, code, estimated_qty');
  if (withoutItemId.error) throw new Error(withoutItemId.error.message);
  return ((withoutItemId.data || []) as Omit<BoqItemLite, 'item_id'>[]).map((row) => ({
    ...row,
    item_id: null,
  }));
}

/**
 * Average vendor lead time per item, in days, derived from the gap between a
 * purchase order's `po_date` and the first goods receipt posted against its
 * lines (last few POs per item, most recent first).
 *
 * Best-effort: any failure here (missing tables, no history yet) is
 * swallowed and logged rather than thrown, so a lead-time query problem never
 * blanks out the rest of the MRP board — callers just fall back to
 * FALLBACK_LEAD_TIME_DAYS for the affected items.
 */
async function fetchVendorLeadTimeDaysByItem(): Promise<Map<string, number>> {
  const leadTimes = new Map<string, number>();
  try {
    const { data: poLines, error: poLinesError } = await supabase
      .from('purchase_order_lines')
      .select('id, item_id, purchase_orders(po_date)')
      .not('item_id', 'is', null);
    if (poLinesError) throw new Error(poLinesError.message);

    type PoLineForLeadTime = { id: string; item_id: string | null; purchase_orders?: { po_date: string | null } | { po_date: string | null }[] | null };
    const poLineRows = (poLines || []) as unknown as PoLineForLeadTime[];
    const poLineIds = poLineRows.map((row) => row.id);
    if (poLineIds.length === 0) return leadTimes;

    const { data: grnLines, error: grnLinesError } = await supabase
      .from('goods_receipt_note_lines')
      .select('purchase_order_line_id, goods_receipt_notes(receipt_date)')
      .in('purchase_order_line_id', poLineIds);
    if (grnLinesError) throw new Error(grnLinesError.message);

    type GrnLineForLeadTime = {
      purchase_order_line_id: string | null;
      goods_receipt_notes?: { receipt_date: string | null } | { receipt_date: string | null }[] | null;
    };
    const firstReceiptByLine = new Map<string, string>();
    for (const grnLine of (grnLines || []) as unknown as GrnLineForLeadTime[]) {
      const lineId = grnLine.purchase_order_line_id;
      const receiptDate = embedOne(grnLine.goods_receipt_notes)?.receipt_date;
      if (!lineId || !receiptDate) continue;
      const existing = firstReceiptByLine.get(lineId);
      if (!existing || receiptDate < existing) firstReceiptByLine.set(lineId, receiptDate);
    }

    const gapsByItem = new Map<string, { gapDays: number; poDate: string }[]>();
    for (const line of poLineRows) {
      const poDate = embedOne(line.purchase_orders)?.po_date;
      const receiptDate = firstReceiptByLine.get(line.id);
      if (!line.item_id || !poDate || !receiptDate) continue;
      const gapDays = (new Date(receiptDate).getTime() - new Date(poDate).getTime()) / 86400000;
      if (!Number.isFinite(gapDays) || gapDays < 0) continue;
      const list = gapsByItem.get(line.item_id) || [];
      list.push({ gapDays, poDate });
      gapsByItem.set(line.item_id, list);
    }

    for (const [itemId, gaps] of gapsByItem) {
      const recent = gaps.sort((a, b) => (a.poDate < b.poDate ? 1 : -1)).slice(0, LEAD_TIME_SAMPLE_SIZE);
      const avg = recent.reduce((sum, g) => sum + g.gapDays, 0) / recent.length;
      leadTimes.set(itemId, avg);
    }
  } catch (error) {
    console.error('[mrp] Vendor lead time derivation failed, using the fallback lead time instead:', error);
  }
  return leadTimes;
}

async function computeMrpLive(projectId?: string): Promise<MrpRow[]> {
  const filterByProject = Boolean(projectId && projectId !== 'all');

  const [itemsRes, projectsRes, balancesRes, poLinesRes, ledgerRes, boqRows, leadTimeByItem] = await Promise.all([
    supabase
      .from('item_master')
      .select('id, sku, name, min_stock_level, is_stock_item, is_active, unit_of_measurements(code, name)'),
    supabase.from('projects').select('id, name'),
    supabase.from('stock_balances').select('item_id, project_id, available_qty'),
    supabase
      .from('purchase_order_lines')
      .select('item_id, quantity, received_qty, purchase_orders(status, project_id)'),
    supabase
      .from('stock_ledger')
      .select('item_id, project_id, transaction_type, quantity')
      .gte(
        'transaction_date',
        new Date(Date.now() - CONSUMPTION_WINDOW_DAYS * 86400000).toISOString().slice(0, 10),
      ),
    fetchBoqItems(),
    fetchVendorLeadTimeDaysByItem(),
  ]);

  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (balancesRes.error) throw new Error(balancesRes.error.message);
  if (poLinesRes.error) throw new Error(poLinesRes.error.message);
  if (ledgerRes.error) throw new Error(ledgerRes.error.message);

  const items = (itemsRes.data || []) as unknown as ItemMasterLite[];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const projectNameById = new Map(
    ((projectsRes.data || []) as ProjectLite[]).map((project) => [project.id, project.name || 'Project']),
  );

  const onHandByKey = new Map<string, number>();
  for (const balance of (balancesRes.data || []) as StockBalanceLite[]) {
    if (!balance.item_id || !balance.project_id) continue;
    if (filterByProject && balance.project_id !== projectId) continue;
    const key = rowKey(balance.project_id, balance.item_id);
    onHandByKey.set(key, (onHandByKey.get(key) || 0) + Number(balance.available_qty || 0));
  }

  const onOrderByKey = new Map<string, number>();
  for (const line of (poLinesRes.data || []) as unknown as PoLineForOnOrder[]) {
    const poHeader = embedOne(line.purchase_orders);
    const status = poHeader?.status;
    const lineProjectId = poHeader?.project_id;
    if (!line.item_id || !lineProjectId || !status) continue;
    if (!RECEIVABLE_STATUSES.includes(status)) continue;
    if (filterByProject && lineProjectId !== projectId) continue;
    const outstanding = Math.max(0, Number(line.quantity || 0) - Number(line.received_qty || 0));
    const key = rowKey(lineProjectId, line.item_id);
    onOrderByKey.set(key, (onOrderByKey.get(key) || 0) + outstanding);
  }

  const consumptionByKey = new Map<string, number>();
  for (const entry of (ledgerRes.data || []) as StockLedgerLite[]) {
    if (!entry.item_id || !entry.project_id) continue;
    if (!entry.transaction_type || !CONSUMPTION_TRANSACTION_TYPES.has(entry.transaction_type)) continue;
    if (filterByProject && entry.project_id !== projectId) continue;
    const key = rowKey(entry.project_id, entry.item_id);
    consumptionByKey.set(key, (consumptionByKey.get(key) || 0) + Math.abs(Number(entry.quantity || 0)));
  }

  // BOQ requirement matching: by item_id first (when the column/link exists),
  // else by ILIKE-equivalent name/sku matching against description/code.
  const boqByItemId = new Map<string, number>();
  const unmatchedBoq: { projectId: string; haystack: string; qty: number }[] = [];
  for (const boq of boqRows) {
    if (!boq.project_id) continue;
    if (filterByProject && boq.project_id !== projectId) continue;
    const qty = Number(boq.estimated_qty || 0);
    if (boq.item_id && itemById.has(boq.item_id)) {
      const key = rowKey(boq.project_id, boq.item_id);
      boqByItemId.set(key, (boqByItemId.get(key) || 0) + qty);
    } else {
      unmatchedBoq.push({
        projectId: boq.project_id,
        haystack: `${boq.description || ''} ${boq.code || ''}`.toLowerCase(),
        qty,
      });
    }
  }

  const boqByNameMatch = new Map<string, number>();
  for (const boq of unmatchedBoq) {
    const match = items.find((item) => {
      if (item.sku && boq.haystack.includes(item.sku.toLowerCase())) return true;
      if (item.name && boq.haystack.includes(item.name.toLowerCase())) return true;
      return false;
    });
    if (!match) continue;
    const key = rowKey(boq.projectId, match.id);
    boqByNameMatch.set(key, (boqByNameMatch.get(key) || 0) + boq.qty);
  }

  // Row basis: every (project, item) combo touched by on-hand stock, an open
  // PO, or a matched BOQ line — so an item with a BOQ requirement but zero
  // stock history still surfaces, rather than only ever showing items that
  // already have a stock_balances row.
  const allKeys = new Set<string>([
    ...onHandByKey.keys(),
    ...onOrderByKey.keys(),
    ...boqByItemId.keys(),
    ...boqByNameMatch.keys(),
  ]);

  const rows: MrpRow[] = [];
  for (const key of allKeys) {
    const separatorIndex = key.indexOf('::');
    const rowProjectId = key.slice(0, separatorIndex);
    const itemId = key.slice(separatorIndex + 2);
    const item = itemById.get(itemId);
    if (!item) continue; // Stale reference (e.g. a deleted item) — skip rather than render a blank row.

    const onHandQty = onHandByKey.get(key) || 0;
    const onOrderQty = onOrderByKey.get(key) || 0;
    const availablePosition = onHandQty + onOrderQty;
    const totalConsumption = consumptionByKey.get(key) || 0;
    const avgDailyConsumption = totalConsumption / CONSUMPTION_WINDOW_DAYS;
    const vendorLeadTimeDays = leadTimeByItem.get(itemId) ?? FALLBACK_LEAD_TIME_DAYS;
    const safetyStock = Number(item.min_stock_level || 0);
    const reorderPoint = avgDailyConsumption * vendorLeadTimeDays + safetyStock;
    const uom = embedOne(item.unit_of_measurements);

    let boqRequiredQty = 0;
    let boqMatchConfidence: MrpRow['boqMatchConfidence'] = 'unmatched';
    if (boqByItemId.has(key)) {
      boqRequiredQty = boqByItemId.get(key)!;
      boqMatchConfidence = 'item_id';
    } else if (boqByNameMatch.has(key)) {
      boqRequiredQty = boqByNameMatch.get(key)!;
      boqMatchConfidence = 'name_match';
    }

    rows.push({
      itemId,
      itemName: item.name,
      sku: item.sku,
      uom: uom?.code || uom?.name || 'unit',
      projectId: rowProjectId,
      projectName: projectNameById.get(rowProjectId) || 'Project',
      boqRequiredQty,
      onHandQty,
      onOrderQty,
      netRequirementQty: Math.max(0, boqRequiredQty - availablePosition),
      avgDailyConsumption,
      vendorLeadTimeDays,
      safetyStock,
      reorderPoint,
      availablePosition,
      reorderFlag: availablePosition < reorderPoint,
      boqMatchConfidence,
    });
  }

  rows.sort((a, b) => a.projectName.localeCompare(b.projectName) || a.itemName.localeCompare(b.itemName));
  return rows;
}

/**
 * Computes the Material Requirement Planning board for a project (or every
 * project when omitted). Falls back to deterministic demo data whenever
 * Supabase is not configured, and — since the live schema this queries
 * against may not be fully migrated yet (see schema.sql) — also falls back
 * to demo data on any live-query failure, logging the cause instead of
 * throwing so the page never crashes on a schema mismatch.
 */
export async function computeMrp(projectId?: string): Promise<MrpRow[]> {
  if (!isLiveSupabase()) return generateDemoMrpRows(projectId);
  try {
    return await computeMrpLive(projectId);
  } catch (error) {
    console.error('[mrp] Live MRP computation failed, falling back to demo data:', error);
    return generateDemoMrpRows(projectId);
  }
}
