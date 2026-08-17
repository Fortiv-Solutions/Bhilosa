'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Users } from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { listVendorScorecards } from '@/lib/erp/vendor/scorecard';
import { VendorScorecard } from '@/components/vendors/vendor-scorecard';

/**
 * Vendor performance, folded into Procurement now that the standalone
 * /vendors page is out of nav — this is one of the 5 explicitly-requested
 * procurement features (supplier OTIF/rejection scorecard) and needs to stay
 * reachable even though the general vendor-management page doesn't.
 */
export function ProcurementVendorsTab() {
  const [vendors, setVendors] = useState<{ vendorId: string; vendorName: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    listVendorScorecards()
      .then((rows) => setVendors(rows.map((r) => ({ vendorId: r.vendorId, vendorName: r.vendorName }))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground font-heading">Vendor Performance</h2>
          <p className="text-[11px] font-medium text-muted-foreground">
            OTIF and rejection-rate scorecard for every vendor with recent deliveries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLiveSupabase() && (
            <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Demo Data
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-12 text-sm font-semibold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading vendor performance…
        </div>
      ) : vendors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
            No vendor deliveries in the last 90 days
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
            Vendors appear here once at least one GRN has been posted against a purchase order.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {vendors.map((v) => (
            <div key={v.vendorId} className="rounded-xl border border-border bg-card p-4 shadow-2xs">
              <p className="text-xs font-bold text-foreground mb-2">{v.vendorName}</p>
              <VendorScorecard vendorId={v.vendorId} vendorName={v.vendorName} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
