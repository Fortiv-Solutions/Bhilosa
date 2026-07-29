'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Search, Building2, Calendar, Scale, Layers, CheckCircle2, Eye, EyeOff, Edit3, Save, RotateCcw, History, Clock, UserCheck, ArrowUpRight, ArrowDownRight, X, FileSpreadsheet, AlertTriangle, Trash2, Sparkles, Zap, Bot, Lightbulb, Pencil } from 'lucide-react';
import { ORBIT3_VARIANCE_CATEGORIES, type Orbit3VarianceCategory, type Orbit3VarianceItem } from '@/lib/orbit3-variance-data';

interface VarianceAuditLog {
  id: string;
  revision: string;
  timestamp: string;
  editedBy: string;
  changesCount: number;
  netImpactAmount: number;
  remarksSummary: string;
  itemDetails: {
    subActivity: string;
    oldQty: number;
    newQty: number;
    oldRate: number;
    newRate: number;
    oldCost: number;
    newCost: number;
    remark: string;
  }[];
}

interface VarianceAnalysisTabProps {
  categories?: Orbit3VarianceCategory[];
  saleableAreaSqft?: number;
  asOfDate?: string;
  canManage?: boolean;
}

export default function VarianceAnalysisTab({
  categories: initialCategories = ORBIT3_VARIANCE_CATEGORIES,
  saleableAreaSqft = 216046.0,
  asOfDate = '20-07-2026',
  canManage = true,
}: VarianceAnalysisTabProps) {
  const [categories, setCategories] = useState<Orbit3VarianceCategory[]>(initialCategories);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedItems, setEditedItems] = useState<Record<string, { billQty: number; billRate: number; remark: string }>>({});
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState(false);
  const [showAiMitigationModal, setShowAiMitigationModal] = useState(false);

  // Default Sample Audit Logs
  const [historyLogs, setHistoryLogs] = useState<VarianceAuditLog[]>([
    {
      id: 'log-v2',
      revision: 'Recon Revision v2 (Current)',
      timestamp: '29 Jul 2026, 17:45',
      editedBy: 'Billing Engineer (Rakesh Patel)',
      changesCount: 2,
      netImpactAmount: -5420000,
      remarksSummary: 'Cement rate escalation & Civil Labour quantity measurement update for Slab 12',
      itemDetails: [
        {
          subActivity: 'Civil Labour Cost',
          oldQty: 225000,
          newQty: 230000,
          oldRate: 826,
          newRate: 826,
          oldCost: 185850000,
          newCost: 189980000,
          remark: 'Additional shuttering area passed in RA Bill 14',
        },
        {
          subActivity: 'Cement-Flooring, Dado, Frame, Trimix & Water Proofing Work',
          oldQty: 13130,
          newQty: 13130,
          oldRate: 385,
          newRate: 408,
          oldCost: 5055115,
          newCost: 5357040,
          remark: 'UltraTech price hike per bag',
        },
      ],
    },
    {
      id: 'log-v1',
      revision: 'Recon Baseline v1 (Initial Upload)',
      timestamp: '20 Jul 2026, 10:00',
      editedBy: 'Project Director (Pramukh Group)',
      changesCount: 100,
      netImpactAmount: 0,
      remarksSummary: 'Imported Master Budget & Initial Actuals from Orbit_3_Budget_Recon_Main.xlsm',
      itemDetails: [],
    },
  ]);

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => {
    const initMap: Record<string, boolean> = {};
    initialCategories.forEach((c) => {
      initMap[c.id] = true;
    });
    return initMap;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullAuditCols, setShowFullAuditCols] = useState(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState(false);

  function toggleCategory(catId: string) {
    setOpenCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  }

  // Handle Edit Input Change
  function handleCellChange(itemId: string, field: 'billQty' | 'billRate' | 'remark', value: any, defaultItem: Orbit3VarianceItem) {
    setEditedItems((prev) => {
      const current = prev[itemId] || {
        billQty: defaultItem.actualBillQty,
        billRate: defaultItem.actualBillRate,
        remark: defaultItem.remark,
      };

      const updated = { ...current };
      if (field === 'billQty') updated.billQty = isNaN(Number(value)) ? 0 : Number(value);
      if (field === 'billRate') updated.billRate = isNaN(Number(value)) ? 0 : Number(value);
      if (field === 'remark') updated.remark = String(value);

      return { ...prev, [itemId]: updated };
    });
  }

  const hasUnsavedEdits = isEditMode && Object.keys(editedItems).length > 0;

  function handleCancelAttempt() {
    if (hasUnsavedEdits) {
      setShowUnsavedConfirmModal(true);
    } else {
      handleCancelEdits();
    }
  }

  // Save Edits & Create History Snapshot
  function handleSaveEdits() {
    const changeDetails: VarianceAuditLog['itemDetails'] = [];
    let netImpact = 0;

    const updatedCategories = categories.map((cat) => {
      const updatedCatItems = cat.items.map((item) => {
        const edit = editedItems[item.id];
        if (!edit) return item;

        const oldCost = item.actualTotalCost;
        const billQty = edit.billQty;
        const billRate = edit.billRate;
        const actualTotalCost = Math.round(billQty * billRate);
        const costDiff = actualTotalCost - oldCost;

        if (costDiff !== 0 || edit.remark !== item.remark) {
          changeDetails.push({
            subActivity: item.subActivity,
            oldQty: item.actualBillQty,
            newQty: billQty,
            oldRate: item.actualBillRate,
            newRate: billRate,
            oldCost,
            newCost: actualTotalCost,
            remark: edit.remark || 'Reconciliation adjustment',
          });
          netImpact += costDiff;
        }

        const qtyVariation = Number((billQty - item.budgetQty).toFixed(2));
        const rateVariation = Number((billRate - item.budgetRate).toFixed(2));
        const balance = Math.round(item.budgetCost - actualTotalCost);
        const costVarianceAmount = Math.round(actualTotalCost - item.budgetCost);
        const costVariancePercent = item.budgetCost > 0 ? Number(((costVarianceAmount / item.budgetCost) * 100).toFixed(2)) : 0;

        return {
          ...item,
          actualBillQty: billQty,
          actualBillRate: billRate,
          actualTotalCost,
          qtyVariation,
          rateVariation,
          balance,
          costVarianceAmount,
          costVariancePercent,
          remark: edit.remark,
        };
      });

      return {
        ...cat,
        items: updatedCatItems,
        totalBudgetCost: Math.round(updatedCatItems.reduce((s, i) => s + i.budgetCost, 0)),
        totalActualCost: Math.round(updatedCatItems.reduce((s, i) => s + i.actualTotalCost, 0)),
        totalBalance: Math.round(updatedCatItems.reduce((s, i) => s + i.balance, 0)),
        totalVarianceAmount: Math.round(updatedCatItems.reduce((s, i) => s + i.costVarianceAmount, 0)),
      };
    });

    if (changeDetails.length > 0) {
      const newSnapshot: VarianceAuditLog = {
        id: `log-${Date.now()}`,
        revision: `Recon Revision v${historyLogs.length + 1}`,
        timestamp: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        editedBy: 'Pramukh ERP Management User',
        changesCount: changeDetails.length,
        netImpactAmount: netImpact,
        remarksSummary: `Updated ${changeDetails.length} items with net cost impact of ₹${Math.abs(netImpact).toLocaleString('en-IN')}`,
        itemDetails: changeDetails,
      };
      setHistoryLogs((prev) => [newSnapshot, ...prev]);
    }

    setCategories(updatedCategories);
    setIsEditMode(false);
    setShowUnsavedConfirmModal(false);
    setEditedItems({});
    setSavedSuccessMsg(true);
    setTimeout(() => setSavedSuccessMsg(false), 3000);
  }

  function handleCancelEdits() {
    setIsEditMode(false);
    setShowUnsavedConfirmModal(false);
    setEditedItems({});
  }

  const filteredCategories = categories
    .map((cat) => {
      const matchingItems = cat.items.filter(
        (item) =>
          item.subActivity.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cat.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.parentGroup && item.parentGroup.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      return { ...cat, items: matchingItems };
    })
    .filter((cat) => cat.items.length > 0);

  const allItems = categories.flatMap((c) => c.items);
  const totalBudgetCost = categories.reduce((sum, c) => sum + c.totalBudgetCost, 0);
  const totalActualCost = categories.reduce((sum, c) => sum + c.totalActualCost, 0);
  const totalQtyVariation = allItems.reduce((sum, i) => sum + (i.qtyVariation || 0), 0);
  const totalRateVariation = allItems.reduce((sum, i) => sum + (i.rateVariation || 0), 0);
  const totalBalance = totalBudgetCost - totalActualCost;
  const totalCostVarianceAmount = totalActualCost - totalBudgetCost;
  const totalCostVariancePercent = totalBudgetCost > 0 ? (totalCostVarianceAmount / totalBudgetCost) * 100 : 0;

  const bacCostPerArea = saleableAreaSqft > 0 ? totalBudgetCost / saleableAreaSqft : 0;
  const eacTotalCost = totalBudgetCost + Math.max(0, totalCostVarianceAmount);
  const eacCostPerArea = saleableAreaSqft > 0 ? eacTotalCost / saleableAreaSqft : 0;
  const diffCostPerArea = eacCostPerArea - bacCostPerArea;

  const civilMaterialDifferences = [
    { material: 'Cement', unit: 'Bags', qty: 13130, basicRate: 385, avgRate: 412, diffAmount: 354510 },
    { material: 'Sand', unit: 'Ton', qty: 2278, basicRate: 1250, avgRate: 1340, diffAmount: 205020 },
    { material: 'Metal 10mm & 20mm', unit: 'Ton', qty: 1378, basicRate: 1050, avgRate: 1120, diffAmount: 96460 },
    { material: 'Bricks', unit: 'Nos.', qty: 149709, basicRate: 10.03, avgRate: 11.20, diffAmount: 175160 },
    { material: 'Steel / Rebar', unit: 'Ton', qty: 450, basicRate: 62500, avgRate: 64200, diffAmount: 765000 },
  ];
  const totalMaterialDiffAmount = civilMaterialDifferences.reduce((s, m) => s + m.diffAmount, 0);

  return (
    <div className="space-y-5 select-none font-sans">
      {/* HEADER INFORMATION DECK */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-bold text-foreground tracking-tight">Pramukh Orbit 3 — Cost Summary &amp; Variance Recon</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800 uppercase">
                {isEditMode ? 'Editing Variance Mode' : 'Verified Variance.xlsx'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live Budget Reconciliation • {categories.length} Activity Groups • {allItems.length} Sub-Activities
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-6 text-xs">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Saleable Area (sq ft)</p>
            <p className="text-base font-mono font-black text-foreground">{saleableAreaSqft.toLocaleString('en-IN')}.00</p>
          </div>

          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Reconciliation Date</p>
            <p className="text-base font-mono font-bold text-primary flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {asOfDate}
            </p>
          </div>
        </div>
      </div>

      {/* PRAMUKH AI OVERRUN MITIGATION ADVISORY CARD (SUGGEST ONLY) */}
      <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-tr from-primary to-amber-500 p-2.5 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-sm font-bold text-foreground">AI Overrun Advisory &amp; Mitigation Suggestions</h3>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-extrabold text-primary uppercase">
                Advisory Only
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI detected <strong>Civil Labour (+₹41.3L)</strong> &amp; <strong>Cement Rate (+₹25.4L)</strong> overrun risks. View recommendations below.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAiMitigationModal(true)}
          className="inline-flex h-8.5 items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/40 bg-primary/10 px-4 text-xs font-bold text-primary shadow-2xs hover:bg-primary/20 transition-colors"
        >
          <Lightbulb className="h-3.5 w-3.5 text-primary" /> View AI Mitigation Plan
        </button>
      </div>

      {savedSuccessMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          Variance Billed Quantities, Rates &amp; Remarks updated &amp; logged into Audit History!
        </div>
      )}

      {/* ACTION & SEARCH CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sub activity or group..."
            className="h-8.5 w-72 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* AUDIT HISTORY BUTTON */}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted transition-colors"
          >
            <History className="h-3.5 w-3.5 text-amber-600" />
            Audit History ({historyLogs.length})
          </button>

          {/* EDIT VARIANCE MODE BUTTONS */}
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={handleCancelAttempt}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground shadow-2xs hover:bg-muted hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveEdits}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> Save &amp; Log History
              </button>
            </>
          ) : (
            canManage && (
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit Variance Mode
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => setShowFullAuditCols(!showFullAuditCols)}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground shadow-2xs hover:bg-muted hover:text-foreground transition-colors"
          >
            {showFullAuditCols ? <EyeOff className="h-3.5 w-3.5 text-primary" /> : <Eye className="h-3.5 w-3.5 text-primary" />}
            {showFullAuditCols ? 'Standard View' : 'Full Audit View (PO/WO & Groups)'}
          </button>
        </div>
      </div>

      {/* MAIN RECONCILIATION TABLE */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap font-sans border-collapse">
            <thead>
              {/* Top Grouped Category Header Row */}
              <tr className="border-b border-border bg-muted/80 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground select-none">
                <th colSpan={showFullAuditCols ? 4 : 3} className="px-3 py-2 text-center border-r border-border bg-muted/90">Identity</th>
                <th colSpan={3} className="px-3 py-2 text-center border-r border-border bg-slate-200/70 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100">BUDGET</th>
                {showFullAuditCols && (
                  <th colSpan={3} className="px-3 py-2 text-center border-r border-border bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">P.O / W.O</th>
                )}
                <th colSpan={3} className="px-3 py-2 text-center border-r border-border bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300">ACTUAL</th>
                <th colSpan={2} className="px-3 py-2 text-center border-r border-border bg-orange-100 dark:bg-orange-950/60 text-orange-900 dark:text-orange-300">Item - Rate Variation</th>
                <th colSpan={4} className="px-3 py-2 text-center bg-muted/90">Reconciliation &amp; Variance</th>
              </tr>

              {/* Column Names Header Row */}
              <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
                <th className="px-3 py-2.5 w-10 text-center border-r border-border">SR.</th>
                <th className="px-4 py-2.5 min-w-[220px] border-r border-border">Sub Activity</th>
                {showFullAuditCols && <th className="px-3 py-2.5 text-center border-r border-border">Status</th>}
                <th className="px-3 py-2.5 text-center border-r border-border">Unit</th>

                {/* BUDGET Group */}
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-slate-50/50 dark:bg-slate-900/30">Total QTY</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-slate-50/50 dark:bg-slate-900/30">Rate (₹)</th>
                <th className="px-4 py-2.5 text-right font-mono font-black text-foreground border-r border-border bg-slate-100/60 dark:bg-slate-800/40">Cost (₹)</th>

                {/* P.O / W.O Group */}
                {showFullAuditCols && (
                  <>
                    <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-amber-50/40">P.O QTY</th>
                    <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-amber-50/40">P.O Rate (₹)</th>
                    <th className="px-4 py-2.5 text-right font-mono font-bold border-r border-border bg-amber-100/40">P.O Amount (₹)</th>
                  </>
                )}

                {/* ACTUAL Group */}
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-emerald-50/50 dark:bg-emerald-950/20">Total Bill Qty</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-emerald-50/50 dark:bg-emerald-950/20">Bill Rate (₹)</th>
                <th className="px-4 py-2.5 text-right font-mono font-black text-emerald-900 dark:text-emerald-300 border-r border-border bg-emerald-100/50 dark:bg-emerald-900/30">Total Cost (₹)</th>

                {/* ITEM - RATE VARIATION Group */}
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border/50 bg-orange-50/50 dark:bg-orange-950/20">Qty Variation</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border bg-orange-50/50 dark:bg-orange-950/20">Rate Variation (₹)</th>

                {/* BALANCE & VARIANCE */}
                <th className="px-4 py-2.5 text-right font-mono font-extrabold text-foreground border-r border-border bg-muted/40">Balance (₹)</th>
                <th className="px-4 py-2.5 text-right font-mono font-black border-r border-border">Cost Variance (₹)</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border">Cost Variance (%)</th>
                <th className="px-4 py-2.5 text-left min-w-[280px]">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCategories.map((category) => {
                const isOpen = openCategories[category.id] ?? true;

                return (
                  <React.Fragment key={category.id}>
                    {/* Category Accordion Header Bar */}
                    <tr
                      onClick={() => toggleCategory(category.id)}
                      className="cursor-pointer bg-muted/70 font-bold text-foreground hover:bg-muted/90 transition-colors align-middle"
                    >
                      <td colSpan={showFullAuditCols ? 4 : 3} className="px-3.5 py-2 border-r border-border font-extrabold">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {isOpen ? <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                          <span className="text-xs font-black uppercase text-foreground tracking-wide">{category.categoryName}</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                            {category.items.length} items
                          </span>
                        </div>
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-r border-border/50">
                        Category Baseline:
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-black text-xs text-foreground border-r border-border bg-slate-100/80 dark:bg-slate-800/80">
                        ₹{category.totalBudgetCost.toLocaleString('en-IN')}
                      </td>
                      {showFullAuditCols && <td colSpan={3} className="border-r border-border">-</td>}
                      <td colSpan={2} className="px-3 py-2 text-right text-[11px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider border-r border-border/50">
                        Actual Total:
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-black text-xs text-emerald-700 dark:text-emerald-300 border-r border-border bg-emerald-100/70 dark:bg-emerald-900/50">
                        ₹{category.totalActualCost.toLocaleString('en-IN')}
                      </td>
                      <td colSpan={2} className="border-r border-border">-</td>
                      <td className="px-4 py-2 text-right font-mono font-black text-foreground border-r border-border bg-muted/40">
                        ₹{category.totalBalance.toLocaleString('en-IN')}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono font-black border-r border-border ${category.totalVarianceAmount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {category.totalVarianceAmount < 0 ? '-' : ''}₹{Math.abs(category.totalVarianceAmount).toLocaleString('en-IN')}
                      </td>
                      <td colSpan={2}></td>
                    </tr>

                    {/* Category Line Item Rows */}
                    {isOpen &&
                      category.items.map((item) => {
                        const edit = editedItems[item.id];
                        const currentBillQty = edit ? edit.billQty : item.actualBillQty;
                        const currentBillRate = edit ? edit.billRate : item.actualBillRate;
                        const currentCost = Math.round(currentBillQty * currentBillRate);
                        const currentQtyVar = Number((currentBillQty - item.budgetQty).toFixed(2));
                        const currentRateVar = Number((currentBillRate - item.budgetRate).toFixed(2));
                        const currentBalance = Math.round(item.budgetCost - currentCost);
                        const currentCostVarAmt = Math.round(currentCost - item.budgetCost);
                        const currentCostVarPct = item.budgetCost > 0 ? (currentCostVarAmt / item.budgetCost) * 100 : 0;
                        const isOverrun = currentCostVarAmt < 0;

                        return (
                          <tr key={item.id} className="group hover:bg-muted/30 transition-colors align-middle">
                            <td className="px-3.5 py-2 text-center font-bold text-muted-foreground whitespace-nowrap border-r border-border">{item.srNo}</td>
                            <td className="px-4 py-2 font-semibold text-foreground whitespace-normal min-w-[220px] max-w-[300px] break-words leading-tight border-r border-border" title={item.subActivity}>
                              {item.subActivity}
                            </td>
                            {showFullAuditCols && (
                              <td className="px-3 py-2 text-center whitespace-nowrap border-r border-border">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase text-slate-700">
                                  {item.workStatus || 'Not Completed'}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-2 text-center font-medium text-muted-foreground whitespace-nowrap border-r border-border">{item.unit}</td>

                            {/* BUDGET values */}
                            <td className="px-3.5 py-2 text-right font-mono text-muted-foreground whitespace-nowrap border-r border-border/50">{item.budgetQty ? item.budgetQty.toLocaleString('en-IN') : '-'}</td>
                            <td className="px-3.5 py-2 text-right font-mono text-muted-foreground whitespace-nowrap border-r border-border/50">{item.budgetRate ? item.budgetRate.toLocaleString('en-IN') : '-'}</td>
                            <td className="px-4 py-2 text-right font-mono font-black text-foreground whitespace-nowrap border-r border-border bg-slate-50/50 dark:bg-slate-900/20">{item.budgetCost.toLocaleString('en-IN')}</td>

                            {/* P.O / W.O */}
                            {showFullAuditCols && (
                              <>
                                <td className="px-3.5 py-2 text-right font-mono text-amber-700 whitespace-nowrap border-r border-border/50">{item.poQty ? item.poQty.toLocaleString('en-IN') : '-'}</td>
                                <td className="px-3.5 py-2 text-right font-mono text-amber-700 whitespace-nowrap border-r border-border/50">{item.poRate ? item.poRate.toLocaleString('en-IN') : '-'}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold text-amber-900 whitespace-nowrap border-r border-border bg-amber-50/30">{item.poAmount ? item.poAmount.toLocaleString('en-IN') : '-'}</td>
                              </>
                            )}

                            {/* EDITABLE ACTUAL values */}
                            <td className="px-2 py-1 text-right font-mono border-r border-border/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  value={currentBillQty}
                                  onChange={(e) => handleCellChange(item.id, 'billQty', e.target.value, item)}
                                  className="h-7 w-20 rounded border border-emerald-400 bg-card px-2 text-right text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              ) : (
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{currentBillQty ? currentBillQty.toLocaleString('en-IN') : '-'}</span>
                              )}
                            </td>

                            <td className="px-2 py-1 text-right font-mono border-r border-border/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                              {isEditMode ? (
                                <input
                                  type="number"
                                  value={currentBillRate}
                                  onChange={(e) => handleCellChange(item.id, 'billRate', e.target.value, item)}
                                  className="h-7 w-24 rounded border border-emerald-400 bg-card px-2 text-right text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              ) : (
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{currentBillRate ? currentBillRate.toLocaleString('en-IN') : '-'}</span>
                              )}
                            </td>

                            {/* RECALCULATED TOTAL COST */}
                            <td className="px-4 py-2 text-right font-mono font-black text-emerald-900 dark:text-emerald-300 whitespace-nowrap border-r border-border bg-emerald-50/40 dark:bg-emerald-950/20">
                              {currentCost.toLocaleString('en-IN')}
                            </td>

                            {/* VARIATIONS */}
                            <td className="px-3.5 py-2 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap border-r border-border/50">{currentQtyVar.toLocaleString('en-IN')}</td>
                            <td className="px-3.5 py-2 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap border-r border-border">{currentRateVar.toLocaleString('en-IN')}</td>

                            {/* BALANCE */}
                            <td className="px-4 py-2 text-right font-mono font-extrabold text-foreground whitespace-nowrap border-r border-border bg-muted/30">{currentBalance.toLocaleString('en-IN')}</td>

                            {/* COST VARIANCE (AMOUNT) */}
                            <td className={`px-4 py-2 text-right font-mono font-black whitespace-nowrap border-r border-border ${isOverrun ? 'text-red-600 bg-red-50/40 dark:bg-red-950/20' : 'text-emerald-600'}`}>
                              {isOverrun ? '-' : ''}₹{Math.abs(currentCostVarAmt).toLocaleString('en-IN')}
                            </td>

                            {/* COST VARIANCE (%) */}
                            <td className={`px-3.5 py-2 text-right font-mono font-bold whitespace-nowrap border-r border-border ${isOverrun ? 'text-red-600' : 'text-emerald-600'}`}>
                              {currentCostVarPct.toFixed(2)}%
                            </td>

                            {/* EDITABLE REMARK */}
                            <td className="px-2 py-1 text-muted-foreground text-[11px] whitespace-normal min-w-[280px] max-w-[360px]">
                              {isEditMode ? (
                                <input
                                  type="text"
                                  value={edit ? edit.remark : item.remark}
                                  onChange={(e) => handleCellChange(item.id, 'remark', e.target.value, item)}
                                  placeholder="Reason for variance / overrun..."
                                  className="h-7 w-full rounded border border-border bg-card px-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
                                />
                              ) : (
                                <span className="leading-snug break-words">{item.remark || '-'}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}

              {/* MAIN TOTAL ROW */}
              <tr className="border-t-2 border-border bg-slate-900 text-slate-100 font-black text-xs align-middle">
                <td colSpan={showFullAuditCols ? 4 : 3} className="px-4 py-3 border-r border-slate-700 font-black text-amber-400 uppercase tracking-widest text-sm text-left">
                  TOTAL
                </td>

                {/* Budget Total */}
                <td colSpan={2} className="px-3 py-3 text-right font-mono text-slate-300 border-r border-slate-700 font-extrabold text-[11px]">Budget Cost Total:</td>
                <td className="px-4 py-3 text-right font-mono text-amber-300 font-black border-r border-slate-700 text-xs">
                  ₹{totalBudgetCost.toLocaleString('en-IN')}
                </td>

                {showFullAuditCols && <td colSpan={3} className="border-r border-slate-700">-</td>}

                {/* Actual Total */}
                <td colSpan={2} className="px-3 py-3 text-right font-mono text-emerald-300 border-r border-slate-700 font-extrabold text-[11px]">Actual Billed Total:</td>
                <td className="px-4 py-3 text-right font-mono text-emerald-400 font-black border-r border-slate-700 text-xs">
                  ₹{totalActualCost.toLocaleString('en-IN')}
                </td>

                {/* Variations */}
                <td className="px-3.5 py-3 text-right font-mono text-slate-300 border-r border-slate-700 text-[11px]">{totalQtyVariation.toFixed(2)}</td>
                <td className="px-3.5 py-3 text-right font-mono text-slate-300 border-r border-slate-700 text-[11px]">{totalRateVariation.toFixed(2)}</td>

                {/* Balance */}
                <td className="px-4 py-3 text-right font-mono text-slate-100 font-black border-r border-slate-700 text-xs">
                  ₹{totalBalance.toLocaleString('en-IN')}
                </td>

                {/* Cost Variance (Amount) */}
                <td className="px-4 py-3 text-right font-mono text-xs border-r border-slate-700">
                  <span className={`inline-block rounded px-2.5 py-1 text-white font-black shadow-2xs ${totalCostVarianceAmount < 0 ? 'bg-red-600' : 'bg-emerald-600'}`}>
                    {totalCostVarianceAmount < 0 ? '-' : ''}₹{Math.abs(totalCostVarianceAmount).toLocaleString('en-IN')}
                  </span>
                </td>

                {/* Cost Variance (%) */}
                <td className="px-3.5 py-3 text-right font-mono text-red-400 font-black border-r border-slate-700 text-xs">
                  {Math.abs(totalCostVariancePercent).toFixed(2)}%
                </td>

                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* AI MITIGATION ADVISORY SUGGESTIONS MODAL (SUGGEST ONLY) */}
      {showAiMitigationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto select-none">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold text-foreground">AI Overrun Mitigation Advisory Plan</h3>
                  <p className="text-xs text-muted-foreground">AI recommendations for rebalancing project cost overruns (Advisory Only)</p>
                </div>
              </div>
              <button onClick={() => setShowAiMitigationModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 flex items-start gap-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <Lightbulb className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-900 dark:text-amber-300">💡 AI Strategy A: UltraTech Cement Forward Procurement Lock</p>
                  <p className="text-amber-800 dark:text-amber-400">
                    AI suggests negotiating a 3-month forward supply contract to lock cement rates at <strong>₹385/bag</strong> baseline, avoiding the <strong>+₹25.45 Lakhs</strong> rate escalation on upcoming RA bills.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-start gap-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <Lightbulb className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-emerald-900 dark:text-emerald-300">💡 AI Strategy B: Civil Labour Scope Reallocation</p>
                  <p className="text-emerald-800 dark:text-emerald-400">
                    AI suggests reallocating <strong>₹43.00 Lakhs</strong> surplus from the Steel Rebar bulk discount package to offset the <strong>₹41.30 Lakhs</strong> shuttering area scope expansion on Slab 12.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground font-semibold flex items-center justify-between">
              <span>* AI mitigation suggestions are purely advisory and will NOT mutate your variance sheet directly.</span>
              <button
                type="button"
                onClick={() => {
                  setShowAiMitigationModal(false);
                  setIsEditMode(true);
                }}
                className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
              >
                <Pencil className="h-3 w-3" /> Open Edit Variance Mode
              </button>
            </div>

            <div className="flex items-center justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowAiMitigationModal(false)}
                className="h-9 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-2xs"
              >
                Close Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECONCILIATION AUDIT HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto select-none">
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/50">
                  <History className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-bold text-foreground">Reconciliation Audit History &amp; Revision Log</h2>
                  <p className="text-xs text-muted-foreground">Detailed log of all variance edits, quantity adjustments &amp; net cost impacts</p>
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {historyLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-foreground">{log.revision}</span>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold text-primary">
                          {log.changesCount} Items Changed
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" /> {log.editedBy} • <Clock className="h-3.5 w-3.5" /> {log.timestamp}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Net Cost Impact</p>
                      <p className={`text-sm font-mono font-black ${log.netImpactAmount > 0 ? 'text-red-600' : log.netImpactAmount < 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                        {log.netImpactAmount > 0 ? '+' : ''}₹{log.netImpactAmount.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-foreground font-medium italic">"{log.remarksSummary}"</p>

                  {/* Changed Items Breakdown Table */}
                  {log.itemDetails.length > 0 && (
                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Item Description</th>
                            <th className="px-3 py-2 text-right">Old Qty → New Qty</th>
                            <th className="px-3 py-2 text-right">Old Rate → New Rate</th>
                            <th className="px-3 py-2 text-right">Cost Difference</th>
                            <th className="px-3 py-2">Justification Remark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-[11px]">
                          {log.itemDetails.map((item, i) => (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-bold text-foreground max-w-[200px] truncate">{item.subActivity}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{item.oldQty.toLocaleString('en-IN')} → <span className="font-bold text-foreground">{item.newQty.toLocaleString('en-IN')}</span></td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">₹{item.oldRate} → <span className="font-bold text-foreground">₹{item.newRate}</span></td>
                              <td className={`px-3 py-2 text-right font-mono font-black ${item.newCost - item.oldCost > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {item.newCost - item.oldCost > 0 ? '+' : ''}₹{(item.newCost - item.oldCost).toLocaleString('en-IN')}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground italic">{item.remark}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end border-t border-border pt-4 mt-4">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="h-9 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-2xs"
              >
                Close Audit History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNSAVED VARIANCE CHANGES CONFIRMATION POPUP MODAL */}
      {showUnsavedConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/50">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">Unsaved Variance Edits Detected</h3>
                <p className="text-xs text-muted-foreground mt-0.5">You have modified variance rates or quantities. Save changes before exiting?</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              Edits will only apply when you click <strong>Save &amp; Log History</strong>.
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveEdits}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" /> Save &amp; Log History
              </button>

              <button
                type="button"
                onClick={handleCancelEdits}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
              >
                <Trash2 className="h-4 w-4" /> Discard Changes
              </button>

              <button
                type="button"
                onClick={() => setShowUnsavedConfirmModal(false)}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
