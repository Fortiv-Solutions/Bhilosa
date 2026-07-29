/**
 * Dump the preprocessed page images the pipeline actually feeds to OCR.
 *
 * These are the inputs both recognition providers see, so comparing engines on
 * these files compares recognition alone — not preprocessing differences.
 *
 *   npx tsx scripts/dump-pages.ts [pdfPath]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectRotation, terminateEngine } from '../src/lib/ocr/engine';
import { OCR_DPI, countPdfPages, renderAndPreprocess } from '../src/lib/ocr/render';

const PDF = process.argv[2]
  ?? path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');
const OUT = path.resolve(process.cwd(), 'scripts', 'pages');

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const bytes = new Uint8Array(await fs.readFile(PDF));
  const pages = await countPdfPages(bytes);

  for (let i = 0; i < pages; i++) {
    const { rotation } = await detectRotation(bytes, i);
    const rendered = await renderAndPreprocess(bytes, i, OCR_DPI, rotation);
    const file = path.join(OUT, `page${i + 1}.png`);
    await fs.writeFile(file, rendered.png);
    console.log(`page ${i + 1}: rot=${rotation} ${rendered.width}x${rendered.height} -> ${file}`);
  }
  await terminateEngine();
}

main().catch(async (e) => {
  console.error(e);
  await terminateEngine();
  process.exit(1);
});
