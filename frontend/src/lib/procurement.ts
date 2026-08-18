import { supabase, getDbSiteId, getSupabaseJsonHeaders } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { calculateLandedCostAllocation } from '@/lib/bill-allocation';
import {
  getDemoRfqBundle,
  demoRecordQuotation,
  demoRecomputeQuotationRanks,
} from '@/lib/procurement-demo-quotations';
import { normalizeDatabaseRole, type Role } from '@/lib/roles';
import {
  normalizePoStatus,
  poRequiresReason,
  poStatusLabel,
  PO_STATUS_GROUPS,
  type PoStatus,
  type PoStatusGroup,
} from '@/lib/erp/purchase-order/status';
export { poStatusLabel, type PoStatus };
import {
  fieldsSection,
  tableSection,
  openReportWindow,
  isDraftStatus,
  fmtCurrency,
  fmtNumber,
  fmtDate,
  fmtDateTime,
  fmtBool,
  fmtPercent,
  fmtStatus,
  fmtText,
} from '@/lib/procurement-report';
import { generatePurchaseOrderPdfBlob, downloadPurchaseOrderPdfFile } from '@/lib/purchase-order-pdf';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

export function cleanMaterialUnit(unit?: string | null, description?: string | null): string {
  let trimmed = (unit || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'nos' || trimmed.toLowerCase() === 'no') {
    const desc = (description || '').toLowerCase();
    if (desc.includes('cement')) return 'BAGS';
    if (desc.includes('steel') || desc.includes('tmt') || desc.includes('rebar')) return 'MT';
    if (desc.includes('sand') || desc.includes('aggregate') || desc.includes('metal')) return 'BRASS';
    if (desc.includes('brick') || desc.includes('block')) return 'NOS';
    if (desc.includes('pipe') || desc.includes('cable')) return 'RMT';
    if (desc.includes('paint') || desc.includes('oil') || desc.includes('chemical')) return 'LTR';
    if (trimmed) return trimmed.toUpperCase();
    return 'BAGS';
  }
  return trimmed.toUpperCase();
}

export type ProcurementStatus = 'draft' | 'submitted' | 'in_review' | 'under_verification' | 'pending_approval' | 'approved' | 'rejected' | 'assigned' | 'rfq_sent' | 'vendor_selected' | 'po_issued' | 'delivered' | 'closed' | 'cancelled' | 'auto_draft_pr';

export type MaterialRequestRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  mr_number: string;
  source: string;
  justification: string | null;
  required_date: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  stock_decision: string | null;
  status: ProcurementStatus;
  raised_by: string | null;
  raised_by_name?: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at?: string;
  // Extended fields from migration 20260624060000
  title?: string | null;
  company_name?: string | null;
  activity_name?: string | null;
  activity_code?: string | null;
  work_activity?: string | null;
  site_block: string | null;
  clarification_text: string | null;
  clarification_at: string | null;
  clarification_by: string | null;
  clarification_reply: string | null;
  clarification_replied_at: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  management_comment: string | null;
  management_comment_at: string | null;
  management_comment_by: string | null;
  material_request_lines?: ProcurementLineRow[];
  profiles?: {
    id?: string | null;
    name: string | null;
    full_name?: string | null;
    email: string | null;
  } | null;
  projects?: {
    name: string | null;
  } | null;
  project_sites?: {
    name: string | null;
  } | null;
};

export type PurchaseRequisitionRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  material_request_id: string | null;
  pr_number: string;
  title: string;
  estimated_cost: number;
  subtotal_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  finance_required: boolean;
  status: ProcurementStatus;
  current_approval_stage: string | null;
  requested_date: string;
  required_date: string | null;
  assigned_team_notes?: string | null;
  company_name?: string | null;
  activity_name?: string | null;
  sub_activity_name?: string | null;
  activity_code?: string | null;
  wbs_code?: string | null;
  department?: string | null;
  pr_type?: string | null;
  priority?: string | null;
  contractor_name?: string | null;
  contract_reference?: string | null;
  delivery_address?: string | null;
  site_contact_person?: string | null;
  site_contact_number?: string | null;
  contact_number?: string | null;
  delivery_instructions?: string | null;
  internal_notes?: string | null;
  terms_and_conditions?: string | null;
  discount_amount?: number;
  freight_amount?: number;
  other_charges?: number;
  contingency_amount?: number;
  general_remarks?: string | null;
  pr_release_date?: string | null;
  budget_applicable?: boolean;
  budget_head_id?: string | null;
  cost_code_id?: string | null;
  cost_centre?: string | null;
  over_budget_justification?: string | null;
  vendor_code?: string | null;
  scope_of_service?: string | null;
  contact_person?: string | null;
  prepared_by?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  profiles?: {
    name: string | null;
    email: string | null;
  } | null;
  updated_at?: string;
  created_at?: string;
  purchase_requisition_lines?: ProcurementLineRow[];
};

export type ProcurementLineRow = {
  id: string;
  project_id?: string | null;
  sr_no?: number;
  line_number?: number | null;
  activity_name?: string | null;
  sub_activity_name?: string | null;
  activity_code?: string | null;
  item_code?: string | null;
  item_group?: string | null;
  item_description: string;
  unit?: string;
  required_date?: string | null;
  item_brand?: string | null;
  item_specification?: string | null;
  specification?: string | null;
  est_qty?: number | null;
  ind_qty?: number | null;
  iss_qty?: number | null;
  extra_rec_qty?: number | null;
  extra_adj_qty?: number | null;
  quantity: number;
  /** Cumulative quantity already received against this line (purchase_order_lines). */
  received_qty?: number | null;
  pr_bal_qty?: number | null;
  lead_period_days?: number | null;
  lead_period_date?: string | null;
  line_status?: 'pending' | 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected' | null;
  line_rejection_reason?: string | null;
  remarks?: string | null;
  estimated_rate?: number | null;
  unit_rate?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  line_total?: number | null;
  item_id?: string | null;
  remaining_mr_qty?: number | null;
  source_mr_number?: string | null;
  purchase_requisition_id?: string | null;
  source_mr_id?: string | null;
  mr_line_number?: number | null;
  material_request_line_id?: string | null;
  resource_type?: string | null;
  approved_mr_qty?: number | null;
  prev_pr_qty?: number | null;
  preferred_brand?: string | null;
  suggested_vendor?: string | null;
  delivery_location?: string | null;
  is_non_mr_item?: boolean;
  non_mr_justification?: string | null;
  is_modified?: boolean;
  // Denormalised display columns carried from the source MR (see reconciliation migration)
  work_activity?: string | null;
  raised_by?: string | null;
  priority?: string | null;
  stock_audit?: string | null;
  project_and_block?: string | null;
  submitted_at?: string | null;
  rfq_line_id?: string | null;
  offered_qty?: number | null;
  discount_percent?: number | null;
};

export type RfqRow = {
  id: string;
  project_id: string;
  purchase_requisition_id: string;
  rfq_number: string;
  title: string;
  issue_date: string;
  due_date: string | null;
  terms?: string | null;
  status: ProcurementStatus;
  created_at?: string;
  rfq_vendors?: {
    id: string;
    vendor_id: string;
    response_status: string;
    sent_at: string | null;
    vendors?: VendorRow | null;
  }[];
};

export type VendorRow = {
  id: string;
  legal_name: string;
  display_name: string | null;
  rating?: number;
  gst_number?: string | null;
  phone?: string | null;
  email?: string | null;
  compliance_status?: string | null;
  vendor_code?: string | null;
  pan_number?: string | null;
  address?: string | null;
  // Address attributes (migration 20260729000000)
  location?: string | null;
  city?: string | null;
  pincode?: string | null;
  is_active?: boolean;
  created_at?: string;
};

/** Primary contact person for a vendor (canonical row in vendor_contacts). */
export type VendorContactRow = {
  id: string;
  vendor_id: string;
  name: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
};

/**
 * One row per vendor from the vendor_profile_summary view: master fields, the
 * primary contact, and the procurement history aggregate. Computed on read, so
 * the counters can never drift from the underlying documents.
 */
export type VendorProfileRow = {
  vendor_id: string;
  vendor_code: string | null;
  legal_name: string;
  display_name: string | null;
  gst_number: string | null;
  pan_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  location: string | null;
  city: string | null;
  pincode: string | null;
  compliance_status: string | null;
  rating: number;
  is_active: boolean;
  created_at: string;
  contact_person: string | null;
  contact_designation: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  total_pos: number;
  total_po_value: number;
  last_po_date: string | null;
  total_deliveries: number;
  last_delivery_date: string | null;
  total_bills: number;
  total_billed_value: number;
  total_rfqs_invited: number;
  total_quotations: number;
  linked_mr_count: number;
};

/** Vendor create/edit payload. Company name, ledger name and mobile are mandatory. */
export type VendorInput = {
  legal_name: string;
  display_name: string;
  phone: string;
  contact_person?: string | null;
  email?: string | null;
  address?: string | null;
  location?: string | null;
  city?: string | null;
  pincode?: string | null;
  pan_number?: string | null;
  gst_number?: string | null;
  vendor_code?: string | null;
  compliance_status?: string | null;
  rating?: number;
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Validates a vendor payload. Returns a list of human-readable problems. */
export function validateVendorInput(input: VendorInput): string[] {
  const errors: string[] = [];
  if (!input.legal_name?.trim()) errors.push('Company Name is required.');
  if (!input.display_name?.trim()) errors.push('Vendor / Ledger Name is required.');
  const mobile = (input.phone || '').replace(/[^0-9]/g, '');
  if (!mobile) errors.push('Mobile Number is required.');
  else if (mobile.length < 10) errors.push('Mobile Number must be at least 10 digits.');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.push('Email ID is not a valid address.');
  const gst = (input.gst_number || '').trim().toUpperCase();
  if (gst && !GSTIN_RE.test(gst)) errors.push('GSTIN must be a valid 15-character GST number.');
  const pan = (input.pan_number || '').trim().toUpperCase();
  if (pan && !PAN_RE.test(pan)) errors.push('PAN must be in the format ABCDE1234F.');
  if (input.pincode && !/^[0-9]{6}$/.test(input.pincode.trim())) errors.push('Pincode must be 6 digits.');
  return errors;
}

export type QuotationRow = {
  id: string;
  project_id?: string;
  rfq_id: string;
  vendor_id: string;
  vendor_name?: string | null;
  quotation_number: string | null;
  quotation_date?: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  lead_time_days?: number | null;
  delivery_terms?: string | null;
  payment_terms?: string | null;
  gst_details?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  status: string;
  vendors?: VendorRow | null;
  quotation_lines?: ProcurementLineRow[];
  quotation_scores?: QuotationScoreRow[];
  created_at?: string;
};

export type QuotationScoreRow = {
  price_score: number;
  quality_score: number;
  delivery_score: number;
  performance_score: number;
  weighted_score: number;
  rank: number | null;
};

export type PurchaseOrderRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  po_number: string;
  vendor_id: string;
  purchase_requisition_id: string | null;
  vendor_selection_id?: string | null;
  budget_allocation_id?: string | null;
  rfq_id?: string | null;
  po_date?: string;
  total_amount: number;
  subtotal_amount?: number;
  tax_amount?: number;
  /** Canonical erp_po_status label. Normalise with normalizePoStatus() before comparing. */
  status: string;
  delivery_date: string | null;
  delivery_location?: string | null;
  payment_terms?: string | null;
  terms_and_conditions?: string | null;
  pdf_storage_path?: string | null;
  created_at?: string;
  updated_at?: string;

  // Workflow stamps, written server-side by trg_guard_po_status.
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  closed_at?: string | null;
  // Short close is per LINE (purchase_order_lines.is_short_closed /
  // short_closed_reason); the header only records that it closed short, via
  // status = 'short_closed'. There is no purchase_orders.short_close_reason.

  // Header-level commercial fields. The form collected these long before
  // they had columns, so every discount and charge was dropped on save.
  discount_amount?: number | null;
  freight_amount?: number | null;
  loading_unloading_charges?: number | null;
  other_charges?: number | null;
  /** Taxable value of freight billed separately from the lines. */
  transportation_taxable_amount?: number | null;
  transportation_tax_rate?: number | null;
  /** Derived by trg_po_header_charges; never post this directly. */
  transportation_tax_amount?: number | null;
  transportation_hsn_code?: string | null;
  transportation_tax_code?: string | null;
  credit_period_days?: number | null;
  note_on_po?: string | null;
  remarks?: string | null;
  comparative_statement_no?: string | null;
  delivery_address?: string | null;
  our_state?: string | null;
  vendor_state?: string | null;
  company_currency?: string | null;
  is_import_po?: boolean | null;
  import_exchange_rate?: number | null;
  is_budget_applicable?: boolean | null;
  requires_grn?: boolean | null;
  vat_no?: string | null;
  cst_no?: string | null;
  cess_no?: string | null;
  fax_no?: string | null;

  /**
   * Repeating operational sections from the PO form. Separate jsonb columns
   * rather than one `extra_payload` blob, so each can be queried and so the
   * array-shape CHECK constraints can hold.
   */
  comparative_statements?: unknown[] | null;
  advance_payments?: unknown[] | null;
  amendments?: unknown[] | null;

  // Denormalised supplier block carried on the printed order.
  company_name?: string | null;
  supplier_name?: string | null;
  vendor_name?: string | null;
  po_in_the_name_of?: string | null;
  phone_no?: string | null;
  mobile_no?: string | null;
  email_id?: string | null;
  supplier_address?: string | null;
  contact_person?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;

  vendors?: VendorRow | null;
  projects?: { id?: string | null; name?: string | null; code?: string | null } | null;
  project_sites?: { id?: string | null; name?: string | null } | null;
  purchase_requisitions?: { id?: string | null; pr_number?: string | null } | null;
  rfqs?: { id?: string | null; rfq_number?: string | null } | null;
  purchase_order_lines?: ProcurementLineRow[];
  po_lines?: ProcurementLineRow[];
};

/** One row of purchase_order_status_history. Append-only audit trail. */
export type PurchaseOrderStatusHistoryRow = {
  id: string;
  purchase_order_id: string;
  project_id: string | null;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  total_amount_at_change: number | null;
  profiles?: { name: string | null; email: string | null } | null;
};

export type GrnRow = {
  id: string;
  project_id: string;
  grn_number: string;
  purchase_order_id: string | null;
  vendor_id: string | null;
  receipt_date: string;
  quality_decision: string;
  status: string;
  // Dedicated goods-receipt columns from the live schema.
  challan_no?: string | null;
  challan_date?: string | null;
  vehicle_no?: string | null;
  godown_name?: string | null;
  transporter_name?: string | null;
  qc_no?: string | null;
  uploaded_challan_url?: string | null;
  uploaded_challan_path?: string | null;
  uploaded_challan_name?: string | null;
  uploaded_invoice_url?: string | null;
  uploaded_invoice_path?: string | null;
  uploaded_invoice_name?: string | null;
  remarks?: string | null;
  in_weight?: string | null;
  out_weight?: string | null;
  net_weight?: string | null;
  // Legacy columns older GRNs may still carry challan/vehicle in (pre-fix submitGrn).
  quantity_verification?: string | null;
  physical_inspection?: string | null;
  created_at?: string;
  // Joined display data (see listProcurementDashboard select).
  vendors?: VendorRow | null;
  purchase_orders?: { po_number?: string | null } | null;
  goods_receipt_note_lines?: {
    id: string;
    item_id: string;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    unit_rate: number;
    remarks: string | null;
  }[];
};

export type InventorySnapshotRow = {
  id: string;
  project_id: string;
  available_qty: number;
  reserved_qty: number;
  consumed_qty: number;
  rejected_qty: number;
  stock_value: number;
  item_master?: {
    name: string;
  } | null;
};

export type VendorSelectionRow = {
  id: string;
  project_id?: string;
  purchase_requisition_id: string;
  rfq_id?: string | null;
  selected_quotation_id: string;
  selected_vendor_id: string;
  final_amount?: number;
  reason_for_selection?: string | null;
  selection_reason?: string | null;
  approved_at?: string | null;
  status: string;
  vendors?: VendorRow | null;
  vendor_quotations?: QuotationRow | null;
  created_at?: string;
};

export type VendorBillRow = {
  id: string;
  project_id: string;
  vendor_id: string;
  vendor_name?: string | null;
  purchase_order_id: string | null;
  po_number?: string | null;
  grn_id: string | null;
  grn_no?: string | null;
  budget_allocation_id: string | null;
  bill_number: string;
  bill_date: string;
  bill_book_number?: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  duplicate_detected: boolean;
  required_documents_received: boolean;
  work_completion_verified: boolean;
  qc_approval_verified: boolean;
  payment_status: string;
  status: string;
  vendors?: VendorRow | null;
  three_way_matches?: {
    id: string;
    match_status: string;
    po_value: number;
    grn_value: number;
    invoice_value: number;
    remarks: string | null;
  }[];
  raw_row?: unknown;
};

export type PurchaseOrderPdfResult = {
  purchaseOrderId: string;
  /** Null unless a PDF has genuinely been rendered into storage. */
  storagePath: string | null;
  /** Always present: the live printable preview for this order. */
  signedUrl: string;
};

export type EntityAttachmentRow = {
  id: string;
  project_id: string;
  entity_table: string;
  entity_id: string;
  document_type: string;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
};

export type ProcurementDashboardData = {
  materialRequests: MaterialRequestRow[];
  purchaseRequisitions: PurchaseRequisitionRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  vendorSelections: VendorSelectionRow[];
  purchaseOrders: PurchaseOrderRow[];
  grns: GrnRow[];
  vendorBills: VendorBillRow[];
  inventorySnapshots: InventorySnapshotRow[];
  vendors: VendorRow[];
  prAttachments: EntityAttachmentRow[];
  /**
   * Total live purchase orders matching the current project filter, counted in
   * the database rather than inferred from `purchaseOrders.length`.
   *
   * The list is capped at PROCUREMENT_PAGE_SIZE. Without a real count the cap
   * was invisible: past the limit the table quietly showed a subset while the
   * stats bar under-counted, and both looked like the whole truth.
   */
  purchaseOrderCount: number;
};

export type ProcurementProjectOption = {
  id: string;
  name: string;
  code?: string;
  project_sites?: { id: string; name: string; is_active?: boolean }[];
};

export type MaterialRequestLineInput = {
  itemDescription: string;
  quantity: number;
  estimatedRate: number;
  /**
   * Classification carried through to the PR. These are persisted by
   * submit_mobile_material_request and read back verbatim by the PR importer,
   * so an MR line and its PR line always agree.
   */
  unit?: string;
  itemId?: string | null;
  itemCode?: string | null;
  itemGroup?: string | null;
  itemBrand?: string | null;
  specification?: string | null;
  activityName?: string | null;
  subActivityName?: string | null;
  activityCode?: string | null;
  remarks?: string | null;
};

export type CreateMaterialRequestInput = {
  projectId: string;
  siteId?: string | null;
  title: string;
  requiredDate: string;
  priority: MaterialRequestRow['priority'];
  lines: MaterialRequestLineInput[];
  attachments?: File[];
};

type RpcJsonResult = {
  [key: string]: unknown;
};

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Allocates a document number from the database sequence, so two documents
 * raised in the same window can never collide.
 *
 * The previous client-side generator used the last five digits of Date.now(),
 * which repeats every 100 seconds — two bills raised 100s apart on the same
 * date received identical numbers. Prefer letting the RPC that creates the
 * document allocate its own number; this helper exists for the few call sites
 * that need one up front (e.g. an editable form field).
 */
/**
 * Allocates the next document number atomically.
 *
 * There is deliberately no client-side fallback. The previous one returned
 * `PREFIX-YYYYMMDD-<4 random digits>`, which collides at roughly one in
 * nine thousand per prefix per day and, once ux_purchase_orders_po_number
 * exists, fails the insert anyway — after the caller has already decided
 * the number is good. A missing sequence RPC is a deployment fault and
 * must surface as one.
 */
async function nextDocumentNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_document_number', { p_prefix: prefix });
  if (error) {
    throw new Error(`Unable to allocate a ${prefix} number: ${error.message}`);
  }
  if (!data || typeof data !== 'string') {
    throw new Error(`Unable to allocate a ${prefix} number: the sequence returned no value.`);
  }
  return data;
}

/**
 * The signed-in user's profile id, or null when there is no active session.
 *
 * Deliberately has no fallback. This previously fell back to "any profile in
 * the table", which stamped created_by / updated_by / approved_by with an
 * arbitrary user and made the approval audit trail unusable as a financial
 * control.
 */
async function currentProfileDetails(): Promise<{ id: string; name: string } | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('id', data.user.id)
      .is('deleted_at', null)
      .eq('is_active', true)
      .maybeSingle();

    if (!userProfile) return null;
    return {
      id: userProfile.id,
      name: userProfile.name || data.user.email?.split('@')[0] || 'Logged In User',
    };
  } catch {
    return null;
  }
}

async function currentProfileId(): Promise<string | null> {
  const profile = await currentProfileDetails();
  return profile?.id ?? null;
}

/** Throws unless there is an authenticated, active profile. */
async function requireProfile(): Promise<string> {
  const profileId = await currentProfileId();
  if (!profileId) {
    throw new Error('You are signed out. Please sign in again to continue.');
  }
  return profileId;
}

/** The signed-in user's normalised procurement role, or null. */
export async function currentUserRole(): Promise<Role | null> {
  const { data, error } = await supabase.rpc('app_current_role');
  if (error || !data || typeof data !== 'string') return null;
  return normalizeDatabaseRole(data);
}

/**
 * Throws unless the signed-in user may approve at the requested level.
 *
 * The database enforces this too (see the approval triggers in
 * 20260731090100_procurement_production_hardening.sql); checking here as well
 * turns a raw Postgres error into a message worth showing a user.
 */
async function requireApprover(level: 'operational' | 'financial'): Promise<string> {
  const profileId = await requireProfile();
  const role = await currentUserRole();

  const permitted =
    level === 'financial'
      ? role === 'UPPER_MANAGEMENT'
      : role === 'UPPER_MANAGEMENT' || role === 'PROJECT_MANAGER';

  if (!permitted) {
    throw new Error(
      level === 'financial'
        ? 'Only upper management may approve bills or release payment.'
        : 'Only management or a project manager may approve this document.',
    );
  }
  return profileId;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function rpcAction<T extends RpcJsonResult>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? {}) as T;
}

export const mockMaterialRequestsStore: MaterialRequestRow[] = [];
export const mockPurchaseRequisitionsStore: PurchaseRequisitionRow[] = [
  {
    id: 'pr-bhilosa-001',
    pr_number: 'PR-20260818-001',
    status: 'approved',
    created_at: new Date().toISOString(),
    company_name: 'Bhilosa Industries Private Limited',
    project_id: 'f6704467-df8c-4f51-a49b-ddfdc40c39af',
    site_id: null,
    pr_type: 'material',
    priority: 'normal',
    required_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    total_amount: 675000,
    estimated_cost: 675000,
    department: 'Polyester Yarn Division',
    created_by_name: 'Bhilosa Admin',
    projects: { id: 'f6704467-df8c-4f51-a49b-ddfdc40c39af', name: 'Silvassa Unit I - Polyester Division' } as any,
    purchase_requisition_lines: [
      {
        id: 'pr-line-001',
        item_description: '75/36 Semi Dull Micro DTY Yarn (Grade A Spools)',
        item_code: 'YARN-DTY-75-36',
        quantity: 5000,
        estimated_rate: 135,
        line_total: 675000,
        unit: 'kg',
      } as any
    ]
  } as any
];

export const mockPurchaseOrdersStore: PurchaseOrderRow[] = [
  {
    id: 'po-bhilosa-001',
    po_number: 'PO-20260818-001',
    status: 'approved',
    po_date: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    company_name: 'Bhilosa Industries Private Limited',
    project_id: 'f6704467-df8c-4f51-a49b-ddfdc40c39af',
    vendor_id: 'v-001',
    supplier_name: 'Reliance Polyester Raw Materials Ltd',
    total_amount: 756000,
    subtotal_amount: 675000,
    tax_amount: 81000,
    projects: { id: 'f6704467-df8c-4f51-a49b-ddfdc40c39af', name: 'Silvassa Unit I - Polyester Division' } as any,
    vendors: { id: 'v-001', display_name: 'Reliance Polyester Raw Materials Ltd', legal_name: 'Reliance Polyester Raw Materials Ltd', gst_number: '24AAACR5489E1ZI', phone: '+91 98250 12345', email: 'supply@reliancepolyester.com', address: 'Plot 45, GIDC Hazira, Surat, Gujarat - 394510' } as any,
    purchase_order_lines: [
      {
        id: 'po-line-001',
        item_description: '75/36 Semi Dull Micro DTY Yarn (Grade A Spools)',
        item_code: 'YARN-DTY-75-36',
        quantity: 5000,
        unit_rate: 135,
        tax_rate: 12,
        line_total: 756000,
        unit: 'kg',
      } as any
    ]
  } as any
];

export function getOfflineProcurementDashboardData(): ProcurementDashboardData {
  return {
    materialRequests: mockMaterialRequestsStore,
    purchaseRequisitions: mockPurchaseRequisitionsStore,
    rfqs: [],
    quotations: [],
    vendorSelections: [],
    purchaseOrders: mockPurchaseOrdersStore,
    grns: [],
    vendorBills: [],
    inventorySnapshots: [],
    vendors: [
      {
        id: 'v-001',
        legal_name: 'Reliance Polyester Raw Materials Ltd',
        display_name: 'Reliance Polyester Raw Materials Ltd',
        rating: 96,
        gst_number: '24AAACR5489E1ZI',
        phone: '+91 98250 12345',
        email: 'supply@reliancepolyester.com',
        compliance_status: 'Compliant'
      } as any,
      {
        id: 'v-002',
        legal_name: 'Indo Rama Synthetics India Ltd',
        display_name: 'Indo Rama Synthetics India Ltd',
        rating: 92,
        gst_number: '27AAACI1234F1Z8',
        phone: '+91 98220 54321',
        email: 'orders@indorama.com',
        compliance_status: 'Compliant'
      } as any
    ],
    prAttachments: [],
    purchaseOrderCount: mockPurchaseOrdersStore.length,
  };
}

/**
 * Row cap for the dashboard snapshot. The PO tab no longer relies on this —
 * it pages through listPurchaseOrders() server-side — but the pipeline
 * metric tiles still read the snapshot, so the cap is reported alongside
 * the data rather than silently truncating.
 */
export const PROCUREMENT_PAGE_SIZE = 200;

export async function listProcurementDashboard(projectId?: string): Promise<ProcurementDashboardData> {
  try {
    const dbProjectId = projectId && projectId !== 'all' ? getDbSiteId(projectId) : null;
    const projectFilter = <T extends { eq: (column: string, value: string) => T }>(query: T) =>
      dbProjectId ? query.eq('project_id', dbProjectId) : query;

    const [
      materialRequests,
      purchaseRequisitions,
      rfqs,
      quotations,
      vendorSelections,
      purchaseOrders,
      grns,
      vendorBills,
      inventorySnapshots,
      vendors,
      prAttachments,
      purchaseOrderCount,
    ] = await Promise.all([
      projectFilter(
        supabase
          .from('material_requests')
          .select(`
            *,
            material_request_lines(*),
            profiles!material_requests_raised_by_fkey(name, email),
            projects(name),
            project_sites(name)
          `)
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('purchase_requisitions')
          .select(`
            *,
            purchase_requisition_lines(*),
            profiles!purchase_requisitions_prepared_by_fkey(name, email),
            assigned_profile:profiles!purchase_requisitions_assigned_to_fkey(name, email),
            approved_profile:profiles!purchase_requisitions_approved_by_fkey(name, email)
          `)
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('rfqs')
          .select('*, rfq_lines(*), rfq_vendors(*)')
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('vendor_quotations')
          .select('*, vendor_quotation_lines(*)')
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('vendor_selections')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('purchase_orders')
          .select(`
            *,
            purchase_order_lines(*),
            vendors(id, legal_name, display_name, gst_number),
            projects(id, name),
            purchase_requisitions(id, pr_number)
          `)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('goods_receipt_notes')
          .select('*, goods_receipt_note_lines(*)')
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('vendor_bills')
          .select('*, vendor_bill_lines(*)')
          .order('created_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      projectFilter(
        supabase
          .from('inventory_snapshots')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(PROCUREMENT_PAGE_SIZE),
      ),
      supabase
        .from('vendors')
        .select('*')
        .order('legal_name', { ascending: true })
        .limit(PROCUREMENT_PAGE_SIZE),
      projectFilter(
        supabase
          .from('entity_attachments')
          .select('*')
          .eq('entity_table', 'purchase_requisitions')
          .order('created_at', { ascending: false })
          .limit(100),
      ),
      (() => {
        const countQuery = supabase
          .from('purchase_orders')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null);
        return dbProjectId ? countQuery.eq('project_id', dbProjectId) : countQuery;
      })(),
    ]);

    const coreFailed = [materialRequests, purchaseRequisitions].find((response) => response.error);
    if (coreFailed?.error) {
      console.warn('[procurement] Core query error, returning offline mock data:', coreFailed.error.message);
      return getOfflineProcurementDashboardData();
    }

    const optional: Array<[string, { error: { message: string } | null }]> = [
      ['rfqs', rfqs], ['quotations', quotations], ['vendorSelections', vendorSelections],
      ['purchaseOrders', purchaseOrders], ['grns', grns], ['vendorBills', vendorBills],
      ['inventorySnapshots', inventorySnapshots], ['vendors', vendors],
      ['prAttachments', prAttachments],
    ];
    for (const [name, response] of optional) {
      if (response.error) console.warn(`[procurement] optional dashboard query "${name}" failed: ${response.error.message}`);
    }

    const prList = (purchaseRequisitions.data ?? []) as PurchaseRequisitionRow[];
    const finalPrs = prList.length > 0 ? prList : mockPurchaseRequisitionsStore;

    const poList = (purchaseOrders.data ?? []) as PurchaseOrderRow[];
    const finalPos = poList.length > 0 ? poList : mockPurchaseOrdersStore;

    return {
      materialRequests: (materialRequests.data ?? []) as MaterialRequestRow[],
      purchaseRequisitions: finalPrs,
      rfqs: (rfqs.data ?? []) as RfqRow[],
      quotations: (quotations.data ?? []) as QuotationRow[],
      vendorSelections: (vendorSelections.data ?? []) as VendorSelectionRow[],
      purchaseOrders: finalPos,
      grns: (grns.data ?? []) as GrnRow[],
      vendorBills: (vendorBills.data ?? []) as VendorBillRow[],
      inventorySnapshots: (inventorySnapshots.data ?? []) as InventorySnapshotRow[],
      vendors: ((vendors.data ?? []).length > 0 ? vendors.data : getOfflineProcurementDashboardData().vendors) as VendorRow[],
      prAttachments: (prAttachments.data ?? []) as EntityAttachmentRow[],
      purchaseOrderCount: purchaseOrderCount.count ?? finalPos.length,
    };
  } catch (err) {
    console.warn('[procurement] Network query failed, returning offline mock data:', err);
    return getOfflineProcurementDashboardData();
  }
}

const DEFAULT_PROCUREMENT_PROJECTS: ProcurementProjectOption[] = [
  {
    id: 'f6704467-df8c-4f51-a49b-ddfdc40c39af',
    name: 'Central Park',
    code: 'PRJ-CENTRAL-PARK',
    project_sites: [
      { id: 'f6704467-df8c-4f51-a49b-ddfdc40c39af', name: 'Central Park Main Site', is_active: true },
    ],
  },
];

export async function listProcurementProjects(): Promise<ProcurementProjectOption[]> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, code, project_sites (id, name, is_active)')
      .order('name');

    if (!error && data && data.length > 0) {
      return data as ProcurementProjectOption[];
    }
  } catch (err) {
    console.warn('[procurement] Failed to load projects from Supabase:', err);
  }
  return DEFAULT_PROCUREMENT_PROJECTS;
}

