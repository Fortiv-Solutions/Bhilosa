// ============================================================================
// PRAMUKH GROUP ERP V2 — SUPABASE BUDGET SERVICE LAYER
// File: frontend/src/lib/supabase-budget.ts
//
// Single data-access layer for the Budget module. Every read hits Supabase and
// every write goes through a transactional RPC.
//
// Design rules enforced here:
//   * Uses the SHARED supabase client from utils/supabase-client so the module
//     participates in the app's auth session (RLS requires an authenticated JWT)
//     instead of opening a second client with its own realtime socket.
//   * NO silent mock fallback. A failed query throws a BudgetDataError so the UI
//     can render an error state instead of presenting stale seed data as fact.
//   * All list reads paginate, so >1000 rows are never silently truncated by the
//     PostgREST row cap.
//   * BUA (built-up area) always comes from projects.bua_sqft — never hardcoded.
// ============================================================================

import { supabase, getDbSiteId, isSupabaseConfigured } from '@/utils/supabase-client';
import type { MasterBudgetCategory, MasterBudgetItem, ScopeTag } from './budget';

// ----------------------------------------------------------------------------
// Constants & errors
// ----------------------------------------------------------------------------

/** Sentinel for the "All Projects Portfolio" selection. */
export const ALL_PROJECTS = 'all' as const;

/** PostgREST caps a single response; we page in blocks of this size. */
const PAGE_SIZE = 1000;

export class BudgetDataError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'BudgetDataError';
    this.cause = cause;
  }
}

export function isAllProjects(projectId?: string | null): boolean {
  return !projectId || projectId === ALL_PROJECTS || projectId === 'ALL';
}

/** Resolve a UI project id (uuid or legacy slug) to the database uuid. */
export function resolveProjectId(projectId?: string | null): string | null {
  if (isAllProjects(projectId)) return null;
  return getDbSiteId(projectId as string);
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new BudgetDataError(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
}

function fail(what: string, error: unknown): never {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  throw new BudgetDataError(`${what}: ${message}`, error);
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read every row of a query, paging past the PostgREST cap.
 * `build` receives the byte range for each page.
 */
async function readAllPages<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) fail(label, error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    // Hard stop so a pathological dataset cannot spin forever.
    if (page > 200) break;
  }
  return out;
}

/** True when a Supabase auth session exists (required by RLS for any budget read). */
export async function hasBudgetSession(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}

async function currentUserLabel(): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    const authUser = data.user;
    if (!authUser) return 'Pramukh ERP User';
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', authUser.id)
      .maybeSingle();
    return profile?.name || profile?.email || authUser.email || 'Pramukh ERP User';
  } catch {
    return 'Pramukh ERP User';
  }
}

// ----------------------------------------------------------------------------
// Display helpers
// ----------------------------------------------------------------------------

export function shortenProjectName(name: string): string {
  if (!name) return 'All Projects';
  return name
    .replace(/Pramukh /gi, '')
    .replace(/ Residential Project/gi, '')
    .replace(/ Project/gi, '')
    .replace(/ Commercial Tower/gi, ' Commercial')
    .trim();
}

// ----------------------------------------------------------------------------
// Row types
// ----------------------------------------------------------------------------

export interface BudgetProject {
  id: string;
  code: string | null;
  name: string;
  buaSqft: number;
  budgetAmount: number;
  actualSpendAmount: number;
  status: string | null;
}

export interface BudgetConfigRow {
  project_id: string;
  caution_threshold_percent: number;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  hard_limit_percent: number;
  hard_limit_enforcement: 'block' | 'warn_only';
  require_justification_over_budget: boolean;
  current_fy: string;
  budget_lock_enabled: boolean;
  default_retention_percent: number;
  default_gst_percent: number;
}

export interface PortfolioBudgetSummary {
  project_id: string;
  project_code: string | null;
  project_name: string;
  baseline_amount: number;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  retention_held: number;
  advance_amount: number;
  remaining_amount: number;
  utilization_percent: number;
  overrun_amount: number;
  line_item_count: number;
  category_count: number;
  bua_sqft: number;
  open_alert_count: number;
}

export interface BudgetRevisionRow {
  id: string;
  project_id: string;
  version_number: number;
  version_label: string;
  justification_reason: string;
  old_total_cost: number;
  new_total_cost: number;
  net_diff_amount: number;
  edited_by_name: string;
  status: string;
  scope: string;
  created_at: string;
  items?: BudgetRevisionItemRow[];
}

export interface BudgetRevisionItemRow {
  id: string;
  revision_id: string;
  master_budget_item_id: string | null;
  sub_activity: string;
  category_name: string;
  old_qty: number;
  new_qty: number;
  old_rate: number;
  new_rate: number;
  old_cost: number;
  new_cost: number;
}

export interface BudgetAlertRow {
  id: string;
  project_id: string;
  budget_allocation_id: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical' | 'overrun';
  threshold_percent: number | null;
  actual_percent: number | null;
  message: string;
  status: string;
  created_at: string;
  allocation_name?: string | null;
}

export interface BudgetAllocationRow {
  id: string;
  project_id: string;
  category_id: string | null;
  allocation_name: string;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  retention_held: number;
  advance_amount: number;
  warning_threshold_percent: number;
  hard_limit_percent: number;
  status: string;
}

/**
 * One row of budget_bill_ledger_mv — the UNIFIED bill ledger.
 *
 * Since Phase 4 this covers BOTH bill spines: material bills (vendor_bills) and
 * contractor RA bills (service_bills), certified only. `bill_source`
 * discriminates them and is required to open the right detail record.
 */
export type BillSource = 'material' | 'service';

export interface BillLedgerRow {
  /** Composite: `${bill_source}:${bill_id}:${line_id ?? bill_id}`. */
  id: string;
  bill_source: BillSource;
  bill_id: string;
  line_id: string | null;
  project_id: string;
  project_name: string;
  project_code: string | null;

  head_activity: string;
  sub_activity_ledger: string;
  cost_code: string;
  category_id: string | null;
  master_budget_item_id: string | null;
  budget_allocation_id: string | null;
  allocation_name: string | null;

  supplier_name: string;
  vendor_id: string | null;
  supplier_gst: string | null;
  accounting_date: string | null;
  bill_date: string | null;
  bill_no: string | null;
  bill_no_of_supplier: string | null;
  /** RA sequence — service bills only. */
  ra_sequence: number | null;
  remarks: string | null;

  item_group: string;
  item_desc: string;
  unit: string;
  billed_qty: number;
  final_bill_rate: number;
  bill_item_amt: number;
  gst_rate: number;

  /** Budget consumption is the GROSS figure (Phase 1 restatement). */
  gross_bill_amount: number;
  retention_percent: number;
  retention_deduction: number;
  retention_released: number;
  retention_outstanding: number;
  advance_payment: number;
  other_deductions: number;
  final_bill_amount: number;

