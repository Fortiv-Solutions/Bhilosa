/**
 * Arithmetic reconciliation and constrained repair.
 *
 * This is where deterministic extraction earns its accuracy. A GST invoice is
 * heavily redundant — quantity x rate reproduces the line amount, the lines sum
 * to the taxable value, the taxable value times the rate gives each tax, the
 * parts sum to the grand total, and the amount in words repeats the total in a
 * completely different encoding. Any single OCR digit error breaks at least one
 * of those identities.
 *
 * So the same redundancy that detects an error can also FIX it: when an identity
 * fails, plausible OCR misreadings of the suspect value are enumerated and the
 * one that satisfies the identity is adopted. A repair is only accepted when it
 * is unique, which is what stops the search from inventing a number that merely
 * happens to fit.
 *
 * TOLERANCES ARE MANDATORY, not defensive. Vendors legitimately print figures
 * that do not reconcile to the paisa:
 *   - ARCHIT's rate is truly 258.475 but prints as 258.48, so qty x rate misses
 *     the line amount by Rs 0.75.
 *   - AJIT's HSN summary sums CGST to 42062.91 while its totals block says
 *     42062.92, because rounding each row differs from rounding the sum.
 * Hard equality would reject both of these correct extractions.
 */

import {
  applyDiscountCascade, approxEqual, digitString, numericCandidates, round2,
  wordsToNumberIndian,
} from './numbers';
import type {
  ExtractedInvoice, ExtractionWarning, InvoiceLineItem, ValidationReport,
} from './types';

/** Absolute rupee slack allowed on a single line's arithmetic. */
const LINE_TOLERANCE = 1.0;
/** Absolute rupee slack on tax computations. */
const TAX_TOLERANCE = 1.0;
/** Absolute rupee slack on the grand total. */
const TOTAL_TOLERANCE = 1.0;
/**
 * Slack when comparing the HSN summary against the line/total figures. Wider
 * than the others because sum-of-rounded-rows genuinely differs from
 * rounded-sum on real invoices (see the AJIT case in the file header).
 */
const SUMMARY_TOLERANCE = 2.0;

export interface ReconcileResult {
  invoice: ExtractedInvoice;
  report: ValidationReport;
}

interface Repair {
  field: string;
  from: number | null;
  to: number;
  reason: string;
}

/**
 * Expected taxable value for a line from its own inputs.
 * Discounts cascade multiplicatively and are never summed.
 */
function expectedLineTaxable(item: InvoiceLineItem): number | null {
  if (item.quantity === null || item.unitRate === null) return null;
  return applyDiscountCascade(item.quantity * item.unitRate, item.discountPercents);
}

/**
 * Try to repair one numeric field so a predicate holds.
 *
 * Candidates come from the OCR confusion sets (0/8, 1/7, 5/6, ...) at edit
 * distance 1 then 2. A repair is adopted only when exactly one candidate
 * satisfies the predicate — an ambiguous fix is left alone and reported instead,
 * because guessing between two arithmetically valid readings would be worse than
 * flagging the field for review.
 */
function repairNumber(
  value: number | null,
  satisfies: (candidate: number) => boolean,
): { value: number; unique: boolean } | null {
  if (value === null) return null;
  const digits = digitString(String(value));
  if (!digits) return null;
  const matches: number[] = [];
  for (const cand of numericCandidates(value, digits)) {
    if (satisfies(cand)) {
      matches.push(cand);
      if (matches.length > 1) break;
    }
  }
  if (!matches.length) return null;
  return { value: matches[0], unique: matches.length === 1 };
}

/**
 * Reconcile an extracted invoice, repairing what can be repaired unambiguously
 * and reporting the rest. Mutates `invoice` in place and returns its report.
 */
