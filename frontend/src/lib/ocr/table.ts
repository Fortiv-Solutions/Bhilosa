/**
 * Generic table extraction: line items and the HSN-wise tax summary.
 *
 * A table is located by finding the row band that resolves the most recognised
 * column headers, columns are derived from those header x-positions, and every
 * subsequent row's words are slotted geometrically. One implementation therefore
 * reads a 12-column legacy landscape table, an 8-column SaaS table, and a
 * 14-column table whose quantity column is titled "BAGES".
 *
 * Both tables go through the same detector with different vocabularies, because
 * the HSN summary is structurally just another table.
 */

import { COLUMN_ALIASES, NUMERIC_COLUMNS, type LineColumn, isNoise } from './aliases';
import {
  type ColumnSpec, PageIndex, bboxCenterX, bboxCenterY, bboxHeight, buildColumns, cellConfidence, cellText,
  columnsFromGutters, findColumnGutters, labelKey, labelMatches, slotRowIntoColumns,
  stripRuleTokens, unionAll,
} from './geometry';
import {
  isBlankish, isUnitLikeHeader, normaliseHsn, normaliseUnit, parseAmount,
  parseDiscountCascade, parseNumber, splitQuantityUnit,
} from './numbers';
import type { BBox, HsnSummaryRow, InvoiceLineItem, OcrWord } from './types';

// ---------------------------------------------------------------------------
// Column vocabularies
// ---------------------------------------------------------------------------

export interface ColumnVocabulary {
  column: string;
  aliases: string[];
}

const LINE_ITEM_VOCAB: ColumnVocabulary[] = COLUMN_ALIASES.map((c) => ({ column: c.column, aliases: c.aliases }));

/**
 * HSN summary vocabulary. Deliberately separate from the line-item one: the
 * summary's "Basic"/"Tax.Value" column means taxable value, and its rate/amount
 * pairs sit under grouped two-level headers ("Central Tax" over "Rate|Amount").
 */
const HSN_VOCAB: ColumnVocabulary[] = [
  { column: 'hsn', aliases: ['HSN / Sac', 'Hsn / Sac', 'HSN/SAC', 'Hsn/Sac', 'HSN CODE', 'HSN', 'SAC'] },
  { column: 'taxableValue', aliases: ['Taxable Value', 'Tax.Value Rs.', 'Tax.Value', 'Tax Value', 'Basic', 'Taxable'] },
  { column: 'combinedTaxRate', aliases: ['Tax (%)', 'Tax(%)', 'Tax %'] },
  { column: 'cgstRate', aliases: ['CGst%', 'CGST %', 'C.Gst %', 'CGST Rate'] },
  { column: 'sgstRate', aliases: ['S.Gst%', 'SGST %', 'S.Gst %', 'SGST Rate'] },
  { column: 'cgstAmount', aliases: ['C.Gst', 'CGST Amount', 'CGST Amt', 'CGST'] },
  { column: 'sgstAmount', aliases: ['S.Gst', 'SGST Amount', 'SGST Amt', 'SGST', 'UT/SGST'] },
  { column: 'igstAmount', aliases: ['IGST Amount', 'IGST'] },
  { column: 'cessAmount', aliases: ['CESS Amount', 'CESS', 'Cess'] },
  { column: 'totalTax', aliases: ['Total Tax', 'TOTAL Amount', 'Total Amount', 'Total'] },
];

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

export interface DetectedHeader {
  column: string;
  bbox: BBox;
  headerText: string;
}

export interface DetectedTable {
  columns: ColumnSpec[];
  headers: DetectedHeader[];
  headerBBox: BBox;
  dataTop: number;
  dataBottom: number;
  /** Unit inferred from a unit-named quantity header, e.g. "BAGES" -> BAGS. */
  headerUnit: string | null;
  /**
   * The exact words that formed the heading.
   *
   * Data rows are separated from the heading by EXCLUDING these words, not by a
   * y-coordinate cutoff. A cutoff is unsafe: when a data row sits tight against
   * the heading, cell contents at slightly different baselines straddle it. On a
   * photographed invoice this silently dropped the description text — leaving the
   * row with numbers but no identity, so the item was discarded entirely.
   */
  headerWords: OcrWord[];
}

/**
 * Resolve a header cell to a canonical column.
 * The vocabulary is ordered specific-first, and longer alias matches score
 * higher, so "Taxable Amount Rs." never collapses into the generic `amount`.
 */
