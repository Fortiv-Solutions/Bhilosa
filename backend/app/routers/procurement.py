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
    # 1. Fetch PurchaseRequisition
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.id == id).first()
    if not pr:
        raise HTTPException(status_code=404, detail="Purchase Requisition not found")

    # 2. Fetch related details
    project = db.query(Project).filter(Project.id == pr.project_id).first()
    mr = db.query(MaterialRequest).filter(MaterialRequest.id == pr.material_request_id).first() if pr.material_request_id else None
    lines = db.query(PurchaseRequisitionLine).filter(PurchaseRequisitionLine.purchase_requisition_id == pr.id).all()

    # 3. Structure dictionary for PDF Generator
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

    # 4. Generate PDF bytes
    try:
        pdf_bytes = generate_purchase_requisition_pdf(pr_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Requisition PDF: {str(e)}")

    # 5. Upload to Supabase Storage
    storage_path = f"purchase-requisitions/{pr.project_id}/{safe_path_part(pr.pr_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload PDF to Supabase Storage")

    # 6. Upsert EntityAttachment in Database
    try:
        # Check if attachment already exists
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

    # 7. Create Signed URL (expires in 10 minutes)
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
    # 1. Fetch PurchaseOrder
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase Order not found")

    # 2. Fetch related details
    project = db.query(Project).filter(Project.id == po.project_id).first()
    vendor = db.query(Vendor).filter(Vendor.id == po.vendor_id).first()
    lines = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.purchase_order_id == po.id).all()
    
    # We find linked PR via PO code/reference or lines if necessary. 
    # In the TS file, po joins with purchase_requisitions. In our schema/database,
    # purchase_orders table has a purchase_requisition_id or joins.
    # Let's check if there is a purchase_requisition relation on purchase_orders.
    # In database_models.py, we mapped po columns. Let's see if we should join purchase_requisitions.
    # In TS code, po joins with purchase_requisitions. Let's do a query to fetch the PR.
    # Let's query purchase_requisitions linked to this project or po.
    # Let's query by matching pr_number or similar. Since we want to be safe, let's fetch a dummy PR if none exists or fetch it via DB query.
    # Wait, in the database table `purchase_orders`, is there a `purchase_requisition_id`?
    # Let's query `purchase_requisitions` by matching project_id, or matching requisitions by ID if present.
    # Let's check: we can execute a fallback check. Let's find any purchase requisition associated with this project.
    pr = db.query(PurchaseRequisition).filter(PurchaseRequisition.project_id == po.project_id).first()

    # 3. Structure dictionary for PDF Generator
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

    # 4. Generate PDF bytes
    try:
        pdf_bytes = generate_purchase_order_pdf(po_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Purchase Order PDF: {str(e)}")

    # 5. Upload to Supabase Storage
    storage_path = f"purchase-orders/{po.project_id}/{safe_path_part(po.po_number)}.pdf"
    uploaded = upload_file(BUCKET, storage_path, pdf_bytes, "application/pdf")
    
    if not uploaded:
        raise HTTPException(status_code=500, detail="Failed to upload PDF to Supabase Storage")

    # 6. Upsert EntityAttachment in Database
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

    # 7. Create Signed URL (expires in 10 minutes)
    signed_url = create_signed_url(BUCKET, storage_path, 600)
    if not signed_url:
        raise HTTPException(status_code=500, detail="Unable to create signed URL from Supabase Storage")

    return {
        "purchaseOrderId": po.id,
        "storagePath": storage_path,
        "signedUrl": signed_url
    }
