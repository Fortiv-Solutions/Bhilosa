import { supabase, getDbSiteId, getSupabaseJsonHeaders } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { normalizeDatabaseRole, type Role } from '@/lib/roles';
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

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

export type ProcurementStatus = 'draft' | 'submitted' | 'in_review' | 'under_verification' | 'pending_approval' | 'approved' | 'partially_approved' | 'rejected' | 'assigned' | 'rfq_sent' | 'vendor_selected' | 'po_issued' | 'delivered' | 'closed' | 'cancelled' | 'auto_draft_pr';

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
  submitted_at: string | null;
  created_at: string;
  updated_at?: string;
  // Extended fields from migration 20260624060000
  title?: string | null;
  company_name?: string | null;
  activity_code?: string | null;
  work_activity: string | null;
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
    name: string | null;
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
  created_by?: string | null;
  created_by_name?: string | null;
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
  project_stock?: number | null;
  other_project_stock?: number | null;
  relation_count?: number | null;
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
  po_date?: string;
  total_amount: number;
  subtotal_amount?: number;
  tax_amount?: number;
  status: string;
  delivery_date: string | null;
  delivery_location?: string | null;
  payment_terms?: string | null;
  terms_and_conditions?: string | null;
  pdf_storage_path?: string | null;
  created_at?: string;
  vendors?: VendorRow | null;
  purchase_order_lines?: ProcurementLineRow[];
  po_lines?: ProcurementLineRow[];
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
};

export type PurchaseOrderPdfResult = {
  purchaseOrderId: string;
  storagePath: string;
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
};

export type ProcurementProjectOption = {
  id: string;
  name: string;
  code?: string;
  project_sites?: { id: string; name: string; is_active?: boolean }[];
};

export type CreateMaterialRequestInput = {
  projectId: string;
  siteId?: string | null;
  title: string;
  requiredDate: string;
  priority: MaterialRequestRow['priority'];
  lines: {
    itemDescription: string;
    quantity: number;
    estimatedRate: number;
  }[];
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
async function nextDocumentNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_document_number', { p_prefix: prefix });
  if (error) throw new Error(`Could not allocate a ${prefix} number: ${error.message}`);
  if (!data || typeof data !== 'string') throw new Error(`Could not allocate a ${prefix} number.`);
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
async function currentProfileId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return null;

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .is('deleted_at', null)
      .eq('is_active', true)
      .maybeSingle();

    return userProfile?.id ?? null;
  } catch {
    return null;
  }
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
export const mockPurchaseRequisitionsStore: PurchaseRequisitionRow[] = [];

