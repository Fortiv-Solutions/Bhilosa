/** Per-page field extraction debug, using the cached page OCR.
 *  npx tsx scripts/fields-probe.ts */
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectRotation, ocrPdfPage, terminateEngine } from '../src/lib/ocr/engine';
import { countPdfPages } from '../src/lib/ocr/render';
import { PageIndex } from '../src/lib/ocr/geometry';
import {
  extractBuyerAndShipTo, extractDocumentInfo, extractPayment, extractTotals, extractTransport,
  extractVendor, findGstins, type FieldContext,
} from '../src/lib/ocr/fields';
import type { ExtractionWarning, OcrPage } from '../src/lib/ocr/types';

const PDF = path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');
const CACHE = path.resolve(process.cwd(), 'scripts', '.ocr-cache');

async function loadPages(): Promise<OcrPage[]> {
  await fs.mkdir(CACHE, { recursive: true });
  const bytes = new Uint8Array(await fs.readFile(PDF));
  const n = await countPdfPages(bytes);
  const out: OcrPage[] = [];
  for (let i = 0; i < n; i++) {
    const f = path.join(CACHE, `p${i + 1}.json`);
    try {
      const c = JSON.parse(await fs.readFile(f, 'utf8'));
      c.image = Buffer.from(c.image, 'base64');
      out.push(c as OcrPage);
      continue;
    } catch { /* miss */ }
    const rot = (await detectRotation(bytes, i)).rotation;
    const p = await ocrPdfPage(bytes, i, { rotation: rot });
    await fs.writeFile(f, JSON.stringify({ ...p, image: p.image.toString('base64') }));
    out.push(p);
  }
  return out;
}

async function main() {
  const pages = await loadPages();
  await terminateEngine();

  for (const page of pages) {
    const idx = new PageIndex(page);
    const warnings: ExtractionWarning[] = [];
    const ctx: FieldContext = {
      idx, text: page.text,
      warn: (w) => warnings.push(w),
      confidence: () => {},
    };
    console.log(`\n============ PAGE ${page.pageNumber} (rot ${page.rotation}) ============`);

    console.log('  GSTINs found: ' + findGstins(idx).map((g) => `${g.value}${g.repaired ? `(repaired${g.edits})` : ''}@y${Math.round(g.bbox.y0)}`).join('  '));

    // What do the invoice-number labels actually resolve to?
    for (const alias of ['Invoice No.', 'Invoice #', 'Invoice Number', 'Invoice', 'Invoice Date', 'Due Date']) {
      const hits = idx.findLabels(alias).slice(0, 3);
      if (!hits.length) continue;
      console.log(`  label "${alias}" -> ` + hits.map((h) => {
        const v = idx.valueForLabel(h, { maxRightGap: idx.lineHeight * 14, allowBelow: false });
        return `[y${Math.round(h.bbox.y0)} x${Math.round(h.bbox.x0)} "${h.text}" e${h.edits} => "${v.text.split('\n')[0].slice(0, 40)}"]`;
      }).join(' '));
    }

    const { buyer, shipTo, claimedGstins } = extractBuyerAndShipTo(ctx);
    const vendor = extractVendor(ctx, claimedGstins);
    const doc = extractDocumentInfo(ctx);
    const transport = extractTransport(ctx);
    const totals = extractTotals(ctx, null);
    const payment = extractPayment(ctx);

    console.log(`  vendor:   name="${vendor.name}" gstin=${vendor.gstin} pan=${vendor.pan}`);
    console.log(`  buyer:    name="${buyer.name}" gstin=${buyer.gstin} site=${buyer.siteName}`);
    console.log(`  shipTo:   name="${shipTo.name}" gstin=${shipTo.gstin} site=${shipTo.siteName}`);
    console.log(`  document: no=${doc.invoiceNumber} date=${doc.invoiceDate} due=${doc.dueDate} credit=${doc.creditDays}`);
    console.log(`            challan=${doc.challanNumber} po=${doc.buyerPoNumber}(${doc.buyerPoNumberSource}) vendorRef=${doc.vendorOrderRef}`);
    console.log(`            irn=${doc.irn ? doc.irn.slice(0, 20) + '...' : null} ack=${doc.ackNo} eInv=${doc.isEInvoice} pos=${doc.placeOfSupply}`);
    console.log(`  transport: name=${transport.transporterName} veh=${transport.vehicleNumber} lr=${transport.lrNumber} station=${transport.station}`);
    console.log(`  totals:   taxable=${totals.taxableAmount} cgst=${totals.cgstAmount} sgst=${totals.sgstAmount} round=${totals.roundOff}`);
    console.log(`            grand=${totals.grandTotal} ledger=${totals.ledgerBalanceDue} qty=${totals.totalQuantity}`);
    console.log(`            words="${(totals.amountInWords ?? '').slice(0, 70)}"`);
    console.log(`  bank: ${JSON.stringify(payment.bankAccounts)}`);
    if (warnings.length) for (const w of warnings) console.log(`    [${w.severity}] ${w.code}`);
  }
}
main().catch(async (e) => { console.error(e); await terminateEngine(); process.exit(1); });
