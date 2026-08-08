'use client';

// ============================================================================
// STATUS ACTION BAR
//
// Replaces the free status <select> that used to drive work_orders.wo_status
// straight from the browser. Only transitions that are legal from the current
// state AND permitted for the signed-in role are rendered, and any move needing
// a reason collects one before it is sent.
//
// This controls affordances only. Every action still goes through
// set_work_order_status() / set_service_bill_status(), which re-validate the
// move, the authority and the reason server-side.
// ============================================================================

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export type StatusAction<S extends string> = {
  status: S;
  label: string;
  /** Prompt for a mandatory reason before firing. */
  needsReason: boolean;
  /** Visual weight: 'primary' advances the document, 'danger' ends it. */
  tone: 'primary' | 'neutral' | 'danger';
  /** Shown on hover; also used as the disabled explanation. */
  hint?: string;
  /** When set, the action renders disabled and this is why. */
  disabledReason?: string | null;
};

const TONE_CLASS: Record<StatusAction<string>['tone'], string> = {
  primary:
    'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
  neutral:
    'border-border bg-background text-foreground hover:bg-muted',
  danger:
    'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300',
};

export function StatusActionBar<S extends string>({
  actions,
  onAction,
  busy = false,
  size = 'md',
  emptyLabel,
}: {
  actions: StatusAction<S>[];
  onAction: (status: S, reason?: string) => void | Promise<void>;
  busy?: boolean;
  size?: 'sm' | 'md';
  /** Rendered when no transition is available (terminal state, or no rights). */
  emptyLabel?: string;
}) {
  const [pending, setPending] = useState<StatusAction<S> | null>(null);
  const [reason, setReason] = useState('');

  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  if (actions.length === 0) {
    return emptyLabel ? (
      <span className="text-[11px] font-semibold text-muted-foreground">{emptyLabel}</span>
    ) : null;
  }

  async function fire(action: StatusAction<S>, withReason?: string) {
    await onAction(action.status, withReason);
    setPending(null);
    setReason('');
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => {
          const disabled = busy || Boolean(action.disabledReason);
          return (
            <button
              key={action.status}
              type="button"
              disabled={disabled}
              title={action.disabledReason || action.hint || action.label}
              onClick={() => {
                if (action.needsReason) {
                  setReason('');
                  setPending(action);
                } else {
                  void fire(action);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border font-bold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${TONE_CLASS[action.tone]}`}
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {action.label}
            </button>
          );
        })}
      </div>

      {/* Reason capture. Replaces window.prompt(), which could not be
          validated, styled, or cancelled cleanly. */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <h3 className="text-sm font-bold">{pending.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This reason is recorded permanently in the audit trail and cannot be edited later.
                </p>
              </div>
            </div>

            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (required)"
              className="mt-3 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary"
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setReason('');
                }}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reason.trim() || busy}
                onClick={() => void fire(pending, reason.trim())}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
