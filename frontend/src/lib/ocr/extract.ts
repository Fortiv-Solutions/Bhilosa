/**
 * Invoice extraction orchestrator.
 *
 * Pipeline, all deterministic — no model calls anywhere:
 *   render (mupdf) -> border trim -> orientation probe -> OCR (PSM 3 + 11 merged)
 *   -> slope-corrected row banding -> gutter-derived table columns
 *   -> label-anchored field reads -> arithmetic reconciliation & repair
 *
 * Multi-invoice PDFs are handled: pages are grouped by invoice number so a single
 * upload containing several unrelated invoices (exactly like the sample file)
 * yields one result per invoice rather than one mangled merge.
 */

import { createHash } from 'node:crypto';
import { PageIndex } from './geometry';
import {
  detectRotation, getLastEngineError, ocrImageRobust, ocrPdfPageRobust,
  readNumericRegion, usableWordCount,
} from './engine';
import {
  extractBuyerAndShipTo, extractDispatchFrom, extractDocumentInfo, extractPayment,
  extractRemarks, extractTerms, extractTotals, extractTransport, extractVendor,
  type FieldContext,
} from './fields';
import { reconcile } from './reconcile';
import {
  OCR_DPI, type Rotation, countPdfPages, isPdf, prepareImageUpload, renderAndPreprocess,
} from './render';
import {
  detectLineItemTable, extractHsnSummary, extractLineItems, extractTableTotalRow,
} from './table';
import { applyDiscountCascade, parseAmount } from './numbers';
import {
  type BBox, type ExtractedInvoice, type ExtractionWarning, type HsnSummaryRow,
  type InvoiceLineItem, type OcrPage, emptyParty, emptyTotals,
} from './types';

export interface ExtractOptions {
  fileName?: string;
  /** Override orientation detection (mainly for tests). */
  rotation?: Rotation;
  dpi?: number;
  /** Cap on pages processed; scanned batches can be large. */
  maxPages?: number;
  /** Retain the rendered page PNGs on the result for a side-by-side review UI. */
  keepImages?: boolean;
}

/**
 * Per-page OCR telemetry. Always returned, because when extraction disappoints the
 * first question is always "did OCR see anything at all?" and that must be
 * answerable without re-running anything.
 */
export interface PageDiagnostic {
  pageNumber: number;
  rotation: number;
  width: number;
  height: number;
  wordCount: number;
  usableWordCount: number;
  meanConfidence: number;
  recipe: string;
  attempts: Array<{ recipe: string; words: number; confidence: number }>;
  textSample: string;
}

export interface ExtractionOutcome {
  invoices: ExtractedInvoice[];
  /** Rendered page images, base64 PNG, when keepImages is set. */
  pageImages?: string[];
  processingMs: number;
  diagnostics: PageDiagnostic[];
}

/** Per-page extraction, before pages are grouped into invoices. */
interface PageExtraction {
  page: OcrPage;
  idx: PageIndex;
  invoiceNumber: string | null;
  partial: ExtractedInvoice;
  /** Cell regions for the line items, so numeric cells can be re-read. */
  itemRegions: Array<Partial<Record<string, BBox>>>;
  /** Per-cell OCR confidence, to decide what is worth re-reading. */
  itemConfidences: Array<Record<string, number | null>>;
}

/**
 * Re-read low-confidence numeric cells from upscaled crops with a digits-only
 * alphabet.
 *
 * This is the strongest per-field accuracy mechanism available without a model:
 * constraining the alphabet removes the entire letter/digit confusion class
 * (O/0, l/1, S/5, B/8) at source rather than trying to repair it afterwards, and
 * a 3x upscale of one cell gives Tesseract far more pixels per glyph than the
 * whole-page pass had.
 *
 * It costs an OCR call per cell, so it runs only where it can pay for itself:
 * cells the page pass was unsure about. Clean scans skip it almost entirely;
 * photographs, where character errors actually happen, benefit most. A re-read is
 * adopted only when it produces a number AND that number reconciles at least as
 * well as the original, so a worse reading can never win.
 */
