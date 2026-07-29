/**
 * Deterministic parsing / normalisation / repair of the scalar values found on
 * Indian GST invoices. Pure functions, no I/O, fully unit-testable.
 */

// ---------------------------------------------------------------------------
// Numbers & amounts
// ---------------------------------------------------------------------------

/** Characters Tesseract commonly substitutes inside numeric runs. */
const DIGIT_LOOKALIKE: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0', U: '0',
  l: '1', I: '1', i: '1', '|': '1', '!': '1', L: '1',
  Z: '2', z: '2',
  B: '8', b: '6',
  S: '5', s: '5',
  G: '6', g: '9', q: '9',
  A: '4',
  T: '7',
  '¥': '', '₹': '', // ¥ / ₹ — scanner artefacts around currency
};

/** Strip currency markers, stray letters and OCR noise from a numeric token. */
export function cleanNumericToken(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  // Currency words/symbols and common suffixes.
  s = s.replace(/(?:^|\b)(?:rs|inr|rupees?)\.?\s*/gi, '');
  s = s.replace(/[₹$£€]/g, '');
  s = s.replace(/\/-\s*$/, '');
  s = s.replace(/\s+/g, '');
  /**
   * Drop printed table rules touching either end BEFORE lookalike mapping.
   * Tesseract renders cell borders as '|' or '[', and the mapping below turns a
   * bare '|' into '1' — so "14750.00|" would silently parse as 14750.001 and
   * "1|" as 11. Interior pipes are still mapped, since those are genuine
   * mis-reads of the digit.
   */
  s = s.replace(/^[|[\]!¦]+/, '').replace(/[|[\]!¦]+$/, '');
  // Map remaining lookalikes to digits.
  s = s.replace(/[A-Za-z|!¥₹]/g, (c) => (c in DIGIT_LOOKALIKE ? DIGIT_LOOKALIKE[c] : ''));
  return s;
}

/**
 * Parse an amount printed on an invoice.
 * Handles Indian lakh grouping (21,08,663.00), Western grouping, bare decimals,
 * parenthesised and trailing negatives, and OCR comma/period confusion.
 * Returns null when the token holds no usable digits.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const original = String(raw);
  let s = cleanNumericToken(original);
  if (!s) return null;

  /**
   * Drop leading label punctuation but KEEP a sign. ARCHIT's round-off cell reads
   * ":-0.07" once its clipped label is stripped; discarding the '-' with the ':'
   * would turn a rounding-down into a rounding-up.
   */
  s = s.replace(/^[^\d(\-]+/, '');
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-+\s*$/, '');
  }
  if (/^-/.test(s)) {
    negative = true;
    s = s.replace(/^-+/, '');
  }
  s = s.replace(/[+]/g, '');
  if (!/\d/.test(s)) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Last '.' wins as the decimal separator; commas are grouping.
    const lastDot = s.lastIndexOf('.');
    const intPart = s.slice(0, lastDot).replace(/[.,]/g, '');
    const frac = s.slice(lastDot + 1).replace(/[^\d]/g, '');
    s = frac ? `${intPart}.${frac}` : intPart;
  } else if (hasComma) {
    const groups = s.split(',');
    const last = groups[groups.length - 1];
    // A trailing 2-digit group that cannot be valid grouping is a misread '.'.
    const looksLikeGrouping = groups.length > 1 && groups.slice(1).every((g) => g.length === 3 || g.length === 2);
    if (last.length === 2 && !looksLikeGrouping) {
      s = `${groups.slice(0, -1).join('')}.${last}`;
    } else {
      s = groups.join('');
    }
  } else if (hasDot) {
    // Multiple dots: keep the last as decimal (e.g. "38.771.25").
    const parts = s.split('.');
    if (parts.length > 2) {
      const frac = parts.pop() as string;
      s = `${parts.join('')}.${frac}`;
    }
  }

  s = s.replace(/[^\d.]/g, '');
  if (!/\d/.test(s)) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Parse a plain quantity/percentage. Same rules, but rejects absurd results. */
export function parseNumber(raw: string | null | undefined): number | null {
  const n = parseAmount(raw);
  return n === null || !Number.isFinite(n) ? null : n;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True when a token is "empty" on paper: blank, '-', '--', 'NA', 'N.A.', '.' */
export function isBlankish(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw).trim();
  if (!s) return true;
  return /^(?:[-–—.:_]+|n\.?\s*a\.?|nil|none|null)$/i.test(s);
}

