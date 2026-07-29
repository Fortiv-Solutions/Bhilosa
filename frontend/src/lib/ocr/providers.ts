/**
 * Recognition providers.
 *
 * The invoice pipeline is deliberately split so that WHAT the characters are and
 * WHERE they sit are supplied by a swappable component, while everything
 * downstream — row banding, gutter-derived table columns, label-anchored field
 * reads, GST arithmetic reconciliation — consumes only `OcrWord[]`. That boundary
 * is what makes the recogniser replaceable without touching the logic that
 * encodes how Indian GST invoices actually behave.
 *
 * Two providers:
 *
 *  - `paddle`  PP-OCRv5 via the project's Python backend. Apache-2.0, self-hosted,
 *              free with no per-page cost, and materially more accurate than
 *              Tesseract on the material that was failing: small digits in dense
 *              table cells and photographed pages. Also faster.
 *  - `tesseract` The bundled wasm engine. Always available, no service dependency,
 *              and retains one unique capability the page pass cannot replace —
 *              a per-region character whitelist, used for digit-only cell re-reads.
 *
 * Selection is `INVOICE_OCR_ENGINE` = auto (default) | paddle | tesseract.
 * In `auto`, Paddle is used when the service answers its health check, and
 * Tesseract is used otherwise — so a deployment without the Python service still
 * extracts invoices rather than failing.
 */

import type { BBox } from './types';

export type RecognitionEngine = 'auto' | 'paddle' | 'tesseract';

export interface RecognizedWord {
  text: string;
  /** 0-100, matching the scale used throughout the pipeline. */
  confidence: number;
  bbox: BBox;
}

export interface RecognitionResult {
  words: RecognizedWord[];
  engine: string;
  meanConfidence: number;
  ms: number;
}

/**
 * Configured preference. Defaults to `tesseract`, NOT `auto`.
 *
 * MEASURED, 2026-07-29 (scripts/engine-benchmark.ts, 3 sample formats, identical
 * downstream pipeline):
 *
 *     tesseract  41/41 fields   94.9s
 *     paddle     12/41 fields  120.0s
 *
 * PP-OCRv5 recognises CHARACTERS far better — mean confidence 93.7/96.0/95.3
 * against Tesseract's 80.4/83.6/81.3, and 47/48 hand-checked tokens including ones
 * Tesseract needed checksum repair to recover. But end-to-end field extraction
 * collapses, because the downstream geometry depends on properties of the boxes
 * that Paddle does not provide:
 *
 *  1. Paddle emits TEXT-LINE boxes, so their median height is much larger than a
 *     tight word box. `PageIndex.lineHeight` is that median and it sets the
 *     row-banding tolerance (lineHeight * 0.6), so bands grow until a table's
 *     header row merges with its first data row and column resolution fails.
 *  2. Paddle drops inter-word spaces inside a region ("FILLER IVORY" ->
 *     "FILLERIVORY"), so the proportional word-splitting fallback cannot fire and
 *     multi-word cells arrive as single tokens.
 *
 * Both are fixable — derive the banding tolerance from box *spacing* rather than
 * box height, and obtain real word boxes from the recogniser — but until they are,
 * defaulting to Paddle would take a working 41/41 extraction down to 12/41.
 *
 * Set INVOICE_OCR_ENGINE=paddle to opt in, or =auto for health-probed selection.
 */
export function configuredEngine(): RecognitionEngine {
  const raw = (process.env.INVOICE_OCR_ENGINE || 'tesseract').toLowerCase().trim();
  return raw === 'paddle' || raw === 'tesseract' || raw === 'auto' ? raw : 'tesseract';
}

/**
 * Base URL of the Python backend.
 *
 * Server-side code cannot use the Next.js rewrite (a relative path has no origin),
 * so the service is called directly. Mirrors the default used by next.config.ts.
 */
