// ============================================================================
// PURCHASE REQUISITION (PR) SERVICE LAYER
// Talks directly to Supabase. Kept separate from the monolithic procurement.ts
// to stay modular and avoid an import cycle with the shared row types.
// ============================================================================

import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import type {
  ApprovedMrRow,
  ApprovedMrLine,
  PrFormState,
  PrFormLine,
  PrCostSummary,
  BudgetStatus,
  PrWorkflowStatus,
} from './types';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function currentProfileId(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) return data.user.id;
  } catch {
    /* unauthenticated fallback */
  }
  return '11111111-1111-1111-1111-111111111111';
}

async function currentRole(): Promise<string | null> {
  const id = await currentProfileId();
  if (!id) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', id).single();
  return (data as { role?: string | null } | null)?.role ?? 'admin';
}

// ---------------------------------------------------------------------------
// Pure calculation helpers (shared by the form UI and the persistence layer)
// ---------------------------------------------------------------------------
const SERVICE_RESOURCE_TYPES = new Set(['service', 'labour', 'labour_contract', 'equipment_hire']);

export function lineBaseAmount(line: Pick<PrFormLine, 'pr_quantity' | 'estimated_rate'>): number {
  return Number(line.pr_quantity || 0) * Number(line.estimated_rate || 0);
}

export function lineTaxAmount(line: Pick<PrFormLine, 'pr_quantity' | 'estimated_rate' | 'tax_rate'>): number {
  return lineBaseAmount(line) * (Number(line.tax_rate || 0) / 100);
}

export function computeCostSummary(form: Pick<PrFormState, 'lines' | 'discount_amount' | 'freight_amount' | 'other_charges' | 'contingency_amount'>): PrCostSummary {
  let itemSubtotal = 0;
  let serviceSubtotal = 0;
  let taxAmount = 0;
  for (const line of form.lines) {
    const base = lineBaseAmount(line);
    taxAmount += lineTaxAmount(line);
    if (SERVICE_RESOURCE_TYPES.has((line.resource_type || '').toLowerCase())) {
      serviceSubtotal += base;
    } else {
      itemSubtotal += base;
    }
  }
  const discount = Number(form.discount_amount || 0);
  const freight = Number(form.freight_amount || 0);
  const otherCharges = Number(form.other_charges || 0);
  const contingency = Number(form.contingency_amount || 0);
  const totalEstimatedCost = itemSubtotal + serviceSubtotal - discount + taxAmount + freight + otherCharges + contingency;
  return { itemSubtotal, serviceSubtotal, discount, taxAmount, freight, otherCharges, contingency, totalEstimatedCost };
}

export interface BudgetSnapshot {
  applicable: boolean;
  allocated: number;
  committed: number;
  spent: number;
  available: number;
}

export function computeBudgetStatus(snapshot: BudgetSnapshot | null, thisPrAmount: number): { status: BudgetStatus; remaining: number } {
  if (!snapshot || !snapshot.applicable) return { status: 'not_applicable', remaining: 0 };
  const remaining = snapshot.available - thisPrAmount;
  if (remaining < 0) return { status: 'over_budget', remaining };
  // "near limit" when this PR would consume >85% of what's available
  if (snapshot.available > 0 && thisPrAmount / snapshot.available >= 0.85) return { status: 'near_limit', remaining };
  return { status: 'within_budget', remaining };
}

