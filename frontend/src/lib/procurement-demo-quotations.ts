// ============================================================================
// DEMO QUOTATION DATA
// One fully-seeded demo RFQ with 3 vendors already quoted, scored, and ranked,
// so the real comparison-matrix UI (getQuotationComparisonMatrix in
// procurement.ts) has something to render while Supabase isn't configured.
//
// Deliberately does NOT import from procurement.ts — procurement.ts imports
// FROM this module, so an import the other way would be a cycle. Score
// calculations here are inlined rather than shared with scoreQuotation().
//
// Module-level mutable state (resets on page reload) — acceptable for a demo;
// unlike the pre-existing mockMaterialRequestsStore in procurement.ts (written
// but never read back), everything pushed in here IS read back by
// getDemoRfqBundle, so a new quote actually shows up in the matrix.
// ============================================================================

import type {
  RfqRow,
  RfqLineRow,
  VendorRow,
  QuotationScoreRow,
  RecordQuotationInput,
} from './procurement';

export const DEMO_RFQ_ID = 'demo-rfq-cp-tower-b-001';

const DEMO_VENDORS: Record<string, VendorRow> = {
  'demo-vendor-ultratech': {
    id: 'demo-vendor-ultratech',
    legal_name: 'UltraTech Cement Ltd.',
    display_name: 'UltraTech Cement Ltd.',
    rating: 4.6,
    gst_number: '24AAACU1234D1Z5',
  },
  'demo-vendor-tata-steel': {
    id: 'demo-vendor-tata-steel',
    legal_name: 'Tata Steel Ltd. (Tiscon Division)',
    display_name: 'Tata Steel Ltd. (Tiscon Division)',
    rating: 4.8,
    gst_number: '27AAACT2727Q1ZW',
  },
  'demo-vendor-ambuja': {
    id: 'demo-vendor-ambuja',
    legal_name: 'Ambuja Cements Ltd.',
    display_name: 'Ambuja Cements Ltd.',
    rating: 3.9,
    gst_number: '06AAACA0808J1ZR',
  },
};

const DEMO_RFQ_LINES: RfqLineRow[] = [
  {
    id: 'demo-rfqline-cement',
    rfq_id: DEMO_RFQ_ID,
    project_id: 'central-park',
    purchase_requisition_line_id: null,
    purchase_requisition_id: null,
    line_number: 1,
    item_id: null,
    item_code: 'CEM-OPC53',
    item_group: 'Materials',
    item_description: 'OPC 53 Grade Cement',
    specification: '50kg bags, BIS certified',
    preferred_brand: null,
    unit: 'bags',
    rfq_quantity: 2000,
    estimated_rate: 385,
    activity_name: 'Structure',
    sub_activity_name: 'Concreting',
    activity_code: null,
    required_date: null,
    remarks: null,
    status: 'open',
  },
  {
    id: 'demo-rfqline-waterproofing',
    rfq_id: DEMO_RFQ_ID,
    project_id: 'central-park',
    purchase_requisition_line_id: null,
    purchase_requisition_id: null,
    line_number: 2,
    item_id: null,
    item_code: 'WP-DRFIXIT101',
    item_group: 'Materials',
    item_description: 'Dr. Fixit 101 LW+ Liquid Waterproofing Compound',
    specification: '20L drum',
    preferred_brand: null,
    unit: 'drums',
    rfq_quantity: 120,
    estimated_rate: 2450,
    activity_name: 'Finishing',
    sub_activity_name: 'Waterproofing',
    activity_code: null,
    required_date: null,
    remarks: null,
    status: 'open',
  },
  {
    id: 'demo-rfqline-steel',
    rfq_id: DEMO_RFQ_ID,
    project_id: 'central-park',
    purchase_requisition_line_id: null,
    purchase_requisition_id: null,
    line_number: 3,
    item_id: null,
    item_code: 'STL-FE500-12MM',
    item_group: 'Materials',
    item_description: 'TMT Steel Bars Fe500 12mm',
    specification: 'IS 1786 certified',
    preferred_brand: null,
    unit: 'MT',
    rfq_quantity: 45,
    estimated_rate: 62000,
    activity_name: 'Structure',
    sub_activity_name: 'Reinforcement',
    activity_code: null,
    required_date: null,
    remarks: null,
    status: 'open',
  },
];

type DemoQuoteLine = {
  id: string;
  rfq_line_id: string;
  item_description: string;
  quantity: number;
  unit_rate: number;
  discount_percent: number;
  tax_rate: number;
  line_total: number;
  offered_qty: number;
  lead_time_days: number;
  remarks: string | null;
};

type DemoQuote = {
  id: string;
  vendor_id: string;
  quotation_number: string;
  quotation_date: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  lead_time_days: number;
  status: string;
  quotation_lines: DemoQuoteLine[];
};