  expected_payment: number;
  jv_payment: number;
  bill_status: string;
  payment_status: string;
  match_status: string | null;

  /** PO for a material bill, WO for a service bill. */
  source_doc_no: string;
  source_doc_type: 'PO' | 'WO';
  source_doc_rate: number;
  pr_no: string;
  grn_no: string;

  running_available_budget: number;
  category_allocated_amount: number;
}

/** Cursor for keyset pagination. Opaque to callers — pass it straight back. */
export interface BillLedgerCursor {
  billDate: string | null;
  id: string;
}

export interface BillLedgerPage {
  rows: BillLedgerRow[];
  hasMore: boolean;
  nextCursor: BillLedgerCursor | null;
}

/** Totals across the WHOLE filtered set, never just the loaded page. */
export interface BillLedgerSummary {
  lineCount: number;
  billCount: number;
  materialBillCount: number;
  serviceBillCount: number;
  gross: number;
  retention: number;
  retentionOutstanding: number;
  netPayable: number;
  paid: number;
  outstanding: number;
}

export interface BillLedgerFreshness {
  lastRefreshedAt: string;
  lastRefreshMs: number;
  rowCount: number;
}

export interface MonthlyCashflowRow {
  project_id: string;
  month_start: string;
  actual_amount: number | null;
  committed_amount: number | null;
  actual_txn_count: number;
}

// ----------------------------------------------------------------------------
// 1. Projects & configuration
// ----------------------------------------------------------------------------

export async function fetchBudgetProjects(): Promise<BudgetProject[]> {
  assertConfigured();
  const { data, error } = await supabase
    .from('projects')
    .select('id, code, name, bua_sqft, budget_amount, actual_spend_amount, status')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) fail('Unable to load projects', error);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    code: (row.code as string) ?? null,
    name: (row.name as string) ?? 'Untitled project',
    buaSqft: num(row.bua_sqft),
    budgetAmount: num(row.budget_amount),
    actualSpendAmount: num(row.actual_spend_amount),
    status: (row.status as string) ?? null,
  }));
}

/**
 * Total built-up area for the selection. For "All Projects" this is the sum
 * across projects, so every ₹/sqft figure stays arithmetically valid.
 */
export async function fetchBuaSqft(projectId?: string | null): Promise<number> {
  const projects = await fetchBudgetProjects();
  const dbId = resolveProjectId(projectId);
  if (!dbId) return projects.reduce((sum, p) => sum + p.buaSqft, 0);
  return projects.find((p) => p.id === dbId)?.buaSqft ?? 0;
}

export async function fetchBudgetConfig(projectId: string): Promise<BudgetConfigRow | null> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);
  if (!dbId) return null;

  const { data, error } = await supabase
    .from('budget_config')
    .select('*')
    .eq('project_id', dbId)
    .maybeSingle();

  if (error) fail('Unable to load budget configuration', error);
  return (data as BudgetConfigRow) ?? null;
}

