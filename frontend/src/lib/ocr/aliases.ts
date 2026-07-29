/**
 * Label and column vocabularies.
 *
 * This file is DATA, not logic, and it is the reason one extractor copes with
 * unrelated vendor layouts: every field is described by the set of ways vendors
 * actually print it. Matching is fuzzy (see geometry.labelMatches), so only
 * genuinely different wordings need listing — not every OCR misreading.
 *
 * When onboarding a new vendor whose invoice under-extracts, adding its wording
 * here is usually the entire fix.
 */

// ---------------------------------------------------------------------------
// Header / reference fields
// ---------------------------------------------------------------------------

export const LABELS = {
  invoiceNumber: [
    'Invoice No.', 'Invoice No', 'Invoice #', 'Invoice Number', 'Bill No.', 'Bill No',
    'Inv No', 'Inv. No.', 'Tax Invoice No', 'Invoice', 'Document No', 'Voucher No',
  ],
  invoiceDate: [
    'Invoice Date', 'Inv Date', 'Bill Date', 'Date of Invoice', 'Dated', 'Invoice Dt',
    'Document Date', 'Date',
  ],
  dueDate: ['Due Date', 'Due Dt', 'Payment Due Date', 'Pay By'],
  challanNumber: [
    'Challan No.', 'Challan No', 'Challan Number', 'D.C. No', 'DC No',
    'Delivery Challan No', 'Chalan No',
  ],
  challanDate: ['Challan Date', 'Challan Dt', 'D.C. Date'],
  /** Buyer's purchase order — the field we actually want. */
  buyerPoNumber: [
    'PO Number', 'P.O. Number', 'P.O.NO.', 'P.O. No', 'PO No', 'Purchase Order No',
    'Purchase Order Number', 'Order No.', 'Order No', 'Buyer Order No', 'Your Order No',
    'PO Ref', 'Cust PO No', 'Customer PO', 'Order Ref',
  ],
  placeOfSupply: ['Place of Supply', 'Place Of Supply', 'POS', 'Supply Place'],
  irn: ['IRN', 'IRN No', 'Invoice Reference Number'],
  ackNo: ['Ack No.', 'Ack No', 'Ack. No', 'Acknowledgement No', 'Ack Number'],
  ackDate: ['Ack Date', 'Ack. Date', 'Acknowledgement Date'],
  ewayBillNo: ['Eway Bill No', 'E-Way Bill No', 'EwayBill No', 'E Way Bill', 'Eway No'],
  ewayDate: ['Eway Dt', 'Eway Date', 'E-Way Bill Date'],
  reverseCharge: [
    'Reverse Charge', 'Amount of tax subject to reverse Charges',
    'Whether tax is payable on reverse charge',
  ],
  agent: ['Agent', 'Broker', 'Agent / Broker', 'Sales Agent'],
  zone: ['Zone'],
  copyType: ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER', 'OFFICE COPY'],
  remarks: ['Remarks', 'Remark', 'Narration', 'Note', 'Notes', 'Comments'],
} as const;

export const PARTY_LABELS = {
  vendorGstin: ['GSTIN', 'GST No', 'GSTIN No', 'GSTIN/UIN', 'GST Number', 'GSTIN NO.'],
  pan: ['PAN', 'P.A.N.', 'PAN No', 'Income Tax PAN'],
  /** Blocks that introduce the bill-to party. */
  buyerBlock: [
    'Billed to (Customer)', 'Receiver Details(Billed to)', 'Receiver Details', 'Billed to',
    'Bill To', 'Buyer', 'Customer Details', 'Customer', 'Billing Address', 'Party Details',
    'Details of Receiver', 'Buyer (Bill to)', 'M/S',
  ],
  /** Blocks that introduce the ship-to party. */
  shipToBlock: [
    'Consignee Details(Shipped to)', 'Consignee Details', 'Delivery Address', 'Shipping Address',
    'Ship To', 'Shipped to', 'Consignee', 'Details of Consignee', 'Site Address',
    'Delivery At', 'Dispatch To',
  ],
  dispatchFrom: [
    'Dispatch From', 'Dispatched From', 'Despatch From', 'Dispatch from pin',
    'Dispatch from State', 'Dispatch from City',
  ],
  site: ['SITE', 'Site', 'Site Name', 'Project', 'Project Name'],
  contactPerson: ['Contact Person', 'Contact', 'Kind Attn', 'Attn'],
  phone: ['Contact No.', 'Contact No', 'Mobile', 'Mob', 'Ph', 'Phone', 'Tel', 'Mobile No'],
  email: ['Email', 'E-mail', 'Mail'],
  website: ['Website', 'Web'],
  state: ['STATE', 'State'],
} as const;

