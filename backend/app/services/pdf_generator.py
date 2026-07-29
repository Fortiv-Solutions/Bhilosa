from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from io import BytesIO
from datetime import datetime
from typing import Dict, Any, List

def money_format(value: Any) -> str:
    """Formats numeric value to Indian Rupee (INR) Lakhs/Crores grouping."""
    try:
        val_float = float(value or 0)
        s = f"{val_float:.2f}"
        parts = s.split('.')
        num = parts[0]
        dec = parts[1]
        
        if len(num) <= 3:
            res = num
        else:
            last_three = num[-3:]
            remaining = num[:-3]
            groups = []
            while remaining:
                groups.append(remaining[-2:])
                remaining = remaining[:-2]
            groups.reverse()
            res = ",".join(groups) + "," + last_three
            
        return f"INR {res}.{dec}"
    except Exception:
        return f"INR {value}"

def text_format(value: Any) -> str:
    if value is None or value == "" or str(value).strip().lower() in ["none", "null", "nan"]:
        return "-"
    return str(value).strip()

def truncate_text(value: str, max_length: int) -> str:
    val_str = text_format(value)
    if len(val_str) > max_length:
        return f"{val_str[:max_length - 3]}..."
    return val_str

def wrap_text(value: str, font_name: str, font_size: int, max_width: float) -> List[str]:
    words = text_format(value).split()
    if not words:
        return ["-"]
    lines = []
    current_line = ""
    for word in words:
        test_line = f"{current_line} {word}".strip() if current_line else word
        if stringWidth(test_line, font_name, font_size) <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)
    return lines

def draw_wrapped_text(c, value: str, x: float, y: float, max_width: float, line_height: float, font_name: str, font_size: int, color) -> float:
    lines = wrap_text(value, font_name, font_size, max_width)
    c.setFont(font_name, font_size)
    c.setFillColor(color)
    current_y = y
    for line in lines:
        c.drawString(x, current_y, line)
        current_y -= line_height
    return current_y

# Unified Brand Theme Colors
BRAND_COLOR = HexColor("#B58C40")       # Pramukh Warm Gold/Bronze
BRAND_LIGHT = HexColor("#F7F0E0")       # Soft Warm Background Highlight
INK_COLOR = HexColor("#14171F")         # Primary Charcoal Text
MUTED_COLOR = HexColor("#596373")       # Secondary Muted Text
BORDER_COLOR = HexColor("#D6DCE6")      # Clean Grid Lines
SOFT_BG = HexColor("#F5F7FA")           # Table Header Fill

def draw_header_banner(c, doc_title: str, doc_number: str, company_name: str, print_date: str) -> float:
    """Draws standardized top branding header banner across all PDF reports."""
    margin = 36
    page_width = 595
    
    # Top primary brand accent bar
    c.setFillColor(BRAND_COLOR)
    c.rect(0, 792, page_width, 50, fill=True, stroke=False)
    
    # Title & Subtitle in Banner
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(HexColor("#FFFFFF"))
    c.drawString(margin, 814, text_format(company_name).upper())
    
    c.setFont("Helvetica", 8)
    c.drawString(margin, 800, "PRAMUKH GROUP — PRAGATI CONSTRUCTION PLATFORM")
    
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(page_width - margin, 814, doc_title.upper())
    
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(page_width - margin, 800, f"NO: {text_format(doc_number)}")
    
    # Sub-header bar with print metadata
    c.setFillColor(SOFT_BG)
    c.rect(margin, 762, page_width - (margin * 2), 22, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(0.5)
    c.rect(margin, 762, page_width - (margin * 2), 22, fill=False, stroke=True)
    
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 10, 770, "Official Procurement & Inventory System Report")
    c.drawRightString(page_width - margin - 10, 770, f"Printed: {print_date}")
    
    return 748

def draw_signature_block(c, y: float, sig1: str = "Prepared By", sig2: str = "Checked & Verified By", sig3: str = "Approved By Management") -> float:
    """Draws standardized 3-column verification and signature block."""
    margin = 36
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(0.8)
    
    box_w = 150
    gap = 36
    
    # Signature line 1
    x1 = margin
    c.line(x1, y, x1 + box_w, y)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(x1 + 10, y - 12, sig1)
    
    # Signature line 2
    x2 = margin + box_w + gap
    c.line(x2, y, x2 + box_w, y)
    c.drawString(x2 + 10, y - 12, sig2)
    
    # Signature line 3
    x3 = margin + (box_w * 2) + (gap * 2)
    c.line(x3, y, x3 + box_w, y)
    c.drawString(x3 + 10, y - 12, sig3)
    
    return y - 24

def draw_footer_watermark(c, page_number: int, total_pages: int = 1):
    margin = 36
    page_width = 595
    c.setFont("Helvetica", 7)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin, 20, "This report is digitally generated by Pramukh Group ERP System. Confidential & Proprietary.")
    c.drawRightString(page_width - margin, 20, f"Page {page_number}")

# =========================================================================
# 1. PURCHASE REQUISITION (PR) PDF GENERATOR
# =========================================================================
def _qfmt(value: Any, dp: int = 2) -> str:
    """Numeric quantity formatting with a fixed number of decimals (blank-safe).
    No thousands separator — matches the reference report's quantity columns."""
    try:
        return f"{float(value or 0):.{dp}f}"
    except Exception:
        return f"{0:.{dp}f}"


def _dt(value: Any) -> str:
    """Date-only (dd/mm/yyyy) formatting; '-' when missing."""
    if value is None or str(value).strip() == "":
        return "-"
    s = str(value)
    # Accept ISO (YYYY-MM-DD...) and reformat to dd/mm/yyyy; else pass through.
    try:
        iso = s[:10]
        yy, mm_, dd = iso.split("-")
        if len(yy) == 4:
            return f"{dd}/{mm_}/{yy}"
    except Exception:
        pass
    return s


