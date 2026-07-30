'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — MASTER BUDGET EXCEL IMPORTER
// File: frontend/src/components/budget/excel-importer-modal.tsx
//
// What was wrong before:
//   * syncWithBackend() built a `payload` object, never sent it anywhere, and wrote
//     the parsed rows to localStorage under a comment reading
//     "// Simulate/Trigger Backend API Persistence Call".
//   * Meanwhile the UI promised "Syncs directly to Supabase DB", "Creates Audit
//     Snapshot in Backend", and reported "Successfully imported & synced N budget
//     line items to Backend DB!". None of it was true.
//   * projectId defaulted to the string 'CP-PAL-001' — not even a UUID — and the
//     Master Sheet never passed a real one.
//   * cost_per_bua was computed against a hardcoded 615000 divisor.
//
// Now: parses the workbook client-side, previews what will change, then commits via
// rpc_import_master_budget in a single database transaction which also writes the
// revision audit trail. cost_per_bua is derived server-side from projects.bua_sqft.
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  Database,
  FileSpreadsheet,
  GitPullRequest,
  Layers,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { MasterBudgetCategory } from '@/lib/budget';
import {
  BudgetDataError,
  importMasterBudget,
  type MasterBudgetImportItem,
  type MasterBudgetImportResult,
} from '@/lib/supabase-budget';

interface ExcelImporterModalProps {
  onClose: () => void;
  /** Fires after a successful, committed import. */
  onImported: (result: MasterBudgetImportResult) => void | Promise<void>;
  /** Real project UUID — required; there is no fallback. */
  projectId: string;
  existingCategories?: MasterBudgetCategory[];
}

type ImportMode = 'merge' | 'replace';

/**
 * Rendered only while open — the PARENT controls mounting
 * (`{isOpen && <ExcelImporterModal … />}`).
 *
 * This is deliberate: an `isOpen` prop with an early `return null` above the hooks
 * below would change the hook count between renders and throw "Rendered more hooks
 * than during the previous render". Mounting on demand also resets all the wizard
 * state for free, with no synchronising effect.
 */
