'use client';

// Production MR Requests filter bar — search + status + priority + project +
// reviewer + date range + My Requests + Pending My Approval + sort.
// All filtering runs server-side; this component only holds the control state.

import { Search, X, Plus, RefreshCcw, UserCheck, Inbox } from 'lucide-react';
import type { ProcurementProjectOption } from '@/lib/procurement';
import type { MrSort, ReviewerOption } from '@/lib/erp/material-request/service';

export interface MrRequestFilters {
  status: string;
  priority: string;
  projectId: string;
  reviewerId: string;
  dateFrom: string;
  dateTo: string;
  myRequests: boolean;
  pendingMyApproval: boolean;
}

export const EMPTY_MR_FILTERS: MrRequestFilters = {
  status: 'active', priority: '', projectId: '', reviewerId: '', dateFrom: '', dateTo: '', myRequests: false, pendingMyApproval: false,
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'Active (Approved)' },
  { value: 'closed', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS: { value: MrSort; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'updated', label: 'Last Updated' },
];

interface Props {
  search: string;
  onSearch: (v: string) => void;
  filters: MrRequestFilters;
  onChangeFilters: (patch: Partial<MrRequestFilters>) => void;
  sort: MrSort;
  onChangeSort: (s: MrSort) => void;
  projectOptions: ProcurementProjectOption[];
  /** When set the project filter is pinned to this id and rendered read-only. */
  lockedProjectId?: string;
  reviewers: ReviewerOption[];
  loading: boolean;
  onRefresh: () => void;
  onReset: () => void;
}

const SELECT = 'h-8 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors';
function selectCls(active: boolean) {
  return `${SELECT} ${active ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-background text-foreground'}`;
}
function toggleCls(active: boolean) {
  return `inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition-all ${
    active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
  }`;
}

export function MRRequestsFilterBar({
  search, onSearch, filters, onChangeFilters, sort, onChangeSort,
  projectOptions, lockedProjectId, reviewers, loading, onRefresh, onReset,
}: Props) {
  // A pinned project is scope, not a user-applied filter — it must not count toward "Clear (n)".
  const activeCount =
    (filters.status ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.projectId && !lockedProjectId ? 1 : 0) +
    (filters.reviewerId ? 1 : 0) + (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0) +
    (filters.myRequests ? 1 : 0) + (search.trim() ? 1 : 0);

  return (
    <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Search */}
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search MR ID, material, or requester…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-xs font-medium outline-none focus:border-primary"
          />
          {search && (
            <button onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Sort */}
        <select value={sort} onChange={(e) => onChangeSort(e.target.value as MrSort)} className={`${SELECT} border-border bg-background font-semibold`} aria-label="Sort by" title="Sort by">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>

        {/* Primary actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={onRefresh} disabled={loading} title="Refresh" className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-bold hover:bg-muted disabled:opacity-50">
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Second row: filters */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={filters.projectId}
          onChange={(e) => onChangeFilters({ projectId: e.target.value })}
          disabled={!!lockedProjectId}
          title={lockedProjectId ? 'Scoped to this project' : 'Filter by project'}
          className={`${selectCls(!!filters.projectId)} ${lockedProjectId ? 'cursor-not-allowed opacity-90' : ''}`}
        >
          {!lockedProjectId && <option value="">All Projects</option>}
          {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filters.status} onChange={(e) => onChangeFilters({ status: e.target.value })} className={selectCls(!!filters.status)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <select value={filters.priority} onChange={(e) => onChangeFilters({ priority: e.target.value })} className={selectCls(!!filters.priority)}>
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select value={filters.reviewerId} onChange={(e) => onChangeFilters({ reviewerId: e.target.value })} className={selectCls(!!filters.reviewerId)}>
          <option value="">All Reviewers</option>
          {reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 h-8">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">From</span>
          <input type="date" value={filters.dateFrom} onChange={(e) => onChangeFilters({ dateFrom: e.target.value })} className="bg-transparent text-xs outline-none" />
          <span className="text-[10px] font-bold uppercase text-muted-foreground">To</span>
          <input type="date" value={filters.dateTo} onChange={(e) => onChangeFilters({ dateTo: e.target.value })} className="bg-transparent text-xs outline-none" />
        </div>

        <button type="button" onClick={() => onChangeFilters({ myRequests: !filters.myRequests })} className={toggleCls(filters.myRequests)}>
          <Inbox className="h-3.5 w-3.5" /> My Requests
        </button>


        {activeCount > 0 && (
          <button onClick={onReset} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            <X className="h-3 w-3" /> Clear ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
