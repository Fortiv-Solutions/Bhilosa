'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShoppingBag,
  Ban,
} from 'lucide-react';
import { shortCloseEntirePurchaseOrder } from '@/lib/procurement';
import { supabase } from '@/utils/supabase-client';

export interface PoCloseModalLineItem {
  id?: string;
  item_code?: string;
  item_desc: string;
  unit?: string;
  ordered_qty: number;
  received_qty: number;
  balance_qty: number;
  item_group?: string;
  activity_name?: string;
}

interface PoCloseModalProps {
  poId: string;
  poNumber: string;
  items?: PoCloseModalLineItem[];
  onSuccess: (newStatus: string) => void;
  onClose: () => void;
}

export function PoCloseModal({ poId, poNumber, items, onSuccess, onClose }: PoCloseModalProps) {
  const [lineItems, setLineItems] = useState<PoCloseModalLineItem[]>(items || []);
  const [loadingItems, setLoadingItems] = useState(!items || items.length === 0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items && items.length > 0) {
      setLineItems(items);
      setLoadingItems(false);
      return;
    }

    if (!poId) {
      setLoadingItems(false);
      return;
    }

    let isMounted = true;
    setLoadingItems(true);

    async function fetchLines() {
      try {
        const { data, error: err } = await supabase
          .from('purchase_order_lines')
          .select('id, item_code, item_description, unit, quantity, received_qty, grn_balance_qty, item_group, activity_name')
          .eq('purchase_order_id', poId);

        if (!isMounted) return;
        setLoadingItems(false);
        if (!err && data) {
          const mapped: PoCloseModalLineItem[] = data.map((l) => {
            const ordered = Number(l.quantity) || 0;
            const rcvd = Number(l.received_qty) || 0;
            const bal = Math.max(0, ordered - rcvd);
            return {
              id: l.id,
              item_code: l.item_code ?? undefined,
              item_desc: l.item_description ?? 'Line Item',
              unit: l.unit ?? '',
              ordered_qty: ordered,
              received_qty: rcvd,
              balance_qty: bal,
              item_group: l.item_group ?? undefined,
              activity_name: l.activity_name ?? undefined,
            };
          });
          setLineItems(mapped);
        }
      } catch {
        if (isMounted) setLoadingItems(false);
      }
    }

    void fetchLines();

    return () => {
      isMounted = false;
    };
  }, [poId, items]);

  // Derived Summary Statistics
  const totalOrderedQty = lineItems.reduce((acc, curr) => acc + (curr.ordered_qty || 0), 0);
  const totalReceivedQty = lineItems.reduce((acc, curr) => acc + (curr.received_qty || 0), 0);
  const totalBalanceQty = lineItems.reduce((acc, curr) => acc + (curr.balance_qty || 0), 0);

  const receivedItemsCount = lineItems.filter((i) => (i.received_qty || 0) > 0).length;
  const unreceivedItemsCount = lineItems.filter((i) => (i.balance_qty || 0) > 0).length;
  const totalItemsCount = lineItems.length;

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
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-amber-500/10 shrink-0">
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
            <Lock className="h-5 w-5" />
            <div>
              <h2 className="font-heading text-base font-bold uppercase tracking-wider">
                Close Purchase Order ({poNumber})
              </h2>
              <p className="text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80">
                Review received & unreceived item balance status prior to short-closing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Summary Stat Cards Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Card 1: Total Ordered */}
            <div className="rounded-xl border border-border/80 bg-background p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold mb-1">
                <span className="flex items-center gap-1.5">
                  <ShoppingBag className="h-4 w-4 text-blue-500" /> Total Ordered
                </span>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono font-bold">
                  {totalItemsCount} Lines
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {totalOrderedQty.toLocaleString()}{' '}
                <span className="text-xs font-normal text-muted-foreground">Units</span>
              </div>
            </div>

            {/* Card 2: Received Items & Qty */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Received Item / Qty
                </span>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                  {receivedItemsCount} / {totalItemsCount} Items
                </span>
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {totalReceivedQty.toLocaleString()}{' '}
                <span className="text-xs font-normal text-emerald-600/70">Units Received</span>
              </div>
            </div>

            {/* Card 3: Unreceived & Balance Qty (Will Be Rejected) */}
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-xs font-semibold mb-1">
                <span className="flex items-center gap-1.5">
                  <Ban className="h-4 w-4 text-amber-500" /> Unreceived / Balance
                </span>
                <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                  {unreceivedItemsCount} Items Left
                </span>
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {totalBalanceQty.toLocaleString()}{' '}
                <span className="text-xs font-normal text-amber-600/70">Units to Close</span>
              </div>
            </div>
          </div>

          {/* Impact Notice Banner */}
          {totalBalanceQty > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 flex gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-100">
                  Impact of Short-Closing Purchase Order
                </p>
                <p className="mt-1 leading-relaxed">
                  Short-closing this PO will waive all unreceived balance quantities (
                  <strong>{totalBalanceQty.toLocaleString()} units</strong> across{' '}
                  <strong>{unreceivedItemsCount} line(s)</strong>) and lock future Goods Receipts (GRN).
                  Remaining unfulfilled commitments will be released back to the project budget headroom.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>100% Fulfilled Order:</strong> All {totalOrderedQty.toLocaleString()} ordered
                units have been fully received. Short-closing will formally mark this order as complete.
              </span>
            </div>
          )}

          {/* Item-Wise Status Breakdown Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Item-Wise Fulfillment & Balance Breakdown</span>
              <span>{lineItems.length} Total Lines</span>
            </div>

            <div className="rounded-xl border border-border/80 overflow-hidden bg-background shadow-2xs">
              {loadingItems ? (
                <div className="p-8 text-center text-xs text-muted-foreground font-medium">
                  Loading PO line items status…
                </div>
              ) : lineItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground italic font-medium">
                  No line items found for this purchase order.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-muted/70 text-[11px] font-bold text-muted-foreground uppercase border-b border-border/60">
                        <th className="py-2.5 px-3.5">Item Description / Code</th>
                        <th className="py-2.5 px-3 text-right">Ordered Qty</th>
                        <th className="py-2.5 px-3 text-right">Received Qty</th>
                        <th className="py-2.5 px-3 text-right">Balance Qty</th>
                        <th className="py-2.5 px-3.5 text-center">Effect on Close</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-xs">
                      {lineItems.map((item, idx) => {
                        const isUnreceived = item.balance_qty > 0;
                        return (
                          <tr
                            key={idx}
                            className={
                              isUnreceived
                                ? 'bg-amber-500/5 hover:bg-amber-500/10 transition-colors'
                                : 'hover:bg-muted/30 transition-colors'
                            }
                          >
                            <td className="py-2.5 px-3.5 align-middle">
                              <div className="font-semibold text-foreground">{item.item_desc}</div>
                              {item.item_code && (
                                <div className="text-[10px] font-mono text-muted-foreground font-medium">
                                  Code: {item.item_code}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium align-middle">
                              {item.ordered_qty.toLocaleString()} {item.unit || ''}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 align-middle">
                              {item.received_qty.toLocaleString()} {item.unit || ''}
                            </td>
                            <td className="py-2.5 px-3 text-right font-extrabold text-amber-600 dark:text-amber-400 align-middle">
                              {item.balance_qty.toLocaleString()} {item.unit || ''}
                            </td>
                            <td className="py-2.5 px-3.5 text-center align-middle">
                              {isUnreceived ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  <Ban className="h-3 w-3" />
                                  Cancel {item.balance_qty.toLocaleString()} {item.unit || ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Fully Received
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Reason Field */}
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
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="text-[11px] text-muted-foreground font-medium">
            {unreceivedItemsCount > 0
              ? `${unreceivedItemsCount} unreceived line item(s) will be closed.`
              : 'All line items fully received.'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleShortClose}
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
        </div>
      </div>
    </div>
  );
}
