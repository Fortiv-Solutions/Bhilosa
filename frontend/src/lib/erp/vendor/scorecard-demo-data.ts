// ============================================================================
// VENDOR SCORECARD — DEMO DATA
// Fixed, deterministic fixtures used whenever Supabase is not configured (see
// isLiveSupabase() in '@/lib/erp/supabase-modules'). Five fabricated vendors
// with deliberately different OTIF / rejection-rate profiles so the scorecard
// UI has real contrast to render, without ever hitting the network.
// ============================================================================

import type { VendorScorecard } from './scorecard';

const DEMO_WINDOW_DAYS = 90;

/**
 * Five seeded vendors spanning strong / middling / weak delivery performance.
 * Vendor names deliberately echo the ones used in the RFQ quotation-comparison
 * mock (UltraTech Cement, Tata Steel) for continuity across the app, plus
 * three invented construction-supplier names in the same register.
 */
const DEMO_SCORECARDS: VendorScorecard[] = [
  {
    // Strong performer: near-perfect OTIF, negligible rejections.
    vendorId: 'vendor-demo-ultratech-cement',
    vendorName: 'UltraTech Cement Ltd.',
    windowDays: DEMO_WINDOW_DAYS,
    deliveriesInWindow: 22,
    otifCount: 21,
    otifPercent: 95.5,
    totalReceivedQty: 4400,
    totalRejectedQty: 44,
    rejectionRatePercent: 1.0,
    lateDeliveries: { count: 1, avgDelayDays: 1 },
    dataSufficient: true,
  },
  {
    // Middling performer: acceptable but not stellar.
    vendorId: 'vendor-demo-tata-steel',
    vendorName: 'Tata Steel Ltd. (Tiscon Division)',
    windowDays: DEMO_WINDOW_DAYS,
    deliveriesInWindow: 18,
    otifCount: 15,
    otifPercent: 83.3,
    totalReceivedQty: 3100,
    totalRejectedQty: 93,
    rejectionRatePercent: 3.0,
    lateDeliveries: { count: 3, avgDelayDays: 3 },
    dataSufficient: true,
  },
  {
    // Weak performer: chronically late and a high reject rate.
    vendorId: 'vendor-demo-drfixit-waterproofing',
    vendorName: 'Dr. Fixit Waterproofing & Sealants Co.',
    windowDays: DEMO_WINDOW_DAYS,
    deliveriesInWindow: 14,
    otifCount: 9,
    otifPercent: 64.3,
    totalReceivedQty: 1200,
    totalRejectedQty: 86,
    rejectionRatePercent: 7.2,
    lateDeliveries: { count: 5, avgDelayDays: 6 },
    dataSufficient: true,
  },
  {
    // Strong-ish specialty supplier.
    vendorId: 'vendor-demo-bhoomi-aac-blocks',
    vendorName: 'Bhoomi AAC Blocks Pvt. Ltd.',
    windowDays: DEMO_WINDOW_DAYS,
    deliveriesInWindow: 16,
    otifCount: 15,
    otifPercent: 93.8,
    totalReceivedQty: 2600,
    totalRejectedQty: 39,
    rejectionRatePercent: 1.5,
    lateDeliveries: { count: 1, avgDelayDays: 2 },
    dataSufficient: true,
  },
  {
    // Middling-to-weak electrical & plumbing supplier.
    vendorId: 'vendor-demo-supreme-electricals',
    vendorName: 'Supreme Electricals & Plumbing Traders',
    windowDays: DEMO_WINDOW_DAYS,
    deliveriesInWindow: 11,
    otifCount: 8,
    otifPercent: 72.7,
    totalReceivedQty: 980,
    totalRejectedQty: 44,
    rejectionRatePercent: 4.5,
    lateDeliveries: { count: 3, avgDelayDays: 4 },
    dataSufficient: true,
  },
];

function insufficientDataScorecard(vendorId: string, vendorName: string, windowDays: number): VendorScorecard {
  return {
    vendorId,
    vendorName,
    windowDays,
    deliveriesInWindow: 0,
    otifCount: 0,
    otifPercent: null,
    totalReceivedQty: 0,
    totalRejectedQty: 0,
    rejectionRatePercent: null,
    lateDeliveries: { count: 0, avgDelayDays: null },
    dataSufficient: false,
  };
}

/** Returns the fixed 5-vendor demo dataset (deterministic, not random). */
export function generateDemoScorecards(): VendorScorecard[] {
  return DEMO_SCORECARDS;
}

/**
 * Looks up a single demo vendor by id. Falls back to a generic
 * "insufficient data" scorecard for any id outside the 5 seeded vendors, so
 * calling this with an arbitrary (e.g. live-mode-shaped) vendor id never
 * throws.
 */
export function generateDemoScorecard(vendorId: string): VendorScorecard {
  const match = DEMO_SCORECARDS.find((c) => c.vendorId === vendorId);
  if (match) return match;
  return insufficientDataScorecard(vendorId, 'Unknown Vendor', DEMO_WINDOW_DAYS);
}
