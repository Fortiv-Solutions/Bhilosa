'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';
import { poStatusLabel, type PoStatus } from '@/lib/erp/purchase-order/status';

interface PoRejectModalProps {
  po: PurchaseOrderRow;
  /** The transition being confirmed. Both require a reason server-side. */
  action: Extract<PoStatus, 'rejected' | 'cancelled'>;
  onConfirm: (reason: string) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Collects the written reason the database requires before it will accept
 * a rejection or a cancellation.
 *
 * The reject path had no user interface at all: `rejectPurchaseOrder` was
 * exported but never called from anywhere, and the column it wrote did not
 * exist, so a purchase order could only ever move forwards.
 */
export function PoRejectModal({ po, action, onConfirm, onClose }: PoRejectModalProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const verb = action === 'rejected' ? 'Reject' : 'Cancel';
  const trimmed = reason.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading">
                {verb} purchase order {po.po_number}
              </h2>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Currently {poStatusLabel(po.status)} · ₹
                {Number(po.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
            Reason (required)
          </label>
          <textarea
            rows={4}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              action === 'rejected'
                ? 'Why is this purchase order being sent back? The buyer sees this on the order.'
                : 'Why is this purchase order being cancelled?'
            }
            className="w-full rounded-lg border border-border bg-background p-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-[11px] font-medium text-muted-foreground">
            Recorded against the order and kept in its status history.
            {action === 'cancelled' &&
              ' An order with goods already received cannot be cancelled — short-close it instead.'}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            Keep order
          </button>
          <button
            onClick={() => void submit()}
            disabled={!trimmed || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {verb} purchase order
          </button>
        </div>
      </div>
    </div>
  );
}
