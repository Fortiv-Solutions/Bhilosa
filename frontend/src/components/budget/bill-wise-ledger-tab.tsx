'use client';

// ============================================================================
// BILL-WISE LEDGER — the unified project cost ledger
// File: frontend/src/components/budget/bill-wise-ledger-tab.tsx
//
// Shows CERTIFIED bills from both spines: material (vendor_bills) and contractor
// RA bills (service_bills). A ledger of uncertified claims is not a ledger, and
// it would disagree with budget_ledger, which only ever receives certified
// documents.
//
// THIS TAB IS READ-ONLY, DELIBERATELY.
// It used to write retention / advance / deductions straight back to
// vendor_bills. That is what produced ledger drift: the posting trigger fired
// only on status changes, so budget_ledger kept the stale figure forever while
// the bill moved on. A report that mutates the documents it reports on is the
// anti-pattern. Settlement edits now live in the Bill Details drawer, where the
// database reverses and re-posts.
//
// Reads go through rpc_bill_ledger (keyset-paginated) and rpc_bill_ledger_summary
// (totals across the WHOLE filtered set, not the loaded page). The previous
// implementation pulled every row and sliced client-side, which stopped being
// tenable once the view became a UNION of both spines.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  BudgetDataError,
  downloadCsv,
  fetchBillLedgerExport,
  fetchBillLedgerPage,
  fetchBillLedgerSummary,
  refreshBillLedger,
  toCsv,
  type BillLedgerCursor,
  type BillLedgerFilters,
  type BillLedgerFreshness,
  type BillLedgerRow,
  type BillLedgerSummary,
  type BillSource,
} from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetAuthRequired, BudgetEmpty, BudgetError, BudgetLoading } from './budget-states';
import { BillDetailDrawer } from './bill-detail-drawer';

const PAGE_SIZE = 100;
const BILL_SOURCES = ['All', 'material', 'service'] as const;
const PAYMENT_STATUSES = ['All', 'pending', 'partially_paid', 'paid'] as const;

const EMPTY_SUMMARY: BillLedgerSummary = {
  lineCount: 0,
  billCount: 0,
  materialBillCount: 0,
  serviceBillCount: 0,
  gross: 0,
  retention: 0,
  retentionOutstanding: 0,
  netPayable: 0,
  paid: 0,
  outstanding: 0,
};

