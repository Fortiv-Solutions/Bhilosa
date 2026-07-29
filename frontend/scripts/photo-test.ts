/**
 * Photograph-path test.
 *
 * Synthesises phone-photo conditions from a known-good invoice page — textured
 * desk background around the sheet, tilt, an uneven lighting gradient, downscaling
 * and JPEG compression — then checks how much the extractor still recovers.
 *
 * Ground truth is known because the source page is sample_invoice.pdf page 2, so
 * this measures the photo pipeline rather than merely exercising it.
 *
 *   npx tsx scripts/photo-test.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { renderPdfPage } from '../src/lib/ocr/render';
import { extractInvoices } from '../src/lib/ocr/extract';
import { terminateEngine } from '../src/lib/ocr/engine';

const PDF = path.resolve(process.cwd(), '..', 'Procurement_Report_Formate', 'sample_invoice.pdf');
const OUT = path.resolve(process.cwd(), 'scripts', 'photo-out');

/** Values printed on sample_invoice.pdf page 2. */
const TRUTH: Record<string, unknown> = {
  'vendor.name': 'BHAGAVAT ENTERPRISE',
  'vendor.gstin': '24AUHPK6558N1Z1',
  'buyer.gstin': '24ABZFA6800G1ZB',
  'document.invoiceNumber': 'BE-2026-27-3343',
  'document.invoiceDate': '2026-07-16',
  'document.buyerPoNumber': 'AC/PAM/PO/2026/0351',
  'transport.vehicleNumber': 'GJ05CV4633',
  'totals.taxableAmount': 7050,
  'totals.grandTotal': 8319,
  'lineItems.0.quantity': 150,
  'lineItems.0.unitRate': 47,
  'lineItems.0.taxableValue': 7050,
};