export async function saveBudgetConfig(
  projectId: string,
  patch: Partial<Omit<BudgetConfigRow, 'project_id'>>,
): Promise<BudgetConfigRow> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);
  if (!dbId) {
    throw new BudgetDataError('Select a specific project before saving budget configuration.');
  }

  const { data, error } = await supabase
    .from('budget_config')
    .upsert({ project_id: dbId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    .select()
    .single();

  if (error) fail('Unable to save budget configuration', error);
  return data as BudgetConfigRow;
}

// ----------------------------------------------------------------------------
// 2. Executive summary
// ----------------------------------------------------------------------------

export async function fetchPortfolioSummary(projectId?: string | null): Promise<PortfolioBudgetSummary[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  let query = supabase.from('portfolio_budget_summary').select('*').order('project_name', { ascending: true });
  if (dbId) query = query.eq('project_id', dbId);

  const { data, error } = await query;
  if (error) fail('Unable to load budget summary', error);

  return (data ?? []).map((row) => ({
    project_id: row.project_id as string,
    project_code: (row.project_code as string) ?? null,
    project_name: (row.project_name as string) ?? '',
    baseline_amount: num(row.baseline_amount),
    allocated_amount: num(row.allocated_amount),
    committed_amount: num(row.committed_amount),
    spent_amount: num(row.spent_amount),
    retention_held: num(row.retention_held),
    advance_amount: num(row.advance_amount),
    remaining_amount: num(row.remaining_amount),
    utilization_percent: num(row.utilization_percent),
    overrun_amount: num(row.overrun_amount),
    line_item_count: num(row.line_item_count),
    category_count: num(row.category_count),
    bua_sqft: num(row.bua_sqft),
    open_alert_count: num(row.open_alert_count),
  }));
}

// ----------------------------------------------------------------------------
// 3. Master budget (categories + line items + variance actuals)
// ----------------------------------------------------------------------------

interface MasterItemRow {
  id: string;
  project_id: string;
  category_id: string | null;
  category_name: string | null;
  sr_no: string;
  item_description: string;
  qty_rcc: number | null;
  qty_finishes: number | null;
  qty_infra: number | null;
  qty_total: number | null;
  unit: string | null;
  estimated_rate: number | null;
  budgeted_cost: number | null;
  cost_per_bua: number | null;
  scope_tag: string | null;
  item_type: string | null;
  sort_order: number | null;
  version_number: number | null;
  is_unbudgeted?: boolean | null;
}

interface VarianceRow {
  id: string;
  master_budget_item_id: string | null;
  po_qty: number | null;
  po_rate: number | null;
  po_amount: number | null;
  actual_bill_qty: number | null;
  actual_bill_rate: number | null;
  actual_total_cost: number | null;
  work_status: string | null;
  remark: string | null;
}

/**
 * Full master budget for a project (or the whole portfolio), enriched with the
 * committed (PO) and actual (billed) figures from budget_variance_items.
 *
 * Throws BudgetDataError rather than falling back to seed data.
 */
export async function fetchMasterBudgetCategories(
  projectId?: string | null,
): Promise<MasterBudgetCategory[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  const [categories, items, variances, buaSqft] = await Promise.all([
    readAllPages<{ id: string; project_id: string; category_name: string; category_code: string | null; sort_order: number | null }>(
      'Unable to load budget categories',
      (from, to) => {
        let q = supabase
          .from('budget_categories')
          .select('id, project_id, category_name, category_code, sort_order')
          .order('sort_order', { ascending: true })
          .order('category_name', { ascending: true })
          .range(from, to);
        if (dbId) q = q.eq('project_id', dbId);
        return q;
      },
    ),
    readAllPages<MasterItemRow>('Unable to load master budget items', (from, to) => {
      let q = supabase
        .from('master_budget_items')
        .select(
          'id, project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type, sort_order, version_number, is_unbudgeted',
        )
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('sr_no', { ascending: true })
        .range(from, to);
      if (dbId) q = q.eq('project_id', dbId);
      return q;
    }),
    readAllPages<VarianceRow>('Unable to load variance actuals', (from, to) => {
      let q = supabase
        .from('budget_variance_items')
        .select(
          'id, master_budget_item_id, po_qty, po_rate, po_amount, actual_bill_qty, actual_bill_rate, actual_total_cost, work_status, remark',
        )
        .range(from, to);
      if (dbId) q = q.eq('project_id', dbId);
      return q;
    }),
    fetchBuaSqft(projectId),
  ]);

  if (categories.length === 0) {
    // An empty budget is a legitimate state for a brand-new project.
    return [];
  }

  const varianceByItem = new Map<string, VarianceRow>();
  for (const v of variances) {
    if (v.master_budget_item_id) varianceByItem.set(v.master_budget_item_id, v);
  }

  // Group items by category id in one pass (the old implementation ran a full
  // filter() per category, which is O(categories x items)).
  const itemsByCategory = new Map<string, MasterItemRow[]>();
  const itemsByCategoryName = new Map<string, MasterItemRow[]>();
  for (const item of items) {
    if (item.category_id) {
      const list = itemsByCategory.get(item.category_id);
      if (list) list.push(item);
      else itemsByCategory.set(item.category_id, [item]);
    } else if (item.category_name) {
      const key = item.category_name.trim().toLowerCase();
      const list = itemsByCategoryName.get(key);
      if (list) list.push(item);
      else itemsByCategoryName.set(key, [item]);
    }
  }

  return categories.map((catRow) => {
    const matched = [
      ...(itemsByCategory.get(catRow.id) ?? []),
      ...(itemsByCategoryName.get(catRow.category_name.trim().toLowerCase()) ?? []),
    ];

    const mappedItems: MasterBudgetItem[] = matched.map((itemRow) => {
      const varRow = itemRow.id ? varianceByItem.get(itemRow.id) : undefined;
      return {
        id: itemRow.id,
        srNo: itemRow.sr_no,
        category: catRow.category_name,
        item: itemRow.item_description,
        qtyRcc: nullableNum(itemRow.qty_rcc),
        qtyFinishes: nullableNum(itemRow.qty_finishes),
        qtyInfra: nullableNum(itemRow.qty_infra),
        qtyTotal: num(itemRow.qty_total, 1),
        unit: itemRow.unit || 'LS',
        rate: num(itemRow.estimated_rate),
        cost: num(itemRow.budgeted_cost),
        costPerBua: num(itemRow.cost_per_bua),
        scopeTag: (itemRow.scope_tag as ScopeTag) || 'site_infra',
        itemType: (itemRow.item_type as MasterBudgetItem['itemType']) || 'material',
        varianceItemId: varRow?.id,
        isUnbudgeted: Boolean(itemRow.is_unbudgeted),
        poQty: num(varRow?.po_qty),
        poRate: num(varRow?.po_rate),
        poAmount: num(varRow?.po_amount),
        committedAmount: num(varRow?.po_amount),
        actualBillQty: num(varRow?.actual_bill_qty),
        actualBillRate: num(varRow?.actual_bill_rate),
        actualTotalCost: num(varRow?.actual_total_cost),
        spentAmount: num(varRow?.actual_total_cost),
        workStatus: varRow?.work_status ?? 'Not Started',
        remark: varRow?.remark ?? undefined,
      };
    });

    const totalCost = mappedItems.reduce((sum, item) => sum + item.cost, 0);
    const totalCommitted = mappedItems.reduce((sum, item) => sum + num(item.poAmount), 0);
    const totalSpent = mappedItems.reduce((sum, item) => sum + num(item.actualTotalCost), 0);

    return {
      id: catRow.id,
      categoryName: catRow.category_name,
      categoryCode: catRow.category_code || 'CAT',
      items: mappedItems,
      totalCost,
      totalCommitted,
      totalSpent,
      // Derived from the project's real BUA, never a hardcoded divisor.
      totalCostPerBua: buaSqft > 0 ? Number((totalCost / buaSqft).toFixed(2)) : 0,
    };
  });
}

// ----------------------------------------------------------------------------
// 4. Revision history (audit trail)
// ----------------------------------------------------------------------------

export async function fetchRevisionHistory(
  projectId?: string | null,
  scope?: 'master_budget' | 'variance_reconciliation' | 'excel_import',
): Promise<BudgetRevisionRow[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  let query = supabase
    .from('budget_revisions')
    .select(
      'id, project_id, version_number, version_label, justification_reason, old_total_cost, new_total_cost, net_diff_amount, edited_by_name, status, scope, created_at, budget_revision_items(id, revision_id, master_budget_item_id, sub_activity, category_name, old_qty, new_qty, old_rate, new_rate, old_cost, new_cost)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (dbId) query = query.eq('project_id', dbId);
  if (scope) query = query.eq('scope', scope);

  const { data, error } = await query;
  if (error) fail('Unable to load revision history', error);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    version_number: num(row.version_number),
    version_label: (row.version_label as string) ?? '',
    justification_reason: (row.justification_reason as string) ?? '',
    old_total_cost: num(row.old_total_cost),
    new_total_cost: num(row.new_total_cost),
    net_diff_amount: num(row.net_diff_amount),
    edited_by_name: (row.edited_by_name as string) ?? 'Pramukh ERP User',
    status: (row.status as string) ?? 'approved',
    scope: (row.scope as string) ?? 'master_budget',
    created_at: row.created_at as string,
    items: ((row as Record<string, unknown>).budget_revision_items as BudgetRevisionItemRow[]) ?? [],
  }));
}

// ----------------------------------------------------------------------------
// 5. Allocations & alerts
// ----------------------------------------------------------------------------

export async function fetchBudgetAllocations(projectId?: string | null): Promise<BudgetAllocationRow[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  const rows = await readAllPages<Record<string, unknown>>('Unable to load budget allocations', (from, to) => {
    let q = supabase
      .from('budget_allocations')
      .select(
        'id, project_id, category_id, allocation_name, allocated_amount, committed_amount, spent_amount, retention_held, advance_amount, warning_threshold_percent, hard_limit_percent, status',
      )
      .is('deleted_at', null)
      .order('allocation_name', { ascending: true })
      .range(from, to);
    if (dbId) q = q.eq('project_id', dbId);
    return q;
  });

  return rows.map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    category_id: (row.category_id as string) ?? null,
    allocation_name: (row.allocation_name as string) ?? '',
    allocated_amount: num(row.allocated_amount),
    committed_amount: num(row.committed_amount),
    spent_amount: num(row.spent_amount),
    retention_held: num(row.retention_held),
    advance_amount: num(row.advance_amount),
    warning_threshold_percent: num(row.warning_threshold_percent, 75),
    hard_limit_percent: num(row.hard_limit_percent, 100),
    status: (row.status as string) ?? 'approved',
  }));
}