export function reconcile(invoice: ExtractedInvoice): ValidationReport {
  const warnings: ExtractionWarning[] = [...invoice.validation.warnings];
  const repairs: Repair[] = [];
  const fieldConfidence: Record<string, number> = { ...invoice.validation.fieldConfidence };

  const warn = (w: ExtractionWarning) => warnings.push(w);

  // -------------------------------------------------------------------------
  // 1. Per-line arithmetic
  // -------------------------------------------------------------------------
  let lineMathOk = true;

  invoice.lineItems.forEach((item, i) => {
    const path = `lineItems.${i}`;
    const expected = expectedLineTaxable(item);
    if (expected === null || item.taxableValue === null) return;

    if (approxEqual(item.taxableValue, expected, LINE_TOLERANCE)) return;

    // Try repairing the taxable value first: it is a single derived figure.
    const fixTaxable = repairNumber(item.taxableValue, (c) => approxEqual(c, expected, LINE_TOLERANCE));
    if (fixTaxable?.unique) {
      repairs.push({
        field: `${path}.taxableValue`,
        from: item.taxableValue,
        to: fixTaxable.value,
        reason: `quantity x rate less discount = ${round2(expected)}`,
      });
      item.taxableValue = fixTaxable.value;
      return;
    }

    // Otherwise try the rate, then the quantity — whichever makes it consistent.
    const fixRate = repairNumber(item.unitRate, (c) => {
      const t = applyDiscountCascade((item.quantity as number) * c, item.discountPercents);
      return approxEqual(item.taxableValue as number, t, LINE_TOLERANCE);
    });
    if (fixRate?.unique) {
      repairs.push({
        field: `${path}.unitRate`,
        from: item.unitRate,
        to: fixRate.value,
        reason: `reconciles printed amount ${item.taxableValue}`,
      });
      item.unitRate = fixRate.value;
      return;
    }

    const fixQty = repairNumber(item.quantity, (c) => {
      const t = applyDiscountCascade(c * (item.unitRate as number), item.discountPercents);
      return approxEqual(item.taxableValue as number, t, LINE_TOLERANCE);
    });
    if (fixQty?.unique) {
      repairs.push({
        field: `${path}.quantity`,
        from: item.quantity,
        to: fixQty.value,
        reason: `reconciles printed amount ${item.taxableValue}`,
      });
      item.quantity = fixQty.value;
      return;
    }

    /**
     * Nothing repaired cleanly. A displayed rate rounded to 2dp cannot always
     * reproduce the amount (ARCHIT: 150 x 258.48 = 38,772.00 vs a printed
     * 38,771.25), so if the implied rate is consistent to within a paisa the
     * printed amount is authoritative and the rate is simply displayed rounded.
     */
    if (item.quantity && item.quantity > 0) {
      const impliedRate = item.taxableValue / item.quantity;
      const undiscounted = item.discountPercents.length === 0;
      if (undiscounted && item.unitRate !== null && Math.abs(impliedRate - item.unitRate) <= 0.01) {
        fieldConfidence[`${path}.unitRate`] = 0.9;
        return;
      }

      /**
       * A discount was applied but its cell could not be read — common when a
       * cascade like "65.00 + 15.25" straddles a column boundary and only part
       * survives. The effective discount is recoverable from the figures that DID
       * read: gross minus printed taxable. Recording it as a single derived
       * percentage keeps the line self-consistent (and is arithmetically identical
       * for the amount) instead of raising a mismatch on values that are correct.
       */
      if (undiscounted && item.unitRate !== null && item.unitRate > 0) {
        const gross = item.quantity * item.unitRate;
        if (gross > item.taxableValue && item.taxableValue > 0) {
          const effective = round2((1 - item.taxableValue / gross) * 100);
          if (effective > 0 && effective < 100) {
            item.discountPercents = [effective];
            repairs.push({
              field: `${path}.discountPercents`,
              from: null,
              to: effective,
              reason: `derived from ${gross} gross vs ${item.taxableValue} printed taxable`,
            });
            fieldConfidence[`${path}.discountPercents`] = 0.6;
            return;
          }
        }
      }
    }

    lineMathOk = false;
    warn({
      code: 'line_math_mismatch',
      field: `${path}.taxableValue`,
      severity: 'warn',
      message:
        `Line ${item.sr}: ${item.quantity} x ${item.unitRate}` +
        (item.discountPercents.length ? ` less ${item.discountPercents.join('% + ')}%` : '') +
        ` = ${round2(expected)}, but the invoice shows ${item.taxableValue}. Please verify.`,
    });
    fieldConfidence[`${path}.taxableValue`] = 0.4;
  });

  // -------------------------------------------------------------------------
  // 2. Line sum vs stated taxable total
  // -------------------------------------------------------------------------
  const lineSum = invoice.lineItems.reduce(
    (s, it) => (it.taxableValue === null ? s : s + it.taxableValue),
    0,
  );
  const hasLineValues = invoice.lineItems.some((it) => it.taxableValue !== null);
  const totals = invoice.totals;

  if (hasLineValues && totals.taxableAmount !== null) {
    if (!approxEqual(lineSum, totals.taxableAmount, LINE_TOLERANCE)) {
      const fix = repairNumber(totals.taxableAmount, (c) => approxEqual(lineSum, c, LINE_TOLERANCE));
      if (fix?.unique) {
        repairs.push({
          field: 'totals.taxableAmount',
          from: totals.taxableAmount,
          to: fix.value,
          reason: `line items sum to ${round2(lineSum)}`,
        });
        totals.taxableAmount = fix.value;
      } else {
        warn({
          code: 'taxable_sum_mismatch',
          field: 'totals.taxableAmount',
          severity: 'warn',
          message: `Line items sum to ${round2(lineSum)} but the invoice states a taxable value of ${totals.taxableAmount}.`,
        });
        fieldConfidence['totals.taxableAmount'] = 0.5;
      }
    }
  } else if (hasLineValues && totals.taxableAmount === null) {
    totals.taxableAmount = round2(lineSum);
  }

  // -------------------------------------------------------------------------
  // 3. Tax amounts
  // -------------------------------------------------------------------------
  let taxMathOk = true;
  const base = totals.taxableAmount;

  /** Effective rate for a tax head, from totals or from the line items. */
  const rateFor = (head: 'cgst' | 'sgst' | 'igst'): number | null => {
    const perLine = invoice.lineItems
      .map((it) => (head === 'cgst' ? it.cgstRate : head === 'sgst' ? it.sgstRate : it.igstRate))
      .filter((r): r is number => r !== null && r > 0);
    if (perLine.length) return perLine[0];
    // A combined slab (BHAGAVAT prints "18%") splits evenly for intra-state.
    const combined = invoice.lineItems.map((it) => it.combinedTaxRate).filter((r): r is number => r !== null && r > 0);
    if (combined.length && head !== 'igst') return combined[0] / 2;
    if (combined.length && head === 'igst') return null;
    return null;
  };

  for (const head of ['cgst', 'sgst', 'igst'] as const) {
    const amountKey = `${head}Amount` as 'cgstAmount' | 'sgstAmount' | 'igstAmount';
    const stated = totals[amountKey];
    const rate = rateFor(head);
    if (base === null || rate === null || stated === null) continue;
    const expected = round2((base * rate) / 100);
    if (approxEqual(stated, expected, TAX_TOLERANCE)) continue;

    const fix = repairNumber(stated, (c) => approxEqual(c, expected, TAX_TOLERANCE));
    if (fix?.unique) {
      repairs.push({
        field: `totals.${amountKey}`,
        from: stated,
        to: fix.value,
        reason: `${rate}% of ${base} = ${expected}`,
      });
      totals[amountKey] = fix.value;
      continue;
    }
    taxMathOk = false;
    warn({
      code: 'tax_math_mismatch',
      field: `totals.${amountKey}`,
      severity: 'warn',
      message: `${head.toUpperCase()} of ${stated} does not match ${rate}% of ${base} (${expected}).`,
    });
    fieldConfidence[`totals.${amountKey}`] = 0.5;
  }

  // Fill a missing tax head that the invoice clearly implies.
  for (const head of ['cgst', 'sgst'] as const) {
    const amountKey = `${head}Amount` as 'cgstAmount' | 'sgstAmount';
    if (totals[amountKey] !== null || base === null) continue;
    const rate = rateFor(head);
    if (rate === null) continue;
    totals[amountKey] = round2((base * rate) / 100);
    fieldConfidence[`totals.${amountKey}`] = 0.7;
  }

  // -------------------------------------------------------------------------
  // 4. Grand total
  // -------------------------------------------------------------------------
  const componentSum = (() => {
    if (base === null) return null;
    return (
      base +
      (totals.cgstAmount ?? 0) + (totals.sgstAmount ?? 0) + (totals.igstAmount ?? 0) +
      (totals.cessAmount ?? 0) + (totals.tcsAmount ?? 0) + (totals.freight ?? 0) +
      (totals.packing ?? 0) + (totals.insurance ?? 0) + (totals.loadingUnloading ?? 0) +
      (totals.otherCharges ?? 0) + (totals.roundOff ?? 0)
    );
  })();

  const wordsValue = wordsToNumberIndian(totals.amountInWords);
  let grandTotalOk = true;

  if (totals.grandTotal !== null && componentSum !== null) {
    if (!approxEqual(totals.grandTotal, componentSum, TOTAL_TOLERANCE)) {
      /**
       * Before treating this as an error, consider an unread round-off. Vendors
       * print a signed rounding line (AJIT +0.42, ARCHIT -0.07) whose label is
       * often clipped; a residual under a rupee is that, not an OCR fault.
       */
      const residual = round2(totals.grandTotal - componentSum);
      if (Math.abs(residual) < 1 && totals.roundOff === null) {
        totals.roundOff = residual;
        fieldConfidence['totals.roundOff'] = 0.75;
      } else {
        const fix = repairNumber(totals.grandTotal, (c) => approxEqual(c, componentSum, TOTAL_TOLERANCE));
        if (fix?.unique) {
          repairs.push({
            field: 'totals.grandTotal',
            from: totals.grandTotal,
            to: fix.value,
            reason: `components sum to ${round2(componentSum)}`,
          });
          totals.grandTotal = fix.value;
        } else {
          grandTotalOk = false;
          warn({
            code: 'grand_total_mismatch',
            field: 'totals.grandTotal',
            severity: 'warn',
            message: `Grand total ${totals.grandTotal} does not match taxable + taxes + charges (${round2(componentSum)}). Difference ${residual}.`,
          });
          fieldConfidence['totals.grandTotal'] = 0.45;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Amount in words — an independent encoding of the total
  // -------------------------------------------------------------------------
  let amountInWordsMatches: boolean | null = null;
  if (wordsValue !== null && totals.grandTotal !== null) {
    // Words carry whole rupees only, so compare against the rounded total.
    amountInWordsMatches = Math.abs(Math.round(totals.grandTotal) - wordsValue) <= 1;
    if (!amountInWordsMatches) {
      const fix = repairNumber(totals.grandTotal, (c) => Math.abs(Math.round(c) - wordsValue) <= 1);
      if (fix?.unique) {
        repairs.push({
          field: 'totals.grandTotal',
          from: totals.grandTotal,
          to: fix.value,
          reason: `amount in words reads ${wordsValue}`,
        });
        totals.grandTotal = fix.value;
        amountInWordsMatches = true;
      } else {
        warn({
          code: 'amount_in_words_mismatch',
          field: 'totals.amountInWords',
          severity: 'warn',
          message: `The amount in words reads ${wordsValue} but the numeric total is ${totals.grandTotal}.`,
        });
      }
    }
  } else if (wordsValue !== null && totals.grandTotal === null) {
    totals.grandTotal = wordsValue;
    fieldConfidence['totals.grandTotal'] = 0.7;
  }

  // -------------------------------------------------------------------------
  // 6. HSN summary cross-check (advisory only)
  // -------------------------------------------------------------------------
  let hsnSummaryMatchesLines = true;
  const summaryRows = invoice.hsnSummary.filter((r) => r.hsnSac && r.taxableValue !== null);
  if (summaryRows.length && totals.taxableAmount !== null) {
    const summarySum = summaryRows.reduce((s, r) => s + (r.taxableValue ?? 0), 0);
    if (!approxEqual(summarySum, totals.taxableAmount, SUMMARY_TOLERANCE)) {
      hsnSummaryMatchesLines = false;
      // Advisory: the summary block is the least reliable region to OCR and the
      // line items already carry per-HSN taxable values.
      warn({
        code: 'hsn_summary_mismatch',
        field: 'hsnSummary',
        severity: 'info',
        message: `The HSN summary's taxable values sum to ${round2(summarySum)} against a stated ${totals.taxableAmount}. The line items were used instead.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 7. Intra/inter-state consistency
  // -------------------------------------------------------------------------
  const vendorState = invoice.vendor.gstin?.slice(0, 2) ?? null;
  const buyerState = invoice.buyer.gstin?.slice(0, 2) ?? null;
  if (vendorState && buyerState) {
    const intra = vendorState === buyerState;
    const hasIgst = (totals.igstAmount ?? 0) > 0;
    const hasCgstSgst = (totals.cgstAmount ?? 0) > 0 || (totals.sgstAmount ?? 0) > 0;
    if (intra && hasIgst) {
      warn({
        code: 'tax_type_unexpected',
        field: 'totals.igstAmount',
        severity: 'warn',
        message: `Both parties are in state ${vendorState}, so CGST + SGST is expected, but IGST was found.`,
      });
    }
    if (!intra && hasCgstSgst && !hasIgst) {
      warn({
        code: 'tax_type_unexpected',
        field: 'totals.cgstAmount',
        severity: 'warn',
        message: `Vendor state ${vendorState} differs from buyer state ${buyerState}, so IGST is expected, but CGST + SGST was found.`,
      });
    }
  }

  // Place of supply vs buyer state.
  if (invoice.document.placeOfSupply && buyerState) {
    const posCode = invoice.document.placeOfSupply.match(/\b(\d{2})\b/)?.[1];
    if (posCode && posCode !== buyerState) {
      warn({
        code: 'place_of_supply_mismatch',
        field: 'document.placeOfSupply',
        severity: 'info',
        message: `Place of supply ${invoice.document.placeOfSupply} does not match the buyer's GSTIN state code ${buyerState}.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 8. Required-field presence
  // -------------------------------------------------------------------------
  const required: Array<[string, unknown, string]> = [
    ['document.invoiceNumber', invoice.document.invoiceNumber, 'Invoice number'],
    ['document.invoiceDate', invoice.document.invoiceDate, 'Invoice date'],
    ['vendor.name', invoice.vendor.name, 'Vendor name'],
    ['totals.grandTotal', invoice.totals.grandTotal, 'Invoice total'],
  ];
  for (const [field, value, label] of required) {
    if (value === null || value === undefined || value === '') {
      warn({
        code: 'required_field_missing',
        field,
        severity: 'error',
        message: `${label} could not be read from this invoice and must be entered manually.`,
      });
      fieldConfidence[field] = 0;
    }
  }
  if (!invoice.lineItems.length) {
    warn({
      code: 'no_line_items',
      field: 'lineItems',
      severity: 'error',
      message: 'No line items could be read from this invoice. Enter the received items manually.',
    });
  }

  /**
   * Flag a read that is untrustworthy because the SOURCE was too low-resolution,
   * as opposed to a layout the extractor mishandled.
   *
   * There is a hard floor below which no OCR can recover 8pt invoice print. A full
   * A4 page photographed or downscaled to ~1200px is roughly 100 dpi, and at that
   * point Tesseract still returns confident-looking words with wrong characters —
   * measured on a synthetic test, "2026" read as "2028" and "GJ05CV4633" as
   * "GA05CV4544". Silently accepting those is worse than reporting them, because a
   * wrong date or vehicle number looks perfectly plausible in the form.
   */
  const missingRequired = required.filter(([, v]) => v === null || v === undefined || v === '').length;
  /**
   * Raised on mean character confidence ALONE, not only when fields are missing.
   * A degraded image does not usually leave blanks — it returns confident-looking
   * wrong digits, so the fields all appear populated. Measured on a 1200px photo:
   * every required field was present and every one contained an error, and gating
   * the warning on missing fields let that pass silently.
   */
  if (invoice.meta.ocrMeanConfidence < 80) {
    warn({
      code: 'low_source_quality',
      severity: missingRequired > 0 || !lineMathOk ? 'error' : 'warn',
      message:
        `The image quality is too low for reliable reading (average character confidence ` +
        `${invoice.meta.ocrMeanConfidence.toFixed(0)}%). Values that were extracted may contain wrong digits. ` +
        'For a photograph: lay the invoice flat, fill the frame with it, avoid shadow, and let the camera focus — ' +
        'a full A4 page needs at least about 2000 pixels across. A PDF or a flatbed scan is always better.',
    });
  }

  // -------------------------------------------------------------------------
  // 9. Confidence roll-up
  // -------------------------------------------------------------------------
  const gstinValid = {
    vendor: invoice.vendor.gstin ? true : null,
    buyer: invoice.buyer.gstin ? true : null,
  };

  const checksPassed = [lineMathOk, taxMathOk, grandTotalOk, amountInWordsMatches !== false];
  const passRate = checksPassed.filter(Boolean).length / checksPassed.length;
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warnCount = warnings.filter((w) => w.severity === 'warn').length;

  const ocrComponent = Math.min(1, Math.max(0, invoice.meta.ocrMeanConfidence / 100));
  let overall = ocrComponent * 0.35 + passRate * 0.65;
  overall -= errorCount * 0.2 + warnCount * 0.05;
  overall = Math.max(0, Math.min(1, overall));

  for (const [field, , label] of required) {
    if (fieldConfidence[field] === undefined) {
      fieldConfidence[field] = Math.max(0.5, overall);
      void label;
    }
  }

  if (repairs.length) {
    warn({
      code: 'values_repaired',
      severity: 'info',
      message:
        `${repairs.length} value(s) were corrected using the invoice's own arithmetic: ` +
        repairs.map((r) => `${r.field} ${r.from} -> ${r.to} (${r.reason})`).join('; '),
    });
  }

  const report: ValidationReport = {
    lineMathOk,
    taxMathOk,
    grandTotalOk,
    hsnSummaryMatchesLines,
    amountInWordsMatches,
    gstinValid,
    warnings,
    fieldConfidence,
    overallConfidence: Math.round(overall * 100) / 100,
    repairedFields: repairs.map((r) => r.field),
  };
  invoice.validation = report;
  return report;
}
