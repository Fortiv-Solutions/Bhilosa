'use client';

// ============================================================================
// RFQ AWARD MATRIX MODAL (PHASE 3) - ENTERPRISE PRODUCTION GRADE
// File: frontend/src/components/procurement/rfq/rfq-award-matrix-modal.tsx
//
// Dual-Mode Multi-Vendor Sourcing Award Matrix:
// 1. Mode A: Dual-Axis Frozen Enterprise Grid (Sticky Header + Sticky Left Columns)
// 2. Mode B: Single-Item Split Focus Assistant (for 15+ Items) with Sliders
// 3. Live Vendor Commitment & Award Summary Bar (Total RFQ Value vs Awarded Value per Supplier)
// 4. Clean Zero-Rate & Draft Quotation Cell Handling
// 5. Direct Supabase Persistence & Multi-PO Generation Cascade
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  FileSpreadsheet,
  Grid,
  Info,
  Layers,
  Loader2,
  PackageCheck,
  Search,
  ShieldAlert,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Split,
  ThumbsUp,
  TrendingUp,
  Wand2,
  X,
} from 'lucide-react';
import {
  getQuotationComparisonMatrix,
  saveAwardMatrix,
  approveVendorSelection,
  type RfqComparisonMatrix,
  type AwardInputLine,
} from '@/lib/procurement';
import { formatCurrency } from '@/components/procurement/shared';

interface RfqAwardMatrixModalProps {
  rfqId: string;
  onClose: () => void;
  onAwardSaved?: () => void;
}

type AwardCellState = {
  awarded_qty: number;
  awarded_rate: number;
  non_l1_justification: string;
};

