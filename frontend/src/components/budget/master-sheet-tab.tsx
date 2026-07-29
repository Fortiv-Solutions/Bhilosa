'use client';

import React, { useState } from 'react';
import { formatIndianCurrency } from '@/utils/format-currency';
import { ChevronDown, ChevronRight, FileSpreadsheet, Search, Pencil, Save, X, Trash2, CheckCircle2, History, Building2, Layers, Plus, AlertTriangle, FileClock, Clock, UserCheck, Sparkles, ShieldAlert, Check, Lightbulb, Copy } from 'lucide-react';
import type { MasterBudgetCategory, MasterBudgetItem } from '@/lib/budget';
import { CENTRAL_PARK_MASTER_BUDGET_CATEGORIES } from '@/lib/central-park-budget-data';
import ExcelImporterModal from './excel-importer-modal';

interface BudgetRevisionAuditLog {
  id: string;
  versionLabel: string;
  timestamp: string;
  editedBy: string;
  justification: string;
  oldTotalCost: number;
  newTotalCost: number;
  netDiffAmount: number;
  itemDetails: {
    subActivity: string;
    category: string;
    oldQty: number;
    newQty: number;
    oldRate: number;
    newRate: number;
    oldCost: number;
    newCost: number;
  }[];
}

interface MasterSheetTabProps {
  categories?: MasterBudgetCategory[];
  onAddLineItem?: () => void;
  canManage?: boolean;
}

