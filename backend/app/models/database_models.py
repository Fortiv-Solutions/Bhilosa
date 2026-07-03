from sqlalchemy import Column, String, DateTime, JSON, Text, Float, Boolean, ForeignKey, Integer
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
    __tablename__ = "projects" # Maps to Supabase legacy projects table
    id = Column(String, primary_key=True)
    code = Column(String, nullable=True)
    name = Column(String, nullable=False)

class ProjectSite(Base):
    __tablename__ = "ProjectSite" # Maps to Prisma model ProjectSite
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    clientName = Column(String, nullable=False)
    location = Column(String, nullable=False)
    projectValue = Column(Float, nullable=False)
    startDate = Column(DateTime, nullable=False)
    endDate = Column(DateTime, nullable=False)
    progress = Column(Float, default=0.0)
    currentPhase = Column(String, default="Planning")
    status = Column(String, default="Active")
    budget = Column(Float, nullable=False)
    actualSpend = Column(Float, default=0.0)

class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    gst_number = Column(String, unique=True, nullable=True)
    legal_name = Column(String, nullable=True) # Matches vendors(...) selection
    display_name = Column(String, nullable=True)
    pan_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    category = Column(String, nullable=False)
    rating = Column(Float, default=0.0)

class MaterialRequest(Base):
    __tablename__ = "material_requests"
    id = Column(String, primary_key=True)
    mr_number = Column(String, nullable=False)
    justification = Column(String, nullable=True)

class PurchaseRequisition(Base):
    __tablename__ = "purchase_requisitions"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"))
    pr_number = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False)
    requested_date = Column(DateTime, nullable=False)
    required_date = Column(DateTime, nullable=True)
    estimated_cost = Column(Float, nullable=False)
    finance_required = Column(Boolean, default=False)
    assigned_team_notes = Column(String, nullable=True)
    material_request_id = Column(String, ForeignKey("material_requests.id"), nullable=True)

class PurchaseRequisitionLine(Base):
    __tablename__ = "purchase_requisition_lines"
    id = Column(String, primary_key=True)
    purchase_requisition_id = Column(String, ForeignKey("purchase_requisitions.id"))
    item_description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    estimated_rate = Column(Float, nullable=True)

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(String, primary_key=True)
    project_id = Column(String, ForeignKey("projects.id"))
    po_number = Column(String, unique=True, nullable=False)
    po_date = Column(DateTime, nullable=False)
    status = Column(String, nullable=False)
    delivery_date = Column(DateTime, nullable=True)
    delivery_location = Column(String, nullable=True)
    payment_terms = Column(String, nullable=True)
    terms_and_conditions = Column(String, nullable=True)
    subtotal_amount = Column(Float, nullable=False)
    tax_amount = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    vendor_id = Column(String, ForeignKey("vendors.id"))

class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"
    id = Column(String, primary_key=True)
    purchase_order_id = Column(String, ForeignKey("purchase_orders.id"))
    item_description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit_rate = Column(Float, nullable=False)
    tax_rate = Column(Float, default=0.0)
    line_total = Column(Float, nullable=False)

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
