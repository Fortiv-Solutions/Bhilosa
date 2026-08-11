'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, CheckCircle2, ShoppingCart, Filter, PackageCheck, Calendar, Building2 } from 'lucide-react';
import type { ApprovedGrnOption } from '@/lib/procurement';

export interface SelectedGrnLineItem {
  id: string; // grn_line_id
  grn_id: string;
  grn_number: string;
  po_number: string;
  challan_no: string;
  item_id?: string;
  item_group: string;
  item_description: string;
  item_brand?: string;
  unit: string;
  accepted_qty: number;
  prev_billed_qty: number;
  open_billing_qty: number;
  billed_qty: number; // Qty being billed in this Purchase Bill
  unit_rate: number;
  purchase_category?: string;
  activity_name?: string;
  sub_activity_name?: string;
  pr_no?: string;
}

interface BillsGrnItemPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedGrns: ApprovedGrnOption[];
  alreadySelectedItems: SelectedGrnLineItem[];
  onConfirmSelection: (selectedItems: SelectedGrnLineItem[], selectedGrnNumbers: string[]) => void;
}

export function BillsGrnItemPickerModal({
  isOpen,
  onClose,
  approvedGrns,
  alreadySelectedItems,
  onConfirmSelection,
}: BillsGrnItemPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'selected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [poFilter, setPoFilter] = useState<string>('all');
  const [selectedGrnIdSet, setSelectedGrnIdSet] = useState<Set<string>>(new Set());

  // Initialize selectedGrnIdSet from alreadySelectedItems when modal opens
  React.useEffect(() => {
    if (isOpen) {
      const set = new Set<string>();
      alreadySelectedItems.forEach((item) => {
        if (item.grn_id) set.add(item.grn_id);
      });
      // Fallback: also match by grn_number if id missing
      approvedGrns.forEach((g) => {
        if (alreadySelectedItems.some((item) => item.grn_number === g.grn_number)) {
          set.add(g.id);
        }
      });
      setSelectedGrnIdSet(set);
    }
  }, [isOpen, alreadySelectedItems, approvedGrns]);

  // Extract all unique PO numbers for filter dropdown
  const uniquePoNumbers = useMemo(() => {
    const set = new Set<string>();
    approvedGrns.forEach((g) => {
      if (g.po_number) set.add(g.po_number);
    });
    return Array.from(set);
  }, [approvedGrns]);

  // Filter approved GRNs
  const filteredGrns = useMemo(() => {
    return approvedGrns.filter((grn) => {
      const matchesSearch =
        grn.grn_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        grn.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        grn.challan_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        grn.vendor_name.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (poFilter !== 'all' && grn.po_number !== poFilter) return false;

      if (activeTab === 'selected') return selectedGrnIdSet.has(grn.id);
      return true;
    });
  }, [approvedGrns, searchTerm, poFilter, activeTab, selectedGrnIdSet]);

  if (!isOpen) return null;

  const toggleGrnSelection = (grnId: string) => {
    setSelectedGrnIdSet((prev) => {
      const next = new Set(prev);
      if (next.has(grnId)) {
        next.delete(grnId);
      } else {
        next.add(grnId);
      }
      return next;
    });
  };

  const selectAllGrns = () => {
    const next = new Set(selectedGrnIdSet);
    filteredGrns.forEach((g) => next.add(g.id));
    setSelectedGrnIdSet(next);
  };

  const clearAll = () => {
    setSelectedGrnIdSet(new Set());
  };

  const handleConfirm = () => {
    const selectedGrnObjects = approvedGrns.filter((g) => selectedGrnIdSet.has(g.id));
    const selectedGrnNumbers = selectedGrnObjects.map((g) => g.grn_number);

    // Map all lines of selected GRNs
    const allSelectedItems: SelectedGrnLineItem[] = [];
    selectedGrnObjects.forEach((grn) => {
      grn.lines.forEach((l) => {
        allSelectedItems.push({
          id: l.id,
          grn_id: grn.id,
          grn_number: grn.grn_number,
          po_number: grn.po_number,
          challan_no: grn.challan_no,
          item_id: l.item_id,
          item_group: l.item_group || 'Material',
          item_description: l.item_description,
          item_brand: l.item_brand,
          unit: l.unit,
          accepted_qty: l.accepted_qty,
          prev_billed_qty: l.prev_billed_qty,
          open_billing_qty: l.open_billing_qty > 0 ? l.open_billing_qty : l.accepted_qty,
          billed_qty: l.open_billing_qty > 0 ? l.open_billing_qty : l.accepted_qty,
          unit_rate: l.unit_rate,
          purchase_category: l.purchase_category,
          activity_name: l.activity_name,
          sub_activity_name: l.sub_activity_name,
          pr_no: (l as any).pr_no || '',
        });
      });
    });

    onConfirmSelection(allSelectedItems, selectedGrnNumbers);
    onClose();
  };

  const selectedGrnsList = approvedGrns.filter((g) => selectedGrnIdSet.has(g.id));
  const totalBillableAmount = selectedGrnsList.reduce((sum, g) => sum + g.total_accepted_value, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-2xl flex-col bg-background shadow-2xl border-l border-border animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" /> Select Approved GRNs (Challans)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select one or multiple approved GRNs (Challans) to include in the purchase bill.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters & Search */}
        <div className="p-4 border-b border-border/80 space-y-3 bg-muted/10">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by GRN No, PO No, Challan No, or Vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {uniquePoNumbers.length > 0 && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={poFilter}
                  onChange={(e) => setPoFilter(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground focus:border-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">All POs ({uniquePoNumbers.length})</option>
                  {uniquePoNumbers.map((poNo) => (
                    <option key={poNo} value={poNo}>
                      PO: {poNo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                All Approved GRNs ({approvedGrns.length})
              </button>
              <button
                onClick={() => setActiveTab('selected')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  activeTab === 'selected'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Selected GRNs ({selectedGrnIdSet.size})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAllGrns}
                className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-muted-foreground">•</span>
              <button
                onClick={clearAll}
                className="text-[11px] font-bold text-muted-foreground hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* GRN Cards Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredGrns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-bold text-muted-foreground">No Approved GRNs found</p>
              <p className="text-xs text-muted-foreground/70">
                Try selecting approved POs first or clearing search filters.
              </p>
            </div>
          ) : (
            filteredGrns.map((grn) => {
              const isSelected = selectedGrnIdSet.has(grn.id);

              return (
                <div
                  key={grn.id}
                  onClick={() => toggleGrnSelection(grn.id)}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/80 bg-card hover:border-border hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGrnSelection(grn.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-1 cursor-pointer"
                      />

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-primary text-sm">
                            {grn.grn_number}
                          </span>
                          <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 border border-blue-500/20">
                            Challan: {grn.challan_no}
                          </span>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-600 border border-emerald-500/20">
                            Approved
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1.5">
                          <span className="font-bold text-foreground flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {grn.vendor_name}
                          </span>
                          <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                            PO: {grn.po_number}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {grn.receipt_date}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-extrabold text-foreground text-sm">
                        ₹{grn.total_accepted_value.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
                        {grn.lines.length} Line Items
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 bg-muted/30 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-foreground">
              {selectedGrnIdSet.size} Approved GRN(s) Selected
            </p>
            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-extrabold">
              Total Value: ₹{totalBillableAmount.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-md transition-all cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" /> Confirm Selection ({selectedGrnIdSet.size} GRNs)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