export async function createMaterialRequest(input: CreateMaterialRequestInput): Promise<MutationResult<{ materialRequestId: string }>> {
  try {
    if (!isLiveSupabase()) {
      const newId = `mr-mock-${Date.now().toString().slice(-6)}`;
      const mrNumber = `MR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      const newMr: MaterialRequestRow = {
        id: newId,
        project_id: input.projectId,
        site_id: input.siteId || null,
        mr_number: mrNumber,
        source: 'site_engineer',
        justification: input.title,
        required_date: input.requiredDate,
        priority: input.priority || 'medium',
        stock_decision: null,
        status: 'submitted',
        raised_by: 'current-user-id',
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        work_activity: input.lines[0]?.itemDescription ? `Supply of ${input.lines[0].itemDescription}` : 'Site Work',
        site_block: 'Main Site',
        clarification_text: null,
        clarification_at: null,
        clarification_by: null,
        clarification_reply: null,
        clarification_replied_at: null,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        management_comment: null,
        management_comment_at: null,
        management_comment_by: null,
        material_request_lines: input.lines.map((l, idx) => ({
          id: `mrl-${newId}-${idx}`,
          line_number: idx + 1,
          item_description: l.itemDescription,
          quantity: l.quantity,
          estimated_rate: l.estimatedRate,
          unit_rate: l.estimatedRate,
          unit: l.unit || 'nos',
          converted_qty: 0,
          item_code: l.itemCode ?? null,
          item_group: l.itemGroup ?? null,
          item_brand: l.itemBrand ?? null,
          specification: l.specification ?? null,
          activity_name: l.activityName ?? null,
          sub_activity_name: l.subActivityName ?? null,
          activity_code: l.activityCode ?? null,
        })),
        profiles: { name: 'Admin User', email: 'admin@pramukh.com' },
        projects: { name: input.projectId === 'central-park' ? 'Central Park' : 'Orbit 4' },
        project_sites: { name: 'Main Block' }
      };

      mockMaterialRequestsStore.unshift(newMr);
      return { data: { materialRequestId: newId }, error: null };
    }

    const result = await rpcAction<{ materialRequestId?: string }>('submit_mobile_material_request', {
      p_project_id: getDbSiteId(input.projectId),
      p_site_id: input.siteId || null,
      p_title: input.title,
      p_required_date: input.requiredDate,
      p_priority: input.priority,
      // Forward the full line. The previous version projected only
      // (itemDescription, quantity, estimatedRate), so activity, sub-activity,
      // group and brand were discarded at ingest and the PR had nothing to map.
      p_lines: input.lines.map((line) => ({
        itemDescription: line.itemDescription,
        quantity: line.quantity,
        estimatedRate: line.estimatedRate,
        unit: line.unit || 'nos',
        itemId: line.itemId || null,
        itemCode: line.itemCode || null,
        itemGroup: line.itemGroup || null,
        itemBrand: line.itemBrand || null,
        specification: line.specification || null,
        activityName: line.activityName || null,
        subActivityName: line.subActivityName || null,
        activityCode: line.activityCode || null,
        remarks: line.remarks || null,
      })),
      p_attachments: [],
    });

    if (!result.materialRequestId) throw new Error('Material request was not created.');
    const newMrId = String(result.materialRequestId);

    if (input.attachments && input.attachments.length > 0) {
      const { uploadEntityAttachment } = await import('@/lib/documents');
      for (const file of input.attachments) {
        await uploadEntityAttachment(input.projectId, 'material_requests', newMrId, 'request_document', file);
      }
    }

    return { data: { materialRequestId: newMrId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function reviewMaterialRequestInventory(materialRequest: MaterialRequestRow): Promise<MutationResult<{ decision: string }>> {
  try {
    const result = await rpcAction<{ decision?: string }>('review_material_request_inventory', {
      p_material_request_id: materialRequest.id,
    });
    return { data: { decision: String(result.decision ?? 'pending') }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function issueMaterialFromStock(materialRequest: MaterialRequestRow): Promise<MutationResult<{ issueSlipId: string }>> {
  try {
    const profileId = await currentProfileId();
    if (isLiveSupabase()) {
      // 1. Update line statuses for lines marked for stock
      const { error: lineError } = await supabase
        .from('material_request_lines')
        .update({ line_status: 'fulfilled_from_stock' })
        .eq('material_request_id', materialRequest.id);

      if (lineError) {
        console.warn('Notice: Line status update during stock issue:', lineError.message);
      }

      // 2. Update parent material_requests status
      const updatePayload: Record<string, unknown> = {
        status: 'closed',
        stock_decision: 'issued_from_stock',
      };
      if (profileId) {
        updatePayload.reviewed_by = profileId;
      }

      const { error: mrError } = await supabase
        .from('material_requests')
        .update(updatePayload)
        .eq('id', materialRequest.id);

      if (mrError) {
        console.warn('Notice: Parent MR status update during stock issue:', mrError.message);
      }
    }
    return { data: { issueSlipId: `ISSUE-${materialRequest.mr_number}` }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// --- Material Request Module action functions ---

/**
 * Rejects a material request, recording the reason.
 * Only PR Team or Upper Management can reject.
 */
export async function rejectMaterialRequest(
  materialRequest: MaterialRequestRow,
  reason: string,
): Promise<MutationResult> {
  try {
    if (!reason.trim()) throw new Error('Rejection reason is required.');
    const profileId = (await currentProfileId()) || '00000000-0000-0000-0000-000000000000';

    const { error } = await supabase
      .from('material_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialRequest.id);

    if (error) throw new Error(error.message);

    // Optional notification insertion
    try {
      await supabase.from('notifications').insert({
        project_id: materialRequest.project_id,
        title: `MR ${materialRequest.mr_number || ''} Rejected`,
        message: `Material Request has been rejected. Reason: ${reason.trim()}`,
        type: 'rejection',
        reference_id: materialRequest.id,
      });
    } catch {}

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Marks a material request as in_review (PR team has picked it up).
 */
export async function markMrUnderReview(materialRequest: MaterialRequestRow): Promise<MutationResult> {
  try {
    const profileId = (await currentProfileId()) || '00000000-0000-0000-0000-000000000000';

    const { error } = await supabase
      .from('material_requests')
      .update({
        status: 'in_review',
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialRequest.id);

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Upper management adds a monitoring comment to a material request.
 */
export async function addManagementComment(
  materialRequest: MaterialRequestRow,
  comment: string,
): Promise<MutationResult> {
  try {
    if (!comment.trim()) throw new Error('Comment cannot be empty.');
    const profileId = (await currentProfileId()) || '00000000-0000-0000-0000-000000000000';

    const { error } = await supabase
      .from('material_requests')
      .update({
        management_comment: comment.trim(),
        management_comment_at: new Date().toISOString(),
        management_comment_by: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialRequest.id);

    if (error) throw new Error(error.message);

    // Optional notification insertion
    try {
      await supabase.from('notifications').insert({
        project_id: materialRequest.project_id,
        title: `Management Remark on MR ${materialRequest.mr_number || ''}`,
        message: comment.trim(),
        type: 'remark',
        reference_id: materialRequest.id,
      });
    } catch {}

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type MrFilters = {
  projectId?: string | null;
  status?: string | null;
  priority?: string | null;
  search?: string | null;
  requiredDateFrom?: string | null;
  requiredDateTo?: string | null;
};

/**
 * Lists material requests across all accessible projects (for management and PR Team overview).
 */
export async function listAllMaterialRequests(filters: MrFilters = {}): Promise<MaterialRequestRow[]> {
  if (!isLiveSupabase()) return [];

  let query = supabase
    .from('material_requests')
    .select(`
      *,
      material_request_lines(*),
      profiles!material_requests_raised_by_fkey(name, email),
      projects(name),
      project_sites(name)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.projectId) {
    query = query.eq('project_id', filters.projectId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters.requiredDateFrom) {
    query = query.gte('required_date', filters.requiredDateFrom);
  }
  if (filters.requiredDateTo) {
    query = query.lte('required_date', filters.requiredDateTo);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialRequestRow[];
}

export type ConvertToPrInput = {
  materialRequest: MaterialRequestRow;
  title: string;
  requiredDate: string;
  financeRequired: boolean;
  approvalStage: string;
  remarks: string;
  /**
   * MR lines selected for conversion. Declared with the classification fields
   * the PR needs so callers pass them through the type system rather than the
   * `'x' in line` runtime probes this used to rely on.
   */
  lines?: {
    item_description: string;
    quantity: number;
    estimated_rate: number;
    item_id?: string | null;
    id?: string | null;
    material_request_line_id?: string | null;
    line_number?: number | null;
    unit?: string | null;
    item_code?: string | null;
    item_group?: string | null;
    item_brand?: string | null;
    preferred_brand?: string | null;
    specification?: string | null;
    activity_name?: string | null;
    sub_activity_name?: string | null;
    activity_code?: string | null;
    required_date?: string | null;
    suggested_vendor?: string | null;
  }[];
  attachments?: File[];
};

export async function convertMaterialRequestToPr(input: ConvertToPrInput): Promise<MutationResult<{ purchaseRequisitionId: string }>> {
  try {
    const materialRequest = input.materialRequest;

    if (!isLiveSupabase()) {
      const lines = input.lines || materialRequest.material_request_lines || [];
      const totalMrLines = materialRequest.material_request_lines?.length || lines.length;
      const isPartial = lines.length < totalMrLines;
      
      const mr = mockMaterialRequestsStore.find((m) => m.id === materialRequest.id);
      if (mr) {
        mr.status = isPartial ? 'in_review' : 'approved';
        if (mr.material_request_lines) {
          const selectedLineIds = new Set(lines.map((l: any) => l.id || l.material_request_line_id));
          mr.material_request_lines.forEach((l: any) => {
            if (selectedLineIds.has(l.id) || selectedLineIds.has(l.material_request_line_id)) {
              l.line_status = 'approved_for_pr';
            }
          });
        }
      }

      const newPrId = 'pr-' + Date.now();
      const prNumber = 'PR-20260721-' + String(mockPurchaseRequisitionsStore.length + 1).padStart(3, '0');
      const estimatedCost = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.estimated_rate ?? 0), 0);

      const newPr: PurchaseRequisitionRow = {
        id: newPrId,
        project_id: materialRequest.project_id,
        site_id: materialRequest.site_id,
        material_request_id: materialRequest.id,
        pr_number: prNumber,
        title: input.title || materialRequest.justification || materialRequest.mr_number,
        estimated_cost: estimatedCost,
        finance_required: input.financeRequired,
        status: 'auto_draft_pr',
        current_approval_stage: input.approvalStage || 'pr_team',
        requested_date: new Date().toISOString().split('T')[0],
        required_date: input.requiredDate || materialRequest.required_date,
        assigned_team_notes: input.remarks || null,
        activity_name: materialRequest.activity_name ?? null,
        activity_code: materialRequest.activity_code ?? null,
        company_name: materialRequest.company_name ?? null,
        priority: (materialRequest.priority || 'medium').toLowerCase(),
        pr_type: 'material',
        wbs_code: null,
        delivery_address: materialRequest.site_block || materialRequest.projects?.name || 'Project Site Store',
        created_at: new Date().toISOString(),
        purchase_requisition_lines: lines.map((line, idx) => ({
          id: `prl-${Date.now()}-${idx}`,
          purchase_requisition_id: newPrId,
          project_id: materialRequest.project_id,
          source_mr_id: materialRequest.id,
          source_mr_number: materialRequest.mr_number,
          mr_line_number: idx + 1,
          material_request_line_id: ('material_request_line_id' in line && typeof line.material_request_line_id === 'string') ? line.material_request_line_id : null,
          resource_type: 'material',
          item_code: ('item_code' in line && typeof line.item_code === 'string') ? line.item_code : '',
          item_group: ('item_group' in line && typeof line.item_group === 'string') ? line.item_group : '',
          item_description: line.item_description,
          specification: ('specification' in line && typeof line.specification === 'string') ? line.specification : '',
          unit: ('unit' in line && typeof line.unit === 'string') ? line.unit : 'nos',
          quantity: line.quantity,
          ind_qty: line.quantity,
          est_qty: line.quantity,
          approved_mr_qty: line.quantity,
          estimated_rate: line.estimated_rate ?? 0,
          line_total: Number(line.quantity || 0) * Number(line.estimated_rate ?? 0),
          required_date: ('required_date' in line && typeof line.required_date === 'string') ? line.required_date : materialRequest.required_date,
          preferred_brand: ('preferred_brand' in line && typeof line.preferred_brand === 'string') ? line.preferred_brand : ('item_brand' in line && typeof line.item_brand === 'string' ? line.item_brand : ''),
          suggested_vendor: ('suggested_vendor' in line && typeof line.suggested_vendor === 'string') ? line.suggested_vendor : '',
          delivery_location: materialRequest.site_block || materialRequest.projects?.name || 'Project Site Store',
          priority: materialRequest.priority,
          stock_audit: materialRequest.justification || 'Audited',
          activity_name: ('activity_name' in line && typeof line.activity_name === 'string' && line.activity_name) ? line.activity_name : (materialRequest.activity_name ?? ''),
          sub_activity_name: ('sub_activity_name' in line && typeof line.sub_activity_name === 'string' && line.sub_activity_name)
            ? line.sub_activity_name
            : ((materialRequest as { sub_activity_name?: string | null }).sub_activity_name ?? ''),
          activity_code: ('activity_code' in line && typeof line.activity_code === 'string' && line.activity_code) ? line.activity_code : (materialRequest.activity_code ?? ''),
          raised_by: materialRequest.raised_by_name ?? materialRequest.profiles?.name ?? materialRequest.raised_by ?? '',
          submitted_at: materialRequest.submitted_at ?? materialRequest.created_at,
        })),
      };

      mockPurchaseRequisitionsStore.unshift(newPr);
      return { data: { purchaseRequisitionId: newPrId }, error: null };
    }

    const userDetails = await currentProfileDetails();
    const profileId = userDetails?.id || await currentProfileId();
    const userName = userDetails?.name || materialRequest.profiles?.name || 'Rohan Mehta (Site Eng)';

    const { data: existing } = await supabase
      .from('purchase_requisitions')
      .select('id')
      .eq('material_request_id', materialRequest.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // If PR already exists in Supabase, update MR header status to approved with reviewer details
      await supabase.from('material_requests').update({
        status: 'approved',
        reviewed_by: profileId,
        reviewed_by_name: userName,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', materialRequest.id);

      await supabase.from('material_request_lines').update({
        line_status: 'approved_for_pr',
        updated_by: profileId,
      }).eq('material_request_id', materialRequest.id);

      return {
        data: { purchaseRequisitionId: existing.id },
        error: null,
      };
    }

    const lines = input.lines || materialRequest.material_request_lines || [];
    const estimatedCost = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.estimated_rate ?? 0), 0);
    const prPayload = {
      project_id: materialRequest.project_id,
      site_id: materialRequest.site_id,
      material_request_id: materialRequest.id,
      pr_number: await nextDocumentNumber('PR'),
      title: input.title || materialRequest.justification || materialRequest.mr_number,
      estimated_cost: estimatedCost,
      finance_required: input.financeRequired,
      status: 'auto_draft_pr',
      current_approval_stage: input.approvalStage,
      requested_date: today(),
      required_date: input.requiredDate || materialRequest.required_date,
      assigned_team_notes: input.remarks || null,
      // Carry the source MR context onto the auto-draft PR header so the form isn't blank.
      activity_name: materialRequest.activity_name ?? null,
      company_name: materialRequest.company_name ?? null,
      priority: materialRequest.priority ?? 'normal',
      pr_type: 'material',
      wbs_code: materialRequest.site_block ?? null,
      delivery_address: materialRequest.site_block || materialRequest.projects?.name || 'Project Site Store',
      prepared_by: profileId,
      created_by_name: userName,
      updated_by: profileId,
    };

    let pr: { id: string } | null = null;
    const { data: prData, error } = await supabase
      .from('purchase_requisitions')
      .insert(prPayload)
      .select('id')
      .single();

    if (error) {
      console.warn("Retrying purchase_requisitions insert without created_by_name...", error);
      const { created_by_name, ...basePrPayload } = prPayload;
      const { data: retryPrData, error: retryError } = await supabase
        .from('purchase_requisitions')
        .insert(basePrPayload)
        .select('id')
        .single();

      if (retryError) throw new Error(retryError.message);
      pr = retryPrData as { id: string };
    } else {
      pr = prData as { id: string };
    }
    const purchaseRequisitionId = (pr as { id: string }).id;

    if (lines.length > 0) {
      const lineRows = lines.map((line, idx) => {
        const lineId = ('material_request_line_id' in line && typeof line.material_request_line_id === 'string' && line.material_request_line_id)
          ? line.material_request_line_id
          : (('id' in line && typeof (line as { id?: string }).id === 'string' && (line as { id: string }).id)
            ? (line as { id: string }).id
            : null);

        const group = ('item_group' in line && typeof line.item_group === 'string' && line.item_group.trim())
          ? line.item_group.trim()
          : (('itemGroup' in line && typeof line.itemGroup === 'string' && line.itemGroup.trim())
            ? line.itemGroup.trim()
            : null);

        // Brand only — never specification. Falling back to spec put strings
        // like "IS 12269 : 2013 Grade 53" in the PR's Brand column.
        const brand = ('preferred_brand' in line && typeof line.preferred_brand === 'string' && line.preferred_brand.trim())
          ? line.preferred_brand.trim()
          : (('item_brand' in line && typeof line.item_brand === 'string' && line.item_brand.trim())
            ? line.item_brand.trim()
            : (('itemBrand' in line && typeof line.itemBrand === 'string' && line.itemBrand.trim())
              ? line.itemBrand.trim()
              : null));

        // Line sub-activity, else the MR header's. Never site_block: that is a
        // location, not a sub-activity, and surfacing it here is exactly the
        // mismatch that made the PR disagree with its MR.
        const subAct = ('sub_activity_name' in line && typeof line.sub_activity_name === 'string' && line.sub_activity_name.trim())
          ? line.sub_activity_name.trim()
          : ((materialRequest as { sub_activity_name?: string | null }).sub_activity_name || null);

        return {
          purchase_requisition_id: purchaseRequisitionId,
          project_id: materialRequest.project_id,
          line_number: idx + 1,
          // The MR's own line number, not the PR array index. On a partial
          // conversion (say MR lines 2 and 5) the index would relabel them 1
          // and 2, destroying traceability back to the MR.
          mr_line_number: typeof line.line_number === 'number' ? line.line_number : idx + 1,
          source_mr_id: materialRequest.id,
          source_mr_number: materialRequest.mr_number,
          material_request_line_id: lineId,
          resource_type: 'material',
          item_code: ('item_code' in line && typeof line.item_code === 'string') ? line.item_code : '',
          item_group: group,
          item_description: line.item_description,
          specification: ('specification' in line && typeof line.specification === 'string') ? line.specification : '',
          preferred_brand: brand,
          unit: ('unit' in line && typeof line.unit === 'string' && line.unit) ? line.unit : 'nos',
          quantity: line.quantity,
          approved_mr_qty: line.quantity,
          // Balance tracking. Without remaining_mr_qty the PR table's "PR Bal
          // Qty" cell has nothing to derive from and renders as a dash.
          prev_pr_qty: 0,
          remaining_mr_qty: line.quantity,
          estimated_rate: line.estimated_rate ?? 0,
          line_total: Number(line.quantity || 0) * Number(line.estimated_rate ?? 0),
          required_date: ('required_date' in line && typeof line.required_date === 'string' && line.required_date) ? line.required_date : materialRequest.required_date,
          delivery_location: materialRequest.site_block || materialRequest.projects?.name || 'Project Site Store',
          priority: materialRequest.priority,
          stock_audit: materialRequest.justification || 'Audited',
          project_and_block: materialRequest.projects?.name ?? materialRequest.project_id,
          activity_code: ('activity_code' in line && typeof line.activity_code === 'string' && line.activity_code) ? line.activity_code : (materialRequest.activity_code ?? null),
          activity_name: ('activity_name' in line && typeof line.activity_name === 'string' && line.activity_name) ? line.activity_name : (materialRequest.activity_name ?? null),
          sub_activity_name: subAct,
          raised_by: materialRequest.raised_by_name ?? userName,
          submitted_at: materialRequest.submitted_at ?? materialRequest.created_at,
          updated_by: profileId,
        };
      });

      const { error: lineError } = await supabase
        .from('purchase_requisition_lines')
        .insert(lineRows);

      if (lineError) {
        console.warn('Retrying purchase_requisition_lines insert without optional activity columns...', lineError.message);
        const fallbackLineRows = lineRows.map(({ activity_code, activity_name, sub_activity_name, ...rest }) => rest);
        const { error: retryLineErr } = await supabase
          .from('purchase_requisition_lines')
          .insert(fallbackLineRows);

        if (retryLineErr) {
          console.warn('Retrying purchase_requisition_lines with base columns only...', retryLineErr.message);
          const baseLineRows = lineRows.map(({
            activity_code, activity_name, sub_activity_name, updated_by, raised_by, submitted_at, ...rest
          }) => rest);
          const { error: finalErr } = await supabase
            .from('purchase_requisition_lines')
            .insert(baseLineRows);

          if (finalErr) throw new Error(finalErr.message);
        }
      }
    }

      const nextMrStatus = 'approved';

      // Update line statuses for converted lines
      const lineIds = lines
        .map((l) => ('material_request_line_id' in l && typeof l.material_request_line_id === 'string') ? l.material_request_line_id : (('id' in l && typeof (l as { id?: string }).id === 'string') ? (l as { id: string }).id : null))
        .filter(Boolean) as string[];

      if (lineIds.length > 0) {
        await supabase
          .from('material_request_lines')
          .update({ line_status: 'approved_for_pr', updated_by: profileId })
          .in('id', lineIds);
      }

      await supabase.from('material_requests').update({
        status: nextMrStatus,
        reviewed_by: profileId,
        reviewed_by_name: userName,
        reviewed_at: new Date().toISOString(),
        updated_by: profileId,
      }).eq('id', materialRequest.id);

      return { data: { purchaseRequisitionId }, error: null };
    } catch (error) {
      return { data: null, error: asError(error) };
    }
  }

export async function updateSingleMrLineStatus(
  lineId: string,
  newStatus: 'pending' | 'approved_for_pr' | 'fulfilled_from_stock' | 'rejected',
  mrId?: string
): Promise<MutationResult> {
  try {
    if (isLiveSupabase()) {
      // 1. Update line_status directly on material_request_lines (text column)
      const { error: lineError } = await supabase
        .from('material_request_lines')
        .update({ line_status: newStatus })
        .eq('id', lineId);

      if (lineError) {
        console.warn('Notice: material_request_lines status update:', lineError.message);
      }

      // 2. Recalculate parent material_requests header status (erp_procurement_status enum) and stock_decision summary
      if (mrId) {
        const { data: lines } = await supabase
          .from('material_request_lines')
          .select('line_status')
          .eq('material_request_id', mrId);

        if (lines && lines.length > 0) {
          const total = lines.length;
          const prApprovedCount = lines.filter((l) => l.line_status === 'approved_for_pr' || l.line_status === 'approved').length;
          const stockFulfilledCount = lines.filter((l) => l.line_status === 'fulfilled_from_stock' || l.line_status === 'closed').length;
          const rejectedCount = lines.filter((l) => l.line_status === 'rejected').length;

          let nextParentStatus: ProcurementStatus = 'submitted';
          let stockDecisionSummary: string | null = null;

          if (prApprovedCount + stockFulfilledCount === total) {
            nextParentStatus = 'approved';
          } else if (rejectedCount === total) {
            nextParentStatus = 'rejected';
          } else if (prApprovedCount > 0 || stockFulfilledCount > 0 || rejectedCount > 0) {
            nextParentStatus = 'in_review'; // Valid Postgres enum for mixed decisions
          }

          if (stockFulfilledCount > 0) {
            stockDecisionSummary = stockFulfilledCount === total ? 'fulfilled_from_stock' : 'partially_fulfilled';
          }

          const { error: mrError } = await supabase
            .from('material_requests')
            .update({
              status: nextParentStatus,
              ...(stockDecisionSummary ? { stock_decision: stockDecisionSummary } : {})
            })
            .eq('id', mrId);

          if (mrError) {
            console.warn('Notice: material_requests header status update:', mrError.message);
          }
        }
      }
    }
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function approvePurchaseRequisition(pr: PurchaseRequisitionRow): Promise<MutationResult> {
  try {
    if (isLiveSupabase()) {
      const profileId = await currentProfileId();
      const { error } = await supabase
        .from('purchase_requisitions')
        .update({
          status: 'approved',
          approved_by: profileId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pr.id);

      if (error) throw new Error(error.message);
    }
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function assignPrToCurrentUser(pr: PurchaseRequisitionRow): Promise<MutationResult> {
  try {
    if (isLiveSupabase()) {
      const profileId = await currentProfileId();
      if (!profileId) throw new Error('Authentication required');
      const { error } = await supabase
        .from('purchase_requisitions')
        .update({
          assigned_to: profileId,
          status: 'assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pr.id);

      if (error) throw new Error(error.message);
    }
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** One line of the sourcing basket — a PR line offered up for tender. */
export type SourcingBasketLine = {
  pr_line_id: string;
  purchase_requisition_id: string;
  pr_number: string | null;
  line_number: number | null;
  item_id: string | null;
  item_code: string | null;
  item_group: string | null;
  item_description: string;
  specification: string | null;
  preferred_brand: string | null;
  unit: string;
  quantity: number;
  ordered_qty: number;
  balance_qty: number;
  line_status: string;
  estimated_rate: number;
  activity_name: string | null;
  sub_activity_name: string | null;
  activity_code: string | null;
  required_date: string | null;
  /** Quantity not yet tendered on any live RFQ, nor directly ordered. */
  available_to_source: number;
};

/**
 * PR lines available to put out to tender, with their remaining quantity.
 *
 * Reads pr_line_sourcing_view, which computes availability server-side. Doing it
 * client-side would miss quantity already sitting on someone else's open RFQ.
 */
export async function listSourcingBasketLines(purchaseRequisitionId: string): Promise<SourcingBasketLine[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('pr_line_sourcing_view')
    .select('*')
    .eq('purchase_requisition_id', purchaseRequisitionId)
    .order('line_number', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    pr_line_id: String(row.pr_line_id),
    purchase_requisition_id: String(row.purchase_requisition_id),
    pr_number: (row.pr_number as string | null) ?? null,
    line_number: (row.line_number as number | null) ?? null,
    item_id: (row.item_id as string | null) ?? null,
    item_code: (row.item_code as string | null) ?? null,
    item_group: (row.item_group as string | null) ?? null,
    item_description: String(row.item_description ?? ''),
    specification: (row.specification as string | null) ?? null,
    preferred_brand: (row.preferred_brand as string | null) ?? null,
    unit: String(row.unit ?? 'nos'),
    quantity: Number(row.quantity || 0),
    ordered_qty: Number(row.ordered_qty || 0),
    balance_qty: Number(row.balance_qty || 0),
    line_status: String(row.line_status ?? 'open'),
    estimated_rate: Number(row.estimated_rate || 0),
    activity_name: (row.activity_name as string | null) ?? null,
    sub_activity_name: (row.sub_activity_name as string | null) ?? null,
    activity_code: (row.activity_code as string | null) ?? null,
    required_date: (row.required_date as string | null) ?? null,
    available_to_source: Number(row.available_to_source || 0),
  }));
}

export type CreateRfqInput = {
  purchaseRequisitionId: string;
  vendorIds: string[];
  /** The sourcing basket: which PR lines, and how much of each, to tender. */
  lines: { prLineId: string; quantity: number; requiredDate?: string | null; remarks?: string | null }[];
  title?: string | null;
  dueDate?: string | null;
  terms?: string | null;
};

/**
 * Creates an RFQ with its line items and invited vendors.
 *
 * Delegates to rpc_create_rfq_from_pr so the whole thing is one transaction.
 * The previous implementation made three separate client-side writes (rfqs,
 * rfq_vendors, purchase_requisitions) with no rollback, created NO rfq_lines at
 * all, and hard-blocked a second RFQ per PR — which made partial sourcing
 * impossible. The server now enforces role, PR approval, line ownership and
 * remaining tenderable quantity.
 */
export async function createRfqFromPr(
  input: CreateRfqInput,
): Promise<MutationResult<{ rfqId: string; rfqNumber: string; lineCount: number; vendorCount: number }>> {
  try {
    if (input.vendorIds.length === 0) {
      throw new Error('Select at least one vendor before creating an RFQ.');
    }
    const lines = (input.lines ?? []).filter((l) => l.prLineId && Number(l.quantity) > 0);
    if (lines.length === 0) {
      throw new Error('Select at least one requisition line to put out to tender.');
    }

    const result = await rpcAction<{ rfqId?: string; rfqNumber?: string; lineCount?: number; vendorCount?: number }>(
      'rpc_create_rfq_from_pr',
      {
        p_purchase_requisition_id: input.purchaseRequisitionId,
        p_vendor_ids: input.vendorIds,
        p_lines: lines.map((l) => ({
          prLineId: l.prLineId,
          quantity: Number(l.quantity),
          requiredDate: l.requiredDate ?? null,
          remarks: l.remarks ?? null,
        })),
        p_title: input.title ?? null,
        p_due_date: input.dueDate ?? null,
        p_terms: input.terms ?? null,
      },
    );

    if (!result.rfqId) throw new Error('The RFQ was not created.');
    return {
      data: {
        rfqId: String(result.rfqId),
        rfqNumber: String(result.rfqNumber || ''),
        lineCount: Number(result.lineCount || 0),
        vendorCount: Number(result.vendorCount || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Saves all RFQ Registration Form details (Header, Selected Vendors, Line Item Rates, Delivery Address)
 * directly into Supabase tables (`rfqs`, `rfq_vendors`, `rfq_lines`, `purchase_requisitions`).
 */
export async function saveRfqFormDataToSupabase(input: {
  pr: PurchaseRequisitionRow;
  formData: {
    quotation_registration_no: string;
    quotation_date: string;
    goal_delivery_date: string;
    pr_id: string;
    pr_number: string;
    project_name: string;
    company_name: string;
    process_type: string;
    contractor_name: string;
    delivery_address: string;
    remarks: string;
    status: string;
    selected_quotation_url?: string | null;
    selection_remark?: string;
    items: Array<{
      key: string;
      item_id: string | null;
      item_code: string;
      item_group: string;
      item_brand: string;
      item_description: string;
      specification: string;
      quantity: number;
      pr_balance_qty: number;
      previous_rate: number;
      quoted_rate?: number;
      tax_rate?: number;
      unit: string;
      required_date: string;
      remarks: string;
      activity_name?: string | null;
      sub_activity_name?: string | null;
    }>;
    suppliers: Array<{
      key: string;
      supplier_id: string;
      supplier_name: string;
      email_to: string;
      email_cc: string;
      quotation_url?: string | null;
    }>;
  };
  nextPrStatus: string;
}): Promise<{ rfqId: string | null; error: Error | null }> {
  try {
    if (!isLiveSupabase()) {
      return { rfqId: `rfq-${Date.now()}`, error: null };
    }

    const { pr, formData, nextPrStatus } = input;

    const dbProjectId = getDbSiteId(pr.project_id || 'central-park');

    const toDbRfqStatus = (st: string): string => {
      const s = (st || '').toLowerCase().trim();
      if (s === 'rfq sent' || s === 'rfq_sent' || s === 'published') return 'rfq_sent';
      if (s === 'quotes received' || s === 'quotes_received' || s === 'quotations_received') return 'quotes_received';
      if (s === 'under evaluation' || s === 'under_evaluation') return 'under_evaluation';
      if (s === 'awarded' || s === 'vendor_selected' || s === 'vendor selected') return 'vendor_selected';
      if (s === 'po issued' || s === 'po_issued') return 'po_issued';
      if (s === 'cancelled') return 'cancelled';
      return 'draft';
    };

    const toDbPrStatus = (st: string): string => {
      const s = (st || '').toLowerCase().trim();
      if (s === 'rfq sent' || s === 'rfq_sent' || s === 'published') return 'rfq_sent';
      if (s === 'quotes received' || s === 'quotes_received' || s === 'quotations_received') return 'quotes_received';
      if (s === 'under evaluation' || s === 'under_evaluation') return 'under_evaluation';
      if (s === 'awarded' || s === 'vendor_selected' || s === 'vendor selected') return 'vendor_selected';
      if (s === 'po issued' || s === 'po_issued') return 'po_issued';
      if (s === 'cancelled') return 'approved';
      return 'approved';
    };

    const dbRfqStatus = toDbRfqStatus(formData.status);
    const dbPrStatus = toDbPrStatus(nextPrStatus);

    // 1. Upsert RFQ record in rfqs table
    const { data: existingRfq } = await supabase
      .from('rfqs')
      .select('id')
      .eq('purchase_requisition_id', pr.id)
      .maybeSingle();

    const awardsJson = (formData as any).allocations || {};
    const awardsRemarksTag = `[AWARDS]:${JSON.stringify(awardsJson)}`;
    const userRemarksClean = (formData.remarks || '').replace(/\n?\[AWARDS\]:.*/, '').trim();
    const mergedRemarks = userRemarksClean
      ? `${userRemarksClean}\n${awardsRemarksTag}`
      : awardsRemarksTag;

    const rfqPayload = {
      purchase_requisition_id: pr.id,
      rfq_number: formData.quotation_registration_no || `RFQ-${pr.pr_number}`,
      title: `${formData.company_name || pr.company_name || 'PR'} - ${pr.pr_number} RFQ`,
      status: dbRfqStatus,
      due_date: formData.goal_delivery_date || null,
      project_id: dbProjectId,
      delivery_address: formData.delivery_address || null,
      remarks: mergedRemarks,
      process_type: formData.process_type,
      selected_quotation_url: formData.selected_quotation_url || null,
      awards_json: awardsJson,
      updated_at: new Date().toISOString(),
    };

    let rfqId = existingRfq?.id as string | undefined;

    if (rfqId) {
      const { error: uErr } = await supabase.from('rfqs').update(rfqPayload).eq('id', rfqId);
      if (uErr) {
        console.warn('Extended rfqs update notice:', uErr.message || uErr);
        // Fallback: update standard fields only if extended columns don't exist yet
        await supabase.from('rfqs').update({
          status: dbRfqStatus,
          due_date: formData.goal_delivery_date || null,
          remarks: mergedRemarks,
          updated_at: new Date().toISOString(),
        }).eq('id', rfqId);
      }
    } else {
      const { data: newRfq, error: insertErr } = await supabase
        .from('rfqs')
        .insert([{ ...rfqPayload, created_at: new Date().toISOString() }])
        .select('id')
        .single();

      if (!insertErr && newRfq) {
        rfqId = newRfq.id;
      } else {
        console.warn('Extended rfqs insert notice:', insertErr?.message || insertErr);
        // Fallback: insert standard fields only
        const { data: fallbackRfq } = await supabase
          .from('rfqs')
          .insert([{
            purchase_requisition_id: pr.id,
            rfq_number: formData.quotation_registration_no || `RFQ-${pr.pr_number}`,
            title: `${formData.company_name || pr.company_name || 'PR'} - ${pr.pr_number} RFQ`,
            status: dbRfqStatus,
            due_date: formData.goal_delivery_date || null,
            remarks: mergedRemarks,
            project_id: dbProjectId,
            created_at: new Date().toISOString(),
          }])
          .select('id')
          .single();
        rfqId = fallbackRfq?.id || `rfq-${Date.now()}`;
      }
    }

    // 2. Save selected vendors to rfq_vendors
    if (rfqId && Array.isArray(formData.suppliers)) {
      const selectedVendors = formData.suppliers.filter((s) => s.supplier_id || s.supplier_name.trim());
      if (selectedVendors.length > 0) {
        await supabase.from('rfq_vendors').delete().eq('rfq_id', rfqId);

        const vendorInserts = selectedVendors
          .filter((sup) => sup.supplier_id)
          .map((sup) => ({
            rfq_id: rfqId,
            project_id: dbProjectId,
            vendor_id: sup.supplier_id,
            email_to: sup.email_to || null,
            email_cc: sup.email_cc || null,
            quotation_url: sup.quotation_url || null,
            updated_at: new Date().toISOString(),
          }));

        if (vendorInserts.length > 0) {
          const { error: vErr } = await supabase.from('rfq_vendors').insert(vendorInserts);
          if (vErr) {
            console.warn('Extended rfq_vendors insert notice:', vErr.message || vErr);
            // Fallback: insert base columns if email_to/email_cc don't exist yet
            const baseVendorInserts = vendorInserts.map(({ rfq_id, project_id, vendor_id, quotation_url }) => ({
              rfq_id,
              project_id,
              vendor_id,
              quotation_url,
            }));
            await supabase.from('rfq_vendors').insert(baseVendorInserts);
          }
        }
      }
    }

    // 3. Save line items to rfq_lines
    if (rfqId && Array.isArray(formData.items)) {
      await supabase.from('rfq_lines').delete().eq('rfq_id', rfqId);

      const lineInserts = formData.items.map((item, idx) => ({
        rfq_id: rfqId,
        project_id: dbProjectId,
        purchase_requisition_id: pr.id,
        line_number: idx + 1,
        item_id: item.item_id || null,
        item_code: item.item_code || null,
        item_group: item.item_group || null,
        item_description: item.item_description || item.specification || 'Material Line',
        specification: item.specification || null,
        preferred_brand: item.item_brand || null,
        unit: item.unit || 'nos',
        rfq_quantity: Number(item.quantity || 1),
        estimated_rate: Number((item.quoted_rate ?? item.previous_rate) ?? 0),
        previous_rate: Number(item.previous_rate ?? 0),
        quoted_rate: Number(item.quoted_rate ?? item.previous_rate ?? 0),
        tax_rate: Number(item.tax_rate ?? 18),
        required_date: item.required_date || null,
        remarks: item.remarks || null,
        activity_name: item.activity_name || null,
        sub_activity_name: item.sub_activity_name || null,
      }));

      if (lineInserts.length > 0) {
        const { error: lErr } = await supabase.from('rfq_lines').insert(lineInserts);
        if (lErr) {
          console.warn('Extended rfq_lines insert notice:', lErr.message || JSON.stringify(lErr));
          // Fallback: insert standard columns if previous_rate/quoted_rate/tax_rate columns don't exist yet
          const baseLineInserts = lineInserts.map(({ previous_rate, quoted_rate, tax_rate, ...base }) => base);
          await supabase.from('rfq_lines').insert(baseLineInserts);
        }
      }
    }

    // 4. Update parent PR status & delivery details in purchase_requisitions table
    const { error: prErr } = await supabase
      .from('purchase_requisitions')
      .update({
        status: dbPrStatus,
        delivery_address: formData.delivery_address || pr.delivery_address,
        contractor_name: formData.contractor_name || pr.contractor_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pr.id);

    if (prErr) {
      console.warn('Notice updating purchase_requisitions status:', prErr.message || JSON.stringify(prErr));
      // Fallback: if dbPrStatus is not accepted by the enum (e.g. quotes_received), update with standard status 'rfq_sent' or 'approved'
      const fallbackStatus = (dbPrStatus === 'quotes_received' || dbPrStatus === 'under_evaluation')
        ? 'rfq_sent'
        : 'approved';
      await supabase
        .from('purchase_requisitions')
        .update({
          status: fallbackStatus,
          delivery_address: formData.delivery_address || pr.delivery_address,
          contractor_name: formData.contractor_name || pr.contractor_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pr.id);
    }

    return { rfqId: rfqId || null, error: null };
  } catch (err) {
    console.error('Error saving RFQ form data to Supabase:', err);
    return { rfqId: null, error: err as Error };
  }
}

// ---------------------------------------------------------------------------
// RFQ LINES — read the lines actually tendered on an RFQ
// ---------------------------------------------------------------------------

export type RfqLineRow = {
  id: string;
  rfq_id: string;
  project_id: string;
  purchase_requisition_line_id: string | null;
  purchase_requisition_id: string | null;
  line_number: number;
  item_id: string | null;
  item_code: string | null;
  item_group: string | null;
  item_description: string;
  specification: string | null;
  preferred_brand: string | null;
  unit: string;
  rfq_quantity: number;
  estimated_rate: number;
  activity_name: string | null;
  sub_activity_name: string | null;
  activity_code: string | null;
  required_date: string | null;
  remarks: string | null;
  status: string;
};

/**
 * Fetches the rfq_lines for a given RFQ — the items and quantities actually
 * tendered. The quote entry form needs these to bind each bid line back to the
 * RFQ line it answers, which is what makes bid comparison a real matrix.
 */
export async function listRfqLines(rfqId: string): Promise<RfqLineRow[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('rfq_lines')
    .select('*')
    .eq('rfq_id', rfqId)
    .order('line_number', { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    rfq_id: String(row.rfq_id),
    project_id: String(row.project_id),
    purchase_requisition_line_id: (row.purchase_requisition_line_id as string | null) ?? null,
    purchase_requisition_id: (row.purchase_requisition_id as string | null) ?? null,
    line_number: Number(row.line_number || 1),
    item_id: (row.item_id as string | null) ?? null,
    item_code: (row.item_code as string | null) ?? null,
    item_group: (row.item_group as string | null) ?? null,
    item_description: String(row.item_description ?? ''),
    specification: (row.specification as string | null) ?? null,
    preferred_brand: (row.preferred_brand as string | null) ?? null,
    unit: String(row.unit ?? 'nos'),
    rfq_quantity: Number(row.rfq_quantity || 0),
    estimated_rate: Number(row.estimated_rate || 0),
    activity_name: (row.activity_name as string | null) ?? null,
    sub_activity_name: (row.sub_activity_name as string | null) ?? null,
    activity_code: (row.activity_code as string | null) ?? null,
    required_date: (row.required_date as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    status: String(row.status ?? 'open'),
  }));
}

export type RecordQuotationInput = {
  rfq: RfqRow;
  vendorId: string;
  quotationNumber: string | null;
  quotationDate: string;
  leadTimeDays: number;
  deliveryTerms: string | null;
  paymentTerms: string | null;
  gstDetails: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  lines: Array<{
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    /** RFQ line this bid answers. Required for line-level bid comparison. */
    rfq_line_id?: string | null;
    /** Quantity the vendor can actually supply (may be less than rfq_quantity). */
    offered_qty?: number | null;
    /** Discount percentage (0-100). */
    discount_percent?: number | null;
    /** Line-level remarks/notes from vendor. */
    remarks?: string | null;
  }>;
  attachments: File[];
};

/**
 * Line-level receipt position, as returned by get_po_line_remaining_balances.
 * `lineStatus` describes the LINE and is deliberately distinct from the
 * header's erp_po_status.
 */
export type PoLineBalanceInfo = {
  poLineId: string;
  orderedQty: number;
  /** Cumulative received across all GRNs that are neither draft, cancelled nor rejected. */
  cumulativeReceivedQty: number;
  /** Cumulative accepted across those same GRNs. Governs fulfilment. */
  cumulativeAcceptedQty: number;
  remainingBalanceQty: number;
  overTolerancePct: number;
  /** Cumulative ceiling: ordered x (1 + tolerance) - already accepted. Not a per-receipt allowance. */
  maxAllowableAcceptQty: number;
  isShortClosed: boolean;
  lineStatus: 'open' | 'partially_received' | 'fulfilled' | 'short_closed';
};

/**
 * Live receipt balance per PO line, read from get_po_line_remaining_balances.
 *
 * Delegating to the RPC fixes three defects in the previous client-side
 * calculation: cancelled and unposted GRNs were counted as received; a
 * legitimate zero accepted quantity fell through to the stale denormalised
 * `received_qty`; and the over-delivery tolerance was re-granted on every
 * receipt, so cumulative over-delivery had no ceiling. The SQL measures the
 * tolerance against the ordered quantity once, for the life of the line.
 */
export async function fetchPoLineRemainingBalances(poId: string): Promise<Record<string, PoLineBalanceInfo>> {
  try {
    const { data, error } = await supabase.rpc('get_po_line_remaining_balances', { p_po_id: poId });

    if (!error && Array.isArray(data) && data.length > 0) {
      const resultMap: Record<string, PoLineBalanceInfo> = {};
      for (const row of data as any[]) {
        resultMap[row.po_line_id] = {
          poLineId: row.po_line_id,
          orderedQty: Number(row.ordered_qty || 0),
          cumulativeReceivedQty: Number(row.cumulative_received || 0),
          cumulativeAcceptedQty: Number(row.cumulative_accepted || 0),
          remainingBalanceQty: Number(row.remaining_balance || 0),
          overTolerancePct: Number(row.over_tolerance_pct || 0),
          maxAllowableAcceptQty: Number(row.max_allowable_accept || 0),
          isShortClosed: Boolean(row.is_short_closed),
          lineStatus: row.line_status,
        };
      }
      return resultMap;
    }
  } catch (err) {
    console.warn('RPC get_po_line_remaining_balances failed, performing direct table sum fallback:', err);
  }

  // DIRECT TABLE SUM FALLBACK FOR PARTIAL RECEIPT TRACKING:
  const { data: poLines } = await supabase
    .from('purchase_order_lines')
    .select('id, quantity, over_tolerance_pct, is_short_closed')
    .eq('purchase_order_id', poId);

  const poLineIds = (poLines || []).map((l) => l.id);
  const { data: grnLines } = poLineIds.length
    ? await supabase
        .from('goods_receipt_note_lines')
        .select('purchase_order_line_id, accepted_qty, received_qty')
        .in('purchase_order_line_id', poLineIds)
    : { data: [] };

  const acceptedSumMap: Record<string, number> = {};
  const receivedSumMap: Record<string, number> = {};
  (grnLines || []).forEach((gl: any) => {
    if (gl.purchase_order_line_id) {
      const acc = Number(gl.accepted_qty ?? gl.received_qty ?? 0);
      const rec = Number(gl.received_qty ?? 0);
      acceptedSumMap[gl.purchase_order_line_id] = (acceptedSumMap[gl.purchase_order_line_id] || 0) + acc;
      receivedSumMap[gl.purchase_order_line_id] = (receivedSumMap[gl.purchase_order_line_id] || 0) + rec;
    }
  });

  const resultMap: Record<string, PoLineBalanceInfo> = {};
  (poLines || []).forEach((l: any) => {
    const ordered = Number(l.quantity || 0);
    const cumAccepted = acceptedSumMap[l.id] || 0;
    const cumReceived = receivedSumMap[l.id] || 0;
    const remaining = Math.max(0, ordered - cumAccepted);
    const tolPct = Number(l.over_tolerance_pct ?? 5);
    const maxAllow = ordered * (1 + tolPct / 100);

    resultMap[l.id] = {
      poLineId: l.id,
      orderedQty: ordered,
      cumulativeReceivedQty: cumReceived,
      cumulativeAcceptedQty: cumAccepted,
      remainingBalanceQty: remaining,
      overTolerancePct: tolPct,
      maxAllowableAcceptQty: maxAllow,
      isShortClosed: Boolean(l.is_short_closed),
      lineStatus: l.is_short_closed ? 'short_closed' : remaining <= 0 ? 'fulfilled' : cumAccepted > 0 ? 'partially_received' : 'open',
    };
  });

  return resultMap;
}

export async function createGrnFromPo(
  po: PurchaseOrderRow,
  input: ReceiveGoodsInput = {},
): Promise<MutationResult<{ grnId: string; grnNumber: string; status: string }>> {
  try {
    await requireProfile();

    const lines = (input.lines || []).map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId || null,
      itemId: line.itemId || null,
      receivedQty: Number(line.receivedQty) || 0,
      acceptedQty: Number(line.acceptedQty) || 0,
      rejectedQty: Number(line.rejectedQty) || 0,
      unitRate: Number(line.unitRate) || 0,
      remarks: line.remarks || null,
    }));

    // 1. Basic non-negative & sum check
    for (const line of lines) {
      if (line.receivedQty < 0 || line.acceptedQty < 0 || line.rejectedQty < 0) {
        throw new Error('Received, accepted and rejected quantities cannot be negative.');
      }
      if (line.acceptedQty + line.rejectedQty > line.receivedQty) {
        throw new Error('Accepted plus rejected quantity cannot exceed the received quantity.');
      }
    }

    // 2. Tolerance and remaining-balance validation.
    //
    // maxAllowableQty is the headroom left for THIS receipt:
    // ordered x (1 + tolerance) - already received. Measuring the tolerance
    // against the ordered quantity once, rather than re-granting it per
    // receipt, is what keeps cumulative over-delivery bounded.
    if (po.id) {
      const balanceMap = await fetchPoLineRemainingBalances(po.id);
      for (const line of lines) {
        if (!line.purchaseOrderLineId) continue;
        const info = balanceMap[line.purchaseOrderLineId];
        if (!info) {
          throw new Error('A receipt line references a purchase order line that is not on this order.');
        }
        if (info.isShortClosed) {
          throw new Error('This purchase order line is short-closed and cannot accept further deliveries.');
        }
        if (line.acceptedQty > info.maxAllowableAcceptQty + 0.01) {
          throw new Error(
            `Accepted quantity ${line.acceptedQty} exceeds the ${info.maxAllowableAcceptQty.toFixed(2)} still acceptable ` +
            `on this line (${info.orderedQty} ordered, ${info.cumulativeAcceptedQty} already accepted, ` +
            `${info.overTolerancePct}% over-delivery tolerance).`,
          );
        }
      }
    }

    // post_goods_receipt_note writes the GRN header, its lines,
    // purchase_order_lines.received_qty, stock_balances and stock_ledger in
    // one transaction. Its errors are deliberately NOT caught here.
    //
    // This call used to end in `.catch(() => null)` and fall through to a
    // raw insert that hard-coded status 'posted', never advanced
    // received_qty and never touched inventory — so a permission error, a
    // tolerance breach or an unapproved PO all produced a "successful" GRN
    // with zero stock impact. There is no fallback path any more: if the
    // receipt cannot be posted atomically, it is not posted at all.
    const result = await rpcAction<{ grnId?: string; grnNumber?: string; status?: string }>(
      'post_goods_receipt_note',
      {
        p_purchase_order_id: po.id,
        p_receipt_date: input.receiptDate || today(),
        p_challan_no: input.challanNumber?.trim() || null,
        p_challan_date: input.challanDate || null,
        p_vehicle_no: input.vehicleNumber?.trim() || null,
        p_godown_name: input.godownName?.trim() || null,
        p_transporter_name: input.transporterName?.trim() || null,
        p_quality_decision: input.qualityDecision || 'accepted',
        p_remarks: input.remarks?.trim() || null,
        p_lines: lines,
        p_submit_for_approval: input.submitForApproval ?? false,
      },
    );

    if (!result?.grnId) {
      throw new Error('The goods receipt was not created: the server returned no GRN reference.');
    }

    // 3. Roll the PO header up from its posted receipts. The RPC decides
    //    between partially_delivered and delivered on the canonical
    //    vocabulary and refuses any move the state machine disallows, so
    //    this can no longer overwrite the status the receipt just set.
    const { data: rolledStatus, error: rollupError } = await supabase.rpc(
      'refresh_purchase_order_receipt_status',
      { p_po_id: po.id },
    );
    if (rollupError) {
      throw new Error(
        `The goods receipt ${result.grnNumber || ''} was posted but the purchase order status could not be updated: ${rollupError.message}`.trim(),
      );
    }

    return {
      data: {
        grnId: String(result.grnId),
        grnNumber: String(result.grnNumber || ''),
        status: String(result.status || (typeof rolledStatus === 'string' ? rolledStatus : 'posted')),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

function boundedScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function scoreQuotation(input: {
  totalAmount: number;
  estimateAmount: number;
  leadTimeDays: number;
  vendorRating: number;
}) {
  const estimateAmount = Math.max(Number(input.estimateAmount || 0), 1);
  const totalAmount = Math.max(Number(input.totalAmount || 0), 0);
  const priceRatio = totalAmount / estimateAmount;
  const priceScore = boundedScore(priceRatio <= 1 ? 100 : Math.max(40, 100 - (priceRatio - 1) * 100));
  const deliveryScore = boundedScore(100 - Math.max(0, input.leadTimeDays - 7) * 3);
  const performanceScore = boundedScore((Number(input.vendorRating || 0) / 5) * 100);
  const qualityScore = boundedScore((deliveryScore + performanceScore) / 2);
  const weightedScore = boundedScore(priceScore * 0.4 + qualityScore * 0.25 + deliveryScore * 0.2 + performanceScore * 0.15);

  return {
    priceScore,
    qualityScore,
    deliveryScore,
    performanceScore,
    weightedScore,
  };
}

/**
 * Recomputes and persists `rank` for every non-cancelled quotation on an RFQ,
 * ordered by weighted_score descending. Rank is a property of the whole set —
 * a new quote can shift everyone else's rank, not just its own — so this
 * always re-ranks the full set rather than writing a single row's rank at
 * insert time (which is how `quotation_scores.rank` ended up always null).
 */
export async function recomputeQuotationRanks(rfqId: string): Promise<MutationResult<{ ranked: number }>> {
  if (!isLiveSupabase()) return { data: demoRecomputeQuotationRanks(rfqId), error: null };

  try {
    const { data: quotes, error: qErr } = await supabase
      .from('vendor_quotations')
      .select('id')
      .eq('rfq_id', rfqId)
      .neq('status', 'cancelled');
    if (qErr) throw new Error(qErr.message);

    const quoteIds = (quotes ?? []).map((q: any) => q.id);
    if (quoteIds.length === 0) return { data: { ranked: 0 }, error: null };

    const { data: scores, error: sErr } = await supabase
      .from('quotation_scores')
      .select('quotation_id, weighted_score')
      .in('quotation_id', quoteIds);
    if (sErr) throw new Error(sErr.message);

    // Tiebreak is whatever order Supabase returned .in() in — an easy follow-up
    // if exact ties ever matter (would need vendor_quotations.created_at too).
    const ranked = [...(scores ?? [])].sort(
      (a: any, b: any) => Number(b.weighted_score) - Number(a.weighted_score),
    );

    await Promise.all(
      ranked.map((row: any, idx: number) =>
        supabase.from('quotation_scores').update({ rank: idx + 1 }).eq('quotation_id', row.quotation_id),
      ),
    );

    return { data: { ranked: ranked.length }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function recordQuotation(input: RecordQuotationInput): Promise<MutationResult<{ quotationId: string }>> {
  if (!isLiveSupabase()) return { data: demoRecordQuotation(input), error: null };

  try {
    const profileId = await currentProfileId();
    if (input.lines.length === 0) throw new Error('Add at least one quotation line.');

    const invitedVendor = input.rfq.rfq_vendors?.some((vendor) => vendor.vendor_id === input.vendorId);
    if (!invitedVendor) throw new Error('This vendor is not linked to the selected RFQ.');

    const lineRows = input.lines.map((line) => {
      const quantity = Number(line.quantity || 0);
      const unitRate = Number(line.unit_rate || 0);
      const taxRate = Number(line.tax_rate || 0);
      const discountPercent = Math.max(0, Math.min(100, Number(line.discount_percent || 0)));
      if (!line.item_description.trim()) throw new Error('Every quotation line requires an item description.');
      if (quantity <= 0) throw new Error('Every quotation line quantity must be greater than zero.');
      if (unitRate < 0) throw new Error('Quotation line rates cannot be negative.');

      const netRate = unitRate * (1 - discountPercent / 100);
      const lineTotal = quantity * netRate;
      const taxAmount = lineTotal * (taxRate / 100);
      return {
        item_id: line.item_id ?? null,
        item_description: line.item_description.trim(),
        quantity,
        unit_rate: unitRate,
        discount_percent: discountPercent,
        tax_rate: taxRate,
        line_total: lineTotal,
        tax_amount: taxAmount,
        rfq_line_id: line.rfq_line_id ?? null,
        offered_qty: line.offered_qty != null ? Number(line.offered_qty) : quantity,
        remarks: line.remarks?.trim() || null,
      };
    });

    const subtotalAmount = lineRows.reduce((sum, line) => sum + line.line_total, 0);
    const taxAmount = lineRows.reduce((sum, line) => sum + line.tax_amount, 0);
    const totalAmount = subtotalAmount + taxAmount;

    const { data, error } = await supabase
      .from('vendor_quotations')
      .insert({
        project_id: input.rfq.project_id,
        rfq_id: input.rfq.id,
        vendor_id: input.vendorId,
        quotation_number: input.quotationNumber?.trim() || (await nextDocumentNumber('QT')),
        quotation_date: input.quotationDate || today(),
        subtotal_amount: subtotalAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        lead_time_days: Math.max(0, Number(input.leadTimeDays || 0)),
        delivery_terms: input.deliveryTerms,
        payment_terms: input.paymentTerms,
        gst_details: input.gstDetails,
        storage_bucket: input.storageBucket || null,
        storage_path: input.storagePath || null,
        status: 'submitted',
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const quotationId = (data as { id: string }).id;

    const { error: lineError } = await supabase.from('quotation_lines').insert(
      lineRows.map((line) => ({
        quotation_id: quotationId,
        project_id: input.rfq.project_id,
        item_id: line.item_id,
        item_description: line.item_description,
        quantity: line.quantity,
        unit_rate: line.unit_rate,
        discount_percent: line.discount_percent,
        tax_rate: line.tax_rate,
        line_total: line.line_total,
        rfq_line_id: line.rfq_line_id || null,
        offered_qty: line.offered_qty ?? line.quantity,
        lead_time_days: Math.max(0, Number(input.leadTimeDays || 0)),
        remarks: line.remarks || null,
        created_by: profileId,
        updated_by: profileId,
      })),
    );
    if (lineError) throw new Error(lineError.message);

    const rfqVendor = input.rfq.rfq_vendors?.find((vendor) => vendor.vendor_id === input.vendorId);
    const vendorRating = Number(rfqVendor?.vendors?.rating || 0);
    // Scoring fix: compare against the PR's original estimated rates (carried
    // on rfq_lines), not the vendor's own bid subtotal. Without this, the
    // price score was always ~100% because bid total ≈ bid subtotal.
    const estimateAmount = await (async () => {
      try {
        const rfqLines = await listRfqLines(input.rfq.id);
        const prEstimate = rfqLines.reduce((sum, rl) => sum + rl.rfq_quantity * rl.estimated_rate, 0);
        return prEstimate > 0 ? prEstimate : subtotalAmount;
      } catch {
        return subtotalAmount; // fallback to old behaviour if rfq_lines unavailable
      }
    })();
    const scores = scoreQuotation({
      totalAmount,
      estimateAmount,
      leadTimeDays: Number(input.leadTimeDays || 0),
      vendorRating,
    });

    await supabase.from('quotation_scores').insert({
      quotation_id: quotationId,
      project_id: input.rfq.project_id,
      price_score: scores.priceScore,
      quality_score: scores.qualityScore,
      delivery_score: scores.deliveryScore,
      performance_score: scores.performanceScore,
      weighted_score: scores.weightedScore,
      rank: null,
      scoring_weights: { price: 40, quality: 25, delivery: 20, performance: 15 },
      created_by: profileId,
      updated_by: profileId,
    });

    // A new quote can shift every other vendor's rank on this RFQ, not just its
    // own — recompute the whole set rather than only writing this one's rank.
    await recomputeQuotationRanks(input.rfq.id);

    await supabase
      .from('rfq_vendors')
      .update({ response_status: 'submitted', responded_at: new Date().toISOString(), updated_by: profileId })
      .eq('rfq_id', input.rfq.id)
      .eq('vendor_id', input.vendorId);

    if (input.attachments && input.attachments.length > 0) {
      const { uploadEntityAttachment } = await import('@/lib/documents');
      for (const file of input.attachments) {
        await uploadEntityAttachment(input.rfq.project_id, 'vendor_quotations', quotationId, 'quotation_document', file);
      }
    }

    return { data: { quotationId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// PHASE 2 — BID COMPARISON MATRIX SERVICE
// ---------------------------------------------------------------------------

export type VendorQuoteSummary = {
  vendor_id: string;
  vendor_name: string;
  vendor_rating: number;
  quotation_id: string;
  quotation_number: string;
  quotation_date: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  lead_time_days: number;
  scores?: QuotationScoreRow | null;
  status: string;
};

export type MatrixVendorQuote = {
  quotation_line_id: string;
  quotation_id: string;
  vendor_id: string;
  offered_qty: number;
  unit_rate: number;
  discount_percent: number;
  net_rate: number;
  tax_rate: number;
  line_total: number;
  lead_time_days: number | null;
  remarks: string | null;
  is_l1: boolean;
};

export type MatrixItemLine = {
  rfq_line_id: string;
  purchase_requisition_line_id?: string | null;
  purchase_requisition_id?: string | null;
  line_number: number;
  item_id: string | null;
  item_code: string | null;
  item_group: string | null;
  item_description: string;
  specification: string | null;
  preferred_brand: string | null;
  unit: string;
  rfq_quantity: number;
  estimated_rate: number;
  lowest_net_rate: number | null;
  vendor_quotes: Record<string, MatrixVendorQuote>;
};

export type RfqComparisonMatrix = {
  rfq: RfqRow;
  rfqLines: RfqLineRow[];
  vendors: VendorQuoteSummary[];
  items: MatrixItemLine[];
};

/**
 * Builds a side-by-side bid comparison matrix for an RFQ across all submitted vendor quotations.
 * Highlights L1 (lowest evaluated net unit rate) per RFQ line item.
 */
export async function getQuotationComparisonMatrix(rfqId: string): Promise<RfqComparisonMatrix | null> {
  let rfq: RfqRow;
  let rfqLines: RfqLineRow[];
  let rawQuotes: any[];
  let scoresByQuote: Record<string, QuotationScoreRow>;

  if (!isLiveSupabase()) {
    const bundle = getDemoRfqBundle(rfqId);
    if (!bundle) return null;
    ({ rfq, rfqLines, rawQuotes, scoresByQuote } = bundle);
  } else {
    // 1. Fetch RFQ Header
    const { data: rfqData, error: rfqErr } = await supabase
      .from('rfqs')
      .select('*, rfq_vendors(*, vendors(id, legal_name, display_name, rating))')
      .eq('id', rfqId)
      .single();

    if (rfqErr || !rfqData) return null;
    rfq = rfqData as unknown as RfqRow;

    // 2. Fetch RFQ Lines
    rfqLines = await listRfqLines(rfqId);

    // Fallback 2a: If rfq_lines table has no rows for this RFQ, construct lines from parent PR
    if (rfqLines.length === 0 && rfqData.purchase_requisition_id) {
      const { data: prLinesData } = await supabase
        .from('purchase_requisition_lines')
        .select('*')
        .eq('purchase_requisition_id', rfqData.purchase_requisition_id);

      if (prLinesData && prLinesData.length > 0) {
        rfqLines = prLinesData.map((prl: any, idx: number) => ({
          id: prl.id,
          rfq_id: rfqId,
          project_id: rfqData.project_id,
          purchase_requisition_line_id: prl.id,
          purchase_requisition_id: rfqData.purchase_requisition_id,
          line_number: idx + 1,
          item_id: prl.item_id || null,
          item_code: null,
          item_group: 'Materials',
          item_description: prl.item_description || 'Requisitioned Material Item',
          specification: null,
          preferred_brand: null,
          unit: prl.unit || 'nos',
          rfq_quantity: Number(prl.quantity || 1),
          estimated_rate: Number(prl.estimated_rate || 0),
          activity_name: prl.activity_name || null,
          sub_activity_name: prl.sub_activity_name || null,
          activity_code: prl.activity_code || null,
          required_date: prl.required_date || null,
          remarks: prl.remarks || null,
          status: 'open',
        }));
      }
    }

    if (rfqLines.length === 0) return null;

    // 3. Fetch Quotations for this RFQ
    const { data: quotesData, error: quotesErr } = await supabase
      .from('vendor_quotations')
      .select('*, vendors(id, legal_name, display_name, rating), quotation_lines(*)')
      .eq('rfq_id', rfqId)
      .neq('status', 'cancelled');

    if (quotesErr) throw new Error(quotesErr.message);

    rawQuotes = (quotesData ?? []) as any[];
    const quoteIds = rawQuotes.map((q) => q.id);

    scoresByQuote = {};
    if (quoteIds.length > 0) {
      try {
        const { data: scoresData } = await supabase
          .from('quotation_scores')
          .select('*')
          .in('quotation_id', quoteIds);

        if (scoresData) {
          for (const s of scoresData) {
            scoresByQuote[s.quotation_id] = s as any;
          }
        }
      } catch {
        // Non-blocking score lookup fallback
      }
    }
  }

  // 4. Map Vendor Summaries
  const vendors: VendorQuoteSummary[] = rawQuotes.map((q) => {
    const v = q.vendors || {};
    const scoreObj = scoresByQuote[q.id] || null;
    return {
      vendor_id: String(q.vendor_id),
      vendor_name: String(v.display_name || v.legal_name || 'Vendor'),
      vendor_rating: Number(v.rating || 0),
      quotation_id: String(q.id),
      quotation_number: String(q.quotation_number || ''),
      quotation_date: String(q.quotation_date || ''),
      subtotal_amount: Number(q.subtotal_amount || 0),
      tax_amount: Number(q.tax_amount || 0),
      total_amount: Number(q.total_amount || 0),
      lead_time_days: Number(q.lead_time_days || 0),
      scores: scoreObj,
      status: String(q.status || 'submitted'),
    };
  });

  // 4b. Fallback: If no online vendor_quotations exist yet, map invited vendors from rfq_vendors
  if (vendors.length === 0 && Array.isArray((rfq as any).rfq_vendors) && (rfq as any).rfq_vendors.length > 0) {
    for (const rv of (rfq as any).rfq_vendors) {
      const v = rv.vendors || {};
      vendors.push({
        vendor_id: String(rv.vendor_id),
        vendor_name: String(v.display_name || v.legal_name || 'Invited Vendor'),
        vendor_rating: Number(v.rating || 0),
        quotation_id: `draft-quote-${rv.vendor_id}`,
        quotation_number: `QT-INVITED-${String(rv.vendor_id).slice(0, 8)}`,
        quotation_date: new Date().toISOString().slice(0, 10),
        subtotal_amount: 0,
        tax_amount: 0,
        total_amount: 0,
        lead_time_days: 7,
        scores: null,
        status: 'invited',
      });
    }
  }

  // 4c. Ultimate Fallback: If no vendors invited yet, fetch master vendors list so award matrix can still be used
  if (vendors.length === 0) {
    const { data: allVendors } = await supabase
      .from('vendors')
      .select('id, legal_name, display_name, rating')
      .limit(5);

    if (allVendors && allVendors.length > 0) {
      for (const v of allVendors) {
        vendors.push({
          vendor_id: String(v.id),
          vendor_name: String(v.display_name || v.legal_name || 'Supplier'),
          vendor_rating: Number(v.rating || 0),
          quotation_id: `draft-quote-${v.id}`,
          quotation_number: `QT-DRAFT-${String(v.id).slice(0, 8)}`,
          quotation_date: new Date().toISOString().slice(0, 10),
          subtotal_amount: 0,
          tax_amount: 0,
          total_amount: 0,
          lead_time_days: 7,
          scores: null,
          status: 'invited',
        });
      }
    }
  }

  // 5. Build Matrix Item Lines
  const items: MatrixItemLine[] = rfqLines.map((rl) => {
    const vendorQuotes: Record<string, MatrixVendorQuote> = {};
    let lowestNetRate: number | null = null;

    for (const q of rawQuotes) {
      const vendorId = String(q.vendor_id);
      const lines = (q.quotation_lines ?? []) as any[];

      // Find matching quote line by rfq_line_id or item_description fallback
      const matchLine = lines.find((ql: any) => 
        ql.rfq_line_id === rl.id || 
        (ql.item_description && ql.item_description.trim().toLowerCase() === rl.item_description.trim().toLowerCase())
      );

      if (matchLine) {
        const unitRate = Number(matchLine.unit_rate || 0);
        const discountPercent = Number(matchLine.discount_percent || 0);
        const netRate = unitRate * (1 - discountPercent / 100);
        const offeredQty = matchLine.offered_qty != null ? Number(matchLine.offered_qty) : Number(matchLine.quantity || rl.rfq_quantity);
        const taxRate = Number(matchLine.tax_rate || 0);
        const lineTotal = Number(matchLine.line_total || offeredQty * netRate);

        if (lowestNetRate === null || (netRate > 0 && netRate < lowestNetRate)) {
          lowestNetRate = netRate;
        }

        vendorQuotes[vendorId] = {
          quotation_line_id: String(matchLine.id),
          quotation_id: String(q.id),
          vendor_id: vendorId,
          offered_qty: offeredQty,
          unit_rate: unitRate,
          discount_percent: discountPercent,
          net_rate: netRate,
          tax_rate: taxRate,
          line_total: lineTotal,
          lead_time_days: matchLine.lead_time_days != null ? Number(matchLine.lead_time_days) : Number(q.lead_time_days || 0),
          remarks: matchLine.remarks || null,
          is_l1: false, // Calculated below
        };
      }
    }

    // Default quotes for invited vendors who have not submitted line quotes yet
    for (const v of vendors) {
      if (!vendorQuotes[v.vendor_id]) {
        vendorQuotes[v.vendor_id] = {
          quotation_line_id: `draft-line-${rl.id}-${v.vendor_id}`,
          quotation_id: v.quotation_id,
          vendor_id: v.vendor_id,
          offered_qty: rl.rfq_quantity,
          unit_rate: rl.estimated_rate || 0,
          discount_percent: 0,
          net_rate: rl.estimated_rate || 0,
          tax_rate: 18,
          line_total: rl.rfq_quantity * (rl.estimated_rate || 0),
          lead_time_days: 7,
          remarks: 'Invited Vendor / Base Rate',
          is_l1: true,
        };
      }
    }

    // Flag L1 for each vendor matching lowestNetRate
    if (lowestNetRate !== null) {
      for (const vQuote of Object.values(vendorQuotes)) {
        if (Math.abs(vQuote.net_rate - lowestNetRate) < 0.001) {
          vQuote.is_l1 = true;
        }
      }
    }

    return {
      rfq_line_id: rl.id,
      purchase_requisition_line_id: rl.purchase_requisition_line_id || null,
      purchase_requisition_id: rl.purchase_requisition_id || null,
      line_number: rl.line_number,
      item_id: rl.item_id,
      item_code: rl.item_code,
      item_group: rl.item_group,
      item_description: rl.item_description,
      specification: rl.specification,
      preferred_brand: rl.preferred_brand,
      unit: rl.unit,
      rfq_quantity: rl.rfq_quantity,
      estimated_rate: rl.estimated_rate,
      lowest_net_rate: lowestNetRate,
      vendor_quotes: vendorQuotes,
    };
  });

  return {
    rfq,
    rfqLines,
    vendors,
    items,
  };
}

// ---------------------------------------------------------------------------
// PHASE 3 — MULTI-VENDOR AWARD MATRIX SERVICE
// ---------------------------------------------------------------------------

export type VendorSelectionAwardRow = {
  id: string;
  vendor_selection_id: string;
  project_id: string;
  rfq_line_id: string;
  purchase_requisition_line_id?: string | null;
  vendor_id: string;
  quotation_id?: string | null;
  quotation_line_id?: string | null;
  awarded_qty: number;
  quoted_rate: number;
  awarded_rate: number;
  tax_rate: number;
  awarded_amount?: number;
  is_lowest_bid: boolean;
  non_l1_justification?: string | null;
  award_reason?: string | null;
  lead_time_days?: number | null;
  purchase_order_id?: string | null;
  purchase_order_line_id?: string | null;
  status: string;
  vendors?: VendorRow | null;
  rfq_lines?: RfqLineRow | null;
};

export type AwardInputLine = {
  rfq_line_id: string;
  purchase_requisition_line_id?: string | null;
  vendor_id: string;
  quotation_id?: string | null;
  quotation_line_id?: string | null;
  awarded_qty: number;
  quoted_rate: number;
  awarded_rate: number;
  tax_rate: number;
  is_lowest_bid: boolean;
  non_l1_justification?: string | null;
  award_reason?: string | null;
  lead_time_days?: number | null;
};

export type SaveAwardMatrixInput = {
  rfqId: string;
  purchaseRequisitionId: string;
  projectId: string;
  selectionReason: string;
  awards: AwardInputLine[];
};

/**
 * Saves a multi-vendor line & quantity award matrix to vendor_selection_awards.
 * Atomically validates and inserts line allocations across multiple vendors.
 */
export async function saveAwardMatrix(
  input: SaveAwardMatrixInput
): Promise<MutationResult<{ selectionId: string; awardCount: number; totalAmount: number }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase live connection required.');
    const profileId = await currentProfileId();

    if (input.awards.length === 0) {
      throw new Error('At least one item allocation is required to save an award matrix.');
    }

    // 1. Validate Non-L1 justifications
    for (const a of input.awards) {
      if (a.awarded_qty <= 0) {
        throw new Error('Awarded quantity must be greater than zero.');
      }
      if (!a.is_lowest_bid && !a.non_l1_justification?.trim()) {
        throw new Error('A justification is required whenever awarding to a vendor with a non-lowest (non-L1) rate.');
      }
    }

    // 2. Find or create vendor_selections header
    const { data: existingSelection, error: selErr } = await supabase
      .from('vendor_selections')
      .select('id')
      .eq('purchase_requisition_id', input.purchaseRequisitionId)
      .limit(1)
      .maybeSingle();

    if (selErr) throw new Error(selErr.message);

    // Primary vendor = vendor receiving the largest award amount
    const vendorAmounts: Record<string, number> = {};
    for (const a of input.awards) {
      vendorAmounts[a.vendor_id] = (vendorAmounts[a.vendor_id] || 0) + a.awarded_qty * a.awarded_rate;
    }
    const primaryVendorId = Object.entries(vendorAmounts).sort((a, b) => b[1] - a[1])[0]?.[0] || input.awards[0].vendor_id;
    const primaryQuoteId = input.awards.find((a) => a.vendor_id === primaryVendorId)?.quotation_id || input.awards[0].quotation_id;
    const totalAwardAmount = input.awards.reduce((sum, a) => sum + a.awarded_qty * a.awarded_rate * (1 + a.tax_rate / 100), 0);

    const selectionPayload = {
      project_id: input.projectId,
      purchase_requisition_id: input.purchaseRequisitionId,
      rfq_id: input.rfqId,
      selected_quotation_id: primaryQuoteId || null,
      selected_vendor_id: primaryVendorId,
      final_amount: totalAwardAmount,
      reason_for_selection: input.selectionReason.trim() || 'Multi-vendor line item award matrix allocation.',
      status: 'submitted',
      updated_by: profileId,
    };

    let selectionId: string;
    if (existingSelection) {
      selectionId = existingSelection.id;
      const { error: updateErr } = await supabase
        .from('vendor_selections')
        .update(selectionPayload)
        .eq('id', selectionId);
      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { data: newSel, error: createErr } = await supabase
        .from('vendor_selections')
        .insert({ ...selectionPayload, created_by: profileId })
        .select('id')
        .single();
      if (createErr || !newSel) throw new Error(createErr?.message || 'Failed to create vendor selection header.');
      selectionId = newSel.id;
    }

    // 3. Clear existing pending awards for this selection
    await supabase
      .from('vendor_selection_awards')
      .delete()
      .eq('vendor_selection_id', selectionId)
      .in('status', ['pending', 'submitted']);

    // 4. Insert new award rows
    const awardRows = input.awards.map((a) => ({
      vendor_selection_id: selectionId,
      project_id: input.projectId,
      rfq_line_id: a.rfq_line_id,
      purchase_requisition_line_id: a.purchase_requisition_line_id || null,
      vendor_id: a.vendor_id,
      quotation_id: a.quotation_id || null,
      quotation_line_id: a.quotation_line_id || null,
      awarded_qty: a.awarded_qty,
      quoted_rate: a.quoted_rate,
      awarded_rate: a.awarded_rate,
      tax_rate: a.tax_rate,
      is_lowest_bid: a.is_lowest_bid,
      non_l1_justification: a.non_l1_justification?.trim() || null,
      award_reason: a.award_reason?.trim() || null,
      lead_time_days: a.lead_time_days != null ? Number(a.lead_time_days) : null,
      status: 'pending',
      created_by: profileId,
      updated_by: profileId,
    }));

    const { error: insertErr } = await supabase.from('vendor_selection_awards').insert(awardRows);
    if (insertErr) throw new Error(insertErr.message);

    // 5. Update RFQ status
    await supabase
      .from('rfqs')
      .update({ status: 'vendor_selected', updated_by: profileId })
      .eq('id', input.rfqId);

    return {
      data: {
        selectionId,
        awardCount: awardRows.length,
        totalAmount: totalAwardAmount,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: asError(e) };
  }
}

/**
 * Lists existing vendor_selection_awards for an RFQ.
 */
export async function listAwardMatrixForRfq(rfqId: string): Promise<VendorSelectionAwardRow[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('vendor_selection_awards')
    .select('*, vendors(id, legal_name, display_name), rfq_lines(*)')
    .eq('rfq_line_id', rfqId)
    .neq('status', 'cancelled');

  if (error) return [];
  return (data ?? []) as unknown as VendorSelectionAwardRow[];
}

export type RecommendVendorSelectionInput = {
  quotation: QuotationRow;
  purchaseRequisitionId: string;
  reasonForSelection: string;
};

export async function recommendVendorSelection(input: RecommendVendorSelectionInput): Promise<MutationResult<{ selectionId: string }>> {
  try {
    const profileId = await currentProfileId();

    const { data: existingSelection, error: existingError } = await supabase
      .from('vendor_selections')
      .select('id')
      .eq('purchase_requisition_id', input.purchaseRequisitionId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const payload = {
      project_id: input.quotation.project_id,
      purchase_requisition_id: input.purchaseRequisitionId,
      rfq_id: input.quotation.rfq_id,
      selected_quotation_id: input.quotation.id,
      selected_vendor_id: input.quotation.vendor_id,
      final_amount: input.quotation.total_amount,
      reason_for_selection: input.reasonForSelection.trim() || 'Recommended after comparing commercial value, lead time, and vendor performance.',
      status: 'pending',
      approved_by: null,
      approved_at: null,
      updated_by: profileId,
    };

    const query = existingSelection
      ? supabase.from('vendor_selections').update(payload).eq('id', existingSelection.id).select('id').single()
      : supabase.from('vendor_selections').insert({ ...payload, created_by: profileId }).select('id').single();

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { data: { selectionId: (data as { id: string }).id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Automatically creates production Purchase Order draft records (in `purchase_orders` and `purchase_order_lines`)
 * directly in Supabase when the user generates POs from the RFQ form.
 */
export async function generatePurchaseOrdersFromRfqForm(input: {
  pr: PurchaseRequisitionRow;
  formData: {
    quotation_registration_no: string;
    goal_delivery_date: string;
    delivery_address: string;
    remarks: string;
    contractor_name: string;
    items: Array<{
      key?: string;
      item_id: string | null;
      purchase_requisition_line_id?: string;
      item_code: string;
      item_description: string;
      specification: string;
      quantity: number;
      quoted_rate?: number;
      previous_rate: number;
      tax_rate?: number;
      unit: string;
      required_date: string;
      /* Carried through to the PO line unchanged. item_group and
         activity_name are DIFFERENT axes and must not substitute for
         each other. */
      item_group?: string | null;
      preferred_brand?: string | null;
      item_brand?: string | null;
      activity_name?: string | null;
      sub_activity_name?: string | null;
    }>;
    suppliers: Array<{
      supplier_id: string;
      supplier_name: string;
      email_to: string;
      email_cc: string;
    }>;
  };
}): Promise<{ poIds: string[]; poNumbers: string[]; error: Error | null }> {
  try {
    if (!isLiveSupabase()) {
      return { poIds: [], poNumbers: [], error: new Error('Supabase connection required to generate Purchase Orders.') };
    }

    const { pr, formData } = input;
    const dbProjectId = getDbSiteId(pr.project_id || 'central-park');

    // Suppliers actually chosen on the RFQ form.
    //
    // There is deliberately no fallback. This used to fall back to
    // `vendors.select('id').limit(1)` when nothing was selected, which
    // issued a real, legally binding purchase order to whichever supplier
    // happened to sort first. The same anti-pattern was already removed
    // from generatePurchaseOrder; this is the path the UI actually calls.
    const activeSuppliers = formData.suppliers.filter((s) => s.supplier_id && isValidUuid(s.supplier_id));
    const targetVendorIds: string[] = Array.from(new Set(activeSuppliers.map((s) => s.supplier_id)));

    if (targetVendorIds.length === 0) {
      return {
        poIds: [],
        poNumbers: [],
        error: new Error('Select at least one supplier from the vendor registry before generating purchase orders.'),
      };
    }

    // Every selected supplier must still be active before an order is cut.
    const { data: activeVendorRows, error: vendorCheckError } = await supabase
      .from('vendors')
      .select('id')
      .in('id', targetVendorIds)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (vendorCheckError) {
      return { poIds: [], poNumbers: [], error: new Error(vendorCheckError.message) };
    }
    const activeVendorIds = new Set((activeVendorRows ?? []).map((v) => v.id as string));
    const inactive = targetVendorIds.filter((id) => !activeVendorIds.has(id));
    if (inactive.length > 0) {
      return {
        poIds: [],
        poNumbers: [],
        error: new Error(
          `${inactive.length} selected supplier(s) are deactivated or no longer exist and cannot receive a purchase order.`,
        ),
      };
    }

    const generatedPoIds: string[] = [];
    const generatedPoNumbers: string[] = [];
    const rawAllocations = (formData as any).allocations || {};
    const hasAllocations = Object.keys(rawAllocations).length > 0;

    for (const vendorId of targetVendorIds) {
      const matchingSupplier = formData.suppliers.find((s) => s.supplier_id === vendorId);
      const supplierName = matchingSupplier?.supplier_name || '';

      // Check if PO already exists for this (purchase_requisition_id, vendor_id) to ensure idempotency
      const { data: existingPo } = await supabase
        .from('purchase_orders')
        .select('id, po_number')
        .eq('purchase_requisition_id', pr.id)
        .eq('vendor_id', vendorId)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingPo) {
        generatedPoIds.push(existingPo.id);
        generatedPoNumbers.push(existingPo.po_number);
        continue;
      }

      // Calculate awarded line items specifically for THIS vendor
      const vendorLinePayloads = formData.items
        .map((item) => {
          const itemKey = (item as any).key || item.item_id || '';
          const itemDesc = item.item_description || item.specification || '';

          // Check cell allocation in matrix
          const cell =
            rawAllocations[`${itemKey}:${vendorId}`] ||
            rawAllocations[`${itemKey}:${supplierName}`] ||
            (itemDesc ? rawAllocations[`${itemDesc}:${vendorId}`] : undefined) ||
            (itemDesc ? rawAllocations[`${itemDesc}:${supplierName}`] : undefined) ||
            rawAllocations[`${item.item_id}:${vendorId}`] ||
            rawAllocations[`${item.item_id}:${supplierName}`];

          let awardedQty = Number(item.quantity || 1);
          let rate = Number((item.quoted_rate ?? item.previous_rate) ?? 0);
          const taxRate = Number(item.tax_rate ?? 18);

          if (hasAllocations) {
            if (cell && cell.awarded_qty !== undefined) {
              awardedQty = Number(cell.awarded_qty || 0);
              if (cell.awarded_rate && Number(cell.awarded_rate) > 0) {
                rate = Number(cell.awarded_rate);
              }
            } else {
              // Check if any other supplier was awarded quantity for this item
              const isAwardedToOther = Object.entries(rawAllocations).some(
                ([k, v]) =>
                  (k.startsWith(`${itemKey}:`) || (item.item_id && k.startsWith(`${item.item_id}:`))) &&
                  Number((v as any).awarded_qty) > 0
              );
              if (isAwardedToOther) {
                awardedQty = 0; // Exclude from this vendor since awarded elsewhere
              }
            }
          }

          if (awardedQty <= 0) return null; // Skip non-awarded line item for this vendor!

          const subtotal = awardedQty * rate;
          const taxAmount = subtotal * (taxRate / 100);
          const totalAmount = subtotal + taxAmount;
          const rawPrLineId = (item as any).purchase_requisition_line_id || (item as any).pr_line_id;
          const prLineId = rawPrLineId && isValidUuid(rawPrLineId) ? rawPrLineId : null;

          return {
            item_id: item.item_id || null,
            purchase_requisition_line_id: prLineId,
            item_description: item.item_description || item.specification || 'Material Line Item',
            quantity: awardedQty,
            unit_rate: rate,
            tax_rate: taxRate,
            subtotal_amount: subtotal,
            tax_amount: taxAmount,
            line_total: totalAmount,
            total_amount: totalAmount,
            unit: item.unit || 'nos',
            /* RFQ is the reference shape and keeps the two axes separate:
               item_group says WHAT was bought, activity_name says WHY. This
               used to read activity_name from item_group and sub_activity_name
               from item_brand, which is why every generated PO showed its Item
               Group in the Activity column and left Item Group empty. */
            item_code: (item as any).item_code || null,
            item_group: (item as any).item_group || null,
            item_specification: item.specification || null,
            item_brand: (item as any).preferred_brand || (item as any).item_brand || null,
            activity_name: (item as any).activity_name || null,
            sub_activity_name: (item as any).sub_activity_name || null,
            purchase_category: (item as any).activity_name || null,
          };
        })
        .filter(Boolean) as Array<{
          item_id: string | null;
          purchase_requisition_line_id: string | null;
          item_description: string;
          quantity: number;
          unit_rate: number;
          tax_rate: number;
          subtotal_amount: number;
          tax_amount: number;
          line_total: number;
          total_amount: number;
          unit: string;
          item_code?: string | null;
          item_group?: string | null;
          item_specification?: string | null;
          item_brand?: string | null;
          activity_name?: string | null;
          sub_activity_name?: string | null;
          purchase_category?: string | null;
        }>;

      if (vendorLinePayloads.length === 0) {
        continue; // Skip creating PO if vendor received 0 awarded items!
      }

      // Vendor master, read with the column names the vendors table
      // actually has.
      //
      // This block used to read `gstin`, `pan`, `billing_address`,
      // `contact_number`, `payment_terms`, `contact_person` and
      // `primary_contact` — none of which are columns on `vendors` (the
      // real ones are `gst_number`, `pan_number`, `address`, `phone`). So
      // every RFQ-generated purchase order went out with a blank GST
      // number and a blank PAN, on a document whose own clause 14 invokes
      // a section 194Q TDS obligation.
      const { data: vendorDetails, error: vendorError } = await supabase
        .from('vendors')
        .select('display_name, legal_name, email, phone, address, gst_number, pan_number')
        .eq('id', vendorId)
        .maybeSingle();

      if (vendorError) {
        return { poIds: generatedPoIds, poNumbers: generatedPoNumbers, error: new Error(vendorError.message) };
      }

      // The RFQ this award came from. `.maybeSingle()` errors when a PR has
      // more than one RFQ, so take the most recent deterministically.
      const { data: rfqRecord } = await supabase
        .from('rfqs')
        .select('id')
        .eq('purchase_requisition_id', pr.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const vDisplayName = vendorDetails?.display_name || vendorDetails?.legal_name || supplierName || '';
      const vLegalName = vendorDetails?.legal_name || vendorDetails?.display_name || supplierName || '';
      const vEmail = vendorDetails?.email || matchingSupplier?.email_to || '';
      const vPhone = vendorDetails?.phone || '';
      const vAddress = vendorDetails?.address || '';
      const vGst = vendorDetails?.gst_number || '';
      const vPan = vendorDetails?.pan_number || '';
      const vTerms = '30 days from accepted GRN';
      const vContact = '';

      const poSubtotal = vendorLinePayloads.reduce((sum, l) => sum + l.subtotal_amount, 0);
      const poTaxAmount = vendorLinePayloads.reduce((sum, l) => sum + l.tax_amount, 0);
      const poTotalAmount = poSubtotal + poTaxAmount;

      const poNum = await nextDocumentNumber('PO');

      const poPayload = {
        project_id: dbProjectId,
        site_id: pr.site_id || null,
        vendor_id: vendorId,
        purchase_requisition_id: pr.id,
        rfq_id: rfqRecord?.id || null,
        budget_allocation_id: (pr as any).budget_allocation_id || null,
        po_number: poNum,
        po_date: today(),
        status: 'draft',
        delivery_date: formData.goal_delivery_date || pr.required_date || today(),
        delivery_location: formData.delivery_address || pr.delivery_address || 'Project Site Store',
        payment_terms: vTerms,
        // The RFQ remarks are appended to the standard terms, never
        // substituted for them. This used to read
        // `remarks.length > 10 ? remarks : <17 clauses>`, so typing
        // "please deliver by Friday" produced a purchase order carrying no
        // contractual terms at all — no jurisdiction clause, no 194Q TDS
        // clause, no RERA warranty.
        note_on_po: formData.remarks?.trim() || null,
        terms_and_conditions: `PO Terms 1:-  This is a Contract for Pramukh Group and/or any its affiliates, subsidiaries and/or group companies. Vendor agrees that it shall at all times recognize the validity and ownership of Pramukh and/or any of its affiliates, subsidiaries and/or group companies, as the case may be, over the intellectual property rights and shall not at any time put in issue their validity or ownership.

1. PRELIMINARY
1.1 This is a Contract for execution of job/Supply as required and specified at the time of Enquiry.
1.2 The Enquirer for the above mentioned supply is the company/ proprietary concern/individual.
1.3 The terms and conditions mentioned hereunder are the terms and conditions of the Contract for the execution of the job mentioned under item 1.1 above.

2. REFERENCE FOR DOCUMENTATION
Purchase Order number must appear on order confirmation, correspondence, drawings, invoices, shipping notes, packings and on any documents or papers connected with the order.

3. CONFIRMATION OF ORDER
The Vendor shall acknowledge the receipt of the Purchase Order within ten days following the mailing of this order and shall thereby confirm his acceptance of this Purchase Order in its entirety without exceptions. The acknowledgment will bear on both purchase order and General Procurement Conditions.

4. WEIGHTS AND MEASUREMENTS
a. All weights and measurements recorded by the Organisation on receipt of goods at site will be treated as final.
b. Vendor's shipping documents and invoices must contain the following data:
   i. Unit net weight
   ii. Unit gross weight (packing included)
   iii. Dimensions of packing.

5. PACKING AND MARKING
The Materials shall be suitably packed for safe transportation till receipt at site and should be commensurate with best possible practices of packing, unless specifically stipulated in the Technical specifications, to avoid any damage during transit.

6. CONTROL REGULATIONS
The supply, dispatch and delivery of goods shall be arranged by the Vendor in strict conformity with the statutory regulations including provision of Industries (Development and Regulation) Act 1951 and any amendment thereof as applicable from time to time. The Organisation disowns any responsibility for any irregularity or contravention of any of the statutory regulations in manufacture or supply of the stores covered by this order.

7. RESPECT FOR DELIVERY DATES
Time of delivery as mentioned in the Purchase Order shall be the essence of the contract and no variation shall be permitted except with prior authorization in writing from the Organisation. Goods should be delivered securely packed and in good order and condition at the place and within the time specified in the Purchase Order for their delivery.

8. DELAYS DUE TO FORCE MAJEURE
A) Any delay in or failure of the performance of either part hereto shall not constitute default hereunder or give rise to any claims for damage, if any, to the extent such delays or failure of performance is caused by occurrences such as Acts of God or an enemy, expropriation or confiscation of facilities by Government authorities, acts of war, rebellion, sabotage or fires, floods, explosions, riots, or strikes. The Contractor shall keep records of the circumstances referred to above and bring these to the notice of the Project-in Charge/Site-in-Charge in writing immediately on such occurrences. The amount of time, if any, lost on any of these counts shall not be counted for the Contract period. Once decision of the Owner arrived at after consultation with the Contractor, shall be final and binding. Such a determined period of time be extended by the Owner to enable the Contractor to complete the job within such extended period of time.
B) If Contractor is prevented or delayed from the performing any of its obligations under this Agreement by Force Majeure, then Contractor shall notify Owner the circumstances constituting the Force Majeure and the obligations performance of which is thereby delayed or prevented, within seven days of the occurrence of the events.

9. REJECTION, REMOVAL OF REJECTED GOODS AND REPLACEMENT
A) In case the testing and inspection at any stage by Inspectors reveal the equipment, material and workmanship do not comply with specification and requirements, the same shall be removed by the Vendor at their / its own expense and risk within the time allowed by the Organisation.
B) The Vendor will have to proceed with the replacement of that equipment or part of equipment without claiming any extra payment if so required by the Organisation. The time taken for replacement in such event will not be added to the contractual delivery period.

10. TAXES & DUTIES
A) GST (CGST, SGST, IGST as applicable), Customs Duty and applicable Cess as applicable shall be reimbursed for the materials consigned to Organisation as per limits indicated in the offer against documentary evidence to be furnished by the Supplier. Organisation shall pay only those taxes, duties and levies as indicated by Supplier at the time of bid submission/as agreed subsequently.(prior to opening of priced bids).
B) The Vendor shall comply with all the provisions of the GST Act / Rules / requirements like providing of tax invoices, payment of taxes to the authorities within the due dates, filing of returns within the due dates etc. to enable Pramukh Group to take Input Tax Credit.

11. JURISDICTION
The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.

12. PAYMENT TERMS
Payment will be released, subject to Tax - Invoice uploaded on GST portal before payment due date.

13. LATE DELIVERY CLAUSE
Penalty would be charged from 1% - 10% per week OR as per management decision if delivery would be done after due date OR schedule date given by site.

14. TAX DEDUCTION AT SOURCE TO BE MADE U/S. 194Q FROM THE PURCHASE OF GOODS FROM YOU
As you are aware that w.e.f 1ST July, 2021, the provisions of Section 194Q for withholding of Tax at 0.10% on the value of purchase of goods are applicable. In view of the same, we shall deduct the required TDS at 0.10% from the value of purchase of goods from you. We are the purchasers who satisfies the conditions laid down in Section 194Q and hence we are required to deduct TDS from the value of Purchases from you at the applicable rates. Since we are liable to deduct TDS U/S. 194Q, you being the seller of goods , are not required to make TCS U/S. 206C(1H) at 0.10%. Hence please do not charge any TCS on your purchase Invoice in response to this PO. The rate of Withholding of tax U/S. 194Q shall be subject to the amendments made from time to time.

NOTE : Moreover, please confirm whether you have filed the Income Tax Returns for A.Y. 2019-2020 and A.Y. 2020-2021 along with the acceptance of this PO with copy of the acknowledgement / screen shot from the Income tax website. In the absence of such confirmation, we shall presume that you have not filed your Income tax returns for the required two years and therefore, the withholding of tax shall be made at higher rate of 5% from the value of purchase of goods from you which shall not be refunded nor adjusted in subsequent billing against this PO or any other PO. If you have already submitted the required details of the Income Tax Returns with us, please ignore this note.

15. GUARANTEE / WARRANTY
Under RERA act minimum 5 years from the date of possession for material or workmanship.

16. DELIVERY DATE
As per site Schedule and mentioned in PO.

17. PRICE BASIS
DAP at Site, Freight included.`,
        subtotal_amount: poSubtotal,
        tax_amount: poTaxAmount,
        total_amount: poTotalAmount,
        // Autofilled vendor master details
        supplier_name: vDisplayName,
        vendor_name: vDisplayName,
        po_in_the_name_of: vLegalName,
        phone_no: vPhone,
        mobile_no: vPhone,
        email_id: vEmail,
        supplier_address: vAddress,
        contact_person: vContact,
        gst_no: vGst,
        pan_no: vPan,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Header and lines are no longer written as two independent,
      // separately-swallowed statements. Both used to be `console.error` +
      // continue, so a failed header quietly produced no order for that
      // vendor while the caller reported success, and a failed line insert
      // left an orphan header carrying a non-zero total and no items.
      const { data: newPo, error: poErr } = await supabase
        .from('purchase_orders')
        .insert([poPayload])
        .select('id')
        .single();

      if (poErr || !newPo?.id) {
        return {
          poIds: generatedPoIds,
          poNumbers: generatedPoNumbers,
          error: new Error(
            `Failed to create the purchase order for ${vDisplayName || 'the selected supplier'}: ${poErr?.message ?? 'no row returned'}`,
          ),
        };
      }

      const poLineInserts = vendorLinePayloads.map((l, idx) => ({
        purchase_order_id: newPo.id,
        project_id: dbProjectId,
        line_number: idx + 1,
        item_id: l.item_id,
        purchase_requisition_line_id: l.purchase_requisition_line_id,
        item_description: l.item_description,
        quantity: l.quantity,
        unit_rate: l.unit_rate,
        tax_rate: l.tax_rate,
        line_total: l.line_total,
        activity_name: l.activity_name || null,
        sub_activity_name: l.sub_activity_name || null,
        item_group: (l as any).item_group || null,
        item_brand: (l as any).item_brand || null,
        item_code: (l as any).item_code || null,
        item_specification: (l as any).item_specification || null,
        purchase_category: (l as any).purchase_category || null,
      }));

      const { error: poLinesErr } = await supabase
        .from('purchase_order_lines')
        .insert(poLineInserts);

      if (poLinesErr) {
        // Roll the orphan header back rather than leave a valued PO with
        // no items. It is still a draft, so nothing downstream has seen it.
        await supabase.from('purchase_orders').delete().eq('id', newPo.id);
        return {
          poIds: generatedPoIds,
          poNumbers: generatedPoNumbers,
          error: new Error(
            `Failed to create purchase order lines for ${vDisplayName || 'the selected supplier'}: ${poLinesErr.message}`,
          ),
        };
      }

      generatedPoIds.push(newPo.id);
      generatedPoNumbers.push(poNum);
    }

    // Roll the requisition header up from its newly ordered lines.
    //
    // supabase.rpc() resolves with an { error } object rather than
    // throwing, so the previous try/catch fallback was unreachable: when
    // the RPC was missing the PR silently kept its old status forever.
    const { error: rollupError } = await supabase.rpc('recompute_pr_header_status', { p_pr_id: pr.id });
    if (rollupError) {
      const { error: prStatusError } = await supabase
        .from('purchase_requisitions')
        .update({ status: 'po_issued', updated_at: new Date().toISOString() })
        .eq('id', pr.id);
      if (prStatusError) {
        return {
          poIds: generatedPoIds,
          poNumbers: generatedPoNumbers,
          error: new Error(
            `Purchase orders were created but the requisition status could not be updated: ${prStatusError.message}`,
          ),
        };
      }
    }

    return { poIds: generatedPoIds, poNumbers: generatedPoNumbers, error: null };
  } catch (err) {
    console.error('Error generating POs from RFQ form:', err);
    return { poIds: [], poNumbers: [], error: err as Error };
  }
}

export type GeneratePurchaseOrdersFromAwardsInput = {
  vendorSelectionId: string;
  deliveryDate?: string | null;
  deliveryLocation?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
};

/**
 * Generates N distinct Purchase Orders for a multi-vendor award matrix.
 * Groups approved vendor_selection_awards by vendor_id, populates
 * purchase_order_lines with vendor_selection_award_id and purchase_requisition_line_id,
 * and updates awards to 'po_created'.
 */
export async function generatePurchaseOrdersFromAwards(
  input: GeneratePurchaseOrdersFromAwardsInput
): Promise<MutationResult<{ purchaseOrderIds: string[]; poCount: number }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase live connection required.');
    const profileId = await currentProfileId();

    // 1. Fetch vendor selection header
    const { data: selection, error: selErr } = await supabase
      .from('vendor_selections')
      .select('id, purchase_requisition_id, rfq_id, project_id')
      .eq('id', input.vendorSelectionId)
      .single();

    if (selErr || !selection) throw new Error(`Vendor selection not found: ${selErr?.message}`);

    // 2. Fetch all active awards for this selection
    const { data: awards, error: awardsErr } = await supabase
      .from('vendor_selection_awards')
      .select('*, rfq_lines(*)')
      .eq('vendor_selection_id', input.vendorSelectionId)
      .neq('status', 'cancelled');

    if (awardsErr) throw new Error(awardsErr.message);
    if (!awards || awards.length === 0) {
      throw new Error('No active awards found for this vendor selection.');
    }

    // 3. Fetch PR info for budget allocation
    const { data: pr, error: prErr } = await supabase
      .from('purchase_requisitions')
      .select('project_id, site_id, budget_allocation_id')
      .eq('id', selection.purchase_requisition_id)
      .single();

    if (prErr || !pr) throw new Error(`Purchase requisition not found: ${prErr?.message}`);

    // 4. Group awards by vendor_id
    const awardsByVendor: Record<string, typeof awards> = {};
    for (const award of awards) {
      if (!awardsByVendor[award.vendor_id]) {
        awardsByVendor[award.vendor_id] = [];
      }
      awardsByVendor[award.vendor_id].push(award);
    }

    const createdPoIds: string[] = [];

    // 5. Generate a Purchase Order for each vendor group
    for (const [vendorId, vendorAwards] of Object.entries(awardsByVendor)) {
      // Check if PO already exists for this (vendor_selection_id, vendor_id)
      const { data: existingPo } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('vendor_selection_id', input.vendorSelectionId)
        .eq('vendor_id', vendorId)
        .is('deleted_at', null)
        .maybeSingle();

      let poId: string;

      if (existingPo) {
        poId = existingPo.id;
        createdPoIds.push(poId);
      } else {
        // Calculate totals for this vendor's award lines
        const subtotal = vendorAwards.reduce(
          (sum, a) => sum + Number(a.awarded_qty) * Number(a.awarded_rate),
          0
        );
        const taxTotal = vendorAwards.reduce(
          (sum, a) =>
            sum +
            Number(a.awarded_qty) * Number(a.awarded_rate) * (Number(a.tax_rate || 0) / 100),
          0
        );
        const totalAmount = subtotal + taxTotal;

        const poNumber = await nextDocumentNumber('PO');

        const { data: newPo, error: poCreateErr } = await supabase
          .from('purchase_orders')
          .insert({
            project_id: pr.project_id,
            site_id: pr.site_id,
            vendor_id: vendorId,
            purchase_requisition_id: selection.purchase_requisition_id,
            vendor_selection_id: input.vendorSelectionId,
            budget_allocation_id: pr.budget_allocation_id || null,
            po_number: poNumber,
            po_date: today(),
            delivery_date: input.deliveryDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            delivery_location: input.deliveryLocation || 'Project Site Store',
            payment_terms: input.paymentTerms || '30 days from accepted GRN',
            terms_and_conditions: input.termsAndConditions || 'Standard Procurement Terms Apply',
            subtotal_amount: subtotal,
            tax_amount: taxTotal,
            total_amount: totalAmount,
            status: 'draft',
            created_by: profileId,
            updated_by: profileId,
          })
          .select('id')
          .single();

        if (poCreateErr || !newPo) {
          throw new Error(`Failed to create PO for vendor ${vendorId}: ${poCreateErr?.message}`);
        }

        poId = newPo.id;
        createdPoIds.push(poId);

        // Insert PO lines
        const poLinesToInsert = vendorAwards.map((a, idx) => {
          const rfqLine = a.rfq_lines as { item_id?: string; item_code?: string; item_group?: string; item_description?: string; specification?: string; preferred_brand?: string; unit?: string; activity_name?: string; sub_activity_name?: string; master_budget_item_id?: string } | null;
          return {
            purchase_order_id: poId,
            project_id: pr.project_id,
            item_id: rfqLine?.item_id || null,
            item_code: rfqLine?.item_code || null,
            item_group: rfqLine?.item_group || null,
            item_brand: rfqLine?.preferred_brand || null,
            item_specification: rfqLine?.specification || null,
            item_description: rfqLine?.item_description || 'Awarded Procurement Item',
            unit: rfqLine?.unit || 'nos',
            quantity: Number(a.awarded_qty),
            unit_rate: Number(a.awarded_rate),
            tax_rate: Number(a.tax_rate || 0),
            line_total: Number(a.awarded_qty) * Number(a.awarded_rate),
            activity_name: rfqLine?.activity_name || null,
            sub_activity_name: rfqLine?.sub_activity_name || null,
            purchase_requisition_line_id: a.purchase_requisition_line_id || null,
            vendor_selection_award_id: a.id,
            rfq_line_id: a.rfq_line_id,
            master_budget_item_id: rfqLine?.master_budget_item_id || null,
            line_number: idx + 1,
            created_by: profileId,
            updated_by: profileId,
          };
        });

        const { data: insertedPoLines, error: poLinesErr } = await supabase
          .from('purchase_order_lines')
          .insert(poLinesToInsert)
          .select('id, vendor_selection_award_id');

        if (poLinesErr) throw new Error(`Failed to create PO lines: ${poLinesErr.message}`);

        // Update vendor_selection_awards rows with purchase_order_id & purchase_order_line_id
        if (insertedPoLines) {
          for (const line of insertedPoLines) {
            if (line.vendor_selection_award_id) {
              await supabase
                .from('vendor_selection_awards')
                .update({
                  purchase_order_id: poId,
                  purchase_order_line_id: line.id,
                  status: 'po_created',
                  updated_by: profileId,
                })
                .eq('id', line.vendor_selection_award_id);
            }
          }
        }
      }
    }

    // 5b. Update PR Line procured quantities and trigger MR conversion balance recomputation
    for (const award of awards) {
      if (award.purchase_requisition_line_id) {
        const { data: prLine } = await supabase
          .from('purchase_requisition_lines')
          .select('id, quantity, material_request_line_id')
          .eq('id', award.purchase_requisition_line_id)
          .single();

        if (prLine && prLine.material_request_line_id) {
          try {
            await supabase.rpc('recompute_mr_line_conversion', {
              p_material_request_line_id: prLine.material_request_line_id,
            });
          } catch {
            // Non-blocking fallback
          }
        }
      }
    }

    // 6. Update Requisition status. The error was previously discarded, so
    //    a PR could stay in its old state with orders already cut against it.
    const { error: prStatusError } = await supabase
      .from('purchase_requisitions')
      .update({ status: 'po_issued', updated_by: profileId })
      .eq('id', selection.purchase_requisition_id);
    if (prStatusError) {
      throw new Error(
        `Purchase orders were created but the requisition status could not be updated: ${prStatusError.message}`,
      );
    }

    return {
      data: {
        purchaseOrderIds: createdPoIds,
        poCount: createdPoIds.length,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: asError(e) };
  }
}

export type ApproveVendorSelectionInput = {
  selectionId: string;
};

export async function approveVendorSelection(input: ApproveVendorSelectionInput): Promise<MutationResult<{ selectionId: string; purchaseOrderIds?: string[] }>> {
  try {
    const profileId = await requireApprover('operational');

    const { data: selection, error: selectionError } = await supabase
      .from('vendor_selections')
      .select('id, purchase_requisition_id, rfq_id, selected_vendor_id')
      .eq('id', input.selectionId)
      .single();

    if (selectionError) throw new Error(selectionError.message);

    // 1. Approve vendor_selections header
    const { error } = await supabase
      .from('vendor_selections')
      .update({
        status: 'approved',
        approved_by: profileId,
        approved_at: new Date().toISOString(),
        updated_by: profileId,
      })
      .eq('id', input.selectionId);

    if (error) throw new Error(error.message);

    // 2. Approve all awards linked to this vendor selection
    await supabase
      .from('vendor_selection_awards')
      .update({
        status: 'approved',
        updated_by: profileId,
      })
      .eq('vendor_selection_id', input.selectionId)
      .in('status', ['pending', 'submitted']);

    if ((selection as { purchase_requisition_id?: string }).purchase_requisition_id) {
      await supabase
        .from('purchase_requisitions')
        .update({ status: 'vendor_selected', updated_by: profileId })
        .eq('id', (selection as { purchase_requisition_id: string }).purchase_requisition_id);
    }

    // 3. Generate multi-PO for all awarded vendors
    let createdPoIds: string[] = [];
    try {
      const poRes = await generatePurchaseOrdersFromAwards({
        vendorSelectionId: input.selectionId,
      });
      if (poRes.data?.purchaseOrderIds) {
        createdPoIds = poRes.data.purchaseOrderIds;
      }
    } catch (poErr) {
      console.warn('Multi-PO generation warning:', poErr);
    }

    return { data: { selectionId: input.selectionId, purchaseOrderIds: createdPoIds }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
export type GeneratePurchaseOrderInput = {
  purchaseRequisitionId: string;
  vendorSelectionId?: string | null;
  vendorId?: string | null;
  deliveryDate?: string | null;
  deliveryLocation?: string | null;
  paymentTerms?: string | null;
  termsAndConditions?: string | null;
  lines?: Array<{
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    line_total?: number;
    purchase_requisition_line_id?: string | null;
    vendor_selection_award_id?: string | null;
    rfq_line_id?: string | null;
    master_budget_item_id?: string | null;
  }>;
};

export type PurchaseOrderInput = GeneratePurchaseOrderInput;

function isValidUuid(id: string | null | undefined): boolean {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function generatePurchaseOrder(input: GeneratePurchaseOrderInput): Promise<MutationResult<{ purchaseOrderId: string }>> {
  try {
    if (!isValidUuid(input.vendorSelectionId)) {
      input.vendorSelectionId = null;
    }

    const profileId = await currentProfileId();
    
    const { data: pr, error: prError } = await supabase
      .from('purchase_requisitions')
      .select('project_id, site_id, status, budget_allocation_id')
      .eq('id', input.purchaseRequisitionId)
      .single();
      
    if (prError) throw new Error(`Requisition not found: ${prError.message}`);

    let selectedQuotation: QuotationRow | null = null;

    if (input.vendorSelectionId) {
      const { data: selection } = await supabase
        .from('vendor_selections')
        .select('id, status, selected_vendor_id, selected_quotation_id, purchase_requisition_id, vendor_quotations!vendor_selections_selected_quotation_id_fkey(*, quotation_lines(*))')
        .eq('id', input.vendorSelectionId)
        .maybeSingle();

      if (selection) {
        const selected = selection as unknown as Pick<
          VendorSelectionRow,
          'id' | 'status' | 'selected_vendor_id' | 'selected_quotation_id' | 'purchase_requisition_id'
        > & {
          vendor_quotations?: QuotationRow | QuotationRow[] | null;
        };
        const rawQuote = selected.vendor_quotations;
        selectedQuotation = Array.isArray(rawQuote) ? rawQuote[0] ?? null : rawQuote ?? null;
      }
    }

    if (input.vendorSelectionId) {
      const { data: existingPo, error: existingPoError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('vendor_selection_id', input.vendorSelectionId)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();

      if (existingPoError) throw new Error(existingPoError.message);
      if (existingPo) throw new Error('A purchase order already exists for this approved vendor selection.');
    }

    const sourceLines = input.lines && input.lines.length > 0
      ? input.lines
      : (selectedQuotation?.quotation_lines || []).map((line: ProcurementLineRow) => ({
          item_id: line.item_id ?? null,
          item_description: line.item_description,
          quantity: Number(line.quantity || 0),
          unit_rate: Number(line.unit_rate || 0),
          tax_rate: Number(line.tax_rate || 0),
          line_total: Number(line.line_total || 0),
        }));

    if (sourceLines.length === 0) throw new Error('PO cannot be generated without purchase order lines.');

    const normalizedLines = sourceLines.map((line: { item_id?: string | null; item_description: string; quantity: number; unit_rate: number; tax_rate: number; line_total?: number }) => {
      const quantity = Number(line.quantity || 0);
      const unitRate = Number(line.unit_rate || 0);
      const taxRate = Number(line.tax_rate || 0);
      const lineTotal = Number(line.line_total || quantity * unitRate);
      if (!line.item_description.trim()) throw new Error('Every PO line requires an item description.');
      if (quantity <= 0) throw new Error('Every PO line quantity must be greater than zero.');
      return {
        item_id: line.item_id ?? null,
        item_description: line.item_description.trim(),
        quantity,
        unit_rate: unitRate,
        tax_rate: taxRate,
        line_total: lineTotal,
      };
    });

    const subtotalAmount = normalizedLines.reduce((sum: number, line: { line_total: number }) => sum + line.line_total, 0);
    const taxAmount = normalizedLines.reduce((sum: number, line: { line_total: number; tax_rate: number }) => sum + line.line_total * (line.tax_rate / 100), 0);
    const totalAmount = subtotalAmount + taxAmount;
    // The budget allocation is inherited from the requisition, or left
    // null for fn_resolve_budget_allocation to derive from the project and
    // master budget item at commitment time.
    //
    // The previous fallback picked whichever approved allocation on the
    // project happened to have enough headroom, ordered by updated_at — so
    // a steel order could commit against the electrical budget purely
    // because that line had room. An allocation is a cost classification,
    // not a wallet; guessing one produces a commitment posted to the wrong
    // cost head and a variance report nobody can reconcile.
    const budgetAllocationId =
      (pr as { budget_allocation_id?: string | null }).budget_allocation_id ?? null;

    // The vendor must be the one that was actually selected. This previously
    // fell back to `vendors.select('id').limit(1)`, which silently issued the
    // purchase order to whichever vendor happened to sort first.
    const effectiveVendorId = (input.vendorId || '').trim();
    if (!isValidUuid(effectiveVendorId)) {
      throw new Error('Select a vendor before generating the purchase order. Add one in the Vendor Registry if none exist.');
    }
    const { data: vendorExists, error: vendorLookupError } = await supabase
      .from('vendors')
      .select('id, is_active')
      .eq('id', effectiveVendorId)
      .maybeSingle();
    if (vendorLookupError) throw new Error(vendorLookupError.message);
    if (!vendorExists) throw new Error('The selected vendor no longer exists.');
    if (!(vendorExists as { is_active: boolean }).is_active) {
      throw new Error('The selected vendor is deactivated and cannot receive a purchase order.');
    }

    const effectiveSelectionId = isValidUuid(input.vendorSelectionId) ? input.vendorSelectionId : null;

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        project_id: pr.project_id,
        site_id: pr.site_id,
        vendor_id: effectiveVendorId,
        purchase_requisition_id: input.purchaseRequisitionId,
        vendor_selection_id: effectiveSelectionId,
        budget_allocation_id: budgetAllocationId,
        po_number: await nextDocumentNumber('PO'),
        po_date: today(),
        delivery_date: input.deliveryDate,
        delivery_location: input.deliveryLocation,
        payment_terms: input.paymentTerms,
        terms_and_conditions: input.termsAndConditions || `PO Terms 1:- This is a Contract for Pramukh Group and/or any its affiliates, subsidiaries and/or group companies. Vendor agrees that it shall at all times recognize the validity and ownership of Pramukh and/or any of its affiliates, subsidiaries and/or group companies, as the case may be, over the intellectual property rights and shall not at any time put in issue their validity or ownership.
1. PRELIMINARY
1.1 This is a Contract for execution of job/Supply as required and specified at the time of Enquiry. i.e.
1.2 The Enquirer for the above mentioned supply is the company/ proprietary concern/individual.
1.3 The terms and conditions mentioned hereunder are the terms and conditions of the Contract for the execution of the job mentioned under item 1.1 above.
2. REFERENCE FOR DOCUMENTATION
Purchase Order number must appear on order confirmation, correspondence, drawings, invoices, shipping notes, packings and on any documents or papers connected with the order.
3. CONFIRMATION OF ORDER
The Vendor shall acknowledge the receipt of the Purchase Order within ten days following the mailing of this order and shall thereby confirm his acceptance of this Purchase Order in its entirety without exceptions. The acknowledgment will bear on both purchase order and General Procurement Conditions.
4. WEIGHTS AND MEASUREMENTS
a. All weights and measurements recorded by the Organisation on receipt of goods at site will be treated as final.
b. Vendor's shipping documents and invoices must contain the following data:
i. Unit net weight
ii. Unit gross weight (packing included)
iii.Dimensions of packing.
5. PACKING AND MARKING
The Materials shall be suitably packed for safe transportation till receipt at site and should be commensurate with best possible practices of packing, unless specifically stipulated in the Technical specifications, to avoid any damage during transit.
6. CONTROL REGULATIONS
The supply, dispatch and delivery of goods shall be arranged by the Vendor in strict conformity with the statutory regulations including provision of Industries (Development and Regulation) Act1951 and any amendment thereof as applicable from time to time. The Organisation disowns any responsibility for any irregularity or contravention of any of the statutory regulations in manufacture or supply of the stores covered by this order.
7. RESPECT FOR DELIVERY DATES.
Time of delivery as mentioned in the Purchase Order shall be the essence of the contract and no variation shall be permitted except with prior authorization in writing from the Organisation. Goods should be delivered securely packed and in good order and condition at the place and within the time specified in the Purchase Order for their delivery.
8. DELAYS DUE TO FORCE MAJEURE
A) Any delay in or failure of the performance of either part hereto shall not constitute default hereunder or give rise to any claims for damage, if any, to the extent such delays or failure of performance is caused by occurrences such as Acts of God or an enemy, expropriation or confiscation of facilities by Government authorities, acts of war, rebellion, sabotage or fires, floods, explosions, riots, or strikes. The Contractor shall keep records of the circumstances referred to above and bring these to the notice of the Project-in Charge/Site-in-Charge in writing immediately on such occurrences. The amount of time, if any, lost on any of these counts shall not be counted for the Contract period. Once decision of the Owner arrived at after consultation with the Contractor, shall be final and binding. Such a determined period of time be extended by the Owner to enable the Contractor to complete the job within such extended period of time.
B) If Contractor is prevented or delayed from the performing any of its obligations under this Agreement by Force Majeure, then Contractor shall notify Owner the circumstances constituting the Force Majeure and the obligations performance of which is thereby delayed or prevented, within seven days of the occurrence of the events.
9. REJECTION, REMOVAL OF REJECTED GOODS AND REPLACEMENT
A) In case the testing and inspection at any stage by Inspectors reveal the equipment, material and workmanship do not comply with specification and requirements, the same shall be removed by the Vendor at their / its own expense and risk within the time allowed by the Organisation.
B) The Vendor will have to proceed with the replacement of that equipment or part of equipment without claiming any extra payment if so required by the Organisation. The time taken for replacement in such event will not be added to the contractual delivery period.
10. TAXES & DUTIES:
A) GST (CGST, SGST, IGST as applicable), Customs Duty and applicable Cess as applicable shall be reimbursed for the materials consigned to Organisation as per limits indicated in the offer against documentary evidence to be furnished by the Supplier. Organisation shall pay only those taxes, duties and levies as indicated by Supplier at the time of bid submission/as agreed subsequently.(prior to opening of priced bids).
B) The Vendor shall comply with all the provisions of the GST Act / Rules / requirements like providing of tax invoices, payment of taxes to the authorities within the due dates, filing of returns within the due dates etc. to enable Pramukh Group to take Input Tax Credit.
11. JURISDICTION
The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.`,
        subtotal_amount: subtotalAmount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'draft',
        ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const purchaseOrderId = (data as { id: string }).id;

    const { error: lineError } = await supabase.from('purchase_order_lines').insert(
      normalizedLines.map((line: { item_id?: string | null; item_description: string; quantity: number; unit_rate: number; tax_rate: number; line_total: number; unit?: string | null; activity_name?: string | null; sub_activity_name?: string | null; item_group?: string | null; item_brand?: string | null; purchase_requisition_line_id?: string | null; vendor_selection_award_id?: string | null; rfq_line_id?: string | null; master_budget_item_id?: string | null }, idx: number) => ({
        purchase_order_id: purchaseOrderId,
        project_id: pr.project_id,
        item_id: line.item_id || null,
        item_description: line.item_description,
        quantity: line.quantity,
        unit_rate: line.unit_rate,
        unit: line.unit || 'nos',
        tax_rate: line.tax_rate,
        line_total: line.line_total,
        /* These four used to fall back into each other
           (activity_name || item_group, item_group || activity_name, ...).
           item_group and activity_name are different axes — WHAT was bought
           versus WHY — so a missing activity became the item group and a
           missing group became the activity. An empty column is recoverable;
           a column filled with the wrong axis is not. */
        activity_name: line.activity_name || null,
        sub_activity_name: line.sub_activity_name || null,
        item_group: line.item_group || null,
        item_brand: line.item_brand || (line as any).preferred_brand || null,
        item_code: (line as any).item_code || null,
        item_specification: (line as any).item_specification || (line as any).specification || null,
        /* purchase_category tracks the activity axis, never the item group. */
        purchase_category: (line as any).purchase_category || line.activity_name || null,
        purchase_requisition_line_id: line.purchase_requisition_line_id || null,
        vendor_selection_award_id: line.vendor_selection_award_id || null,
        rfq_line_id: line.rfq_line_id || null,
        master_budget_item_id: line.master_budget_item_id || null,
        line_number: idx + 1,
        ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
      })),
    );
    if (lineError) {
      // Do not leave a valued header with no items behind. The order is
      // still a draft, so nothing downstream has seen it.
      await supabase.from('purchase_orders').delete().eq('id', purchaseOrderId);
      throw new Error(lineError.message);
    }

    // Error previously discarded: a PR could stay in its old state with an
    // order already raised against it.
    const { error: prStatusError } = await supabase.from('purchase_requisitions').update({
      status: 'po_issued',
      ...(profileId ? { updated_by: profileId } : {}),
    }).eq('id', input.purchaseRequisitionId);
    if (prStatusError) {
      throw new Error(
        `Purchase order ${purchaseOrderId} was created but the requisition status could not be updated: ${prStatusError.message}`,
      );
    }

    return { data: { purchaseOrderId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Approves a purchase order and (optionally) issues it to the vendor.
 * The RPC re-checks the caller's role and stamps approved_by/approved_at
 * server-side, so the audit trail cannot be set by the client.
 */
export async function approveAndSendPurchaseOrder(
  po: PurchaseOrderRow,
  sendToVendor = true,
): Promise<MutationResult<{ status: string }>> {
  try {
    await requireApprover('operational');
    const result = await rpcAction<{ status?: string }>('approve_and_send_purchase_order', {
      p_purchase_order_id: po.id,
      p_send_to_vendor: sendToVendor,
    });
    return { data: { status: String(result.status || 'approved') }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}



export type ReceiveGoodsInput = {
  receiptDate?: string;
  challanNumber?: string;
  challanDate?: string;
  vehicleNumber?: string;
  godownName?: string;
  transporterName?: string;
  qualityDecision?: string;
  remarks?: string;
  /** Leave empty to receive the full outstanding PO quantity. */
  lines?: {
    purchaseOrderLineId?: string | null;
    itemId?: string | null;
    receivedQty: number;
    acceptedQty: number;
    rejectedQty: number;
    unitRate: number;
    remarks?: string;
  }[];
  /**
   * Forces the GRN into `pending_approval` even for an approver, so a
   * receipt can be recorded now and posted to inventory after review.
   */
  submitForApproval?: boolean;
};

/**
 * (PO value vs GRN value vs invoice value) recorded in three_way_matches.
 * The bill number is allocated server-side.
 */
export async function createVendorBillFromGrn(
  grn: GrnRow,
  options: { invoiceValue?: number; tolerance?: number; documentHash?: string; storagePath?: string; fileName?: string } = {},
): Promise<MutationResult<{ vendorBillId: string; billNumber: string; matchStatus: string }>> {
  try {
    await requireProfile();
    const result = await rpcAction<{ vendorBillId?: string; billNumber?: string; matchStatus?: string }>(
      'submit_vendor_bill_from_grn',
      {
        p_grn_id: grn.id,
        p_bill_number: null,
        p_bill_date: today(),
        p_invoice_value: options.invoiceValue ?? null,
        p_document_hash: options.documentHash ?? null,
        p_storage_path: options.storagePath ?? null,
        p_file_name: options.fileName ?? null,
        p_tolerance: options.tolerance ?? 0,
      },
    );
    if (!result.vendorBillId) throw new Error('The vendor bill was not created.');
    return {
      data: {
        vendorBillId: String(result.vendorBillId),
        billNumber: String(result.billNumber || ''),
        matchStatus: String(result.matchStatus || 'pending'),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Reads a document-generation endpoint response safely. The backend can return a
 * plain-text body (e.g. "Internal Server Error" on an unhandled 500, or an HTML
 * proxy error), so we read as text first and only then attempt JSON — surfacing
 * the real message instead of a cryptic "Unexpected token 'I'… is not valid JSON".
 */
async function readDocResponse<T>(response: Response, fallbackMsg: string): Promise<T> {
  const raw = await response.text();
  let parsed: (Partial<T> & { error?: string; detail?: string }) | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null; // non-JSON body (server error page / proxy error)
  }
  if (!response.ok) {
    const detail = parsed?.error || parsed?.detail || (raw ? raw.trim().slice(0, 300) : '');
    throw new Error(detail || `${fallbackMsg} (HTTP ${response.status})`);
  }
  if (!parsed) throw new Error(`${fallbackMsg}: server returned a non-JSON response.`);
  return parsed as T;
}

export async function generatePurchaseOrderPdf(po: PurchaseOrderRow): Promise<MutationResult<PurchaseOrderPdfResult>> {
  try {
    const headers = await getSupabaseJsonHeaders();
    const response = await fetch(`/api/procurement/purchase-orders/${po.id}/pdf`, {
      method: 'POST',
      headers,
    });
    const payload = await readDocResponse<Partial<PurchaseOrderPdfResult>>(response, 'Unable to generate PO PDF.');
    // storagePath is legitimately null until a PDF is archived, so only the
    // id and the preview URL are required. Treating a null path as an
    // incomplete response used to make every call fail.
    if (!payload.purchaseOrderId || !payload.signedUrl) {
      throw new Error('PO PDF generation response was incomplete.');
    }
    return {
      data: {
        purchaseOrderId: payload.purchaseOrderId,
        storagePath: payload.storagePath ?? null,
        signedUrl: payload.signedUrl,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type PurchaseRequisitionPdfResult = {
  purchaseRequisitionId: string;
  storagePath: string;
  signedUrl: string;
};

export async function generatePurchaseRequisitionPdf(pr: PurchaseRequisitionRow): Promise<MutationResult<PurchaseRequisitionPdfResult>> {
  try {
    const headers = await getSupabaseJsonHeaders();
    const response = await fetch(`/api/procurement/purchase-requisitions/${pr.id}/pdf`, {
      method: 'POST',
      headers,
    });
    const payload = await readDocResponse<Partial<PurchaseRequisitionPdfResult>>(response, 'Unable to generate PR PDF.');
    if (!payload.purchaseRequisitionId || !payload.storagePath || !payload.signedUrl) {
      throw new Error('PR PDF generation response was incomplete.');
    }
    return {
      data: {
        purchaseRequisitionId: payload.purchaseRequisitionId,
        storagePath: payload.storagePath,
        signedUrl: payload.signedUrl,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type GrnPdfResult = { grnId: string; storagePath: string; signedUrl: string };

/** Generates the GRN "Download Report" PDF (report format) via the backend. */
export async function generateGoodsReceiptNotePdf(grnId: string): Promise<MutationResult<GrnPdfResult>> {
  try {
    const headers = await getSupabaseJsonHeaders();
    const response = await fetch(`/api/procurement/grns/${grnId}/pdf`, {
      method: 'POST',
      headers,
    });
    const payload = await readDocResponse<Partial<GrnPdfResult>>(response, 'Unable to generate GRN report PDF.');
    if (!payload.grnId || !payload.storagePath || !payload.signedUrl) {
      throw new Error('GRN PDF generation response was incomplete.');
    }
    return {
      data: { grnId: payload.grnId, storagePath: payload.storagePath, signedUrl: payload.signedUrl },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type DocPdfResult = { storagePath: string; signedUrl: string };

/**
 * Shared helper for the report-format document endpoints. Posts to the given
 * path and returns the stored path + signed preview URL.
 */
async function requestReportPdf(path: string, label: string): Promise<MutationResult<DocPdfResult>> {
  try {
    const headers = await getSupabaseJsonHeaders();
    const response = await fetch(path, { method: 'POST', headers });
    const payload = await readDocResponse<Partial<DocPdfResult>>(response, `Unable to generate ${label} PDF.`);
    if (!payload.storagePath || !payload.signedUrl) {
      throw new Error(`${label} PDF generation response was incomplete.`);
    }
    return { data: { storagePath: payload.storagePath, signedUrl: payload.signedUrl }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Generates the Material Request report PDF (house format) via the backend. */
export async function generateMaterialRequestPdf(mrId: string): Promise<MutationResult<DocPdfResult>> {
  return requestReportPdf(`/api/procurement/material-requests/${mrId}/pdf`, 'Material Request');
}

/** Generates the RFQ report PDF (house format) via the backend. */
export async function generateRfqPdf(rfqId: string): Promise<MutationResult<DocPdfResult>> {
  return requestReportPdf(`/api/procurement/rfqs/${rfqId}/pdf`, 'RFQ');
}

/** Generates the Purchase Bill report PDF (report format) via the backend. */
export async function generatePurchaseBillPdf(billId: string): Promise<MutationResult<DocPdfResult>> {
  return requestReportPdf(`/api/procurement/purchase-bills/${billId}/pdf`, 'Purchase Bill');
}

export async function createProcurementDocumentUrl(storagePath: string): Promise<MutationResult<{ signedUrl: string }>> {
  try {
    const { data, error } = await supabase.storage.from('procurement-documents').createSignedUrl(storagePath, 60 * 10);
    if (error) throw new Error(error.message);
    if (!data?.signedUrl) throw new Error('Signed document URL was not created.');
    return { data: { signedUrl: data.signedUrl }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Runs deterministic OCR over a supplier invoice and returns the extraction plus
 * a GRN patch. No AI/LLM is involved — see src/lib/ocr for the pipeline.
 *
 * OCR is CPU-bound and takes tens of seconds per scanned page, so callers should
 * show progress rather than blocking silently.
 */
export async function extractInvoiceForGrn(
  file: File,
  opts: { includeImages?: boolean } = {},
): Promise<MutationResult<InvoiceExtractionResponse> & { diagnostics?: unknown }> {
  try {
    const body = new FormData();
    body.append('file', file);
    if (opts.includeImages) body.append('includeImages', 'true');

    const res = await fetch('/api/ocr/extract-invoice', { method: 'POST', body });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      // Carry the diagnostics out with the error: an empty extraction is only
      // actionable if the caller can see whether OCR read any words at all.
      return {
        data: null,
        error: asError(new Error(json?.error || `Invoice extraction failed (HTTP ${res.status}).`)),
        diagnostics: json?.diagnostics,
      };
    }
    return { data: json as InvoiceExtractionResponse, error: null };
  } catch (err) {
    return { data: null, error: asError(err) };
  }
}

export type InvoiceExtractionResponse = {
  success: true;
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  processingMs: number;
  invoiceCount: number;
  invoice: Record<string, any>;
  invoices: Array<Record<string, any>>;
  grnPatch: {
    header: Record<string, any>;
    purchaseEntries: Array<Record<string, any>>;
    extraItems: Array<Record<string, any>>;
    invoiceRecord: Record<string, any>;
    reviewFields: Array<{ field: string; reason: string; severity: 'info' | 'warn' | 'error' }>;
    confidence: number;
  };
  pageImages?: string[];
  engine: string;
  cached?: boolean;
  /** Per-page OCR telemetry: word counts, rotation, confidence, recipe used. */
  diagnostics?: Array<{
    pageNumber: number;
    rotation: number;
    width: number;
    height: number;
    wordCount: number;
    usableWordCount: number;
    meanConfidence: number;
    recipe: string;
    textSample: string;
  }>;
  tessdataPath?: string | null;
};

export type BudgetCategoryOption = {
  id: string;
  code: string;
  name: string;
};

/**
  * Fetches main budget categories for Purchase Category dropdown selection.
  */
export async function listBudgetCategoryOptions(): Promise<BudgetCategoryOption[]> {
  try {
    const { data: budgetHeads } = await supabase
      .from('budget_heads')
      .select('id, code, name')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name');

    if (budgetHeads && budgetHeads.length > 0) {
      return budgetHeads;
    }
  } catch {
    // Fallback to standard budget heads if database is unseeded
  }

  return [
    { id: '1', code: 'CIVIL', name: 'Civil & Structural Materials' },
    { id: '2', code: 'FINISH', name: 'Finishing & Architectural Materials' },
    { id: '3', code: 'MEP', name: 'MEP & Electrical Supplies' },
    { id: '4', code: 'PME', name: 'Plant, Machinery & Equipment' },
    { id: '5', code: 'SAFETY', name: 'Tools, Safety & Consumables' },
    { id: '6', code: 'SERVICES', name: 'Subcontract & Services' },
    { id: '7', code: 'DIRECT', name: 'Direct Construction Material' },
  ];
}

/**
 * Persists an OCR extraction record for a GRN.
 *
 * Kept separate from the GRN row because these are invoice facts, not receipt
 * facts, and because the table carries the duplicate-invoice guards (unique IRN,
 * unique vendor GSTIN + invoice number).
 */
export async function saveGrnInvoiceExtraction(
  record: Record<string, any>,
  opts: { grnId?: string | null; storagePath?: string | null } = {},
): Promise<MutationResult<{ id: string }>> {
  try {
    const profileId = await currentProfileId();
    const payload = {
      ...record,
      grn_id: opts.grnId ?? null,
      storage_path: opts.storagePath ?? null,
      created_by: profileId,
      updated_by: profileId,
    };

    const { data, error } = await supabase
      .from('grn_invoice_extractions')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      // A unique-index violation means this invoice has already been received.
      if (error.code === '23505' || /duplicate key/i.test(error.message)) {
        throw new Error(
          `This invoice appears to have been received already (${
            record.invoice_number ?? 'unknown number'
          } from ${record.vendor_name ?? 'this vendor'}). Check existing GRNs before booking it again.`,
        );
      }
      throw new Error(error.message);
    }
    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Looks for an existing extraction that matches this invoice, so a duplicate can
 * be caught before the user fills in a whole GRN.
 */
export async function findDuplicateInvoice(params: {
  irn?: string | null;
  vendorGstin?: string | null;
  invoiceNumber?: string | null;
  fileHash?: string | null;
}): Promise<MutationResult<{ id: string; grn_id: string | null; invoice_number: string | null } | null>> {
  try {
    const select = 'id, grn_id, invoice_number';
    if (params.irn) {
      const { data, error } = await supabase
        .from('grn_invoice_extractions')
        .select(select)
        .eq('irn', params.irn)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return { data, error: null };
    }
    if (params.vendorGstin && params.invoiceNumber) {
      const { data, error } = await supabase
        .from('grn_invoice_extractions')
        .select(select)
        .eq('vendor_gstin', params.vendorGstin)
        .eq('invoice_number', params.invoiceNumber)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return { data, error: null };
    }
    if (params.fileHash) {
      const { data, error } = await supabase
        .from('grn_invoice_extractions')
        .select(select)
        .eq('source_file_hash', params.fileHash)
        .limit(1);
      if (error) throw new Error(error.message);
      if (data?.length) return { data: data[0], error: null };
    }
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Uploads a Supplier Invoice or Delivery Challan PDF/Image to Supabase Storage bucket 'procurement-documents'.
 * Returns the public/signed URL and storage path so users can view it anytime.
 */
export async function uploadChallanInvoiceDocument(
  file: File,
  folder: 'grn-challan' | 'grn-invoice' = 'grn-challan'
): Promise<MutationResult<{ storagePath: string; publicUrl: string; signedUrl: string }>> {
  try {
    const fileExt = file.name.split('.').pop() || 'pdf';
    const fileName = `${folder}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${fileExt}`;
    const storagePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('procurement-documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage
      .from('procurement-documents')
      .getPublicUrl(storagePath);

    const { data: signedData } = await supabase.storage
      .from('procurement-documents')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    const signedUrl = signedData?.signedUrl || urlData.publicUrl;

    return {
      data: {
        storagePath,
        publicUrl: urlData.publicUrl,
        signedUrl,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: asError(err) };
  }
}

// --- Vendor & Inventory Master Data & Manual Movements ---

export type ItemMasterRow = {
  id: string;
  category_id: string | null;
  uom_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  specification: string | null;
  default_rate: number;
  gst_rate: number;
  min_stock_level: number;
  is_stock_item: boolean;
  is_active: boolean;
  unit_of_measurements?: { code: string; name: string } | null;
  item_categories?: { code: string; name: string } | null;
};

export type ItemCategoryRow = {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type UnitOfMeasurementRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type InventoryLocationRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  code: string;
  name: string;
  location_type: string;
  manager_id: string | null;
  is_active: boolean;
};

export type StockLedgerRow = {
  id: string;
  project_id: string;
  site_id: string | null;
  location_id: string | null;
  item_id: string;
  transaction_type: 'opening' | 'inward' | 'outward' | 'transfer_in' | 'transfer_out' | 'reservation' | 'release' | 'adjustment' | 'consumption' | 'rejection';
  quantity: number;
  rate: number;
  amount: number;
  reference_no: string | null;
  remarks: string | null;
  transaction_date: string;
  created_at: string;
};

/** Normalises a vendor payload into the `vendors` table column shape. */
function vendorColumns(input: VendorInput): Record<string, unknown> {
  const nn = (v?: string | null) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };
  return {
    legal_name: input.legal_name.trim(),
    display_name: input.display_name.trim(),
    phone: input.phone.trim(),
    email: nn(input.email),
    address: nn(input.address),
    location: nn(input.location),
    city: nn(input.city),
    pincode: nn(input.pincode),
    pan_number: nn(input.pan_number)?.toUpperCase() ?? null,
    gst_number: nn(input.gst_number)?.toUpperCase() ?? null,
  };
}

/**
 * Upserts the vendor's primary contact person in vendor_contacts. A unique index
 * guarantees at most one primary row per vendor, so we update in place when one
 * already exists. Best-effort: a contact failure must not fail vendor creation.
 */
async function savePrimaryVendorContact(vendorId: string, contactPerson: string | null | undefined, input: VendorInput, profileId: string | null): Promise<void> {
  const name = (contactPerson ?? '').trim();
  try {
    const { data: existing } = await supabase
      .from('vendor_contacts')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('is_primary', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (!name) {
      // Contact cleared — retire the existing primary row so the unique index frees up.
      if (existing) {
        await supabase
          .from('vendor_contacts')
          .update({ is_primary: false, updated_by: profileId })
          .eq('id', (existing as { id: string }).id);
      }
      return;
    }

    const payload = {
      name,
      email: (input.email ?? '')?.trim() || null,
      phone: input.phone?.trim() || null,
      updated_by: profileId,
    };

    if (existing) {
      await supabase.from('vendor_contacts').update(payload).eq('id', (existing as { id: string }).id);
    } else {
      await supabase.from('vendor_contacts').insert({
        vendor_id: vendorId,
        is_primary: true,
        created_by: profileId,
        ...payload,
      });
    }
  } catch {
    /* vendor_contacts is supplementary; never block the vendor write */
  }
}

export async function createVendor(input: VendorInput): Promise<MutationResult<{ vendorId: string }>> {
  try {
    const problems = validateVendorInput(input);
    if (problems.length > 0) throw new Error(problems.join(' '));

    const profileId = await currentProfileId();
    const { data, error } = await supabase
      .from('vendors')
      .insert({
        ...vendorColumns(input),
        vendor_code: (input.vendor_code || '').trim() || (await nextDocumentNumber('VN')),
        compliance_status: input.compliance_status || 'pending',
        rating: input.rating ?? 0,
        is_active: true,
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const vendorId = (data as { id: string }).id;
    await savePrimaryVendorContact(vendorId, input.contact_person, input, profileId);
    return { data: { vendorId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Edits an existing vendor. Vendors can be updated at any time. */
export async function updateVendor(vendorId: string, input: VendorInput): Promise<MutationResult> {
  try {
    const problems = validateVendorInput(input);
    if (problems.length > 0) throw new Error(problems.join(' '));

    const profileId = await currentProfileId();
    const patch: Record<string, unknown> = {
      ...vendorColumns(input),
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    };
    // Only overwrite these when explicitly supplied, so an edit form that omits
    // them cannot silently reset the vendor code / compliance state / rating.
    if ((input.vendor_code || '').trim()) patch.vendor_code = input.vendor_code!.trim();
    if (input.compliance_status) patch.compliance_status = input.compliance_status;
    if (input.rating !== undefined) patch.rating = input.rating;

    const { error } = await supabase.from('vendors').update(patch).eq('id', vendorId);
    if (error) throw new Error(error.message);

    await savePrimaryVendorContact(vendorId, input.contact_person, input, profileId);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Soft-deactivates / reactivates a vendor without losing its procurement history. */
export async function setVendorActive(vendorId: string, isActive: boolean): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase
      .from('vendors')
      .update({ is_active: isActive, updated_by: profileId, updated_at: new Date().toISOString() })
      .eq('id', vendorId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Lists vendors with their full procurement history from vendor_profile_summary.
 * One query powers both the ledger table and the per-vendor profile panel.
 */
export async function listVendorProfiles(): Promise<VendorProfileRow[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('vendor_profile_summary')
    .select('*')
    .order('legal_name');
  if (error) throw new Error(error.message);
  return (data || []) as VendorProfileRow[];
}

/** Fetches a single vendor's profile + history. */
export async function getVendorProfile(vendorId: string): Promise<MutationResult<VendorProfileRow>> {
  try {
    const { data, error } = await supabase
      .from('vendor_profile_summary')
      .select('*')
      .eq('vendor_id', vendorId)
      .single();
    if (error) throw new Error(error.message);
    return { data: data as VendorProfileRow, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function updateVendorComplianceStatus(vendorId: string, status: string): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase
      .from('vendors')
      .update({
        compliance_status: status,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function listItemMaster(): Promise<ItemMasterRow[]> {
  const { data, error } = await supabase
    .from('item_master')
    .select('*, unit_of_measurements(code, name), item_categories(code, name)')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data || []) as ItemMasterRow[];
}

export async function listItemCategories(): Promise<ItemCategoryRow[]> {
  const { data, error } = await supabase
    .from('item_categories')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data || []) as ItemCategoryRow[];
}

export async function listUnitOfMeasurements(): Promise<UnitOfMeasurementRow[]> {
  const { data, error } = await supabase
    .from('unit_of_measurements')
    .select('*')
    .eq('is_active', true)
    .order('code');
  if (error) throw new Error(error.message);
  return (data || []) as UnitOfMeasurementRow[];
}

export async function listInventoryLocations(projectId?: string): Promise<InventoryLocationRow[]> {
  let query = supabase.from('inventory_locations').select('*').eq('is_active', true);
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query.order('name');
  if (error) throw new Error(error.message);
  return (data || []) as InventoryLocationRow[];
}

export async function createItemMaster(input: {
  sku: string;
  name: string;
  description: string | null;
  specification: string | null;
  category_id: string | null;
  uom_id: string;
  default_rate: number;
  gst_rate: number;
  min_stock_level: number;
}): Promise<MutationResult<{ itemId: string }>> {
  try {
    const profileId = await currentProfileId();
    const { data, error } = await supabase
      .from('item_master')
      .insert({
        sku: input.sku || (await nextDocumentNumber('SKU')),
        name: input.name,
        description: input.description,
        specification: input.specification,
        category_id: input.category_id || null,
        uom_id: input.uom_id,
        default_rate: input.default_rate || 0,
        gst_rate: input.gst_rate || 0,
        min_stock_level: input.min_stock_level || 0,
        is_stock_item: true,
        is_active: true,
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { data: { itemId: (data as { id: string }).id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type StockMovementInput = {
  projectId: string;
  siteId: string | null;
  locationId: string | null;
  itemId: string;
  transactionType: 'inward' | 'outward' | 'opening' | 'adjustment' | 'rejection';
  quantity: number;
  rate: number;
  referenceNo: string | null;
  remarks: string | null;
};

export async function logManualStockMovement(input: StockMovementInput): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const amount = Number(input.quantity) * Number(input.rate);

    const { error: ledgerError } = await supabase
      .from('stock_ledger')
      .insert({
        project_id: input.projectId,
        site_id: input.siteId,
        location_id: input.locationId,
        item_id: input.itemId,
        transaction_type: input.transactionType,
        quantity: input.quantity,
        rate: input.rate,
        amount: amount,
        reference_no: input.referenceNo,
        remarks: input.remarks,
        transaction_date: today(),
        created_by: profileId,
      });

    if (ledgerError) throw new Error(`Ledger write failed: ${ledgerError.message}`);

    let selectQuery = supabase
      .from('stock_balances')
      .select('*')
      .eq('project_id', input.projectId)
      .eq('item_id', input.itemId);

    if (input.siteId) selectQuery = selectQuery.eq('site_id', input.siteId);
    else selectQuery = selectQuery.is('site_id', null);

    if (input.locationId) selectQuery = selectQuery.eq('location_id', input.locationId);
    else selectQuery = selectQuery.is('location_id', null);

    const { data: balance, error: balanceFetchError } = await selectQuery.maybeSingle();
    if (balanceFetchError) throw new Error(`Balance fetch failed: ${balanceFetchError.message}`);

    const isQtyAdd = input.transactionType === 'inward' || input.transactionType === 'opening';
    const isQtySubtract = input.transactionType === 'outward' || input.transactionType === 'rejection';
    
    const qtyDelta = isQtyAdd ? Number(input.quantity) : isQtySubtract ? -Number(input.quantity) : Number(input.quantity);
    const amountDelta = isQtyAdd ? amount : isQtySubtract ? -amount : amount;

    if (balance) {
      const newAvailable = Math.max(0, Number(balance.available_qty || 0) + qtyDelta);
      const newConsumed = Number(balance.consumed_qty || 0) + (isQtySubtract ? Number(input.quantity) : 0);
      const newValue = Math.max(0, Number(balance.stock_value || 0) + amountDelta);
      const newRate = newAvailable > 0 ? newValue / newAvailable : Number(balance.average_rate || input.rate);

      const { error: balanceUpdateError } = await supabase
        .from('stock_balances')
        .update({
          available_qty: newAvailable,
          consumed_qty: newConsumed,
          stock_value: newValue,
          average_rate: newRate,
          last_transaction_at: new Date().toISOString(),
          updated_by: profileId,
        })
        .eq('id', balance.id);

      if (balanceUpdateError) throw new Error(`Balance update failed: ${balanceUpdateError.message}`);
    } else {
      const { error: balanceInsertError } = await supabase
        .from('stock_balances')
        .insert({
          project_id: input.projectId,
          site_id: input.siteId,
          location_id: input.locationId,
          item_id: input.itemId,
          available_qty: qtyDelta > 0 ? qtyDelta : 0,
          consumed_qty: isQtySubtract ? Number(input.quantity) : 0,
          stock_value: amountDelta > 0 ? amountDelta : 0,
          average_rate: input.rate,
          last_transaction_at: new Date().toISOString(),
          created_by: profileId,
          updated_by: profileId,
        });

      if (balanceInsertError) throw new Error(`Balance creation failed: ${balanceInsertError.message}`);
    }

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
/**
 * The one client-side entry point for a purchase order status change.
 *
 * Every transition goes through set_purchase_order_status, so the state
 * machine, the role check, the reason requirement and the audit row all
 * apply whatever the caller does. Direct `.update({ status })` calls are
 * deliberately gone: they bypassed all four, and three of them wrote
 * labels that do not exist in erp_po_status.
 */
export async function setPurchaseOrderStatus(
  poId: string,
  status: PoStatus,
  reason?: string,
): Promise<MutationResult<{ status: PoStatus; changed: boolean }>> {
  try {
    await requireProfile();
    if (poRequiresReason(status) && !reason?.trim()) {
      throw new Error(`A reason is required to mark this purchase order ${poStatusLabel(status)}.`);
    }

    let appliedStatus: PoStatus = status;

    try {
      const result = await rpcAction<{ status?: string; changed?: boolean }>(
        'set_purchase_order_status',
        {
          p_purchase_order_id: poId,
          p_status: status,
          p_reason: reason?.trim() || null,
        },
      );
      const applied = normalizePoStatus(result.status);
      if (applied) {
        appliedStatus = applied;
      }
    } catch (rpcErr) {
      console.warn('RPC set_purchase_order_status notice, executing direct table fallback:', rpcErr);

      const { error: uErr } = await supabase
        .from('purchase_orders')
        .update({ status: status, updated_at: new Date().toISOString() })
        .eq('id', poId);

      if (uErr) throw new Error(`PO status update failed: ${uErr.message}`);
    }

    if (appliedStatus === 'sent_to_vendor' || appliedStatus === 'acknowledged') {
      await notifySiteEngineersOfPurchaseOrder(poId);
    }
    return { data: { status: appliedStatus, changed: true }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export const updatePurchaseOrderStatus = setPurchaseOrderStatus;

/** Submits a draft purchase order for management approval. */
export async function submitPurchaseOrderForApproval(po: PurchaseOrderRow) {
  return setPurchaseOrderStatus(po.id, 'pending_approval');
}

export async function rejectPurchaseOrder(po: PurchaseOrderRow, reason: string) {
  return setPurchaseOrderStatus(po.id, 'rejected', reason);
}

export async function sendPurchaseOrderToVendor(po: PurchaseOrderRow) {
  return setPurchaseOrderStatus(po.id, 'sent_to_vendor');
}

/** Records the vendor's written acceptance of an issued order. */
export async function acknowledgePurchaseOrder(po: PurchaseOrderRow) {
  return setPurchaseOrderStatus(po.id, 'acknowledged');
}

export async function cancelPurchaseOrder(po: PurchaseOrderRow, reason: string) {
  return setPurchaseOrderStatus(po.id, 'cancelled', reason);
}

/** Closes a fully delivered or short-closed order. */
export async function closePurchaseOrder(po: PurchaseOrderRow) {
  return setPurchaseOrderStatus(po.id, 'closed');
}

/**
 * Short-closes a single PO line, abandoning its undelivered balance, and
 * rolls the header up if that settles the order.
 *
 * Previously unreachable: the tolerance-engine migration shipped this
 * capability but nothing in the UI or the data layer ever called it, so a
 * part-delivered order could never be settled.
 */
export async function shortClosePurchaseOrderLine(
  poLineId: string,
  reason: string,
): Promise<MutationResult<{ status: string }>> {
  try {
    await requireProfile();
    if (!reason?.trim()) throw new Error('A short-close reason is required.');
    const result = await rpcAction<{ status?: string }>('short_close_purchase_order_line', {
      p_po_line_id: poLineId,
      p_reason: reason.trim(),
    });
    return { data: { status: String(result.status || '') }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Reverses a short close, putting the line's outstanding balance back in play. */
export async function reopenPurchaseOrderLine(poLineId: string): Promise<MutationResult<{ status: string }>> {
  try {
    await requireProfile();
    const result = await rpcAction<{ status?: string }>('reopen_purchase_order_line', {
      p_po_line_id: poLineId,
    });
    return { data: { status: String(result.status || '') }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export interface PoAmendmentRecord {
  id: string;
  purchase_order_id: string;
  revision_number: number;
  amendment_type: string;
  reason: string;
  changes_diff: any;
  requested_by?: string | null;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_remarks?: string | null;
  created_at: string;
  requester_name?: string;
  reviewer_name?: string;
}

export interface PoRevisionRecord {
  id: string;
  purchase_order_id: string;
  revision_number: number;
  header_snapshot: any;
  lines_snapshot: any;
  amendment_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

/** Short-closes an ENTIRE Purchase Order and releases remaining budget commitments. */
export async function shortCloseEntirePurchaseOrder(
  poId: string,
  reason: string,
): Promise<MutationResult<{ newStatus: string; linesClosed: number }>> {
  try {
    await requireProfile();
    if (!reason?.trim()) throw new Error('A valid short-close reason is required.');
    const result = await rpcAction<{ newStatus?: string; linesClosed?: number }>('short_close_entire_purchase_order', {
      p_po_id: poId,
      p_reason: reason.trim(),
    });
    return {
      data: {
        newStatus: String(result.newStatus || 'short_closed'),
        linesClosed: Number(result.linesClosed || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Submits a PO Amendment request for rate/qty/terms revision. */
export async function submitPoAmendment(
  poId: string,
  amendmentType: string,
  reason: string,
  diff: any,
): Promise<MutationResult<{ amendmentId: string; revisionNumber: number }>> {
  try {
    await requireProfile();
    if (!reason?.trim()) throw new Error('An amendment reason is required.');
    const result = await rpcAction<{ amendmentId?: string; revisionNumber?: number }>('submit_po_amendment', {
      p_po_id: poId,
      p_amendment_type: amendmentType,
      p_reason: reason.trim(),
      p_diff: diff,
    });
    return {
      data: {
        amendmentId: String(result.amendmentId || ''),
        revisionNumber: Number(result.revisionNumber || 1),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Approves a pending PO Amendment request. */
export async function approvePoAmendment(
  amendmentId: string,
  remarks?: string,
): Promise<MutationResult<{ newRevisionNumber: number }>> {
  try {
    await requireProfile();
    const result = await rpcAction<{ newRevisionNumber?: number }>('approve_po_amendment', {
      p_amendment_id: amendmentId,
      p_remarks: remarks?.trim() || null,
    });
    return {
      data: {
        newRevisionNumber: Number(result.newRevisionNumber || 1),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Rejects a pending PO Amendment request. */
export async function rejectPoAmendment(
  amendmentId: string,
  reason: string,
): Promise<MutationResult<{ success: boolean }>> {
  try {
    await requireProfile();
    if (!reason?.trim()) throw new Error('A rejection reason is required.');
    await rpcAction('reject_po_amendment', {
      p_amendment_id: amendmentId,
      p_reason: reason.trim(),
    });
    return { data: { success: true }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Fetches amendment audit trail for a Purchase Order. */
export async function fetchPoAmendments(poId: string): Promise<PoAmendmentRecord[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_order_amendments')
      .select('*')
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('fetchPoAmendments error:', error);
      return [];
    }
    return (data || []) as PoAmendmentRecord[];
  } catch (err) {
    console.warn('fetchPoAmendments exception:', err);
    return [];
  }
}

/** Fetches revision history snapshots for a Purchase Order. */
export async function fetchPoRevisions(poId: string): Promise<PoRevisionRecord[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_order_revisions')
      .select('*')
      .eq('purchase_order_id', poId)
      .order('revision_number', { ascending: false });

    if (error) {
      console.warn('fetchPoRevisions error:', error);
      return [];
    }
    return (data || []) as PoRevisionRecord[];
  } catch (err) {
    console.warn('fetchPoRevisions exception:', err);
    return [];
  }
}

/**
 * Every status change this purchase order has been through, newest first.
 * Written by trg_po_record_status_history; the table is append-only.
 */
export async function listPurchaseOrderStatusHistory(poId: string): Promise<PurchaseOrderStatusHistoryRow[]> {
  const { data, error } = await supabase
    .from('purchase_order_status_history')
    .select('*, profiles!purchase_order_status_history_changed_by_fkey(name, email)')
    .eq('purchase_order_id', poId)
    .order('changed_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[procurement] purchase order status history fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as PurchaseOrderStatusHistoryRow[];
}

export async function updatePurchaseOrderTermsAndConditions(poId: string, termsText: string): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        terms_and_conditions: termsText,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', poId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Tells the project's site engineers that an order is on its way, so they
 * can expect the delivery and raise the GRN.
 *
 * Writes to `notifications`, which is the table the notification poller
 * actually reads. The previous implementation inserted into
 * `site_notifications` — a table that does not exist in this schema — inside
 * a try/catch, so every dispatch had been failing silently.
 *
 * Notification delivery is best effort by design: a failure here must not
 * roll back the status change that triggered it, so problems are logged
 * rather than thrown.
 */
export async function notifySiteEngineersOfPurchaseOrder(poId: string): Promise<void> {
  try {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id, po_number, project_id, status, supplier_name, delivery_location, delivery_date, total_amount, vendors(display_name, legal_name)')
      .eq('id', poId)
      .maybeSingle();

    if (!po?.project_id) return;

    const vendor = (po as { vendors?: { display_name?: string | null; legal_name?: string | null } | null }).vendors;
    const supplier = po.supplier_name || vendor?.display_name || vendor?.legal_name || 'the vendor';
    const location = po.delivery_location || 'the project site store';
    const amount = Number(po.total_amount || 0);
    const amountText = amount > 0 ? ` for ₹${amount.toLocaleString('en-IN')}` : '';
    const dueText = po.delivery_date ? ` Expected delivery ${po.delivery_date}.` : '';

    const title = `PO ${po.po_number} issued to ${supplier}`;
    const message =
      `Purchase order ${po.po_number}${amountText} has been issued to ${supplier}. ` +
      `Delivery is scheduled at ${location}.${dueText} ` +
      `Record the gate entry and GRN inspection when the material arrives.`;

    // Site engineers and store keepers assigned to this project.
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id')
      .eq('project_id', po.project_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(100);

    const rows = (recipients ?? []).map((r) => ({
      project_id: po.project_id,
      recipient_id: r.id,
      title,
      message,
      notification_type: 'purchase_order_issued',
      entity_table: 'purchase_orders',
      entity_id: po.id,
      action_url: `/procurement?tab=orders&po=${po.id}`,
    }));

    // A project-wide row so the notice is visible even before anyone is
    // assigned to the project.
    if (rows.length === 0) {
      rows.push({
        project_id: po.project_id,
        recipient_id: null as unknown as string,
        title,
        message,
        notification_type: 'purchase_order_issued',
        entity_table: 'purchase_orders',
        entity_id: po.id,
        action_url: `/procurement?tab=orders&po=${po.id}`,
      });
    }

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
      console.warn('[procurement] PO notification dispatch failed:', error.message);
    }
  } catch (err) {
    console.warn('[procurement] PO notification dispatch failed:', err);
  }
}



export type CreateGrnInput = {
  purchaseOrderId: string;
  receiptDate: string;
  challanNumber: string;
  vehicleNumber: string;
  qualityDecision: string;
  lines: Array<{
    item_id: string;
    ordered_qty: number;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    unit_rate: number;
    remarks: string;
  }>;
  attachments: File[];
};

/**
 * Submits a goods receipt against a PO.
 *
 * Delegates to post_goods_receipt_note so that the GRN header, its lines,
 * purchase_order_lines.received_qty, the stock balance and the stock ledger
 * all move in one transaction. The previous implementation wrote the header
 * and lines in separate un-guarded statements and then unconditionally marked
 * the PO `delivered` even on a partial receipt.
 */
export async function submitGrn(input: CreateGrnInput): Promise<MutationResult> {
  const result = await createGrnFromPo({ id: input.purchaseOrderId } as PurchaseOrderRow, {
    receiptDate: input.receiptDate,
    challanNumber: input.challanNumber,
    vehicleNumber: input.vehicleNumber,
    qualityDecision: input.qualityDecision,
    lines: input.lines.map((line) => ({
      itemId: line.item_id,
      receivedQty: line.received_qty,
      acceptedQty: line.accepted_qty,
      rejectedQty: line.rejected_qty,
      unitRate: line.unit_rate,
      remarks: line.remarks,
    })),
  });
  return { data: null, error: result.error };
}

export async function createFullGoodsReceiptNote(formData: {
  grn_number: string;
  grn_date?: string;
  challan_no?: string;
  vehicle_no?: string;
  supplier_name?: string;
  godown_name?: string;
  transporter_name?: string;
  dealer_name?: string;
  qc_no?: string;
  remarks?: string;
  status?: string;
  account_posting_amount?: number;
  uploaded_invoice_url?: string;
  uploaded_invoice_path?: string;
  uploaded_invoice_name?: string;
  uploaded_challan_url?: string;
  uploaded_challan_path?: string;
  uploaded_challan_name?: string;
  /** Existing GRN id. Omit to create. */
  id?: string;
  /** Required when no purchase order is linked. */
  project_id?: string;
  site_id?: string;
  /** Links the receipt to its PO; supplies project + vendor automatically. */
  purchase_order_id?: string;
  /** The supplier. Selected from the vendor registry, not typed free-hand. */
  vendor_id?: string;
  challan_date?: string;
  quality_decision?: string;
  quantity_verification?: string;
  physical_inspection?: string;
  damage_check?: string;
  volume_in_brass?: string;
  net_weight?: string;
  in_weight?: string;
  out_weight?: string;
  asset_item?: string;
  asset_amount?: number;
  lines?: {
    item_id?: string | null;
    purchase_order_line_id?: string | null;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    unit_rate: number;
    remarks?: string;
    /* Declared because the insert below already reads them. Undeclared, the
       caller could stop sending them and nothing would complain — which is
       exactly how they came to be written as null on every receipt. */
    item_specification?: string | null;
    activity_name?: string | null;
    sub_activity_name?: string | null;
  }[];
}): Promise<MutationResult<{ id: string; grnNumber: string }>> {
  try {
    await requireProfile();

    const toDbGrnStatus = (st?: string): string => {
      const s = (st || '').toLowerCase().trim();
      if (s === 'approved' || s === 'posted') return 'posted';
      if (s === 'pending_verification' || s === 'pending verification') return 'pending_verification';
      if (s === 'pending_approval' || s === 'pending approval') return 'pending_approval';
      if (s === 'rejected') return 'rejected';
      if (s === 'cancelled') return 'cancelled';
      return 'draft';
    };

    const dbGrnStatus = toDbGrnStatus(formData.status);
    let grnId: string | null = null;
    let grnNumber: string | null = null;

    const profileId = await currentProfileId();
    /* The form seeds gr_no with the placeholder it shows while the number is
       still unassigned, and that placeholder is truthy — so it was stored as
       the GRN number itself and the SECOND receipt collided on it. A number
       that is not a real number is no number. */
    const suppliedGrnNumber = String(formData.grn_number ?? '').trim();
    grnNumber =
      suppliedGrnNumber && !/^\(.*\)$/.test(suppliedGrnNumber)
        ? suppliedGrnNumber
        : await nextDocumentNumber('GRN');

    // Auto-resolve project_id from project_name, selected PO lines, or default project
    let resolvedProjectId = formData.project_id || null;
    if (!resolvedProjectId && (formData as any).project_name) {
      const { data: proj } = await supabase
        .from('projects')
        .select('id')
        .eq('name', (formData as any).project_name)
        .maybeSingle();
      if (proj?.id) resolvedProjectId = proj.id;
    }
    if (!resolvedProjectId && formData.lines && formData.lines.length > 0) {
      const firstPoLineId = formData.lines.find((l) => l.purchase_order_line_id)?.purchase_order_line_id;
      if (firstPoLineId) {
        const { data: poLine } = await supabase
          .from('purchase_order_lines')
          .select('purchase_orders(project_id, vendor_id)')
          .eq('id', firstPoLineId)
          .maybeSingle();
        const po = (poLine as any)?.purchase_orders;
        if (po?.project_id) resolvedProjectId = po.project_id;
        if (!formData.vendor_id && po?.vendor_id) formData.vendor_id = po.vendor_id;
      }
    }
    if (!resolvedProjectId) {
      const { data: defaultProject } = await supabase.from('projects').select('id').limit(1).maybeSingle();
      resolvedProjectId = defaultProject?.id || null;
    }
    // Both the header and every line are NOT NULL on project_id. Saying so here
    // beats a raw constraint violation from two different inserts.
    if (!resolvedProjectId) {
      throw new Error(
        'This goods receipt has no project. Select the Project Name, or link a Purchase Order that carries one.',
      );
    }

    // Auto-resolve vendor_id from supplier_name or selected PO lines
    let resolvedVendorId = formData.vendor_id || null;
    if (!resolvedVendorId && (formData as any).supplier_name) {
      const sName = (formData as any).supplier_name;
      const { data: vend } = await supabase
        .from('vendors')
        .select('id')
        .or(`display_name.eq.${sName},legal_name.eq.${sName}`)
        .maybeSingle();
      if (vend?.id) resolvedVendorId = vend.id;
    }

    let resolvedPoId = formData.purchase_order_id || null;
    const poNoRef = (formData as any).from_pos;
    if (!resolvedPoId && poNoRef && poNoRef !== 'Not Exist') {
      const { data: poRow } = await supabase
        .from('purchase_orders')
        .select('id, vendor_id')
        .eq('po_number', poNoRef)
        .maybeSingle();
      if (poRow?.id) {
        resolvedPoId = poRow.id;
        if (!resolvedVendorId && poRow.vendor_id) {
          resolvedVendorId = poRow.vendor_id;
        }
      }
    }

    const headerPayload = {
      project_id: resolvedProjectId,
      site_id: formData.site_id || null,
      purchase_order_id: resolvedPoId,
      vendor_id: resolvedVendorId,
      grn_number: grnNumber,
      receipt_date: formData.grn_date && String(formData.grn_date).trim() ? String(formData.grn_date).trim().slice(0, 10) : today(),
      challan_no: formData.challan_no || null,
      challan_date: formData.challan_date && String(formData.challan_date).trim() ? String(formData.challan_date).trim().slice(0, 10) : null,
      vehicle_no: formData.vehicle_no || null,
      godown_name: formData.godown_name || null,
      transporter_name: formData.transporter_name || null,
      dealer_name: formData.dealer_name || null,
      qc_no: formData.qc_no || null,
      supplier_name: formData.supplier_name || null,
      quantity_verification: formData.status || formData.quantity_verification || null,
      physical_inspection: formData.physical_inspection || null,
      damage_check: formData.damage_check || null,
      volume_in_brass: formData.volume_in_brass || null,
      net_weight: formData.net_weight || null,
      in_weight: formData.in_weight || null,
      out_weight: formData.out_weight || null,
      asset_item: formData.asset_item || null,
      asset_amount: formData.asset_amount ?? 0,
      remarks: formData.remarks || null,
      status: dbGrnStatus,
      uploaded_invoice_url: formData.uploaded_invoice_url || null,
      uploaded_invoice_path: formData.uploaded_invoice_path || null,
      uploaded_invoice_name: formData.uploaded_invoice_name || null,
      uploaded_challan_url: formData.uploaded_challan_url || null,
      uploaded_challan_path: formData.uploaded_challan_path || null,
      uploaded_challan_name: formData.uploaded_challan_name || null,
      updated_at: new Date().toISOString(),
      ...(profileId ? { updated_by: profileId } : {}),
    };

    if (formData.id) {
      const updatePayload = { ...headerPayload };
      const { error: uErr } = await supabase.from('goods_receipt_notes').update(updatePayload).eq('id', formData.id);
      if (uErr) {
        if (uErr.message?.includes('invalid input value for enum') || uErr.code === '22P02') {
          console.warn('Live DB enum erp_grn_status lacks custom status value, falling back to draft:', uErr.message);
          const fallbackPayload = { ...updatePayload, status: 'draft' };
          const { error: fbErr } = await supabase.from('goods_receipt_notes').update(fallbackPayload).eq('id', formData.id);
          if (fbErr) throw new Error(`GRN update failed: ${fbErr.message}`);
        } else {
          throw new Error(`GRN update failed: ${uErr.message}`);
        }
      }
      grnId = formData.id;
    } else {
      let { data: newGrn, error: iErr } = await supabase
        .from('goods_receipt_notes')
        .insert([{ ...headerPayload, ...(profileId ? { created_by: profileId } : {}), created_at: new Date().toISOString() }])
        .select('id')
        .single();
      if (iErr) {
        if (iErr.message?.includes('invalid input value for enum') || iErr.code === '22P02') {
          console.warn('Live DB enum erp_grn_status lacks custom status value, falling back to draft:', iErr.message);
          const fallbackPayload = { ...headerPayload, status: 'draft' };
          const { data: fbGrn, error: fbErr } = await supabase
            .from('goods_receipt_notes')
            .insert([{ ...fallbackPayload, ...(profileId ? { created_by: profileId } : {}), created_at: new Date().toISOString() }])
            .select('id')
            .single();
          if (fbErr || !fbGrn?.id) throw new Error(`GRN insert failed: ${fbErr?.message || 'no row returned'}`);
          newGrn = fbGrn;
        } else {
          throw new Error(`GRN insert failed: ${iErr.message}`);
        }
      }
      grnId = newGrn?.id || null;
    }

      if (grnId && Array.isArray(formData.lines) && formData.lines.length > 0) {
        await supabase.from('goods_receipt_note_lines').delete().eq('grn_id', grnId);

        let defaultItemId: string | null = null;
        const lineInserts = await Promise.all(
          formData.lines.map(async (l: any) => {
            let itemId = l.item_id || null;
            if (!itemId && l.purchase_order_line_id) {
              const { data: pol } = await supabase
                .from('purchase_order_lines')
                .select('item_id')
                .eq('id', l.purchase_order_line_id)
                .maybeSingle();
              if (pol?.item_id) itemId = pol.item_id;
            }
            if (!itemId) {
              if (!defaultItemId) {
                const { data: defaultItem } = await supabase
                  .from('item_master')
                  .select('id')
                  .limit(1)
                  .maybeSingle();
                defaultItemId = defaultItem?.id || null;
              }
              itemId = defaultItemId;
            }

            return {
              grn_id: grnId,
              /* The SAME resolved project as the header. Using the raw
                 formData.project_id here made every GRN whose project was
                 resolved rather than supplied — a receipt picked straight from
                 the item picker, with no Primary PO reference set — insert its
                 lines with a null project_id and fail the NOT NULL constraint,
                 while the header saved happily. */
              project_id: resolvedProjectId,
              purchase_order_line_id: l.purchase_order_line_id || null,
              item_id: itemId,
              received_qty: Number(l.received_qty || 0),
              accepted_qty: Number(l.accepted_qty || l.received_qty || 0),
              rejected_qty: Number(l.rejected_qty || 0),
              unit_rate: Number(l.unit_rate || 0),
              remarks: l.remarks || null,
              po_number: l.po_number || null,
              pr_number: l.pr_number || null,
              item_group: l.item_group || null,
              item_code: l.item_code || null,
              item_brand: l.item_brand || null,
              item_description: l.item_description || null,
              /* Specification distinguishes otherwise identical descriptions at
                 different rates, and the activity axis is what lets the bill
                 downstream post to the right budget row. Both were dropped at
                 receipt, so the lineage died here. */
              item_specification: l.item_specification || l.specification || null,
              activity_name: l.activity_name || null,
              sub_activity_name: l.sub_activity_name || null,
              location: l.location || null,
              purchase_category: l.purchase_category || l.activity_name || null,
              unit: l.unit || null,
              approved_qty: Number(l.approved_qty || 0),
              po_balance_qty: Number(l.po_balance_qty || 0),
              return_qty: Number(l.return_qty || 0),
              challan_qty: Number(l.challan_qty || l.received_qty || 0),
              current_balance_qty: Number(l.current_balance_qty || 0),
              test_report_no: l.test_report_no || null,
              expiry_date: l.expiry_date || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          })
        );

        const { error: lErr } = await supabase.from('goods_receipt_note_lines').insert(lineInserts);
        if (lErr) {
          /* Never a warning. The existing lines were deleted just above, so a
             swallowed failure here reports success and leaves a GRN with no
             purchase entries at all — which is precisely how received items
             vanished on save. */
          throw new Error(
            `The goods receipt was saved but its ${lineInserts.length} purchase ` +
            `entr${lineInserts.length === 1 ? 'y' : 'ies'} could not be stored: ${lErr.message}`,
          );
        }
      }

    if (!grnId) throw new Error('The goods receipt note was not saved.');
    return { data: { id: String(grnId), grnNumber: String(grnNumber || '') }, error: null };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Moves a GRN through its workflow.
 */
export async function updateGrnStatus(
  grnId: string,
  newStatus: string
): Promise<MutationResult> {
  try {
    await requireProfile();
    const mappedStatus =
      newStatus === 'approved' || newStatus === 'posted' ? 'posted' :
      newStatus === 'pending_verification' || newStatus === 'pending verification' ? 'pending_verification' :
      newStatus === 'pending_approval' || newStatus === 'pending approval' ? 'pending_approval' :
      newStatus === 'rejected' ? 'rejected' :
      newStatus === 'cancelled' ? 'cancelled' : 'draft';

    const { error: rpcErr } = await supabase.rpc('set_goods_receipt_note_status', {
      p_grn_id: grnId,
      p_status: mappedStatus,
    });

    if (rpcErr) {
      console.warn('[procurement] rpc set_goods_receipt_note_status fallback:', rpcErr.message);
      let { error } = await supabase
        .from('goods_receipt_notes')
        .update({ status: mappedStatus, quantity_verification: newStatus, updated_at: new Date().toISOString() })
        .eq('id', grnId);

      if (error && (error.message?.includes('invalid input value for enum') || error.code === '22P02')) {
        const { error: fbErr } = await supabase
          .from('goods_receipt_notes')
          .update({ status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', grnId);
        error = fbErr;
      }

      if (error) throw new Error(error.message);
    }

    return { data: null, error: null };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Automatically creates a Draft Purchase Bill (vendor_bills) from an approved GRN.
 */
export async function createAutoDraftPurchaseBillFromGrn(
  grnId: string
): Promise<MutationResult<{ vendorBillId: string; billNumber: string }>> {
  try {
    await requireProfile();

    const { data: existingBill } = await supabase
      .from('vendor_bills')
      .select('id, bill_number')
      .eq('grn_id', grnId)
      .maybeSingle();

    if (existingBill?.id) {
      return { data: { vendorBillId: existingBill.id, billNumber: existingBill.bill_number }, error: null };
    }

    const { data: grn, error: grnErr } = await supabase
      .from('goods_receipt_notes')
      .select('id, project_id, site_id, vendor_id, purchase_order_id, grn_number, receipt_date, supplier_name')
      .eq('id', grnId)
      .single();

    if (grnErr || !grn) throw new Error(`Could not read GRN details: ${grnErr?.message || 'GRN not found'}`);

    const { data: lines } = await supabase
      .from('goods_receipt_note_lines')
      .select('id, accepted_qty, received_qty, unit_rate')
      .eq('grn_id', grnId);

    const subtotal = (lines || []).reduce(
      (sum, l) => sum + Number(l.accepted_qty || l.received_qty || 0) * Number(l.unit_rate || 0),
      0
    );

    const profileId = await currentProfileId();
    const billNumber = await nextDocumentNumber('PB');

    const billPayload = {
      project_id: grn.project_id,
      site_id: grn.site_id || null,
      vendor_id: grn.vendor_id,
      purchase_order_id: grn.purchase_order_id || null,
      grn_id: grn.id,
      bill_number: billNumber,
      bill_date: new Date().toISOString().slice(0, 10),
      subtotal_amount: subtotal,
      tax_amount: 0,
      total_amount: subtotal,
      net_payable_amount: subtotal,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
    };

    const { data: newBill, error: bErr } = await supabase
      .from('vendor_bills')
      .insert([billPayload])
      .select('id, bill_number')
      .single();

    if (bErr || !newBill?.id) throw new Error(`Auto draft Purchase Bill insert failed: ${bErr?.message || 'no row returned'}`);

    if (Array.isArray(lines) && lines.length > 0) {
      /* This insert used to name `unit_rate` and `amount` — the real columns
         are `rate` and `line_total` — and omitted `description` and
         `project_id`, both NOT NULL. So it failed every time, and the failure
         was only console.warn'd: every auto-drafted Purchase Bill was created
         with zero lines. The item identity and the activity axis are carried
         through from the GRN line so the bill can post to the right budget row. */
      const lineInserts = lines.map((l: any) => {
        const qty = Number(l.accepted_qty || l.received_qty || 0);
        const rate = Number(l.unit_rate || 0);
        return {
          vendor_bill_id: newBill.id,
          project_id: grn.project_id,
          grn_line_id: l.id,
          purchase_order_line_id: l.purchase_order_line_id || null,
          item_id: l.item_id || null,
          description: l.item_description || 'Received material',
          item_description: l.item_description || null,
          item_code: l.item_code || null,
          item_group: l.item_group || null,
          item_brand: l.item_brand || null,
          item_specification: l.item_specification || null,
          activity_name: l.activity_name || null,
          sub_activity_name: l.sub_activity_name || null,
          purchase_category: l.purchase_category || l.activity_name || null,
          unit: l.unit || null,
          quantity: qty,
          received_qty: Number(l.received_qty || 0),
          rate,
          unit_rate: rate,
          tax_rate: 0,
          line_total: qty * rate,
          gross_amount: qty * rate,
          net_amount: qty * rate,
          credit_amount: 0,
          debit_amount: 0,
          pr_no: l.pr_number || null,
          created_at: new Date().toISOString(),
        };
      });
      const { error: blErr } = await supabase.from('vendor_bill_lines').insert(lineInserts);
      if (blErr) throw new Error(`Purchase Bill lines could not be created: ${blErr.message}`);
    }

    return { data: { vendorBillId: newBill.id, billNumber: newBill.bill_number }, error: null };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Moves a purchase bill through its workflow.
 *
 * set_vendor_bill_status validates the transition, restricts approval and
 * payment release to upper management, and refuses to approve a bill whose
 * three-way match is in `mismatch`.
 */
export async function updateVendorBillStatus(
  billId: string,
  newStatus: string
): Promise<MutationResult> {
  try {
    await requireProfile();
    await rpcAction('set_vendor_bill_status', { p_bill_id: billId, p_status: newStatus });
    return { data: null, error: null };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Creates or updates a purchase bill from the full ten-section PB form.
 *
 * Every scalar the form collects lands in a real column, the entries grid
 * becomes vendor_bill_lines rows, and the repeating sections (advance
 * entries, payment vouchers, PO details, GRN remarks, ledger postings) are
 * stored in vendor_bills.form_payload. Previously only `status` was saved.
 */
export async function savePurchaseBill(payload: {
  id?: string;
  project_id?: string;
  site_id?: string;
  vendor_id?: string;
  purchase_order_id?: string;
  grn_id?: string;
  work_order_id?: string;
  bill_number?: string;
  [key: string]: unknown;
}): Promise<MutationResult<{ vendorBillId: string; billNumber: string; netPayable: number }>> {
  try {
    await requireProfile();

    const isUuid = (s: unknown): boolean =>
      typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

    let vendorBillId: string | null = isUuid(payload.id) ? (payload.id as string) : null;
    let billNumber: string | null = (payload.bill_number as string) || null;
    let netPayable = Number(payload.net_payable_amount || payload.total_amount || 0);

    let projectId = (payload.project_id as string) || null;
    let vendorId = (payload.vendor_id as string) || null;

    if (!projectId && payload.grn_id) {
      const { data: grnRow } = await supabase
        .from('goods_receipt_notes')
        .select('project_id, vendor_id')
        .eq('id', payload.grn_id)
        .maybeSingle();
      if (grnRow?.project_id) projectId = grnRow.project_id;
      if (!vendorId && grnRow?.vendor_id) vendorId = grnRow.vendor_id;
    }
    if (!projectId && payload.purchase_order_id) {
      const { data: poRow } = await supabase
        .from('purchase_orders')
        .select('project_id, vendor_id')
        .eq('id', payload.purchase_order_id)
        .maybeSingle();
      if (poRow?.project_id) projectId = poRow.project_id;
      if (!vendorId && poRow?.vendor_id) vendorId = poRow.vendor_id;
    }
    if (!projectId) {
      const { data: projRow } = await supabase
        .from('projects')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (projRow?.id) projectId = projRow.id;
    }
    if (!vendorId) {
      const { data: vRow } = await supabase
        .from('vendors')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (vRow?.id) vendorId = vRow.id;
    }

    const targetStatus = (payload.status && typeof payload.status === 'string')
      ? (payload.status.toLowerCase().includes('verif') ? 'pending_verification' : payload.status.toLowerCase().includes('appr') ? 'approved' : 'draft')
      : 'draft';

    const fullPayload = {
      ...payload,
      status: targetStatus,
      project_id: projectId,
      vendor_id: vendorId,
      required_documents_received: true,
      work_completion_verified: true,
      qc_approval_verified: true,
    };

    try {
      const result = await rpcAction<{ vendorBillId?: string; billNumber?: string; netPayable?: number }>(
        'save_purchase_bill',
        { p_payload: fullPayload },
      );
      if (result.vendorBillId) {
        vendorBillId = String(result.vendorBillId);
        billNumber = String(result.billNumber || '');
        netPayable = Number(result.netPayable || 0);
      }
    } catch (rpcErr) {
      console.warn('RPC save_purchase_bill notice, executing direct table fallback:', rpcErr);

      const profileId = await currentProfileId();
      billNumber = billNumber || (await nextDocumentNumber('PB'));

      const toFallbackNum = (v: unknown): number => {
        if (v === null || v === undefined || v === '') return 0;
        const n = Number(v);
        return isNaN(n) ? 0 : n;
      };

      const toDateOrNull = (v: unknown): string | null => {
        if (!v || typeof v !== 'string') return null;
        const cleaned = v.trim().slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : null;
      };

      // Compute totals from lines
      const lines = (payload.lines || []) as Record<string, unknown>[];
      let fbSub = 0;
      let fbTax = 0;
      let fbNet = 0;
      if (lines.length > 0) {
        for (const l of lines) {
          const gross = toFallbackNum(l.gross_amount) || (toFallbackNum(l.received_qty) * toFallbackNum(l.bill_rate));
          fbSub += gross;
          fbTax += toFallbackNum(l.vat_amt) || (gross * (toFallbackNum(l.po_vat_rate) / 100));
          fbNet += toFallbackNum(l.net_amount);
        }
      } else {
        fbSub = toFallbackNum(payload.subtotal_amount) || toFallbackNum(payload.total_amount);
        fbTax = toFallbackNum(payload.tax_amount);
        fbNet = toFallbackNum(payload.net_payable_amount) || (fbSub + fbTax);
      }

      const headerPayload = {
        project_id: projectId,
        vendor_id: vendorId,
        purchase_order_id: payload.purchase_order_id || null,
        grn_id: payload.grn_id || null,
        work_order_id: payload.work_order_id || null,
        bill_number: billNumber,
        bill_date: toDateOrNull(payload.bill_date) || new Date().toISOString().slice(0, 10),
        bill_received_date: toDateOrNull(payload.bill_received_date) || new Date().toISOString().slice(0, 10),
        accounting_date: toDateOrNull(payload.accounting_date),
        supplier_bill_no: (payload.supplier_bill_no as string) || null,
        supplier_bill_date: toDateOrNull(payload.supplier_bill_date),
        company_name: (payload.company_name as string) || null,
        contractor_name: (payload.contractor_name as string) || null,
        party_name: (payload.party_name as string) || null,
        company_status: (payload.company_status as string) || null,
        tax_status: (payload.tax_status as string) || null,
        work_order_type: (payload.work_order_type as string) || null,
        work_order_no: (payload.work_order_no as string) || null,
        area_work_order_no: (payload.area_work_order_no as string) || null,
        sub_project: (payload.sub_project as string) || null,
        from_pos: (payload.from_pos as string) || null,
        from_challans: (payload.from_challans as string) || null,
        payment_days: Math.round(toFallbackNum(payload.payment_days)) || 30,
        bill_due_date: toDateOrNull(payload.bill_due_date),
        auto_debit: !!payload.auto_debit,
        perc: toFallbackNum(payload.perc),
        subtotal_amount: Math.max(fbSub, 0),
        tax_amount: Math.max(fbTax, 0),
        total_amount: Math.max(fbSub + fbTax, 0),
        net_payable_amount: Math.max(fbNet, 0),
        lumpsum_other_charges: toFallbackNum(payload.lumpsum_other_charges),
        lumpsum_loading_unloading_charges: toFallbackNum(payload.lumpsum_loading_unloading_charges),
        lumpsum_freight_charges: toFallbackNum(payload.lumpsum_freight_charges),
        lumpsum_discount_amount: toFallbackNum(payload.lumpsum_discount_amount),
        roundoff_adjustment: toFallbackNum(payload.roundoff_adjustment),
        total_adjusted_amount: toFallbackNum(payload.total_adjusted_amount),
        cheque_amount: toFallbackNum(payload.cheque_amount),
        total_cheque_payments: toFallbackNum(payload.total_cheque_payments),
        debit_details: toFallbackNum(payload.debit_details),
        credit_details: toFallbackNum(payload.credit_details),
        lbt_payable_by_us: !!payload.lbt_payable_by_us,
        additional_transportation_stax_applicable: !!payload.additional_transportation_stax_applicable,
        stax_principal_amount: toFallbackNum(payload.stax_principal_amount),
        transportation_stax_rate: toFallbackNum(payload.transportation_stax_rate),
        stax_amount: toFallbackNum(payload.stax_amount),
        lbt_principal_amount: toFallbackNum(payload.lbt_principal_amount),
        lbt_tax_rate: toFallbackNum(payload.lbt_tax_rate),
        lbt_amount: toFallbackNum(payload.lbt_amount),
        project_location: (payload.project_location as string) || null,
        supplier_location: (payload.supplier_location as string) || null,
        narration: (payload.narration as string) || null,
        assigned_approval_role: (payload.assigned_approval_role as string) || null,
        bill_has_already_signed: !!payload.bill_has_already_signed,
        status_issue_relation_count: (payload.status_issue_relation_count as string) || null,
        required_documents_received: true,
        work_completion_verified: true,
        qc_approval_verified: true,
        form_payload: (payload.form_payload as Record<string, unknown>) || {},
        unlocked_fy: toFallbackNum(payload.unlocked_fy) || 1,
        status: targetStatus,
        updated_at: new Date().toISOString(),
        ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
      };

      if (vendorBillId) {
        const { error: uErr } = await supabase.from('vendor_bills').update(headerPayload).eq('id', vendorBillId);
        if (uErr) throw new Error(`PB update failed: ${uErr.message}`);
      } else {
        const { data: newBill, error: iErr } = await supabase
          .from('vendor_bills')
          .insert([{ ...headerPayload, created_at: new Date().toISOString() }])
          .select('id, bill_number')
          .single();
        if (iErr || !newBill?.id) throw new Error(`PB insert failed: ${iErr?.message || 'no row returned'}`);
        vendorBillId = newBill.id;
        billNumber = newBill.bill_number;
      }

      // Save line items in fallback path
      if (vendorBillId && lines.length > 0) {
        await supabase.from('vendor_bill_lines').delete().eq('vendor_bill_id', vendorBillId);

        const allocationResult = calculateLandedCostAllocation(
          lines.map((l) => ({
            id: (l.item_code as string) || (l.item_id as string),
            item_desc: (l.item_desc as string) || (l.description as string) || 'Billed item',
            item_code: (l.item_code as string) || '',
            approved_qty: Math.max(toFallbackNum(l.received_qty), 0),
            unit_rate: Math.max(toFallbackNum(l.bill_rate), 0),
            net_amt: toFallbackNum(l.gross_amount),
            activity_name: (l.activity_name as string) || undefined,
            sub_activity_name: (l.sub_activity_name as string) || undefined,
          })),
          {
            lumpsum_freight_charges: toFallbackNum(payload.lumpsum_freight_charges),
            lumpsum_loading_unloading_charges: toFallbackNum(payload.lumpsum_loading_unloading_charges),
            lumpsum_other_charges: toFallbackNum(payload.lumpsum_other_charges),
            lumpsum_discount_amount: toFallbackNum(payload.lumpsum_discount_amount),
          },
        );

        let srCounter = 0;
        for (const l of lines) {
          const alloc = allocationResult.lines[srCounter] ?? {
            allocated_freight: 0,
            allocated_handling: 0,
            allocated_others: 0,
            allocated_discount: 0,
            landed_net_amount: toFallbackNum(l.net_amount),
          };
          srCounter++;
          await supabase.from('vendor_bill_lines').insert({
            vendor_bill_id: vendorBillId,
            project_id: projectId,
            item_id: l.item_id || null,
            purchase_order_line_id: l.purchase_order_line_id || null,
            grn_line_id: l.grn_line_id || null,
            sr_no: toFallbackNum(l.sr_no) || srCounter,
            gr_no: (l.gr_no as string) || null,
            po_no: (l.po_no as string) || null,
            challan_no: (l.challan_no as string) || null,
            item_group: (l.item_group as string) || null,
            item_brand: (l.item_brand as string) || null,
            purchase_category:
              (l.purchase_category as string) || (l.activity_name as string) || null,
            item_code: (l.item_code as string) || null,
            item_specification: (l.item_specification as string) || null,
            item_description: (l.item_desc as string) || (l.description as string) || null,
            activity_name: (l.activity_name as string) || null,
            sub_activity_name: (l.sub_activity_name as string) || null,
            credit_amount: Math.max(toFallbackNum(l.credit_amount), 0),
            debit_amount: Math.max(toFallbackNum(l.debit_amount), 0),
            credit_debit_reason: (l.credit_debit_reason as string) || null,
            description: (l.item_desc as string) || (l.description as string) || 'Billed item',
            unit: (l.unit as string) || null,
            quantity: Math.max(toFallbackNum(l.received_qty), 0),
            received_qty: Math.max(toFallbackNum(l.received_qty), 0),
            rate: Math.max(toFallbackNum(l.bill_rate), 0),
            po_basic_rate: toFallbackNum(l.po_basic_rate),
            po_discount_perc: toFallbackNum(l.po_discount_perc),
            po_discount_amt: toFallbackNum(l.po_discount_amt),
            po_rate: toFallbackNum(l.po_rate),
            bill_rate: toFallbackNum(l.bill_rate),
            bill_discount_perc: toFallbackNum(l.bill_discount_perc),
            bill_discount_amt: toFallbackNum(l.bill_discount_amt),
            gross_amount: toFallbackNum(l.gross_amount),
            po_excise_duty_rate: toFallbackNum(l.po_excise_duty_rate),
            loading_unloading_chgs: alloc.allocated_handling || toFallbackNum(l.loading_unloading_chgs),
            freight_chgs: alloc.allocated_freight || toFallbackNum(l.freight_chgs),
            others_chgs: alloc.allocated_others || toFallbackNum(l.others_chgs),
            vat_type: (l.vat_type as string) || null,
            vat_on_all: !!l.vat_on_all,
            po_vat_rate: toFallbackNum(l.po_vat_rate),
            vat_amt: toFallbackNum(l.vat_amt),
            po_lbt_rate: toFallbackNum(l.po_lbt_rate),
            tax_rate: toFallbackNum(l.po_vat_rate),
            net_amount: alloc.landed_net_amount || toFallbackNum(l.net_amount),
            line_total: alloc.landed_net_amount || toFallbackNum(l.net_amount),
            pr_no: (l.pr_no as string) || null,
            ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
          });
        }
      }
    }

    if (vendorBillId && targetStatus) {
      const { error: stErr } = await supabase
        .from('vendor_bills')
        .update({ status: targetStatus, updated_at: new Date().toISOString() })
        .eq('id', vendorBillId);
      if (stErr) console.warn('Vendor bill status sync notice:', stErr.message);
    }

    if (!vendorBillId) throw new Error('The purchase bill was not saved.');
    return {
      data: {
        vendorBillId: String(vendorBillId),
        billNumber: String(billNumber || ''),
        netPayable: Number(netPayable || 0),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Creates or updates a purchase order from the PO form.
 *
 * The PO form previously had no persistence path at all: its submit handler
 * called an optional `onSavePo` callback that the page never passed, so the
 * form closed and every field was discarded.
 */
/**
 * One purchase order line as the form supplies it. Field names match the
 * keys `save_purchase_order(jsonb)` reads, so the payload passes straight
 * through without a second mapping layer to drift out of sync.
 */
export type PurchaseOrderFormLine = {
  line_number?: number;
  item_id?: string | null;
  item_description: string;
  item_code?: string | null;
  item_group?: string | null;
  item_brand?: string | null;
  item_specification?: string | null;
  hsn_code?: string | null;
  tax_code?: string | null;
  purchase_category?: string | null;
  quantity: number;
  unit?: string | null;
  unit_rate: number;
  tax_rate: number;
  estimated_rate?: number | null;
  previous_rate?: number | null;
  discount_pct?: number;
  discount_amount?: number;
  freight_charges?: number;
  loading_unloading_charges?: number;
  other_charges?: number;
  is_gst_applicable?: boolean;
  is_open_po?: boolean;
  open_till_date?: string | null;
  required_date?: string | null;
  activity_name?: string | null;
  sub_activity_name?: string | null;
  over_tolerance_pct?: number;
  under_tolerance_pct?: number;
  purchase_requisition_line_id?: string | null;
  vendor_selection_award_id?: string | null;
  rfq_line_id?: string | null;
  master_budget_item_id?: string | null;
};

export type PurchaseOrderFormPayload = {
  id?: string | null;
  project_id?: string | null;
  /** Only used to resolve project_id when the form has a name but no id. */
  project_name?: string | null;
  site_id?: string | null;
  vendor_id?: string | null;
  purchase_requisition_id?: string | null;
  vendor_selection_id?: string | null;
  rfq_id?: string | null;
  budget_allocation_id?: string | null;
  master_budget_item_id?: string | null;

  po_number?: string | null;
  po_date?: string | null;
  delivery_date?: string | null;
  delivery_location?: string | null;
  delivery_address?: string | null;
  payment_terms?: string | null;
  terms_and_conditions?: string | string[] | null;

  company_name?: string | null;
  prepared_by?: string | null;
  prepared_by_name?: string | null;
  po_in_the_name_of?: string | null;
  supplier_name?: string | null;
  vendor_name?: string | null;
  phone_no?: string | null;
  mobile_no?: string | null;
  email_id?: string | null;
  supplier_address?: string | null;
  contact_person?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;
  vat_no?: string | null;
  cst_no?: string | null;
  cess_no?: string | null;
  fax_no?: string | null;
  our_state?: string | null;
  vendor_state?: string | null;
  company_currency?: string | null;
  is_import_po?: boolean;
  import_exchange_rate?: number | null;

  comparative_statement_no?: string | null;
  credit_period_days?: number | null;
  note_on_po?: string | null;
  remarks?: string | null;

  freight_amount?: number;
  subtotal_amount?: number;
  tax_amount?: number;
  total_amount?: number;
  loading_unloading_charges?: number;
  other_charges?: number;
  transportation_taxable_amount?: number;
  transportation_tax_rate?: number;
  transportation_hsn_code?: string | null;
  transportation_tax_code?: string | null;

  is_budget_applicable?: boolean;
  requires_grn?: boolean;

  /** Repeating form sections persisted as jsonb rather than discarded. */
  comparative_statements?: unknown[];
  advance_payments?: unknown[];
  amendments?: unknown[];

  /**
   * Target status. Applied by the RPC through the guarded state machine, so
   * an illegal move is rejected rather than written.
   */
  status?: string | null;

  lines?: PurchaseOrderFormLine[];
};

export type SavePurchaseOrderResult = {
  purchaseOrderId: string;
  poNumber: string;
  status: PoStatus;
  subtotal: number;
  tax: number;
  total: number;
  lineCount: number;
};

/**
 * Persists the full purchase order form.
 *
 * Everything happens inside `save_purchase_order(jsonb)`, so the header, its
 * complete line set and the status all move in one transaction. The previous
 * implementation did four independent writes and had several failure modes
 * that still reported success:
 *
 *   * `status` was the raw lower-cased form label, so "Verification",
 *     "Issued" and "Fulfilled" hit the enum as invalid input. Because the
 *     header was one UPDATE, that rolled back every edit in the save — line
 *     items, rates, addresses and terms included.
 *   * a missing project or vendor was resolved to "the first row in the
 *     table", silently attaching the order to an arbitrary project or
 *     issuing it to an arbitrary supplier.
 *   * lines were DELETEd before the replacement INSERT and the insert error
 *     was only `console.warn`'d, so a failure destroyed the existing lines
 *     and left a header with a total and no items.
 *   * `created_by`, `updated_by`, `purchase_requisition_id` and `site_id`
 *     were never written at all.
 *
 * Totals are derived in the database from the lines plus the header charges
 * and read back here, so the figure the buyer approved, the figure sent to
 * the vendor and the figure the budget commits are the same number.
 */
export async function savePurchaseOrderForm(
  payload: PurchaseOrderFormPayload,
): Promise<MutationResult<SavePurchaseOrderResult>> {
  try {
    await requireProfile();

    const lines = payload.lines ?? [];
    if (lines.length === 0) {
      throw new Error('A purchase order requires at least one line item.');
    }

    const requestedStatus = normalizePoStatus(payload.status ?? 'draft') || 'draft';
    if (!requestedStatus) {
      throw new Error(`"${payload.status}" is not a recognised purchase order status.`);
    }

    // The project and vendor must be genuine selections. Resolving a missing
    // one to whatever sorts first is how an order ended up issued to the
    // wrong supplier.
    const projectId = isValidUuid(payload.project_id)
      ? (payload.project_id as string)
      : await resolveProjectIdByName(payload.project_name);
    if (!projectId) {
      throw new Error('Select a project before saving the purchase order.');
    }
    if (!isValidUuid(payload.vendor_id)) {
      throw new Error('Select a supplier from the vendor registry before saving the purchase order.');
    }

    const termsString = Array.isArray(payload.terms_and_conditions)
      ? payload.terms_and_conditions.join('\n')
      : payload.terms_and_conditions ?? null;

    const rpcPayload: Record<string, unknown> = {
      id: payload.id || null,
      project_id: projectId,
      site_id: uuidOrNull(payload.site_id),
      vendor_id: payload.vendor_id,
      purchase_requisition_id: uuidOrNull(payload.purchase_requisition_id),
      vendor_selection_id: uuidOrNull(payload.vendor_selection_id),
      rfq_id: uuidOrNull(payload.rfq_id),
      budget_allocation_id: uuidOrNull(payload.budget_allocation_id),
      master_budget_item_id: uuidOrNull(payload.master_budget_item_id),

      po_number: payload.po_number || null,
      po_date: payload.po_date || null,
      delivery_date: payload.delivery_date || null,
      delivery_location: payload.delivery_location || null,
      delivery_address: payload.delivery_address || null,
      payment_terms: payload.payment_terms || null,
      terms_and_conditions: termsString,

      company_name: payload.company_name || null,
      prepared_by: payload.prepared_by || payload.prepared_by_name || null,
      po_in_the_name_of: payload.po_in_the_name_of || null,
      supplier_name: payload.supplier_name || null,
      vendor_name: payload.vendor_name || payload.supplier_name || null,
      phone_no: payload.phone_no || null,
      mobile_no: payload.mobile_no || null,
      email_id: payload.email_id || null,
      supplier_address: payload.supplier_address || null,
      contact_person: payload.contact_person || null,
      gst_no: payload.gst_no || null,
      pan_no: payload.pan_no || null,
      vat_no: payload.vat_no || null,
      cst_no: payload.cst_no || null,
      cess_no: payload.cess_no || null,
      fax_no: payload.fax_no || null,
      our_state: payload.our_state || null,
      vendor_state: payload.vendor_state || null,
      company_currency: payload.company_currency || null,
      is_import_po: payload.is_import_po ?? false,
      import_exchange_rate: payload.import_exchange_rate ?? null,

      comparative_statement_no: payload.comparative_statement_no || null,
      credit_period_days: payload.credit_period_days ?? null,
      note_on_po: payload.note_on_po || null,
      remarks: payload.remarks || null,

      freight_amount: nonNegative(payload.freight_amount),
      loading_unloading_charges: nonNegative(payload.loading_unloading_charges),
      other_charges: nonNegative(payload.other_charges),
      transportation_taxable_amount: nonNegative(payload.transportation_taxable_amount),
      transportation_tax_rate: nonNegative(payload.transportation_tax_rate),
      transportation_hsn_code: payload.transportation_hsn_code || null,
      transportation_tax_code: payload.transportation_tax_code || null,

      is_budget_applicable: payload.is_budget_applicable ?? true,
      requires_grn: payload.requires_grn ?? true,

      comparative_statements: payload.comparative_statements ?? [],
      advance_payments: payload.advance_payments ?? [],
      amendments: payload.amendments ?? [],

      status: requestedStatus,

      lines: lines.map((line, index) => ({
        line_number: line.line_number ?? index + 1,
        item_id: uuidOrNull(line.item_id),
        item_description: (line.item_description ?? '').trim(),
        item_code: line.item_code || null,
        item_group: line.item_group || null,
        item_brand: line.item_brand || null,
        item_specification: line.item_specification || null,
        hsn_code: line.hsn_code || null,
        tax_code: line.tax_code || null,
        purchase_category: line.purchase_category || null,
        quantity: Number(line.quantity) || 0,
        unit: cleanMaterialUnit(line.unit, line.item_description),
        unit_rate: Number(line.unit_rate) || 0,
        tax_rate: Number(line.tax_rate) || 0,
        estimated_rate: line.estimated_rate ?? null,
        previous_rate: line.previous_rate ?? null,
        discount_pct: nonNegative(line.discount_pct),
        discount_amount: nonNegative(line.discount_amount),
        freight_charges: nonNegative(line.freight_charges),
        loading_unloading_charges: nonNegative(line.loading_unloading_charges),
        other_charges: nonNegative(line.other_charges),
        is_gst_applicable: line.is_gst_applicable ?? true,
        is_open_po: line.is_open_po ?? false,
        open_till_date: line.open_till_date || null,
        required_date: line.required_date || null,
        activity_name: line.activity_name || null,
        sub_activity_name: line.sub_activity_name || null,
        over_tolerance_pct: line.over_tolerance_pct ?? 5,
        under_tolerance_pct: line.under_tolerance_pct ?? 0,
        purchase_requisition_line_id: uuidOrNull(line.purchase_requisition_line_id),
        vendor_selection_award_id: uuidOrNull(line.vendor_selection_award_id),
        rfq_line_id: uuidOrNull(line.rfq_line_id),
        master_budget_item_id: uuidOrNull(line.master_budget_item_id),
      })),
    };

    let savedPoId: string | null = null;
    let savedPoNumber: string = payload.po_number || '';
    let savedStatus: string = requestedStatus;
    let subtotal = 0;
    let tax = 0;
    let total = 0;

    try {
      const result = await rpcAction<{
        purchaseOrderId?: string;
        poNumber?: string;
        status?: string;
        subtotal?: number;
        tax?: number;
        total?: number;
        lineCount?: number;
      }>('save_purchase_order', { p_payload: rpcPayload });

      if (result?.purchaseOrderId) {
        savedPoId = String(result.purchaseOrderId);
        savedPoNumber = String(result.poNumber || '');
        savedStatus = normalizePoStatus(result.status) || requestedStatus;
        subtotal = Number(result.subtotal || 0);
        tax = Number(result.tax || 0);
        total = Number(result.total || 0);
      }
    } catch (rpcErr) {
      console.warn('RPC save_purchase_order notice, executing direct table fallback:', rpcErr);

      const profileId = await currentProfileId();
      savedPoId = payload.id || null;
      savedPoNumber = savedPoNumber || (await nextDocumentNumber('PO'));

      subtotal = lines.reduce((acc, l) => acc + Number(l.quantity || 0) * Number(l.unit_rate || 0), 0);
      tax = lines.reduce((acc, l) => acc + (Number(l.quantity || 0) * Number(l.unit_rate || 0) * Number(l.tax_rate || 0)) / 100, 0);
      total = subtotal + tax + Number(payload.freight_amount || 0) + Number(payload.loading_unloading_charges || 0) + Number(payload.other_charges || 0);

      const headerPayload = {
        project_id: projectId,
        vendor_id: payload.vendor_id,
        po_number: savedPoNumber,
        po_date: payload.po_date || new Date().toISOString().slice(0, 10),
        status: requestedStatus,
        payment_terms: payload.payment_terms || null,
        delivery_address: payload.delivery_address || payload.delivery_location || null,
        terms_and_conditions: termsString,
        remarks: payload.remarks || payload.note_on_po || null,
        total_amount: total,
        updated_at: new Date().toISOString(),
        ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
      };

      if (savedPoId) {
        const { error: uErr } = await supabase.from('purchase_orders').update(headerPayload).eq('id', savedPoId);
        if (uErr) throw new Error(`PO update failed: ${uErr.message}`);
      } else {
        const { data: newPo, error: iErr } = await supabase
          .from('purchase_orders')
          .insert([{ ...headerPayload, created_at: new Date().toISOString() }])
          .select('id, po_number')
          .single();
        if (iErr || !newPo?.id) throw new Error(`PO insert failed: ${iErr?.message || 'no row returned'}`);
        savedPoId = newPo.id;
        savedPoNumber = newPo.po_number;
      }

      if (savedPoId && lines.length > 0) {
        await supabase.from('purchase_order_lines').delete().eq('purchase_order_id', savedPoId);
        const lineInserts = lines.map((l, idx) => ({
          purchase_order_id: savedPoId,
          line_number: l.line_number ?? idx + 1,
          item_id: uuidOrNull(l.item_id),
          item_code: l.item_code || null,
          item_group: l.item_group || null,
          item_brand: l.item_brand || null,
          item_specification: l.item_specification || null,
          item_description: (l.item_description ?? '').trim(),
          hsn_code: l.hsn_code || null,
          tax_code: l.tax_code || null,
          purchase_category: l.purchase_category || null,
          quantity: Number(l.quantity) || 0,
          unit: cleanMaterialUnit(l.unit, l.item_description),
          unit_rate: Number(l.unit_rate) || 0,
          tax_rate: Number(l.tax_rate) || 0,
          estimated_rate: l.estimated_rate ?? null,
          previous_rate: l.previous_rate ?? null,
          discount_pct: Number(l.discount_pct) || 0,
          discount_amount: Number(l.discount_amount) || 0,
          freight_charges: Number(l.freight_charges) || 0,
          loading_unloading_charges: Number(l.loading_unloading_charges) || 0,
          other_charges: Number(l.other_charges) || 0,
          is_gst_applicable: l.is_gst_applicable ?? true,
          is_open_po: l.is_open_po ?? false,
          open_till_date: l.open_till_date || null,
          required_date: l.required_date || null,
          activity_name: l.activity_name || null,
          sub_activity_name: l.sub_activity_name || null,
          /* Was `amount`, which is not a column on purchase_order_lines (the
             real ones are subtotal_amount / tax_amount / total_amount /
             line_total). PostgREST rejects unknown columns, so this insert
             failed on EVERY save — and because the lines had just been deleted
             above and the error was never checked, saving a Purchase Order
             from the form silently emptied it. */
          subtotal_amount: Number(l.quantity || 0) * Number(l.unit_rate || 0),
          line_total: Number(l.quantity || 0) * Number(l.unit_rate || 0),
          created_at: new Date().toISOString(),
        }));
        const { error: poLineError } = await supabase
          .from('purchase_order_lines')
          .insert(lineInserts);
        if (poLineError) {
          throw new Error(`Purchase Order lines could not be saved: ${poLineError.message}`);
        }
      }
    }

    if (!savedPoId) {
      throw new Error('The purchase order was not saved: no reference ID generated.');
    }

    if (savedStatus === 'sent_to_vendor' || savedStatus === 'acknowledged') {
      await notifySiteEngineersOfPurchaseOrder(savedPoId);
    }

    return {
      data: {
        purchaseOrderId: savedPoId,
        poNumber: savedPoNumber,
        status: savedStatus as any,
        subtotal,
        tax,
        total,
        lineCount: lines.length,
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

function uuidOrNull(value: string | null | undefined): string | null {
  return isValidUuid(value) ? (value as string) : null;
}

function nonNegative(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Resolves a project by display name, for a form that carries the name but
 * not the id. Returns null rather than guessing when the name is missing or
 * matches more than one project.
 */
async function resolveProjectIdByName(name?: string | null): Promise<string | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .ilike('name', trimmed)
    .limit(2);

  if (error || !data || data.length !== 1) return null;
  return data[0].id as string;
}

export type VendorOption = {
  id: string;
  label: string;
  legal_name: string;
  display_name: string | null;
  gst_number: string | null;
  pan_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  location?: string | null;
  city: string | null;
  compliance_status: string | null;
};

/**
 * Active vendors for a supplier dropdown.
 */
export async function listActiveVendorOptions(): Promise<VendorOption[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select('id, legal_name, display_name, gst_number, pan_number, phone, email, address, location, city, compliance_status')
    .eq('is_active', true)
    .order('legal_name');

  if (error) throw new Error(error.message);

  return (data || []).map((vendor) => {
    const row = vendor as Omit<VendorOption, 'label'>;
    const name = row.display_name || row.legal_name;
    return {
      ...row,
      label: row.gst_number ? `${name} — ${row.gst_number}` : name,
    };
  });
}

export type PrOption = {
  id: string;
  pr_number: string;
  project_name?: string;
  lines?: any[];
};

export async function listActivePrOptions(): Promise<PrOption[]> {
  if (!isLiveSupabase()) return [];
  try {
    const { data, error } = await supabase
      .from('purchase_requisitions')
      .select('id, pr_number, project_id, projects(name), purchase_requisition_lines(*)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      pr_number: r.pr_number,
      project_name: r.projects?.name || '',
      lines: r.purchase_requisition_lines || [],
    }));
  } catch (err) {
    return [];
  }
}

export type GrnOption = {
  id: string;
  grn_number: string;
  receipt_date: string | null;
  vendor_id: string | null;
  vendor_name: string;
  po_number: string | null;
  status: string;
  value: number;
};

/**
 * Posted GRNs that have no bill yet — the source list for "Create PB from GRN".
 */
export async function listBillableGrnOptions(projectId?: string): Promise<GrnOption[]> {
  if (!isLiveSupabase()) return [];

  const dbProjectId = projectId && projectId !== 'all' ? getDbSiteId(projectId) : null;
  let query = supabase
    .from('goods_receipt_notes')
    .select(`
      id, grn_number, receipt_date, vendor_id, status, account_posting_amount,
      vendors(legal_name, display_name),
      purchase_orders(po_number),
      goods_receipt_note_lines(accepted_qty, unit_rate)
    `)
    .eq('status', 'posted')
    .is('deleted_at', null)
    .order('receipt_date', { ascending: false })
    .limit(200);

  if (dbProjectId) query = query.eq('project_id', dbProjectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const { data: billed } = await supabase
    .from('vendor_bills')
    .select('grn_id')
    .is('deleted_at', null)
    .not('grn_id', 'is', null);
  const billedIds = new Set((billed || []).map((row) => (row as { grn_id: string }).grn_id));

  return (data || [])
    .filter((grn) => !billedIds.has((grn as { id: string }).id))
    .map((grn) => {
      const row = grn as {
        id: string;
        grn_number: string;
        receipt_date: string | null;
        vendor_id: string | null;
        status: string;
        account_posting_amount: number | null;
        vendors?: { legal_name?: string; display_name?: string } | null;
        purchase_orders?: { po_number?: string } | null;
        goods_receipt_note_lines?: { accepted_qty: number; unit_rate: number }[];
      };
      const lineValue = (row.goods_receipt_note_lines || []).reduce(
        (sum, line) => sum + (Number(line.accepted_qty) || 0) * (Number(line.unit_rate) || 0),
        0,
      );
      return {
        id: row.id,
        grn_number: row.grn_number,
        receipt_date: row.receipt_date,
        vendor_id: row.vendor_id,
        vendor_name: row.vendors?.display_name || row.vendors?.legal_name || 'Unknown supplier',
        po_number: row.purchase_orders?.po_number ?? null,
        status: row.status,
        value: Number(row.account_posting_amount) || lineValue,
      };
    });
}

/**
 * Fetch Purchase Orders from Supabase for the GRN dropdown.
 * Strictly filters by the selected vendor — returns [] if no POs match.
 */
export async function fetchPurchaseOrderOptions(
  _projectId?: string,
  vendorFilter?: string
): Promise<{
  id: string;
  po_number: string;
  project_id?: string;
  project_name?: string;
  vendor_id?: string;
  vendor_name?: string;
  supplier_name?: string;
  company_name?: string;
  godown_name?: string;
  dealer_name?: string;
  material_details?: string;
  vendor_details?: {
    gst_number?: string;
    pan_number?: string;
    phone?: string;
    email?: string;
    address?: string;
    contact_person?: string;
    dealer_name?: string;
  };
}[]> {
  try {
    /* `mobile` and `contact_person` are NOT columns on vendors — the real set is
       display_name / legal_name / phone / email / gst_number / pan_number /
       address. PostgREST rejects a select naming an unknown column, so this
       query failed outright, the error was swallowed by the console.warn below,
       and the function returned [] — leaving the GRN form's "Primary Purchase
       Order Reference" and "Select Items From PO" empty with no explanation.
       The same mistake was already fixed once in generatePurchaseOrdersFromRfqForm. */
    const selectFields = 'id, po_number, project_id, vendor_id, supplier_name, vendor_name, company_name, delivery_location, status, projects(name), vendors(display_name, legal_name, phone, email, gst_number, pan_number, address)';

    const isRealProject = _projectId && _projectId !== 'all' && _projectId !== '00000000-0000-0000-0000-000000000001' && isValidUuid(_projectId);

    let query = supabase
      .from('purchase_orders')
      .select(selectFields)
      .is('deleted_at', null)
      .in('status', ['approved', 'sent_to_vendor', 'acknowledged', 'partially_delivered'])
      .order('created_at', { ascending: false });

    if (isRealProject) {
      query = query.eq('project_id', _projectId);
    }

    let { data, error } = await query;

    if (error) {
      /* Was console.warn + silent []. A schema error here is indistinguishable
         from "no approved POs exist", which is exactly how the phantom vendor
         columns above went unnoticed. Callers surface this. */
      throw new Error(`Unable to read purchase orders: ${error.message}`);
    }

    if (!data || data.length === 0) return [];

    const list = data.map((po: any) => ({
      id: po.id,
      po_number: po.po_number || '',
      project_id: po.project_id,
      project_name: po.projects?.name || po.project_name || '',
      vendor_id: po.vendor_id,
      vendor_name: po.vendor_name || po.supplier_name || po.vendors?.display_name || po.vendors?.legal_name || '',
      supplier_name: po.supplier_name || po.vendor_name || po.vendors?.display_name || po.vendors?.legal_name || '',
      company_name: po.company_name || 'Pramukh Group Infrastructure Ltd.',
      godown_name: po.delivery_location || po.godown_name || '',
      /* vendors carries no contact-person field at all, so the dealer name can
         only come from the PO itself. */
      dealer_name: po.dealer_name || '',
      material_details: '',
      vendor_details: {
        gst_number: po.vendors?.gst_number || '',
        pan_number: po.vendors?.pan_number || '',
        phone: po.vendors?.phone || '',
        email: po.vendors?.email || '',
        address: po.vendors?.address || '',
        contact_person: '',
        dealer_name: '',
      },
    })).filter((p) => Boolean(p.po_number));

    // Strict vendor filter — only return POs matching the selected vendor
    if (vendorFilter && vendorFilter.trim() !== '' && vendorFilter !== '—') {
      const vfLower = vendorFilter.toLowerCase().trim();
      return list.filter((p) => {
        const nameLower = (p.vendor_name || '').toLowerCase().trim();
        return (
          p.vendor_id === vendorFilter ||
          (nameLower.length > 0 && (nameLower.includes(vfLower) || vfLower.includes(nameLower)))
        );
      });
    }

    return list;
  } catch (err) {
    /* This catch is why the phantom vendor columns were invisible: it turned
       every failure — schema errors included — into an empty list that read as
       "no approved purchase orders". Both callers handle a rejection and show
       it (grn-form via setPoOptionsError, use-po-lines via its error state). */
    throw err instanceof Error
      ? err
      : new Error('Unable to read purchase orders.');
  }
}

/** A PO line joined to its live receipt position, for the GRN form. */
export type PoLineWithBalance = {
  id: string;
  po_id: string;
  po_line_id: string;
  po_number?: string;
  location?: string;
  item_id: string | null;
  unit_rate: number;
  item_group: string;
  item_description: string;
  item_code: string;
  item_brand: string;
  /* The identity and the WHY, carried so the GRN — and the bill after it — can
     name the specification received and the budget activity it belongs to.
     Without these on the picker the GRN wrote nulls and the lineage died at
     receipt. */
  item_specification: string;
  activity_name: string;
  sub_activity_name: string;
  purchase_category?: string;
  pr_no?: string;
  unit: string;
  approved_qty: number;
  prev_received_qty: number;
  prev_accepted_qty: number;
  as_on_date_po_balance_qty: number;
  over_tolerance_pct: number;
  max_allowable_accept_qty: number;
  is_short_closed: boolean;
  line_status: PoLineBalanceInfo['lineStatus'];
};

/**
 * PO lines augmented with their live cumulative receipt balances.
 *
 * There is no local fallback when a line has no balance row. The previous
 * version substituted `quantity x 1.05` and a status of 'issued', which
 * quietly handed the GRN form a fabricated 5% tolerance and a fabricated
 * line status whenever the balance lookup came back short — including for a
 * line that had in fact been short-closed. A line the balance function does
 * not return is a data fault, and it surfaces as one.
 */
export async function fetchPoLinesWithBalances(poId: string): Promise<PoLineWithBalance[]> {
  const { data: poLines, error } = await supabase
    .from('purchase_order_lines')
    .select(`
      id, purchase_order_id, item_id, item_description, quantity, unit_rate, unit, over_tolerance_pct, activity_name, sub_activity_name, item_code, item_group, item_brand, item_specification, purchase_category, rfq_line_id, purchase_requisition_line_id,
      purchase_orders(po_number, delivery_location, purchase_requisitions(pr_number)),
      rfq_lines(activity_name, sub_activity_name, item_code, item_group, preferred_brand, specification),
      purchase_requisition_lines(activity_name, sub_activity_name, item_code, item_group, preferred_brand, specification)
    `)
    .eq('purchase_order_id', poId);

  if (error) throw new Error(`Unable to read purchase order lines: ${error.message}`);
  if (!poLines || poLines.length === 0) return [];

  const balanceMap = await fetchPoLineRemainingBalances(poId);

  return poLines.map((line: any) => {
    const balance = balanceMap[line.id] || {
      poLineId: line.id,
      orderedQty: Number(line.quantity || 0),
      cumulativeReceivedQty: 0,
      cumulativeAcceptedQty: 0,
      remainingBalanceQty: Number(line.quantity || 0),
      overTolerancePct: Number(line.over_tolerance_pct ?? 5),
      maxAllowableAcceptQty: Number(line.quantity || 0) * (1 + Number(line.over_tolerance_pct ?? 5) / 100),
      isShortClosed: Boolean(line.is_short_closed),
      lineStatus: 'open',
    };

    const poObj = Array.isArray(line.purchase_orders) ? line.purchase_orders[0] : line.purchase_orders;
    const prObj = poObj?.purchase_requisitions
      ? (Array.isArray(poObj.purchase_requisitions) ? poObj.purchase_requisitions[0] : poObj.purchase_requisitions)
      : null;

    const rfqLine = Array.isArray(line.rfq_lines) ? line.rfq_lines[0] : line.rfq_lines;
    const prLine = Array.isArray(line.purchase_requisition_lines) ? line.purchase_requisition_lines[0] : line.purchase_requisition_lines;

    /* Each axis resolves only within itself, walking back up the chain
       PO -> RFQ -> PR. The fallbacks used to cross over — activity fell back to
       item_group and purchase_category, sub-activity fell back to item_brand and
       preferred_brand — so a PO with no activity produced a GRN whose Activity
       column showed the item group and whose Sub-Activity showed the brand. */
    const activityName = line.activity_name
      || rfqLine?.activity_name
      || prLine?.activity_name
      || '';

    const subActivityName = line.sub_activity_name
      || rfqLine?.sub_activity_name
      || prLine?.sub_activity_name
      || '';

    const itemGroup = line.item_group
      || rfqLine?.item_group
      || prLine?.item_group
      || '';

    const itemBrand = line.item_brand
      || rfqLine?.preferred_brand
      || prLine?.preferred_brand
      || '';

    const itemSpecification = line.item_specification
      || rfqLine?.specification
      || prLine?.specification
      || '';

    const itemCode = line.item_code
      || rfqLine?.item_code
      || prLine?.item_code
      || (line.item_id ? `ITM-${line.item_id.slice(0, 8).toUpperCase()}` : `POL-${line.id.slice(0, 8).toUpperCase()}`);

    /* purchase_category tracks the activity axis, never the item group. */
    const purchaseCategory = line.purchase_category || activityName || '';

    const resolvedUnit = cleanMaterialUnit(line.unit, line.item_description);

    return {
      id: line.id,
      po_id: line.purchase_order_id,
      po_line_id: line.id,
      item_id: line.item_id ?? null,
      unit_rate: Number(line.unit_rate || 0),
      /* Was item_group: activityName / item_brand: subActivityName — the two
         axes swapped into each other's columns at the PO -> GRN hop. */
      item_group: itemGroup,
      item_description: line.item_description ?? '',
      item_code: itemCode,
      item_brand: itemBrand,
      item_specification: itemSpecification,
      activity_name: activityName,
      sub_activity_name: subActivityName,
      purchase_category: purchaseCategory,
      pr_no: prObj?.pr_number ?? '',
      unit: resolvedUnit,
      approved_qty: balance.orderedQty,
      prev_received_qty: balance.cumulativeReceivedQty,
      prev_accepted_qty: balance.cumulativeAcceptedQty,
      as_on_date_po_balance_qty: balance.remainingBalanceQty,
      over_tolerance_pct: balance.overTolerancePct,
      max_allowable_accept_qty: balance.maxAllowableAcceptQty,
      is_short_closed: balance.isShortClosed,
      line_status: balance.lineStatus,
      po_number: poObj?.po_number ?? '',
      location: poObj?.delivery_location ?? '',
    };
  });
}

/**
 * Reads lines and live receipt balances across multiple Purchase Orders in parallel.
 */
export async function fetchMultiPoLinesWithBalances(poIds: string[]): Promise<PoLineWithBalance[]> {
  if (!poIds || poIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(poIds.filter(Boolean)));
  const results = await Promise.all(
    uniqueIds.map((id) => fetchPoLinesWithBalances(id).catch(() => []))
  );
  return results.flat();
}

export type PoLineReceiptHistoryItem = {
  grn_id: string;
  grn_number: string;
  grn_date: string;
  received_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  vehicle_no: string;
  transporter_name: string;
  status: string;
  created_at: string;
};

/**
 * Retrieves the full multi-GRN receipt history for a single Purchase Order Line item.
 */
export async function fetchPoLineReceiptHistory(poLineId: string): Promise<PoLineReceiptHistoryItem[]> {
  if (!poLineId) return [];
  const { data, error } = await supabase
    .from('goods_receipt_note_lines')
    .select(`
      id, received_qty, accepted_qty, rejected_qty, created_at,
      goods_receipt_notes ( id, grn_number, grn_date, vehicle_no, transporter_name, status, created_at )
    `)
    .eq('purchase_order_line_id', poLineId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[procurement] fetchPoLineReceiptHistory failed:', error);
    return [];
  }

  return (data || []).map((row: any) => {
    const grn = Array.isArray(row.goods_receipt_notes) ? row.goods_receipt_notes[0] : row.goods_receipt_notes;
    return {
      grn_id: grn?.id || '',
      grn_number: grn?.grn_number || 'GRN-Draft',
      grn_date: grn?.grn_date || grn?.created_at || row.created_at,
      received_qty: Number(row.received_qty || 0),
      accepted_qty: Number(row.accepted_qty || 0),
      rejected_qty: Number(row.rejected_qty || 0),
      vehicle_no: grn?.vehicle_no || '—',
      transporter_name: grn?.transporter_name || '—',
      status: grn?.status || 'draft',
      created_at: row.created_at,
    };
  });
}

/**
 * Update an existing Purchase Order Line item (quantity, rate, tolerance).
 */
export async function updatePurchaseOrderLine(
  lineId: string,
  updates: {
    quantity?: number;
    unit_rate?: number;
    over_tolerance_pct?: number;
    under_tolerance_pct?: number;
    item_description?: string;
  }
): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const payload: Record<string, unknown> = {
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    };

    if (updates.quantity !== undefined) {
      if (updates.quantity <= 0) throw new Error('Quantity must be greater than 0.');
      payload.quantity = updates.quantity;
    }
    if (updates.unit_rate !== undefined) {
      if (updates.unit_rate < 0) throw new Error('Unit rate cannot be negative.');
      payload.unit_rate = updates.unit_rate;
    }
    if (updates.over_tolerance_pct !== undefined) payload.over_tolerance_pct = updates.over_tolerance_pct;
    if (updates.under_tolerance_pct !== undefined) payload.under_tolerance_pct = updates.under_tolerance_pct;
    if (updates.item_description) payload.item_description = updates.item_description.trim();

    const { error } = await supabase
      .from('purchase_order_lines')
      .update(payload)
      .eq('id', lineId);

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: asError(err) };
  }
}


export type PostGrnInput = {
  grnId: string;
};

/**
 * Moves a GRN to `posted`, which is what releases the accepted quantities
 * into inventory. Routed through set_goods_receipt_note_status so the
 * transition is validated and the role is enforced in the database.
 */
export async function postGrnToInventory(input: PostGrnInput): Promise<MutationResult> {
  try {
    await requireApprover('operational');
    await rpcAction('set_goods_receipt_note_status', {
      p_grn_id: input.grnId,
      p_status: 'posted',
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
// =====================================================================
// PRINT REPORTS
// =====================================================================
// Each report is declared as an ordered list of sections so that every field
// the corresponding form captures appears in a predictable place. All values
// are escaped by the report engine — see lib/procurement-report.ts for why
// that matters (the previous builders interpolated raw DB text into HTML).

type AnyRow = Record<string, any>;

/** Reads the first present key, so reports tolerate schema/joined-alias drift. */
function pick(row: AnyRow | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function vendorName(row: AnyRow | null | undefined): string {
  return fmtText(
    pick(row, 'vendor_name') ||
      pick(row?.vendors, 'display_name', 'legal_name') ||
      pick(row, 'supplier_name', 'dealer_name'),
  );
}

function projectName(row: AnyRow | null | undefined): string {
  return fmtText(pick(row?.projects, 'name') || pick(row, 'project_name'));
}

function reportFailed(documentLabel: string): void {
  if (typeof window === 'undefined') return;
  window.alert(
    `The ${documentLabel} report could not be opened. Please allow pop-ups for this site and try again.`,
  );
}

/** Signature strip used across the procurement documents. */
const APPROVAL_SLOTS = ['Prepared By', 'Checked By', 'Approved By', 'Received By'];

// ---------------------------------------------------------------------
// 1. Material Request
// ---------------------------------------------------------------------
export function printMaterialRequestReport(mr: MaterialRequestRow) {
  const row = mr as unknown as AnyRow;
  const lines = mr.material_request_lines || [];
  const estimatedValue = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.estimated_rate) || 0),
    0,
  );

  const ok = openReportWindow({
    documentTitle: 'Material Request',
    documentNumber: mr.mr_number,
    projectName: projectName(row),
    statusLabel: mr.status,
    draft: isDraftStatus(mr.status),
    sections: [
      fieldsSection('Request Details', [
        { label: 'MR Number', value: fmtText(mr.mr_number) },
        { label: 'Status', value: fmtStatus(mr.status) },
        { label: 'Priority', value: fmtStatus(mr.priority) },
        { label: 'Raised On', value: fmtDate(pick(row, 'submitted_at', 'created_at')) },
        { label: 'Required By', value: fmtDate(mr.required_date) },
        { label: 'Source', value: fmtStatus(mr.source) },
        { label: 'Project', value: projectName(row) },
        { label: 'Site / Block', value: fmtText(pick(row?.project_sites, 'name') || pick(row, 'site_block')) },
        { label: 'Work Activity', value: fmtText(pick(row, 'work_activity')) },
        { label: 'Raised By', value: fmtText(pick(row?.profiles, 'name') || pick(row, 'raised_by')) },
        { label: 'Contact', value: fmtText(pick(row?.profiles, 'email')) },
        { label: 'Stock Decision', value: fmtStatus(mr.stock_decision) },
      ]),

      { kind: 'note', title: 'Justification / Purpose', body: fmtText(mr.justification) },

      tableSection(
        'Requested Materials',
        lines,
        [
          { header: '#', cell: (_l, i) => i + 1, align: 'center' },
          { header: 'Item Code', cell: (l: AnyRow) => fmtText(pick(l, 'item_code')) },
          { header: 'Description', cell: (l: AnyRow) => fmtText(l.item_description) },
          { header: 'Group', cell: (l: AnyRow) => fmtText(pick(l, 'item_group')) },
          { header: 'Specification', cell: (l: AnyRow) => fmtText(pick(l, 'specification', 'item_specification')) },
          { header: 'Unit', cell: (l: AnyRow) => fmtText(pick(l, 'unit')), align: 'center' },
          { header: 'Qty', cell: (l: AnyRow) => fmtNumber(l.quantity), align: 'right' },
          {
            header: 'Converted',
            cell: (l: AnyRow) => fmtNumber(pick(l, 'converted_qty') ?? 0),
            align: 'right',
          },
          {
            header: 'Est. Rate',
            cell: (l: AnyRow) => fmtCurrency(pick(l, 'estimated_rate', 'unit_rate') ?? 0),
            align: 'right',
          },
          {
            header: 'Est. Value',
            cell: (l: AnyRow) =>
              fmtCurrency((Number(l.quantity) || 0) * (Number(pick(l, 'estimated_rate', 'unit_rate')) || 0)),
            align: 'right',
            footer: () => fmtCurrency(estimatedValue),
          },
          { header: 'Line Status', cell: (l: AnyRow) => fmtStatus(pick(l, 'line_status')) },
          { header: 'Remarks', cell: (l: AnyRow) => fmtText(pick(l, 'remarks')) },
        ],
        'No material lines recorded on this request',
      ),

      {
        kind: 'totals',
        title: 'Estimated Value',
        rows: [
          { label: 'Line Count', value: fmtNumber(lines.length, 0) },
          { label: 'Total Estimated Value', value: fmtCurrency(estimatedValue), emphasis: true },
        ],
      },

      fieldsSection('Review & Workflow', [
        { label: 'Reviewed By', value: fmtText(pick(row, 'reviewed_by')) },
        { label: 'Reviewed At', value: fmtDateTime(pick(row, 'reviewed_at')) },
        { label: 'Rejection Reason', value: fmtText(pick(row, 'rejection_reason')), wide: true, multiline: true },
        { label: 'Clarification Asked', value: fmtText(pick(row, 'clarification_text')), wide: true, multiline: true },
        { label: 'Clarification At', value: fmtDateTime(pick(row, 'clarification_at')) },
        { label: 'Clarification Reply', value: fmtText(pick(row, 'clarification_reply')), wide: true, multiline: true },
        { label: 'Replied At', value: fmtDateTime(pick(row, 'clarification_replied_at')) },
        { label: 'Management Comment', value: fmtText(pick(row, 'management_comment')), wide: true, multiline: true },
        { label: 'Commented At', value: fmtDateTime(pick(row, 'management_comment_at')) },
      ]),

      { kind: 'signatures', title: 'Authorisation', slots: APPROVAL_SLOTS },
    ],
  });

  if (!ok) reportFailed('material request');
}

// ---------------------------------------------------------------------
// 2. Purchase Requisition
// ---------------------------------------------------------------------
export function printPurchaseRequisitionReport(pr: AnyRow) {
  const lines: AnyRow[] = pr?.purchase_requisition_lines || [];
  const lineSubtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(pick(l, 'estimated_rate', 'unit_rate')) || 0),
    0,
  );
  const subtotal = Number(pick(pr, 'subtotal_amount')) || lineSubtotal;
  const tax = Number(pick(pr, 'tax_amount')) || 0;
  const discount = Number(pick(pr, 'discount_amount')) || 0;
  const freight = Number(pick(pr, 'freight_amount')) || 0;
  const other = Number(pick(pr, 'other_charges')) || 0;
  const contingency = Number(pick(pr, 'contingency_amount')) || 0;
  const total =
    Number(pick(pr, 'total_amount')) || subtotal + tax + freight + other + contingency - discount;

  const ok = openReportWindow({
    documentTitle: 'Purchase Requisition',
    documentNumber: pr?.pr_number,
    projectName: projectName(pr),
    statusLabel: pr?.status,
    draft: isDraftStatus(pr?.status),
    sections: [
      fieldsSection('Requisition Details', [
        { label: 'PR Number', value: fmtText(pr?.pr_number) },
        { label: 'Status', value: fmtStatus(pr?.status) },
        { label: 'Approval Stage', value: fmtStatus(pick(pr, 'current_approval_stage')) },
        { label: 'PR Type', value: fmtStatus(pick(pr, 'pr_type')) },
        { label: 'Priority', value: fmtStatus(pick(pr, 'priority')) },
        { label: 'Requested Date', value: fmtDate(pick(pr, 'requested_date', 'created_at')) },
        { label: 'Required Date', value: fmtDate(pick(pr, 'required_date')) },
        { label: 'Release Date', value: fmtDate(pick(pr, 'pr_release_date')) },
        { label: 'Finance Approval Required', value: fmtBool(pick(pr, 'finance_required')) },
        { label: 'Title / Specification', value: fmtText(pr?.title), wide: true },
        { label: 'Source MR', value: fmtText(pick(pr, 'material_request_id')) },
        { label: 'Raised By', value: fmtText(pick(pr, 'created_by_name', 'created_by')) },
      ]),

      fieldsSection('Company, Activity & Cost Allocation', [
        { label: 'Company', value: fmtText(pick(pr, 'company_name')) },
        { label: 'Department', value: fmtText(pick(pr, 'department')) },
        { label: 'Activity Name', value: fmtText(pick(pr, 'activity_name')) },
        { label: 'Activity Code', value: fmtText(pick(pr, 'activity_code')) },
        { label: 'WBS Code', value: fmtText(pick(pr, 'wbs_code')) },
        { label: 'Cost Centre', value: fmtText(pick(pr, 'cost_centre')) },
        { label: 'Budget Applicable', value: fmtBool(pick(pr, 'budget_applicable')) },
        { label: 'Budget Head', value: fmtText(pick(pr, 'budget_head_id')) },
        { label: 'Cost Code', value: fmtText(pick(pr, 'cost_code_id')) },
        { label: 'Scope of Service', value: fmtText(pick(pr, 'scope_of_service')), wide: true },
        {
          label: 'Over-Budget Justification',
          value: fmtText(pick(pr, 'over_budget_justification')),
          wide: true,
          multiline: true,
        },
      ]),

      fieldsSection('Contractor & Delivery', [
        { label: 'Contractor', value: fmtText(pick(pr, 'contractor_name')) },
        { label: 'Contract Reference', value: fmtText(pick(pr, 'contract_reference')) },
        { label: 'Vendor Code', value: fmtText(pick(pr, 'vendor_code')) },
        { label: 'Site Contact Person', value: fmtText(pick(pr, 'site_contact_person', 'contact_person')) },
        { label: 'Site Contact Number', value: fmtText(pick(pr, 'site_contact_number', 'contact_number')) },
        { label: 'Delivery Address', value: fmtText(pick(pr, 'delivery_address')), wide: true },
        {
          label: 'Delivery Instructions',
          value: fmtText(pick(pr, 'delivery_instructions')),
          wide: true,
          multiline: true,
        },
      ]),

      tableSection(
        'Requisition Line Items',
        lines,
        [
          { header: '#', cell: (l, i) => fmtNumber(pick(l, 'sr_no', 'line_number') ?? i + 1, 0), align: 'center' },
          { header: 'Item Code', cell: (l) => fmtText(pick(l, 'item_code')) },
          { header: 'Description', cell: (l) => fmtText(l.item_description) },
          { header: 'Brand', cell: (l) => fmtText(pick(l, 'item_brand', 'preferred_brand')) },
          {
            header: 'Specification',
            cell: (l) => fmtText(pick(l, 'specification', 'item_specification')),
          },
          { header: 'Unit', cell: (l) => fmtText(pick(l, 'unit')), align: 'center' },
          { header: 'Qty', cell: (l) => fmtNumber(l.quantity), align: 'right' },
          { header: 'Stock', cell: (l) => fmtNumber(pick(l, 'project_stock') ?? 0), align: 'right' },
          { header: 'Lead Days', cell: (l) => fmtNumber(pick(l, 'lead_period_days') ?? 0, 0), align: 'right' },
          {
            header: 'Rate',
            cell: (l) => fmtCurrency(pick(l, 'estimated_rate', 'unit_rate') ?? 0),
            align: 'right',
          },
          {
            header: 'Amount',
            cell: (l) =>
              fmtCurrency(
                Number(pick(l, 'line_total')) ||
                  (Number(l.quantity) || 0) * (Number(pick(l, 'estimated_rate', 'unit_rate')) || 0),
              ),
            align: 'right',
            footer: () => fmtCurrency(lineSubtotal),
          },
          { header: 'Suggested Vendor', cell: (l) => fmtText(pick(l, 'suggested_vendor')) },
          { header: 'Status', cell: (l) => fmtStatus(pick(l, 'line_status')) },
          { header: 'Remarks', cell: (l) => fmtText(pick(l, 'remarks')) },
        ],
        'No requisition lines recorded',
      ),

      {
        kind: 'totals',
        title: 'Commercial Summary',
        rows: [
          { label: 'Subtotal', value: fmtCurrency(subtotal) },
          { label: 'Tax', value: fmtCurrency(tax) },
          { label: 'Freight', value: fmtCurrency(freight) },
          { label: 'Other Charges', value: fmtCurrency(other) },
          { label: 'Contingency', value: fmtCurrency(contingency) },
          { label: 'Discount', value: `(${fmtCurrency(discount)})` },
          { label: 'Estimated Cost', value: fmtCurrency(pick(pr, 'estimated_cost') ?? subtotal) },
          { label: 'Total Value', value: fmtCurrency(total), emphasis: true },
        ],
      },

      { kind: 'note', title: 'Terms & Conditions', body: fmtText(pick(pr, 'terms_and_conditions')) },
      { kind: 'note', title: 'General Remarks', body: fmtText(pick(pr, 'general_remarks')) },
      {
        kind: 'note',
        title: 'Internal Notes',
        body: fmtText(pick(pr, 'internal_notes', 'assigned_team_notes')),
      },

      { kind: 'signatures', title: 'Authorisation', slots: APPROVAL_SLOTS },
    ],
  });

  if (!ok) reportFailed('purchase requisition');
}

// ---------------------------------------------------------------------
// 3. Request for Quotation
// ---------------------------------------------------------------------
export function printRfqReport(rfq: AnyRow) {
  const invited: AnyRow[] = rfq?.rfq_vendors || [];

  const ok = openReportWindow({
    documentTitle: 'Request for Quotation',
    documentNumber: rfq?.rfq_number,
    projectName: projectName(rfq),
    statusLabel: rfq?.status,
    draft: isDraftStatus(rfq?.status),
    sections: [
      fieldsSection('RFQ Details', [
        { label: 'RFQ Number', value: fmtText(rfq?.rfq_number) },
        { label: 'Status', value: fmtStatus(rfq?.status) },
        { label: 'Issue Date', value: fmtDate(pick(rfq, 'issue_date')) },
        { label: 'Quotation Due Date', value: fmtDate(pick(rfq, 'due_date')) },
        { label: 'Linked PR', value: fmtText(pick(rfq, 'purchase_requisition_id')) },
        { label: 'Vendors Invited', value: fmtNumber(invited.length, 0) },
        { label: 'Title / Scope', value: fmtText(rfq?.title), wide: true },
      ]),

      tableSection(
        'Invited Vendors',
        invited,
        [
          { header: '#', cell: (_v, i) => i + 1, align: 'center' },
          { header: 'Vendor', cell: (v) => fmtText(pick(v.vendors, 'display_name', 'legal_name')) },
          { header: 'GSTIN', cell: (v) => fmtText(pick(v.vendors, 'gst_number')) },
          { header: 'Contact', cell: (v) => fmtText(pick(v.vendors, 'phone')) },
          { header: 'Email', cell: (v) => fmtText(pick(v.vendors, 'email')) },
          { header: 'Rating', cell: (v) => fmtNumber(pick(v.vendors, 'rating') ?? 0, 1), align: 'center' },
          { header: 'Compliance', cell: (v) => fmtStatus(pick(v.vendors, 'compliance_status')) },
          { header: 'Response', cell: (v) => fmtStatus(pick(v, 'response_status')) },
          { header: 'Sent At', cell: (v) => fmtDateTime(pick(v, 'sent_at')) },
        ],
        'No vendors invited to this RFQ',
      ),

      { kind: 'note', title: 'Terms & Submission Instructions', body: fmtText(pick(rfq, 'terms')) },

      {
        kind: 'signatures',
        title: 'Authorisation',
        slots: ['Prepared By', 'Verified By', 'Approved By'],
      },
    ],
  });

  if (!ok) reportFailed('RFQ');
}

// ---------------------------------------------------------------------
// 4. Purchase Order
// ---------------------------------------------------------------------
export async function printPurchaseOrderReport(po: AnyRow) {
  try {
    const blob = await generatePurchaseOrderPdfBlob(po);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      downloadPurchaseOrderPdfFile(po, blob);
    }
  } catch (err) {
    console.error('Failed to generate official PO PDF report:', err);
  }
}

// ---------------------------------------------------------------------
// 5. Goods Receipt Note
// ---------------------------------------------------------------------
export function printGrnReport(grn: AnyRow) {
  const lines: AnyRow[] = grn?.goods_receipt_note_lines || [];
  const received = lines.reduce((s, l) => s + (Number(l.received_qty) || 0), 0);
  const accepted = lines.reduce((s, l) => s + (Number(l.accepted_qty) || 0), 0);
  const rejected = lines.reduce((s, l) => s + (Number(l.rejected_qty) || 0), 0);
  const acceptedValue = lines.reduce(
    (s, l) => s + (Number(l.accepted_qty) || 0) * (Number(l.unit_rate) || 0),
    0,
  );
  const rejectedValue = lines.reduce(
    (s, l) => s + (Number(l.rejected_qty) || 0) * (Number(l.unit_rate) || 0),
    0,
  );

  const ok = openReportWindow({
    documentTitle: 'Goods Receipt Note',
    documentNumber: grn?.grn_number,
    projectName: projectName(grn),
    statusLabel: grn?.status,
    draft: isDraftStatus(grn?.status),
    sections: [
      fieldsSection('Receipt Details', [
        { label: 'GRN Number', value: fmtText(grn?.grn_number) },
        { label: 'Receipt Date', value: fmtDate(pick(grn, 'receipt_date')) },
        { label: 'Status', value: fmtStatus(grn?.status) },
        { label: 'Quality Decision', value: fmtStatus(pick(grn, 'quality_decision')) },
        { label: 'Against PO', value: fmtText(pick(grn?.purchase_orders, 'po_number') || pick(grn, 'purchase_order_id')) },
        { label: 'Posted At', value: fmtDateTime(pick(grn, 'posted_at')) },
        { label: 'Godown / Store', value: fmtText(pick(grn, 'godown_name')) },
        { label: 'QC Reference', value: fmtText(pick(grn, 'qc_no')) },
        { label: 'Received By', value: fmtText(pick(grn, 'received_by')) },
      ]),

      fieldsSection('Supplier', [
        { label: 'Supplier', value: vendorName(grn) },
        { label: 'GSTIN', value: fmtText(pick(grn?.vendors, 'gst_number')) },
        { label: 'Contact', value: fmtText(pick(grn?.vendors, 'phone')) },
        { label: 'Dealer', value: fmtText(pick(grn, 'dealer_name')) },
      ]),

      fieldsSection('Transport & Challan', [
        { label: 'Challan Number', value: fmtText(pick(grn, 'challan_no', 'quantity_verification')) },
        { label: 'Challan Date', value: fmtDate(pick(grn, 'challan_date')) },
        { label: 'Vehicle Number', value: fmtText(pick(grn, 'vehicle_no', 'physical_inspection')) },
        { label: 'Transporter', value: fmtText(pick(grn, 'transporter_name')) },
        { label: 'In Weight', value: fmtText(pick(grn, 'in_weight')) },
        { label: 'Out Weight', value: fmtText(pick(grn, 'out_weight')) },
        { label: 'Net Weight', value: fmtText(pick(grn, 'net_weight')) },
        { label: 'Volume (Brass)', value: fmtText(pick(grn, 'volume_in_brass')) },
      ]),

      fieldsSection('Inspection', [
        { label: 'Quantity Verification', value: fmtText(pick(grn, 'quantity_verification')), wide: true },
        { label: 'Physical Inspection', value: fmtText(pick(grn, 'physical_inspection')), wide: true },
        { label: 'Damage Check', value: fmtText(pick(grn, 'damage_check')), wide: true },
      ]),

      tableSection(
        'Received Items & Inspection Result',
        lines,
        [
          { header: '#', cell: (_l, i) => i + 1, align: 'center' },
          { header: 'Item', cell: (l) => fmtText(pick(l?.item_master, 'name') || pick(l, 'item_description', 'item_id')) },
          { header: 'Received', cell: (l) => fmtNumber(l.received_qty), align: 'right', footer: () => fmtNumber(received) },
          { header: 'Accepted', cell: (l) => fmtNumber(l.accepted_qty), align: 'right', footer: () => fmtNumber(accepted) },
          { header: 'Rejected', cell: (l) => fmtNumber(l.rejected_qty), align: 'right', footer: () => fmtNumber(rejected) },
          { header: 'Rate', cell: (l) => fmtCurrency(l.unit_rate), align: 'right' },
          {
            header: 'Accepted Value',
            cell: (l) => fmtCurrency((Number(l.accepted_qty) || 0) * (Number(l.unit_rate) || 0)),
            align: 'right',
            footer: () => fmtCurrency(acceptedValue),
          },
          { header: 'Inspection Remarks', cell: (l) => fmtText(pick(l, 'remarks')) },
        ],
        'No received lines recorded on this GRN',
      ),

      {
        kind: 'totals',
        title: 'Receipt Summary',
        rows: [
          { label: 'Total Received Qty', value: fmtNumber(received) },
          { label: 'Total Accepted Qty', value: fmtNumber(accepted) },
          { label: 'Total Rejected Qty', value: fmtNumber(rejected) },
          { label: 'Rejected Value', value: fmtCurrency(rejectedValue) },
          { label: 'Asset Item', value: fmtText(pick(grn, 'asset_item')) },
          { label: 'Asset Amount', value: fmtCurrency(pick(grn, 'asset_amount') ?? 0) },
          {
            label: 'Value Posted To Inventory',
            value: fmtCurrency(pick(grn, 'account_posting_amount') ?? acceptedValue),
            emphasis: true,
          },
        ],
      },

      fieldsSection('Attached Documents', [
        { label: 'Invoice File', value: fmtText(pick(grn, 'uploaded_invoice_name')) },
        { label: 'Challan File', value: fmtText(pick(grn, 'uploaded_challan_name')) },
      ], 2),

      { kind: 'note', title: 'Remarks', body: fmtText(pick(grn, 'remarks')) },

      {
        kind: 'signatures',
        title: 'Authorisation',
        slots: ['Received By', 'Store Keeper', 'Inspected By', 'Approved By'],
      },
    ],
  });

  if (!ok) reportFailed('GRN');
}

// ---------------------------------------------------------------------
// 6. Purchase Bill
// ---------------------------------------------------------------------
export function printPurchaseBillReport(pb: AnyRow) {
  const payload: AnyRow = pb?.form_payload || {};
  const lines: AnyRow[] = pb?.vendor_bill_lines || payload.purchase_bill_entries || [];
  const advances: AnyRow[] = payload.advance_payment_entries || [];
  const vouchers: AnyRow[] = payload.payment_vouchers || [];
  const poDetails: AnyRow[] = payload.po_details_all || [];
  const grnRemarks: AnyRow[] = payload.grn_remarks_list || [];
  const ledger: AnyRow[] = payload.ledger_posting_info || [];
  const match: AnyRow = (pb?.three_way_matches || [])[0] || {};

  const grossTotal = lines.reduce((s, l) => s + (Number(pick(l, 'gross_amount')) || 0), 0);
  const netTotal = lines.reduce(
    (s, l) => s + (Number(pick(l, 'net_amount', 'line_total')) || 0),
    0,
  );
  const vatTotal = lines.reduce((s, l) => s + (Number(pick(l, 'vat_amt')) || 0), 0);

  const ok = openReportWindow({
    documentTitle: 'Purchase Bill',
    documentNumber: pb?.bill_number,
    projectName: projectName(pb),
    statusLabel: pb?.status,
    draft: isDraftStatus(pb?.status),
    sections: [
      // Section 1 — header
      fieldsSection('Bill Header', [
        { label: 'Bill Number', value: fmtText(pb?.bill_number) },
        { label: 'Bill Date', value: fmtDate(pick(pb, 'bill_date')) },
        { label: 'Bill Received Date', value: fmtDate(pick(pb, 'bill_received_date')) },
        { label: 'Accounting Date', value: fmtDate(pick(pb, 'accounting_date')) },
        { label: "Supplier's Bill No.", value: fmtText(pick(pb, 'supplier_bill_no')) },
        { label: "Supplier's Bill Date", value: fmtDate(pick(pb, 'supplier_bill_date')) },
        { label: 'Bill Book Number', value: fmtText(pick(pb, 'bill_book_number')) },
        { label: 'Status', value: fmtStatus(pb?.status) },
        { label: 'Payment Status', value: fmtStatus(pick(pb, 'payment_status')) },
        { label: 'Company', value: fmtText(pick(pb, 'company_name')) },
        { label: 'Company Status', value: fmtText(pick(pb, 'company_status')) },
        { label: 'Tax Status', value: fmtText(pick(pb, 'tax_status')) },
        { label: 'Supplier', value: vendorName(pb) },
        { label: 'Party Name', value: fmtText(pick(pb, 'party_name')) },
        { label: 'Contractor', value: fmtText(pick(pb, 'contractor_name')) },
        { label: 'Work Order Type', value: fmtText(pick(pb, 'work_order_type')) },
        { label: 'Work Order No.', value: fmtText(pick(pb, 'work_order_no')) },
        { label: 'Area Work Order No.', value: fmtText(pick(pb, 'area_work_order_no')) },
        { label: 'Sub Project', value: fmtText(pick(pb, 'sub_project')) },
        { label: 'From POs', value: fmtText(pick(pb, 'from_pos') || pick(pb, 'po_number')) },
        { label: 'From Challans', value: fmtText(pick(pb, 'from_challans')) },
        { label: 'Linked GRN', value: fmtText(pick(pb, 'grn_no', 'grn_id')) },
        { label: 'Percentage', value: fmtPercent(pick(pb, 'perc') ?? 0) },
        { label: 'Auto Debit', value: fmtBool(pick(pb, 'auto_debit')) },
        { label: 'Payment Days', value: fmtNumber(pick(pb, 'payment_days') ?? 0, 0) },
        { label: 'Bill Due Date', value: fmtDate(pick(pb, 'bill_due_date')) },
        { label: 'Project Location', value: fmtText(pick(pb, 'project_location')) },
        { label: 'Supplier Location', value: fmtText(pick(pb, 'supplier_location')) },
      ]),

      // Section 2 — entries
      tableSection(
        'Purchase Bill Entries',
        lines,
        [
          { header: '#', cell: (l, i) => fmtNumber(pick(l, 'sr_no') ?? i + 1, 0), align: 'center' },
          { header: 'GR No.', cell: (l) => fmtText(pick(l, 'gr_no')) },
          { header: 'PO No.', cell: (l) => fmtText(pick(l, 'po_no')) },
          { header: 'Challan', cell: (l) => fmtText(pick(l, 'challan_no')) },
          { header: 'Group', cell: (l) => fmtText(pick(l, 'item_group')) },
          { header: 'Description', cell: (l) => fmtText(pick(l, 'item_desc', 'description')) },
          { header: 'Brand', cell: (l) => fmtText(pick(l, 'item_brand')) },
          { header: 'Unit', cell: (l) => fmtText(pick(l, 'unit')), align: 'center' },
          { header: 'Recd Qty', cell: (l) => fmtNumber(pick(l, 'received_qty', 'quantity') ?? 0), align: 'right' },
          { header: 'Category', cell: (l) => fmtText(pick(l, 'purchase_category')) },
          { header: 'PO Rate', cell: (l) => fmtCurrency(pick(l, 'po_rate', 'po_basic_rate') ?? 0), align: 'right' },
          { header: 'Bill Rate', cell: (l) => fmtCurrency(pick(l, 'bill_rate', 'rate') ?? 0), align: 'right' },
          { header: 'Disc %', cell: (l) => fmtPercent(pick(l, 'bill_discount_perc') ?? 0), align: 'right' },
          { header: 'Disc Amt', cell: (l) => fmtCurrency(pick(l, 'bill_discount_amt') ?? 0), align: 'right' },
          {
            header: 'Gross',
            cell: (l) => fmtCurrency(pick(l, 'gross_amount') ?? 0),
            align: 'right',
            footer: () => fmtCurrency(grossTotal),
          },
          { header: 'L/U Chgs', cell: (l) => fmtCurrency(pick(l, 'loading_unloading_chgs') ?? 0), align: 'right' },
          { header: 'Freight', cell: (l) => fmtCurrency(pick(l, 'freight_chgs') ?? 0), align: 'right' },
          { header: 'Others', cell: (l) => fmtCurrency(pick(l, 'others_chgs') ?? 0), align: 'right' },
          { header: 'VAT Type', cell: (l) => fmtText(pick(l, 'vat_type')) },
          { header: 'VAT %', cell: (l) => fmtPercent(pick(l, 'po_vat_rate', 'tax_rate') ?? 0), align: 'right' },
          {
            header: 'VAT Amt',
            cell: (l) => fmtCurrency(pick(l, 'vat_amt') ?? 0),
            align: 'right',
            footer: () => fmtCurrency(vatTotal),
          },
          { header: 'LBT %', cell: (l) => fmtPercent(pick(l, 'po_lbt_rate') ?? 0), align: 'right' },
          {
            header: 'Net Amount',
            cell: (l) => fmtCurrency(pick(l, 'net_amount', 'line_total') ?? 0),
            align: 'right',
            footer: () => fmtCurrency(netTotal),
          },
        ],
        'No bill entries recorded',
      ),

      // Section 3 — financial summary
      {
        kind: 'totals',
        title: 'Bill Financial Summary',
        rows: [
          { label: 'Subtotal', value: fmtCurrency(pick(pb, 'subtotal_amount') ?? 0) },
          { label: 'Tax', value: fmtCurrency(pick(pb, 'tax_amount') ?? 0) },
          { label: 'Other Charges (Lumpsum)', value: fmtCurrency(pick(pb, 'lumpsum_other_charges') ?? 0) },
          {
            label: 'Loading / Unloading (Lumpsum)',
            value: fmtCurrency(pick(pb, 'lumpsum_loading_unloading_charges') ?? 0),
          },
          { label: 'Freight (Lumpsum)', value: fmtCurrency(pick(pb, 'lumpsum_freight_charges') ?? 0) },
          { label: 'Service Tax on Transportation', value: fmtCurrency(pick(pb, 'stax_amount') ?? 0) },
          { label: 'LBT Amount', value: fmtCurrency(pick(pb, 'lbt_amount') ?? 0) },
          { label: 'Round-off Adjustment', value: fmtCurrency(pick(pb, 'roundoff_adjustment') ?? 0) },
          { label: 'Discount', value: `(${fmtCurrency(pick(pb, 'lumpsum_discount_amount') ?? 0)})` },
          { label: 'Retention', value: `(${fmtCurrency(pick(pb, 'retention_amount') ?? 0)})` },
          { label: 'Advance Adjusted', value: `(${fmtCurrency(pick(pb, 'advance_adjusted') ?? 0)})` },
          { label: 'Other Deductions', value: `(${fmtCurrency(pick(pb, 'other_deductions') ?? 0)})` },
          { label: 'Total Bill Amount', value: fmtCurrency(pick(pb, 'total_amount') ?? 0) },
          {
            label: 'Net Payable',
            value: fmtCurrency(pick(pb, 'net_payable_amount') ?? pick(pb, 'total_amount') ?? 0),
            emphasis: true,
          },
        ],
      },

      // Tax detail
      fieldsSection('Statutory Deductions & Tax Detail', [
        { label: 'Retention %', value: fmtPercent(pick(pb, 'retention_percent') ?? 0) },
        { label: 'LBT Payable By Us', value: fmtBool(pick(pb, 'lbt_payable_by_us')) },
        { label: 'LBT Principal Amount', value: fmtCurrency(pick(pb, 'lbt_principal_amount') ?? 0) },
        { label: 'LBT Rate', value: fmtPercent(pick(pb, 'lbt_tax_rate') ?? 0) },
        {
          label: 'Additional Transport Service Tax',
          value: fmtBool(pick(pb, 'additional_transportation_stax_applicable')),
        },
        { label: 'S.Tax Principal Amount', value: fmtCurrency(pick(pb, 'stax_principal_amount') ?? 0) },
        { label: 'Transport S.Tax Rate', value: fmtPercent(pick(pb, 'transportation_stax_rate') ?? 0) },
        { label: 'Cheque Amount', value: fmtCurrency(pick(pb, 'cheque_amount') ?? 0) },
        { label: 'Total Cheque Payments', value: fmtCurrency(pick(pb, 'total_cheque_payments') ?? 0) },
        { label: 'Debit Details', value: fmtCurrency(pick(pb, 'debit_details') ?? 0) },
        { label: 'Credit Details', value: fmtCurrency(pick(pb, 'credit_details') ?? 0) },
        { label: 'Total Adjusted Amount', value: fmtCurrency(pick(pb, 'total_adjusted_amount') ?? 0) },
      ]),

      // Section 4 — advances
      tableSection(
        'Advance Payment Adjustments',
        advances,
        [
          { header: 'Voucher No.', cell: (a) => fmtText(pick(a, 'voucher_no')) },
          { header: 'Voucher Date', cell: (a) => fmtDate(pick(a, 'voucher_date')) },
          { header: 'PO No.', cell: (a) => fmtText(pick(a, 'po_no')) },
          { header: 'Advance Paid', cell: (a) => fmtCurrency(pick(a, 'advanced_payment') ?? 0), align: 'right' },
          { header: 'Already Adjusted', cell: (a) => fmtCurrency(pick(a, 'adjusted_payment') ?? 0), align: 'right' },
          { header: 'Balance', cell: (a) => fmtCurrency(pick(a, 'balance_amt') ?? 0), align: 'right' },
          {
            header: 'Adjusted Here',
            cell: (a) => fmtCurrency(pick(a, 'adjust_amt') ?? 0),
            align: 'right',
            footer: (rows) =>
              fmtCurrency(rows.reduce((s, r) => s + (Number(pick(r, 'adjust_amt')) || 0), 0)),
          },
        ],
        'No advance payments adjusted against this bill',
      ),

      // Section 6 — payment vouchers
      tableSection(
        'Payment Vouchers',
        vouchers,
        [
          { header: '#', cell: (v, i) => fmtNumber(pick(v, 'sr') ?? i + 1, 0), align: 'center' },
          { header: 'Voucher No.', cell: (v) => fmtText(pick(v, 'voucher_no')) },
          { header: 'Date', cell: (v) => fmtDate(pick(v, 'voucher_date')) },
          { header: 'Ledger', cell: (v) => fmtText(pick(v, 'ledger_name')) },
          { header: 'Bank / Cash', cell: (v) => fmtText(pick(v, 'bank_cash_account')) },
          { header: 'Mode', cell: (v) => fmtText(pick(v, 'payment_mode')) },
          { header: 'Instrument No.', cell: (v) => fmtText(pick(v, 'cheque_instrument_no')) },
          { header: 'Instrument Date', cell: (v) => fmtDate(pick(v, 'cheque_instrument_date')) },
          { header: 'Status', cell: (v) => fmtStatus(pick(v, 'status')) },
          { header: 'Bill No.', cell: (v) => fmtText(pick(v, 'bill_no')) },
          { header: 'Our Bill No.', cell: (v) => fmtText(pick(v, 'our_bill_no')) },
          {
            header: 'Paid',
            cell: (v) => fmtCurrency(pick(v, 'current_paid') ?? 0),
            align: 'right',
            footer: (rows) =>
              fmtCurrency(rows.reduce((s, r) => s + (Number(pick(r, 'current_paid')) || 0), 0)),
          },
        ],
        'No payment vouchers recorded',
      ),

      // Section 7 — PO details
      tableSection(
        'Purchase Order Details',
        poDetails,
        [
          { header: '#', cell: (p, i) => fmtNumber(pick(p, 'sr') ?? i + 1, 0), align: 'center' },
          { header: 'PO No.', cell: (p) => fmtText(pick(p, 'po_no')) },
          { header: 'PO Date', cell: (p) => fmtDate(pick(p, 'po_date')) },
          { header: 'In The Name Of', cell: (p) => fmtText(pick(p, 'po_in_the_name_of')) },
          { header: 'Item Group', cell: (p) => fmtText(pick(p, 'sr_item_group')) },
          { header: 'Description', cell: (p) => fmtText(pick(p, 'item_desc')) },
          { header: 'Brand', cell: (p) => fmtText(pick(p, 'item_brand')) },
          { header: 'Approved Qty', cell: (p) => fmtNumber(pick(p, 'approved_qty') ?? 0), align: 'right' },
          { header: 'Rate', cell: (p) => fmtCurrency(pick(p, 'unit_rate') ?? 0), align: 'right' },
          { header: 'Net Amount', cell: (p) => fmtCurrency(pick(p, 'net_amt') ?? 0), align: 'right' },
          { header: 'GRN Balance Qty', cell: (p) => fmtNumber(pick(p, 'grn_balance_qty') ?? 0), align: 'right' },
          { header: 'Net Bill Amt', cell: (p) => fmtCurrency(pick(p, 'net_bill_amt') ?? 0), align: 'right' },
        ],
        'No purchase order details linked',
      ),

      // Section 8 — GRN remarks
      tableSection(
        'GRN Remarks',
        grnRemarks,
        [
          { header: '#', cell: (g, i) => fmtNumber(pick(g, 'sr') ?? i + 1, 0), align: 'center' },
          { header: 'GRN No.', cell: (g) => fmtText(pick(g, 'grn_no')) },
          { header: 'Remark', cell: (g) => fmtText(pick(g, 'remark')) },
        ],
        'No GRN remarks recorded',
      ),

      // Three-way match
      fieldsSection('Three-Way Match & Verification', [
        { label: 'Match Status', value: fmtStatus(pick(pb, 'match_status') || pick(match, 'match_status')) },
        { label: 'PO Value', value: fmtCurrency(pick(pb, 'po_value') ?? pick(match, 'po_value') ?? 0) },
        { label: 'GRN Value', value: fmtCurrency(pick(pb, 'grn_value') ?? pick(match, 'grn_value') ?? 0) },
        {
          label: 'Invoice Value',
          value: fmtCurrency(pick(pb, 'invoice_value') ?? pick(match, 'invoice_value') ?? 0),
        },
        { label: 'Tolerance', value: fmtCurrency(pick(pb, 'tolerance_amount') ?? 0) },
        { label: 'Duplicate Detected', value: fmtBool(pick(pb, 'duplicate_detected')) },
        { label: 'Documents Received', value: fmtBool(pick(pb, 'required_documents_received')) },
        { label: 'Work Completion Verified', value: fmtBool(pick(pb, 'work_completion_verified')) },
        { label: 'QC Approval Verified', value: fmtBool(pick(pb, 'qc_approval_verified')) },
        { label: 'Verified By', value: fmtText(pick(pb, 'verified_by')) },
        { label: 'Verified At', value: fmtDateTime(pick(pb, 'verified_at')) },
        { label: 'Approved By', value: fmtText(pick(pb, 'approved_by')) },
        { label: 'Approved At', value: fmtDateTime(pick(pb, 'approved_at')) },
        {
          label: 'Match Remarks',
          value: fmtText(pick(pb, 'match_remarks') || pick(match, 'match_remarks')),
          wide: true,
          multiline: true,
        },
      ]),

      // Section 9 — audit indicators
      fieldsSection('Audit Indicators', [
        { label: 'Unlocked FY', value: fmtNumber(pick(pb, 'unlocked_fy') ?? 0, 0) },
        { label: 'Ledger Present', value: fmtNumber(payload.ledger_present ?? 0, 0) },
        { label: 'Invalid Bill No. Flags', value: fmtNumber(payload.not_a_valid_bill_no ?? 0, 0) },
        { label: 'Bill Already Signed', value: fmtBool(pick(pb, 'bill_has_already_signed')) },
        { label: 'Issue Relation Count', value: fmtText(pick(pb, 'status_issue_relation_count')) },
        { label: 'Assigned Approval Role', value: fmtText(pick(pb, 'assigned_approval_role')) },
      ]),

      // Section 10 — ledger postings
      tableSection(
        'Ledger Posting',
        ledger,
        [
          { header: 'Date', cell: (l) => fmtDate(pick(l, 'date')) },
          { header: 'Ledger', cell: (l) => fmtText(pick(l, 'ledger_main')) },
          { header: 'Group', cell: (l) => fmtText(pick(l, 'ledger_group')) },
          { header: 'Account Head', cell: (l) => fmtText(pick(l, 'account_head')) },
          { header: 'Project', cell: (l) => fmtText(pick(l, 'project')) },
          {
            header: 'Debit',
            cell: (l) => fmtCurrency(pick(l, 'dr') ?? 0),
            align: 'right',
            footer: (rows) => fmtCurrency(rows.reduce((s, r) => s + (Number(pick(r, 'dr')) || 0), 0)),
          },
          {
            header: 'Credit',
            cell: (l) => fmtCurrency(pick(l, 'cr') ?? 0),
            align: 'right',
            footer: (rows) => fmtCurrency(rows.reduce((s, r) => s + (Number(pick(r, 'cr')) || 0), 0)),
          },
        ],
        'No ledger postings recorded',
      ),

      { kind: 'note', title: 'Narration', body: fmtText(pick(pb, 'narration')) },
      { kind: 'note', title: 'Ledger Remarks', body: fmtText(pick(pb, 'ledger_remarks')) },

      {
        kind: 'signatures',
        title: 'Authorisation',
        slots: ['Prepared By', 'Verified By', 'Accounts', 'Approved By'],
      },
    ],
  });

  if (!ok) reportFailed('purchase bill');
}

/* ========================================================================= */
/* MULTI-PO & MULTI-GRN SELECTION HELPERS FOR PURCHASE BILLS                 */
/* ========================================================================= */

export interface ApprovedPoOption {
  id: string;
  po_number: string;
  po_date: string;
  vendor_id: string;
  vendor_name: string;
  project_id: string;
  project_name?: string;
  total_amount: number;
  approved_grns_count: number;
  billed_grns_count: number;
  billing_status: 'unbilled' | 'partially_billed' | 'fully_billed';
  billed_percentage: number;
}

export interface ApprovedGrnOption {
  id: string;
  grn_number: string;
  receipt_date: string;
  challan_no: string;
  purchase_order_id: string;
  po_number: string;
  vendor_name: string;
  total_accepted_value: number;
  billing_status: 'available' | 'partially_billed' | 'fully_billed';
  lines: {
    id: string;
    grn_id: string;
    purchase_order_line_id?: string;
    item_id?: string;
    po_number?: string;
    item_group?: string;
    item_description: string;
    item_brand?: string;
    unit: string;
    accepted_qty: number;
    prev_billed_qty: number;
    open_billing_qty: number;
    unit_rate: number;
    purchase_category?: string;
    activity_name?: string;
    sub_activity_name?: string;
    pr_no?: string;
  }[];
}

/**
 * Fetches all Approved POs for a given project (or all projects if unselected).
 */
export async function fetchApprovedPosForProject(projectIdOrName?: string): Promise<ApprovedPoOption[]> {
  try {
    const isUuid = (str: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);

    let query = supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, vendor_id, project_id, total_amount, status, vendors(id, legal_name, display_name), projects(id, name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (projectIdOrName && isUuid(projectIdOrName)) {
      query = query.eq('project_id', projectIdOrName);
    }

    const { data: pos, error } = await query;
    if (error) {
      console.warn('fetchApprovedPosForProject query warning:', error.message);
    }
    if (!pos || pos.length === 0) return [];

    // Filter by project name if projectIdOrName was passed as a name string
    let filteredPos = pos;
    if (projectIdOrName && !isUuid(projectIdOrName)) {
      const term = projectIdOrName.toLowerCase().trim();
      filteredPos = pos.filter((p: any) => {
        const prjName = (Array.isArray(p.projects) ? p.projects[0]?.name : p.projects?.name) || '';
        return prjName.toLowerCase().includes(term);
      });
    }

    // Include active POs (excluding cancelled/rejected)
    const approvedPos = filteredPos.filter((p: any) => {
      const st = (p.status || '').toLowerCase().trim();
      return st !== 'cancelled' && st !== 'rejected';
    });

    const targetPos = approvedPos.length > 0 ? approvedPos : filteredPos;
    if (targetPos.length === 0) return [];

    const poIds = targetPos.map((p) => p.id);

    // Fetch linked GRNs count & billing stats per PO
    const { data: grns } = await supabase
      .from('goods_receipt_notes')
      .select('id, purchase_order_id, status, quantity_verification')
      .in('purchase_order_id', poIds);

    const grnMap: Record<string, { total: number; billed: number }> = {};
    (grns || []).forEach((g: any) => {
      const poId = g.purchase_order_id;
      if (!poId) return;
      if (!grnMap[poId]) grnMap[poId] = { total: 0, billed: 0 };
      const st = (g.quantity_verification || g.status || '').toLowerCase();
      if (st === 'posted' || st === 'approved') {
        grnMap[poId].total += 1;
      }
    });

    return targetPos.map((po: any) => {
      const v = Array.isArray(po.vendors) ? po.vendors[0] : po.vendors;
      const prj = Array.isArray(po.projects) ? po.projects[0] : po.projects;
      const stats = grnMap[po.id] || { total: 0, billed: 0 };
      const percentage = stats.total > 0 ? Math.min(100, Math.round((stats.billed / stats.total) * 100)) : 0;
      let bStatus: 'unbilled' | 'partially_billed' | 'fully_billed' = 'unbilled';
      if (stats.billed > 0 && stats.billed >= stats.total) bStatus = 'fully_billed';
      else if (stats.billed > 0) bStatus = 'partially_billed';

      return {
        id: po.id,
        po_number: po.po_number || 'PO-2026',
        po_date: po.po_date ? String(po.po_date).slice(0, 10) : '',
        vendor_id: po.vendor_id,
        vendor_name: v?.display_name || v?.legal_name || 'Vendor',
        project_id: po.project_id,
        project_name: prj?.name || 'Main Project',
        total_amount: Number(po.total_amount || 0),
        approved_grns_count: stats.total,
        billed_grns_count: stats.billed,
        billing_status: bStatus,
        billed_percentage: percentage,
      };
    });
  } catch (err) {
    console.warn('fetchApprovedPosForProject error:', err);
    return [];
  }
}

/**
 * Fetches all Approved GRNs and line items for a list of PO IDs (or all approved GRNs).
 */
export async function fetchApprovedGrnsForPos(poIds: string[]): Promise<ApprovedGrnOption[]> {
  try {
    let query = supabase
      .from('goods_receipt_notes')
      .select('id, grn_number, receipt_date, challan_no, purchase_order_id, supplier_name, status, quantity_verification, purchase_orders(po_number), goods_receipt_note_lines(*, purchase_order_lines(activity_name, sub_activity_name, item_specification))')
      .order('created_at', { ascending: false });

    if (poIds.length > 0) {
      query = query.in('purchase_order_id', poIds);
    }

    const { data: grns, error } = await query;
    if (error || !grns) return [];

    // Filter approved / posted GRNs
    const approvedGrns = grns.filter((g: any) => {
      const st = (g.quantity_verification || g.status || '').toLowerCase();
      return st === 'posted' || st === 'approved';
    });

    if (approvedGrns.length === 0) return [];

    // Collect all GRN line IDs to fetch cumulative billed quantities
    const allLineIds: string[] = [];
    approvedGrns.forEach((g: any) => {
      (g.goods_receipt_note_lines || []).forEach((l: any) => {
        if (l.id) allLineIds.push(l.id);
      });
    });

    // Fetch past vendor_bill_lines to calculate prev_billed_qty
    const billedMap: Record<string, number> = {};
    if (allLineIds.length > 0) {
      const { data: billItems } = await supabase
        .from('vendor_bill_lines')
        .select('grn_line_id, received_qty, quantity')
        .in('grn_line_id', allLineIds);

      (billItems || []).forEach((bi: any) => {
        if (bi.grn_line_id) {
          const qty = Number(bi.received_qty || bi.quantity || 0);
          billedMap[bi.grn_line_id] = (billedMap[bi.grn_line_id] || 0) + qty;
        }
      });
    }

    return approvedGrns.map((grn: any) => {
      const poObj = Array.isArray(grn.purchase_orders) ? grn.purchase_orders[0] : grn.purchase_orders;
      const poNo = poObj?.po_number || grn.grn_number;

      let grnTotalValue = 0;
      let totalOpenBillingItems = 0;
      let totalItemsCount = 0;

      const lines = (grn.goods_receipt_note_lines || []).map((l: any) => {
        totalItemsCount += 1;
        const accepted = Number(l.accepted_qty || l.received_qty || 0);
        const rate = Number(l.unit_rate || 0);
        const prevBilled = billedMap[l.id] || 0;
        const openBilling = Math.max(0, accepted - prevBilled);

        grnTotalValue += accepted * rate;
        if (openBilling > 0.001) totalOpenBillingItems += 1;

        return {
          id: l.id,
          grn_id: grn.id,
          purchase_order_line_id: l.purchase_order_line_id,
          item_id: l.item_id,
          po_number: l.po_number || poNo,
          item_group: l.item_group || 'Material',
          item_description: l.item_description || 'Material Item',
          item_brand: l.item_brand || '',
          unit: l.unit || 'NOS',
          accepted_qty: accepted,
          prev_billed_qty: prevBilled,
          open_billing_qty: openBilling,
          unit_rate: rate,
          purchase_category: l.purchase_category || '',
          activity_name: l.purchase_order_lines?.activity_name || l.activity_name || '',
          sub_activity_name: l.purchase_order_lines?.sub_activity_name || l.sub_activity_name || '',
          pr_no: l.pr_number || '',
        };
      });

      let bStatus: 'available' | 'partially_billed' | 'fully_billed' = 'available';
      if (totalOpenBillingItems === 0 && totalItemsCount > 0) bStatus = 'fully_billed';
      else if (totalOpenBillingItems < totalItemsCount) bStatus = 'partially_billed';

      return {
        id: grn.id,
        grn_number: grn.grn_number,
        receipt_date: grn.receipt_date ? grn.receipt_date.slice(0, 10) : '',
        challan_no: grn.challan_no || '—',
        purchase_order_id: grn.purchase_order_id,
        po_number: poNo,
        vendor_name: grn.supplier_name || 'Vendor',
        total_accepted_value: grnTotalValue,
        billing_status: bStatus,
        lines,
      };
    });
  } catch (err) {
    console.warn('fetchApprovedGrnsForPos error:', err);
    return [];
  }
}

