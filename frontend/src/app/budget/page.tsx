'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — PROJECT BUDGET & VARIANCE ENGINE
// File: frontend/src/app/budget/page.tsx
//
// Fixes applied here:
//   * The page previously destructured `selectedProjectId`, `setSelectedProjectId`,
//     `dashboard`, `mockDashboard`, `liveMode`, `refreshDashboard`, `userRole` and
//     `runAction` from the app store. NONE of those keys exist, so every executive
//     KPI rendered a permanent ₹0 and changing the project dropdown threw
//     "setSelectedProjectId is not a function". It now uses the real store keys
//     (`activeProjectId` / `setActiveProjectId` / `activeRole`).
//   * KPI cards read live figures from portfolio_budget_summary via
//     BudgetDataProvider instead of a store slice that was never populated.
//   * `canManage={true}` literals replaced with the real permission matrix.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import BudgetOverviewDashboard from '@/components/budget/budget-overview-dashboard';
import MasterSheetTab from '@/components/budget/master-sheet-tab';
import VarianceAnalysisTab from '@/components/budget/variance-analysis-tab';
import BillWiseLedgerTab from '@/components/budget/bill-wise-ledger-tab';
import BudgetMovementsTab from '@/components/budget/budget-movements-tab';
import BudgetCashFlowChart from '@/components/budget-cash-flow-chart';
import BudgetSettingsTab from '@/components/budget/budget-settings-tab';
import { BudgetDataProvider, useBudgetData } from '@/components/budget/budget-data-context';
import { ALL_PROJECTS } from '@/lib/supabase-budget';
import { applyBudgetLock, getBudgetPermissions } from '@/lib/budget-permissions';
import type { Role } from '@/lib/roles';
import { formatIndianCurrency } from '@/utils/format-currency';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileClock,
  FileSpreadsheet,
  Layers3,
  LockKeyhole,
  RefreshCcw,
  Settings,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

type BudgetTab =
  | 'dashboard'
  | 'master-sheet'
  | 'movements'
  | 'variance'
  | 'ledger'
  | 'cash-flow'
  | 'settings';

const TABS: { key: BudgetTab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'dashboard', label: 'Overview & Risk Alerts', icon: BarChart3 },
  { key: 'master-sheet', label: 'Master Budget', icon: FileSpreadsheet },
  // Every baseline change is an approvable document since Phase 7; this is the
  // register of them.
  { key: 'movements', label: 'Budget Changes', icon: WalletCards },
  { key: 'variance', label: 'Variance', icon: TrendingUp },
  { key: 'ledger', label: 'Bill-Wise Ledger', icon: ClipboardCheck },
  { key: 'cash-flow', label: 'Cash Flow S-Curve', icon: CircleDollarSign },
  { key: 'settings', label: 'Config', icon: Settings },
];

export default function BudgetPage() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);
  const activeRole = useAppStore((state) => state.activeRole);
  const storeProjects = useAppStore((state) => state.projects);

  // The Budget module adds a portfolio view that the global activeProjectId cannot
  // represent. Rather than mirroring activeProjectId into local state (which needs a
  // synchronising effect and can drift), the store stays the single source of truth
  // and only the portfolio toggle is local.
  const [portfolioView, setPortfolioView] = useState(false);

  const selectedProjectId = portfolioView ? ALL_PROJECTS : activeProjectId || ALL_PROJECTS;

  const activeProjectName = useMemo(() => {
    if (selectedProjectId === ALL_PROJECTS) return 'All Projects Portfolio';
    const found = (storeProjects ?? []).find((p) => p.id === selectedProjectId);
    return found?.name ?? 'Selected Project';
  }, [selectedProjectId, storeProjects]);

  function handleProjectChange(nextId: string) {
    if (nextId === ALL_PROJECTS) {
      setPortfolioView(true);
      return;
    }
    setPortfolioView(false);
    if (typeof setActiveProjectId === 'function') {
      setActiveProjectId(nextId);
    }
  }

  return (
    <BudgetDataProvider projectId={selectedProjectId} projectName={activeProjectName}>
      <BudgetPageBody
        role={activeRole}
        selectedProjectId={selectedProjectId}
        onProjectChange={handleProjectChange}
      />
    </BudgetDataProvider>
  );
}