/**
 * Parse a discount cell into an ordered cascade.
 * "55.00 + 15.25" -> [55, 15.25]   (applied sequentially, NEVER summed)
 * "0.00" -> [0]        "-" -> []
 */
export function parseDiscountCascade(raw: string | null | undefined): number[] {
  if (isBlankish(raw)) return [];
  const s = String(raw);
  const parts = s
    .split(/[+&]|\band\b/i)
    .map((p) => parseNumber(p))
    .filter((n): n is number => n !== null && n >= 0 && n <= 100);
  return parts;
}

/** Apply a discount cascade multiplicatively. */
export function applyDiscountCascade(base: number, cascade: number[]): number {
  return cascade.reduce((acc, d) => acc * (1 - d / 100), base);
}

/**
 * Split a fused quantity/unit cell: "150 PKTS" -> { quantity: 150, unit: 'PKTS' }.
 * Returns unit null when the cell is purely numeric.
 */
export function splitQuantityUnit(raw: string | null | undefined): { quantity: number | null; unit: string | null } {
  if (isBlankish(raw)) return { quantity: null, unit: null };
  const s = String(raw).trim();
  const m = s.match(/^\s*([\d.,]+)\s*([A-Za-z.]{1,12})?\s*$/);
  if (m) {
    return { quantity: parseNumber(m[1]), unit: m[2] ? normaliseUnit(m[2]) : null };
  }
  return { quantity: parseNumber(s), unit: null };
}

const UNIT_ALIASES: Record<string, string> = {
  PCS: 'PCS', PC: 'PCS', PIECE: 'PCS', PIECES: 'PCS', NOS: 'NOS', NO: 'NOS', NUMBER: 'NOS',
  PKT: 'PKTS', PKTS: 'PKTS', PACKET: 'PKTS', PACKETS: 'PKTS', PACK: 'PKTS',
  BAG: 'BAGS', BAGS: 'BAGS', BAGES: 'BAGS', BAGE: 'BAGS',
  KG: 'KG', KGS: 'KG', KILOGRAM: 'KG', MT: 'MT', TON: 'MT', TONNE: 'MT', TONS: 'MT',
  LTR: 'LTR', LTRS: 'LTR', LITER: 'LTR', LITRE: 'LTR', LITERS: 'LTR', L: 'LTR',
  BOX: 'BOX', BOXES: 'BOX', SET: 'SET', SETS: 'SET', PAIR: 'PAIR', PAIRS: 'PAIR',
  SQFT: 'SQFT', SQF: 'SQFT', SQM: 'SQM', SQMT: 'SQM', RFT: 'RFT', RMT: 'RMT',
  BRASS: 'BRASS', CUM: 'CUM', CFT: 'CFT', DRUM: 'DRUM', DRUMS: 'DRUM',
  ROLL: 'ROLL', ROLLS: 'ROLL', BUNDLE: 'BUNDLE', BDL: 'BUNDLE', COIL: 'COIL',
  TIN: 'TIN', TINS: 'TIN', CAN: 'CAN', BOTTLE: 'BOTTLE', TUBE: 'TUBE',
};

/** Canonicalise a unit token. Note BAGES (ARCHIT's typo) -> BAGS. */
export function normaliseUnit(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  const key = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return null;
  return UNIT_ALIASES[key] ?? key;
}

/** True when a header token is a unit noun rather than a generic "Qty" label. */
export function isUnitLikeHeader(raw: string): boolean {
  const key = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (!key) return false;
  if (/^(QTY|QTY\.|QUANTITY|QNTY|NOS)$/.test(key)) return true;
  return key in UNIT_ALIASES;
}

// ---------------------------------------------------------------------------
// Dates — Indian invoices are ALWAYS day-first
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parse an invoice date to ISO yyyy-mm-dd.
 * Day-first is assumed for all-numeric forms — 11/07/2026 is 11 July 2026.
 * Recognises: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, dd Mon yyyy, Mon dd yyyy,
 * yyyy-mm-dd.
 */
