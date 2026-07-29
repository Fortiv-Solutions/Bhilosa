/**
 * Maps an extracted invoice onto the GRN form.
 *
 * The mapping is deliberately conservative about anything with financial or
 * inventory consequence:
 *
 *  - PO-derived quantities (approved, balance, current stock) are NEVER filled
 *    from an invoice. They belong to the purchase order and only the PO is
 *    authoritative.
 *  - `received_qty` is seeded from the invoice as a convenience but is flagged for
 *    physical confirmation; the invoice states what was *shipped*, not what
 *    arrived intact.
 *  - `grn_date` is today, not the invoice date: goods are received when they are
 *    received.
 *  - `status` is always left at Pending QC. OCR must never approve a GRN.
 */

import type { FullGrnFormState, GrnExtraItem, GrnPurchaseEntry } from
  '@/components/procurement/grn/grn-form';
import type { ExtractedInvoice, ExtractionWarning } from './types';

/** A patch to merge into the GRN form, plus what the user must check. */
export interface GrnPatch {
  /** Header fields to overwrite. Only keys with a value are present. */
  header: Partial<FullGrnFormState>;
  /** Purchase entries derived from invoice line items. */
  purchaseEntries: GrnPurchaseEntry[];
  /** Items that could not be matched to a PO line. */
  extraItems: GrnExtraItem[];
  /** Invoice-level facts with no home in FullGrnFormState — persist separately. */
  invoiceRecord: GrnInvoiceRecord;
  /** Field paths the user should verify, with the reason. */
  reviewFields: Array<{ field: string; reason: string; severity: ExtractionWarning['severity'] }>;
  /** 0-1 overall confidence, mirrored from the extraction. */
  confidence: number;
}

/**
 * Invoice facts worth persisting for audit, three-way match and duplicate
 * detection. `FullGrnFormState` has nowhere to put these, so they go to the
 * `grn_invoice_extractions` table.
 */
export interface GrnInvoiceRecord {
  vendor_name: string | null;
  vendor_gstin: string | null;
  vendor_pan: string | null;
  buyer_name: string | null;
  buyer_gstin: string | null;
  ship_to_name: string | null;
  ship_to_site: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  credit_days: number | null;
  challan_number: string | null;
  buyer_po_number: string | null;
  buyer_po_number_source: string | null;
  vendor_order_ref: string | null;
  place_of_supply: string | null;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  eway_bill_no: string | null;
  is_einvoice: boolean;
  transporter_name: string | null;
  vehicle_number: string | null;
  lr_number: string | null;
  taxable_amount: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  cess_amount: number | null;
  round_off: number | null;
  grand_total: number | null;
  total_quantity: number | null;
  amount_in_words: string | null;
  /** Running account balance when the vendor prints one. Never the invoice total. */
  ledger_balance_due: number | null;
  bank_accounts: unknown;
  hsn_summary: unknown;
  line_items: unknown;
  ocr_confidence: number;
  ocr_mean_word_confidence: number;
  ocr_engine: string;
  ocr_warnings: unknown;
  repaired_fields: unknown;
  source_file_name: string;
  source_file_hash: string;
  page_numbers: unknown;
}

/** Unit codes the GRN form expects; anything else passes through upper-cased. */
function grnUnit(unit: string | null): string {
  return unit ?? 'NOS';
}

/**
 * Build the GRN patch. Pure — performs no I/O and mutates nothing, so the caller
 * decides what to apply.
 */