const MOCK_APPROVED_MRS: ApprovedMrRow[] = [
  {
    id: 'mr-mock-1',
    mr_number: 'MR-20260721-001',
    mr_date: '2026-07-21T09:30:00Z',
    company_name: 'Pramukh Group Infrastructure Ltd.',
    project_id: 'central-park',
    project_name: 'Central Park',
    site_id: 'site-a',
    site_name: 'Block A - Tower 1',
    work_activity: 'Slab casting',
    activity_code: 'ACT-STR-01',
    requested_by: 'Rohan Mehta (Site Eng)',
    required_date: '2026-07-28',
    priority: 'high',
    total_items: 2,
    approved_qty_total: 515,
    converted_qty_total: 0,
    pending_qty_total: 515,
    estimated_value: 1120000,
    budget_status: 'within_budget',
    status: 'approved',
    fully_converted: false,
    lines: [
      {
        id: 'mrl-1',
        mr_line_number: 1,
        item_id: 'item-101',
        item_code: 'MAT-CEM-001',
        item_group: 'Cement & Concrete',
        item_description: 'OPC 53 Grade Cement',
        specification: 'UltraTech • IS 12269 : 2013 Grade 53',
        unit: 'Bags',
        approved_qty: 500,
        converted_qty: 0,
        pending_qty: 500,
        estimated_rate: 380,
      },
      {
        id: 'mrl-2',
        mr_line_number: 2,
        item_id: 'item-102',
        item_code: 'MAT-STL-002',
        item_group: 'Reinforcement Steel',
        item_description: 'Fe 550D TMT Rebar 12mm',
        specification: 'Tata Tiscon • IS 1786 : 2008 Fe 550D',
        unit: 'MT',
        approved_qty: 15,
        converted_qty: 0,
        pending_qty: 15,
        estimated_rate: 62000,
      },
    ],
  },
  {
    id: 'mr-mock-2',
    mr_number: 'MR-20260720-004',
    mr_date: '2026-07-20T14:15:00Z',
    company_name: 'Pramukh Group Infrastructure Ltd.',
    project_id: 'riverside-heights',
    project_name: 'Riverside Heights',
    site_id: 'site-b',
    site_name: 'Tower 2 - Plumbing',
    work_activity: 'Plumbing & Sanitary Piping',
    activity_code: 'ACT-PLM-03',
    requested_by: 'Vikram Patel (Sr. Site Eng)',
    required_date: '2026-07-30',
    priority: 'medium',
    total_items: 2,
    approved_qty_total: 250,
    converted_qty_total: 0,
    pending_qty_total: 250,
    estimated_value: 88500,
    budget_status: 'within_budget',
    status: 'approved',
    fully_converted: false,
    lines: [
      {
        id: 'mrl-201',
        mr_line_number: 1,
        item_id: 'item-201',
        item_code: 'PLM-CPVC-001',
        item_group: 'Plumbing Materials',
        item_description: 'CPVC Pipes 1 Inch Class 11',
        specification: 'Astral Pipes • Schedule 40 Standard',
        unit: 'Meters',
        approved_qty: 200,
        converted_qty: 0,
        pending_qty: 200,
        estimated_rate: 280,
      },
      {
        id: 'mrl-202',
        mr_line_number: 2,
        item_id: 'item-202',
        item_code: 'PLM-VLV-005',
        item_group: 'Plumbing Fittings',
        item_description: 'Brass Ball Valve 1 Inch',
        specification: 'Zoloto • Heavy Duty Forged Brass',
        unit: 'Nos',
        approved_qty: 50,
        converted_qty: 0,
        pending_qty: 50,
        estimated_rate: 650,
      },
    ],
  },
  {
    id: 'mr-mock-3',
    mr_number: 'MR-20260719-002',
    mr_date: '2026-07-19T11:00:00Z',
    company_name: 'Pramukh Group Electricals Ltd.',
    project_id: 'skyline-towers',
    project_name: 'Skyline Towers',
    site_id: 'site-c',
    site_name: 'Substation & Main Panel',
    work_activity: 'Electrical Wiring & Panel Board',
    activity_code: 'ACT-ELE-02',
    requested_by: 'Anil Sharma (MEP Engineer)',
    required_date: '2026-08-05',
    priority: 'high',
    total_items: 2,
    approved_qty_total: 504,
    converted_qty_total: 0,
    pending_qty_total: 504,
    estimated_value: 284000,
    budget_status: 'within_budget',
    status: 'approved',
    fully_converted: false,
    lines: [
      {
        id: 'mrl-301',
        mr_line_number: 1,
        item_id: 'item-301',
        item_code: 'ELE-CBL-016',
        item_group: 'Electrical Cables',
        item_description: 'FRLS Copper Armoured Cable 4 Core 16 sq mm',
        specification: 'Havells • Heavy Duty Underground Armoured',
        unit: 'Meters',
        approved_qty: 500,
        converted_qty: 0,
        pending_qty: 500,
        estimated_rate: 420,
      },
      {
        id: 'mrl-302',
        mr_line_number: 2,
        item_id: 'item-302',
        item_code: 'ELE-DB-100',
        item_group: 'Switchgear & DB',
        item_description: '100A TPN MCB Distribution Board',
        specification: 'Schneider Electric • IP43 Enclosure with Main Switch',
        unit: 'Nos',
        approved_qty: 4,
        converted_qty: 0,
        pending_qty: 4,
        estimated_rate: 18500,
      },
    ],
  },
];

