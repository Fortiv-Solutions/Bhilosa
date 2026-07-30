'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — VARIANCE RECONCILIATION
// File: frontend/src/components/budget/variance-analysis-tab.tsx
//
// What was wrong before:
//   * handleSaveEdits was setState only. updateVarianceItemInSupabase existed in the
//     service layer but was never imported anywhere, so billed quantities and rates
//     never reached the database — all 191 live variance rows still read
//     actual_total_cost = 0 / work_status = 'Not Started'.
//   * historyLogs was seeded with two fabricated audit entries, one attributed to a
//     named individual ("Billing Engineer (Rakesh Patel)").
//   * civilMaterialDifferences held hardcoded steel/cement figures, was computed,
//     and was never rendered — dead invented data.
//   * The "AI Overrun Mitigation" panel presented invented advice (₹41.3L, ₹25.4L,
//     ₹43L, "UltraTech ₹385/bag") as analysis. Removed.
//   * saleableAreaSqft defaulted to 615000 and asOfDate to the literal '30-07-2026'.
//   * Cost variance was clamped to overruns only (`rawDiff < 0 ? rawDiff : 0`), so
//     savings silently vanished and the figure disagreed with the Overview tab.
//     Both now use the single signed definition in lib/variance-data.
// ============================================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Eye,
  EyeOff,
  History,
  Loader2,
  LockKeyhole,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  BudgetDataError,
  downloadCsv,
  saveVarianceReconciliation,
  toCsv,
  type VarianceItemPatch,
} from '@/lib/supabase-budget';
import type { VarianceItem } from '@/lib/variance-data';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetError, BudgetGate } from './budget-states';

type EditMap = Record<string, { billQty: number; billRate: number; remark: string }>;

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