export function parseInvoiceDate(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  let s = String(raw).trim();
  // Drop a leading label remnant and any time component.
  s = s.replace(/^[^\dA-Za-z]+/, '').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b.*$/, '').trim();
  s = s.replace(/[ ]/g, ' ');

  // ISO first (unambiguous).
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // dd Mon yyyy  /  dd-Mon-yyyy
  m = s.match(/\b(\d{1,2})[\s\-/.]*([A-Za-z]{3,9})[\s\-/.,]*(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);

  // Mon dd, yyyy
  m = s.match(/\b([A-Za-z]{3,9})[\s\-/.]*(\d{1,2})[\s\-/.,]*(\d{2,4})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);

  // dd/mm/yyyy — day first, always.
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // If the first field cannot be a day but the second can, the vendor printed
    // month-first; fall back rather than emitting nothing.
    if (a > 31 || (a > 12 && b > 12)) return null;
    if (a <= 12 && b > 12) {
      const swapped = iso(+m[3], a, b);
      if (swapped) return swapped;
    }
    return iso(+m[3], b, a);
  }
  return null;
}

/** Parse "20-07-2026 13:28:00" into an ISO timestamp string. */
export function parseInvoiceDateTime(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  const s = String(raw).trim();
  const date = parseInvoiceDate(s);
  if (!date) return null;
  const t = s.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!t) return date;
  const hh = String(Math.min(23, +t[1])).padStart(2, '0');
  const mm = String(Math.min(59, +t[2])).padStart(2, '0');
  const ss = String(Math.min(59, t[3] ? +t[3] : 0)).padStart(2, '0');
  return `${date}T${hh}:${mm}:${ss}`;
}

/** Extract a credit-day count from prose: "PAYMENT DUE IN 30 DAYS ON 10/08/2026". */
export function parseCreditDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).match(/(?:within|due\s+in|payment\s+within|credit(?:\s+of)?)\s*(\d{1,3})\s*days?/i)
    ?? String(text).match(/(\d{1,3})\s*days?\b/i);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : null;
}

// ---------------------------------------------------------------------------
// Amount in words (Indian numbering) -> number
// ---------------------------------------------------------------------------

const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, lakh: 100_000, lac: 100_000, lakhs: 100_000,
  lacs: 100_000, crore: 10_000_000, crores: 10_000_000, million: 1_000_000,
  billion: 1_000_000_000,
};

/**
 * Convert an Indian amount-in-words string to a number.
 * "Five lakh fifty one thousand four hundred ninety two only" -> 551492
 * Returns null if no number words are present.
 */
export function wordsToNumberIndian(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const tokens = String(raw)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !['rupees', 'rupee', 'inr', 'only', 'and', 'paise', 'paisa', 'e', 'o', 'rs'].includes(t));
  if (!tokens.length) return null;

  let total = 0;
  let current = 0;
  let seen = false;

  for (const t of tokens) {
    if (t in WORD_VALUES) {
      current += WORD_VALUES[t];
      seen = true;
    } else if (t === 'hundred') {
      current = (current || 1) * 100;
      seen = true;
    } else if (t in SCALES) {
      total += (current || 1) * SCALES[t];
      current = 0;
      seen = true;
    }
    // Unknown tokens are ignored (OCR noise, "of", vendor names).
  }
  if (!seen) return null;
  return total + current;
}

// ---------------------------------------------------------------------------
// GSTIN / PAN / HSN / IRN
// ---------------------------------------------------------------------------

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Official GSTIN mod-36 check character over the first 14 characters. */
export function gstinCheckChar(first14: string): string | null {
  if (first14.length !== 14) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    if (v < 0) return null;
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export interface GstinCheck {
  value: string | null;
  formatOk: boolean;
  checksumOk: boolean;
  stateCode: string | null;
  /** PAN embedded at positions 3..12. */
  pan: string | null;
}

export function checkGstin(raw: string | null | undefined): GstinCheck {
  const blank: GstinCheck = { value: null, formatOk: false, checksumOk: false, stateCode: null, pan: null };
  if (isBlankish(raw)) return blank;
  const s = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 15) return { ...blank, value: s || null };
  const formatOk = GSTIN_RE.test(s);
  const checksumOk = gstinCheckChar(s.slice(0, 14)) === s[14];
  return {
    value: s,
    formatOk,
    checksumOk,
    stateCode: s.slice(0, 2),
    pan: PAN_RE.test(s.slice(2, 12)) ? s.slice(2, 12) : null,
  };
}

