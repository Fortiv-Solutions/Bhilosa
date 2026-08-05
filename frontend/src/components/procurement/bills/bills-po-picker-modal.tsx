'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, CheckCircle2, Building2, Package, Layers, Calendar, Filter } from 'lucide-react';
import type { ApprovedPoOption } from '@/lib/procurement';

interface BillsPoPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedPos: ApprovedPoOption[];
  selectedPoNumbers: string[];
  onConfirmSelection: (poNumbers: string[], poObjects: ApprovedPoOption[]) => void;
}

export function BillsPoPickerModal({
  isOpen,
  onClose,
  approvedPos,
  selectedPoNumbers,
  onConfirmSelection,
}: BillsPoPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'selected'>('all');
  const [tempSelectedNos, setTempSelectedNos] = useState<string[]>(() => selectedPoNumbers);

  // Sync temp selections when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTempSelectedNos(selectedPoNumbers);
    }
  }, [isOpen, selectedPoNumbers]);

  const filteredPos = useMemo(() => {
    return approvedPos.filter((po) => {
      const matchesSearch =
        po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        po.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (po.project_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'selected') return tempSelectedNos.includes(po.po_number);
      return true;
    });
  }, [approvedPos, searchTerm, activeTab, tempSelectedNos]);

  if (!isOpen) return null;

  const togglePo = (poNo: string) => {
    setTempSelectedNos((prev) =>
      prev.includes(poNo) ? prev.filter((n) => n !== poNo) : [...prev, poNo]
    );
  };

  const selectAll = () => {
    setTempSelectedNos(filteredPos.map((p) => p.po_number));
  };

  const clearAll = () => {
    setTempSelectedNos([]);
  };

  const handleConfirm = () => {
    const selectedObjs = approvedPos.filter((p) => tempSelectedNos.includes(p.po_number));
    onConfirmSelection(tempSelectedNos, selectedObjs);
    onClose();
  };

  const totalSelectedVal = approvedPos
    .filter((p) => tempSelectedNos.includes(p.po_number))
    .reduce((sum, p) => sum + p.total_amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="flex h-full w-full max-w-2xl flex-col bg-background shadow-2xl border-l border-border animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" /> Select Approved Purchase Orders (POs)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose one or multiple approved POs to raise vendor bills against.
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
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by PO Number, Vendor Name, or Project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-4 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold text-muted-foreground">Tab View:</span>
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                All Approved POs ({approvedPos.length})
              </button>
              <button
                onClick={() => setActiveTab('selected')}
                className={`px-3 py-1 rounded-md font-bold text-[11px] transition-colors cursor-pointer ${
                  activeTab === 'selected'
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Selected POs ({tempSelectedNos.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
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

        {/* PO List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredPos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-bold text-muted-foreground">No Approved POs found</p>
              <p className="text-xs text-muted-foreground/70">
                Try clearing your search term or selecting a different project.
              </p>
            </div>
          ) : (
            filteredPos.map((po) => {
              const isSelected = tempSelectedNos.includes(po.po_number);

              return (
                <div
                  key={po.id}
                  onClick={() => togglePo(po.po_number)}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // Handled by parent div
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-primary text-sm">
                            {po.po_number}
                          </span>
                          {po.billing_status === 'unbilled' && (
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-extrabold text-blue-600 border border-blue-500/20">
                              Unbilled
                            </span>
                          )}
                          {po.billing_status === 'partially_billed' && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-600 border border-amber-500/20">
                              Partially Billed
                            </span>
                          )}
                          {po.billing_status === 'fully_billed' && (
                            <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 border border-slate-500/20">
                              Fully Billed
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-foreground mt-1 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {po.vendor_name}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-extrabold text-foreground text-sm">
                        ₹{po.total_amount.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" /> {po.po_date}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-primary/70" />
                      Approved GRNs: <strong className="text-foreground">{po.approved_grns_count}</strong>
                    </span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      Billed GRNs: <strong>{po.billed_grns_count} / {po.approved_grns_count}</strong>
                    </span>
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
              {tempSelectedNos.length} PO(s) Selected
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">
              Total PO Value: ₹{totalSelectedVal.toLocaleString('en-IN')}
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
              <CheckCircle2 className="h-4 w-4" /> Confirm Selection ({tempSelectedNos.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