function BudgetPageBody({
  role,
  selectedProjectId,
  onProjectChange,
}: {
  role: Role | null | undefined;
  selectedProjectId: string;
  onProjectChange: (id: string) => void;
}) {
  const {
    loading,
    refreshing,
    error,
    needsAuth,
    totals,
    projects,
    config,
    isPortfolio,
    refresh,
    isEditing,
  } = useBudgetData();

  const [activeTab, setActiveTab] = useState<BudgetTab>('dashboard');

  const permissions = useMemo(
    () => applyBudgetLock(getBudgetPermissions(role), config.budget_lock_enabled),
    [role, config.budget_lock_enabled],
  );

  const dataReady = !loading && !error && !needsAuth;

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Project Budget &amp; Variance Engine
          </h1>
          <p className="text-xs text-muted-foreground">
            Real-Time Cost Control • Excel Master Schedules • Bill-Wise Ledger • Variance
            Reconciliation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {config.budget_lock_enabled && (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
              title="Baseline and variance edits are blocked until the lock is lifted in Config."
            >
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> Budget Locked
            </span>
          )}

          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
            <span>Project:</span>
            <select
              value={selectedProjectId}
              onChange={(event) => onProjectChange(event.target.value)}
              className="bg-transparent font-bold text-primary outline-none"
              aria-label="Select project"
            >
              <option value={ALL_PROJECTS}>All Projects Portfolio</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || isEditing}
            title={
              isEditing
                ? 'Finish or discard your edits before re-syncing.'
                : 'Re-sync from Supabase'
            }
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted disabled:opacity-50"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {refreshing ? 'Syncing…' : 'Refresh Sync'}
          </button>
        </div>
      </header>

      {/* EXECUTIVE KPI SUMMARY CARDS — live from portfolio_budget_summary */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>
        <Metric
          label="Total Baseline Budget"
          value={dataReady ? formatIndianCurrency(totals.baseline) : '—'}
          icon={WalletCards}
          tone="neutral"
          loading={loading}
        />
        <Metric
          label="PO Reserved (Committed)"
          value={dataReady ? formatIndianCurrency(totals.committed) : '—'}
          icon={ShieldCheck}
          tone="warning"
          loading={loading}
        />
        <Metric
          label="Bill Deductions (Spent)"
          value={dataReady ? formatIndianCurrency(totals.spent) : '—'}
          icon={CircleDollarSign}
          tone="danger"
          loading={loading}
        />
        <Metric
          label="Available To Commit"
          value={dataReady ? formatIndianCurrency(totals.available) : '—'}
          icon={CheckCircle2}
          tone={totals.available < 0 ? 'danger' : 'success'}
          loading={loading}
        />
        <Metric
          label="Budget Utilization"
          value={dataReady ? `${totals.utilization.toFixed(1)}%` : '—'}
          icon={TrendingUp}
          tone={totals.utilization > 90 ? 'danger' : totals.utilization > 75 ? 'warning' : 'success'}
          loading={loading}
        />
        <Metric
          label="Open Alerts"
          value={dataReady ? String(totals.openAlerts) : '—'}
          icon={totals.openAlerts > 0 ? AlertTriangle : FileClock}
          tone={totals.openAlerts > 0 ? 'warning' : 'neutral'}
          loading={loading}
        />
      </section>

      {/* SEGMENTED TAB NAVIGATION BAR */}
      <div className="rounded-xl border border-border bg-card p-1.5 shadow-2xs">
        <nav
          className="flex items-center gap-1 overflow-x-auto scrollbar-none"
          aria-label="Budget sections"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative inline-flex h-9 items-center gap-2 shrink-0 rounded-lg px-3.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ACTIVE TAB CONTENT VIEW */}
      <main className="space-y-6 pt-1">
        {activeTab === 'dashboard' && <BudgetOverviewDashboard permissions={permissions} />}

        {activeTab === 'master-sheet' && <MasterSheetTab permissions={permissions} />}

        {activeTab === 'movements' && <BudgetMovementsTab permissions={permissions} />}

        {activeTab === 'variance' && <VarianceAnalysisTab permissions={permissions} />}

        {activeTab === 'ledger' && <BillWiseLedgerTab permissions={permissions} />}

        {activeTab === 'cash-flow' && (
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <SectionTitle icon={CircleDollarSign} title="Monthly Cash Outflow & S-Curve" />
            <div className="mt-4">
              <BudgetCashFlowChart permissions={permissions} />
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <BudgetSettingsTab permissions={permissions} isPortfolio={isPortfolio} />
        )}
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  loading = false,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  loading?: boolean;
}) {
  const iconTone =
    tone === 'success'
      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20'
      : tone === 'warning'
        ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/20'
        : tone === 'danger'
          ? 'text-red-600 bg-red-50 dark:bg-red-950/20'
          : 'text-primary bg-orange-50 dark:bg-orange-950/20';

  return (
    <article className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 shadow-2xs transition-all hover:border-primary/40 sm:p-3">
      <Icon className={`h-8 w-8 flex-shrink-0 rounded-lg p-1.5 ${iconTone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <div className="mt-1 h-3.5 w-20 animate-pulse rounded bg-muted" aria-hidden="true" />
        ) : (
          <p className="mt-0.5 truncate text-xs font-extrabold text-foreground sm:text-sm">{value}</p>
        )}
      </div>
    </article>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Layers3; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      <h2 className="font-heading text-base font-semibold">{title}</h2>
    </div>
  );
}
