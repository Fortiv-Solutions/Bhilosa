// Live budget control workspace for allocations, revisions, alerts, and bill-wise deductions.
'use client';

import BudgetCashFlowChart from '@/components/budget-cash-flow-chart';
import {
  approveBudgetRevision,
  createBudgetAllocation,
  listBudgetDashboard,
  resolveBudgetAlert,
  reviseBudgetAllocation,
  type BudgetAlertRow,
  type BudgetAllocationRow,
  type BudgetDashboardData,
  type BudgetLedgerRow,
} from '@/lib/budget';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileClock,
  Layers3,
  Plus,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type BudgetTab = 'allocations' | 'ledger' | 'alerts' | 'revisions' | 'cash-flow';

const emptyDashboard: BudgetDashboardData = {
  summaries: [],
  allocations: [],
  ledger: [],
  alerts: [],
};

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(value?: string | null) {
  return (value || 'pending').replaceAll('_', ' ');
}

function statusTone(status?: string | null) {
  if (status === 'approved' || status === 'closed' || status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20';
  if (status === 'blocked' || status === 'rejected') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20';
}

function transactionTone(type: string) {
  if (type === 'actual') return 'text-red-600';
  if (type === 'commitment') return 'text-amber-600';
  if (type === 'release') return 'text-emerald-600';
  if (type === 'adjustment') return 'text-blue-600';
  return 'text-gray-700 dark:text-gray-300';
}

function sourceLabel(row: BudgetLedgerRow) {
  if (!row.source_table) return 'Manual';
  if (row.source_table === 'vendor_bills') return 'Bill deduction';
  if (row.source_table === 'purchase_orders') return 'PO reservation';
  if (row.source_table === 'budget_revisions') return 'Budget revision';
  if (row.source_table === 'budget_allocations') return 'Budget allocation';
  return row.source_table.replaceAll('_', ' ');
}

export default function BudgetPage() {
  const { projects, activeProjectId, activeRole } = useAppStore();
  const liveMode = isLiveSupabase();
  const canManageBudget = activeRole === 'UPPER_MANAGEMENT';

  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || projects[0]?.id || '');
  const [activeTab, setActiveTab] = useState<BudgetTab>('allocations');
  const [selectedAllocationId, setSelectedAllocationId] = useState('');
  const [dashboard, setDashboard] = useState<BudgetDashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [allocationName, setAllocationName] = useState('');
  const [budgetHeadName, setBudgetHeadName] = useState('');
  const [budgetHeadCode, setBudgetHeadCode] = useState('');
  const [costCode, setCostCode] = useState('');
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [warningThreshold, setWarningThreshold] = useState('80');
  const [hardLimit, setHardLimit] = useState('100');
  const [draftMode, setDraftMode] = useState(false);
  const [revisionAmount, setRevisionAmount] = useState('');
  const [revisionRemarks, setRevisionRemarks] = useState('');

  const mockDashboard = useMemo<BudgetDashboardData>(() => {
    const filteredProjects = selectedProjectId
      ? projects.filter((project) => project.id === selectedProjectId)
      : projects;

    const allocations = filteredProjects.map<BudgetAllocationRow>((project) => {
      return {
        id: `mock-${project.id}`,
        project_id: project.id,
        site_id: null,
        budget_head_id: `mock-head-${project.id}`,
        activity_id: null,
        vendor_id: null,
        allocation_name: `${project.name} approved project budget`,
        allocated_amount: project.budget,
        committed_amount: Math.round(project.budget * 0.08),
        spent_amount: project.actualSpend,
        warning_threshold_percent: 80,
        hard_limit_percent: 100,
        status: 'approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        budget_heads: {
          code: 'PROJECT',
          name: 'Project Budget',
          cost_codes: { code: 'PROJECT', name: 'Project Cost Control' },
        },
      };
    });

    const ledger = allocations.flatMap<BudgetLedgerRow>((allocation) => [
      {
        id: `${allocation.id}-allocation`,
        project_id: allocation.project_id,
        budget_allocation_id: allocation.id,
        transaction_type: 'allocation',
        source_table: 'budget_allocations',
        source_id: allocation.id,
        amount: allocation.allocated_amount,
        description: 'Approved baseline allocation',
        posted_at: allocation.created_at,
        budget_allocations: { allocation_name: allocation.allocation_name, budget_heads: allocation.budget_heads ?? null },
      },
      {
        id: `${allocation.id}-actual`,
        project_id: allocation.project_id,
        budget_allocation_id: allocation.id,
        transaction_type: 'actual',
        source_table: 'vendor_bills',
        source_id: allocation.id,
        amount: allocation.spent_amount,
        description: 'Mock approved bill deductions',
        posted_at: allocation.updated_at,
        budget_allocations: { allocation_name: allocation.allocation_name, budget_heads: allocation.budget_heads ?? null },
      },
    ]);

    const alerts = allocations
      .filter((allocation) => {
        const exposure = allocation.allocated_amount > 0
          ? ((allocation.committed_amount + allocation.spent_amount) / allocation.allocated_amount) * 100
          : 0;
        return exposure >= allocation.warning_threshold_percent;
      })
      .map<BudgetAlertRow>((allocation) => ({
        id: `${allocation.id}-alert`,
        project_id: allocation.project_id,
        budget_allocation_id: allocation.id,
        alert_type: allocation.spent_amount > allocation.allocated_amount ? 'overrun' : 'near_limit',
        threshold_percent: allocation.warning_threshold_percent,
        actual_percent: allocation.allocated_amount > 0
          ? ((allocation.committed_amount + allocation.spent_amount) / allocation.allocated_amount) * 100
          : 0,
        message: `${allocation.allocation_name} has crossed the configured budget threshold.`,
        status: 'pending',
        resolved_at: null,
        created_at: allocation.updated_at,
        budget_allocations: { allocation_name: allocation.allocation_name },
      }));

    return {
      summaries: filteredProjects.map((project) => ({
        project_id: project.id,
        project_code: project.id,
        project_name: project.name,
        allocated_amount: project.budget,
        committed_amount: Math.round(project.budget * 0.08),
        spent_amount: project.actualSpend,
        remaining_amount: Math.max(0, project.budget - project.actualSpend),
      })),
      allocations,
      ledger,
      alerts,
    };
  }, [projects, selectedProjectId]);

  const visibleDashboard = liveMode ? dashboard : mockDashboard;
  const allocations = visibleDashboard.allocations;
  const effectiveSelectedAllocationId = selectedAllocationId || allocations[0]?.id || '';
  const ledgerRows = selectedAllocationId
    ? visibleDashboard.ledger.filter((row) => row.budget_allocation_id === selectedAllocationId)
    : visibleDashboard.ledger;
  const revisionRows = visibleDashboard.ledger.filter((row) => row.transaction_type === 'adjustment' || row.transaction_type === 'allocation');
  const selectedAllocation = allocations.find((allocation) => allocation.id === effectiveSelectedAllocationId) ?? null;

  const totals = useMemo(() => {
    const allocated = allocations.reduce((sum, row) => sum + numberValue(row.allocated_amount), 0);
    const committed = allocations.reduce((sum, row) => sum + numberValue(row.committed_amount), 0);
    const spent = allocations.reduce((sum, row) => sum + numberValue(row.spent_amount), 0);
    const available = allocations.reduce((sum, row) => sum + Math.max(0, numberValue(row.allocated_amount) - numberValue(row.committed_amount) - numberValue(row.spent_amount)), 0);
    const overrun = allocations.reduce((sum, row) => sum + Math.max(0, numberValue(row.spent_amount) + numberValue(row.committed_amount) - numberValue(row.allocated_amount)), 0);
    return { allocated, committed, spent, available, overrun };
  }, [allocations]);

  const refresh = useCallback(async () => {
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      setDashboard(await listBudgetDashboard(selectedProjectId || undefined));
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load budget data.');
    } finally {
      setLoading(false);
    }
  }, [liveMode, selectedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function runAction(successMessage: string, action: () => Promise<{ error: Error | null }>) {
    setMessage(null);
    setError(null);
    const result = await action();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(successMessage);
    await refresh();
  }

  async function handleCreateAllocation(event: React.FormEvent) {
    event.preventDefault();
    const amount = numberValue(allocatedAmount);
    if (!selectedProjectId || amount <= 0 || !allocationName.trim() || !budgetHeadName.trim()) {
      setError('Project, allocation name, budget head, and amount are required.');
      return;
    }

    await runAction('Budget allocation created.', () =>
      createBudgetAllocation({
        projectId: selectedProjectId,
        allocationName: allocationName.trim(),
        allocatedAmount: amount,
        budgetHeadName: budgetHeadName.trim(),
        budgetHeadCode: budgetHeadCode.trim(),
        costCode: costCode.trim(),
        costCodeName: budgetHeadName.trim(),
        warningThresholdPercent: numberValue(warningThreshold) || 80,
        hardLimitPercent: numberValue(hardLimit) || 100,
        status: draftMode ? 'draft' : 'approved',
      }),
    );

    if (!liveMode) {
      setMessage('Budget allocation form validated. Connect Supabase to persist it.');
    }
    setAllocationName('');
    setBudgetHeadName('');
    setBudgetHeadCode('');
    setCostCode('');
    setAllocatedAmount('');
  }

  async function handleReviseAllocation(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedAllocation) {
      setError('Select an allocation to revise.');
      return;
    }
    const amount = numberValue(revisionAmount);
    if (amount < 0) {
      setError('Revised allocation cannot be negative.');
      return;
    }

    await runAction('Budget revision posted to ledger.', () =>
      reviseBudgetAllocation({
        allocationId: selectedAllocation.id,
        newAllocatedAmount: amount,
        remarks: revisionRemarks.trim(),
      }),
    );
    setRevisionAmount('');
    setRevisionRemarks('');
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">
            Financial Control
          </span>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Budget Control</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Manage project allocations, PO commitments, bill-wise deductions, overrun alerts, and revision history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(event) => {
              setSelectedProjectId(event.target.value);
              setSelectedAllocationId('');
            }}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold outline-none"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={!liveMode || loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {!liveMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Supabase is not configured. Budget is running in local mock mode; create, revise, and alert actions are validated but not persisted.
        </div>
      )}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Approved Budget" value={formatIndianCurrency(totals.allocated)} icon={WalletCards} />
        <Metric label="PO Reserved" value={formatIndianCurrency(totals.committed)} icon={ShieldCheck} tone="warning" />
        <Metric label="Bill Deductions" value={formatIndianCurrency(totals.spent)} icon={CircleDollarSign} tone="danger" />
        <Metric label="Available To Commit" value={formatIndianCurrency(totals.available)} icon={CheckCircle2} tone="success" />
        <Metric label="Overrun Exposure" value={formatIndianCurrency(totals.overrun)} icon={AlertTriangle} tone={totals.overrun > 0 ? 'danger' : 'success'} />
        <Metric label="Open Alerts" value={visibleDashboard.alerts.filter((alert) => alert.status === 'pending').length.toString()} icon={FileClock} tone="warning" />
      </section>

      <nav className="flex gap-2 overflow-x-auto border-b border-border pb-2">
        {[
          ['allocations', 'Allocations'],
          ['ledger', 'Ledger'],
          ['alerts', 'Alerts'],
          ['revisions', 'Revisions'],
          ['cash-flow', 'Cash Flow'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab as BudgetTab)}
            className={`h-9 whitespace-nowrap rounded-lg px-3 text-xs font-bold uppercase transition-colors ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'allocations' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <section className="xl:col-span-8 rounded-lg border border-border bg-card p-4 shadow-sm">
            <SectionTitle icon={Layers3} title="Budget Allocations" />
            <AllocationTable allocations={allocations} onSelect={setSelectedAllocationId} selectedId={effectiveSelectedAllocationId} />
          </section>

          <section className="xl:col-span-4 rounded-lg border border-border bg-card p-4 shadow-sm">
            <SectionTitle icon={Plus} title="Create Allocation" />
            <form onSubmit={handleCreateAllocation} className="mt-4 space-y-3">
              <FormField label="Allocation Name" value={allocationName} onChange={setAllocationName} placeholder="Tower A concrete package" disabled={!canManageBudget} />
              <FormField label="Budget Head" value={budgetHeadName} onChange={setBudgetHeadName} placeholder="Structural Works" disabled={!canManageBudget} />
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Head Code" value={budgetHeadCode} onChange={setBudgetHeadCode} placeholder="STR" disabled={!canManageBudget} />
                <FormField label="Cost Code" value={costCode} onChange={setCostCode} placeholder="STR-001" disabled={!canManageBudget} />
              </div>
              <FormField label="Amount" value={allocatedAmount} onChange={setAllocatedAmount} placeholder="25000000" type="number" disabled={!canManageBudget} />
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Warn %" value={warningThreshold} onChange={setWarningThreshold} type="number" disabled={!canManageBudget} />
                <FormField label="Hard %" value={hardLimit} onChange={setHardLimit} type="number" disabled={!canManageBudget} />
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <input type="checkbox" checked={draftMode} onChange={(event) => setDraftMode(event.target.checked)} disabled={!canManageBudget} />
                Save as draft for approval
              </label>
              <button type="submit" disabled={!canManageBudget} className="h-10 w-full rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
                Create Budget
              </button>
            </form>
          </section>
        </div>
      )}

      {activeTab === 'ledger' && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionTitle icon={ClipboardCheck} title="Bill-Wise Budget Ledger" />
            <select value={selectedAllocationId} onChange={(event) => setSelectedAllocationId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none">
              <option value="">All allocations</option>
              {allocations.map((allocation) => (
                <option key={allocation.id} value={allocation.id}>
                  {allocation.allocation_name}
                </option>
              ))}
            </select>
          </div>
          <LedgerTable rows={ledgerRows} />
        </section>
      )}

      {activeTab === 'alerts' && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionTitle icon={AlertTriangle} title="Budget Alerts" />
          <AlertTable alerts={visibleDashboard.alerts} canManage={canManageBudget} onResolve={(alertId, status) => runAction('Budget alert updated.', () => resolveBudgetAlert(alertId, status))} />
        </section>
      )}

      {activeTab === 'revisions' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <section className="xl:col-span-4 rounded-lg border border-border bg-card p-4 shadow-sm">
            <SectionTitle icon={FileClock} title="Revise Budget" />
            <form onSubmit={handleReviseAllocation} className="mt-4 space-y-3">
              <label className="space-y-1 text-xs font-bold uppercase text-gray-400">
                <span>Allocation</span>
                <select value={effectiveSelectedAllocationId} onChange={(event) => setSelectedAllocationId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold normal-case text-foreground outline-none">
                  {allocations.map((allocation) => (
                    <option key={allocation.id} value={allocation.id}>
                      {allocation.allocation_name}
                    </option>
                  ))}
                </select>
              </label>
              <FormField label="Revised Amount" value={revisionAmount} onChange={setRevisionAmount} placeholder={selectedAllocation ? String(selectedAllocation.allocated_amount) : '0'} type="number" disabled={!canManageBudget} />
              <label className="space-y-1 text-xs font-bold uppercase text-gray-400">
                <span>Remarks</span>
                <textarea value={revisionRemarks} onChange={(event) => setRevisionRemarks(event.target.value)} disabled={!canManageBudget} className="min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm font-medium normal-case text-foreground outline-none disabled:opacity-50" placeholder="Reason for budget revision" />
              </label>
              <button type="submit" disabled={!canManageBudget || !selectedAllocation} className="h-10 w-full rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
                Post Revision
              </button>
              {selectedAllocation?.status === 'draft' && (
                <button type="button" disabled={!canManageBudget} onClick={() => runAction('Draft allocation approved.', () => approveBudgetRevision(selectedAllocation.id))} className="h-10 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 disabled:opacity-50">
                  Approve Draft Allocation
                </button>
              )}
            </form>
          </section>
          <section className="xl:col-span-8 rounded-lg border border-border bg-card p-4 shadow-sm">
            <SectionTitle icon={ClipboardCheck} title="Revision History" />
            <LedgerTable rows={revisionRows} />
          </section>
        </div>
      )}

      {activeTab === 'cash-flow' && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionTitle icon={CircleDollarSign} title="Cash Flow From Ledger" />
          <div className="mt-4 h-[360px] w-full">
            <BudgetCashFlowChart ledger={visibleDashboard.ledger} totalSpend={totals.spent} />
          </div>
        </section>
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
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <Icon className={`h-8 w-8 rounded-lg p-1.5 ${iconTone}`} />
      <p className="mt-3 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase text-gray-400">{label}</p>
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

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase text-gray-400">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium normal-case text-foreground outline-none disabled:opacity-50"
      />
    </label>
  );
}

function AllocationTable({
  allocations,
  selectedId,
  onSelect,
}: {
  allocations: BudgetAllocationRow[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
          <tr>
            <th className="pb-3">Allocation</th>
            <th className="pb-3">Cost Code</th>
            <th className="pb-3">Approved</th>
            <th className="pb-3">Reserved</th>
            <th className="pb-3">Spent</th>
            <th className="pb-3">Available</th>
            <th className="pb-3">Utilization</th>
            <th className="pb-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
            const available = Math.max(0, allocation.allocated_amount - allocation.committed_amount - allocation.spent_amount);
            const utilization = allocation.allocated_amount > 0 ? ((allocation.committed_amount + allocation.spent_amount) / allocation.allocated_amount) * 100 : 0;
            return (
              <tr key={allocation.id} onClick={() => onSelect(allocation.id)} className={`cursor-pointer border-b border-gray-50 dark:border-gray-850 ${selectedId === allocation.id ? 'bg-orange-50/60 dark:bg-orange-950/10' : 'hover:bg-muted/40'}`}>
                <td className="py-3">
                  <p className="font-bold">{allocation.allocation_name}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{allocation.budget_heads?.name || 'Budget head not mapped'}</p>
                </td>
                <td className="py-3 font-semibold text-gray-500">{allocation.budget_heads?.cost_codes?.code || allocation.budget_heads?.code || '-'}</td>
                <td className="py-3 font-bold">{formatIndianCurrency(allocation.allocated_amount)}</td>
                <td className="py-3 text-amber-600">{formatIndianCurrency(allocation.committed_amount)}</td>
                <td className="py-3 text-red-600">{formatIndianCurrency(allocation.spent_amount)}</td>
                <td className="py-3 text-emerald-600">{formatIndianCurrency(available)}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className={`h-full ${utilization > allocation.hard_limit_percent ? 'bg-red-500' : utilization > allocation.warning_threshold_percent ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, utilization)}%` }} />
                    </div>
                    <span className="font-bold">{utilization.toFixed(0)}%</span>
                  </div>
                </td>
                <td className="py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(allocation.status)}`}>
                    {statusLabel(allocation.status)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {allocations.length === 0 && <EmptyState text="No budget allocations found for the selected project." />}
    </div>
  );
}

