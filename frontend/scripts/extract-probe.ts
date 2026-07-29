/**
 * End-to-end extraction check against the sample invoices, scored field-by-field
 * against hand-verified ground truth.
 *   npx tsx scripts/extract-probe.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractInvoices } from '../src/lib/ocr/extract';
import { terminateEngine } from '../src/lib/ocr/engine';
import type { ExtractedInvoice } from '../src/lib/ocr/types';

const PDF = process.argv[2]
  ?? path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');

/** Ground truth, read off the scans by eye and verified arithmetically. */
const TRUTH: Array<Record<string, unknown>> = [
  {
    'vendor.name': 'AJIT TRADING CO',
    'vendor.gstin': '24AVOPS6752N2ZN',
    'vendor.pan': 'AVOPS6752N',
    'document.invoiceNumber': 'G-2987',
    'document.invoiceDate': '2026-07-11',
    'document.challanNumber': '2987',
    'document.buyerPoNumber': 'AD/PAG/PO/2026/0122',
    'document.vendorOrderRef': '8055',
    'document.creditDays': 30,
    'document.dueDate': '2026-08-10',
    'buyer.gstin': '24ABYFA3137F1ZE',
    'totals.taxableAmount': 467365.74,
    'totals.cgstAmount': 42062.92,
    'totals.sgstAmount': 42062.92,
    'totals.roundOff': 0.42,
    'totals.grandTotal': 551492,
    'totals.totalQuantity': 188,
    'lineItems.length': 3,
    'lineItems.0.hsnSac': '69109000',
    'lineItems.0.quantity': 88,
    'lineItems.0.unitRate': 4840,
    'lineItems.0.discountPercents': [55, 15.25],
    'lineItems.0.taxableValue': 162435.24,
    'lineItems.0.unit': 'PCS',
    'lineItems.1.quantity': 50,
    'lineItems.1.unitRate': 14750,
    'lineItems.1.taxableValue': 218760.94,
    'lineItems.2.hsnSac': '39222000',
    'lineItems.2.taxableValue': 86169.56,
  },
  {
    'vendor.name': 'BHAGAVAT ENTERPRISE',
    'vendor.gstin': '24AUHPK6558N1Z1',
    'vendor.pan': 'AUHPK6558N',
    'document.invoiceNumber': 'BE-2026-27-3343',
    'document.invoiceDate': '2026-07-16',
    'document.dueDate': '2026-07-16',
    'document.buyerPoNumber': 'AC/PAM/PO/2026/0351',
    'buyer.gstin': '24ABZFA6800G1ZB',
    'transport.vehicleNumber': 'GJ05CV4633',
    'totals.taxableAmount': 7050,
    'totals.cgstAmount': 634.5,
    'totals.sgstAmount': 634.5,
    'totals.grandTotal': 8319,
    'totals.ledgerBalanceDue': 2108663,
    'lineItems.length': 1,
    'lineItems.0.description': 'JOINT FILLER IVORY 1 KG',
    'lineItems.0.hsnSac': '38241000',
    'lineItems.0.quantity': 150,
    'lineItems.0.unit': 'PKTS',
    'lineItems.0.unitRate': 47,
    'lineItems.0.taxableValue': 7050,
  },
  {
    'vendor.name': 'ARCHIT CORPORATION',
    'vendor.gstin': '24ACIPS4047H1ZI',
    'vendor.pan': 'ACIPS4047H',
    'document.invoiceNumber': '26-27/499',
    'document.invoiceDate': '2026-07-20',
    'document.dueDate': '2026-07-20',
    'document.ackNo': '162625322158405',
    'document.isEInvoice': true,
    'buyer.gstin': '24ABDFP8234D1ZG',
    'transport.transporterName': 'P N CORPORATION',
    'transport.vehicleNumber': 'GJ19Z3519',
    'transport.lrNumber': '4206',
    'totals.taxableAmount': 38771.25,
    'totals.cgstAmount': 3489.41,
    'totals.sgstAmount': 3489.41,
    'totals.grandTotal': 45750,
    'totals.roundOff': -0.07,
    'lineItems.length': 1,
    'lineItems.0.description': 'SHREE CEMENT PPC',
    'lineItems.0.hsnSac': '25232930',
    'lineItems.0.quantity': 150,
    'lineItems.0.unit': 'BAGS',
    'lineItems.0.listRate': 305,
    'lineItems.0.unitRate': 258.48,
    'lineItems.0.taxableValue': 38771.25,
  },
];

function get(obj: unknown, dotted: string): unknown {
  if (dotted.endsWith('.length')) {
    const base = dotted.slice(0, -'.length'.length);
    const v = get(obj, base);
    return Array.isArray(v) ? v.length : undefined;
  }
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function matches(got: unknown, want: unknown): boolean {
  if (Array.isArray(want)) return JSON.stringify(got) === JSON.stringify(want);
  if (typeof want === 'number' && typeof got === 'number') return Math.abs(got - want) < 0.02;
  if (typeof want === 'string' && typeof got === 'string') {
    return got.trim().toUpperCase() === want.trim().toUpperCase();
  }
  return got === want;
}

async function main() {
  const bytes = await fs.readFile(PDF);
  const t0 = Date.now();
  const outcome = await extractInvoices(bytes, { fileName: path.basename(PDF) });
  console.log(`extracted ${outcome.invoices.length} invoice(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  let totalPass = 0;
  let totalFail = 0;

  outcome.invoices.forEach((inv: ExtractedInvoice, i) => {
    const truth = TRUTH[i];
    console.log(`================= INVOICE ${i + 1} (pages ${inv.meta.pageNumbers.join(',')}) =================`);
    console.log(`  vendor=${inv.vendor.name}  invoice=${inv.document.invoiceNumber}  total=${inv.totals.grandTotal}`);
    console.log(`  confidence=${inv.validation.overallConfidence}  ocrConf=${inv.meta.ocrMeanConfidence.toFixed(1)}`);
    console.log(`  checks: line=${inv.validation.lineMathOk} tax=${inv.validation.taxMathOk} total=${inv.validation.grandTotalOk} words=${inv.validation.amountInWordsMatches}`);
    if (!truth) {
      console.log('  (no ground truth for this invoice)');
      return;
    }
    let pass = 0;
    const fails: string[] = [];
    for (const [field, want] of Object.entries(truth)) {
      const got = get(inv, field);
      if (matches(got, want)) pass++;
      else fails.push(`${field}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    }
    totalPass += pass;
    totalFail += fails.length;
    console.log(`  FIELDS ${pass}/${Object.keys(truth).length}`);
    for (const f of fails) console.log(`    MISS  ${f}`);
    if (inv.validation.warnings.length) {
      console.log('  warnings:');
      for (const w of inv.validation.warnings) console.log(`    [${w.severity}] ${w.code}: ${w.message.slice(0, 190)}`);
    }
    console.log('');
  });

  console.log(`==== TOTAL ${totalPass}/${totalPass + totalFail} fields correct ====`);
  await fs.writeFile(
    path.join('scripts', 'extract-result.json'),
    JSON.stringify(outcome.invoices, null, 2),
  );
  await terminateEngine();
  if (totalFail) process.exitCode = 1;
}

main().catch(async (e) => { console.error(e); await terminateEngine(); process.exit(1); });