const VENDOR_COLOR_PALETTE = [
  { text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', bar: 'bg-purple-600' },
  { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', bar: 'bg-emerald-600' },
  { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', bar: 'bg-amber-600' },
  { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30', bar: 'bg-indigo-600' },
  { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30', bar: 'bg-sky-600' },
];

export function RfqAwardMatrixModal({
  rfqId,
  onClose,
  onAwardSaved,
}: RfqAwardMatrixModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<RfqComparisonMatrix | null>(null);

  // View Mode: 'grid' (Mode A) or 'focus' (Mode B for 15+ items)
  const [viewMode, setViewMode] = useState<'grid' | 'focus'>('grid');
  const [selectedItemIdx, setSelectedItemIdx] = useState<number>(0);
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');

  // Key: `${rfq_line_id}:${vendor_id}`
  const [allocations, setAllocations] = useState<Record<string, AwardCellState>>({});
  const [selectionReason, setSelectionReason] = useState(
    'Multi-vendor line & quantity award matrix allocated based on commercial L1 evaluation and vendor capacity.'
  );

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const data = await getQuotationComparisonMatrix(rfqId);
        if (isMounted) {
          if (!data) {
            setError('No bid comparison data available for this RFQ.');
          } else {
            setMatrix(data);

            // Initialize default allocations (empty or auto-populate L1 defaults)
            const initial: Record<string, AwardCellState> = {};
            for (const item of data.items) {
              for (const vendor of data.vendors) {
                const quote = item.vendor_quotes[vendor.vendor_id];
                if (quote) {
                  const key = `${item.rfq_line_id}:${vendor.vendor_id}`;
                  initial[key] = {
                    awarded_qty: 0,
                    awarded_rate: quote.net_rate,
                    non_l1_justification: '',
                  };
                }
              }
            }
            setAllocations(initial);
          }
        }
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : 'Unable to load award matrix data.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [rfqId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 shadow-2xl text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-foreground">Preparing Sourcing Award Matrix...</p>
          <p className="text-xs text-muted-foreground">Loading tendered item lines and vendor bids.</p>
        </div>
      </div>
    );
  }

  if (error || !matrix) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="flex max-w-md flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl text-center">
          <Info className="h-10 w-10 text-amber-500" />
          <h3 className="text-base font-bold text-foreground">Award Matrix Unavailable</h3>
          <p className="text-xs text-muted-foreground">{error || 'No vendor quotes submitted yet.'}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { rfq, rfqLines, vendors, items } = matrix;

  // Filter items for Focus View search
  const filteredItems = items.filter((it) => {
    if (!itemSearchQuery.trim()) return true;
    const q = itemSearchQuery.toLowerCase();
    return (
      it.item_description.toLowerCase().includes(q) ||
      (it.item_code && it.item_code.toLowerCase().includes(q)) ||
      (it.item_group && it.item_group.toLowerCase().includes(q))
    );
  });

  const activeItem = items[selectedItemIdx] || items[0];

  // Helper to compute total allocated quantity for a line
  const getLineAllocatedQty = (lineId: string) => {
    return vendors.reduce((sum, v) => {
      const key = `${lineId}:${v.vendor_id}`;
      return sum + (allocations[key]?.awarded_qty || 0);
    }, 0);
  };

  const updateModalCellAllocation = (
    item: any,
    vendor: any,
    qty: number
  ) => {
    const key = `${item.rfq_line_id}:${vendor.vendor_id}`;
    
    setAllocations((prev) => {
      const next = { ...prev };
      
      const currentCell = prev[key] || {
        awarded_qty: 0,
        awarded_rate: item.vendor_quotes[vendor.vendor_id]?.net_rate || 0,
        non_l1_justification: '',
      };
      
      next[key] = {
        ...currentCell,
        awarded_qty: qty,
      };

      // Two-vendor auto-fill remaining logic in modal
      if (vendors.length === 2) {
        const otherVendor = vendors.find((v) => v.vendor_id !== vendor.vendor_id);
        if (otherVendor) {
          const remainingQty = Math.max(0, item.rfq_quantity - qty);
          const otherKey = `${item.rfq_line_id}:${otherVendor.vendor_id}`;
          const otherQuote = item.vendor_quotes[otherVendor.vendor_id];
          
          if (otherQuote) {
            const finalRemaining = Math.min(remainingQty, otherQuote.offered_qty);
            const otherCurrent = prev[otherKey] || {
              awarded_qty: 0,
              awarded_rate: otherQuote.net_rate || 0,
              non_l1_justification: '',
            };
            
            next[otherKey] = {
              ...otherCurrent,
              awarded_qty: finalRemaining,
            };
          }
        }
      }

      return next;
    });
  };

  // Auto-Fill L1 Allocations across all item lines
  const handleAutoFillL1 = () => {
    const next: Record<string, AwardCellState> = { ...allocations };
    for (const item of items) {
      let remainingToAward = item.rfq_quantity;

      // Find L1 vendor(s) for this line
      const l1Vendor = vendors.find((v) => item.vendor_quotes[v.vendor_id]?.is_l1);
      if (l1Vendor) {
        const quote = item.vendor_quotes[l1Vendor.vendor_id];
        const qtyToAward = Math.min(remainingToAward, quote.offered_qty);
        const key = `${item.rfq_line_id}:${l1Vendor.vendor_id}`;
        next[key] = {
          awarded_qty: qtyToAward,
          awarded_rate: quote.net_rate,
          non_l1_justification: '',
        };
        remainingToAward -= qtyToAward;
      }

      // If L1 vendor had partial capacity, fill remaining from next lowest
      if (remainingToAward > 0.0001) {
        const sortedQuotes = vendors
          .map((v) => ({ vendor: v, quote: item.vendor_quotes[v.vendor_id] }))
          .filter((x) => x.quote && !x.quote.is_l1 && x.quote.net_rate > 0)
          .sort((a, b) => a.quote.net_rate - b.quote.net_rate);

        for (const { vendor, quote } of sortedQuotes) {
          if (remainingToAward <= 0) break;
          const qtyToAward = Math.min(remainingToAward, quote.offered_qty);
          const key = `${item.rfq_line_id}:${vendor.vendor_id}`;
          next[key] = {
            awarded_qty: qtyToAward,
            awarded_rate: quote.net_rate,
            non_l1_justification: 'Allocated remaining quantity due to L1 vendor capacity limit.',
          };
          remainingToAward -= qtyToAward;
        }
      }
    }
    setAllocations(next);
  };

  // Submit Award Matrix
  const handleSubmitAwardMatrix = async (autoGeneratePos: boolean = false) => {
    setError(null);
    setSaving(true);

    try {
      const awardLines: AwardInputLine[] = [];

      for (const item of items) {
        const lineTotalAwarded = getLineAllocatedQty(item.rfq_line_id);
        if (lineTotalAwarded > item.rfq_quantity + 1e-6) {
          throw new Error(
            `Item "${item.item_description}": total awarded quantity (${lineTotalAwarded}) exceeds RFQ quantity (${item.rfq_quantity}).`
          );
        }

        for (const v of vendors) {
          const key = `${item.rfq_line_id}:${v.vendor_id}`;
          const cell = allocations[key];
          const quote = item.vendor_quotes[v.vendor_id];

          if (cell && cell.awarded_qty > 0 && quote) {
            if (cell.awarded_qty > quote.offered_qty + 1e-6) {
              throw new Error(
                `Item "${item.item_description}": awarded quantity to ${v.vendor_name} (${cell.awarded_qty}) exceeds vendor offered capacity (${quote.offered_qty}).`
              );
            }

            if (!quote.is_l1 && quote.net_rate > 0 && !cell.non_l1_justification.trim()) {
              throw new Error(
                `Item "${item.item_description}": please enter a justification for awarding to ${v.vendor_name} (non-L1 rate).`
              );
            }

            const isSyntheticQuote = quote.quotation_id?.startsWith('draft-quote-');
            const isSyntheticLine = quote.quotation_line_id?.startsWith('draft-line-');

            awardLines.push({
              rfq_line_id: item.rfq_line_id,
              purchase_requisition_line_id: item.purchase_requisition_line_id || null,
              vendor_id: v.vendor_id,
              quotation_id: isSyntheticQuote ? null : quote.quotation_id,
              quotation_line_id: isSyntheticLine ? null : quote.quotation_line_id,
              awarded_qty: cell.awarded_qty,
              quoted_rate: quote.unit_rate,
              awarded_rate: cell.awarded_rate,
              tax_rate: quote.tax_rate,
              is_lowest_bid: quote.is_l1,
              non_l1_justification: quote.is_l1 ? null : cell.non_l1_justification.trim(),
              award_reason: `Awarded ${cell.awarded_qty} ${item.unit} at ₹${cell.awarded_rate}/unit`,
              lead_time_days: quote.lead_time_days,
            });
          }
        }
      }

      if (awardLines.length === 0) {
        throw new Error('Please allocate at least one item quantity before saving the award matrix.');
      }

      const res = await saveAwardMatrix({
        rfqId: rfq.id,
        purchaseRequisitionId: rfq.purchase_requisition_id || '',
        projectId: rfq.project_id,
        selectionReason,
        awards: awardLines,
      });

      if (res.error) {
        throw new Error(res.error.message);
      }

      if (autoGeneratePos && res.data?.selectionId) {
        const poRes = await approveVendorSelection({
          selectionId: res.data.selectionId,
        });
        if (poRes.error) {
          throw new Error(`Award saved, but PO generation encountered an issue: ${poRes.error.message}`);
        }
      }

      if (onAwardSaved) onAwardSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save award matrix.');
    } finally {
      setSaving(false);
    }
  };

  // Total RFQ Estimated Cost Value
  const totalRfqEstimatedValue = items.reduce(
    (sum, item) => sum + item.rfq_quantity * (item.estimated_rate || 0),
    0
  );

  // Total Matrix Grand Awarded Value across all suppliers
  const totalAwardedGrandValue = items.reduce((sum, item) => {
    return sum + vendors.reduce((vSum, v) => {
      const key = `${item.rfq_line_id}:${v.vendor_id}`;
      const cell = allocations[key];
      const quote = item.vendor_quotes[v.vendor_id];
      if (cell && cell.awarded_qty > 0 && quote) {
        return vSum + cell.awarded_qty * cell.awarded_rate * (1 + quote.tax_rate / 100);
      }
      return vSum;
    }, 0);
  }, 0);

  // Per-Vendor Award Breakdown Summary
  const vendorBreakdowns = vendors.map((v, vIdx) => {
    let totalValue = 0;
    let awardedItemsCount = 0;

    for (const item of items) {
      const key = `${item.rfq_line_id}:${v.vendor_id}`;
      const cell = allocations[key];
      const quote = item.vendor_quotes[v.vendor_id];
      if (cell && cell.awarded_qty > 0 && quote) {
        totalValue += cell.awarded_qty * cell.awarded_rate * (1 + quote.tax_rate / 100);
        awardedItemsCount += 1;
      }
    }

    const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];
    return {
      vendor_id: v.vendor_id,
      vendor_name: v.vendor_name,
      totalValue,
      awardedItemsCount,
      color,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-6 overflow-hidden">
      <div className="flex max-h-[96vh] w-full max-w-7xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/30 px-6 py-3.5 gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20 shadow-2xs">
              <Split className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-heading text-foreground">
                  Multi-Vendor Sourcing Award Matrix ({rfq.rfq_number})
                </h2>
                <span className="rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                  Phase 3 Multi-Sourcing
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Allocate item-wise and partial quantities across {vendors.length} vendor bid{vendors.length === 1 ? '' : 's'} ({items.length} Tendered Items).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dual View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-border bg-background p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Grid className="h-3.5 w-3.5" /> Mode A: Matrix Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('focus')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'focus'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Mode B: Item Focus Assistant ({items.length} Items)
              </button>
            </div>

            <button
              type="button"
              onClick={handleAutoFillL1}
              title="Auto-fill lowest rate allocations for all items"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-all shadow-2xs cursor-pointer"
            >
              <Wand2 className="h-3.5 w-3.5" /> Auto-Fill L1
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-background p-2 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="m-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-700 dark:text-red-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ============================================================================ */}
        {/* MODE A: HIGH-DENSITY ENTERPRISE GRID VIEW (STICKY LEFT + STICKY HEADER)      */}
        {/* ============================================================================ */}
        {viewMode === 'grid' && (
          <div className="flex-1 overflow-auto p-4 max-h-[60vh]">
            <div className="relative border border-border rounded-xl overflow-hidden shadow-2xs bg-background">
              <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/95 text-muted-foreground text-[10px] uppercase tracking-wider sticky top-0 z-30 shadow-2xs backdrop-blur">
                    {/* Top-Left Sticky Corner Header Cell */}
                    <th className="sticky left-0 top-0 z-40 bg-muted px-4 py-3 min-w-[260px] font-extrabold text-foreground border-r border-border shadow-2xs">
                      Item Description &amp; Specification
                    </th>
                    <th className="px-3 py-3 text-center min-w-[70px] font-bold">Unit</th>
                    <th className="px-3 py-3 text-right min-w-[85px] font-bold">RFQ Qty</th>
                    <th className="px-3 py-3 text-right min-w-[120px] font-bold border-r border-border">
                      Unallocated Qty
                    </th>

                    {/* Vendor Columns Sticky Header */}
                    {vendors.map((v, vIdx) => {
                      const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];
                      return (
                        <th key={v.vendor_id} className="p-3 min-w-[260px] text-center border-r border-border bg-muted/40">
                          <div className={`font-extrabold text-xs truncate ${color.text}`}>{v.vendor_name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {v.quotation_number ? `Quote #${v.quotation_number}` : 'Invited Vendor'}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {items.map((item, idx) => {
                    const totalAllocated = getLineAllocatedQty(item.rfq_line_id);
                    const unallocated = item.rfq_quantity - totalAllocated;
                    const isFullyAllocated = Math.abs(unallocated) < 0.0001;
                    const isOverAllocated = unallocated < -0.0001;

                    return (
                      <tr key={item.rfq_line_id} className="hover:bg-muted/20 transition-colors">
                        {/* Item Info (Sticky Left Column) */}
                        <td className="sticky left-0 z-20 bg-card px-4 py-3 font-semibold text-foreground border-r border-border shadow-2xs">
                          <div className="flex items-start gap-2 max-w-[240px]">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="truncate">
                              <p className="font-bold text-xs text-foreground truncate" title={item.item_description}>
                                {item.item_description}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Unit */}
                        <td className="px-3 py-3 text-center text-muted-foreground font-medium uppercase text-[11px]">
                          {item.unit}
                        </td>

                        {/* RFQ Qty */}
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-foreground">
                          {item.rfq_quantity.toLocaleString('en-IN')}
                        </td>

                        {/* Unallocated Qty Indicator */}
                        <td className="px-3 py-3 text-right border-r border-border font-bold tabular-nums">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-black ${
                              isOverAllocated
                                ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                                : isFullyAllocated
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {unallocated.toLocaleString('en-IN')} {item.unit}
                          </span>
                        </td>

                        {/* Vendor Allocation Cells */}
                        {vendors.map((v) => {
                          const quote = item.vendor_quotes[v.vendor_id];
                          const key = `${item.rfq_line_id}:${v.vendor_id}`;
                          const cell = allocations[key] || {
                            awarded_qty: 0,
                            awarded_rate: quote?.net_rate || 0,
                            non_l1_justification: '',
                          };

                          if (!quote) {
                            return (
                              <td key={v.vendor_id} className="p-3 text-center text-muted-foreground/40 italic border-r border-border text-[11px]">
                                No Quote
                              </td>
                            );
                          }

                          const isAwarded = cell.awarded_qty > 0;
                          const hasActualRate = quote.net_rate > 0;
                          const isNonL1Awarded = isAwarded && hasActualRate && !quote.is_l1;

                          return (
                            <td
                              key={v.vendor_id}
                              className={`p-3 border-r border-border transition-all ${
                                isAwarded ? 'bg-purple-500/5 dark:bg-purple-950/20' : ''
                              }`}
                            >
                              <div className="space-y-2">
                                {/* Awarded Qty Input */}
                                <div>
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                                      Award Qty ({item.unit})
                                    </label>
                                    {hasActualRate && quote.is_l1 && (
                                      <span className="rounded bg-emerald-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white leading-none shrink-0">
                                        L1 🏆
                                      </span>
                                    )}
                                  </div>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    max={quote.offered_qty}
                                    value={cell.awarded_qty || ''}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = Math.max(0, Number(e.target.value || 0));
                                      updateModalCellAllocation(item, v, val);
                                    }}
                                    className={`w-full rounded-lg border p-1.5 text-right font-extrabold tabular-nums outline-none text-xs ${
                                      isAwarded
                                        ? 'border-purple-500 bg-purple-500/10 text-purple-900 dark:text-purple-200'
                                        : 'border-border bg-background text-foreground'
                                    }`}
                                  />
                                  <span className="text-[9px] text-muted-foreground block text-right mt-0.5">
                                    Capacity: {quote.offered_qty} {item.unit}
                                  </span>
                                </div>

                                {/* Non-L1 Justification Prompt */}
                                {isNonL1Awarded && (
                                  <div className="space-y-1 pt-1">
                                    <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 block">
                                      ⚠️ Non-L1 Reason (Required)
                                    </span>
                                    <input
                                      type="text"
                                      placeholder="e.g. Better lead time"
                                      value={cell.non_l1_justification}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setAllocations((prev) => ({
                                          ...prev,
                                          [key]: { ...cell, non_l1_justification: val },
                                        }));
                                      }}
                                      className="w-full rounded border border-amber-500/40 bg-amber-500/5 p-1 text-[10px] text-foreground outline-none"
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================================ */}
        {/* MODE B: SINGLE-ITEM SPLIT FOCUS ASSISTANT (IDEAL FOR 15+ ITEMS)               */}
        {/* ============================================================================ */}
        {viewMode === 'focus' && activeItem && (
          <div className="flex-1 overflow-hidden p-4 grid grid-cols-1 md:grid-cols-12 gap-4 max-h-[60vh]">
            {/* Left Column: 15+ Items Selector Sidebar */}
            <div className="md:col-span-4 flex flex-col rounded-xl border border-border bg-background p-3 shadow-2xs overflow-hidden">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search item name or code..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary font-medium"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {filteredItems.map((item, idx) => {
                  const lineAllocated = getLineAllocatedQty(item.rfq_line_id);
                  const isFully = Math.abs(item.rfq_quantity - lineAllocated) < 0.0001;
                  const isSelected = item.rfq_line_id === activeItem.rfq_line_id;

                  return (
                    <button
                      key={item.rfq_line_id}
                      type="button"
                      onClick={() => setSelectedItemIdx(items.findIndex((it) => it.rfq_line_id === item.rfq_line_id))}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground font-bold shadow-2xs'
                          : 'border-border/60 bg-card hover:bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          Item #{idx + 1}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                            isFully ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {lineAllocated} / {item.rfq_quantity} {item.unit}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-foreground truncate mt-0.5">{item.item_description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Active Item Split Assistant & Sliders */}
            <div className="md:col-span-8 flex flex-col rounded-xl border border-border bg-card p-4 shadow-2xs overflow-y-auto space-y-4">
              {/* Item Info Banner */}
              <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 gap-2">
                <div>
                  <h3 className="text-sm font-bold font-heading text-foreground flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" /> {activeItem.item_description}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Target RFQ Quantity: <strong className="text-foreground">{activeItem.rfq_quantity} {activeItem.unit}</strong> • Estimated Rate: <strong className="text-foreground">{formatCurrency(activeItem.estimated_rate)}</strong>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Allocated Balance</span>
                  <span className="text-sm font-black text-primary">
                    {getLineAllocatedQty(activeItem.rfq_line_id)} / {activeItem.rfq_quantity} {activeItem.unit}
                  </span>
                </div>
              </div>

              {/* Vendors Split Sliders List */}
              <div className="space-y-3">
                {vendors.map((v, vIdx) => {
                  const quote = activeItem.vendor_quotes[v.vendor_id];
                  const key = `${activeItem.rfq_line_id}:${v.vendor_id}`;
                  const cell = allocations[key] || {
                    awarded_qty: 0,
                    awarded_rate: quote?.net_rate || 0,
                    non_l1_justification: '',
                  };
                  const color = VENDOR_COLOR_PALETTE[vIdx % VENDOR_COLOR_PALETTE.length];

                  if (!quote) return null;

                  return (
                    <div key={v.vendor_id} className={`p-3.5 rounded-xl border ${cell.awarded_qty > 0 ? color.bg : 'border-border bg-background'} space-y-2`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold text-xs ${color.text}`}>{v.vendor_name}</span>
                          {quote.net_rate > 0 && quote.is_l1 && (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white">L1 🏆</span>
                          )}
                        </div>
                      </div>

                      {/* Interactive Range Slider + Qty Input */}
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max={activeItem.rfq_quantity}
                          value={cell.awarded_qty}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateModalCellAllocation(activeItem, v, val);
                          }}
                          className="flex-1 h-2 accent-[color:var(--color-primary)] cursor-pointer"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max={activeItem.rfq_quantity}
                            value={cell.awarded_qty || ''}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value || 0));
                              updateModalCellAllocation(activeItem, v, val);
                            }}
                            className="w-20 rounded-lg border border-border bg-background p-1 text-right font-extrabold text-xs"
                          />
                          <span className="text-xs font-bold text-muted-foreground">{activeItem.unit}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================================ */}
        {/* ENTERPRISE VENDOR COMMITMENT & AWARD SUMMARY BAR                             */}
        {/* ============================================================================ */}
        <div className="border-t border-border bg-muted/50 p-3 px-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-heading font-extrabold text-foreground flex items-center gap-1.5">
                <PackageCheck className="h-4 w-4 text-purple-600" /> AWARD SUMMARY:
              </span>
              {(() => {
                const activeVendorCount = vendorBreakdowns.filter((vb) => vb.awardedItemsCount > 0).length;
                return (
                  <span className="text-purple-700 dark:text-purple-300 font-extrabold bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg text-xs">
                    {activeVendorCount === 0
                      ? '0 POs will be created'
                      : `${activeVendorCount} Purchase Order${activeVendorCount === 1 ? '' : 's'} (PO${activeVendorCount === 1 ? '' : 's'}) will be created`}
                  </span>
                );
              })()}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {vendorBreakdowns.map((vb) => (
                <div
                  key={vb.vendor_id}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${vb.color.bg}`}
                >
                  <span className={`font-extrabold ${vb.color.text}`}>{vb.vendor_name}:</span>
                  <span className="text-foreground font-bold">{vb.awardedItemsCount} item(s) awarded</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border bg-card p-4 px-6 gap-3">
          <div className="text-xs text-muted-foreground font-medium">
            Reason: <input type="text" value={selectionReason} onChange={(e) => setSelectionReason(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground w-72 outline-none" />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-border px-4 py-2 text-xs font-bold hover:bg-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmitAwardMatrix(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Draft Award
            </button>
            <button
              type="button"
              onClick={() => handleSubmitAwardMatrix(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-700 transition-all disabled:opacity-50 font-heading cursor-pointer"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
              Approve &amp; Issue Multi-Vendor POs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
