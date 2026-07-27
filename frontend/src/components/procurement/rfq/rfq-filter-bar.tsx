'use client';

import { Search, RotateCcw, Filter } from 'lucide-react';

export interface RfqFiltersState {
  tab: 'all' | 'ready_for_rfq' | 'rfq_sent' | 'quotes_received' | 'finalized';
  search: string;
  projectId: string;
  status: string;
  sortBy: 'newest' | 'oldest' | 'amount_desc';
}

export const DEFAULT_RFQ_FILTERS: RfqFiltersState = {
  tab: 'all',
  search: '',
  projectId: 'all',
  status: 'all',
  sortBy: 'newest',
};

interface RfqFilterBarProps {
  filters: RfqFiltersState;
  onChangeFilters: (patch: Partial<RfqFiltersState>) => void;
  projectOptions: { id: string; name: string }[];
  totalCount: number;
  filteredCount: number;
}

export function RfqFilterBar({
  filters,
  onChangeFilters,
  projectOptions,
  totalCount,
  filteredCount,
}: RfqFilterBarProps) {
  const isFiltered =
    filters.tab !== 'all' ||
    filters.search !== '' ||
    filters.projectId !== 'all' ||
    filters.status !== 'all' ||
    filters.sortBy !== 'newest';

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
      {/* Quick Tabs Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3 text-xs">
        <button
          onClick={() => onChangeFilters({ tab: 'all' })}
          className={`rounded-lg px-3 py-1.5 font-bold transition-all ${
            filters.tab === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All Approved Requisitions ({totalCount})
        </button>

        <button
          onClick={() => onChangeFilters({ tab: 'ready_for_rfq' })}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold transition-all ${
            filters.tab === 'ready_for_rfq'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          📥 Ready for RFQ
        </button>

        <button
          onClick={() => onChangeFilters({ tab: 'rfq_sent' })}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold transition-all ${
            filters.tab === 'rfq_sent'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          ⚡ Active RFQs Sent
        </button>

        <button
          onClick={() => onChangeFilters({ tab: 'quotes_received' })}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold transition-all ${
            filters.tab === 'quotes_received'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          📊 Quotes Received
        </button>

        <button
          onClick={() => onChangeFilters({ tab: 'finalized' })}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold transition-all ${
            filters.tab === 'finalized'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          ✅ Selections Approved
        </button>

        {isFiltered && (
          <button
            onClick={() => onChangeFilters(DEFAULT_RFQ_FILTERS)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Reset Filters
          </button>
        )}
      </div>

      {/* Search Input & Select Controls */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12">
        <div className="relative lg:col-span-5">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChangeFilters({ search: e.target.value })}
            placeholder="Search PR No, RFQ No, Material, Project, Vendor..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none shadow-2xs"
          />
        </div>

        <div className="lg:col-span-3">
          <select
            value={filters.projectId}
            onChange={(e) => onChangeFilters({ projectId: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs"
          >
            <option value="all">All Projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={filters.status}
            onChange={(e) => onChangeFilters({ status: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs"
          >
            <option value="all">All Statuses</option>
            <option value="ready_for_rfq">Ready for RFQ</option>
            <option value="rfq_sent">RFQ Sent</option>
            <option value="quotes_received">Quotes Received</option>
            <option value="approved">Selection Approved</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={filters.sortBy}
            onChange={(e) => onChangeFilters({ sortBy: e.target.value as any })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:border-primary focus:outline-none shadow-2xs"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="amount_desc">Sort: Highest Value</option>
          </select>
        </div>
      </div>
    </div>
  );
}