function matchColumn(text: string, vocab: ColumnVocabulary[]): { column: string; score: number } | null {
  const key = labelKey(text);
  if (!key) return null;
  let best: { column: string; score: number } | null = null;

  for (const { column, aliases } of vocab) {
    for (const alias of aliases) {
      const aKey = labelKey(alias);
      if (!aKey) continue;
      let score = 0;
      if (key === aKey) score = 200 + aKey.length * 2;
      else if (labelMatches(text, alias)) score = 120 + aKey.length * 2;
      else if (key.length >= 4 && aKey.length >= 4 && key.includes(aKey)) score = 60 + aKey.length;
      else if (key.length >= 4 && aKey.length >= 5 && aKey.includes(key)) score = 40 + key.length;
      if (score && (!best || score > best.score)) best = { column, score };
    }
  }

  /**
   * Fallback: a column headed by a unit noun IS the quantity column.
   * Some ERPs never print "Qty" at all and title the column after what is being
   * counted — ARCHIT heads its quantity column "BAGES" (a misspelling of BAGS).
   * Only applied when no vocabulary alias matched, so a real "Unit" column is
   * unaffected.
   */
  if (!best && vocab.some((v) => v.column === 'quantity') && isUnitLikeHeader(text)) {
    return { column: 'quantity', score: 30 };
  }
  return best;
}

/** Cluster a row's words into header cells by horizontal gaps. */
function groupWordsIntoCells(words: OcrWord[], gapLimit: number): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const cells: OcrWord[][] = [];
  let cur: OcrWord[] = [];
  let lastX1 = Number.NEGATIVE_INFINITY;
  for (const w of sorted) {
    if (cur.length && w.bbox.x0 - lastX1 > gapLimit) {
      cells.push(cur);
      cur = [];
    }
    cur.push(w);
    lastX1 = Math.max(lastX1, w.bbox.x1);
  }
  if (cur.length) cells.push(cur);
  return cells;
}

export interface DetectTableOptions {
  vocabulary?: ColumnVocabulary[];
  /** Only consider header bands starting below this y. */
  searchTop?: number;
  /** Only consider header bands ending above this y. */
  searchBottom?: number;
  /** Minimum distinct columns for a band to qualify as a header. */
  minColumns?: number;
  /** Require at least one of these columns to be present. */
  requireAny?: string[][];
}

/**
 * Detect a table by scanning row bands for the best header match.
 *
 * Header text frequently wraps over several physical lines, so bands of 1-4
 * consecutive rows are all scored and the best-resolving band wins. ARCHIT needs
 * all four ("Taxable / CGST / UT-SGST", "Description of / Net / Disc / Amount",
 * "Goods HSN CODE BAGES Rate Rate % Disc. Rs.", and the unit row). Multiple gap
 * widths are tried when splitting a band into cells, because header spacing
 * differs wildly between vendors.
 */