function LedgerTable({ rows }: { rows: BudgetLedgerRow[] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
          <tr>
            <th className="pb-3">Posted</th>
            <th className="pb-3">Allocation</th>
            <th className="pb-3">Type</th>
            <th className="pb-3">Source</th>
            <th className="pb-3">Amount</th>
            <th className="pb-3">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-50 dark:border-gray-850">
              <td className="py-3 font-semibold text-gray-500">{new Date(row.posted_at).toLocaleDateString('en-IN')}</td>
              <td className="py-3 font-bold">{row.budget_allocations?.allocation_name || row.budget_allocation_id}</td>
              <td className={`py-3 font-bold uppercase ${transactionTone(row.transaction_type)}`}>{row.transaction_type}</td>
              <td className="py-3">{sourceLabel(row)}</td>
              <td className="py-3 font-bold">{formatIndianCurrency(row.amount)}</td>
              <td className="py-3 text-gray-500">{row.description || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState text="No ledger rows found for this filter." />}
    </div>
  );
}

function AlertTable({
  alerts,
  canManage,
  onResolve,
}: {
  alerts: BudgetAlertRow[];
  canManage: boolean;
  onResolve: (id: string, status: 'approved' | 'rejected' | 'closed') => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
          <tr>
            <th className="pb-3">Alert</th>
            <th className="pb-3">Allocation</th>
            <th className="pb-3">Threshold</th>
            <th className="pb-3">Actual</th>
            <th className="pb-3">Status</th>
            <th className="pb-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} className="border-b border-gray-50 dark:border-gray-850">
              <td className="py-3">
                <p className="font-bold capitalize">{alert.alert_type.replaceAll('_', ' ')}</p>
                <p className="mt-0.5 text-gray-500">{alert.message}</p>
              </td>
              <td className="py-3 font-semibold">{alert.budget_allocations?.allocation_name || '-'}</td>
              <td className="py-3">{alert.threshold_percent?.toFixed(0) ?? '-'}%</td>
              <td className="py-3 font-bold">{alert.actual_percent?.toFixed(1) ?? '-'}%</td>
              <td className="py-3">
                <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(alert.status)}`}>
                  {statusLabel(alert.status)}
                </span>
              </td>
              <td className="py-3">
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={!canManage || alert.status !== 'pending'} onClick={() => onResolve(alert.id, 'approved')} className="rounded-md border border-emerald-200 px-3 py-2 font-bold text-emerald-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button type="button" disabled={!canManage || alert.status !== 'pending'} onClick={() => onResolve(alert.id, 'rejected')} className="rounded-md border border-red-200 px-3 py-2 font-bold text-red-700 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {alerts.length === 0 && <EmptyState text="No budget alerts for the selected project." />}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-8 text-center text-sm font-semibold text-muted-foreground">
      {text}
    </div>
  );
}
