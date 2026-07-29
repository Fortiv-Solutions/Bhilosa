/**
 * Head-to-head recogniser benchmark: PP-OCRv5 (Python service) vs bundled Tesseract.
 *
 * Runs the SAME downstream pipeline (layout, tables, GST reconciliation) against
 * both recognisers over the 3 sample invoice formats, scoring the identical
 * hand-verified fields. That isolates the variable to character recognition, which
 * is where the remaining errors were coming from.
 *
 *   # start the Python backend first:
 *   #   cd backend && uvicorn app.main:app --port 8000
 *   npx tsx scripts/engine-benchmark.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractInvoices } from '../src/lib/ocr/extract';
import { terminateEngine } from '../src/lib/ocr/engine';
import { isPaddleAvailable, resetAvailabilityCache } from '../src/lib/ocr/providers';

const PDF = path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');

/** Hand-verified ground truth, keyed by invoice number. */
const TRUTH: Record<string, Record<string, unknown>> = {
  'G-2987': {
    'vendor.name': 'AJIT TRADING CO',
    'vendor.gstin': '24AVOPS6752N2ZN',
    'buyer.gstin': '24ABYFA3137F1ZE',
    'document.invoiceDate': '2026-07-11',
    'document.challanNumber': '2987',
    'document.buyerPoNumber': 'AD/PAG/PO/2026/0122',
    'document.vendorOrderRef': '8055',
    'totals.taxableAmount': 467365.74,
    'totals.grandTotal': 551492,
    'totals.roundOff': 0.42,
    'totals.totalQuantity': 188,
    'lineItems.0.quantity': 88,
    'lineItems.0.unitRate': 4840,
    'lineItems.0.taxableValue': 162435.24,
    'lineItems.1.taxableValue': 218760.94,
    'lineItems.2.taxableValue': 86169.56,
  },
  'BE-2026-27-3343': {
    'vendor.name': 'BHAGAVAT ENTERPRISE',
    'vendor.gstin': '24AUHPK6558N1Z1',
    'buyer.gstin': '24ABZFA6800G1ZB',
    'document.invoiceDate': '2026-07-16',
    'document.buyerPoNumber': 'AC/PAM/PO/2026/0351',
    'transport.vehicleNumber': 'GJ05CV4633',
    'totals.taxableAmount': 7050,
    'totals.grandTotal': 8319,
    'totals.ledgerBalanceDue': 2108663,
    'lineItems.0.quantity': 150,
    'lineItems.0.unitRate': 47,
    'lineItems.0.taxableValue': 7050,
  },
  '26-27/499': {
    'vendor.name': 'ARCHIT CORPORATION',
    'vendor.gstin': '24ACIPS4047H1ZI',
    'buyer.gstin': '24ABDFP8234D1ZG',
    'document.invoiceDate': '2026-07-20',
    'transport.transporterName': 'P N CORPORATION',
    'transport.vehicleNumber': 'GJ19Z3519',
    'transport.lrNumber': '4206',
    'totals.taxableAmount': 38771.25,
    'totals.grandTotal': 45750,
    'totals.roundOff': -0.07,
    'lineItems.0.quantity': 150,
    'lineItems.0.unit': 'BAGS',
    'lineItems.0.taxableValue': 38771.25,
  },
};

function get(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

function matches(got: unknown, want: unknown): boolean {
  if (typeof want === 'number') return typeof got === 'number' && Math.abs(got - want) < 0.02;
  if (typeof want === 'string') return typeof got === 'string' && got.trim().toUpperCase() === want.toUpperCase();
  return got === want;
}

async function runWith(engine: 'paddle' | 'tesseract') {
  process.env.INVOICE_OCR_ENGINE = engine;
  resetAvailabilityCache();

  const bytes = await fs.readFile(PDF);
  const t0 = Date.now();
  const outcome = await extractInvoices(bytes, { fileName: 'sample_invoice.pdf' });
  const elapsed = Date.now() - t0;

  let total = 0;
  let pass = 0;
  const detail: string[] = [];
  const misses: string[] = [];

  for (const inv of outcome.invoices) {
    const key = inv.document.invoiceNumber ?? '';
    const truth = TRUTH[key];
    if (!truth) {
      detail.push(`  ?? unmatched invoice number "${key}"`);
      continue;
    }
    let localPass = 0;
    for (const [field, want] of Object.entries(truth)) {
      total++;
      if (matches(get(inv, field), want)) {
        pass++;
        localPass++;
      } else {
        misses.push(`${key}:${field} got=${JSON.stringify(get(inv, field))} want=${JSON.stringify(want)}`);
      }
    }
    detail.push(`  ${key.padEnd(18)} ${localPass}/${Object.keys(truth).length}  conf=${inv.validation.overallConfidence}`);
  }

  const expectedTotal = Object.values(TRUTH).reduce((s, t) => s + Object.keys(t).length, 0);
  return {
    engine,
    pass,
    total,
    expectedTotal,
    elapsed,
    detail,
    misses,
    recipes: outcome.diagnostics.map((d) => `p${d.pageNumber}:${d.usableWordCount}w/conf${d.meanConfidence}`),
    engines: [...new Set(outcome.invoices.map((i) => i.meta.engine))],
  };
}

async function main() {
  const probe = await isPaddleAvailable(true);
  console.log(`PaddleOCR service: ${probe.available ? 'AVAILABLE' : 'UNAVAILABLE'} — ${probe.detail.slice(0, 200)}`);
  if (!probe.available) {
    console.log('\nStart it with:\n  cd backend\n  uvicorn app.main:app --port 8000\n');
  }

  const results = [];
  for (const engine of ['tesseract', 'paddle'] as const) {
    if (engine === 'paddle' && !probe.available) {
      console.log('\nskipping paddle (service unavailable)');
      continue;
    }
    console.log(`\n${'='.repeat(74)}\nENGINE: ${engine}\n${'='.repeat(74)}`);
    try {
      const r = await runWith(engine);
      results.push(r);
      console.log(`  pages: ${r.recipes.join('  ')}`);
      console.log(`  engine reported: ${r.engines.join(' | ')}`);
      r.detail.forEach((d) => console.log(d));
      console.log(`  TOTAL ${r.pass}/${r.expectedTotal} fields correct in ${(r.elapsed / 1000).toFixed(1)}s`);
      if (r.misses.length) {
        console.log('  misses:');
        r.misses.forEach((m) => console.log(`    ${m}`));
      }
    } catch (err) {
      console.log(`  !! THREW: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    }
  }

  if (results.length === 2) {
    const [t, p] = results;
    console.log(`\n${'='.repeat(74)}\nCOMPARISON\n${'='.repeat(74)}`);
    console.log(`  tesseract : ${t.pass}/${t.expectedTotal}  ${(t.elapsed / 1000).toFixed(1)}s`);
    console.log(`  paddle    : ${p.pass}/${p.expectedTotal}  ${(p.elapsed / 1000).toFixed(1)}s`);
    const delta = p.pass - t.pass;
    console.log(`  delta     : ${delta >= 0 ? '+' : ''}${delta} fields, ${((t.elapsed - p.elapsed) / 1000).toFixed(1)}s faster`);
  }
  await terminateEngine();
}

main().catch(async (e) => { console.error(e); await terminateEngine(); process.exit(1); });
