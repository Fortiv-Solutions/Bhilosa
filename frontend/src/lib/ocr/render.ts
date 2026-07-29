/**
 * PDF / image -> upright, OCR-ready page bitmaps.
 *
 * Three findings from measuring these invoices drive this module. They are not
 * stylistic choices; each was verified to change extraction from failing to
 * working:
 *
 *  1. BORDER TRIM IS MANDATORY. Photographed invoices carry a flat surround
 *     (a wooden desk, a grey scanner bed). With it present, Tesseract's page
 *     layout analysis classifies the entire sheet as a single image block and
 *     returns only the scanner watermark — 5 words for a full invoice. After
 *     sharp.trim() the same page yields 400+ words.
 *
 *  2. NEVER HAND TESSERACT A 1-CHANNEL PNG. tesseract.js mis-decodes greyscale
 *     PNGs and silently returns near-empty results, so every preprocessing
 *     recipe converts back to sRGB before encoding.
 *
 *  3. ORIENTATION NEEDS TWO SIGNALS. osd.traineddata is unavailable, and
 *     Tesseract internally auto-corrects 90 degree rotation, so text quality
 *     alone cannot tell 0 from 270 (measured: 46 vs 47 keyword hits on the same
 *     page). Keyword score rejects the upside-down candidates; the fraction of
 *     word boxes that are wider than tall rejects the sideways ones. The product
 *     of the two separates the correct orientation by a wide margin.
 */

import type { BBox } from './types';

// mupdf and sharp are heavy native/wasm modules: import lazily so that merely
// importing this file from a client bundle can never pull them in.
type SharpFactory = typeof import('sharp').default;
type MupdfModule = typeof import('mupdf');

let sharpPromise: Promise<SharpFactory> | null = null;
let mupdfPromise: Promise<MupdfModule> | null = null;

async function getSharp(): Promise<SharpFactory> {
  if (!sharpPromise) {
    sharpPromise = import('sharp').then((m) => (m.default ?? (m as unknown as SharpFactory)));
  }
  return sharpPromise;
}