function lineTotal(qty: number, rate: number, discountPct = 0): number {
  return qty * rate * (1 - discountPct / 100);
}

function buildInitialQuotes(): DemoQuote[] {
  const ultratechLines: DemoQuoteLine[] = [
    { id: 'dl-1', rfq_line_id: 'demo-rfqline-cement', item_description: 'OPC 53 Grade Cement', quantity: 2000, unit_rate: 378, discount_percent: 1, tax_rate: 28, line_total: lineTotal(2000, 378, 1), offered_qty: 2000, lead_time_days: 5, remarks: null },
  ];
  const tataLines: DemoQuoteLine[] = [
    { id: 'dl-2', rfq_line_id: 'demo-rfqline-steel', item_description: 'TMT Steel Bars Fe500 12mm', quantity: 45, unit_rate: 60500, discount_percent: 0.5, tax_rate: 18, line_total: lineTotal(45, 60500, 0.5), offered_qty: 45, lead_time_days: 7, remarks: null },
  ];
  const ambujaLines: DemoQuoteLine[] = [
    { id: 'dl-3', rfq_line_id: 'demo-rfqline-cement', item_description: 'OPC 53 Grade Cement', quantity: 2000, unit_rate: 392, discount_percent: 0, tax_rate: 28, line_total: lineTotal(2000, 392), offered_qty: 1800, lead_time_days: 10, remarks: 'Can supply 1800 bags immediately, balance in 10 days' },
  ];

  const withTotals = (id: string, vendorId: string, qNum: string, lines: DemoQuoteLine[], leadTime: number): DemoQuote => {
    const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
    const tax = lines.reduce((s, l) => s + (l.line_total * l.tax_rate) / 100, 0);
    return {
      id,
      vendor_id: vendorId,
      quotation_number: qNum,
      quotation_date: new Date().toISOString().slice(0, 10),
      subtotal_amount: subtotal,
      tax_amount: tax,
      total_amount: subtotal + tax,
      lead_time_days: leadTime,
      status: 'submitted',
      quotation_lines: lines,
    };
  };

  return [
    withTotals('demo-quote-ultratech', 'demo-vendor-ultratech', 'QT-DEMO-0001', ultratechLines, 5),
    withTotals('demo-quote-tata', 'demo-vendor-tata-steel', 'QT-DEMO-0002', tataLines, 7),
    withTotals('demo-quote-ambuja', 'demo-vendor-ambuja', 'QT-DEMO-0003', ambujaLines, 10),
  ];
}

const demoQuotes: DemoQuote[] = buildInitialQuotes();
const demoScores = new Map<string, QuotationScoreRow>();

function boundedScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

/** Mirrors procurement.ts's scoreQuotation weighting (price 40 / quality 25 / delivery 20 / performance 15). */
function computeDemoScore(quote: DemoQuote, estimateAmount: number, vendorRating: number): Omit<QuotationScoreRow, 'rank'> {
  const priceRatio = quote.total_amount / Math.max(estimateAmount, 1);
  const priceScore = boundedScore(priceRatio <= 1 ? 100 : Math.max(40, 100 - (priceRatio - 1) * 100));
  const deliveryScore = boundedScore(100 - Math.max(0, quote.lead_time_days - 7) * 3);
  const performanceScore = boundedScore((vendorRating / 5) * 100);
  const qualityScore = boundedScore((deliveryScore + performanceScore) / 2);
  const weightedScore = boundedScore(priceScore * 0.4 + qualityScore * 0.25 + deliveryScore * 0.2 + performanceScore * 0.15);
  return { price_score: priceScore, quality_score: qualityScore, delivery_score: deliveryScore, performance_score: performanceScore, weighted_score: weightedScore };
}

function recomputeAndScoreAll(): void {
  const estimateByLine = new Map(DEMO_RFQ_LINES.map((l) => [l.id, l.estimated_rate * l.rfq_quantity]));
  for (const quote of demoQuotes) {
    const estimateAmount = quote.quotation_lines.reduce(
      (sum, l) => sum + (estimateByLine.get(l.rfq_line_id) ?? l.line_total),
      0,
    );
    const vendor = DEMO_VENDORS[quote.vendor_id];
    const base = computeDemoScore(quote, estimateAmount, vendor?.rating ?? 0);
    demoScores.set(quote.id, { ...base, rank: demoScores.get(quote.id)?.rank ?? null });
  }

  const ranked = [...demoQuotes].sort((a, b) => (demoScores.get(b.id)?.weighted_score ?? 0) - (demoScores.get(a.id)?.weighted_score ?? 0));
  ranked.forEach((q, idx) => {
    const existing = demoScores.get(q.id);
    if (existing) demoScores.set(q.id, { ...existing, rank: idx + 1 });
  });
}
recomputeAndScoreAll();