export default function ExcelImporterModal({
  onClose,
  onImported,
  projectId,
  existingCategories = [],
}: ExcelImporterModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetName, setActiveSheetName] = useState('');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [parsedItems, setParsedItems] = useState<MasterBudgetImportItem[]>([]);

  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [result, setResult] = useState<MasterBudgetImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const existingItems = useMemo(
    () => existingCategories.flatMap((c) => c.items),
    [existingCategories],
  );

  /** Active lines absent from the uploaded sheet (matched on category + description). */
  const missingItems = useMemo(() => {
    if (parsedItems.length === 0) return [];
    const incoming = new Set(
      parsedItems.map(
        (i) => `${i.category_name.trim().toLowerCase()}|${i.item_description.trim().toLowerCase()}`,
      ),
    );
    return existingItems.filter(
      (e) => !incoming.has(`${e.category.trim().toLowerCase()}|${e.item.trim().toLowerCase()}`),
    );
  }, [parsedItems, existingItems]);

  const parsedTotal = useMemo(
    () => parsedItems.reduce((sum, i) => sum + i.budgeted_cost, 0),
    [parsedItems],
  );

  function parseWorksheet(ws: XLSX.WorkSheet): MasterBudgetImportItem[] {
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const items: MasterBudgetImportItem[] = [];
    let currentCategory = 'Uncategorised';
    let srCounter = 1;

    const numeric = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    for (const row of matrix) {
      if (!row || row.length === 0) continue;

      const colB = row[1]; // Sr No, or a category header
      const colC = row[2]; // Item description
      const colD = row[3]; // Building RCC qty
      const colE = row[4]; // Building finishes qty
      const colF = row[5]; // Site infra qty
      const colG = row[6]; // Total qty
      const colH = row[7]; // Unit
      const colI = row[8]; // Estimated rate
      const colJ = row[9]; // Budgeted cost

      // Category header: text in col B with no description in col C.
      if (
        typeof colB === 'string' &&
        (!colC || String(colC).trim() === '') &&
        !colB.startsWith('Sr') &&
        colB.trim().toUpperCase() !== 'TOTAL' &&
        colB.trim().length > 0
      ) {
        currentCategory = colB.trim();
        continue;
      }

      const hasSr =
        colB !== undefined &&
        (typeof colB === 'number' ||
          (typeof colB === 'string' && colB.trim().length > 0 && !Number.isNaN(Number(colB.trim()))));
      const hasDescription = colC !== undefined && String(colC).trim().length > 0;
      if (!hasSr && !hasDescription) continue;

      const description = hasDescription ? String(colC).trim() : '';
      if (!description) continue;
      const lower = description.toLowerCase();
      if (lower.includes('total') || lower.includes('category baseline')) continue;

      const qtyRcc = numeric(colD);
      const qtyFinishes = numeric(colE);
      const qtyInfra = numeric(colF);
      const derived = (qtyRcc ?? 0) + (qtyFinishes ?? 0) + (qtyInfra ?? 0);
      const qtyTotal = numeric(colG) ?? (derived > 0 ? derived : 1);
      const rate = numeric(colI) ?? 0;
      const cost = numeric(colJ) ?? Math.round(qtyTotal * rate);

      items.push({
        category_name: currentCategory,
        category_code: currentCategory
          .replace(/[^A-Za-z0-9 ]/g, '')
          .split(/\s+/)
          .slice(0, 2)
          .join('_')
          .toUpperCase()
          .slice(0, 24) || null,
        sr_no: hasSr ? String(colB).trim() : String(srCounter),
        item_description: description,
        qty_rcc: qtyRcc,
        qty_finishes: qtyFinishes,
        qty_infra: qtyInfra,
        qty_total: qtyTotal,
        unit: colH !== undefined ? String(colH).trim() || 'LS' : 'LS',
        estimated_rate: rate,
        budgeted_cost: cost,
        // cost_per_bua is derived server-side from projects.bua_sqft.
        scope_tag: qtyRcc ? 'building_rcc' : qtyFinishes ? 'building_finishes' : 'site_infra',
        item_type: /labour|work/i.test(description) ? 'labour' : 'material',
      });
      srCounter += 1;
    }

    return items;
  }

  async function handleFileSelect(file: File) {
    setError(null);
    setResult(null);
    setSelectedFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);

      const target = wb.SheetNames.includes('Master Sheet') ? 'Master Sheet' : wb.SheetNames[0];
      setActiveSheetName(target);

      const items = parseWorksheet(wb.Sheets[target]);
      if (items.length === 0) {
        setError(
          `No budget line items found in "${target}". Expected columns: B=Sr No, C=Description, D/E/F=Quantities, G=Total Qty, H=Unit, I=Rate, J=Cost.`,
        );
        setParsedItems([]);
      } else {
        setParsedItems(items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the Excel file.');
      setParsedItems([]);
    } finally {
      setIsParsing(false);
    }
  }

  function handleSheetChange(sheetName: string) {
    if (!workbook) return;
    setActiveSheetName(sheetName);
    setError(null);
    const items = parseWorksheet(workbook.Sheets[sheetName]);
    setParsedItems(items);
    if (items.length === 0) setError(`No budget line items found in "${sheetName}".`);
  }

  function handleContinue() {
    setError(null);
    if (parsedItems.length === 0) {
      setError('Upload a valid Excel budget schedule first.');
      return;
    }
    setStep(2);
  }

  async function handleCommit() {
    setIsCommitting(true);
    setError(null);
    try {
      const importResult = await importMasterBudget(
        projectId,
        justification.trim() ||
          `Master budget schedule imported from ${selectedFile?.name ?? 'Excel'} (${activeSheetName})`,
        parsedItems,
        importMode === 'replace',
      );
      setResult(importResult);
      await onImported(importResult);
      // Give the user a moment to read the confirmation before closing.
      setTimeout(() => {
        resetAndClose();
      }, 1600);
    } catch (err) {
      setError(
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Import failed. Nothing was saved.',
      );
    } finally {
      setIsCommitting(false);
    }
  }

  function resetAndClose() {
    onClose();
    setStep(1);
    setSelectedFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setParsedItems([]);
    setJustification('');
    setResult(null);
    setError(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import master budget from Excel"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm"
    >
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Import Master Budget Schedule
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-primary">
                  Step {step} of 2
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Parses .xlsx / .xls / .csv, then commits to Supabase in one transaction
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={isCommitting}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div className="mt-5 space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) void handleFileSelect(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                dragOver
                  ? 'scale-[1.01] border-primary bg-primary/10'
                  : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  if (e.target.files?.[0]) void handleFileSelect(e.target.files[0]);
                }}
                className="hidden"
              />

              {isParsing ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                  <p className="text-xs font-bold text-foreground">Parsing worksheet…</p>
                </div>
              ) : selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/40">
                    <FileSpreadsheet className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">{selectedFile.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB · {parsedItems.length} line items
                      recognised · ₹{Math.round(parsedTotal).toLocaleString('en-IN')}
                    </p>
                  </div>

                  {sheetNames.length > 1 && (
                    <div
                      className="mt-3 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs font-bold text-muted-foreground">Worksheet:</span>
                      <select
                        value={activeSheetName}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none"
                      >
                        {sheetNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-3 text-primary">
                    <Upload className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      Drag and drop your Excel budget schedule
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Columns: B=Sr No · C=Description · D/E/F=RCC/Finishes/Infra Qty · G=Total Qty ·
                      H=Unit · I=Rate · J=Cost
                    </p>
                  </div>
                  <span className="mt-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground shadow-2xs">
                    Browse file
                  </span>
                </div>
              )}
            </div>

            {error && <ErrorNote message={error} />}

            {/* PREVIEW */}
            {parsedItems.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                    Preview — first 8 of {parsedItems.length}
                  </p>
                  <p className="font-mono text-[11px] font-bold text-foreground">
                    Total ₹{Math.round(parsedTotal).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="max-h-52 overflow-auto">
                  <table className="w-full text-left text-[11px] whitespace-nowrap">
                    <thead className="bg-muted/30 text-[10px] font-bold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2.5 py-1.5">Category</th>
                        <th className="px-2.5 py-1.5">Sr</th>
                        <th className="px-2.5 py-1.5">Description</th>
                        <th className="px-2.5 py-1.5 text-right">Qty</th>
                        <th className="px-2.5 py-1.5">Unit</th>
                        <th className="px-2.5 py-1.5 text-right">Rate</th>
                        <th className="px-2.5 py-1.5 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedItems.slice(0, 8).map((item, idx) => (
                        <tr key={`${item.category_name}-${item.sr_no}-${idx}`}>
                          <td className="max-w-[140px] truncate px-2.5 py-1.5 text-muted-foreground">
                            {item.category_name}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">{item.sr_no}</td>
                          <td className="max-w-[220px] truncate px-2.5 py-1.5 font-semibold text-foreground">
                            {item.item_description}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono">
                            {item.qty_total.toLocaleString('en-IN')}
                          </td>
                          <td className="px-2.5 py-1.5">{item.unit}</td>
                          <td className="px-2.5 py-1.5 text-right font-mono">
                            {item.estimated_rate.toLocaleString('en-IN')}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono font-bold">
                            {Math.round(item.budgeted_cost).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={resetAndClose}
                className="h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={parsedItems.length === 0 || isParsing}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                Review &amp; commit
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: MODE + COMMIT */}
        {step === 2 && (
          <div className="mt-5 space-y-4">
            {result ? (
              <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/25">
                <p className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  Committed to Supabase as Excel Import v{result.version_number}
                </p>
                <ul className="ml-7 list-disc space-y-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                  <li>{result.inserted} line item(s) added</li>
                  <li>{result.updated} line item(s) updated</li>
                  {result.archived > 0 && <li>{result.archived} line item(s) archived</li>}
                  <li>
                    Baseline ₹{Math.round(result.old_total).toLocaleString('en-IN')} → ₹
                    {Math.round(result.new_total).toLocaleString('en-IN')}
                  </li>
                </ul>
              </div>
            ) : (
              <>
                {/* MODE */}
                <fieldset className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <legend className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Import mode
                  </legend>

                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                      importMode === 'merge'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="import_mode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="text-xs">
                      <p className="flex items-center gap-1.5 font-bold text-foreground">
                        <Layers className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        Merge &amp; update (recommended)
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                        Updates quantities and rates on matching lines, adds new ones, and leaves
                        line items absent from the sheet untouched.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all ${
                      importMode === 'replace'
                        ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-500 dark:bg-amber-950/25'
                        : 'border-border bg-card hover:border-amber-500/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="import_mode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 accent-amber-600"
                    />
                    <div className="text-xs">
                      <p className="flex items-center gap-1.5 font-bold text-foreground">
                        <GitPullRequest className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                        Replace baseline (archive missing lines)
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                        Treats the sheet as the complete schedule and archives any active line item
                        it does not contain. Archived lines are marked inactive, never deleted.
                      </p>
                    </div>
                  </label>
                </fieldset>

                {/* MISSING ITEMS WARNING */}
                {importMode === 'replace' && missingItems.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
                    <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
                      <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
                      {missingItems.length} existing line item(s) will be archived
                    </p>
                    <div className="max-h-40 divide-y divide-amber-200/60 overflow-y-auto rounded-lg border border-amber-200 bg-card dark:divide-amber-900/30 dark:border-amber-900/30">
                      {missingItems.slice(0, 40).map((item) => (
                        <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                          <span className="truncate pr-3 font-semibold text-foreground">
                            {item.item}
                          </span>
                          <span className="whitespace-nowrap font-mono text-muted-foreground">
                            ₹{Math.round(item.cost).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                      {missingItems.length > 40 && (
                        <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                          …and {missingItems.length - 40} more
                        </p>
                      )}
                    </div>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-400">
                      <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      Switch to Merge mode to keep them active.
                    </p>
                  </div>
                )}

                {/* SUMMARY */}
                <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/20 p-4 text-xs sm:grid-cols-4">
                  <SummaryStat label="Line items" value={parsedItems.length.toLocaleString('en-IN')} />
                  <SummaryStat
                    label="Categories"
                    value={new Set(parsedItems.map((i) => i.category_name)).size.toLocaleString('en-IN')}
                  />
                  <SummaryStat
                    label="Sheet total"
                    value={`₹${Math.round(parsedTotal).toLocaleString('en-IN')}`}
                  />
                  <SummaryStat
                    label="To be archived"
                    value={importMode === 'replace' ? String(missingItems.length) : '0'}
                  />
                </dl>

                <label className="block space-y-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    Import justification (recorded in the audit trail)
                  </span>
                  <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder={`e.g. Revised baseline schedule approved by the Board, imported from ${selectedFile?.name ?? 'Excel'}.`}
                    className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>

                {error && <ErrorNote message={error} />}

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={isCommitting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Back to upload
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCommit()}
                    disabled={isCommitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isCommitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Database className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isCommitting ? 'Committing to Supabase…' : 'Commit to Supabase'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/25 dark:text-red-300"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="break-words">{message}</span>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm font-black text-foreground">{value}</dd>
    </div>
  );
}