async function refineNumericCells(
  page: OcrPage,
  items: InvoiceLineItem[],
  regions: Array<Partial<Record<string, BBox>>>,
  confidences: Array<Record<string, number | null>>,
): Promise<number> {
  /** Below this per-cell confidence a re-read is worth attempting. */
  const CELL_THRESHOLD = 88;
  let refined = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const region = regions[i] ?? {};
    const conf = confidences[i] ?? {};

    for (const field of ['quantity', 'rate', 'taxableValue', 'amount'] as const) {
      const box = region[field];
      const cellConf = conf[field];
      if (!box) continue;
      if (cellConf !== null && cellConf !== undefined && cellConf >= CELL_THRESHOLD) continue;

      const res = await readNumericRegion(page, box);
      if (!res) continue;
      const value = parseAmount(res.text);
      if (value === null || value <= 0) continue;

      // Accept only when the re-read improves internal consistency.
      const qty = item.quantity;
      const rate = item.unitRate;
      const taxable = item.taxableValue;

      if (field === 'quantity' && rate !== null && taxable !== null && rate > 0) {
        const implied = taxable / rate;
        const before = qty === null ? Infinity : Math.abs(qty - implied);
        if (Math.abs(value - implied) < before) {
          item.quantity = value;
          refined++;
        }
      } else if (field === 'rate' && qty !== null && taxable !== null && qty > 0) {
        const implied = taxable / qty;
        const before = rate === null ? Infinity : Math.abs(rate - implied);
        if (Math.abs(value - implied) < before) {
          item.unitRate = value;
          refined++;
        }
      } else if ((field === 'taxableValue' || field === 'amount') && qty !== null && rate !== null) {
        const implied = applyDiscountCascade(qty * rate, item.discountPercents);
        const before = taxable === null ? Infinity : Math.abs(taxable - implied);
        if (Math.abs(value - implied) < before) {
          item.taxableValue = value;
          refined++;
        }
      } else if (taxable === null && (field === 'taxableValue' || field === 'amount')) {
        // Nothing to check against, but a value beats a blank.
        item.taxableValue = value;
        refined++;
      }
    }
  }
  return refined;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Extract everything obtainable from one page. */
function extractPage(page: OcrPage, fileName: string, fileHash: string): PageExtraction {
  const idx = new PageIndex(page);
  const warnings: ExtractionWarning[] = [];
  const fieldConfidence: Record<string, number> = {};

  /**
   * The line-item table is located FIRST, because its bounds partition the page:
   * document references and party blocks lie above it, totals below it. Field
   * lookups that ignore that partition read column headings as totals.
   */
  let lineItems: InvoiceLineItem[] = [];
  let hsnSummary: HsnSummaryRow[] = [];
  let tableTotals: { totalQuantity: number | null; totalTaxable: number | null } = {
    totalQuantity: null,
    totalTaxable: null,
  };
  const table = detectLineItemTable(idx);
  let itemRegions: Array<Partial<Record<string, BBox>>> = [];
  let itemConfidences: Array<Record<string, number | null>> = [];

  const ctx: FieldContext = {
    idx,
    text: page.text,
    warn: (w) => warnings.push(w),
    confidence: (field, value) => {
      fieldConfidence[field] = value;
    },
    tableTop: table ? table.headerBBox.y0 : undefined,
    tableBottom: table ? table.dataBottom : undefined,
  };

  if (table) {
    const extraction = extractLineItems(idx, table);
    lineItems = extraction.items;
    itemRegions = extraction.regions as Array<Partial<Record<string, BBox>>>;
    itemConfidences = extraction.confidences;
    extraction.confidences.forEach((conf, i) => {
      for (const [col, value] of Object.entries(conf)) {
        if (value !== null) fieldConfidence[`lineItems.${i}.${col}`] = value / 100;
      }
    });
    tableTotals = extractTableTotalRow(idx, table);
    hsnSummary = extractHsnSummary(idx, table.dataBottom);
    // extractLineItems narrows dataBottom once the real table foot is known.
    ctx.tableBottom = table.dataBottom;
  } else {
    warnings.push({
      code: 'line_item_table_not_found',
      field: 'lineItems',
      severity: 'error',
      message:
        'No line-item table could be located on this page. If this vendor is new, its column headings may need adding to the OCR vocabulary.',
    });
  }

  // Parties: buyer/ship-to claim their GSTINs so the vendor lookup can take the
  // remaining one rather than guessing from position alone.
  const { buyer, shipTo, claimedGstins } = extractBuyerAndShipTo(ctx);
  const vendor = extractVendor(ctx, claimedGstins);
  const dispatchFrom = extractDispatchFrom(ctx);
  const document = extractDocumentInfo(ctx);
  const transport = extractTransport(ctx);

  const lineSum = lineItems.reduce((s, it) => s + (it.taxableValue ?? 0), 0);
  const totals = extractTotals(ctx, lineItems.length ? lineSum : null, lineItems);
  if (totals.totalQuantity === null) totals.totalQuantity = tableTotals.totalQuantity;
  if (totals.taxableAmount === null) totals.taxableAmount = tableTotals.totalTaxable;

  const payment = extractPayment(ctx);
  const terms = extractTerms(ctx);
  const remarks = extractRemarks(ctx);

  const partial: ExtractedInvoice = {
    meta: {
      sourceFileName: fileName,
      sourceFileHash: fileHash,
      pageNumbers: [page.pageNumber],
      pageRotations: [page.rotation],
      detectedTemplate: 'generic-geometric',
      templateConfidence: 1,
      engine: `tesseract.js/eng ${page.recipe}`,
      ocrMeanConfidence: page.meanConfidence,
      processingMs: 0,
    },
    vendor,
    buyer,
    shipTo,
    dispatchFrom,
    document,
    transport,
    lineItems,
    hsnSummary,
    totals,
    payment,
    termsAndConditions: terms,
    remarks,
    validation: {
      lineMathOk: true,
      taxMathOk: true,
      grandTotalOk: true,
      hsnSummaryMatchesLines: true,
      amountInWordsMatches: null,
      gstinValid: { vendor: null, buyer: null },
      warnings,
      fieldConfidence,
      overallConfidence: 0,
      repairedFields: [],
    },
    rawText: [page.text],
  };

  return { page, idx, invoiceNumber: document.invoiceNumber, partial, itemRegions, itemConfidences };
}

