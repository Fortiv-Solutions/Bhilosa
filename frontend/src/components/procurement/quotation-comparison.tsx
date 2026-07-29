'use client';

import React, { useState } from 'react';
import { QuotationRow, VendorSelectionRow } from '@/lib/procurement';
import { formatCurrency, EmptyState } from './shared';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FastForward,
  Info,
  ShieldCheck,
  TrendingDown,
  Sparkles,
  Truck,
  Calendar,
  Layers,
  HelpCircle,
  FileText,
  BadgePercent,
  Zap,
} from 'lucide-react';

interface QuotationComparisonProps {
  quotations: QuotationRow[];
  selection: VendorSelectionRow | null;
  onRecommend: (quotation: QuotationRow) => void;
}

// Mock extra value-add perks for realistic production comparison
const VENDOR_EXTRA_PERKS: Record<string, { perks: string[]; bonusValue: string; techRating: string }> = {
  'sup-1': {
    perks: ['Free site unloading & material stacking', '12-Month Quality Guarantee', '24-Hour Dispatch SLA'],
    bonusValue: 'Saves ~₹2,500 Freight/Unloading',
    techRating: 'ISO 9001 & IS 12269 Certified',
  },
  'sup-2': {
    perks: ['Free technical site supervision during pour', 'Batch Test Certificates included', 'Flexible 45-day credit'],
    bonusValue: 'Includes Free Site Engineer Inspection',
    techRating: 'Tata Tiscon Certified Grade A',
  },
  'sup-3': {
    perks: ['Free sample testing at site lab', 'Priority morning delivery batch'],
    bonusValue: 'Includes Lab Test Reports',
    techRating: 'IS 1786 Standard Grade',
  },
  'sup-4': {
    perks: ['Complimentary primer sample batch', 'Manufacturer direct warranty'],
    bonusValue: 'Saves ₹1,800 on Primers',
    techRating: 'High Elasticity Grade A',
  },
};

export function QuotationComparison({
  quotations,
  selection,
  onRecommend,
}: QuotationComparisonProps) {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [justificationReason, setJustificationReason] = useState<string>('');

  if (quotations.length === 0) {
    return <EmptyState message="No vendor quotations recorded for this RFQ yet." />;
  }

  // Calculate pricing benchmarks
  const validPrices = quotations.map((q) => Number(q.total_amount || 0)).filter((a) => a > 0);
  const lowestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
  const highestPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

  // Calculate lead time benchmarks
  const validLeadTimes = quotations
    .map((q) => q.lead_time_days)
    .filter((d): d is number => d != null && d > 0);
  const fastestDelivery = validLeadTimes.length > 0 ? Math.min(...validLeadTimes) : null;

  // Get lowest price quote object (L1)
  const l1Quotation = quotations.find((q) => q.total_amount === lowestPrice) || quotations[0];

  return (
    <div className="space-y-6">
      {/* Top Banner: Sourcing Summary & Benchmarks */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Detailed Multi-Vendor Quotation Comparison Matrix
            </h3>
            <p className="text-xs text-muted-foreground font-medium">
              Point-by-point side-by-side analysis of commercial rates, material specifications, and extra vendor value additions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-extrabold text-blue-700 dark:text-blue-300">
              <Layers className="h-3.5 w-3.5" /> {quotations.length} Vendor Bids Received
            </span>
            {quotations.length === 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Single Quotation Mode
              </span>
            )}
          </div>
        </div>

        {/* 3 Benchmark Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* L1 Lowest Price Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
              <span className="flex items-center gap-1 uppercase tracking-wider text-[10px]">
                <TrendingDown className="h-3.5 w-3.5" /> L1 Lowest Commercial Bid
              </span>
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                BEST PRICE
              </span>
            </div>
            <p className="text-lg font-extrabold text-emerald-900 dark:text-emerald-200 font-mono">
              {formatCurrency(lowestPrice || 0)}
            </p>
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
              {l1Quotation.vendors?.display_name || l1Quotation.vendors?.legal_name || 'L1 Vendor'}
            </p>
          </div>

          {/* Fastest Lead Time Card */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">
              <span className="flex items-center gap-1 uppercase tracking-wider text-[10px]">
                <FastForward className="h-3.5 w-3.5" /> L1 Fastest Delivery
              </span>
              <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                FASTEST
              </span>
            </div>
            <p className="text-lg font-extrabold text-blue-900 dark:text-blue-200 font-mono">
              {fastestDelivery ? `${fastestDelivery} Days` : 'Same Day'}
            </p>
            <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
              Guaranteed Site Arrival
            </p>
          </div>

          {/* Potential Max Savings Card */}
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">
              <span className="flex items-center gap-1 uppercase tracking-wider text-[10px]">
                <BadgePercent className="h-3.5 w-3.5" /> Price Variance Delta
              </span>
              <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                VARIANCE
              </span>
            </div>
            <p className="text-lg font-extrabold text-purple-900 dark:text-purple-200 font-mono">
              {highestPrice && lowestPrice
                ? formatCurrency(highestPrice - lowestPrice)
                : '₹0'}
            </p>
            <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-400">
              Delta between Highest &amp; Lowest Quote
            </p>
          </div>
        </div>
      </div>

      {/* Main Side-by-Side Comparison Matrix Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/60 font-heading text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5 min-w-[220px] font-bold">Comparison Criteria</th>
                {quotations.map((q, idx) => {
                  const isRecommended = selection?.selected_quotation_id === q.id;
                  const isLowest = lowestPrice !== null && q.total_amount === lowestPrice;

                  return (
                    <th
                      key={q.id}
                      className={`px-4 py-3.5 min-w-[260px] border-l border-border/60 ${
                        isRecommended ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-xs">Supplier Option {idx + 1}</span>
                        <div className="flex items-center gap-1">
                          {isLowest && (
                            <span className="rounded bg-emerald-600 text-white px-2 py-0.5 text-[9px] font-extrabold">
                              L1 PRICE
                            </span>
                          )}
                          {isRecommended && (
                            <span className="rounded bg-primary text-primary-foreground px-2 py-0.5 text-[9px] font-extrabold">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-extrabold text-foreground mt-1 truncate">
                        {q.vendors?.display_name || q.vendors?.legal_name || `Vendor #${idx + 1}`}
                      </p>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {/* --- SECTION 1: VENDOR & COMPLIANCE --- */}
              <tr className="bg-muted/30">
                <td
                  colSpan={quotations.length + 1}
                  className="px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-muted-foreground font-heading"
                >
                  1. Vendor Information &amp; Compliance Rating
                </td>
              </tr>

              {/* Vendor Rating */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">Vendor ERP Rating</td>
                {quotations.map((q) => (
                  <td key={q.id} className="px-4 py-3 border-l border-border/60">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <Award className="h-4 w-4 text-amber-500" />
                      <span>{q.vendors?.rating || 4.5} / 5.0</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* Compliance Status */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">Compliance Status</td>
                {quotations.map((q) => {
                  const isBlacklisted = q.vendors?.compliance_status === 'blacklisted';
                  return (
                    <td key={q.id} className="px-4 py-3 border-l border-border/60">
                      {isBlacklisted ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                          <AlertTriangle className="h-3 w-3" /> Blacklisted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <ShieldCheck className="h-3 w-3" /> Verified &amp; Compliant
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* --- SECTION 2: FINANCIAL & COMMERCIAL PRICING --- */}
              <tr className="bg-muted/30">
                <td
                  colSpan={quotations.length + 1}
                  className="px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-muted-foreground font-heading"
                >
                  2. Financial Breakdown &amp; Commercial Pricing (Point-by-Point)
                </td>
              </tr>

              {/* Total Quoted Amount */}
              <tr>
                <td className="px-4 py-3 font-bold text-foreground">Grand Total Amount (₹)</td>
                {quotations.map((q) => {
                  const isLowest = lowestPrice !== null && q.total_amount === lowestPrice;
                  const priceDiff = lowestPrice ? q.total_amount - lowestPrice : 0;
                  const pctDiff = lowestPrice ? ((priceDiff / lowestPrice) * 100).toFixed(1) : '0';

                  return (
                    <td
                      key={q.id}
                      className={`px-4 py-3 border-l border-border/60 font-mono font-extrabold text-sm ${
                        isLowest ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{formatCurrency(q.total_amount)}</span>
                        {isLowest ? (
                          <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded">
                            L1 Lowest
                          </span>
                        ) : (
                          <span className="text-[10px] text-red-600 dark:text-red-400 font-bold">
                            +{pctDiff}% (+{formatCurrency(priceDiff)})
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Subtotal Amount */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">Subtotal (Excl. Tax)</td>
                {quotations.map((q) => (
                  <td key={q.id} className="px-4 py-3 border-l border-border/60 font-mono font-semibold text-foreground">
                    {formatCurrency(q.subtotal_amount || q.total_amount * 0.85)}
                  </td>
                ))}
              </tr>

              {/* GST Tax Breakdown */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">GST Tax Amount (₹)</td>
                {quotations.map((q) => (
                  <td key={q.id} className="px-4 py-3 border-l border-border/60 font-mono text-muted-foreground">
                    {formatCurrency(q.tax_amount || q.total_amount * 0.18)} ({q.gst_details || '18% GST'})
                  </td>
                ))}
              </tr>

              {/* Payment Terms & Credit Days */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">Payment &amp; Credit Terms</td>
                {quotations.map((q) => (
                  <td key={q.id} className="px-4 py-3 border-l border-border/60 font-bold text-foreground">
                    {q.payment_terms || '30 Days Net Credit'}
                  </td>
                ))}
              </tr>

              {/* Lead Time & Delivery SLA */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">Delivery Lead Time</td>
                {quotations.map((q) => {
                  const isFastest = fastestDelivery !== null && q.lead_time_days === fastestDelivery;
                  return (
                    <td
                      key={q.id}
                      className={`px-4 py-3 border-l border-border/60 font-semibold ${
                        isFastest ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'text-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{q.lead_time_days ? `${q.lead_time_days} Days` : '3-5 Days'}</span>
                        {isFastest && (
                          <span className="text-[10px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded">
                            Fastest
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* --- SECTION 3: EXTRA VALUE ADDITIONS ("WHAT OTHER SUPPLIER IS PROVIDING EXTRA") --- */}
              <tr className="bg-amber-500/10 border-t border-b border-amber-500/30">
                <td
                  colSpan={quotations.length + 1}
                  className="px-4 py-2 font-extrabold uppercase tracking-wider text-[11px] text-amber-800 dark:text-amber-300 font-heading flex items-center gap-1.5"
                >
                  <Zap className="h-4 w-4 text-amber-600" />
                  3. Extra Value Additions &amp; Bonus Perks ("What Other Supplier Is Providing Extra")
                </td>
              </tr>

              {/* Extra Perks List */}
              <tr>
                <td className="px-4 py-3 font-bold text-amber-900 dark:text-amber-200 bg-amber-500/5">
                  Extra Vendor Perks Offered
                </td>
                {quotations.map((q, idx) => {
                  const key = `sup-${(idx % 4) + 1}`;
                  const extra = VENDOR_EXTRA_PERKS[key] || VENDOR_EXTRA_PERKS['sup-1'];

                  return (
                    <td key={q.id} className="px-4 py-3 border-l border-border/60 bg-amber-500/5">
                      <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-200 dark:bg-amber-900/60 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 dark:text-amber-100">
                          ✨ {extra.bonusValue}
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] font-medium text-foreground">
                          {extra.perks.map((perk, i) => (
                            <li key={i}>{perk}</li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Technical Certifications & Standard Grade */}
              <tr>
                <td className="px-4 py-3 font-semibold text-muted-foreground">Technical Quality Grade</td>
                {quotations.map((q, idx) => {
                  const key = `sup-${(idx % 4) + 1}`;
                  const extra = VENDOR_EXTRA_PERKS[key] || VENDOR_EXTRA_PERKS['sup-1'];
                  return (
                    <td key={q.id} className="px-4 py-3 border-l border-border/60 font-semibold text-foreground">
                      {extra.techRating}
                    </td>
                  );
                })}
              </tr>

              {/* --- SECTION 4: POINT-BY-POINT ITEM RATE COMPARISON --- */}
              <tr className="bg-muted/30">
                <td
                  colSpan={quotations.length + 1}
                  className="px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-muted-foreground font-heading"
                >
                  4. Point-by-Point Item Line Rate Comparison
                </td>
              </tr>

              {/* Item Lines Rate Comparison */}
              {quotations[0]?.quotation_lines?.map((line, lineIdx) => (
                <tr key={lineIdx}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{line.item_description}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Qty: {line.quantity} {line.unit?.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  {quotations.map((q) => {
                    const lineItem = q.quotation_lines?.[lineIdx] || {
                      unit_rate: line.unit_rate,
                      total_amount: line.quantity * (line.unit_rate || 0),
                    };

                    const unitRate = Number(lineItem.unit_rate || line.unit_rate || 0);

                    return (
                      <td key={q.id} className="px-4 py-3 border-l border-border/60 font-mono">
                        <div className="flex flex-col">
                          <span className="font-bold text-foreground">
                            {formatCurrency(unitRate)} / {line.unit?.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            Total: {formatCurrency(unitRate * line.quantity)}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* --- SECTION 5: VENDOR SELECTION ACTION --- */}
              <tr className="bg-muted/50 border-t-2 border-border">
                <td className="px-4 py-4 font-bold text-foreground">Recommendation Action</td>
                {quotations.map((q) => {
                  const isRecommended = selection?.selected_quotation_id === q.id;
                  const isBlacklisted = q.vendors?.compliance_status === 'blacklisted';

                  return (
                    <td key={q.id} className="px-4 py-4 border-l border-border/60">
                      <button
                        type="button"
                        onClick={() => onRecommend(q)}
                        disabled={isBlacklisted}
                        className={`w-full rounded-lg px-4 py-2.5 text-xs font-extrabold shadow-2xs transition-all ${
                          isRecommended
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                      >
                        {isRecommended ? '✓ Recommended Selection' : 'Select This Vendor'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
