'use client';

import React, { useMemo, useState } from 'react';
import { useAppStore } from '@/store/use-app-store';
import BudgetOverviewDashboard from '@/components/budget/budget-overview-dashboard';
import MasterSheetTab from '@/components/budget/master-sheet-tab';
import VarianceAnalysisTab from '@/components/budget/variance-analysis-tab';
import BillWiseLedgerTab from '@/components/budget/bill-wise-ledger-tab';
import BudgetCashFlowChart from '@/components/budget-cash-flow-chart';
import BudgetSettingsTab from '@/components/budget/budget-settings-tab';
import { ORBIT3_VARIANCE_CATEGORIES } from '@/lib/orbit3-variance-data';
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
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  WalletCards,
  TrendingUp,
} from 'lucide-react';

type BudgetTab = 'dashboard' | 'master-sheet' | 'variance' | 'ledger' | 'cash-flow' | 'settings';

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BudgetPage() {
  const {
    projects = [],
    selectedProjectId,
    setSelectedProjectId,
    liveMode = false,
    dashboard,
    mockDashboard,
    refreshDashboard,
    userRole,
    runAction,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<BudgetTab>('dashboard');

  const canManageBudget = useMemo(() => {
    return userRole === 'admin' || userRole === 'management' || userRole === 'project_manager';
  }, [userRole]);

  // Robust null-safe Dashboard data fallbacks
  const safeDashboard = useMemo(() => {
    const raw = (liveMode ? dashboard : mockDashboard) || {};
    return {
      summaries: Array.isArray(raw.summaries) ? raw.summaries : [],
      allocations: Array.isArray(raw.allocations) ? raw.allocations : [],
      ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
      alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    };
  }, [liveMode, dashboard, mockDashboard]);

  const safeProjects = Array.isArray(projects) ? projects : [];

  const totals = useMemo(() => {
    const allocated = safeDashboard.summaries.reduce((sum: number, row: any) => sum + numberValue(row?.allocated_amount), 0);
    const committed = safeDashboard.summaries.reduce((sum: number, row: any) => sum + numberValue(row?.committed_amount), 0);
    const spent = safeDashboard.summaries.reduce((sum: number, row: any) => sum + numberValue(row?.spent_amount), 0);
    const available = safeDashboard.summaries.reduce((sum: number, row: any) => sum + numberValue(row?.remaining_amount), 0);
    const utilization = allocated > 0 ? ((committed + spent) / allocated) * 100 : 0;
    return { allocated, committed, spent, available, utilization };
  }, [safeDashboard.summaries]);

  const openAlertsCount = useMemo(() => {
    return safeDashboard.alerts.filter((alert: any) => alert?.status === 'pending').length.toString();
  }, [safeDashboard.alerts]);

  return (
    <div className="space-y-6 select-none">
      {/* HEADER BAR */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">Project Budget &amp; Variance Engine</h1>
          <p className="text-xs text-muted-foreground">
            Real-Time Cost Control • Excel Master Schedules • Bill-Wise Ledger • Variance Reconciliation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground">
            <span>Project:</span>
            <select
              value={selectedProjectId || ''}
              onChange={(event) => setSelectedProjectId(event.target.value || '')}
              className="bg-transparent font-bold text-primary outline-none"
            >
              <option value="">All Projects Portfolio</option>
              {safeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              if (typeof refreshDashboard === 'function') {
                runAction('Dashboard data re-synced.', refreshDashboard);
              }
            }}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh Sync
          </button>
        </div>
      </header>

      {/* EXECUTIVE KPI SUMMARY CARDS */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Total Baseline Budget" value={formatIndianCurrency(totals.allocated)} icon={WalletCards} tone="neutral" />
        <Metric label="PO Reserved (Committed)" value={formatIndianCurrency(totals.committed)} icon={ShieldCheck} tone="warning" />
        <Metric label="Bill Deductions (Spent)" value={formatIndianCurrency(totals.spent)} icon={CircleDollarSign} tone="danger" />
        <Metric label="Available To Commit" value={formatIndianCurrency(totals.available)} icon={CheckCircle2} tone="success" />
        <Metric label="Budget Utilization (%)" value={`${totals.utilization.toFixed(1)}%`} icon={TrendingUp} tone={totals.utilization > 90 ? 'danger' : totals.utilization > 75 ? 'warning' : 'success'} />
        <Metric label="Open Alerts" value={openAlertsCount} icon={FileClock} tone="warning" />
      </section>

      {/* CLEAN 5-TAB NAVIGATION BAR */}
      <nav className="flex gap-1.5 overflow-x-auto border-b border-border pb-2">
        {[
          { key: 'dashboard' as BudgetTab, label: 'Overview & Risk Alerts', icon: BarChart3 },
          { key: 'master-sheet' as BudgetTab, label: 'Master Budget', icon: FileSpreadsheet },
          { key: 'variance' as BudgetTab, label: 'Variance', icon: TrendingUp },
          { key: 'ledger' as BudgetTab, label: 'Bill-Wise Ledger', icon: ClipboardCheck },
          { key: 'cash-flow' as BudgetTab, label: 'Cash Flow S-Curve', icon: CircleDollarSign },
          { key: 'settings' as BudgetTab, label: 'Config', icon: Settings },
        ].map((tab) => {
          const LucideIconComp = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-xs font-bold uppercase transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <LucideIconComp className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* TAB 1: EXECUTIVE OVERVIEW DASHBOARD */}
      {activeTab === 'dashboard' && (
        <BudgetOverviewDashboard />
      )}

      {/* TAB 2: MASTER BUDGET (Central Park 24 Categories, 191 Items) */}
      {activeTab === 'master-sheet' && (
        <MasterSheetTab canManage={true} />
      )}

      {/* TAB 3: VARIANCE RECONCILIATION (Orbit 3 Recon XLSM) */}
      {activeTab === 'variance' && (
        <VarianceAnalysisTab categories={ORBIT3_VARIANCE_CATEGORIES} canManage={true} />
      )}

      {/* TAB 4: BILL-WISE LEDGER (28-Column Construction ERP Ledger) */}
      {activeTab === 'ledger' && (
        <BillWiseLedgerTab />
      )}

      {/* TAB 5: CASH FLOW S-CURVE */}
      {activeTab === 'cash-flow' && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <SectionTitle icon={CircleDollarSign} title="Monthly Cash Outflow Forecast &amp; S-Curve" />
          <div className="mt-4 h-[380px] w-full">
            <BudgetCashFlowChart ledger={safeDashboard.ledger} totalSpend={totals.spent} />
          </div>
        </section>
      )}

      {/* TAB 6: CONFIG & LOCKS */}
      {activeTab === 'settings' && (
        <BudgetSettingsTab canManage={true} />
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
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
    <article className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 sm:p-3 shadow-2xs transition-all hover:border-primary/40">
      <Icon className={`h-8 w-8 flex-shrink-0 rounded-lg p-1.5 ${iconTone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className="mt-0.5 text-xs sm:text-sm font-extrabold text-foreground truncate">{value}</p>
      </div>
    </article>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Layers3; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="font-heading text-base font-semibold">{title}</h2>
    </div>
  );
}