function inr(value: number): string {
  return `₹${(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function dmy(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function statusPill(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (s === 'approved' || s === 'verified') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (s === 'partially_paid') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (s === 'rejected') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

function sourceBadge(source: BillSource): string {
  return source === 'service'
    ? 'border-purple-200 bg-purple-50 text-purple-700'
    : 'border-sky-200 bg-sky-50 text-sky-700';
}

export default function BillWiseLedgerTab({ permissions }: { permissions: BudgetPermissions }) {
  const { projectId, isPortfolio, categories, realtimeTick, needsAuth } = useBudgetData();

  const [rows, setRows] = useState<BillLedgerRow[]>([]);
  const [summary, setSummary] = useState<BillLedgerSummary>(EMPTY_SUMMARY);
  const [freshness, setFreshness] = useState<BillLedgerFreshness | null>(null);
  const [cursor, setCursor] = useState<BillLedgerCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openBill, setOpenBill] = useState<{ source: BillSource; id: string } | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [billSource, setBillSource] = useState<string>('All');
  const [paymentStatus, setPaymentStatus] = useState('All');
  const [categoryId, setCategoryId] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Guards a slow in-flight page from overwriting a newer one.
  const loadSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters: BillLedgerFilters = useMemo(
    () => ({ search, billSource, paymentStatus, categoryId, fromDate, toDate }),
    [search, billSource, paymentStatus, categoryId, fromDate, toDate],
  );

  const loadFirstPage = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Refresh only if the snapshot is already older than a minute — safe to
      // call on every load without thrashing the materialized view.
      const fresh = await refreshBillLedger(60);
      const [page, totals] = await Promise.all([
        fetchBillLedgerPage(projectId, filters, PAGE_SIZE, null),
        fetchBillLedgerSummary(projectId, filters),
      ]);
      if (seq !== loadSeq.current) return;

      setRows(page.rows);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setSummary(totals);
      if (fresh) setFreshness(fresh);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Unable to load the bill ledger.',
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [projectId, filters]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, realtimeTick]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchBillLedgerPage(projectId, filters, PAGE_SIZE, cursor);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load more rows.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleForceRefresh() {
    setRefreshing(true);
    setNotice(null);
    const fresh = await refreshBillLedger(0);
    if (fresh) setFreshness(fresh);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function handleExport() {
    setExporting(true);
    setNotice(null);
    try {
      // Server-side: exporting only the loaded page would silently produce a
      // partial file.
      const { rows: allRows, truncated, limit } = await fetchBillLedgerExport(projectId, filters);

      const headers = [
        'Type', 'Bill Date', 'Bill No', 'Supplier Bill No', 'RA', 'Vendor', 'GSTIN',
        'Budget Head', 'Cost Code', 'Sub Activity', 'Source Doc Type', 'Source Doc No',
        'PR No', 'GRN No', 'Item', 'Unit', 'Qty', 'Rate', 'Line Amount', 'GST %',
        'Gross', 'Retention %', 'Retention', 'Retention Released', 'Retention Outstanding',
        'Advance', 'Other Deductions', 'Net Payable', 'Paid', 'Outstanding',
        'Bill Status', 'Payment Status', 'Available Budget After', 'Remarks',
      ];
      const body = allRows.map((r) => [
        r.bill_source, r.bill_date, r.bill_no, r.bill_no_of_supplier, r.ra_sequence,
        r.supplier_name, r.supplier_gst, r.head_activity, r.cost_code, r.sub_activity_ledger,
        r.source_doc_type, r.source_doc_no, r.pr_no, r.grn_no, r.item_desc, r.unit,
        r.billed_qty, r.final_bill_rate, r.bill_item_amt, r.gst_rate,
        r.gross_bill_amount, r.retention_percent, r.retention_deduction,
        r.retention_released, r.retention_outstanding, r.advance_payment,
        r.other_deductions, r.final_bill_amount, r.jv_payment, r.expected_payment,
        r.bill_status, r.payment_status, r.running_available_budget, r.remarks,
      ]);

      downloadCsv(`bill-ledger-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, body));

      if (truncated) {
        setNotice(
          `Export capped at ${limit.toLocaleString('en-IN')} rows. Narrow the filters to export the rest.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export the ledger.');
    } finally {
      setExporting(false);
    }
  }

  if (needsAuth) return <BudgetAuthRequired />;
  if (loading && rows.length === 0) return <BudgetLoading label="Loading bill ledger…" />;
  if (error && rows.length === 0) {
    return <BudgetError message={error} onRetry={() => void loadFirstPage()} />;
  }

  const hasFilters =
    Boolean(search) || billSource !== 'All' || paymentStatus !== 'All' ||
    categoryId !== 'All' || Boolean(fromDate) || Boolean(toDate);

  return (
    <div className="space-y-4">
      {/* KPIs — from the summary RPC, so they describe the whole filtered set. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Certified (gross)"
          value={inr(summary.gross)}
          detail={`${summary.billCount} bill(s) · ${summary.materialBillCount} material · ${summary.serviceBillCount} service`}
        />
        <Kpi
          label="Retention held"
          value={inr(summary.retentionOutstanding)}
          detail={`${inr(summary.retention)} withheld to date`}
        />
        <Kpi label="Net payable" value={inr(summary.netPayable)} />
        <Kpi label="Paid" value={inr(summary.paid)} />
        <Kpi
          label="Outstanding"
          value={inr(summary.outstanding)}
          tone={summary.outstanding > 0 ? 'warn' : 'ok'}
        />
      </section>

      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && rows.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <section className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search vendor, bill no, cost code, PO/WO…"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs"
            />
          </div>

          <Select
            label="Type"
            value={billSource}
            onChange={setBillSource}
            options={BILL_SOURCES.map((s) => ({
              value: s,
              label: s === 'All' ? 'All types' : s === 'material' ? 'Material' : 'Service',
            }))}
          />

          <Select
            label="Payment"
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={PAYMENT_STATUSES.map((s) => ({
              value: s,
              label: s === 'All' ? 'All payments' : s.replaceAll('_', ' '),
            }))}
          />

          {!isPortfolio && (
            <Select
              label="Budget head"
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: 'All', label: 'All heads' },
                ...categories.map((c) => ({ value: c.id, label: c.categoryName })),
              ]}
            />
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>

          <div className="ml-auto flex items-end gap-2">
            <button
              type="button"
              onClick={handleForceRefresh}
              disabled={refreshing}
              title={
                freshness
                  ? `Snapshot taken ${new Date(freshness.lastRefreshedAt).toLocaleTimeString('en-IN')} · ${freshness.rowCount.toLocaleString('en-IN')} rows`
                  : 'Refresh the ledger snapshot'
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {permissions.canExport && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || summary.lineCount === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export CSV
              </button>
            )}
          </div>
        </div>

        {freshness && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Snapshot from {new Date(freshness.lastRefreshedAt).toLocaleString('en-IN')} ·{' '}
            {freshness.rowCount.toLocaleString('en-IN')} rows. The ledger refreshes on a schedule and on demand,
            so a bill certified moments ago may take a few seconds to appear.
          </p>
        )}
      </section>

      {/* The ledger. Eleven columns — everything else lives in the drawer. */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Bill</th>
                <th className="px-3 py-2.5">Vendor / Contractor</th>
                <th className="px-3 py-2.5">Budget Head</th>
                <th className="px-3 py-2.5">Source Doc</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">Retention</th>
                <th className="px-3 py-2.5 text-right">Net Payable</th>
                <th className="px-3 py-2.5 text-right">Outstanding</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setOpenBill({ source: row.bill_source, id: row.bill_id })}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{dmy(row.bill_date)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold">{row.bill_no}</span>
                      <span
                        className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${sourceBadge(row.bill_source)}`}
                      >
                        {row.bill_source === 'service' ? 'SVC' : 'MAT'}
                      </span>
                      {row.ra_sequence ? (
                        <span className="text-[10px] text-muted-foreground">RA-{row.ra_sequence}</span>
                      ) : null}
                    </div>
                    <div className="max-w-[220px] truncate text-[10px] text-muted-foreground">{row.item_desc}</div>
                  </td>
                  <td className="px-3 py-2">{row.supplier_name}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-[180px] truncate">{row.head_activity}</div>
                    <div className="text-[10px] text-muted-foreground">{row.cost_code}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {row.source_doc_no ? `${row.source_doc_type} ${row.source_doc_no}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{inr(row.gross_bill_amount)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {row.retention_deduction > 0 ? `−${inr(row.retention_deduction)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{inr(row.final_bill_amount)}</td>
                  <td
                    className={`px-3 py-2 text-right ${row.expected_payment > 0 ? 'font-semibold text-amber-700' : 'text-muted-foreground'}`}
                  >
                    {inr(row.expected_payment)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusPill(row.payment_status)}`}
                    >
                      {(row.payment_status || 'pending').replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setOpenBill({ source: row.bill_source, id: row.bill_id })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer shadow-2xs"
                    >
                      <Paperclip className="h-3 w-3" /> View &amp; Files
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && !loading && (
          <BudgetEmpty
            title={hasFilters ? 'No bills match these filters' : 'No certified bills yet'}
            detail={
              hasFilters
                ? 'Clear or widen the filters to see more of the ledger.'
                : 'The ledger shows certified bills only. Approve a material or service bill and it will appear here.'
            }
          />
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground">
            <span>
              Showing <strong className="text-foreground">{rows.length}</strong> of{' '}
              <strong className="text-foreground">{summary.lineCount}</strong> line(s) across{' '}
              <strong className="text-foreground">{summary.billCount}</strong> bill(s)
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                )}
                Load {PAGE_SIZE} more
              </button>
            )}
          </div>
        )}
      </section>

      {openBill && (
        <BillDetailDrawer
          billSource={openBill.source}
          billId={openBill.id}
          canEditSettlement={permissions.canEditLedger}
          onClose={() => setOpenBill(null)}
          onChanged={() => void loadFirstPage()}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'ok' | 'warn';
}) {
  const toneClass =
    tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-700' : 'text-foreground';
  return (
    <article className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-lg font-semibold ${toneClass}`}>{value}</p>
      {detail && <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>}
    </article>
  );
}

function Select({
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
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs capitalize"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