export async function fetchBudgetAlerts(projectId?: string | null): Promise<BudgetAlertRow[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  let query = supabase
    .from('budget_alerts')
    .select(
      'id, project_id, budget_allocation_id, alert_type, severity, threshold_percent, actual_percent, message, status, created_at, budget_allocations(allocation_name)',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (dbId) query = query.eq('project_id', dbId);

  const { data, error } = await query;
  if (error) fail('Unable to load budget alerts', error);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    project_id: row.project_id as string,
    budget_allocation_id: (row.budget_allocation_id as string) ?? null,
    alert_type: (row.alert_type as string) ?? '',
    severity: ((row.severity as string) ?? 'warning') as BudgetAlertRow['severity'],
    threshold_percent: nullableNum(row.threshold_percent),
    actual_percent: nullableNum(row.actual_percent),
    message: (row.message as string) ?? '',
    status: (row.status as string) ?? 'pending',
    created_at: row.created_at as string,
    allocation_name:
      (row as { budget_allocations?: { allocation_name?: string } }).budget_allocations?.allocation_name ?? null,
  }));
}

export async function acknowledgeBudgetAlert(
  alertId: string,
  status: 'closed' | 'approved' | 'rejected' = 'closed',
): Promise<void> {
  assertConfigured();
  const { error } = await supabase
    .from('budget_alerts')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', alertId);
  if (error) fail('Unable to update alert', error);
}

// ----------------------------------------------------------------------------
// 6. Project-wise bill-wise ledger
// ----------------------------------------------------------------------------

export interface BillLedgerFilters {
  /** Free-text; matched server-side against a GIN-indexed tsvector. */
  search?: string;
  /** 'material' | 'service' | 'All' */
  billSource?: string;
  paymentStatus?: string;
  billStatus?: string;
  categoryId?: string;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
}

/** Strip empty/'All' entries so the RPC's jsonb filter stays minimal. */
function ledgerFilterPayload(filters: BillLedgerFilters): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value?: string) => {
    const v = value?.trim();
    if (v && v !== 'All') out[key] = v;
  };
  put('search', filters.search);
  put('billSource', filters.billSource);
  put('paymentStatus', filters.paymentStatus);
  put('billStatus', filters.billStatus);
  put('categoryId', filters.categoryId);
  put('vendorId', filters.vendorId);
  put('fromDate', filters.fromDate);
  put('toDate', filters.toDate);
  return out;
}

function mapLedgerRow(row: Record<string, unknown>): BillLedgerRow {
  return {
    id: String(row.id),
    bill_source: ((row.bill_source as string) ?? 'material') as BillSource,
    bill_id: row.bill_id as string,
    line_id: (row.line_id as string) ?? null,
    project_id: row.project_id as string,
    project_name: (row.project_name as string) ?? '',
    project_code: (row.project_code as string) ?? null,

    head_activity: (row.head_activity as string) ?? 'Unallocated',
    sub_activity_ledger: (row.sub_activity_ledger as string) ?? '',
    cost_code: (row.cost_code as string) ?? 'UNMAPPED',
    category_id: (row.category_id as string) ?? null,
    master_budget_item_id: (row.master_budget_item_id as string) ?? null,
    budget_allocation_id: (row.budget_allocation_id as string) ?? null,
    allocation_name: (row.allocation_name as string) ?? null,

    supplier_name: (row.supplier_name as string) ?? 'Unknown vendor',
    vendor_id: (row.vendor_id as string) ?? null,
    supplier_gst: (row.supplier_gst as string) ?? null,
    accounting_date: (row.accounting_date as string) ?? null,
    bill_date: (row.bill_date as string) ?? null,
    bill_no: (row.bill_no as string) ?? null,
    bill_no_of_supplier: (row.bill_no_of_supplier as string) ?? null,
    ra_sequence: nullableNum(row.ra_sequence),
    remarks: (row.remarks as string) ?? null,

    item_group: (row.item_group as string) ?? 'General',
    item_desc: (row.item_desc as string) ?? '',
    unit: (row.unit as string) ?? 'LS',
    billed_qty: num(row.billed_qty),
    final_bill_rate: num(row.final_bill_rate),
    bill_item_amt: num(row.bill_item_amt),
    gst_rate: num(row.gst_rate),

    gross_bill_amount: num(row.gross_bill_amount),
    retention_percent: num(row.retention_percent),
    retention_deduction: num(row.retention_deduction),
    retention_released: num(row.retention_released),
    retention_outstanding: num(row.retention_outstanding),
    advance_payment: num(row.advance_payment),
    other_deductions: num(row.other_deductions),
    final_bill_amount: num(row.final_bill_amount),

    expected_payment: num(row.expected_payment),
    jv_payment: num(row.jv_payment),
    bill_status: (row.bill_status as string) ?? 'approved',
    payment_status: (row.payment_status as string) ?? 'pending',
    match_status: (row.match_status as string) ?? null,

    source_doc_no: (row.source_doc_no as string) ?? '',
    source_doc_type: ((row.source_doc_type as string) ?? 'PO') as 'PO' | 'WO',
    source_doc_rate: num(row.source_doc_rate),
    pr_no: (row.pr_no as string) ?? '',
    grn_no: (row.grn_no as string) ?? '',

    running_available_budget: num(row.running_available_budget),
    category_allocated_amount: num(row.category_allocated_amount),
  };
}

/**
 * One page of the unified bill ledger.
 *
 * Server-side filtered, sorted and keyset-paginated by rpc_bill_ledger. The
 * previous implementation read EVERY row through budget_bill_ledger_view and
 * sliced client-side — which could not scale, and stopped being tenable at all
 * once the view became a UNION of both bill spines.
 *
 * Keyset rather than offset: the ledger only grows, and OFFSET degrades linearly
 * as it does. Pass `cursor` from the previous page's `nextCursor`.
 */
export async function fetchBillLedgerPage(
  projectId?: string | null,
  filters: BillLedgerFilters = {},
  limit = 100,
  cursor: BillLedgerCursor | null = null,
): Promise<BillLedgerPage> {
  assertConfigured();

  const { data, error } = await supabase.rpc('rpc_bill_ledger', {
    p_project_id: resolveProjectId(projectId),
    p_filters: ledgerFilterPayload(filters),
    p_limit: limit,
    p_cursor: cursor,
  });

  if (error) fail('Unable to load bill ledger', error);

  const payload = (data ?? {}) as {
    rows?: Record<string, unknown>[];
    hasMore?: boolean;
    nextCursor?: BillLedgerCursor | null;
  };

  return {
    rows: (payload.rows ?? []).map(mapLedgerRow),
    hasMore: Boolean(payload.hasMore),
    nextCursor: payload.nextCursor ?? null,
  };
}