export default function MasterSheetTab({
  categories: initialCategories = CENTRAL_PARK_MASTER_BUDGET_CATEGORIES,
  canManage = true,
}: MasterSheetTabProps) {
  const [categories, setCategories] = useState<MasterBudgetCategory[]>(initialCategories);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => {
    const initMap: Record<string, boolean> = {};
    initialCategories.forEach((c) => {
      initMap[c.id] = true;
    });
    return initMap;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'building_rcc' | 'building_finishes' | 'site_infra'>('all');
  const [isImporterOpen, setIsImporterOpen] = useState(false);

  // Upper Management Interactive Edit Mode & Revision History States
  const [isEditMode, setIsEditMode] = useState(false);
  const [versionNumber, setVersionNumber] = useState(1);
  const [editedCategories, setEditedCategories] = useState<MasterBudgetCategory[]>(initialCategories);
  const [versionNotice, setVersionNotice] = useState<string | null>(null);

  // Revision Modals & AI Benchmark States
  const [showSaveJustificationModal, setShowSaveJustificationModal] = useState(false);
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState(false);
  const [showRevisionHistoryModal, setShowRevisionHistoryModal] = useState(false);
  const [showAiBenchmarkModal, setShowAiBenchmarkModal] = useState(false);
  const [revisionJustificationText, setRevisionJustificationText] = useState('');

  // Initial Revision History Audit Log
  const [revisionHistoryLogs, setRevisionHistoryLogs] = useState<BudgetRevisionAuditLog[]>([
    {
      id: 'rev-log-v1',
      versionLabel: 'Version v1 (Baseline Excel Upload)',
      timestamp: '20 Jul 2026, 10:00',
      editedBy: 'Pramukh Group Executive Board',
      justification: 'Approved baseline budget schedule imported from Central_Park_Budget (1).xlsx',
      oldTotalCost: 1453638820,
      newTotalCost: 1453638820,
      netDiffAmount: 0,
      itemDetails: [],
    },
  ]);

  function toggleCategory(catId: string) {
    setOpenCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  }

  function handleStartEdit() {
    setEditedCategories(JSON.parse(JSON.stringify(categories)));
    setIsEditMode(true);
    setVersionNotice(null);
  }

  const hasUnsavedChanges = isEditMode && JSON.stringify(editedCategories) !== JSON.stringify(categories);

  function handleCancelAttempt() {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirmModal(true);
    } else {
      handleDiscardChanges();
    }
  }

  function handleDiscardChanges() {
    setEditedCategories(JSON.parse(JSON.stringify(categories)));
    setIsEditMode(false);
    setShowUnsavedConfirmModal(false);
    setShowSaveJustificationModal(false);
  }

  function handleInitiateSave() {
    if (!hasUnsavedChanges) {
      setIsEditMode(false);
      return;
    }
    setRevisionJustificationText('');
    setShowSaveJustificationModal(true);
  }

  function handleConfirmSaveWithJustification() {
    if (!revisionJustificationText.trim()) {
      alert('Please enter a Change Order / Revision Justification reason before saving.');
      return;
    }

    const changedItemDetails: BudgetRevisionAuditLog['itemDetails'] = [];
    let oldGrandTotal = 0;
    let newGrandTotal = 0;

    const updatedCategories: MasterBudgetCategory[] = editedCategories.map((cat, cIdx) => {
      const origCat = categories[cIdx];

      const items = cat.items.map((item, iIdx) => {
        const origItem = origCat.items[iIdx];
        const qtyTotal = (item.qtyRcc || 0) + (item.qtyFinishes || 0) + (item.qtyInfra || 0) || item.qtyTotal || 1;
        const cost = Math.round(item.rate * qtyTotal);
        const costPerBua = Number((cost / 615000).toFixed(2));

        if (origItem) {
          oldGrandTotal += origItem.cost;
          newGrandTotal += cost;

          if (origItem.cost !== cost || origItem.rate !== item.rate || origItem.qtyTotal !== qtyTotal) {
            changedItemDetails.push({
              subActivity: item.item,
              category: cat.categoryName,
              oldQty: origItem.qtyTotal,
              newQty: qtyTotal,
              oldRate: origItem.rate,
              newRate: item.rate,
              oldCost: origItem.cost,
              newCost: cost,
            });
          }
        }

        return { ...item, qtyTotal, cost, costPerBua };
      });

      const totalCost = Math.round(items.reduce((sum, i) => sum + i.cost, 0));
      const totalCostPerBua = Number((totalCost / 615000).toFixed(2));
      return { ...cat, items, totalCost, totalCostPerBua };
    });

    const newVerNo = versionNumber + 1;
    const netDiff = newGrandTotal - oldGrandTotal;

    const newLog: BudgetRevisionAuditLog = {
      id: `rev-log-v${newVerNo}`,
      versionLabel: `Version v${newVerNo} (Change Order)`,
      timestamp: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      editedBy: 'Pramukh Group Management User',
      justification: revisionJustificationText,
      oldTotalCost: oldGrandTotal,
      newTotalCost: newGrandTotal,
      netDiffAmount: netDiff,
      itemDetails: changedItemDetails,
    };

    setRevisionHistoryLogs((prev) => [newLog, ...prev]);
    setCategories(updatedCategories);
    setVersionNumber(newVerNo);
    setIsEditMode(false);
    setShowSaveJustificationModal(false);
    setShowUnsavedConfirmModal(false);
    setVersionNotice(`Budget Version updated to v${newVerNo}. Change Order logged into Revision History.`);
  }

  function handleItemChange(
    catId: string,
    itemId: string,
    field: keyof MasterBudgetItem,
    value: string | number | null
  ) {
    setEditedCategories((prevCategories) =>
      prevCategories.map((cat) => {
        if (cat.id !== catId) return cat;
        return {
          ...cat,
          items: cat.items.map((item) => {
            if (item.id !== itemId) return item;

            const updatedItem = { ...item, [field]: value };
            if (field === 'qtyRcc' || field === 'qtyFinishes' || field === 'qtyInfra' || field === 'rate') {
              const rcc = typeof updatedItem.qtyRcc === 'number' ? updatedItem.qtyRcc : Number(updatedItem.qtyRcc) || 0;
              const fin = typeof updatedItem.qtyFinishes === 'number' ? updatedItem.qtyFinishes : Number(updatedItem.qtyFinishes) || 0;
              const inf = typeof updatedItem.qtyInfra === 'number' ? updatedItem.qtyInfra : Number(updatedItem.qtyInfra) || 0;
              const rate = typeof updatedItem.rate === 'number' ? updatedItem.rate : Number(updatedItem.rate) || 0;

              const qtyTotal = (rcc || 0) + (fin || 0) + (inf || 0) || updatedItem.qtyTotal || 1;
              const cost = Math.round(rate * qtyTotal);
              const costPerBua = Number((cost / 615000).toFixed(2));

              return {
                ...updatedItem,
                qtyTotal,
                cost,
                costPerBua,
              };
            }
            return updatedItem;
          }),
        };
      })
    );
  }

  const activeCategoriesList = isEditMode ? editedCategories : categories;

  const totalBaselineCost = Math.round(
    activeCategoriesList.reduce((sum, cat) => {
      const catSum = cat.items.reduce((iSum, item) => iSum + (item.cost || 0), 0);
      return sum + catSum;
    }, 0)
  );

  const totalCostPerBua = Number((totalBaselineCost / 615000).toFixed(2));
  const totalLineItemsCount = activeCategoriesList.reduce((sum, cat) => sum + cat.items.length, 0);

  const filteredCategories = activeCategoriesList
    .map((cat) => {
      const filteredItems = cat.items.filter((item) => {
        const matchesQuery =
          item.item.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cat.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.srNo.toLowerCase().includes(searchQuery.toLowerCase());

        let matchesScope = true;
        if (scopeFilter === 'building_rcc') matchesScope = (item.qtyRcc || 0) > 0;
        if (scopeFilter === 'building_finishes') matchesScope = (item.qtyFinishes || 0) > 0;
        if (scopeFilter === 'site_infra') matchesScope = (item.qtyInfra || 0) > 0;

        return matchesQuery && matchesScope;
      });

      return {
        ...cat,
        items: filteredItems,
      };
    })
    .filter((cat) => cat.items.length > 0);

  return (
    <div className="space-y-5 select-none">
      {/* Upper Management Audit Banner */}
      {versionNotice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            {versionNotice}
          </div>
          <button onClick={() => setVersionNotice(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Baseline Summary Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-bold text-foreground tracking-tight">Central Park Master Budget</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-primary">
                Version v{versionNumber}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Built-up Area (BUA): <strong className="text-foreground">6,15,000 Sqft</strong> | Total Baseline Categories: <strong className="text-foreground">{activeCategoriesList.length}</strong> | Line Items: <strong className="text-foreground">{totalLineItemsCount}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-border pt-3 md:pt-0 md:pl-6 text-xs">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Total Baseline Cost</p>
            <p className="text-xl font-mono font-black text-foreground">₹{totalBaselineCost.toLocaleString('en-IN')}</p>
          </div>

          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Cost / BUA</p>
            <p className="text-xl font-mono font-black text-primary">₹{totalCostPerBua.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Control Actions & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by item description or category..."
              className="h-8.5 w-72 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-muted-foreground">Scope:</span>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as any)}
              className="h-8.5 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none"
            >
              <option value="all">All Scope Items</option>
              <option value="building_rcc">Building RCC Work</option>
              <option value="building_finishes">Building Finishes Work</option>
              <option value="site_infra">Site Infra Work</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Secondary AI & Audit Tools Group */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setShowAiBenchmarkModal(true)}
              className="inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
              title="View AI Market Rate Suggestions"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Suggestions
            </button>
            <div className="h-4 w-px bg-border my-auto" />
            <button
              type="button"
              onClick={() => setShowRevisionHistoryModal(true)}
              className="inline-flex h-7.5 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              title="View Revision Audit Log"
            >
              <History className="h-3.5 w-3.5 text-amber-600" />
              History ({revisionHistoryLogs.length})
            </button>
          </div>

          {/* Primary Action Buttons */}
          {isEditMode ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCancelAttempt}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={handleInitiateSave}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> Save Budget (v{versionNumber + 1})
              </button>
            </div>
          ) : (
            canManage && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5 text-primary" /> Edit Mode
                </button>
                <button
                  type="button"
                  onClick={() => setIsImporterOpen(true)}
                  className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Import Excel
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Master Baseline Budget Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap font-sans border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/70 text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
                <th className="px-3.5 py-3 w-12 text-center border-r border-border">SR NO.</th>
                <th className="px-4 py-3 min-w-[260px] border-r border-border">ITEM DESCRIPTION</th>
                <th className="px-3.5 py-3 text-right font-mono border-r border-border">BUILDING RCC QTY</th>
                <th className="px-3.5 py-3 text-right font-mono border-r border-border">BUILDING FINISHES QTY</th>
                <th className="px-3.5 py-3 text-right font-mono border-r border-border">SITE INFRA QTY</th>
                <th className="px-3.5 py-3 text-right font-mono font-bold text-foreground border-r border-border bg-muted/30">TOTAL QTY</th>
                <th className="px-3 py-3 text-center border-r border-border">UNIT</th>
                <th className="px-4 py-3 text-right font-mono border-r border-border">EST. RATE (₹)</th>
                <th className="px-4 py-3 text-right font-mono font-black text-foreground border-r border-border bg-muted/40">BUDGETED COST (₹)</th>
                <th className="px-4 py-3 text-right font-mono font-bold text-primary">COST / BUA (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCategories.map((category) => {
                const isOpen = openCategories[category.id] ?? true;
                const catBaselineTotal = Math.round(category.items.reduce((sum, i) => sum + (i.cost || 0), 0));
                const catCostPerBua = Number((catBaselineTotal / 615000).toFixed(2));

                return (
                  <React.Fragment key={category.id}>
                    {/* Category Accordion Bar */}
                    <tr
                      onClick={() => toggleCategory(category.id)}
                      className="cursor-pointer bg-muted/70 font-bold text-foreground hover:bg-muted/90 transition-colors align-middle"
                    >
                      <td colSpan={2} className="px-4 py-2.5 border-r border-border">
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="h-4 w-4 text-primary flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                          <span className="text-xs font-black uppercase tracking-wide text-foreground">{category.categoryName}</span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                            {category.items.length} items
                          </span>
                        </div>
                      </td>
                      <td colSpan={6} className="px-4 py-2.5 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider border-r border-border">
                        Category Baseline Total:
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-black text-xs text-foreground border-r border-border bg-muted/60">
                        ₹{catBaselineTotal.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-black text-xs text-primary">
                        ₹{catCostPerBua.toFixed(2)}
                      </td>
                    </tr>

                    {/* Category Budget Items */}
                    {isOpen &&
                      category.items.map((item) => (
                        <tr key={item.id} className="group hover:bg-muted/30 transition-colors align-middle">
                          <td className="px-3.5 py-2 text-center font-bold text-muted-foreground border-r border-border">{item.srNo}</td>
                          <td className="px-4 py-2 font-semibold text-foreground whitespace-normal min-w-[260px] max-w-[340px] break-words border-r border-border leading-tight">
                            {item.item}
                          </td>

                          {/* RCC QTY */}
                          <td className="px-3.5 py-2 text-right font-mono text-muted-foreground border-r border-border">
                            {isEditMode ? (
                              <input
                                type="number"
                                value={item.qtyRcc ?? ''}
                                onChange={(e) => handleItemChange(category.id, item.id, 'qtyRcc', e.target.value === '' ? null : Number(e.target.value))}
                                className="h-7 w-20 text-right rounded border border-primary/40 bg-card px-1.5 text-xs font-mono font-bold outline-none"
                              />
                            ) : (
                              item.qtyRcc ? item.qtyRcc.toLocaleString('en-IN') : '-'
                            )}
                          </td>

                          {/* FINISHES QTY */}
                          <td className="px-3.5 py-2 text-right font-mono text-muted-foreground border-r border-border">
                            {isEditMode ? (
                              <input
                                type="number"
                                value={item.qtyFinishes ?? ''}
                                onChange={(e) => handleItemChange(category.id, item.id, 'qtyFinishes', e.target.value === '' ? null : Number(e.target.value))}
                                className="h-7 w-20 text-right rounded border border-primary/40 bg-card px-1.5 text-xs font-mono font-bold outline-none"
                              />
                            ) : (
                              item.qtyFinishes ? item.qtyFinishes.toLocaleString('en-IN') : '-'
                            )}
                          </td>

                          {/* INFRA QTY */}
                          <td className="px-3.5 py-2 text-right font-mono text-muted-foreground border-r border-border">
                            {isEditMode ? (
                              <input
                                type="number"
                                value={item.qtyInfra ?? ''}
                                onChange={(e) => handleItemChange(category.id, item.id, 'qtyInfra', e.target.value === '' ? null : Number(e.target.value))}
                                className="h-7 w-20 text-right rounded border border-primary/40 bg-card px-1.5 text-xs font-mono font-bold outline-none"
                              />
                            ) : (
                              item.qtyInfra ? item.qtyInfra.toLocaleString('en-IN') : '-'
                            )}
                          </td>

                          {/* TOTAL QTY */}
                          <td className="px-3.5 py-2 text-right font-mono font-extrabold text-foreground border-r border-border bg-muted/20">
                            {item.qtyTotal ? item.qtyTotal.toLocaleString('en-IN') : '1'}
                          </td>

                          {/* UNIT */}
                          <td className="px-3 py-2 text-center font-medium text-muted-foreground border-r border-border">{item.unit || 'LS'}</td>

                          {/* EST. RATE */}
                          <td className="px-4 py-2 text-right font-mono font-semibold text-foreground border-r border-border">
                            {isEditMode ? (
                              <input
                                type="number"
                                value={item.rate}
                                onChange={(e) => handleItemChange(category.id, item.id, 'rate', Number(e.target.value))}
                                className="h-7 w-24 text-right rounded border border-primary/40 bg-card px-1.5 text-xs font-mono font-bold outline-none"
                              />
                            ) : (
                              item.rate ? item.rate.toLocaleString('en-IN') : '0'
                            )}
                          </td>

                          {/* BUDGETED COST */}
                          <td className="px-4 py-2 text-right font-mono font-black text-foreground border-r border-border bg-muted/30">
                            {Math.round(item.cost).toLocaleString('en-IN')}
                          </td>

                          {/* COST / BUA */}
                          <td className="px-4 py-2 text-right font-mono font-bold text-primary">
                            ₹{item.costPerBua.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}

              {/* Grand TOTAL Row */}
              <tr className="border-t-2 border-border bg-slate-900 text-slate-100 font-black text-xs align-middle">
                <td colSpan={2} className="px-4 py-3.5 text-amber-400 font-black uppercase tracking-widest text-sm border-r border-slate-700">
                  PROJECT TOTAL BASELINE COST
                </td>
                <td colSpan={6} className="px-4 py-3.5 text-right font-mono text-slate-300 border-r border-slate-700 font-extrabold uppercase tracking-wider text-xs">
                  Grand Total Baseline:
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-amber-300 font-black text-sm border-r border-slate-700 bg-slate-950">
                  ₹{totalBaselineCost.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-emerald-400 font-black text-sm">
                  ₹{totalCostPerBua.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* AI MARKET RATE BENCHMARK ADVISORY SUGGESTIONS MODAL (SUGGEST ONLY - NO DIRECT APPLY) */}
      {showAiBenchmarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto select-none">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold text-foreground">AI Market Rate Advisory Suggestions</h3>
                  <p className="text-xs text-muted-foreground">AI benchmark insights compared against regional Gujarat market rates (Advisory Only)</p>
                </div>
              </div>
              <button onClick={() => setShowAiBenchmarkModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 flex items-start gap-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-900 dark:text-amber-300">💡 AI Suggestion: Cement Rate Benchmark Advisory</p>
                  <p className="text-amber-800 dark:text-amber-400">
                    Your estimated baseline rate for <strong>UltraTech PPC Cement</strong> is <strong>₹385/bag</strong>. Regional market benchmark is <strong>₹365/bag</strong> (+5.47% premium).
                  </p>
                  <p className="text-[11px] text-muted-foreground italic pt-1">
                    Recommendation: Use <strong>Edit Budget Mode</strong> to manually adjust if vendor contract allows.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-start gap-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <Lightbulb className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-emerald-900 dark:text-emerald-300">💡 AI Suggestion: TFE Steel Rebar Savings Opportunity</p>
                  <p className="text-emerald-800 dark:text-emerald-400">
                    Your baseline rate for <strong>Fe 550D Steel Rebar</strong> is <strong>₹62,500/Ton</strong>. Regional benchmark is <strong>₹61,200/Ton</strong> (-2.08% potential bulk savings).
                  </p>
                  <p className="text-[11px] text-muted-foreground italic pt-1">
                    Recommendation: Negotiate volume discount on next 450 Ton shipment.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground font-semibold flex items-center justify-between">
              <span>* AI suggestions are purely advisory and will NOT mutate your baseline budget values directly.</span>
              <button
                type="button"
                onClick={() => {
                  setShowAiBenchmarkModal(false);
                  handleStartEdit();
                }}
                className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
              >
                <Pencil className="h-3 w-3" /> Open Edit Mode to Apply
              </button>
            </div>

            <div className="flex items-center justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowAiBenchmarkModal(false)}
                className="h-9 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-2xs"
              >
                Close Suggestions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master Importer Modal */}
      <ExcelImporterModal
        isOpen={isImporterOpen}
        onClose={() => setIsImporterOpen(false)}
        onImportSuccess={(newItems) => {
          setVersionNumber((prev) => prev + 1);
          setVersionNotice(`Master Excel Sheet successfully parsed & updated to v${versionNumber + 1}!`);
        }}
        existingCategories={categories}
      />

      {/* REVISION JUSTIFICATION PROMPT MODAL (Triggered on Save) */}
      {showSaveJustificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <FileClock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">Change Order / Revision Justification</h3>
                <p className="text-xs text-muted-foreground">Mandatory audit justification for bumping baseline budget to Version v{versionNumber + 1}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Enter Change Order Reason / Justification <span className="text-red-500">*</span>
              </label>
              <textarea
                value={revisionJustificationText}
                onChange={(e) => setRevisionJustificationText(e.target.value)}
                placeholder="e.g. Steel market price hike +12% & Additional RCC Slab 13 scope approved by Board of Directors..."
                className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowSaveJustificationModal(false)}
                className="h-9 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Back to Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveWithJustification}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" /> Save &amp; Log Version v{versionNumber + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVISION AUDIT HISTORY MODAL */}
      {showRevisionHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto select-none">
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/50">
                  <History className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-bold text-foreground">Master Budget Version Audit History</h2>
                  <p className="text-xs text-muted-foreground">Complete audit log of all baseline revisions, change order reasons &amp; cost version shifts</p>
                </div>
              </div>
              <button onClick={() => setShowRevisionHistoryModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {revisionHistoryLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-foreground">{log.versionLabel}</span>
                        {log.itemDetails.length > 0 && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold text-primary">
                            {log.itemDetails.length} Line Items Revised
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" /> {log.editedBy} • <Clock className="h-3.5 w-3.5" /> {log.timestamp}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Baseline Cost Shift</p>
                      <p className={`text-sm font-mono font-black ${log.netDiffAmount > 0 ? 'text-red-600' : log.netDiffAmount < 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                        {log.netDiffAmount > 0 ? '+' : ''}₹{log.netDiffAmount.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border">
                    <p className="text-[11px] font-extrabold uppercase text-muted-foreground tracking-wider">Change Order / Justification Reason:</p>
                    <p className="text-xs text-foreground font-semibold mt-1">"{log.justification}"</p>
                  </div>

                  {/* Modified Line Items Breakdown */}
                  {log.itemDetails.length > 0 && (
                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Category &amp; Sub Activity</th>
                            <th className="px-3 py-2 text-right">Old Qty → New Qty</th>
                            <th className="px-3 py-2 text-right">Old Rate → New Rate</th>
                            <th className="px-3 py-2 text-right">Cost Difference</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-[11px]">
                          {log.itemDetails.map((item, i) => (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-3 py-2 font-bold text-foreground">
                                <div>{item.subActivity}</div>
                                <div className="text-[10px] text-muted-foreground font-normal">{item.category}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{item.oldQty.toLocaleString('en-IN')} → <span className="font-bold text-foreground">{item.newQty.toLocaleString('en-IN')}</span></td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">₹{item.oldRate.toLocaleString('en-IN')} → <span className="font-bold text-foreground">₹{item.newRate.toLocaleString('en-IN')}</span></td>
                              <td className={`px-3 py-2 text-right font-mono font-black ${item.newCost - item.oldCost > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {item.newCost - item.oldCost > 0 ? '+' : ''}₹{(item.newCost - item.oldCost).toLocaleString('en-IN')}
                              </td>
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
                onClick={() => setShowRevisionHistoryModal(false)}
                className="h-9 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-2xs"
              >
                Close Revision History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNSAVED CHANGES CONFIRMATION POPUP MODAL */}
      {showUnsavedConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/50">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">Unsaved Budget Changes Detected</h3>
                <p className="text-xs text-muted-foreground mt-0.5">You have modified budget values. What would you like to do?</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              Changes will only apply when you click <strong>Save &amp; Apply Changes</strong>.
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleInitiateSave}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" /> Save &amp; Apply Changes (v{versionNumber + 1})
              </button>

              <button
                type="button"
                onClick={handleDiscardChanges}
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