export function detectTable(idx: PageIndex, opts: DetectTableOptions = {}): DetectedTable | null {
  const vocab = opts.vocabulary ?? LINE_ITEM_VOCAB;
  const minColumns = opts.minColumns ?? 3;
  const lh = idx.lineHeight;

  const words = stripRuleTokens(idx.words.filter((w) => !isNoise(w.text)));
  const rows = idx.rows(words);

  // ---- Phase 1: locate the header band -------------------------------------
  // Only the band's vertical position needs to be right here; the definitive
  // column geometry comes from the data in phase 2.
  interface Band {
    headerWords: OcrWord[];
    bbox: BBox;
    score: number;
    rowIdx: number;
    span: number;
  }
  let band: Band | null = null;

  for (let i = 0; i < rows.length; i++) {
    for (let span = 1; span <= 4 && i + span <= rows.length; span++) {
      const merged = rows.slice(i, i + span).flat();
      if (merged.length < minColumns) continue;
      const bbox = unionAll(merged.map((w) => w.bbox));
      if (!bbox) continue;
      if (opts.searchTop !== undefined && bbox.y0 < opts.searchTop) continue;
      if (opts.searchBottom !== undefined && bbox.y1 > opts.searchBottom) continue;
      if (bboxHeight(bbox) > lh * 5) continue;

      for (const gapMult of [0.6, 0.9, 1.4, 2.2]) {
        const cells = groupWordsIntoCells(merged, lh * gapMult);
        const used = new Set<string>();
        let score = 0;
        let matched = 0;
        for (const cell of cells) {
          const text = cell.map((w) => w.text).join(' ').trim();
          if (!text) continue;
          const m = matchColumn(text, vocab);
          if (!m || used.has(m.column)) continue;
          used.add(m.column);
          score += m.score;
          matched++;
        }
        if (matched < minColumns) continue;
        const total = matched * 1000 + score - bbox.y0 * 0.01;
        if (!band || total > band.score) {
          band = { headerWords: merged, bbox, score: total, rowIdx: i, span };
        }
      }
    }
  }
  if (!band) return null;

  // ---- Phase 2: derive column geometry from the data ------------------------
  const dataTop = band.bbox.y1 + lh * 0.15;
  const dataRows = rows.slice(band.rowIdx + band.span);

  // Stop at the table foot so totals rows do not distort the gutters.
  const dataWords: OcrWord[] = [];
  let dataBottom = idx.height;
  for (const row of dataRows) {
    const text = row.map((w) => w.text).join(' ');
    if (TABLE_END_RE.test(text) || isTotalsRow(text)) {
      dataBottom = Math.min(...row.map((w) => w.bbox.y0));
      break;
    }
    dataWords.push(...row);
  }

  // Gutters need the header words too: a column whose data cells are all blank
  // would otherwise vanish, merging its heading into a neighbour.
  const geometryWords = [...dataWords, ...band.headerWords];

  /**
   * The gutter width that separates columns is vendor-specific, and getting it
   * wrong fails in both directions: too small splits long description text at
   * its word spaces, too large merges adjacent numeric columns. Rather than
   * guess, try a range and keep whichever geometry resolves the most named
   * columns — the vocabulary itself is the objective function.
   */
  const buildFromGutters = (minGutter: number): ColumnSpec[] | null => {
    const boundaries = findColumnGutters(geometryWords, { minGutter });
    if (boundaries.length < minColumns + 1) return null;
    const claimed = new Set<string>();
    return columnsFromGutters(boundaries, band.headerWords, (headerText: string) => {
      const m = matchColumn(headerText, vocab);
      if (!m) return null;
      // One canonical column per table; a duplicate heading keeps its own slot
      // under a synthetic name so its data never overwrites the real column.
      if (claimed.has(m.column)) return null;
      claimed.add(m.column);
      return m.column;
    });
  };

  let columns: ColumnSpec[] | null = null;
  let bestNamed = 0;
  for (const mult of [0.5, 0.8, 1.1, 1.5, 2.0, 2.6]) {
    const cand = buildFromGutters(Math.max(6, lh * mult));
    if (!cand) continue;
    const named = cand.filter((c) => !/^col\d+$/.test(c.name)).length;
    // More named columns wins; on a tie prefer the coarser split (fewer strays).
    if (named > bestNamed || (named === bestNamed && columns && cand.length < columns.length)) {
      bestNamed = named;
      columns = cand;
    }
  }

  if (!columns) {
    // Degenerate geometry (single data row, heavy bleed): fall back to header
    // midpoints rather than giving up on the table entirely.
    const cells = groupWordsIntoCells(band.headerWords, lh * 0.9);
    const hdrs = cells
      .map((cell) => {
        const text = cell.map((w) => w.text).join(' ').trim();
        const m = matchColumn(text, vocab);
        return m ? { name: m.column, bbox: unionAll(cell.map((w) => w.bbox)) as BBox, headerText: text } : null;
      })
      .filter((h): h is { name: string; bbox: BBox; headerText: string } => h !== null);
    columns = buildColumns(hdrs, 0, idx.width);
  }

  /**
   * Recover a value column whose heading the OCR lost.
   *
   * The rightmost column of an invoice table is always the line amount, and it is
   * also the heading most often destroyed — it sits at the page edge where photos
   * blur and scans clip. If nothing was named as the amount but an unnamed column
   * to the right of the named ones holds numbers, that column is the amount.
   * Measured on a photographed invoice this recovered a 7,050.00 line total that
   * was otherwise discarded.
   */
  const hasValueColumn = columns.some((c) => c.name === 'amount' || c.name === 'taxableValue');
  if (!hasValueColumn && vocab === LINE_ITEM_VOCAB) {
    const namedRight = columns.reduce(
      (max, c) => (!/^col\d+$/.test(c.name) ? Math.max(max, c.x1) : max),
      -Infinity,
    );
    for (let i = columns.length - 1; i >= 0; i--) {
      const col = columns[i];
      if (!/^col\d+$/.test(col.name)) continue;
      if (col.x0 < namedRight - (col.x1 - col.x0)) continue;
      // Does this column actually hold amounts in the data rows?
      const cellWords = dataWords.filter((w) => {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2;
        return cx >= col.x0 && cx < col.x1;
      });
      const numeric = cellWords.filter((w) => parseAmount(w.text) !== null);
      if (cellWords.length && numeric.length >= Math.max(1, cellWords.length * 0.6)) {
        col.name = 'amount';
        break;
      }
    }
  }

  const headers: DetectedHeader[] = columns
    .filter((c) => !/^col\d+$/.test(c.name))
    .map((c) => ({ column: c.name, bbox: c.headerBBox, headerText: c.headerText }));

  if (headers.length < minColumns) return null;
  if (opts.requireAny) {
    const present = new Set(headers.map((h) => h.column));
    for (const group of opts.requireAny) {
      if (!group.some((c) => present.has(c))) return null;
    }
  }

  // A quantity column titled with a unit noun carries the unit for every row.
  const qtyHeader = headers.find((h) => h.column === 'quantity');
  let headerUnit: string | null = null;
  if (
    qtyHeader &&
    isUnitLikeHeader(qtyHeader.headerText) &&
    !/^(qty|qty\.?|quantity|qnty)$/i.test(qtyHeader.headerText.trim())
  ) {
    headerUnit = normaliseUnit(qtyHeader.headerText);
  }

  return {
    columns,
    headers,
    headerBBox: band.bbox,
    dataTop,
    dataBottom,
    headerUnit,
    headerWords: band.headerWords,
  };
}

