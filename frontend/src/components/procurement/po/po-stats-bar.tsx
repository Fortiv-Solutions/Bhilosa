'use client';

import { useState } from 'react';
import {
  ShoppingBag,
  RotateCcw,
  X,
} from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';
import { poStatusGroup, type PoStatusGroup } from '@/lib/erp/purchase-order/status';

interface PoStatsBarProps {
  purchaseOrders: PurchaseOrderRow[];
  onSelectTab?: (tab: string) => void;
}

export function PoStatsBar({ purchaseOrders, onSelectTab }: PoStatsBarProps) {
  const [isBannerVisible, setIsBannerVisible] = useState(true);

  const todayStr = new Date().toISOString().slice(0, 10);

  const todayOrders = purchaseOrders.filter((po) => {
    const d = po.po_date || po.created_at || '';
    return d.startsWith(todayStr);
  });

  const totalCount = purchaseOrders.length;
  const todayCount = todayOrders.length;

  // Counted over the canonical status groups. These filters used to match
  // 'verification', 'issued', 'fulfilled' and 'completed' — none of which
  // are erp_po_status labels — so three of the four tiles read zero against
  // a correctly typed database however many orders existed.
  const byGroup = purchaseOrders.reduce<Record<string, number>>((acc, po) => {
    const key = poStatusGroup(po.status) ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const count = (group: PoStatusGroup) => byGroup[group] ?? 0;
  const draftCount = count('draft');
  const pendingCount = count('pending');
  const issuedCount = count('issued');
  const receivingCount = count('receiving');
  const closedCount = count('closed');
  /** Surfaced rather than folded into Draft, so a data fault stays visible. */
  const unknownCount = byGroup.unknown ?? 0;

  // Committed value is what the budget has actually reserved: only orders
  // that reached approval carry a commitment. Summing every row, drafts and
  // cancellations included, overstated it.
  const committedValue = purchaseOrders
    .filter((p) => {
      const group = poStatusGroup(p.status);
      return group === 'issued' || group === 'receiving' || group === 'closed';
    })
    .reduce((sum, p) => sum + Number(p.total_amount || 0), 0);

  return (
    <div className="space-y-3">
      {/* Top Restore Button when Banner is Dismissed */}
      {!isBannerVisible && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsBannerVisible(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all shadow-2xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Show PO Operational Banner
          </button>
        </div>
      )}

      {/* Interactive Summary Banner */}
      {isBannerVisible && (
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 shadow-sm">
          <button
            onClick={() => setIsBannerVisible(false)}
            className="absolute top-3 right-3 rounded-lg border border-border/50 bg-background/60 p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Dismiss Operational Banner"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pr-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-extrabold text-primary uppercase tracking-wider font-heading">
                  <ShoppingBag className="h-3 w-3" /> PO Dispatch Hub
                </span>
                <span className="text-xs font-bold text-foreground">
                  Today's Auto-Draft PO Summary &amp; Verification
                </span>
              </div>
              <p className="text-xs font-semibold text-foreground/90">
                {todayCount} raised today • {draftCount} draft • {pendingCount} awaiting approval • {issuedCount} issued • {receivingCount} part delivered • {closedCount} settled.
              </p>
            </div>

            {/* Quick Action Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => onSelectTab?.('draft')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-extrabold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <span>📌 {draftCount} Draft</span>
              </button>

              <button
                onClick={() => onSelectTab?.('pending')}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 font-extrabold text-purple-800 dark:text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                <span>🔍 {pendingCount} Awaiting Approval</span>
              </button>

              <button
                onClick={() => onSelectTab?.('issued')}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 font-extrabold text-blue-800 dark:text-blue-300 hover:bg-blue-500/20 transition-colors"
              >
                <span>🚀 {issuedCount} Issued</span>
              </button>

              <button
                onClick={() => onSelectTab?.('closed')}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-extrabold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                <span>✅ {closedCount} Settled</span>
              </button>

              {unknownCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 font-extrabold text-red-700 dark:text-red-300"
                  title="These orders carry a status outside the canonical vocabulary. Check the data rather than the UI."
                >
                  ⚠ {unknownCount} unrecognised status
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5 Stats Cards Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground block font-heading">Total POs</span>
          <span className="text-lg font-extrabold text-foreground font-mono">{totalCount}</span>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block font-heading">Draft POs</span>
          <span className="text-lg font-extrabold text-amber-700 dark:text-amber-300 font-mono">{draftCount}</span>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block font-heading">Awaiting Approval</span>
          <span className="text-lg font-extrabold text-purple-700 dark:text-purple-300 font-mono">{pendingCount}</span>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 block font-heading">Issued POs</span>
          <span className="text-lg font-extrabold text-blue-700 dark:text-blue-300 font-mono">{issuedCount}</span>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-2xs col-span-2 md:col-span-1">
          <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block font-heading">Committed Value</span>
          <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">
            ₹{committedValue.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
}
