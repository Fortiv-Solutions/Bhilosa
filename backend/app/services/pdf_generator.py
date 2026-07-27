from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
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
def generate_purchase_requisition_pdf(pr: Dict[str, Any]) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    margin = 36
    page_width = 595
    
    now_str = datetime.now().strftime("%d-%m-%Y %H:%M")
    pr_no = pr.get("pr_number", "PR-0000")
    company_info = pr.get("company") or {}
    company_name = company_info.get("name") or "PRAMUKH GROUP"
    
    y = draw_header_banner(c, "Purchase Requisition", pr_no, company_name, now_str)
    
    # Metadata Grid Box
    c.setFillColor(BRAND_LIGHT)
    c.rect(margin, y - 64, page_width - margin * 2, 64, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(0.8)
    c.rect(margin, y - 64, page_width - margin * 2, 64, fill=False, stroke=True)
    
    project_info = pr.get("projects") or {}
    proj_code = project_info.get("code") or "PRJ"
    proj_name = project_info.get("name") or "Main Project"
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin + 12, y - 16, "PROJECT & REQUISITION DETAILS")
    c.drawString(margin + 280, y - 16, "COMMERCIAL & DEPT METADATA")
    
    c.setFont("Helvetica", 8)
    c.setFillColor(INK_COLOR)
    c.drawString(margin + 12, y - 30, f"Project: {proj_code} - {truncate_text(proj_name, 35)}")
    c.drawString(margin + 12, y - 44, f"Title / Subject: {truncate_text(pr.get('title', '-'), 35)}")
    c.drawString(margin + 12, y - 58, f"Status: {text_format(pr.get('status', 'PENDING')).upper()}")
    
    req_date = pr.get("requested_date") or pr.get("created_at")
    req_date_str = str(req_date)[:10] if req_date else "-"
    req_deliv_str = str(pr.get("required_date"))[:10] if pr.get("required_date") else "-"
    
    c.drawString(margin + 280, y - 30, f"Requested Date: {req_date_str}")
    c.drawString(margin + 280, y - 44, f"Required Date: {req_deliv_str}")
    
    mr_info = pr.get("material_requests") or {}
    mr_num = mr_info.get("mr_number") or pr.get("mr_number") or "-"
    c.drawString(margin + 280, y - 58, f"MR Reference: {mr_num}")
    
    y -= 84
    
    # Items Table Header
    c.setFillColor(SOFT_BG)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 8, y - 15, "Sr")
    c.drawString(margin + 32, y - 15, "Item Description & Group")
    c.drawString(margin + 260, y - 15, "Brand")
    c.drawString(margin + 330, y - 15, "Unit")
    c.drawRightString(margin + 420, y - 15, "Qty")
    c.drawRightString(margin + 514, y - 15, "Est Rate")
    
    y -= 34
    
    lines = pr.get("purchase_requisition_lines") or []
    if not lines:
        # Fallback sample line if empty
        lines = [{
            "item_description": pr.get("title") or "Material Requisition Item",
            "quantity": pr.get("quantity", 1),
            "estimated_rate": pr.get("estimated_cost", 0),
            "unit": "Pcs",
            "brand": "Standard"
        }]
        
    total_est = 0.0
    for idx, line in enumerate(lines, 1):
        if y < 140:
            draw_footer_watermark(c, 1)
            c.showPage()
            y = draw_header_banner(c, "Purchase Requisition", pr_no, company_name, now_str)
            
        desc = line.get("item_description") or line.get("item_name") or "-"
        brand = line.get("item_brand") or line.get("brand") or "-"
        unit = line.get("unit") or line.get("unit_of_measure") or "Pcs"
        qty = float(line.get("quantity") or 0)
        rate = float(line.get("estimated_rate") or line.get("unit_rate") or 0)
        line_tot = qty * rate
        total_est += line_tot
        
        c.setFont("Helvetica", 8)
        c.setFillColor(INK_COLOR)
        c.drawString(margin + 8, y, str(idx))
        c.drawString(margin + 32, y, truncate_text(desc, 45))
        c.drawString(margin + 260, y, truncate_text(brand, 14))
        c.drawString(margin + 330, y, text_format(unit))
        c.drawRightString(margin + 420, y, f"{qty:,.2f}")
        c.drawRightString(margin + 514, y, money_format(rate))
        
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
    c.drawString(margin + 310, y - 18, "Total Estimated Value:")
    c.setFillColor(BRAND_COLOR)
    c.drawRightString(margin + 514, y - 18, money_format(total_est if total_est > 0 else pr.get("estimated_cost", 0)))
    
    # Remarks
    notes = pr.get("assigned_team_notes") or pr.get("notes") or pr.get("remarks")
    if notes:
        y -= 44
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(MUTED_COLOR)
        c.drawString(margin, y, "Remarks / Material Purpose:")
        draw_wrapped_text(c, text_format(notes), margin, y - 12, 520, 11, "Helvetica", 8, INK_COLOR)
        y -= 24
        
    y = max(y - 60, 80)
    draw_signature_block(c, y, "Prepared By (Site)", "Checked By (Store)", "Approved By (Management)")
    
    draw_footer_watermark(c, 1)
    c.showPage()
    c.save()
    
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
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(595, 842))
    margin = 36
    page_width = 595
    
    now_str = datetime.now().strftime("%d-%m-%Y %H:%M")
    grn_no = grn.get("grn_number", "GRN-0000")
    company_info = grn.get("company") or {}
    company_name = company_info.get("name") or "PRAMUKH GROUP"
    
    y = draw_header_banner(c, "Goods Received Note", grn_no, company_name, now_str)
    
    # Metadata Grid Box
    c.setFillColor(BRAND_LIGHT)
    c.rect(margin, y - 64, page_width - margin * 2, 64, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.setLineWidth(0.8)
    c.rect(margin, y - 64, page_width - margin * 2, 64, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin + 12, y - 16, "RECEIPT & SITE DETAILS")
    c.drawString(margin + 280, y - 16, "CHALLAN & VENDOR INFO")
    
    grn_date_str = str(grn.get("grn_date") or grn.get("created_at") or "-")[:10]
    
    c.setFont("Helvetica", 8)
    c.setFillColor(INK_COLOR)
    c.drawString(margin + 12, y - 30, f"GRN Date: {grn_date_str}")
    c.drawString(margin + 12, y - 44, f"Project: {text_format(grn.get('project_name'))}")
    c.drawString(margin + 12, y - 58, f"Godown / Store: {text_format(grn.get('godown_name'))}")
    
    c.drawString(margin + 280, y - 30, f"Supplier: {text_format(grn.get('supplier_name'))}")
    c.drawString(margin + 280, y - 44, f"Challan No: {text_format(grn.get('challan_no'))}")
    c.drawString(margin + 280, y - 58, f"Transporter: {text_format(grn.get('transporter_name'))}")
    
    y -= 84
    
    # Vehicle Measurement Card Module
    c.setStrokeColor(BORDER_COLOR)
    c.setFillColor(SOFT_BG)
    c.rect(margin, y - 40, page_width - margin * 2, 40, fill=True, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(BRAND_COLOR)
    c.drawString(margin + 10, y - 14, "VEHICLE & WEIGHBRIDGE MEASUREMENT LOG")
    
    veh_no = grn.get("vehicle_no") or "-"
    vol_brass = grn.get("volume_in_brass") or "-"
    net_wt = grn.get("net_weight") or grn.get("grn_weight") or "-"
    
    c.setFont("Helvetica", 8)
    c.setFillColor(INK_COLOR)
    c.drawString(margin + 10, y - 30, f"Vehicle No: {veh_no}")
    c.drawString(margin + 180, y - 30, f"Vol (Brass): {vol_brass}")
    c.drawString(margin + 340, y - 30, f"Net Weight: {net_wt}")
    
    y -= 54
    
    # Items Received Table Header
    c.setFillColor(SOFT_BG)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=True, stroke=False)
    c.setStrokeColor(BORDER_COLOR)
    c.rect(margin, y - 22, page_width - margin * 2, 22, fill=False, stroke=True)
    
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED_COLOR)
    c.drawString(margin + 8, y - 15, "Sr")
    c.drawString(margin + 30, y - 15, "Item Description & Group")
    c.drawString(margin + 240, y - 15, "Unit")
    c.drawRightString(margin + 320, y - 15, "Challan Qty")
    c.drawRightString(margin + 400, y - 15, "Accepted Qty")
    c.drawRightString(margin + 514, y - 15, "Rejected Qty")
    
    y -= 34
    
    lines = grn.get("grn_lines") or []
    if not lines:
        lines = [{
            "item_description": grn.get("item_description") or "Material Received",
            "unit": "Pcs",
            "challan_qty": grn.get("received_qty", 100),
            "accepted_qty": grn.get("received_qty", 100),
            "rejected_qty": 0
        }]
        
    for idx, line in enumerate(lines, 1):
        if y < 140:
            draw_footer_watermark(c, 1)
            c.showPage()
            y = draw_header_banner(c, "Goods Received Note", grn_no, company_name, now_str)
            
        desc = line.get("item_description") or line.get("item_name") or "-"
        unit = line.get("unit") or "Pcs"
        ch_qty = float(line.get("challan_qty") or 0)
        acc_qty = float(line.get("accepted_qty") or 0)
        rej_qty = float(line.get("rejected_qty") or 0)
        
        c.setFont("Helvetica", 8)
        c.setFillColor(INK_COLOR)
        c.drawString(margin + 8, y, str(idx))
        c.drawString(margin + 30, y, truncate_text(desc, 40))
        c.drawString(margin + 240, y, text_format(unit))
        c.drawRightString(margin + 320, y, f"{ch_qty:,.2f}")
        c.drawRightString(margin + 400, y, f"{acc_qty:,.2f}")
        c.drawRightString(margin + 514, y, f"{rej_qty:,.2f}")
        
        c.setStrokeColor(BORDER_COLOR)
        c.setLineWidth(0.4)
        c.line(margin, y - 6, page_width - margin, y - 6)
        y -= 20

    y = max(y - 60, 80)
    draw_signature_block(c, y, "Received By (Storekeeper)", "Checked By (Quality Control)", "Approved By (Project Mgr)")
    
    draw_footer_watermark(c, 1)
    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
