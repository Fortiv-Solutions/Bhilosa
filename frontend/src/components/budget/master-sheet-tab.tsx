'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — MASTER BUDGET SHEET
// File: frontend/src/components/budget/master-sheet-tab.tsx
//
// What was wrong before:
//   * handleConfirmSaveWithJustification imported saveBudgetRevisionToSupabase and
//     never called it. Every "Save Budget (v2)" was setState only — the change order
//     vanished on refresh and budget_revisions stayed empty (0 rows in production).
//   * The diff compared `categories[cIdx].items[iIdx]` by array index, so a realtime
//     refresh mid-edit produced a corrupt change log. Now keyed by row id.
//   * Cost/BUA divided by a hardcoded 615000 in five places and printed the literal
//     "6,15,000 Sqft". Now uses projects.bua_sqft from the provider.
//   * Default prop was CENTRAL_PARK_MASTER_BUDGET_CATEGORIES (3,276 lines of mock).
//   * Revision history was seeded with a fabricated 'rev-log-v1' entry.
//   * Scope filter inferred scope from which qty column was non-zero instead of the
//     scope_tag column that exists in the database.
//   * "AI Suggestions" modal displayed invented market rates as fact. Removed.
//   * No loading state, no error handling, no export.
// ============================================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileClock,
  FileSpreadsheet,
  History,
  Loader2,
  LockKeyhole,
  Pencil,
  Save,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { MasterBudgetCategory, MasterBudgetItem, ScopeTag } from '@/lib/budget';
import { SCOPE_TAG_LABELS } from '@/lib/budget';
import {
  BudgetDataError,
  downloadCsv,
  saveMasterBudgetRevision,
  toCsv,
  type MasterBudgetItemPatch,
} from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetError, BudgetGate } from './budget-states';
import ExcelImporterModal from './excel-importer-modal';

type EditMap = Record<
  string,
  { qtyRcc: number | null; qtyFinishes: number | null; qtyInfra: number | null; rate: number }
>;

function deriveQtyTotal(edit: EditMap[string], fallback: number): number {
  const sum = (edit.qtyRcc ?? 0) + (edit.qtyFinishes ?? 0) + (edit.qtyInfra ?? 0);
  return sum > 0 ? sum : fallback;
}

