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
 * Generates an official PDF document binary for a Material Request in A4 Portrait B&W format.
 * Returns a Blob with mime type 'application/pdf'.
 */
export async function generateMaterialRequestPdfBlob(mr: MaterialRequestRow): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 Portrait
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  const raisedByName = sanitizeWinAnsi(mr.profiles?.name || (mr as any).raised_by || '');
  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mrDateStr = mr.created_at ? new Date(mr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const projectName = sanitizeWinAnsi(mr.projects?.name || (mr as any).project_name || '');
  const contractorName = sanitizeWinAnsi((mr as any).contractor_name || (mr as any).company_name || (mr as any).contractor || '');
  const workActivity = sanitizeWinAnsi(mr.work_activity || '');
  const remarksText = sanitizeWinAnsi(mr.justification || (mr as any).remarks || '').substring(0, 80);

  // 1. Top Center Heading
  let y = height - 40;
  const headerTitle = 'Material Requests';
  const titleWidth = fontHelveticaBold.widthOfTextAtSize(headerTitle, 16);
  page.drawText(headerTitle, { x: (width - titleWidth) / 2, y, size: 16, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= 15;
  const subtitleText = `Printed By: ${raisedByName}   on Date: ${printDateStr}`;
  const subtitleWidth = fontHelvetica.widthOfTextAtSize(subtitleText, 8.5);
  page.drawText(subtitleText, { x: (width - subtitleWidth) / 2, y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  y -= 12;
  page.drawLine({ start: { x: 30, y }, end: { x: width - 30, y }, thickness: 1.5, color: rgb(0, 0, 0) });

  // 2. Metadata Tabular Grid
  y -= 10;
  const metaBoxHeight = 55;
  page.drawRectangle({
    x: 30,
    y: y - metaBoxHeight,
    width: width - 60,
    height: metaBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const rowH = metaBoxHeight / 3;
  const row1Y = y - 13;
  const row2Y = y - 13 - rowH;
  const row3Y = y - 13 - rowH * 2;

  // Vertical and Horizontal Dividers inside meta box
  page.drawLine({ start: { x: width / 2, y }, end: { x: width / 2, y: y - metaBoxHeight }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: 30, y: y - rowH }, end: { x: width - 30, y: y - rowH }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: 30, y: y - rowH * 2 }, end: { x: width - 30, y: y - rowH * 2 }, thickness: 1, color: rgb(0, 0, 0) });

  page.drawText('M.R. No.:', { x: 38, y: row1Y, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(sanitizeWinAnsi(mr.mr_number || ''), { x: 125, y: row1Y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('M.R. Date *:', { x: width / 2 + 10, y: row1Y, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(mrDateStr, { x: width / 2 + 100, y: row1Y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Project & Site:', { x: 38, y: row2Y, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(projectName, { x: 125, y: row2Y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Contractor Name:', { x: width / 2 + 10, y: row2Y, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(contractorName, { x: width / 2 + 100, y: row2Y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Work Activity:', { x: 38, y: row3Y, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(workActivity, { x: 125, y: row3Y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Raised By:', { x: width / 2 + 10, y: row3Y, size: 8.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(raisedByName, { x: width / 2 + 100, y: row3Y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  y -= (metaBoxHeight + 20);

  // 3. Section Heading: Material Request Entries
  const entryHeading = 'Material Request Entries';
  const entryHeadingWidth = fontHelveticaBold.widthOfTextAtSize(entryHeading, 10);
  page.drawText(entryHeading, { x: (width - entryHeadingWidth) / 2, y, size: 10, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  y -= 15;

  // 4. Data Table Columns
  const columns = [
    { name: 'Sr No.', width: 40 },
    { name: 'Item Group', width: 80 },
    { name: 'Item Description', width: 175 },
    { name: 'Item Brand', width: 70 },
    { name: 'Units *', width: 45 },
    { name: 'Qty *', width: 45 },
    { name: 'Req Date *', width: 80 },
  ];

  page.drawRectangle({
    x: 30,
    y: y - 18,
    width: width - 60,
    height: 18,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let curX = 30;
  columns.forEach((col, idx) => {
    page.drawText(col.name, { x: curX + 5, y: y - 13, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    curX += col.width;
    if (idx < columns.length - 1) {
      page.drawLine({ start: { x: curX, y }, end: { x: curX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
    }
  });

  y -= 18;

  // 5. Line Rows
  const lines = mr.material_request_lines || [];
  lines.forEach((line: any, idx) => {
    const rowY = y - 13;
    page.drawRectangle({
      x: 30,
      y: y - 18,
      width: width - 60,
      height: 18,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    const itemReqDate = line.required_date ? new Date(line.required_date).toLocaleDateString('en-IN') : mrDateStr;
    const vals = [
      String(idx + 1),
      sanitizeWinAnsi(line.item_group || ''),
      sanitizeWinAnsi(line.item_description || '').substring(0, 35),
      sanitizeWinAnsi(line.brand || line.item_brand || ''),
      sanitizeWinAnsi(line.unit || ''),
      String(line.quantity ?? ''),
      itemReqDate,
    ];

    let valX = 30;
    vals.forEach((v, cIdx) => {
      page.drawText(v, { x: valX + 5, y: rowY, size: 7.5, font: cIdx === 2 || cIdx === 5 ? fontHelveticaBold : fontHelvetica, color: rgb(0, 0, 0) });
      valX += columns[cIdx].width;
      if (cIdx < columns.length - 1) {
        page.drawLine({ start: { x: valX, y }, end: { x: valX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
      }
    });

    y -= 18;
  });

  // 6. Summary Rows in same Tabular Section (Remarks, Priority, Prepared by, Status)
  const summaryBoxH = 50;
  page.drawRectangle({
    x: 30,
    y: y - summaryBoxH,
    width: width - 60,
    height: summaryBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const sumRow1Y = y - 13;
  const sumRow2Y = y - 30;
  const sumRow3Y = y - 45;

  page.drawLine({ start: { x: 30, y: y - 18 }, end: { x: width - 30, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: 30, y: y - 35 }, end: { x: width - 30, y: y - 35 }, thickness: 1, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: width / 2, y: y - 18 }, end: { x: width / 2, y: y - 35 }, thickness: 1, color: rgb(0, 0, 0) });

  page.drawText('Remarks:', { x: 38, y: sumRow1Y, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(remarksText, { x: 100, y: sumRow1Y, size: 8, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Priority:', { x: 38, y: sumRow2Y, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(sanitizeWinAnsi((mr.priority || '').toUpperCase()), { x: 100, y: sumRow2Y, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  page.drawText('Prepared by:', { x: width / 2 + 10, y: sumRow2Y, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(raisedByName, { x: width / 2 + 100, y: sumRow2Y, size: 8, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Status:', { x: 38, y: sumRow3Y, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(sanitizeWinAnsi((mr.status || '').toUpperCase()), { x: 100, y: sumRow3Y, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= (summaryBoxH + 25);

  // 7. Report History Section
  const histHeading = 'REPORT HISTORY';
  const histHeadingWidth = fontHelveticaBold.widthOfTextAtSize(histHeading, 10);
  page.drawText(histHeading, { x: (width - histHeadingWidth) / 2, y, size: 10, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= 15;
  const histCols = [
    { name: 'FROM', width: 70 },
    { name: 'TO', width: 70 },
    { name: 'BY', width: 100 },
    { name: 'AT', width: 90 },
    { name: 'DAYS SINCE', width: 65 },
    { name: 'REMARKS', width: 140 },
  ];

  page.drawRectangle({
    x: 30,
    y: y - 18,
    width: width - 60,
    height: 18,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let hX = 30;
  histCols.forEach((col, idx) => {
    page.drawText(col.name, { x: hX + 5, y: y - 13, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    hX += col.width;
    if (idx < histCols.length - 1) {
      page.drawLine({ start: { x: hX, y }, end: { x: hX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
    }
  });

  y -= 18;

  const historyEntries = (mr as any).history && Array.isArray((mr as any).history) ? (mr as any).history : [];

  if (historyEntries.length > 0) {
    historyEntries.forEach((h: any) => {
      const rowY = y - 13;
      page.drawRectangle({
        x: 30,
        y: y - 18,
        width: width - 60,
        height: 18,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });

      const hVals = [
        sanitizeWinAnsi(h.from || ''),
        sanitizeWinAnsi(h.to || ''),
        sanitizeWinAnsi(h.by || ''),
        sanitizeWinAnsi(h.at || ''),
        String(h.daysSince ?? ''),
        sanitizeWinAnsi(h.remarks || '').substring(0, 30),
      ];

      let hValX = 30;
      hVals.forEach((hv, cIdx) => {
        page.drawText(hv, { x: hValX + 5, y: rowY, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });
        hValX += histCols[cIdx].width;
        if (cIdx < histCols.length - 1) {
          page.drawLine({ start: { x: hValX, y }, end: { x: hValX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
        }
      });

      y -= 18;
    });
  } else {
    page.drawRectangle({
      x: 30,
      y: y - 18,
      width: width - 60,
      height: 18,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    page.drawText('No history logs recorded', { x: width / 2 - 50, y: y - 13, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });
  }

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