/** Detect the line-item table: must have an identity column and a numeric one. */
export function detectLineItemTable(idx: PageIndex, opts: { searchTop?: number } = {}): DetectedTable | null {
  const byHeader = detectTable(idx, {
    vocabulary: LINE_ITEM_VOCAB,
    searchTop: opts.searchTop,
    minColumns: 3,
    requireAny: [
      ['description', 'itemCode'],
      [...NUMERIC_COLUMNS],
    ],
  });
  if (byHeader) return byHeader;
  // Last resort for a vendor whose column headings are not in the vocabulary.
  return inferTableWithoutHeaders(idx, opts.searchTop);
}

/**
 * Infer a line-item table from its DATA when no heading could be recognised.
 *
 * A vendor whose column titles are absent from the vocabulary would otherwise
 * yield no items at all. But line-item rows have a recognisable shape regardless
 * of what the headings say: an HSN/SAC code (4, 6 or 8 digits) sitting alongside
 * two or more other numbers, repeated on consecutive rows with consistent column
 * positions.
 *
 * Columns are then named by POSITION using the near-universal Indian invoice
 * ordering — description, HSN, quantity, rate, amount — reading right to left
 * from the amount, which is the most reliable anchor because it is the widest
 * number and always last.
 *
 * Confidence is necessarily lower than a header-driven read, so callers should
 * treat these items as needing review.
 */
