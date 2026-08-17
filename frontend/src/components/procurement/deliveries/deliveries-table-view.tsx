'use client';

import { PackageSearch, MessageSquarePlus } from 'lucide-react';
import type { PendingDeliveryRow } from '@/lib/erp/purchase-order/delivery-followup';
import { DELIVERY_URGENCY_TONE_CLASSES } from '@/lib/erp/purchase-order/delivery-urgency';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface DeliveriesTableViewProps {
  rows: PendingDeliveryRow[];
  onLogFollowUp: (row: PendingDeliveryRow) => void;
}

export function DeliveriesTableView({ rows, onLogFollowUp }: DeliveriesTableViewProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
          Nothing pending delivery
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Purchase orders with a promised delivery date that haven&apos;t been fully received yet will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b border-border bg-muted/50 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3.5 min-w-[150px]">PO No. &amp; Date</th>
              <th className="px-4 py-3.5 min-w-[180px]">Vendor</th>
              <th className="px-4 py-3.5 min-w-[140px]">Project</th>
              <th className="px-3 py-3.5 min-w-[130px]">Delivery Date</th>
              <th className="px-3 py-3.5 text-right">Amount (₹)</th>
              <th className="px-3 py-3.5 text-center">Follow-ups</th>
              <th className="px-4 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr key={row.id} className="group hover:bg-muted/30 transition-colors align-middle">
                <td className="px-4 py-3">
                  <div className="font-mono font-bold text-foreground text-xs">{row.po_number || '—'}</div>
                  <div className="text-[10px] font-medium text-muted-foreground">{formatDate(row.po_date)}</div>
                </td>
                <td className="px-4 py-3 font-bold text-foreground text-xs truncate max-w-[180px]">
                  {row.vendor_name || '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-muted-foreground text-xs truncate max-w-[140px]">
                  {row.project_name || '—'}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground">{formatDate(row.delivery_date)}</span>
                    <span
                      className={`inline-flex w-max items-center rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold ${DELIVERY_URGENCY_TONE_CLASSES[row.urgency.tone]}`}
                    >
                      {row.urgency.label}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-foreground text-xs">
                  {formatAmount(row.total_amount)}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {row.followUpCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onLogFollowUp(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all shadow-2xs cursor-pointer"
                    title="Log a follow-up note"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Log Follow-up
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