export async function listApprovedMaterialRequestsForPr(projectId?: string): Promise<ApprovedMrRow[]> {
  if (!isLiveSupabase()) {
    if (projectId && projectId !== 'all') {
      return MOCK_APPROVED_MRS.filter((mr) => mr.project_id === projectId);
    }
    return MOCK_APPROVED_MRS;
  }

  const dbProjectId = projectId && projectId !== 'all' ? getDbSiteId(projectId) : null;

  let query = supabase
    .from('material_requests')
    .select(`
      id, mr_number, created_at, required_date, priority, status, work_activity, site_block,
      company_name, activity_code, project_id, site_id,
      profiles!material_requests_raised_by_fkey(name),
      projects(name),
      project_sites(name),
      material_request_lines(id, item_id, item_description, specification, quantity, unit, estimated_rate, converted_qty, item_code, item_group)
    `)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (dbProjectId) query = query.eq('project_id', dbProjectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows: ApprovedMrRow[] = ((data ?? []) as Record<string, unknown>[]).map((raw) => {
    const rawLines = (raw.material_request_lines ?? []) as Record<string, unknown>[];
    const lines: ApprovedMrLine[] = rawLines.map((l, idx) => {
      const approved = Number(l.quantity || 0);
      const converted = Number(l.converted_qty || 0);
      const pending = Math.max(approved - converted, 0);
      return {
        id: String(l.id),
        mr_line_number: idx + 1,
        item_id: (l.item_id as string | null) ?? null,
        item_code: (l.item_code as string | null) ?? null,
        item_group: (l.item_group as string | null) ?? null,
        item_description: String(l.item_description ?? ''),
        specification: (l.specification as string | null) ?? null,
        unit: String(l.unit ?? 'nos'),
        approved_qty: approved,
        converted_qty: converted,
        pending_qty: pending,
        estimated_rate: Number(l.estimated_rate || 0),
      };
    });

    const approvedTotal = lines.reduce((s, l) => s + l.approved_qty, 0);
    const convertedTotal = lines.reduce((s, l) => s + l.converted_qty, 0);
    const pendingTotal = lines.reduce((s, l) => s + l.pending_qty, 0);
    const estimatedValue = lines.reduce((s, l) => s + l.pending_qty * l.estimated_rate, 0);
    const profile = raw.profiles as { name?: string | null } | null;
    const project = raw.projects as { name?: string | null } | null;
    const site = raw.project_sites as { name?: string | null } | null;

    return {
      id: String(raw.id),
      mr_number: String(raw.mr_number ?? ''),
      mr_date: String(raw.created_at ?? ''),
      company_name: (raw.company_name as string | null) ?? null,
      project_id: String(raw.project_id ?? ''),
      project_name: project?.name ?? null,
      site_id: (raw.site_id as string | null) ?? null,
      site_name: site?.name ?? null,
      work_activity: (raw.work_activity as string | null) ?? null,
      activity_code: (raw.activity_code as string | null) ?? null,
      requested_by: profile?.name ?? null,
      required_date: String(raw.required_date ?? ''),
      priority: (raw.priority as ApprovedMrRow['priority']) ?? 'medium',
      total_items: lines.length,
      approved_qty_total: approvedTotal,
      converted_qty_total: convertedTotal,
      pending_qty_total: pendingTotal,
      estimated_value: estimatedValue,
      budget_status: null,
      status: String(raw.status ?? ''),
      fully_converted: pendingTotal <= 0.0001,
      lines,
    };
  });

  // Only MRs that still have quantity left to requisition.
  return rows.filter((r) => !r.fully_converted);
}

// ---------------------------------------------------------------------------
// Budget lookups (Section B)
// ---------------------------------------------------------------------------
export async function getBudgetSnapshotForPr(projectId: string, budgetHeadId?: string | null): Promise<BudgetSnapshot | null> {
  if (!isLiveSupabase()) return null;
  const dbProjectId = getDbSiteId(projectId);
  let query = supabase
    .from('budget_allocations')
    .select('allocated_amount, committed_amount, spent_amount, budget_head_id')
    .eq('project_id', dbProjectId)
    .eq('status', 'approved')
    .is('deleted_at', null);
  if (budgetHeadId) query = query.eq('budget_head_id', budgetHeadId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Record<string, unknown>[];
  if (list.length === 0) return { applicable: true, allocated: 0, committed: 0, spent: 0, available: 0 };

  const allocated = list.reduce((s, a) => s + Number(a.allocated_amount || 0), 0);
  const committed = list.reduce((s, a) => s + Number(a.committed_amount || 0), 0);
  const spent = list.reduce((s, a) => s + Number(a.spent_amount || 0), 0);
  return { applicable: true, allocated, committed, spent, available: allocated - committed - spent };
}

export async function listBudgetHeads(): Promise<{ id: string; code: string; name: string }[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase.from('budget_heads').select('id, code, name').order('name');
  if (error) return [];
  return (data ?? []) as { id: string; code: string; name: string }[];
}

export async function listCostCodes(): Promise<{ id: string; code: string; name: string }[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase.from('cost_codes').select('id, code, name').order('code');
  if (error) return [];
  return (data ?? []) as { id: string; code: string; name: string }[];
}

// ---------------------------------------------------------------------------
// PR number generation: PR/PROJECT-CODE/YEAR/0001
// ---------------------------------------------------------------------------
async function generatePrNumber(dbProjectId: string): Promise<string> {
  const year = new Date().getFullYear();
  let code = 'PR';
  const { data: project } = await supabase.from('projects').select('code').eq('id', dbProjectId).maybeSingle();
  if ((project as { code?: string } | null)?.code) code = String((project as { code: string }).code).toUpperCase();

  const { count } = await supabase
    .from('purchase_requisitions')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', dbProjectId);

  const seq = String((count ?? 0) + 1).padStart(4, '0');
  return `PR/${code}/${year}/${seq}`;
}

// ---------------------------------------------------------------------------
// Persist a PR (create or update). `submit` advances a draft to verification.
// ---------------------------------------------------------------------------
export async function savePurchaseRequisition(
  form: PrFormState,
  options: { submit?: boolean } = {},
): Promise<MutationResult<{ purchaseRequisitionId: string; prNumber: string; status: string }>> {
  try {
    const isAutoDraftStatus = (s: string | null | undefined) => !s || String(s).toLowerCase().includes('auto');
    const nextStatus = options.submit
      ? 'under_verification'
      : (isAutoDraftStatus(form.status) ? 'draft' : (form.status || 'draft'));

    if (!isLiveSupabase()) {
      const prId = form.id || `pr-local-${Date.now()}`;
      const prNumber = form.pr_number || `PR-${Date.now().toString().slice(-4)}`;
      return { data: { purchaseRequisitionId: prId, prNumber, status: nextStatus }, error: null };
    }
    const profileId = await currentProfileId();
    if (!form.project_id) throw new Error('Project is required.');
    if (form.lines.length === 0) throw new Error('Add at least one item before saving.');

    const dbProjectId = getDbSiteId(form.project_id);
    const summary = computeCostSummary(form);
    const financeRequired = summary.totalEstimatedCost >= 500000;

    const header: Record<string, unknown> = {
      project_id: dbProjectId,
      site_id: form.site_id,
      company_name: form.company_name || null,
      pr_type: form.pr_type,
      priority: form.priority,
      title: form.activity_name || form.company_name || 'Purchase Requisition',
      required_date: form.required_date || null,
      pr_release_date: form.pr_release_date || null,
      requested_date: form.pr_date || today(),
      // Section B
      budget_applicable: form.budget_applicable,
      budget_head_id: form.budget_head_id,
      cost_code_id: form.cost_code_id,
      cost_centre: form.cost_centre || null,
      activity_name: form.activity_name || null,
      activity_code: form.activity_code || null,
      wbs_code: form.wbs_code || null,
      over_budget_justification: form.over_budget_justification || null,
      // Section C
      contractor_applicable: form.contractor_applicable,
      contractor_name: form.contractor_name || null,
      vendor_code: form.vendor_code || null,
      contract_reference: form.contract_reference || null,
      scope_of_service: form.scope_of_service || null,
      contact_person: form.contact_person || null,
      contact_number: form.contact_number || null,
      // Delivery & additional
      delivery_address: form.delivery_address || null,
      site_contact_person: form.site_contact_person || null,
      site_contact_number: form.site_contact_number || null,
      delivery_instructions: form.delivery_instructions || null,
      general_remarks: form.general_remarks || null,
      internal_notes: form.internal_notes || null,
      terms_and_conditions: form.terms_and_conditions || null,
      department: form.department || null,
      prepared_by: profileId,
      prepared_on: new Date().toISOString(),
      // Cost summary
      subtotal_amount: summary.itemSubtotal,
      service_subtotal: summary.serviceSubtotal,
      discount_amount: summary.discount,
      tax_amount: summary.taxAmount,
      freight_amount: summary.freight,
      other_charges: summary.otherCharges,
      contingency_amount: summary.contingency,
      total_amount: summary.totalEstimatedCost,
      estimated_cost: summary.totalEstimatedCost, // backward compatibility
      finance_required: financeRequired,
      status: nextStatus,
      status_changed_at: new Date().toISOString(),
      updated_by: profileId,
    };

    let prId = form.id;
    let prNumber = form.pr_number;

    if (!prId) {
      prNumber = await generatePrNumber(dbProjectId);
      const { data, error } = await supabase
        .from('purchase_requisitions')
        .insert({
          ...header,
          pr_number: prNumber,
          material_request_id: form.lines.find((l) => l.source_mr_id)?.source_mr_id ?? null,
          created_by: profileId,
        })
        .select('id, pr_number')
        .single();
      if (error) throw new Error(error.message);
      prId = (data as { id: string }).id;
      prNumber = (data as { pr_number: string }).pr_number;
    } else {
      const { error } = await supabase.from('purchase_requisitions').update(header).eq('id', prId);
      if (error) throw new Error(error.message);
      // Replace lines wholesale (simplest correct edit semantics for the draft form)
      await supabase.from('purchase_requisition_lines').delete().eq('purchase_requisition_id', prId);
    }

    const lineRows = form.lines.map((line, idx) => {
      const base = lineBaseAmount(line);
      const tax = lineTaxAmount(line);
      return {
        purchase_requisition_id: prId,
        project_id: dbProjectId,
        line_number: idx + 1,
        material_request_line_id: line.material_request_line_id,
        source_mr_id: line.source_mr_id,
        source_mr_number: line.source_mr_number,
        mr_line_number: line.mr_line_number,
        resource_type: line.resource_type || 'material',
        item_id: line.item_id,
        item_code: line.item_code,
        item_group: line.item_group,
        item_description: line.item_description,
        specification: line.specification,
        approved_mr_qty: line.approved_mr_qty,
        prev_pr_qty: line.prev_pr_qty,
        remaining_mr_qty: line.remaining_mr_qty,
        quantity: line.pr_quantity,
        unit: line.unit,
        estimated_rate: line.estimated_rate,
        tax_rate: line.tax_rate,
        tax_amount: tax,
        line_total: base,
        required_date: line.required_date,
        preferred_brand: line.preferred_brand,
        suggested_vendor: line.suggested_vendor,
        delivery_location: line.delivery_location,
        remarks: line.remarks,
        is_non_mr_item: line.is_non_mr_item,
        non_mr_justification: line.non_mr_justification,
        is_modified: line.is_modified,
        created_by: profileId,
        updated_by: profileId,
      };
    });

    const { error: lineError } = await supabase.from('purchase_requisition_lines').insert(lineRows);
    if (lineError) throw new Error(lineError.message);

    // Recompute MR conversion balances for every source line touched.
    const mrLineIds = Array.from(new Set(form.lines.map((l) => l.material_request_line_id).filter(Boolean))) as string[];
    for (const mrLineId of mrLineIds) {
      try {
        await supabase.rpc('recompute_mr_line_conversion', { p_mr_line_id: mrLineId });
      } catch {
        /* function may not be present yet; non-fatal */
      }
    }

    await logPrActivity(prId!, dbProjectId, options.submit ? 'Sent for verification' : (form.id ? 'PR updated' : 'PR draft created'), {
      previousStatus: form.status,
      newStatus: nextStatus,
    });

    if (options.submit && prId) {
      try {
        const { data: existingRfq } = await supabase
          .from('rfqs')
          .select('id')
          .eq('purchase_requisition_id', prId)
          .is('deleted_at', null)
          .maybeSingle();

        if (!existingRfq) {
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const rfqNumber = `RFQ-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
          await supabase.from('rfqs').insert({
            project_id: dbProjectId,
            purchase_requisition_id: prId,
            rfq_number: rfqNumber,
            title: form.activity_name || form.company_name || 'Auto-Draft RFQ',
            issue_date: new Date().toISOString().slice(0, 10),
            due_date: form.required_date || new Date().toISOString().slice(0, 10),
            status: 'draft',
            created_by: profileId,
            updated_by: profileId,
          });
        }
      } catch {
        /* best-effort auto-draft RFQ */
      }
    }

    return { data: { purchaseRequisitionId: prId!, prNumber: prNumber || '', status: nextStatus }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Load an existing PR into editable form state
// ---------------------------------------------------------------------------
export async function getPurchaseRequisitionForm(prId: string): Promise<MutationResult<PrFormState>> {
  try {
    if (!isLiveSupabase()) return { data: null, error: null };
    const { data, error } = await supabase
      .from('purchase_requisitions')
      .select('*, purchase_requisition_lines(*)')
      .eq('id', prId)
      .single();
    if (error) throw new Error(error.message);
    const pr = data as Record<string, unknown>;
    const rawLines = (pr.purchase_requisition_lines ?? []) as Record<string, unknown>[];

    const lines: PrFormLine[] = rawLines
      .sort((a, b) => Number(a.line_number || 0) - Number(b.line_number || 0))
      .map((l, idx) => ({
        key: `line-${l.id ?? idx}`,
        source_mr_id: (l.source_mr_id as string | null) ?? null,
        source_mr_number: (l.source_mr_number as string | null) ?? null,
        mr_line_number: (l.mr_line_number as number | null) ?? null,
        material_request_line_id: (l.material_request_line_id as string | null) ?? null,
        resource_type: String(l.resource_type ?? 'material'),
        item_id: (l.item_id as string | null) ?? null,
        item_code: (l.item_code as string | null) ?? null,
        item_group: (l.item_group as string | null) ?? null,
        item_description: String(l.item_description ?? ''),
        specification: (l.specification as string | null) ?? null,
        approved_mr_qty: (l.approved_mr_qty as number | null) ?? null,
        prev_pr_qty: Number(l.prev_pr_qty || 0),
        remaining_mr_qty: (l.remaining_mr_qty as number | null) ?? null,
        pr_quantity: Number(l.quantity || 0),
        unit: String(l.unit ?? 'nos'),
        estimated_rate: Number(l.estimated_rate || 0),
        tax_rate: Number(l.tax_rate || 0),
        required_date: (l.required_date as string | null) ?? null,
        preferred_brand: (l.preferred_brand as string | null) ?? null,
        suggested_vendor: (l.suggested_vendor as string | null) ?? null,
        delivery_location: (l.delivery_location as string | null) ?? null,
        remarks: (l.remarks as string | null) ?? null,
        is_non_mr_item: Boolean(l.is_non_mr_item),
        non_mr_justification: (l.non_mr_justification as string | null) ?? null,
        is_modified: Boolean(l.is_modified),
      }));

    const form: PrFormState = {
      id: String(pr.id),
      pr_number: (pr.pr_number as string | null) ?? null,
      status: (pr.status as PrFormState['status']) ?? 'draft',
      pr_date: String(pr.requested_date ?? today()).slice(0, 10),
      company_name: String(pr.company_name ?? ''),
      project_id: String(pr.project_id ?? ''),
      site_id: (pr.site_id as string | null) ?? null,
      pr_type: (pr.pr_type as PrFormState['pr_type']) ?? 'material',
      priority: (pr.priority as PrFormState['priority']) ?? 'normal',
      required_date: String(pr.required_date ?? '').slice(0, 10),
      pr_release_date: pr.pr_release_date ? String(pr.pr_release_date).slice(0, 10) : null,
      budget_applicable: pr.budget_applicable !== false,
      budget_head_id: (pr.budget_head_id as string | null) ?? null,
      cost_code_id: (pr.cost_code_id as string | null) ?? null,
      cost_centre: String(pr.cost_centre ?? ''),
      activity_name: String(pr.activity_name ?? ''),
      activity_code: String(pr.activity_code ?? ''),
      wbs_code: String(pr.wbs_code ?? ''),
      over_budget_justification: String(pr.over_budget_justification ?? ''),
      contractor_applicable: Boolean(pr.contractor_applicable),
      contractor_name: String(pr.contractor_name ?? ''),
      vendor_code: String(pr.vendor_code ?? ''),
      contract_reference: String(pr.contract_reference ?? ''),
      scope_of_service: String(pr.scope_of_service ?? ''),
      contact_person: String(pr.contact_person ?? ''),
      contact_number: String(pr.contact_number ?? ''),
      delivery_address: String(pr.delivery_address ?? ''),
      site_contact_person: String(pr.site_contact_person ?? ''),
      site_contact_number: String(pr.site_contact_number ?? ''),
      delivery_instructions: String(pr.delivery_instructions ?? ''),
      general_remarks: String(pr.general_remarks ?? ''),
      internal_notes: String(pr.internal_notes ?? ''),
      terms_and_conditions: String(pr.terms_and_conditions ?? ''),
      department: String(pr.department ?? ''),
      discount_amount: Number(pr.discount_amount || 0),
      freight_amount: Number(pr.freight_amount || 0),
      other_charges: Number(pr.other_charges || 0),
      contingency_amount: Number(pr.contingency_amount || 0),
      lines,
    };
    return { data: form, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------
export async function logPrActivity(
  purchaseRequisitionId: string,
  projectId: string,
  action: string,
  opts: { previousStatus?: string | null; newStatus?: string | null; comment?: string | null; changedValues?: Record<string, unknown> | null } = {},
): Promise<void> {
  try {
    const profileId = await currentProfileId();
    const role = await currentRole();
    await supabase.from('pr_activity_log').insert({
      purchase_requisition_id: purchaseRequisitionId,
      project_id: projectId,
      action,
      previous_status: opts.previousStatus ?? null,
      new_status: opts.newStatus ?? null,
      comment: opts.comment ?? null,
      changed_values: opts.changedValues ?? null,
      actor_id: profileId,
      actor_role: role,
    });
  } catch {
    /* audit logging is best-effort */
  }
}

export interface PrActivityRow {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  comment: string | null;
  actor_role: string | null;
  created_at: string;
  profiles?: { name: string | null } | null;
}

export async function listPrActivity(prId: string): Promise<PrActivityRow[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('pr_activity_log')
    .select('id, action, previous_status, new_status, comment, actor_role, created_at, profiles:actor_id(name)')
    .eq('purchase_requisition_id', prId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as PrActivityRow[];
}

// ---------------------------------------------------------------------------
// Workflow — status set, editable states, and required-comment rules
// ---------------------------------------------------------------------------
export const PR_EDITABLE_STATUSES: string[] = [
  'draft',
  'returned_to_draft',
  'revision_required',
  'auto_draft',
  'auto_draft_pr',
  'auto draft from PR',
  'auto_draft_from_mr',
];

export function isPrEditable(status: string | null | undefined): boolean {
  if (!status) return true;
  const s = String(status).toLowerCase().trim();
  return PR_EDITABLE_STATUSES.some((e) => e.toLowerCase() === s) || s.includes('draft');
}

export function validatePrForm(form: PrFormState, _isOverBudget?: boolean): string[] {
  const errs: string[] = [];
  if (form.lines.length === 0) errs.push('At least one item is required.');
  if (!form.company_name.trim()) errs.push('Company name is required.');
  if (!form.project_id) errs.push('Project is required.');
  if (!form.required_date) errs.push('Required-by date is required.');
  if (!form.delivery_address.trim()) errs.push('Delivery address is required.');
  if (!form.activity_name.trim()) errs.push('Activity is required.');
  for (const l of form.lines) {
    if (l.pr_quantity <= 0) { errs.push(`"${l.item_description || 'Item'}" quantity must be greater than zero.`); break; }
    if (!l.is_non_mr_item && l.remaining_mr_qty != null && l.pr_quantity > l.remaining_mr_qty + 1e-6) { errs.push(`"${l.item_description}" exceeds remaining approved MR quantity.`); break; }
    if (l.is_non_mr_item && !(l.non_mr_justification ?? '').trim()) { errs.push('Non-MR items require a justification.'); break; }
  }
  return errs;
}

/** Whether an approval comment must be captured (over-budget, non-MR items, modified qty/spec, or urgent/critical). */
export function approvalCommentRequired(form: PrFormState, isOverBudget: boolean): boolean {
  if (isOverBudget) return true;
  if (form.priority === 'urgent' || form.priority === 'critical') return true;
  return form.lines.some((l) => l.is_non_mr_item || l.is_modified || (!l.is_non_mr_item && l.remaining_mr_qty != null && Math.abs(l.pr_quantity - l.remaining_mr_qty) > 1e-6));
}

export interface ApproverOption { id: string; name: string; role: string; }

export async function listEligibleApprovers(): Promise<ApproverOption[]> {
  if (!isLiveSupabase()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role')
    .in('role', ['upper_management', 'project_manager', 'project_director', 'admin', 'administrator', 'pr_team'])
    .order('name');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), name: String(p.name ?? 'Unnamed'), role: String(p.role ?? '') }));
}

async function notifyUser(userId: string, title: string, body: string): Promise<void> {
  try {
    await supabase.from('notifications').insert({ user_id: userId, title, body, type: 'purchase_requisition', is_read: false });
  } catch {
    /* notifications schema is environment-specific; best-effort only */
  }
}

export interface PrTransitionInput {
  action: string;
  newStatus: PrWorkflowStatus | null; // null => no status change (e.g. reassign)
  comment?: string | null;
  patch?: Record<string, unknown>;
  assignment?: { assignedTo: string; role?: string | null; level?: number | null; dueDate?: string | null; priority?: string | null; instruction?: string | null };
  notify?: boolean;
}

/** Single controlled entry point for every PR workflow transition. */
export async function transitionPurchaseRequisition(prId: string, input: PrTransitionInput): Promise<MutationResult<{ status: string | null }>> {
  try {
    if (!isLiveSupabase()) {
      return { data: { status: input.newStatus ?? 'approved' }, error: null };
    }
    const profileId = await currentProfileId();

    const { data: existing, error: exErr } = await supabase
      .from('purchase_requisitions')
      .select('project_id, status')
      .eq('id', prId)
      .single();
    if (exErr) throw new Error(exErr.message);
    const prev = existing as { project_id: string; status: string };

    const patch: Record<string, unknown> = { updated_by: profileId, ...(input.patch ?? {}) };
    if (input.newStatus) {
      patch.status = input.newStatus;
      patch.status_changed_at = new Date().toISOString();
    }
    if (input.newStatus === 'approved') {
      patch.approved_by = profileId;
      patch.approved_at = new Date().toISOString();

      try {
        const { data: existingRfq } = await supabase
          .from('rfqs')
          .select('id')
          .eq('purchase_requisition_id', prId)
          .is('deleted_at', null)
          .maybeSingle();

        if (!existingRfq) {
          const { data: prFull } = await supabase
            .from('purchase_requisitions')
            .select('title, required_date')
            .eq('id', prId)
            .single();

          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const rfqNumber = `RFQ-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
          await supabase.from('rfqs').insert({
            project_id: prev.project_id,
            purchase_requisition_id: prId,
            rfq_number: rfqNumber,
            title: prFull?.title || 'Auto-Draft RFQ',
            issue_date: new Date().toISOString().slice(0, 10),
            due_date: prFull?.required_date || new Date().toISOString().slice(0, 10),
            status: 'draft',
            created_by: profileId,
            updated_by: profileId,
          });
        }
      } catch {
        /* best-effort auto-draft RFQ */
      }
    }

    const { error: updErr } = await supabase.from('purchase_requisitions').update(patch).eq('id', prId);
    if (updErr) throw new Error(updErr.message);

    if (input.assignment) {
      try {
        await supabase.from('purchase_requisition_assignments').insert({
          purchase_requisition_id: prId,
          project_id: prev.project_id,
          assigned_to: input.assignment.assignedTo,
          assignment_role: input.assignment.role || 'approver',
          status: 'pending',
          created_by: profileId,
          updated_by: profileId,
        });
      } catch {
        /* assignments table optional */
      }
      await supabase.from('purchase_requisitions').update({ assigned_to: input.assignment.assignedTo }).eq('id', prId);
      if (input.notify) await notifyUser(input.assignment.assignedTo, 'PR assigned for approval', input.assignment.instruction || 'A purchase requisition needs your approval.');
    }

    await logPrActivity(prId, prev.project_id, input.action, {
      previousStatus: prev.status,
      newStatus: input.newStatus ?? prev.status,
      comment: input.comment ?? null,
    });

    return { data: { status: input.newStatus ?? prev.status }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Permanent delete — only permitted while the PR is still a draft. */
export async function deletePrDraft(prId: string): Promise<MutationResult> {
  try {
    if (!isLiveSupabase()) return { data: null, error: null };
    const { data: pr } = await supabase.from('purchase_requisitions').select('status').eq('id', prId).single();
    const status = (pr as { status?: string } | null)?.status ?? '';
    if (!['draft', 'returned_to_draft'].includes(status)) throw new Error('Only drafts can be deleted. Use Cancel PR instead.');
    await supabase.from('purchase_requisition_lines').delete().eq('purchase_requisition_id', prId);
    const { error } = await supabase.from('purchase_requisitions').delete().eq('id', prId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