export function inferTableWithoutHeaders(idx: PageIndex, searchTop?: number): DetectedTable | null {
  const lh = idx.lineHeight;
  const words = stripRuleTokens(idx.words.filter((w) => !isNoise(w.text)));
  const rows = idx.rows(words);

  interface Candidate {
    row: OcrWord[];
    hsn: OcrWord;
    numbers: OcrWord[];
    y: number;
  }
  const candidates: Candidate[] = [];

  for (const row of rows) {
    const text = row.map((w) => w.text).join(' ');
    if (searchTop !== undefined && Math.min(...row.map((w) => w.bbox.y0)) < searchTop) continue;
    if (TABLE_END_RE.test(text) || isTotalsRow(text)) continue;

    const hsnWord = row.find((w) => normaliseHsn(w.text) !== null && /^\d{4,8}$/.test(w.text.replace(/\D/g, '')));
    if (!hsnWord) continue;
    const numbers = row.filter((w) => w !== hsnWord && parseAmount(w.text) !== null);
    if (numbers.length < 2) continue;
    // Needs some words that are not numeric, i.e. a description.
    const hasText = row.some((w) => /[A-Za-z]{3,}/.test(w.text));
    if (!hasText) continue;
    candidates.push({ row, hsn: hsnWord, numbers, y: Math.min(...row.map((w) => w.bbox.y0)) });
  }

  if (!candidates.length) return null;

  // Build columns from the gutters of the candidate rows themselves.
  const dataWords = candidates.flatMap((c) => c.row);
  let boundaries: number[] = [];
  let bestCount = 0;
  for (const mult of [0.8, 1.1, 1.5, 2.0]) {
    const b = findColumnGutters(dataWords, { minGutter: Math.max(6, lh * mult) });
    if (b.length - 1 > bestCount && b.length >= 4) {
      bestCount = b.length - 1;
      boundaries = b;
    }
  }
  if (boundaries.length < 4) return null;

  const hsnCenter = bboxCenterX(candidates[0].hsn.bbox);
  const columns: ColumnSpec[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    columns.push({
      name: `col${i}`,
      headerText: '',
      x0: boundaries[i],
      x1: boundaries[i + 1],
      headerBBox: { x0: boundaries[i], y0: 0, x1: boundaries[i + 1], y1: 0 },
    });
  }

  // Name by position: HSN where the code sits, description everything left of it,
  // then quantity / rate / amount left-to-right across the numeric columns.
  const hsnIdx = columns.findIndex((c) => hsnCenter >= c.x0 && hsnCenter < c.x1);
  if (hsnIdx < 0) return null;
  columns[hsnIdx].name = 'hsn';

  // Widest column left of the HSN is the description.
  let descIdx = -1;
  let descWidth = 0;
  for (let i = 0; i < hsnIdx; i++) {
    const w = columns[i].x1 - columns[i].x0;
    if (w > descWidth) {
      descWidth = w;
      descIdx = i;
    }
  }
  if (descIdx >= 0) columns[descIdx].name = 'description';

  const rightOfHsn = columns.slice(hsnIdx + 1);
  // The last numeric column is the amount; before it, rate; before that, quantity.
  const order = ['quantity', 'rate', 'amount'];
  if (rightOfHsn.length >= 3) {
    rightOfHsn[0].name = order[0];
    rightOfHsn[rightOfHsn.length - 2].name = order[1];
    rightOfHsn[rightOfHsn.length - 1].name = order[2];
  } else if (rightOfHsn.length === 2) {
    rightOfHsn[0].name = 'quantity';
    rightOfHsn[1].name = 'amount';
  } else if (rightOfHsn.length === 1) {
    rightOfHsn[0].name = 'amount';
  }

  const top = Math.min(...candidates.map((c) => c.y)) - lh * 0.5;
  return {
    columns,
    headers: columns
      .filter((c) => !/^col\d+$/.test(c.name))
      .map((c) => ({ column: c.name, bbox: c.headerBBox, headerText: c.headerText })),
    headerBBox: { x0: 0, y0: Math.max(0, top - lh), x1: idx.width, y1: top },
    dataTop: top,
    dataBottom: idx.height,
    headerUnit: null,
    // No heading was recognised, so there are no heading words to exclude.
    headerWords: [],
  };
}

// ---------------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------------

/** Rows that terminate the data region — a totals row must never become an item. */
const TABLE_END_RE =
  /\b(?:payment\s+(?:due|within)|amount\s+chargeable|bank\s+details?|terms\s+(?:of|&|and)|taxable\s+amount|grand\s+total|amount\s+payable|total\s+amount\s+due|hsn\s*\/?\s*sac|rupees|in\s+words|authoris|e\s*&\s*o\.?\s*e)\b/i;

/** A bare "Total" row: the word total plus numbers, no description text. */
function isTotalsRow(text: string): boolean {
  if (!/\btotal\b/i.test(text)) return false;
  const stripped = text.replace(/\btotal\b/i, '').replace(/[\d.,%:|\-\s]/g, '');
  return stripped.length <= 3;
}

interface RawRow {
  words: OcrWord[];
  cells: Record<string, OcrWord[]>;
  bbox: BBox;
}

/** Does a cell hold at least two alphanumeric characters of real content? */
function hasSubstance(text: string): boolean {
  return text.replace(/[^A-Za-z0-9]/g, '').length >= 2;
}

/**
 * Collect data rows beneath the header.
 *
 * Wrapped descriptions are the hard case: ARCHIT and AJIT put a continuation
 * line ("SEAT COVER") below a row whose numeric cells sit on the first line. A
 * row carrying only description-ish content and no numeric anchor is merged into
 * the previous item instead of becoming its own.
 */
