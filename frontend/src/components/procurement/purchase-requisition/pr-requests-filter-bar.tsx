'use client';

import { Search, Filter, Calendar, Layers, RotateCcw } from 'lucide-react';
import type { ProcurementProjectOption } from '@/lib/erp/purchase-requisition/types';

export interface PrFiltersState {
  search: string;
  projectId: string;
  status: string;
  priority: string;
  tab: 'all' | 'today' | 'pending' | 'auto_drafts' | 'approved';
  dateFrom: string;
  dateTo: string;
  sortBy: 'newest' | 'oldest' | 'amount_desc' | 'priority';
}

export const DEFAULT_PR_FILTERS: PrFiltersState = {
  search: '',
  projectId: 'all',
  status: 'all',
  priority: 'all',
  tab: 'all',
  dateFrom: '',
  dateTo: '',
  sortBy: 'newest',
};

interface PRRequestsFilterBarProps {
  filters: PrFiltersState;
  onChangeFilters: (updated: Partial<PrFiltersState>) => void;
  projectOptions: ProcurementProjectOption[];
  totalCount: number;
  filteredCount: number;
}

export function PRRequestsFilterBar({
  filters,
  onChangeFilters,
  projectOptions,
  totalCount,
  filteredCount,
}: PRRequestsFilterBarProps) {
  const isFiltered =
    filters.search !== '' ||
    filters.projectId !== 'all' ||
    filters.status !== 'all' ||
    filters.priority !== 'all' ||
    filters.tab !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5 shadow-sm">
      {/* Quick Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <button
            onClick={() => onChangeFilters({ tab: 'all' })}
            className={`rounded-lg px-3 py-1.5 transition-colors font-heading ${
              filters.tab === 'all'
                ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            All PR Records ({totalCount})
          </button>
          <button
            onClick={() => onChangeFilters({ tab: 'today' })}
            className={`rounded-lg px-3 py-1.5 transition-colors font-heading ${
              filters.tab === 'today'
                ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            📥 Received Today
          </button>
          <button
            onClick={() => onChangeFilters({ tab: 'pending' })}
            className={`rounded-lg px-3 py-1.5 transition-colors font-heading ${
              filters.tab === 'pending'
                ? 'bg-amber-600 text-white font-bold shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            ⏳ Pending Verification &amp; Approval
          </button>
          <button
            onClick={() => onChangeFilters({ tab: 'auto_drafts' })}
            className={`rounded-lg px-3 py-1.5 transition-colors font-heading ${
              filters.tab === 'auto_drafts'
                ? 'bg-purple-600 text-white font-bold shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            ⚡ Auto-Drafts from MRs
          </button>
          <button
            onClick={() => onChangeFilters({ tab: 'approved' })}
            className={`rounded-lg px-3 py-1.5 transition-colors font-heading ${
              filters.tab === 'approved'
                ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            ✅ Approved / Ready for PO
          </button>
        </div>

        {isFiltered && (
          <button
            onClick={() => onChangeFilters(DEFAULT_PR_FILTERS)}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
          </button>
        )}
      </div>

      {/* Filter Control Inputs */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-6 lg:grid-cols-12 text-xs">
        {/* Search */}
        <div className="relative md:col-span-3 lg:col-span-4">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChangeFilters({ search: e.target.value })}
            placeholder="Search PR No, MR No, Material, Project, Activity…"
            className="h-8.5 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
          />
        </div>

        {/* Project Dropdown */}
        <div className="md:col-span-2 lg:col-span-2">
          <select
            value={filters.projectId}
            onChange={(e) => onChangeFilters({ projectId: e.target.value })}
            className="h-8.5 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Dropdown */}
        <div className="md:col-span-2 lg:col-span-2">
          <select
            value={filters.status}
            onChange={(e) => onChangeFilters({ status: e.target.value })}
            className="h-8.5 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft / Auto-Draft</option>
            <option value="under_verification">Under Verification</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="on_hold">On Hold</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Priority Dropdown */}
        <div className="md:col-span-2 lg:col-span-2">
          <select
            value={filters.priority}
            onChange={(e) => onChangeFilters({ priority: e.target.value })}
            className="h-8.5 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Sort By */}
        <div className="md:col-span-3 lg:col-span-2">
          <select
            value={filters.sortBy}
            onChange={(e) => onChangeFilters({ sortBy: e.target.value as PrFiltersState['sortBy'] })}
            className="h-8.5 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="amount_desc">Sort: Highest Value</option>
            <option value="priority">Sort: Priority</option>
          </select>
        </div>
      </div>
    </div>
  );
}