async function getMupdf(): Promise<MupdfModule> {
  if (!mupdfPromise) mupdfPromise = import('mupdf');
  return mupdfPromise;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface RenderedPage {
  pageNumber: number;
  rotation: Rotation;
  dpi: number;
  width: number;
  height: number;
  /** Preprocessed, trimmed, 3-channel PNG ready for Tesseract. */
  png: Buffer;
  /** Offset introduced by trimming, so boxes can be mapped back if needed. */
  trimOffset: { left: number; top: number };
}

/** DPI used for the final OCR pass. 400 measured better than 300 on these scans. */
export const OCR_DPI = 400;
/** DPI used for the cheap 4-way orientation probe. */
export const PROBE_DPI = 200;

export function isPdf(bytes: Uint8Array | Buffer, fileName?: string): boolean {
  if (fileName && /\.pdf$/i.test(fileName)) return true;
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Rasterise one PDF page at a given dpi and rotation. Returns RGB PNG bytes. */
export async function renderPdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  dpi: number,
  rotation: Rotation,
): Promise<Buffer> {
  const mupdf = await getMupdf();
  const doc = mupdf.PDFDocument.openDocument(pdfBytes, 'application/pdf');
  try {
    const page = doc.loadPage(pageIndex);
    const scale = mupdf.Matrix.scale(dpi / 72, dpi / 72);
    const matrix = rotation === 0 ? scale : mupdf.Matrix.concat(scale, mupdf.Matrix.rotate(rotation));
    const pix = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    return Buffer.from(pix.asPNG());
  } finally {
    // Free the wasm-side document promptly; extraction may loop over many pages.
    try {
      (doc as unknown as { destroy?: () => void }).destroy?.();
    } catch {
      /* best effort */
    }
  }
}

export async function countPdfPages(pdfBytes: Uint8Array): Promise<number> {
  const mupdf = await getMupdf();
  const doc = mupdf.PDFDocument.openDocument(pdfBytes, 'application/pdf');
  try {
    return doc.countPages();
  } finally {
    try {
      (doc as unknown as { destroy?: () => void }).destroy?.();
    } catch {
      /* best effort */
    }
  }
}

/**
 * Preprocess a rendered page for OCR: trim the border, emit 3-channel sRGB PNG.
 *
 * Note there is deliberately NO bitmap deskew here. Residual page skew is real
 * (the AJIT sheet rises ~0.5 degrees left-to-right) but it is corrected in
 * COORDINATE space by geometry.estimateBaselineSlope, which reads word centres
 * instead of pixels. That is both cheaper and safer: a mis-estimated rotation
 * resamples the whole page and can make Tesseract reject it outright, which is
 * exactly what a pixel-domain implementation did here before it was removed.
 *
 * Contrast work is deliberately light: aggressive binarisation lost thin
 * dot-matrix digits on these scans, and CLAHE gave no measurable gain over the
 * trimmed original.
 */
export async function preprocess(
  png: Buffer,
  opts: { trimThreshold?: number; binarize?: boolean } = {},
): Promise<{
  png: Buffer;
  width: number;
  height: number;
  trimOffset: { left: number; top: number };
}> {
  const sharp = await getSharp();
  const threshold = opts.trimThreshold ?? 40;

  // 1. Remove the flat photographic border (mandatory — see finding 1).
  const trimmed = await sharp(png).trim({ threshold }).png().toBuffer({ resolveWithObject: true });
  const trimOffset = {
    left: -(trimmed.info.trimOffsetLeft ?? 0),
    top: -(trimmed.info.trimOffsetTop ?? 0),
  };

  // 2. Optional binarisation, then back to sRGB for Tesseract.
  let pipeline = sharp(trimmed.data);
  if (opts.binarize) pipeline = pipeline.greyscale().normalise().threshold(150);
  const { data, info } = await pipeline.toColourspace('srgb').png().toBuffer({ resolveWithObject: true });

  return { png: data, width: info.width, height: info.height, trimOffset };
}

/**
 * Render a page with a fallback: if trimming removes almost everything (a page
 * that is genuinely borderless and mostly uniform), fall back to the untrimmed
 * image rather than handing OCR a sliver.
 */
export async function renderAndPreprocess(
  pdfBytes: Uint8Array,
  pageIndex: number,
  dpi: number,
  rotation: Rotation,
  opts: { trim?: boolean; binarize?: boolean } = {},
): Promise<RenderedPage> {
  const sharp = await getSharp();
  const raw = await renderPdfPage(pdfBytes, pageIndex, dpi, rotation);
  const rawMeta = await sharp(raw).metadata();

  // Caller can disable trimming: a page with no flat surround, or with content
  // touching the edge, reads better untrimmed.
  if (opts.trim === false) {
    let pipeline = sharp(raw);
    if (opts.binarize) pipeline = pipeline.greyscale().normalise().threshold(150);
    const plain = await pipeline.toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
    return {
      pageNumber: pageIndex + 1,
      rotation,
      dpi,
      width: plain.info.width,
      height: plain.info.height,
      png: plain.data,
      trimOffset: { left: 0, top: 0 },
    };
  }

  const trimmed = await preprocess(raw, { binarize: opts.binarize });

  const rawArea = (rawMeta.width ?? 1) * (rawMeta.height ?? 1);
  const trimArea = trimmed.width * trimmed.height;
  const usable = trimArea / Math.max(1, rawArea) > 0.15;

  if (usable) {
    return {
      pageNumber: pageIndex + 1,
      rotation,
      dpi,
      width: trimmed.width,
      height: trimmed.height,
      png: trimmed.png,
      trimOffset: trimmed.trimOffset,
    };
  }
  const plain = await sharp(raw).toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
  return {
    pageNumber: pageIndex + 1,
    rotation,
    dpi,
    width: plain.info.width,
    height: plain.info.height,
    png: plain.data,
    trimOffset: { left: 0, top: 0 },
  };
}

// ---------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------

/**
 * Locate the printed document inside a photograph.
 *
 * A phone photo of an invoice is mostly NOT invoice: there is desk, hands, shadow
 * and background around it. `trim()` cannot help because a textured background is
 * not a flat border, so Tesseract ends up doing layout analysis over a scene
 * rather than a page.
 *
 * Detection is by local contrast rather than brightness, which is what makes it
 * robust: printed text produces high pixel variance in its cell, while desks,
 * shadows and paper margins are all comparatively smooth — regardless of whether
 * the background is lighter or darker than the page. The bounding box of
 * high-variance cells is the printed area.
 */
export async function detectContentBBox(png: Buffer): Promise<BBox | null> {
  const sharp = await getSharp();
  const meta = await sharp(png).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) return null;

  const { data, info } = await sharp(png)
    .greyscale()
    .resize({ width: 900, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const CELL = 16;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const std = new Float64Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      const yEnd = Math.min(h, (cy + 1) * CELL);
      const xEnd = Math.min(w, (cx + 1) * CELL);
      for (let y = cy * CELL; y < yEnd; y++) {
        const off = y * w * ch;
        for (let x = cx * CELL; x < xEnd; x++) {
          const v = data[off + x * ch];
          sum += v;
          sumSq += v * v;
          n++;
        }
      }
      if (!n) continue;
      const mean = sum / n;
      std[cy * cols + cx] = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    }
  }

  let maxStd = 0;
  for (const v of std) if (v > maxStd) maxStd = v;
  // A featureless image has nothing to crop to.
  if (maxStd < 8) return null;

  const threshold = Math.max(6, maxStd * 0.25);
  let cx0 = cols;
  let cy0 = rows;
  let cx1 = -1;
  let cy1 = -1;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (std[cy * cols + cx] < threshold) continue;
      if (cx < cx0) cx0 = cx;
      if (cx > cx1) cx1 = cx;
      if (cy < cy0) cy0 = cy;
      if (cy > cy1) cy1 = cy;
    }
  }
  if (cx1 < 0) return null;

  const scaleX = fullW / w;
  const scaleY = fullH / h;
  const pad = CELL;
  const box: BBox = {
    x0: Math.max(0, cx0 * CELL - pad) * scaleX,
    y0: Math.max(0, cy0 * CELL - pad) * scaleY,
    x1: Math.min(w, (cx1 + 1) * CELL + pad) * scaleX,
    y1: Math.min(h, (cy1 + 1) * CELL + pad) * scaleY,
  };

  // Refuse a crop that keeps almost nothing, or almost everything (no gain).
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  const ratio = area / (fullW * fullH);
  if (ratio < 0.05 || ratio > 0.97) return null;
  return box;
}