def _dtm(value: Any) -> str:
    """Date + time (dd/mm/yyyy HH:MM); '-' when missing."""
    if value is None or str(value).strip() == "":
        return "-"
    s = str(value).replace("T", " ")
    date_part = _dt(s[:10])
    time_part = s[11:16] if len(s) >= 16 else ""
    return f"{date_part} {time_part}".strip()


# Plain report grid palette (mirrors the reference black-bordered ERP report)
GRID_BLACK = HexColor("#000000")
GRID_HEADER_BG = HexColor("#F2F2F2")


def generate_purchase_requisition_pdf(pr: Dict[str, Any]) -> bytes:
    """Renders the Purchase Requisition in the standard ERP report layout:
    centred title block, bordered key/value grid, the 'Material Request Entries'
    line table, a delivery/remarks/status footer grid, and a Report History table.
    Every field degrades gracefully to '-' / 0.00 so partial data still renders."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=28,
        title=f"Purchase Requisition {text_format(pr.get('pr_number'))}",
    )
    avail = doc.width  # usable content width

    styles = getSampleStyleSheet()
    org_style = ParagraphStyle("org", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, alignment=1, leading=14)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, alignment=1, leading=9)
    doc_style = ParagraphStyle("doc", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, alignment=1, leading=15)
    print_style = ParagraphStyle("prt", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, alignment=1, leading=10)
    section_style = ParagraphStyle("sec", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, alignment=1, leading=12, spaceBefore=2, spaceAfter=2)
    cell = ParagraphStyle("cell", parent=styles["Normal"], fontName="Helvetica", fontSize=6, leading=7.5)
    cell_b = ParagraphStyle("cellb", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=6, leading=7.5)

    def P(text: str, bold: bool = False) -> Paragraph:
        return Paragraph(text_format(text).replace("&", "&amp;"), cell_b if bold else cell)

    story: List[Any] = []

    # ---- 1. Centred title block ---------------------------------------------
    org_name = pr.get("report_org") or pr.get("company_name") or "Pramukh Group"
    printed_by = pr.get("printed_by") or pr.get("prepared_by") or "System"
    printed_on = _dt(datetime.now().isoformat())
    story.append(Paragraph(text_format(org_name), org_style))
    story.append(Paragraph("Strategic ERP for Construction Co.", sub_style))
    story.append(Paragraph("Purchase Requisition", doc_style))
    story.append(Paragraph(f"Printed By: {text_format(printed_by)} on Date: {printed_on}", print_style))
    story.append(Spacer(1, 8))

    # ---- 2. Key/value info grid ---------------------------------------------
    info_data = [
        [P("P.R. No.", True), P(pr.get("pr_number")), P("P.R. Date*", True), P(_dt(pr.get("pr_date") or pr.get("requested_date") or pr.get("created_at")))],
        [P("Project Name*", True), P(pr.get("project_name")), P("Name of Company", True), P(pr.get("company_name"))],
        [P("Sub Project*", True), P(pr.get("sub_project")), P("Contractor Name", True), P(pr.get("contractor_name"))],
        [P("Cost Center", True), P(pr.get("cost_center")), P("", True), P("")],
        [P("Activity Names", True), P(pr.get("activity_names")), P("", True), P("")],
    ]
    info_w = [0.17 * avail, 0.37 * avail, 0.21 * avail, 0.25 * avail]
    info_tbl = Table(info_data, colWidths=info_w)
    info_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("BACKGROUND", (2, 0), (2, -1), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        # Cost Center + Activity Names value spans the remaining columns
        ("SPAN", (1, 3), (3, 3)),
        ("SPAN", (1, 4), (3, 4)),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 8))

    # ---- 3. Material Request Entries line table -----------------------------
    story.append(Paragraph("Material Request Entries*", section_style))

    headers = ["Sr", "Item Group*", "Item Desc*", "Unit*", "Item Brand", "Est Qty", "Iss Qty",
               "Quantity*", "Bal Qty", "Pending PR", "Lead Period", "Lead Period Date", "Required Date*", "Stock Qty"]
    line_rows: List[List[Any]] = [[P(h, True) for h in headers]]

    lines = pr.get("purchase_requisition_lines") or []
    if not lines:
        lines = [{"item_description": pr.get("title") or "-", "quantity": 0}]

    for idx, ln in enumerate(lines, 1):
        line_rows.append([
            P(str(idx)),
            P(ln.get("item_group")),
            P(ln.get("item_description") or ln.get("item_name")),
            P(ln.get("unit") or ln.get("unit_of_measure")),
            P(ln.get("item_brand") or ln.get("preferred_brand")),
            P(_qfmt(ln.get("est_qty"), 3)),
            P(_qfmt(ln.get("iss_qty"), 3)),
            P(_qfmt(ln.get("quantity"), 2)),
            P(_qfmt(ln.get("bal_qty") if ln.get("bal_qty") is not None else ln.get("pr_bal_qty"), 2)),
            P(_qfmt(ln.get("pending_pr") if ln.get("pending_pr") is not None else ln.get("ind_qty"), 2)),
            P(_qfmt(ln.get("lead_period") if ln.get("lead_period") is not None else ln.get("lead_period_days"), 2)),
            P(_dt(ln.get("lead_period_date"))),
            P(_dt(ln.get("required_date") or pr.get("required_date"))),
            P(_qfmt(ln.get("stock_qty") if ln.get("stock_qty") is not None else ln.get("project_stock"), 3)),
        ])

    line_fracs = [0.030, 0.090, 0.130, 0.045, 0.070, 0.062, 0.062, 0.066, 0.060, 0.064, 0.058, 0.083, 0.083, 0.077]
    line_w = [f * avail for f in line_fracs]
    line_tbl = Table(line_rows, colWidths=line_w, repeatRows=1)
    line_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (-1, 0), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (5, 1), (-1, -1), "RIGHT"),   # numeric columns right-aligned
        ("ALIGN", (0, 0), (0, -1), "CENTER"),   # Sr column
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(line_tbl)

    # ---- 4. Delivery / remarks / status footer grid -------------------------
    footer_data = [
        [P("Delivery Address", True), P(pr.get("delivery_address")), P("", True), P("")],
        [P("Remarks", True), P(pr.get("remarks") or pr.get("assigned_team_notes")), P("", True), P("")],
        [P("Unlocked Project", True), P(pr.get("unlocked_project") or "1.00"), P("Prepared By", True), P(pr.get("prepared_by"))],
        [P("PR Release Date", True), P(_dtm(pr.get("pr_release_date"))), P("Status", True), P(text_format(pr.get("status")).title())],
    ]
    footer_tbl = Table(footer_data, colWidths=info_w)
    footer_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("BACKGROUND", (2, 2), (2, -1), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("SPAN", (1, 0), (3, 0)),   # Delivery Address value spans
        ("SPAN", (1, 1), (3, 1)),   # Remarks value spans
    ]))
    story.append(footer_tbl)
    story.append(Spacer(1, 14))

    # ---- 5. Report History table --------------------------------------------
    hist_section = ParagraphStyle("hsec", parent=section_style, fontSize=8)
    story.append(Paragraph("R E P O R T&nbsp;&nbsp;H I S T O R Y", hist_section))

    hist = pr.get("report_history") or []
    if not hist:
        hist = [{
            "from": "Created", "to": text_format(pr.get("status")).title() or "Draft",
            "by": pr.get("prepared_by") or "System",
            "at": pr.get("pr_release_date") or pr.get("created_at"),
            "days_since": 0,
            "remarks": pr.get("remarks") or pr.get("assigned_team_notes") or "-",
        }]

    hist_cell = ParagraphStyle("hcell", parent=cell, fontSize=7, leading=9)
    hist_cell_b = ParagraphStyle("hcellb", parent=cell_b, fontSize=7, leading=9)
    hist_rows: List[List[Any]] = [[Paragraph(h, hist_cell_b) for h in ["FROM", "TO", "BY", "AT", "DAYS SINCE", "REMARKS"]]]
    for h in hist:
        hist_rows.append([
            Paragraph(text_format(h.get("from")), hist_cell),
            Paragraph(text_format(h.get("to")), hist_cell),
            Paragraph(text_format(h.get("by")), hist_cell),
            Paragraph(_dtm(h.get("at")), hist_cell),
            Paragraph(str(h.get("days_since", 0)), hist_cell),
            Paragraph(text_format(h.get("remarks")).replace("&", "&amp;"), hist_cell),
        ])
    hist_w = [0.13 * avail, 0.13 * avail, 0.18 * avail, 0.18 * avail, 0.11 * avail, 0.27 * avail]
    hist_tbl = Table(hist_rows, colWidths=hist_w, repeatRows=1)
    hist_tbl.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, GRID_BLACK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(hist_tbl)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# =========================================================================
# 2. PURCHASE ORDER (PO) PDF GENERATOR
# =========================================================================
def generate_purchase_order_pdf(po: Dict[str, Any]) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    margin = 36
    page_width = 595
    
    now_str = datetime.now().strftime("%d-%m-%Y %H:%M")
    po_no = po.get("po_number", "PO-0000")
    company_info = po.get("company") or {}
    company_name = company_info.get("name") or "PRAMUKH GROUP"
    
    y = draw_header_banner(c, "Purchase Order", po_no, company_name, now_str)
    
    # Vendor and Delivery Details Blocks
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(0.8)
    c.setFillColor(HexColor("#FFFFFF"))
    c.rect(margin, y - 82, 250, 82, fill=False, stroke=True)
    c.rect(margin + 260, y - 82, 263, 82, fill=False, stroke=True)
    
    # Vendor Info
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin + 10, y - 16, "SUPPLIER / VENDOR DETAILS")
    
    vendor_info = po.get("vendors") or {}
    vendor_name = vendor_info.get("display_name") or vendor_info.get("legal_name") or "Vendor"
    draw_wrapped_text(c, vendor_name, margin + 10, y - 30, 230, 11, "Helvetica-Bold", 9, INK_COLOR)
    
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 10, y - 48, f"GSTIN: {text_format(vendor_info.get('gst_number'))}")
    c.drawString(margin + 10, y - 60, f"PAN: {text_format(vendor_info.get('pan_number'))}")
    c.drawString(margin + 10, y - 72, f"Phone: {text_format(vendor_info.get('phone'))}")
    
    # Project & Delivery Info
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin + 270, y - 16, "PROJECT & DELIVERY DETAILS")
    
    project_info = po.get("projects") or {}
    proj_code = project_info.get("code") or "PRJ"
    proj_name = project_info.get("name") or "Site"
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(INK_COLOR)
    c.drawString(margin + 270, y - 30, f"Project: {proj_code} - {truncate_text(proj_name, 30)}")
    
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 270, y - 44, f"Delivery Loc: {truncate_text(po.get('delivery_location'), 35)}")
    deliv_date = str(po.get("delivery_date"))[:10] if po.get("delivery_date") else "-"
    c.drawString(margin + 270, y - 58, f"Delivery Date: {deliv_date}")
    pr_ref = po.get("purchase_requisitions") or {}
    c.drawString(margin + 270, y - 72, f"PR Reference: {text_format(pr_ref.get('pr_number'))}")
    
    y -= 100
    
    # Items Table Header
    c.setFillColor(SOFT_BG)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 8, y - 15, "Item Description & Spec")
    c.drawRightString(margin + 260, y - 15, "Qty")
    c.drawRightString(margin + 330, y - 15, "Rate")
    c.drawRightString(margin + 390, y - 15, "GST %")
    c.drawRightString(margin + 448, y - 15, "Tax Amt")
    c.drawRightString(margin + 514, y - 15, "Gross Amt")
    
    y -= 34
    
    lines = po.get("purchase_order_lines") or []
    subtotal = 0.0
    tax_total = 0.0
    
    for line in lines:
        if y < 220:
            draw_footer_watermark(c, 1)
            c.showPage()
            y = draw_header_banner(c, "Purchase Order", po_no, company_name, now_str)
            
        desc = line.get("item_description") or "-"
        qty = float(line.get("quantity") or 0)
        rate = float(line.get("unit_rate") or 0)
        base_amt = qty * rate
        tax_rate = float(line.get("tax_rate") or 18.0)
        tax_amt = base_amt * (tax_rate / 100.0)
        gross_amt = base_amt + tax_amt
        
        subtotal += base_amt
        tax_total += tax_amt
        
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(INK_COLOR)
        c.drawString(margin + 8, y, truncate_text(desc, 36))
        c.setFont("Helvetica", 8)
        c.drawRightString(margin + 260, y, f"{qty:,.2f}")
        c.drawRightString(margin + 330, y, money_format(rate))
        c.drawRightString(margin + 390, y, f"{tax_rate:.1f}%")
        c.drawRightString(margin + 448, y, money_format(tax_amt))
        c.drawRightString(margin + 514, y, money_format(gross_amt))
        
        c.setStrokeColor(BORDER_COLOR)
        c.setLineWidth(0.4)
        c.line(margin, y - 6, page_width - margin, y - 6)
        y -= 20

    # Totals Summary Box
    y -= 10
    totals_x = page_width - margin - 220
    c.setFillColor(BRAND_LIGHT)
    c.rect(totals_x, y - 64, 220, 64, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.rect(totals_x, y - 64, 220, 64, fill=False, stroke=True)
    
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(totals_x + 10, y - 16, "Subtotal:")
    c.drawRightString(totals_x + 210, y - 16, money_format(subtotal))
    
    c.drawString(totals_x + 10, y - 32, "Total Tax (GST):")
    c.drawRightString(totals_x + 210, y - 32, money_format(tax_total))
    
    grand_total = subtotal + tax_total
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(INK_COLOR)
    c.drawString(totals_x + 10, y - 52, "Total Payable:")
    c.setFillColor(BRAND_COLOR)
    c.drawRightString(totals_x + 210, y - 52, money_format(po.get("total_amount") or grand_total))
    
    # Terms & Conditions Box
    y -= 80
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin, y, "STANDARD TERMS & CONDITIONS (GST 194Q & RERA COMPLIANT)")
    
    terms_text = (
        "1. Material must match approved specifications. 2. TDS under section 194Q (0.1%) shall be deducted as per IT Act. "
        "3. Statutory GST Invoice must be uploaded on GST portal before payment release. "
        "4. Supplier provides 5-year RERA defect liability guarantee for structural materials."
    )
    draw_wrapped_text(c, terms_text, margin, y - 14, 520, 10, "Helvetica", 7, INK_COLOR)
    
    y = max(y - 65, 80)
    draw_signature_block(c, y, "Prepared By (Procurement)", "Verified By (Finance)", "Approved By (MD / Management)")
    
    draw_footer_watermark(c, 1)
    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# =========================================================================
# 3. PURCHASE BILLS / BIDS (PB) PDF GENERATOR
# =========================================================================
def generate_purchase_bill_pdf(pb: Dict[str, Any]) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    margin = 36
    page_width = 595
    
    now_str = datetime.now().strftime("%d-%m-%Y %H:%M")
    bill_no = pb.get("bill_number") or pb.get("pb_number") or "PB-0000"
    company_info = pb.get("company") or {}
    company_name = company_info.get("name") or "PRAMUKH GROUP"
    
    y = draw_header_banner(c, "Purchase Bill Report", bill_no, company_name, now_str)
    
    # Metadata Grid Box
    c.setFillColor(BRAND_LIGHT)
    c.rect(margin, y - 64, page_width - margin * 2, 64, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(0.8)
    c.rect(margin, y - 64, page_width - margin * 2, 64, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin + 12, y - 16, "BILL & ACCOUNTING DETAILS")
    c.drawString(margin + 280, y - 16, "VENDOR & PROJECT INFO")
    
    c.setFont("Helvetica", 8)
    c.setFillColor(INK_COLOR)
    c.drawString(margin + 12, y - 30, f"Bill No: {bill_no}")
    c.drawString(margin + 12, y - 44, f"Supplier Bill No: {text_format(pb.get('supplier_bill_no'))}")
    c.drawString(margin + 12, y - 58, f"Accounting Date: {text_format(str(pb.get('accounting_date'))[:10])}")
    
    c.drawString(margin + 280, y - 30, f"Project: {text_format(pb.get('project_name'))}")
    c.drawString(margin + 280, y - 44, f"Supplier: {text_format(pb.get('supplier_name'))}")
    c.drawString(margin + 280, y - 58, f"Tax Status: {text_format(pb.get('tax_status', 'Regular GST'))}")
    
    y -= 84
    
    # Items Table Header
    c.setFillColor(SOFT_BG)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 8, y - 15, "Sr")
    c.drawString(margin + 28, y - 15, "GRN Ref")
    c.drawString(margin + 100, y - 15, "PO Ref")
    c.drawString(margin + 170, y - 15, "Item Description")
    c.drawRightString(margin + 340, y - 15, "Qty")
    c.drawRightString(margin + 410, y - 15, "Bill Rate")
    c.drawRightString(margin + 514, y - 15, "Net Amount")
    
    y -= 34
    
    lines = pb.get("purchase_bill_lines") or []
    if not lines:
        lines = [{
            "grn_number": pb.get("grn_number", "-"),
            "po_number": pb.get("po_number", "-"),
            "item_description": pb.get("description") or "Purchase Bill Line Entry",
            "quantity": pb.get("quantity", 1),
            "bill_rate": pb.get("total_amount", 0),
            "net_amount": pb.get("total_amount", 0)
        }]
        
    grand_tot = 0.0
    for idx, line in enumerate(lines, 1):
        if y < 140:
            draw_footer_watermark(c, 1)
            c.showPage()
            y = draw_header_banner(c, "Purchase Bill Report", bill_no, company_name, now_str)
            
        grn_ref = line.get("grn_number") or "-"
        po_ref = line.get("po_number") or "-"
        desc = line.get("item_description") or "-"
        qty = float(line.get("quantity") or 0)
        rate = float(line.get("bill_rate") or line.get("unit_rate") or 0)
        net_amt = float(line.get("net_amount") or (qty * rate))
        grand_tot += net_amt
        
        c.setFont("Helvetica", 8)
        c.setFillColor(INK_COLOR)
        c.drawString(margin + 8, y, str(idx))
        c.drawString(margin + 28, y, truncate_text(grn_ref, 12))
        c.drawString(margin + 100, y, truncate_text(po_ref, 12))
        c.drawString(margin + 170, y, truncate_text(desc, 30))
        c.drawRightString(margin + 340, y, f"{qty:,.2f}")
        c.drawRightString(margin + 410, y, money_format(rate))
        c.drawRightString(margin + 514, y, money_format(net_amt))
        
        c.setStrokeColor(BORDER_COLOR)
        c.setLineWidth(0.4)
        c.line(margin, y - 6, page_width - margin, y - 6)
        y -= 20

    # Total Box
    y -= 10
    c.setFillColor(BRAND_LIGHT)
    c.rect(margin + 300, y - 28, 223, 28, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.rect(margin + 300, y - 28, 223, 28, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(INK_COLOR)
    c.drawString(margin + 310, y - 18, "Grand Total Payable:")
    c.setFillColor(BRAND_COLOR)
    c.drawRightString(margin + 514, y - 18, money_format(grand_tot if grand_tot > 0 else pb.get("total_amount", 0)))
    
    y = max(y - 70, 80)
    draw_signature_block(c, y, "Prepared By (Billing)", "Checked By (Accountant)", "Approved By (Finance Head)")
    
    draw_footer_watermark(c, 1)
    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# =========================================================================
# 4. GOODS RECEIVED NOTE (GRN) PDF GENERATOR
# =========================================================================
def generate_goods_receipt_note_pdf(grn: Dict[str, Any]) -> bytes:
    """Renders the Goods Received Note in the standard ERP report layout
    (landscape): company header + address, key/value info grid, vehicle &
    weighbridge block, the wide 'Purchase Entries' line table, totals,
    remarks/accounting, status, and a Report History table. Every field
    degrades gracefully to '-' / 0.00 so partial data still renders."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24,
        title=f"Goods Received Note {text_format(grn.get('grn_number'))}",
    )
    avail = doc.width

    styles = getSampleStyleSheet()
    org_style = ParagraphStyle("g_org", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, alignment=1, leading=14)
    addr_style = ParagraphStyle("g_addr", parent=styles["Normal"], fontName="Helvetica", fontSize=7, alignment=1, leading=9)
    doc_style = ParagraphStyle("g_doc", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, alignment=1, leading=15)
    print_style = ParagraphStyle("g_prt", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, alignment=1, leading=10)
    section_style = ParagraphStyle("g_sec", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, alignment=1, leading=12, spaceBefore=2, spaceAfter=2)
    cell = ParagraphStyle("g_cell", parent=styles["Normal"], fontName="Helvetica", fontSize=6, leading=7.5)
    cell_b = ParagraphStyle("g_cellb", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=6, leading=7.5)

    def P(text_val: str, bold: bool = False) -> Paragraph:
        return Paragraph(text_format(text_val).replace("&", "&amp;"), cell_b if bold else cell)

    story: List[Any] = []

    # ---- 1. Centred company header ------------------------------------------
    company_name = grn.get("company_name") or grn.get("project_name") or "Pramukh Group"
    printed_by = grn.get("printed_by") or "System"
    story.append(Paragraph(text_format(company_name), org_style))
    if grn.get("company_address"):
        story.append(Paragraph(text_format(grn.get("company_address")).replace("&", "&amp;"), addr_style))
    story.append(Paragraph("Goods Received Note", doc_style))
    story.append(Paragraph(f"Printed By: {text_format(printed_by)} on Date: {_dt(datetime.now().isoformat())}", print_style))
    story.append(Spacer(1, 8))

    # ---- 2. Key/value info grid ---------------------------------------------
    info_w = [0.15 * avail, 0.35 * avail, 0.15 * avail, 0.35 * avail]
    info_data = [
        [P("QC No.", True), P(grn.get("qc_no")), P("GR No.", True), P(grn.get("grn_number"))],
        [P("GRN Date*", True), P(_dtm(grn.get("grn_date"))), P("Project Name*", True), P(grn.get("project_name"))],
        [P("Name of Company", True), P(company_name), P("Supplier Name*", True), P(grn.get("supplier_name"))],
        [P("Phone No.", True), P(grn.get("phone")), P("Mobile No.", True), P(grn.get("mobile"))],
        [P("Godown Name*", True), P(grn.get("godown_name")), P("Dealer Name", True), P(grn.get("dealer_name"))],
        [P("Challan No.*", True), P(grn.get("challan_no")), P("Transporter Name", True), P(grn.get("transporter_name"))],
    ]
    info_tbl = Table(info_data, colWidths=info_w)
    info_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("BACKGROUND", (2, 0), (2, -1), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(info_tbl)

    # ---- 3. Vehicle & weighbridge block -------------------------------------
    veh_data = [
        [P("Vehicle No", True), P(grn.get("vehicle_no")), P("Volume In Brass", True), P(grn.get("volume_in_brass") or "0.00")],
        [P("In Weight", True), P(grn.get("in_weight") or "0.00"), P("Out Weight", True), P(grn.get("out_weight") or "0.00")],
        [P("Net Weight", True), P(grn.get("net_weight") or "0.00"), P("GRN Weight", True), P(grn.get("grn_weight") or "0.00")],
        [P("From P.O.s", True), P(grn.get("po_numbers") or grn.get("po_number")), P("", True), P("")],
    ]
    veh_tbl = Table(veh_data, colWidths=info_w)
    veh_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("BACKGROUND", (2, 0), (2, -1), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("SPAN", (1, 3), (3, 3)),  # From P.O.s value spans
    ]))
    story.append(veh_tbl)
    story.append(Spacer(1, 8))

    # ---- 4. Purchase Entries line table -------------------------------------
    story.append(Paragraph("Purchase Entries", section_style))
    headers = ["Sr", "PO No.*", "Item Group*", "Item Description*", "Item Code", "Item Brand*", "Unit*",
               "Approved Qty", "PO Balance Qty", "Return Qty", "Challan Qty", "Received Qty",
               "Balance Allowed", "P.R No*", "Current Balance Qty"]
    line_rows: List[List[Any]] = [[P(h, True) for h in headers]]

    lines = grn.get("grn_lines") or []
    total_received = 0.0
    for idx, ln in enumerate(lines, 1):
        recv = float(ln.get("received_qty") or 0)
        total_received += recv
        line_rows.append([
            P(str(idx)),
            P(ln.get("po_number")),
            P(ln.get("item_group")),
            P(ln.get("item_description") or ln.get("item_name")),
            P(ln.get("item_code")),
            P(ln.get("item_brand")),
            P(ln.get("unit")),
            P(_qfmt(ln.get("approved_qty"), 2)),
            P(_qfmt(ln.get("po_balance_qty"), 2)),
            P(_qfmt(ln.get("return_qty"), 3)),
            P(_qfmt(ln.get("challan_qty") if ln.get("challan_qty") is not None else recv, 2)),
            P(_qfmt(recv, 2)),
            P(_qfmt(ln.get("balance_allowed"), 3)),
            P(ln.get("pr_number")),
            P(_qfmt(ln.get("current_balance_qty"), 2)),
        ])
    if not lines:
        line_rows.append([P("1")] + [P("-")] * 14)

    lf = [0.028, 0.098, 0.078, 0.150, 0.058, 0.058, 0.040, 0.060, 0.066, 0.052, 0.058, 0.058, 0.060, 0.078, 0.058]
    line_w = [f * avail for f in lf]
    line_tbl = Table(line_rows, colWidths=line_w, repeatRows=1)
    line_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (-1, 0), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (7, 1), (12, -1), "RIGHT"),
        ("ALIGN", (14, 1), (14, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(line_tbl)

    # ---- 5. Totals / remarks / accounting / status footer -------------------
    foot_data = [
        [P("Total Received Qty*", True), P(_qfmt(grn.get("total_received_qty") if grn.get("total_received_qty") is not None else total_received, 2)), P("", True), P("")],
        [P("Remarks", True), P(grn.get("remarks")), P("", True), P("")],
        [P("Account Posting Material Amount", True), P(money_format(grn.get("account_posting_amount") or grn.get("total_amount") or 0)), P("Asset Amount", True), P(money_format(grn.get("asset_amount") or 0))],
        [P("PB Lines Created", True), P(_qfmt(grn.get("pb_lines_created"), 2)), P("Unlocked FY", True), P(grn.get("unlocked_fy") or "1.00")],
        [P("Status", True), P(text_format(grn.get("status")).title()), P("", True), P("")],
    ]
    foot_tbl = Table(foot_data, colWidths=info_w)
    foot_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("BACKGROUND", (2, 2), (2, 3), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("SPAN", (1, 0), (3, 0)),  # Total Received Qty
        ("SPAN", (1, 1), (3, 1)),  # Remarks
        ("SPAN", (1, 4), (3, 4)),  # Status
    ]))
    story.append(Spacer(1, 6))
    story.append(foot_tbl)
    story.append(Spacer(1, 14))

    # ---- 6. Report History --------------------------------------------------
    hist_section = ParagraphStyle("g_hsec", parent=section_style, fontSize=8)
    story.append(Paragraph("R E P O R T&nbsp;&nbsp;H I S T O R Y", hist_section))
    hist = grn.get("report_history") or []
    if not hist:
        hist = [{
            "from": "Created", "to": text_format(grn.get("status")).title() or "Draft",
            "by": printed_by, "at": grn.get("grn_date") or grn.get("created_at"),
            "days_since": 0, "remarks": grn.get("remarks") or "-",
        }]
    hist_cell = ParagraphStyle("g_hcell", parent=cell, fontSize=7, leading=9)
    hist_cell_b = ParagraphStyle("g_hcellb", parent=cell_b, fontSize=7, leading=9)
    hist_rows: List[List[Any]] = [[Paragraph(h, hist_cell_b) for h in ["FROM", "TO", "BY", "AT", "DAYS SINCE", "REMARKS"]]]
    for h in hist:
        hist_rows.append([
            Paragraph(text_format(h.get("from")), hist_cell),
            Paragraph(text_format(h.get("to")), hist_cell),
            Paragraph(text_format(h.get("by")), hist_cell),
            Paragraph(_dtm(h.get("at")), hist_cell),
            Paragraph(str(h.get("days_since", 0)), hist_cell),
            Paragraph(text_format(h.get("remarks")).replace("&", "&amp;"), hist_cell),
        ])
    hist_w = [0.11 * avail, 0.11 * avail, 0.16 * avail, 0.16 * avail, 0.10 * avail, 0.36 * avail]
    hist_tbl = Table(hist_rows, colWidths=hist_w, repeatRows=1)
    hist_tbl.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, GRID_BLACK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(hist_tbl)

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# =========================================================================
# 5. SHARED HOUSE-STYLE REPORT HELPERS (used by the MR + RFQ reports)
# =========================================================================
def _report_styles() -> Dict[str, Any]:
    """Shared paragraph styles for the house-style bordered reports."""
    styles = getSampleStyleSheet()
    return {
        "org": ParagraphStyle("h_org", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, alignment=1, leading=14),
        "sub": ParagraphStyle("h_sub", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, alignment=1, leading=9),
        "doc": ParagraphStyle("h_doc", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=12, alignment=1, leading=15),
        "prt": ParagraphStyle("h_prt", parent=styles["Normal"], fontName="Helvetica", fontSize=7.5, alignment=1, leading=10),
        "sec": ParagraphStyle("h_sec", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, alignment=1, leading=12, spaceBefore=2, spaceAfter=2),
        "cell": ParagraphStyle("h_cell", parent=styles["Normal"], fontName="Helvetica", fontSize=6.5, leading=8),
        "cell_b": ParagraphStyle("h_cellb", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=6.5, leading=8),
    }