export async function listProcurementDashboard(projectId?: string): Promise<ProcurementDashboardData> {
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
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
    ),
    projectFilter(
      supabase
        .from('purchase_requisitions')
        .select('*, purchase_requisition_lines(*)')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('rfqs')
        .select('*, rfq_vendors(*, vendors(id, legal_name, display_name, rating, gst_number, phone, email, compliance_status))')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('vendor_quotations')
        .select('*, vendors(id, legal_name, display_name, rating), quotation_lines(*)')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('vendor_selections')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('purchase_orders')
        .select('*, vendors(id, legal_name, display_name, rating), purchase_order_lines(*)')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('goods_receipt_notes')
        .select('*, vendors(id, legal_name, display_name), purchase_orders(po_number), goods_receipt_note_lines(*)')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('vendor_bills')
        .select('*, vendors(id, legal_name, display_name, rating)')
        .order('created_at', { ascending: false })
        .limit(50),
    ),
    projectFilter(
      supabase
        .from('stock_balances')
        .select('*, item_master(name)')
        .limit(50),
    ),
    supabase.from('vendors').select('id, legal_name, display_name, rating, gst_number, phone, email, compliance_status').eq('is_active', true).order('legal_name').limit(100),
    projectFilter(
      supabase
        .from('entity_attachments')
        .select('*')
        .eq('entity_table', 'purchase_requisitions')
        .order('created_at', { ascending: false })
        .limit(100),
    ),
  ]);

  // Only the core MR/PR queries are fatal — a genuine auth/RLS failure there must surface.
  // Downstream pipeline tables (RFQ→PO→GRN→Bill) degrade to [] so the dashboard still renders
  // even when an optional table has not been migrated yet (e.g. vendor_bills before the
  // reconciliation migration is applied). Their errors are surfaced as console warnings.
  const coreFailed = [materialRequests, purchaseRequisitions].find((response) => response.error);
  if (coreFailed?.error) throw new Error(coreFailed.error.message);
  const optional: Array<[string, { error: { message: string } | null }]> = [
    ['rfqs', rfqs], ['quotations', quotations], ['vendorSelections', vendorSelections],
    ['purchaseOrders', purchaseOrders], ['grns', grns], ['vendorBills', vendorBills],
    ['inventorySnapshots', inventorySnapshots], ['vendors', vendors],
    ['prAttachments', prAttachments],
  ];
  for (const [name, response] of optional) {
    if (response.error) console.warn(`[procurement] optional dashboard query "${name}" failed: ${response.error.message}`);
  }

  return {
    materialRequests: (materialRequests.data ?? []) as MaterialRequestRow[],
    purchaseRequisitions: (purchaseRequisitions.data ?? []) as PurchaseRequisitionRow[],
    rfqs: (rfqs.data ?? []) as RfqRow[],
    quotations: (quotations.data ?? []) as QuotationRow[],
    vendorSelections: (vendorSelections.data ?? []) as VendorSelectionRow[],
    purchaseOrders: (purchaseOrders.data ?? []) as PurchaseOrderRow[],
    grns: (grns.data ?? []) as GrnRow[],
    vendorBills: (vendorBills.data ?? []) as VendorBillRow[],
    inventorySnapshots: (inventorySnapshots.data ?? []) as InventorySnapshotRow[],
    vendors: (vendors.data ?? []) as VendorRow[],
    prAttachments: (prAttachments.data ?? []) as EntityAttachmentRow[],
  };
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
          item_description: l.itemDescription,
          quantity: l.quantity,
          estimated_rate: l.estimatedRate,
          unit_rate: l.estimatedRate,
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
      p_lines: input.lines.map((line) => ({
        itemDescription: line.itemDescription,
        quantity: line.quantity,
        estimatedRate: line.estimatedRate,
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
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');

    const { error } = await supabase
      .from('material_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
        updated_by: profileId,
      })
      .eq('id', materialRequest.id);

    if (error) throw new Error(error.message);
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
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');

    const { error } = await supabase
      .from('material_requests')
      .update({
        status: 'in_review',
        reviewed_by: profileId,
        reviewed_at: new Date().toISOString(),
        updated_by: profileId,
      })
      .eq('id', materialRequest.id);

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Sends a clarification question to the site engineer about a material request.
 * Sets status to 'draft' to indicate it needs site's response.
 */
export async function askMrClarification(
  materialRequest: MaterialRequestRow,
  question: string,
): Promise<MutationResult> {
  try {
    if (!question.trim()) throw new Error('Clarification message cannot be empty.');
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');

    const { error } = await supabase
      .from('material_requests')
      .update({
        status: 'draft',
        clarification_text: question.trim(),
        clarification_at: new Date().toISOString(),
        clarification_by: profileId,
        updated_by: profileId,
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
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');

    const { error } = await supabase
      .from('material_requests')
      .update({
        management_comment: comment.trim(),
        management_comment_at: new Date().toISOString(),
        management_comment_by: profileId,
        updated_by: profileId,
      })
      .eq('id', materialRequest.id);

    if (error) throw new Error(error.message);
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
  lines?: {
    item_description: string;
    quantity: number;
    estimated_rate: number;
    item_id?: string | null;
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
        mr.status = isPartial ? 'partially_approved' : 'approved';
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
        activity_name: materialRequest.work_activity ?? null,
        activity_code: materialRequest.activity_code ?? null,
        company_name: materialRequest.company_name ?? null,
        priority: materialRequest.priority ?? 'normal',
        pr_type: 'material',
        wbs_code: materialRequest.site_block ?? null,
        delivery_address: materialRequest.projects?.name ?? null,
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
          item_code: ('item_code' in line && typeof line.item_code === 'string') ? line.item_code : `MAT-${String(idx + 1).padStart(3, '0')}`,
          item_group: ('item_group' in line && typeof line.item_group === 'string') ? line.item_group : 'General Construction',
          item_description: line.item_description,
          specification: ('specification' in line && typeof line.specification === 'string') ? line.specification : ('item_specification' in line && typeof line.item_specification === 'string' ? line.item_specification : ''),
          unit: ('unit' in line && typeof line.unit === 'string') ? line.unit : 'nos',
          quantity: line.quantity,
          ind_qty: line.quantity,
          est_qty: line.quantity,
          approved_mr_qty: line.quantity,
          estimated_rate: line.estimated_rate ?? 0,
          line_total: Number(line.quantity || 0) * Number(line.estimated_rate || 0),
          required_date: ('required_date' in line && typeof line.required_date === 'string') ? line.required_date : materialRequest.required_date,
          preferred_brand: ('preferred_brand' in line && typeof line.preferred_brand === 'string') ? line.preferred_brand : ('item_brand' in line && typeof line.item_brand === 'string' ? line.item_brand : ''),
          suggested_vendor: ('suggested_vendor' in line && typeof line.suggested_vendor === 'string') ? line.suggested_vendor : '',
          delivery_location: materialRequest.projects?.name ?? 'Project Site Store',
          priority: materialRequest.priority,
          stock_audit: (('project_stock' in line && typeof line.project_stock === 'number' ? line.project_stock : 0) > 0) ? 'Stock Available' : 'Stock Shortage',
          project_and_block: materialRequest.projects?.name ?? materialRequest.project_id,
          work_activity: materialRequest.work_activity ?? 'General Site Activity',
          raised_by: materialRequest.profiles?.name ?? materialRequest.raised_by ?? 'Site Engineer',
          submitted_at: materialRequest.submitted_at ?? materialRequest.created_at,
        })),
      };

      mockPurchaseRequisitionsStore.unshift(newPr);
      return { data: { purchaseRequisitionId: newPrId }, error: null };
    }

    const profileId = await currentProfileId();

    const { data: existing } = await supabase
      .from('purchase_requisitions')
      .select('id')
      .eq('material_request_id', materialRequest.id)
      .limit(1)
      .maybeSingle();
      
    if (existing) {
      throw new Error('A Purchase Requisition has already been created for this Material Request.');
    }

    const lines = input.lines || materialRequest.material_request_lines || [];
    const estimatedCost = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.estimated_rate ?? 0), 0);
    const { data: pr, error } = await supabase
      .from('purchase_requisitions')
      .insert({
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
        activity_name: materialRequest.work_activity ?? null,
        company_name: materialRequest.company_name ?? null,
        priority: materialRequest.priority ?? 'normal',
        pr_type: 'material',
        wbs_code: materialRequest.site_block ?? null,
        delivery_address: materialRequest.projects?.name ?? null,
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const purchaseRequisitionId = (pr as { id: string }).id;

    if (lines.length > 0) {
      const { error: lineError } = await supabase.from('purchase_requisition_lines').insert(
        lines.map((line, idx) => ({
          purchase_requisition_id: purchaseRequisitionId,
          project_id: materialRequest.project_id,
          source_mr_id: materialRequest.id,
          source_mr_number: materialRequest.mr_number,
          mr_line_number: idx + 1,
          material_request_line_id: ('material_request_line_id' in line && typeof line.material_request_line_id === 'string') ? line.material_request_line_id : (('id' in line && typeof (line as { id?: string }).id === 'string') ? (line as { id: string }).id : null),
          resource_type: 'material',
          item_code: ('item_code' in line && typeof line.item_code === 'string') ? line.item_code : `MAT-${String(idx + 1).padStart(3, '0')}`,
          item_group: ('item_group' in line && typeof line.item_group === 'string') ? line.item_group : 'General Construction',
          item_description: line.item_description,
          specification: ('specification' in line && typeof line.specification === 'string') ? line.specification : ('item_specification' in line && typeof line.item_specification === 'string' ? line.item_specification : ''),
          unit: ('unit' in line && typeof line.unit === 'string') ? line.unit : 'nos',
          quantity: line.quantity,
          ind_qty: line.quantity,
          est_qty: line.quantity,
          approved_mr_qty: line.quantity,
          estimated_rate: line.estimated_rate ?? 0,
          line_total: Number(line.quantity || 0) * Number(line.estimated_rate || 0),
          required_date: ('required_date' in line && typeof line.required_date === 'string') ? line.required_date : materialRequest.required_date,
          preferred_brand: ('preferred_brand' in line && typeof line.preferred_brand === 'string') ? line.preferred_brand : ('item_brand' in line && typeof line.item_brand === 'string' ? line.item_brand : ''),
          suggested_vendor: ('suggested_vendor' in line && typeof line.suggested_vendor === 'string') ? line.suggested_vendor : '',
          delivery_location: materialRequest.projects?.name ?? 'Project Site Store',
          priority: materialRequest.priority,
          stock_audit: (('project_stock' in line && typeof line.project_stock === 'number' ? line.project_stock : 0) > 0) ? 'Stock Available' : 'Stock Shortage',
          project_and_block: materialRequest.projects?.name ?? materialRequest.project_id,
          work_activity: materialRequest.work_activity ?? 'General Site Activity',
          raised_by: materialRequest.profiles?.name ?? materialRequest.raised_by ?? 'Site Engineer',
          submitted_at: materialRequest.submitted_at ?? materialRequest.created_at,
          created_by: profileId,
          updated_by: profileId,
        })),
      );
      if (lineError) throw new Error(lineError.message);
    }

      const totalMrLines = materialRequest.material_request_lines?.length || lines.length;
      const isPartial = lines.length < totalMrLines;
      const nextMrStatus = isPartial ? 'partially_approved' : 'approved';

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

      await supabase.from('material_requests').update({ status: nextMrStatus, updated_by: profileId }).eq('id', materialRequest.id);
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

export async function createRfqFromPr(pr: PurchaseRequisitionRow, vendorIds: string[]): Promise<MutationResult<{ rfqId: string }>> {
  try {
    const profileId = await currentProfileId();
    if (pr.status !== 'approved') {
      throw new Error('RFQ can be created only after the purchase requisition is approved.');
    }
    if (vendorIds.length === 0) {
      throw new Error('Select at least one vendor before creating an RFQ.');
    }

    const { data: existingRfq, error: existingError } = await supabase
      .from('rfqs')
      .select('id')
      .eq('purchase_requisition_id', pr.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existingRfq) throw new Error('An RFQ already exists for this purchase requisition.');

    const { data: rfq, error } = await supabase
      .from('rfqs')
      .insert({
        project_id: pr.project_id,
        purchase_requisition_id: pr.id,
        rfq_number: await nextDocumentNumber('RFQ'),
        title: pr.title,
        issue_date: today(),
        due_date: pr.required_date,
        status: 'rfq_sent',
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const rfqId = (rfq as { id: string }).id;

    const { error: vendorError } = await supabase.from('rfq_vendors').insert(
      vendorIds.map((vendorId) => ({
        rfq_id: rfqId,
        project_id: pr.project_id,
        vendor_id: vendorId,
        sent_at: new Date().toISOString(),
        response_status: 'pending',
        created_by: profileId,
        updated_by: profileId,
      })),
    );
    if (vendorError) throw new Error(vendorError.message);

    await supabase.from('purchase_requisitions').update({ status: 'rfq_sent', updated_by: profileId }).eq('id', pr.id);
    return { data: { rfqId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
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
  }>;
  attachments?: File[];
};

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

export async function recordQuotation(input: RecordQuotationInput): Promise<MutationResult<{ quotationId: string }>> {
  try {
    const profileId = await currentProfileId();
    if (input.lines.length === 0) throw new Error('Add at least one quotation line.');

    const invitedVendor = input.rfq.rfq_vendors?.some((vendor) => vendor.vendor_id === input.vendorId);
    if (!invitedVendor) throw new Error('This vendor is not linked to the selected RFQ.');

    const lineRows = input.lines.map((line) => {
      const quantity = Number(line.quantity || 0);
      const unitRate = Number(line.unit_rate || 0);
      const taxRate = Number(line.tax_rate || 0);
      if (!line.item_description.trim()) throw new Error('Every quotation line requires an item description.');
      if (quantity <= 0) throw new Error('Every quotation line quantity must be greater than zero.');
      if (unitRate < 0) throw new Error('Quotation line rates cannot be negative.');
      const lineTotal = quantity * unitRate;
      const taxAmount = lineTotal * (taxRate / 100);
      return {
        item_id: line.item_id ?? null,
        item_description: line.item_description.trim(),
        quantity,
        unit_rate: unitRate,
        tax_rate: taxRate,
        line_total: lineTotal,
        tax_amount: taxAmount,
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
        tax_rate: line.tax_rate,
        line_total: line.line_total,
        created_by: profileId,
        updated_by: profileId,
      })),
    );
    if (lineError) throw new Error(lineError.message);

    const rfqVendor = input.rfq.rfq_vendors?.find((vendor) => vendor.vendor_id === input.vendorId);
    const vendorRating = Number(rfqVendor?.vendors?.rating || 0);
    const estimateAmount = lineRows.reduce((sum, line) => sum + line.quantity * line.unit_rate, 0);
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

export type ApproveVendorSelectionInput = {
  selectionId: string;
};

export async function approveVendorSelection(input: ApproveVendorSelectionInput): Promise<MutationResult<{ selectionId: string }>> {
  try {
    const profileId = await requireApprover('operational');

    const { data: selection, error: selectionError } = await supabase
      .from('vendor_selections')
      .select('id, purchase_requisition_id, rfq_id, selected_vendor_id')
      .eq('id', input.selectionId)
      .single();

    if (selectionError) throw new Error(selectionError.message);

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

    if ((selection as { purchase_requisition_id?: string }).purchase_requisition_id) {
      await supabase
        .from('purchase_requisitions')
        .update({ status: 'vendor_selected', updated_by: profileId })
        .eq('id', (selection as { purchase_requisition_id: string }).purchase_requisition_id);
    }

    // Auto-draft PO in Supabase for approved vendor selection
    try {
      const selRow = selection as { id: string; purchase_requisition_id: string; rfq_id: string | null; selected_vendor_id: string | null };
      let vendorId = selRow?.selected_vendor_id;

      if (!vendorId && selRow?.rfq_id) {
        const { data: winningQuote } = await supabase
          .from('vendor_quotations')
          .select('vendor_id')
          .eq('rfq_id', selRow.rfq_id)
          .order('total_amount', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (winningQuote) vendorId = winningQuote.vendor_id;
      }

      if (!vendorId) {
        const { data: firstVendor } = await supabase
          .from('vendors')
          .select('id')
          .limit(1)
          .maybeSingle();
        if (firstVendor) vendorId = firstVendor.id;
      }

      if (vendorId && selRow?.purchase_requisition_id) {
        const { data: existingPo } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('vendor_selection_id', input.selectionId)
          .is('deleted_at', null)
          .maybeSingle();

        if (!existingPo) {
          await generatePurchaseOrder({
            purchaseRequisitionId: selRow.purchase_requisition_id,
            vendorId: vendorId,
            vendorSelectionId: input.selectionId,
            deliveryDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            deliveryLocation: 'Project Site Store',
            paymentTerms: '30 days from accepted GRN',
            termsAndConditions: 'Standard Procurement Terms apply.',
          });
        }
      }
    } catch (poErr) {
      console.warn('Auto-draft PO notice:', poErr);
    }

    return { data: { selectionId: input.selectionId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type GeneratePurchaseOrderInput = {
  purchaseRequisitionId: string;
  vendorId: string;
  vendorSelectionId?: string | null;
  deliveryDate: string | null;
  deliveryLocation: string | null;
  paymentTerms: string | null;
  termsAndConditions: string | null;
  lines?: Array<{
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    line_total: number;
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
    let budgetAllocationId = (pr as { budget_allocation_id?: string | null }).budget_allocation_id ?? null;

    if (!budgetAllocationId) {
      const { data: matchingAllocations, error: allocationError } = await supabase
        .from('budget_allocations')
        .select('id, allocated_amount, committed_amount, spent_amount')
        .eq('project_id', pr.project_id)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (!allocationError && matchingAllocations) {
        const matchingAllocation = (matchingAllocations ?? []).find((allocation) => {
          const available = Number(allocation.allocated_amount || 0) - Number(allocation.committed_amount || 0) - Number(allocation.spent_amount || 0);
          return available >= totalAmount;
        });
        budgetAllocationId = matchingAllocation?.id ?? null;
      }
    }

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
The Vendor hereby agrees that the Courts situated in location of Organisation address and shall have the jurisdiction to hear and determine all actions and proceedings arising out of this contract.
12. Payment will be released, subject to Tax - Invoice uploaded on GST portal before payment due date.
13. Late Delivery Clause - Penalty would be charged from 1% - 10% per week OR as per management decision if delivery would be done after due date OR schedule date given by site.
14. TAX DEDUCTION AT SOURCE TO BE MADE U/S. 194Q FROM THE PURCHASE OF GOODS FROM YOU:
As you are aware that w.e.f 1ST July, 2021, the provisions of Section 194Q for withholding of Tax at 0.10% on the value of purchase of goods are applicable. In view of the same, we shall deduct the required TDS at 0.10% from the value of purchase of goods from you. We are the purchasers who satisfies the conditions laid down in Section 194Q and hence we are required to deduct TDS from the value of Purchases from you at the applicable rates. Since we are liable to deduct TDS U/S. 194Q, you being the seller of goods , are not required to make TCS U/S. 206C(1H) at 0.10%. Hence please do not charge any TCS on your purchase Invoice in response to this PO. The rate of Withholding of tax U/S. 194Q shall be subject to the amendments made from time to time.
NOTE : Moreover, please confirm whether you have filed the Income Tax Returns for A.Y. 2019-2020 and A.Y. 2020-2021 along with the acceptance of this PO with copy of the acknowledgement / screen shot from the Income tax website. In the absence of such confirmation, we shall presume that you have not filed your Income tax returns for the required two years and therefore, the withholding of tax shall be made at higher rate of 5% from the value of purchase of goods from you which shall not be refunded nor adjusted in subsequent billing against this PO or any other PO. If you have already submitted the required details of the Income Tax Returns with us, please ignore this note.
15. Guarantee/ Warranty:
Under RERA act minimum 5 years from the date of possession for material or workmenship.
16. Delivery Date: As per site Schedule and mentioned in PO.
17. Price Basis - DAP at Site, Freight included`,
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
      normalizedLines.map((line: { item_id: string | null; item_description: string; quantity: number; unit_rate: number; tax_rate: number; line_total: number }) => ({
        purchase_order_id: purchaseOrderId,
        project_id: pr.project_id,
        item_id: line.item_id,
        item_description: line.item_description,
        quantity: line.quantity,
        unit_rate: line.unit_rate,
        tax_rate: line.tax_rate,
        line_total: line.line_total,
        ...(profileId ? { created_by: profileId, updated_by: profileId } : {}),
      })),
    );
    if (lineError) throw new Error(lineError.message);

    await supabase.from('purchase_requisitions').update({
      status: 'po_issued',
      ...(profileId ? { updated_by: profileId } : {}),
    }).eq('id', input.purchaseRequisitionId);
    return { data: { purchaseOrderId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function updateFullPurchaseOrder(formData: {
  po_number: string;
  status: string;
  po_date?: string;
  due_date?: string;
  delivery_address?: string;
  project_address?: string;
  credit_period_days?: number;
  note_on_po?: string;
  remarks?: string;
}): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();

    const rawSt = String(formData.status || 'draft').toLowerCase();
    let mappedStatus = 'draft';
    if (rawSt.includes('verification') || rawSt.includes('audit') || rawSt.includes('pending')) {
      mappedStatus = 'pending_approval';
    } else if (rawSt.includes('issued') || rawSt.includes('sent') || rawSt.includes('approved')) {
      mappedStatus = 'approved';
    } else if (rawSt.includes('fulfilled') || rawSt.includes('completed')) {
      mappedStatus = 'completed';
    } else {
      mappedStatus = 'draft';
    }

    const { data: existingPo } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('po_number', formData.po_number)
      .maybeSingle();

    if (existingPo) {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: mappedStatus,
          delivery_date: formData.due_date || formData.po_date || new Date().toISOString().split('T')[0],
          delivery_location: formData.delivery_address || formData.project_address || null,
          payment_terms: `${formData.credit_period_days || 30} days credit`,
          terms_and_conditions: Array.isArray((formData as any).terms_and_conditions)
            ? (formData as any).terms_and_conditions.join('\n')
            : ((formData as any).terms_and_conditions || formData.note_on_po || formData.remarks || null),
          updated_by: profileId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPo.id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: formData.po_number,
          po_date: formData.po_date || new Date().toISOString().split('T')[0],
          status: mappedStatus,
          delivery_date: formData.due_date || new Date().toISOString().split('T')[0],
          delivery_location: formData.delivery_address || formData.project_address || null,
          payment_terms: `${formData.credit_period_days || 30} days credit`,
          terms_and_conditions: Array.isArray((formData as any).terms_and_conditions)
            ? (formData as any).terms_and_conditions.join('\n')
            : ((formData as any).terms_and_conditions || formData.note_on_po || formData.remarks || null),
          created_by: profileId,
          updated_by: profileId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw new Error(error.message);
    }

    return { data: null, error: null };
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
 * Records goods received against a purchase order.
 *
 * The inspection detail (received / accepted / rejected quantities, challan,
 * vehicle, remarks) is now sent to the server. It used to be collected by the
 * GRN modal and then dropped: only the PO id was passed, so every quantity the
 * storekeeper entered was discarded.
 */
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

    for (const line of lines) {
      if (line.receivedQty < 0 || line.acceptedQty < 0 || line.rejectedQty < 0) {
        throw new Error('Received, accepted and rejected quantities cannot be negative.');
      }
      if (line.acceptedQty + line.rejectedQty > line.receivedQty) {
        throw new Error('Accepted plus rejected quantity cannot exceed the received quantity.');
      }
    }

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

    if (!result.grnId) throw new Error('The goods receipt note was not created.');
    return {
      data: {
        grnId: String(result.grnId),
        grnNumber: String(result.grnNumber || ''),
        status: String(result.status || 'draft'),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Raises a vendor bill from a posted GRN, with a real three-way match
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
    if (!payload.purchaseOrderId || !payload.storagePath || !payload.signedUrl) {
      throw new Error('PO PDF generation response was incomplete.');
    }
    return {
      data: {
        purchaseOrderId: payload.purchaseOrderId,
        storagePath: payload.storagePath,
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
export async function approvePurchaseOrder(po: PurchaseOrderRow): Promise<MutationResult> {
  try {
    const profileId = await requireApprover('operational');
    const { error } = await supabase.from('purchase_orders').update({
      status: 'approved',
      updated_by: profileId,
      updated_at: new Date().toISOString()
    }).eq('id', po.id);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function rejectPurchaseOrder(po: PurchaseOrderRow, reason: string): Promise<MutationResult> {
  try {
    const profileId = await requireApprover('operational');
    if (!reason?.trim()) throw new Error('A rejection reason is required.');
    const { error } = await supabase.from('purchase_orders').update({
      status: 'rejected',
      terms_and_conditions_legal: reason.trim(),
      updated_by: profileId,
      updated_at: new Date().toISOString()
    }).eq('id', po.id);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function sendPurchaseOrderToVendor(po: PurchaseOrderRow): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');
    const { error } = await supabase.from('purchase_orders').update({
      status: 'sent_to_vendor',
      updated_by: profileId,
      updated_at: new Date().toISOString()
    }).eq('id', po.id);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function acknowledgePurchaseOrder(po: PurchaseOrderRow): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase.from('purchase_orders').update({
      status: 'acknowledged',
      updated_by: profileId,
      updated_at: new Date().toISOString()
    }).eq('id', po.id);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
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

export async function updatePurchaseOrderStatus(poId: string, status: string): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: status.toLowerCase(),
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
  }[];
}): Promise<MutationResult<{ id: string; grnNumber: string }>> {
  try {
    await requireProfile();

    if (!formData.id && !formData.purchase_order_id && !formData.project_id) {
      throw new Error('Select a purchase order, or choose a project, before saving the goods receipt.');
    }
    if (!formData.id && !formData.purchase_order_id && !formData.vendor_id) {
      throw new Error('Select a supplier before saving the goods receipt.');
    }

    const result = await rpcAction<{ grnId?: string; grnNumber?: string }>('save_goods_receipt_note', {
      p_payload: {
        id: formData.id || null,
        project_id: formData.project_id || null,
        site_id: formData.site_id || null,
        purchase_order_id: formData.purchase_order_id || null,
        vendor_id: formData.vendor_id || null,
        grn_number: formData.grn_number || null,
        receipt_date: formData.grn_date ? formData.grn_date.slice(0, 10) : today(),
        challan_no: formData.challan_no || null,
        challan_date: formData.challan_date || null,
        vehicle_no: formData.vehicle_no || null,
        godown_name: formData.godown_name || null,
        transporter_name: formData.transporter_name || null,
        dealer_name: formData.dealer_name || null,
        qc_no: formData.qc_no || null,
        supplier_name: formData.supplier_name || null,
        // Real inspection fields, rather than the previous behaviour of
        // stuffing challan_no and vehicle_no into them.
        quantity_verification: formData.quantity_verification || null,
        physical_inspection: formData.physical_inspection || null,
        damage_check: formData.damage_check || null,
        volume_in_brass: formData.volume_in_brass || null,
        net_weight: formData.net_weight || null,
        in_weight: formData.in_weight || null,
        out_weight: formData.out_weight || null,
        asset_item: formData.asset_item || null,
        asset_amount: formData.asset_amount ?? 0,
        remarks: formData.remarks || null,
        quality_decision: formData.quality_decision || 'pending',
        status: formData.status || 'draft',
        uploaded_invoice_url: formData.uploaded_invoice_url || null,
        uploaded_invoice_path: formData.uploaded_invoice_path || null,
        uploaded_invoice_name: formData.uploaded_invoice_name || null,
        uploaded_challan_url: formData.uploaded_challan_url || null,
        uploaded_challan_path: formData.uploaded_challan_path || null,
        uploaded_challan_name: formData.uploaded_challan_name || null,
        lines: formData.lines || [],
      },
    });

    if (!result.grnId) throw new Error('The goods receipt note was not saved.');
    return { data: { id: String(result.grnId), grnNumber: String(result.grnNumber || '') }, error: null };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Moves a GRN through its workflow.
 *
 * Routed through set_goods_receipt_note_status, which validates the
 * transition and enforces the approver role. The previous implementation
 * PATCHed the status column directly with any string the caller supplied,
 * so a site engineer could mark a receipt `posted`.
 */
export async function updateGrnStatus(
  grnId: string,
  newStatus: string
): Promise<MutationResult> {
  try {
    await requireProfile();
    await rpcAction('set_goods_receipt_note_status', { p_grn_id: grnId, p_status: newStatus });
    return { data: null, error: null };
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

    if (!payload.id && !payload.vendor_id && !payload.grn_id && !payload.purchase_order_id) {
      throw new Error('Select a supplier, purchase order or GRN before saving the purchase bill.');
    }

    const result = await rpcAction<{ vendorBillId?: string; billNumber?: string; netPayable?: number }>(
      'save_purchase_bill',
      { p_payload: payload },
    );

    if (!result.vendorBillId) throw new Error('The purchase bill was not saved.');
    return {
      data: {
        vendorBillId: String(result.vendorBillId),
        billNumber: String(result.billNumber || ''),
        netPayable: Number(result.netPayable || 0),
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
export async function savePurchaseOrderForm(payload: {
  id?: string;
  project_id?: string;
  site_id?: string;
  vendor_id?: string;
  purchase_requisition_id?: string;
  lines?: {
    item_id?: string | null;
    item_description: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    line_total?: number;
  }[];
  [key: string]: unknown;
}): Promise<MutationResult<{ purchaseOrderId: string; poNumber: string; total: number }>> {
  try {
    await requireProfile();

    const lines = payload.lines || [];
    if (!payload.id && lines.length === 0) {
      throw new Error('Add at least one line item before saving the purchase order.');
    }
    for (const line of lines) {
      if (!line.item_description?.trim()) throw new Error('Every purchase order line needs a description.');
      if (!(Number(line.quantity) > 0)) throw new Error('Every purchase order line needs a quantity greater than zero.');
      if (Number(line.unit_rate) < 0) throw new Error('A purchase order line rate cannot be negative.');
    }

    const result = await rpcAction<{ purchaseOrderId?: string; poNumber?: string; total?: number }>(
      'save_purchase_order',
      { p_payload: payload },
    );

    if (!result.purchaseOrderId) throw new Error('The purchase order was not saved.');
    return {
      data: {
        purchaseOrderId: String(result.purchaseOrderId),
        poNumber: String(result.poNumber || ''),
        total: Number(result.total || 0),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: asError(err) };
  }
}

export type VendorOption = {
  id: string;
  label: string;
  legal_name: string;
  display_name: string | null;
  gst_number: string | null;
  city: string | null;
  phone: string | null;
  compliance_status: string | null;
};

/**
 * Active vendors for a supplier dropdown.
 *
 * Supplier was previously a free-text field on the GRN and bill forms, which
 * meant a receipt could name a supplier that did not exist in the registry and
 * could never be joined back to a vendor record.
 */
export async function listActiveVendorOptions(): Promise<VendorOption[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('vendors')
    .select('id, legal_name, display_name, gst_number, city, phone, compliance_status')
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
 * Fetch available Purchase Order numbers, vendor names, and material details for dropdown selection.
 */
export async function fetchPurchaseOrderOptions(): Promise<{ id: string; po_number: string; vendor_name?: string; material_details?: string }[]> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, vendors(display_name, legal_name), purchase_order_lines(item_description, item_group)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []).map((po: any) => {
      const vendorName = po.vendors?.display_name || po.vendors?.legal_name || '';
      const lines: any[] = po.purchase_order_lines || [];
      const items = lines.map((l) => l.item_description || l.item_group).filter(Boolean);
      const materials = items.length > 0 ? items.slice(0, 2).join(', ') + (items.length > 2 ? '...' : '') : '';
      return {
        id: po.id,
        po_number: po.po_number || '',
        vendor_name: vendorName,
        material_details: materials,
      };
    }).filter((p: any) => Boolean(p.po_number));
  } catch {
    return [];
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
export function printPurchaseOrderReport(po: AnyRow) {
  const lines: AnyRow[] = po?.purchase_order_lines || [];
  const lineSubtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_rate) || 0),
    0,
  );
  const subtotal = Number(pick(po, 'subtotal_amount')) || lineSubtotal;
  const tax = Number(pick(po, 'tax_amount')) || 0;
  const total = Number(pick(po, 'total_amount')) || subtotal + tax;

  const ok = openReportWindow({
    documentTitle: 'Purchase Order',
    documentNumber: po?.po_number,
    projectName: projectName(po),
    statusLabel: po?.status,
    draft: isDraftStatus(po?.status),
    sections: [
      fieldsSection('Order Details', [
        { label: 'PO Number', value: fmtText(po?.po_number) },
        { label: 'PO Date', value: fmtDate(pick(po, 'po_date', 'created_at')) },
        { label: 'Status', value: fmtStatus(po?.status) },
        { label: 'Linked PR', value: fmtText(pick(po, 'purchase_requisition_id')) },
        { label: 'Company', value: fmtText(pick(po, 'company_name')) },
        { label: 'Contract Reference', value: fmtText(pick(po, 'contract_reference')) },
        { label: 'Approved At', value: fmtDateTime(pick(po, 'approved_at')) },
        { label: 'Issued To Vendor At', value: fmtDateTime(pick(po, 'sent_at')) },
        { label: 'Template', value: fmtText(pick(po, 'template_code')) },
      ]),

      fieldsSection('Vendor', [
        { label: 'Vendor', value: vendorName(po) },
        { label: 'GSTIN', value: fmtText(pick(po?.vendors, 'gst_number')) },
        { label: 'Contact', value: fmtText(pick(po?.vendors, 'phone')) },
        { label: 'Email', value: fmtText(pick(po?.vendors, 'email')) },
        { label: 'Rating', value: fmtNumber(pick(po?.vendors, 'rating') ?? 0, 1) },
        { label: 'Compliance', value: fmtStatus(pick(po?.vendors, 'compliance_status')) },
        { label: 'Contractor', value: fmtText(pick(po, 'contractor_name')) },
      ]),

      fieldsSection('Delivery & Payment', [
        { label: 'Delivery Location', value: fmtText(pick(po, 'delivery_location')) },
        { label: 'Delivery Date', value: fmtDate(pick(po, 'delivery_date')) },
        { label: 'Payment Terms', value: fmtText(pick(po, 'payment_terms')) },
        { label: 'Site Contact Person', value: fmtText(pick(po, 'site_contact_person')) },
        { label: 'Site Contact Number', value: fmtText(pick(po, 'site_contact_number')) },
      ]),

      tableSection(
        'Ordered Items',
        lines,
        [
          { header: '#', cell: (_l, i) => i + 1, align: 'center' },
          { header: 'Description', cell: (l) => fmtText(l.item_description) },
          { header: 'Qty', cell: (l) => fmtNumber(l.quantity), align: 'right' },
          { header: 'Received', cell: (l) => fmtNumber(pick(l, 'received_qty') ?? 0), align: 'right' },
          {
            header: 'Balance',
            cell: (l) => fmtNumber(Math.max((Number(l.quantity) || 0) - (Number(l.received_qty) || 0), 0)),
            align: 'right',
          },
          { header: 'Rate', cell: (l) => fmtCurrency(l.unit_rate), align: 'right' },
          { header: 'Tax %', cell: (l) => fmtPercent(pick(l, 'tax_rate') ?? 0), align: 'right' },
          {
            header: 'Line Total',
            cell: (l) =>
              fmtCurrency(
                Number(pick(l, 'line_total')) ||
                  (Number(l.quantity) || 0) * (Number(l.unit_rate) || 0),
              ),
            align: 'right',
            footer: () => fmtCurrency(lineSubtotal),
          },
        ],
        'No line items on this purchase order',
      ),

      {
        kind: 'totals',
        title: 'Order Value',
        rows: [
          { label: 'Subtotal', value: fmtCurrency(subtotal) },
          { label: 'Tax', value: fmtCurrency(tax) },
          { label: 'Total Order Value', value: fmtCurrency(total), emphasis: true },
        ],
      },

      { kind: 'note', title: 'Terms & Conditions', body: fmtText(pick(po, 'terms_and_conditions')) },
      {
        kind: 'note',
        title: 'Legal Terms',
        body: fmtText(pick(po, 'terms_and_conditions_legal')),
      },
      { kind: 'note', title: 'GST Section 194Q Declaration', body: fmtText(pick(po, 'gst_194q_clause')) },
      { kind: 'note', title: 'RERA / Warranty Clause', body: fmtText(pick(po, 'rera_warranty_clause')) },

      {
        kind: 'signatures',
        title: 'Authorisation',
        slots: ['Prepared By', 'Verified By', 'Approved By', 'Vendor Acknowledgement'],
      },
    ],
  });

  if (!ok) reportFailed('purchase order');
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
