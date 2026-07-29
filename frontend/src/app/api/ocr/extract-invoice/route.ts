/**
 * POST /api/ocr/extract-invoice
 *
 * Deterministic invoice OCR — no model calls. Accepts a supplier invoice (PDF or
 * image) and returns the structured extraction plus a ready-to-merge GRN patch.
 *
 * Runs on the Node runtime because the pipeline uses native/wasm modules
 * (mupdf, sharp, tesseract.js). OCR is CPU-bound and takes tens of seconds per
 * page, so the route is deliberately given a long maxDuration and results are
 * cached by file hash.
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { extractInvoices, primaryInvoice } from '@/lib/ocr/extract';
import { resolveLangPath } from '@/lib/ocr/engine';
import { buildGrnPatch } from '@/lib/ocr/invoice-to-grn';
import type { ExtractedInvoice } from '@/lib/ocr/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Tesseract needs real time: ~30-60s per scanned page at 400 dpi. */
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPTED = /\.(?:pdf|png|jpe?g|tiff?|webp|bmp)$/i;

/**
 * In-process cache keyed by file hash. Re-uploading the same invoice — which
 * happens constantly while a storeman corrects a GRN — must not re-run OCR.
 */
interface CacheEntry {
  at: number;
  payload: unknown;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 32;

function cacheGet(key: string): unknown | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, payload: unknown): void {
  if (CACHE.size >= CACHE_MAX) {
    // Drop the oldest entry.
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of CACHE) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) CACHE.delete(oldestKey);
  }
  CACHE.set(key, { at: Date.now(), payload });
}

/** Trim the extraction for transport: raw page text is large and rarely needed. */
function slimInvoice(inv: ExtractedInvoice, includeRawText: boolean): ExtractedInvoice {
  if (includeRawText) return inv;
  return { ...inv, rawText: inv.rawText.map((t) => t.slice(0, 2000)) };
}

export async function POST(request: Request) {
  const started = Date.now();
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was provided.' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File is too large (${(file.size / 1048576).toFixed(1)} MB). The limit is 25 MB.` },
        { status: 413 },
      );
    }
    const fileName = file.name || 'invoice.pdf';
    if (!ACCEPTED.test(fileName)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload a PDF, PNG, JPG, TIFF, WEBP or BMP.' },
        { status: 415 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = createHash('sha256').update(bytes).digest('hex');
    const includeRawText = formData.get('includeRawText') === 'true';
    const includeImages = formData.get('includeImages') === 'true';
    const cacheKey = `${hash}:${includeRawText}:${includeImages}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json({ ...(cached as object), cached: true });
    }

    const outcome = await extractInvoices(bytes, {
      fileName,
      keepImages: includeImages,
      maxPages: 12,
    });

    const primary = primaryInvoice(outcome);
    if (!primary) {
      return NextResponse.json(
        {
          error:
            'Nothing could be read from this document. If it is a photograph, retake it flat with the whole invoice in frame and good lighting.',
          processingMs: Date.now() - started,
        },
        { status: 422 },
      );
    }

    const payload = {
      success: true,
      fileName,
      fileHash: hash,
      fileSizeBytes: file.size,
      processingMs: Date.now() - started,
      /** How many distinct invoices the upload contained. */
      invoiceCount: outcome.invoices.length,
      /** The invoice used to build the GRN patch. */
      invoice: slimInvoice(primary, includeRawText),
      /** Every invoice found, so a multi-invoice upload can be split by the UI. */
      invoices: outcome.invoices.map((i) => slimInvoice(i, includeRawText)),
      /** Field-level patch ready to merge into the GRN form. */
      grnPatch: buildGrnPatch(primary),
      pageImages: outcome.pageImages,
      engine: primary.meta.engine,
      /**
       * Always returned. When extraction disappoints, the first question is "did
       * OCR see anything at all?", and that must be answerable from the response
       * rather than by re-running the job with logging turned on.
       */
      diagnostics: outcome.diagnostics,
      tessdataPath: resolveLangPath(),
    };

    cacheSet(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invoice extraction failed.';
    // Surface the reason: a missing tessdata directory or an unreadable PDF are
    // both actionable, and a generic 500 would hide them.
    return NextResponse.json(
      {
        error: message,
        processingMs: Date.now() - started,
        // A null path here is itself the diagnosis: the language file is missing.
        tessdataPath: resolveLangPath(),
      },
      { status: 500 },
    );
  }
}