/**
 * Totals across the WHOLE filtered set.
 *
 * Must be a separate server-side call: with pagination the KPI cards would
 * otherwise show page totals while looking like ledger totals. Money columns are
 * header figures repeated across a bill's lines, so the RPC dedupes to one row
 * per bill before summing.
 */
export async function fetchBillLedgerSummary(
  projectId?: string | null,
  filters: BillLedgerFilters = {},
): Promise<BillLedgerSummary> {
  assertConfigured();

  const { data, error } = await supabase.rpc('rpc_bill_ledger_summary', {
    p_project_id: resolveProjectId(projectId),
    p_filters: ledgerFilterPayload(filters),
  });

  if (error) fail('Unable to load bill ledger totals', error);

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    lineCount: num(raw.lineCount),
    billCount: num(raw.billCount),
    materialBillCount: num(raw.materialBillCount),
    serviceBillCount: num(raw.serviceBillCount),
    gross: num(raw.gross),
    retention: num(raw.retention),
    retentionOutstanding: num(raw.retentionOutstanding),
    netPayable: num(raw.netPayable),
    paid: num(raw.paid),
    outstanding: num(raw.outstanding),
  };
}

/**
 * The full filtered set for CSV export. Server-side, because exporting only the
 * loaded page would silently produce a partial file. `truncated` is surfaced so
 * the caller can say so rather than hand over a quietly incomplete export.
 */
export async function fetchBillLedgerExport(
  projectId?: string | null,
  filters: BillLedgerFilters = {},
): Promise<{ rows: BillLedgerRow[]; truncated: boolean; limit: number }> {
  assertConfigured();

  const { data, error } = await supabase.rpc('rpc_bill_ledger_export', {
    p_project_id: resolveProjectId(projectId),
    p_filters: ledgerFilterPayload(filters),
  });

  if (error) fail('Unable to export bill ledger', error);

  const payload = (data ?? {}) as {
    rows?: Record<string, unknown>[];
    truncated?: boolean;
    limit?: number;
  };

  return {
    rows: (payload.rows ?? []).map(mapLedgerRow),
    truncated: Boolean(payload.truncated),
    limit: num(payload.limit, 20000),
  };
}

/**
 * Refresh the materialized ledger.
 *
 * The ledger is eventually consistent by design (REFRESH ... CONCURRENTLY, so
 * readers never block). Pass maxAgeSeconds to make this a no-op when the view is
 * already fresh, which is what makes it safe to call on every tab load.
 */
export async function refreshBillLedger(maxAgeSeconds = 0): Promise<BillLedgerFreshness | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.rpc('rpc_refresh_bill_ledger', {
    p_max_age_seconds: maxAgeSeconds,
  });

  // A refresh failure is not fatal — the tab can still render the last snapshot.
  if (error) return null;

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    lastRefreshedAt: (raw.last_refreshed_at as string) ?? new Date().toISOString(),
    lastRefreshMs: num(raw.last_refresh_ms),
    rowCount: num(raw.row_count),
  };
}

/** Everything the Bill Details drawer renders, in one round trip. */
export interface BillDetail {
  billSource: BillSource;
  header: Record<string, unknown>;
  lines: Record<string, unknown>[];
  /** The budget_ledger rows this bill actually posted, reversals included. */
  ledger: {
    id: string;
    transaction_type: string;
    amount: number;
    gross_amount: number;
    retention_amount: number;
    description: string | null;
    posted_at: string;
    document_date: string | null;
    revision_seq: number;
    is_reversal: boolean;
    allocation_name: string | null;
  }[];
  payments: Record<string, unknown>[];
  retentionReleases: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
}

export async function fetchBillDetail(
  billSource: BillSource,
  billId: string,
): Promise<BillDetail | null> {
  assertConfigured();

  const { data, error } = await supabase.rpc('rpc_bill_detail', {
    p_bill_source: billSource,
    p_bill_id: billId,
  });

  if (error) fail('Unable to load bill details', error);
  if (!data) return null;

  const payload = data as Record<string, unknown>;
  return {
    billSource: (payload.billSource as BillSource) ?? billSource,
    header: (payload.header as Record<string, unknown>) ?? {},
    lines: (payload.lines as Record<string, unknown>[]) ?? [],
    ledger: ((payload.ledger as Record<string, unknown>[]) ?? []).map((row) => ({
      id: row.id as string,
      transaction_type: (row.transaction_type as string) ?? '',
      amount: num(row.amount),
      gross_amount: num(row.gross_amount),
      retention_amount: num(row.retention_amount),
      description: (row.description as string) ?? null,
      posted_at: row.posted_at as string,
      document_date: (row.document_date as string) ?? null,
      revision_seq: num(row.revision_seq),
      is_reversal: Boolean(row.is_reversal),
      allocation_name: (row.allocation_name as string) ?? null,
    })),
    payments: (payload.payments as Record<string, unknown>[]) ?? [],
    retentionReleases: (payload.retentionReleases as Record<string, unknown>[]) ?? [],
    attachments: (payload.attachments as Record<string, unknown>[]) ?? [],
  };
}

/**
 * Settlement fields on a bill.
 *
 * NOTE: this writes to the BILL, not to the ledger. The Bill-Wise Ledger tab is
 * a report and is read-only since Phase 4 — it used to write these fields
 * directly, which is what produced ledger drift (the posting trigger fired only
 * on status changes, so budget_ledger kept the stale figure forever). Amending a
 * certified bill now reverses and re-posts in the database.
 */
export interface BillLedgerPatch {
  retention_percent?: number;
  retention_amount?: number;
  advance_adjusted?: number;
  other_deductions?: number;
  ledger_remarks?: string;
}

export async function updateBillSettlement(
  billSource: BillSource,
  billId: string,
  patch: BillLedgerPatch,
): Promise<void> {
  assertConfigured();

  const payload: Record<string, unknown> = {};
  if (patch.retention_percent !== undefined) payload.retention_percent = patch.retention_percent;
  if (patch.retention_amount !== undefined) payload.retention_amount = patch.retention_amount;
  if (patch.advance_adjusted !== undefined) payload.advance_adjusted = patch.advance_adjusted;
  if (patch.other_deductions !== undefined) payload.other_deductions = patch.other_deductions;
  if (patch.ledger_remarks !== undefined) payload.ledger_remarks = patch.ledger_remarks;
  if (Object.keys(payload).length === 0) return;

  const table = billSource === 'service' ? 'service_bills' : 'vendor_bills';
  const { error } = await supabase.from(table).update(payload).eq('id', billId);
  if (error) fail('Unable to save settlement details', error);
}

