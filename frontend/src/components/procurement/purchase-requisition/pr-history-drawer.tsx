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
    if (!open || (!prId && !prNumber)) return;
    setLoading(true);
    listPrActivity(prId || '', prNumber).then(setRows).finally(() => setLoading(false));
  }, [open, prId, prNumber]);

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
              {rows.map((r, idx) => {
                const now = new Date();
                const logDate = r.created_at ? new Date(r.created_at) : now;
                const diffMs = Math.max(0, now.getTime() - logDate.getTime());
                const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                
                const isOldest = idx === rows.length - 1;
                const isCreation = r.action === 'PR Draft Created' || r.action === 'PR Created / Drafted' || r.previous_status === 'created';
                
                let fromStatus = r.previous_status || 'draft';
                if (isCreation || (isOldest && (!r.previous_status || r.previous_status === 'created'))) {
                  fromStatus = 'created';
                }
                const toStatus = r.new_status === 'approved' ? 'approved' : (r.new_status || 'draft');

                const atStr = logDate.toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                }).toUpperCase().replace(',', '');

                const rawActor = r.profiles?.name;
                const actorName = (rawActor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawActor))
                  ? rawActor
                  : 'Executive Director';

                return (
                  <li key={r.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-card" />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground capitalize">
                        {r.action || `${fromStatus} → ${toStatus}`}
                      </p>
                      <span className="text-[10px] font-semibold text-muted-foreground">{daysSince === 0 ? 'Today' : `${daysSince} day(s) ago`}</span>
                    </div>

                    <div className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
                      <p><span className="font-semibold text-foreground">FROM:</span> <span className="capitalize">{fromStatus}</span> &nbsp;|&nbsp; <span className="font-semibold text-foreground">TO:</span> <span className="capitalize">{toStatus}</span></p>
                      <p><span className="font-semibold text-foreground">BY:</span> {actorName}</p>
                      <p><span className="font-semibold text-foreground">AT:</span> {atStr}</p>
                      {r.comment && <p className="mt-1 rounded-md bg-muted/40 px-2 py-1 text-xs text-foreground font-medium"><span className="font-bold">REMARKS:</span> {r.comment}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
