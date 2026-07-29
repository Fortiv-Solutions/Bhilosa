'use client';

// Reusable workflow confirmation modal. Shows current -> new status, the action,
// an optional/required reason or comment, an optional notify toggle, and uses a
// stronger (danger) style for destructive / reversal actions.

import { useState } from 'react';
import { X, ArrowRight, AlertTriangle, Check } from 'lucide-react';
import { PrStatusBadge } from './pr-badges';

export interface PrConfirmConfig {
  title: string;
  action: string;
  fromStatus: string;
  toStatus?: string | null;
  danger?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  showNotify?: boolean;
  assignedUserName?: string | null;
  confirmLabel: string;
}

interface PrConfirmModalProps {
  config: PrConfirmConfig | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notify: boolean) => void;
}

export function PrConfirmModal({ config, submitting, onClose, onConfirm }: PrConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);

  if (!config) return null;
  const needsReason = Boolean(config.reasonLabel);
  const blocked = config.reasonRequired && !reason.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={config.title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className={`flex items-center justify-between border-b border-border px-5 py-3 ${config.danger ? 'bg-red-50/60 dark:bg-red-950/20' : 'bg-muted/20'}`}>
          <div className="flex items-center gap-2">
            {config.danger && <AlertTriangle className="h-4 w-4 text-red-600" />}
            <h3 className="font-heading text-base font-bold">{config.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-5 text-sm">
          <p className="text-muted-foreground">You are about to <span className="font-semibold text-foreground">{config.action}</span>.</p>

          {config.toStatus && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3">
              <div><p className="mb-1 text-[10px] uppercase text-muted-foreground">Current</p><PrStatusBadge status={config.fromStatus} /></div>
              <ArrowRight className="mt-4 h-4 w-4 text-muted-foreground" />
              <div><p className="mb-1 text-[10px] uppercase text-muted-foreground">New</p><PrStatusBadge status={config.toStatus} /></div>
            </div>
          )}

          {config.assignedUserName && (
            <p className="text-xs text-muted-foreground">Assigned to: <span className="font-semibold text-foreground">{config.assignedUserName}</span></p>
          )}

          {needsReason && (
            <div>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {config.reasonLabel}{config.reasonRequired && <span className="text-red-500"> *</span>}
              </label>
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={config.reasonLabel}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
              />
            </div>
          )}

          {config.showNotify && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[color:var(--color-primary)]" />
              Notify the assigned user
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-muted">Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim(), notify)}
            disabled={blocked || submitting}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-40 ${config.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90 text-primary-foreground'}`}
          >
            <Check className="h-3.5 w-3.5" /> {submitting ? 'Working…' : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
