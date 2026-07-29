'use client';

// Add from Approved MR — large right slide-over with a searchable / filterable
// table of approved Material Requests. Enforces the PR merge rules:
//   - selected MRs must share the same company
//   - selected MRs must share the same project (site may differ, with a warning)
//   - fully-converted MRs and already-linked MRs are not selectable
//   - only the remaining (pending) quantity is imported

import { useEffect, useMemo, useState } from 'react';
import { X, Search, ClipboardCheck, Eye, Plus, AlertTriangle, Filter } from 'lucide-react';
import { formatCurrency } from '@/components/procurement/shared';
import type { ApprovedMrRow, ApprovedMrFilterState, ProcurementProjectOption } from '@/lib/erp/purchase-requisition/types';
import { ConversionBadge } from './pr-badges';

interface AddFromApprovedMrDrawerProps {
  open: boolean;
  loading: boolean;
  approvedMrs: ApprovedMrRow[];
  projectOptions: ProcurementProjectOption[];
  alreadyLinkedMrIds: string[];
  /** When a draft already has lines, new MRs must match this company/project. */
  lockedCompany?: string | null;
  lockedProjectId?: string | null;
  onClose: () => void;
  onAddMrs: (rows: ApprovedMrRow[]) => void;
  onViewMr?: (mr: ApprovedMrRow) => void;
}

const EMPTY_FILTERS: ApprovedMrFilterState = {
  searchQuery: '',
  companyName: '',
  projectId: '',
  siteId: '',
  workActivity: '',
  requestedBy: '',
  budgetStatus: '',
  conversionState: '',
  dateFrom: '',
  dateTo: '',
};

function fmtDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AddFromApprovedMrDrawer({
  open,
  loading,
  approvedMrs,
  projectOptions,
  alreadyLinkedMrIds,
  lockedCompany,
  lockedProjectId,
  onClose,
  onAddMrs,
  onViewMr,
}: AddFromApprovedMrDrawerProps) {
  const [filters, setFilters] = useState<ApprovedMrFilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setFilters(EMPTY_FILTERS);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const linkedSet = useMemo(() => new Set(alreadyLinkedMrIds), [alreadyLinkedMrIds]);

  // Derive filter option lists from the data.
  const companies = useMemo(() => Array.from(new Set(approvedMrs.map((m) => m.company_name).filter(Boolean))) as string[], [approvedMrs]);
  const sites = useMemo(() => Array.from(new Set(approvedMrs.map((m) => m.site_name).filter(Boolean))) as string[], [approvedMrs]);
  const activities = useMemo(() => Array.from(new Set(approvedMrs.map((m) => m.work_activity).filter(Boolean))) as string[], [approvedMrs]);
  const requesters = useMemo(() => Array.from(new Set(approvedMrs.map((m) => m.requested_by).filter(Boolean))) as string[], [approvedMrs]);

  const filtered = useMemo(() => {
    let list = approvedMrs.filter((m) => !m.fully_converted);
    if (filters.companyName) list = list.filter((m) => m.company_name === filters.companyName);
    if (filters.projectId) list = list.filter((m) => m.project_id === filters.projectId);
    if (filters.siteId) list = list.filter((m) => m.site_name === filters.siteId);
    if (filters.workActivity) list = list.filter((m) => m.work_activity === filters.workActivity);
    if (filters.requestedBy) list = list.filter((m) => m.requested_by === filters.requestedBy);
    if (filters.budgetStatus) list = list.filter((m) => m.budget_status === filters.budgetStatus);
    if (filters.conversionState === 'not_converted') list = list.filter((m) => m.converted_qty_total <= 0.0001);
    if (filters.conversionState === 'partial') list = list.filter((m) => m.converted_qty_total > 0.0001);
    if (filters.dateFrom) list = list.filter((m) => m.mr_date.slice(0, 10) >= filters.dateFrom);
    if (filters.dateTo) list = list.filter((m) => m.mr_date.slice(0, 10) <= filters.dateTo);
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      list = list.filter(
        (m) => m.mr_number.toLowerCase().includes(q) || m.lines.some((l) => l.item_description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [approvedMrs, filters]);

  // Effective compatibility lock: from the parent draft, else from the first selected row.
  const firstSelected = useMemo(() => approvedMrs.find((m) => selected.has(m.id)), [approvedMrs, selected]);
  const lockCompany = (lockedCompany ?? firstSelected?.company_name) || null;
  const lockProject = (lockedProjectId ?? firstSelected?.project_id) || null;

  function compatibility(row: ApprovedMrRow): { ok: boolean; reason: string } {
    if (linkedSet.has(row.id)) return { ok: false, reason: 'Already added to this PR' };
    if (lockCompany && row.company_name && row.company_name !== lockCompany) return { ok: false, reason: `Different company — a PR can only merge MRs of ${lockCompany}` };
    if (lockProject && row.project_id !== lockProject) return { ok: false, reason: 'Different project — incompatible MRs cannot be merged' };
    return { ok: true, reason: '' };
  }

  function toggle(row: ApprovedMrRow) {
    const { ok } = compatibility(row);
    if (!ok) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function addSingle(row: ApprovedMrRow) {
    const { ok } = compatibility(row);
    if (!ok) return;
    onAddMrs([row]);
  }

  function addSelected() {
    const rows = approvedMrs.filter((m) => selected.has(m.id));
    if (rows.length > 0) onAddMrs(rows);
  }

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== 'searchQuery' && Boolean(v)).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog" aria-label="Add from Approved Material Requests">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-6xl flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">Add from Approved Material Requisition</h3>
              <p className="text-[11px] text-muted-foreground">Only approved MRs with pending quantity are shown. Selected MRs must share the same company &amp; project.</p>
            </div>
          </div>
          <button onClick={onClose} title="Close (Esc)" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="border-b border-border px-5 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={filters.searchQuery}
                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                placeholder="Search MR number or item…"
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs font-medium outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-bold ${
                showFilters || activeFilterCount ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <Filter className="h-3.5 w-3.5" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={() => setFilters({ ...EMPTY_FILTERS, searchQuery: filters.searchQuery })} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5 text-xs">
              <select value={filters.companyName} onChange={(e) => setFilters({ ...filters, companyName: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-primary">
                <option value="">All Companies</option>
                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-primary">
                <option value="">All Projects</option>
                {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={filters.siteId} onChange={(e) => setFilters({ ...filters, siteId: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-primary">
                <option value="">All Sites</option>
                {sites.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filters.workActivity} onChange={(e) => setFilters({ ...filters, workActivity: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-primary">
                <option value="">All Activities</option>
                {activities.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filters.requestedBy} onChange={(e) => setFilters({ ...filters, requestedBy: e.target.value })} className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-primary">
                <option value="">All Requesters</option>
                {requesters.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={filters.conversionState} onChange={(e) => setFilters({ ...filters, conversionState: e.target.value as ApprovedMrFilterState['conversionState'] })} className="h-8 rounded-md border border-border bg-background px-2 outline-none focus:border-primary">
                <option value="">Any Conversion</option>
                <option value="not_converted">Not Converted</option>
                <option value="partial">Partially Converted</option>
              </select>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">From
                <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="h-8 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:border-primary" />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">To
                <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="h-8 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:border-primary" />
              </label>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="space-y-2 p-5">
              {[...Array(6)].map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/50" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">No approved material requests available</p>
              <p className="text-xs text-muted-foreground/70">Approved MRs with pending quantity will appear here.</p>
            </div>
          ) : (
            <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
              <thead className="sticky top-0 z-10 bg-muted/95 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                <tr>
                  <th className="sticky left-0 z-20 bg-muted/95 px-3 py-2"></th>
                  <th className="px-3 py-2">MR Number</th>
                  <th className="px-3 py-2">MR Date</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Site</th>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">Act. Code</th>
                  <th className="px-3 py-2">Requested By</th>
                  <th className="px-3 py-2">Required By</th>
                  <th className="px-3 py-2 text-right">Items</th>
                  <th className="px-3 py-2 text-right">Approved Qty</th>
                  <th className="px-3 py-2 text-right">Converted</th>
                  <th className="px-3 py-2 text-right text-primary">Pending Qty</th>
                  <th className="px-3 py-2 text-right">Est. Value</th>
                  <th className="px-3 py-2">Conversion</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => {
                  const compat = compatibility(row);
                  const isSelected = selected.has(row.id);
                  return (
                    <tr key={row.id} className={`${isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'} ${!compat.ok ? 'opacity-55' : ''}`}>
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!compat.ok}
                          onChange={() => toggle(row)}
                          title={compat.ok ? 'Select MR' : compat.reason}
                          className="h-4 w-4 accent-[color:var(--color-primary)] disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-2 font-bold text-primary">{row.mr_number}</td>
                      <td className="px-3 py-2">{fmtDate(row.mr_date)}</td>
                      <td className="px-3 py-2">{row.company_name || '—'}</td>
                      <td className="px-3 py-2">{row.project_name || '—'}</td>
                      <td className="px-3 py-2">{row.site_name || '—'}</td>
                      <td className="px-3 py-2">{row.work_activity || '—'}</td>
                      <td className="px-3 py-2">{row.activity_code || '—'}</td>
                      <td className="px-3 py-2">{row.requested_by || '—'}</td>
                      <td className="px-3 py-2">{fmtDate(row.required_date)}</td>
                      <td className="px-3 py-2 text-right">{row.total_items}</td>
                      <td className="px-3 py-2 text-right">{row.approved_qty_total.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{row.converted_qty_total.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-bold text-primary">{row.pending_qty_total.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.estimated_value)}</td>
                      <td className="px-3 py-2"><ConversionBadge pending={row.pending_qty_total} approved={row.approved_qty_total} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {onViewMr && (
                            <button onClick={() => onViewMr(row)} title="View MR" className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => addSingle(row)}
                            disabled={!compat.ok}
                            title={compat.ok ? 'Add to PR' : compat.reason}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lockCompany ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-bold text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" /> Locked to {lockCompany}{lockProject ? ' · single project' : ''}
              </span>
            ) : (
              <span>Select one or more approved MRs to import their pending items.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-muted">Cancel</button>
            <button
              onClick={addSelected}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add Selected ({selected.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
