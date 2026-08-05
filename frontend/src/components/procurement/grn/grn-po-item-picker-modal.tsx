'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  CheckSquare,
  Square,
  History,
  Layers,
  CheckCircle2,
  AlertCircle,
  Truck,
  PlusCircle,
  Loader2,
  Info,
  Calendar,
} from 'lucide-react';
import {
  type PoLineWithBalance,
  fetchPoLineReceiptHistory,
  type PoLineReceiptHistoryItem,
} from '@/lib/procurement';

interface GrnPoItemPickerModalProps {
  poNumber: string;
  poLines: PoLineWithBalance[];
  alreadySelectedPoLineIds: string[];
  onConfirmSelection: (
    selected: { line: PoLineWithBalance; receivingQty: number }[]
  ) => void;
  onClose: () => void;
}

export function GrnPoItemPickerModal({
  poNumber,
  poLines,
  alreadySelectedPoLineIds,
  onConfirmSelection,
  onClose,
}: GrnPoItemPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'selected' | 'completed'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Track checked lines and user-edited receiving quantities
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (alreadySelectedPoLineIds && alreadySelectedPoLineIds.length > 0) {
      poLines.forEach((l) => {
        if (alreadySelectedPoLineIds.includes(l.po_line_id)) {
          initial[l.po_line_id] = true;
        }
      });
    } else {
      const firstPending = poLines.find((l) => l.as_on_date_po_balance_qty > 0 && !l.is_short_closed);
      if (firstPending) {
        initial[firstPending.po_line_id] = true;
      }
    }
    return initial;
  });

  const [receivingQuantities, setReceivingQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    poLines.forEach((l) => {
      initial[l.po_line_id] = Math.max(0, l.as_on_date_po_balance_qty);
    });
    return initial;
  });

  // History Popover State
  const [historyTargetLine, setHistoryTargetLine] = useState<PoLineWithBalance | null>(null);
  const [historyItems, setHistoryItems] = useState<PoLineReceiptHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (historyTargetLine?.po_line_id) {
      let active = true;
      setLoadingHistory(true);
      fetchPoLineReceiptHistory(historyTargetLine.po_line_id).then((res) => {
        if (active) {
          setHistoryItems(res);
          setLoadingHistory(false);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [historyTargetLine]);

  // Categorise items by status
  const pendingLines = poLines.filter((l) => l.as_on_date_po_balance_qty > 0 && !l.is_short_closed);
  const completedLines = poLines.filter((l) => l.as_on_date_po_balance_qty <= 0 || l.is_short_closed);
  const checkedLineIds = Object.keys(selectedItems).filter((id) => selectedItems[id]);

  // Filter based on active tab & search term
  const activeList = (
    activeTab === 'pending'
      ? pendingLines
      : activeTab === 'completed'
      ? completedLines
      : poLines.filter((l) => selectedItems[l.po_line_id])
  ).filter((l) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      l.item_description.toLowerCase().includes(q) ||
      l.item_code.toLowerCase().includes(q) ||
      l.item_group.toLowerCase().includes(q) ||
      l.item_brand.toLowerCase().includes(q)
    );
  });

  const handleToggleCheck = (lineId: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [lineId]: !prev[lineId],
    }));
  };

  const handleToggleSelectAllPending = () => {
    const allPendingChecked = pendingLines.every((l) => selectedItems[l.po_line_id]);
    const updated = { ...selectedItems };
    pendingLines.forEach((l) => {
      updated[l.po_line_id] = !allPendingChecked;
    });
    setSelectedItems(updated);
  };

  const handleQuantityChange = (lineId: string, val: number) => {
    setReceivingQuantities((prev) => ({
      ...prev,
      [lineId]: Math.max(0, val),
    }));
  };

  const handleConfirm = () => {
    const payload = poLines
      .filter((l) => selectedItems[l.po_line_id])
      .map((l) => ({
        line: l,
        receivingQty: receivingQuantities[l.po_line_id] ?? l.as_on_date_po_balance_qty,
      }));
    onConfirmSelection(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-4xl flex-col bg-card shadow-2xl border-l border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <span>Select Items from PO</span>
                <span className="font-mono text-primary font-extrabold bg-primary/10 px-2 py-0.5 rounded-md text-xs">
                  {poNumber}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground font-medium">
                Choose the specific items and quantities physically delivered in this shipment.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter Controls & Tabs */}
        <div className="space-y-3 border-b border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search item code, description, brand, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-xs font-semibold text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-hidden"
              />
            </div>

            {/* Select All Toggle */}
            {activeTab === 'pending' && pendingLines.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAllPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
              >
                <CheckSquare className="h-4 w-4" />
                {pendingLines.every((l) => selectedItems[l.po_line_id])
                  ? 'Deselect All Pending'
                  : 'Select All Pending Items'}
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-border/60 pb-1 text-xs font-bold">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 transition-all cursor-pointer ${
                activeTab === 'pending'
                  ? 'border-primary text-primary font-extrabold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Pending Items</span>
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono text-amber-700 dark:text-amber-300">
                {pendingLines.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('selected')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 transition-all cursor-pointer ${
                activeTab === 'selected'
                  ? 'border-primary text-primary font-extrabold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Selected for GRN</span>
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-mono text-primary">
                {checkedLineIds.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('completed')}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 transition-all cursor-pointer ${
                activeTab === 'completed'
                  ? 'border-primary text-primary font-extrabold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Fully Received / Short-Closed</span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                {completedLines.length}
              </span>
            </button>
          </div>
        </div>

        {/* Item Table Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-bold text-muted-foreground">No matching PO items found.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Try adjusting your search filter or switching tabs above.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 w-10 text-center">Select</th>
                    <th className="px-4 py-3">Item Description &amp; Code</th>
                    <th className="px-3 py-3 text-right">PO Qty</th>
                    <th className="px-3 py-3 text-right">Prev. Received</th>
                    <th className="px-3 py-3 text-right">Open Balance</th>
                    <th className="px-4 py-3 w-36 text-center">Receiving Qty</th>
                    <th className="px-3 py-3 text-center">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {activeList.map((line) => {
                    const isChecked = Boolean(selectedItems[line.po_line_id]);
                    const isCompleted = line.as_on_date_po_balance_qty <= 0 || line.is_short_closed;
                    const prevPct = Math.round(
                      (line.prev_accepted_qty / Math.max(1, line.approved_qty)) * 100
                    );

                    return (
                      <tr
                        key={line.po_line_id}
                        className={`transition-colors align-middle ${
                          isChecked ? 'bg-primary/5 dark:bg-primary/10' : 'hover:bg-muted/30'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            disabled={isCompleted}
                            onClick={() => handleToggleCheck(line.po_line_id)}
                            className="cursor-pointer text-primary disabled:opacity-40"
                          >
                            {isChecked ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground/60" />
                            )}
                          </button>
                        </td>

                        {/* Item Code & Description */}
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground text-xs">
                            {line.item_description}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground mt-0.5">
                            <span className="font-bold text-primary">{line.item_code}</span>
                            {line.item_group && <span>• {line.item_group}</span>}
                            {line.unit && <span>• {line.unit.toUpperCase()}</span>}
                          </div>
                        </td>

                        {/* PO Qty */}
                        <td className="px-3 py-3 text-right font-mono font-bold text-foreground">
                          {line.approved_qty.toLocaleString('en-IN')} {line.unit}
                        </td>

                        {/* Prev Received */}
                        <td className="px-3 py-3 text-right font-mono">
                          <div className="font-semibold text-muted-foreground">
                            {line.prev_accepted_qty.toLocaleString('en-IN')} {line.unit}
                          </div>
                          {line.approved_qty > 0 && (
                            <div className="text-[9px] font-bold text-muted-foreground/70">
                              ({prevPct}%)
                            </div>
                          )}
                        </td>

                        {/* Open Balance */}
                        <td className="px-3 py-3 text-right font-mono">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> Fully Received
                            </span>
                          ) : (
                            <span className="font-extrabold text-amber-600 dark:text-amber-400 text-xs">
                              {line.as_on_date_po_balance_qty.toLocaleString('en-IN')} {line.unit}
                            </span>
                          )}
                        </td>

                        {/* Receiving Qty Input */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            step="0.01"
                            disabled={!isChecked || isCompleted}
                            value={receivingQuantities[line.po_line_id] ?? line.as_on_date_po_balance_qty}
                            onChange={(e) =>
                              handleQuantityChange(line.po_line_id, Number(e.target.value))
                            }
                            className="w-28 rounded-lg border-2 border-primary/50 bg-background px-2.5 py-1.5 text-center font-mono font-extrabold text-foreground text-xs focus:ring-2 focus:ring-primary disabled:opacity-40"
                          />
                        </td>

                        {/* History Trigger */}
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setHistoryTargetLine(line)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer"
                            title="View Receipt History across past GRNs"
                          >
                            <History className="h-3.5 w-3.5 text-primary" />
                            <span>Audit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-4">
          <div className="text-xs font-semibold text-muted-foreground">
            Selected: <strong className="text-foreground">{checkedLineIds.length} item(s)</strong> ready for GRN
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={checkedLineIds.length === 0}
              onClick={handleConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
              Add {checkedLineIds.length} Selected Items to GRN ➔
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RECEIPT HISTORY POPOVER / MODAL                                           */}
      {/* ========================================================================= */}
      {historyTargetLine && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-xs font-bold text-foreground font-heading">
                    Multi-GRN Receipt History Audit
                  </h3>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {historyTargetLine.item_description} ({historyTargetLine.item_code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHistoryTargetLine(null)}
                className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-xs gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Loading receipt timeline...</span>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-xs text-muted-foreground">
                No past GRNs recorded for this line item yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {historyItems.map((h, i) => (
                  <div
                    key={h.grn_id || i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-xs shadow-2xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-mono font-bold text-foreground">
                        <span>{h.grn_number}</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          {h.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {new Date(h.grn_date).toLocaleDateString('en-GB')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" /> Vehicle: {h.vehicle_no}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="font-extrabold text-emerald-600 dark:text-emerald-400">
                        +{h.accepted_qty.toLocaleString('en-IN')} accepted
                      </div>
                      {h.rejected_qty > 0 && (
                        <div className="text-[10px] font-bold text-red-500">
                          {h.rejected_qty} rejected
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-3 text-right">
              <button
                onClick={() => setHistoryTargetLine(null)}
                className="rounded-lg bg-secondary px-4 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary/80"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
