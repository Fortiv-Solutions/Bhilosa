'use client';

import { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  TrendingUp,
  BellRing,
  X,
  Building2,
  Send,
  FileCheck2,
  Users,
} from 'lucide-react';
import type { PurchaseRequisitionRow, RfqRow, QuotationRow, VendorSelectionRow } from '@/lib/procurement';

interface RfqStatsBarProps {
  approvedPrs: PurchaseRequisitionRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  onSelectTab?: (tab: 'all' | 'ready_for_rfq' | 'rfq_sent' | 'quotes_received' | 'finalized') => void;
}

export function RfqStatsBar({ approvedPrs, rfqs, quotations, selections, onSelectTab }: RfqStatsBarProps) {
  const [dismissed, setDismissed] = useState(false);

  // Stats calculation
  const readyForRfqCount = approvedPrs.filter(
    (pr) => !rfqs.some((r) => r.purchase_requisition_id === pr.id)
  ).length;

  const activeRfqsCount = rfqs.length;
  const quotesReceivedCount = quotations.length;
  const approvedSelectionsCount = selections.filter((s) => s.status === 'approved').length;

  const totalSourcingValue = approvedPrs.reduce(
    (sum, pr) => sum + Number(pr.total_amount || pr.subtotal_amount || 0),
    0
  );

  // Live Project & Site Breakdown for Approved PRs
  const projectBreakdown = approvedPrs.reduce<Record<string, number>>((acc, r) => {
    const projName =
      r.project_id === 'central-park'
        ? 'Central Park'
        : r.project_id === 'riverside-heights'
        ? 'Riverside Heights'
        : r.project_id === 'skyline-towers'
        ? 'Skyline Towers'
        : 'Central Park';
    acc[projName] = (acc[projName] || 0) + 1;
    return acc;
  }, {});

  const projectEntries = Object.entries(projectBreakdown);
  const visibleProjects = projectEntries.slice(0, 3);
  const hiddenProjectsCount = Math.max(0, projectEntries.length - 3);

  return (
    <div className="space-y-3">
      {/* Active Operational Alerts & Reminders Banner */}
      {!dismissed ? (
        <div className="relative rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/10 via-indigo-950/10 to-purple-950/10 p-4 text-xs text-foreground shadow-2xs transition-all space-y-3">
          {/* Top-Right Dismiss / Close Button */}
          <button
            onClick={() => setDismissed(true)}
            title="Dismiss Summary Banner"
            aria-label="Dismiss summary banner"
            className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-lg border border-blue-500/20 bg-background/80 text-muted-foreground hover:bg-blue-500/20 hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="flex flex-col gap-2.5 pr-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold mt-0.5">
                <BellRing className="h-4 w-4 animate-bounce" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-bold text-foreground text-xs uppercase tracking-wider">
                    Daily RFQ &amp; Vendor Sourcing Command Queue
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700 dark:text-emerald-300">
                    Approved PR Pipeline
                  </span>
                </div>
                <p className="text-muted-foreground text-[11px] font-medium leading-relaxed">
                  <strong className="text-blue-700 dark:text-blue-400 font-bold">{readyForRfqCount} approved PR(s) ready for RFQ</strong> • {activeRfqsCount} active RFQ(s) sent to vendors • {quotesReceivedCount} quotation(s) received • {approvedSelectionsCount} vendor selection(s) finalized.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Action Chips (Scalable for 100+ PRs) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-blue-500/20 pt-2.5 text-[11px]">
            {/* Clickable Quick-Filter Action Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onSelectTab?.('ready_for_rfq')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/15 px-2.5 py-1 font-bold text-blue-800 dark:text-blue-300 shadow-2xs hover:bg-blue-500/25 transition-all text-left"
              >
                <Send className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>📥 {readyForRfqCount} Ready for RFQ</span>
              </button>

              <button
                onClick={() => onSelectTab?.('rfq_sent')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/15 px-2.5 py-1 font-bold text-purple-800 dark:text-purple-300 shadow-2xs hover:bg-purple-500/25 transition-all text-left"
              >
                <FileCheck2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>⚡ {activeRfqsCount} Active RFQs Sent</span>
              </button>

              <button
                onClick={() => onSelectTab?.('quotes_received')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 font-bold text-amber-800 dark:text-amber-300 shadow-2xs hover:bg-amber-500/25 transition-all text-left"
              >
                <Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>📊 {quotesReceivedCount} Quotes Received</span>
              </button>

              <button
                onClick={() => onSelectTab?.('finalized')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-800 dark:text-emerald-300 shadow-2xs hover:bg-emerald-500/25 transition-all text-left"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>✅ {approvedSelectionsCount} Selections Approved</span>
              </button>
            </div>

            {/* Scalable Top Site Breakdown */}
            <div className="flex flex-wrap items-center gap-1.5 font-medium text-muted-foreground">
              <span className="font-semibold text-foreground text-[10px] uppercase tracking-wider font-heading flex items-center gap-1">
                <Building2 className="h-3 w-3 text-primary" /> Approved Site Demands:
              </span>
              {visibleProjects.map(([proj, count]) => (
                <span
                  key={proj}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-foreground shadow-2xs"
                >
                  {proj}: <strong className="text-primary font-extrabold">{count} PRs</strong>
                </span>
              ))}
              {hiddenProjectsCount > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground">
                  +{hiddenProjectsCount} more
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={() => setDismissed(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-2xs"
          >
            <BellRing className="h-3.5 w-3.5 text-blue-500" />
            <span>Show RFQ Operational Summary</span>
          </button>
        </div>
      )}

      {/* Structured Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Approved PR Queue</span>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-extrabold text-foreground font-heading">{approvedPrs.length}</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Ready for Vendor Sourcing</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Active RFQs Sent</span>
            <Send className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-xl font-extrabold text-purple-600 dark:text-purple-400 font-heading">{activeRfqsCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Dispatched to Vendors</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Quotes Received</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 font-heading">{quotesReceivedCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Awaiting Comparison</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Finalized POs</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-heading">{approvedSelectionsCount}</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Approved by Management</p>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Sourcing Value</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-extrabold text-primary font-heading">
            ₹{totalSourcingValue > 100000 ? `${(totalSourcingValue / 100000).toFixed(2)}L` : totalSourcingValue.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium">Total approved PR value</p>
        </div>
      </div>
    </div>
  );
}
