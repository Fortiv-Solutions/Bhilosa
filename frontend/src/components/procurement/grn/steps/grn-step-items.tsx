'use client';

import React from 'react';
import { Layers, ChevronRight, ChevronLeft, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import type { GrnWizardState } from '../hooks/use-grn-form';
import type { LineValidationStatus } from '../hooks/use-grn-validation';

interface GrnStepItemsProps {
  state: GrnWizardState;
  updateItem: (index: number, updates: Partial<any>) => void;
  getLineStatus: (received: number, balance: number, maxAllowable: number) => LineValidationStatus;
  onNext: () => void;
  onBack: () => void;
  isValid: boolean;
}

export function GrnStepItems({ state, updateItem, getLineStatus, onNext, onBack, isValid }: GrnStepItemsProps) {
  if (state.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground shadow-sm">
        <Layers className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="text-sm">No items found for this PO.</p>
        <button onClick={onBack} className="mt-4 text-xs font-bold text-primary underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">Item Description</th>
                <th className="px-3 py-2.5 font-semibold">UOM</th>
                <th className="px-3 py-2.5 font-semibold text-right">PO Qty</th>
                <th className="px-3 py-2.5 font-semibold text-right">Prev Received</th>
                <th className="px-3 py-2.5 font-semibold text-right border-r border-border">Rem. Balance</th>
                <th className="px-3 py-2.5 font-semibold text-right bg-blue-50/50 dark:bg-blue-950/20">Challan Qty</th>
                <th className="px-3 py-2.5 font-semibold text-right bg-blue-50/50 dark:bg-blue-950/20">Received Qty</th>
                <th className="px-3 py-2.5 font-semibold text-right bg-blue-50/50 dark:bg-blue-950/20 border-r border-border">Accepted Qty</th>
                <th className="px-3 py-2.5 font-semibold text-right">Net Total (₹)</th>
                <th className="px-3 py-2.5 font-semibold text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.items.map((item, idx) => {
                const poQty = item.approved_qty || 0;
                const prevReceived = (item.approved_qty || 0) - (item.current_balance_qty || 0); // approx
                const remaining = item.current_balance_qty || 0;
                
                const received = Number(item.received_qty) || 0;
                const accepted = Number(item.received_qty) - Number(item.return_qty || 0);
                
                const netTotal = accepted * (item.unit_rate || 0);
                const balanceAfter = remaining - accepted;
                const maxAllowable = item.max_allowable_qty ?? remaining;
                
                const status = getLineStatus(received, remaining, maxAllowable);

                return (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold max-w-[200px] truncate" title={item.item_description}>
                        {item.item_description}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{item.item_group}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{item.unit}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{poQty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{prevReceived.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold border-r border-border">{remaining.toFixed(2)}</td>
                    
                    {/* Editable Inputs */}
                    <td className="px-3 py-2 bg-blue-50/30 dark:bg-blue-950/10">
                      <input 
                        type="number"
                        value={item.challan_qty || ''}
                        onChange={e => updateItem(idx, { challan_qty: parseFloat(e.target.value) || 0 })}
                        className="w-20 h-7 text-xs rounded border border-border bg-background px-2 text-right font-mono"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2 bg-blue-50/30 dark:bg-blue-950/10">
                      <div className="flex flex-col items-end gap-1">
                        <input 
                          type="number"
                          value={item.received_qty || ''}
                          onChange={e => updateItem(idx, { received_qty: parseFloat(e.target.value) || 0 })}
                          className={`w-20 h-7 text-xs rounded border bg-background px-2 text-right font-mono ${
                            status === 'over_tolerance' ? 'border-red-500' : 
                            status === 'within_tolerance' ? 'border-amber-500' : 'border-border'
                          }`}
                          placeholder="0.00"
                        />
                        {received > 0 && status === 'in_balance' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <ShieldCheck className="h-2.5 w-2.5" /> In balance
                          </span>
                        )}
                        {received > 0 && status === 'within_tolerance' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" /> Within tolerance
                          </span>
                        )}
                        {received > 0 && status === 'over_tolerance' && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <XCircle className="h-2.5 w-2.5" /> Over tolerance
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 bg-blue-50/30 dark:bg-blue-950/10 border-r border-border">
                      <input 
                        type="number"
                        value={accepted || ''}
                        onChange={e => {
                          const newAccepted = parseFloat(e.target.value) || 0;
                          const returnQty = Math.max(0, received - newAccepted);
                          updateItem(idx, { return_qty: returnQty });
                        }}
                        className="w-20 h-7 text-xs rounded border border-border bg-background px-2 text-right font-mono"
                        placeholder="0.00"
                      />
                      {item.return_qty > 0 && (
                        <div className="mt-1 text-[9px] text-red-500 font-medium text-right">
                          Rejected: {item.return_qty}
                        </div>
                      )}
                    </td>

                    {/* Auto-calc */}
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      ₹{netTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {balanceAfter.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-bold transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Transport Details
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Review & Submit <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
