/**
 * Deterministic invoice OCR — shared types.
 *
 * No AI/LLM is involved anywhere in this pipeline. Accuracy comes from three
 * mechanisms, in order of contribution:
 *   1. Preprocessing that makes Tesseract's layout analysis work at all
 *      (border trim is mandatory — see render.ts).
 *   2. Geometric, template-anchored field lookup (label bbox -> value band).
 *   3. Arithmetic reconciliation over the invoice's own redundancy, which both
 *      validates and *repairs* OCR digit errors (see reconcile.ts).
 */

// ---------------------------------------------------------------------------
// Raw OCR primitives
// ---------------------------------------------------------------------------

/** Axis-aligned box in page pixel space. x grows right, y grows down. */
export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  /** 0-100 as reported by Tesseract. */
  confidence: number;
  bbox: BBox;
  /** Index of the text line this word belongs to, within the page. */
  lineIndex: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: BBox;
  words: OcrWord[];
}

export interface OcrPage {
  pageNumber: number;
  /** Rotation applied during rendering to make the text upright. */
  rotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  dpi: number;
  /** Full plain text, lines joined with \n. */
  text: string;
  lines: OcrLine[];
  words: OcrWord[];
  meanConfidence: number;
  /** PNG bytes of the preprocessed page, kept for targeted region re-OCR. */
  image: Buffer;
  /** Recipe/PSM actually used, for diagnostics. */
  recipe: string;
}

// ---------------------------------------------------------------------------
// Extracted invoice
// ---------------------------------------------------------------------------

export interface PartyInfo {
  name: string | null;
  addressLines: string[];
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  phones: string[];
  emails: string[];
  website: string | null;
  /** Site/project marker printed on the invoice, e.g. "AGASTYA", "SATVA". */
  siteName: string | null;
}

export interface DispatchFrom {
  partyName: string | null;
  addressLines: string[];
  pincode: string | null;
  city: string | null;
  state: string | null;
}

export type PoNumberSource = 'po_field' | 'remarks' | 'order_no' | 'inferred' | null;

export interface InvoiceDocumentInfo {
  invoiceNumber: string | null;
  /** ISO yyyy-mm-dd. */
  invoiceDate: string | null;
  dueDate: string | null;
  creditDays: number | null;
  challanNumber: string | null;
  /** Buyer's (our) PO number, wherever it was found — including Remarks. */
  buyerPoNumber: string | null;
  buyerPoNumberSource: PoNumberSource;
  /** Vendor's own order ref (e.g. AJIT's "8055"). Never our PO. */
  vendorOrderRef: string | null;
  placeOfSupply: string | null;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  ewayBillNo: string | null;
  ewayDate: string | null;
  reverseCharge: boolean | null;
  agentOrBroker: string | null;
  zoneCode: string | null;
  documentType: string | null;
  copyType: string | null;
  isEInvoice: boolean;
}

export interface TransportInfo {
  transporterName: string | null;
  station: string | null;
  lrNumber: string | null;
  lrDate: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  caseNo: string | null;
}

export type UnitSource = 'unit_column' | 'fused_in_qty' | 'column_header' | 'inferred' | null;

export interface InvoiceLineItem {
  sr: number;
  itemCode: string | null;
  brandOrCompany: string | null;
  description: string;
  hsnSac: string | null;
  quantity: number | null;
  unit: string | null;
  unitSource: UnitSource;
  /** MRP / list rate when a second rate column exists (ARCHIT "Net Rate"). */
  listRate: number | null;
  /** The rate that reconciles with the amount. */
  unitRate: number | null;
  /** Ordered cascade, e.g. [55, 15.25] applied sequentially. Never summed. */
  discountPercents: number[];
  discountAmount: number | null;
  taxableValue: number | null;
  cgstRate: number | null;
  cgstAmount: number | null;
  sgstRate: number | null;
  sgstAmount: number | null;
  igstRate: number | null;
  igstAmount: number | null;
  cessRate: number | null;
  cessAmount: number | null;
  /** Per-line combined slab (BHAGAVAT prints "18%"). */
  combinedTaxRate: number | null;
  lineTotal: number | null;
}

export interface HsnSummaryRow {
  hsnSac: string | null;
  taxableValue: number | null;
  cgstRate: number | null;
  cgstAmount: number | null;
  sgstRate: number | null;
  sgstAmount: number | null;
  igstRate: number | null;
  igstAmount: number | null;
  cessAmount: number | null;
  totalTax: number | null;
}

