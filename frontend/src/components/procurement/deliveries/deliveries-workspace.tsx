'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { listPendingDeliveries, type PendingDeliveryRow } from '@/lib/erp/purchase-order/delivery-followup';
import { DeliveriesStatsBar } from './deliveries-stats-bar';
import { DeliveriesTableView } from './deliveries-table-view';
import { DeliveryFollowUpModal } from './delivery-followup-modal';

interface DeliveriesWorkspaceProps {
  projectId?: string;
}

export function DeliveriesWorkspace({ projectId }: DeliveriesWorkspaceProps) {
  const [rows, setRows] = useState<PendingDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [followUpTarget, setFollowUpTarget] = useState<PendingDeliveryRow | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    listPendingDeliveries(projectId)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const bumpFollowUpCount = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, followUpCount: r.followUpCount + 1 } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground font-heading">Pending Deliveries</h2>
          <p className="text-[11px] font-medium text-muted-foreground">
            Purchase orders still awaiting goods, sorted most-urgent-first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLiveSupabase() && (
            <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Demo Data
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      <DeliveriesStatsBar rows={rows} />
      <DeliveriesTableView rows={rows} onLogFollowUp={setFollowUpTarget} />

      {followUpTarget && (
        <DeliveryFollowUpModal
          row={followUpTarget}
          onClose={() => setFollowUpTarget(null)}
          onLogged={() => bumpFollowUpCount(followUpTarget.id)}
        />
      )}
    </div>
  );
}
