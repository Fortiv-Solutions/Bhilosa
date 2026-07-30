'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — BILL-WISE CONSTRUCTION LEDGER
// File: frontend/src/components/budget/bill-wise-ledger-tab.tsx
//
// Fully rebuilt on live Supabase data (budget_bill_ledger_view), project-wise.
//
// What was wrong before:
//   * SAMPLE_BILL_WISE_LEDGER_ROWS — three hardcoded bills (UltraTech / Keller /
//     Shree Ram) held as initial state. budget_ledger is empty, so `data.length > 0`
//     was never true and those three fake rows were what every user saw.
//   * The mapper read columns that do not exist on budget_ledger (category_name,
//     vendor_name, gross_bill_amount, retention_deduction, net_payable_amount,
//     payment_status...). Even with data, every field fell back to a literal.
//   * runningAvailableBudget was `1453638820 - net` — the project total hardcoded.
//   * Add / Delete / Save were pure React state. Nothing was ever written, yet the
//     UI announced "saved to Backend Database!".
//   * The component took no props and was pinned to CENTRAL_PARK_PROJECT_ID, so
//     the page's project selector did not filter it.
//   * "Import Excel" opened the master-budget importer and alerted a false
//     "synced to Backend Database successfully!".
//
// Now: reads the project-scoped view, filters server-side, persists the genuinely
// editable settlement fields to vendor_bills, and exports CSV.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';
import {
  BudgetDataError,
  downloadCsv,
  fetchBillLedger,
  toCsv,
  updateBillLedgerEntry,
  type BillLedgerFilters,
  type BillLedgerRow,
} from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetAuthRequired, BudgetEmpty, BudgetError, BudgetLoading } from './budget-states';

/** Fields a user may actually change on a bill from the ledger. */
interface LedgerEdit {
  retention_percent?: number;
  retention_amount?: number;
  advance_adjusted?: number;
  other_deductions?: number;
  ledger_remarks?: string;
  payment_status?: string;
}

const PAYMENT_STATUSES = ['pending', 'approved', 'paid', 'failed', 'cancelled'] as const;
const PAGE_STEP = 100;

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function dmy(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB');
}

function statusPill(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'approved':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    default:
      return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300';
  }
}

export default function BillWiseLedgerTab({ permissions }: { permissions: BudgetPermissions }) {
  const { projectId, isPortfolio, categories, realtimeTick, needsAuth, setEditing } = useBudgetData();

  const [rows, setRows] = useState<BillLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  // Filters are applied by Postgres, not in the browser.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('All');
  const [categoryId, setCategoryId] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [isEditMode, setIsEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, LedgerEdit>>({});

  // Debounce the search box so typing does not fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters: BillLedgerFilters = useMemo(
    () => ({
      search: search || undefined,
      paymentStatus,
      categoryId,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    [search, paymentStatus, categoryId, fromDate, toDate],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBillLedger(projectId, filters);
      setRows(data);
      setError(null);
    } catch (err) {
      const message =
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Unexpected error loading the bill ledger.';
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, filters]);

  useEffect(() => {
    if (needsAuth) {
      setLoading(false);
      return;
    }
    // Do not reload underneath someone who is mid-edit.
    if (isEditMode) return;
    void load();
  }, [load, needsAuth, realtimeTick, isEditMode]);

  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [projectId, search, paymentStatus, categoryId, fromDate, toDate]);

  const hasEdits = Object.keys(edits).length > 0;

  function beginEdit() {
    setIsEditMode(true);
    setEditing(true);
  }

  function cancelEdit() {
    setIsEditMode(false);
    setEditing(false);
    setEdits({});
  }

  function patchRow(row: BillLedgerRow, field: keyof LedgerEdit, rawValue: string) {
    setEdits((prev) => {
      const current: LedgerEdit = { ...(prev[row.bill_id] ?? {}) };

      if (field === 'ledger_remarks' || field === 'payment_status') {
        current[field] = rawValue;
      } else {
        const parsed = Number(rawValue);
        current[field] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }

      // Keep retention_amount and retention_percent mutually consistent so the
      // preview matches what the database trigger will recompute.
      if (field === 'retention_percent') {
        const pct = current.retention_percent ?? 0;
        current.retention_amount = Math.round((row.bill_item_amt * pct) / 100);
      }
      if (field === 'retention_amount' && row.bill_item_amt > 0) {
        const amt = current.retention_amount ?? 0;
        current.retention_percent = Number(((amt / row.bill_item_amt) * 100).toFixed(2));
      }

      return { ...prev, [row.bill_id]: current };
    });
  }

  /** Row with pending edits applied, so totals and previews stay truthful. */
  const withEdits = useCallback(
    (row: BillLedgerRow): BillLedgerRow => {
      const edit = edits[row.bill_id];
      if (!edit) return row;

      const retention = edit.retention_amount ?? row.retention_deduction;
      const advance = edit.advance_adjusted ?? row.advance_payment;
      const other = edit.other_deductions ?? 0;
      const finalAmount = Math.max(0, row.gross_bill_amount - retention - advance - other);

      return {
        ...row,
        retention_percent: edit.retention_percent ?? row.retention_percent,
        retention_deduction: retention,
        advance_payment: advance,
        final_bill_amount: finalAmount,
        expected_payment: Math.max(0, finalAmount - row.jv_payment),
        remarks: edit.ledger_remarks ?? row.remarks,
        payment_status: edit.payment_status ?? row.payment_status,
      };
    },
    [edits],
  );

  const displayRows = useMemo(() => rows.map(withEdits), [rows, withEdits]);
  const visibleRows = useMemo(() => displayRows.slice(0, visibleCount), [displayRows, visibleCount]);

  const kpis = useMemo(() => {
    const gross = displayRows.reduce((s, r) => s + r.gross_bill_amount, 0);
    const net = displayRows.reduce((s, r) => s + r.final_bill_amount, 0);
    const retention = displayRows.reduce((s, r) => s + r.retention_deduction, 0);
    const advances = displayRows.reduce((s, r) => s + r.advance_payment, 0);
    const paid = displayRows.reduce((s, r) => s + r.jv_payment, 0);
    const outstanding = displayRows.reduce((s, r) => s + r.expected_payment, 0);
    const billCount = new Set(displayRows.map((r) => r.bill_id)).size;
    return { gross, net, retention, advances, paid, outstanding, billCount };
  }, [displayRows]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(edits);
      const results = await Promise.allSettled(
        entries.map(([billId, patch]) => updateBillLedgerEntry(billId, patch)),
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        const first = failures[0] as PromiseRejectedResult;
        throw new Error(
          `${failures.length} of ${entries.length} bill(s) failed to save. First error: ${
            first.reason instanceof Error ? first.reason.message : String(first.reason)
          }`,
        );
      }

      setEdits({});
      setIsEditMode(false);
      setEditing(false);
      // Re-read so the displayed net payable is the database's value, not ours.
      await load();
      setSavedMessage(`${entries.length} bill(s) updated in Supabase.`);
      setTimeout(() => setSavedMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save ledger changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    const headers = [
      'Project', 'Head Activity', 'Sub Activity', 'Cost Code', 'Item Group', 'Item Description',
      'Unit', 'Supplier', 'Supplier GST', 'Accounting Date', 'Bill Date', 'Bill No (ERP)',
      'Bill No (Supplier)', 'Received Qty', 'Bill Rate', 'Bill Item Amount', 'GST %',
      'Retention %', 'Retention Amount', 'Gross Bill Amount', 'Net Payable', 'Advance Adjusted',
      'Paid To Date', 'Outstanding', 'Bill Status', 'Payment Status', 'Match Status',
      'PO/WO No', 'PO Rate', 'PO Terms', 'PR No', 'GRN No', 'Running Available Budget', 'Remarks',
    ];
    const body = displayRows.map((r) => [
      r.project_name, r.head_activity, r.sub_activity_ledger, r.cost_code, r.item_group,
      r.item_desc, r.unit, r.supplier_name, r.supplier_gst, dmy(r.accounting_date),
      dmy(r.bill_date_of_supplier), r.bill_no, r.bill_no_of_supplier, r.received_qty,
      r.final_bill_rate, r.bill_item_amt, r.gst_rate, r.retention_percent, r.retention_deduction,
      r.gross_bill_amount, r.final_bill_amount, r.advance_payment, r.jv_payment,
      r.expected_payment, r.bill_status, r.payment_status, r.match_status, r.po_wo_no,
      r.po_wo_rate, r.note_on_po, r.pr_no, r.grn_no, r.running_available_budget, r.remarks,
    ]);
    downloadCsv(
      `bill-wise-ledger-${isPortfolio ? 'all-projects' : displayRows[0]?.project_code ?? 'project'}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(headers, body),
    );
  }

  if (needsAuth) return <BudgetAuthRequired />;

  return (
    <div className="space-y-5 font-sans">
      {/* KPI SUMMARY — derived from the rows actually on screen */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Gross Billed (incl. GST)"
          value={inr(kpis.gross)}
          detail={`${kpis.billCount} bill(s) · ${displayRows.length} line(s)`}
        />
        <KpiCard
          label="Retention Held"
          value={inr(kpis.retention)}
          detail="Security retained for DLP"
          tone="amber"
        />
        <KpiCard
          label="Paid To Date"
          value={inr(kpis.paid)}
          detail="Settled via payments ledger"
          tone="emerald"
        />
        <KpiCard
          label="Outstanding Payable"
          value={inr(kpis.outstanding)}
          detail="Net payable less payments made"
          tone="primary"
        />
      </div>

      {savedMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />
          {savedMessage}
        </div>
      )}

      {error && <BudgetError message={error} onRetry={() => void load()} retrying={loading} />}

      {/* FILTERS + ACTIONS */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Supplier, bill no, PO, PR, cost code…"
              aria-label="Search ledger"
              className="h-8.5 w-72 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <FilterSelect
            label="Payment"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={[
              { value: 'All', label: 'All statuses' },
              ...PAYMENT_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />

          <FilterSelect
            label="Budget Head"
            value={categoryId}
            onChange={setCategoryId}
            options={[
              { value: 'All', label: 'All budget heads' },
              ...categories.map((c) => ({ value: c.id, label: c.categoryName })),
            ]}
          />

          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground">
            Bill from
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8.5 rounded-lg border border-border bg-card px-2 text-xs font-semibold outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground">
            Bill to
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8.5 rounded-lg border border-border bg-card px-2 text-xs font-semibold outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={!permissions.canExport || displayRows.length === 0}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
          </button>

          {permissions.canEditLedger &&
            (isEditMode ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground shadow-2xs hover:bg-muted disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !hasEdits}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {saving
                    ? 'Saving…'
                    : `Save ${Object.keys(edits).length || ''} bill${Object.keys(edits).length === 1 ? '' : 's'}`}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={beginEdit}
                disabled={displayRows.length === 0}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Edit Settlement
              </button>
            ))}
        </div>
      </div>

      {isEditMode && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/25 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" aria-hidden="true" />
          <p>
            Editable fields are <strong>retention</strong>, <strong>advance adjusted</strong>,{' '}
            <strong>other deductions</strong>, <strong>payment status</strong> and{' '}
            <strong>ledger remarks</strong>. Quantities, rates and GST come from the vendor bill
            lines raised in Billing and are read-only here. Net payable is recomputed by the
            database on save.
          </p>
        </div>
      )}

      {/* LEDGER TABLE */}
      {loading ? (
        <BudgetLoading label="Loading bill-wise ledger from Supabase…" />
      ) : displayRows.length === 0 ? (
        <BudgetEmpty
          title="No bills match this view"
          detail={
            search || paymentStatus !== 'All' || categoryId !== 'All' || fromDate || toDate
              ? 'No vendor bills match the current filters. Clear them to see everything for this project.'
              : 'No vendor bills have been raised against this project yet. Bills appear here automatically once they are created in the Billing module.'
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full border-collapse text-left text-xs whitespace-nowrap font-sans">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-muted/90 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {isPortfolio && <th className="border-r border-border px-3 py-2">Project</th>}
                    <th colSpan={6} className="border-r border-border bg-slate-200/70 px-3 py-2 text-center text-slate-900 dark:bg-slate-800/70 dark:text-slate-100">
                      Identity &amp; Budget Head
                    </th>
                    <th colSpan={5} className="border-r border-border bg-blue-100/70 px-3 py-2 text-center text-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
                      Supplier &amp; Bill Audit
                    </th>
                    <th colSpan={7} className="border-r border-border bg-emerald-100 px-3 py-2 text-center text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Billed Lines &amp; Taxes
                    </th>
                    <th colSpan={5} className="border-r border-border bg-purple-100/70 px-3 py-2 text-center text-purple-900 dark:bg-purple-950/60 dark:text-purple-300">
                      Payment Settlement
                    </th>
                    <th colSpan={6} className="bg-amber-100/70 px-3 py-2 text-center text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                      Traceability &amp; Remaining Budget
                    </th>
                  </tr>
                  <tr className="border-b border-border bg-muted/70 text-[11px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                    {isPortfolio && <th className="border-r border-border px-3 py-2.5">Project</th>}
                    <Th>Head Activity</Th>
                    <Th>Sub Activity</Th>
                    <Th className="text-center text-primary">Cost Code</Th>
                    <Th>Item Group</Th>
                    <Th>Item Description</Th>
                    <Th className="text-center">Unit</Th>

                    <Th>Supplier</Th>
                    <Th className="text-center">Accounting Date</Th>
                    <Th className="text-center">Bill Date</Th>
                    <Th>Bill No (ERP)</Th>
                    <Th>Bill No (Supplier)</Th>

                    <Th className="text-right">Received Qty</Th>
                    <Th className="text-right">Bill Rate</Th>
                    <Th className="text-right">Bill Item Amt</Th>
                    <Th className="text-center">GST %</Th>
                    <Th className="text-right text-amber-700">Retention %</Th>
                    <Th className="text-right text-amber-700">Retention Amt</Th>
                    <Th className="text-right text-emerald-800">Net Payable</Th>

                    <Th className="text-right">Advance Adj.</Th>
                    <Th className="text-right">Other Ded.</Th>
                    <Th className="text-right">Paid To Date</Th>
                    <Th className="text-right text-primary">Outstanding</Th>
                    <Th className="text-center">Payment Status</Th>

                    <Th>PO / WO No</Th>
                    <Th className="text-right">PO Rate</Th>
                    <Th>PR No</Th>
                    <Th>GRN No</Th>
                    <Th className="text-right text-emerald-800">Running Available</Th>
                    <Th>Remarks</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleRows.map((row) => {
                    const edit = edits[row.bill_id];
                    const isDirty = Boolean(edit);
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-muted/30 ${isDirty ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}
                      >
                        {isPortfolio && (
                          <Td className="border-r border-border font-semibold">{row.project_name}</Td>
                        )}
                        <Td className="font-bold text-foreground">{row.head_activity}</Td>
                        <Td className="font-semibold">{row.sub_activity_ledger}</Td>
                        <Td className="text-center font-mono font-black text-primary">{row.cost_code}</Td>
                        <Td>{row.item_group}</Td>
                        <Td className="max-w-[280px] whitespace-normal break-words">{row.item_desc}</Td>
                        <Td className="text-center">{row.unit}</Td>

                        <Td className="font-bold text-foreground" title={row.supplier_gst ?? undefined}>
                          {row.supplier_name}
                        </Td>
                        <Td className="text-center font-mono">{dmy(row.accounting_date)}</Td>
                        <Td className="text-center font-mono">{dmy(row.bill_date_of_supplier)}</Td>
                        <Td className="font-mono font-bold">{row.bill_no ?? '—'}</Td>
                        <Td className="font-mono">{row.bill_no_of_supplier ?? '—'}</Td>

                        <Td className="text-right font-mono">{row.received_qty.toLocaleString('en-IN')}</Td>
                        <Td className="text-right font-mono">{inr(row.final_bill_rate)}</Td>
                        <Td className="text-right font-mono font-bold">{inr(row.bill_item_amt)}</Td>
                        <Td className="text-center font-mono">{row.gst_rate}%</Td>

                        <Td className="bg-amber-50/20 text-right font-mono">
                          {isEditMode ? (
                            <NumberInput
                              value={row.retention_percent}
                              onChange={(v) => patchRow(row, 'retention_percent', v)}
                              max={100}
                              className="w-16 border-amber-400"
                              ariaLabel={`Retention percent for bill ${row.bill_no ?? row.bill_id}`}
                            />
                          ) : (
                            `${row.retention_percent}%`
                          )}
                        </Td>
                        <Td className="bg-amber-50/20 text-right font-mono">
                          {isEditMode ? (
                            <NumberInput
                              value={row.retention_deduction}
                              onChange={(v) => patchRow(row, 'retention_amount', v)}
                              className="w-24 border-amber-400"
                              ariaLabel={`Retention amount for bill ${row.bill_no ?? row.bill_id}`}
                            />
                          ) : (
                            inr(row.retention_deduction)
                          )}
                        </Td>
                        <Td className="bg-emerald-50/40 text-right font-mono font-black text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
                          {inr(row.final_bill_amount)}
                        </Td>

                        <Td className="text-right font-mono">
                          {isEditMode ? (
                            <NumberInput
                              value={row.advance_payment}
                              onChange={(v) => patchRow(row, 'advance_adjusted', v)}
                              className="w-24"
                              ariaLabel={`Advance adjusted for bill ${row.bill_no ?? row.bill_id}`}
                            />
                          ) : (
                            inr(row.advance_payment)
                          )}
                        </Td>
                        <Td className="text-right font-mono">
                          {isEditMode ? (
                            <NumberInput
                              value={edit?.other_deductions ?? 0}
                              onChange={(v) => patchRow(row, 'other_deductions', v)}
                              className="w-24"
                              ariaLabel={`Other deductions for bill ${row.bill_no ?? row.bill_id}`}
                            />
                          ) : (
                            '—'
                          )}
                        </Td>
                        <Td className="text-right font-mono">{inr(row.jv_payment)}</Td>
                        <Td className="text-right font-mono font-bold text-primary">
                          {inr(row.expected_payment)}
                        </Td>
                        <Td className="text-center">
                          {isEditMode ? (
                            <select
                              value={row.payment_status}
                              onChange={(e) => patchRow(row, 'payment_status', e.target.value)}
                              aria-label={`Payment status for bill ${row.bill_no ?? row.bill_id}`}
                              className="h-7 rounded border border-border bg-card px-1 text-[11px] font-bold outline-none"
                            >
                              {PAYMENT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${statusPill(row.payment_status)}`}
                            >
                              {row.payment_status}
                            </span>
                          )}
                        </Td>

                        <Td className="font-mono font-bold text-amber-800 dark:text-amber-300">
                          {row.po_wo_no || '—'}
                        </Td>
                        <Td className="text-right font-mono">
                          {row.po_wo_rate ? inr(row.po_wo_rate) : '—'}
                        </Td>
                        <Td className="font-mono">{row.pr_no || '—'}</Td>
                        <Td className="font-mono">{row.grn_no || '—'}</Td>
                        <Td
                          className={`bg-emerald-50/20 text-right font-mono font-black ${
                            row.running_available_budget < 0
                              ? 'text-red-600'
                              : 'text-emerald-800 dark:text-emerald-400'
                          }`}
                          title={`Category allocation ${inr(row.category_allocated_amount)}`}
                        >
                          {inr(row.running_available_budget)}
                        </Td>
                        <Td className="max-w-[240px] whitespace-normal break-words text-[11px] text-muted-foreground">
                          {isEditMode ? (
                            <input
                              type="text"
                              value={row.remarks ?? ''}
                              onChange={(e) => patchRow(row, 'ledger_remarks', e.target.value)}
                              aria-label={`Remarks for bill ${row.bill_no ?? row.bill_id}`}
                              className="h-7 w-40 rounded border border-border bg-card px-2 text-xs outline-none"
                            />
                          ) : (
                            row.remarks || '—'
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              Showing <strong className="text-foreground">{visibleRows.length}</strong> of{' '}
              <strong className="text-foreground">{displayRows.length}</strong> ledger line(s)
              across <strong className="text-foreground">{kpis.billCount}</strong> bill(s)
              {!isPortfolio && ' for this project'}.
            </p>
            {visibleCount < displayRows.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_STEP)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                Show {Math.min(PAGE_STEP, displayRows.length - visibleCount)} more
              </button>
            )}
          </div>
        </>
      )}

      {hasEdits && !isEditMode && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          You have unsaved ledger edits. Re-enter Edit Settlement to save or discard them.
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Presentational helpers
// ----------------------------------------------------------------------------

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`border-r border-border px-3 py-2.5 ${className}`}>{children}</th>;
}

function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`border-r border-border px-3 py-2 ${className}`} title={title}>
      {children}
    </td>
  );
}

function NumberInput({
  value,
  onChange,
  className = '',
  max,
  ariaLabel,
}: {
  value: number;
  onChange: (raw: string) => void;
  className?: string;
  max?: number;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`h-7 rounded border bg-card px-2 text-right text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-primary ${className}`}
    />
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-bold uppercase text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8.5 max-w-[200px] rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'amber' | 'emerald' | 'primary';
}) {
  const valueTone =
    tone === 'amber'
      ? 'text-amber-800 dark:text-amber-300'
      : tone === 'emerald'
        ? 'text-emerald-800 dark:text-emerald-300'
        : tone === 'primary'
          ? 'text-primary'
          : 'text-foreground';
  const labelTone =
    tone === 'amber'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'emerald'
        ? 'text-emerald-700 dark:text-emerald-400'
        : tone === 'primary'
          ? 'text-primary'
          : 'text-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
      <p className={`text-[11px] font-extrabold uppercase tracking-wider ${labelTone}`}>{label}</p>
      <p className={`mt-1 text-xl font-mono font-black ${valueTone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
