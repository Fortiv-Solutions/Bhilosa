// ============================================================================
// PURCHASE REQUISITION (PR) TYPES & INTERFACES
// Module: Supply Chain Management - Purchase Requisition Subsystem
// ============================================================================

import type { Role } from '@/lib/roles';
import type {
  PurchaseRequisitionRow,
  MaterialRequestRow,
  ProcurementProjectOption,
  VendorRow,
} from '@/lib/procurement';

export type { Role, PurchaseRequisitionRow, MaterialRequestRow, ProcurementProjectOption, VendorRow };

// ---------------------------------------------------------------------------
// Workflow status model (see schema.sql section 2)
// ---------------------------------------------------------------------------
export type PrWorkflowStatus =
  | 'draft'
  | 'under_verification'
  | 'awaiting_assignment'
  | 'pending_approval'
  | 'approved'
  | 'pending_procurement'
  | 'closed'
  // exception / legacy
  | 'submitted'
  | 'in_review'
  | 'assigned'
  | 'returned_to_draft'
  | 'revision_required'
  | 'rejected'
  | 'cancelled'
  | 'on_hold'
  | 'rfq_sent'
  | 'vendor_selected'
  | 'po_issued'
  | 'auto_draft_pr';

export type PrType = 'material' | 'service' | 'labour_contract' | 'equipment_hire' | 'mixed';
export type PrPriority = 'low' | 'medium' | 'normal' | 'high' | 'urgent' | 'critical';
export type BudgetStatus = 'within_budget' | 'near_limit' | 'over_budget' | 'not_applicable';

export const PR_TYPE_OPTIONS: { value: PrType; label: string }[] = [
  { value: 'material', label: 'Material' },
];

export const PR_PRIORITY_OPTIONS: { value: PrPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
];

/** PR types that require the contractor / service-provider section. */
export function prTypeNeedsContractor(prType: PrType): boolean {
  return prType === 'service' || prType === 'labour_contract' || prType === 'equipment_hire' || prType === 'mixed';
}

// ---------------------------------------------------------------------------
// Approved-MR picker (Add from Approved MR drawer)
// ---------------------------------------------------------------------------
export interface ApprovedMrLine {
  id: string;
  mr_line_number: number;
  item_id: string | null;
  item_code: string | null;
  item_group: string | null;
  item_description: string;
  specification: string | null;
  unit: string;
  approved_qty: number;
  converted_qty: number;
  pending_qty: number;
  estimated_rate: number;
  activity_name?: string | null;
  sub_activity_name?: string | null;
  activity_code?: string | null;
  item_brand?: string | null;
}

export interface ApprovedMrRow {
  id: string;
  mr_number: string;
  mr_date: string;
  company_name: string | null;
  project_id: string;
  project_name: string | null;
  site_id: string | null;
  site_name: string | null;
  work_activity: string | null;
  sub_activity_name?: string | null;
  activity_code: string | null;
  requested_by: string | null;
  required_date: string;
  priority: MaterialRequestRow['priority'];
  total_items: number;
  approved_qty_total: number;
  converted_qty_total: number;
  pending_qty_total: number;
  estimated_value: number;
  budget_status: BudgetStatus | null;
  status: string;
  fully_converted: boolean;
  lines: ApprovedMrLine[];
}

export interface ApprovedMrFilterState {
  searchQuery: string;
  companyName: string;
  projectId: string;
  siteId: string;
  workActivity: string;
  requestedBy: string;
  budgetStatus: string;
  conversionState: '' | 'not_converted' | 'partial';
  dateFrom: string;
  dateTo: string;
}

// ---------------------------------------------------------------------------
// PR form model
// ---------------------------------------------------------------------------
export interface PrFormLine {
  key: string; // stable client key
  source_mr_id: string | null;
  source_mr_number: string | null;
  mr_line_number: number | null;
  material_request_line_id: string | null;
  resource_type: string;
  item_id: string | null;
  item_code: string | null;
  item_group: string | null;
  item_description: string;
  specification: string | null;
  approved_mr_qty: number | null;
  prev_pr_qty: number;
  remaining_mr_qty: number | null;
  pr_quantity: number;
  unit: string;
  estimated_rate: number;
  tax_rate: number;
  required_date: string | null;
  preferred_brand: string | null;
  suggested_vendor: string | null;
  delivery_location: string | null;
  remarks: string | null;
  is_non_mr_item: boolean;
  non_mr_justification: string | null;
  is_modified: boolean;

  // Rich ERP 30-column fields
  status?: string | null;
  priority?: string | null;
  stock_audit?: string | null;
  project_and_block?: string | null;
  work_activity?: string | null;
  raised_by?: string | null;
  submitted_at?: string | null;
  activity_name?: string | null;
  sub_activity_name?: string | null;
  activity_code?: string | null;
  est_qty?: number | null;
  ind_qty?: number | null;
  iss_qty?: number | null;
  extra_rec_qty?: number | null;
  extra_adj_qty?: number | null;
  pr_bal_qty?: number | null;
  lead_period_days?: number | null;
  lead_period_date?: string | null;
}

export interface PrFormState {
  id: string | null;
  pr_number: string | null;
  status: PrWorkflowStatus;
  // Section A
  pr_date: string;
  company_name: string;
  project_id: string;
  site_id: string | null;
  pr_type: PrType;
  priority: PrPriority;
  required_date: string;
  pr_release_date: string | null;
  // Section B
  budget_applicable: boolean;
  budget_head_id: string | null;
  cost_code_id: string | null;
  cost_centre: string;
  activity_name: string;
  activity_code: string;
  wbs_code: string;
  over_budget_justification: string;
  // Section C
  contractor_applicable: boolean;
  contractor_name: string;
  vendor_code: string;
  contract_reference: string;
  scope_of_service: string;
  contact_person: string;
  contact_number: string;
  // Delivery & additional
  delivery_address: string;
  site_contact_person: string;
  site_contact_number: string;
  delivery_instructions: string;
  general_remarks: string;
  internal_notes: string;
  terms_and_conditions: string;
  department: string;
  // end of form fields
  unlocked_project?: number;
  prepared_by?: string;
  mr_raised_by?: string;
  // Cost summary adjustments
  discount_amount: number;
  freight_amount: number;
  other_charges: number;
  contingency_amount: number;
  // Lines
  lines: PrFormLine[];
}

export interface PrCostSummary {
  itemSubtotal: number;
  serviceSubtotal: number;
  discount: number;
  taxAmount: number;
  freight: number;
  otherCharges: number;
  contingency: number;
  totalEstimatedCost: number;
}

// A single row for the PR list.
export interface PrFilterState {
  searchQuery: string;
  projectId: string;
  status: string;
  priority: string;
  prType: string;
}
