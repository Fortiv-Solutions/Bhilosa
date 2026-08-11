'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET MODULE DATA PROVIDER
// File: frontend/src/components/budget/budget-data-context.tsx
//
// Owns every Budget read, once, for the whole module.
//
// Replaces the previous arrangement where the Overview, Master Sheet, Variance and
// Ledger tabs each opened their own 4-table realtime subscription and each change
// triggered an immediate, undebounced, full refetch in every mounted tab. That
// also silently clobbered in-progress Edit Mode state.
//
//   * one debounced realtime channel for the module (see subscribeToBudgetChanges)
//   * refreshes are DEFERRED while a tab is in Edit Mode, then applied on exit
//   * exposes real loading / error / unauthenticated states instead of rendering
//     zeros as though they were facts
// ============================================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ALL_PROJECTS,
  BudgetDataError,
  fetchBudgetAlerts,
  fetchBudgetAllocations,
  fetchBudgetConfig,
  fetchBudgetProjects,
  fetchBuaSqft,
  fetchMasterBudgetCategories,
  fetchMonthlyCashflow,
  fetchPortfolioSummary,
  fetchRevisionHistory,
  listBudgetMovements,
  hasBudgetSession,
  isAllProjects,
  subscribeToBudgetChanges,
  type BudgetAlertRow,
  type BudgetAllocationRow,
  type BudgetConfigRow,
  type BudgetMovementRow,
  type BudgetProject,
  type BudgetRevisionRow,
  type MonthlyCashflowRow,
  type PortfolioBudgetSummary,
} from '@/lib/supabase-budget';
import { DEFAULT_BUDGET_CONFIG, type BudgetConfig, type MasterBudgetCategory } from '@/lib/budget';
import {
  generateVarianceCategoriesFromMaster,
  summariseVariance,
  type VarianceCategory,
} from '@/lib/variance-data';

export interface BudgetTotals {
  /** Master Budget baseline (sum of active line items). */
  baseline: number;
  /** Allocated ceiling; equals baseline once allocations are provisioned. */
  allocated: number;
  /** Reserved by approved purchase orders. */
  committed: number;
  /** Verified vendor bills. */
  spent: number;
  /** allocated - committed - spent. */
  available: number;
  /** (committed + spent) / allocated * 100 */
  utilization: number;
  /** Signed: positive = under budget, negative = overrun. */
  variance: number;
  variancePercent: number;
  overrun: number;
  retentionHeld: number;
  advanceOutstanding: number;
  costPerSqft: number;
  actualCostPerSqft: number;
  lineItemCount: number;
  categoryCount: number;
  openAlerts: number;
}

const EMPTY_TOTALS: BudgetTotals = {
  baseline: 0,
  allocated: 0,
  committed: 0,
  spent: 0,
  available: 0,
  utilization: 0,
  variance: 0,
  variancePercent: 0,
  overrun: 0,
  retentionHeld: 0,
  advanceOutstanding: 0,
  costPerSqft: 0,
  actualCostPerSqft: 0,
  lineItemCount: 0,
  categoryCount: 0,
  openAlerts: 0,
};

export interface BudgetDataContextValue {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** True when there is no Supabase auth session (RLS blocks all budget reads). */
  needsAuth: boolean;

  projectId: string;
  projectName: string;
  isPortfolio: boolean;
  buaSqft: number;
  projects: BudgetProject[];

  summary: PortfolioBudgetSummary[];
  totals: BudgetTotals;
  categories: MasterBudgetCategory[];
  variance: VarianceCategory[];
  varianceSummary: ReturnType<typeof summariseVariance>;
  alerts: BudgetAlertRow[];
  allocations: BudgetAllocationRow[];
  revisions: BudgetRevisionRow[];
  movements: BudgetMovementRow[];
  cashflow: MonthlyCashflowRow[];
  config: BudgetConfig;
  configRow: BudgetConfigRow | null;

  /** Increments whenever live data changes; use as a useEffect dependency. */
  realtimeTick: number;

