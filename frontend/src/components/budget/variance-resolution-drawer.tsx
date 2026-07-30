'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET VARIANCE RESOLUTION DRAWER
// File: frontend/src/components/budget/variance-resolution-drawer.tsx
//
// Opened from the Purchase Requisition form when a PR exceeds available budget.
//
// FIXED — React hooks violation: this component did
//     if (!isOpen || !item) return null;   // line 34
//     ...
//     const [selectedOption, setSelectedOption] = useState(...)  // lines 47-50
// The early return sat ABOVE four useState calls, so opening the drawer changed the
// hook count between renders and React threw "Rendered more hooks than during the
// previous render", crashing the PR form. All hooks now run before any return, and
// the parent controls mounting.
//
// Also: the drawer now receives real budget figures from the caller instead of the
// previous synthetic `sampleVarianceItem` whose "actual" rate was the estimate x 1.2.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, DollarSign, Package, RefreshCw, X } from 'lucide-react';
import { formatIndianCurrency } from '@/utils/format-currency';

export type VarianceResolution = 'revise_budget' | 'update_quantity' | 'replace_material';

export interface VarianceResolutionDetails {
  newBudgetAmount?: number;
  newQuantity?: number;
  remarks?: string;
}

interface VarianceResolutionDrawerProps {
  onClose: () => void;
  /** Human label for the scope in variance (e.g. the activity or first line item). */
  scopeLabel: string;
  /** Budget head / category name for context. */
  categoryLabel: string;
  unit: string;
  /** Budget available to this document before it is raised. */
  availableBudget: number;
  /** What this document is asking for. */
  requestedAmount: number;
  /** Requested quantity, for the quantity-reduction option. */
  requestedQuantity: number;
  /** Unit rate implied by the request. */
  requestedRate: number;
  onSelectAction: (action: VarianceResolution, details: VarianceResolutionDetails) => void;
}

/**
 * Rendered only while open — the PARENT controls mounting
 * (`{isDrawerOpen && <VarianceResolutionDrawer … />}`).
 *
 * That is what fixes the original crash: there is no `isOpen` prop and therefore no
 * early `return null` sitting above the hooks. Mounting on demand also seeds the
 * editable fields from the current budget context with no synchronising effect.
 */
