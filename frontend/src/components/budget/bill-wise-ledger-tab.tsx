'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, FileSpreadsheet, Upload, Download, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Database, Calendar, Layers, ArrowUpRight, Edit3, Save, RotateCcw, Plus, Trash2, X } from 'lucide-react';
import { subscribeToBudgetRealtimeChanges, CENTRAL_PARK_PROJECT_ID, supabase } from '@/lib/supabase-budget';
import ExcelImporterModal from './excel-importer-modal';

export interface BillWiseLedgerRow {
  id: string;
  headActivity: string;
  subActivityLedger: string;
  costCode: string;
  supplierName: string;
  accountingDate: string;
  billDateOfSupplier: string;
  billNo: string;
  billNoOfSupplier: string;
  remarks: string;
  itemGroup: string;
  itemDesc: string;
  unit: string;
  receivedQty: number;
  finalBillRate: number;
  billItemAmt: number;
  gstRate: number;
  retentionDeduction: number;
  finalBillAmount: number;
  advancePayment: number;
  expectedPayment: number;
  jvPayment: number;
  poWoNo: string;
  poWoRate: number;
  noteOnPo: string;
  prNo: string;
  lineRemarks: string;
  paymentStatus: 'Paid' | 'Partially Paid' | 'Pending Approval' | 'On Hold';
  runningAvailableBudget: number;
}

const SAMPLE_BILL_WISE_LEDGER_ROWS: BillWiseLedgerRow[] = [
  {
    id: 'ledg-001',
    headActivity: 'Civil and Misc Work',
    subActivityLedger: 'Civil Labour Cost',
    costCode: 'CIV-001',
    supplierName: 'Shree Ram Construction Pvt Ltd',
    accountingDate: '28-07-2026',
    billDateOfSupplier: '25-07-2026',
    billNo: 'ERP-BILL-2026-089',
    billNoOfSupplier: 'SRC/26-27/RA-14',
    remarks: 'RA Bill 14 Passed for Slab 12 Pour',
    itemGroup: 'Labour Services',
    itemDesc: 'RCC Labour work including shuttering, steel bending & concrete pouring',
    unit: 'Sqft',
    receivedQty: 15000,
    finalBillRate: 826,
    billItemAmt: 12390000,
    gstRate: 18,
    retentionDeduction: 619500, // 5% Retention
    finalBillAmount: 14000700,
    advancePayment: 2000000,
    expectedPayment: 12000700,
    jvPayment: 0,
    poWoNo: 'WO-CP-001-CIV-004',
    poWoRate: 826,
    noteOnPo: '5% retention to be released after 6 months of RCC completion',
    prNo: 'PR-2026-012',
    lineRemarks: 'Verified against MB Book Page 45-52',
    paymentStatus: 'Paid',
    runningAvailableBudget: 171849300,
  },
  {
    id: 'ledg-002',
    headActivity: 'Civil Materials',
    subActivityLedger: 'Cement-Flooring, Dado, Frame, Trimix & Water Proofing Work',
    costCode: 'MAT-001',
    supplierName: 'UltraTech Cement Limited',
    accountingDate: '26-07-2026',
    billDateOfSupplier: '24-07-2026',
    billNo: 'ERP-BILL-2026-078',
    billNoOfSupplier: 'UTC/GJ/98231',
    remarks: '500 Bags PPC Cement Delivered to Site Store',
    itemGroup: 'Civil Material',
    itemDesc: 'UltraTech PPC Cement 50kg Bags Grade 53',
    unit: 'Bags',
    receivedQty: 500,
    finalBillRate: 385,
    billItemAmt: 192500,
    gstRate: 28,
    retentionDeduction: 0,
    finalBillAmount: 246400,
    advancePayment: 0,
    expectedPayment: 246400,
    jvPayment: 0,
    poWoNo: 'PO-CP-001-MAT-019',
    poWoRate: 385,
    noteOnPo: 'Payment terms 15 days from GRN verification',
    prNo: 'PR-2026-089',
    lineRemarks: 'GRN #GRN-2026-441 attached',
    paymentStatus: 'Pending Approval',
    runningAvailableBudget: 4808715,
  },
  {
    id: 'ledg-003',
    headActivity: 'Excavation/Backfilling and D-Wall Works',
    subActivityLedger: 'D-Wall ',
    costCode: 'EXC-002',
    supplierName: 'Keller Ground Engineering India',
    accountingDate: '22-07-2026',
    billDateOfSupplier: '20-07-2026',
    billNo: 'ERP-BILL-2026-062',
    billNoOfSupplier: 'KGE/RA-02/2026',
    remarks: 'Diaphragm Wall Panel 1 to 15 Completion',
    itemGroup: 'Substructure Works',
    itemDesc: 'Constructing 600mm thick RCC Diaphragm Wall including trenching',
    unit: 'Lum',
    receivedQty: 1,
    finalBillRate: 13500000,
    billItemAmt: 13500000,
    gstRate: 18,
    retentionDeduction: 675000,
    finalBillAmount: 15255000,
    advancePayment: 3000000,
    expectedPayment: 12255000,
    jvPayment: 0,
    poWoNo: 'WO-CP-001-SUB-001',
    poWoRate: 13500000,
    noteOnPo: 'Milestone 2 payment on bentonite slurry test approval',
    prNo: 'PR-2026-004',
    lineRemarks: 'Slurry test report verified by Structural Consultant',
    paymentStatus: 'Partially Paid',
    runningAvailableBudget: 2745000,
  },
];