export const TRANSPORT_LABELS = {
  transporterName: [
    'Transport', 'Transporter', 'Transporter Name', 'Transport Name', 'Carrier',
    'Transport Details', 'By Lorry', 'Despatched through',
  ],
  station: ['Station', 'Destination', 'To Station'],
  lrNumber: ['L.R.No.', 'L.R. No.', 'LR No', 'LR Number', 'L.R.No', 'GR No', 'Docket No'],
  lrDate: ['LR.Dt.', 'L.R. Date', 'LR Date', 'LR Dt'],
  vehicleNumber: [
    'Vehicle No', 'Veh.No.', 'Veh No', 'VahicleNo', 'Vehicle Number', 'Truck No',
    'Lorry No', 'Vehicle',
  ],
  driverName: ['Driver', 'Driver Name'],
  caseNo: ['Case No'],
} as const;

// ---------------------------------------------------------------------------
// Totals — order matters, most specific first
// ---------------------------------------------------------------------------

export const TOTAL_LABELS = {
  taxableAmount: [
    'Taxable Amount', 'Taxable Value', 'Total Taxable Value', 'Tax.Value', 'Tax Value',
    'Basic Amount', 'Basic', 'Sub Total', 'Subtotal', 'Amount Before Tax', 'Net Amount Before Tax',
  ],
  cgst: ['ADD CGST', 'CGST Amount', 'CGST', 'C.Gst', 'C GST', 'Central Tax', 'CGST Payable'],
  sgst: [
    'ADD SGST', 'SGST Amount', 'SGST', 'S.Gst', 'S GST', 'State/UT Tax', 'State Tax',
    'UT/SGST', 'UTGST', 'SGST/UTGST', 'SGST Payable',
  ],
  igst: ['ADD IGST', 'IGST Amount', 'IGST', 'I.Gst', 'Integrated Tax'],
  cess: ['CESS', 'Cess Amount', 'Compensation Cess'],
  tcs: ['TCS', 'Tcs', 'T.C.S.'],
  roundOff: [
    'Round Off', 'Rounded Off', 'ROUNDED UP', 'Rounding', 'R/Off', 'Round off',
    'Less Round Off', 'ed off',
  ],
  /** THIS invoice's payable amount. */
  grandTotal: [
    'GRAND TOTAL', 'Grand Total', 'Net Amount Rs.', 'Net Amount', 'Bill Amount',
    'Amount Payable', 'Invoice Total', 'Total Invoice Value', 'Total Amount', 'Net Payable',
    'Total Payable', 'Net Total', 'Total Bill Amount',
  ],
  /**
   * Running ledger balances. These must NEVER be read as grandTotal — on the
   * BHAGAVAT sample "Total Amount Due" is 21,08,663 against an 8,319 invoice.
   */
  ledgerBalance: [
    'Total Amount Due', 'Amount Due', 'Closing Balance', 'Previous Balance', 'Opening Balance',
    'Outstanding', 'Total Outstanding', 'Balance Due', 'Running Balance', 'Total Due',
    'Old Balance', 'Previous Dues', 'Account Balance',
  ],
  amountInWords: [
    'Amount Chargeable (in words)', 'Total Invoive Value In Words', 'Total Invoice Value In Words',
    'Amount in Words', 'Rupees in Words', 'In Words', 'Amount Chargeable', 'Rupees',
  ],
  totalQuantity: ['Total Qty', 'Total Quantity', 'Total'],
  freight: ['Freight', 'Freight Charges', 'Transportation Charges', 'Transport Charges'],
  packing: ['Packing', 'Packing Charges', 'Packing & Forwarding', 'P&F'],
  insurance: ['Insurance', 'Insurance Charges'],
  loadingUnloading: [
    'Loading', 'Unloading', 'Loading & Unloading', 'Loading Unloading Charges',
    'Labour Charges', 'Hamali',
  ],
  otherCharges: ['Other Charges', 'Misc Charges', 'Additional Charges'],
} as const;

