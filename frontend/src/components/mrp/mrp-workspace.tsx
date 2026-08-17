'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, FlaskConical } from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { computeMrp } from '@/lib/erp/mrp/service';
import type { MrpRow } from '@/lib/erp/mrp/types';
import { MrpStatsBar } from './mrp-stats-bar';
import { MrpTableView } from './mrp-table-view';

const CONTROL =
  'h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary';

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

export function MrpWorkspace() {
  const liveMode = isLiveSupabase();
  const [rows, setRows] = useState<MrpRow[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await computeMrp(projectId === 'all' ? undefined : projectId);
      setRows(result);
      // Only the unfiltered fetch is a reliable source of the full project
      // list — a filtered fetch only ever returns rows for one project.
      if (projectId === 'all') {
        const distinct = new Map<string, string>();
        for (const row of result) distinct.set(row.projectId, row.projectName);
        setProjectOptions(
          Array.from(distinct, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute MRP data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows(selectedProjectId);
  }, [selectedProjectId, fetchRows]);

  const reorderCount = useMemo(() => rows.filter((row) => row.reorderFlag).length, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            aria-label="Filter by project"
            className={CONTROL}
          >
            <option value="all">All Projects</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {!liveMode && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              <FlaskConical className="h-3 w-3" /> Demo Data
            </span>
          )}

          {reorderCount > 0 && !loading && (
            <span className="text-xs font-semibold text-muted-foreground">
              {reorderCount} material{reorderCount === 1 ? '' : 's'} need reordering
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void fetchRows(selectedProjectId)}
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-border bg-card px-3 text-xs font-bold hover:bg-muted sm:self-auto"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <>
          <StatsSkeleton />
          <TableSkeleton />
        </>
      ) : (
        <>
          <MrpStatsBar rows={rows} />
          <MrpTableView rows={rows} />
        </>
      )}
    </div>
  );
}