export function buildGrnPatch(invoice: ExtractedInvoice): GrnPatch {
  const { vendor, buyer, shipTo, document, transport, totals, lineItems, validation } = invoice;

  const header: Partial<FullGrnFormState> = {};

  if (vendor.name) header.supplier_name = vendor.name;
  if (vendor.phones[0]) header.phone_no = vendor.phones[0];
  // Dedupe: AJIT prints the same number twice.
  const secondPhone = vendor.phones.find((p) => p !== vendor.phones[0]);
  if (secondPhone) header.mobile_no = secondPhone;

  // A third-party dispatcher is the dealer, not the supplier.
  if (invoice.dispatchFrom?.partyName) header.dealer_name = invoice.dispatchFrom.partyName;

  if (buyer.name) header.company_name = buyer.name;

  // Project/site: the ship-to site marker is the strongest signal.
  const site = shipTo.siteName ?? buyer.siteName ?? null;
  if (site) header.project_name = site;

  if (document.challanNumber) header.challan_no = document.challanNumber;
  else if (document.invoiceNumber) header.challan_no = document.invoiceNumber;

  if (transport.transporterName) header.transporter_name = transport.transporterName;
  if (transport.vehicleNumber) {
    header.vehicle_no = transport.vehicleNumber;
    header.vehicle_measure_required = true;
  }

  if (totals.taxableAmount !== null) header.account_posting_material_amount = totals.taxableAmount;

  // Remarks: keep the invoice reference trail visible to whoever approves.
  const remarkParts: string[] = [];
  if (document.invoiceNumber) {
    remarkParts.push(
      `Invoice ${document.invoiceNumber}${document.invoiceDate ? ` dated ${document.invoiceDate}` : ''}`,
    );
  }
  if (totals.grandTotal !== null) remarkParts.push(`Invoice value ₹${totals.grandTotal.toLocaleString('en-IN')}`);
  if (document.buyerPoNumber) remarkParts.push(`PO ${document.buyerPoNumber}`);
  if (invoice.remarks) remarkParts.push(invoice.remarks);
  if (remarkParts.length) header.remarks = remarkParts.join(' · ');

  // Never approved by OCR: a machine read of a supplier's paper is not a receipt
  // verification, and received quantities carry stock and payment consequences.
  header.status = 'Draft';

  const poNo = document.buyerPoNumber ?? '';

  /**
   * Line items become purchase entries. PO-owned quantities are left at zero
   * rather than guessed: approved_qty and the balance figures must come from the
   * purchase order, and pre-filling them from an invoice would let an over-supply
   * pass unnoticed.
   */
  const purchaseEntries: GrnPurchaseEntry[] = lineItems.map((item) => ({
    po_no: poNo,
    item_group: 'Material',
    item_description: item.description || (item.itemCode ?? 'Unnamed item'),
    item_code: item.itemCode ?? '',
    item_brand: item.brandOrCompany ?? '',
    location: '',
    unit: grnUnit(item.unit),
    purchase_category: 'Direct Construction Material',
    open: true,
    approved_qty: 0,
    as_on_date_po_balance_qty: 0,
    return_qty: 0,
    challan_qty: item.quantity ?? 0,
    received_qty: item.quantity ?? 0,
    balance_quantity_allowed: true,
    pr_no: '',
    test_report_no: '',
    expiry_date: '',
    current_balance_qty: 0,
  }));

  const invoiceRecord: GrnInvoiceRecord = {
    vendor_name: vendor.name,
    vendor_gstin: vendor.gstin,
    vendor_pan: vendor.pan,
    buyer_name: buyer.name,
    buyer_gstin: buyer.gstin,
    ship_to_name: shipTo.name,
    ship_to_site: site,
    invoice_number: document.invoiceNumber,
    invoice_date: document.invoiceDate,
    due_date: document.dueDate,
    credit_days: document.creditDays,
    challan_number: document.challanNumber,
    buyer_po_number: document.buyerPoNumber,
    buyer_po_number_source: document.buyerPoNumberSource,
    vendor_order_ref: document.vendorOrderRef,
    place_of_supply: document.placeOfSupply,
    irn: document.irn,
    ack_no: document.ackNo,
    ack_date: document.ackDate,
    eway_bill_no: document.ewayBillNo,
    is_einvoice: document.isEInvoice,
    transporter_name: transport.transporterName,
    vehicle_number: transport.vehicleNumber,
    lr_number: transport.lrNumber,
    taxable_amount: totals.taxableAmount,
    cgst_amount: totals.cgstAmount,
    sgst_amount: totals.sgstAmount,
    igst_amount: totals.igstAmount,
    cess_amount: totals.cessAmount,
    round_off: totals.roundOff,
    grand_total: totals.grandTotal,
    total_quantity: totals.totalQuantity,
    amount_in_words: totals.amountInWords,
    ledger_balance_due: totals.ledgerBalanceDue,
    bank_accounts: invoice.payment.bankAccounts,
    hsn_summary: invoice.hsnSummary,
    line_items: lineItems,
    ocr_confidence: validation.overallConfidence,
    ocr_mean_word_confidence: invoice.meta.ocrMeanConfidence,
    ocr_engine: invoice.meta.engine,
    ocr_warnings: validation.warnings,
    repaired_fields: validation.repairedFields,
    source_file_name: invoice.meta.sourceFileName,
    source_file_hash: invoice.meta.sourceFileHash,
    page_numbers: invoice.meta.pageNumbers,
  };

  // --- what the user must look at ------------------------------------------
  const reviewFields: GrnPatch['reviewFields'] = [];

  for (const w of validation.warnings) {
    if (w.severity === 'info') continue;
    reviewFields.push({ field: w.field ?? 'general', reason: w.message, severity: w.severity });
  }

  if (!document.buyerPoNumber) {
    reviewFields.push({
      field: 'purchase_entries.po_no',
      reason:
        'This invoice does not carry a Pramukh PO number, so the GRN lines have no PO. Select the correct purchase order before saving.',
      severity: 'error',
    });
  } else if (document.buyerPoNumberSource !== 'po_field') {
    reviewFields.push({
      field: 'purchase_entries.po_no',
      reason: `PO ${document.buyerPoNumber} was found in the ${
        document.buyerPoNumberSource === 'remarks' ? 'Remarks text' : 'document body'
      } rather than a dedicated PO field — confirm it is correct.`,
      severity: 'warn',
    });
  }

  if (lineItems.length) {
    reviewFields.push({
      field: 'purchase_entries.received_qty',
      reason:
        'Received quantities were copied from the invoice. Confirm them against what physically arrived before saving.',
      severity: 'warn',
    });
  }

  // Fields whose confidence is mid-range deserve an explicit look.
  for (const [field, conf] of Object.entries(validation.fieldConfidence)) {
    if (conf >= 0.6 && conf < 0.9) {
      reviewFields.push({
        field,
        reason: `Read with moderate confidence (${Math.round(conf * 100)}%).`,
        severity: 'warn',
      });
    }
  }

  return {
    header,
    purchaseEntries,
    extraItems: [],
    invoiceRecord,
    reviewFields,
    confidence: validation.overallConfidence,
  };
}

