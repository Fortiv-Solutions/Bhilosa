import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PurchaseRequisitionRow } from './procurement';

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
 * Generates an official, standard PDF document binary for a Purchase Requisition.
 * Returns a Blob with mime type 'application/pdf'.
 */
export async function generatePurchaseRequisitionPdfBlob(pr: PurchaseRequisitionRow): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 dimensions in points
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // 1. Top Header Banner
  page.drawRectangle({
    x: 30,
    y: height - 75,
    width: width - 60,
    height: 48,
    color: rgb(0.15, 0.35, 0.6), // Pramukh Corporate Blue #265999
  });

  page.drawText('PRAMUKH GROUP', {
    x: 42,
    y: height - 52,
    size: 16,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('PURCHASE REQUISITION REPORT', {
    x: 42,
    y: height - 66,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.95, 0.95, 0.95),
  });

  const prNum = sanitizeWinAnsi(pr.pr_number || 'PR-DRAFT');
  page.drawText(`PR NO: ${prNum}`, {
    x: width - 210,
    y: height - 52,
    size: 12,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  const createdDateStr = pr.created_at ? new Date(pr.created_at).toLocaleDateString('en-IN') : 'Today';
  page.drawText(`Date: ${createdDateStr}`, {
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
  page.drawText('Requisition Title:', { x: 42, y: row1Y, size: 10, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  const cleanTitle = sanitizeWinAnsi(pr.title || 'Material Purchase Requisition');
  page.drawText(cleanTitle.length > 30 ? cleanTitle.substring(0, 27) + '...' : cleanTitle, { x: 140, y: row1Y, size: 10, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Required Date:', { x: 310, y: row1Y, size: 10, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  const reqDateStr = pr.required_date ? new Date(pr.required_date).toLocaleDateString('en-IN') : '-';
  page.drawText(reqDateStr, { x: 410, y: row1Y, size: 10, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  const row2Y = y - 44;
  page.drawText('Activity / Site:', { x: 42, y: row2Y, size: 10, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(pr.activity_name || pr.delivery_address || 'Central Park Main Site'), { x: 140, y: row2Y, size: 10, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Priority:', { x: 310, y: row2Y, size: 10, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi((pr.priority || 'Normal').toUpperCase()), { x: 410, y: row2Y, size: 10, font: fontHelveticaBold, color: rgb(0.8, 0.2, 0.2) });

  const row3Y = y - 66;
  page.drawText('Prepared By:', { x: 42, y: row3Y, size: 10, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(pr.contractor_name || pr.department || 'PR Procurement Team'), { x: 140, y: row3Y, size: 10, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Status:', { x: 310, y: row3Y, size: 10, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi((pr.status || 'Draft').toUpperCase()), { x: 410, y: row3Y, size: 10, font: fontHelveticaBold, color: rgb(0.15, 0.35, 0.6) });

  // 3. Remarks / Notes
  y = y - gridHeight - 15;
  const remarksText = pr.assigned_team_notes || pr.general_remarks || pr.internal_notes;
  if (remarksText) {
    page.drawRectangle({
      x: 30,
      y: y - 35,
      width: width - 60,
      height: 35,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.75, 0.85, 0.95),
      borderWidth: 1,
    });
    page.drawText('Requisition Notes & Remarks:', { x: 40, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.15, 0.35, 0.6) });
    const cleanRemarks = sanitizeWinAnsi(remarksText).substring(0, 100);
    page.drawText(`"${cleanRemarks}"`, { x: 40, y: y - 27, size: 9, font: fontHelvetica, color: rgb(0.2, 0.2, 0.2) });
    y = y - 45;
  }

  // 4. Line Items Table Header
  page.drawText('PURCHASE REQUISITION LINE ITEMS', { x: 30, y, size: 10, font: fontHelveticaBold, color: rgb(0.2, 0.2, 0.2) });
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

  page.drawText('#', { x: 38, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('ITEM DESCRIPTION', { x: 65, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('UNIT', { x: 270, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('QTY', { x: 330, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('EST. RATE', { x: 390, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
  page.drawText('EST. TOTAL', { x: 475, y: y - 14, size: 9, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });

  y = y - 20;

  // 5. Line Rows
  const lines = pr.purchase_requisition_lines || [];
  let grandTotal = 0;

  lines.forEach((line, idx) => {
    const rowY = y - 16;
    const estRate = line.estimated_rate || 0;
    const lineTotal = line.line_total || (line.quantity * estRate);
    grandTotal += lineTotal;

    page.drawRectangle({
      x: 30,
      y: y - 22,
      width: width - 60,
      height: 22,
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
      color: idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98),
    });

    page.drawText(String(idx + 1), { x: 38, y: rowY, size: 9, font: fontHelvetica, color: rgb(0.3, 0.3, 0.3) });

    const cleanDesc = sanitizeWinAnsi(line.item_description);
    const descText = cleanDesc.length > 36 ? cleanDesc.substring(0, 33) + '...' : cleanDesc;
    page.drawText(descText, { x: 65, y: rowY, size: 9, font: fontHelveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(sanitizeWinAnsi(line.unit || 'nos'), { x: 270, y: rowY, size: 9, font: fontHelvetica, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(String(line.quantity), { x: 330, y: rowY, size: 9, font: fontHelveticaBold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`INR ${estRate.toLocaleString('en-IN')}`, { x: 390, y: rowY, size: 9, font: fontHelvetica, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(`INR ${lineTotal.toLocaleString('en-IN')}`, { x: 475, y: rowY, size: 9, font: fontHelveticaBold, color: rgb(0.15, 0.35, 0.6) });

    y = y - 22;
  });

  // 6. Grand Total Footer
  y = y - 15;
  const totalCost = pr.estimated_cost || pr.total_amount || grandTotal;
  page.drawRectangle({
    x: 30,
    y: y - 25,
    width: width - 60,
    height: 25,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
  });

  page.drawText('TOTAL REQUISITION ESTIMATE:', { x: 190, y: y - 16, size: 10, font: fontHelveticaBold, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`INR ${totalCost.toLocaleString('en-IN')}`, { x: 450, y: y - 16, size: 11, font: fontHelveticaBold, color: rgb(0.15, 0.35, 0.6) });

  // 7. Signature Block
  const sigY = 65;
  page.drawLine({ start: { x: 50, y: sigY }, end: { x: 180, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Prepared By (PR Processor)', { x: 55, y: sigY - 14, size: 9, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  page.drawLine({ start: { x: width - 180, y: sigY }, end: { x: width - 50, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Approved By (Procurement Head)', { x: width - 185, y: sigY - 14, size: 9, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Triggers a direct browser download of the generated PR PDF file.
 */
export function downloadPurchaseRequisitionPdfFile(pr: PurchaseRequisitionRow, pdfBlob: Blob) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  const safeNumber = (pr.pr_number || 'DRAFT').replace(/[\/\\]/g, '_');
  a.download = `Purchase_Requisition_${safeNumber}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
