'use client';

import { Boxes, AlertTriangle, ClipboardList, FileQuestion } from 'lucide-react';
import type { MrpRow } from '@/lib/erp/mrp/types';

function formatQty(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

export function MrpStatsBar({ rows }: { rows: MrpRow[] }) {
  const materialsTracked = new Set(rows.map((row) => row.itemId)).size;
  const reorderFlagCount = rows.filter((row) => row.reorderFlag).length;
  const totalNetRequirementQty = rows.reduce((sum, row) => sum + row.netRequirementQty, 0);
  const unmatchedBoqCount = rows.filter((row) => row.boqMatchConfidence === 'unmatched').length;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
          <Boxes className="h-3.5 w-3.5" /> Materials Tracked
        </div>
        <span className="mt-1 block text-lg font-extrabold text-foreground font-mono">{materialsTracked}</span>
      </div>

      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-red-700 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Reorder Flags
        </div>
        <span className="mt-1 block text-lg font-extrabold text-red-700 dark:text-red-300 font-mono">
          {reorderFlagCount}
        </span>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
          <ClipboardList className="h-3.5 w-3.5" /> Net Requirement Qty
        </div>
        <span className="mt-1 block text-lg font-extrabold text-blue-700 dark:text-blue-300 font-mono">
          {formatQty(totalNetRequirementQty)}
        </span>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
          <FileQuestion className="h-3.5 w-3.5" /> Unmatched BOQ Items
        </div>
        <span className="mt-1 block text-lg font-extrabold text-amber-700 dark:text-amber-300 font-mono">
          {unmatchedBoqCount}
        </span>
      </div>
    </div>
  );
}
