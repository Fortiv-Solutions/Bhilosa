from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import re

from ..database import get_db
from ..core.security import get_current_user
from ..models import (
    PurchaseRequisition, 
    PurchaseRequisitionLine, 
    Project, 
    MaterialRequest,
    PurchaseOrder,
    PurchaseOrderLine,
    Vendor,
    EntityAttachment
)
from ..services import (
    generate_purchase_requisition_pdf, 
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

    pr_data = {
        "pr_number": pr.pr_number,
        "status": pr.status,
        "title": pr.title,
        "requested_date": pr.requested_date,
        "required_date": pr.required_date,
        "estimated_cost": pr.estimated_cost,
        "finance_required": pr.finance_required,
        "assigned_team_notes": pr.assigned_team_notes,
        "project_id": pr.project_id,
        "id": pr.id,
        "projects": {
            "code": project.code if project else "-",
            "name": project.name if project else "-"
        } if project else None,
        "material_requests": {
            "mr_number": mr.mr_number,
            "justification": mr.justification
        } if mr else None,
        "purchase_requisition_lines": [
            {
                "item_description": line.item_description,
                "quantity": line.quantity,
                "estimated_rate": line.estimated_rate
            } for line in lines
        ]
    }

    try:
        pdf_bytes = generate_purchase_requisition_pdf(pr_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Requisition PDF: {str(e)}")

    storage_path = f"purchase-requisitions/{pr.project_id}/{safe_path_part(pr.pr_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload PDF to Supabase Storage")

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
    grn_data = {
        "id": id,
        "grn_number": f"GRN-{id[:8]}",
        "grn_date": "2026-07-25",
        "project_name": "Pramukh Revanta Site",
        "godown_name": "Revanta C.O.P Main Store",
        "supplier_name": "Modern Engineering Co.",
        "challan_no": "CH-88029",
        "transporter_name": "Gujarat Freight Logistics",
        "vehicle_no": "GJ-05-BX-4902",
        "volume_in_brass": "12.5 Brass",
        "net_weight": "14.20 MT",
        "grn_lines": [
            {
                "item_description": "ACC PPC Cement 50kg Bags",
                "unit": "Bags",
                "challan_qty": 500,
                "accepted_qty": 495,
                "rejected_qty": 5
            }
        ]
    }
    try:
        pdf_bytes = generate_goods_receipt_note_pdf(grn_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Goods Receipt Note PDF: {str(e)}")

    storage_path = f"grns/{id}/GRN-{id[:8]}.pdf"
    upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    signed_url = create_signed_url(BUCKET, storage_path, 600)

    return {
        "grnId": id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }
