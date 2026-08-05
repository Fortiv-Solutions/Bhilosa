'use client';

// ============================================================================
// RFQ BID COMPARISON MATRIX (PHASE 2)
// File: frontend/src/components/procurement/rfq/rfq-bid-comparison-matrix.tsx
//
// Side-by-side matrix comparing vendor quotations per RFQ line item.
// Highlights L1 (lowest evaluated net unit rate) per item, flags partial
// quantity capacity offers, displays evaluation scores, and provides direct
// vendor recommendation triggers.
// ============================================================================

import { useEffect, useState } from 'react';
import {
  Award,
  Clock,
  FileSpreadsheet,
  Info,
  Loader2,
  Sparkles,
  Star,
  ThumbsUp,
  X,
} from 'lucide-react';
import {
  getQuotationComparisonMatrix,
  type RfqComparisonMatrix,
} from '@/lib/procurement';
import { formatCurrency } from '@/components/procurement/shared';

interface RfqBidComparisonMatrixProps {
  rfqId: string;
  onClose: () => void;
  onRecommendVendor?: (vendorId: string, quotationId: string) => void;
  onOpenAwardMatrix?: () => void;
}

export function RfqBidComparisonMatrix({
  rfqId,
  onClose,
  onRecommendVendor,
  onOpenAwardMatrix,
}: RfqBidComparisonMatrixProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<RfqComparisonMatrix | null>(null);
  const [highlightL1Only, setHighlightL1Only] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadMatrix() {
      setLoading(true);
      setError(null);
      try {
        const data = await getQuotationComparisonMatrix(rfqId);
        if (isMounted) {
          if (!data) {
            setError('No quotation matrix data found for this RFQ.');
          } else {
            setMatrix(data);
          }
        }
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : 'Unable to load quotation comparison matrix.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadMatrix();
    return () => {
      isMounted = false;
    };
  }, [rfqId]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 shadow-2xl text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-foreground">Building Bid Comparison Matrix...</p>
          <p className="text-xs text-muted-foreground">Evaluating unit rates, discounts, and L1 positions across vendor bids.</p>
        </div>
      </div>
    );
  }

  if (error || !matrix) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="flex max-w-md flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl text-center">
          <Info className="h-10 w-10 text-amber-500" />
          <h3 className="text-base font-bold text-foreground">Comparison Matrix Unavailable</h3>
          <p className="text-xs text-muted-foreground">{error || 'No quotations submitted yet for this RFQ.'}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { rfq, rfqLines, vendors, items } = matrix;

  // Find lowest total quotation vendor
  const lowestTotalVendor = vendors.length > 0
    ? [...vendors].sort((a, b) => a.total_amount - b.total_amount)[0]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-3 sm:p-6 overflow-hidden">
      <div className="flex max-h-[95vh] w-full max-w-7xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  Bid Comparison Matrix ({rfq.rfq_number})
                </h2>
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                  Phase 2 Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Side-by-side commercial evaluation across {vendors.length} vendor quotation{vendors.length === 1 ? '' : 's'} for {rfqLines.length} tendered item line{rfqLines.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted">
              <input
                type="checkbox"
                checked={highlightL1Only}
                onChange={(e) => setHighlightL1Only(e.target.checked)}
                className="h-3.5 w-3.5 accent-[color:var(--color-primary)]"
              />
              Highlight L1 Items Only
            </label>
            {onOpenAwardMatrix && (
              <button
                type="button"
                onClick={onOpenAwardMatrix}
                className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition-all shadow-2xs"
              >
                <Award className="h-3.5 w-3.5" /> Open Award Matrix
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-background p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Overview KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/10 p-4 border-b border-border text-xs">
          <div className="rounded-xl border border-border/80 bg-background p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Tendered Requisition Lines
            </span>
            <span className="text-base font-extrabold text-foreground">{rfqLines.length} Items</span>
            <span className="block text-[10px] text-muted-foreground mt-0.5">
              Requisition #{rfq.rfq_number}
            </span>
          </div>

          <div className="rounded-xl border border-border/80 bg-background p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Bids Received
            </span>
            <span className="text-base font-extrabold text-foreground">{vendors.length} Vendors</span>
            <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
              {rfq.rfq_vendors?.length || vendors.length} Vendors Invited
            </span>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
              Lowest Commercial Bid (L1)
            </span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
              {lowestTotalVendor ? formatCurrency(lowestTotalVendor.total_amount) : '—'}
            </span>
            <span className="block text-[10px] text-emerald-700/80 dark:text-emerald-400 truncate mt-0.5">
              {lowestTotalVendor ? lowestTotalVendor.vendor_name : 'N/A'}
            </span>
          </div>

          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 block mb-1">
              Sourcing Mode
            </span>
            <span className="text-sm font-bold text-purple-800 dark:text-purple-300 flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> Item & Qty Splitting Enabled
            </span>
            <span className="block text-[10px] text-purple-700/80 dark:text-purple-400 mt-0.5">
              Award matrix ready
            </span>
          </div>
        </div>

        {/* Comparison Matrix Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="sticky left-0 z-20 bg-muted/95 p-3 min-w-[260px] font-extrabold shadow-sm">
                  Item Description & Specification
                </th>
                <th className="p-3 text-center min-w-[80px] font-bold">Unit</th>
                <th className="p-3 text-right min-w-[90px] font-bold">RFQ Qty</th>
                <th className="p-3 text-right min-w-[100px] font-bold border-r border-border">Est. Rate</th>

                {/* Dynamic Vendor Columns Header */}
                {vendors.map((v) => {
                  const isLowestOverall = lowestTotalVendor?.vendor_id === v.vendor_id;
                  return (
                    <th
                      key={v.vendor_id}
                      className={`p-3 min-w-[240px] text-center border-r border-border ${
                        isLowestOverall ? 'bg-emerald-500/10 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <div className="flex flex-col items-center justify-between h-full space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-xs text-foreground truncate max-w-[180px]">
                            {v.vendor_name}
                          </span>
                          {isLowestOverall && (
                            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                              L1 OVERALL
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Quote #{v.quotation_number} ({v.quotation_date})
                        </div>
                        <div className="text-xs font-black text-primary">
                          Total: {formatCurrency(v.total_amount)}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3 text-amber-500" /> {v.lead_time_days} days lead
                          </span>
                          {v.scores?.weighted_score != null && (
                            <span className="flex items-center gap-0.5 text-purple-600 dark:text-purple-400 font-bold">
                              <Star className="h-3 w-3 fill-purple-500 text-purple-500" /> Score: {v.scores.weighted_score}
                            </span>
                          )}
                        </div>

                        {onRecommendVendor && (
                          <button
                            type="button"
                            onClick={() => onRecommendVendor(v.vendor_id, v.quotation_id)}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-all"
                          >
                            <ThumbsUp className="h-3 w-3" /> Recommend Bid
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {items.map((item, idx) => {
                return (
                  <tr
                    key={item.rfq_line_id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    {/* Item Description (Sticky Column) */}
                    <td className="sticky left-0 z-10 bg-card p-3 font-semibold text-foreground shadow-sm">
                      <div className="flex items-start gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                          #{idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-xs text-foreground">{item.item_description}</p>
                          {(item.specification || item.preferred_brand || item.item_code) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {[item.item_code, item.specification, item.preferred_brand]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Unit */}
                    <td className="p-3 text-center text-muted-foreground font-medium uppercase text-[11px]">
                      {item.unit}
                    </td>

                    {/* RFQ Qty */}
                    <td className="p-3 text-right font-bold tabular-nums text-foreground">
                      {item.rfq_quantity.toLocaleString('en-IN')}
                    </td>

                    {/* Est Rate */}
                    <td className="p-3 text-right tabular-nums text-muted-foreground border-r border-border">
                      {item.estimated_rate > 0 ? formatCurrency(item.estimated_rate) : '—'}
                    </td>

                    {/* Vendor Specific Quotes Columns */}
                    {vendors.map((v) => {
                      const quote = item.vendor_quotes[v.vendor_id];

                      if (!quote) {
                        return (
                          <td
                            key={v.vendor_id}
                            className="p-3 text-center text-muted-foreground/40 italic border-r border-border text-[11px]"
                          >
                            Not Quoted
                          </td>
                        );
                      }

                      const isPartial = quote.offered_qty < item.rfq_quantity - 0.0001;
                      const isHiddenByFilter = highlightL1Only && !quote.is_l1;

                      return (
                        <td
                          key={v.vendor_id}
                          className={`p-3 border-r border-border transition-all ${
                            quote.is_l1
                              ? 'bg-emerald-500/10 dark:bg-emerald-950/30'
                              : isHiddenByFilter
                              ? 'opacity-30'
                              : ''
                          }`}
                        >
                          <div className="space-y-1">
                            {/* Net Unit Rate & L1 Badge */}
                            <div className="flex items-center justify-between gap-1">
                              <span className={`font-extrabold text-xs tabular-nums ${quote.is_l1 ? 'text-emerald-700 dark:text-emerald-300 text-sm' : 'text-foreground'}`}>
                                {formatCurrency(quote.net_rate)}
                                {quote.discount_percent > 0 && (
                                  <span className="text-[10px] font-normal text-muted-foreground line-through block">
                                    {formatCurrency(quote.unit_rate)}
                                  </span>
                                )}
                              </span>

                              {quote.is_l1 && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white shadow-2xs">
                                  <Award className="h-2.5 w-2.5" /> L1 RATE
                                </span>
                              )}
                            </div>

                            {/* Discount Tag */}
                            {quote.discount_percent > 0 && (
                              <span className="inline-block rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.2 text-[9px] font-bold">
                                {quote.discount_percent}% Disc.
                              </span>
                            )}

                            {/* Offered Qty & Partial Capacity Warning */}
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                              <span>Capacity:</span>
                              <span className={`font-bold tabular-nums ${isPartial ? 'text-amber-600 dark:text-amber-400 font-extrabold' : 'text-foreground'}`}>
                                {quote.offered_qty.toLocaleString('en-IN')} {item.unit}
                              </span>
                            </div>

                            {isPartial && (
                              <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                ⚠️ Vendor offers partial qty ({quote.offered_qty}/{item.rfq_quantity})
                              </p>
                            )}

                            {/* Line Total */}
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Line Total:</span>
                              <span className="font-bold text-foreground tabular-nums">
                                {formatCurrency(quote.line_total)}
                              </span>
                            </div>

                            {/* Remarks / Lead Time */}
                            {(quote.remarks || quote.lead_time_days != null) && (
                              <p className="text-[9px] text-muted-foreground italic truncate max-w-[200px]" title={quote.remarks || ''}>
                                {quote.lead_time_days != null ? `${quote.lead_time_days}d lead` : ''}
                                {quote.lead_time_days != null && quote.remarks ? ' · ' : ''}
                                {quote.remarks}
                              </p>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* Matrix Summary Footer */}
            <tfoot className="border-t-2 border-border bg-muted/40 font-bold text-xs">
              <tr>
                <td colSpan={4} className="sticky left-0 z-20 bg-muted p-3 text-right font-extrabold text-foreground">
                  COMMERCIAL BID SUMMARY:
                </td>
                {vendors.map((v) => (
                  <td key={v.vendor_id} className="p-3 border-r border-border text-center">
                    <div className="space-y-1">
                      <p className="text-xs font-black text-foreground">
                        {formatCurrency(v.total_amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-normal">
                        Subtotal: {formatCurrency(v.subtotal_amount)} + GST: {formatCurrency(v.tax_amount)}
                      </p>
                      {onRecommendVendor && (
                        <button
                          type="button"
                          onClick={() => onRecommendVendor(v.vendor_id, v.quotation_id)}
                          className="w-full mt-2 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
                        >
                          Select Vendor
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
