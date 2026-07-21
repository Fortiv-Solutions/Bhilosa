'use client';

// PR activity / audit-trail drawer. Reads the append-only pr_activity_log.

import { useEffect, useState } from 'react';
import { X, History, ArrowRight } from 'lucide-react';
import { listPrActivity, type PrActivityRow } from '@/lib/erp/purchase-requisition/service';
import { statusMeta } from './pr-badges';

interface PrHistoryDrawerProps {
  open: boolean;
  prId: string | null;
  prNumber: string | null;
  onClose: () => void;
}

export function PrHistoryDrawer({ open, prId, prNumber, onClose }: PrHistoryDrawerProps) {
  const [rows, setRows] = useState<PrActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !prId) return;
    setLoading(true);
    listPrActivity(prId).then(setRows).finally(() => setLoading(false));
  }, [open, prId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="PR activity history">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="h-4 w-4" /></span>
            <div>
              <h3 className="font-heading text-base font-bold">Activity History</h3>
              {prNumber && <p className="text-[11px] text-muted-foreground">{prNumber}</p>}
            </div>
          </div>
          <button onClick={onClose} title="Close (Esc)" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/50" />)}</div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-4">
              {rows.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-card" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">{r.action}</p>
                    <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString('en-IN')}</span>
                  </div>
                  {(r.previous_status || r.new_status) && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {r.previous_status && <span className="capitalize">{statusMeta(r.previous_status).label}</span>}
                      <ArrowRight className="h-3 w-3" />
                      {r.new_status && <span className="font-semibold capitalize text-foreground">{statusMeta(r.new_status).label}</span>}
                    </div>
                  )}
                  {r.comment && <p className="mt-1 rounded-md bg-muted/40 px-2 py-1 text-xs text-foreground">{r.comment}</p>}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{r.profiles?.name || 'System'}{r.actor_role ? ` · ${r.actor_role.replaceAll('_', ' ')}` : ''}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
