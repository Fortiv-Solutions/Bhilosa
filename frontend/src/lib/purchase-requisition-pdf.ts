import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * Sanitizes text strings for pdf-lib standard WinAnsi Helvetica encoding.
 * Replaces non-ASCII symbols like ₹ with INR and removes unencodable characters.
 */
function sanitizeWinAnsi(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/₹/g, "INR ")
    .replace(/[^\x00-\x7F]/g, " ")
    .trim();
}

/**
 * Helper to filter out raw UUID strings and resolve real human names.
 */
function resolvePersonName(val: string | null | undefined, fallback: string = ""): string {
  if (!val) return fallback;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
  return isUuid ? fallback : val;
}

/**
 * Formats date strings to DD/MM/YYYY
 */
function fmtDateStr(val: string | Date | null | undefined): string {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(val);
  }
}

/**
 * Formats date-time strings to DD/MM/YYYY hh:mm AM/PM according to Indian Standard Time (IST).
 * Example: 30/07/2026 07:08 PM
 */
function fmtDateTimeStr(val: string | Date | null | undefined): string {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).toUpperCase().replace(",", "");
  } catch {
    return String(val);
  }
}

/**
 * Generates an official Purchase Requisition PDF document binary in standard A4 Portrait format.
 * Page Dimensions: 595.28 x 841.89 pt (A4 Portrait)
 */