export default function MasterSheetTab({ permissions }: { permissions: BudgetPermissions }) {
  const {
    projectId,
    projectName,
    isPortfolio,
    categories,
    buaSqft,
    revisions,
    config,
    refresh,
    setEditing,
  } = useBudgetData();

  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | Exclude<ScopeTag, 'total'>>('all');
  // Absent key => expanded (see `?? true` at the read sites), so no seeding effect
  // is needed and switching project cannot leave categories wrongly collapsed.
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const [isEditMode, setIsEditMode] = useState(false);
  const [edits, setEdits] = useState<EditMap>({});
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [justification, setJustification] = useState('');
  const [isImporterOpen, setIsImporterOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const masterRevisions = useMemo(
    () => revisions.filter((r) => r.scope === 'master_budget' || r.scope === 'excel_import'),
    [revisions],
  );

  const currentVersion = useMemo(
    () => masterRevisions.reduce((max, r) => Math.max(max, r.version_number), 0),
    [masterRevisions],
  );

  const itemsById = useMemo(() => {
    const map = new Map<string, MasterBudgetItem>();
    for (const cat of categories) for (const item of cat.items) map.set(item.id, item);
    return map;
  }, [categories]);

  /** An item with pending edits applied. */
  const resolveItem = useCallback(
    (item: MasterBudgetItem): MasterBudgetItem => {
      const edit = edits[item.id];
      if (!edit) return item;
      const qtyTotal = deriveQtyTotal(edit, item.qtyTotal);
      const cost = Math.round(qtyTotal * edit.rate);
      return {
        ...item,
        qtyRcc: edit.qtyRcc,
        qtyFinishes: edit.qtyFinishes,
        qtyInfra: edit.qtyInfra,
        qtyTotal,
        rate: edit.rate,
        cost,
        costPerBua: buaSqft > 0 ? Number((cost / buaSqft).toFixed(2)) : 0,
      };
    },
    [edits, buaSqft],
  );

  const dirtyItemIds = useMemo(
    () =>
      Object.keys(edits).filter((id) => {
        const original = itemsById.get(id);
        if (!original) return false;
        const next = resolveItem(original);
        return (
          next.cost !== original.cost ||
          next.rate !== original.rate ||
          next.qtyTotal !== original.qtyTotal
        );
      }),
    [edits, itemsById, resolveItem],
  );

  const hasUnsavedChanges = dirtyItemIds.length > 0;

  const resolvedCategories = useMemo<MasterBudgetCategory[]>(
    () =>
      categories.map((cat) => {
        const items = cat.items.map(resolveItem);
        const totalCost = items.reduce((s, i) => s + i.cost, 0);
        return {
          ...cat,
          items,
          totalCost,
          totalCostPerBua: buaSqft > 0 ? Number((totalCost / buaSqft).toFixed(2)) : 0,
        };
      }),
    [categories, resolveItem, buaSqft],
  );

  const filteredCategories = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return resolvedCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          const matchesQuery =
            !needle ||
            item.item.toLowerCase().includes(needle) ||
            cat.categoryName.toLowerCase().includes(needle) ||
            String(item.srNo).toLowerCase().includes(needle);
          // Uses the stored scope_tag, not a guess from the qty columns.
          const matchesScope = scopeFilter === 'all' || item.scopeTag === scopeFilter;
          return matchesQuery && matchesScope;
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [resolvedCategories, searchQuery, scopeFilter]);

  const totals = useMemo(() => {
    const baseline = resolvedCategories.reduce((s, c) => s + c.totalCost, 0);
    const lineItems = resolvedCategories.reduce((s, c) => s + c.items.length, 0);
    return {
      baseline,
      lineItems,
      costPerBua: buaSqft > 0 ? Number((baseline / buaSqft).toFixed(2)) : 0,
    };
  }, [resolvedCategories, buaSqft]);

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
    setShowJustificationModal(false);
  }

  function attemptCancel() {
    if (hasUnsavedChanges) setShowDiscardModal(true);
    else discardEdits();
  }

  function handleFieldChange(
    item: MasterBudgetItem,
    field: 'qtyRcc' | 'qtyFinishes' | 'qtyInfra' | 'rate',
    raw: string,
  ) {
    setEdits((prev) => {
      const base =
        prev[item.id] ??
        {
          qtyRcc: item.qtyRcc ?? null,
          qtyFinishes: item.qtyFinishes ?? null,
          qtyInfra: item.qtyInfra ?? null,
          rate: item.rate,
        };

      const next = { ...base };
      if (field === 'rate') {
        const parsed = Number(raw);
        next.rate = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      } else {
        next[field] = raw === '' ? null : Math.max(0, Number(raw) || 0);
      }
      return { ...prev, [item.id]: next };
    });
  }

  async function handleSave() {
    if (!justification.trim()) {
      setSaveError('A change-order justification is required.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const patches: MasterBudgetItemPatch[] = dirtyItemIds.map((id) => {
        const original = itemsById.get(id)!;
        const next = resolveItem(original);
        return {
          id,
          qty_rcc: next.qtyRcc ?? null,
          qty_finishes: next.qtyFinishes ?? null,
          qty_infra: next.qtyInfra ?? null,
          qty_total: next.qtyTotal,
          estimated_rate: next.rate,
        };
      });

      const revision = await saveMasterBudgetRevision(projectId, justification, patches);

      setEdits({});
      setIsEditMode(false);
      setEditing(false);
      setShowJustificationModal(false);
      setJustification('');
      await refresh();
      setNotice(
        `Saved to Supabase as ${revision.version_label}. ${patches.length} line item(s) revised, net change ₹${Math.round(
          revision.net_diff_amount,
        ).toLocaleString('en-IN')}.`,
      );
    } catch (err) {
      setSaveError(
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Unable to save the budget revision.',
      );
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    const headers = [
      'Category', 'Category Code', 'Sr No', 'Item Description', 'Scope', 'Item Type',
      'Building RCC Qty', 'Building Finishes Qty', 'Site Infra Qty', 'Total Qty', 'Unit',
      'Estimated Rate', 'Budgeted Cost', 'Cost per BUA', 'PO Committed', 'Actual Billed',
    ];
    const body = resolvedCategories.flatMap((cat) =>
      cat.items.map((i) => [
        cat.categoryName, cat.categoryCode, i.srNo, i.item, i.scopeTag, i.itemType,
        i.qtyRcc, i.qtyFinishes, i.qtyInfra, i.qtyTotal, i.unit, i.rate, i.cost,
        i.costPerBua, i.poAmount, i.actualTotalCost,
      ]),
    );
    downloadCsv(
      `master-budget-${isPortfolio ? 'all-projects' : projectName.replace(/\s+/g, '-').toLowerCase()}-v${currentVersion}.csv`,
      toCsv(headers, body),
    );
  }

  const canEdit = permissions.canEditMasterBudget && !isPortfolio;

  return (
    <BudgetGate
      emptyTitle="No master budget for this project"
      emptyDetail={
        permissions.canImportBudget
          ? 'Import an Excel budget schedule to create the baseline.'
          : 'Ask Upper Management to import the baseline budget schedule.'
      }
      emptyAction={
        permissions.canImportBudget && !isPortfolio ? (
          <button
            type="button"
            onClick={() => setIsImporterOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> Import Excel
          </button>
        ) : undefined
      }
      loadingLabel="Loading master budget from Supabase…"
    >
      <div className="space-y-5">
        {notice && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            <div className="flex items-start gap-2 font-bold">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />
              {notice}
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {saveError && <BudgetError message={saveError} />}

        {config.budget_lock_enabled && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-300">
            <LockKeyhole className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            This project&apos;s budget is locked. Baseline edits and imports are blocked until the
            lock is lifted in Config.
          </div>
        )}

        {/* BASELINE SUMMARY */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Building2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
                  {projectName} — Master Budget
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-primary">
                  {currentVersion > 0 ? `Version v${currentVersion}` : 'Baseline'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Built-up Area:{' '}
                <strong className="text-foreground">
                  {buaSqft > 0 ? `${buaSqft.toLocaleString('en-IN')} Sqft` : 'not set'}
                </strong>{' '}
                | Categories: <strong className="text-foreground">{resolvedCategories.length}</strong>{' '}
                | Line Items: <strong className="text-foreground">{totals.lineItems}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 border-t border-border pt-3 text-xs md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Total Baseline Cost
              </p>
              <p className="font-mono text-xl font-black text-foreground">
                ₹{totals.baseline.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Cost / BUA
              </p>
              <p className="font-mono text-xl font-black text-primary">
                {buaSqft > 0 ? `₹${totals.costPerBua.toFixed(2)}` : '—'}
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
                placeholder="Search item, category or Sr No…"
                aria-label="Search master budget"
                className="h-8.5 w-72 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-muted-foreground">Scope:</span>
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}
                className="h-8.5 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none"
              >
                <option value="all">All Scope Items</option>
                {(Object.keys(SCOPE_TAG_LABELS) as Exclude<ScopeTag, 'total'>[]).map((tag) => (
                  <option key={tag} value={tag}>
                    {SCOPE_TAG_LABELS[tag]}
                  </option>
                ))}
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
              History ({masterRevisions.length})
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={!permissions.canExport || totals.lineItems === 0}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
            </button>

            {isEditMode ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={attemptCancel}
                  disabled={saving}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJustification('');
                    setSaveError(null);
                    setShowJustificationModal(true);
                  }}
                  disabled={!hasUnsavedChanges || saving}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  Save ({dirtyItemIds.length})
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={beginEdit}
                    className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs transition-colors hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Edit Mode
                  </button>
                )}
                {permissions.canImportBudget && !isPortfolio && (
                  <button
                    type="button"
                    onClick={() => setIsImporterOpen(true)}
                    className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> Import Excel
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {isPortfolio && (
          <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] font-semibold text-muted-foreground">
            Portfolio view is read-only and aggregates every project. Select a single project to
            edit or import a baseline.
          </p>
        )}

        {/* MASTER TABLE */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs whitespace-nowrap font-sans">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/90 text-[11px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  <th className="w-12 border-r border-border px-3.5 py-3 text-center">Sr No.</th>
                  <th className="min-w-[260px] border-r border-border px-4 py-3">Item Description</th>
                  <th className="border-r border-border px-3.5 py-3 text-right font-mono">RCC Qty</th>
                  <th className="border-r border-border px-3.5 py-3 text-right font-mono">Finishes Qty</th>
                  <th className="border-r border-border px-3.5 py-3 text-right font-mono">Infra Qty</th>
                  <th className="border-r border-border bg-muted/30 px-3.5 py-3 text-right font-mono font-bold text-foreground">
                    Total Qty
                  </th>
                  <th className="border-r border-border px-3 py-3 text-center">Unit</th>
                  <th className="border-r border-border px-4 py-3 text-right font-mono">Est. Rate (₹)</th>
                  <th className="border-r border-border bg-muted/40 px-4 py-3 text-right font-mono font-black text-foreground">
                    Budgeted Cost (₹)
                  </th>
                  <th className="px-4 py-3 text-right font-mono font-bold text-primary">Cost / BUA (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCategories.map((category) => {
                  const isOpen = openCategories[category.id] ?? true;
                  const catTotal = category.items.reduce((s, i) => s + i.cost, 0);
                  const catPerBua = buaSqft > 0 ? catTotal / buaSqft : 0;

                  return (
                    <React.Fragment key={category.id}>
                      <tr
                        onClick={() => toggleCategory(category.id)}
                        className="cursor-pointer bg-muted/70 align-middle font-bold text-foreground transition-colors hover:bg-muted/90"
                      >
                        <td colSpan={2} className="border-r border-border px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            <span className="text-xs font-black uppercase tracking-wide text-foreground">
                              {category.categoryName}
                            </span>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                              {category.items.length} items
                            </span>
                          </div>
                        </td>
                        <td
                          colSpan={6}
                          className="border-r border-border px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          Category Baseline Total:
                        </td>
                        <td className="border-r border-border bg-muted/60 px-4 py-2.5 text-right font-mono text-xs font-black text-foreground">
                          ₹{catTotal.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-black text-primary">
                          {buaSqft > 0 ? `₹${catPerBua.toFixed(2)}` : '—'}
                        </td>
                      </tr>

                      {isOpen &&
                        category.items.map((item) => {
                          const isDirty = dirtyItemIds.includes(item.id);
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
                              <td className="min-w-[260px] max-w-[340px] whitespace-normal break-words border-r border-border px-4 py-2 font-semibold leading-tight text-foreground">
                                {item.item}
                                <span className="ml-1.5 text-[10px] font-normal uppercase text-muted-foreground">
                                  {item.scopeTag ? SCOPE_TAG_LABELS[item.scopeTag as Exclude<ScopeTag, 'total'>] : ''}
                                </span>
                              </td>

                              <QtyCell
                                value={item.qtyRcc}
                                editable={isEditMode}
                                onChange={(v) => handleFieldChange(item, 'qtyRcc', v)}
                                ariaLabel={`Building RCC quantity for ${item.item}`}
                              />
                              <QtyCell
                                value={item.qtyFinishes}
                                editable={isEditMode}
                                onChange={(v) => handleFieldChange(item, 'qtyFinishes', v)}
                                ariaLabel={`Building finishes quantity for ${item.item}`}
                              />
                              <QtyCell
                                value={item.qtyInfra}
                                editable={isEditMode}
                                onChange={(v) => handleFieldChange(item, 'qtyInfra', v)}
                                ariaLabel={`Site infra quantity for ${item.item}`}
                              />

                              <td className="border-r border-border bg-muted/20 px-3.5 py-2 text-right font-mono font-extrabold text-foreground">
                                {item.qtyTotal.toLocaleString('en-IN')}
                              </td>
                              <td className="border-r border-border px-3 py-2 text-center font-medium text-muted-foreground">
                                {item.unit || 'LS'}
                              </td>

                              <td className="border-r border-border px-4 py-2 text-right font-mono font-semibold text-foreground">
                                {isEditMode ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={item.rate}
                                    onChange={(e) => handleFieldChange(item, 'rate', e.target.value)}
                                    aria-label={`Estimated rate for ${item.item}`}
                                    className="h-7 w-24 rounded border border-primary/40 bg-card px-1.5 text-right font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                                  />
                                ) : (
                                  item.rate.toLocaleString('en-IN')
                                )}
                              </td>

                              <td className="border-r border-border bg-muted/30 px-4 py-2 text-right font-mono font-black text-foreground">
                                {Math.round(item.cost).toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-primary">
                                {buaSqft > 0 ? `₹${(item.costPerBua ?? 0).toFixed(2)}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}

                <tr className="border-t-2 border-border bg-slate-900 align-middle text-xs font-black text-slate-100">
                  <td
                    colSpan={2}
                    className="border-r border-slate-700 px-4 py-3.5 text-sm font-black uppercase tracking-widest text-amber-400"
                  >
                    Project Total Baseline Cost
                  </td>
                  <td
                    colSpan={6}
                    className="border-r border-slate-700 px-4 py-3.5 text-right font-mono text-xs font-extrabold uppercase tracking-wider text-slate-300"
                  >
                    Grand Total Baseline:
                  </td>
                  <td className="border-r border-slate-700 bg-slate-950 px-4 py-3.5 text-right font-mono text-sm font-black text-amber-300">
                    ₹{totals.baseline.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-sm font-black text-emerald-400">
                    {buaSqft > 0 ? `₹${totals.costPerBua.toFixed(2)}` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {filteredCategories.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs font-semibold text-muted-foreground">
            No line items match the current search or scope filter.
          </p>
        )}

        {/* IMPORTER — mounted only while open so its wizard state resets cleanly
            and its hooks always run in the same order. */}
        {isImporterOpen && !isPortfolio && (
          <ExcelImporterModal
            projectId={projectId}
            existingCategories={categories}
            onClose={() => setIsImporterOpen(false)}
            onImported={async (result) => {
              await refresh();
              setNotice(
                `Excel import v${result.version_number} saved to Supabase: ${result.inserted} added, ${result.updated} updated${
                  result.archived ? `, ${result.archived} archived` : ''
                }. New baseline ₹${Math.round(result.new_total).toLocaleString('en-IN')}.`,
              );
            }}
          />
        )}

        {/* JUSTIFICATION MODAL */}
        {showJustificationModal && (
          <Modal
            title="Change Order / Revision Justification"
            subtitle={`Mandatory audit justification for baseline version v${currentVersion + 1}`}
            icon={FileClock}
            onClose={() => setShowJustificationModal(false)}
          >
            <div className="space-y-3">
              <p className="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] font-semibold text-muted-foreground">
                {dirtyItemIds.length} line item(s) will be revised. This writes a permanent entry to
                budget_revisions and cascades to allocations and the variance sheet.
              </p>
              <label className="block space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                  Change order reason <span className="text-red-500">*</span>
                </span>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="e.g. Steel market price hike +12% and additional RCC Slab 13 scope approved by the Board."
                  className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              {saveError && <BudgetError message={saveError} />}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowJustificationModal(false)}
                disabled={saving}
                className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Back to editing
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !justification.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? 'Saving to Supabase…' : `Save & log v${currentVersion + 1}`}
              </button>
            </div>
          </Modal>
        )}

        {/* DISCARD MODAL */}
        {showDiscardModal && (
          <Modal
            title="Unsaved budget changes"
            subtitle={`${dirtyItemIds.length} line item(s) have been modified.`}
            icon={AlertTriangle}
            onClose={() => setShowDiscardModal(false)}
          >
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDiscardModal(false);
                  setJustification('');
                  setShowJustificationModal(true);
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

        {/* REVISION HISTORY */}
        {showHistoryModal && (
          <Modal
            title="Master Budget version audit history"
            subtitle="Every change order recorded in budget_revisions"
            icon={History}
            wide
            onClose={() => setShowHistoryModal(false)}
          >
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {masterRevisions.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs font-semibold text-muted-foreground">
                  No revisions recorded yet. The first change order or Excel import will appear here.
                </p>
              )}

              {masterRevisions.map((log) => (
                <div key={log.id} className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-foreground">{log.version_label}</span>
                        {log.items && log.items.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold text-primary">
                            {log.items.length} line item(s) revised
                          </span>
                        )}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                          {log.scope.replace(/_/g, ' ')}
                        </span>
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
                        Baseline cost shift
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
                        {log.net_diff_amount > 0 ? '+' : ''}₹
                        {Math.round(log.net_diff_amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      Justification
                    </p>
                    <p className="mt-1 text-xs font-semibold text-foreground">
                      &ldquo;{log.justification_reason}&rdquo;
                    </p>
                  </div>

                  {log.items && log.items.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border bg-background">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Category &amp; sub activity</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Cost difference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-[11px]">
                          {log.items.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-bold text-foreground">
                                <div>{item.sub_activity}</div>
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
                                {Number(item.new_cost) - Number(item.old_cost) > 0 ? '+' : ''}₹
                                {Math.round(
                                  Number(item.new_cost) - Number(item.old_cost),
                                ).toLocaleString('en-IN')}
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

// ----------------------------------------------------------------------------
// Presentational helpers
// ----------------------------------------------------------------------------

function QtyCell({
  value,
  editable,
  onChange,
  ariaLabel,
}: {
  value: number | null | undefined;
  editable: boolean;
  onChange: (raw: string) => void;
  ariaLabel: string;
}) {
  return (
    <td className="border-r border-border px-3.5 py-2 text-right font-mono text-muted-foreground">
      {editable ? (
        <input
          type="number"
          min={0}
          step="0.01"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className="h-7 w-20 rounded border border-primary/40 bg-card px-1.5 text-right font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
        />
      ) : value ? (
        value.toLocaleString('en-IN')
      ) : (
        '—'
      )}
    </td>
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