/** Link bill directly to master_budget_item_id and budget_allocation_id in Supabase */
export async function linkBillToBudgetHead(
  billSource: BillSource,
  billId: string,
  masterBudgetItemId: string,
  categoryId?: string,
): Promise<void> {
  assertConfigured();
  const table = billSource === 'service' ? 'service_bills' : 'vendor_bills';

  let budgetAllocationId: string | null = null;
  if (categoryId) {
    const { data } = await supabase
      .from('budget_allocations')
      .select('id')
      .eq('category_id', categoryId)
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      budgetAllocationId = data.id as string;
    }
  }

  const payload: Record<string, unknown> = {
    master_budget_item_id: masterBudgetItemId,
  };
  if (budgetAllocationId) {
    payload.budget_allocation_id = budgetAllocationId;
  }

  const { error } = await supabase.from(table).update(payload).eq('id', billId);
  if (error) fail('Unable to link bill to budget head', error);
}

// ----------------------------------------------------------------------------
// 6b. Budget change documents (Phase 7 — A + C combined)
//
// Every budget change is a TYPED MOVEMENT under a STAGED APPROVAL LIFECYCLE.
// Nothing touches master_budget_items until a document is approved, which is the
// behaviour the previous RPCs lacked entirely: they hardcoded status='approved'
// and rewrote the live baseline in the same transaction.
// ----------------------------------------------------------------------------

export type BudgetMovementType =
  | 'original'
  | 'supplement'
  | 'return'
  | 'transfer'
  | 'revision'
  | 'restatement';

export type BudgetChangeStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
export type BudgetApprovalTier = 'pm' | 'management' | 'board';

/** Human-facing copy for each movement type, so the UI explains itself. */
export const MOVEMENT_LABELS: Record<BudgetMovementType, { label: string; hint: string }> = {
  original: { label: 'Original Budget', hint: 'The sanction event. One per project, immutable once approved.' },
  supplement: { label: 'Supplement', hint: 'New money from outside. Must state its funding source.' },
  return: { label: 'Return', hint: 'Money released back. Cannot strand committed or spent amounts.' },
  transfer: { label: 'Transfer', hint: 'Moves money between heads. Enforced net-zero.' },
  revision: { label: 'Revision', hint: 'Re-estimate within the approved envelope. No new money.' },
  restatement: { label: 'Restatement', hint: 'System correction to posted actuals. Never changes the baseline.' },
};

export interface BudgetMovementRow {
  id: string;
  project_id: string;
  project_name: string;
  document_number: string | null;
  movement_type: BudgetMovementType;
  status: BudgetChangeStatus;
  approval_tier: BudgetApprovalTier;
  version_number: number;
  version_label: string;
  justification_reason: string;
  funding_source: string | null;
  old_total_cost: number;
  new_total_cost: number;
  net_diff_amount: number;
  effective_date: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  applied_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  raised_by_name: string | null;
  submitted_by_name: string | null;
  approved_by_name: string | null;
  rejected_by_name: string | null;
  source_head: string | null;
  target_head: string | null;
  line_count: number;
}

export interface BudgetChangeLine {
  /** Existing Master Budget line, or omitted to add a new one. */
  id?: string;
  item_description?: string;
  category_name?: string;
  category_id?: string;
  /** Creates the category on approval, so a reviewer sees new taxonomy first. */
  proposed_category_name?: string;
  sr_no?: string;
  unit?: string;
  estimated_rate?: number;
  qty_total?: number;
  budgeted_cost?: number;
  change_kind?: 'add' | 'amend' | 'retire';
}

export interface ProposeBudgetChangeInput {
  projectId: string;
  movementType: Exclude<BudgetMovementType, 'restatement'>;
  justification: string;
  lines: BudgetChangeLine[];
  effectiveDate?: string;
  fundingSource?: string;
  sourceCategoryId?: string;
  targetCategoryId?: string;
  /** Submit straight for approval. False leaves it as an editable draft. */
  submit?: boolean;
}

export async function listBudgetMovements(
  projectId?: string | null,
  status?: BudgetChangeStatus | 'All',
): Promise<BudgetMovementRow[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  let query = supabase
    .from('budget_movement_register')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (dbId) query = query.eq('project_id', dbId);
  if (status && status !== 'All') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) fail('Unable to load budget movements', error);

  return (data ?? []).map((row) => ({
    ...(row as unknown as BudgetMovementRow),
    old_total_cost: num(row.old_total_cost),
    new_total_cost: num(row.new_total_cost),
    net_diff_amount: num(row.net_diff_amount),
    version_number: num(row.version_number),
    line_count: num(row.line_count),
  }));
}

/** The staged diff for one document — what a reviewer actually approves. */
export async function fetchBudgetChangeLines(revisionId: string): Promise<BudgetRevisionItemRow[]> {
  assertConfigured();
  const { data, error } = await supabase
    .from('budget_revision_items')
    .select('*')
    .eq('revision_id', revisionId)
    .order('category_name', { ascending: true });

  if (error) fail('Unable to load the proposed changes', error);
  return (data ?? []) as BudgetRevisionItemRow[];
}

export async function proposeBudgetChange(input: ProposeBudgetChangeInput): Promise<BudgetMovementRow> {
  assertConfigured();
  const dbId = resolveProjectId(input.projectId);
  if (!dbId) throw new BudgetDataError('Select a specific project before raising a budget change.');
  if (!input.justification.trim()) {
    throw new BudgetDataError('A justification is mandatory on every budget change.');
  }
  if (input.lines.length === 0) {
    throw new BudgetDataError('A budget change needs at least one line.');
  }

  const { data, error } = await supabase.rpc('rpc_propose_budget_change', {
    p_project_id: dbId,
    p_movement_type: input.movementType,
    p_justification: input.justification.trim(),
    p_items: input.lines,
    p_effective_date: input.effectiveDate ?? null,
    p_funding_source: input.fundingSource ?? null,
    p_source_category_id: input.sourceCategoryId ?? null,
    p_target_category_id: input.targetCategoryId ?? null,
    p_submit: input.submit ?? true,
  });

  if (error) fail('Unable to raise the budget change', error);
  return data as BudgetMovementRow;
}

export async function submitBudgetChange(revisionId: string): Promise<BudgetMovementRow> {
  assertConfigured();
  const { data, error } = await supabase.rpc('rpc_submit_budget_change', { p_revision_id: revisionId });
  if (error) fail('Unable to submit the budget change', error);
  return data as BudgetMovementRow;
}

/**
 * Approve and apply. The database re-checks staleness first: if another document
 * moved the same lines after this one was raised, it refuses and names the
 * conflicts rather than silently overwriting them.
 */
