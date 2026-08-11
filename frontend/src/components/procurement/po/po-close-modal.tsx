'use client';

import React, { useState } from 'react';
import { X, Lock, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { shortCloseEntirePurchaseOrder } from '@/lib/procurement';

interface PoCloseModalProps {
  poId: string;
  poNumber: string;
  onSuccess: (newStatus: string) => void;
  onClose: () => void;
}

export function PoCloseModal({ poId, poNumber, onSuccess, onClose }: PoCloseModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShortClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for closing this Purchase Order.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data, error: err } = await shortCloseEntirePurchaseOrder(poId, reason);

    setSubmitting(false);

    if (err) {
      setError(err.message || 'Failed to close Purchase Order.');
      return;
    }

    if (data?.newStatus) {
      onSuccess(data.newStatus);
    } else {
      onSuccess('short_closed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-amber-500/10">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Lock className="h-5 w-5" />
            <h2 className="font-heading text-base font-bold uppercase tracking-wider">
              Close Purchase Order ({poNumber})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleShortClose} className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-amber-700 dark:text-amber-300 flex gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="font-bold">Short-Closing Purchase Order</p>
              <p className="mt-1 leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                Short-closing this PO will waive all remaining unfulfilled quantities and lock future Goods Receipts (GRN). Remaining unfulfilled commitments will be released back to the project budget headroom.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-foreground mb-1.5">
              Reason for Short-Closing PO <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Work at site completed; supplier unable to supply remaining balance; unfulfilled quantity no longer required."
              rows={3}
              required
              className="w-full rounded-lg border border-border bg-background p-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <span>Processing…</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Confirm Short-Close
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