/**
 * Characters Tesseract confuses in the *alphanumeric* direction — used to repair
 * GSTINs. Bidirectional on purpose: a digit slot may have been read as a letter
 * and vice-versa.
 */
const ALNUM_CONFUSIONS: Record<string, string[]> = {
  '0': ['O', 'D', 'Q', 'U'], O: ['0', 'D', 'Q'], D: ['0', 'O'], Q: ['0', 'O'],
  '1': ['I', 'L', 'T', '7'], I: ['1', 'L', 'T'], L: ['1', 'I'], T: ['1', '7'],
  '2': ['Z'], Z: ['2', '7'],
  '5': ['S'], S: ['5'],
  '6': ['G', 'b', '8'], G: ['6', 'C'],
  '8': ['B', '6', '0'], B: ['8', '6'],
  '9': ['g', 'q', '4'], '4': ['A', '9'], A: ['4'],
  '7': ['1', 'T', 'Z'],
  C: ['G'], E: ['F'], F: ['E'], M: ['N'], N: ['M'], V: ['Y'], Y: ['V'],
};

/**
 * Attempt to repair an OCR'd GSTIN so that it satisfies both the format regex
 * and the mod-36 checksum. Tries up to 2 character substitutions.
 * Returns the repaired value plus how many edits were needed, or null.
 */
export function repairGstin(raw: string | null | undefined): { value: string; edits: number } | null {
  if (isBlankish(raw)) return null;
  const s = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 15) return null;

  const ok = (c: string) => GSTIN_RE.test(c) && gstinCheckChar(c.slice(0, 14)) === c[14];
  if (ok(s)) return { value: s, edits: 0 };

  const alts = (ch: string) => [ch, ...(ALNUM_CONFUSIONS[ch] ?? []).map((c) => c.toUpperCase())];

  // 1 edit
  for (let i = 0; i < 15; i++) {
    for (const c of alts(s[i])) {
      if (c === s[i]) continue;
      const cand = s.slice(0, i) + c + s.slice(i + 1);
      if (ok(cand)) return { value: cand, edits: 1 };
    }
  }
  // 2 edits
  for (let i = 0; i < 15; i++) {
    for (const ci of alts(s[i])) {
      if (ci === s[i]) continue;
      const s1 = s.slice(0, i) + ci + s.slice(i + 1);
      for (let j = i + 1; j < 15; j++) {
        for (const cj of alts(s1[j])) {
          if (cj === s1[j]) continue;
          const cand = s1.slice(0, j) + cj + s1.slice(j + 1);
          if (ok(cand)) return { value: cand, edits: 2 };
        }
      }
    }
  }
  return null;
}

export function checkPan(raw: string | null | undefined): { value: string | null; valid: boolean } {
  if (isBlankish(raw)) return { value: null, valid: false };
  const s = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return { value: s || null, valid: PAN_RE.test(s) };
}

/** HSN/SAC codes are 4, 6 or 8 digits. */
export function normaliseHsn(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  const digits = cleanNumericToken(String(raw)).replace(/[^\d]/g, '');
  if (![4, 6, 8].includes(digits.length)) return digits.length >= 4 ? digits.slice(0, 8) : null;
  return digits;
}

export const IRN_RE = /^[0-9a-f]{64}$/;

export function normaliseIrn(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  const s = String(raw).toLowerCase().replace(/[^0-9a-f]/g, '');
  return IRN_RE.test(s) ? s : null;
}

/** Indian vehicle registration, e.g. GJ05CV4633 / GJ19Z3519. */
export const VEHICLE_RE = /^[A-Z]{2}\d{2}[A-Z]{0,3}\d{4}$/;

export function normaliseVehicleNumber(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  const s = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return s || null;
}

/**
 * Repair an OCR'd Indian vehicle registration.
 *
 * The plate layout is SS DD LLL NNNN — two state letters, two district digits,
 * up to three series letters, four digits. Because the character CLASS of each
 * position is known, letters can be mapped back to digits exactly where digits
 * belong and vice versa. This turns the observed "GJO5CVA633" into GJ05CV4633
 * without guessing.
 *
 * Returns null when the token cannot be made to fit the pattern.
 */
