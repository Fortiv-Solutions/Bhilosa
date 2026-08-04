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

/** One row of budget_bill_ledger_view — the project-wise bill-wise ledger. */
export interface BillLedgerRow {
  id: string;
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

  supplier_name: string;
  vendor_id: string | null;
  supplier_gst: string | null;
  accounting_date: string | null;
  bill_date_of_supplier: string | null;
  bill_no: string | null;
  bill_no_of_supplier: string | null;
  remarks: string | null;

  item_group: string;
  item_desc: string;
  unit: string;
  received_qty: number;
  final_bill_rate: number;
  bill_item_amt: number;
  gst_rate: number;
  retention_percent: number;
  retention_deduction: number;
  gross_bill_amount: number;
  final_bill_amount: number;

  advance_payment: number;
  expected_payment: number;
  jv_payment: number;
  bill_status: string;
  payment_status: string;
  match_status: string | null;

  po_wo_no: string;
  po_wo_rate: number;
  note_on_po: string;
  pr_no: string;
  grn_no: string;

  running_available_budget: number;
  category_allocated_amount: number;
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
          'id, project_id, category_id, category_name, sr_no, item_description, qty_rcc, qty_finishes, qty_infra, qty_total, unit, estimated_rate, budgeted_cost, cost_per_bua, scope_tag, item_type, sort_order, version_number',
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
  /** Free-text across supplier, bill numbers, cost code, activity and PO/PR. */
  search?: string;
  paymentStatus?: string;
  billStatus?: string;
  categoryId?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Reads budget_bill_ledger_view — one row per vendor bill line, already joined
 * to vendor, PO, PR, GRN, budget category and allocation.
 *
 * Always scoped by project when a specific project is selected.
 */
export async function fetchBillLedger(
  projectId?: string | null,
  filters: BillLedgerFilters = {},
): Promise<BillLedgerRow[]> {
  assertConfigured();
  const dbId = resolveProjectId(projectId);

  const rows = await readAllPages<Record<string, unknown>>('Unable to load bill-wise ledger', (from, to) => {
    let q = supabase
      .from('budget_bill_ledger_view')
      .select('*')
      .order('bill_date_of_supplier', { ascending: false, nullsFirst: false })
      .order('bill_no', { ascending: false })
      .range(from, to);

    if (dbId) q = q.eq('project_id', dbId);
    if (filters.paymentStatus && filters.paymentStatus !== 'All') q = q.eq('payment_status', filters.paymentStatus);
    if (filters.billStatus && filters.billStatus !== 'All') q = q.eq('bill_status', filters.billStatus);
    if (filters.categoryId && filters.categoryId !== 'All') q = q.eq('category_id', filters.categoryId);
    if (filters.fromDate) q = q.gte('bill_date_of_supplier', filters.fromDate);
    if (filters.toDate) q = q.lte('bill_date_of_supplier', filters.toDate);

    if (filters.search && filters.search.trim()) {
      // Escape PostgREST's or() delimiters before interpolating user input.
      const term = filters.search.trim().replace(/[(),*]/g, ' ');
      q = q.or(
        [
          `supplier_name.ilike.%${term}%`,
          `bill_no.ilike.%${term}%`,
          `bill_no_of_supplier.ilike.%${term}%`,
          `cost_code.ilike.%${term}%`,
          `head_activity.ilike.%${term}%`,
          `sub_activity_ledger.ilike.%${term}%`,
          `po_wo_no.ilike.%${term}%`,
          `pr_no.ilike.%${term}%`,
          `item_desc.ilike.%${term}%`,
        ].join(','),
      );
    }

    return q;
  });

  return rows.map((row) => ({
    id: String(row.id),
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

    supplier_name: (row.supplier_name as string) ?? 'Unknown vendor',
    vendor_id: (row.vendor_id as string) ?? null,
    supplier_gst: (row.supplier_gst as string) ?? null,
    accounting_date: (row.accounting_date as string) ?? null,
    bill_date_of_supplier: (row.bill_date_of_supplier as string) ?? null,
    bill_no: (row.bill_no as string) ?? null,
    bill_no_of_supplier: (row.bill_no_of_supplier as string) ?? null,
    remarks: (row.remarks as string) ?? null,

    item_group: (row.item_group as string) ?? 'General',
    item_desc: (row.item_desc as string) ?? '',
    unit: (row.unit as string) ?? 'LS',
    received_qty: num(row.received_qty),
    final_bill_rate: num(row.final_bill_rate),
    bill_item_amt: num(row.bill_item_amt),
    gst_rate: num(row.gst_rate),
    retention_percent: num(row.retention_percent),
    retention_deduction: num(row.retention_deduction),
    gross_bill_amount: num(row.gross_bill_amount),
    final_bill_amount: num(row.final_bill_amount),

    advance_payment: num(row.advance_payment),
    expected_payment: num(row.expected_payment),
    jv_payment: num(row.jv_payment),
    bill_status: (row.bill_status as string) ?? 'draft',
    payment_status: (row.payment_status as string) ?? 'pending',
    match_status: (row.match_status as string) ?? null,

    po_wo_no: (row.po_wo_no as string) ?? '',
    po_wo_rate: num(row.po_wo_rate),
    note_on_po: (row.note_on_po as string) ?? '',
    pr_no: (row.pr_no as string) ?? '',
    grn_no: (row.grn_no as string) ?? '',

    running_available_budget: num(row.running_available_budget),
    category_allocated_amount: num(row.category_allocated_amount),
  }));
}

/** Editable ledger fields. Everything else on the view is derived. */
export interface BillLedgerPatch {
  retention_percent?: number;
  retention_amount?: number;
  advance_adjusted?: number;
  other_deductions?: number;
  ledger_remarks?: string;
  payment_status?: string;
}

/**
 * Persist a ledger edit back to the underlying vendor_bills row.
 * net_payable_amount is recomputed by a database trigger, so it is never sent.
 */
export async function updateBillLedgerEntry(billId: string, patch: BillLedgerPatch): Promise<void> {
  assertConfigured();

  const payload: Record<string, unknown> = {};
  if (patch.retention_percent !== undefined) payload.retention_percent = patch.retention_percent;
  if (patch.retention_amount !== undefined) payload.retention_amount = patch.retention_amount;
  if (patch.advance_adjusted !== undefined) payload.advance_adjusted = patch.advance_adjusted;
  if (patch.other_deductions !== undefined) payload.other_deductions = patch.other_deductions;
  if (patch.ledger_remarks !== undefined) payload.ledger_remarks = patch.ledger_remarks;
  if (patch.payment_status !== undefined) payload.payment_status = patch.payment_status;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from('vendor_bills').update(payload).eq('id', billId);
  if (error) fail('Unable to save ledger entry', error);
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
}

/** Upsert an Excel schedule into Supabase in one transaction. */
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
