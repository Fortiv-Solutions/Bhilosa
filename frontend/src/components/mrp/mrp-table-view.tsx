'use client';

import { AlertTriangle, CheckCircle2, HelpCircle, Package, Building2 } from 'lucide-react';
import type { MrpRow } from '@/lib/erp/mrp/types';

function formatQty(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function StatusBadge({ row }: { row: MrpRow }) {
  if (row.boqMatchConfidence === 'unmatched') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
        <HelpCircle className="h-3.5 w-3.5 text-amber-600" /> Unmatched BOQ
      </span>
    );
  }
  if (row.reorderFlag) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[11px] font-extrabold text-red-700 dark:text-red-300">
        <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Reorder Now
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Healthy
    </span>
  );
}

export function MrpTableView({ rows }: { rows: MrpRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">No Materials to Plan</p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Once BOQ requirements, stock balances, and purchase orders are recorded for this project, the MRP board
          will populate automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b border-border bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-3.5 py-3.5">Material</th>
              <th className="px-3.5 py-3.5">Project</th>
              <th className="px-3.5 py-3.5 text-right">BOQ Required</th>
              <th className="px-3.5 py-3.5 text-right">On Hand</th>
              <th className="px-3.5 py-3.5 text-right">On Order</th>
              <th className="px-3.5 py-3.5 text-right">Net Requirement</th>
              <th className="px-3.5 py-3.5 text-right">Reorder Point</th>
              <th className="px-3.5 py-3.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr key={`${row.projectId}-${row.itemId}`} className="group hover:bg-muted/30 transition-colors align-middle font-sans">
                <td className="px-3.5 py-3">
                  <span className="font-bold text-foreground text-xs">{row.itemName}</span>
                  <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">{row.sku || 'No SKU'}</div>
                </td>
                <td className="px-3.5 py-3">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                    {row.projectName}
                  </span>
                </td>
                <td className="px-3.5 py-3 text-right font-semibold text-foreground">
                  {formatQty(row.boqRequiredQty)} <span className="text-muted-foreground">{row.uom}</span>
                </td>
                <td className="px-3.5 py-3 text-right text-foreground">
                  {formatQty(row.onHandQty)} <span className="text-muted-foreground">{row.uom}</span>
                </td>
                <td className="px-3.5 py-3 text-right text-foreground">
                  {formatQty(row.onOrderQty)} <span className="text-muted-foreground">{row.uom}</span>
                </td>
                <td className="px-3.5 py-3 text-right font-extrabold text-foreground">
                  {formatQty(row.netRequirementQty)} <span className="font-normal text-muted-foreground">{row.uom}</span>
                </td>
                <td className="px-3.5 py-3 text-right text-muted-foreground">
                  {formatQty(row.reorderPoint)} <span>{row.uom}</span>
                </td>
                <td className="px-3.5 py-3 text-center">
                  <StatusBadge row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
