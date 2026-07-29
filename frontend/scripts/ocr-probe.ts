/**
 * Dev harness: OCR the sample invoices and print what the engine layer sees.
 *   npx tsx scripts/ocr-probe.ts [pdfPath]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectRotation, ocrPdfPage, terminateEngine } from '../src/lib/ocr/engine';
import { countPdfPages } from '../src/lib/ocr/render';
import { PageIndex } from '../src/lib/ocr/geometry';

const PDF = process.argv[2]
  ?? path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');

const PROBES: Record<number, string[]> = {
  1: ['AJIT', 'G-2987', '69109000', '162435.24', '218760.94', '86169.56', '551492.00', 'AGASTYA',
      '467365.74', 'LIXIL', '4840.00', '14750.00', '5810.00', '42062.92', '8055', '39222000',
      '188.00', '24ABYFA3137F1ZE', 'AD/PAG/PO/2026/0122'],
  2: ['BHAGAVAT', 'BE-2026-27-3343', '38241000', '8,319.00', 'PKTS', '7,050.00', '634.50', 'IDFC',
      '24AUHPK6558N1Z1', '24ABZFA6800G1ZB', '21,08,663.00', '47.00', 'AMAYA', '1269.00', 'JOINT FILLER'],
  3: ['ARCHIT', '26-27/499', '25232930', '38771.25', '45750.00', '258.48', '305.000', 'PRAMUKH',
      '3489.41', '6978.82', 'SHREE CEMENT', '4206', '394315', '45750.07', '162625322158405'],
};

async function main() {
  const bytes = new Uint8Array(await fs.readFile(PDF));
  const pages = await countPdfPages(bytes);
  console.log(`PDF: ${PDF}\npages: ${pages}\n`);

  for (let i = 0; i < pages; i++) {
    const t0 = Date.now();
    const det = await detectRotation(bytes, i);
    console.log(`--- page ${i + 1} ---`);
    console.log('  orientation candidates:');
    for (const c of det.candidates) {
      console.log(`    rot${String(c.rotation).padStart(3)}  kw=${String(c.keyword).padStart(3)}  horiz=${c.horiz.toFixed(3)}  score=${c.score.toFixed(1)}`);
    }
    console.log(`  => rotation ${det.rotation}`);

    const page = await ocrPdfPage(bytes, i, { rotation: det.rotation });
    const idx = new PageIndex(page);
    const probes = PROBES[i + 1] ?? [];
    const joined = page.words.map((w) => w.text).join(' ');
    const hits = probes.filter((p) => page.text.includes(p) || joined.includes(p));
    const miss = probes.filter((p) => !hits.includes(p));

    console.log(`  size=${page.width}x${page.height} words=${page.words.length} lines=${page.lines.length} conf=${page.meanConfidence.toFixed(1)} lineHeight=${idx.lineHeight.toFixed(0)}`);
    console.log(`  probes=${hits.length}/${probes.length}  ${miss.length ? 'MISSING: ' + miss.join(' | ') : '(all found)'}`);
    console.log(`  took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    await fs.writeFile(path.join('scripts', `probe-p${i + 1}.txt`), page.text);
    await fs.writeFile(
      path.join('scripts', `probe-p${i + 1}.words.json`),
      JSON.stringify(page.words.map((w) => ({ t: w.text, c: Math.round(w.confidence), b: w.bbox })), null, 0),
    );
  }
  await terminateEngine();
}

main().catch(async (e) => {
  console.error(e);
  await terminateEngine();
  process.exit(1);
});
