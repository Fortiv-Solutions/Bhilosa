'use client';

// ============================================================================
// RFQ SOURCING BASKET
// File: frontend/src/components/procurement/rfq/rfq-sourcing-basket.tsx
//
// Picks WHICH requisition lines — and how much of each — go out to tender.
//
// Before this existed, an RFQ was a header pointing at a PR: every line was
// implicitly included, at full quantity, with no rfq_lines written at all. That
// made partial sourcing impossible and left quotations nothing to bind to.
//
// The tenderable quantity per line comes from the server
// (pr_line_sourcing_view.available_to_source), not from quantity - ordered_qty.
// Computing it client-side would miss quantity already sitting on someone
// else's open RFQ, and two buyers could tender the same units.
// ============================================================================

import { useMemo } from 'react';
import { AlertTriangle, PackageCheck, Info } from 'lucide-react';
import type { SourcingBasketLine } from '@/lib/procurement';
import { formatCurrency } from '@/components/procurement/shared';

export interface BasketSelection {
  /** pr_line_id -> quantity to tender. Absent = not selected. */
  [prLineId: string]: number;
}

interface RfqSourcingBasketProps {
  lines: SourcingBasketLine[];
  loading: boolean;
  selection: BasketSelection;
  onChange: (next: BasketSelection) => void;
  disabled?: boolean;
}

/** A line with nothing left to tender cannot be selected. */
export function isSourceable(line: SourcingBasketLine): boolean {
  return line.available_to_source > 0.0001;
}

/** Per-line validation. Returns null when the quantity is acceptable. */
export function basketLineError(line: SourcingBasketLine, qty: number): string | null {
  if (!(qty > 0)) return 'Quantity must be greater than zero.';
  if (qty > line.available_to_source + 1e-6) {
    return `Only ${line.available_to_source.toLocaleString('en-IN')} ${line.unit} remain untendered.`;
  }
  return null;
}

/** Validates the whole basket. Returns [] when it is safe to submit. */
export function validateBasket(
  lines: SourcingBasketLine[],
  selection: BasketSelection,
): string[] {
  const errors: string[] = [];
  const chosen = lines.filter((l) => selection[l.pr_line_id] !== undefined);

  if (chosen.length === 0) {
    errors.push('Select at least one requisition line to put out to tender.');
    return errors;
  }

  for (const line of chosen) {
    const err = basketLineError(line, selection[line.pr_line_id]);
    if (err) errors.push(`"${line.item_description}": ${err}`);
  }
  return errors;
}

export function RfqSourcingBasket({
  lines,
  loading,
  selection,
  onChange,
  disabled = false,
}: RfqSourcingBasketProps) {
  const sourceable = useMemo(() => lines.filter(isSourceable), [lines]);
  const exhausted = useMemo(() => lines.filter((l) => !isSourceable(l)), [lines]);

  const selectedIds = Object.keys(selection);
  const allSelected = sourceable.length > 0 && selectedIds.length === sourceable.length;

  const estimatedValue = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qty = selection[l.pr_line_id];
        return qty ? sum + qty * l.estimated_rate : sum;
      }, 0),
    [lines, selection],
  );

  function toggle(line: SourcingBasketLine) {
    if (disabled || !isSourceable(line)) return;
    const next = { ...selection };
    if (next[line.pr_line_id] !== undefined) delete next[line.pr_line_id];
    // Default to the full remaining quantity — the common case is tendering
    // everything that is left.
    else next[line.pr_line_id] = line.available_to_source;
    onChange(next);
  }

  function setQty(line: SourcingBasketLine, raw: string) {
    if (disabled) return;
    const next = { ...selection };
    if (raw === '') {
      next[line.pr_line_id] = 0;
    } else {
      next[line.pr_line_id] = Number(raw);
    }
    onChange(next);
  }

  function toggleAll() {
    if (disabled) return;
    if (allSelected) {
      onChange({});
      return;
    }
    const next: BasketSelection = {};
    for (const l of sourceable) next[l.pr_line_id] = l.available_to_source;
    onChange(next);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-5 text-center">
        <Info className="mx-auto mb-1 h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs font-semibold text-muted-foreground">
          This requisition has no lines to tender.
        </p>
      </div>
    );
  }

  if (sourceable.length === 0) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-900/50 dark:bg-amber-950/30">
        <PackageCheck className="mx-auto mb-1 h-5 w-5 text-amber-600 dark:text-amber-400" />
        <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
          Every line is already tendered or ordered
        </p>
        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
          Nothing remains on this requisition to put out to quotation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={disabled}
            className="h-3.5 w-3.5 accent-[color:var(--color-primary)]"
          />
          Select all ({sourceable.length})
        </label>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {selectedIds.length} selected · est.{' '}
          <span className="text-primary">{formatCurrency(estimatedValue)}</span>
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted/95 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2">Activity</th>
              <th className="px-2 py-2 text-right">Requisitioned</th>
              <th className="px-2 py-2 text-right">Available</th>
              <th className="px-2 py-2 text-right text-primary">Tender Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sourceable.map((line) => {
              const qty = selection[line.pr_line_id];
              const checked = qty !== undefined;
              const err = checked ? basketLineError(line, qty) : null;

              return (
                <tr
                  key={line.pr_line_id}
                  className={checked ? 'bg-primary/5' : 'hover:bg-muted/30'}
                >
                  <td className="px-2 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(line)}
                      disabled={disabled}
                      className="mt-1 h-3.5 w-3.5 accent-[color:var(--color-primary)]"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <span className="block font-semibold text-foreground">
                      {line.item_description}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {[line.item_code, line.item_group, line.preferred_brand]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-muted-foreground">
                    {line.activity_name || '—'}
                    {line.sub_activity_name ? (
                      <span className="block text-[10px] opacity-80">{line.sub_activity_name}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {line.quantity.toLocaleString('en-IN')} {line.unit}
                    {line.ordered_qty > 0 && (
                      <span className="block text-[10px]">
                        {line.ordered_qty.toLocaleString('en-IN')} ordered
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {line.available_to_source.toLocaleString('en-IN')}
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <input
                      type="number"
                      value={checked ? qty : ''}
                      onChange={(e) => setQty(line, e.target.value)}
                      onFocus={() => {
                        if (!checked) toggle(line);
                      }}
                      disabled={disabled}
                      min={0}
                      max={line.available_to_source}
                      step="any"
                      placeholder="—"
                      aria-label={`Tender quantity for ${line.item_description}`}
                      aria-invalid={Boolean(err)}
                      className={`w-24 rounded-md border bg-background px-2 py-1 text-right text-xs font-bold outline-none focus:ring-1 ${
                        err
                          ? 'border-red-400 text-red-600 focus:ring-red-300 dark:text-red-400'
                          : 'border-border focus:border-primary focus:ring-primary/20'
                      }`}
                    />
                    {err && (
                      <span className="mt-0.5 block text-[10px] font-semibold text-red-600 dark:text-red-400">
                        {err}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {exhausted.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            {exhausted.length} line{exhausted.length === 1 ? ' is' : 's are'} hidden — already
            fully tendered or ordered.
          </span>
        </p>
      )}
    </div>
  );
}
