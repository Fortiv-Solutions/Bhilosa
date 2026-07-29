/**
 * Dev harness for table detection.  npx tsx scripts/table-probe.ts
 * Reuses cached page OCR from scripts/.ocr-cache to avoid re-running Tesseract.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectRotation, ocrPdfPage, terminateEngine } from '../src/lib/ocr/engine';
import { countPdfPages } from '../src/lib/ocr/render';
import { PageIndex } from '../src/lib/ocr/geometry';
import { detectLineItemTable, extractHsnSummary, extractLineItems, extractTableTotalRow } from '../src/lib/ocr/table';
import type { OcrPage } from '../src/lib/ocr/types';

const PDF = process.argv[2]
  ?? path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');
const CACHE = path.resolve(process.cwd(), 'scripts', '.ocr-cache');

async function loadPages(): Promise<OcrPage[]> {
  await fs.mkdir(CACHE, { recursive: true });
  const bytes = new Uint8Array(await fs.readFile(PDF));
  const n = await countPdfPages(bytes);
  const out: OcrPage[] = [];
  for (let i = 0; i < n; i++) {
    const file = path.join(CACHE, `p${i + 1}.json`);
    try {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      cached.image = Buffer.from(cached.image, 'base64');
      out.push(cached as OcrPage);
      console.log(`page ${i + 1}: loaded from cache (rot ${cached.rotation}, ${cached.words.length} words)`);
      continue;
    } catch { /* not cached */ }
    const rot = (await detectRotation(bytes, i)).rotation;
    const page = await ocrPdfPage(bytes, i, { rotation: rot });
    await fs.writeFile(file, JSON.stringify({ ...page, image: page.image.toString('base64') }));
    out.push(page);
    console.log(`page ${i + 1}: OCR'd fresh (rot ${rot}, ${page.words.length} words)`);
  }
  return out;
}

async function main() {
  const pages = await loadPages();
  await terminateEngine();

  for (const page of pages) {
    const idx = new PageIndex(page);
    console.log(`\n================ PAGE ${page.pageNumber} ================`);
    const table = detectLineItemTable(idx);
    if (!table) {
      console.log('  !! no line-item table detected');
      continue;
    }
    console.log(`  columns (${table.columns.length}): ` +
      table.columns.map((c) => `${c.name}[${Math.round(c.x0)}..${Math.round(c.x1)}]"${c.headerText}"`).join('  '));
    console.log(`  headerUnit=${table.headerUnit}  dataTop=${Math.round(table.dataTop)}`);

    const { items } = extractLineItems(idx, table);
    console.log(`  --- ${items.length} line item(s) ---`);
    for (const it of items) {
      console.log(`   sr=${it.sr} code=${it.itemCode ?? '-'} brand=${it.brandOrCompany ?? '-'}`);
      console.log(`     desc="${it.description}"`);
      console.log(`     hsn=${it.hsnSac} qty=${it.quantity} unit=${it.unit}(${it.unitSource}) listRate=${it.listRate} rate=${it.unitRate}`);
      console.log(`     disc=${JSON.stringify(it.discountPercents)} taxable=${it.taxableValue} cgst=${it.cgstRate}/${it.cgstAmount} sgst=${it.sgstRate}/${it.sgstAmount} tax%=${it.combinedTaxRate}`);
    }
    const totalRow = extractTableTotalRow(idx, table);
    console.log(`  table total row: qty=${totalRow.totalQuantity} taxable=${totalRow.totalTaxable}`);

    const hsn = extractHsnSummary(idx, table.dataBottom);
    console.log(`  --- HSN summary (${hsn.length}) ---`);
    for (const h of hsn) {
      console.log(`     hsn=${h.hsnSac} taxable=${h.taxableValue} cgst=${h.cgstRate}/${h.cgstAmount} sgst=${h.sgstRate}/${h.sgstAmount} total=${h.totalTax}`);
    }
  }
}

main().catch(async (e) => { console.error(e); await terminateEngine(); process.exit(1); });