export function getDemoRfqRow(): RfqRow {
  return {
    id: DEMO_RFQ_ID,
    project_id: 'central-park',
    purchase_requisition_id: 'demo-pr-cp-tower-b',
    rfq_number: 'RFQ-DEMO-2026-004',
    title: 'Cement, Waterproofing & TMT Steel — Central Park Tower B',
    issue_date: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    terms: 'Standard 30-day credit, DAP at site.',
    status: 'rfq_sent',
    rfq_vendors: Object.keys(DEMO_VENDORS).map((vendorId, idx) => ({
      id: `demo-rfqvendor-${idx}`,
      vendor_id: vendorId,
      response_status: 'submitted',
      sent_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      vendors: DEMO_VENDORS[vendorId],
    })),
  };
}

/**
 * The intermediate bundle getQuotationComparisonMatrix needs to build the rest
 * of the matrix (vendor summaries, item/L1 rows) — shaped exactly like what the
 * live Supabase queries return, so the same downstream logic works unchanged.
 */
export function getDemoRfqBundle(rfqId: string): {
  rfq: RfqRow;
  rfqLines: RfqLineRow[];
  rawQuotes: any[];
  scoresByQuote: Record<string, QuotationScoreRow>;
} | null {
  if (rfqId !== DEMO_RFQ_ID) return null;

  const rawQuotes = demoQuotes.map((q) => ({
    id: q.id,
    vendor_id: q.vendor_id,
    quotation_number: q.quotation_number,
    quotation_date: q.quotation_date,
    subtotal_amount: q.subtotal_amount,
    tax_amount: q.tax_amount,
    total_amount: q.total_amount,
    lead_time_days: q.lead_time_days,
    status: q.status,
    vendors: DEMO_VENDORS[q.vendor_id],
    quotation_lines: q.quotation_lines,
  }));

  const scoresByQuote: Record<string, QuotationScoreRow> = {};
  for (const q of demoQuotes) {
    const score = demoScores.get(q.id);
    if (score) scoresByQuote[q.id] = score;
  }

  return { rfq: getDemoRfqRow(), rfqLines: DEMO_RFQ_LINES, rawQuotes, scoresByQuote };
}

export function demoRecordQuotation(input: RecordQuotationInput): { quotationId: string } {
  const id = `demo-quote-${Date.now()}`;
  const lines: DemoQuoteLine[] = input.lines.map((line, idx) => {
    const qty = Number(line.quantity || 0);
    const rate = Number(line.unit_rate || 0);
    const discount = Math.max(0, Math.min(100, Number(line.discount_percent || 0)));
    return {
      id: `${id}-line-${idx}`,
      rfq_line_id: line.rfq_line_id || '',
      item_description: line.item_description,
      quantity: qty,
      unit_rate: rate,
      discount_percent: discount,
      tax_rate: Number(line.tax_rate || 0),
      line_total: lineTotal(qty, rate, discount),
      offered_qty: line.offered_qty != null ? Number(line.offered_qty) : qty,
      lead_time_days: Number(input.leadTimeDays || 0),
      remarks: line.remarks || null,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const tax = lines.reduce((s, l) => s + (l.line_total * l.tax_rate) / 100, 0);

  demoQuotes.push({
    id,
    vendor_id: input.vendorId,
    quotation_number: input.quotationNumber?.trim() || `QT-DEMO-${demoQuotes.length + 1}`,
    quotation_date: input.quotationDate || new Date().toISOString().slice(0, 10),
    subtotal_amount: subtotal,
    tax_amount: tax,
    total_amount: subtotal + tax,
    lead_time_days: Math.max(0, Number(input.leadTimeDays || 0)),
    status: 'submitted',
    quotation_lines: lines,
  });

  recomputeAndScoreAll();
  return { quotationId: id };
}

export function demoRecomputeQuotationRanks(rfqId: string): { ranked: number } {
  if (rfqId !== DEMO_RFQ_ID) return { ranked: 0 };
  recomputeAndScoreAll();
  return { ranked: demoQuotes.length };
}

/** Exported so callers outside this module (e.g. the OCR-import bridge) can match RFQ lines without a live query. */
export function getDemoRfqLines(): RfqLineRow[] {
  return DEMO_RFQ_LINES;
}

/** Lets the demo OCR-bridge vendor-resolution step search by name/GSTIN, same as it would against live vendors. */
export function findDemoVendorByNameOrGstin(name: string | null, gstin: string | null): VendorRow | null {
  const normalizedName = (name || '').trim().toLowerCase();
  const normalizedGstin = (gstin || '').trim().toUpperCase();
  for (const vendor of Object.values(DEMO_VENDORS)) {
    if (normalizedGstin && vendor.gst_number?.toUpperCase() === normalizedGstin) return vendor;
    if (normalizedName && vendor.legal_name.toLowerCase() === normalizedName) return vendor;
  }
  return null;
}
