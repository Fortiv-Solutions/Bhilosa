from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import re

from ..database import get_db
from ..core.security import get_current_user
from ..models import (
    PurchaseRequisition,
    PurchaseRequisitionLine,
    Project,
    ProjectSite,
    MaterialRequest,
    MaterialRequestLine,
    RFQ,
    PurchaseOrder,
    PurchaseOrderLine,
    Vendor,
    EntityAttachment
)
from ..services import (
    generate_material_request_pdf,
    generate_purchase_requisition_pdf,
    generate_rfq_pdf,
    generate_purchase_order_pdf,
    generate_purchase_bill_pdf,
    generate_goods_receipt_note_pdf,
    upload_file,
    create_signed_url
)

router = APIRouter()

BUCKET = "procurement-documents"

def safe_path_part(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value)
    return re.sub(r"-+", "-", cleaned)

@router.post("/procurement/purchase-requisitions/{id}/pdf")
async def generate_pr_pdf_endpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase Requisition not found")

    project = db.query(Project).filter(Project.id == pr.project_id).first()
    mr = db.query(MaterialRequest).filter(MaterialRequest.id == pr.material_request_id).first() if pr.material_request_id else None
    lines = db.query(PurchaseRequisitionLine).filter(PurchaseRequisitionLine.purchase_requisition_id == pr.id).all()

    # --- Drift-safe enrichment ---------------------------------------------
    # Pull the richer report columns via raw SQL. Each block is isolated in a
    # try/except so a schema mismatch degrades gracefully (falls back to '-'
    # in the PDF) instead of breaking PDF generation.
    pr_extra: dict = {}
    try:
        row = db.execute(
            text("SELECT activity_name, delivery_address FROM purchase_requisitions WHERE id = :id"),
            {"id": pr.id},
        ).mappings().first()
        if row:
            pr_extra = dict(row)
    except Exception:
        pr_extra = {}

    site: dict = {}
    if pr.site_id:
        try:
            srow = db.execute(
                text("SELECT name, address FROM project_sites WHERE id = :sid"),
                {"sid": pr.site_id},
            ).mappings().first()
            if srow:
                site = dict(srow)
        except Exception:
            site = {}

    rich_lines = None
    try:
        lrows = db.execute(
            text(
                "SELECT item_group, item_description, unit, preferred_brand, est_qty, iss_qty, ind_qty, "
                "quantity, pr_bal_qty, lead_period_days, lead_period_date, project_stock, estimated_rate, line_number "
                "FROM purchase_requisition_lines WHERE purchase_requisition_id = :id "
                "ORDER BY line_number NULLS LAST, created_at"
            ),
            {"id": pr.id},
        ).mappings().all()
        if lrows:
            rich_lines = [dict(r) for r in lrows]
    except Exception:
        rich_lines = None

    report_history: list = []
    try:
        hrows = db.execute(
            text(
                "SELECT action, previous_status, new_status, comment, actor_role, created_at "
                "FROM pr_activity_log WHERE purchase_requisition_id = :id ORDER BY created_at"
            ),
            {"id": pr.id},
        ).mappings().all()
        for r in hrows:
            report_history.append({
                "from": r.get("previous_status") or r.get("action") or "-",
                "to": r.get("new_status") or "-",
                "by": r.get("actor_role") or "System",
                "at": r.get("created_at"),
                "days_since": 0,
                "remarks": r.get("comment") or "-",
            })
    except Exception:
        report_history = []

    printed_by = (current_user.get("name") or current_user.get("email") or "System") if isinstance(current_user, dict) else "System"
    prepared_by = getattr(pr, "department", None) or printed_by

    if rich_lines is not None:
        pr_lines_payload = [
            {
                "item_group": r.get("item_group"),
                "item_description": r.get("item_description"),
                "unit": r.get("unit"),
                "preferred_brand": r.get("preferred_brand"),
                "est_qty": r.get("est_qty"),
                "iss_qty": r.get("iss_qty"),
                "ind_qty": r.get("ind_qty"),
                "quantity": r.get("quantity"),
                "pr_bal_qty": r.get("pr_bal_qty"),
                "lead_period_days": r.get("lead_period_days"),
                "lead_period_date": r.get("lead_period_date"),
                "project_stock": r.get("project_stock"),
                "estimated_rate": r.get("estimated_rate"),
            }
            for r in rich_lines
        ]
    else:
        pr_lines_payload = [
            {
                "item_description": line.item_description,
                "quantity": line.quantity,
                "unit": getattr(line, "unit", None),
                "estimated_rate": line.estimated_rate,
            }
            for line in lines
        ]

    pr_data = {
        "pr_number": pr.pr_number,
        "status": pr.status,
        "title": pr.title,
        "requested_date": pr.requested_date,
        "pr_date": pr.requested_date,
        "required_date": pr.required_date,
        "pr_release_date": getattr(pr, "updated_at", None) or pr.requested_date,
        "estimated_cost": pr.estimated_cost,
        "finance_required": pr.finance_required,
        "assigned_team_notes": pr.assigned_team_notes,
        "remarks": pr.assigned_team_notes,
        "project_id": pr.project_id,
        "id": pr.id,
        "report_org": "Pramukh Group",
        "project_name": project.name if project else "-",
        "company_name": getattr(pr, "company_name", None),
        "contractor_name": getattr(pr, "contractor_name", None),
        "sub_project": site.get("name"),
        "delivery_address": pr_extra.get("delivery_address") or site.get("address"),
        "activity_names": pr_extra.get("activity_name"),
        "cost_center": None,
        "unlocked_project": "1.00",
        "prepared_by": prepared_by,
        "printed_by": printed_by,
        "material_requests": {"mr_number": mr.mr_number, "justification": mr.justification} if mr else None,
        "purchase_requisition_lines": pr_lines_payload,
        "report_history": report_history,
    }

    try:
        pdf_bytes = generate_purchase_requisition_pdf(pr_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Requisition PDF: {str(e)}")

    storage_path = f"purchase-requisitions/{pr.project_id}/{safe_path_part(pr.pr_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload PDF to Supabase Storage")

    # Recording the attachment row is best-effort bookkeeping — the PDF is already
    # generated + uploaded and the signed URL is produced below. A failure here
    # (e.g. audit-user FK not in profiles, enum/schema drift) must NOT fail the
    # download, so we roll back and continue rather than raising a 500.
    actor_id = current_user.get("id") if isinstance(current_user, dict) else None
    try:
        attachment = db.query(EntityAttachment).filter(EntityAttachment.storage_path == storage_path).first()
        if not attachment:
            attachment = EntityAttachment(
                project_id=pr.project_id,
                entity_table="purchase_requisitions",
                entity_id=pr.id,
                document_type="purchase_requisition_pdf",
                file_name=f"{pr.pr_number}.pdf",
                storage_bucket=BUCKET,
                storage_path=storage_path,
                mime_type="application/pdf",
                size_bytes=len(pdf_bytes),
                uploaded_by=actor_id,
                created_by=actor_id,
                updated_by=actor_id,
            )
            db.add(attachment)
        else:
            attachment.size_bytes = len(pdf_bytes)
            attachment.updated_by = actor_id
        db.commit()
    except Exception:
        db.rollback()  # best-effort: keep the generated PDF available

    signed_url = create_signed_url(BUCKET, storage_path, 600)
    if not signed_url:
        raise HTTPException(status_code=500, detail="Unable to create signed URL from Supabase Storage")

    return {
        "purchaseRequisitionId": pr.id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }

@router.post("/procurement/purchase-orders/{id}/pdf")
async def generate_po_pdf_endpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")

    project = db.query(Project).filter(Project.id == po.project_id).first()
    vendor = db.query(Vendor).filter(Vendor.id == po.vendor_id).first()
    lines = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.purchase_order_id == po.id).all()
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.project_id == po.project_id).first()

    po_data = {
        "po_number": po.po_number,
        "po_date": po.po_date,
        "status": po.status,
        "delivery_date": po.delivery_date,
        "delivery_location": po.delivery_location,
        "payment_terms": po.payment_terms,
        "terms_and_conditions": po.terms_and_conditions,
        "subtotal_amount": po.subtotal_amount,
        "tax_amount": po.tax_amount,
        "total_amount": po.total_amount,
        "project_id": po.project_id,
        "id": po.id,
        "vendors": {
            "legal_name": vendor.legal_name if vendor else "Vendor",
            "display_name": vendor.display_name if vendor else "Vendor",
            "gst_number": vendor.gst_number if vendor else "-",
            "pan_number": getattr(vendor, "pan_number", "-") if vendor else "-",
            "email": vendor.email if vendor else "-",
            "phone": vendor.phone if vendor else "-",
            "address": vendor.address if vendor else "-"
        } if vendor else None,
        "projects": {
            "code": project.code if project else "-",
            "name": project.name if project else "-"
        } if project else None,
        "purchase_requisitions": {
            "pr_number": pr.pr_number if pr else "-",
            "required_date": pr.required_date if pr else None
        } if pr else None,
        "purchase_order_lines": [
            {
                "item_description": line.item_description,
                "quantity": line.quantity,
                "unit_rate": line.unit_rate,
                "tax_rate": line.tax_rate,
                "line_total": line.line_total
            } for line in lines
        ]
    }

    try:
        pdf_bytes = generate_purchase_order_pdf(po_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Purchase Order PDF: {str(e)}")

    storage_path = f"purchase-orders/{po.project_id}/{safe_path_part(po.po_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload PDF to Supabase Storage")

    try:
        attachment = db.query(EntityAttachment).filter(EntityAttachment.storage_path == storage_path).first()
        if not attachment:
            attachment = EntityAttachment(
                project_id=po.project_id,
                entity_table="purchase_orders",
                entity_id=po.id,
                document_type="purchase_order_pdf",
                file_name=f"{po.po_number}.pdf",
                storage_bucket=BUCKET,
                storage_path=storage_path,
                mime_type="application/pdf",
                size_bytes=len(pdf_bytes),
                uploaded_by=current_user.get("id"),
                created_by=current_user.get("id"),
                updated_by=current_user.get("id")
            )
            db.add(attachment)
        else:
            attachment.size_bytes = len(pdf_bytes)
            attachment.updated_by = current_user.get("id")
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record PDF attachment in database: {str(e)}")

    signed_url = create_signed_url(BUCKET, storage_path, 600)
    if not signed_url:
        raise HTTPException(status_code=500, detail="Unable to create signed URL from Supabase Storage")

    return {
        "purchaseOrderId": po.id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }

@router.post("/procurement/purchase-bills/{id}/pdf")
async def generate_pb_pdf_endpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    pb_data = {
        "id": id,
        "bill_number": f"PB-{id[:8]}",
        "supplier_bill_no": "SUP-BILL-901",
        "accounting_date": "2026-07-25",
        "project_name": "Pramukh Revanta",
        "supplier_name": "Modern Engineering Co.",
        "tax_status": "GST Registered",
        "total_amount": 125000.0,
        "purchase_bill_lines": [
            {
                "grn_number": "GRN-2026-001",
                "po_number": "PO-2026-044",
                "item_description": "PPC Cement Bags 50kg Grade 53",
                "quantity": 250,
                "bill_rate": 360.0,
                "net_amount": 90000.0
            },
            {
                "grn_number": "GRN-2026-001",
                "po_number": "PO-2026-044",
                "item_description": "Structural Block Chemical Joining",
                "quantity": 100,
                "bill_rate": 350.0,
                "net_amount": 35000.0
            }
        ]
    }
    try:
        pdf_bytes = generate_purchase_bill_pdf(pb_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Purchase Bill PDF: {str(e)}")

    storage_path = f"purchase-bills/{id}/PB-{id[:8]}.pdf"
    upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    signed_url = create_signed_url(BUCKET, storage_path, 600)

    return {
        "purchaseBillId": id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }

@router.post("/procurement/grns/{id}/pdf")
async def generate_grn_pdf_endpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # --- GRN header (raw SQL so a schema drift degrades gracefully) ---------
    hdr = None
    try:
        # SELECT * so newer report columns (remarks, account_posting_amount, asset_amount,
        # pb_lines_created, unlocked_fy) flow through once the GRN-report migration is applied.
        hdr = db.execute(
            text("SELECT * FROM goods_receipt_notes WHERE id = :id"),
            {"id": id},
        ).mappings().first()
    except Exception:
        hdr = None
    if not hdr:
        raise HTTPException(status_code=404, detail="Goods Receipt Note not found")
    hdr = dict(hdr)

    project = db.query(Project).filter(Project.id == hdr.get("project_id")).first() if hdr.get("project_id") else None
    vendor = db.query(Vendor).filter(Vendor.id == hdr.get("vendor_id")).first() if hdr.get("vendor_id") else None
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == hdr.get("purchase_order_id")).first() if hdr.get("purchase_order_id") else None

    site = {}
    if hdr.get("site_id"):
        try:
            srow = db.execute(text("SELECT name, address FROM project_sites WHERE id = :sid"), {"sid": hdr["site_id"]}).mappings().first()
            if srow:
                site = dict(srow)
        except Exception:
            site = {}

    po_number = po.po_number if po else None

    # --- Line items -----------------------------------------------------------
    # `l.*` adapts to the schema: the richer report columns (item_group, item_code,
    # approved_qty, po_balance_qty, challan_qty, pr_number, current_balance_qty, ...)
    # flow through automatically once the 20260728 GRN-report migration is applied;
    # before that they are simply absent and render as '-'/0.00. Only item_master.name
    # (confirmed) is assumed for the join.
    grn_lines = []
    try:
        lrows = db.execute(text(
            "SELECT l.*, im.name AS item_name "
            "FROM goods_receipt_note_lines l "
            "LEFT JOIN item_master im ON im.id = l.item_id "
            "WHERE l.grn_id = :id ORDER BY l.created_at"
        ), {"id": id}).mappings().all()
        for r in lrows:
            grn_lines.append({
                "po_number": r.get("po_number") or po_number,
                "item_group": r.get("item_group"),
                "item_description": r.get("item_name") or r.get("item_description"),
                "item_code": r.get("item_code"),
                "item_brand": r.get("item_brand"),
                "unit": r.get("unit"),
                "approved_qty": r.get("approved_qty"),
                "po_balance_qty": r.get("po_balance_qty"),
                "return_qty": r.get("return_qty"),
                "challan_qty": r.get("challan_qty") if r.get("challan_qty") is not None else r.get("received_qty"),
                "received_qty": r.get("received_qty"),
                "balance_allowed": r.get("balance_allowed"),
                "pr_number": r.get("pr_number"),
                "current_balance_qty": r.get("current_balance_qty"),
                "unit_rate": r.get("unit_rate"),
            })
    except Exception:
        # Minimal fallback: qty-only lines (no item-master join available)
        try:
            lrows = db.execute(text(
                "SELECT received_qty, accepted_qty, rejected_qty, unit_rate FROM goods_receipt_note_lines WHERE grn_id = :id ORDER BY created_at"
            ), {"id": id}).mappings().all()
            for r in lrows:
                grn_lines.append({
                    "po_number": po_number, "received_qty": r.get("received_qty"),
                    "challan_qty": r.get("received_qty"), "unit_rate": r.get("unit_rate"),
                })
        except Exception:
            grn_lines = []

    account_amount = sum(float(l.get("received_qty") or 0) * float(l.get("unit_rate") or 0) for l in grn_lines)

    # --- Report history (defensive: table may not exist yet) ----------------
    report_history = []
    try:
        hrows = db.execute(text(
            "SELECT action, previous_status, new_status, comment, actor_role, created_at "
            "FROM grn_activity_log WHERE grn_id = :id ORDER BY created_at"
        ), {"id": id}).mappings().all()
        for r in hrows:
            report_history.append({
                "from": r.get("previous_status") or r.get("action") or "-",
                "to": r.get("new_status") or "-",
                "by": r.get("actor_role") or "System",
                "at": r.get("created_at"), "days_since": 0,
                "remarks": r.get("comment") or "-",
            })
    except Exception:
        report_history = []

    printed_by = (current_user.get("name") or current_user.get("email") or "System") if isinstance(current_user, dict) else "System"
    grn_number = hdr.get("grn_number") or f"GRN-{id[:8]}"

    grn_data = {
        "id": id,
        "grn_number": grn_number,
        "grn_date": hdr.get("receipt_date"),
        "qc_no": hdr.get("qc_no"),
        "project_name": project.name if project else "-",
        "company_name": project.name if project else "Pramukh Group",
        "company_address": site.get("address"),
        "supplier_name": (vendor.display_name or vendor.legal_name) if vendor else None,
        "phone": vendor.phone if vendor else None,
        "mobile": vendor.phone if vendor else None,
        "godown_name": hdr.get("godown_name") or site.get("name"),
        "dealer_name": hdr.get("dealer_name"),
        "challan_no": hdr.get("challan_no"),
        "transporter_name": hdr.get("transporter_name"),
        "vehicle_no": hdr.get("vehicle_no"),
        "volume_in_brass": hdr.get("volume_in_brass"),
        "in_weight": hdr.get("in_weight"),
        "out_weight": hdr.get("out_weight"),
        "net_weight": hdr.get("net_weight"),
        "po_numbers": po_number,
        "remarks": hdr.get("remarks"),
        "account_posting_amount": hdr.get("account_posting_amount") if hdr.get("account_posting_amount") is not None else account_amount,
        "asset_amount": hdr.get("asset_amount") or 0,
        "pb_lines_created": hdr.get("pb_lines_created"),
        "unlocked_fy": hdr.get("unlocked_fy"),
        "status": hdr.get("status"),
        "printed_by": printed_by,
        "grn_lines": grn_lines,
        "report_history": report_history,
    }

    try:
        pdf_bytes = generate_goods_receipt_note_pdf(grn_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Goods Receipt Note PDF: {str(e)}")

    storage_path = f"grns/{hdr.get('project_id') or 'na'}/{safe_path_part(grn_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload GRN PDF to Supabase Storage")
    signed_url = create_signed_url(BUCKET, storage_path, 600)

    return {
        "grnId": id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }


@router.post("/procurement/material-requests/{id}/pdf")
async def generate_mr_pdf_endpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Generates the Material Request report PDF (house format) and returns a signed URL."""
    mr = db.query(MaterialRequest).filter(MaterialRequest.id == id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Material Request not found")

    project = db.query(Project).filter(Project.id == mr.project_id).first()
    site = db.query(ProjectSite).filter(ProjectSite.id == mr.site_id).first() if mr.site_id else None

    # Rich line columns via drift-safe raw SQL; falls back to the ORM subset.
    lines_payload = []
    try:
        lrows = db.execute(
            text(
                "SELECT item_group, item_description, unit, preferred_brand, quantity, "
                "estimated_rate, project_stock, remarks, required_date "
                "FROM material_request_lines WHERE material_request_id = :id ORDER BY created_at"
            ),
            {"id": mr.id},
        ).mappings().all()
        lines_payload = [dict(r) for r in lrows]
    except Exception:
        lines_payload = [
            {
                "item_description": l.item_description,
                "quantity": l.quantity,
                "unit": getattr(l, "unit", None),
                "estimated_rate": getattr(l, "estimated_rate", None),
                "remarks": getattr(l, "remarks", None),
            }
            for l in db.query(MaterialRequestLine).filter(MaterialRequestLine.material_request_id == mr.id).all()
        ]

    raised_by_name = None
    if getattr(mr, "raised_by", None):
        try:
            prow = db.execute(text("SELECT name FROM profiles WHERE id = :pid"), {"pid": mr.raised_by}).mappings().first()
            if prow:
                raised_by_name = prow.get("name")
        except Exception:
            raised_by_name = None

    printed_by = (current_user.get("name") or current_user.get("email") or "System") if isinstance(current_user, dict) else "System"

    mr_data = {
        "mr_number": mr.mr_number,
        "status": mr.status,
        "title": getattr(mr, "title", None),
        "mr_date": getattr(mr, "created_at", None),
        "created_at": getattr(mr, "created_at", None),
        "required_date": mr.required_date,
        "priority": mr.priority,
        "source": getattr(mr, "source", None),
        "work_activity": getattr(mr, "work_activity", None),
        "justification": getattr(mr, "justification", None),
        "stock_decision": getattr(mr, "stock_decision", None),
        "report_org": "Pramukh Group",
        "project_name": project.name if project else "-",
        "company_name": getattr(mr, "company_name", None),
        "sub_project": site.name if site else getattr(mr, "site_block", None),
        "raised_by_name": raised_by_name or printed_by,
        "printed_by": printed_by,
        "material_request_lines": lines_payload,
        "report_history": [],
    }

    try:
        pdf_bytes = generate_material_request_pdf(mr_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Material Request PDF: {str(e)}")

    storage_path = f"material-requests/{mr.project_id}/{safe_path_part(mr.mr_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload Material Request PDF to Supabase Storage")
    signed_url = create_signed_url(BUCKET, storage_path, 600)

    return {
        "materialRequestId": id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }


@router.post("/procurement/rfqs/{id}/pdf")
async def generate_rfq_pdf_endpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Generates the RFQ report PDF (house format) and returns a signed URL."""
    rfq = db.query(RFQ).filter(RFQ.id == id).first()
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")

    project = db.query(Project).filter(Project.id == rfq.project_id).first()
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == rfq.purchase_requisition_id).first() if rfq.purchase_requisition_id else None

    # Requested items come from the source PR lines.
    items = []
    if pr:
        try:
            irows = db.execute(
                text(
                    "SELECT item_group, item_description, item_code, unit, quantity, estimated_rate, "
                    "specification, remarks, required_date FROM purchase_requisition_lines "
                    "WHERE purchase_requisition_id = :id ORDER BY line_number NULLS LAST, created_at"
                ),
                {"id": pr.id},
            ).mappings().all()
            items = [dict(r) for r in irows]
        except Exception:
            items = []

    # Invited suppliers + any quoted amounts.
    suppliers = []
    try:
        srows = db.execute(
            text(
                "SELECT v.display_name, v.legal_name, v.email, v.phone, v.gst_number, rv.status, "
                "(SELECT vq.total_amount FROM vendor_quotations vq "
                " WHERE vq.rfq_id = rv.rfq_id AND vq.vendor_id = rv.vendor_id "
                " ORDER BY vq.created_at DESC LIMIT 1) AS quoted_amount "
                "FROM rfq_vendors rv JOIN vendors v ON v.id = rv.vendor_id WHERE rv.rfq_id = :id"
            ),
            {"id": rfq.id},
        ).mappings().all()
        suppliers = [
            {
                "supplier_name": r.get("display_name") or r.get("legal_name"),
                "email": r.get("email"),
                "phone": r.get("phone"),
                "gst_number": r.get("gst_number"),
                "status": r.get("status"),
                "quoted_amount": r.get("quoted_amount"),
            }
            for r in srows
        ]
    except Exception:
        suppliers = []

    printed_by = (current_user.get("name") or current_user.get("email") or "System") if isinstance(current_user, dict) else "System"

    rfq_data = {
        "rfq_number": rfq.rfq_number,
        "title": rfq.title,
        "status": rfq.status,
        "issue_date": rfq.issue_date,
        "due_date": rfq.due_date,
        "created_at": getattr(rfq, "created_at", None),
        "terms": getattr(rfq, "terms", None),
        "report_org": "Pramukh Group",
        "project_name": project.name if project else "-",
        "company_name": getattr(pr, "company_name", None) if pr else None,
        "pr_number": pr.pr_number if pr else None,
        "process_type": "Quotation Request",
        "prepared_by": printed_by,
        "printed_by": printed_by,
        "items": items,
        "suppliers": suppliers,
        "report_history": [],
    }

    try:
        pdf_bytes = generate_rfq_pdf(rfq_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate RFQ PDF: {str(e)}")

    storage_path = f"rfqs/{rfq.project_id}/{safe_path_part(rfq.rfq_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload RFQ PDF to Supabase Storage")
    signed_url = create_signed_url(BUCKET, storage_path, 600)

    return {
        "rfqId": id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }
