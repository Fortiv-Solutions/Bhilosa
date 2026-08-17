// ============================================================================
// VENDOR PERFORMANCE SCORECARD (OTIF + rejection rate)
// Talks directly to Supabase. Kept separate from the monolithic procurement.ts
// to stay modular, mirroring the erp/purchase-requisition/service.ts pattern.
// ============================================================================

import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { generateDemoScorecard, generateDemoScorecards } from './scorecard-demo-data';

export type VendorScorecard = {
  vendorId: string;
  vendorName: string;
  windowDays: number;
  deliveriesInWindow: number;
  otifCount: number;
  otifPercent: number | null; // null when deliveriesInWindow === 0
  totalReceivedQty: number;
  totalRejectedQty: number;
  rejectionRatePercent: number | null; // null when totalReceivedQty === 0
  lateDeliveries: { count: number; avgDelayDays: number | null };
  dataSufficient: boolean; // false when deliveriesInWindow === 0
};

const DEFAULT_WINDOW_DAYS = 90;

type GrnLineRow = {
  received_qty: number | null;
  accepted_qty: number | null;
  rejected_qty: number | null;
};

type GrnRow = {
  id: string;
  receipt_date: string | null;
  purchase_order_id: string | null;
  vendor_id: string | null;
  status: string | null;
  purchase_orders?: { delivery_date: string | null; vendor_id: string | null } | { delivery_date: string | null; vendor_id: string | null }[] | null;
  goods_receipt_note_lines?: GrnLineRow[] | null;
  vendors?: { legal_name?: string | null; display_name?: string | null } | { legal_name?: string | null; display_name?: string | null }[] | null;
};

function windowStartIso(windowDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - windowDays);
  return d.toISOString().slice(0, 10);
}

function daysBetween(laterIso: string, earlierIso: string): number {
  const ms = new Date(laterIso).getTime() - new Date(earlierIso).getTime();
  return Math.round(ms / 86400000);
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Posted/approved GRN statuses only — draft GRNs haven't been verified yet. */
function isCountableGrnStatus(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase().trim();
  return s === 'posted' || s === 'approved';
}

/**
 * Aggregates a set of already-fetched GRN rows (each optionally carrying its
 * joined PO + lines) into a single vendor scorecard.
 */
function aggregateScorecard(vendorId: string, vendorName: string, windowDays: number, rows: GrnRow[]): VendorScorecard {
  let deliveriesInWindow = 0;
  let otifCount = 0;
  let otifEligible = 0; // GRNs whose PO actually carries a promised delivery_date
  let totalReceivedQty = 0;
  let totalRejectedQty = 0;
  let lateCount = 0;
  let lateDelaySum = 0;

  for (const row of rows) {
    if (!isCountableGrnStatus(row.status)) continue;
    if (!row.receipt_date) continue;

    deliveriesInWindow += 1;

    const po = firstOf(row.purchase_orders);
    const deliveryDate = po?.delivery_date || null;
    if (deliveryDate) {
      otifEligible += 1;
      if (row.receipt_date <= deliveryDate) {
        otifCount += 1;
      } else {
        lateCount += 1;
        lateDelaySum += daysBetween(row.receipt_date, deliveryDate);
      }
    }

    for (const line of row.goods_receipt_note_lines || []) {
      totalReceivedQty += Number(line.received_qty || 0);
      totalRejectedQty += Number(line.rejected_qty || 0);
    }
  }

  return {
    vendorId,
    vendorName,
    windowDays,
    deliveriesInWindow,
    otifCount,
    otifPercent: otifEligible > 0 ? Number(((otifCount / otifEligible) * 100).toFixed(1)) : null,
    totalReceivedQty,
    totalRejectedQty,
    rejectionRatePercent: totalReceivedQty > 0 ? Number(((totalRejectedQty / totalReceivedQty) * 100).toFixed(1)) : null,
    lateDeliveries: {
      count: lateCount,
      avgDelayDays: lateCount > 0 ? Number((lateDelaySum / lateCount).toFixed(1)) : null,
    },
    dataSufficient: deliveriesInWindow > 0,
  };
}

const GRN_SELECT = `
  id, receipt_date, purchase_order_id, vendor_id, status,
  purchase_orders(delivery_date, vendor_id),
  goods_receipt_note_lines(received_qty, accepted_qty, rejected_qty),
  vendors(legal_name, display_name)
`;

/** Builds a single vendor's OTIF + rejection-rate scorecard over a trailing window. */
export async function getVendorScorecard(vendorId: string, windowDays: number = DEFAULT_WINDOW_DAYS): Promise<VendorScorecard> {
  if (!isLiveSupabase()) return generateDemoScorecard(vendorId);

  try {
    const { data, error } = await supabase
      .from('goods_receipt_notes')
      .select(GRN_SELECT)
      .eq('vendor_id', vendorId)
      .gte('receipt_date', windowStartIso(windowDays))
      .is('deleted_at', null);
    if (error) throw new Error(error.message);

    const rows = (data || []) as unknown as GrnRow[];
    const vendorName =
      firstOf(rows[0]?.vendors)?.display_name || firstOf(rows[0]?.vendors)?.legal_name || 'Vendor';

    return aggregateScorecard(vendorId, vendorName, windowDays, rows);
  } catch (err) {
    console.error('getVendorScorecard failed, falling back to demo data:', err);
    return generateDemoScorecard(vendorId);
  }
}

/** Builds OTIF + rejection-rate scorecards for every vendor with deliveries in the window. */
export async function listVendorScorecards(windowDays: number = DEFAULT_WINDOW_DAYS): Promise<VendorScorecard[]> {
  if (!isLiveSupabase()) return generateDemoScorecards();

  try {
    const { data, error } = await supabase
      .from('goods_receipt_notes')
      .select(GRN_SELECT)
      .gte('receipt_date', windowStartIso(windowDays))
      .is('deleted_at', null);
    if (error) throw new Error(error.message);

    const rows = (data || []) as unknown as GrnRow[];
    const byVendor = new Map<string, GrnRow[]>();
    const namesByVendor = new Map<string, string>();

    for (const row of rows) {
      const vId = row.vendor_id || firstOf(row.purchase_orders)?.vendor_id;
      if (!vId) continue;
      if (!byVendor.has(vId)) byVendor.set(vId, []);
      byVendor.get(vId)!.push(row);
      if (!namesByVendor.has(vId)) {
        const v = firstOf(row.vendors);
        namesByVendor.set(vId, v?.display_name || v?.legal_name || 'Vendor');
      }
    }

    return Array.from(byVendor.entries()).map(([vId, vRows]) =>
      aggregateScorecard(vId, namesByVendor.get(vId) || 'Vendor', windowDays, vRows),
    );
  } catch (err) {
    console.error('listVendorScorecards failed, falling back to demo data:', err);
    return generateDemoScorecards();
  }
}