export function extractRawRows(idx: PageIndex, table: DetectedTable): RawRow[] {
  const lh = idx.lineHeight;
  /**
   * Heading words are removed by IDENTITY. Using a y cutoff instead drops cell
   * contents that sit slightly higher than their row's numbers — on a photographed
   * invoice that silently removed the description, leaving a row with no identity
   * which was then discarded, producing zero line items from a perfectly readable
   * table. The coarse guard below only keeps rows from above the heading out.
   */
  const headerSet = new Set<OcrWord>(table.headerWords);
  const headerTop = table.headerBBox.y0;
  const words = stripRuleTokens(
    idx.words.filter(
      (w) => !headerSet.has(w) && bboxCenterY(w.bbox) > headerTop && !isNoise(w.text),
    ),
  );
  const rows = idx.rows(words);
  const out: RawRow[] = [];

  for (const row of rows) {
    const text = row.map((w) => w.text).join(' ');
    const bbox = unionAll(row.map((w) => w.bbox)) as BBox;

    if (TABLE_END_RE.test(text) || isTotalsRow(text)) {
      table.dataBottom = bbox.y0;
      break;
    }

    const cells = slotRowIntoColumns(row, table.columns);
    const numericAnchor = ['quantity', 'rate', 'amount', 'taxableValue', 'listRate'].some((c) => {
      const t = cellText(cells, c);
      return !isBlankish(t) && parseNumber(t) !== null;
    });
    const hasHsn = normaliseHsn(cellText(cells, 'hsn')) !== null;
    const descText = cellText(cells, 'description');
    const codeText = cellText(cells, 'itemCode');
    const identity = hasSubstance(descText) || hasSubstance(codeText);

    if (!numericAnchor && !hasHsn) {
      // Continuation of the previous item's description.
      if (out.length && identity) {
        const prev = out[out.length - 1];
        for (const key of Object.keys(cells)) {
          if (!prev.cells[key]) prev.cells[key] = [];
          prev.cells[key].push(...cells[key]);
        }
        prev.words.push(...row);
        prev.bbox = unionAll([prev.bbox, bbox]) as BBox;
      }
      continue;
    }
    // Needs both a numeric anchor and some identity to be a real item.
    if (!identity && !numericAnchor) continue;
    out.push({ words: row, cells, bbox });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

export interface LineItemExtraction {
  items: InvoiceLineItem[];
  confidences: Array<Record<string, number | null>>;
  regions: Array<Partial<Record<LineColumn, BBox>>>;
  table: DetectedTable;
}

export function extractLineItems(idx: PageIndex, table: DetectedTable): LineItemExtraction {
  const rows = extractRawRows(idx, table);
  const items: InvoiceLineItem[] = [];
  const confidences: Array<Record<string, number | null>> = [];
  const regions: Array<Partial<Record<LineColumn, BBox>>> = [];

  rows.forEach((row, i) => {
    const get = (c: string) => cellText(row.cells, c);
    const rowText = row.words.map((w) => w.text).join(' ');

    /**
     * A grouped "CGST / Rate | Amount" heading often leaves both numbers in one
     * gutter column ("9.00 3489.41"). Split them by magnitude: a GST rate is a
     * small percentage, the amount is not.
     */
    const splitRateAmount = (
      rateCol: string,
      amountCol: string,
    ): { rate: number | null; amount: number | null } => {
      const rateCell = get(rateCol);
      const amountCell = get(amountCol);
      const rateNums = rateCell
        .split(/\s+/)
        .map((t) => parseAmount(t))
        .filter((n): n is number => n !== null);
      let rate = parseNumber(rateCell);
      let amount = parseAmount(amountCell);
      if (rateNums.length >= 2 && amount === null) {
        const rates = rateNums.filter((n) => n <= 30);
        const amounts = rateNums.filter((n) => n > 30);
        if (rates.length) rate = rates[0];
        if (amounts.length) amount = amounts[amounts.length - 1];
      } else if (rate !== null && rate > 30 && amount === null) {
        // Only an amount landed in the rate column.
        amount = rate;
        rate = null;
      }
      return { rate, amount };
    };

    const cgst = splitRateAmount('cgstRate', 'cgstAmount');
    const sgst = splitRateAmount('sgstRate', 'sgstAmount');
    const igst = splitRateAmount('igstRate', 'igstAmount');

    /**
     * Recover a two-stage discount cascade that the column split broke apart.
     * AJIT prints "55.00 + 15.25" in one cell, but it is wider than its heading
     * and the tail can land in the neighbouring column. Reading the cascade off
     * the row text recovers it, and the first value is required to agree with the
     * discount cell so an unrelated "+" elsewhere cannot be picked up.
     */
    const discountCell = get('discountPercent');
    let discounts = parseDiscountCascade(discountCell);
    if (discounts.length <= 1) {
      const m = rowText.match(/(\d{1,2}(?:\.\d{1,2})?)\s*\+\s*(\d{1,2}(?:\.\d{1,2})?)/);
      if (m) {
        const first = Number.parseFloat(m[1]);
        const second = Number.parseFloat(m[2]);
        const agrees = discounts.length === 0 || Math.abs(first - discounts[0]) < 0.01;
        if (agrees && first > 0 && first <= 100 && second > 0 && second <= 100) {
          discounts = [first, second];
        }
      }
    }

    const fused = splitQuantityUnit(get('quantity'));
    const unitCell = get('unit');
    let unit: string | null = null;
    let unitSource: InvoiceLineItem['unitSource'] = null;
    if (!isBlankish(unitCell)) {
      unit = normaliseUnit(unitCell);
      unitSource = 'unit_column';
    } else if (fused.unit) {
      unit = fused.unit;
      unitSource = 'fused_in_qty';
    } else if (table.headerUnit) {
      unit = table.headerUnit;
      unitSource = 'column_header';
    }

    const amount = parseAmount(get('amount'));
    const taxable = parseAmount(get('taxableValue'));
    const listRate = parseAmount(get('listRate'));
    const rate = parseAmount(get('rate'));
    const quantity = fused.quantity;

    // Two rate columns: keep whichever reconciles with the amount and park the
    // other as list/MRP. ARCHIT prints Net Rate 305.000 beside Rate 258.48, and
    // only the latter satisfies qty x rate = amount.
    let unitRate = rate;
    let effectiveList = listRate;
    const target = taxable ?? amount;
    if (quantity && quantity > 0 && target) {
      const implied = target / quantity;
      const rateErr = rate === null ? Infinity : Math.abs(rate - implied);
      const listErr = listRate === null ? Infinity : Math.abs(listRate - implied);
      if (listErr < rateErr) {
        unitRate = listRate;
        effectiveList = rate;
      }
    }

    const srText = get('sr');
    let description = get('description').replace(/\s+/g, ' ').trim();
    // When the serial and description columns share a gutter, the row number
    // leads the description text; drop it rather than storing "1 JOINT FILLER".
    const leadingSr = description.match(/^(\d{1,3})\s+(?=\D)/);
    if (leadingSr && (isBlankish(srText) || parseNumber(srText) === Number(leadingSr[1]))) {
      description = description.slice(leadingSr[0].length).trim();
    }
    // Printed cell rules cling to the code token ("|LCC000000001").
    const itemCode = get('itemCode').replace(/\s+/g, '').replace(/^[|[\]!¦]+/, '').replace(/[|[\]!¦]+$/, '');

    const item: InvoiceLineItem = {
      sr: parseNumber(srText) ?? (leadingSr ? Number(leadingSr[1]) : i + 1),
      itemCode: hasSubstance(itemCode) ? itemCode : null,
      brandOrCompany: hasSubstance(get('brand')) ? get('brand').replace(/\s+/g, ' ').trim() : null,
      description,
      hsnSac: normaliseHsn(get('hsn')),
      quantity,
      unit,
      unitSource,
      listRate: effectiveList,
      unitRate,
      discountPercents: discounts,
      discountAmount: parseAmount(get('discountAmount')),
      taxableValue: taxable ?? amount,
      cgstRate: cgst.rate,
      cgstAmount: cgst.amount,
      sgstRate: sgst.rate,
      sgstAmount: sgst.amount,
      igstRate: igst.rate,
      igstAmount: igst.amount,
      cessRate: parseNumber(get('cessRate')),
      cessAmount: parseAmount(get('cessAmount')),
      combinedTaxRate: parseNumber(get('combinedTaxRate')),
      lineTotal: parseAmount(get('lineTotal')),
    };

    /**
     * An item needs identity plus substance. A recognised HSN/SAC code counts as
     * identity in its own right: it is a government-assigned classification, so a
     * row carrying one alongside a quantity or amount is unambiguously a line item
     * even when its description was too degraded to read.
     */
    const hasIdentity = hasSubstance(description) || item.itemCode !== null || item.hsnSac !== null;
    const hasValue = item.taxableValue !== null || item.quantity !== null;
    if (!hasIdentity || !hasValue) return;

    items.push(item);
    const conf: Record<string, number | null> = {};
    const reg: Partial<Record<LineColumn, BBox>> = {};
    for (const col of table.columns) {
      conf[col.name] = cellConfidence(row.cells, col.name);
      const ws = row.cells[col.name];
      if (ws?.length) reg[col.name as LineColumn] = unionAll(ws.map((w) => w.bbox)) as BBox;
    }
    confidences.push(conf);
    regions.push(reg);
  });

  return { items, confidences, regions, table };
}

/**
 * Read the table's own total row. Independent cross-check on the line sums.
 * Searched by locating the "Total" row nearest below the data region rather than
 * by fixed offset, because vendors leave large blank bands (BHAGAVAT leaves ~45%
 * of the page between its single item and the totals).
 */
export function extractTableTotalRow(
  idx: PageIndex,
  table: DetectedTable,
): { totalQuantity: number | null; totalTaxable: number | null } {
  const lh = idx.lineHeight;
  /**
   * Any row below the data carrying the word "total" qualifies — not just a bare
   * totals row. Vendors share that row with unrelated text: AJIT prints
   * "PAYMENT DUE IN 30 DAYS ON 10/08/2026    Total : 188.00    467365.74" on one
   * line, so requiring the row to contain nothing else lost the 188 quantity.
   */
  const candidates = idx.lines
    .filter((l) => l.bbox.y0 >= table.dataBottom - lh && /\btotal\b/i.test(l.text))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);

  for (const line of candidates) {
    const band: BBox = { x0: 0, y0: line.bbox.y0 - lh * 0.4, x1: idx.width, y1: line.bbox.y1 + lh * 0.4 };
    const words = stripRuleTokens(idx.wordsIn(band));
    const cells = slotRowIntoColumns(words, table.columns);
    const qty = parseNumber(cellText(cells, 'quantity'));
    const taxable =
      parseAmount(cellText(cells, 'taxableValue')) ?? parseAmount(cellText(cells, 'amount'));
    if (qty !== null || taxable !== null) return { totalQuantity: qty, totalTaxable: taxable };
  }
  return { totalQuantity: null, totalTaxable: null };
}

// ---------------------------------------------------------------------------
// HSN summary
// ---------------------------------------------------------------------------

/**
 * Extract the HSN-wise tax summary, which sits below the line-item table and is
 * detected with the same machinery under its own vocabulary. The vertical
 * constraint is essential: the per-line HSN column would otherwise match first.
 */
export function extractHsnSummary(idx: PageIndex, belowY: number): HsnSummaryRow[] {
  const table = detectTable(idx, {
    vocabulary: HSN_VOCAB,
    searchTop: belowY,
    minColumns: 3,
    requireAny: [['hsn', 'taxableValue']],
  });
  if (!table) return [];

  const lh = idx.lineHeight;
  const region: BBox = {
    x0: 0,
    y0: table.dataTop,
    x1: idx.width,
    y1: Math.min(idx.height, table.dataTop + lh * 16),
  };
  const rows = idx.rows(stripRuleTokens(idx.wordsIn(region)));
  const out: HsnSummaryRow[] = [];

  for (const row of rows) {
    const text = row.map((w) => w.text).join(' ');
    if (isNoise(text)) continue;
    if (/\b(?:amount\s+payable|grand\s+total|bank|terms|in\s+words|net\s+amount|bill\s+amount)\b/i.test(text)) break;

    const cells = slotRowIntoColumns(row, table.columns);
    const hsn = normaliseHsn(cellText(cells, 'hsn'));
    const taxable = parseAmount(cellText(cells, 'taxableValue'));
    const isTotal = isTotalsRow(text) || /^\s*total\b/i.test(text);

    if (!hsn && !isTotal) continue;
    if (taxable === null && !isTotal) continue;

    out.push({
      hsnSac: hsn,
      taxableValue: taxable,
      cgstRate: parseNumber(cellText(cells, 'cgstRate')),
      cgstAmount: parseAmount(cellText(cells, 'cgstAmount')),
      sgstRate: parseNumber(cellText(cells, 'sgstRate')),
      sgstAmount: parseAmount(cellText(cells, 'sgstAmount')),
      igstRate: null,
      igstAmount: parseAmount(cellText(cells, 'igstAmount')),
      cessAmount: parseAmount(cellText(cells, 'cessAmount')),
      totalTax: parseAmount(cellText(cells, 'totalTax')),
    });
    if (isTotal) break;
  }
  return out;
}
