// Material Request Work Queue — Production, server-paginated container.
// Search / filter / sort / pagination all execute in Postgres (via the
// search_material_requests RPC); the client loads one 15-row page at a time,
// so the page stays fast with hundreds or thousands of records.

'use client';

import { useState, useMemo, useEffect } from 'react';
import { HardHat } from 'lucide-react';
import type {
  MaterialRequestRow,
  PurchaseRequisitionRow,
  InventorySnapshotRow,
  ProcurementProjectOption,
  Role,
} from '@/lib/erp/material-request/types';
import type { ProcurementLineRow } from '@/lib/procurement';
import {
  listMaterialRequestsPaged, getMaterialRequestStats, listReviewers,
  type MrSort, type MrStats, type ReviewerOption,
} from '@/lib/erp/material-request/service';
import { MRStatsBar } from './mr-stats-bar';
import { MRRequestsFilterBar, EMPTY_MR_FILTERS, type MrRequestFilters } from './mr-requests-filter-bar';
import { MRTableView } from './mr-table-view';
import { MRInspectorPanel } from './mr-inspector-panel';
import { MRPdfPreviewModal } from './mr-pdf-preview-modal';
import { Pagination } from '../pagination';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PAGE_SIZE = 15;

const WORK_ACTIVITIES = [
  'Slab casting', 'Brick work', 'Plaster work', 'Waterproofing', 'Electrical work',
  'Plumbing', 'Tile work', 'Finishing', 'Excavation', 'Foundation', 'Other',
];

const ZERO_STATS: MrStats = {
  total: 0, pending: 0, critical: 0, overdue: 0, underReview: 0, clarification: 0, fulfilled: 0, converted: 0,
};

interface MaterialRequestWorkQueueProps {
  materialRequests?: MaterialRequestRow[];
  purchaseRequisitions: PurchaseRequisitionRow[];
  inventorySnapshots?: InventorySnapshotRow[];
  projectOptions: ProcurementProjectOption[];
  lockedProjectId?: string;
  activeRole: Role;
  loading?: boolean;
  onConvertToPr: (mr: MaterialRequestRow, approvedLines?: ProcurementLineRow[]) => void;
  onPrintMr?: (mr: MaterialRequestRow) => void;
  onRefresh: () => Promise<void>;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function MaterialRequestWorkQueue({
  purchaseRequisitions,
  projectOptions,
  lockedProjectId,
  activeRole,
  onConvertToPr,
  onPrintMr,
  onRefresh,
  onMessage,
  onError,
}: MaterialRequestWorkQueueProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<MrRequestFilters>(() => ({
    ...EMPTY_MR_FILTERS,
    projectId: lockedProjectId ?? '',
  }));
  const [sort, setSort] = useState<MrSort>('newest');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<MaterialRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MrStats>(ZERO_STATS);
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([]);

  const [selectedMrId, setSelectedMrId] = useState<string | null>(null);
  const [previewMr, setPreviewMr] = useState<MaterialRequestRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load reviewers once.
  useEffect(() => { listReviewers().then(setReviewers).catch(() => {}); }, []);

  // Debounce the search box; typing resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    listMaterialRequestsPaged({
      page,
      pageSize: PAGE_SIZE,
      projectId: lockedProjectId || filters.projectId || null,
      status: filters.status || null,
      priority: filters.priority || null,
      reviewerId: filters.reviewerId || null,
      myRequests: filters.myRequests,
      pendingMyApproval: filters.pendingMyApproval,
      search: debouncedSearch || null,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
      sort,
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        onError?.(err.message || 'Failed to load Material Requests');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [page, filters, debouncedSearch, sort, lockedProjectId, reloadKey, onError]);

  useEffect(() => {
    getMaterialRequestStats(lockedProjectId || filters.projectId || null)
      .then(setStats)
      .catch(() => {});
  }, [lockedProjectId, filters.projectId, reloadKey]);

  // Realtime subscription to refresh MR queue when status changes (e.g. Back to Draft)
  useEffect(() => {
    const channel = supabase
      .channel('realtime-mr-work-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_requests' }, () => {
        setReloadKey((k) => k + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_requisitions' }, () => {
        setReloadKey((k) => k + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateFilters = (next: Partial<MrRequestFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_MR_FILTERS, projectId: lockedProjectId ?? '' });
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  };

  const changeSort = (nextSort: MrSort) => {
    setSort(nextSort);
    setPage(1);
  };

  const goToPage = (nextPage: number) => setPage(nextPage);

  async function runAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    const res = await fn();
    if (res.error) {
      if (!selectedMrId) onError(res.error.message);
      return res;
    }
    if (!selectedMrId) onMessage(`${label} completed successfully.`);
    setReloadKey((k) => k + 1);
    onRefresh?.().catch(() => {});
    return res;
  }

  const selectedMr = useMemo(
    () => rows.find((r) => r.id === selectedMrId) ?? null,
    [rows, selectedMrId],
  );

  const linkedPrFor = (mr: MaterialRequestRow): PurchaseRequisitionRow | undefined =>
    purchaseRequisitions.find((pr) => pr.material_request_id === mr.id);

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="space-y-4">
      <MRStatsBar stats={stats} />

      <MRRequestsFilterBar
        search={search}
        onSearch={setSearch}
        filters={filters}
        onChangeFilters={updateFilters}
        sort={sort}
        onChangeSort={changeSort}
        projectOptions={projectOptions}
        lockedProjectId={lockedProjectId}
        reviewers={reviewers}
        loading={loading}
        onRefresh={() => setReloadKey((k) => k + 1)}
        onReset={resetFilters}
      />

      {loading && rows.length === 0 ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <HardHat className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">No material requests match your filters</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Adjust your search box or filter criteria to view requests.</p>
        </div>
      ) : (
        <div className={`space-y-3 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
          <MRTableView
            materialRequests={rows}
            purchaseRequisitions={purchaseRequisitions}
            activeRole={activeRole}
            selectedMrId={selectedMr?.id}
            onSelectMr={(mr) => setSelectedMrId(mr.id)}
            onPrintMr={(mr) => setPreviewMr(mr)}
            onAction={runAction}
            onConvertToPr={onConvertToPr}
          />

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={goToPage} />

          {selectedMr && (
            <MRInspectorPanel
              mr={selectedMr}
              linkedPr={linkedPrFor(selectedMr)}
              activeRole={activeRole}
              onClose={() => setSelectedMrId(null)}
              onAction={runAction}
              onConvertToPr={(mr: MaterialRequestRow, lines?: ProcurementLineRow[]) => {
                onConvertToPr(mr, lines);
              }}
              onPrint={() => setPreviewMr(selectedMr)}
            />
          )}
        </div>
      )}

      {previewMr && (
        <MRPdfPreviewModal
          mr={previewMr}
          onClose={() => setPreviewMr(null)}
        />
      )}
    </div>
  );
}

export { WORK_ACTIVITIES };
