/**
 * Tesseract engine wrapper.
 *
 * Two passes matter for accuracy:
 *
 *  - PAGE PASS. PSM 3 and PSM 11 disagree usefully on these layouts (PSM 3 wins
 *    on dense ruled tables, PSM 11 on sparse label/value blocks — measured
 *    21/22 vs 20/22 on AJIT, 18/20 vs 19/20 on ARCHIT). Rather than guessing,
 *    both are run and their word sets MERGED, keeping the higher-confidence word
 *    where the two overlap. This raises recall for geometric lookups without
 *    forcing a layout choice per vendor.
 *
 *  - REGION PASS. Individual numeric cells are re-OCR'd from an upscaled crop
 *    with a digits-only character whitelist and PSM 7/8. Constraining the
 *    alphabet is the single largest per-field accuracy gain available without a
 *    model, because it removes the entire letter/digit confusion class
 *    (O/0, l/1, S/5, B/8) at source.
 */

import path from 'node:path';
import type { BBox, OcrLine, OcrPage, OcrWord } from './types';
import { bboxCenterY, estimateBaselineSlope, groupIntoRows } from './geometry';
import {
  OCR_DPI,
  PROBE_DPI,
  ROTATIONS,
  type RenderedPage,
  type Rotation,
  cropRegion,
  horizontalFraction,
  keywordScore,
  renderAndPreprocess,
  scoreOrientation,
} from './render';

type Worker = import('tesseract.js').Worker;

/** Digits, separators and the characters that legitimately appear in amounts. */
export const NUMERIC_WHITELIST = '0123456789.,-+%/() ';
/** Upper-case alphanumerics for identifier cells (GSTIN, vehicle no, IFSC). */
export const IDENT_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ';

const LANG = 'eng';

/**
 * Where eng.traineddata lives. Vendored into the repo at frontend/tessdata so
 * the pipeline works offline and in containers; override with TESSDATA_PATH.
 */
function langPath(): string {
  return process.env.TESSDATA_PATH || path.join(process.cwd(), 'tessdata');
}

// ---------------------------------------------------------------------------
// Worker lifecycle — one shared worker, serialised access
// ---------------------------------------------------------------------------

let workerPromise: Promise<Worker> | null = null;
/** Serialises recognize() calls: a Tesseract worker is single-threaded. */
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(LANG, 1, {
        langPath: langPath(),
        gzip: false,
        cachePath: process.env.TESSERACT_CACHE_PATH || langPath(),
        logger: () => {},
        errorHandler: () => {},
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Release the shared worker (used by tests and on fatal errors). */
export async function terminateEngine(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  if (!p) return;
  try {
    const w = await p;
    await w.terminate();
  } catch {
    /* already gone */
  }
}

/** Run a job with exclusive access to the worker. */
function enqueue<T>(job: (w: Worker) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const w = await getWorker();
    return job(w);
  });
  // Keep the chain alive even when a job rejects.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

interface RawRecognizeResult {
  text: string;
  confidence: number;
  words: OcrWord[];
  lines: OcrLine[];
}

async function recognize(
  image: Buffer,
  params: Record<string, string>,
): Promise<RawRecognizeResult> {
  return enqueue(async (worker) => {
    await worker.setParameters(params);
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });

    const words: OcrWord[] = [];
    const lines: OcrLine[] = [];
    let lineIndex = 0;

    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          const lineWords: OcrWord[] = [];
          for (const w of line.words ?? []) {
            const text = (w.text ?? '').trim();
            if (!text) continue;
            const word: OcrWord = {
              text,
              confidence: w.confidence ?? 0,
              bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
              lineIndex,
            };
            words.push(word);
            lineWords.push(word);
          }
          if (lineWords.length) {
            lines.push({
              text: lineWords.map((w) => w.text).join(' '),
              confidence: line.confidence ?? 0,
              bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
              words: lineWords,
            });
            lineIndex++;
          }
        }
      }
    }
    return { text: data.text ?? '', confidence: data.confidence ?? 0, words, lines };
  });
}

// ---------------------------------------------------------------------------
// Word-set merge across PSM passes
// ---------------------------------------------------------------------------