/**
 * Preprocessing strategies for a photographed or scanned image upload, ordered
 * from most to least intervention. Escalated through by the engine until the read
 * is usable — no single recipe wins on every photo.
 */
export type ImageRecipe = 'crop+clahe' | 'crop' | 'clahe' | 'plain' | 'crop+binarize';

/**
 * Long edge, in pixels, to normalise an image upload to before OCR.
 *
 * Tesseract wants roughly 30px of cap height. A photograph is either far too
 * large (a 12MP phone image, where glyphs blur under the default scaling) or too
 * small (a messaging-app screenshot downscaled to 800px, where glyphs are a few
 * pixels tall and unreadable). Normalising in BOTH directions is what makes photo
 * uploads work; previously the image was passed through at whatever size it
 * arrived.
 */
const IMAGE_TARGET_LONG_EDGE = 2800;

/**
 * Prepare a standalone image upload (phone photo, scan, screenshot) for OCR.
 *
 * `.rotate(angle)` is called explicitly, which also applies the EXIF orientation
 * tag that phone cameras set constantly — without it a "portrait" photo arrives
 * sideways.
 */
export async function prepareImageUpload(
  bytes: Buffer,
  rotation: Rotation,
  opts: { maxWidth?: number; recipe?: ImageRecipe; targetLongEdge?: number } = {},
): Promise<RenderedPage> {
  const sharp = await getSharp();
  const recipe = opts.recipe ?? 'crop+clahe';

  // 1. Orientation (and EXIF).
  const oriented = await sharp(bytes).rotate(rotation).png().toBuffer();

  // 2. Crop to the printed document when the recipe asks for it.
  let working = oriented;
  if (recipe.startsWith('crop')) {
    try {
      const box = await detectContentBBox(oriented);
      if (box) {
        const m = await sharp(oriented).metadata();
        const left = Math.max(0, Math.round(box.x0));
        const top = Math.max(0, Math.round(box.y0));
        const width = Math.min((m.width ?? 0) - left, Math.round(box.x1 - box.x0));
        const height = Math.min((m.height ?? 0) - top, Math.round(box.y1 - box.y0));
        if (width > 50 && height > 50) {
          working = await sharp(oriented).extract({ left, top, width, height }).png().toBuffer();
        }
      }
    } catch {
      // Cropping is an optimisation; never let it fail the read.
    }
  }

  // 3. Normalise scale in both directions.
  const target = opts.maxWidth ?? opts.targetLongEdge ?? IMAGE_TARGET_LONG_EDGE;
  const meta = await sharp(working).metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longEdge > 0 && Math.abs(longEdge - target) / target > 0.15) {
    const resizeOpts =
      (meta.width ?? 0) >= (meta.height ?? 0) ? { width: target } : { height: target };
    working = await sharp(working)
      .resize({ ...resizeOpts, fit: 'inside', kernel: 'lanczos3' })
      .png()
      .toBuffer();
  }

  // 4. Local contrast / binarisation.
  //    CLAHE is the single biggest win on photographs: it equalises the uneven
  //    lighting and shadow gradients that a global threshold cannot handle. It is
  //    deliberately NOT used on flat scans, where it measured no gain.
  let out: { data: Buffer; info: { width: number; height: number } };
  try {
    let pipeline = sharp(working);
    if (recipe.includes('clahe')) {
      pipeline = pipeline.greyscale().clahe({ width: 96, height: 96, maxSlope: 3 });
    } else if (recipe.includes('binarize')) {
      pipeline = pipeline.greyscale().normalise().threshold(150);
    }
    const res = await pipeline.toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
    out = { data: res.data, info: { width: res.info.width, height: res.info.height } };
  } catch {
    // CLAHE can reject unusual pixel formats; fall back to the plain image.
    const res = await sharp(working).toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
    out = { data: res.data, info: { width: res.info.width, height: res.info.height } };
  }

  return {
    pageNumber: 1,
    rotation,
    dpi: OCR_DPI,
    width: out.info.width,
    height: out.info.height,
    png: out.data,
    trimOffset: { left: 0, top: 0 },
  };
}

