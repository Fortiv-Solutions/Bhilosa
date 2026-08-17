'use client';

import { AlertTriangle, CalendarClock, PackageSearch, ShieldCheck } from 'lucide-react';
import type { PendingDeliveryRow } from '@/lib/erp/purchase-order/delivery-followup';

interface DeliveriesStatsBarProps {
  rows: PendingDeliveryRow[];
}

export function DeliveriesStatsBar({ rows }: DeliveriesStatsBarProps) {
  const total = rows.length;
  const overdue = rows.filter((r) => r.urgency.tone === 'danger').length;
  const dueThisWeek = rows.filter((r) => r.urgency.tone === 'warning').length;
  const onTrack = rows.filter((r) => r.urgency.tone === 'success').length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Total Pending</span>
          <PackageSearch className="h-4 w-4 text-blue-500" />
        </div>
        <p className="text-xl font-extrabold text-foreground font-heading">{total}</p>
        <p className="text-[10px] text-muted-foreground font-medium">Orders awaiting delivery</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Overdue</span>
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </div>
        <p className="text-xl font-extrabold text-red-600 dark:text-red-400 font-heading">{overdue}</p>
        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Past promised delivery date</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-bold uppercase tracking-wider font-heading">Due Soon</span>
          <CalendarClock className="h-4 w-4 text-amber-500" />
        </div>
        <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 font-heading">{dueThisWeek}</p>
        <p className="text-[10px] text-muted-foreground font-medium">Due today or within 3 days</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-bold uppercase tracking-wider font-heading">On Track</span>
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        </div>
        <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-heading">{onTrack}</p>
        <p className="text-[10px] text-muted-foreground font-medium">More than 3 days out</p>
      </div>
    </div>
  );
}
