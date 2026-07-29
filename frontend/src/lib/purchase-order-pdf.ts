import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PurchaseOrderRow } from './procurement';

/**
 * Sanitizes text strings for pdf-lib standard WinAnsi Helvetica encoding.
 * Replaces non-ASCII symbols like ₹ with INR and removes unencodable characters.
 */
function sanitizeWinAnsi(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/₹/g, 'INR ')
    .replace(/[^\x00-\x7F]/g, ' ')
    .trim();
}

/**
 * Converts a number to words (Indian Numbering Format helper).
 */
function numberToWords(num: number): string {
  if (!num || isNaN(num)) return 'Zero Only';
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
  };

  const integerPart = Math.floor(num);
  const words = inWords(integerPart).trim();
  return (words ? words : 'Zero') + ' Rupees Only';
}

const DEFAULT_17_TERMS_PDF_LINES = [
  'PO Terms 1:- This is a Contract for Pramukh Group and/or any its affiliates, subsidiaries and/or group companies. Vendor agrees that it shall at all times recognize the validity and ownership of Pramukh and/or any of its affiliates, subsidiaries and/or group companies, as the case may be, over the intellectual property rights and shall not at any time put in issue their validity or ownership.',
  '1. PRELIMINARY',
  '1.1 This is a Contract for execution of job/Supply as required and specified at the time of Enquiry. i.e.',
  '1.2 The Enquirer for the above mentioned supply is the company/ proprietary concern/individual.',
  '1.3 The terms and conditions mentioned hereunder are the terms and conditions of the Contract for the execution of the job mentioned under item 1.1 above.',
  '2. REFERENCE FOR DOCUMENTATION',
  'Purchase Order number must appear on order confirmation, correspondence, drawings, invoices, shipping notes, packings and on any documents or papers connected with the order.',
  '3. CONFIRMATION OF ORDER',
  'The Vendor shall acknowledge the receipt of the Purchase Order within ten days following the mailing of this order and shall thereby confirm his acceptance of this Purchase Order in its entirety without exceptions. The acknowledgment will bear on both purchase order and General Procurement Conditions.',
  '4. WEIGHTS AND MEASUREMENTS',
  'a. All weights and measurements recorded by the Organisation on receipt of goods at site will be treated as final.',
  'b. Vendor\'s shipping documents and invoices must contain the following data:',
  'i. Unit net weight',
  'ii. Unit gross weight (packing included)',
  'iii.Dimensions of packing.',
  '5. PACKING AND MARKING',
  'The Materials shall be suitably packed for safe transportation till receipt at site and should be commensurate with best possible practices of packing, unless specifically stipulated in the Technical specifications, to avoid any damage during transit.',
  '6. CONTROL REGULATIONS',
  'The supply, dispatch and delivery of goods shall be arranged by the Vendor in strict conformity with the statutory regulations including provision of Industries (Development and Regulation) Act1951 and any amendment thereof as applicable from time to time. The Organisation disowns any responsibility for any irregularity or contravention of any of the statutory regulations in manufacture or supply of the stores covered by this order.',
  '7. RESPECT FOR DELIVERY DATES.',
  'Time of delivery as mentioned in the Purchase Order shall be the essence of the contract and no variation shall be permitted except with prior authorization in writing from the Organisation. Goods should be delivered securely packed and in good order and condition at the place and within the time specified in the Purchase Order for their delivery.',
  '8. DELAYS DUE TO FORCE MAJEURE A) Any delay in or failure of the performance of either part hereto shall not constitute default hereunder or give rise to any claims for damage, if any, to the extent such delays or failure of performance is caused by occurrences such as Acts of God or an enemy, expropriation or confiscation of facilities by Government authorities, acts of war, rebellion, sabotage or fires, floods, explosions, riots, or strikes. The Contractor shall keep records of the circumstances referred to above and bring these to the notice of the Project-in Charge/Site-in-Charge in writing immediately on such occurrences. The amount of time, if any, lost on any of these counts shall not be counted for the Contract period. Once decision of the Owner arrived at after consultation with the Contractor, shall be final and binding. Such a determined period of time be extended by the Owner to enable the Contractor to complete the job within such extended period of time. B) If Contractor is prevented or delayed from the performing any of its obligations under this Agreement by Force Majeure, then Contractor shall notify Owner the circumstances constituting the Force Majeure and the obligations performance of which is thereby delayed or prevented, within seven days of the occurrence of the events.',
  '9. REJECTION, REMOVAL OF REJECTED GOODS AND REPLACEMENT A) In case the testing and inspection at any stage by Inspectors reveal the equipment, material and workmanship do not comply with specification and requirements, the same shall be removed by the Vendor at their / its own expense and risk within the time allowed by the Organisation. B) The Vendor will have to proceed with the replacement of that equipment or part of equipment without claiming any extra payment if so required by the Organisation. The time taken for replacement in such event will not be added to the contractual delivery period.',
  '10. TAXES & DUTIES: A) GST (CGST, SGST, IGST as applicable), Customs Duty and applicable Cess as applicable shall be reimbursed for the materials consigned to Organisation as per limits indicated in the offer against documentary evidence to be furnished by the Supplier. Organisation shall pay only those taxes, duties and levies as indicated by Supplier at the time of bid submission/as agreed subsequently.(prior to opening of priced bids). B) The Vendor shall comply with all the provisions of the GST Act / Rules / requirements like providing of tax invoices, payment of taxes to the authorities within the due dates, filing of returns within the due dates etc. to enable Pramukh Group to take Input Tax Credit.',
  '11. JURISDICTION The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.',
  '12. Payment will be released, subject to Tax - Invoice uploaded on GST portal before payment due date.',
  '13. Late Delivery Clause - Penalty would be charged from 1% - 10% per week OR as per management decision if delivery would be done after due date OR schedule date given by site.',
  '14. TAX DEDUCTION AT SOURCE TO BE MADE U/S. 194Q FROM THE PURCHASE OF GOODS FROM YOU: As you are aware that w.e.f 1ST July, 2021, the provisions of Section 194Q for withholding of Tax at 0.10% on the value of purchase of goods are applicable. In view of the same, we shall deduct the required TDS at 0.10% from the value of purchase of goods from you. We are the purchasers who satisfies the conditions laid down in Section 194Q and hence we are required to deduct TDS from the value of Purchases from you at the applicable rates. Since we are liable to deduct TDS U/S. 194Q, you being the seller of goods , are not required to make TCS U/S. 206C(1H) at 0.10%. Hence please do not charge any TCS on your purchase Invoice in response to this PO. The rate of Withholding of tax U/S. 194Q shall be subject to the amendments made from time to time.',
  'NOTE : Moreover, please confirm whether you have filed the Income Tax Returns for A.Y. 2019-2020 and A.Y. 2020-2021 along with the acceptance of this PO with copy of the acknowledgement / screen shot from the Income tax website. In the absence of such confirmation, we shall presume that you have not filed your Income tax returns for the required two years and therefore, the withholding of tax shall be made at higher rate of 5% from the value of purchase of goods from you which shall not be refunded nor adjusted in subsequent billing against this PO or any other PO. If you have already submitted the required details of the Income Tax Returns with us, please ignore this note.',
  '15. Guarantee/ Warranty: Under RERA act minimum 5 years from the date of possession for material or workmenship.',
  '16. Delivery Date: As per site Schedule and mentioned in PO.',
  '17. Price Basis - DAP at Site, Freight included.'
];