/**
 * Merge continuation pages into the first page of the same invoice.
 * Line items and HSN rows accumulate; header fields are taken from whichever page
 * supplied them first, and totals prefer the later page because a multi-page
 * invoice prints its totals on the last one.
 */
function mergePages(pages: PageExtraction[]): ExtractedInvoice {
  const base = pages[0].partial;
  for (const next of pages.slice(1)) {
    const p = next.partial;
    base.meta.pageNumbers.push(...p.meta.pageNumbers);
    base.meta.pageRotations.push(...p.meta.pageRotations);
    base.lineItems.push(...p.lineItems);
    base.hsnSummary.push(...p.hsnSummary);
    base.rawText.push(...p.rawText);
    base.validation.warnings.push(...p.validation.warnings);

    // Scalar header fields: fill gaps only.
    const asBag = (o: object) => o as unknown as Record<string, unknown>;
    for (const key of ['vendor', 'buyer', 'shipTo'] as const) {
      const target = asBag(base[key]);
      const source = asBag(p[key]);
      for (const f of Object.keys(source)) {
        const cur = target[f];
        const inc = source[f];
        if ((cur === null || (Array.isArray(cur) && cur.length === 0)) && inc !== null) target[f] = inc;
      }
    }
    const baseDoc = asBag(base.document);
    const nextDoc = asBag(p.document);
    for (const f of Object.keys(nextDoc)) {
      if (baseDoc[f] === null && nextDoc[f] !== null) baseDoc[f] = nextDoc[f];
    }
    // Totals prefer the later page: a multi-page invoice totals on its last page.
    const baseTotals = asBag(base.totals);
    const nextTotals = asBag(p.totals);
    for (const f of Object.keys(nextTotals)) {
      const inc = nextTotals[f];
      if (inc !== null && inc !== undefined) baseTotals[f] = inc;
    }
    if (!base.payment.bankAccounts.length) base.payment.bankAccounts = p.payment.bankAccounts;
    if (!base.termsAndConditions.length) base.termsAndConditions = p.termsAndConditions;
    if (!base.remarks) base.remarks = p.remarks;

    base.meta.ocrMeanConfidence = (base.meta.ocrMeanConfidence + p.meta.ocrMeanConfidence) / 2;
  }
  // Renumber line items so the merged sequence is contiguous.
  base.lineItems.forEach((it, i) => {
    it.sr = i + 1;
  });
  return base;
}

/**
 * Group page extractions into invoices.
 *
 * Pages sharing an invoice number belong together. A page with no readable
 * invoice number is treated as a continuation of the preceding invoice, since a
 * genuine second invoice virtually always reprints its own number.
 */
function groupIntoInvoices(pages: PageExtraction[]): PageExtraction[][] {
  const groups: PageExtraction[][] = [];
  for (const p of pages) {
    const last = groups[groups.length - 1];
    if (!last) {
      groups.push([p]);
      continue;
    }
    const lastNo = last[0].invoiceNumber;
    if (p.invoiceNumber === null) {
      last.push(p);
    } else if (lastNo !== null && p.invoiceNumber === lastNo) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }
  return groups;
}

/**
 * Extract every invoice from an uploaded PDF or image.
 * Never throws for content reasons: an unreadable page yields warnings so the
 * caller can still present a partially filled form.
 */