/** Labels whose presence marks a value as a ledger balance rather than a total. */
export const LEDGER_BALANCE_KEYS = TOTAL_LABELS.ledgerBalance;

// ---------------------------------------------------------------------------
// Line-item table columns
// ---------------------------------------------------------------------------

export type LineColumn =
  | 'sr'
  | 'itemCode'
  | 'brand'
  | 'description'
  | 'hsn'
  | 'quantity'
  | 'unit'
  | 'listRate'
  | 'rate'
  | 'discountPercent'
  | 'discountAmount'
  | 'amount'
  | 'taxableValue'
  | 'combinedTaxRate'
  | 'cgstRate'
  | 'cgstAmount'
  | 'sgstRate'
  | 'sgstAmount'
  | 'igstRate'
  | 'igstAmount'
  | 'cessRate'
  | 'cessAmount'
  | 'lineTotal';

/**
 * Column header vocabularies. Longer/more specific spellings first so that
 * "Taxable Amount Rs." is not swallowed by "Amount".
 */
export const COLUMN_ALIASES: Array<{ column: LineColumn; aliases: string[] }> = [
  { column: 'sr', aliases: ['Sr No', 'Sr.', 'Sr', 'S.No', 'SNo', 'No.', 'No', '#', 'Sl No', 'Serial'] },
  { column: 'itemCode', aliases: ['Item Code', 'Product Code', 'Code', 'Material Code', 'SKU', 'Art No', 'Item No'] },
  { column: 'brand', aliases: ['Item Company', 'Company', 'Brand', 'Make', 'Manufacturer'] },
  {
    column: 'description',
    aliases: [
      'Description of Goods', 'Description of Good', 'Particulars of Goods', 'Description',
      'Particulars', 'Item Name', 'Item Description', 'Goods Description', 'Item', 'Product',
      'Material Description', 'Nature of Service',
    ],
  },
  { column: 'hsn', aliases: ['HSN CODE', 'HSN/SAC', 'Hsn/Sac', 'HSN Code', 'HSN', 'SAC', 'HSN No', 'HSNSAC'] },
  {
    column: 'quantity',
    aliases: ['Qty.', 'Qty', 'Quantity', 'Qnty', 'Qty Shipped', 'Delivered Qty', 'Billed Qty'],
  },
  { column: 'unit', aliases: ['Unit', 'UOM', 'U.O.M', 'Units', 'Per', 'Uom'] },
  {
    column: 'listRate',
    aliases: ['Net Rate', 'List Rate', 'MRP', 'M.R.P.', 'Gross Rate', 'Basic Rate', 'Std Rate'],
  },
  { column: 'rate', aliases: ['Rate / Item', 'Rate/Item', 'Rate Rs.', 'Rate', 'Price', 'Unit Rate', 'Unit Price'] },
  {
    column: 'discountPercent',
    aliases: ['Disc %', 'Disc (%)', 'Discount %', 'Disc%', 'Discount(%)', 'Discount Percent', 'Disc. %', 'Discount'],
  },
  { column: 'discountAmount', aliases: ['Disc. Amt', 'Discount Amount', 'Disc Amt', 'Disc.', 'Less Discount'] },
  {
    column: 'taxableValue',
    aliases: ['Taxable Amount Rs.', 'Taxable Amount', 'Taxable Value', 'Taxable Val', 'Net Value', 'Assessable Value'],
  },
  { column: 'amount', aliases: ['Amount Rs.', 'Amount', 'Value', 'Total Amount', 'Gross Amount', 'Amt'] },
  { column: 'combinedTaxRate', aliases: ['Tax %', 'Tax(%)', 'Tax', 'GST %', 'GST Rate', 'GST'] },
  { column: 'cgstRate', aliases: ['CGST %', 'C.Gst %', 'CGST Rate'] },
  { column: 'cgstAmount', aliases: ['CGST Amount', 'CGST Amt', 'C.Gst'] },
  { column: 'sgstRate', aliases: ['SGST %', 'S.Gst %', 'SGST Rate', 'UT/SGST %'] },
  { column: 'sgstAmount', aliases: ['SGST Amount', 'SGST Amt', 'S.Gst', 'UT/SGST'] },
  { column: 'igstRate', aliases: ['IGST %', 'IGST Rate'] },
  { column: 'igstAmount', aliases: ['IGST Amount', 'IGST Amt', 'IGST'] },
  { column: 'cessRate', aliases: ['Cess %', 'CESS %'] },
  { column: 'cessAmount', aliases: ['Cess Amount', 'CESS'] },
  { column: 'lineTotal', aliases: ['Line Total', 'Total Rs.', 'Net Amount', 'Total'] },
];

