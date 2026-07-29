/**
 * Diagnose a single invoice that extracted badly.
 *
 *   cd frontend
 *   npx tsx scripts/diagnose-invoice.ts "C:/path/to/your-invoice.pdf"
 *
 * Prints, in order: whether the OCR language file was found, what each page
 * produced, which preprocessing recipe won, a sample of the raw text, and then
 * every field the extractor managed to pull out. If the word counts are near zero
 * the problem is OCR/setup; if the words are there but the fields are empty the
 * problem is vocabulary or layout, and the raw text sample shows which.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractInvoices } from '../src/lib/ocr/extract';
import { resolveLangPath, terminateEngine } from '../src/lib/ocr/engine';
import { buildGrnPatch } from '../src/lib/ocr/invoice-to-grn';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npx tsx scripts/diagnose-invoice.ts <path-to-invoice.pdf|jpg|png>');
  process.exit(2);
}

async function main() {
  console.log('='.repeat(78));
  console.log('OCR SETUP');
  console.log('='.repeat(78));
  console.log('  cwd:            ', process.cwd());
  const lang = resolveLangPath();
  console.log('  tessdata found: ', lang ?? 'NOT FOUND  <-- this alone will make every field empty');
  if (!lang) {
    console.log('    Fix: ensure frontend/tessdata/eng.traineddata exists, or set TESSDATA_PATH.');
  }

  const bytes = await fs.readFile(target);
  console.log('  file:           ', target);
  console.log('  size:           ', `${(bytes.length / 1024).toFixed(1)} KB`);

  const t0 = Date.now();
  let outcome;
  try {
    outcome = await extractInvoices(bytes, { fileName: path.basename(target) });
  } catch (err) {
    console.log('\n!! EXTRACTION THREW:');
    console.log('  ', err instanceof Error ? err.message : String(err));
    await terminateEngine();
    process.exit(1);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`PER-PAGE OCR  (${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
  console.log('='.repeat(78));
  for (const d of outcome.diagnostics) {
    console.log(`  page ${d.pageNumber}: ${d.width}x${d.height} rot=${d.rotation} words=${d.wordCount} usable=${d.usableWordCount} conf=${d.meanConfidence}`);
    console.log(`    recipe:   ${d.recipe}`);
    if (d.attempts.length > 1) {
      console.log(`    attempts: ${d.attempts.map((a) => `${a.recipe}=${a.words}w`).join('  ')}`);
    }
    console.log(`    text:     ${d.textSample.slice(0, 220)}`);
    if (d.usableWordCount < 40) {
      console.log('    ^^ VERY FEW WORDS — OCR could not read this page. Likely causes:');
      console.log('       low resolution, heavy skew, a photo taken at an angle, or a blank/cover page.');
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`EXTRACTED  (${outcome.invoices.length} invoice(s))`);
  console.log('='.repeat(78));

  for (const [i, inv] of outcome.invoices.entries()) {
    const d = inv.document;
    const t = inv.totals;
    console.log(`\n--- invoice ${i + 1} (pages ${inv.meta.pageNumbers.join(',')}) confidence=${inv.validation.overallConfidence} ---`);
    const rows: Array<[string, unknown]> = [
      ['vendor.name', inv.vendor.name],
      ['vendor.gstin', inv.vendor.gstin],
      ['buyer.name', inv.buyer.name],
      ['buyer.gstin', inv.buyer.gstin],
      ['shipTo.site', inv.shipTo.siteName],
      ['invoiceNumber', d.invoiceNumber],
      ['invoiceDate', d.invoiceDate],
      ['dueDate', d.dueDate],
      ['challanNumber', d.challanNumber],
      ['buyerPoNumber', `${d.buyerPoNumber} (${d.buyerPoNumberSource})`],
      ['vendorOrderRef', d.vendorOrderRef],
      ['irn', d.irn ? `${d.irn.slice(0, 16)}...` : null],
      ['transporter', inv.transport.transporterName],
      ['vehicleNumber', inv.transport.vehicleNumber],
      ['taxableAmount', t.taxableAmount],
      ['cgst / sgst', `${t.cgstAmount} / ${t.sgstAmount}`],
      ['roundOff', t.roundOff],
      ['grandTotal', t.grandTotal],
      ['totalQuantity', t.totalQuantity],
      ['ledgerBalanceDue', t.ledgerBalanceDue],
      ['lineItems', inv.lineItems.length],
    ];
    for (const [k, v] of rows) {
      const shown = v === null || v === undefined || v === 'null (null)' ? '—  (not read)' : String(v);
      console.log(`   ${k.padEnd(18)} ${shown}`);
    }

    for (const it of inv.lineItems) {
      console.log(`     item ${it.sr}: "${it.description.slice(0, 46)}" hsn=${it.hsnSac} qty=${it.quantity}${it.unit ? ' ' + it.unit : ''} rate=${it.unitRate} taxable=${it.taxableValue}`);
    }

    if (inv.validation.warnings.length) {
      console.log('   warnings:');
      for (const w of inv.validation.warnings) {
        console.log(`     [${w.severity}] ${w.code}: ${w.message.slice(0, 150)}`);
      }
    }

    const patch = buildGrnPatch(inv);
    console.log(`   GRN header fields that would be filled: ${Object.keys(patch.header).length}`);
    for (const [k, v] of Object.entries(patch.header)) console.log(`     ${k} = ${String(v).slice(0, 60)}`);
  }

  await terminateEngine();
}

main().catch(async (e) => {
  console.error(e);
  await terminateEngine();
  process.exit(1);
});
