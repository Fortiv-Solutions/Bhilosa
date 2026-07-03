from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
from io import BytesIO
from datetime import datetime
from typing import Dict, Any, List

def money_format(value: float) -> str:
    # Formats to Indian Rupee (INR) format
    try:
        # Standard en_IN representation
        # Indian grouping is different: lakhs and crores (e.g. 12,34,567.00)
        s = f"{float(value or 0):.2f}"
        parts = s.split('.')
        num = parts[0]
        dec = parts[1]
        
        if len(num) <= 3:
            res = num
        else:
            last_three = num[-3:]
            remaining = num[:-3]
            # Group by 2s for lakhs/crores
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
    if value is None or value == "" or value == "None":
        return "-"
    return str(value)

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

def generate_purchase_requisition_pdf(pr: Dict[str, Any]) -> bytes:
    buffer = BytesIO()
    
    # Standard A4 size is 595.27 x 841.89 points
    # Standard margins are around 42 points
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    
    ink = HexColor("#14171F")
    muted = HexColor("#596373")
    line_color = HexColor("#D1D6E0")
    soft_bg = HexColor("#F5F7FA")
    
    y = 792
    
    # Header Drawing
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(muted)
    c.drawString(42, y, "PRAGATI PROJECT MANAGEMENT PLATFORM")
    
    y -= 20
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(ink)
    c.drawString(42, y, "PURCHASE REQUISITION")
    
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(553, y + 6, pr.get("pr_number", "-"))
    
    status_str = pr.get("status", "PENDING").replace("_", " ")
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawRightString(553, y - 8, f"Status: {status_str}")
    
    y -= 20
    c.setStrokeColor(line_color)
    c.setLineWidth(1)
    c.line(42, y, 553, y)
    
    y -= 24
    
    # Project & Requisition Info
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(muted)
    c.drawString(42, y, "Project")
    c.drawString(318, y, "Details")
    
    y -= 16
    project_info = pr.get("projects") or {}
    proj_code = project_info.get("code")
    proj_name = project_info.get("name")
    proj_text = f"{text_format(proj_code)} - {text_format(proj_name)}"
    
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(ink)
    c.drawString(42, y, truncate_text(proj_text, 42))
    c.drawString(318, y, truncate_text(pr.get("title", "-"), 34))
    
    y -= 22
    c.setFont("Helvetica", 10)
    
    req_date = pr.get("requested_date")
    if isinstance(req_date, datetime):
        req_date = req_date.strftime("%d-%m-%Y")
    elif req_date:
        req_date = str(req_date)[:10]
        
    c.drawString(42, y, f"Requested: {text_format(req_date)}")
    
    fin_req = "Required" if pr.get("finance_required") else "Not Required"
    c.drawString(318, y, f"Finance Review: {fin_req}")
    
    y -= 16
    req_deliv_date = pr.get("required_date")
    if isinstance(req_deliv_date, datetime):
        req_deliv_date = req_deliv_date.strftime("%d-%m-%Y")
    elif req_deliv_date:
        req_deliv_date = str(req_deliv_date)[:10]
        
    c.drawString(42, y, f"Required: {text_format(req_deliv_date)}")
    
    mr_info = pr.get("material_requests") or {}
    if mr_info:
        c.drawString(318, y, f"MR Number: {text_format(mr_info.get('mr_number'))}")
        
    y -= 24
    
    # Items Table Header
    c.setFillColor(soft_bg)
    c.rect(42, y - 22, 511, 24, fill=True, stroke=False)
    
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(muted)
    c.drawString(52, y - 14, "Item")
    c.drawString(340, y - 14, "Qty")
    c.drawString(420, y - 14, "Est Rate")
    
    y -= 44
    
    # Table Lines
    lines = pr.get("purchase_requisition_lines") or []
    for line in lines:
        if y < 170:
            break
            
        c.setFont("Helvetica", 9)
        c.setFillColor(ink)
        c.drawString(52, y, truncate_text(line.get("item_description", "-"), 60))
        c.drawString(340, y, f"{line.get('quantity', 0):,}")
        c.drawString(420, y, money_format(line.get("estimated_rate", 0)))
        y -= 18
        
    # Remarks
    notes = pr.get("assigned_team_notes")
    if notes:
        y -= 12
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(muted)
        c.drawString(42, y, "Remarks:")
        c.setFont("Helvetica", 9)
        c.setFillColor(ink)
        c.drawString(96, y, truncate_text(notes, 90))
        
    y -= 8
    c.setStrokeColor(line_color)
    c.line(42, y, 553, y)
    
    y -= 24
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(ink)
    c.drawString(360, y, "Estimated Total")
    c.drawRightString(553, y, money_format(pr.get("estimated_cost", 0)))
    
    # Footer & Signatures
    y -= 36
    c.setStrokeColor(line_color)
    c.line(42, y, 210, y)
    c.line(342, y, 510, y)
    
    y -= 14
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawString(42, y, "Prepared by PR Team")
    c.drawString(342, y, "Approved by Management")
    
    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

