import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { MaterialRequestRow } from './procurement';

/**
 * Sanitizes strings for pdf-lib standard WinAnsi Helvetica encoding.
 * Replaces non-ASCII symbols like ₹ with INR and strips unencodable characters.
 */
function sanitizeWinAnsi(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/₹/g, 'INR ')
    .replace(/[^\x00-\x7F]/g, ' ')
    .trim();
}

/**
 * Generates an official PDF document binary for a Material Request in A4 Landscape.
 * Returns a Blob with mime type 'application/pdf'.
 */
export async function generateMaterialRequestPdfBlob(mr: MaterialRequestRow): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  // A4 Landscape dimensions in points
  const page = pdfDoc.addPage([841.89, 595.28]);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // 1. Top Header Banner
  page.drawRectangle({
    x: 30,
    y: height - 65,
    width: width - 60,
    height: 45,
    color: rgb(0.71, 0.55, 0.25), // Pramukh Gold #b68d40
  });

  page.drawText('PRAMUKH GROUP', {
    x: 42,
    y: height - 44,
    size: 15,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('MATERIAL REQUEST REPORT', {
    x: 42,
    y: height - 58,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.95, 0.95, 0.95),
  });

  const mrNum = sanitizeWinAnsi(mr.mr_number || 'MR-DRAFT');
  page.drawText(`MR NO: ${mrNum}`, {
    x: width - 210,
    y: height - 44,
    size: 11,
    font: fontHelveticaBold,
    color: rgb(1, 1, 1),
  });

  const createdDateStr = mr.created_at ? new Date(mr.created_at).toLocaleDateString('en-IN') : 'Today';
  page.drawText(`Date: ${createdDateStr}`, {
    x: width - 210,
    y: height - 58,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.95, 0.95, 0.95),
  });

  // 2. Metadata Key-Value Box
  let y = height - 80;
  const gridHeight = 65;
  page.drawRectangle({
    x: 30,
    y: y - gridHeight,
    width: width - 60,
    height: gridHeight,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
  });

  const row1Y = y - 18;
  page.drawText('Project Name:', { x: 42, y: row1Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(mr.projects?.name || (mr as any).project_name || 'Central Park'), { x: 125, y: row1Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Required Date:', { x: 400, y: row1Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  const reqDateStr = mr.required_date ? new Date(mr.required_date).toLocaleDateString('en-IN') : '-';
  page.drawText(reqDateStr, { x: 490, y: row1Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  const row2Y = y - 36;
  page.drawText('Work Activity:', { x: 42, y: row2Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(mr.work_activity || 'General Construction'), { x: 125, y: row2Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Priority:', { x: 400, y: row2Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi((mr.priority || 'Medium').toUpperCase()), { x: 490, y: row2Y, size: 9, font: fontHelveticaBold, color: rgb(0.8, 0.2, 0.2) });

  const row3Y = y - 54;
  page.drawText('Raised By:', { x: 42, y: row3Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi(mr.profiles?.name || (mr as any).raised_by || 'Site Engineer'), { x: 125, y: row3Y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });

  page.drawText('Status:', { x: 400, y: row3Y, size: 9, font: fontHelveticaBold, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(sanitizeWinAnsi((mr.status || 'Draft').toUpperCase()), { x: 490, y: row3Y, size: 9, font: fontHelveticaBold, color: rgb(0.1, 0.5, 0.3) });

  // Justification section is REMOVED as requested.
  y = y - gridHeight - 16;

  // 3. Centered Heading: MATERIAL REQUEST LINE ITEMS
  const titleText = 'MATERIAL REQUEST LINE ITEMS';
  const titleWidth = fontHelveticaBold.widthOfTextAtSize(titleText, 11);
  page.drawText(titleText, { x: (width - titleWidth) / 2, y, size: 11, font: fontHelveticaBold, color: rgb(0.2, 0.2, 0.2) });
  y = y - 16;

  // 4. Line Items Table Headers (19 Columns)
  const columns = [
    { name: 'Sr No.', width: 30 },
    { name: 'MR Number', width: 65 },
    { name: 'Status / Approved', width: 60 },
    { name: 'Priority', width: 40 },
    { name: 'Stock Audit', width: 55 },
    { name: 'Project & Site', width: 65 },
    { name: 'Work Activity', width: 55 },
    { name: 'Activity Code', width: 45 },
    { name: 'Item Code', width: 45 },
    { name: 'Item Group', width: 45 },
    { name: 'Item Description', width: 75 },
    { name: 'Units *', width: 32 },
    { name: 'Required Date *', width: 48 },
    { name: 'Item Brand', width: 40 },
    { name: 'Item Spec', width: 45 },
    { name: 'Qty *', width: 30 },
    { name: 'Raised By', width: 50 },
    { name: 'Submitted', width: 45 },
    { name: 'View Details', width: 55 },
  ];

  page.drawRectangle({
    x: 15,
    y: y - 18,
    width: width - 30,
    height: 18,
    color: rgb(0.91, 0.94, 0.96),
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  let curX = 18;
  columns.forEach((col) => {
    page.drawText(col.name, { x: curX, y: y - 13, size: 6.5, font: fontHelveticaBold, color: rgb(0.2, 0.25, 0.3) });
    curX += col.width;
  });

  y = y - 18;

  // 5. Render Line Items
  const lines = mr.material_request_lines || [];

  lines.forEach((line: any, idx) => {
    const rowY = y - 14;

    page.drawRectangle({
      x: 15,
      y: y - 18,
      width: width - 30,
      height: 18,
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
      color: idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.98, 0.98, 0.98),
    });

    const truncate = (str: string, len: number) => (str.length > len ? str.substring(0, len - 1) + '..' : str);

    const values = [
      String(idx + 1),
      sanitizeWinAnsi(mr.mr_number),
      sanitizeWinAnsi(mr.status || 'Draft').toUpperCase(),
      sanitizeWinAnsi(mr.priority || 'Medium'),
      sanitizeWinAnsi((mr as any).stock_audit || (mr as any).inventory_status || 'In-Stock'),
      truncate(sanitizeWinAnsi(mr.projects?.name || (mr as any).project_name || '-'), 12),
      truncate(sanitizeWinAnsi(mr.work_activity || '-'), 10),
      sanitizeWinAnsi((line as any).activity_code || (mr as any).activity_code || '-'),
      sanitizeWinAnsi(line.item_code || (line as any).item_id || '-'),
      truncate(sanitizeWinAnsi(line.item_group || '-'), 9),
      truncate(sanitizeWinAnsi(line.item_description || '-'), 15),
      sanitizeWinAnsi(line.unit || 'nos'),
      line.required_date ? new Date(line.required_date).toLocaleDateString('en-IN') : (mr.required_date ? new Date(mr.required_date).toLocaleDateString('en-IN') : '-'),
      sanitizeWinAnsi((line as any).brand || (line as any).item_brand || '-'),
      truncate(sanitizeWinAnsi((line as any).specification || (line as any).item_specification || '-'), 9),
      String(line.quantity),
      truncate(sanitizeWinAnsi(mr.profiles?.name || (mr as any).raised_by || 'Engineer'), 10),
      mr.created_at ? new Date(mr.created_at).toLocaleDateString('en-IN') : '-',
      truncate(sanitizeWinAnsi(line.remarks || mr.justification || '-'), 10),
    ];

    let valX = 18;
    values.forEach((val, cIdx) => {
      const isBold = cIdx === 0 || cIdx === 1 || cIdx === 10 || cIdx === 15;
      page.drawText(val, {
        x: valX,
        y: rowY,
        size: 6.5,
        font: isBold ? fontHelveticaBold : fontHelvetica,
        color: cIdx === 15 ? rgb(0.71, 0.55, 0.25) : rgb(0.15, 0.15, 0.15),
      });
      valX += columns[cIdx].width;
    });

    y = y - 18;
  });

  // GRAND TOTAL ESTIMATED COST REMOVED as requested.

  // 6. Signature Block
  const sigY = 45;
  page.drawLine({ start: { x: 50, y: sigY }, end: { x: 200, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Raised By (Site Engineer)', { x: 70, y: sigY - 12, size: 8, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  page.drawLine({ start: { x: width / 2 - 75, y: sigY }, end: { x: width / 2 + 75, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Verified By (Store Manager)', { x: width / 2 - 60, y: sigY - 12, size: 8, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  page.drawLine({ start: { x: width - 200, y: sigY }, end: { x: width - 50, y: sigY }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  page.drawText('Approved By (Project Manager)', { x: width - 185, y: sigY - 12, size: 8, font: fontHelvetica, color: rgb(0.4, 0.4, 0.4) });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Triggers a direct browser download of the generated PDF file.
 */
export function downloadMaterialRequestPdfFile(mr: MaterialRequestRow, pdfBlob: Blob) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  const safeNumber = (mr.mr_number || 'DRAFT').replace(/[\/\\]/g, '_');
  a.download = `Material_Request_${safeNumber}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