export async function approveBudgetChange(
  revisionId: string,
  remarks?: string,
): Promise<BudgetMovementRow> {
  assertConfigured();
  const { data, error } = await supabase.rpc('rpc_approve_budget_change', {
    p_revision_id: revisionId,
    p_remarks: remarks ?? null,
  });
  if (error) fail('Unable to approve the budget change', error);
  return data as BudgetMovementRow;
}

export async function rejectBudgetChange(revisionId: string, reason: string): Promise<BudgetMovementRow> {
  assertConfigured();
  if (!reason.trim()) throw new BudgetDataError('A reason is mandatory when rejecting a budget change.');
  const { data, error } = await supabase.rpc('rpc_reject_budget_change', {
    p_revision_id: revisionId,
    p_reason: reason.trim(),
  });
  if (error) fail('Unable to reject the budget change', error);
  return data as BudgetMovementRow;
}

export async function cancelBudgetChange(revisionId: string): Promise<BudgetMovementRow> {
  assertConfigured();
  const { data, error } = await supabase.rpc('rpc_cancel_budget_change', { p_revision_id: revisionId });
  if (error) fail('Unable to withdraw the budget change', error);
  return data as BudgetMovementRow;
}

// ----------------------------------------------------------------------------
// 6c. Category hierarchy (Phase 8)
// ----------------------------------------------------------------------------

export interface BudgetCategoryNode {
  id: string;
  project_id: string;
  parent_id: string | null;
  category_name: string;
  category_code: string | null;
  depth: number;
  /** "Finishes › Flooring › Vitrified" — the full path, maintained by trigger. */
  path_label: string;
  is_leaf: boolean;
  created_via: string;
  /** This node alone. */
  own_baseline_amount: number;
  /** This node plus everything beneath it. */
  baseline_amount: number;
  original_amount: number;
  line_item_count: number;
  budget_allocation_id: string | null;
  allocated_amount: number;
  committed_amount: number;
  spent_amount: number;
  children?: BudgetCategoryNode[];
}

/** Flat rows from budget_category_tree, rollups already computed server-side. */
export async function fetchBudgetCategoryTree(projectId?: string | null): Promise<BudgetCategoryNode[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  let query = supabase
    .from('budget_category_tree')
    .select('*')
    .order('depth', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('category_name', { ascending: true });

  if (dbId) query = query.eq('project_id', dbId);

  const { data, error } = await query;
  if (error) fail('Unable to load the budget category tree', error);

  return (data ?? []).map((row) => ({
    ...(row as unknown as BudgetCategoryNode),
    depth: num(row.depth),
    own_baseline_amount: num(row.own_baseline_amount),
    baseline_amount: num(row.baseline_amount),
    original_amount: num(row.original_amount),
    line_item_count: num(row.line_item_count),
    allocated_amount: num(row.allocated_amount),
    committed_amount: num(row.committed_amount),
    spent_amount: num(row.spent_amount),
  }));
}

/** Nest the flat rows. Roots first, each node's children attached in order. */
export function buildCategoryTree(nodes: BudgetCategoryNode[]): BudgetCategoryNode[] {
  const byId = new Map<string, BudgetCategoryNode>();
  for (const node of nodes) byId.set(node.id, { ...node, children: [] });

  const roots: BudgetCategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function upsertBudgetCategory(input: {
  projectId: string;
  categoryName: string;
  parentId?: string | null;
  categoryCode?: string;
  createdVia?: 'manual' | 'excel_import' | 'inline_change_document';
}): Promise<BudgetCategoryNode> {
  assertConfigured();
  const dbId = resolveProjectId(input.projectId);
  if (!dbId) throw new BudgetDataError('Select a specific project before adding a category.');

  const { data, error } = await supabase.rpc('rpc_upsert_budget_category', {
    p_project_id: dbId,
    p_category_name: input.categoryName,
    p_parent_id: input.parentId ?? null,
    p_category_code: input.categoryCode ?? null,
    p_created_via: input.createdVia ?? 'manual',
  });

  if (error) fail('Unable to save the category', error);
  return data as BudgetCategoryNode;
}

/**
 * Categories elsewhere in the tree whose name normalises to the same key.
 * Inline creation is how a taxonomy rots; this is the guardrail against it.
 */
export async function findSimilarCategories(
  projectId: string,
  categoryName: string,
  parentId?: string | null,
): Promise<{ id: string; category_name: string; path_label: string }[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);
  if (!dbId || !categoryName.trim()) return [];

  const { data, error } = await supabase.rpc('rpc_similar_budget_categories', {
    p_project_id: dbId,
    p_category_name: categoryName,
    p_parent_id: parentId ?? null,
  });

  if (error) return [];
  return (data ?? []) as { id: string; category_name: string; path_label: string }[];
}

// ----------------------------------------------------------------------------
// 7. Cash flow
// ----------------------------------------------------------------------------

export async function fetchMonthlyCashflow(projectId?: string | null): Promise<MonthlyCashflowRow[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  let query = supabase
    .from('budget_monthly_cashflow_view')
    .select('*')
    .order('month_start', { ascending: true });
  if (dbId) query = query.eq('project_id', dbId);

  const { data, error } = await query;
  if (error) fail('Unable to load cash-flow data', error);

  return (data ?? []).map((row) => ({
    project_id: row.project_id as string,
    month_start: row.month_start as string,
    actual_amount: nullableNum(row.actual_amount),
    committed_amount: nullableNum(row.committed_amount),
    actual_txn_count: num(row.actual_txn_count),
  }));
}

// ----------------------------------------------------------------------------
// 8. Transactional writes (RPC)
// ----------------------------------------------------------------------------

export interface MasterBudgetItemPatch {
  id: string;
  qty_rcc: number | null;
  qty_finishes: number | null;
  qty_infra: number | null;
  qty_total: number;
  estimated_rate: number;
}

/**
 * Save a Master Budget change order. One transaction: bumps the version, writes
 * budget_revisions + budget_revision_items, updates the line items, and lets the
 * database triggers cascade to allocations and the variance sheet.
 */
export async function saveMasterBudgetRevision(
  projectId: string,
  justification: string,
  items: MasterBudgetItemPatch[],
): Promise<BudgetRevisionRow> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);
  if (!dbId) {
    throw new BudgetDataError('Select a specific project before saving a budget revision.');
  }
  if (!justification.trim()) {
    throw new BudgetDataError('A change-order justification is required.');
  }
  if (items.length === 0) {
    throw new BudgetDataError('No budget changes to save.');
  }

  const { data, error } = await supabase.rpc('rpc_save_master_budget_revision', {
    p_project_id: dbId,
    p_justification: justification.trim(),
    p_edited_by_name: await currentUserLabel(),
    p_items: items,
  });

  if (error) fail('Unable to save budget revision', error);
  return data as BudgetRevisionRow;
}

