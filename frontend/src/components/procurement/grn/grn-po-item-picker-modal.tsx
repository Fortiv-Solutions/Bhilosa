'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Building2,
  PackageCheck,
  ChevronRight,
  ChevronDown,
  Filter,
  ArrowRight,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import {
  type PoLineWithBalance,
  fetchPoLineReceiptHistory,
  type PoLineReceiptHistoryItem,
  fetchMultiPoLinesWithBalances,
} from '@/lib/procurement';

export interface PoOption {
  id: string;
  po_number: string;
  vendor_name?: string;
  project_name?: string;
  company_name?: string;
  godown_name?: string;
}

interface GrnPoItemPickerModalProps {
  poNumber?: string;
  poLines?: PoLineWithBalance[];
  availablePoOptions?: PoOption[];
  initialSelectedPoIds?: string[];
  alreadySelectedPoLineIds?: string[];
  onConfirmSelection: (
    selected: { line: PoLineWithBalance; receivingQty: number }[]
  ) => void;
  onClose: () => void;
}

export function GrnPoItemPickerModal({
  poNumber,
  poLines: staticPoLines,
  availablePoOptions = [],
  initialSelectedPoIds = [],
  alreadySelectedPoLineIds = [],
  onConfirmSelection,
  onClose,
}: GrnPoItemPickerModalProps) {
  // Master View Filter Segment: 'open' | 'selected'
  const [viewFilter, setViewFilter] = useState<'open' | 'selected'>('open');
  const [globalSearch, setGlobalSearch] = useState('');

  // Track collapsed state for PO cards in Selected for GRN view
  const [collapsedPoIds, setCollapsedPoIds] = useState<Record<string, boolean>>({});

  const togglePoCollapse = (poId: string) => {
    setCollapsedPoIds((prev) => ({
      ...prev,
      [poId]: !prev[poId],
    }));
  };

  // All Available PO IDs
  const allPoIds = useMemo(() => {
    if (initialSelectedPoIds.length > 0) return initialSelectedPoIds;
    if (availablePoOptions.length > 0) return availablePoOptions.map((p) => p.id);
    return [];
  }, [initialSelectedPoIds, availablePoOptions]);

  // Selected PO IDs in master index
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>(allPoIds);

  // Dynamic PO lines state fetched from Supabase
  const [fetchedPoLines, setFetchedPoLines] = useState<PoLineWithBalance[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  // Currently active PO ID selected in Left Master Panel
  const [activePoId, setActivePoId] = useState<string | null>(null);

  // Fetch PO lines whenever selectedPoIds changes
  useEffect(() => {
    if (allPoIds.length === 0) {
      setFetchedPoLines([]);
      return;
    }

    let active = true;
    setLoadingLines(true);

    fetchMultiPoLinesWithBalances(allPoIds)
      .then((lines) => {
        if (active) {
          setFetchedPoLines(lines);
          setLoadingLines(false);
        }
      })
      .catch((err) => {
        console.error('Error fetching multi-PO lines from Supabase:', err);
        if (active) setLoadingLines(false);
      });

    return () => {
      active = false;
    };
  }, [allPoIds]);

  const allPoLines = fetchedPoLines;

  // Track checked lines and user-edited receiving quantities
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [receivingQuantities, setReceivingQuantities] = useState<Record<string, number>>({});

  // Sync selection defaults when allPoLines load
  useEffect(() => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      allPoLines.forEach((l) => {
        if (alreadySelectedPoLineIds.length > 0) {
          if (alreadySelectedPoLineIds.includes(l.po_line_id)) {
            next[l.po_line_id] = true;
          } else if (next[l.po_line_id] === undefined) {
            next[l.po_line_id] = false;
          }
        } else if (next[l.po_line_id] === undefined) {
          next[l.po_line_id] = false;
        }
      });
      return next;
    });

    setReceivingQuantities((prev) => {
      const next = { ...prev };
      allPoLines.forEach((l) => {
        if (next[l.po_line_id] === undefined) {
          next[l.po_line_id] = Math.max(0, l.as_on_date_po_balance_qty);
        }
      });
      return next;
    });
  }, [allPoLines, alreadySelectedPoLineIds]);

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

  // Group all PO lines by PO
  const groupedByPo = useMemo(() => {
    const map = new Map<
      string,
      {
        poId: string;
        poNumber: string;
        vendorName: string;
        location: string;
        lines: PoLineWithBalance[];
        openCount: number;
        selectedCount: number;
        completedCount: number;
        totalOrderedQty: number;
        totalAcceptedQty: number;
      }
    >();

    allPoLines.forEach((line) => {
      const poId = line.po_id || 'unassigned';
      const poNumberStr = line.po_number || poNumber || 'PO Reference';
      const matchedOpt = availablePoOptions.find((p) => p.id === poId || p.po_number === poNumberStr);
      const vendorName = matchedOpt?.vendor_name || 'Vendor Reference';
      const location = line.location || matchedOpt?.godown_name || 'Main Site Store';

      if (!map.has(poId)) {
        map.set(poId, {
          poId,
          poNumber: poNumberStr,
          vendorName,
          location,
          lines: [],
          openCount: 0,
          selectedCount: 0,
          completedCount: 0,
          totalOrderedQty: 0,
          totalAcceptedQty: 0,
        });
      }

      const group = map.get(poId)!;
      group.lines.push(line);
      group.totalOrderedQty += line.approved_qty;
      group.totalAcceptedQty += line.prev_accepted_qty;

      const isCompleted = line.as_on_date_po_balance_qty <= 0 || line.is_short_closed;
      if (isCompleted) {
        group.completedCount++;
      } else {
        group.openCount++;
      }

      if (selectedItems[line.po_line_id]) {
        group.selectedCount++;
      }
    });

    return map;
  }, [allPoLines, poNumber, availablePoOptions, selectedItems]);

  // Convert grouped PO map to array & filter based on view filter and global search
  const masterPoList = useMemo(() => {
    const list = Array.from(groupedByPo.values());
    const q = globalSearch.toLowerCase().trim();

    return list.filter((group) => {
      // View Filter
      if (viewFilter === 'selected' && group.selectedCount === 0) return false;
      if (viewFilter === 'open' && group.openCount === 0) return false;

      // Global Search matching PO or any item within PO
      if (!q) return true;

      const matchPoMeta =
        group.poNumber.toLowerCase().includes(q) ||
        group.vendorName.toLowerCase().includes(q) ||
        group.location.toLowerCase().includes(q);

      if (matchPoMeta) return true;

      return group.lines.some(
        (l) =>
          l.item_description.toLowerCase().includes(q) ||
          l.item_code.toLowerCase().includes(q) ||
          l.item_group.toLowerCase().includes(q) ||
          l.item_brand.toLowerCase().includes(q)
      );
    });
  }, [groupedByPo, viewFilter, globalSearch]);

  // Set default active PO ID if none selected or if active PO is filtered out
  useEffect(() => {
    if (masterPoList.length > 0) {
      if (!activePoId || !masterPoList.some((g) => g.poId === activePoId)) {
        setActivePoId(masterPoList[0].poId);
      }
    } else {
      setActivePoId(null);
    }
  }, [masterPoList, activePoId]);

  // Active PO group currently displayed in Detail Workspace
  const activePoGroup = useMemo(() => {
    if (viewFilter === 'selected') {
      // In 'Selected for GRN Only' view, return ONLY PO groups that have selected lines
      return masterPoList.filter((g) => g.selectedCount > 0);
    }
    if (!activePoId) return [];
    const found = masterPoList.find((g) => g.poId === activePoId);
    return found ? [found] : [];
  }, [masterPoList, activePoId, viewFilter]);

  // Selected item line IDs across all POs
  const checkedLineIds = useMemo(
    () => Object.keys(selectedItems).filter((id) => selectedItems[id]),
    [selectedItems]
  );

  // Total receiving value calculation
  const totalReceivingValue = useMemo(() => {
    return allPoLines
      .filter((l) => selectedItems[l.po_line_id])
      .reduce((sum, l) => {
        const qty = receivingQuantities[l.po_line_id] ?? l.as_on_date_po_balance_qty;
        return sum + qty * (l.unit_rate || 0);
      }, 0);
  }, [allPoLines, selectedItems, receivingQuantities]);

  const handleToggleCheck = (lineId: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [lineId]: !prev[lineId],
    }));
  };

  const handleTogglePoGroupCheck = (poGroupLines: PoLineWithBalance[]) => {
    const groupOpen = poGroupLines.filter((l) => l.as_on_date_po_balance_qty > 0 && !l.is_short_closed);
    const allChecked = groupOpen.every((l) => selectedItems[l.po_line_id]);
    const updated = { ...selectedItems };
    groupOpen.forEach((l) => {
      updated[l.po_line_id] = !allChecked;
    });
    setSelectedItems(updated);
  };

  const handleToggleSelectAllMasterPOs = () => {
    const allOpenLines = allPoLines.filter((l) => l.as_on_date_po_balance_qty > 0 && !l.is_short_closed);
    const allChecked = allOpenLines.every((l) => selectedItems[l.po_line_id]);
    const updated = { ...selectedItems };
    allOpenLines.forEach((l) => {
      updated[l.po_line_id] = !allChecked;
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
    const payload = allPoLines
      .filter((l) => selectedItems[l.po_line_id])
      .map((l) => ({
        line: l,
        receivingQty: receivingQuantities[l.po_line_id] ?? l.as_on_date_po_balance_qty,
      }));
    onConfirmSelection(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col bg-card shadow-2xl rounded-2xl border border-border overflow-hidden">
        {/* ========================================================================= */}
        {/* TOP HEADER & SEARCH ENGINE                                                 */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/40 px-6 py-3.5 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground font-heading flex items-center gap-2">
                <span>Select PO Items</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-extrabold text-primary">
                  {masterPoList.length} POs
                </span>
              </h2>
              <p className="text-[11px] text-muted-foreground font-medium">
                Select materials received from approved purchase orders.
              </p>
            </div>
          </div>

          {/* Global Dual Index Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search PO number, vendor, material description, item code, brand..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2 text-xs font-semibold text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-hidden shadow-2xs"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SEGMENTED MASTER VIEW FILTER BAR                                          */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between border-b border-border bg-card px-6 py-2.5 gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase text-muted-foreground">View Mode:</span>

            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-xs font-bold">
              <button
                onClick={() => setViewFilter('open')}
                className={`rounded-md px-3 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                  viewFilter === 'open'
                    ? 'bg-background text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Open POs ({Array.from(groupedByPo.values()).filter((g) => g.openCount > 0).length})
              </button>

              <button
                onClick={() => setViewFilter('selected')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                  viewFilter === 'selected'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <PackageCheck className="h-3.5 w-3.5" />
                <span>Selected for GRN Only</span>
                <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[10px] font-mono">
                  {Array.from(groupedByPo.values()).filter((g) => g.selectedCount > 0).length}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <button
              type="button"
              onClick={handleToggleSelectAllMasterPOs}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer"
            >
              <CheckSquare className="h-4 w-4" />
              <span>Select All Open Lines Across All POs</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN MASTER-DETAIL WORKSPACE BODY                                          */}
        {/* ========================================================================= */}
        <div className="flex flex-1 overflow-hidden">
          {/* ----------------------------------------------------------------------- */}
          {/* LEFT MASTER PO PANEL                                                   */}
          {/* ----------------------------------------------------------------------- */}
          <div className="w-80 shrink-0 border-r border-border bg-muted/20 flex flex-col overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-bold uppercase text-muted-foreground flex items-center justify-between">
              <span>Purchase Orders ({masterPoList.length})</span>
              <span className="text-[10px] text-muted-foreground">Click to view</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loadingLines ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span>Loading Purchase Orders...</span>
                </div>
              ) : masterPoList.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground">
                  <Layers className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="font-bold">No POs matching active filter.</p>
                </div>
              ) : (
                masterPoList.map((group) => {
                  const isActive = activePoId === group.poId && viewFilter !== 'selected';
                  const pctDelivered = Math.round((group.totalAcceptedQty / Math.max(1, group.totalOrderedQty)) * 100);

                  return (
                    <div
                      key={group.poId}
                      onClick={() => setActivePoId(group.poId)}
                      className={`group relative rounded-xl border p-2 transition-all cursor-pointer ${
                        isActive
                          ? 'border-primary bg-card shadow-sm ring-2 ring-primary/20'
                          : group.selectedCount > 0
                          ? 'border-primary/50 bg-primary/5 hover:bg-primary/10'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-extrabold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                              {group.poNumber}
                            </span>
                            {group.selectedCount > 0 && (
                              <span className="rounded bg-primary px-1.5 py-0.2 text-[9px] font-bold text-primary-foreground font-mono">
                                {group.selectedCount} Sel
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-foreground truncate">{group.vendorName}</p>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePoGroupCheck(group.lines);
                          }}
                          className="cursor-pointer text-primary p-0.5 shrink-0"
                          title="Toggle all open lines in this PO"
                        >
                          {group.openCount > 0 &&
                          group.lines
                            .filter((l) => l.as_on_date_po_balance_qty > 0 && !l.is_short_closed)
                            .every((l) => selectedItems[l.po_line_id]) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground/60" />
                          )}
                        </button>
                      </div>

                      {/* Compact Progress */}
                      <div className="mt-1.5 space-y-0.5">
                        <div className="flex justify-between text-[9px] font-mono text-muted-foreground font-medium">
                          <span>{pctDelivered}% ({group.totalAcceptedQty.toLocaleString('en-IN')}/{group.totalOrderedQty.toLocaleString('en-IN')})</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${Math.min(100, pctDelivered)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/* RIGHT DETAIL ITEM WORKSPACE                                            */}
          {/* ----------------------------------------------------------------------- */}
          <div className="flex-1 bg-background flex flex-col overflow-hidden">
            {loadingLines ? (
              <div className="flex flex-1 flex-col items-center justify-center p-12 text-muted-foreground text-xs gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="font-bold">Loading material line balances from Supabase...</span>
              </div>
            ) : activePoGroup.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
                <Layers className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-bold text-foreground">No Purchase Orders Selected</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Select a Purchase Order from the master list on the left, or switch view to <strong>All Open POs</strong>.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {activePoGroup.map((poGroup) => {
                  // Filter lines within group by search term
                  const q = globalSearch.toLowerCase().trim();
                  const filteredLines = poGroup.lines.filter((l) => {
                    if (viewFilter === 'selected' && !selectedItems[l.po_line_id]) return false;
                    if (viewFilter === 'open' && (l.as_on_date_po_balance_qty <= 0 || l.is_short_closed)) return false;

                    if (!q) return true;
                    return (
                      l.item_description.toLowerCase().includes(q) ||
                      l.item_code.toLowerCase().includes(q) ||
                      l.item_group.toLowerCase().includes(q) ||
                      l.item_brand.toLowerCase().includes(q) ||
                      poGroup.poNumber.toLowerCase().includes(q)
                    );
                  });

                  if (filteredLines.length === 0) return null;

                  const openInGroup = poGroup.lines.filter((l) => l.as_on_date_po_balance_qty > 0 && !l.is_short_closed);
                  const isGroupAllChecked = openInGroup.length > 0 && openInGroup.every((l) => selectedItems[l.po_line_id]);

                  const isCollapsed = collapsedPoIds[poGroup.poId] ?? (viewFilter === 'selected');

                  return (
                    <div key={poGroup.poId} className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                      {/* Detail Header for PO */}
                      <div className="flex flex-wrap items-center justify-between border-b border-border bg-muted/30 px-3.5 py-1.5 gap-2">
                        <div className="flex items-center gap-2.5">
                          {/* Collapsible Arrow Toggle (in Selected for GRN view mode) */}
                          {viewFilter === 'selected' && (
                            <button
                              type="button"
                              onClick={() => togglePoCollapse(poGroup.poId)}
                              className="cursor-pointer text-muted-foreground hover:text-foreground p-0.5 transition-colors"
                              title={isCollapsed ? 'Expand PO line items' : 'Collapse PO line items'}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-primary" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-primary" />
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleTogglePoGroupCheck(poGroup.lines)}
                            className="cursor-pointer text-primary"
                          >
                            {isGroupAllChecked ? (
                              <CheckSquare className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground/60" />
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-extrabold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                              {poGroup.poNumber}
                            </span>
                            <span className="text-xs font-bold text-foreground">{poGroup.vendorName}</span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              ({filteredLines.length} material lines)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTogglePoGroupCheck(poGroup.lines)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                          >
                            {isGroupAllChecked ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                      </div>

                      {/* Detail Item Table */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto font-sans">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead>
                              <tr className="border-b border-border bg-muted/20 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                <th className="px-3 py-2.5 w-10 text-center">Select</th>
                                <th className="px-4 py-2.5">Material Description &amp; Specifications</th>
                                <th className="px-3 py-2.5 text-right">Ordered Qty</th>
                                <th className="px-3 py-2.5 text-right">Prior Accepted</th>
                                <th className="px-3 py-2.5 text-right">Open PO Balance</th>
                                <th className="px-4 py-2.5 text-center w-36">Receiving Qty</th>
                                <th className="px-3 py-2.5 text-center">Receipt Audit Timeline</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60 font-mono text-xs">
                              {filteredLines.map((line) => {
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

                                    {/* Material Specs */}
                                    <td className="px-4 py-3 font-sans">
                                      <div className="font-bold text-foreground text-xs flex items-center gap-2">
                                        <span>{line.item_description}</span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground mt-0.5">
                                        {line.item_group && <span>{line.item_group}</span>}
                                        {line.item_brand && <span>• Brand: {line.item_brand}</span>}
                                        {line.unit && <span className="rounded bg-primary/10 px-1.5 py-0.2 font-extrabold text-primary uppercase">{line.unit}</span>}
                                      </div>
                                    </td>

                                    {/* Ordered Qty */}
                                    <td className="px-3 py-3 text-right font-bold text-foreground">
                                      {line.approved_qty.toLocaleString('en-IN')} {line.unit}
                                    </td>

                                    {/* Prior Accepted */}
                                    <td className="px-3 py-3 text-right">
                                      <div className="font-semibold text-muted-foreground">
                                        {line.prev_accepted_qty.toLocaleString('en-IN')} {line.unit}
                                      </div>
                                      {line.approved_qty > 0 && (
                                        <div className="text-[9px] font-bold text-muted-foreground/70">
                                          ({prevPct}%)
                                        </div>
                                      )}
                                    </td>

                                    {/* Open PO Balance */}
                                    <td className="px-3 py-3 text-right">
                                      {isCompleted ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                                          <CheckCircle2 className="h-3 w-3" /> Fully Delivered
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
                                        value={
                                          receivingQuantities[line.po_line_id] === 0
                                            ? ''
                                            : (receivingQuantities[line.po_line_id] ?? line.as_on_date_po_balance_qty)
                                        }
                                        placeholder="0"
                                        onChange={(e) => {
                                          const clean = e.target.value.replace(/^0+(?=\d)/, '');
                                          const val = clean === '' ? 0 : Number(clean);
                                          handleQuantityChange(line.po_line_id, val);
                                        }}
                                        className="w-28 rounded-lg border-2 border-primary/50 bg-background px-2.5 py-1.5 text-center font-mono font-extrabold text-foreground text-xs focus:ring-2 focus:ring-primary disabled:opacity-40"
                                      />
                                    </td>

                                    {/* Multi-GRN History Audit */}
                                    <td className="px-3 py-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setHistoryTargetLine(line)}
                                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer"
                                        title="View past GRN receipts timeline for this line"
                                      >
                                        <History className="h-3.5 w-3.5 text-primary" />
                                        <span>{prevPct > 0 ? `Delivered ${prevPct}%` : 'Audit Log'}</span>
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FOOTER SUMMARY DOCK                                                       */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between border-t border-border bg-muted/40 px-6 py-3 gap-4">
          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-muted-foreground font-semibold">Active Views: </span>
              <strong className="text-foreground">{masterPoList.length} PO(s)</strong>
            </div>

            <div>
              <span className="text-muted-foreground font-semibold">Selected Material Lines: </span>
              <strong className="text-primary font-bold">{checkedLineIds.length} item(s)</strong>
            </div>
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
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Add {checkedLineIds.length} Selected Line Items to GRN ➔</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAST GRN RECEIPT TIMELINE AUDIT MODAL                                     */}
      {/* ========================================================================= */}
      {historyTargetLine && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-xs font-bold text-foreground font-heading">
                    Multi-GRN Line Receipt History Audit
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
                <span>Loading receipt timeline from Supabase...</span>
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
                        <span>Date: {new Date(h.grn_date).toLocaleDateString('en-GB')}</span>
                        {h.vehicle_no && <span>Vehicle: {h.vehicle_no}</span>}
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
                className="rounded-lg bg-secondary px-4 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
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
