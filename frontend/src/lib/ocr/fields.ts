/**
 * Non-table field extraction: parties, document references, transport, totals,
 * banking and terms.
 *
 * Everything here is label-anchored and geometric rather than line-based, and
 * every value is cross-checked where the invoice gives us a way to do so. Two
 * rules in this file exist specifically to prevent silently wrong data:
 *
 *  - The buyer PO is searched for by PATTERN across the whole document, not just
 *    read out of a "P.O.No." field, because AJIT prints its own order ref there
 *    (8055) and puts the real PO (AD/PAG/PO/2026/0122) in Remarks.
 *  - A total labelled as a ledger balance is never eligible to become the
 *    invoice total, and the winning candidate must satisfy the invoice's own
 *    arithmetic. BHAGAVAT prints "Total Amount Due: 21,08,663.00" beneath an
 *    8,319.00 invoice.
 */

import {
  BANK_LABELS, LABELS, PARTY_BLOCK_NOISE, PARTY_LABELS, TERMS_LABELS, TOTAL_LABELS,
  TRANSPORT_LABELS, isNoise,
} from './aliases';
import {
  type LabelHit, PageIndex, bboxCenterY, bboxHeight, labelKey, squash, stripRuleTokens, unionAll,
  verticalOverlapRatio, horizontalOverlapRatio,
} from './geometry';
import {
  checkGstin, checkPan, extractEmails, extractIfsc, extractPhones, extractPincode,
  extractWebsite, isBlankish, normaliseIrn, parseAmount, parseCreditDays,
  parseInvoiceDate, parseInvoiceDateTime, parseNumber, repairGstin,
  repairVehicleNumber, wordsToNumberIndian,
} from './numbers';
import {
  type BBox, type BankAccount, type DispatchFrom, type ExtractionWarning,
  type InvoiceDocumentInfo, type InvoiceTotals, type OcrWord, type PartyInfo,
  type PaymentInfo, type PoNumberSource, type TransportInfo,
  emptyDocumentInfo, emptyParty, emptyTotals, emptyTransport,
} from './types';

export interface FieldContext {
  idx: PageIndex;
  text: string;
  warn: (w: ExtractionWarning) => void;
  confidence: (field: string, value: number) => void;
  /**
   * Top of the line-item table, when known. Header fields live above it and
   * totals below it; without this boundary a "Taxable Value" column heading is
   * indistinguishable from a "Taxable Value" total and the wrong number wins.
   */
  tableTop?: number;
  /** Bottom of the line-item data region, when known. */
  tableBottom?: number;
}

// ---------------------------------------------------------------------------
// Validated label reading
// ---------------------------------------------------------------------------

/**
 * Read a labelled scalar, trying every alias/occurrence until one yields a value
 * the validator accepts.
 *
 * This fall-through is what stops a generic alias from poisoning a field: on the
 * AJIT scan the bare word "INVOICE" occurs both in "INVOICE : G-2987" and in
 * "INVOICE DATE : 11/07/2026", and the date happened to sort first. Rejecting a
 * date-shaped value lets the search continue to the real invoice number.
 */
function readValidated<T>(
  idx: PageIndex,
  aliases: string[],
  parse: (rowText: string) => T | null,
  opts: { region?: BBox; stopAtX?: number } = {},
): { value: T; label: LabelHit } | null {
  for (const hit of idx.findLabelCandidates(aliases, { region: opts.region })) {
    const rowText = idx.rowTextAfter(hit, { stopAtX: opts.stopAtX });
    if (!rowText) continue;
    const parsed = parse(rowText);
    if (parsed !== null && parsed !== undefined) return { value: parsed, label: hit };
  }
  return null;
}