function backendUrl(): string {
  const raw =
    process.env.PYTHON_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000';
  const trimmed = raw.replace(/\/$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// ---------------------------------------------------------------------------
// Availability, cached
// ---------------------------------------------------------------------------

interface AvailabilityCache {
  at: number;
  available: boolean;
  detail: string;
}

let availability: AvailabilityCache | null = null;
/** Re-probe this often. Long enough to avoid per-page checks, short enough that
 *  starting the Python service takes effect without restarting Next.js. */
const AVAILABILITY_TTL_MS = 60_000;
const HEALTH_TIMEOUT_MS = 4_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is the PaddleOCR service usable?
 *
 * The health endpoint actually constructs the engine, so a backend that is running
 * but missing the OCR dependencies reports false — which is the case that matters,
 * because it is indistinguishable from "working" at the HTTP level.
 */
export async function isPaddleAvailable(force = false): Promise<{ available: boolean; detail: string }> {
  if (!force && availability && Date.now() - availability.at < AVAILABILITY_TTL_MS) {
    return { available: availability.available, detail: availability.detail };
  }
  let available = false;
  let detail = '';
  try {
    const res = await fetchWithTimeout(`${backendUrl()}/api/ocr/health`, { method: 'GET' }, HEALTH_TIMEOUT_MS);
    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean; error?: string; meta?: unknown };
      available = json?.ok === true;
      detail = available ? JSON.stringify(json.meta ?? {}) : String(json?.error ?? 'engine not ready');
    } else {
      detail = `health check returned HTTP ${res.status}`;
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  availability = { at: Date.now(), available, detail };
  return { available, detail };
}

/** Clear the cached probe (used by tests and after an explicit engine switch). */
export function resetAvailabilityCache(): void {
  availability = null;
}

// ---------------------------------------------------------------------------
// Paddle recognition
// ---------------------------------------------------------------------------

const RECOGNIZE_TIMEOUT_MS = 120_000;

/**
 * Recognise a page image with PP-OCRv5.
 *
 * Returns null — rather than throwing — when the service cannot be reached or
 * reports itself unavailable, so the caller can fall back silently. A genuine
 * recognition error on a reachable service does throw, because that indicates a
 * problem with the document worth surfacing.
 */
export async function recognizeWithPaddle(png: Buffer): Promise<RecognitionResult | null> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'page.png');

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${backendUrl()}/api/ocr/recognize`,
      { method: 'POST', body: form },
      RECOGNIZE_TIMEOUT_MS,
    );
  } catch {
    availability = { at: Date.now(), available: false, detail: 'service unreachable' };
    return null;
  }

  // 503 is the service's own "engine unavailable" signal: fall back, do not fail.
  if (res.status === 503) {
    const body = await res.text().catch(() => '');
    availability = { at: Date.now(), available: false, detail: body.slice(0, 300) };
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PaddleOCR recognition failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    words?: Array<{ text?: string; confidence?: number; bbox?: Partial<BBox> }>;
    engine?: string;
    meanConfidence?: number;
    ms?: number;
  };

  const words: RecognizedWord[] = [];
  for (const w of json.words ?? []) {
    const text = (w.text ?? '').trim();
    const b = w.bbox;
    if (!text || !b) continue;
    const { x0, y0, x1, y1 } = b;
    if (
      typeof x0 !== 'number' || typeof y0 !== 'number' ||
      typeof x1 !== 'number' || typeof y1 !== 'number'
    ) {
      continue;
    }
    // Guard against inverted or degenerate boxes before they reach the geometry.
    if (x1 <= x0 || y1 <= y0) continue;
    words.push({
      text,
      confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      bbox: { x0, y0, x1, y1 },
    });
  }

  return {
    words,
    engine: json.engine || 'paddleocr',
    meanConfidence: typeof json.meanConfidence === 'number' ? json.meanConfidence : 0,
    ms: typeof json.ms === 'number' ? json.ms : 0,
  };
}

/**
 * Decide which engine to use for a page pass.
 * Resolves `auto` against the live health probe.
 */
export async function selectEngine(): Promise<{ engine: 'paddle' | 'tesseract'; reason: string }> {
  const preference = configuredEngine();
  if (preference === 'tesseract') return { engine: 'tesseract', reason: 'INVOICE_OCR_ENGINE=tesseract' };

  const probe = await isPaddleAvailable();
  if (preference === 'paddle') {
    // Explicitly requested: still fall back rather than fail the extraction, but
    // make it clear in the diagnostics that the requested engine was unavailable.
    return probe.available
      ? { engine: 'paddle', reason: 'INVOICE_OCR_ENGINE=paddle' }
      : { engine: 'tesseract', reason: `paddle requested but unavailable (${probe.detail})` };
  }
  return probe.available
    ? { engine: 'paddle', reason: 'auto: paddle available' }
    : { engine: 'tesseract', reason: `auto: paddle unavailable (${probe.detail})` };
}