export async function extractInvoices(
  bytes: Buffer,
  opts: ExtractOptions = {},
): Promise<ExtractionOutcome> {
  const started = Date.now();
  const fileName = opts.fileName ?? 'invoice';
  const fileHash = sha256(bytes);
  const dpi = opts.dpi ?? OCR_DPI;

  const ocrPages: OcrPage[] = [];
  const diagnostics: PageDiagnostic[] = [];

  if (isPdf(bytes, fileName)) {
    const source = new Uint8Array(bytes);
    const total = await countPdfPages(source);
    const limit = Math.min(total, opts.maxPages ?? 12);
    for (let i = 0; i < limit; i++) {
      const rotation = opts.rotation ?? (await detectRotation(source, i)).rotation;
      // Escalates through alternative recipes rather than accepting a bad read.
      const { page, attempts } = await ocrPdfPageRobust(source, i, { rotation, dpi });
      ocrPages.push(page);
      diagnostics.push({
        pageNumber: page.pageNumber,
        rotation: page.rotation,
        width: page.width,
        height: page.height,
        wordCount: page.words.length,
        usableWordCount: usableWordCount(page),
        meanConfidence: Math.round(page.meanConfidence * 10) / 10,
        recipe: page.recipe,
        attempts,
        textSample: page.text.replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    }
  } else {
    /**
     * An image upload (phone photo, scan, screenshot) goes through the photograph
     * ladder: orientation probe, then crop-to-document / local-contrast / scale
     * recipes until the read is usable. Previously this was a single attempt with
     * flat-scan settings and no retry, which is why photographs failed outright.
     */
    const { page, attempts } = await ocrImageRobust(bytes, { rotation: opts.rotation });
    ocrPages.push(page);
    diagnostics.push({
      pageNumber: 1,
      rotation: page.rotation,
      width: page.width,
      height: page.height,
      wordCount: page.words.length,
      usableWordCount: usableWordCount(page),
      meanConfidence: Math.round(page.meanConfidence * 10) / 10,
      recipe: page.recipe,
      attempts,
      textSample: page.text.replace(/\s+/g, ' ').trim().slice(0, 300),
    });
  }

  /**
   * If no page produced usable text, say so plainly. Returning an "extraction"
   * whose every field is null forces the user to guess whether the invoice was
   * unreadable, the vendor unknown, or the install broken.
   */
  const totalUsable = diagnostics.reduce((s, d) => s + d.usableWordCount, 0);
  if (totalUsable < 15) {
    const engineError = getLastEngineError();
    throw new Error(
      (engineError
        ? `OCR could not read this document: ${engineError}. `
        : 'OCR could not read any text from this document. ') +
        `Pages tried: ${diagnostics.length}, usable words found: ${totalUsable}. ` +
        'If it is a photograph, retake it flat with the whole invoice in frame in good light; ' +
        'if it is a screenshot or a very low-resolution scan, supply the original PDF.',
    );
  }

  const extractions = ocrPages.map((p) => extractPage(p, fileName, fileHash));

  /**
   * Refine low-confidence numeric cells before reconciliation, so the arithmetic
   * checks judge the best available readings rather than the first-pass ones.
   */
  let refinedCells = 0;
  for (const ex of extractions) {
    if (!ex.partial.lineItems.length) continue;
    try {
      refinedCells += await refineNumericCells(
        ex.page,
        ex.partial.lineItems,
        ex.itemRegions,
        ex.itemConfidences,
      );
    } catch {
      /* refinement is an optimisation, never a hard failure */
    }
  }
  if (refinedCells) {
    for (const d of diagnostics) d.recipe += ` +${refinedCells}cellRefine`;
  }
  const invoices = groupIntoInvoices(extractions).map((group) => {
    const invoice = mergePages(group);
    reconcile(invoice);
    invoice.meta.processingMs = Date.now() - started;
    return invoice;
  });

  const outcome: ExtractionOutcome = {
    invoices,
    processingMs: Date.now() - started,
    diagnostics,
  };
  if (opts.keepImages) {
    outcome.pageImages = ocrPages.map((p) => p.image.toString('base64'));
  }
  return outcome;
}

/**
 * The invoice to drive the GRN form from.
 *
 * Document order wins: the first invoice with line items is chosen, not the
 * highest-confidence one. Ranking by confidence made a multi-invoice upload pick
 * an arbitrary page (0.94 beat 0.93), which is unpredictable for the user; page
 * order is meaningful and stable. The full list is returned alongside so the UI
 * can offer the others.
 */
export function primaryInvoice(outcome: ExtractionOutcome): ExtractedInvoice | null {
  if (!outcome.invoices.length) return null;
  return outcome.invoices.find((i) => i.lineItems.length > 0) ?? outcome.invoices[0];
}

export { emptyParty, emptyTotals };