export interface InvoiceTotals {
  totalQuantity: number | null;
  taxableAmount: number | null;
  cgstAmount: number | null;
  sgstAmount: number | null;
  igstAmount: number | null;
  cessAmount: number | null;
  tcsRate: number | null;
  tcsAmount: number | null;
  freight: number | null;
  packing: number | null;
  insurance: number | null;
  loadingUnloading: number | null;
  otherCharges: number | null;
  /** Signed: +0.42 (AJIT rounds up), -0.07 (ARCHIT rounds down). */
  roundOff: number | null;
  /** THIS invoice only. Never a ledger balance. */
  grandTotal: number | null;
  amountInWords: string | null;
  /**
   * Running account balance when the vendor prints one (BHAGAVAT's
   * "Total Amount Due" = 21,08,663 against an 8,319 invoice).
   * Parked here so it can never be mistaken for grandTotal.
   */
  ledgerBalanceDue: number | null;
}

export interface BankAccount {
  bankName: string | null;
  branch: string | null;
  accountNumber: string | null;
  ifsc: string | null;
}

export interface PaymentInfo {
  bankAccounts: BankAccount[];
  upiId: string | null;
  paymentTermsText: string | null;
}

export type WarningSeverity = 'info' | 'warn' | 'error';

export interface ExtractionWarning {
  code: string;
  message: string;
  severity: WarningSeverity;
  /** Dotted path of the affected field, when applicable. */
  field?: string;
}

export interface ValidationReport {
  lineMathOk: boolean;
  taxMathOk: boolean;
  grandTotalOk: boolean;
  hsnSummaryMatchesLines: boolean;
  amountInWordsMatches: boolean | null;
  gstinValid: { vendor: boolean | null; buyer: boolean | null };
  warnings: ExtractionWarning[];
  /** 0-1 per dotted field path. */
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
  /** Fields whose value was corrected by arithmetic repair. */
  repairedFields: string[];
}

export interface ExtractedInvoice {
  meta: {
    sourceFileName: string;
    sourceFileHash: string;
    pageNumbers: number[];
    pageRotations: number[];
    detectedTemplate: string;
    templateConfidence: number;
    engine: string;
    ocrMeanConfidence: number;
    processingMs: number;
  };
  vendor: PartyInfo;
  buyer: PartyInfo;
  shipTo: PartyInfo;
  dispatchFrom: DispatchFrom | null;
  document: InvoiceDocumentInfo;
  transport: TransportInfo;
  lineItems: InvoiceLineItem[];
  hsnSummary: HsnSummaryRow[];
  totals: InvoiceTotals;
  payment: PaymentInfo;
  termsAndConditions: string[];
  remarks: string | null;
  validation: ValidationReport;
  /** Raw OCR text per page, retained for audit and for the review UI. */
  rawText: string[];
}

// ---------------------------------------------------------------------------
// Factories — every field starts explicitly null so "absent" never becomes ""
// ---------------------------------------------------------------------------

export function emptyParty(): PartyInfo {
  return {
    name: null,
    addressLines: [],
    city: null,
    state: null,
    pincode: null,
    gstin: null,
    pan: null,
    phones: [],
    emails: [],
    website: null,
    siteName: null,
  };
}

export function emptyDocumentInfo(): InvoiceDocumentInfo {
  return {
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    creditDays: null,
    challanNumber: null,
    buyerPoNumber: null,
    buyerPoNumberSource: null,
    vendorOrderRef: null,
    placeOfSupply: null,
    irn: null,
    ackNo: null,
    ackDate: null,
    ewayBillNo: null,
    ewayDate: null,
    reverseCharge: null,
    agentOrBroker: null,
    zoneCode: null,
    documentType: null,
    copyType: null,
    isEInvoice: false,
  };
}

export function emptyTransport(): TransportInfo {
  return {
    transporterName: null,
    station: null,
    lrNumber: null,
    lrDate: null,
    vehicleNumber: null,
    driverName: null,
    caseNo: null,
  };
}

export function emptyTotals(): InvoiceTotals {
  return {
    totalQuantity: null,
    taxableAmount: null,
    cgstAmount: null,
    sgstAmount: null,
    igstAmount: null,
    cessAmount: null,
    tcsRate: null,
    tcsAmount: null,
    freight: null,
    packing: null,
    insurance: null,
    loadingUnloading: null,
    otherCharges: null,
    roundOff: null,
    grandTotal: null,
    amountInWords: null,
    ledgerBalanceDue: null,
  };
}
