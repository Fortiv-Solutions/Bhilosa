'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquarePlus, X } from 'lucide-react';
import type { PendingDeliveryRow, PoFollowUpRow } from '@/lib/erp/purchase-order/delivery-followup';
import { listPoFollowUps, logPoFollowUp } from '@/lib/erp/purchase-order/delivery-followup';

interface DeliveryFollowUpModalProps {
  row: PendingDeliveryRow;
  onClose: () => void;
  /** Called after a successful log, so the parent can bump the follow-up count without a full refetch. */
  onLogged?: () => void;
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function DeliveryFollowUpModal({ row, onClose, onLogged }: DeliveryFollowUpModalProps) {
  const [note, setNote] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<PoFollowUpRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    listPoFollowUps(row.id)
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [row.id]);

  const trimmed = note.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const result = await logPoFollowUp(row.id, row.project_id, trimmed, promisedDate || null);
      if (!result.error) {
        setHistory((prev) => [
          {
            id: result.data?.id || `local-${Date.now()}`,
            note: trimmed,
            promisedDate: promisedDate || null,
            actorRole: null,
            actorName: 'You',
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setNote('');
        setPromisedDate('');
        onLogged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <MessageSquarePlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading">
                Follow-up — {row.po_number || row.id}
              </h2>
              <p className="text-[11px] font-semibold text-muted-foreground">
                {row.vendor_name || 'Unknown vendor'} · {row.project_name || 'Unknown project'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 py-4">
          <label className="block text-[11px] font-bold uppercase text-muted-foreground">
            Follow-up note
          </label>
          <textarea
            rows={3}
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Called vendor dispatch desk — truck delayed, promised new date below."
            className="w-full rounded-lg border border-border bg-background p-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          <label className="block text-[11px] font-bold uppercase text-muted-foreground pt-1">
            Revised promised date (optional)
          </label>
          <input
            type="date"
            value={promisedDate}
            onChange={(e) => setPromisedDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            Close
          </button>
          <button
            onClick={() => void submit()}
            disabled={!trimmed || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Log follow-up
          </button>
        </div>

        <div className="mt-3 max-h-56 overflow-y-auto border-t border-border pt-3 space-y-2">
          <p className="text-[11px] font-bold uppercase text-muted-foreground">History</p>
          {loadingHistory ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No follow-ups logged yet.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                <p className="text-xs font-medium text-foreground">{h.note}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{h.actorName || h.actorRole || 'Unknown'}</span>
                  <span>{formatDateTime(h.createdAt)}</span>
                </div>
                {h.promisedDate && (
                  <p className="mt-1 text-[10px] font-bold text-primary">
                    Revised delivery promise: {h.promisedDate}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