/** Tokens that can never be an identifier value. */
const IDENT_REJECT = /^(?:date|dated|no|no\.|number|#|:|of|supply|place|details?|invoice|bill|challan|due)$/i;

/**
 * Pick a document-number-shaped token out of row text.
 * Rejects dates, bare labels and pure amounts, which is what the surrounding
 * columns of a dense invoice header are full of.
 */
function pickDocumentNumber(rowText: string): string | null {
  const tokens = rowText.split(/\s+/);
  for (const raw of tokens) {
    const tok = raw.replace(/^[:#\-–—.,;|"'“”~]+/, '').replace(/[.,;|"'“”~]+$/, '');
    if (!tok || tok.length < 2 || tok.length > 32) continue;
    if (IDENT_REJECT.test(tok)) continue;
    if (!/\d/.test(tok)) continue;
    // A date is not a document number.
    if (parseInvoiceDate(tok)) continue;
    // Nor is a plain money amount.
    if (/^[\d,]+\.\d{2}$/.test(tok)) continue;
    // Require at least one digit run of 2+, so stray "1" or "x2" are skipped.
    if (!/\d{2}/.test(tok)) continue;
    /**
     * Reject place names and other prose that merely contains digits. A run of
     * four or more letters marks a word, not an identifier — this is what stops
     * "24-GUJARAT" (from the Place of Supply column sharing the row with the
     * "TAX INVOICE" heading) being taken as ARCHIT's invoice number, while
     * leaving G-2987, BE-2026-27-3343 and 26-27/499 untouched.
     */
    if (/[A-Za-z]{4,}/.test(tok)) continue;
    return tok;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GSTIN discovery
// ---------------------------------------------------------------------------

export interface GstinSighting {
  value: string;
  bbox: BBox;
  repaired: boolean;
  edits: number;
}

/**
 * Find every GSTIN on the page, repairing OCR damage via the mod-36 checksum.
 *
 * The checksum is what makes this safe: a candidate is only accepted after
 * substitution if it satisfies both the format and the check character, so a
 * repair cannot invent a plausible-but-wrong number. Measured on the samples this
 * recovers 24AUHPK6558N121 -> ...N1Z1 and 24ABDFP8234D12G -> ...D1ZG.
 */
export function findGstins(idx: PageIndex): GstinSighting[] {
  const raw: GstinSighting[] = [];
  const seen = new Set<string>();

  // GSTINs may be split across OCR words, so scan sliding windows within a row.
  for (const row of idx.rows()) {
    const words = stripRuleTokens(row);
    for (let i = 0; i < words.length; i++) {
      for (let n = 1; n <= 3 && i + n <= words.length; n++) {
        const slice = words.slice(i, i + n);
        const joined = slice.map((w) => w.text).join('').toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (joined.length < 15) continue;
        // A window may carry a label prefix ("GSTINNO24ABC..."); try each offset.
        for (let off = 0; off + 15 <= joined.length; off++) {
          const cand = joined.slice(off, off + 15);
          if (!/^\d{2}/.test(cand)) continue;
          const direct = checkGstin(cand);
          let value: string | null = null;
          let edits = 0;
          if (direct.formatOk && direct.checksumOk) {
            value = cand;
          } else {
            const fixed = repairGstin(cand);
            if (fixed) {
              value = fixed.value;
              edits = fixed.edits;
            }
          }
          if (value && !seen.has(value)) {
            seen.add(value);
            raw.push({
              value,
              bbox: unionAll(slice.map((w) => w.bbox)) as BBox,
              repaired: edits > 0,
              edits,
            });
          }
        }
      }
    }
  }

  /**
   * De-duplicate sightings that describe the same printed GSTIN.
   *
   * Sliding windows at different offsets can both yield checksum-valid numbers
   * from one printed string — on the AJIT scan the real 24ABYFA3137F1ZE appeared
   * alongside a 2-edit "repair" 24ABYEA3137E12D that also satisfies the checksum.
   * Since a valid checksum no longer discriminates, prefer the reading that
   * needed the fewest edits within any overlapping region.
   */
  const kept: GstinSighting[] = [];
  for (const cand of [...raw].sort((a, b) => a.edits - b.edits || a.bbox.y0 - b.bbox.y0)) {
    const overlaps = kept.some(
      (k) =>
        verticalOverlapRatio(k.bbox, cand.bbox) > 0.5 &&
        horizontalOverlapRatio(k.bbox, cand.bbox) > 0.4,
    );
    if (!overlaps) kept.push(cand);
  }
  return kept.sort((a, b) => a.bbox.y0 - b.bbox.y0);
}

// ---------------------------------------------------------------------------
// Party blocks
// ---------------------------------------------------------------------------

/**
 * Region occupied by a labelled party block.
 *
 * Bounded on the right by the next party heading (so a two- or three-column
 * layout does not bleed sideways) and at the bottom by the line-item table. The
 * bottom bound matters for GSTIN assignment: on the AJIT scan the buyer's GSTIN
 * is the last line of a nine-line block, and a fixed line count stopped short of
 * it, leaving buyer.gstin null.
 */
function blockRegion(
  idx: PageIndex,
  label: LabelHit,
  opts: { lines?: number; width?: number; bottomLimit?: number; siblings?: LabelHit[] } = {},
): BBox {
  const lh = idx.lineHeight;
  const lines = opts.lines ?? 9;

  // Right edge: the nearest sibling heading starting to our right, else a third
  // of the page.
  let right = label.bbox.x0 + (opts.width ?? idx.width / 3);
  for (const sib of opts.siblings ?? []) {
    if (sib === label) continue;
    if (sib.bbox.x0 > label.bbox.x0 + lh && sib.bbox.x0 < right) right = sib.bbox.x0 - lh * 0.3;
  }

  const bottomByLines = label.bbox.y1 + lh * (lines + 0.5);
  const bottom = opts.bottomLimit !== undefined
    ? Math.min(Math.max(opts.bottomLimit, label.bbox.y1 + lh * 2), bottomByLines + lh * 4)
    : bottomByLines;

  return {
    x0: Math.max(0, label.bbox.x0 - lh * 0.5),
    y0: label.bbox.y0 - lh * 0.2,
    x1: Math.min(idx.width, right),
    y1: Math.min(idx.height, bottom),
  };
}

/** Lines of a region as trimmed strings, noise removed. */
function regionLines(idx: PageIndex, region: BBox): string[] {
  const words = stripRuleTokens(idx.wordsIn(region));
  return idx
    .rows(words)
    .map((r) => squash(r.map((w) => w.text).join(' ')))
    .filter((t) => t && !isNoise(t));
}

/**
 * Strip a leading label from the first line of a block, e.g.
 * "Customer Details: AMAYA CORPORATION" -> "AMAYA CORPORATION".
 */
function stripLabelPrefix(line: string, labelText: string): string {
  const k = labelKey(labelText);
  let out = line;
  // Remove the label's words from the front, tolerating punctuation.
  const words = line.split(/\s+/);
  let consumed = 0;
  let acc = '';
  for (const w of words) {
    acc += labelKey(w);
    consumed++;
    if (acc === k || (acc.length >= k.length && k.startsWith(acc.slice(0, k.length)) && acc.length >= k.length)) break;
    if (acc.length > k.length) {
      consumed = 0;
      break;
    }
  }
  if (consumed) out = words.slice(consumed).join(' ');
  return out.replace(/^[\s:;.\-–—,]+/, '').trim();
}

/**
 * Structural markers that a line is a form label or metadata rather than a
 * party name. Without these the AJIT layout yields names like
 * "Pi Place Place Of Supply :GUJARAT-24" and "to) Challan No No".
 */
const NOT_A_NAME =
  /(?:place\s+of\s+supply|challan|invoice|p\.?o\.?\s*no|transport|details?|shipped\s*to|billed\s*to|ship\s*to|bill\s*to|consignee|receiver|supervisor|owner\b|account\b|finance\b|\bsite\b|state\s*:|vehicle|driver|l\.?r\.?\s*no|due\s*date|contact\s+person|terms|bank)/i;

/** Is this line plausibly an organisation name rather than an address line? */
function looksLikeOrgName(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return false;
  if (PARTY_BLOCK_NOISE.test(t.replace(/[:.]/g, '').trim())) return false;
  if (/^\d/.test(t)) return false; // starts with a house/plot number
  if (/@|www\.|\bgstin\b|\bpan\b|\bph\b|\bmobile\b|\bemail\b/i.test(t)) return false;
  if (/\b\d{6}\b/.test(t)) return false; // pincode line
  if (NOT_A_NAME.test(t)) return false;
  // Reject leftovers of a split heading such as "to)" or "Pi".
  if (/^[a-z]{1,3}[).:]?$/i.test(t)) return false;
  const alpha = t.match(/[A-Za-z]/g)?.length ?? 0;
  if (alpha < 4) return false;
  return /[A-Za-z]{3}/.test(t);
}

/**
 * Read a party block starting from its heading.
 * The name is the first org-looking line; the remainder becomes address lines.
 */
export function readPartyBlock(
  idx: PageIndex,
  label: LabelHit,
  opts: { lines?: number; width?: number; bottomLimit?: number; siblings?: LabelHit[] } = {},
): { party: PartyInfo; region: BBox } {
  const region = blockRegion(idx, label, opts);
  const party = emptyParty();
  const lines = regionLines(idx, region);
  if (lines.length) lines[0] = stripLabelPrefix(lines[0], label.text);

  const body: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^m\/s\.?\s*/i, '').trim();
    if (!line) continue;
    // Pull structured bits out wherever they appear in the block.
    const gst = checkGstin(line.replace(/^.*?gstin[^0-9A-Z]*/i, ''));
    if (/\bgstin\b|\bgst\s*no\b/i.test(line) && gst.value) continue;
    if (/\bpan\b/i.test(line)) continue;
    if (!party.name && looksLikeOrgName(line)) {
      party.name = line.replace(/[,:]$/, '').trim();
      continue;
    }
    body.push(line);
  }

  const blockText = lines.join('\n');
  party.addressLines = body.filter((l) => !/^(?:site\s*:|contact\s+person)/i.test(l));
  party.phones = extractPhones(blockText);
  party.emails = extractEmails(blockText);
  party.pincode = extractPincode(blockText);

  // Site / project marker, e.g. "SITE : AGASTYA".
  const siteHit = idx.findAnyLabel([...PARTY_LABELS.site], { region });
  if (siteHit) {
    const v = idx.valueForLabel(siteHit, { maxRightGap: idx.lineHeight * 12, allowBelow: false });
    const site = squash(v.text).replace(/^[:\-\s]+/, '');
    if (site && site.length <= 40 && !isNoise(site)) party.siteName = site.toUpperCase();
  }

  const stateHit = idx.findAnyLabel([...PARTY_LABELS.state], { region });
  if (stateHit) {
    const v = squash(idx.valueForLabel(stateHit, { maxRightGap: idx.lineHeight * 10, allowBelow: false }).text);
    if (v) party.state = v;
  }
  return { party, region };
}

/**
 * Identify the vendor (the party issuing the invoice).
 *
 * The vendor's name is the largest text in the upper part of the page — that
 * typographic emphasis is near-universal on Indian invoices and far more reliable
 * than any label, since vendors rarely label their own name at all.
 */
export function extractVendor(ctx: FieldContext, excludeGstins: Set<string>): PartyInfo {
  const { idx } = ctx;
  const party = emptyParty();
  // The vendor masthead sits above the party blocks, which in turn sit above the
  // line-item table. Bounding by the table keeps "Delivery Address:" out.
  const topLimit = Math.min(ctx.tableTop ?? idx.height * 0.3, idx.height * 0.3);
  const topRegion: BBox = { x0: 0, y0: 0, x1: idx.width, y1: topLimit };

  /** Text that is structurally not a vendor name, however large it is printed. */
  const DISQUALIFY =
    /(?:scanner|scanned|tax\s*invoice|original\s+for|duplicate|triplicate|invoice|gstin|\bpan\b|billed\s*to|bill\s*to|ship\s*to|shipped\s*to|consignee|receiver|customer|delivery\s+address|billing\s+address|shipping\s+address|place\s+of\s+supply|challan|details?|transport|dispatch|@|www\.)/i;

  const rows = idx.rows(stripRuleTokens(idx.wordsIn(topRegion)));

  let bestRow: OcrWord[] | null = null;
  let bestScore = 0;
  for (const row of rows) {
    // Drop low-confidence speckle: logos decode as junk tokens that would
    // otherwise be glued onto the name ("NN R Rie BHAGAVAT ENTERPRISE").
    const clean = row.filter((w) => w.confidence >= 55 && /[A-Za-z0-9&.]/.test(w.text));
    if (!clean.length) continue;
    const text = squash(clean.map((w) => w.text).join(' '));
    if (text.length < 5 || isNoise(text) || DISQUALIFY.test(text)) continue;
    if (!looksLikeOrgName(text)) continue;
    const alphaTokens = text.split(/\s+/).filter((t) => /^[A-Za-z&.]{2,}$/.test(t));
    if (alphaTokens.length < 1) continue;

    // Vendor names are set in the largest type on the page; weight that by how
    // alphabetic the row is so a big numeric row cannot win.
    const height = clean.reduce((s, w) => s + bboxHeight(w.bbox), 0) / clean.length;
    const alphaRatio = (text.match(/[A-Za-z ]/g)?.length ?? 0) / text.length;
    const score = height * alphaRatio;
    if (score > bestScore) {
      bestScore = score;
      bestRow = clean;
    }
  }
  if (bestRow) {
    party.name = squash(bestRow.map((w) => w.text).join(' ')).replace(/[,:.]+$/, '');
    ctx.confidence('vendor.name', bestRow.reduce((s, w) => s + w.confidence, 0) / bestRow.length / 100);
  }

  // Vendor contact details live in the same top band.
  const topText = regionLines(idx, topRegion).join('\n');
  party.emails = extractEmails(topText);
  party.phones = extractPhones(topText);
  party.website = extractWebsite(topText);
  party.pincode = extractPincode(topText);

  const panHit = idx.findAnyLabel([...PARTY_LABELS.pan], { region: topRegion });
  if (panHit) {
    const v = idx.valueForLabel(panHit, { maxRightGap: idx.lineHeight * 10, allowBelow: false });
    const pan = checkPan(squash(v.text).split(/\s+/)[0] ?? '');
    if (pan.valid) party.pan = pan.value;
  }

  // The vendor's GSTIN is the top-most one not claimed by buyer or ship-to.
  const candidates = findGstins(idx)
    .filter((g) => !excludeGstins.has(g.value))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);
  if (candidates.length) {
    party.gstin = candidates[0].value;
    if (candidates[0].repaired) {
      ctx.warn({
        code: 'gstin_repaired',
        field: 'vendor.gstin',
        severity: 'info',
        message: `Vendor GSTIN corrected by checksum (${candidates[0].edits} character(s)): ${party.gstin}`,
      });
    }
    if (!party.pan) {
      const embedded = checkGstin(party.gstin).pan;
      if (embedded) party.pan = embedded;
    }
  }

  // Address: lines in the top band that are neither the name nor pure metadata.
  party.addressLines = regionLines(idx, topRegion).filter((l) => {
    if (party.name && labelKey(l) === labelKey(party.name)) return false;
    if (/@|www\.|gstin|\bpan\b|^tax\s*invoice|original\s+for|invoice\s*(?:no|#|date)/i.test(l)) return false;
    if (/^(?:mobile|contact|email|ph|phone|tel)\b/i.test(l)) return false;
    return l.length > 6;
  });
  return party;
}

/** Extract buyer and ship-to parties using their block headings. */
export function extractBuyerAndShipTo(ctx: FieldContext): {
  buyer: PartyInfo;
  shipTo: PartyInfo;
  claimedGstins: Set<string>;
} {
  const { idx } = ctx;
  const claimed = new Set<string>();
  const gstins = findGstins(idx);

  const assignGstin = (region: BBox | null, party: PartyInfo, field: string) => {
    if (!region) return;
    // Nearest GSTIN inside, else the nearest one just below the block.
    const inside = gstins.filter(
      (g) => g.bbox.x0 >= region.x0 - idx.lineHeight && g.bbox.x1 <= region.x1 + idx.lineHeight * 6 &&
        g.bbox.y0 >= region.y0 - idx.lineHeight && g.bbox.y0 <= region.y1 + idx.lineHeight,
    );
    const pick = inside.sort((a, b) => a.bbox.y0 - b.bbox.y0)[0];
    if (!pick) return;
    party.gstin = pick.value;
    claimed.add(pick.value);
    if (pick.repaired) {
      ctx.warn({
        code: 'gstin_repaired',
        field,
        severity: 'info',
        message: `GSTIN corrected by checksum (${pick.edits} character(s)): ${pick.value}`,
      });
    }
    const pan = checkGstin(pick.value).pan;
    if (pan && !party.pan) party.pan = pan;
  };

  const buyerLabel = idx.findAnyLabel([...PARTY_LABELS.buyerBlock]);
  const shipLabel = idx.findAnyLabel([...PARTY_LABELS.shipToBlock]);
  const siblings = [buyerLabel, shipLabel].filter((l): l is LabelHit => l !== null);
  const bottomLimit = ctx.tableTop;

  let buyer = emptyParty();
  let buyerRegion: BBox | null = null;
  if (buyerLabel) {
    const r = readPartyBlock(idx, buyerLabel, { lines: 9, bottomLimit, siblings });
    buyer = r.party;
    buyerRegion = r.region;
  }

  let shipTo = emptyParty();
  let shipRegion: BBox | null = null;
  if (shipLabel) {
    const r = readPartyBlock(idx, shipLabel, { lines: 9, bottomLimit, siblings });
    shipTo = r.party;
    shipRegion = r.region;
  }

  // Assign ship-to first: its block is usually narrower and less ambiguous, and
  // when both parties share a GSTIN the buyer lookup must not consume it twice.
  assignGstin(shipRegion, shipTo, 'shipTo.gstin');
  const shipClaimed = shipTo.gstin;
  assignGstin(buyerRegion, buyer, 'buyer.gstin');
  // A shared GSTIN (same legal entity, two addresses) is legitimate.
  if (!buyer.gstin && shipClaimed) buyer.gstin = shipClaimed;
  if (!shipTo.gstin && buyer.gstin) shipTo.gstin = buyer.gstin;

  if (!buyer.name && shipTo.name) buyer.name = shipTo.name;
  if (!shipTo.name && buyer.name) shipTo.name = buyer.name;
  /**
   * A delivery block whose first line is a single bare word is usually the site
   * name (ARCHIT prints just "SATVA"). Corporate suffixes are excluded, because a
   * split company name leaves the same shape behind — the AJIT consignee block
   * yielded "DEVELOPERS" from "M/S. AGASTYA DEVELOPERS".
   */
  const CORPORATE_SUFFIX =
    /^(?:developers?|corporation|corp|enterprises?|llp|ltd|limited|pvt|private|homes?|infra(?:structure)?|builders?|associates?|industries|traders?|trading|company|co|group|and|sons)$/i;
  if (
    !shipTo.siteName && shipTo.name && shipTo.name.length <= 20 &&
    !/\s/.test(shipTo.name) && !CORPORATE_SUFFIX.test(shipTo.name)
  ) {
    shipTo.siteName = shipTo.name.toUpperCase();
  }
  return { buyer, shipTo, claimedGstins: claimed };
}

/** Dispatch-from party: a third-party warehouse or the vendor's origin depot. */
export function extractDispatchFrom(ctx: FieldContext): DispatchFrom | null {
  const { idx } = ctx;
  const label = idx.findAnyLabel([...PARTY_LABELS.dispatchFrom]);
  if (!label) return null;

  const pin = idx.readField(['Dispatch from pin'], { maxRightGap: idx.lineHeight * 10, allowBelow: false });
  const state = idx.readField(['Dispatch from State'], { maxRightGap: idx.lineHeight * 12, allowBelow: false });
  const city = idx.readField(['Dispatch from City'], { maxRightGap: idx.lineHeight * 12, allowBelow: false });

  const region = blockRegion(idx, label, { lines: 8, width: idx.width / 2.5 });
  const lines = regionLines(idx, region)
    .map((l) => stripLabelPrefix(l, label.text))
    .filter((l) => l && !/^dispatch\s+from/i.test(l));

  const named = lines.find((l) => looksLikeOrgName(l)) ?? null;
  const out: DispatchFrom = {
    partyName: named,
    addressLines: lines.filter((l) => l !== named),
    pincode: squash(pin.text).match(/\d{6}/)?.[0] ?? extractPincode(lines.join(' ')),
    city: squash(city.text) || null,
    state: squash(state.text) || null,
  };
  if (!out.partyName && !out.pincode && !out.city && !out.state) return null;
  return out;
}

// ---------------------------------------------------------------------------
// Document references
// ---------------------------------------------------------------------------

/**
 * Patterns for a buyer purchase-order number. The first two match the house
 * formats seen in this system (AD/PAG/PO/2026/0122, AC/PAM/PO/2026/0351); the
 * rest cover common alternatives. `PO` may be OCR'd as `P0`.
 */
const PO_PATTERNS: RegExp[] = [
  /\b[A-Z]{1,5}\/[A-Z]{2,8}\/P[O0]\/\d{2,4}\/\d{2,6}\b/i,
  /\b[A-Z]{1,5}\/P[O0]\/\d{2,4}\/\d{2,6}\b/i,
  /\bP[O0]\s*[-/]\s*\d{2,4}\s*[-/]\s*\d{2,6}\b/i,
  /\bP[O0]\s*[-/]?\s*\d{4,8}\b/i,
];

/** Normalise a matched PO string: fix the literal "PO" segment and spacing. */
function normalisePo(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/(^|[/\-])P0([/\-]|$)/g, '$1PO$2');
}

export function extractDocumentInfo(ctx: FieldContext): InvoiceDocumentInfo {
  const { idx, text } = ctx;
  const doc = emptyDocumentInfo();
  const lh = idx.lineHeight;
  const near = { maxRightGap: lh * 14, allowBelow: false as const };
  // Header references sit above the line-item table; bounding the search there
  // keeps column headings and totals out of these fields.
  const headerRegion: BBox | undefined = ctx.tableTop
    ? { x0: 0, y0: 0, x1: idx.width, y1: ctx.tableTop }
    : undefined;

  const readOne = (aliases: string[], opts = near) => squash(idx.readField(aliases, opts).text).split('\n')[0] ?? '';

  // --- numbers & dates (validated, so a generic alias cannot capture a date) ---
  doc.invoiceNumber =
    readValidated(idx, [...LABELS.invoiceNumber], pickDocumentNumber, { region: headerRegion })?.value ?? null;
  doc.invoiceDate =
    readValidated(idx, [...LABELS.invoiceDate], (t) => parseInvoiceDate(t), { region: headerRegion })?.value ?? null;
  doc.dueDate =
    readValidated(idx, [...LABELS.dueDate], (t) => parseInvoiceDate(t), { region: headerRegion })?.value ?? null;
  doc.challanNumber =
    readValidated(idx, [...LABELS.challanNumber], pickDocumentNumber, { region: headerRegion })?.value ?? null;

  doc.placeOfSupply = (() => {
    const v = readValidated(
      idx,
      [...LABELS.placeOfSupply],
      (t) => {
        // Keep the state token, e.g. "24-GUJARAT" or "GUJARAT-24".
        const m = t.match(/\b\d{2}\s*-\s*[A-Za-z ]{3,}|\b[A-Za-z ]{3,}\s*-\s*\d{2}\b/);
        if (m) return squash(m[0]);
        const alpha = t.split(/\s+/).find((x) => /^[A-Za-z]{4,}$/.test(x));
        return alpha ?? null;
      },
      { region: headerRegion },
    );
    return v?.value ?? null;
  })();

  // Credit terms may only exist as prose: "PAYMENT DUE IN 30 DAYS ON 10/08/2026".
  const dueLine = idx.lineMatching(/payment\s+(?:due|within)/i);
  if (dueLine) {
    doc.creditDays ??= parseCreditDays(dueLine.text);
    doc.dueDate ??= parseInvoiceDate(dueLine.text);
  }
  if (doc.creditDays === null) doc.creditDays = parseCreditDays(text);
  if (doc.dueDate && doc.invoiceDate && doc.creditDays === null) {
    const days = Math.round(
      (Date.parse(doc.dueDate) - Date.parse(doc.invoiceDate)) / 86_400_000,
    );
    if (Number.isFinite(days) && days >= 0 && days <= 365) doc.creditDays = days;
  }

  // --- e-invoice ---
  const irnField = idx.readField([...LABELS.irn], { maxRightGap: idx.width, allowBelow: true });
  doc.irn = normaliseIrn(squash(irnField.text).replace(/\s+/g, ''));
  if (!doc.irn) {
    const m = text.replace(/\s+/g, '').match(/\b[0-9a-f]{64}\b/i);
    if (m) doc.irn = normaliseIrn(m[0]);
  }
  const ackNo = readOne([...LABELS.ackNo], { maxRightGap: lh * 14, allowBelow: false });
  const ackDigits = ackNo.replace(/[^\d]/g, '');
  if (ackDigits.length >= 12) doc.ackNo = ackDigits.slice(0, 16);
  doc.ackDate = parseInvoiceDateTime(readOne([...LABELS.ackDate], { maxRightGap: lh * 20, allowBelow: false }));
  doc.isEInvoice = Boolean(doc.irn || doc.ackNo);

  const eway = readOne([...LABELS.ewayBillNo]);
  const ewayDigits = eway.replace(/[^\d]/g, '');
  if (ewayDigits.length >= 10) doc.ewayBillNo = ewayDigits;
  doc.ewayDate = parseInvoiceDate(readOne([...LABELS.ewayDate]));

  // --- purchase order: pattern-first, wherever it hides ---
  const poFieldRaw = readOne([...LABELS.buyerPoNumber]);
  let poValue: string | null = null;
  let poSource: PoNumberSource = null;

  const patternHit = (s: string) => {
    for (const re of PO_PATTERNS) {
      const m = s.match(re);
      if (m) return normalisePo(m[0]);
    }
    return null;
  };

  const fromField = patternHit(poFieldRaw);
  if (fromField) {
    poValue = fromField;
    poSource = 'po_field';
  } else {
    // Scan the whole document: AJIT puts the real PO in Remarks.
    const fromDoc = patternHit(text.replace(/\s+/g, ' '));
    if (fromDoc) {
      poValue = fromDoc;
      const remarksLine = idx.lineMatching(/\bremark|narration|note\b/i);
      poSource = remarksLine && remarksLine.text.includes(fromDoc.slice(0, 8)) ? 'remarks' : 'inferred';
    }
  }

  // Whatever sits in the PO field but is not a PO pattern is the vendor's own ref.
  if (poFieldRaw) {
    const bare = poFieldRaw.split(/\s+/).find((t) => /^\d{2,10}$/.test(t));
    if (bare && bare !== poValue) {
      doc.vendorOrderRef = bare;
      if (!poValue) {
        ctx.warn({
          code: 'po_field_not_house_format',
          field: 'document.buyerPoNumber',
          severity: 'warn',
          message: `The invoice's PO field contains "${bare}", which is not a Pramukh PO number — treated as the vendor's own order reference. Select the correct PO manually.`,
        });
      }
    }
  }
  doc.buyerPoNumber = poValue;
  doc.buyerPoNumberSource = poValue ? poSource : null;
  if (poSource === 'remarks' || poSource === 'inferred') {
    ctx.warn({
      code: 'po_found_outside_po_field',
      field: 'document.buyerPoNumber',
      severity: 'info',
      message: `PO ${poValue} was found in the document body rather than a PO field — please confirm.`,
    });
  }

  // --- misc ---
  doc.agentOrBroker = (() => {
    const v = readOne([...LABELS.agent]);
    const cleaned = v.replace(/^(?:broker|agent)\s*[:\-]?\s*/i, '').trim();
    return cleaned || null;
  })();
  doc.zoneCode = readOne([...LABELS.zone]) || null;

  const rcRaw = readOne([...LABELS.reverseCharge], { maxRightGap: lh * 18, allowBelow: false });
  if (rcRaw) doc.reverseCharge = /\b(?:yes|y|applicable)\b/i.test(rcRaw) ? true : false;

  if (/\bcredit\s+note\b/i.test(text)) doc.documentType = 'CREDIT NOTE';
  else if (/\bproforma\b/i.test(text)) doc.documentType = 'PROFORMA';
  else if (/\bdelivery\s+challan\b/i.test(text) && !/\btax\s*invoice\b/i.test(text)) doc.documentType = 'DELIVERY CHALLAN';
  else if (/\btax\s*invoice\b/i.test(text)) doc.documentType = 'TAX INVOICE';

  for (const copy of LABELS.copyType) {
    if (new RegExp(copy.replace(/\s+/g, '\\s+'), 'i').test(text)) {
      doc.copyType = copy;
      break;
    }
  }
  return doc;
}

export function extractTransport(ctx: FieldContext): TransportInfo {
  const { idx } = ctx;
  const t = emptyTransport();
  const lh = idx.lineHeight;
  const near = { maxRightGap: lh * 14, allowBelow: false as const };
  const read = (aliases: string[]) => squash(idx.readField(aliases, near).text).split('\n')[0] ?? '';

  const name = read([...TRANSPORT_LABELS.transporterName]).replace(/[|[\]]/g, '').trim();
  // "Transport Details" is a boxed heading with no value of its own.
  t.transporterName = name && !/^(?:details?|detail)$/i.test(name) && /[A-Za-z]{3}/.test(name) ? name : null;
  t.station = read([...TRANSPORT_LABELS.station]) || null;

  // L.R. numbers arrive with the label's colon attached (":4206").
  const lr = read([...TRANSPORT_LABELS.lrNumber]);
  const lrTok = lr.split(/\s+/).map((x) => x.replace(/^[:.\-]+/, '')).find((x) => /^\d[\d/-]*$/.test(x));
  t.lrNumber = lrTok ?? null;
  t.lrDate = parseInvoiceDate(read([...TRANSPORT_LABELS.lrDate]));

  /**
   * Vehicle number, validated against the Indian registration pattern so a label
   * fragment can never become the value. OCR routinely turns 0 into O and 4 into
   * A inside plates ("GJO5CVA633"), so a failing candidate is repaired by mapping
   * letters back to digits in the positions where the pattern requires digits.
   */
  t.vehicleNumber = (() => {
    const found = readValidated(
      idx,
      [...TRANSPORT_LABELS.vehicleNumber],
      (rowText) => {
        for (const raw of rowText.split(/\s+/)) {
          const tok = raw.replace(/^[:.\-]+/, '').replace(/[.,;|]+$/, '');
          if (tok.length < 6 || tok.length > 13) continue;
          if (/^(?:no|number|veh|vehicle)$/i.test(tok)) continue;
          const repaired = repairVehicleNumber(tok);
          if (repaired) return repaired;
        }
        return null;
      },
    );
    return found?.value ?? null;
  })();

  t.driverName = read([...TRANSPORT_LABELS.driverName]) || null;
  t.caseNo = read([...TRANSPORT_LABELS.caseNo]) || null;
  return t;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

interface TotalCandidate {
  value: number;
  label: string;
  y: number;
  isLedger: boolean;
}

/**
 * Read a labelled amount: the FIRST numeric token to the right of the label.
 *
 * Taking the right-most number instead looks appealing for right-aligned totals,
 * but these layouts put unrelated blocks on the same visual row — AJIT prints its
 * HSN summary to the left of its totals column, so the "last number on the row"
 * belongs to a different table. The first number after the label is the one the
 * label names.
 */
function readAmountFor(idx: PageIndex, hit: LabelHit): number | null {
  const v = idx.valueForLabel(hit, { maxRightGap: idx.lineHeight * 22, allowBelow: false });
  if (!v.words.length) return null;
  for (const w of v.words) {
    const n = parseAmount(w.text);
    // A lone percentage sitting between label and amount ("9.000 %") is a rate.
    if (n !== null && !/%$/.test(w.text.trim())) return n;
  }
  return null;
}

export function extractTotals(ctx: FieldContext, lineTaxableSum: number | null): InvoiceTotals {
  const { idx, text } = ctx;
  const totals = emptyTotals();

  /**
   * Totals live BELOW the line-item data. Without this bound, "Taxable Value",
   * "CGST" and "Total" match the table's own column headings first and read a
   * per-line figure as the invoice total — measured on the AJIT page, taxable
   * came back as 42062.92 (a tax amount) and on ARCHIT the CGST total as 4.
   */
  const belowTable = ctx.tableBottom;
  const totalsRegion: BBox | undefined =
    belowTable !== undefined
      ? { x0: 0, y0: belowTable - idx.lineHeight, x1: idx.width, y1: idx.height }
      : undefined;

  /**
   * Read a labelled total, searching ONLY below the line-item data when that
   * boundary is known.
   *
   * There is deliberately no whole-page fallback: above the boundary the same
   * words are column headings, and reading them produced a "taxable amount" of
   * 42062.92 (actually a tax figure) on the AJIT page. Returning null instead lets
   * reconcile() derive the value from the line items, which is correct.
   */
  const readLabelled = (aliases: string[]): number | null => {
    const ordered = [...aliases].sort((a, b) => b.length - a.length);
    for (const alias of ordered) {
      for (const hit of idx.findLabels(alias, { region: totalsRegion })) {
        const v = readAmountFor(idx, hit);
        if (v !== null) return v;
      }
    }
    return null;
  };

  totals.taxableAmount = readLabelled([...TOTAL_LABELS.taxableAmount]);
  totals.cgstAmount = readLabelled([...TOTAL_LABELS.cgst]);
  totals.sgstAmount = readLabelled([...TOTAL_LABELS.sgst]);
  totals.igstAmount = readLabelled([...TOTAL_LABELS.igst]);
  totals.cessAmount = readLabelled([...TOTAL_LABELS.cess]);
  totals.roundOff = readLabelled([...TOTAL_LABELS.roundOff]);
  totals.freight = readLabelled([...TOTAL_LABELS.freight]);
  totals.packing = readLabelled([...TOTAL_LABELS.packing]);
  totals.insurance = readLabelled([...TOTAL_LABELS.insurance]);
  totals.loadingUnloading = readLabelled([...TOTAL_LABELS.loadingUnloading]);
  totals.otherCharges = readLabelled([...TOTAL_LABELS.otherCharges]);
  totals.tcsAmount = readLabelled([...TOTAL_LABELS.tcs]);
  if (totals.taxableAmount === null && lineTaxableSum !== null) totals.taxableAmount = lineTaxableSum;

  // --- amount in words: an independent read on the grand total ---
  for (const alias of TOTAL_LABELS.amountInWords) {
    const hit = idx.findLabel(alias);
    if (!hit) continue;
    const v = idx.valueForLabel(hit, { maxRightGap: idx.width, allowBelow: true, belowLines: 2 });
    const words = squash(v.text);
    if (words && /[a-z]{4}/i.test(words)) {
      totals.amountInWords = words;
      break;
    }
  }
  // Fall back to a line that reads like an amount-in-words sentence.
  if (!totals.amountInWords) {
    const line = idx.lineMatching(/\b(?:rupees|lakh|thousand)\b.*\bonly\b/i);
    if (line) totals.amountInWords = squash(line.text);
  }
  const wordsValue = wordsToNumberIndian(totals.amountInWords);

  // --- ledger balances: collected only so they can be excluded ---
  const ledger: TotalCandidate[] = [];
  for (const alias of TOTAL_LABELS.ledgerBalance) {
    for (const hit of idx.findLabels(alias)) {
      const v = readAmountFor(idx, hit);
      if (v !== null) ledger.push({ value: v, label: alias, y: hit.bbox.y0, isLedger: true });
    }
  }
  if (ledger.length) {
    // Keep the largest — a statement may print several running figures.
    totals.ledgerBalanceDue = ledger.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value;
  }

  // --- grand total candidates ---
  const candidates: TotalCandidate[] = [];
  for (const alias of TOTAL_LABELS.grandTotal) {
    for (const hit of idx.findLabels(alias)) {
      // Skip a "Total Amount" that is really "Total Amount Due".
      const rowText = idx.lines.find((l) => Math.abs(bboxCenterY(l.bbox) - bboxCenterY(hit.bbox)) < idx.lineHeight)?.text ?? '';
      const isLedgerRow = TOTAL_LABELS.ledgerBalance.some((lb) => new RegExp(lb.replace(/\s+/g, '\\s+'), 'i').test(rowText));
      const v = readAmountFor(idx, hit);
      if (v === null) continue;
      candidates.push({ value: v, label: alias, y: hit.bbox.y0, isLedger: isLedgerRow });
    }
  }

  const expected = (() => {
    const base = totals.taxableAmount;
    if (base === null) return null;
    const sum =
      base +
      (totals.cgstAmount ?? 0) + (totals.sgstAmount ?? 0) + (totals.igstAmount ?? 0) +
      (totals.cessAmount ?? 0) + (totals.tcsAmount ?? 0) + (totals.freight ?? 0) +
      (totals.packing ?? 0) + (totals.insurance ?? 0) + (totals.loadingUnloading ?? 0) +
      (totals.otherCharges ?? 0) + (totals.roundOff ?? 0);
    return sum;
  })();

  const ledgerValues = new Set(ledger.map((l) => l.value));
  const eligible = candidates.filter((c) => !c.isLedger && !ledgerValues.has(c.value));

  const scored = eligible
    .map((c) => {
      let score = 0;
      if (expected !== null && Math.abs(c.value - expected) <= Math.max(1, Math.abs(expected) * 0.002)) score += 100;
      if (wordsValue !== null && Math.abs(c.value - wordsValue) <= 1) score += 80;
      // Grand totals sit at the bottom of the document.
      score += (c.y / Math.max(1, idx.height)) * 10;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length) {
    totals.grandTotal = scored[0].value;
    if (scored[0].score < 50) {
      ctx.warn({
        code: 'grand_total_unverified',
        field: 'totals.grandTotal',
        severity: 'warn',
        message: `Grand total ${scored[0].value} could not be confirmed against the invoice's own arithmetic or amount in words.`,
      });
    }
  } else if (wordsValue !== null) {
    totals.grandTotal = wordsValue;
    ctx.warn({
      code: 'grand_total_from_words',
      field: 'totals.grandTotal',
      severity: 'warn',
      message: `Grand total taken from the amount in words (${wordsValue}); no usable total label was found.`,
    });
  } else if (expected !== null) {
    totals.grandTotal = Math.round(expected * 100) / 100;
    ctx.warn({
      code: 'grand_total_computed',
      field: 'totals.grandTotal',
      severity: 'warn',
      message: 'Grand total was computed from taxable value plus taxes; no total label was readable.',
    });
  }

  if (
    totals.ledgerBalanceDue !== null && totals.grandTotal !== null &&
    Math.abs(totals.ledgerBalanceDue) > Math.abs(totals.grandTotal) * 1.5
  ) {
    ctx.warn({
      code: 'ledger_balance_present',
      field: 'totals.ledgerBalanceDue',
      severity: 'info',
      message: `This invoice prints a running account balance of ${totals.ledgerBalanceDue}, which is not this invoice's value (${totals.grandTotal}). It has been excluded from the total.`,
    });
  }

  totals.tcsRate = (() => {
    const m = text.match(/tcs\s*@?\s*([\d.]+)\s*%/i);
    return m ? parseNumber(m[1]) : null;
  })();
  return totals;
}

// ---------------------------------------------------------------------------
// Banking, terms
// ---------------------------------------------------------------------------

export function extractPayment(ctx: FieldContext): PaymentInfo {
  const { idx, text } = ctx;
  const out: PaymentInfo = { bankAccounts: [], upiId: null, paymentTermsText: null };
  const lh = idx.lineHeight;

  /**
   * A vendor may list several accounts (ARCHIT prints two), so every row that
   * carries an account number becomes its own entry rather than being merged.
   */
  const accountRows = idx.lines.filter((l) => /a\/?c\s*(?:no|number)|account\s*(?:#|no|number)/i.test(l.text));
  for (const row of accountRows) {
    const band: BBox = { x0: 0, y0: row.bbox.y0 - lh * 0.4, x1: idx.width, y1: row.bbox.y1 + lh * 0.4 };
    const rowText = squash(idx.textIn(band));
    const acct = rowText.match(/(?:a\/?c\s*(?:no|number)?\.?\s*:?\s*|account\s*(?:#|no|number)?\.?\s*:?\s*)([0-9]{6,20})/i);
    const ifsc = extractIfsc(rowText);
    const bankName = rowText.match(/\b((?:[A-Z][A-Za-z]*\s+)*(?:BANK|bank)(?:\s+[A-Z][A-Za-z]*)*)/)?.[1] ?? null;
    if (!acct && !ifsc) continue;
    out.bankAccounts.push({
      bankName: bankName ? squash(bankName) : null,
      branch: null,
      accountNumber: acct?.[1] ?? null,
      ifsc,
    });
  }

  // Labelled single-account layout (BHAGAVAT): Bank / Account # / IFSC / Branch.
  if (!out.bankAccounts.length) {
    const read = (aliases: string[]) =>
      squash(idx.readField(aliases, { maxRightGap: lh * 16, allowBelow: false }).text).split('\n')[0] ?? '';
    const acct = read([...BANK_LABELS.accountNumber]).match(/\d{6,20}/)?.[0] ?? null;
    const ifsc = extractIfsc(read([...BANK_LABELS.ifsc]) || text);
    const bank = read([...BANK_LABELS.bankName]) || null;
    const branch = read([...BANK_LABELS.branch]) || null;
    if (acct || ifsc) out.bankAccounts.push({ bankName: bank, branch, accountNumber: acct, ifsc });
  } else {
    // Attach a branch label if one exists near the block.
    const branch = squash(idx.readField([...BANK_LABELS.branch], { maxRightGap: lh * 16, allowBelow: false }).text);
    if (branch) out.bankAccounts[0].branch = branch.split('\n')[0];
  }

  const upi = text.match(/\b([\w.\-]{2,})@(?:ok\w+|paytm|ybl|upi|axl|ibl|apl|hdfcbank|icici|sbi)\b/i);
  if (upi) out.upiId = upi[0];

  const termsLine = idx.lineMatching(/payment\s+(?:must|should|within|due|terms)/i);
  if (termsLine) out.paymentTermsText = squash(termsLine.text);
  return out;
}

export function extractTerms(ctx: FieldContext): string[] {
  const { idx } = ctx;
  const heading = idx.findAnyLabel([...TERMS_LABELS]);
  if (!heading) return [];
  const lh = idx.lineHeight;
  const region: BBox = {
    x0: Math.max(0, heading.bbox.x0 - lh),
    y0: heading.bbox.y1,
    x1: Math.min(idx.width, heading.bbox.x0 + idx.width * 0.55),
    y1: Math.min(idx.height, heading.bbox.y1 + lh * 12),
  };
  const out: string[] = [];
  for (const line of regionLines(idx, region)) {
    if (/^(?:for\b|authoris|bank\s+details|received\s+by|e\s*&\s*o)/i.test(line)) break;
    // Numbered clauses start a new entry; other lines continue the previous one.
    if (/^\(?\d+[).\]]/.test(line) || !out.length) out.push(line);
    else out[out.length - 1] += ` ${line}`;
  }
  return out.map((t) => squash(t)).filter((t) => t.length > 4);
}

export function extractRemarks(ctx: FieldContext): string | null {
  const { idx } = ctx;
  const hit = idx.findAnyLabel([...LABELS.remarks]);
  if (!hit) return null;
  const v = idx.valueForLabel(hit, { maxRightGap: idx.width * 0.6, allowBelow: true, belowLines: 1 });
  const t = squash(v.text);
  return t && !isNoise(t) ? t : null;
}
