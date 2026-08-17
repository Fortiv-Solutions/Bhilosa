'use client';

import { useEffect, useState } from 'react';
import { Percent, AlertTriangle, Clock, PackageCheck } from 'lucide-react';
import { getVendorScorecard, type VendorScorecard as VendorScorecardData } from '@/lib/erp/vendor/scorecard';

/**
 * Self-fetching Vendor Performance Scorecard: OTIF % and rejection rate over a
 * trailing window, rendered as stat tiles in the same visual language as the
 * "Procurement History" tiles on the vendor profile panel.
 */
export function VendorScorecard({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const [scorecard, setScorecard] = useState<VendorScorecardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVendorScorecard(vendorId)
      .then((data) => {
        if (!cancelled) setScorecard(data);
      })
      .catch((err) => {
        console.error(`Failed to load scorecard for vendor ${vendorId}:`, err);
        if (!cancelled) setScorecard(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
        Vendor Performance Scorecard
      </h4>

      {loading ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Loading delivery history for {vendorName}…
        </div>
      ) : !scorecard || !scorecard.dataSufficient ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Insufficient delivery history in the last {scorecard?.windowDays ?? 90} days to compute an OTIF / rejection-rate scorecard for {vendorName}.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              <Percent className="h-3.5 w-3.5" /> OTIF (last {scorecard.windowDays}d)
            </div>
            <p className="mt-1 font-heading text-lg font-bold text-emerald-600">
              {scorecard.otifPercent !== null ? `${scorecard.otifPercent}%` : 'N/A'}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {scorecard.otifCount} on-time of {scorecard.otifCount + scorecard.lateDeliveries.count} with a promised date
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Rejection Rate
            </div>
            <p className="mt-1 font-heading text-lg font-bold text-red-600">
              {scorecard.rejectionRatePercent !== null ? `${scorecard.rejectionRatePercent}%` : 'N/A'}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {scorecard.totalRejectedQty} rejected of {scorecard.totalReceivedQty} received
            </p>
          </div>

          {scorecard.lateDeliveries.count > 0 && (
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Avg Delay (days)
              </div>
              <p className="mt-1 font-heading text-lg font-bold text-amber-600">
                {scorecard.lateDeliveries.avgDelayDays ?? 'N/A'}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Across {scorecard.lateDeliveries.count} late deliveries
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5" /> Deliveries Tracked
            </div>
            <p className="mt-1 font-heading text-lg font-bold text-foreground">{scorecard.deliveriesInWindow}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Sample size behind the percentages above</p>
          </div>
        </div>
      )}
    </div>
  );
}