function boxIoU(a: BBox, b: BBox): number {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  return inter / (areaA + areaB - inter);
}

/**
 * Merge a secondary word set into a primary one.
 *
 * Words that overlap an existing word (IoU > 0.5) are treated as the same
 * physical token: the higher-confidence reading wins. Non-overlapping words are
 * additive — this is where the recall gain comes from, since each PSM finds text
 * the other drops.
 */
function mergeWords(primary: OcrWord[], secondary: OcrWord[]): OcrWord[] {
  const out = [...primary];
  for (const cand of secondary) {
    let matchIdx = -1;
    let bestIoU = 0.5;
    for (let i = 0; i < out.length; i++) {
      const iou = boxIoU(cand.bbox, out[i].bbox);
      if (iou > bestIoU) {
        bestIoU = iou;
        matchIdx = i;
      }
    }
    if (matchIdx === -1) {
      out.push(cand);
    } else if (cand.confidence > out[matchIdx].confidence + 5) {
      out[matchIdx] = { ...cand, lineIndex: out[matchIdx].lineIndex };
    }
  }
  return out;
}

/** Rebuild line groupings after a merge, so lineIndex stays meaningful. */
function rebuildLines(words: OcrWord[]): { lines: OcrLine[]; words: OcrWord[] } {
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).filter((h) => h > 0).sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : 20;
  // Correct residual page skew so a printed line stays one line (see geometry).
  const slope = estimateBaselineSlope(words);
  const rows = groupIntoRows(words, median * 0.6, slope);

  const lines: OcrLine[] = [];
  const flat: OcrWord[] = [];
  rows.forEach((row, idx) => {
    const rowWords = row.map((w) => ({ ...w, lineIndex: idx }));
    flat.push(...rowWords);
    lines.push({
      text: rowWords.map((w) => w.text).join(' '),
      confidence: rowWords.reduce((s, w) => s + w.confidence, 0) / Math.max(1, rowWords.length),
      bbox: {
        x0: Math.min(...rowWords.map((w) => w.bbox.x0)),
        y0: Math.min(...rowWords.map((w) => w.bbox.y0)),
        x1: Math.max(...rowWords.map((w) => w.bbox.x1)),
        y1: Math.max(...rowWords.map((w) => w.bbox.y1)),
      },
      words: rowWords,
    });
  });
  lines.sort((a, b) => bboxCenterY(a.bbox) - bboxCenterY(b.bbox));
  return { lines, words: flat };
}

// ---------------------------------------------------------------------------
// Orientation detection
// ---------------------------------------------------------------------------

/**
 * Determine the rotation that makes a page upright, using a cheap low-dpi probe
 * of all four candidates. See render.ts for why two signals are required.
 */
