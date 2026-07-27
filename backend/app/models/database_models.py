from sqlalchemy import Column, String, DateTime, JSON, Text, Float, Boolean, ForeignKey, Integer, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from ..database import Base

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    project_id = Column(String, nullable=True)

class OutboundMessage(Base):
    __tablename__ = "outbound_messages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, nullable=True)
    site_id = Column(String, nullable=True)
    thread_id = Column(String, nullable=True)
    to_user_id = Column(String, nullable=True)
    to_phone = Column(String, nullable=False)
    message_text = Column(Text, nullable=False)
    message_type = Column(String, default="text")
    status = Column(String, default="queued")
    source = Column(String, default="dashboard")
    sent_by = Column(String, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    provider_response = Column(JSON, nullable=True)

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True)
    code = Column(String, nullable=True)
    name = Column(String, nullable=False)

class ProjectSite(Base):
    __tablename__ = "project_sites"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"))
    code = Column(String, nullable=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(String, primary_key=True)
    vendor_code = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=True)
    legal_name = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    pan_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    compliance_status = Column(String, default="pending")
    rating = Column(Float, default=0.0)

# =========================================================================
# PROCUREMENT MODULE MODELS (MR, PR, RFQ, PO, GRN, PB)
# =========================================================================

class MaterialRequest(Base):
    __tablename__ = "material_requests"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    site_id = Column(String, ForeignKey("project_sites.id"), nullable=True)
    mr_number = Column(String, unique=True, nullable=False)
    source = Column(String, default="onsite_requirement")
    raised_by = Column(String, ForeignKey("profiles.id"), nullable=True)
    title = Column(String, nullable=True)
    justification = Column(String, nullable=True)
    priority = Column(String, default="medium")
    status = Column(String, default="submitted")
    work_activity = Column(String, nullable=True)
    site_block = Column(String, nullable=True)
    required_date = Column(DateTime, nullable=True)
    stock_decision = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

class MaterialRequestLine(Base):
    __tablename__ = "material_request_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    material_request_id = Column(String, ForeignKey("material_requests.id"))
    project_id = Column(String, ForeignKey("projects.id"))
    item_description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, default="nos")
    estimated_rate = Column(Float, default=0.0)
    remarks = Column(String, nullable=True)

class PurchaseRequisition(Base):
    __tablename__ = "purchase_requisitions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    site_id = Column(String, ForeignKey("project_sites.id"), nullable=True)
    material_request_id = Column(String, ForeignKey("material_requests.id"), nullable=True)
    pr_number = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="draft")
    requested_date = Column(DateTime, nullable=False)
    required_date = Column(DateTime, nullable=True)
    estimated_cost = Column(Float, nullable=False, default=0.0)
    finance_required = Column(Boolean, default=False)
    assigned_team_notes = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    department = Column(String, nullable=True)
    contractor_name = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)

class PurchaseRequisitionLine(Base):
    __tablename__ = "purchase_requisition_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_requisition_id = Column(String, ForeignKey("purchase_requisitions.id"))
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    material_request_line_id = Column(String, ForeignKey("material_request_lines.id"), nullable=True)
    item_description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, default="nos")
    estimated_rate = Column(Float, nullable=True, default=0.0)
    line_total = Column(Float, nullable=True, default=0.0)

class RFQ(Base):
    __tablename__ = "rfqs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    purchase_requisition_id = Column(String, ForeignKey("purchase_requisitions.id"))
    rfq_number = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    issue_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    status = Column(String, default="draft")
    terms = Column(String, nullable=True)

class VendorQuotation(Base):
    __tablename__ = "vendor_quotations"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    rfq_id = Column(String, ForeignKey("rfqs.id"))
    vendor_id = Column(String, ForeignKey("vendors.id"))
    quotation_number = Column(String, nullable=True)
    subtotal_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    status = Column(String, default="submitted")