export function repairVehicleNumber(raw: string | null | undefined): string | null {
  if (isBlankish(raw)) return null;
  const s = String(raw).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length < 8 || s.length > 11) return null;
  if (VEHICLE_RE.test(s)) return s;

  const toDigit: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8', A: '4', T: '7' };
  const toLetter: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B', '4': 'A' };

  const chars = [...s];
  const n = chars.length;
  // Positions 0-1 letters, 2-3 digits, last 4 digits, middle letters.
  const wantDigit = (i: number) => (i >= 2 && i <= 3) || i >= n - 4;
  const wantLetter = (i: number) => i <= 1 || (i > 3 && i < n - 4);

  for (let i = 0; i < n; i++) {
    const c = chars[i];
    if (wantDigit(i) && /[A-Z]/.test(c) && toDigit[c]) chars[i] = toDigit[c];
    else if (wantLetter(i) && /\d/.test(c) && toLetter[c]) chars[i] = toLetter[c];
  }
  const out = chars.join('');
  return VEHICLE_RE.test(out) ? out : null;
}

/** Indian mobile/landline digits, deduplicated by the caller. */
export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\+91[\s-]?)?(?:\d[\s-]?){9,13}\d/g;
  for (const m of text.matchAll(re)) {
    const digits = m[0].replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
    if (digits.length >= 10 && digits.length <= 12) out.add(digits);
  }
  return [...out];
}

export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  // OCR often drops the space after a label: "Email:archit.corporation@gmail.com"
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    out.add(m[0].toLowerCase().replace(/[.,;]+$/, ''));
  }
  return [...out];
}

export function extractWebsite(text: string): string | null {
  const m = text.match(/\b(?:https?:\/\/)?www\.[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return m ? m[0].toLowerCase() : null;
}

export function extractPincode(text: string): string | null {
  const m = text.match(/\b([1-9]\d{5})\b/);
  return m ? m[1] : null;
}

export function extractIfsc(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Constrained digit repair — the core accuracy mechanism
// ---------------------------------------------------------------------------

const NUM_CONFUSIONS: Record<string, string[]> = {
  '0': ['8', '6', '9'],
  '1': ['7', '4'],
  '2': ['7', '3'],
  '3': ['8', '9', '5'],
  '4': ['9', '1'],
  '5': ['6', '8', '3'],
  '6': ['5', '8', '0'],
  '7': ['1', '2'],
  '8': ['0', '3', '6', '9'],
  '9': ['0', '4', '3', '8'],
};

/**
 * Generate plausible OCR alternatives for a numeric string, ordered by
 * increasing edit distance (1 then 2 substitutions). Also tries decimal-point
 * shifts, which are a common scanner artefact.
 *
 * Bounded to keep the search small: at most `limit` candidates.
 */
export function numericCandidates(value: number, digits: string, limit = 400): number[] {
  const out: number[] = [];
  const seen = new Set<number>([value]);
  const push = (s: string) => {
    const n = Number.parseFloat(s);
    if (Number.isFinite(n) && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };

  const chars = [...digits];
  // 1 substitution
  for (let i = 0; i < chars.length && out.length < limit; i++) {
    const alts = NUM_CONFUSIONS[chars[i]];
    if (!alts) continue;
    for (const a of alts) {
      const c = [...chars];
      c[i] = a;
      push(c.join(''));
    }
  }
  // 2 substitutions
  for (let i = 0; i < chars.length && out.length < limit; i++) {
    const ai = NUM_CONFUSIONS[chars[i]];
    if (!ai) continue;
    for (const a of ai) {
      const c1 = [...chars];
      c1[i] = a;
      for (let j = i + 1; j < c1.length && out.length < limit; j++) {
        const aj = NUM_CONFUSIONS[c1[j]];
        if (!aj) continue;
        for (const b of aj) {
          const c2 = [...c1];
          c2[j] = b;
          push(c2.join(''));
        }
      }
    }
  }
  return out.slice(0, limit);
}

/** Digits-only view of a printed number, preserving the decimal point. */
export function digitString(raw: string): string {
  return cleanNumericToken(raw).replace(/[^\d.]/g, '');
}

/** Relative closeness test used throughout reconciliation. */
export function approxEqual(a: number, b: number, absTol = 1, relTol = 0.005): boolean {
  const diff = Math.abs(a - b);
  return diff <= Math.max(absTol, Math.abs(b) * relTol);
}