def _P(st: Dict[str, Any], value: Any, bold: bool = False) -> Paragraph:
    """Escaped paragraph cell helper."""
    return Paragraph(text_format(value).replace("&", "&amp;"), st["cell_b"] if bold else st["cell"])


def _title_block(story: List[Any], st: Dict[str, Any], org: str, doc_title: str, printed_by: str, address: str = "") -> None:
    """Centred org / address / document title / printed-by header."""
    story.append(Paragraph(text_format(org).upper(), st["org"]))
    story.append(Paragraph(text_format(address) if address else "Strategic ERP for Construction Co.", st["sub"]))
    story.append(Paragraph(doc_title, st["doc"]))
    story.append(Paragraph(f"Printed By: {text_format(printed_by)} on Date: {_dt(datetime.now().isoformat())}", st["prt"]))
    story.append(Spacer(1, 8))


KV_FRACS = [0.19, 0.33, 0.20, 0.28]


def _kv_grid(st: Dict[str, Any], rows: List[List[Any]], avail: float, spans: List[Any] = None) -> Table:
    """Bordered 4-column key/value grid: (label, value, label, value) per row."""
    data = [[_P(st, r[0], True), _P(st, r[1]), _P(st, r[2], True), _P(st, r[3])] for r in rows]
    tbl = Table(data, colWidths=[f * avail for f in KV_FRACS])
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("BACKGROUND", (2, 0), (2, -1), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if spans:
        style.extend(spans)
    tbl.setStyle(TableStyle(style))
    return tbl


def _lines_table(st: Dict[str, Any], headers: List[str], rows: List[List[Any]], fracs: List[float],
                 avail: float, numeric_from: int = 0) -> Table:
    """Bordered line-items table with a shaded, repeating header row."""
    data = [[_P(st, h, True) for h in headers]] + [[_P(st, c) for c in r] for r in rows]
    tbl = Table(data, colWidths=[f * avail for f in fracs], repeatRows=1)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (-1, 0), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    if numeric_from:
        style.append(("ALIGN", (numeric_from, 1), (-1, -1), "RIGHT"))
    tbl.setStyle(TableStyle(style))
    return tbl


def _footer_grid(st: Dict[str, Any], rows: List[List[Any]], avail: float, spans: List[Any]) -> Table:
    """Bordered footer key/value grid (remarks, totals, status)."""
    data = [[_P(st, r[0], True), _P(st, r[1]), _P(st, r[2], True), _P(st, r[3])] for r in rows]
    tbl = Table(data, colWidths=[f * avail for f in KV_FRACS])
    tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID_BLACK),
        ("BACKGROUND", (0, 0), (0, -1), GRID_HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ] + spans))
    return tbl


