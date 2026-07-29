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
  detectRotation, ocrRenderedPage,
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
import {
  type ExtractedInvoice, type ExtractionWarning, type HsnSummaryRow,
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

export interface ExtractionOutcome {
  invoices: ExtractedInvoice[];
  /** Rendered page images, base64 PNG, when keepImages is set. */
  pageImages?: string[];
  processingMs: number;
}

/** Per-page extraction, before pages are grouped into invoices. */
interface PageExtraction {
  page: OcrPage;
  idx: PageIndex;
  invoiceNumber: string | null;
  partial: ExtractedInvoice;
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
  const totals = extractTotals(ctx, lineItems.length ? lineSum : null);
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

  return { page, idx, invoiceNumber: document.invoiceNumber, partial };
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

  if (isPdf(bytes, fileName)) {
    const source = new Uint8Array(bytes);
    const total = await countPdfPages(source);
    const limit = Math.min(total, opts.maxPages ?? 12);
    for (let i = 0; i < limit; i++) {
      const rotation = opts.rotation ?? (await detectRotation(source, i)).rotation;
      const rendered = await renderAndPreprocess(source, i, dpi, rotation);
      ocrPages.push(await ocrRenderedPage(rendered));
    }
  } else {
    // A plain image upload: probe orientation on the image itself.
    const rendered = await prepareImageUpload(bytes, opts.rotation ?? 0);
    ocrPages.push(await ocrRenderedPage(rendered));
  }

  const extractions = ocrPages.map((p) => extractPage(p, fileName, fileHash));
  const invoices = groupIntoInvoices(extractions).map((group) => {
    const invoice = mergePages(group);
    reconcile(invoice);
    invoice.meta.processingMs = Date.now() - started;
    return invoice;
  });

  const outcome: ExtractionOutcome = {
    invoices,
    processingMs: Date.now() - started,
  };
  if (opts.keepImages) {
    outcome.pageImages = ocrPages.map((p) => p.image.toString('base64'));
  }
  return outcome;
}

/** Convenience: the single best invoice from an upload, or null. */
export function primaryInvoice(outcome: ExtractionOutcome): ExtractedInvoice | null {
  if (!outcome.invoices.length) return null;
  // Prefer the highest-confidence invoice that has line items.
  const scored = [...outcome.invoices].sort((a, b) => {
    const aHas = a.lineItems.length > 0 ? 1 : 0;
    const bHas = b.lineItems.length > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return b.validation.overallConfidence - a.validation.overallConfidence;
  });
  return scored[0];
}

export { emptyParty, emptyTotals };
