'use client';

// PR item-details table: clean ERP grid with all 26 editable columns.

import { useState, useEffect, useRef } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import type { PrFormLine } from '@/lib/erp/purchase-requisition/types';

export const STANDARD_UNITS = [
  'NOS',
  'KGS',
  'BAGS',
  'BRASS',
  'BUCKET',
  'BOX',
  'PACKET',
  'BUNDLE',
  'RFT',
  'SQ.FT.',
  'LTR',
  'MT',
  'CUM',
  'SET',
] as const;

export function normalizeUnit(rawUnit?: string | null): string {
  if (!rawUnit || !rawUnit.trim()) return 'NOS';
  const u = rawUnit.trim();
  const lower = u.toLowerCase();

  if (/^(nos|no|number|numbers|pcs|piece|pieces)$/i.test(lower)) return 'NOS';
  if (/^(kg|kgs|kilogram|kilograms)$/i.test(lower)) return 'KGS';
  if (/^(bag|bags|bagsbags)$/i.test(lower)) return 'BAGS';
  if (/^(brass)$/i.test(lower)) return 'BRASS';
  if (/^(bucket|buckets)$/i.test(lower)) return 'BUCKET';
  if (/^(box|boxes)$/i.test(lower)) return 'BOX';
  if (/^(packet|packets|pkt)$/i.test(lower)) return 'PACKET';
  if (/^(bundle|bundles|bndl)$/i.test(lower)) return 'BUNDLE';
  if (/^(rn\.ft|rnft|rft|running feet|running foot)$/i.test(lower)) return 'RFT';
  if (/^(sqf|sqft|sq\.ft\.|sq\.ft|square feet)$/i.test(lower)) return 'SQ.FT.';
  if (/^(lit|liter|liters|litre|litres|ltr)$/i.test(lower)) return 'LTR';
  if (/^(mt|metric ton|ton|tons)$/i.test(lower)) return 'MT';
  if (/^(cum|cubic meter|cubic metre)$/i.test(lower)) return 'CUM';
  if (/^(set|sets)$/i.test(lower)) return 'SET';

  return u.toUpperCase();
}

function SearchableUnitInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = isTyping && value.trim() !== ''
    ? STANDARD_UNITS.filter((u) => u.toLowerCase().includes(value.trim().toLowerCase()))
    : STANDARD_UNITS;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsTyping(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (disabled) return <span className="font-bold text-foreground">{value || 'NOS'}</span>;

  return (
    <div ref={ref} className="relative w-24 mx-auto">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsTyping(true);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsTyping(false);
          setIsOpen(true);
        }}
        placeholder="Unit"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-center font-bold outline-none focus:border-primary uppercase"
      />
      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 max-h-48 w-36 overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl text-left">
          <div className="py-1">
            {filtered.length > 0 ? (
              filtered.map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`w-full px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                    u.toLowerCase() === (value || '').trim().toLowerCase() ? 'bg-accent text-primary font-extrabold' : ''
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(u);
                    setIsOpen(false);
                    setIsTyping(false);
                  }}
                >
                  {u}
                </button>
              ))
            ) : (
              <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground italic">
                Custom: &quot;{value}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
const INPUT = 'w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary font-medium';

export function PrItemTable({
  lines,
  readOnly = false,
  onChangeLine,
}: PrItemTableProps) {

  function qtyError(line: PrFormLine): string | null {
    if (line.pr_quantity <= 0) return 'Quantity must be greater than zero';
    if (!line.is_non_mr_item && line.remaining_mr_qty != null && line.pr_quantity > line.remaining_mr_qty + 1e-6) {
      return `Exceeds remaining approved qty (${line.remaining_mr_qty})`;
    }
    return null;
  }

  return (
    <div className="space-y-2">


      <div className="overflow-x-auto rounded-xl border border-border shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/90 text-muted-foreground">
            <tr>
              {/* 1. Sr No. */}
              <th className={`${TH} sticky left-0 z-20 bg-card shadow-sm border-r border-border font-bold text-foreground`}>Sr No.</th>
              {/* 2. Item Description */}
              <th className={`${TH} min-w-[200px] font-bold text-foreground`}>Item Description</th>
              {/* 3. Activity Name */}
              <th className={TH}>Activity Name</th>
              {/* 4. Sub-Activity */}
              <th className={TH}>Sub-Activity</th>
              {/* 5. Item Group */}
              <th className={TH}>Item Group</th>
              {/* 6. Item Brand */}
              <th className={TH}>Item Brand</th>
              {/* 8. Units (Mandatory) */}
              <th className={`${TH} text-center`}>Units *</th>
              {/* 10. Quantity (Mandatory) (Highlighted in primary blue) */}
              <th className={`${TH} text-right text-primary bg-primary/10 font-bold border-primary/40`}>Quantity *</th>
              {/* 11. PR Bal Qty */}
              <th className={`${TH} text-right`}>PR Bal Qty</th>
              {/* 12. Required Date (Mandatory) */}
              <th className={`${TH} text-center`}>Required Date *</th>
              {/* 13. Lead Period */}
              <th className={`${TH} text-center`}>Lead Period</th>
              {/* 14. Lead Date */}
              <th className={`${TH} text-center`}>Lead Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-sm font-medium text-red-500">
                  No items yet. Select from an approved MR above.
                </td>
              </tr>
            )}
            {lines.map((line, idx) => {
              const err = qtyError(line);
              return (
                <tr key={line.key} className={err ? 'bg-red-50/60 dark:bg-red-950/20' : 'hover:bg-muted/20'}>
                  {/* 1. Sr No. */}
                  <td className={`${TD} sticky left-0 z-10 bg-card font-bold text-center border-r border-border shadow-xs`}>
                    {idx + 1}
                  </td>

                  {/* 2. Item Description */}
                  <td className={TD}>
                    {!readOnly ? (
                      <input value={line.item_description} onChange={(e) => onChangeLine(line.key, { item_description: e.target.value })} placeholder="Item description" className={`${INPUT} min-w-[200px] font-bold`} />
                    ) : (
                      <span className="font-semibold text-foreground">{line.item_description}</span>
                    )}
                  </td>

                  {/* 3. Activity Name */}
                  <td className={TD}>
                    {!readOnly ? (
                      <input value={line.activity_name || line.work_activity || ''} onChange={(e) => onChangeLine(line.key, { activity_name: e.target.value })} placeholder="—" className={`${INPUT} w-28`} />
                    ) : (line.activity_name || line.work_activity || '—')}
                  </td>

                  {/* 4. Sub-Activity */}
                  <td className={TD}>
                    {!readOnly ? (
                      <input value={line.sub_activity_name || ''} onChange={(e) => onChangeLine(line.key, { sub_activity_name: e.target.value })} placeholder="—" className={`${INPUT} w-28`} />
                    ) : (line.sub_activity_name || '—')}
                  </td>

                  {/* 5. Item Group */}
                  <td className={TD}>
                    {!readOnly ? (
                      <input value={line.item_group || ''} onChange={(e) => onChangeLine(line.key, { item_group: e.target.value })} placeholder="—" className={`${INPUT} w-28`} />
                    ) : (line.item_group || '—')}
                  </td>

                  {/* 6. Item Brand */}
                  <td className={TD}>
                    {!readOnly ? (
                      <input value={line.preferred_brand || ''} onChange={(e) => onChangeLine(line.key, { preferred_brand: e.target.value })} placeholder="—" className={`${INPUT} w-24`} />
                    ) : (line.preferred_brand || '—')}
                  </td>

                  {/* 8. Units (Mandatory) */}
                  <td className={`${TD} text-center`}>
                    <SearchableUnitInput
                      value={line.unit || ''}
                      onChange={(val) => onChangeLine(line.key, { unit: val })}
                      disabled={readOnly}
                    />
                  </td>

                  {/* 10. Quantity (Mandatory) (Highlighted in primary blue) */}
                  <td className={`${TD} text-right bg-primary/5 border-x-2 border-primary/30`}>
                    {readOnly ? (
                      <span className="font-bold text-primary text-sm">{(line.pr_quantity || 0).toLocaleString('en-IN')}</span>
                    ) : (
                      <div className="relative inline-block">
                        <input
                          type="number"
                          min={0}
                          value={line.pr_quantity ?? ''}
                          onChange={(e) => onChangeLine(line.key, { pr_quantity: Number(e.target.value), is_modified: line.is_modified || (!line.is_non_mr_item && Number(e.target.value) !== line.remaining_mr_qty) })}
                          className="w-24 rounded-lg border-2 border-primary bg-primary/10 px-2 py-1 text-right font-bold text-primary focus:bg-background focus:outline-none transition-colors text-xs"
                        />
                        {err && <span title={err} className="ml-1 inline-block align-middle text-red-500"><AlertTriangle className="inline h-3 w-3" /></span>}
                      </div>
                    )}
                  </td>

                  {/* 11. PR Bal Qty — derived: MR balance still unrequisitioned
                       after this line's quantity. Read-only; a hand-typed value
                       could contradict the MR and silently break conversion. */}
                  <td className={`${TD} text-right`}>
                    {(() => {
                      if (line.remaining_mr_qty == null) return <span className="text-muted-foreground">—</span>;
                      const bal = Math.max(Number(line.remaining_mr_qty) - Number(line.pr_quantity || 0), 0);
                      return (
                        <span className={`font-semibold tabular-nums ${bal > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}`} title={`MR balance ${line.remaining_mr_qty} − PR qty ${line.pr_quantity || 0}`}>
                          {bal.toLocaleString('en-IN')}
                        </span>
                      );
                    })()}
                  </td>

                  {/* 12. Required Date (Mandatory) */}
                  <td className={`${TD} text-center`}>
                    {readOnly ? (line.required_date || '—') : (
                      <input type="date" value={line.required_date ?? ''} onChange={(e) => onChangeLine(line.key, { required_date: e.target.value })} className={`${INPUT} w-32`} />
                    )}
                  </td>

                  {/* 13. Lead Period */}
                  <td className={`${TD} text-center`}>
                    {!readOnly ? (
                      <input type="number" value={line.lead_period_days ?? ''} placeholder="—" onChange={(e) => onChangeLine(line.key, { lead_period_days: e.target.value === '' ? undefined : Number(e.target.value) })} className={`${INPUT} w-20 text-right`} />
                    ) : (line.lead_period_days ? `${line.lead_period_days} Days` : '—')}
                  </td>

                  {/* 14. Lead Date */}
                  <td className={`${TD} text-center`}>
                    {!readOnly ? (
                      <input type="date" value={line.lead_period_date ?? ''} onChange={(e) => onChangeLine(line.key, { lead_period_date: e.target.value })} className={`${INPUT} w-32`} />
                    ) : (line.lead_period_date || '—')}
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