class QuotationLine(Base):
    __tablename__ = "quotation_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    quotation_id = Column(String, ForeignKey("vendor_quotations.id"))
    project_id = Column(String, ForeignKey("projects.id"))
    item_description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit_rate = Column(Float, nullable=False)
    tax_rate = Column(Float, default=0.0)
    line_total = Column(Float, nullable=False)

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    site_id = Column(String, ForeignKey("project_sites.id"), nullable=True)
    vendor_id = Column(String, ForeignKey("vendors.id"))
    purchase_requisition_id = Column(String, ForeignKey("purchase_requisitions.id"), nullable=True)
    po_number = Column(String, unique=True, nullable=False)
    po_date = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="draft")
    delivery_date = Column(DateTime, nullable=True)
    delivery_location = Column(String, nullable=True)
    payment_terms = Column(String, nullable=True)
    terms_and_conditions = Column(String, nullable=True)
    subtotal_amount = Column(Float, nullable=False, default=0.0)
    tax_amount = Column(Float, nullable=False, default=0.0)
    total_amount = Column(Float, nullable=False, default=0.0)
    pdf_storage_path = Column(String, nullable=True)

class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    purchase_order_id = Column(String, ForeignKey("purchase_orders.id"))
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    item_description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit_rate = Column(Float, nullable=False)
    tax_rate = Column(Float, default=0.0)
    line_total = Column(Float, nullable=False)
    received_qty = Column(Float, default=0.0)

class GoodsReceiptNote(Base):
    __tablename__ = "goods_receipt_notes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    site_id = Column(String, ForeignKey("project_sites.id"), nullable=True)
    purchase_order_id = Column(String, ForeignKey("purchase_orders.id"), nullable=True)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=True)
    grn_number = Column(String, unique=True, nullable=False)
    receipt_date = Column(DateTime, nullable=False)
    status = Column(String, default="draft")
    vehicle_no = Column(String, nullable=True)
    volume_in_brass = Column(String, nullable=True)
    net_weight = Column(String, nullable=True)
    challan_no = Column(String, nullable=True)
    transporter_name = Column(String, nullable=True)
    godown_name = Column(String, nullable=True)

class GoodsReceiptNoteLine(Base):
    __tablename__ = "goods_receipt_note_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    grn_id = Column(String, ForeignKey("goods_receipt_notes.id"))
    project_id = Column(String, ForeignKey("projects.id"))
    purchase_order_line_id = Column(String, ForeignKey("purchase_order_lines.id"), nullable=True)
    item_description = Column(String, nullable=True)
    received_qty = Column(Float, default=0.0)
    accepted_qty = Column(Float, default=0.0)
    rejected_qty = Column(Float, default=0.0)
    unit_rate = Column(Float, default=0.0)

class VendorBill(Base):
    __tablename__ = "vendor_bills"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    site_id = Column(String, ForeignKey("project_sites.id"), nullable=True)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=True)
    purchase_order_id = Column(String, ForeignKey("purchase_orders.id"), nullable=True)
    bill_number = Column(String, nullable=False)
    supplier_bill_no = Column(String, nullable=True)
    bill_date = Column(DateTime, nullable=False)
    subtotal_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    status = Column(String, default="draft")

class VendorBillLine(Base):
    __tablename__ = "vendor_bill_lines"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_bill_id = Column(String, ForeignKey("vendor_bills.id"))
    project_id = Column(String, ForeignKey("projects.id"))
    grn_id = Column(String, ForeignKey("goods_receipt_notes.id"), nullable=True)
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    rate = Column(Float, default=0.0)
    line_total = Column(Float, default=0.0)

class QCInspection(Base):
    __tablename__ = "qc_inspections"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"))
    site_id = Column(String, ForeignKey("project_sites.id"), nullable=True)
    inspection_number = Column(String, nullable=False)
    inspection_date = Column(DateTime, nullable=False)
    status = Column(String, default="pending")
    remarks = Column(String, nullable=True)

class QCInspectionItem(Base):
    __tablename__ = "qc_inspection_items"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    inspection_id = Column(String, ForeignKey("qc_inspections.id"))
    project_id = Column(String, ForeignKey("projects.id"))
    description = Column(String, nullable=False)
    result = Column(String, default="pending")
    remarks = Column(String, nullable=True)

class EntityAttachment(Base):
    __tablename__ = "entity_attachments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String, nullable=False)
    entity_table = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    document_type = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    storage_bucket = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=False)
