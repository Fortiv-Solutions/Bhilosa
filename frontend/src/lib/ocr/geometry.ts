/**
 * Geometric helpers over OCR word boxes.
 *
 * Every field lookup in this pipeline is spatial rather than line-based, because
 * invoice layouts put a value to the RIGHT of or BELOW its label and the same
 * physical text line often spans unrelated columns. Working from bounding boxes
 * is what lets one parser cope with three unrelated ERP layouts.
 */

import type { BBox, OcrLine, OcrPage, OcrWord } from './types';

// ---------------------------------------------------------------------------
// BBox primitives
// ---------------------------------------------------------------------------

export const bboxWidth = (b: BBox) => b.x1 - b.x0;
export const bboxHeight = (b: BBox) => b.y1 - b.y0;
export const bboxCenterX = (b: BBox) => (b.x0 + b.x1) / 2;
export const bboxCenterY = (b: BBox) => (b.y0 + b.y1) / 2;

export function bboxUnion(a: BBox, b: BBox): BBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

export function unionAll(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null;
  return boxes.reduce((acc, b) => bboxUnion(acc, b));
}

/** Fraction of `a`'s vertical extent that overlaps `b`'s. */
export function verticalOverlapRatio(a: BBox, b: BBox): number {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  const h = Math.min(bboxHeight(a), bboxHeight(b));
  return h <= 0 ? 0 : Math.max(0, overlap) / h;
}

/** Fraction of `a`'s horizontal extent that overlaps `b`'s. */
export function horizontalOverlapRatio(a: BBox, b: BBox): number {
  const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const w = Math.min(bboxWidth(a), bboxWidth(b));
  return w <= 0 ? 0 : Math.max(0, overlap) / w;
}

export function boxesIntersect(a: BBox, b: BBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** True when `inner` is (mostly) inside `outer`. */
export function boxContains(outer: BBox, inner: BBox, tolerance = 2): boolean {
  return (
    inner.x0 >= outer.x0 - tolerance &&
    inner.x1 <= outer.x1 + tolerance &&
    inner.y0 >= outer.y0 - tolerance &&
    inner.y1 <= outer.y1 + tolerance
  );
}

export function inflate(b: BBox, dx: number, dy = dx): BBox {
  return { x0: b.x0 - dx, y0: b.y0 - dy, x1: b.x1 + dx, y1: b.y1 + dy };
}

// ---------------------------------------------------------------------------
// Text normalisation for matching
// ---------------------------------------------------------------------------

/**
 * Collapse a label to a comparable key: lowercase alphanumerics only.
 * "P.O.NO." -> "pono";  "Rate / Item" -> "rateitem";  "Hsn/Sac" -> "hsnsac".
 * This is what makes label matching survive OCR punctuation noise, which is by
 * far the most common OCR error class on these scans.
 */
export function labelKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Squash runs of whitespace; trim. */
export function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Levenshtein distance, capped for speed. Used to tolerate 1-2 character OCR
 * errors when matching labels ("Vahicle" vs "Vehicle", "BAGES" vs "BAGS").
 */
export function editDistance(a: string, b: string, cap = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** Fuzzy label equality: exact on normalised keys, else small edit distance. */
export function labelMatches(candidate: string, target: string, maxEdits?: number): boolean {
  const a = labelKey(candidate);
  const b = labelKey(target);
  if (!a || !b) return false;
  if (a === b) return true;
  const allowed = maxEdits ?? (b.length <= 4 ? 0 : b.length <= 8 ? 1 : 2);
  if (allowed === 0) return false;
  return editDistance(a, b, allowed) <= allowed;
}

// ---------------------------------------------------------------------------
// Page index — the query surface used by every template
// ---------------------------------------------------------------------------

export interface LabelHit {
  /** Words that made up the matched label. */
  words: OcrWord[];
  bbox: BBox;
  lineIndex: number;
  /** How closely it matched (0 = exact). */
  edits: number;
  text: string;
}

export class PageIndex {
  readonly page: OcrPage;
  readonly lines: OcrLine[];
  readonly words: OcrWord[];
  /** Median word height — the natural unit for vertical tolerances. */
  readonly lineHeight: number;
  /** Residual page skew as a slope, applied by every row-banding operation. */
  readonly baselineSlope: number;

  constructor(page: OcrPage) {
    this.page = page;
    this.lines = page.lines;
    this.words = page.words;
    const heights = page.words.map((w) => bboxHeight(w.bbox)).filter((h) => h > 0).sort((a, b) => a - b);
    this.lineHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 20;
    this.baselineSlope = estimateBaselineSlope(page.words);
  }

  /** Band words into rows using this page's measured skew. */
  rows(words: OcrWord[] = this.words, toleranceMultiplier = 0.6): OcrWord[][] {
    return groupIntoRows(words, this.lineHeight * toleranceMultiplier, this.baselineSlope);
  }

  get width() {
    return this.page.width;
  }

  get height() {
    return this.page.height;
  }

  /** All words inside a region. */
  wordsIn(region: BBox, minConfidence = 0): OcrWord[] {
    return this.words.filter(
      (w) => w.confidence >= minConfidence && boxesIntersect(region, w.bbox) &&
        verticalOverlapRatio(w.bbox, region) > 0.3,
    );
  }

  /** Text inside a region, reading order (top-to-bottom, left-to-right). */
  textIn(region: BBox, minConfidence = 0): string {
    const ws = this.wordsIn(region, minConfidence);
    return joinWordsReadingOrder(ws, this.lineHeight);
  }

  /**
   * Find a label anywhere on the page. Labels may be split across several OCR
   * words ("P.O.", "NO." / "Invoice", "Date:"), so this slides a window of up to
   * 5 consecutive words within a line and matches the concatenation.
   */
  findLabel(target: string, opts: { maxEdits?: number; region?: BBox; occurrence?: number } = {}): LabelHit | null {
    return this.findLabels(target, opts)[opts.occurrence ?? 0] ?? null;
  }

  findLabels(target: string, opts: { maxEdits?: number; region?: BBox } = {}): LabelHit[] {
    const key = labelKey(target);
    if (!key) return [];
    const hits: LabelHit[] = [];
    const maxWindow = Math.min(6, Math.max(1, target.split(/\s+/).length + 2));

    for (const line of this.lines) {
      const ws = opts.region
        ? line.words.filter((w) => boxesIntersect(opts.region as BBox, w.bbox))
        : line.words;
      for (let i = 0; i < ws.length; i++) {
        const allowed = opts.maxEdits ?? (key.length <= 4 ? 0 : key.length <= 8 ? 1 : 2);

        /**
         * Evaluate every window from this start and keep the BEST one, rather
         * than the first that fits. Taking the first lets a short prefix win by
         * fuzzy match and swallow the rest of the label: "Vehicle" is within two
         * edits of "vehicleno", so matching it against the alias "Vehicle No"
         * left "No" sitting at the head of the value. Preferring fewer edits, then
         * the longer window, consumes the whole label.
         */
        let best: { slice: OcrWord[]; joined: string; d: number } | null = null;
        for (let n = 1; n <= maxWindow && i + n <= ws.length; n++) {
          const slice = ws.slice(i, i + n);
          const joined = slice.map((w) => w.text).join('');
          const cand = labelKey(joined);
          if (!cand) continue;
          // Stop growing the window once it overshoots the target badly.
          if (cand.length > key.length + 3) break;
          const d = cand === key ? 0 : editDistance(cand, key, allowed);
          if (d > allowed) continue;
          if (!best || d < best.d || (d === best.d && cand.length > labelKey(best.joined).length)) {
            best = { slice, joined, d };
          }
        }
        if (best) {
          const bbox = unionAll(best.slice.map((w) => w.bbox)) as BBox;
          hits.push({
            words: best.slice,
            bbox,
            lineIndex: best.slice[0].lineIndex,
            edits: best.d,
            text: best.joined,
          });
          i += best.slice.length - 1;
        }
      }
    }
    hits.sort((a, b) => a.edits - b.edits || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    return hits;
  }

  /**
   * First label found from a list of aliases, most specific alias first.
   *
   * Sorting by normalised length matters: "Vehicle" would otherwise match the
   * "Vehicle No:" heading and return "No" as the value, and "Invoice" would win
   * over "Invoice Date". Longer aliases describe the field more precisely, so
   * they get first refusal regardless of how the caller ordered them.
   */
  findAnyLabel(targets: string[], opts: { maxEdits?: number; region?: BBox } = {}): LabelHit | null {
    const ordered = [...targets].sort((a, b) => labelKey(b).length - labelKey(a).length);
    for (const t of ordered) {
      const hit = this.findLabel(t, opts);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * Every hit for every alias, most specific alias first then top-to-bottom.
   * Callers that must validate a value (and fall through to the next candidate
   * when it fails) use this instead of findAnyLabel.
   */
  findLabelCandidates(targets: string[], opts: { maxEdits?: number; region?: BBox } = {}): LabelHit[] {
    const ordered = [...targets].sort((a, b) => labelKey(b).length - labelKey(a).length);
    const out: LabelHit[] = [];
    const seen = new Set<string>();
    for (const t of ordered) {
      for (const hit of this.findLabels(t, opts)) {
        const key = `${Math.round(hit.bbox.x0)}:${Math.round(hit.bbox.y0)}:${hit.words.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(hit);
      }
    }
    return out;
  }

  /**
   * Text on a label's own row to its right, out to `stopAtX` or the page edge.
   *
   * Bounded gap searches truncate values that sit far from their label — page 2
   * prints "Invoice #:" then its number several hundred pixels away, and a fixed
   * gap returned only the stray quote marks between them. Reading the whole row
   * and letting the caller filter tokens is more reliable.
   */
  rowTextAfter(label: LabelHit, opts: { stopAtX?: number; minConfidence?: number } = {}): string {
    const slack = this.lineHeight * 0.6;
    const limit = opts.stopAtX ?? this.width;
    const ws = this.words
      .filter(
        (w) =>
          w.confidence >= (opts.minConfidence ?? 0) &&
          w.bbox.x0 >= label.bbox.x1 - 2 &&
          w.bbox.x1 <= limit + 2 &&
          verticalOverlapRatio(w.bbox, label.bbox) > 0.35,
      )
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    void slack;
    return ws.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the value that belongs to a label.
   *
   * Looks to the RIGHT of the label on the same visual row first (the dominant
   * invoice convention), then BELOW it within the label's horizontal band.
   * `maxRightGap`/`stopAtX` bound the search so a value from the next column is
   * never captured.
   */
  valueForLabel(
    label: LabelHit,
    opts: {
      maxRightGap?: number;
      stopAtX?: number;
      allowBelow?: boolean;
      belowLines?: number;
      minConfidence?: number;
      /** Extra vertical slack as a multiple of line height. */
      rowSlack?: number;
    } = {},
  ): { text: string; words: OcrWord[]; bbox: BBox | null } {
    const lh = this.lineHeight;
    const slack = (opts.rowSlack ?? 0.6) * lh;
    const right = opts.stopAtX ?? this.width;
    const maxGap = opts.maxRightGap ?? this.width;

    // Same row, to the right.
    const rowRegion: BBox = {
      x0: label.bbox.x1 + 1,
      y0: label.bbox.y0 - slack,
      x1: Math.min(right, label.bbox.x1 + maxGap),
      y1: label.bbox.y1 + slack,
    };
    let ws = this.words.filter(
      (w) =>
        w.confidence >= (opts.minConfidence ?? 0) &&
        w.bbox.x0 >= rowRegion.x0 - 2 &&
        w.bbox.x1 <= rowRegion.x1 + 2 &&
        verticalOverlapRatio(w.bbox, label.bbox) > 0.35,
    );
    // Drop leading separator tokens the label didn't absorb.
    ws = dropLeadingSeparators(ws);
    if (ws.length) {
      return { text: joinWordsReadingOrder(ws, lh), words: ws, bbox: unionAll(ws.map((w) => w.bbox)) };
    }

    if (opts.allowBelow === false) return { text: '', words: [], bbox: null };

    // Below, within the label's horizontal band.
    const nLines = opts.belowLines ?? 1;
    const belowRegion: BBox = {
      x0: label.bbox.x0 - lh * 0.5,
      y0: label.bbox.y1 + lh * 0.1,
      x1: Math.min(right, label.bbox.x1 + Math.min(maxGap, lh * 12)),
      y1: label.bbox.y1 + lh * (0.2 + 1.35 * nLines),
    };
    const below = dropLeadingSeparators(this.wordsIn(belowRegion, opts.minConfidence ?? 0));
    return {
      text: joinWordsReadingOrder(below, lh),
      words: below,
      bbox: unionAll(below.map((w) => w.bbox)),
    };
  }

  /** Convenience: label lookup + value read in one call. */
  readField(
    aliases: string[],
    opts: Parameters<PageIndex['valueForLabel']>[1] & { region?: BBox; maxEdits?: number } = {},
  ): { text: string; label: LabelHit | null; bbox: BBox | null } {
    const label = this.findAnyLabel(aliases, { region: opts.region, maxEdits: opts.maxEdits });
    if (!label) return { text: '', label: null, bbox: null };
    const v = this.valueForLabel(label, opts);
    return { text: v.text, label, bbox: v.bbox };
  }

  /** All lines whose text matches a predicate. */
  linesMatching(re: RegExp): OcrLine[] {
    return this.lines.filter((l) => re.test(l.text));
  }

  /** The single line best matching a regex, or null. */
  lineMatching(re: RegExp): OcrLine | null {
    return this.lines.find((l) => re.test(l.text)) ?? null;
  }

  /** Lines fully inside a vertical span, in order. */
  linesBetweenY(y0: number, y1: number): OcrLine[] {
    return this.lines
      .filter((l) => bboxCenterY(l.bbox) >= y0 && bboxCenterY(l.bbox) <= y1)
      .sort((a, b) => a.bbox.y0 - b.bbox.y0);
  }
}

/**
 * Tokens that are printed table rules or scanner speckle, not content.
 *
 * Tesseract renders vertical cell borders as '|', '[', ']', 'j', 'I' and similar.
 * Left in place these corrupt every numeric cell they touch — a rate of 4840.00
 * beside a rule reads as "4840.00 |" and parses to 4840.001. They must be dropped
 * before cells are assembled, not after.
 */
const RULE_TOKEN_RE = /^[|\[\]{}()\\/_~`'"^*<>=+:;,.\-–—¦!ijlI]{1,2}$/;

export function isRuleToken(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length > 2) return false;
  // Keep genuine single digits and letters that could be data.
  if (/^[0-9]$/.test(t)) return false;
  if (/^[A-Za-z]{2}$/.test(t)) return false;
  return RULE_TOKEN_RE.test(t);
}

/** Remove printed table rules and speckle from a word list. */
export function stripRuleTokens(words: OcrWord[]): OcrWord[] {
  return words.filter((w) => !isRuleToken(w.text));
}

/** Strip ':', '-', '.' tokens that precede a value. */
function dropLeadingSeparators(words: OcrWord[]): OcrWord[] {
  const sorted = [...words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  let i = 0;
  while (i < sorted.length && /^[:;.\-–—=_|©*"']+$/.test(sorted[i].text.trim())) i++;
  return sorted.slice(i);
}

/**
 * Join words in human reading order, inserting newlines between visual rows.
 */
export function joinWordsReadingOrder(words: OcrWord[], lineHeight: number): string {
  if (!words.length) return '';
  const rows = groupIntoRows(words, lineHeight * 0.6);
  return rows
    .map((row) => row.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Estimate the residual baseline slope of a page from OCR word centres.
 *
 * Photographed invoices are never perfectly square. On the AJIT sample the text
 * rises ~33px from left to right across 4600px — only about 0.5 degrees, but more
 * than the row-grouping tolerance, so every line item was split into a left half
 * (code, description) and a right half (qty, rate, amount).
 *
 * Correcting the slope in COORDINATE space beats deskewing the bitmap: word
 * centres are a far cleaner signal than pixels (no table rules, no paper
 * texture), it needs no resampling or second OCR pass, and it cannot damage the
 * image the way a mis-estimated rotation can.
 *
 * The chosen slope maximises the sharpness (sum of squares) of the histogram of
 * `cy - slope * cx`: when the slope matches, words on one printed line collapse
 * into a single bin. Bin geometry is fixed across candidates so scores compare
 * directly.
 */
export function estimateBaselineSlope(words: OcrWord[], maxSlope = 0.04): number {
  const solid = words.filter((w) => w.confidence >= 60 && /[A-Za-z0-9]/.test(w.text));
  if (solid.length < 25) return 0;

  const cx = solid.map((w) => bboxCenterX(w.bbox));
  const cy = solid.map((w) => bboxCenterY(w.bbox));
  const width = Math.max(...cx) - Math.min(...cx);
  const minX = Math.min(...cx);
  if (width <= 0) return 0;

  const heights = solid.map((w) => bboxHeight(w.bbox)).filter((h) => h > 0).sort((a, b) => a - b);
  const lineH = heights.length ? heights[Math.floor(heights.length / 2)] : 20;
  const binSize = Math.max(2, lineH * 0.5);

  const minY = Math.min(...cy);
  const maxY = Math.max(...cy);
  const pad = Math.ceil((maxSlope * width) / binSize) + 2;
  const binCount = Math.ceil((maxY - minY) / binSize) + 2 * pad + 2;

  const score = (slope: number): number => {
    const bins = new Float64Array(binCount);
    for (let i = 0; i < cx.length; i++) {
      const v = cy[i] - slope * (cx[i] - minX) - minY;
      const b = ((v / binSize) | 0) + pad;
      if (b >= 0 && b < binCount) bins[b]++;
    }
    let sumSq = 0;
    for (let i = 0; i < binCount; i++) sumSq += bins[i] * bins[i];
    return sumSq;
  };

  const step = 0.001;
  let best = 0;
  let bestScore = score(0);
  for (let s = -maxSlope; s <= maxSlope + 1e-9; s += step) {
    const v = score(s);
    if (v > bestScore) {
      bestScore = v;
      best = s;
    }
  }
  // Only accept a correction that measurably sharpens the histogram.
  if (bestScore <= score(0) * 1.02) return 0;
  return best;
}

/**
 * Cluster words into visual rows.
 *
 * `slope` shears the y coordinate before banding, compensating for residual page
 * skew (see estimateBaselineSlope). Rows must be defined by these bands and never
 * by OCR line index, because that is also what merges ARCHIT/AJIT's wrapped
 * description cells with the numeric cells printed alongside them.
 */
export function groupIntoRows(words: OcrWord[], tolerance: number, slope = 0): OcrWord[][] {
  if (!words.length) return [];
  const originX = Math.min(...words.map((w) => bboxCenterX(w.bbox)));
  const key = (w: OcrWord) => bboxCenterY(w.bbox) - slope * (bboxCenterX(w.bbox) - originX);

  const sorted = [...words].sort((a, b) => key(a) - key(b));
  const rows: OcrWord[][] = [];
  let current: OcrWord[] = [];
  let anchor = Number.NEGATIVE_INFINITY;

  for (const w of sorted) {
    const k = key(w);
    if (!current.length || Math.abs(k - anchor) <= tolerance) {
      if (!current.length) anchor = k;
      current.push(w);
      // Running mean keeps long rows from drifting off their first word.
      anchor = current.reduce((s, x) => s + key(x), 0) / current.length;
    } else {
      rows.push(current.sort((a, b) => a.bbox.x0 - b.bbox.x0));
      current = [w];
      anchor = k;
    }
  }
  if (current.length) rows.push(current.sort((a, b) => a.bbox.x0 - b.bbox.x0));
  return rows;
}

// ---------------------------------------------------------------------------
// Column model — derived from header cells, then used to slot every row's words
// ---------------------------------------------------------------------------

export interface ColumnSpec {
  /** Canonical name assigned by the template. */
  name: string;
  /** Header text as printed (kept for diagnostics and unit-named headers). */
  headerText: string;
  /** Horizontal span of the column. */
  x0: number;
  x1: number;
  headerBBox: BBox;
}

/**
 * Build column boundaries from a set of header label hits.
 *
 * Headers give reliable x-centres but their own boxes are usually narrower than
 * the data below them, so boundaries are placed at the midpoints between
 * adjacent headers. The first/last columns extend to the table edges.
 *
 * Prefer findColumnGutters when data rows are available: header midpoints
 * mis-slot any cell wider than its heading (AJIT's "55.00 + 15.25" discount cell
 * overflows into the next column) and cannot separate headings the OCR merged.
 */
export function buildColumns(
  headers: Array<{ name: string; bbox: BBox; headerText: string }>,
  tableX0: number,
  tableX1: number,
): ColumnSpec[] {
  const sorted = [...headers].sort((a, b) => bboxCenterX(a.bbox) - bboxCenterX(b.bbox));
  return sorted.map((h, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const x0 = prev ? (bboxCenterX(prev.bbox) + bboxCenterX(h.bbox)) / 2 : Math.min(tableX0, h.bbox.x0);
    const x1 = next ? (bboxCenterX(h.bbox) + bboxCenterX(next.bbox)) / 2 : Math.max(tableX1, h.bbox.x1);
    return { name: h.name, headerText: h.headerText, x0, x1, headerBBox: h.bbox };
  });
}

/**
 * Find column gutters — vertical bands of x containing no text — from the words
 * of a table region.
 *
 * This is the reliable way to recover a table's real column geometry. Boundaries
 * come from where content actually is, so a cell wider than its heading stays in
 * its own column and headings the OCR ran together are still separated (page 3's
 * "BAGES | Net Rate | Rate" collapsed into one heading cell, yet its data values
 * 150.00 / 305.000 / 258.48 are plainly gutter-separated).
 *
 * Table rules are excluded by passing rule-stripped words: the '|' glyphs
 * Tesseract emits for cell borders would otherwise fill every gutter.
 *
 * @returns sorted x boundaries, including the region's outer edges.
 */
export function findColumnGutters(
  words: OcrWord[],
  opts: { minGutter: number; pad?: number },
): number[] {
  if (!words.length) return [];
  const pad = opts.pad ?? 1;
  const minX = Math.floor(Math.min(...words.map((w) => w.bbox.x0))) - pad;
  const maxX = Math.ceil(Math.max(...words.map((w) => w.bbox.x1))) + pad;
  const span = maxX - minX;
  if (span <= 0) return [];

  // Occupancy histogram over x at 1px resolution.
  const ink = new Uint8Array(span + 1);
  for (const w of words) {
    const a = Math.max(0, Math.floor(w.bbox.x0) - minX);
    const b = Math.min(span, Math.ceil(w.bbox.x1) - minX);
    for (let x = a; x <= b; x++) ink[x] = 1;
  }

  const boundaries: number[] = [minX];
  let runStart = -1;
  for (let x = 0; x <= span; x++) {
    if (!ink[x]) {
      if (runStart < 0) runStart = x;
    } else if (runStart >= 0) {
      const width = x - runStart;
      if (width >= opts.minGutter) boundaries.push(minX + runStart + width / 2);
      runStart = -1;
    }
  }
  boundaries.push(maxX);
  return boundaries;
}

/**
 * Turn gutter boundaries into named columns by assigning header words to the
 * column that contains them, then concatenating each column's heading text.
 *
 * Naming happens after the geometry is fixed, which is what lets a heading that
 * wraps vertically ("Net" over "Rate") resolve to a single column.
 */
export function columnsFromGutters(
  boundaries: number[],
  headerWords: OcrWord[],
  nameFor: (headerText: string) => string | null,
): ColumnSpec[] {
  const out: ColumnSpec[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const x0 = boundaries[i];
    const x1 = boundaries[i + 1];
    const inCol = headerWords
      .filter((w) => {
        const c = bboxCenterX(w.bbox);
        return c >= x0 && c < x1;
      })
      // Top-to-bottom then left-to-right, so stacked headings read naturally.
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    const headerText = inCol.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
    const name = headerText ? nameFor(headerText) : null;
    out.push({
      name: name ?? `col${i}`,
      headerText,
      x0,
      x1,
      headerBBox: (unionAll(inCol.map((w) => w.bbox)) ?? { x0, y0: 0, x1, y1: 0 }) as BBox,
    });
  }
  return out;
}

/**
 * Assign a row's words to columns.
 *
 * A word is placed in the column with the greatest horizontal overlap; ties fall
 * to the column containing the word's centre. Words spanning two columns (common
 * for right-aligned numbers that bleed left) therefore land in the correct one.
 */
export function slotRowIntoColumns(row: OcrWord[], columns: ColumnSpec[]): Record<string, OcrWord[]> {
  const out: Record<string, OcrWord[]> = {};
  for (const col of columns) out[col.name] = [];

  for (const w of row) {
    let best: ColumnSpec | null = null;
    let bestScore = 0;
    const wCenter = bboxCenterX(w.bbox);
    for (const col of columns) {
      const overlap = Math.min(w.bbox.x1, col.x1) - Math.max(w.bbox.x0, col.x0);
      if (overlap <= 0) continue;
      let score = overlap / Math.max(1, bboxWidth(w.bbox));
      if (wCenter >= col.x0 && wCenter <= col.x1) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = col;
      }
    }
    if (best) out[best.name].push(w);
  }
  for (const key of Object.keys(out)) out[key].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  return out;
}

/** Cell text for a slotted row. */
export function cellText(cells: Record<string, OcrWord[]>, name: string): string {
  const ws = cells[name];
  if (!ws || !ws.length) return '';
  return ws.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
}

/** Mean confidence of a slotted cell, or null when empty. */
export function cellConfidence(cells: Record<string, OcrWord[]>, name: string): number | null {
  const ws = cells[name];
  if (!ws || !ws.length) return null;
  return ws.reduce((s, w) => s + w.confidence, 0) / ws.length;
}