/**
 * Generates an official multi-page PDF document binary for a Purchase Order (PO).
 * Formatted to strictly match Default_Form_Report_-_PO.pdf layout in 2 pages (up to 3 pages max).
 */
export async function generatePurchaseOrderPdfBlob(po: Partial<PurchaseOrderRow>): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 dimensions
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  let pageCount = 1;

  const checkNewPage = (currentY: number, requiredSpace: number = 30) => {
    if (currentY < requiredSpace) {
      page = pdfDoc.addPage([595.28, 841.89]);
      pageCount++;
      return height - 35;
    }
    return currentY;
  };

  // Helper for drawing boxed key-value rows
  const drawKvRow = (
    yPos: number,
    h: number,
    label1: string,
    val1: string,
    label2?: string,
    val2?: string,
    isBoldVal1 = false,
    isBoldVal2 = false
  ) => {
    // Outer Border
    page.drawRectangle({
      x: 30,
      y: yPos - h,
      width: width - 60,
      height: h,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 0.5,
    });
    // Vertical Divider
    page.drawLine({
      start: { x: 300, y: yPos },
      end: { x: 300, y: yPos - h },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    // Col 1 Label & Val
    page.drawText(sanitizeWinAnsi(label1), {
      x: 34,
      y: yPos - h + (h > 20 ? h - 11 : 4),
      size: 7.5,
      font: fontHelveticaBold,
      color: rgb(0, 0, 0),
    });
    page.drawText(sanitizeWinAnsi(val1), {
      x: 145,
      y: yPos - h + (h > 20 ? h - 11 : 4),
      size: 7.5,
      font: isBoldVal1 ? fontHelveticaBold : fontHelvetica,
      color: rgb(0.15, 0.15, 0.15),
    });

    // Col 2 Label & Val
    if (label2) {
      page.drawText(sanitizeWinAnsi(label2), {
        x: 305,
        y: yPos - h + (h > 20 ? h - 11 : 4),
        size: 7.5,
        font: fontHelveticaBold,
        color: rgb(0, 0, 0),
      });
      if (val2) {
        page.drawText(sanitizeWinAnsi(val2), {
          x: 415,
          y: yPos - h + (h > 20 ? h - 11 : 4),
          size: 7.5,
          font: isBoldVal2 ? fontHelveticaBold : fontHelvetica,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
    }
  };

  // 1. TOP REPORT TITLE HEADER (Center Aligned)
  let y = height - 25;
  const companyTitle = (po as any).company_name || 'Pramukh Group Infrastructure Ltd.';
  const companyAddr = (po as any).project_address || po.delivery_location || (po as any).delivery_address || 'Pramukh Infrastructure Project Store, Vesu, Surat, Gujarat - 395007';

  page.drawText(sanitizeWinAnsi(companyTitle), {
    x: width / 2 - (fontHelveticaBold.widthOfTextAtSize(sanitizeWinAnsi(companyTitle), 11) / 2),
    y,
    size: 11,
    font: fontHelveticaBold,
    color: rgb(0, 0, 0),
  });
  y -= 11;

  page.drawText(sanitizeWinAnsi(companyAddr).slice(0, 110), {
    x: width / 2 - (fontHelvetica.widthOfTextAtSize(sanitizeWinAnsi(companyAddr).slice(0, 110), 6.5) / 2),
    y,
    size: 6.5,
    font: fontHelvetica,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;

  const docTitle = 'Purchase Order';
  page.drawText(docTitle, {
    x: width / 2 - (fontHelveticaBold.widthOfTextAtSize(docTitle, 12) / 2),
    y,
    size: 12,
    font: fontHelveticaBold,
    color: rgb(0, 0, 0),
  });
  y -= 12;

  const printedByStr = `Printed Date: ${po.po_date ? po.po_date.slice(0, 10) : new Date().toISOString().slice(0, 10)}`;
  page.drawText(printedByStr, {
    x: 30,
    y,
    size: 7.5,
    font: fontHelveticaBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 12;

  // 2. KEY-VALUE GRID TABLE (Mapped strictly from PO object)
  const poNo = po.po_number || '';
  const poDate = po.po_date ? `${po.po_date.slice(0, 10)} 00:00` : `${new Date().toISOString().slice(0, 10)} 00:00`;
  const companyName = (po as any).company_name || 'Pramukh Group Infrastructure Ltd.';
  const panNo = (po as any).pan_no || '';
  const projectName = (po as any).project_name || (po.project_id === 'central-park' ? 'Central Park' : '');
  const projectAddress = (po as any).project_address || po.delivery_location || (po as any).delivery_address || '';
  const siteContact = (po as any).site_contact || (po as any).site_contact_number || '';
  const vendorName = po.vendors?.display_name || po.vendors?.legal_name || (po as any).supplier_name || (po as any).po_in_the_name_of || '';
  const vendorAddress = (po as any).supplier_address || '';
  const vendorContact = (po as any).contact_person || (po as any).contact_number || '';
  const mobileNo = (po as any).mobile_no || (po as any).phone_no || '';
  const emailId = (po as any).email_id || (po as any).email || '';
  const vendorGst = po.vendors?.gst_number || (po as any).gst_no || (po as any).vendor_gstin || '';
  const prNo = (po as any).purchase_requisitions?.pr_number || (po as any).pr_number || (po as any).from_pr_no || '';
  const csNo = (po as any).comparative_statement_no || (po as any).cs_number || '';

  drawKvRow(y, 16, 'P.O. No.', poNo, 'P.O. Date*', poDate, true); y -= 16;
  drawKvRow(y, 16, 'Name of Company*', companyName, 'PAN No.', panNo, true); y -= 16;
  drawKvRow(y, 16, 'VAT No.', (po as any).vat_no || '', 'CST No.', (po as any).cst_no || ''); y -= 16;
  drawKvRow(y, 16, 'Cess No.', (po as any).cess_no || '', '', ''); y -= 16;
  drawKvRow(y, 16, 'Project Name', projectName, '', ''); y -= 16;
  drawKvRow(y, 16, 'Budget Applicable', (po as any).budget_applicable ? 'true' : '', '', ''); y -= 16;
  drawKvRow(y, 30, 'Project Address', projectAddress, 'Site Contact', siteContact); y -= 30;
  drawKvRow(y, 16, 'Supplier Name', vendorName, 'PO in the name of*', vendorName, true); y -= 16;
  drawKvRow(y, 16, 'Phone No.', (po as any).phone_no || '', 'Mobile No.', mobileNo); y -= 16;
  drawKvRow(y, 22, 'Email ID', emailId, 'Supplier Address', vendorAddress); y -= 22;
  drawKvRow(y, 16, 'Contact Person', vendorContact, 'Fax No.', (po as any).fax_no || ''); y -= 16;
  drawKvRow(y, 16, 'Contractor / Service Provider Name', (po as any).contractor_service_provider_name || '', 'G.R.N No.', 'Auto'); y -= 16;
  drawKvRow(y, 16, 'From P.R. No.', prNo, 'Comparative Statement No.', csNo); y -= 16;
  drawKvRow(y, 16, 'Company Currency', (po as any).company_currency || 'INR', 'Import PO', (po as any).import_po ? 'true' : ''); y -= 16;
  drawKvRow(y, 16, 'Import Currency', (po as any).import_currency || '', 'Exchange Rate', String((po as any).import_currency_exchange_rate || '0.00')); y -= 16;
  drawKvRow(y, 16, 'our state', (po as any).our_state || 'Gujarat', 'Vendor State', (po as any).vendor_state || ''); y -= 16;
  drawKvRow(y, 22, 'Additional Transportation Service Tax / GST Applicable', (po as any).additional_transportation_gst_applicable ? 'true' : 'false', 'GST No.', vendorGst); y -= 22;
  drawKvRow(y, 16, 'Location', (po as any).location || 'Gujarat', '', ''); y -= 16;

  // 3. TERMS SECTION (Exact matching position)
  drawKvRow(y, 16, 'Terms Group Name', 'PO Terms 1,', '', ''); y -= 16;

  // TERMS AND CONDITIONS MULTILINE BLOCK
  page.drawRectangle({
    x: 30,
    y: y - 18,
    width: 115,
    height: 18,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.5,
  });
  page.drawText('Terms and Conditions', { x: 34, y: y - 12, size: 7.5, font: fontHelveticaBold });

  const rawTermsVal = (po as any).terms_and_conditions;
  const rawTermsText = typeof rawTermsVal === 'string'
    ? rawTermsVal
    : Array.isArray(rawTermsVal) && rawTermsVal.length > 0
    ? rawTermsVal.join('\n')
    : DEFAULT_17_TERMS_PDF_LINES.join('\n');

  const termsLines = rawTermsText.split('\n').filter(Boolean);

  const wrapLineText = (text: string, maxLen: number = 100): string[] => {
    if (!text) return [];
    const words = text.split(' ');
    const resLines: string[] = [];
    let cur = '';
    words.forEach((w) => {
      if ((cur + ' ' + w).trim().length <= maxLen) {
        cur = (cur + ' ' + w).trim();
      } else {
        if (cur) resLines.push(cur);
        cur = w;
      }
    });
    if (cur) resLines.push(cur);
    return resLines;
  };

  let termsY = y;
  termsLines.forEach((tLine: string) => {
    termsY = checkNewPage(termsY, 15);
    const wrapped = wrapLineText(tLine, 98);
    wrapped.forEach((wLine) => {
      termsY = checkNewPage(termsY, 12);
      const isBoldHead = /^[0-9]+\.\s+[A-Z\s&:]+$/.test(wLine.trim()) || wLine.startsWith('PO Terms 1:');
      page.drawText(sanitizeWinAnsi(wLine), {
        x: 148,
        y: termsY - 11,
        size: isBoldHead ? 6.5 : 6,
        font: isBoldHead ? fontHelveticaBold : fontHelvetica,
        color: rgb(0, 0, 0),
      });
      termsY -= 8.5;
    });
    termsY -= 1.5;
  });

  y = termsY - 10;

  // PAGE BREAK FOR TABLES IF NEEDED
  y = checkNewPage(y, 180);

  // 4. PURCHASE ORDER ENTRIES TABLE
  page.drawText('Purchase Order Entries', {
    x: width / 2 - (fontHelveticaBold.widthOfTextAtSize('Purchase Order Entries', 9) / 2),
    y,
    size: 9,
    font: fontHelveticaBold,
  });
  y -= 14;

  // Entries Table Header
  page.drawRectangle({
    x: 30,
    y: y - 16,
    width: width - 60,
    height: 16,
    color: rgb(0.94, 0.94, 0.96),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  page.drawText('Sr', { x: 34, y: y - 11, size: 6.5, font: fontHelveticaBold });
  page.drawText('Item Description & Specification', { x: 55, y: y - 11, size: 6.5, font: fontHelveticaBold });
  page.drawText('Approved Qty', { x: 260, y: y - 11, size: 6.5, font: fontHelveticaBold });
  page.drawText('Unit*', { x: 325, y: y - 11, size: 6.5, font: fontHelveticaBold });
  page.drawText('Basic Rate*', { x: 360, y: y - 11, size: 6.5, font: fontHelveticaBold });
  page.drawText('Tax Amount', { x: 425, y: y - 11, size: 6.5, font: fontHelveticaBold });
  page.drawText('Net Amt', { x: 495, y: y - 11, size: 6.5, font: fontHelveticaBold });

  y -= 16;

  const rawPoLines = po.purchase_order_lines && po.purchase_order_lines.length > 0
    ? po.purchase_order_lines
    : (po as any).items && (po as any).items.length > 0
    ? (po as any).items
    : [];

  let subtotal = 0;
  let totalTax = 0;

  rawPoLines.forEach((line: any, idx: number) => {
    y = checkNewPage(y, 16);
    const qty = Number(line.quantity || line.approved_qty || 1);
    const rate = Number(line.unit_rate || line.basic_rate || line.estimated_rate || 0);
    const lineTotal = Number(line.line_total || line.amt || qty * rate);
    const taxAmt = Number(line.tax_code_amount || lineTotal * 0.18);

    subtotal += lineTotal;
    totalTax += taxAmt;

    page.drawRectangle({
      x: 30,
      y: y - 16,
      width: width - 60,
      height: 16,
      borderColor: rgb(0.88, 0.88, 0.88),
      borderWidth: 0.5,
    });

    page.drawText(`${idx + 1}`, { x: 34, y: y - 11, size: 6.5, font: fontHelvetica });
    page.drawText(sanitizeWinAnsi(line.item_description || line.item_desc || '').slice(0, 45), { x: 55, y: y - 11, size: 6.5, font: fontHelveticaBold });
    page.drawText(`${qty.toFixed(2)}`, { x: 260, y: y - 11, size: 6.5, font: fontHelvetica });
    page.drawText(sanitizeWinAnsi(line.unit || 'BAGS'), { x: 325, y: y - 11, size: 6.5, font: fontHelvetica });
    page.drawText(`${rate.toFixed(2)}`, { x: 360, y: y - 11, size: 6.5, font: fontHelvetica });
    page.drawText(`${taxAmt.toFixed(2)}`, { x: 425, y: y - 11, size: 6.5, font: fontHelvetica });
    page.drawText(`${lineTotal.toFixed(2)}`, { x: 495, y: y - 11, size: 6.5, font: fontHelveticaBold });

    y -= 16;
  });

  const grandTotal = subtotal + totalTax;

  // 5. TOTALS SUMMARY GRID
  drawKvRow(y, 16, 'Total Gross Amount', `${subtotal.toFixed(2)}`, 'Tax On Transportation Principal Amount*', String((po as any).tax_on_transportation_principal_amount || '0.00'), true); y -= 16;
  drawKvRow(y, 16, 'Total Tax Code Amount', `${totalTax.toFixed(2)}`, 'Tax Code for Tax On Transportation*', String((po as any).tax_code_for_tax_on_transportation || '')); y -= 16;
  drawKvRow(y, 16, 'HSN/SAC Code for Tax On Transportation*', String((po as any).hsn_sac_code_for_tax_on_transportation || ''), 'Tax Code Amount for Tax On Transportation', String((po as any).tax_code_amount_for_tax_on_transportation || '0.00')); y -= 16;
  drawKvRow(y, 16, 'Net Amount', `${grandTotal.toFixed(2)}`, 'Total Amount', `${grandTotal.toFixed(2)}`, true, true); y -= 16;
  drawKvRow(y, 16, 'Total Discount Amount', '0.00', 'Total Amount in Words', numberToWords(grandTotal), false, true); y -= 16;
  drawKvRow(y, 16, 'Loading/Unloading Charges', String((po as any).loading_unloading_charges || ''), 'Other Charges', String((po as any).other_charges || '')); y -= 16;

  y -= 10;
  y = checkNewPage(y, 100);

  // 6. COMPARATIVE STATEMENT TABLE
  const csTitle = `Comparative Statement : ${(po as any).comparative_statements?.length || 0}`;
  page.drawText(csTitle, {
    x: width / 2 - (fontHelveticaBold.widthOfTextAtSize(csTitle, 9) / 2),
    y,
    size: 9,
    font: fontHelveticaBold,
  });
  y -= 14;

  drawKvRow(y, 16, 'Sr', 'Comparative Statement No.', 'Supplier Name', 'Total Net Amount', true); y -= 16;

  y -= 10;
  y = checkNewPage(y, 100);

  // 7. ADVANCE PAYMENT TABLE
  const advTitle = `Advance Payment : ${(po as any).advance_payments?.length || 0}`;
  page.drawText(advTitle, {
    x: width / 2 - (fontHelveticaBold.widthOfTextAtSize(advTitle, 9) / 2),
    y,
    size: 9,
    font: fontHelveticaBold,
  });
  y -= 14;

  drawKvRow(y, 16, 'Sr', 'Voucher No.', 'Supplier Name', 'Advance Payment', true); y -= 16;

  y -= 10;
  y = checkNewPage(y, 100);

  // 8. PO AMENDMENT TABLE
  const amendTitle = `PO Amendment : ${(po as any).po_amendments?.length || 0}`;
  page.drawText(amendTitle, {
    x: width / 2 - (fontHelveticaBold.widthOfTextAtSize(amendTitle, 9) / 2),
    y,
    size: 9,
    font: fontHelveticaBold,
  });
  y -= 14;

  drawKvRow(y, 16, 'To GRN', (po as any).to_grn !== false ? 'true' : 'false', 'Credit Period', String((po as any).credit_period || '30')); y -= 16;
  drawKvRow(y, 22, 'Delivery Address*', (po as any).delivery_address || po.delivery_location || (po as any).project_address || '', 'Note On PO', (po as any).note_on_po || ''); y -= 22;
  drawKvRow(y, 16, 'Remarks', (po as any).remarks || (po as any).general_remarks || '', 'Relation Count', String((po as any).relation_count || '0.00')); y -= 16;
  drawKvRow(y, 16, 'Ledger Present', String((po as any).ledger_present || '1.00'), 'Status', (po.status || 'Draft').toUpperCase(), false, true); y -= 16;

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Triggers a direct browser download of the generated Purchase Order PDF file.
 */
export function downloadPurchaseOrderPdfFile(po: Partial<PurchaseOrderRow>, pdfBlob: Blob) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  const safeNumber = (po.po_number || 'PO-DRAFT').replace(/[\/\\]/g, '_');
  a.download = `Purchase_Order_${safeNumber}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