export async function detectRotation(
  pdfBytes: Uint8Array,
  pageIndex: number,
): Promise<{ rotation: Rotation; candidates: Array<{ rotation: Rotation; keyword: number; horiz: number; score: number }> }> {
  const candidates: Array<{ rotation: Rotation; keyword: number; horiz: number; score: number }> = [];

  for (const rotation of ROTATIONS) {
    try {
      const page = await renderAndPreprocess(pdfBytes, pageIndex, PROBE_DPI, rotation);
      const res = await recognize(page.png, {
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
        user_defined_dpi: String(PROBE_DPI),
      });
      const keyword = keywordScore(res.text);
      const horiz = horizontalFraction(res.words);
      candidates.push({ rotation, keyword, horiz, score: scoreOrientation(keyword, horiz) });
    } catch {
      candidates.push({ rotation, keyword: 0, horiz: 0, score: 0 });
    }

    // Fast path: most invoices arrive upright. A decisive first result makes the
    // remaining three probes pointless, cutting ~15s off the common case.
    if (rotation === 0) {
      const c = candidates[0];
      if (c.keyword >= 25 && c.horiz >= 0.9) {
        return { rotation: 0, candidates };
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { rotation: candidates[0]?.rotation ?? 0, candidates };
}

// ---------------------------------------------------------------------------
// Page OCR
// ---------------------------------------------------------------------------

/** Run the merged multi-PSM page pass over an already-rendered page. */
export async function ocrRenderedPage(rendered: RenderedPage): Promise<OcrPage> {
  const base = {
    preserve_interword_spaces: '1',
    user_defined_dpi: String(rendered.dpi),
  };

  const primary = await recognize(rendered.png, { ...base, tessedit_pageseg_mode: '3' });
  const secondary = await recognize(rendered.png, { ...base, tessedit_pageseg_mode: '11' });

  const merged = mergeWords(primary.words, secondary.words);
  const { lines, words } = rebuildLines(merged);
  const meanConfidence = words.length
    ? words.reduce((s, w) => s + w.confidence, 0) / words.length
    : 0;

  return {
    pageNumber: rendered.pageNumber,
    rotation: rendered.rotation,
    width: rendered.width,
    height: rendered.height,
    dpi: rendered.dpi,
    // Keep PSM 3's text: it preserves reading order better than the merged set,
    // and templates that fall back to regex scanning rely on that ordering.
    text: primary.text,
    lines,
    words,
    meanConfidence,
    image: rendered.png,
    recipe: `trim+srgb@${rendered.dpi}dpi rot${rendered.rotation} psm3+psm11`,
  };
}

/** Render, orient and OCR a single PDF page. */
export async function ocrPdfPage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  opts: { rotation?: Rotation; dpi?: number } = {},
): Promise<OcrPage> {
  const rotation = opts.rotation ?? (await detectRotation(pdfBytes, pageIndex)).rotation;
  const rendered = await renderAndPreprocess(pdfBytes, pageIndex, opts.dpi ?? OCR_DPI, rotation);
  return ocrRenderedPage(rendered);
}

// ---------------------------------------------------------------------------
// Targeted region re-OCR
// ---------------------------------------------------------------------------

export interface RegionReadOptions {
  /** Character whitelist; defaults to digits and separators. */
  whitelist?: string;
  /** 7 = single line (default), 8 = single word, 6 = block. */
  psm?: '6' | '7' | '8' | '13';
  /** Upscale factor before OCR. 3x measured best for small ERP digits. */
  scale?: number;
  binarize?: boolean;
  pad?: number;
}

export interface RegionReadResult {
  text: string;
  confidence: number;
}

/**
 * Re-read a specific region with a constrained alphabet.
 *
 * Use this for any cell whose value must be numeric: it eliminates letter/digit
 * confusions structurally rather than trying to repair them afterwards.
 */
export async function readRegion(
  page: OcrPage,
  region: BBox,
  opts: RegionReadOptions = {},
): Promise<RegionReadResult | null> {
  const crop = await cropRegion(page.image, region, {
    scale: opts.scale ?? 3,
    pad: opts.pad ?? 4,
    binarize: opts.binarize,
  });
  if (!crop) return null;

  const res = await recognize(crop, {
    tessedit_pageseg_mode: opts.psm ?? '7',
    tessedit_char_whitelist: opts.whitelist ?? NUMERIC_WHITELIST,
    preserve_interword_spaces: '1',
    classify_bln_numeric_mode: opts.whitelist === undefined ? '1' : '0',
  });

  // Reset the whitelist so later full-page passes are not silently constrained.
  await enqueue(async (w) => {
    await w.setParameters({ tessedit_char_whitelist: '', classify_bln_numeric_mode: '0' });
  });

  const text = res.text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return { text, confidence: res.confidence };
}

/** Re-read a numeric cell and return the best textual reading. */
export async function readNumericRegion(page: OcrPage, region: BBox): Promise<RegionReadResult | null> {
  return readRegion(page, region, { whitelist: NUMERIC_WHITELIST, psm: '7', scale: 3, binarize: false });
}

/** Re-read an identifier cell (GSTIN / vehicle / IFSC) in upper-case alnum only. */
export async function readIdentifierRegion(page: OcrPage, region: BBox): Promise<RegionReadResult | null> {
  return readRegion(page, region, { whitelist: IDENT_WHITELIST, psm: '7', scale: 3, binarize: false });
}
