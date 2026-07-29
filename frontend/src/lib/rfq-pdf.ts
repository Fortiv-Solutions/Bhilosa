import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { RfqFormState } from '@/components/procurement/rfq/rfq-form';

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
 * Generates an official, standard PDF document binary for a Request for Quotation (RFQ).
 * Returns a Blob with mime type 'application/pdf'.
 */
export async function generateRfqPdfBlob(rfq: Partial<RfqFormState>): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 dimensions in points
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // 1. Top Header Banner (Corporate Blue)
  page.drawRectangle({
    x: 30,
    y: height - 75,
    width: width - 60,
    height: 48,
    color: rgb(0.12, 0.38, 0.68), // Pramukh Corporate Blue
  });

  page.drawText('PRAMUKH GROUP', {
    x: 42,
    y: height - 52,
    size: 16,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('REQUEST FOR QUOTATION (RFQ) REPORT', {
    x: 42,
    y: height - 66,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.95, 0.95, 0.95),
  });

  const rfqNum = sanitizeWinAnsi(rfq.quotation_registration_no || 'RFQ-DRAFT');
  page.drawText(`RFQ NO: ${rfqNum}`, {
    x: width - 210,
    y: height - 52,
    size: 11,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  const qDate = rfq.quotation_date ? new Date(rfq.quotation_date).toLocaleDateString('en-IN') : 'Today';
  page.drawText(`Date: ${qDate}`, {
    x: width - 210,
    y: height - 66,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.95, 0.95, 0.95),
  });

  // 2. Metadata Key-Value Box
  let y = height - 95;
  const gridHeight = 85;
  page.drawRectangle({
    x: 30,
    y: y - gridHeight,
    width: width - 60,
    height: gridHeight,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });

  const row1Y = y - 22;
  page.drawText('Approved PR Ref:', { x: 42, y: row1Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(rfq.pr_number || 'PR-Approved'), { x: 140, y: row1Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Target Delivery Date:', { x: 310, y: row1Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  const goalDateStr = rfq.goal_delivery_date ? new Date(rfq.goal_delivery_date).toLocaleDateString('en-IN') : '-';
  page.drawText(goalDateStr, { x: 430, y: row1Y, size: 9, font: fontHelveticaBold, color: rgb(0.8, 0.2, 0.2) });

  const row2Y = y - 44;
  page.drawText('Project Name:', { x: 42, y: row2Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(rfq.project_name || 'Central Park Project'), { x: 140, y: row2Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Process Type:', { x: 310, y: row2Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(rfq.process_type || 'Quotation Request'), { x: 430, y: row2Y, size: 9, font: fontHelveticaBold, color: rgb(0.12, 0.38, 0.68) });

  const row3Y = y - 66;
  page.drawText('Company Name:', { x: 42, y: row3Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(rfq.company_name || 'Pramukh Group Infrastructure Ltd.'), { x: 140, y: row3Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Status:', { x: 310, y: row3Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi((rfq.status || 'Draft').toUpperCase()), { x: 430, y: row3Y, size: 9, font: fontHelveticaBold, color: rgb(0.1, 0.5, 0.3) });

  // 3. Line Items Table Header
  y = y - gridHeight - 20;
  page.drawText('QUOTATION REGISTRATION LINE ITEMS', { x: 30, y, size: 10, font: fontHelveticaBold, color: rgb(0.2, 0.2, 0.2) });
  y = y - 16;

  page.drawRectangle({
    x: 30,
    y: y - 20,
    width: width - 60,
    height: 20,
    color: rgb(0.91, 0.94, 0.96),
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  page.drawText('#', { x: 38, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('ITEM GROUP', { x: 60, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('BRAND', { x: 160, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('SPECIFICATION', { x: 250, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('QTY', { x: 420, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('UNIT', { x: 465, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('PREV. RATE', { x: 515, y: y - 14, size: 8.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });

  y = y - 20;

  // 4. Line Rows
  const items = rfq.items || [];
  items.forEach((item, idx) => {
    const rowY = y - 16;
    page.drawRectangle({
      x: 30,
      y: y - 22,
      width: width - 60,
      height: 22,
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
      color: idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98),
    });

    page.drawText(String(idx + 1), { x: 38, y: rowY, size: 8.5, font: fontHelvetica, color: rgb(0.3, 0.3, 0.3) });
    const cleanGroup = sanitizeWinAnsi(item.item_group || 'General');
    page.drawText(cleanGroup.length > 18 ? cleanGroup.substring(0, 16) + '..' : cleanGroup, { x: 60, y: rowY, size: 8.5, font: fontHelveticaBold, color: rgb(0.1, 0.1, 0.1) });

    const cleanBrand = sanitizeWinAnsi(item.item_brand || '-');
    page.drawText(cleanBrand.length > 15 ? cleanBrand.substring(0, 13) + '..' : cleanBrand, { x: 160, y: rowY, size: 8.5, font: fontHelvetica, color: rgb(0.2, 0.2, 0.2) });

    const cleanSpec = sanitizeWinAnsi(item.specification || item.item_description);
    page.drawText(cleanSpec.length > 30 ? cleanSpec.substring(0, 27) + '...' : cleanSpec, { x: 250, y: rowY, size: 8.5, font: fontHelvetica, color: rgb(0.2, 0.2, 0.2) });

    page.drawText(String(item.quantity || 0), { x: 420, y: rowY, size: 8.5, font: fontHelveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(sanitizeWinAnsi(item.unit || 'nos'), { x: 465, y: rowY, size: 8.5, font: fontHelvetica, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`INR ${item.previous_rate || 0}`, { x: 515, y: rowY, size: 8.5, font: fontHelvetica, color: rgb(0.12, 0.38, 0.68) });

    y = y - 22;
  });

  // 5. Signature Block
  const sigY = 65;
  page.drawLine({ start: { x: 50, y: sigY }, end: { x: 180, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Prepared By (Purchase Officer)', { x: 50, y: sigY - 14, size: 8.5, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  page.drawLine({ start: { x: width - 180, y: sigY }, end: { x: width - 50, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Approved By (Procurement Head)', { x: width - 185, y: sigY - 14, size: 8.5, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Triggers a direct browser download of the generated RFQ PDF file.
 */
export function downloadRfqPdfFile(rfq: Partial<RfqFormState>, pdfBlob: Blob) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  const safeNumber = (rfq.quotation_registration_no || 'RFQ-DRAFT').replace(/[\/\\]/g, '_');
  a.download = `Request_For_Quotation_${safeNumber}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