/** Columns whose cells must parse as numbers. Drives targeted numeric re-OCR. */
export const NUMERIC_COLUMNS = new Set<LineColumn>([
  'quantity', 'listRate', 'rate', 'discountPercent', 'discountAmount', 'amount',
  'taxableValue', 'combinedTaxRate', 'cgstRate', 'cgstAmount', 'sgstRate', 'sgstAmount',
  'igstRate', 'igstAmount', 'cessRate', 'cessAmount', 'lineTotal',
]);

// ---------------------------------------------------------------------------
// HSN summary table
// ---------------------------------------------------------------------------

export const HSN_SUMMARY_HEADERS = ['HSN/SAC', 'HSN CODE', 'Hsn / Sac', 'Hsn/Sac', 'HSN', 'Tax.Value'];

// ---------------------------------------------------------------------------
// Banking / payment
// ---------------------------------------------------------------------------

export const BANK_LABELS = {
  block: [
    'Bank Details for RTGS / NEFT', 'Bank Details', 'Bank Detail', 'Bank Particulars',
    'Our Bank Details', 'Payment Details', 'Bank', 'Beneficiary Details',
  ],
  bankName: ['Bank Name', 'Bank', 'Name of Bank'],
  accountNumber: ['Account #', 'A/c No.', 'A/c No', 'Account No', 'Account Number', 'Current A/c', 'A/C'],
  ifsc: ['IFSC Code', 'IFSC', 'Rtgs/Neft/Ifsc', 'RTGS/NEFT/IFSC', 'IFS Code', 'NEFT/IFSC'],
  branch: ['Branch', 'Branch Name'],
  upi: ['UPI', 'Pay using UPI', 'UPI ID', 'VPA'],
} as const;

export const TERMS_LABELS = [
  'TERMS & CONDITIONS', 'Terms & Conditions', 'Terms Of Sale', 'Terms of Sale',
  'Terms and Conditions', 'Conditions of Sale', 'Declaration',
];

// ---------------------------------------------------------------------------
// Noise — never treat these as field values
// ---------------------------------------------------------------------------

/**
 * Religious invocations, scanner banners, watermarks and boilerplate that sit
 * where a field value might otherwise be looked for.
 */
export const NOISE_PATTERNS: RegExp[] = [
  /scanned\s+with/i,
  /oken\s*scanner/i,
  /shree\s+ganeshay\s+namah/i,
  /shri\s+\w+\s+swami/i,
  /jay\s+shree\s+\w+/i,
  /\|\|\s*\*+.*\*+\s*\|\|/,
  /^\s*e\s*\.?\s*&\s*\.?\s*o\s*\.?\s*e\s*\.?\s*$/i,
  /subject\s+to\s+\w+\s+jurisdiction/i,
  /this\s+is\s+a\s+(?:digitally|computer)\s+(?:signed|generated)/i,
  /page\s*\d+\s*\/\s*\d+/i,
  /authoris?zed?\s+signatory/i,
  /^\s*for\s*,?\s*$/i,
];

export function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return NOISE_PATTERNS.some((re) => re.test(t));
}

/** Tokens that indicate a party block header rather than a party name. */
export const PARTY_BLOCK_NOISE = /^(?:m\/s\.?|messrs\.?|to,?|customer|buyer|party|billed\s*to|ship\s*to|consignee|details?)$/i;
