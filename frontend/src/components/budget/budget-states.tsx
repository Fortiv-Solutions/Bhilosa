'use client';

// ============================================================================
// Shared loading / error / empty states for the Budget module.
//
// Before this existed, none of the five Budget tabs had any loading state, error
// banner or try/catch: a failed or slow query rendered ₹0 totals that looked like
// real data. <BudgetGate> makes that impossible.
// ============================================================================

import React from 'react';
import { AlertTriangle, Inbox, Loader2, LockKeyhole, RefreshCcw } from 'lucide-react';
import { useBudgetData } from './budget-data-context';

export function BudgetLoading({ label = 'Loading live budget data…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-2xs"
    >
      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <div className="mt-2 w-full max-w-md space-y-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}

export function BudgetError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-300 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-bold text-red-900 dark:text-red-300">
            Could not load budget data
          </p>
          <p className="break-words text-xs font-medium text-red-800 dark:text-red-400">{message}</p>
          <p className="pt-1 text-[11px] text-red-700/80 dark:text-red-400/70">
            No figures are shown because none could be verified against Supabase.
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex h-8.5 flex-shrink-0 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function BudgetAuthRequired() {
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20"
    >
      <div className="flex items-start gap-3">
        <LockKeyhole className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Sign in required</p>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
            Budget data is protected by row-level security. Sign in with your Pramukh ERP account to
            view the master budget, variance sheet and bill ledger.
          </p>
          <a
            href="/login"
            className="mt-2 inline-flex h-8.5 items-center rounded-lg bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700"
          >
            Go to sign in
          </a>
        </div>
      </div>
    </div>
  );
}

export function BudgetEmpty({
  title = 'No budget data yet',
  detail = 'Import a master budget schedule to get started.',
  action,
}: {
  title?: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
      <Inbox className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{detail}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

/**
 * Renders the correct state for the module: auth wall, error, skeleton, empty, or
 * the real content. Every Budget tab wraps its body in this.
 */
export function BudgetGate({
  children,
  requireCategories = true,
  emptyTitle,
  emptyDetail,
  emptyAction,
  loadingLabel,
}: {
  children: React.ReactNode;
  /** When true, an empty master budget renders the empty state instead of content. */
  requireCategories?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  emptyAction?: React.ReactNode;
  loadingLabel?: string;
}) {
  const { loading, refreshing, error, needsAuth, categories, refresh } = useBudgetData();

  if (needsAuth) return <BudgetAuthRequired />;
  if (loading) return <BudgetLoading label={loadingLabel} />;
  if (error) return <BudgetError message={error} onRetry={() => void refresh()} retrying={refreshing} />;
  if (requireCategories && categories.length === 0) {
    return <BudgetEmpty title={emptyTitle} detail={emptyDetail} action={emptyAction} />;
  }
  return <>{children}</>;
}
