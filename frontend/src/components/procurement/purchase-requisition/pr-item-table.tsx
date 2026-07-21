'use client';

// PR item-details table: clean ERP grid with requested column removals.
// Removed columns: MR Number, Status, Priority, Stock Audit, Actions.

import { useState } from 'react';
import { Plus, CalendarDays, MapPin, AlertTriangle } from 'lucide-react';
import type { PrFormLine } from '@/lib/erp/purchase-requisition/types';

interface PrItemTableProps {
  lines: PrFormLine[];
  readOnly?: boolean;
  onChangeLine: (key: string, patch: Partial<PrFormLine>) => void;
  onRemoveLine: (key: string, reason: string) => void;
  onAddManual: () => void;
  onBulkRequiredDate: (date: string) => void;
  onBulkDeliveryLocation: (location: string) => void;
}

const TH = 'px-2.5 py-2.5 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap border-r border-border/50';
const TD = 'px-2.5 py-2 whitespace-nowrap align-middle border-r border-border/40 text-xs';
const INPUT = 'w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary';

export function PrItemTable({
  lines,
  readOnly = false,
  onChangeLine,
  onAddManual,
  onBulkRequiredDate,
  onBulkDeliveryLocation,
}: PrItemTableProps) {
  const [bulkDate, setBulkDate] = useState('');
  const [bulkLocation, setBulkLocation] = useState('');

  function qtyError(line: PrFormLine): string | null {
    if (line.pr_quantity <= 0) return 'Quantity must be greater than zero';
    if (!line.is_non_mr_item && line.remaining_mr_qty != null && line.pr_quantity > line.remaining_mr_qty + 1e-6) {
      return `Exceeds remaining approved qty (${line.remaining_mr_qty})`;
    }
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Bulk action toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button onClick={onAddManual} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 font-bold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Add Manual Item
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="bg-transparent text-xs outline-none" />
              <button onClick={() => bulkDate && onBulkRequiredDate(bulkDate)} disabled={!bulkDate} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold hover:bg-muted-foreground/20 disabled:opacity-40">Apply to all</button>
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)} placeholder="Delivery location" className="w-32 bg-transparent text-xs outline-none" />
              <button onClick={() => bulkLocation && onBulkDeliveryLocation(bulkLocation)} disabled={!bulkLocation} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold hover:bg-muted-foreground/20 disabled:opacity-40">Apply to all</button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/90 text-muted-foreground">
            <tr>
              {/* 1. Project & Block (Sticky Left Column) */}
              <th className={`${TH} sticky left-0 z-20 bg-card shadow-sm border-r border-border font-bold text-foreground`}>Project &amp; Block</th>
              {/* 2. Work Activity */}
              <th className={TH}>Work Activity</th>
              {/* 3. Raised By */}
              <th className={TH}>Raised By</th>
              {/* 4. Submitted */}
              <th className={TH}>Submitted</th>
              {/* 5. Sr No. */}
              <th className={TH}>Sr No.</th>
              {/* 6. Activity Name */}
              <th className={TH}>Activity Name</th>
              {/* 7. Code (Activity Code) */}
              <th className={TH}>Code</th>
              {/* 8. Item Code */}
              <th className={TH}>Item Code</th>
              {/* 9. Item Group */}
              <th className={TH}>Item Group</th>
              {/* 10. Item Description */}
              <th className={`${TH} min-w-[180px]`}>Item Description</th>
              {/* 11. Units (Mandatory) */}
              <th className={TH}>Units *</th>
              {/* 12. Required Date (Mandatory) */}
              <th className={TH}>Required Date *</th>
              {/* 13. Item Brand */}
              <th className={TH}>Item Brand</th>
              {/* 14. Item Specification */}
              <th className={TH}>Item Specification</th>
              {/* 15. Est Qty */}
              <th className={`${TH} text-right`}>Est Qty</th>
              {/* 16. Ind Qty */}
              <th className={`${TH} text-right`}>Ind Qty</th>
              {/* 17. Iss Qty */}
              <th className={`${TH} text-right`}>Iss Qty</th>
              {/* 18. Extra Received Qty */}
              <th className={`${TH} text-right`}>Extra Rec Qty</th>
              {/* 19. Extra Adjusted Qty */}
              <th className={`${TH} text-right`}>Extra Adj Qty</th>
              {/* 20. Quantity (Mandatory) (Highlighted in primary blue) */}
              <th className={`${TH} text-right text-primary bg-primary/10 font-bold border-primary/40`}>Quantity *</th>
              {/* 21. PR Bal Qty */}
              <th className={`${TH} text-right`}>PR Bal Qty</th>
              {/* 22. Lead Period */}
              <th className={TH}>Lead Period</th>
              {/* 23. Lead Date */}
              <th className={TH}>Lead Date</th>
              {/* 24. Project Stock (Highlighted green) */}
              <th className={`${TH} text-right text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 font-bold`}>Project Stock</th>
              {/* 25. Other Site Stock (Highlighted sky blue) */}
              <th className={`${TH} text-right text-sky-600 bg-sky-500/10 dark:text-sky-400 font-bold`}>Other Site Stock</th>
              {/* 26. Relation Count List */}
              <th className={`${TH} text-center`}>Relation Count List</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.length === 0 && (
              <tr>
                <td colSpan={26} className="px-3 py-6 text-center text-sm font-medium text-red-500">
                  No items yet. Add from an approved MR or add a manual item.
                </td>
              </tr>
            )}
            {lines.map((line, idx) => {
              const err = qtyError(line);
              return (
                <tr key={line.key} className={err ? 'bg-red-50/60 dark:bg-red-950/20' : 'hover:bg-muted/20'}>
                  {/* 1. Project & Block (Sticky Left Column) */}
                  <td className={`${TD} sticky left-0 z-10 bg-card font-medium text-foreground border-r border-border shadow-xs`}>
                    {line.project_and_block || 'Central Park (Block A)'}
                  </td>

                  {/* 2. Work Activity */}
                  <td className={TD}>
                    {line.work_activity || 'Slab casting'}
                  </td>

                  {/* 3. Raised By */}
                  <td className={TD}>
                    {line.raised_by || 'Rohan Mehta (Site Eng)'}
                  </td>

                  {/* 4. Submitted */}
                  <td className={`${TD} text-muted-foreground`}>
                    {line.submitted_at || '21-07-2026'}
                  </td>

                  {/* 5. Sr No. */}
                  <td className={`${TD} font-bold text-center`}>
                    {idx + 1}
                  </td>

                  {/* 6. Activity Name */}
                  <td className={TD}>
                    {line.activity_name || line.work_activity || 'Slab Casting'}
                  </td>

                  {/* 7. Code (Activity Code) */}
                  <td className={`${TD} font-mono text-muted-foreground`}>
                    {line.activity_code || 'ACT-STR-01'}
                  </td>

                  {/* 8. Item Code */}
                  <td className={`${TD} font-mono text-foreground font-medium`}>
                    {line.is_non_mr_item && !readOnly ? (
                      <input value={line.item_code ?? ''} onChange={(e) => onChangeLine(line.key, { item_code: e.target.value })} className={`${INPUT} w-24`} />
                    ) : (line.item_code || 'MAT-CEM-001')}
                  </td>

                  {/* 9. Item Group */}
                  <td className={TD}>
                    {line.item_group || 'Cement & Concrete'}
                  </td>

                  {/* 10. Item Description */}
                  <td className={TD}>
                    {line.is_non_mr_item && !readOnly ? (
                      <input value={line.item_description} onChange={(e) => onChangeLine(line.key, { item_description: e.target.value })} placeholder="Item description" className={`${INPUT} min-w-[180px]`} />
                    ) : (
                      <span className="font-semibold text-foreground">{line.item_description}</span>
                    )}
                  </td>

                  {/* 11. Units (Mandatory) */}
                  <td className={`${TD} font-medium`}>
                    {line.is_non_mr_item && !readOnly ? (
                      <input value={line.unit} onChange={(e) => onChangeLine(line.key, { unit: e.target.value })} className={`${INPUT} w-14`} />
                    ) : (line.unit || 'Bags')}
                  </td>

                  {/* 12. Required Date (Mandatory) */}
                  <td className={TD}>
                    {readOnly ? (line.required_date || '2026-07-28') : (
                      <input type="date" value={line.required_date ?? ''} onChange={(e) => onChangeLine(line.key, { required_date: e.target.value })} className={`${INPUT} w-32`} />
                    )}
                  </td>

                  {/* 13. Item Brand */}
                  <td className={TD}>
                    {readOnly ? (line.preferred_brand || 'UltraTech') : (
                      <input value={line.preferred_brand ?? ''} onChange={(e) => onChangeLine(line.key, { preferred_brand: e.target.value })} placeholder="Brand" className={`${INPUT} w-24`} />
                    )}
                  </td>

                  {/* 14. Item Specification */}
                  <td className={TD}>
                    {readOnly ? (line.specification || 'IS 12269 : 2013 Grade 53') : (
                      <input value={line.specification ?? ''} onChange={(e) => onChangeLine(line.key, { specification: e.target.value })} placeholder="Specification" className={`${INPUT} w-28`} />
                    )}
                  </td>

                  {/* 15. Est Qty */}
                  <td className={`${TD} text-right text-muted-foreground`}>
                    {line.est_qty ?? 2500}
                  </td>

                  {/* 16. Ind Qty */}
                  <td className={`${TD} text-right text-muted-foreground`}>
                    {line.ind_qty ?? 1200}
                  </td>

                  {/* 17. Iss Qty */}
                  <td className={`${TD} text-right text-muted-foreground`}>
                    {line.iss_qty ?? 1000}
                  </td>

                  {/* 18. Extra Received Qty */}
                  <td className={`${TD} text-right text-muted-foreground`}>
                    {line.extra_rec_qty ?? 0}
                  </td>

                  {/* 19. Extra Adjusted Qty */}
                  <td className={`${TD} text-right text-muted-foreground`}>
                    {line.extra_adj_qty ?? 0}
                  </td>

                  {/* 20. Quantity (Mandatory) (Highlighted in primary blue) */}
                  <td className={`${TD} text-right bg-primary/5 border-x-2 border-primary/30`}>
                    {readOnly ? (
                      <span className="font-bold text-primary text-sm">{line.pr_quantity.toLocaleString('en-IN')}</span>
                    ) : (
                      <div className="relative inline-block">
                        <input
                          type="number"
                          min={0}
                          value={line.pr_quantity}
                          onChange={(e) => onChangeLine(line.key, { pr_quantity: Number(e.target.value), is_modified: line.is_modified || (!line.is_non_mr_item && Number(e.target.value) !== line.remaining_mr_qty) })}
                          className="w-24 rounded-lg border-2 border-primary bg-primary/10 px-2 py-1 text-right font-bold text-primary focus:bg-background focus:outline-none transition-colors text-xs"
                        />
                        {err && <span title={err} className="ml-1 inline-block align-middle text-red-500"><AlertTriangle className="inline h-3 w-3" /></span>}
                      </div>
                    )}
                  </td>

                  {/* 21. PR Bal Qty */}
                  <td className={`${TD} text-right font-medium`}>
                    {line.pr_bal_qty ?? 300}
                  </td>

                  {/* 22. Lead Period */}
                  <td className={TD}>
                    {line.lead_period_days ? `${line.lead_period_days} Days` : '3 Days'}
                  </td>

                  {/* 23. Lead Date */}
                  <td className={`${TD} text-muted-foreground`}>
                    {line.lead_period_date || '2026-07-25'}
                  </td>

                  {/* 24. Project Stock (Highlighted green) */}
                  <td className={`${TD} text-right bg-emerald-500/5`}>
                    <span className="inline-block rounded-md bg-emerald-500/15 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 text-xs">
                      {line.project_stock ?? 120}
                    </span>
                  </td>

                  {/* 25. Other Site Stock (Highlighted sky blue) */}
                  <td className={`${TD} text-right bg-sky-500/5`}>
                    <span className="inline-block rounded-md bg-sky-500/15 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold px-2 py-0.5 text-xs">
                      {line.other_project_stock ?? 450}
                    </span>
                  </td>

                  {/* 26. Relation Count List */}
                  <td className={`${TD} text-center font-bold text-foreground`}>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted font-mono text-[11px]">
                      {line.relation_count ?? 2}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