export default function VarianceResolutionDrawer({
  onClose,
  scopeLabel,
  categoryLabel,
  unit,
  availableBudget,
  requestedAmount,
  requestedQuantity,
  requestedRate,
  onSelectAction,
}: VarianceResolutionDrawerProps) {
  const overspend = requestedAmount - availableBudget;
  const overspendPercent = availableBudget > 0 ? (overspend / availableBudget) * 100 : 0;

  /** Largest quantity that still fits inside the available budget. */
  const maxPermissibleQty = useMemo(() => {
    if (requestedRate <= 0) return requestedQuantity;
    return Math.max(0, Math.floor(availableBudget / requestedRate));
  }, [availableBudget, requestedRate, requestedQuantity]);

  const [selectedOption, setSelectedOption] = useState<VarianceResolution>('revise_budget');
  const [revisionRemarks, setRevisionRemarks] = useState('');
  const [adjustedQty, setAdjustedQty] = useState(maxPermissibleQty);
  const [revisionAmount, setRevisionAmount] = useState(requestedAmount);

  // Close on Escape.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSubmit() {
    if (selectedOption === 'revise_budget') {
      onSelectAction('revise_budget', {
        newBudgetAmount: revisionAmount,
        remarks:
          revisionRemarks.trim() ||
          `Budget revision requested: ${scopeLabel} requires ${formatIndianCurrency(requestedAmount)} against ${formatIndianCurrency(availableBudget)} available.`,
      });
    } else if (selectedOption === 'update_quantity') {
      onSelectAction('update_quantity', {
        newQuantity: adjustedQty,
        remarks: `Quantity reduced from ${requestedQuantity} to ${adjustedQty} ${unit} to stay within the approved budget.`,
      });
    } else {
      onSelectAction('replace_material', {
        remarks: `Value engineering / alternate vendor sourcing initiated for ${scopeLabel} to meet the ₹${requestedRate.toLocaleString('en-IN')}/${unit} target rate.`,
      });
    }
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Budget variance resolution"
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm transition-opacity"
    >
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl overflow-y-auto border-l border-border bg-card p-6 shadow-2xl">
          {/* HEADER */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-red-50 p-2 text-red-600 dark:bg-red-950/30">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  Budget variance detected
                </h2>
                <p className="text-xs text-muted-foreground">{categoryLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {/* CONTEXT */}
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <h3 className="text-sm font-bold text-foreground">{scopeLabel}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Unit: <span className="font-semibold">{unit}</span>
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Available budget
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {formatIndianCurrency(availableBudget)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Allocated less committed and spent
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    This request
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {formatIndianCurrency(requestedAmount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {requestedQuantity.toLocaleString('en-IN')} {unit} @ ₹
                    {requestedRate.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                <span>
                  Shortfall: {formatIndianCurrency(overspend)}
                  {availableBudget > 0 && ` (${overspendPercent.toFixed(1)}% over available)`}
                </span>
                <span>Over budget</span>
              </div>
            </div>

            {/* OPTIONS */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Resolution options
              </p>
              <div className="mt-3 space-y-3">
                {/* 1 */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                    selectedOption === 'revise_budget'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="variance_option"
                    checked={selectedOption === 'revise_budget'}
                    onChange={() => setSelectedOption('revise_budget')}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <DollarSign className="h-4 w-4 text-primary" aria-hidden="true" />
                      Request a budget revision
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Send a change-order request to Upper Management to increase this head or
                      reallocate from another. Recorded against the PR as justification.
                    </p>
                    {selectedOption === 'revise_budget' && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <label className="flex items-center justify-between gap-2 text-xs font-semibold">
                          <span>Requested ceiling:</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revisionAmount}
                            onChange={(e) => setRevisionAmount(Math.max(0, Number(e.target.value)))}
                            aria-label="Requested budget ceiling"
                            className="h-8 w-40 rounded-lg border border-border bg-background px-2 text-right font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                          />
                        </label>
                        <textarea
                          value={revisionRemarks}
                          onChange={(e) => setRevisionRemarks(e.target.value)}
                          placeholder="Justification for the budget revision…"
                          className="w-full rounded-lg border border-border bg-background p-2 text-xs normal-case outline-none focus:ring-1 focus:ring-primary"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </label>

                {/* 2 */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                    selectedOption === 'update_quantity'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="variance_option"
                    checked={selectedOption === 'update_quantity'}
                    onChange={() => setSelectedOption('update_quantity')}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Package className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      Reduce the requested quantity
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Trim the quantity so total spend fits inside the approved allocation.
                    </p>
                    {selectedOption === 'update_quantity' && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Maximum permissible:</span>
                          <span className="font-bold text-amber-600">
                            {maxPermissibleQty.toLocaleString('en-IN')} {unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={requestedQuantity}
                            value={adjustedQty}
                            onChange={(e) => setAdjustedQty(Math.max(0, Number(e.target.value)))}
                            aria-label="Adjusted quantity"
                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Revised total:{' '}
                          <span className="font-bold">
                            {formatIndianCurrency(adjustedQty * requestedRate)}
                          </span>
                          {adjustedQty * requestedRate > availableBudget && (
                            <span className="ml-1 font-bold text-red-600">
                              — still over available budget
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </label>

                {/* 3 */}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                    selectedOption === 'replace_material'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="variance_option"
                    checked={selectedOption === 'replace_material'}
                    onChange={() => setSelectedOption('replace_material')}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <RefreshCw className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      Value engineer or change vendor
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select an alternative material grade or negotiate with secondary vendors to
                      reach a rate that fits the allocation.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Apply resolution
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