export default function BillWiseLedgerTab() {
  const [ledgerRows, setLedgerRows] = useState<BillWiseLedgerRow[]>(SAMPLE_BILL_WISE_LEDGER_ROWS);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedRowsMap, setEditedRowsMap] = useState<Record<string, BillWiseLedgerRow>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUnsavedConfirmModal, setShowUnsavedConfirmModal] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Live Supabase Sync Hook
  useEffect(() => {
    async function loadLiveLedger() {
      const { data, error } = await supabase
        .from('budget_ledger')
        .select('*')
        .eq('project_id', CENTRAL_PARK_PROJECT_ID)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setLedgerRows(data.map((r: any) => ({
          id: r.id,
          headActivity: r.category_name || 'Civil Works',
          subActivityLedger: r.sub_activity || 'Contractor Work',
          costCode: r.cost_code || 'CIV-001',
          supplierName: r.vendor_name || 'Vendor',
          accountingDate: new Date(r.created_at).toLocaleDateString('en-GB'),
          billDateOfSupplier: new Date(r.created_at).toLocaleDateString('en-GB'),
          billNo: r.bill_number || 'BILL-001',
          billNoOfSupplier: r.bill_number || 'BILL-001',
          remarks: r.remarks || 'Verified',
          itemGroup: 'Civil Material',
          itemDesc: r.sub_activity || 'Supply',
          unit: 'LS',
          receivedQty: 1,
          finalBillRate: Number(r.gross_bill_amount || 0),
          billItemAmt: Number(r.gross_bill_amount || 0),
          gstRate: 18,
          retentionDeduction: Number(r.retention_deduction || 0),
          finalBillAmount: Number(r.net_payable_amount || 0),
          advancePayment: Number(r.mob_advance_deduction || 0),
          expectedPayment: Number(r.net_payable_amount || 0),
          jvPayment: 0,
          poWoNo: 'PO-CP-001',
          poWoRate: Number(r.gross_bill_amount || 0),
          noteOnPo: 'Verified against PO',
          prNo: 'PR-CP-001',
          lineRemarks: 'Verified',
          paymentStatus: r.payment_status || 'Paid',
          runningAvailableBudget: 1453638820 - Number(r.net_payable_amount || 0),
        })));
      }
    }

    loadLiveLedger();

    const unsubscribe = subscribeToBudgetRealtimeChanges(CENTRAL_PARK_PROJECT_ID, () => {
      loadLiveLedger();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle cell editing in Edit Mode
  function handleCellChange(rowId: string, field: keyof BillWiseLedgerRow, value: any) {
    setEditedRowsMap((prev) => {
      const targetRow = prev[rowId] || ledgerRows.find((r) => r.id === rowId)!;
      const updatedRow = { ...targetRow, [field]: value };

      // Auto-recalculate amounts
      if (field === 'receivedQty' || field === 'finalBillRate' || field === 'gstRate' || field === 'retentionDeduction' || field === 'advancePayment') {
        const qty = Number(updatedRow.receivedQty) || 0;
        const rate = Number(updatedRow.finalBillRate) || 0;
        const gst = Number(updatedRow.gstRate) || 0;
        const retention = Number(updatedRow.retentionDeduction) || 0;
        const advance = Number(updatedRow.advancePayment) || 0;

        const billItemAmt = Math.round(qty * rate);
        const gstAmt = Math.round((billItemAmt * gst) / 100);
        const finalBillAmt = Math.round(billItemAmt + gstAmt - retention);
        const expectedPay = Math.max(0, finalBillAmt - advance);

        updatedRow.billItemAmt = billItemAmt;
        updatedRow.finalBillAmount = finalBillAmt;
        updatedRow.expectedPayment = expectedPay;
      }

      return { ...prev, [rowId]: updatedRow };
    });
  }

  const hasUnsavedEdits = isEditMode && Object.keys(editedRowsMap).length > 0;

  function handleCancelAttempt() {
    if (hasUnsavedEdits) {
      setShowUnsavedConfirmModal(true);
    } else {
      handleCancelEdits();
    }
  }

  // Add New Row
  function handleAddNewRow() {
    const newId = `ledg-${Date.now()}`;
    const newRow: BillWiseLedgerRow = {
      id: newId,
      headActivity: 'Civil Materials',
      subActivityLedger: 'New Material Supply',
      costCode: 'MAT-002',
      supplierName: 'New Supplier Ltd',
      accountingDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
      billDateOfSupplier: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'),
      billNo: `ERP-BILL-2026-${Math.floor(100 + Math.random() * 900)}`,
      billNoOfSupplier: 'SUP/INV-001',
      remarks: 'New Ledger Entry',
      itemGroup: 'Civil Material',
      itemDesc: 'Material description...',
      unit: 'Bags',
      receivedQty: 100,
      finalBillRate: 350,
      billItemAmt: 35000,
      gstRate: 18,
      retentionDeduction: 0,
      finalBillAmount: 41300,
      advancePayment: 0,
      expectedPayment: 41300,
      jvPayment: 0,
      poWoNo: 'PO-2026-NEW',
      poWoRate: 350,
      noteOnPo: 'Standard terms',
      prNo: 'PR-2026-NEW',
      lineRemarks: 'New line item',
      paymentStatus: 'Pending Approval',
      runningAvailableBudget: 5000000,
    };

    setLedgerRows((prev) => [newRow, ...prev]);
    setEditedRowsMap((prev) => ({ ...prev, [newId]: newRow }));
  }

  // Delete Row
  function handleDeleteRow(rowId: string) {
    if (confirm('Are you sure you want to remove this ledger entry?')) {
      setLedgerRows((prev) => prev.filter((r) => r.id !== rowId));
      setEditedRowsMap((prev) => {
        const copy = { ...prev };
        delete copy[rowId];
        return copy;
      });
    }
  }

  // Save Edits
  function handleSaveEdits() {
    const updatedRows = ledgerRows.map((r) => editedRowsMap[r.id] || r);
    setLedgerRows(updatedRows);
    setIsEditMode(false);
    setShowUnsavedConfirmModal(false);
    setEditedRowsMap({});
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  }

  // Cancel Edits
  function handleCancelEdits() {
    setIsEditMode(false);
    setShowUnsavedConfirmModal(false);
    setEditedRowsMap({});
  }

  // Current Working Rows
  const workingRows = ledgerRows.map((r) => editedRowsMap[r.id] || r);

  // Filter Rows
  const filteredRows = workingRows.filter((row) => {
    const matchesSearch =
      row.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.billNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.billNoOfSupplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.poWoNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.costCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.headActivity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.subActivityLedger.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || row.paymentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalBilledAmount = filteredRows.reduce((s, r) => s + r.finalBillAmount, 0);
  const totalRetentions = filteredRows.reduce((s, r) => s + r.retentionDeduction, 0);
  const totalAdvances = filteredRows.reduce((s, r) => s + r.advancePayment, 0);
  const totalExpectedOutflow = filteredRows.reduce((s, r) => s + r.expectedPayment, 0);

  return (
    <div className="space-y-5 select-none font-sans">
      {/* LEDGER KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Total Net Billed Outflow</p>
          <p className="mt-1 text-xl font-mono font-black text-foreground">₹{totalBilledAmount.toLocaleString('en-IN')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Cumulative billed across {filteredRows.length} bills</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">Total Retention Deductions (5%)</p>
          <p className="mt-1 text-xl font-mono font-black text-amber-800 dark:text-amber-300">₹{totalRetentions.toLocaleString('en-IN')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Held back for DLP security</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Advances Adjusted</p>
          <p className="mt-1 text-xl font-mono font-black text-emerald-800 dark:text-emerald-300">₹{totalAdvances.toLocaleString('en-IN')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Pre-paid MOB advances</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">Pending Payable Outflow</p>
          <p className="mt-1 text-xl font-mono font-black text-primary">₹{totalExpectedOutflow.toLocaleString('en-IN')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Awaiting accounts treasury release</p>
        </div>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          Ledger Rows &amp; Bill-Wise Amounts updated and saved to Backend Database!
        </div>
      )}

      {/* SEARCH & EDIT MODE CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Supplier, Bill #, Cost Code..."
              className="h-8.5 w-72 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-muted-foreground">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8.5 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none"
            >
              <option value="All">All Payment Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* EDIT & ADD/REMOVE BUTTONS */}
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={handleAddNewRow}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add New Ledger Row
              </button>

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
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              >
                <Save className="h-3.5 w-3.5" /> Save Ledger Changes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit Ledger Mode
              </button>

              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-2xs hover:bg-muted transition-colors"
              >
                <Upload className="h-3.5 w-3.5" /> Import Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* 28-COLUMN FULL CONSTRUCTION ERP BILL-WISE LEDGER TABLE */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap font-sans border-collapse">
            <thead>
              {/* Top Grouped Category Header Row */}
              <tr className="border-b border-border bg-muted/80 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground select-none">
                {isEditMode && <th className="px-2 py-2 text-center bg-red-100 text-red-900">Action</th>}
                <th colSpan={6} className="px-3 py-2 text-center border-r border-border bg-slate-200/70 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100">Identity &amp; Budget Head</th>
                <th colSpan={5} className="px-3 py-2 text-center border-r border-border bg-blue-100/70 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300">Supplier &amp; Bill Audit</th>
                <th colSpan={7} className="px-3 py-2 text-center border-r border-border bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300">Billed Line Items &amp; Taxes</th>
                <th colSpan={4} className="px-3 py-2 text-center border-r border-border bg-purple-100/70 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300">Payment Settlement</th>
                <th colSpan={6} className="px-3 py-2 text-center bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">PO Traceability &amp; Remaining Budget</th>
              </tr>

              {/* Column Names Header Row (28 Columns) */}
              <tr className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase tracking-wider text-muted-foreground select-none">
                {isEditMode && <th className="px-2 py-2.5 w-10 text-center border-r border-border bg-red-50 text-red-700">Delete</th>}
                <th className="px-3.5 py-2.5 min-w-[160px] border-r border-border">Head Activity</th>
                <th className="px-3.5 py-2.5 min-w-[180px] border-r border-border">Sub Activity Ledger</th>
                <th className="px-3 py-2.5 text-center font-mono text-primary font-black border-r border-border bg-primary/5">Cost Code</th>
                <th className="px-3 py-2.5 border-r border-border">Item Group</th>
                <th className="px-4 py-2.5 min-w-[200px] border-r border-border">Item Desc</th>
                <th className="px-3 py-2.5 text-center border-r border-border">Unit</th>

                <th className="px-4 py-2.5 min-w-[180px] border-r border-border">Supplier Name</th>
                <th className="px-3 py-2.5 text-center border-r border-border">Accounting Date</th>
                <th className="px-3 py-2.5 text-center border-r border-border">Bill Date (Supplier)</th>
                <th className="px-3.5 py-2.5 font-mono border-r border-border">Bill No. (ERP)</th>
                <th className="px-3.5 py-2.5 font-mono border-r border-border">Bill No. (Supplier)</th>

                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border">Received Qty</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border">Final Bill Rate (₹)</th>
                <th className="px-4 py-2.5 text-right font-mono font-bold border-r border-border">Bill Item Amt (₹)</th>
                <th className="px-3 py-2.5 text-center font-mono border-r border-border">GST %</th>
                <th className="px-4 py-2.5 text-right font-mono text-amber-700 font-bold border-r border-border bg-amber-50/40">Retention (5%) (₹)</th>
                <th className="px-4 py-2.5 text-right font-mono font-black text-emerald-900 dark:text-emerald-300 border-r border-border bg-emerald-100/50">Final Bill Amount (₹)</th>
                <th className="px-3.5 py-2.5 text-center border-r border-border">Status</th>

                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border">Advance Paid (₹)</th>
                <th className="px-3.5 py-2.5 text-right font-mono text-primary font-bold border-r border-border">Expected Pay (₹)</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border">JV Payment (₹)</th>
                <th className="px-3.5 py-2.5 text-left border-r border-border min-w-[200px]">General Remarks</th>

                <th className="px-3.5 py-2.5 font-mono border-r border-border">P.O. / W.O No.</th>
                <th className="px-3.5 py-2.5 text-right font-mono border-r border-border">P.O Rate (₹)</th>
                <th className="px-4 py-2.5 border-r border-border min-w-[180px]">Note On PO</th>
                <th className="px-3.5 py-2.5 font-mono border-r border-border">P.R No</th>
                <th className="px-4 py-2.5 text-right font-mono font-black text-emerald-800 dark:text-emerald-400 border-r border-border bg-emerald-50/40">Running Available Budget (₹)</th>
                <th className="px-4 py-2.5 text-left min-w-[200px]">Line Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors align-middle">
                  {/* Delete Action Button in Edit Mode */}
                  {isEditMode && (
                    <td className="px-2 py-2 text-center border-r border-border bg-red-50/50">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-100 transition-colors"
                        title="Remove Ledger Entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}

                  {/* Head Activity */}
                  <td className="px-2 py-1 font-bold text-foreground border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.headActivity}
                        onChange={(e) => handleCellChange(row.id, 'headActivity', e.target.value)}
                        className="h-7 w-36 rounded border border-border bg-card px-2 text-xs font-bold outline-none"
                      />
                    ) : (
                      row.headActivity
                    )}
                  </td>

                  {/* Sub Activity Ledger */}
                  <td className="px-2 py-1 font-semibold text-foreground border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.subActivityLedger}
                        onChange={(e) => handleCellChange(row.id, 'subActivityLedger', e.target.value)}
                        className="h-7 w-40 rounded border border-border bg-card px-2 text-xs font-semibold outline-none"
                      />
                    ) : (
                      row.subActivityLedger
                    )}
                  </td>

                  {/* Cost Code */}
                  <td className="px-2 py-1 text-center font-mono font-black text-primary border-r border-border bg-primary/5">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.costCode}
                        onChange={(e) => handleCellChange(row.id, 'costCode', e.target.value)}
                        className="h-7 w-20 text-center rounded border border-primary/40 bg-card px-2 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      row.costCode
                    )}
                  </td>

                  {/* Item Group */}
                  <td className="px-2 py-1 border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.itemGroup}
                        onChange={(e) => handleCellChange(row.id, 'itemGroup', e.target.value)}
                        className="h-7 w-28 rounded border border-border bg-card px-2 text-xs outline-none"
                      />
                    ) : (
                      row.itemGroup
                    )}
                  </td>

                  {/* Item Desc */}
                  <td className="px-2 py-1 border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.itemDesc}
                        onChange={(e) => handleCellChange(row.id, 'itemDesc', e.target.value)}
                        className="h-7 w-48 rounded border border-border bg-card px-2 text-xs outline-none"
                      />
                    ) : (
                      <span className="whitespace-normal min-w-[200px] max-w-[280px] break-words">{row.itemDesc}</span>
                    )}
                  </td>

                  {/* Unit */}
                  <td className="px-2 py-1 text-center border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => handleCellChange(row.id, 'unit', e.target.value)}
                        className="h-7 w-16 text-center rounded border border-border bg-card px-1 text-xs outline-none"
                      />
                    ) : (
                      row.unit
                    )}
                  </td>

                  {/* Supplier Name */}
                  <td className="px-2 py-1 border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.supplierName}
                        onChange={(e) => handleCellChange(row.id, 'supplierName', e.target.value)}
                        className="h-7 w-44 rounded border border-border bg-card px-2 text-xs font-bold outline-none"
                      />
                    ) : (
                      <span className="font-bold text-foreground">{row.supplierName}</span>
                    )}
                  </td>

                  {/* Dates */}
                  <td className="px-2 py-1 text-center font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.accountingDate}
                        onChange={(e) => handleCellChange(row.id, 'accountingDate', e.target.value)}
                        className="h-7 w-24 text-center rounded border border-border bg-card px-1 text-xs font-mono outline-none"
                      />
                    ) : (
                      row.accountingDate
                    )}
                  </td>

                  <td className="px-2 py-1 text-center font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.billDateOfSupplier}
                        onChange={(e) => handleCellChange(row.id, 'billDateOfSupplier', e.target.value)}
                        className="h-7 w-24 text-center rounded border border-border bg-card px-1 text-xs font-mono outline-none"
                      />
                    ) : (
                      row.billDateOfSupplier
                    )}
                  </td>

                  {/* Bill Numbers */}
                  <td className="px-2 py-1 font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.billNo}
                        onChange={(e) => handleCellChange(row.id, 'billNo', e.target.value)}
                        className="h-7 w-32 rounded border border-border bg-card px-2 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      row.billNo
                    )}
                  </td>

                  <td className="px-2 py-1 font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.billNoOfSupplier}
                        onChange={(e) => handleCellChange(row.id, 'billNoOfSupplier', e.target.value)}
                        className="h-7 w-32 rounded border border-border bg-card px-2 text-xs font-mono outline-none"
                      />
                    ) : (
                      row.billNoOfSupplier
                    )}
                  </td>

                  {/* EDITABLE NUMERIC QUANTITIES & RATES */}
                  <td className="px-2 py-1 text-right font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.receivedQty}
                        onChange={(e) => handleCellChange(row.id, 'receivedQty', e.target.value)}
                        className="h-7 w-24 text-right rounded border border-emerald-400 bg-card px-2 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      row.receivedQty.toLocaleString('en-IN')
                    )}
                  </td>

                  <td className="px-2 py-1 text-right font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.finalBillRate}
                        onChange={(e) => handleCellChange(row.id, 'finalBillRate', e.target.value)}
                        className="h-7 w-24 text-right rounded border border-emerald-400 bg-card px-2 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      `₹${row.finalBillRate.toLocaleString('en-IN')}`
                    )}
                  </td>

                  {/* AUTO-CALCULATED ITEM AMOUNT */}
                  <td className="px-4 py-2 text-right font-mono font-bold text-foreground border-r border-border">
                    ₹{row.billItemAmt.toLocaleString('en-IN')}
                  </td>

                  {/* GST & RETENTION */}
                  <td className="px-2 py-1 text-center font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.gstRate}
                        onChange={(e) => handleCellChange(row.id, 'gstRate', e.target.value)}
                        className="h-7 w-16 text-center rounded border border-border bg-card px-1 text-xs font-mono outline-none"
                      />
                    ) : (
                      `${row.gstRate}%`
                    )}
                  </td>

                  <td className="px-2 py-1 text-right font-mono border-r border-border bg-amber-50/20">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.retentionDeduction}
                        onChange={(e) => handleCellChange(row.id, 'retentionDeduction', e.target.value)}
                        className="h-7 w-24 text-right rounded border border-amber-400 bg-card px-2 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      `₹${row.retentionDeduction.toLocaleString('en-IN')}`
                    )}
                  </td>

                  {/* FINAL BILL AMOUNT */}
                  <td className="px-4 py-2 text-right font-mono font-black text-emerald-900 dark:text-emerald-300 border-r border-border bg-emerald-50/40">
                    ₹{row.finalBillAmount.toLocaleString('en-IN')}
                  </td>

                  {/* PAYMENT STATUS DROPDOWN */}
                  <td className="px-2 py-1 text-center border-r border-border">
                    {isEditMode ? (
                      <select
                        value={row.paymentStatus}
                        onChange={(e) => handleCellChange(row.id, 'paymentStatus', e.target.value)}
                        className="h-7 rounded border border-border bg-card px-1 text-[11px] font-bold outline-none"
                      >
                        <option value="Paid">Paid</option>
                        <option value="Partially Paid">Partially Paid</option>
                        <option value="Pending Approval">Pending Approval</option>
                        <option value="On Hold">On Hold</option>
                      </select>
                    ) : (
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                        row.paymentStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : row.paymentStatus === 'Partially Paid'
                          ? 'bg-blue-100 text-blue-800'
                          : row.paymentStatus === 'Pending Approval'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {row.paymentStatus}
                      </span>
                    )}
                  </td>

                  {/* SETTLEMENT AMOUNTS */}
                  <td className="px-2 py-1 text-right font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.advancePayment}
                        onChange={(e) => handleCellChange(row.id, 'advancePayment', e.target.value)}
                        className="h-7 w-24 text-right rounded border border-border bg-card px-2 text-xs font-mono outline-none"
                      />
                    ) : (
                      `₹${row.advancePayment.toLocaleString('en-IN')}`
                    )}
                  </td>

                  <td className="px-4 py-2 text-right font-mono font-bold text-primary border-r border-border">
                    ₹{row.expectedPayment.toLocaleString('en-IN')}
                  </td>

                  <td className="px-2 py-1 text-right font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.jvPayment}
                        onChange={(e) => handleCellChange(row.id, 'jvPayment', e.target.value)}
                        className="h-7 w-20 text-right rounded border border-border bg-card px-2 text-xs font-mono outline-none"
                      />
                    ) : (
                      `₹${row.jvPayment.toLocaleString('en-IN')}`
                    )}
                  </td>

                  <td className="px-2 py-1 border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={(e) => handleCellChange(row.id, 'remarks', e.target.value)}
                        className="h-7 w-40 rounded border border-border bg-card px-2 text-xs outline-none"
                      />
                    ) : (
                      <span className="text-muted-foreground text-[11px]">{row.remarks}</span>
                    )}
                  </td>

                  {/* PO DETAILS */}
                  <td className="px-2 py-1 font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.poWoNo}
                        onChange={(e) => handleCellChange(row.id, 'poWoNo', e.target.value)}
                        className="h-7 w-32 rounded border border-border bg-card px-2 text-xs font-mono font-bold outline-none"
                      />
                    ) : (
                      <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">{row.poWoNo}</span>
                    )}
                  </td>

                  <td className="px-2 py-1 text-right font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={row.poWoRate}
                        onChange={(e) => handleCellChange(row.id, 'poWoRate', e.target.value)}
                        className="h-7 w-20 text-right rounded border border-border bg-card px-2 text-xs font-mono outline-none"
                      />
                    ) : (
                      `₹${row.poWoRate.toLocaleString('en-IN')}`
                    )}
                  </td>

                  <td className="px-2 py-1 border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.noteOnPo}
                        onChange={(e) => handleCellChange(row.id, 'noteOnPo', e.target.value)}
                        className="h-7 w-40 rounded border border-border bg-card px-2 text-xs outline-none"
                      />
                    ) : (
                      <span className="text-muted-foreground text-[11px]">{row.noteOnPo}</span>
                    )}
                  </td>

                  <td className="px-2 py-1 font-mono border-r border-border">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.prNo}
                        onChange={(e) => handleCellChange(row.id, 'prNo', e.target.value)}
                        className="h-7 w-28 rounded border border-border bg-card px-2 text-xs font-mono outline-none"
                      />
                    ) : (
                      row.prNo
                    )}
                  </td>

                  {/* RUNNING BUDGET */}
                  <td className="px-4 py-2 text-right font-mono font-black text-emerald-800 dark:text-emerald-400 border-r border-border bg-emerald-50/20">
                    ₹{row.runningAvailableBudget.toLocaleString('en-IN')}
                  </td>

                  <td className="px-2 py-1">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={row.lineRemarks}
                        onChange={(e) => handleCellChange(row.id, 'lineRemarks', e.target.value)}
                        className="h-7 w-40 rounded border border-border bg-card px-2 text-xs outline-none"
                      />
                    ) : (
                      <span className="text-muted-foreground text-[11px]">{row.lineRemarks}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EXCEL IMPORTER MODAL FOR LEDGER */}
      {showUploadModal && (
        <ExcelImporterModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onImportSuccess={() => {
            alert('Ledger Excel sheet imported & synced to Backend Database successfully!');
            setShowUploadModal(false);
          }}
        />
      )}

      {/* UNSAVED LEDGER CHANGES CONFIRMATION POPUP MODAL */}
      {showUnsavedConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/50">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">Unsaved Ledger Edits Detected</h3>
                <p className="text-xs text-muted-foreground mt-0.5">You have modified ledger rows or amounts. Save changes before exiting?</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              Edits will only apply when you click <strong>Save Ledger Changes</strong>.
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveEdits}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <Save className="h-4 w-4" /> Save Ledger Changes
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
