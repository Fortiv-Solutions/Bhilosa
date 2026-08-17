/**
 * Material Requirement Planning (MRP) row.
 *
 * One row per (project, stock item) pair: BOQ requirement netted against
 * on-hand stock and open purchase orders, plus a reorder signal derived from
 * trailing consumption and vendor lead time. See `service.ts` for how this is
 * computed against the live Supabase schema, and `demo-data.ts` for the
 * fixture used when Supabase is not configured.
 */
export type MrpRow = {
  itemId: string;
  itemName: string;
  sku: string | null;
  uom: string;
  projectId: string;
  projectName: string;
  /** Total quantity required per the project's BOQ for this item. */
  boqRequiredQty: number;
  /** Currently available stock at the project (stock_balances.available_qty). */
  onHandQty: number;
  /** Quantity still outstanding on receivable purchase orders for this item. */
  onOrderQty: number;
  /** max(0, boqRequiredQty - (onHandQty + onOrderQty)). */
  netRequirementQty: number;
  /** Average quantity consumed per day over the trailing consumption window. */
  avgDailyConsumption: number;
  /** Average vendor lead time in days, derived from PO->GRN history or a fallback. */
  vendorLeadTimeDays: number;
  /** Minimum buffer stock (item_master.min_stock_level or 0). */
  safetyStock: number;
  /** avgDailyConsumption * vendorLeadTimeDays + safetyStock. */
  reorderPoint: number;
  /** onHandQty + onOrderQty. */
  availablePosition: number;
  /** true when availablePosition < reorderPoint. */
  reorderFlag: boolean;
  /** How the BOQ requirement was matched to this item. */
  boqMatchConfidence: 'item_id' | 'name_match' | 'unmatched';
};