export interface VarianceItemPatch {
  id: string;
  actual_bill_qty: number;
  actual_bill_rate: number;
  remark: string;
  /** Optional: bill tracking fields for booking audit + duplicate prevention */
  bill_id?: string;
  bill_source?: 'material' | 'service';
  bill_number?: string;
  booked_qty?: number;
  booked_amount?: number;
}

/** A single variance-bill booking record. */
export interface BillVarianceBooking {
  id: string;
  bill_source: string;
  bill_number: string | null;
  variance_item_id: string;
  category_name: string | null;
  sub_activity: string | null;
  booked_qty: number;
  booked_rate: number;
  booked_amount: number;
  booked_by_name: string | null;
  booked_at: string;
  remark: string | null;
}

/** Fetch all variance bookings for a specific bill (checks if already booked). */
export async function getBillVarianceBookings(billId: string): Promise<BillVarianceBooking[]> {
  assertConfigured();
  const { data, error } = await supabase.rpc('rpc_get_bill_variance_bookings', {
    p_bill_id: billId,
  });
  if (error) fail('Unable to fetch bill variance bookings', error);
  return (data ?? []) as BillVarianceBooking[];
}

/** Save variance reconciliation actuals + audit trail in one transaction. */
export async function saveVarianceReconciliation(
  projectId: string,
  justification: string,
  items: VarianceItemPatch[],
): Promise<BudgetRevisionRow> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);
  if (!dbId) {
    throw new BudgetDataError('Select a specific project before saving variance edits.');
  }
  if (items.length === 0) {
    throw new BudgetDataError('No variance changes to save.');
  }

  const { data, error } = await supabase.rpc('rpc_save_variance_reconciliation', {
    p_project_id: dbId,
    p_justification: justification.trim(),
    p_edited_by_name: await currentUserLabel(),
    p_items: items,
  });

  if (error) fail('Unable to save variance reconciliation', error);
  return data as BudgetRevisionRow;
}

export interface MasterBudgetImportItem {
  category_name: string;
  category_code?: string | null;
  sr_no: string;
  item_description: string;
  qty_rcc: number | null;
  qty_finishes: number | null;
  qty_infra: number | null;
  qty_total: number;
  unit: string;
  estimated_rate: number;
  budgeted_cost: number;
  scope_tag?: string;
  item_type?: string;
}

export interface MasterBudgetImportResult {
  revision_id: string;
  version_number: number;
  inserted: number;
  updated: number;
  archived: number;
  old_total: number;
  new_total: number;
  /** Phase 7: BCR-… reference for the change document this import raised. */
  document_number?: string;
  /** 'original' on the first import for a project, otherwise 'revision'. */
  movement_type?: BudgetMovementType;
  status?: BudgetChangeStatus;
  /**
   * True when the Master Budget is UNCHANGED pending approval. Since Phase 7 an
   * import raises a change document rather than rewriting the live baseline, so
   * the caller must not report it as applied.
   */
  requires_approval?: boolean;
}

/**
 * Import an Excel schedule.
 *
 * Since Phase 7 this RAISES A CHANGE DOCUMENT: the first import on an empty
 * project is the Original sanction, later imports are a Revision diffed against
 * the current baseline, and `p_archive_missing` becomes an explicit retire of the
 * absent lines rather than a silent is_active = false. Nothing reaches
 * master_budget_items until the document is approved.
 */
export async function importMasterBudget(
  projectId: string,
  justification: string,
  items: MasterBudgetImportItem[],
  archiveMissing: boolean,
): Promise<MasterBudgetImportResult> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);
  if (!dbId) {
    throw new BudgetDataError('Select a specific project before importing a budget schedule.');
  }
  if (items.length === 0) {
    throw new BudgetDataError('The uploaded sheet produced no budget line items.');
  }

  const { data, error } = await supabase.rpc('rpc_import_master_budget', {
    p_project_id: dbId,
    p_justification: justification,
    p_edited_by_name: await currentUserLabel(),
    p_items: items,
    p_archive_missing: archiveMissing,
  });

  if (error) fail('Unable to import budget schedule', error);
  return data as MasterBudgetImportResult;
}

// ----------------------------------------------------------------------------
// 9. Realtime
// ----------------------------------------------------------------------------

const REALTIME_TABLES = [
  'budget_categories',
  'master_budget_items',
  'budget_variance_items',
  'budget_allocations',
  'budget_ledger',
  'budget_alerts',
  'budget_revisions',
  'vendor_bills',
] as const;

/**
 * One channel for the whole Budget module, debounced.
 *
 * The previous implementation opened a separate 4-table subscription per tab and
 * each change triggered an immediate full refetch in every tab.
 */
export function subscribeToBudgetChanges(
  projectId: string | null | undefined,
  onChange: () => void,
  debounceMs = 400,
  /**
   * Namespaces the realtime topic. Supabase keys channels by topic on a single
   * client, so two independent subscribers (the Budget module and the PR form's
   * activity budget card) must not share one name or they clash.
   */
  channelKey = 'module',
): () => void {
  if (!isSupabaseConfigured) return () => {};

  const dbId = resolveProjectId(projectId);
  const filter = dbId ? `project_id=eq.${dbId}` : undefined;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  let channel = supabase.channel(`budget-${channelKey}-${dbId ?? 'all'}`);
  for (const table of REALTIME_TABLES) {
    channel = channel.on(
      'postgres_changes',
      filter
        ? { event: '*', schema: 'public', table, filter }
        : { event: '*', schema: 'public', table },
      schedule,
    );
  }
  channel.subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}

// ----------------------------------------------------------------------------
// 10. CSV export
// ----------------------------------------------------------------------------

/** RFC-4180 CSV. Cells starting with = + - @ are prefixed to block CSV injection. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === 'undefined') return;
  // BOM so Excel opens UTF-8 (and ₹) correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface CreateSubCategoryParams {
  projectId: string;
  categoryId: string;
  itemDescription: string;
  unit?: string;
  estimatedRate?: number;
  scopeTag?: string;
  source?: string;
}

export async function createDynamicSubCategory(params: CreateSubCategoryParams): Promise<{ id: string; item_description: string; category_id: string; [key: string]: any }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not active. Dynamic sub-category creation requires live Supabase connection.');
  }

  const dbSiteId = getDbSiteId(params.projectId);

  const { data, error } = await supabase.rpc('rpc_create_master_budget_item', {
    p_project_id: dbSiteId,
    p_category_id: params.categoryId,
    p_item_description: params.itemDescription.trim(),
    p_unit: params.unit || 'NOS',
    p_estimated_rate: params.estimatedRate ?? 0,
    p_scope_tag: params.scopeTag || 'General',
    p_source: params.source || 'bill_booking',
  });

  if (error) {
    throw new Error(error.message || 'Failed to create sub-category item.');
  }

  return data;
}