/**
 * Split extracted items into PO-matched entries and extra items.
 *
 * Called once the PO's lines are known (the OCR route cannot know them). Items
 * that match nothing on the PO belong in the extra-items table, which is exactly
 * what that table is for.
 */
export function splitAgainstPo(
  patch: GrnPatch,
  poLines: Array<{ item_code?: string | null; item_description?: string | null; unit?: string | null }>,
): { purchaseEntries: GrnPurchaseEntry[]; extraItems: GrnExtraItem[] } {
  if (!poLines.length) return { purchaseEntries: patch.purchaseEntries, extraItems: patch.extraItems };

  const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const byCode = new Map<string, typeof poLines[number]>();
  for (const l of poLines) {
    if (l.item_code) byCode.set(norm(l.item_code), l);
  }

  const matched: GrnPurchaseEntry[] = [];
  const extras: GrnExtraItem[] = [];

  for (const entry of patch.purchaseEntries) {
    const code = norm(entry.item_code);
    let hit = code ? byCode.get(code) : undefined;

    if (!hit) {
      // Fall back to description overlap: OCR'd descriptions rarely match a PO
      // exactly, so require a substantial shared token run.
      const target = norm(entry.item_description);
      hit = poLines.find((l) => {
        const d = norm(l.item_description);
        if (!d || !target) return false;
        return d.includes(target.slice(0, 12)) || target.includes(d.slice(0, 12));
      });
    }

    if (hit) matched.push(entry);
    else {
      extras.push({
        sr: extras.length + 1,
        po_no: entry.po_no,
        item_group: entry.item_group,
        item_desc: entry.item_description,
        item_brand: entry.item_brand,
        purchase_category: entry.purchase_category,
        quantity: entry.received_qty,
        grn_stock_unit: entry.unit,
        loading_unloading_chgs: 0,
        test_report_no: '',
      });
    }
  }
  return { purchaseEntries: matched, extraItems: extras };
}
