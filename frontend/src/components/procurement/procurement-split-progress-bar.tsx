'use client';

import { useEffect, useState } from 'react';
import { Split, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase-client';

export type VendorSplitAllocation = {
  vendorId: string;
  vendorName: string;
  poNumber: string | null;
  awardedQty: number;
  totalQty: number;
  percentage: number;
  colorClass: string;
  badgeColorClass: string;
};

interface ProcurementSplitProgressBarProps {
  prId?: string;
  mrId?: string;
  totalQuantity?: number;
  directSplits?: VendorSplitAllocation[];
  compact?: boolean;
  showDetails?: boolean;
}

const COLOR_PALETTE = [
  { bar: 'bg-purple-600 dark:bg-purple-500', badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30' },
  { bar: 'bg-emerald-600 dark:bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  { bar: 'bg-amber-600 dark:bg-amber-500', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  { bar: 'bg-indigo-600 dark:bg-indigo-500', badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' },
  { bar: 'bg-sky-600 dark:bg-sky-500', badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30' },
];

export function ProcurementSplitProgressBar({
  prId,
  mrId,
  totalQuantity,
  directSplits,
  compact = false,
  showDetails = true,
}: ProcurementSplitProgressBarProps) {
  const [loading, setLoading] = useState(!directSplits);
  const [splits, setSplits] = useState<VendorSplitAllocation[]>(directSplits || []);

  useEffect(() => {
    if (directSplits) {
      setSplits(directSplits);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function loadSplits() {
      if (!prId && !mrId) return;
      setLoading(true);

      try {
        let targetPrId = prId;

        // If mrId provided, resolve linked PR ID
        if (!targetPrId && mrId) {
          const { data: prData } = await supabase
            .from('purchase_requisitions')
            .select('id')
            .eq('material_request_id', mrId)
            .limit(1)
            .maybeSingle();

          if (prData) targetPrId = prData.id;
        }

        if (!targetPrId) {
          if (isMounted) setLoading(false);
          return;
        }

        // Fetch PR Lines to get total quantity
        const { data: prLines } = await supabase
          .from('purchase_requisition_lines')
          .select('id, quantity')
          .eq('purchase_requisition_id', targetPrId);

        const calculatedTotalQty = totalQuantity || (prLines || []).reduce((sum, l) => sum + Number(l.quantity || 0), 0) || 100;
        const lineIds = (prLines || []).map((l) => l.id);

        // Fetch Awards with vendor and PO details
        let awardQuery = supabase
          .from('vendor_selection_awards')
          .select(`
            id,
            awarded_qty,
            vendor_id,
            purchase_order_id,
            vendors (
              id,
              display_name,
              legal_name
            ),
            purchase_orders (
              id,
              po_number
            )
          `)
          .neq('status', 'cancelled');

        if (lineIds.length > 0) {
          awardQuery = awardQuery.in('purchase_requisition_line_id', lineIds);
        }

        const { data: awards } = await awardQuery;

        if (isMounted && awards && awards.length > 0) {
          const vendorGroups: Record<string, { vendorName: string; poNumber: string | null; qty: number }> = {};

          for (const a of awards as any[]) {
            const vName = a.vendors?.display_name || a.vendors?.legal_name || 'Vendor';
            const poNum = a.purchase_orders?.po_number || (a.purchase_order_id ? `PO-${String(a.purchase_order_id).slice(0, 6)}` : 'Auto-Draft PO');
            const key = `${a.vendor_id}:${poNum}`;

            if (!vendorGroups[key]) {
              vendorGroups[key] = { vendorName: vName, poNumber: poNum, qty: 0 };
            }
            vendorGroups[key].qty += Number(a.awarded_qty || 0);
          }

          const parsedSplits: VendorSplitAllocation[] = Object.values(vendorGroups).map((g, idx) => {
            const pct = Math.min(100, Math.round((g.qty / calculatedTotalQty) * 100));
            const palette = COLOR_PALETTE[idx % COLOR_PALETTE.length];
            return {
              vendorId: g.vendorName.toLowerCase().replace(/[^a-z0-9]/g, ''),
              vendorName: g.vendorName,
              poNumber: g.poNumber,
              awardedQty: g.qty,
              totalQty: calculatedTotalQty,
              percentage: pct,
              colorClass: palette.bar,
              badgeColorClass: palette.badge,
            };
          });

          setSplits(parsedSplits);
        }
      } catch (e) {
        console.warn('Error loading split progress:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSplits();
    return () => {
      isMounted = false;
    };
  }, [prId, mrId, totalQuantity, directSplits]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse py-1">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        <span>Loading Sourcing Progress...</span>
      </div>
    );
  }

  if (splits.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-1.5 ${compact ? 'max-w-[220px]' : 'w-full'}`}>
      {/* Progress Bar Track */}
      <div className="relative flex h-2 w-full overflow-hidden rounded-full bg-muted/60 border border-border/40 shadow-2xs">
        {splits.map((s, idx) => (
          <div
            key={`${s.vendorName}-${idx}`}
            style={{ width: `${s.percentage}%` }}
            className={`h-full ${s.colorClass} transition-all duration-500`}
            title={`${s.percentage}% Procured via ${s.poNumber || 'PO'} (${s.vendorName})`}
          />
        ))}
      </div>

      {/* Split Details Breakdown */}
      {showDetails && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {splits.map((s, idx) => (
            <span
              key={`badge-${s.vendorName}-${idx}`}
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-bold ${s.badgeColorClass}`}
            >
              <Split className="h-2.5 w-2.5 opacity-70" />
              <span>
                {s.percentage}% Procured via {s.poNumber || 'PO'} ({s.vendorName})
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