  refresh: () => Promise<void>;
  /** Suspend realtime-driven refreshes while a tab holds unsaved edits. */
  setEditing: (editing: boolean) => void;
  isEditing: boolean;
}

const BudgetDataContext = createContext<BudgetDataContextValue | null>(null);

export function useBudgetData(): BudgetDataContextValue {
  const ctx = useContext(BudgetDataContext);
  if (!ctx) {
    throw new Error('useBudgetData must be used inside <BudgetDataProvider>.');
  }
  return ctx;
}

interface ProviderProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}

export function BudgetDataProvider({ projectId, projectName, children }: ProviderProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const [projects, setProjects] = useState<BudgetProject[]>([]);
  const [summary, setSummary] = useState<PortfolioBudgetSummary[]>([]);
  const [categories, setCategories] = useState<MasterBudgetCategory[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlertRow[]>([]);
  const [allocations, setAllocations] = useState<BudgetAllocationRow[]>([]);
  const [revisions, setRevisions] = useState<BudgetRevisionRow[]>([]);
  const [movements, setMovements] = useState<BudgetMovementRow[]>([]);
  const [cashflow, setCashflow] = useState<MonthlyCashflowRow[]>([]);
  const [configRow, setConfigRow] = useState<BudgetConfigRow | null>(null);
  const [buaSqft, setBuaSqft] = useState(0);
  const [realtimeTick, setRealtimeTick] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const editingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  // Guards against a slow in-flight load overwriting a newer one.
  const loadSeqRef = useRef(0);

  const isPortfolio = isAllProjects(projectId);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const seq = ++loadSeqRef.current;
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      try {
        const signedIn = await hasBudgetSession();
        if (seq !== loadSeqRef.current) return;

        if (!signedIn) {
          setNeedsAuth(true);
          setError(null);
          setCategories([]);
          setSummary([]);
          setAlerts([]);
          setAllocations([]);
          setRevisions([]);
          setMovements([]);
          setCashflow([]);
          return;
        }
        setNeedsAuth(false);

        const [
          projectsData,
          summaryData,
          categoriesData,
          alertsData,
          allocationsData,
          revisionsData,
          movementsData,
          cashflowData,
          bua,
          configData,
        ] = await Promise.all([
          fetchBudgetProjects(),
          fetchPortfolioSummary(projectId),
          fetchMasterBudgetCategories(projectId),
          fetchBudgetAlerts(projectId),
          fetchBudgetAllocations(projectId),
          fetchRevisionHistory(projectId),
          listBudgetMovements(projectId),
          fetchMonthlyCashflow(projectId),
          fetchBuaSqft(projectId),
          isPortfolio ? Promise.resolve(null) : fetchBudgetConfig(projectId),
        ]);

        if (seq !== loadSeqRef.current) return;

        setProjects(projectsData);
        setSummary(summaryData);
        setCategories(categoriesData);
        setAlerts(alertsData);
        setAllocations(allocationsData);
        setRevisions(revisionsData);
        setMovements(movementsData);
        setCashflow(cashflowData);
        setBuaSqft(bua);
        setConfigRow(configData);
        setError(null);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        const message =
          err instanceof BudgetDataError || err instanceof Error
            ? err.message
            : 'Unexpected error loading budget data.';
        setError(message);
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [projectId, isPortfolio],
  );

  const refresh = useCallback(async () => {
    await load('refresh');
  }, [load]);

  // Initial load + reload when the selected project changes.
  useEffect(() => {
    void load('initial');
  }, [load]);

  // Single debounced realtime channel for the module.
  useEffect(() => {
    const unsubscribe = subscribeToBudgetChanges(projectId, () => {
      setRealtimeTick((tick) => tick + 1);
      if (editingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      void load('refresh');
    });
    return unsubscribe;
  }, [projectId, load]);

  const setEditing = useCallback(
    (editing: boolean) => {
      editingRef.current = editing;
      setIsEditing(editing);
      if (!editing && pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        void load('refresh');
      }
    },
    [load],
  );

  const variance = useMemo(() => generateVarianceCategoriesFromMaster(categories), [categories]);
  const varianceSummary = useMemo(() => summariseVariance(variance), [variance]);

  const config: BudgetConfig = useMemo(
    () =>
      configRow
        ? {
            caution_threshold_percent: configRow.caution_threshold_percent,
            warning_threshold_percent: configRow.warning_threshold_percent,
            critical_threshold_percent: configRow.critical_threshold_percent,
            hard_limit_percent: configRow.hard_limit_percent,
            hard_limit_enforcement: configRow.hard_limit_enforcement,
            require_justification_over_budget: configRow.require_justification_over_budget,
            current_fy: configRow.current_fy,
            budget_lock_enabled: configRow.budget_lock_enabled,
            default_retention_percent: configRow.default_retention_percent,
            default_gst_percent: configRow.default_gst_percent,
          }
        : DEFAULT_BUDGET_CONFIG,
    [configRow],
  );

  const totals: BudgetTotals = useMemo(() => {
    // Direct sum from loaded categories (master_budget_items) for 100% baseline accuracy
    const categoryBaseline = categories.reduce((sum, cat) => sum + cat.totalCost, 0);
    const categoryLineCount = categories.reduce((sum, cat) => sum + cat.items.length, 0);
    const categoryCountVal = categories.length;

    const sumSummary = (pick: (row: PortfolioBudgetSummary) => number) =>
      summary.reduce((acc, row) => acc + pick(row), 0);

    const summaryBaseline = sumSummary((r) => r.baseline_amount);
    const baseline = categoryBaseline > 0 ? categoryBaseline : summaryBaseline;
    const allocated = sumSummary((r) => r.allocated_amount) || baseline;
    const committed = sumSummary((r) => r.committed_amount);
    const spent = sumSummary((r) => r.spent_amount);
    const available = allocated - committed - spent;
    // Signed, matching lib/variance-data: positive = under budget.
    const varianceAmount = baseline - spent;
    const lineItemCount = categoryLineCount > 0 ? categoryLineCount : sumSummary((r) => r.line_item_count);
    const categoryCount = categoryCountVal > 0 ? categoryCountVal : sumSummary((r) => r.category_count);

    return {
      baseline,
      allocated,
      committed,
      spent,
      available,
      utilization: allocated > 0 ? ((committed + spent) / allocated) * 100 : 0,
      variance: varianceAmount,
      variancePercent: baseline > 0 ? (varianceAmount / baseline) * 100 : 0,
      overrun: sumSummary((r) => r.overrun_amount),
      retentionHeld: sumSummary((r) => r.retention_held),
      advanceOutstanding: sumSummary((r) => r.advance_amount),
      costPerSqft: buaSqft > 0 ? baseline / buaSqft : 0,
      actualCostPerSqft: buaSqft > 0 ? spent / buaSqft : 0,
      lineItemCount,
      categoryCount,
      openAlerts: sumSummary((r) => r.open_alert_count),
    };
  }, [summary, categories, buaSqft]);

  const resolvedProjectName = useMemo(() => {
    if (isPortfolio) return 'All Projects Portfolio';
    return projects.find((p) => p.id === projectId)?.name || projectName;
  }, [isPortfolio, projects, projectId, projectName]);

  const value: BudgetDataContextValue = useMemo(
    () => ({
      loading,
      refreshing,
      error,
      needsAuth,
      projectId: projectId || ALL_PROJECTS,
      projectName: resolvedProjectName,
      isPortfolio,
      buaSqft,
      projects,
      summary,
      totals,
      categories,
      variance,
      varianceSummary,
      alerts,
      allocations,
      revisions,
      movements,
      cashflow,
      config,
      configRow,
      realtimeTick,
      refresh,
      setEditing,
      isEditing,
    }),
    [
      loading, refreshing, error, needsAuth, projectId, resolvedProjectName, isPortfolio,
      buaSqft, projects, summary, totals, categories, variance, varianceSummary, alerts,
      allocations, revisions, movements, cashflow, config, configRow, realtimeTick, refresh,
      setEditing, isEditing,
    ],
  );

  return <BudgetDataContext.Provider value={value}>{children}</BudgetDataContext.Provider>;
}