def _report_history(story: List[Any], st: Dict[str, Any], hist: List[Dict[str, Any]], avail: float,
                    fb_status: Any, fb_by: Any, fb_at: Any, fb_remarks: Any) -> None:
    """Appends the standard REPORT HISTORY table (falls back to one derived row)."""
    story.append(Spacer(1, 14))
    story.append(Paragraph("R E P O R T&nbsp;&nbsp;H I S T O R Y", ParagraphStyle("rh_s", parent=st["sec"], fontSize=8)))
    if not hist:
        hist = [{
            "from": "Created",
            "to": text_format(fb_status).title(),
            "by": fb_by,
            "at": fb_at,
            "days_since": 0,
            "remarks": fb_remarks or "-",
        }]
    hc = ParagraphStyle("rh_c", parent=st["cell"], fontSize=7, leading=9)
    hcb = ParagraphStyle("rh_cb", parent=st["cell_b"], fontSize=7, leading=9)
    rows: List[List[Any]] = [[Paragraph(h, hcb) for h in ["FROM", "TO", "BY", "AT", "DAYS SINCE", "REMARKS"]]]
    for h in hist:
        rows.append([
            Paragraph(text_format(h.get("from")), hc),
            Paragraph(text_format(h.get("to")), hc),
            Paragraph(text_format(h.get("by")), hc),
            Paragraph(_dtm(h.get("at")), hc),
            Paragraph(str(h.get("days_since", 0)), hc),
            Paragraph(text_format(h.get("remarks")).replace("&", "&amp;"), hc),
        ])
    tbl = Table(rows, colWidths=[0.13 * avail, 0.13 * avail, 0.18 * avail, 0.18 * avail, 0.11 * avail, 0.27 * avail], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, GRID_BLACK),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)