export async function generatePurchaseRequisitionPdfBlob(pr: any): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  // Standard A4 Portrait: Width = 595.28, Height = 841.89
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  const marginX = 20;
  const tableWidth = width - marginX * 2; // 555.28 pt

  // Person Name Resolutions
  const rawPrepared = pr.profiles?.name || pr.created_by_name || pr.prepared_by_name;
  const preparedBy = sanitizeWinAnsi(
    resolvePersonName(rawPrepared) ||
    resolvePersonName(pr.prepared_by) ||
    resolvePersonName(pr.raised_by) ||
    "Executive Director"
  );

  const printedByName = sanitizeWinAnsi(
    resolvePersonName(pr.printed_by) ||
    resolvePersonName(pr.profiles?.name) ||
    resolvePersonName(pr.created_by_name) ||
    "Executive Director"
  );

  const printDateStr = fmtDateStr(new Date());
  const prDateStr = fmtDateStr(pr.pr_date || pr.created_at || pr.requested_date);
  const reqDateStr = fmtDateStr(pr.target_date || pr.required_date);

  const companyName = sanitizeWinAnsi(pr.company_name || "Pramukh Group Infrastructure Ltd.");
  const projectName = sanitizeWinAnsi(pr.project_name || pr.projects?.name || "Central Park Residential Project");
  const subProject = sanitizeWinAnsi(
    pr.site_name ||
    pr.sub_project ||
    pr.project_sites?.name ||
    pr.project_site_name ||
    pr.wbs_code ||
    (pr.site_id && !pr.site_id.includes('-') && pr.site_id.length > 20 ? '' : pr.site_id) ||
    ""
  );
  const contractorName = sanitizeWinAnsi(pr.contractor_name || pr.contractor || "");
  const costCenter = sanitizeWinAnsi(pr.cost_centre || pr.cost_code || pr.budget_head || "");
  const activityNames = sanitizeWinAnsi(pr.activity_name || pr.work_activity || "Masonry / Brickwork");
  const deliveryAddress = sanitizeWinAnsi(pr.delivery_address || "Central Park Residential Project");
  const remarks = sanitizeWinAnsi(pr.general_remarks || pr.remarks || pr.justification || "");
  const unlockedProject = sanitizeWinAnsi(String(pr.unlocked_project ?? "1.00"));
  const prReleaseDate = fmtDateTimeStr(pr.pr_release_date || pr.created_at || new Date());
  const status = sanitizeWinAnsi(pr.status || "draft");

  // 1. Top Center Heading
  let y = height - 32;
  const headerTitle = "Purchase Requisition";
  const titleWidth = fontHelveticaBold.widthOfTextAtSize(headerTitle, 15);
  page.drawText(headerTitle, { x: (width - titleWidth) / 2, y, size: 15, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= 13;
  const subtitleText = `Printed By: ${printedByName} on Date: ${printDateStr}`;
  const subtitleWidth = fontHelvetica.widthOfTextAtSize(subtitleText, 8);
  page.drawText(subtitleText, { x: (width - subtitleWidth) / 2, y, size: 8, font: fontHelvetica, color: rgb(0, 0, 0) });

  y -= 8;
  page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1.2, color: rgb(0, 0, 0) });

  // 2. Metadata Grid (5 rows)
  y -= 8;
  const metaBoxHeight = 85;
  page.drawRectangle({
    x: marginX,
    y: y - metaBoxHeight,
    width: tableWidth,
    height: metaBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const rowH = metaBoxHeight / 5;
  const midX = marginX + tableWidth / 2;
  page.drawLine({ start: { x: midX, y }, end: { x: midX, y: y - metaBoxHeight }, thickness: 1, color: rgb(0, 0, 0) });
  for (let i = 1; i < 5; i++) {
    page.drawLine({ start: { x: marginX, y: y - rowH * i }, end: { x: width - marginX, y: y - rowH * i }, thickness: 1, color: rgb(0, 0, 0) });
  }

  const fields = [
    { label1: "P.R. No.", val1: pr.pr_number || "PR-20260730-0001", label2: "P.R.Date*", val2: prDateStr },
    { label1: "Project Name*", val1: projectName, label2: "Name of Company", val2: companyName },
    { label1: "Sub Project*", val1: subProject, label2: "Contractor Name", val2: contractorName },
    { label1: "Cost Center", val1: costCenter, label2: "", val2: "" },
    { label1: "Activity Names", val1: activityNames, label2: "", val2: "" },
  ];

  fields.forEach((f, idx) => {
    const rowY = y - 11 - idx * rowH;
    page.drawText(f.label1, { x: marginX + 6, y: rowY, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    page.drawText(f.val1, { x: marginX + 90, y: rowY, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

    if (f.label2) {
      page.drawText(f.label2, { x: midX + 6, y: rowY, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
      page.drawText(f.val2, { x: midX + 95, y: rowY, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });
    }
  });

  y -= metaBoxHeight + 12;

  // 3. Section Heading: Material Request Entries*
  const entryHeading = "Material Request Entries*";
  const entryHeadingWidth = fontHelveticaBold.widthOfTextAtSize(entryHeading, 9.5);
  page.drawText(entryHeading, { x: (width - entryHeadingWidth) / 2, y, size: 9.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  y -= 12;

  // 4. Data Table Header Columns (14 columns tailored for A4 Portrait: width = 555.28 pt)
  const columns = [
    { name: "Sr", width: 18 },
    { name: "Item Group*", width: 60 },
    { name: "Item Desc*", width: 75 },
    { name: "Unit*", width: 26 },
    { name: "Item Brand", width: 42 },
    { name: "Est Qty", width: 34 },
    { name: "Iss Qty", width: 34 },
    { name: "Quantity*", width: 40 },
    { name: "Bal Qty", width: 36 },
    { name: "Pending PR", width: 38 },
    { name: "Lead Period", width: 38 },
    { name: "Lead Period Date", width: 48 },
    { name: "Required Date*", width: 48 },
    { name: "Stock Qty", width: 38.28 },
  ];

  page.drawRectangle({
    x: marginX,
    y: y - 16,
    width: tableWidth,
    height: 16,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let curX = marginX;
  columns.forEach((col, idx) => {
    page.drawText(col.name, { x: curX + 2, y: y - 11, size: 5.8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    curX += col.width;
    if (idx < columns.length - 1) {
      page.drawLine({ start: { x: curX, y }, end: { x: curX, y: y - 16 }, thickness: 1, color: rgb(0, 0, 0) });
    }
  });

  y -= 16;

  // 5. Line Rows
  const lines = pr.items || pr.lines || pr.pr_items || pr.purchase_requisition_lines || [];
  const displayLines = lines.length > 0 ? lines : [
    {
      item_group: "General Construction",
      item_description: "Test From App",
      unit: "nos",
      item_brand: "-",
      est_qty: 0,
      iss_qty: 0,
      quantity: 123,
      bal_qty: 123,
      pending_pr: 0,
      lead_period: "",
      lead_period_date: reqDateStr || "07/08/2026",
      required_date: reqDateStr || "07/08/2026",
      stock_qty: 0,
    }
  ];

  displayLines.forEach((line: any, idx: number) => {
    const rowY = y - 11;
    page.drawRectangle({
      x: marginX,
      y: y - 16,
      width: tableWidth,
      height: 16,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    const itemReqDate = fmtDateStr(line.required_date || line.target_date) || reqDateStr;
    const vals = [
      String(idx + 1),
      sanitizeWinAnsi(line.category_group || line.item_group || "").substring(0, 16),
      sanitizeWinAnsi(line.item_description || line.description || "").substring(0, 18),
      sanitizeWinAnsi(line.unit || ""),
      sanitizeWinAnsi(line.brand || line.item_brand || "-"),
      Number(line.est_qty ?? 0).toFixed(3),
      Number(line.iss_qty ?? 0).toFixed(3),
      Number(line.quantity ?? line.qty ?? 0).toFixed(2),
      Number(line.bal_qty ?? line.quantity ?? 0).toFixed(2),
      Number(line.pending_pr ?? 0).toFixed(2),
      line.lead_period ? Number(line.lead_period).toFixed(2) : "",
      fmtDateStr(line.lead_period_date) || itemReqDate,
      itemReqDate,
      line.stock_qty != null && line.stock_qty !== "" ? Number(line.stock_qty).toFixed(3) : "",
    ];

    let rX = marginX;
    vals.forEach((v, cIdx) => {
      page.drawText(v, { x: rX + 2, y: rowY, size: 5.8, font: fontHelvetica, color: rgb(0, 0, 0) });
      rX += columns[cIdx].width;
      if (cIdx < columns.length - 1) {
        page.drawLine({ start: { x: rX, y }, end: { x: rX, y: y - 16 }, thickness: 1, color: rgb(0, 0, 0) });
      }
    });

    y -= 16;
  });

  // 6. Summary Rows Box (Attached to table bottom)
  const summaryBoxHeight = 52;
  page.drawRectangle({
    x: marginX,
    y: y - summaryBoxHeight,
    width: tableWidth,
    height: summaryBoxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const sRowH = summaryBoxHeight / 4;
  for (let i = 1; i < 4; i++) {
    page.drawLine({ start: { x: marginX, y: y - sRowH * i }, end: { x: width - marginX, y: y - sRowH * i }, thickness: 1, color: rgb(0, 0, 0) });
  }

  // Row 1 & 2 full-width labels
  page.drawText("Delivery Address", { x: marginX + 6, y: y - 9, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(deliveryAddress.substring(0, 95), { x: marginX + 95, y: y - 9, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText("Remarks", { x: marginX + 6, y: y - 9 - sRowH, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(remarks.substring(0, 95), { x: marginX + 95, y: y - 9 - sRowH, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  // Row 3 & 4 split vertical divider
  page.drawLine({ start: { x: midX, y: y - sRowH * 2 }, end: { x: midX, y: y - summaryBoxHeight }, thickness: 1, color: rgb(0, 0, 0) });

  page.drawText("Unlocked Project", { x: marginX + 6, y: y - 9 - sRowH * 2, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(unlockedProject, { x: marginX + 95, y: y - 9 - sRowH * 2, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText("Prepared By", { x: midX + 6, y: y - 9 - sRowH * 2, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(preparedBy, { x: midX + 95, y: y - 9 - sRowH * 2, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText("PR Release Date", { x: marginX + 6, y: y - 9 - sRowH * 3, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(prReleaseDate, { x: marginX + 95, y: y - 9 - sRowH * 3, size: 7.5, font: fontHelvetica, color: rgb(0, 0, 0) });

  page.drawText("Status", { x: midX + 6, y: y - 9 - sRowH * 3, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  page.drawText(status, { x: midX + 95, y: y - 9 - sRowH * 3, size: 7.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });

  y -= summaryBoxHeight + 14;

  // 7. Report History Section
  const historyHeading = "REPORT HISTORY";
  const histHeadingWidth = fontHelveticaBold.widthOfTextAtSize(historyHeading, 9.5);
  page.drawText(historyHeading, { x: (width - histHeadingWidth) / 2, y, size: 9.5, font: fontHelveticaBold, color: rgb(0, 0, 0) });
  y -= 12;

  const hCols = [
    { name: "FROM", width: 75 },
    { name: "TO", width: 75 },
    { name: "BY", width: 105 },
    { name: "AT", width: 95 },
    { name: "DAYS SINCE", width: 60 },
    { name: "REMARKS", width: 145.28 },
  ];

  page.drawRectangle({
    x: marginX,
    y: y - 16,
    width: tableWidth,
    height: 16,
    color: rgb(1, 1, 1),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });

  let hX = marginX;
  hCols.forEach((col, idx) => {
    page.drawText(col.name, { x: hX + 4, y: y - 11, size: 6.8, font: fontHelveticaBold, color: rgb(0, 0, 0) });
    hX += col.width;
    if (idx < hCols.length - 1) {
      page.drawLine({ start: { x: hX, y }, end: { x: hX, y: y - 16 }, thickness: 1, color: rgb(0, 0, 0) });
    }
  });

  y -= 16;

  const historyLogs = pr.history && Array.isArray(pr.history) ? pr.history : [];
  if (historyLogs.length === 0) {
    page.drawRectangle({
      x: marginX,
      y: y - 16,
      width: tableWidth,
      height: 16,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    const noHistText = "No history logs recorded";
    const noHistWidth = fontHelvetica.widthOfTextAtSize(noHistText, 7);
    page.drawText(noHistText, { x: (width - noHistWidth) / 2, y: y - 11, size: 7, font: fontHelvetica, color: rgb(0, 0, 0) });
  } else {
    historyLogs.forEach((log: any) => {
      const rowY = y - 11;
      page.drawRectangle({
        x: marginX,
        y: y - 16,
        width: tableWidth,
        height: 16,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });

      const hVals = [
        sanitizeWinAnsi(log.from || ""),
        sanitizeWinAnsi(log.to || ""),
        sanitizeWinAnsi(log.by || ""),
        sanitizeWinAnsi(log.at || ""),
        String(log.daysSince ?? ""),
        sanitizeWinAnsi(log.remarks || ""),
      ];

      let curHX = marginX;
      hVals.forEach((hv, cIdx) => {
        page.drawText(hv.substring(0, 25), { x: curHX + 4, y: rowY, size: 6.5, font: fontHelvetica, color: rgb(0, 0, 0) });
        curHX += hCols[cIdx].width;
        if (cIdx < hCols.length - 1) {
          page.drawLine({ start: { x: curHX, y }, end: { x: curHX, y: y - 16 }, thickness: 1, color: rgb(0, 0, 0) });
        }
      });

      y -= 16;
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: "application/pdf" });
}

/**
 * Triggers a direct browser download of the generated PR PDF file.
 */
export function downloadPurchaseRequisitionPdfFile(pr: any, pdfBlob: Blob) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  const safeNumber = (pr.pr_number || "DRAFT").replace(/[\/\\]/g, "_");
  a.download = `Purchase_Requisition_${safeNumber}.pdf`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
