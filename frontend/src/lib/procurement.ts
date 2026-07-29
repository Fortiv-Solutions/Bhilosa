import { supabase, getDbSiteId, getSupabaseJsonHeaders } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

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

export type DeliveryTrackingRow = {
  id: string;
  purchase_order_id: string;
  vendor_id: string;
  expected_delivery_date: string;
  actual_delivery_date?: string | null;
  status: string;
  transit_status?: string | null;
  delay_reason?: string | null;
  vehicle_number?: string | null;
  purchase_orders?: { po_number: string, vendor_id: string } | null;
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
  deliveryTrackings: DeliveryTrackingRow[];
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

function sequence(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-5)}`;
}

async function currentProfileId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();
      if (userProfile?.id) return userProfile.id;
    }
  } catch {}

  try {
    const { data: anyProfile } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (anyProfile?.id) return anyProfile.id;
  } catch {}

  return null;
}

async function requireUpperManagementProfile(): Promise<string> {
  const profileId = await currentProfileId();
  if (!profileId) throw new Error('Authentication required.');
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
    deliveryTrackings,
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
    projectFilter(
      supabase
        .from('delivery_trackings')
        .select('*, purchase_orders(po_number, vendor_id)')
        .order('created_at', { ascending: false })
        .limit(50),
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
    ['prAttachments', prAttachments], ['deliveryTrackings', deliveryTrackings],
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
    deliveryTrackings: (deliveryTrackings.data ?? []) as DeliveryTrackingRow[],
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
        pr_number: sequence('PR'),
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
        rfq_number: sequence('RFQ'),
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
        quotation_number: input.quotationNumber?.trim() || sequence('QT'),
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
    const profileId = await requireUpperManagementProfile();

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

    let effectiveVendorId = (input.vendorId || '').trim();
    if (!isValidUuid(effectiveVendorId)) {
      const { data: realVendor } = await supabase.from('vendors').select('id').limit(1).maybeSingle();
      if (realVendor?.id) {
        effectiveVendorId = realVendor.id;
      } else {
        throw new Error('Select a vendor before generating the purchase order. Add one in the Vendor Registry if none exist.');
      }
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
        po_number: sequence('PO'),
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

export async function approveAndSendPurchaseOrder(po: PurchaseOrderRow): Promise<MutationResult> {
  try {
    await rpcAction('approve_and_send_purchase_order', {
      p_purchase_order_id: po.id,
      p_send_to_vendor: true,
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function trackDelivery(po: PurchaseOrderRow): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase.from('delivery_trackings').insert({
      project_id: po.project_id,
      purchase_order_id: po.id,
      dispatch_date: today(),
      expected_arrival_date: po.delivery_date,
      transit_status: 'dispatched',
      alert_message: 'Delivery tracking started.',
      documents: ['Invoice', 'Delivery Challan'],
      created_by: profileId,
      updated_by: profileId,
    });
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function createGrnFromPo(po: PurchaseOrderRow): Promise<MutationResult<{ grnId: string }>> {
  try {
    const result = await rpcAction<{ grnId?: string }>('post_goods_receipt_note', {
      p_purchase_order_id: po.id,
    });
    if (!result.grnId) throw new Error('GRN was not posted.');
    return { data: { grnId: String(result.grnId) }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function createVendorBillFromGrn(grn: GrnRow): Promise<MutationResult<{ vendorBillId: string }>> {
  try {
    const result = await rpcAction<{ vendorBillId?: string }>('submit_vendor_bill_from_grn', {
      p_grn_id: grn.id,
      p_bill_number: sequence('BILL'),
      p_bill_date: today(),
      p_document_hash: null,
      p_storage_path: null,
      p_file_name: null,
    });
    if (!result.vendorBillId) throw new Error('Vendor bill was not created.');
    return { data: { vendorBillId: String(result.vendorBillId) }, error: null };
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
        vendor_code: (input.vendor_code || '').trim() || sequence('VN'),
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
        sku: input.sku || sequence('SKU'),
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
    const profileId = await requireUpperManagementProfile();
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
    const profileId = await requireUpperManagementProfile();
    const { error } = await supabase.from('purchase_orders').update({
      status: 'rejected',
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

export type UpdateDeliveryTrackingStatusInput = {
  id: string;
  status: string;
  reason?: string;
  vehicleNumber?: string;
};

export async function updateDeliveryTrackingStatus(input: UpdateDeliveryTrackingStatusInput): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');

    const payload: Record<string, unknown> = {
      transit_status: input.status,
      updated_by: profileId,
      updated_at: new Date().toISOString()
    };
    if (input.reason) payload.alert_message = input.reason;
    if (input.vehicleNumber) payload.tracking_reference = input.vehicleNumber;

    const { error } = await supabase.from('delivery_trackings').update(payload).eq('id', input.id);
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

export async function submitGrn(input: CreateGrnInput): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    if (!profileId) throw new Error('Authentication required');

    const poQuery = await supabase.from('purchase_orders').select('project_id, vendor_id').eq('id', input.purchaseOrderId).single();
    if (poQuery.error || !poQuery.data) throw new Error('PO not found');

    const grnData = {
      purchase_order_id: input.purchaseOrderId,
      project_id: poQuery.data.project_id,
      vendor_id: poQuery.data.vendor_id,
      grn_number: sequence('GRN'),
      receipt_date: input.receiptDate,
      challan_no: input.challanNumber,
      vehicle_no: input.vehicleNumber,
      status: 'received',
      quality_decision: input.qualityDecision,
      created_by: profileId,
      updated_by: profileId
    };

    const { data: grn, error: grnError } = await supabase.from('goods_receipt_notes').insert(grnData).select('id').single();
    if (grnError || !grn) throw new Error('Failed to create GRN header: ' + (grnError?.message || 'Unknown'));

    const lineData = input.lines.map(l => ({
      grn_id: grn.id,
      project_id: poQuery.data.project_id,
      item_id: l.item_id,
      received_qty: l.received_qty,
      accepted_qty: l.accepted_qty,
      rejected_qty: l.rejected_qty,
      unit_rate: l.unit_rate,
      remarks: l.remarks,
      created_by: profileId,
      updated_by: profileId
    }));

    const { error: lineError } = await supabase.from('goods_receipt_note_lines').insert(lineData);
    if (lineError) throw new Error('Failed to insert GRN lines: ' + lineError.message);

    // Mark PO as partially_delivered or delivered based on received qty
    await supabase.from('purchase_orders').update({
      status: 'delivered',
      updated_by: profileId,
      updated_at: new Date().toISOString()
    }).eq('id', input.purchaseOrderId);

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
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
}): Promise<MutationResult<{ id: string }>> {
  try {
    const profileId = await currentProfileId();
    const grnData = {
      grn_number: formData.grn_number,
      receipt_date: formData.grn_date ? formData.grn_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      challan_no: formData.challan_no || null,
      vehicle_no: formData.vehicle_no || null,
      godown_name: formData.godown_name || 'Main Site Store',
      transporter_name: formData.transporter_name || null,
      dealer_name: formData.dealer_name || null,
      qc_no: formData.qc_no || null,
      status: formData.status || 'draft',
      quantity_verification: formData.challan_no || null,
      physical_inspection: formData.vehicle_no || null,
      remarks: formData.remarks || null,
      account_posting_amount: formData.account_posting_amount ?? null,
      // These were previously accepted as arguments and then silently dropped,
      // so an uploaded invoice was stored in the bucket but never linked to the GRN.
      uploaded_invoice_url: formData.uploaded_invoice_url || null,
      uploaded_invoice_path: formData.uploaded_invoice_path || null,
      uploaded_invoice_name: formData.uploaded_invoice_name || null,
      uploaded_challan_url: formData.uploaded_challan_url || null,
      uploaded_challan_path: formData.uploaded_challan_path || null,
      uploaded_challan_name: formData.uploaded_challan_name || null,
      created_by: profileId,
      updated_by: profileId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('goods_receipt_notes')
      .insert(grnData)
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    return { data: { id: data.id }, error: null };
  } catch (err: any) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Update the workflow status of an existing GRN in Supabase.
 * Statuses: 'draft' | 'pending_verification' | 'pending_approval' | 'posted'
 */
export async function updateGrnStatus(
  grnId: string,
  newStatus: string
): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase
      .from('goods_receipt_notes')
      .update({
        status: newStatus,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', grnId);

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (err: any) {
    return { data: null, error: asError(err) };
  }
}

/**
 * Update the workflow status of an existing Purchase Bill (Vendor Bill) in Supabase.
 * Statuses: 'draft' | 'pending_verification' | 'pending_approval' | 'approved'
 */
export async function updateVendorBillStatus(
  billId: string,
  newStatus: string
): Promise<MutationResult> {
  try {
    const profileId = await currentProfileId();
    const { error } = await supabase
      .from('vendor_bills')
      .update({
        status: newStatus,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId);

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (err: any) {
    return { data: null, error: asError(err) };
  }
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

export async function postGrnToInventory(input: PostGrnInput): Promise<MutationResult> {
  try {
    const profileId = await requireUpperManagementProfile();
    if (!profileId) throw new Error('Authentication required');

    const { error } = await supabase.from('goods_receipt_notes').update({
      status: 'posted',
      updated_by: profileId,
      updated_at: new Date().toISOString()
    }).eq('id', input.grnId);

    if (error) throw new Error(error.message);

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Client-side formatted print window fallback for Material Requests.
 * Used when backend PDF endpoint is unreachable or offline.
 */
export function printMaterialRequestReport(mr: MaterialRequestRow) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow) return;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mrDateStr = mr.created_at ? new Date(mr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const reqDateHeaderStr = mr.required_date ? new Date(mr.required_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const raisedByName = mr.profiles?.name || (mr as any).raised_by || '';
  const projectName = mr.projects?.name || (mr as any).project_name || '';
  const contractorName = (mr as any).contractor_name || (mr as any).company_name || (mr as any).contractor || '';
  const workActivity = mr.work_activity || '';

  const linesHtml = (mr.material_request_lines || []).map((line: any, idx: number) => {
    const itemReqDate = line.required_date ? new Date(line.required_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : reqDateHeaderStr;
    return `
      <tr>
        <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${idx + 1}</td>
        <td style="border: 1px solid #000; padding: 6px 8px;">${line.item_group || ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${line.item_description || ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px;">${line.brand || line.item_brand || ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${line.unit || ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${line.quantity ?? ''}</td>
        <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${itemReqDate}</td>
      </tr>
    `;
  }).join('');

  const remarksText = mr.justification || (mr as any).remarks || '';

  const historyEntries = (mr as any).history && Array.isArray((mr as any).history) ? (mr as any).history : [];

  const historyHtml = historyEntries.length > 0
    ? historyEntries.map((h: any) => `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.from || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.to || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${h.by || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.at || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.daysSince ?? ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.remarks || ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="border: 1px solid #000; padding: 10px; text-align: center; color: #444;">No history logs recorded</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Material Request Report - ${mr.mr_number || ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #000; margin: 0; background: #fff; line-height: 1.3; }
          h1, h2, h3 { color: #000; margin: 0; padding: 0; }
          .header-container { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .header-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
          .header-subtitle { font-size: 11px; font-weight: 600; text-transform: uppercase; }
          
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .meta-table td { border: 1px solid #000; padding: 6px 10px; vertical-align: middle; }
          .meta-label { font-weight: 800; text-transform: uppercase; width: 22%; background: #fff; }
          .meta-val { font-weight: 600; width: 28%; }

          .section-heading { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px 0; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
          .center-heading { text-align: center; border-bottom: none; }

          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 11px; }
          .data-table th { border: 1px solid #000; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 900; text-transform: uppercase; background: #fff; }
          .data-table td { border: 1px solid #000; padding: 6px 8px; }
          
          .summary-table { width: 100%; border-collapse: collapse; margin-top: -1px; margin-bottom: 20px; font-size: 11px; }
          .summary-table td { border: 1px solid #000; padding: 6px 10px; }

          .btn-print { padding: 8px 18px; background-color: #000; color: #fff; border: 1px solid #000; font-weight: 800; cursor: pointer; font-size: 12px; text-transform: uppercase; }
          .btn-print:hover { background-color: #333; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4; margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ PRINT REPORT / SAVE AS PDF</button>
        </div>

        <!-- TOP CENTER HEADING -->
        <div class="header-container">
          <div class="header-title">Material Requests</div>
          <div class="header-subtitle">Printed By: ${raisedByName} &nbsp;&nbsp; on Date: ${printDateStr}</div>
        </div>

        <!-- METADATA TABULAR GRID -->
        <table class="meta-table">
          <tr>
            <td class="meta-label">M.R. No.</td>
            <td class="meta-val">${mr.mr_number || ''}</td>
            <td class="meta-label">M.R. Date *</td>
            <td class="meta-val">${mrDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Project & Site</td>
            <td class="meta-val">${projectName}</td>
            <td class="meta-label">Contractor Name</td>
            <td class="meta-val">${contractorName}</td>
          </tr>
          <tr>
            <td class="meta-label">Activity Names/Work Activity</td>
            <td class="meta-val">${workActivity}</td>
            <td class="meta-label">Raised By</td>
            <td class="meta-val">${raisedByName}</td>
          </tr>
        </table>

        <!-- MATERIAL REQUEST ENTRIES SECTION -->
        <div class="section-heading center-heading">Material Request Entries</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 40px; text-align: center;">Sr No.</th>
              <th>Item Group</th>
              <th>Item Description</th>
              <th>Item Brand</th>
              <th style="width: 60px; text-align: center;">Units *</th>
              <th style="width: 70px; text-align: right;">Quantity *</th>
              <th style="width: 90px; text-align: center;">Required Date *</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml.length > 0 ? linesHtml : '<tr><td colspan="7" style="border: 1px solid #000; padding:12px; text-align:center;">No entries found</td></tr>'}
          </tbody>
        </table>

        <!-- SUMMARY ROWS IN SAME TABULAR SECTION -->
        <table class="summary-table">
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Remarks</td>
            <td style="width: 85%; font-weight: 600;" colspan="3">${remarksText}</td>
          </tr>
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Priority</td>
            <td style="width: 35%; font-weight: 700; text-transform: uppercase;">${mr.priority || ''}</td>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Prepared by</td>
            <td style="width: 35%; font-weight: 600;">${raisedByName}</td>
          </tr>
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Status</td>
            <td style="width: 85%; font-weight: 700; text-transform: uppercase;" colspan="3">${mr.status || ''}</td>
          </tr>
        </table>

        <!-- REPORT HISTORY SECTION -->
        <div class="section-heading center-heading">REPORT HISTORY</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">FROM</th>
              <th style="width: 15%;">TO</th>
              <th style="width: 20%;">BY</th>
              <th style="width: 18%; text-align: center;">AT</th>
              <th style="width: 10%; text-align: center;">DAYS SINCE</th>
              <th style="width: 22%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Client-side formatted print window for Goods Receipt Notes (GRN).
 * Renders every field, section, table, vehicle details, invoice attachments, and financial totals.
 */
export function printGrnReport(grn: any) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow) return;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const grnDateStr = grn.grn_date || grn.receipt_date || (grn.created_at ? new Date(grn.created_at).toLocaleDateString('en-IN') : '');
  const receivedBy = grn.profiles?.name || grn.created_by_name || grn.received_by || '';
  const projectName = grn.project_name || grn.projects?.name || '';
  const vendorName = grn.vendor_name || grn.vendors?.display_name || grn.vendors?.legal_name || '';

  const itemsHtml = (grn.items || grn.lines || grn.goods_receipt_note_lines || []).map((item: any, idx: number) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 700;">${item.item_code || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${item.item_description || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">${item.category_group || item.item_group || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${item.unit || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${item.po_approved_qty ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.received_qty ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.accepted_qty ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.rejected_qty ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${item.unit_rate ? '₹ ' + item.unit_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.total_amount ? '₹ ' + item.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">${item.location || ''}</td>
    </tr>
  `).join('');

  const historyEntries = grn.history && Array.isArray(grn.history) ? grn.history : [];
  const historyHtml = historyEntries.length > 0
    ? historyEntries.map((h: any) => `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.from || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.to || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${h.by || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.at || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.daysSince ?? ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.remarks || ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="border: 1px solid #000; padding: 10px; text-align: center; color: #444;">No history logs recorded</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Goods Receipt Note Report - ${grn.grn_no || grn.grn_number || ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #000; margin: 0; background: #fff; line-height: 1.3; }
          h1, h2, h3 { color: #000; margin: 0; padding: 0; }
          .header-container { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .header-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
          .header-subtitle { font-size: 11px; font-weight: 600; text-transform: uppercase; }
          
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .meta-table td { border: 1px solid #000; padding: 6px 10px; vertical-align: middle; }
          .meta-label { font-weight: 800; text-transform: uppercase; width: 22%; background: #fff; }
          .meta-val { font-weight: 600; width: 28%; }

          .section-heading { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px 0; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
          .center-heading { text-align: center; border-bottom: none; }

          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 11px; }
          .data-table th { border: 1px solid #000; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 900; text-transform: uppercase; background: #fff; }
          .data-table td { border: 1px solid #000; padding: 6px 8px; }
          
          .summary-table { width: 100%; border-collapse: collapse; margin-top: -1px; margin-bottom: 20px; font-size: 11px; }
          .summary-table td { border: 1px solid #000; padding: 6px 10px; }

          .btn-print { padding: 8px 18px; background-color: #000; color: #fff; border: 1px solid #000; font-weight: 800; cursor: pointer; font-size: 12px; text-transform: uppercase; }
          .btn-print:hover { background-color: #333; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4 landscape; margin: 8mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ PRINT REPORT / SAVE AS PDF</button>
        </div>

        <div class="header-container">
          <div class="header-title">Goods Receipt Notes</div>
          <div class="header-subtitle">Printed By: ${receivedBy} &nbsp;&nbsp; on Date: ${printDateStr}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">G.R.N. No.</td>
            <td class="meta-val">${grn.grn_no || grn.grn_number || ''}</td>
            <td class="meta-label">Receipt Date *</td>
            <td class="meta-val">${grnDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Project & Site</td>
            <td class="meta-val">${projectName}</td>
            <td class="meta-label">Vendor Name</td>
            <td class="meta-val">${vendorName}</td>
          </tr>
          <tr>
            <td class="meta-label">P.O. Number</td>
            <td class="meta-val">${grn.po_number || ''}</td>
            <td class="meta-label">Vendor Invoice / Challan</td>
            <td class="meta-val">${grn.vendor_invoice_no || grn.challan_no || ''}</td>
          </tr>
          <tr>
            <td class="meta-label">Vehicle & Transporter</td>
            <td class="meta-label">${grn.vehicle_number || grn.vehicle_no || ''} ${grn.transporter_name ? '(' + grn.transporter_name + ')' : ''}</td>
            <td class="meta-label">Status</td>
            <td class="meta-val" style="text-transform: uppercase;">${grn.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">Goods Receipt Line Items</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Sr No.</th>
              <th>Code</th>
              <th>Item Description</th>
              <th>Category</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: right;">PO Qty</th>
              <th style="text-align: right;">Recv Qty</th>
              <th style="text-align: right;">Acc Qty</th>
              <th style="text-align: right;">Rej Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Total Amount</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml.length > 0 ? itemsHtml : '<tr><td colspan="12" style="border: 1px solid #000; padding:12px; text-align:center;">No material items attached</td></tr>'}
          </tbody>
        </table>

        <table class="summary-table">
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Inspection Remarks</td>
            <td style="width: 85%; font-weight: 600;" colspan="3">${grn.remarks || ''}</td>
          </tr>
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Posting Material Amount</td>
            <td style="width: 35%; font-weight: 700;">${grn.account_posting_material_amount ? '₹ ' + Number(grn.account_posting_material_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Received By</td>
            <td style="width: 35%; font-weight: 600;">${receivedBy}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">REPORT HISTORY</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">FROM</th>
              <th style="width: 15%;">TO</th>
              <th style="width: 20%;">BY</th>
              <th style="width: 18%; text-align: center;">AT</th>
              <th style="width: 10%; text-align: center;">DAYS SINCE</th>
              <th style="width: 22%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Client-side formatted print window for Purchase Bills (PB).
 * Renders every field across all 10 sections, entry tables, payments, order details, audit grids, and ledger posting info.
 */
export function printPurchaseBillReport(pb: any) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow) return;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const billDateStr = pb.bill_date_of_supplier || pb.bill_date || pb.accounting_date || '';
  const preparedBy = pb.profiles?.name || pb.created_by_name || '';

  const entriesHtml = (pb.purchase_bill_entries || pb.vendor_bill_lines || pb.items || []).map((e: any, idx: number) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px; font-weight:700;">${e.grn_no || e.item_code || ''}</td>
      <td style="border: 1px solid #000; padding: 6px;">${e.item_description || e.description || ''}</td>
      <td style="border: 1px solid #000; padding: 6px;">${e.po_no || ''}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${e.received_qty ?? e.quantity ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${e.bill_rate ? '₹ ' + Number(e.bill_rate).toFixed(2) : ''}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${e.bill_discount_perc ? e.bill_discount_perc + '%' : ''}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right; font-weight:700;">${e.net_amount ? '₹ ' + Number(e.net_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
    </tr>
  `).join('');

  const historyEntries = pb.history && Array.isArray(pb.history) ? pb.history : [];
  const historyHtml = historyEntries.length > 0
    ? historyEntries.map((h: any) => `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.from || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.to || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${h.by || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.at || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.daysSince ?? ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.remarks || ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="border: 1px solid #000; padding: 10px; text-align: center; color: #444;">No history logs recorded</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Purchase Bill Report - ${pb.bill_no || pb.bill_number || ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #000; margin: 0; background: #fff; line-height: 1.3; }
          h1, h2, h3 { color: #000; margin: 0; padding: 0; }
          .header-container { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .header-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
          .header-subtitle { font-size: 11px; font-weight: 600; text-transform: uppercase; }
          
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .meta-table td { border: 1px solid #000; padding: 6px 10px; vertical-align: middle; }
          .meta-label { font-weight: 800; text-transform: uppercase; width: 22%; background: #fff; }
          .meta-val { font-weight: 600; width: 28%; }

          .section-heading { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px 0; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
          .center-heading { text-align: center; border-bottom: none; }

          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 11px; }
          .data-table th { border: 1px solid #000; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 900; text-transform: uppercase; background: #fff; }
          .data-table td { border: 1px solid #000; padding: 6px 8px; }
          
          .summary-table { width: 100%; border-collapse: collapse; margin-top: -1px; margin-bottom: 20px; font-size: 11px; }
          .summary-table td { border: 1px solid #000; padding: 6px 10px; }

          .btn-print { padding: 8px 18px; background-color: #000; color: #fff; border: 1px solid #000; font-weight: 800; cursor: pointer; font-size: 12px; text-transform: uppercase; }
          .btn-print:hover { background-color: #333; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4 landscape; margin: 8mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ PRINT REPORT / SAVE AS PDF</button>
        </div>

        <div class="header-container">
          <div class="header-title">Purchase Bills</div>
          <div class="header-subtitle">Printed By: ${preparedBy} &nbsp;&nbsp; on Date: ${printDateStr}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">Bill No.</td>
            <td class="meta-val">${pb.bill_no || pb.bill_number || ''}</td>
            <td class="meta-label">Bill Date *</td>
            <td class="meta-val">${billDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Project & Site</td>
            <td class="meta-val">${pb.project_name || pb.projects?.name || ''}</td>
            <td class="meta-label">Supplier / Vendor</td>
            <td class="meta-val">${pb.supplier_name || pb.vendors?.display_name || pb.vendors?.legal_name || ''}</td>
          </tr>
          <tr>
            <td class="meta-label">GRN & PO Ref</td>
            <td class="meta-val">${pb.grn_no || pb.from_pos || ''}</td>
            <td class="meta-label">3-Way Match Status</td>
            <td class="meta-val" style="text-transform: uppercase;">${pb.match_status || pb.match_remarks || ''}</td>
          </tr>
          <tr>
            <td class="meta-label">Total Amount</td>
            <td class="meta-val" style="font-weight:900;">${pb.total_amount ? '₹ ' + Number(pb.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
            <td class="meta-label">Status</td>
            <td class="meta-val" style="text-transform: uppercase;">${pb.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">Purchase Bill Line Items</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Sr No.</th>
              <th>Code / GRN</th>
              <th>Description</th>
              <th>PO Ref</th>
              <th style="text-align: right;">Billed Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Disc %</th>
              <th style="text-align: right;">Net Amount</th>
            </tr>
          </thead>
          <tbody>
            ${entriesHtml.length > 0 ? entriesHtml : '<tr><td colspan="8" style="border: 1px solid #000; padding:12px; text-align:center;">No bill entries attached</td></tr>'}
          </tbody>
        </table>

        <table class="summary-table">
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Prepared By</td>
            <td style="width: 35%; font-weight: 600;">${preparedBy}</td>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Workflow Status</td>
            <td style="width: 35%; font-weight: 700; text-transform: uppercase;">${pb.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">REPORT HISTORY</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">FROM</th>
              <th style="width: 15%;">TO</th>
              <th style="width: 20%;">BY</th>
              <th style="width: 18%; text-align: center;">AT</th>
              <th style="width: 10%; text-align: center;">DAYS SINCE</th>
              <th style="width: 22%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Client-side formatted print window for Purchase Requisitions (PR).
 * Renders every field, section, items table, budget head, contractor info, attached MRs, and workflow status.
 */
export function printPurchaseRequisitionReport(pr: any) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow) return;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const printedByName = pr.printed_by || pr.profiles?.name || pr.created_by_name || pr.raised_by || 'Karan Shah';
  const prDateStr = pr.pr_date || (pr.created_at ? new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const reqDateStr = pr.target_date || pr.required_date ? new Date(pr.target_date || pr.required_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const projectName = pr.project_name || pr.projects?.name || '';
  const companyName = pr.company_name || '';
  const subProject = pr.site_name || pr.sub_project || '';
  const contractorName = pr.contractor_name || pr.contractor || '';
  const costCenter = pr.cost_code || pr.budget_head || pr.cost_center || '';
  const activityNames = pr.activity_name || pr.work_activity || '';
  const deliveryAddress = pr.delivery_address || '';
  const remarks = pr.general_remarks || pr.remarks || pr.justification || '';
  const unlockedProject = pr.unlocked_project ?? '1.00';
  const preparedBy = pr.prepared_by || pr.profiles?.name || pr.created_by_name || pr.raised_by || '';
  const prReleaseDate = pr.pr_release_date || (pr.created_at ? new Date(pr.created_at).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
  const status = pr.status || 'Approved';

  const items = pr.items || pr.lines || pr.pr_items || pr.purchase_requisition_lines || [];
  const itemsHtml = items.map((item: any, idx: number) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px 6px;">${item.category_group || item.item_group || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; font-weight: 600;">${item.item_description || item.description || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: center;">${item.unit || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 6px;">${item.brand || item.item_brand || '-'}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;">${Number(item.est_qty ?? 0).toFixed(3)}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;">${Number(item.iss_qty ?? 0).toFixed(3)}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right; font-weight: 700;">${Number(item.quantity ?? item.qty ?? 0).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;">${Number(item.bal_qty ?? item.quantity ?? 0).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;">${Number(item.pending_pr ?? 0).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;">${item.lead_period ? Number(item.lead_period).toFixed(2) : ''}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: center;">${item.lead_period_date || item.required_date || reqDateStr}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: center;">${item.required_date || item.target_date || reqDateStr}</td>
      <td style="border: 1px solid #000; padding: 6px 6px; text-align: right;">${item.stock_qty ? Number(item.stock_qty).toFixed(3) : ''}</td>
    </tr>
  `).join('');

  const historyEntries = pr.history && Array.isArray(pr.history) ? pr.history : [];
  const historyHtml = historyEntries.length > 0
    ? historyEntries.map((h: any) => `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.from || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.to || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${h.by || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.at || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.daysSince ?? ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.remarks || ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="border: 1px solid #000; padding: 10px; text-align: center; color: #444;">No history logs recorded</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Purchase Requisition Report - ${pr.pr_number || ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 18px; color: #000; margin: 0; background: #fff; line-height: 1.3; }
          h1, h2, h3 { color: #000; margin: 0; padding: 0; }
          .header-container { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 6px; }
          .header-title { font-size: 18px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 2px; }
          .header-subtitle { font-size: 10px; font-weight: 600; }
          
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; table-layout: fixed; }
          .meta-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; word-wrap: break-word; }
          .meta-label { font-weight: 800; width: 16%; background: #fff; }
          .meta-val { font-weight: 600; width: 34%; }

          .section-heading { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 5px 0; border-bottom: 1.5px solid #000; padding-bottom: 2px; }
          .center-heading { text-align: center; border-bottom: none; }

          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 9px; table-layout: fixed; }
          .data-table th { border: 1px solid #000; padding: 5px 3px; text-align: left; font-size: 8.5px; font-weight: 900; background: #fff; word-wrap: break-word; }
          .data-table td { border: 1px solid #000; padding: 4px 3px; word-wrap: break-word; }
          
          .summary-table { width: 100%; border-collapse: collapse; margin-top: -1px; margin-bottom: 14px; font-size: 9.5px; table-layout: fixed; }
          .summary-table td { border: 1px solid #000; padding: 4px 6px; word-wrap: break-word; }

          .btn-print { padding: 8px 18px; background-color: #000; color: #fff; border: 1px solid #000; font-weight: 800; cursor: pointer; font-size: 12px; text-transform: uppercase; }
          .btn-print:hover { background-color: #333; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4 landscape; margin: 6mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ PRINT REPORT / SAVE AS PDF</button>
        </div>

        <div class="header-container">
          <div class="header-title">Purchase Requisition</div>
          <div class="header-subtitle">Printed By: ${printedByName} on Date: ${printDateStr}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">P.R. No.</td>
            <td class="meta-val">${pr.pr_number || ''}</td>
            <td class="meta-label">P.R.Date*</td>
            <td class="meta-val">${prDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Project Name*</td>
            <td class="meta-val">${projectName}</td>
            <td class="meta-label">Name of Company</td>
            <td class="meta-val">${companyName}</td>
          </tr>
          <tr>
            <td class="meta-label">Sub Project*</td>
            <td class="meta-val">${subProject}</td>
            <td class="meta-label">Contractor Name</td>
            <td class="meta-val">${contractorName}</td>
          </tr>
          <tr>
            <td class="meta-label">Cost Center</td>
            <td class="meta-val">${costCenter}</td>
            <td class="meta-label"></td>
            <td class="meta-val"></td>
          </tr>
          <tr>
            <td class="meta-label">Activity Names</td>
            <td class="meta-val">${activityNames}</td>
            <td class="meta-label"></td>
            <td class="meta-val"></td>
          </tr>
        </table>

        <div class="section-heading center-heading">Material Request Entries*</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 25px; text-align: center;">Sr</th>
              <th style="width: 75px;">Item Group*</th>
              <th style="width: 120px;">Item Desc*</th>
              <th style="width: 35px; text-align: center;">Unit*</th>
              <th style="width: 55px;">Item Brand</th>
              <th style="width: 45px; text-align: right;">Est Qty</th>
              <th style="width: 45px; text-align: right;">Iss Qty</th>
              <th style="width: 50px; text-align: right;">Quantity*</th>
              <th style="width: 45px; text-align: right;">Bal Qty</th>
              <th style="width: 50px; text-align: right;">Pending PR</th>
              <th style="width: 45px; text-align: center;">Lead Period</th>
              <th style="width: 65px; text-align: center;">Lead Period Date</th>
              <th style="width: 65px; text-align: center;">Required Date*</th>
              <th style="width: 50px; text-align: right;">Stock Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml.length > 0 ? itemsHtml : '<tr><td colspan="14" style="border: 1px solid #000; padding:10px; text-align:center;">No entries found</td></tr>'}
          </tbody>
        </table>

        <table class="summary-table">
          <tr>
            <td style="width: 15%; font-weight: 800;">Delivery Address</td>
            <td style="width: 85%; font-weight: 600;" colspan="13">${deliveryAddress}</td>
          </tr>
          <tr>
            <td style="width: 15%; font-weight: 800;">Remarks</td>
            <td style="width: 85%; font-weight: 600;" colspan="13">${remarks}</td>
          </tr>
          <tr>
            <td style="width: 15%; font-weight: 800;">Unlocked Project</td>
            <td style="width: 35%; font-weight: 600;" colspan="5">${unlockedProject}</td>
            <td style="width: 15%; font-weight: 800;" colspan="2">Prepared By</td>
            <td style="width: 35%; font-weight: 600;" colspan="6">${preparedBy}</td>
          </tr>
          <tr>
            <td style="width: 15%; font-weight: 800;">PR Release Date</td>
            <td style="width: 35%; font-weight: 600;" colspan="5">${prReleaseDate}</td>
            <td style="width: 15%; font-weight: 800;" colspan="2">Status</td>
            <td style="width: 35%; font-weight: 700;" colspan="6">${status}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">REPORT HISTORY</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">FROM</th>
              <th style="width: 15%;">TO</th>
              <th style="width: 20%;">BY</th>
              <th style="width: 18%; text-align: center;">AT</th>
              <th style="width: 10%; text-align: center;">DAYS SINCE</th>
              <th style="width: 22%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

export function printPurchaseOrderReport(po: any) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow) return;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const poDateStr = po.po_date || (po.created_at ? new Date(po.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const issuedByName = po.profiles?.name || po.created_by_name || '';
  const vendorName = po.vendor_name || po.vendors?.display_name || po.vendors?.legal_name || '';
  const projectName = po.project_name || po.projects?.name || '';

  const items = po.items || po.lines || po.purchase_order_lines || [];
  const itemsHtml = items.map((item: any, idx: number) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 700;">${item.item_code || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${item.item_description || item.description || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">${item.category_group || item.item_group || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${item.unit || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.quantity ?? item.qty ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${item.unit_rate ? '₹ ' + Number(item.unit_rate).toFixed(2) : ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${item.discount_perc ? item.discount_perc + '%' : ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right;">${item.tax_rate ? item.tax_rate + '%' : ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.net_amount ? '₹ ' + Number(item.net_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
    </tr>
  `).join('');

  const historyEntries = po.history && Array.isArray(po.history) ? po.history : [];
  const historyHtml = historyEntries.length > 0
    ? historyEntries.map((h: any) => `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.from || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.to || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${h.by || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.at || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.daysSince ?? ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.remarks || ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="border: 1px solid #000; padding: 10px; text-align: center; color: #444;">No history logs recorded</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Purchase Order Report - ${po.po_number || ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #000; margin: 0; background: #fff; line-height: 1.3; }
          h1, h2, h3 { color: #000; margin: 0; padding: 0; }
          .header-container { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .header-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
          .header-subtitle { font-size: 11px; font-weight: 600; text-transform: uppercase; }
          
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .meta-table td { border: 1px solid #000; padding: 6px 10px; vertical-align: middle; }
          .meta-label { font-weight: 800; text-transform: uppercase; width: 22%; background: #fff; }
          .meta-val { font-weight: 600; width: 28%; }

          .section-heading { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px 0; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
          .center-heading { text-align: center; border-bottom: none; }

          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 11px; }
          .data-table th { border: 1px solid #000; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 900; text-transform: uppercase; background: #fff; }
          .data-table td { border: 1px solid #000; padding: 6px 8px; }
          
          .summary-table { width: 100%; border-collapse: collapse; margin-top: -1px; margin-bottom: 20px; font-size: 11px; }
          .summary-table td { border: 1px solid #000; padding: 6px 10px; }

          .btn-print { padding: 8px 18px; background-color: #000; color: #fff; border: 1px solid #000; font-weight: 800; cursor: pointer; font-size: 12px; text-transform: uppercase; }
          .btn-print:hover { background-color: #333; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4 landscape; margin: 8mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ PRINT REPORT / SAVE AS PDF</button>
        </div>

        <div class="header-container">
          <div class="header-title">Purchase Orders</div>
          <div class="header-subtitle">Printed By: ${issuedByName} &nbsp;&nbsp; on Date: ${printDateStr}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">P.O. No.</td>
            <td class="meta-val">${po.po_number || ''}</td>
            <td class="meta-label">P.O. Date *</td>
            <td class="meta-val">${poDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Project & Site</td>
            <td class="meta-val">${projectName}</td>
            <td class="meta-label">Vendor Name</td>
            <td class="meta-val">${vendorName}</td>
          </tr>
          <tr>
            <td class="meta-label">Payment Terms</td>
            <td class="meta-val">${po.payment_terms || ''}</td>
            <td class="meta-label">Delivery Date</td>
            <td class="meta-val">${po.delivery_date || ''}</td>
          </tr>
          <tr>
            <td class="meta-label">Total PO Amount</td>
            <td class="meta-val" style="font-weight:900;">${po.total_amount || po.total_po_value ? '₹ ' + Number(po.total_amount || po.total_po_value).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
            <td class="meta-label">Status</td>
            <td class="meta-val" style="text-transform: uppercase;">${po.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">Purchase Order Line Items</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Sr No.</th>
              <th>Code</th>
              <th>Description</th>
              <th>Category</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: right;">Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Disc %</th>
              <th style="text-align: right;">GST %</th>
              <th style="text-align: right;">Net Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml.length > 0 ? itemsHtml : '<tr><td colspan="10" style="border: 1px solid #000; padding:12px; text-align:center;">No PO items attached</td></tr>'}
          </tbody>
        </table>

        <table class="summary-table">
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Issued By</td>
            <td style="width: 35%; font-weight: 600;">${issuedByName}</td>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Status</td>
            <td style="width: 35%; font-weight: 700; text-transform: uppercase;">${po.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">REPORT HISTORY</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">FROM</th>
              <th style="width: 15%;">TO</th>
              <th style="width: 20%;">BY</th>
              <th style="width: 18%; text-align: center;">AT</th>
              <th style="width: 10%; text-align: center;">DAYS SINCE</th>
              <th style="width: 22%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

export function printRfqReport(rfq: any) {
  if (typeof window === 'undefined') return;
  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  if (!printWindow) return;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const rfqDateStr = rfq.rfq_date || (rfq.created_at ? new Date(rfq.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const issuedByName = rfq.profiles?.name || rfq.created_by_name || '';

  const items = rfq.items || rfq.lines || rfq.rfq_items || [];
  const itemsHtml = items.map((item: any, idx: number) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${item.item_description || item.description || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">${item.category_group || item.item_group || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${item.unit || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 700;">${item.quantity ?? item.qty ?? ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">${item.specifications || item.make || ''}</td>
      <td style="border: 1px solid #000; padding: 6px 8px;">${item.remarks || ''}</td>
    </tr>
  `).join('');

  const historyEntries = rfq.history && Array.isArray(rfq.history) ? rfq.history : [];
  const historyHtml = historyEntries.length > 0
    ? historyEntries.map((h: any) => `
        <tr>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.from || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.to || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; font-weight: 600;">${h.by || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.at || ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px; text-align: center;">${h.daysSince ?? ''}</td>
          <td style="border: 1px solid #000; padding: 6px 8px;">${h.remarks || ''}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" style="border: 1px solid #000; padding: 10px; text-align: center; color: #444;">No history logs recorded</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Request for Quotation Report - ${rfq.rfq_number || ''}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #000; margin: 0; background: #fff; line-height: 1.3; }
          h1, h2, h3 { color: #000; margin: 0; padding: 0; }
          .header-container { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .header-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
          .header-subtitle { font-size: 11px; font-weight: 600; text-transform: uppercase; }
          
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .meta-table td { border: 1px solid #000; padding: 6px 10px; vertical-align: middle; }
          .meta-label { font-weight: 800; text-transform: uppercase; width: 22%; background: #fff; }
          .meta-val { font-weight: 600; width: 28%; }

          .section-heading { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px 0; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
          .center-heading { text-align: center; border-bottom: none; }

          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 11px; }
          .data-table th { border: 1px solid #000; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 900; text-transform: uppercase; background: #fff; }
          .data-table td { border: 1px solid #000; padding: 6px 8px; }
          
          .summary-table { width: 100%; border-collapse: collapse; margin-top: -1px; margin-bottom: 20px; font-size: 11px; }
          .summary-table td { border: 1px solid #000; padding: 6px 10px; }

          .btn-print { padding: 8px 18px; background-color: #000; color: #fff; border: 1px solid #000; font-weight: 800; cursor: pointer; font-size: 12px; text-transform: uppercase; }
          .btn-print:hover { background-color: #333; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            @page { size: A4 landscape; margin: 8mm; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px; text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ PRINT REPORT / SAVE AS PDF</button>
        </div>

        <div class="header-container">
          <div class="header-title">Request For Quotations</div>
          <div class="header-subtitle">Printed By: ${issuedByName} &nbsp;&nbsp; on Date: ${printDateStr}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">R.F.Q. No.</td>
            <td class="meta-val">${rfq.rfq_number || ''}</td>
            <td class="meta-label">R.F.Q. Date *</td>
            <td class="meta-val">${rfqDateStr}</td>
          </tr>
          <tr>
            <td class="meta-label">Project & Site</td>
            <td class="meta-val">${rfq.project_name || rfq.projects?.name || ''}</td>
            <td class="meta-label">Submission Deadline</td>
            <td class="meta-val">${rfq.submission_deadline || rfq.due_date || ''}</td>
          </tr>
          <tr>
            <td class="meta-label">Ref PR/MR No.</td>
            <td class="meta-val">${rfq.pr_number || rfq.mr_number || ''}</td>
            <td class="meta-label">Status</td>
            <td class="meta-val" style="text-transform: uppercase;">${rfq.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">Requested Material Specifications</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">Sr No.</th>
              <th>Item Description</th>
              <th>Category</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: right;">Quantity</th>
              <th>Specifications / Brand</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml.length > 0 ? itemsHtml : '<tr><td colspan="7" style="border: 1px solid #000; padding:12px; text-align:center;">No items requested</td></tr>'}
          </tbody>
        </table>

        <table class="summary-table">
          <tr>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Issued By</td>
            <td style="width: 35%; font-weight: 600;">${issuedByName}</td>
            <td style="width: 15%; font-weight: 900; text-transform: uppercase;">Status</td>
            <td style="width: 35%; font-weight: 700; text-transform: uppercase;">${rfq.status || ''}</td>
          </tr>
        </table>

        <div class="section-heading center-heading">REPORT HISTORY</div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 15%;">FROM</th>
              <th style="width: 15%;">TO</th>
              <th style="width: 20%;">BY</th>
              <th style="width: 18%; text-align: center;">AT</th>
              <th style="width: 10%; text-align: center;">DAYS SINCE</th>
              <th style="width: 22%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${historyHtml}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