export const IMAGE_RECIPES: ImageRecipe[] = ['crop+clahe', 'crop', 'clahe', 'plain', 'crop+binarize'];

/** Crop a region out of a page image and optionally upscale it for re-OCR. */
export async function cropRegion(
  png: Buffer,
  region: BBox,
  opts: { scale?: number; pad?: number; binarize?: boolean } = {},
): Promise<Buffer | null> {
  const sharp = await getSharp();
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const pad = opts.pad ?? 4;

  const left = Math.max(0, Math.floor(region.x0 - pad));
  const top = Math.max(0, Math.floor(region.y0 - pad));
  const width = Math.min(W - left, Math.ceil(region.x1 - region.x0 + pad * 2));
  const height = Math.min(H - top, Math.ceil(region.y1 - region.y0 + pad * 2));
  if (width <= 2 || height <= 2) return null;

  let pipeline = sharp(png).extract({ left, top, width, height });
  const scale = opts.scale ?? 1;
  if (scale !== 1) {
    pipeline = pipeline.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      kernel: 'lanczos3',
    });
  }
  if (opts.binarize) pipeline = pipeline.greyscale().normalise().threshold(150);
  return pipeline.toColourspace('srgb').png().toBuffer();
}

// ---------------------------------------------------------------------------
// Orientation detection
// ---------------------------------------------------------------------------

/**
 * Vocabulary that appears on essentially every Indian GST invoice. Used as a
 * deterministic stand-in for a language model: correctly-oriented text scores
 * tens of hits, upside-down text scores ~0.
 */
const ORIENTATION_KEYWORDS = [
  'invoice', 'tax', 'total', 'date', 'gstin', 'gst', 'amount', 'rate', 'qty', 'hsn', 'sac',
  'bank', 'ifsc', 'address', 'supply', 'cgst', 'sgst', 'igst', 'description', 'discount',
  'challan', 'vehicle', 'terms', 'payment', 'rupees', 'pan', 'state', 'item', 'code',
  'value', 'net', 'bill', 'due', 'received', 'authorised', 'authorized', 'signatory',
  'details', 'customer', 'supplier', 'goods', 'only', 'no.', 'transport', 'taxable',
];

export function keywordScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const k of ORIENTATION_KEYWORDS) score += lower.split(k).length - 1;
  return score;
}

/**
 * Fraction of substantive word boxes that are wider than they are tall.
 * ~0.98 for upright text, ~0.01 for text rotated 90 degrees.
 */
export function horizontalFraction(words: Array<{ text: string; confidence: number; bbox: BBox }>): number {
  const solid = words.filter((w) => w.confidence >= 70 && /[A-Za-z0-9]{2,}/.test(w.text));
  if (!solid.length) return 0;
  const horiz = solid.filter((w) => w.bbox.x1 - w.bbox.x0 > w.bbox.y1 - w.bbox.y0).length;
  return horiz / solid.length;
}

export interface OrientationCandidate {
  rotation: Rotation;
  keywordScore: number;
  horizontalFraction: number;
  score: number;
}

/**
 * Combine the two signals. The product is what separates the correct rotation:
 * upside-down candidates die on keywordScore, sideways candidates die on
 * horizontalFraction, and only the true orientation scores high on both.
 */
export function scoreOrientation(keyword: number, horizFrac: number): number {
  return keyword * Math.max(horizFrac, 0.01);
}

export const ROTATIONS: Rotation[] = [0, 90, 180, 270];