export default function VarianceAnalysisTab({ permissions }: { permissions: BudgetPermissions }) {
  const {
    projectId,
    projectName,
    isPortfolio,
    buaSqft,
    variance,
    varianceSummary,
    revisions,
    config,
    refresh,
    setEditing,
  } = useBudgetData();

  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [showFullAuditCols, setShowFullAuditCols] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'overruns' | 'savings' | 'unbilled'>('all');

  const [isEditMode, setIsEditMode] = useState(false);
  const [edits, setEdits] = useState<EditMap>({});
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [justification, setJustification] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reconRevisions = useMemo(
    () => revisions.filter((r) => r.scope === 'variance_reconciliation'),
    [revisions],
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, VarianceItem>();
    for (const cat of variance) for (const item of cat.items) map.set(item.id, item);
    return map;
  }, [variance]);

  /** Item with pending edits applied, recomputed with the shared sign convention. */
  const resolveItem = useCallback(
    (item: VarianceItem): VarianceItem => {
      const edit = edits[item.id];
      if (!edit) return item;

      const actualTotalCost = Math.round(edit.billQty * edit.billRate);
      const costVarianceAmount = item.budgetCost - actualTotalCost;

      return {
        ...item,
        actualBillQty: edit.billQty,
        actualBillRate: edit.billRate,
        actualTotalCost,
        qtyVariation: Number((edit.billQty - item.budgetQty).toFixed(4)),
        rateVariation: Number((edit.billRate - item.budgetRate).toFixed(4)),
        balance: Math.max(0, costVarianceAmount),
        costVarianceAmount,
        costVariancePercent:
          item.budgetCost > 0 ? Number(((costVarianceAmount / item.budgetCost) * 100).toFixed(2)) : 0,
        remark: edit.remark,
        workStatus:
          actualTotalCost <= 0
            ? 'Not Started'
            : edit.billQty >= item.budgetQty
              ? 'Completed'
              : 'In Progress',
      };
    },
    [edits],
  );

  const dirtyIds = useMemo(
    () =>
      Object.keys(edits).filter((id) => {
        const original = itemsById.get(id);
        if (!original) return false;
        const edit = edits[id];
        return (
          edit.billQty !== original.actualBillQty ||
          edit.billRate !== original.actualBillRate ||
          (edit.remark ?? '') !== (original.remark ?? '')
        );
      }),
    [edits, itemsById],
  );

  const hasUnsavedEdits = dirtyIds.length > 0;

  const resolvedCategories = useMemo(
    () =>
      variance.map((cat) => {
        const items = cat.items.map(resolveItem);
        return {
          ...cat,
          items,
          totalBudgetCost: items.reduce((s, i) => s + i.budgetCost, 0),
          totalActualCost: items.reduce((s, i) => s + i.actualTotalCost, 0),
          totalCommittedCost: items.reduce((s, i) => s + i.poAmount, 0),
          totalBalance: items.reduce((s, i) => s + i.balance, 0),
          totalVarianceAmount: items.reduce((s, i) => s + i.costVarianceAmount, 0),
        };
      }),
    [variance, resolveItem],
  );

  const filteredCategories = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return resolvedCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          const matchesQuery =
            !needle ||
            item.subActivity.toLowerCase().includes(needle) ||
            cat.categoryName.toLowerCase().includes(needle) ||
            item.srNo.toLowerCase().includes(needle);

          const matchesStatus =
            statusFilter === 'all'
              ? true
              : statusFilter === 'overruns'
                ? item.costVarianceAmount < 0
                : statusFilter === 'savings'
                  ? item.costVarianceAmount > 0 && item.actualTotalCost > 0
                  : item.actualTotalCost <= 0;

          return matchesQuery && matchesStatus;
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [resolvedCategories, searchQuery, statusFilter]);

  const totals = useMemo(() => {
    const budget = resolvedCategories.reduce((s, c) => s + c.totalBudgetCost, 0);
    const actual = resolvedCategories.reduce((s, c) => s + c.totalActualCost, 0);
    const committed = resolvedCategories.reduce((s, c) => s + c.totalCommittedCost, 0);
    const balance = resolvedCategories.reduce((s, c) => s + c.totalBalance, 0);
    const items = resolvedCategories.flatMap((c) => c.items);
    const varianceAmount = budget - actual;
    return {
      budget,
      actual,
      committed,
      balance,
      varianceAmount,
      variancePercent: budget > 0 ? (varianceAmount / budget) * 100 : 0,
      qtyVariation: items.reduce((s, i) => s + i.qtyVariation, 0),
      rateVariation: items.reduce((s, i) => s + i.rateVariation, 0),
      itemCount: items.length,
    };
  }, [resolvedCategories]);

  function toggleCategory(catId: string) {
    setOpenCategories((prev) => ({ ...prev, [catId]: !(prev[catId] ?? true) }));
  }

  function beginEdit() {
    setEdits({});
    setSaveError(null);
    setNotice(null);
    setIsEditMode(true);
    setEditing(true);
  }

  function discardEdits() {
    setEdits({});
    setIsEditMode(false);
    setEditing(false);
    setShowDiscardModal(false);
    setShowSaveModal(false);
  }

  function attemptCancel() {
    if (hasUnsavedEdits) setShowDiscardModal(true);
    else discardEdits();
  }

  function handleCellChange(
    item: VarianceItem,
    field: 'billQty' | 'billRate' | 'remark',
    raw: string,
  ) {
    setEdits((prev) => {
      const base =
        prev[item.id] ??
        {
          billQty: item.actualBillQty,
          billRate: item.actualBillRate,
          remark: item.remark ?? '',
        };
      const next = { ...base };
      if (field === 'remark') {
        next.remark = raw;
      } else {
        const parsed = Number(raw);
        next[field] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }
      return { ...prev, [item.id]: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const patches: VarianceItemPatch[] = [];
      for (const id of dirtyIds) {
        const original = itemsById.get(id);
        // budget_variance_items.id is what the RPC updates; a missing id means the
        // row was never provisioned, which the migration's backfill prevents.
        if (!original?.varianceItemId) {
          throw new BudgetDataError(
            `"${original?.subActivity ?? id}" has no variance record in Supabase. Run the budget hardening migration, then reload.`,
          );
        }
        const edit = edits[id];
        patches.push({
          id: original.varianceItemId,
          actual_bill_qty: edit.billQty,
          actual_bill_rate: edit.billRate,
          remark: edit.remark ?? '',
        });
      }

      const revision = await saveVarianceReconciliation(projectId, justification, patches);

      setEdits({});
      setIsEditMode(false);
      setEditing(false);
      setShowSaveModal(false);
      setJustification('');
      await refresh();
      setNotice(
        `Saved to Supabase as ${revision.version_label}. ${patches.length} row(s) reconciled.`,
      );
      setTimeout(() => setNotice(null), 6000);
    } catch (err) {
      setSaveError(
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Unable to save variance reconciliation.',
      );
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    const headers = [
      'Category', 'Sr No', 'Sub Activity', 'Work Status', 'Unit',
      'Budget Qty', 'Budget Rate', 'Budget Cost',
      'PO Qty', 'PO Rate', 'PO Amount',
      'Billed Qty', 'Bill Rate', 'Actual Cost',
      'Qty Variation', 'Rate Variation', 'Balance',
      'Cost Variance (signed)', 'Cost Variance %', 'Remark',
    ];
    const body = resolvedCategories.flatMap((cat) =>
      cat.items.map((i) => [
        cat.categoryName, i.srNo, i.subActivity, i.workStatus, i.unit,
        i.budgetQty, i.budgetRate, i.budgetCost,
        i.poQty, i.poRate, i.poAmount,
        i.actualBillQty, i.actualBillRate, i.actualTotalCost,
        i.qtyVariation, i.rateVariation, i.balance,
        i.costVarianceAmount, i.costVariancePercent, i.remark,
      ]),
    );
    downloadCsv(
      `variance-reconciliation-${isPortfolio ? 'all-projects' : projectName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(headers, body),
    );
  }

  const canEdit = permissions.canEditVariance && !isPortfolio;
  const identityCols = showFullAuditCols ? 4 : 3;

  return (
    <BudgetGate
      emptyTitle="No variance data for this project"
      emptyDetail="The variance sheet mirrors the Master Budget. Import a baseline schedule first."
      loadingLabel="Loading variance reconciliation from Supabase…"
    >
      <div className="space-y-5 font-sans">
        {notice && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />
            {notice}
          </div>
        )}

        {saveError && <BudgetError message={saveError} />}

        {config.budget_lock_enabled && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-300">
            <LockKeyhole className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            This project&apos;s budget is locked. Variance edits are blocked until the lock is lifted
            in Config.
          </div>
        )}

        {/* HEADER DECK */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
                  {projectName} — Cost Summary &amp; Variance Analysis
                </h2>
                {isEditMode && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    Editing
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Live reconciliation • {resolvedCategories.length} activity groups •{' '}
                {totals.itemCount} sub-activities • {varianceSummary.overrunCount} overrun(s),{' '}
                {varianceSummary.savingCount} saving(s)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 border-t border-border pt-3 text-xs md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Built-up Area (sq ft)
              </p>
              <p className="font-mono text-base font-black text-foreground">
                {buaSqft > 0 ? buaSqft.toLocaleString('en-IN') : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                As of
              </p>
              <p className="flex items-center gap-1 font-mono text-base font-bold text-primary">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                {new Date().toLocaleDateString('en-GB')}
              </p>
            </div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sub activity or group…"
                aria-label="Search variance rows"
                className="h-8.5 w-72 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-muted-foreground">Show:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-8.5 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none"
              >
                <option value="all">All sub-activities</option>
                <option value="overruns">Overruns only</option>
                <option value="savings">Savings only</option>
                <option value="unbilled">Not yet billed</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-muted"
            >
              <History className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              Audit History ({reconRevisions.length})
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={!permissions.canExport || totals.itemCount === 0}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
            </button>

            {isEditMode ? (
              <>
                <button
                  type="button"
                  onClick={attemptCancel}
                  disabled={saving}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground shadow-2xs transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJustification('');
                    setSaveError(null);
                    setShowSaveModal(true);
                  }}
                  disabled={!hasUnsavedEdits || saving}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save ({dirtyIds.length})
                </button>
              </>
            ) : (
              canEdit && (
                <button
                  type="button"
                  onClick={beginEdit}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Edit Variance
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setShowFullAuditCols(!showFullAuditCols)}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground shadow-2xs transition-colors hover:bg-muted hover:text-foreground"
            >
              {showFullAuditCols ? (
                <EyeOff className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              )}
              {showFullAuditCols ? 'Standard View' : 'Full Audit View (PO/WO)'}
            </button>
          </div>
        </div>

        {isPortfolio && (
          <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] font-semibold text-muted-foreground">
            Portfolio view is read-only. Select a single project to reconcile billed quantities.
          </p>
        )}

        <p className="rounded-lg border border-border bg-muted/20 p-2.5 text-[11px] font-medium text-muted-foreground">
          <strong className="text-foreground">Cost Variance</strong> is signed:{' '}
          <span className="font-mono text-emerald-600">positive = under budget (saving)</span>,{' '}
          <span className="font-mono text-red-600">negative = overrun</span>. P.O columns are posted
          automatically from approved purchase orders.
        </p>

        {/* RECONCILIATION TABLE */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs whitespace-nowrap font-sans">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/90 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  <th colSpan={identityCols} className="border-r border-border bg-muted/90 px-3 py-2 text-center">
                    Identity
                  </th>
                  <th colSpan={3} className="border-r border-border bg-slate-200/70 px-3 py-2 text-center text-slate-900 dark:bg-slate-800/70 dark:text-slate-100">
                    Budget
                  </th>
                  {showFullAuditCols && (
                    <th colSpan={3} className="border-r border-border bg-amber-100/70 px-3 py-2 text-center text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                      P.O / W.O
                    </th>
                  )}
                  <th colSpan={3} className="border-r border-border bg-emerald-100 px-3 py-2 text-center text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Actual (Billed)
                  </th>
                  <th colSpan={2} className="border-r border-border bg-orange-100 px-3 py-2 text-center text-orange-900 dark:bg-orange-950/60 dark:text-orange-300">
                    Variation
                  </th>
                  <th colSpan={4} className="bg-muted/90 px-3 py-2 text-center">
                    Reconciliation &amp; Variance
                  </th>
                </tr>

                <tr className="border-b border-border bg-muted/70 text-[11px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  <th className="w-10 border-r border-border px-3 py-2.5 text-center">Sr.</th>
                  <th className="min-w-[220px] border-r border-border px-4 py-2.5">Sub Activity</th>
                  {showFullAuditCols && (
                    <th className="border-r border-border px-3 py-2.5 text-center">Status</th>
                  )}
                  <th className="border-r border-border px-3 py-2.5 text-center">Unit</th>

                  <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">Total Qty</th>
                  <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">Rate (₹)</th>
                  <th className="border-r border-border px-4 py-2.5 text-right font-mono font-black text-foreground">
                    Cost (₹)
                  </th>

                  {showFullAuditCols && (
                    <>
                      <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">P.O Qty</th>
                      <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">P.O Rate</th>
                      <th className="border-r border-border px-4 py-2.5 text-right font-mono font-bold">P.O Amount</th>
                    </>
                  )}

                  <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">Bill Qty</th>
                  <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">Bill Rate (₹)</th>
                  <th className="border-r border-border px-4 py-2.5 text-right font-mono font-black text-emerald-900 dark:text-emerald-300">
                    Actual Cost (₹)
                  </th>

                  <th className="border-r border-border/50 px-3.5 py-2.5 text-right font-mono">Qty Var.</th>
                  <th className="border-r border-border px-3.5 py-2.5 text-right font-mono">Rate Var.</th>

                  <th className="border-r border-border px-4 py-2.5 text-right font-mono font-extrabold text-foreground">
                    Balance (₹)
                  </th>
                  <th className="border-r border-border px-4 py-2.5 text-right font-mono font-black">
                    Cost Variance (₹)
                  </th>
                  <th className="border-r border-border px-3.5 py-2.5 text-right font-mono">Variance %</th>
                  <th className="min-w-[240px] px-4 py-2.5 text-left">Remark</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {filteredCategories.map((category) => {
                  const isOpen = openCategories[category.id] ?? true;
                  return (
                    <React.Fragment key={category.id}>
                      <tr
                        onClick={() => toggleCategory(category.id)}
                        className="cursor-pointer bg-muted/70 align-middle font-bold text-foreground transition-colors hover:bg-muted/90"
                      >
                        <td colSpan={identityCols} className="border-r border-border px-3.5 py-2 font-extrabold">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            <span className="text-xs font-black uppercase tracking-wide">
                              {category.categoryName}
                            </span>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                              {category.items.length} items
                            </span>
                          </div>
                        </td>
                        <td colSpan={2} className="border-r border-border/50 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Category Baseline:
                        </td>
                        <td className="border-r border-border bg-slate-100/80 px-4 py-2 text-right font-mono text-xs font-black text-foreground dark:bg-slate-800/80">
                          {inr(category.totalBudgetCost)}
                        </td>
                        {showFullAuditCols && (
                          <>
                            <td colSpan={2} className="border-r border-border/50 px-3 py-2 text-right text-[11px] font-bold uppercase text-amber-800 dark:text-amber-400">
                              Committed:
                            </td>
                            <td className="border-r border-border bg-amber-50/50 px-4 py-2 text-right font-mono text-xs font-black text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                              {inr(category.totalCommittedCost)}
                            </td>
                          </>
                        )}
                        <td colSpan={2} className="border-r border-border/50 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                          Actual Total:
                        </td>
                        <td className="border-r border-border bg-emerald-100/70 px-4 py-2 text-right font-mono text-xs font-black text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                          {inr(category.totalActualCost)}
                        </td>
                        <td colSpan={2} className="border-r border-border px-2 py-2 text-center text-muted-foreground">
                          —
                        </td>
                        <td className="border-r border-border bg-muted/40 px-4 py-2 text-right font-mono font-black text-foreground">
                          {inr(category.totalBalance)}
                        </td>
                        <td
                          className={`border-r border-border px-4 py-2 text-right font-mono font-black ${
                            category.totalVarianceAmount < 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {category.totalVarianceAmount < 0 ? '-' : '+'}
                          {inr(Math.abs(category.totalVarianceAmount))}
                        </td>
                        <td colSpan={2} />
                      </tr>

                      {isOpen &&
                        category.items.map((item) => {
                          const isDirty = dirtyIds.includes(item.id);
                          const isOverrun = item.costVarianceAmount < 0;
                          return (
                            <tr
                              key={item.id}
                              className={`group align-middle transition-colors hover:bg-muted/30 ${
                                isDirty ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                              }`}
                            >
                              <td className="border-r border-border px-3.5 py-2 text-center font-bold text-muted-foreground">
                                {item.srNo}
                              </td>
                              <td
                                className="min-w-[220px] max-w-[300px] whitespace-normal break-words border-r border-border px-4 py-2 font-semibold leading-tight text-foreground"
                                title={item.subActivity}
                              >
                                {item.subActivity}
                              </td>
                              {showFullAuditCols && (
                                <td className="border-r border-border px-3 py-2 text-center">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {item.workStatus}
                                  </span>
                                </td>
                              )}
                              <td className="border-r border-border px-3 py-2 text-center font-medium text-muted-foreground">
                                {item.unit}
                              </td>

                              <td className="border-r border-border/50 px-3.5 py-2 text-right font-mono text-muted-foreground">
                                {item.budgetQty ? item.budgetQty.toLocaleString('en-IN') : '—'}
                              </td>
                              <td className="border-r border-border/50 px-3.5 py-2 text-right font-mono text-muted-foreground">
                                {item.budgetRate ? item.budgetRate.toLocaleString('en-IN') : '—'}
                              </td>
                              <td className="border-r border-border bg-slate-50/50 px-4 py-2 text-right font-mono font-black text-foreground dark:bg-slate-900/20">
                                {item.budgetCost.toLocaleString('en-IN')}
                              </td>

                              {showFullAuditCols && (
                                <>
                                  <td className="border-r border-border/50 px-3.5 py-2 text-right font-mono text-amber-700 dark:text-amber-400">
                                    {item.poQty ? item.poQty.toLocaleString('en-IN') : '—'}
                                  </td>
                                  <td className="border-r border-border/50 px-3.5 py-2 text-right font-mono text-amber-700 dark:text-amber-400">
                                    {item.poRate ? item.poRate.toLocaleString('en-IN') : '—'}
                                  </td>
                                  <td className="border-r border-border bg-amber-50/30 px-4 py-2 text-right font-mono font-bold text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                                    {item.poAmount ? item.poAmount.toLocaleString('en-IN') : '—'}
                                  </td>
                                </>
                              )}

                              <td className="border-r border-border/50 bg-emerald-50/50 px-2 py-1 text-right font-mono dark:bg-emerald-950/20">
                                {isEditMode ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={item.actualBillQty}
                                    onChange={(e) => handleCellChange(item, 'billQty', e.target.value)}
                                    aria-label={`Billed quantity for ${item.subActivity}`}
                                    className="h-7 w-20 rounded border border-emerald-400 bg-card px-2 text-right font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                ) : (
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                    {item.actualBillQty ? item.actualBillQty.toLocaleString('en-IN') : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="border-r border-border/50 bg-emerald-50/50 px-2 py-1 text-right font-mono dark:bg-emerald-950/20">
                                {isEditMode ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={item.actualBillRate}
                                    onChange={(e) => handleCellChange(item, 'billRate', e.target.value)}
                                    aria-label={`Bill rate for ${item.subActivity}`}
                                    className="h-7 w-24 rounded border border-emerald-400 bg-card px-2 text-right font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                ) : (
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                    {item.actualBillRate ? item.actualBillRate.toLocaleString('en-IN') : '—'}
                                  </span>
                                )}
                              </td>
                              <td className="border-r border-border bg-emerald-50/40 px-4 py-2 text-right font-mono font-black text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
                                {item.actualTotalCost.toLocaleString('en-IN')}
                              </td>

                              <td className="border-r border-border/50 px-3.5 py-2 text-right font-mono font-semibold text-amber-700 dark:text-amber-400">
                                {item.qtyVariation.toLocaleString('en-IN')}
                              </td>
                              <td className="border-r border-border px-3.5 py-2 text-right font-mono font-semibold text-amber-700 dark:text-amber-400">
                                {item.rateVariation.toLocaleString('en-IN')}
                              </td>

                              <td className="border-r border-border bg-muted/30 px-4 py-2 text-right font-mono font-extrabold text-foreground">
                                {item.balance > 0 ? inr(item.balance) : '—'}
                              </td>
                              <td
                                className={`border-r border-border px-4 py-2 text-right font-mono font-black ${
                                  isOverrun
                                    ? 'bg-red-50/40 text-red-600 dark:bg-red-950/20'
                                    : item.costVarianceAmount > 0 && item.actualTotalCost > 0
                                      ? 'text-emerald-600'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {item.actualTotalCost > 0
                                  ? `${isOverrun ? '-' : '+'}${inr(Math.abs(item.costVarianceAmount))}`
                                  : '—'}
                              </td>
                              <td
                                className={`border-r border-border px-3.5 py-2 text-right font-mono font-bold ${
                                  isOverrun
                                    ? 'font-black text-red-600'
                                    : item.costVarianceAmount > 0 && item.actualTotalCost > 0
                                      ? 'text-emerald-600'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {item.actualTotalCost > 0
                                  ? `${item.costVariancePercent.toFixed(2)}%`
                                  : '—'}
                              </td>
                              <td className="min-w-[240px] max-w-[340px] whitespace-normal px-2 py-1 text-[11px] text-muted-foreground">
                                {isEditMode ? (
                                  <input
                                    type="text"
                                    value={item.remark ?? ''}
                                    onChange={(e) => handleCellChange(item, 'remark', e.target.value)}
                                    placeholder="Reason for variance / overrun…"
                                    aria-label={`Remark for ${item.subActivity}`}
                                    className="h-7 w-full rounded border border-border bg-card px-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                                  />
                                ) : (
                                  <span className="leading-snug break-words">{item.remark || '—'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}

                {/* TOTAL ROW */}
                <tr className="border-t-2 border-border bg-slate-900 align-middle text-xs font-black text-slate-100">
                  <td
                    colSpan={identityCols}
                    className="border-r border-slate-700 px-4 py-3 text-left text-sm font-black uppercase tracking-widest text-amber-400"
                  >
                    Total
                  </td>
                  <td colSpan={2} className="border-r border-slate-700 px-3 py-3 text-right font-mono text-[11px] font-extrabold text-slate-300">
                    Budget Total:
                  </td>
                  <td className="border-r border-slate-700 px-4 py-3 text-right font-mono text-xs font-black text-amber-300">
                    {inr(totals.budget)}
                  </td>

                  {showFullAuditCols && (
                    <>
                      <td colSpan={2} className="border-r border-slate-700 px-3 py-3 text-right font-mono text-[11px] font-extrabold text-amber-300/80">
                        Committed:
                      </td>
                      <td className="border-r border-slate-700 px-4 py-3 text-right font-mono text-xs font-black text-amber-300">
                        {inr(totals.committed)}
                      </td>
                    </>
                  )}

                  <td colSpan={2} className="border-r border-slate-700 px-3 py-3 text-right font-mono text-[11px] font-extrabold text-emerald-300">
                    Actual Billed:
                  </td>
                  <td className="border-r border-slate-700 px-4 py-3 text-right font-mono text-xs font-black text-emerald-400">
                    {inr(totals.actual)}
                  </td>

                  <td className="border-r border-slate-700 px-3.5 py-3 text-right font-mono text-[11px] text-slate-300">
                    {totals.qtyVariation.toFixed(2)}
                  </td>
                  <td className="border-r border-slate-700 px-3.5 py-3 text-right font-mono text-[11px] text-slate-300">
                    {totals.rateVariation.toFixed(2)}
                  </td>

                  <td className="border-r border-slate-700 px-4 py-3 text-right font-mono text-xs font-black text-slate-100">
                    {inr(totals.balance)}
                  </td>
                  <td className="border-r border-slate-700 px-4 py-3 text-right font-mono text-xs">
                    <span
                      className={`inline-block rounded px-2.5 py-1 font-black text-white shadow-2xs ${
                        totals.varianceAmount < 0 ? 'bg-red-600' : 'bg-emerald-600'
                      }`}
                    >
                      {totals.varianceAmount < 0 ? '-' : '+'}
                      {inr(Math.abs(totals.varianceAmount))}
                    </span>
                  </td>
                  <td
                    className={`border-r border-slate-700 px-3.5 py-3 text-right font-mono text-xs font-black ${
                      totals.varianceAmount < 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {totals.variancePercent.toFixed(2)}%
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {filteredCategories.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs font-semibold text-muted-foreground">
            No sub-activities match the current search or filter.
          </p>
        )}

        {/* SAVE MODAL */}
        {showSaveModal && (
          <Modal
            title="Save variance reconciliation"
            subtitle={`${dirtyIds.length} row(s) will be written to Supabase`}
            icon={Save}
            onClose={() => setShowSaveModal(false)}
          >
            <div className="space-y-3">
              <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] font-semibold text-muted-foreground">
                This updates budget_variance_items and records an entry in
                budget_revisions. Variance columns are recomputed by the database.
              </p>
              <label className="block space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  Reconciliation note (optional)
                </span>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="e.g. RA Bill 14 measurements verified against MB Book pages 45-52."
                  className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              {saveError && <BudgetError message={saveError} />}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                disabled={saving}
                className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Back to editing
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? 'Saving to Supabase…' : 'Save reconciliation'}
              </button>
            </div>
          </Modal>
        )}

        {/* DISCARD MODAL */}
        {showDiscardModal && (
          <Modal
            title="Unsaved variance edits"
            subtitle={`${dirtyIds.length} row(s) have been modified.`}
            icon={AlertTriangle}
            onClose={() => setShowDiscardModal(false)}
          >
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDiscardModal(false);
                  setShowSaveModal(true);
                }}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" aria-hidden="true" /> Save changes
              </button>
              <button
                type="button"
                onClick={discardEdits}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Discard changes
              </button>
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Keep editing
              </button>
            </div>
          </Modal>
        )}

        {/* AUDIT HISTORY */}
        {showHistoryModal && (
          <Modal
            title="Reconciliation audit history"
            subtitle="Every variance save recorded in budget_revisions"
            icon={History}
            wide
            onClose={() => setShowHistoryModal(false)}
          >
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {reconRevisions.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs font-semibold text-muted-foreground">
                  No reconciliation history yet. Saving variance edits will create the first entry.
                </p>
              )}

              {reconRevisions.map((log) => (
                <div key={log.id} className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-foreground">{log.version_label}</span>
                        {log.items && log.items.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold text-primary">
                            {log.items.length} row(s) changed
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        {log.edited_by_name}
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {new Date(log.created_at).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
                        Net cost impact
                      </p>
                      <p
                        className={`font-mono text-sm font-black ${
                          log.net_diff_amount > 0
                            ? 'text-red-600'
                            : log.net_diff_amount < 0
                              ? 'text-emerald-600'
                              : 'text-foreground'
                        }`}
                      >
                        {log.net_diff_amount > 0 ? '+' : ''}
                        {inr(log.net_diff_amount)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs font-medium italic text-foreground">
                    &ldquo;{log.justification_reason}&rdquo;
                  </p>

                  {log.items && log.items.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border bg-background">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Sub activity</th>
                            <th className="px-3 py-2 text-right">Billed qty</th>
                            <th className="px-3 py-2 text-right">Bill rate</th>
                            <th className="px-3 py-2 text-right">Cost difference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-[11px]">
                          {log.items.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/20">
                              <td className="max-w-[220px] truncate px-3 py-2 font-bold text-foreground">
                                {item.sub_activity}
                                <div className="text-[10px] font-normal text-muted-foreground">
                                  {item.category_name}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {Number(item.old_qty).toLocaleString('en-IN')} →{' '}
                                <span className="font-bold text-foreground">
                                  {Number(item.new_qty).toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                ₹{Number(item.old_rate).toLocaleString('en-IN')} →{' '}
                                <span className="font-bold text-foreground">
                                  ₹{Number(item.new_rate).toLocaleString('en-IN')}
                                </span>
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-mono font-black ${
                                  Number(item.new_cost) - Number(item.old_cost) > 0
                                    ? 'text-red-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {Number(item.new_cost) - Number(item.old_cost) > 0 ? '+' : ''}
                                {inr(Number(item.new_cost) - Number(item.old_cost))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Modal>
        )}
      </div>
    </BudgetGate>
  );
}

function Modal({
  title,
  subtitle,
  icon: Icon,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle: string;
  icon: typeof History;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"
    >
      <div
        className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} my-8 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
