'use client';

import React, { useState } from 'react';
import { formatIndianCurrency } from '@/utils/format-currency';
import { AlertTriangle, ArrowRight, CheckCircle2, DollarSign, Layers, Package, RefreshCw, X } from 'lucide-react';
import type { MasterBudgetItem } from '@/lib/budget';

interface VarianceResolutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: MasterBudgetItem | null;
  actualRate?: number;
  actualQuantity?: number;
  actualVendor?: string;
  onSelectAction: (
    action: 'revise_budget' | 'update_quantity' | 'replace_material',
    details: {
      newBudgetAmount?: number;
      newQuantity?: number;
      remarks?: string;
    }
  ) => void;
}

export default function VarianceResolutionDrawer({
  isOpen,
  onClose,
  item,
  actualRate = 0,
  actualQuantity = 0,
  actualVendor = '',
  onSelectAction,
}: VarianceResolutionDrawerProps) {
  if (!isOpen || !item) return null;

  const currentItem = item;
  const estimatedTotal = currentItem.cost;
  const actualUnitRate = actualRate || currentItem.rate;
  const actualQty = actualQuantity || currentItem.qtyTotal;
  const actualTotal = actualUnitRate * actualQty;
  const varianceAmount = actualTotal - estimatedTotal;
  const variancePercent = estimatedTotal > 0 ? (varianceAmount / estimatedTotal) * 100 : 0;
  const isOverBudget = varianceAmount > 0;

  const maxPermissibleQty = actualUnitRate > 0 ? Math.floor(currentItem.cost / actualUnitRate) : currentItem.qtyTotal;

  const [selectedOption, setSelectedOption] = useState<'revise_budget' | 'update_quantity' | 'replace_material'>('revise_budget');
  const [revisionRemarks, setRevisionRemarks] = useState('');
  const [adjustedQty, setAdjustedQty] = useState(maxPermissibleQty);
  const [revisionAmount, setRevisionAmount] = useState(actualTotal);

  function handleSubmit() {
    if (selectedOption === 'revise_budget') {
      onSelectAction('revise_budget', {
        newBudgetAmount: revisionAmount,
        remarks: revisionRemarks || `Budget revision requested due to rate variance from ₹${currentItem.rate} to ₹${actualUnitRate}`,
      });
    } else if (selectedOption === 'update_quantity') {
      onSelectAction('update_quantity', {
        newQuantity: adjustedQty,
        remarks: `Quantity reduced from ${currentItem.qtyTotal} to ${adjustedQty} ${currentItem.unit} to remain within baseline budget limit.`,
      });
    } else {
      onSelectAction('replace_material', {
        remarks: `Initiating value engineering / vendor quote replacement for ${currentItem.item}.`,
      });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl border-l border-border bg-card p-6 shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <div className={`rounded-lg p-2 ${isOverBudget ? 'bg-red-50 text-red-600 dark:bg-red-950/30' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30'}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-semibold text-foreground">Budget Variance Detected</h2>
                <p className="text-xs text-muted-foreground">{item.category}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Item & Variance Details */}
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <h3 className="text-sm font-bold text-foreground">{currentItem.item}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Scope Tag: <span className="font-semibold uppercase">{currentItem.scopeTag?.replaceAll('_', ' ') || 'General'}</span> | Unit: <span className="font-semibold">{currentItem.unit}</span>
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Baseline Estimate</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{formatIndianCurrency(estimatedTotal)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {currentItem.qtyTotal} {currentItem.unit} @ ₹{currentItem.rate}/{currentItem.unit}
                  </p>
                </div>

                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Actual Requested / Invoiced</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{formatIndianCurrency(actualTotal)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {actualQty} {currentItem.unit} @ ₹{actualUnitRate}/{currentItem.unit} {actualVendor ? `(${actualVendor})` : ''}
                  </p>
                </div>
              </div>

              {/* Variance Banner */}
              <div className={`mt-3 flex items-center justify-between rounded-lg p-3 text-xs font-semibold ${isOverBudget ? 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400' : 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400'}`}>
                <span>Variance: {isOverBudget ? '+' : ''}{formatIndianCurrency(varianceAmount)} ({variancePercent.toFixed(1)}%)</span>
                <span>{isOverBudget ? '🔴 Over Budget' : '🟢 Within Budget'}</span>
              </div>
            </div>

            {/* Prominently Highlighted 3 Options */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prominently Highlighted Resolution Options</p>
              <div className="mt-3 space-y-3">
                {/* Option 1: Revise Budget */}
                <label
                  onClick={() => setSelectedOption('revise_budget')}
                  className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
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
                    <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Option 1: Revise the Project Budget
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Submit a formal budget revision request to Upper Management to increase this allocation or reallocate funds from another head.
                    </p>
                    {selectedOption === 'revise_budget' && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>New Budget Ceiling:</span>
                          <span className="font-bold text-primary">{formatIndianCurrency(revisionAmount)}</span>
                        </div>
                        <textarea
                          value={revisionRemarks}
                          onChange={(e) => setRevisionRemarks(e.target.value)}
                          placeholder="Enter justification for budget revision..."
                          className="w-full rounded-lg border border-border bg-background p-2 text-xs normal-case outline-none"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </label>

                {/* Option 2: Update Required Quantity */}
                <label
                  onClick={() => setSelectedOption('update_quantity')}
                  className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
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
                    <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                      <Package className="h-4 w-4 text-amber-600" />
                      Option 2: Update the Required Quantity
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reduce the requested quantity so that total spend fits within the approved baseline allocation.
                    </p>
                    {selectedOption === 'update_quantity' && (
                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Max Permissible Qty:</span>
                          <span className="font-bold text-amber-600">
                            {maxPermissibleQty} {currentItem.unit}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={adjustedQty}
                            onChange={(e) => setAdjustedQty(Number(e.target.value))}
                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs font-medium outline-none"
                          />
                          <span className="text-xs font-semibold text-muted-foreground">{currentItem.unit}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Revised Total Cost: <span className="font-bold">{formatIndianCurrency(adjustedQty * actualUnitRate)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </label>

                {/* Option 3: Replace Material / Vendor */}
                <label
                  onClick={() => setSelectedOption('replace_material')}
                  className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
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
                    <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                      <RefreshCw className="h-4 w-4 text-emerald-600" />
                      Option 3: Replace Material or Change Vendor
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Value engineering option: select an alternative material brand/grade or negotiate with secondary vendors to match the target rate of ₹{currentItem.rate}/{currentItem.unit}.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
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
                Apply Selected Resolution
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
