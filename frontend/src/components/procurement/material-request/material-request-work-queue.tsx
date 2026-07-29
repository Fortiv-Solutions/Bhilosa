// Material Request Work Queue — Production, server-paginated container.
// Search / filter / sort / pagination all execute in Postgres (via the
// search_material_requests RPC); the client loads one 15-row page at a time,
// so the page stays fast with hundreds or thousands of records.

'use client';

import { useState, useMemo, useEffect } from 'react';
import { HardHat, Plus } from 'lucide-react';
import type {
  MaterialRequestRow,
  PurchaseRequisitionRow,
  InventorySnapshotRow,
  ProcurementProjectOption,
  Role,
} from '@/lib/erp/material-request/types';
import type { ProcurementLineRow } from '@/lib/procurement';
import { createMaterialRequest } from '@/lib/procurement';
import {
  listMaterialRequestsPaged, getMaterialRequestStats, listReviewers,
  type MrSort, type MrStats, type ReviewerOption,
} from '@/lib/erp/material-request/service';
import { MRStatsBar } from './mr-stats-bar';
import { MRRequestsFilterBar, EMPTY_MR_FILTERS, type MrRequestFilters } from './mr-requests-filter-bar';
import { MRTableView } from './mr-table-view';
import { MRInspectorPanel } from './mr-inspector-panel';
import { CreateMRModal } from './create-mr-modal';
import { MRPdfPreviewModal } from './mr-pdf-preview-modal';
import { Pagination } from '../pagination';

const PAGE_SIZE = 15;

const WORK_ACTIVITIES = [
  'Slab casting', 'Brick work', 'Plaster work', 'Waterproofing', 'Electrical work',
  'Plumbing', 'Tile work', 'Finishing', 'Excavation', 'Foundation', 'Other',
];

const ZERO_STATS: MrStats = {
  total: 0, pending: 0, critical: 0, overdue: 0, underReview: 0, clarification: 0, fulfilled: 0, converted: 0,
};

interface MaterialRequestWorkQueueProps {
  // `materialRequests` / `inventorySnapshots` / `loading` are accepted for
  // backward compatibility with the parent page but the list now self-fetches.
  materialRequests?: MaterialRequestRow[];
  purchaseRequisitions: PurchaseRequisitionRow[];
  inventorySnapshots?: InventorySnapshotRow[];
  projectOptions: ProcurementProjectOption[];
  /**
   * Pins the queue to one project: the project filter is forced to this id and
   * locked in the UI, so a project-scoped mount can never list another project's MRs.
   */
  lockedProjectId?: string;
  activeRole: Role;
  loading?: boolean;
  onConvertToPr: (mr: MaterialRequestRow, approvedLines?: ProcurementLineRow[]) => void;
  /** Generates and downloads the report-format Material Request PDF. */
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Load reviewers once.
  useEffect(() => { listReviewers().then(setReviewers).catch(() => {}); }, []);

  // Debounce the search box; typing resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch the current page whenever anything that affects it changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMaterialRequestsPaged({ ...filters, search: debouncedSearch, sort, page, pageSize: PAGE_SIZE })
      .then((res) => { if (!cancelled) { setRows(res.rows); setTotal(res.total); } })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Unable to load material requests.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters, sort, page, reloadKey]);

  // Refresh the KPI roll-up on project change / after mutations.
  useEffect(() => {
    getMaterialRequestStats(filters.projectId || null).then(setStats).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.projectId, reloadKey]);

  const selectedMr = useMemo(() => rows.find((mr) => mr.id === selectedMrId) ?? null, [rows, selectedMrId]);
  const linkedPrFor = (mr: MaterialRequestRow) => purchaseRequisitions.find((pr) => pr.material_request_id === mr.id);

  // A locked project survives every filter change and reset.
  function updateFilters(patch: Partial<MrRequestFilters>) {
    setFilters((f) => ({ ...f, ...patch, ...(lockedProjectId ? { projectId: lockedProjectId } : {}) }));
    setPage(1);
    setSelectedMrId(null);
  }
  function changeSort(s: MrSort) { setSort(s); setPage(1); }
  function resetFilters() {
    setSearch(''); setDebouncedSearch('');
    setFilters({ ...EMPTY_MR_FILTERS, projectId: lockedProjectId ?? '' });
    setSort('newest'); setPage(1); setSelectedMrId(null);
  }
  function goToPage(p: number) { setPage(p); setSelectedMrId(null); }

  async function runAction(label: string, fn: () => Promise<{ data: unknown; error: Error | null }>) {
    const result = await fn();
    if (result.error) { onError(result.error.message); return; }
    onMessage(label);
    setReloadKey((k) => k + 1);
    onRefresh?.().catch(() => {});
  }

  async function handleCreateMrSubmit(
    projectId: string,
    title: string,
    priority: MaterialRequestRow['priority'],
    requiredDate: string,
    lines: { itemDescription: string; quantity: number; estimatedRate: number }[],
  ) {
    const res = await createMaterialRequest({ projectId: lockedProjectId ?? projectId, title, priority, requiredDate, lines });
    if (res.error) { onError(res.error.message); return; }
    onMessage('New Material Request raised successfully.');
    setCreateModalOpen(false);
    setPage(1);
    setReloadKey((k) => k + 1);
    onRefresh?.().catch(() => {});
  }

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
        onOpenCreate={() => setCreateModalOpen(true)}
      />

      {loading && rows.length === 0 ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card" />)}
        </div>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <HardHat className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">No material requests match your filters</p>
          <p className="mt-1 mb-4 text-xs text-muted-foreground/70">Adjust the search or filters, or raise a new request.</p>
          <button onClick={() => setCreateModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Raise Material Request
          </button>
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
              onConvertToPr={(mr, lines) => {
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

      {createModalOpen && (
        <CreateMRModal
          projectOptions={projectOptions}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={handleCreateMrSubmit}
        />
      )}
    </div>
  );
}

export { WORK_ACTIVITIES };
