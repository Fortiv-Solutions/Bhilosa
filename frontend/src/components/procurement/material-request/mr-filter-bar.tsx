'use client';

import { Search, RefreshCcw, Plus, AlertTriangle, X } from 'lucide-react';
import type { ProcurementProjectOption } from '@/lib/procurement';
import type { MRFilterState } from '@/lib/erp/material-request/types';

interface MRFilterBarProps {
  filters: MRFilterState;
  onChangeFilters: (filters: MRFilterState) => void;
  projectOptions: ProcurementProjectOption[];
  workActivities: string[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenCreateModal: () => void;
}

export function MRFilterBar({
  filters,
  onChangeFilters,
  projectOptions,
  workActivities,
  loading,
  onRefresh,
  onOpenCreateModal,
}: MRFilterBarProps) {
  const activeCount = [
    filters.projectId,
    filters.priority,
    filters.workActivity,
    filters.overdueOnly,
    filters.searchQuery.trim(),
  ].filter(Boolean).length;

  const handleReset = () => {
    onChangeFilters({
      searchQuery: '',
      projectId: '',
      status: '',
      priority: '',
      stockDecision: '',
      workActivity: '',
      overdueOnly: false,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        
        {/* Full-text Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={filters.searchQuery}
            onChange={(e) => onChangeFilters({ ...filters, searchQuery: e.target.value })}
            placeholder="Search MR#, material item, site engineer..."
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-xs font-medium outline-none focus:border-primary transition-colors"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onChangeFilters({ ...filters, searchQuery: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Project Filter */}
        <select
          value={filters.projectId}
          onChange={(e) => onChangeFilters({ ...filters, projectId: e.target.value })}
          className={`h-8 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors ${
            filters.projectId ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-background text-foreground'
          }`}
        >
          <option value="">All Projects</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Priority Filter */}
        <select
          value={filters.priority}
          onChange={(e) => onChangeFilters({ ...filters, priority: e.target.value })}
          className={`h-8 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors ${
            filters.priority ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-background text-foreground'
          }`}
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Work Activity Filter */}
        <select
          value={filters.workActivity}
          onChange={(e) => onChangeFilters({ ...filters, workActivity: e.target.value })}
          className={`h-8 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors ${
            filters.workActivity ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-background text-foreground'
          }`}
        >
          <option value="">All Activities</option>
          {workActivities.map((act) => (
            <option key={act} value={act}>{act}</option>
          ))}
        </select>

        {/* Overdue Chip */}
        <button
          type="button"
          onClick={() => onChangeFilters({ ...filters, overdueOnly: !filters.overdueOnly })}
          className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-bold transition-all ${
            filters.overdueOnly
              ? 'border-orange-500 bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle className="h-3 w-3" /> Overdue
        </button>

        {/* Clear Active Filters */}
        {activeCount > 0 && (
          <button
            onClick={handleReset}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400 px-2 text-xs font-bold hover:bg-red-100 transition-colors"
          >
            <X className="h-3 w-3" /> Clear ({activeCount})
          </button>
        )}



      </div>
    </div>
  );
}