def generate_purchase_order_pdf(po: Dict[str, Any]) -> bytes:
    buffer = BytesIO()
    
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    
    # Color definition
    brand = HexColor("#B58C40")
    brand_light = HexColor("#F7F0E0")
    ink = HexColor("#14171F")
    muted = HexColor("#596373")
    border = HexColor("#D6DCE6")
    soft = HexColor("#F5F7FA")
    
    margin = 36
    page_width = 595
    y = 0
    page_number = 0
    
    def draw_footer():
        c.setFont("Helvetica", 7)
        c.setFillColor(muted)
        c.drawString(margin, 24, "This purchase order is system generated through Pragati Project Management Platform.")
        c.drawRightString(page_width - margin, 24, f"Page {page_number}")
        
    def draw_header():
        nonlocal page_number, y
        page_number += 1
        
        # Primary Brand Bar
        c.setFillColor(brand)
        c.rect(0, 790, page_width, 52, fill=True, stroke=False)
        
        # Light Brand Box for metadata
        c.setFillColor(brand_light)
        c.rect(margin, 708, page_width - margin * 2, 70, fill=True, stroke=False)
        
        # Header text
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(HexColor("#FFFFFF"))
        c.drawString(margin, 812, "PRAMUKH")
        
        c.setFont("Helvetica-Bold", 8)
        c.drawString(margin, 798, "PRAGATI PROJECT MANAGEMENT PLATFORM")
        
        c.setFont("Helvetica-Bold", 18)
        c.drawRightString(page_width - margin, 812, "PURCHASE ORDER")
        
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(page_width - margin, 798, po.get("po_number", "-"))
        
        # Metadata values
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(ink)
        
        po_date = po.get("po_date")
        if isinstance(po_date, datetime):
            po_date = po_date.strftime("%d-%m-%Y")
        elif po_date:
            po_date = str(po_date)[:10]
            
        c.drawString(margin + 16, 756, f"PO Date: {text_format(po_date)}")
        
        status_str = po.get("status", "DRAFT").replace("_", " ")
        c.setFont("Helvetica", 9)
        c.setFillColor(muted)
        c.drawString(margin + 16, 740, f"Status: {status_str}")
        
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(ink)
        pr_ref = po.get("purchase_requisitions") or {}
        c.drawString(margin + 190, 756, f"PR Ref: {text_format(pr_ref.get('pr_number'))}")
        
        pr_req_date = pr_ref.get("required_date")
        if isinstance(pr_req_date, datetime):
            pr_req_date = pr_req_date.strftime("%d-%m-%Y")
        elif pr_req_date:
            pr_req_date = str(pr_req_date)[:10]
            
        c.setFont("Helvetica", 9)
        c.setFillColor(muted)
        c.drawString(margin + 190, 740, f"Required: {text_format(pr_req_date)}")
        
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(ink)
        project_info = po.get("projects") or {}
        proj_text = f"{text_format(project_info.get('code'))} - {text_format(project_info.get('name'))}"
        c.drawString(margin + 355, 756, f"Project: {truncate_text(proj_text, 48)}")
        
        deliv_date = po.get("delivery_date")
        if isinstance(deliv_date, datetime):
            deliv_date = deliv_date.strftime("%d-%m-%Y")
        elif deliv_date:
            deliv_date = str(deliv_date)[:10]
            
        c.setFont("Helvetica", 9)
        c.setFillColor(muted)
        c.drawString(margin + 355, 740, f"Delivery: {text_format(deliv_date)}")
        
        y = 682

    draw_header()
    
    # Vendor and Delivery Details Blocks
    c.setStrokeColor(border)
    c.setLineWidth(1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.rect(margin, y - 82, 248, 82, fill=False, stroke=True)
    c.rect(margin + 264, y - 82, 259, 82, fill=False, stroke=True)
    
    # Vendor Column details
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(brand)
    c.drawString(margin + 12, y - 18, "Vendor Details")
    
    vendor_info = po.get("vendors") or {}
    vendor_display = vendor_info.get("display_name") or vendor_info.get("legal_name") or "Vendor"
    draw_wrapped_text(c, vendor_display, margin + 12, y - 34, 220, 12, "Helvetica-Bold", 10, ink)
    
    c.setFont("Helvetica", 8)
    c.setFillColor(muted)
    c.drawString(margin + 12, y - 52, f"GST: {text_format(vendor_info.get('gst_number'))}")
    c.drawString(margin + 12, y - 66, f"PAN: {text_format(vendor_info.get('pan_number'))}")
    
    # Delivery Column details
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(brand)
    c.drawString(margin + 276, y - 18, "Delivery and Contact")
    
    draw_wrapped_text(c, text_format(po.get("delivery_location")), margin + 276, y - 34, 225, 11, "Helvetica", 8, ink)
    
    c.setFont("Helvetica", 8)
    c.setFillColor(muted)
    c.drawString(margin + 276, y - 58, f"Phone: {text_format(vendor_info.get('phone'))}")
    c.drawString(margin + 276, y - 72, f"Email: {text_format(vendor_info.get('email'))}")
    
    y -= 104
    
    # Table Header
    c.setFillColor(soft)
    c.rect(margin, y - 24, 523, 24, fill=True, stroke=False)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(muted)
    c.drawString(margin + 10, y - 15, "Item Description")
    c.drawRightString(margin + 270, y - 15, "Qty")
    c.drawRightString(margin + 338, y - 15, "Rate")
    c.drawRightString(margin + 389, y - 15, "GST")
    c.drawRightString(margin + 448, y - 15, "Tax")
    c.drawRightString(margin + 512, y - 15, "Amount")
    
    y -= 42
    
    # Table Row Content
    lines = po.get("purchase_order_lines") or []
    for line in lines:
        if y < 170:
            # Create a new page if table runs out of space
            draw_footer()
            c.showPage()
            draw_header()
            
            # Draw Table Header again
            c.setFillColor(soft)
            c.rect(margin, y - 24, 523, 24, fill=True, stroke=False)
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(muted)
            c.drawString(margin + 10, y - 15, "Item Description")
            c.drawRightString(margin + 270, y - 15, "Qty")
            c.drawRightString(margin + 338, y - 15, "Rate")
            c.drawRightString(margin + 389, y - 15, "GST")
            c.drawRightString(margin + 448, y - 15, "Tax")
            c.drawRightString(margin + 512, y - 15, "Amount")
            y -= 42
            
        base_amount = float(line.get("line_total", 0))
        tax_rate = float(line.get("tax_rate", 0))
        tax_amount = base_amount * (tax_rate / 100.0)
        gross_amount = base_amount + tax_amount
        
        item_wrapped = wrap_text(line.get("item_description", "-"), "Helvetica", 8, 210)
        row_height = max(22, len(item_wrapped) * 11 + 8)
        
        # Row bottom divider line
        c.setStrokeColor(border)
        c.setLineWidth(0.5)
        c.line(margin, y + 8, page_width - margin, y + 8)
        
        # Item Description
        c.setFont("Helvetica", 8)
        c.setFillColor(ink)
        curr_desc_y = y
        for idx, desc_line in enumerate(item_wrapped):
            # Bold for the first line of the item name
            c.setFont("Helvetica-Bold" if idx == 0 else "Helvetica", 8)
            c.drawString(margin + 10, curr_desc_y, desc_line)
            curr_desc_y -= 11
            
        # Table Columns
        c.setFont("Helvetica", 8)
        c.setFillColor(ink)
        c.drawRightString(margin + 270, y, f"{line.get('quantity', 0):,}")
        c.drawRightString(margin + 338, y, money_format(line.get("unit_rate", 0)))
        c.drawRightString(margin + 389, y, f"{tax_rate}%")
        c.drawRightString(margin + 448, y, money_format(tax_amount))
        
        c.setFont("Helvetica-Bold", 8)
        c.drawRightString(margin + 512, y, money_format(gross_amount))
        
        y -= row_height
        
    y -= 10
    c.setStrokeColor(border)
    c.setLineWidth(1)
    c.line(margin, y, page_width - margin, y)
    y -= 24
    
    # Totals box
    totals_x = page_width - margin - 190
    c.setFillColor(brand_light)
    c.rect(totals_x, y - 80, 190, 80, fill=True, stroke=False)
    
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawString(totals_x + 14, y - 18, "Subtotal")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(ink)
    c.drawRightString(totals_x + 176, y - 18, money_format(po.get("subtotal_amount", 0)))
    
    c.setFont("Helvetica", 9)
    c.setFillColor(muted)
    c.drawString(totals_x + 14, y - 38, "GST / Tax")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(ink)
    c.drawRightString(totals_x + 176, y - 38, money_format(po.get("tax_amount", 0)))
    
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(ink)
    c.drawString(totals_x + 14, y - 62, "Total PO Value")
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(brand)
    c.drawRightString(totals_x + 176, y - 62, money_format(po.get("total_amount", 0)))
    
    # Terms
    terms_top = y
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(brand)
    c.drawString(margin, terms_top - 18, "Payment Terms")
    terms_y = draw_wrapped_text(c, text_format(po.get("payment_terms")), margin, terms_top - 34, 290, 11, "Helvetica", 8, ink)
    
    terms_y -= 10
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(brand)
    c.drawString(margin, terms_y, "Terms and Conditions")
    draw_wrapped_text(c, text_format(po.get("terms_and_conditions")), margin, terms_y - 16, 290, 11, "Helvetica", 8, ink)
    
    draw_footer()
    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