# =========================================================================
# 6. MATERIAL REQUEST (MR) PDF GENERATOR — house style
# =========================================================================
def generate_material_request_pdf(mr: Dict[str, Any]) -> bytes:
    """Renders the Material Request in the standard bordered ERP report layout."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=28,
        title=f"Material Request {text_format(mr.get('mr_number'))}",
    )
    avail = doc.width
    st = _report_styles()
    story: List[Any] = []

    printed_by = mr.get("printed_by") or mr.get("raised_by_name") or "System"
    _title_block(story, st, mr.get("report_org") or mr.get("company_name") or "Pramukh Group",
                 "Material Request", printed_by)

    story.append(_kv_grid(st, [
        ["M.R. No.", mr.get("mr_number"), "M.R. Date*", _dt(mr.get("mr_date") or mr.get("created_at"))],
        ["Project Name*", mr.get("project_name"), "Name of Company", mr.get("company_name")],
        ["Sub Project*", mr.get("sub_project"), "Required Date*", _dt(mr.get("required_date"))],
        ["Work Activity", mr.get("work_activity"), "Priority", text_format(mr.get("priority")).title()],
        ["Raised By", mr.get("raised_by_name"), "Source", mr.get("source")],
    ], avail))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Material Request Entries*", st["sec"]))
    lines = mr.get("material_request_lines") or [{"item_description": mr.get("title") or "-", "quantity": 0}]
    rows: List[List[Any]] = []
    total_val = 0.0
    for idx, ln in enumerate(lines, 1):
        qty = float(ln.get("quantity") or 0)
        rate = float(ln.get("estimated_rate") or 0)
        val = qty * rate
        total_val += val
        rows.append([
            str(idx), ln.get("item_group"), ln.get("item_description"), ln.get("unit"),
            ln.get("item_brand") or ln.get("preferred_brand"),
            _qfmt(qty), _qfmt(rate), _qfmt(val),
            _dt(ln.get("required_date") or mr.get("required_date")),
            _qfmt(ln.get("project_stock"), 3), ln.get("remarks"),
        ])
    story.append(_lines_table(st, ["Sr", "Item Group*", "Item Desc*", "Unit*", "Item Brand", "Quantity*",
                                   "Est Rate", "Est Value", "Required Date*", "Stock Qty", "Remarks"],
                              rows, [0.032, 0.098, 0.170, 0.050, 0.082, 0.072, 0.080, 0.086, 0.090, 0.076, 0.164],
                              avail, numeric_from=5))

    story.append(Spacer(1, 6))
    story.append(_footer_grid(st, [
        ["Total Estimated Value", _qfmt(mr.get("estimated_cost") or total_val), "", ""],
        ["Justification / Remarks", mr.get("justification") or mr.get("remarks"), "", ""],
        ["Stock Decision", mr.get("stock_decision"), "Status", text_format(mr.get("status")).title()],
    ], avail, [
        ("SPAN", (1, 0), (3, 0)),
        ("SPAN", (1, 1), (3, 1)),
        ("BACKGROUND", (2, 2), (2, 2), GRID_HEADER_BG),
    ]))

    _report_history(story, st, mr.get("report_history") or [], avail,
                    mr.get("status"), printed_by, mr.get("created_at"),
                    mr.get("justification") or mr.get("remarks"))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


# =========================================================================
# 7. REQUEST FOR QUOTATION (RFQ) PDF GENERATOR — house style
# =========================================================================
def generate_rfq_pdf(rfq: Dict[str, Any]) -> bytes:
    """Renders the RFQ with requested items and invited suppliers / quoted rates."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=28,
        title=f"RFQ {text_format(rfq.get('rfq_number'))}",
    )
    avail = doc.width
    st = _report_styles()
    story: List[Any] = []

    printed_by = rfq.get("printed_by") or "System"
    _title_block(story, st, rfq.get("report_org") or rfq.get("company_name") or "Pramukh Group",
                 "Request For Quotation", printed_by)

    story.append(_kv_grid(st, [
        ["R.F.Q No.", rfq.get("rfq_number"), "RFQ Date*", _dt(rfq.get("issue_date") or rfq.get("created_at"))],
        ["Project Name*", rfq.get("project_name"), "Name of Company", rfq.get("company_name")],
        ["From P.R. No.", rfq.get("pr_number"), "Quotation Due Date", _dt(rfq.get("due_date"))],
        ["Process Type", rfq.get("process_type") or "Quotation Request", "Status", text_format(rfq.get("status")).title()],
    ], avail))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Requested Items*", st["sec"]))
    items = rfq.get("items") or [{"item_description": rfq.get("title") or "-", "quantity": 0}]
    irows: List[List[Any]] = []
    for idx, it in enumerate(items, 1):
        irows.append([
            str(idx), it.get("item_group"), it.get("item_description"), it.get("item_code"), it.get("unit"),
            _qfmt(it.get("quantity")), _qfmt(it.get("previous_rate") or it.get("estimated_rate")),
            _dt(it.get("required_date")), it.get("specification") or it.get("remarks"),
        ])
    story.append(_lines_table(st, ["Sr", "Item Group", "Item Description*", "Item Code", "Unit*",
                                   "Quantity*", "Prev. Rate", "Required Date", "Specification / Remarks"],
                              irows, [0.034, 0.108, 0.210, 0.090, 0.055, 0.080, 0.085, 0.098, 0.240],
                              avail, numeric_from=5))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Invited Suppliers", st["sec"]))
    srows: List[List[Any]] = []
    for idx, s in enumerate(rfq.get("suppliers") or [], 1):
        srows.append([
            str(idx), s.get("supplier_name") or s.get("vendor_name"), s.get("email_to") or s.get("email"),
            s.get("phone"), s.get("gst_number"),
            _qfmt(s.get("quoted_amount")) if s.get("quoted_amount") is not None else "-",
            text_format(s.get("status")).title(),
        ])
    if not srows:
        srows = [["-", "No suppliers invited", "-", "-", "-", "-", "-"]]
    story.append(_lines_table(st, ["Sr", "Supplier Name", "Email", "Mobile No.", "GSTIN No.", "Quoted Amount", "Status"],
                              srows, [0.040, 0.250, 0.230, 0.110, 0.150, 0.115, 0.105], avail, numeric_from=5))

    story.append(Spacer(1, 8))
    story.append(_footer_grid(st, [
        ["Terms & Conditions", rfq.get("terms"), "", ""],
        ["Remarks", rfq.get("remarks"), "", ""],
        ["Prepared By", rfq.get("prepared_by") or printed_by, "Status", text_format(rfq.get("status")).title()],
    ], avail, [
        ("SPAN", (1, 0), (3, 0)),
        ("SPAN", (1, 1), (3, 1)),
        ("BACKGROUND", (2, 2), (2, 2), GRID_HEADER_BG),
    ]))

    _report_history(story, st, rfq.get("report_history") or [], avail,
                    rfq.get("status"), printed_by, rfq.get("created_at"), rfq.get("remarks"))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