function get(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

function matches(got: unknown, want: unknown): boolean {
  if (typeof want === 'number' && typeof got === 'number') return Math.abs(got - want) < 0.02;
  if (typeof want === 'string' && typeof got === 'string') return got.trim().toUpperCase() === want.toUpperCase();
  return got === want;
}

/**
 * Build a synthetic phone photo.
 * @param tiltDeg    camera tilt in degrees
 * @param longEdge   final long edge (a messaging app downscales aggressively)
 * @param shadow     0..1 strength of the lighting gradient
 * @param quality    JPEG quality
 */
async function makePhoto(
  page: Buffer,
  { tiltDeg, longEdge, shadow, quality }: { tiltDeg: number; longEdge: number; shadow: number; quality: number },
): Promise<Buffer> {
  const meta = await sharp(page).metadata();
  const pw = meta.width ?? 1;
  const ph = meta.height ?? 1;

  // Tilt the sheet; the exposed corners become background, not white.
  const tilted = await sharp(page)
    .rotate(tiltDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const tm = await sharp(tilted).metadata();

  // A noisy mid-grey "desk" larger than the sheet.
  const bgW = Math.round((tm.width ?? pw) * 1.22);
  const bgH = Math.round((tm.height ?? ph) * 1.18);
  const noise = Buffer.alloc(bgW * bgH * 3);
  for (let i = 0; i < noise.length; i += 3) {
    const v = 88 + Math.floor(Math.sin(i * 0.00013) * 18) + (i % 37);
    noise[i] = Math.min(255, v);
    noise[i + 1] = Math.min(255, v - 6);
    noise[i + 2] = Math.min(255, v - 14);
  }
  const desk = await sharp(noise, { raw: { width: bgW, height: bgH, channels: 3 } }).png().toBuffer();

  const composed = await sharp(desk)
    .composite([
      {
        input: tilted,
        left: Math.round((bgW - (tm.width ?? pw)) / 2),
        top: Math.round((bgH - (tm.height ?? ph)) / 2),
      },
    ])
    .png()
    .toBuffer();

  // Uneven lighting: a horizontal ramp multiplied over the whole frame.
  const ramp = Buffer.alloc(bgW * bgH);
  for (let y = 0; y < bgH; y++) {
    for (let x = 0; x < bgW; x++) {
      const t = x / bgW;
      ramp[y * bgW + x] = Math.round(255 * (1 - shadow * t));
    }
  }
  const rampPng = await sharp(ramp, { raw: { width: bgW, height: bgH, channels: 1 } })
    .toColourspace('srgb')
    .png()
    .toBuffer();

  const lit = await sharp(composed)
    .composite([{ input: rampPng, blend: 'multiply' }])
    .png()
    .toBuffer();

  return sharp(lit)
    .resize({ width: bgW >= bgH ? longEdge : undefined, height: bgH > bgW ? longEdge : undefined, fit: 'inside' })
    .jpeg({ quality })
    .toBuffer();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const bytes = new Uint8Array(await fs.readFile(PDF));
  // Two source resolutions: what a real phone camera captures, and a degraded
  // re-share. A modern phone photo of A4 is ~3000-4000px on the long edge.
  const hiSource = await renderPdfPage(bytes, 1, 240, 0);
  const loSource = await renderPdfPage(bytes, 1, 170, 0);

  const scenarios = [
    { name: 'phone-camera-3000', src: hiSource, tiltDeg: 1.5, longEdge: 3000, shadow: 0.3, quality: 90 },
    { name: 'phone-tilted-2600', src: hiSource, tiltDeg: 3.5, longEdge: 2600, shadow: 0.45, quality: 82 },
    { name: 'good-photo-2200', src: loSource, tiltDeg: 1.2, longEdge: 2200, shadow: 0.22, quality: 88 },
    { name: 'reshared-1700', src: loSource, tiltDeg: 3.0, longEdge: 1700, shadow: 0.42, quality: 78 },
    { name: 'whatsapp-1200', src: loSource, tiltDeg: 2.0, longEdge: 1200, shadow: 0.3, quality: 70 },
  ];

  for (const s of scenarios) {
    const photo = await makePhoto(s.src, s);
    const file = path.join(OUT, `${s.name}.jpg`);
    await fs.writeFile(file, photo);
    const m = await sharp(photo).metadata();

    console.log(`\n${'='.repeat(72)}`);
    console.log(`${s.name}  ${m.width}x${m.height}  ${(photo.length / 1024).toFixed(0)} KB  tilt=${s.tiltDeg}° shadow=${s.shadow}`);
    console.log('='.repeat(72));

    const t0 = Date.now();
    try {
      const outcome = await extractInvoices(Buffer.from(photo), { fileName: `${s.name}.jpg` });
      for (const d of outcome.diagnostics) {
        console.log(`  ocr: rot=${d.rotation} ${d.width}x${d.height} words=${d.wordCount} usable=${d.usableWordCount} conf=${d.meanConfidence}`);
        console.log(`  attempts: ${d.attempts.map((a) => `${a.recipe}=${a.words}w`).join('  ')}`);
      }
      const inv = outcome.invoices[0];
      if (!inv) {
        console.log('  !! no invoice produced');
        continue;
      }
      let pass = 0;
      const misses: string[] = [];
      for (const [field, want] of Object.entries(TRUTH)) {
        if (matches(get(inv, field), want)) pass++;
        else misses.push(`${field}=${JSON.stringify(get(inv, field))}`);
      }
      console.log(`  FIELDS ${pass}/${Object.keys(TRUTH).length}  confidence=${inv.validation.overallConfidence}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      if (misses.length) console.log(`  missed: ${misses.join(', ')}`);
      const quality = inv.validation.warnings.find((w) => w.code === 'low_source_quality');
      console.log(`  low-quality warning: ${quality ? 'RAISED' : 'not raised'}`);
    } catch (err) {
      console.log(`  !! THREW: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
  }
  await terminateEngine();
}

main().catch(async (e) => { console.error(e); await terminateEngine(); process.exit(1); });
