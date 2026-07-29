import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
 * Generates an official, standard PDF document binary for a Purchase Requisition in A4 Portrait B&W format.
 * Returns a Blob with mime type 'application/pdf'.
 */
export async function generatePurchaseRequisitionPdfBlob(pr: any): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  // Landscape for 14 columns
  const page = pdfDoc.addPage([841.89, 595.28]);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  const preparedBy = sanitizeWinAnsi(pr.prepared_by || pr.profiles?.name || pr.created_by_name || pr.raised_by || '');
  const printedByName = sanitizeWinAnsi(pr.printed_by || pr.profiles?.name || pr.created_by_name || 'Karan Shah');
  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const prDateStr = pr.pr_date || (pr.created_at ? new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const reqDateStr = pr.target_date || pr.required_date ? new Date(pr.target_date || pr.required_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const companyName = sanitizeWinAnsi(pr.company_name || '');
  const projectName = sanitizeWinAnsi(pr.project_name || pr.projects?.name || '');
  const siteName = sanitizeWinAnsi(pr.site_name || pr.sub_project || '');
  const contractorName = sanitizeWinAnsi(pr.contractor_name || pr.contractor || '');
  const costCenter = sanitizeWinAnsi(pr.cost_code || pr.budget_head || pr.cost_center || '');
  const activityNames = sanitizeWinAnsi(pr.activity_name || pr.work_activity || '');
  const deliveryAddress = sanitizeWinAnsi(pr.delivery_address || '');
  const remarks = sanitizeWinAnsi(pr.general_remarks || pr.remarks || pr.justification || '');
  const unlockedProject = sanitizeWinAnsi(String(pr.unlocked_project ?? '1.00'));
  const prReleaseDate = sanitizeWinAnsi(pr.pr_release_date || (pr.created_at ? new Date(pr.created_at).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : ''));
  const status = sanitizeWinAnsi(pr.status || 'Approved');

  // 1. Top Center Heading
  let y = height - 36;
  const headerTitle = 'Purchase Requisition';
  const titleWidth = fontHelveticaBold.widthOfTextAtSize(headerTitle, 16);
  page.drawText(headerTitle, { x: (width - titleWidth) / 2, y, size: 16, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= 14;
  const subtitleText = `Printed By: ${printedByName} on Date: ${printDateStr}`;
  const subtitleWidth = fontHelvetica.widthOfTextAtSize(subtitleText, 8.5);
  page.drawText(subtitleText, { x: (width - subtitleWidth) / 2, y, size: 8.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  y -= 10;
  page.drawLine({ start: { x: 25, y }, end: { x: width - 25, y }, thickness: 1.5, color: rgb(0, 0, 0) });

  // 2. Metadata Tabular Grid (5 rows)
  y -= 10;
  const metaBoxHeight = 90;
  const tableWidth = width - 50;
  page.drawRectangle({
    x: 25,
    y: y - metaBoxHeight,
    width: tableWidth,
    height: metaBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const rowH = metaBoxHeight / 5;
  page.drawLine({ start: { x: 25 + tableWidth / 2, y }, end: { x: 25 + tableWidth / 2, y: y - metaBoxHeight }, thickness: 1, color: rgb(0, 0, 0) });
  for (let i = 1; i < 5; i++) {
    page.drawLine({ start: { x: 25, y: y - rowH * i }, end: { x: width - 25, y: y - rowH * i }, thickness: 1, color: rgb(0, 0, 0) });
  }

  const fields = [
    { label1: 'P.R. No.', val1: pr.pr_number || '', label2: 'P.R.Date*', val2: prDateStr },
    { label1: 'Project Name*', val1: projectName, label2: 'Name of Company', val2: companyName },
    { label1: 'Sub Project*', val1: siteName, label2: 'Contractor Name', val2: contractorName },
    { label1: 'Cost Center', val1: costCenter, label2: '', val2: '' },
    { label1: 'Activity Names', val1: activityNames, label2: '', val2: '' },
  ];

  fields.forEach((f, idx) => {
    const rowY = y - 12 - (idx * rowH);
    page.drawText(f.label1, { x: 32, y: rowY, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    page.drawText(f.val1, { x: 155, y: rowY, size: 8, font: fontHelvetica, color: rgb(0, 0, 0) });

    if (f.label2) {
      page.drawText(f.label2, { x: 25 + tableWidth / 2 + 10, y: rowY, size: 8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
      page.drawText(f.val2, { x: 25 + tableWidth / 2 + 145, y: rowY, size: 8, font: fontHelvetica, color: rgb(0, 0, 0) });
    }
  });

  y -= (metaBoxHeight + 16);

  // 3. Section Heading: Material Request Entries*
  const entryHeading = 'Material Request Entries*';
  const entryHeadingWidth = fontHelveticaBold.widthOfTextAtSize(entryHeading, 10);
  page.drawText(entryHeading, { x: (width - entryHeadingWidth) / 2, y, size: 10, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  y -= 14;

  // 4. Data Table Columns (14 columns)
  const columns = [
    { name: 'Sr', width: 25 },
    { name: 'Item Group*', width: 85 },
    { name: 'Item Desc*', width: 110 },
    { name: 'Unit*', width: 40 },
    { name: 'Item Brand', width: 60 },
    { name: 'Est Qty', width: 45 },
    { name: 'Iss Qty', width: 45 },
    { name: 'Quantity*', width: 55 },
    { name: 'Bal Qty', width: 45 },
    { name: 'Pending PR', width: 55 },
    { name: 'Lead Period', width: 55 },
    { name: 'Lead Period Date', width: 75 },
    { name: 'Required Date*', width: 75 },
    { name: 'Stock Qty', width: 61 },
  ];

  page.drawRectangle({
    x: 25,
    y: y - 18,
    width: tableWidth,
    height: 18,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let curX = 25;
  columns.forEach((col, idx) => {
    page.drawText(col.name, { x: curX + 3, y: y - 13, size: 7, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    curX += col.width;
    if (idx < columns.length - 1) {
      page.drawLine({ start: { x: curX, y }, end: { x: curX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
    }
  });

  y -= 18;

  // 5. Line Rows
  const lines = pr.items || pr.lines || pr.pr_items || pr.purchase_requisition_lines || [];
  lines.forEach((line: any, idx: number) => {
    const rowY = y - 13;
    page.drawRectangle({
      x: 25,
      y: y - 18,
      width: tableWidth,
      height: 18,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    const itemReqDate = line.required_date || line.target_date ? new Date(line.required_date || line.target_date).toLocaleDateString('en-IN') : reqDateStr;
    const vals = [
      String(idx + 1),
      sanitizeWinAnsi(line.category_group || line.item_group || ''),
      sanitizeWinAnsi(line.item_description || line.description || '').substring(0, 22),
      sanitizeWinAnsi(line.unit || ''),
      sanitizeWinAnsi(line.brand || line.item_brand || '-'),
      Number(line.est_qty ?? 0).toFixed(3),
      Number(line.iss_qty ?? 0).toFixed(3),
      Number(line.quantity ?? line.qty ?? 0).toFixed(2),
      Number(line.bal_qty ?? line.quantity ?? 0).toFixed(2),
      Number(line.pending_pr ?? 0).toFixed(2),
      line.lead_period ? Number(line.lead_period).toFixed(2) : '',
      sanitizeWinAnsi(line.lead_period_date || itemReqDate),
      itemReqDate,
      line.stock_qty ? Number(line.stock_qty).toFixed(3) : '',
    ];

    let rX = 25;
    vals.forEach((v, cIdx) => {
      page.drawText(v, { x: rX + 3, y: rowY, size: 7, font: fontHelvetica, color: rgb(0, 0, 0) });
      rX += columns[cIdx].width;
      if (cIdx < columns.length - 1) {
        page.drawLine({ start: { x: rX, y }, end: { x: rX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
      }
    });

    y -= 18;
  });

  // 6. Summary Rows Box (Attached to table bottom)
  const summaryBoxHeight = 56;
  page.drawRectangle({
    x: 25,
    y: y - summaryBoxHeight,
    width: tableWidth,
    height: summaryBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const sRowH = summaryBoxHeight / 4;
  for (let i = 1; i < 4; i++) {
    page.drawLine({ start: { x: 25, y: y - sRowH * i }, end: { x: width - 25, y: y - sRowH * i }, thickness: 1, color: rgb(0, 0, 0) });
  }

  // Row 1 & 2 full-width labels
  page.drawText('Delivery Address', { x: 32, y: y - 10, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(deliveryAddress.substring(0, 110), { x: 140, y: y - 10, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Remarks', { x: 32, y: y - 10 - sRowH, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(remarks.substring(0, 110), { x: 140, y: y - 10 - sRowH, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  // Row 3 & 4 split vertical divider
  page.drawLine({ start: { x: 25 + tableWidth / 2, y: y - sRowH * 2 }, end: { x: 25 + tableWidth / 2, y: y - summaryBoxHeight }, thickness: 1, color: rgb(0, 0, 0) });

  page.drawText('Unlocked Project', { x: 32, y: y - 10 - sRowH * 2, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(unlockedProject, { x: 140, y: y - 10 - sRowH * 2, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Prepared By', { x: 25 + tableWidth / 2 + 10, y: y - 10 - sRowH * 2, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(preparedBy, { x: 25 + tableWidth / 2 + 145, y: y - 10 - sRowH * 2, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('PR Release Date', { x: 32, y: y - 10 - sRowH * 3, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(prReleaseDate, { x: 140, y: y - 10 - sRowH * 3, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText('Status', { x: 25 + tableWidth / 2 + 10, y: y - 10 - sRowH * 3, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(status, { x: 25 + tableWidth / 2 + 145, y: y - 10 - sRowH * 3, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= (summaryBoxHeight + 16);

  // 7. Report History Section
  const historyHeading = 'REPORT HISTORY';
  const histHeadingWidth = fontHelveticaBold.widthOfTextAtSize(historyHeading, 10);
  page.drawText(historyHeading, { x: (width - histHeadingWidth) / 2, y, size: 10, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  y -= 14;

  const hCols = [
    { name: 'FROM', width: 90 },
    { name: 'TO', width: 90 },
    { name: 'BY', width: 140 },
    { name: 'AT', width: 130 },
    { name: 'DAYS SINCE', width: 80 },
    { name: 'REMARKS', width: 256 },
  ];

  page.drawRectangle({
    x: 25,
    y: y - 18,
    width: tableWidth,
    height: 18,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let hX = 25;
  hCols.forEach((col, idx) => {
    page.drawText(col.name, { x: hX + 5, y: y - 13, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    hX += col.width;
    if (idx < hCols.length - 1) {
      page.drawLine({ start: { x: hX, y }, end: { x: hX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
    }
  });

  y -= 18;

  const historyLogs = pr.history && Array.isArray(pr.history) ? pr.history : [];
  if (historyLogs.length === 0) {
    page.drawRectangle({
      x: 25,
      y: y - 18,
      width: tableWidth,
      height: 18,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    page.drawText('No history logs recorded', { x: width / 2 - 50, y: y - 13, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });
  } else {
    historyLogs.forEach((log: any) => {
      const rowY = y - 13;
      page.drawRectangle({
        x: 25,
        y: y - 18,
        width: tableWidth,
        height: 18,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });

      const hVals = [
        sanitizeWinAnsi(log.from || ''),
        sanitizeWinAnsi(log.to || ''),
        sanitizeWinAnsi(log.by || ''),
        sanitizeWinAnsi(log.at || ''),
        String(log.daysSince ?? ''),
        sanitizeWinAnsi(log.remarks || ''),
      ];

      let curHX = 25;
      hVals.forEach((hv, cIdx) => {
        page.drawText(hv.substring(0, 35), { x: curHX + 5, y: rowY, size: 7, font: fontHelvetica, color: rgb(0, 0, 0) });
        curHX += hCols[cIdx].width;
        if (cIdx < hCols.length - 1) {
          page.drawLine({ start: { x: curHX, y }, end: { x: curHX, y: y - 18 }, thickness: 1, color: rgb(0, 0, 0) });
        }
      });

      y -= 18;
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Triggers a direct browser download of the generated PR PDF file.
 */
export function downloadPurchaseRequisitionPdfFile(pr: any, pdfBlob: Blob) {
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
