// Unified Finance Cockpit dashboard.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Download,
  FileClock,
  FileText,
  Info,
  Layers3,
  LayoutDashboard,
  Plus,
  ReceiptIndianRupee,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import { approveVendorBill, listBillingDashboard, verifyVendorBill } from '@/lib/billing';
import {
  approveBudgetRevision,
  createBudgetAllocation,
  listBudgetDashboard,
  resolveBudgetAlert,
  reviseBudgetAllocation,
  type BudgetAllocationRow,
  type BudgetLedgerRow,
  type BudgetAlertRow,
} from '@/lib/budget';
import {
  listFinanceOverview,
  listPayments,
  listVendorOutstanding,
  recordVendorPayment,
  type FinanceOverviewData,
  type PaymentRow,
  type VendorOutstandingRow,
} from '@/lib/finance';
import type { VendorBillRow } from '@/lib/procurement';
import BudgetCashFlowChart from '@/components/budget-cash-flow-chart';

type TabType = 'overview' | 'billing' | 'budget' | 'payments' | 'outstanding' | 'analytics' | 'alerts';

const emptyOverview: FinanceOverviewData = {
  totalBilled: 0,
  approvedSpend: 0,
  paidSpend: 0,
  outstandingSpend: 0,
  billsCount: 0,
  pendingBillsCount: 0,
  alertsCount: 0,
  budgetSummaries: [],
  monthlySpend: [],
};

const emptyBills: VendorBillRow[] = [];
const emptyPayments: PaymentRow[] = [];
const emptyOutstanding: VendorOutstandingRow[] = [];

export default function FinanceDashboard() {
  const { projects, activeProjectId, activeRole } = useAppStore();
  const liveMode = isLiveSupabase();
  const canManageFinance = activeRole === 'UPPER_MANAGEMENT';
  const isBillingAdmin = activeRole === 'UPPER_MANAGEMENT';

  // Selection states
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || projects[0]?.id || '');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  
  // Loaded states
  const [overview, setOverview] = useState<FinanceOverviewData>(emptyOverview);
  const [bills, setBills] = useState<VendorBillRow[]>(emptyBills);
  const [payments, setPayments] = useState<PaymentRow[]>(emptyPayments);
  const [outstanding, setOutstanding] = useState<VendorOutstandingRow[]>(emptyOutstanding);

  // Budget Desk States
  const [budgetDashboard, setBudgetDashboard] = useState<any>({ summaries: [], allocations: [], ledger: [], alerts: [] });
  const [selectedAllocationId, setSelectedAllocationId] = useState('');

  // Recording Payment Forms State
  const [selectedBillForPay, setSelectedBillForPay] = useState<VendorBillRow | null>(null);
  const [payReference, setPayReference] = useState('');
  const [payMode, setPayMode] = useState('Bank Transfer');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payRemarks, setPayRemarks] = useState('');

  // Budget Allocation Form States
  const [allocationName, setAllocationName] = useState('');
  const [budgetHeadName, setBudgetHeadName] = useState('');
  const [budgetHeadCode, setBudgetHeadCode] = useState('');
  const [costCode, setCostCode] = useState('');
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [warningThreshold, setWarningThreshold] = useState('80');
  const [hardLimit, setHardLimit] = useState('100');
  const [draftMode, setDraftMode] = useState(false);

  // Budget Revision Form States
  const [revisionAmount, setRevisionAmount] = useState('');
  const [revisionRemarks, setRevisionRemarks] = useState('');

  // Bill Inspection Modal
  const [inspectedBill, setInspectedBill] = useState<VendorBillRow | null>(null);

  // UI state messages
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      const pid = selectedProjectId || undefined;
      const [overviewData, billingData, paymentsData, APData, budgetData] = await Promise.all([
        listFinanceOverview(pid),
        listBillingDashboard(pid),
        listPayments(pid),
        listVendorOutstanding(pid),
        listBudgetDashboard(pid),
      ]);
      setOverview(overviewData);
      setBills(billingData.vendorBills);
      setPayments(paymentsData);
      setOutstanding(APData);
      setBudgetDashboard(budgetData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load finance dashboard.');
    } finally {
      setLoading(false);
    }
  }, [liveMode, selectedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshData]);

  const runAction = async (successMsg: string, action: () => Promise<{ error: Error | null }>) => {
    setMessage(null);
    setError(null);
    const result = await action();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMessage(successMsg);
    await refreshData();
  };

  // Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillForPay) {
      setError('Please select an approved bill to record payment.');
      return;
    }
    if (!payReference.trim()) {
      setError('Payment transaction reference is required.');
      return;
    }

    await runAction('Payment successfully logged in ledger.', () =>
      recordVendorPayment({
        billId: selectedBillForPay.id,
        reference: payReference.trim(),
        amount: Number(selectedBillForPay.total_amount),
        mode: payMode,
        date: payDate,
        remarks: payRemarks.trim(),
      }),
    );

    setSelectedBillForPay(null);
    setPayReference('');
    setPayRemarks('');
  };

  // Create Budget Allocation
  const handleCreateAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(allocatedAmount || 0);
    if (!selectedProjectId || amount <= 0 || !allocationName.trim() || !budgetHeadName.trim()) {
      setError('Project, allocation name, budget head, and amount are required.');
      return;
    }

    await runAction('Budget allocation created.', () =>
      createBudgetAllocation({
        projectId: selectedProjectId,
        allocationName: allocationName.trim(),
        allocatedAmount: amount,
        budgetHeadName: budgetHeadName.trim(),
        budgetHeadCode: budgetHeadCode.trim(),
        costCode: costCode.trim(),
        costCodeName: budgetHeadName.trim(),
        warningThresholdPercent: Number(warningThreshold) || 80,
        hardLimitPercent: Number(hardLimit) || 100,
        status: draftMode ? 'draft' : 'approved',
      }),
    );

    setAllocationName('');
    setBudgetHeadName('');
    setBudgetHeadCode('');
    setCostCode('');
    setAllocatedAmount('');
  };

  // Revise Budget Allocation
  const handleReviseAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const allocation = budgetDashboard.allocations.find((a: any) => a.id === selectedAllocationId);
    if (!allocation) {
      setError('Select an allocation to revise.');
      return;
    }
    const amount = Number(revisionAmount || 0);
    if (amount < 0) {
      setError('Revised allocation cannot be negative.');
      return;
    }

    await runAction('Budget revision posted to ledger.', () =>
      reviseBudgetAllocation({
        allocationId: allocation.id,
        newAllocatedAmount: amount,
        remarks: revisionRemarks.trim(),
      }),
    );
    setRevisionAmount('');
    setRevisionRemarks('');
  };

  // Export current bill desk data to CSV format
  const exportToCSV = () => {
    const headers = ['Bill Number', 'Vendor', 'Billed Date', 'PO Linked', 'GRN Linked', 'Duplicate', 'Total Amount', 'Status', 'Payment Status'];
    const rows = bills.map((b) => [
      b.bill_number,
      b.vendors?.display_name || b.vendors?.legal_name || 'Vendor',
      b.bill_date,
      b.purchase_order_id ? 'Linked' : 'Missing',
      b.grn_id ? 'Linked' : 'Missing',
      b.duplicate_detected ? 'Yes' : 'No',
      b.total_amount,
      b.status,
      b.payment_status,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Finance_Bills_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter components
  const approvedBillsForPayment = useMemo(() => {
    return bills.filter((b) => b.status === 'approved' && b.payment_status !== 'paid');
  }, [bills]);

  const activeAlerts = useMemo(() => {
    return budgetDashboard.alerts;
  }, [budgetDashboard.alerts]);

  // Analytics helper calculations
  const analyticsBudgetChartData = useMemo(() => {
    return overview.budgetSummaries.map((s) => ({
      name: s.projectName.split(' ')[0],
      Allocated: s.allocated / 100000,
      Committed: s.committed / 100000,
      Spent: s.spent / 100000,
    }));
  }, [overview.budgetSummaries]);

  const vendorOutstandingChartData = useMemo(() => {
    return outstanding.slice(0, 5).map((v) => ({
      name: v.vendorName.split(' ')[0],
      Outstanding: v.totalOutstanding / 100000,
      Paid: v.totalPaid / 100000,
    }));
  }, [outstanding]);

  const COLORS = ['#b68d40', '#059669', '#3b82f6', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-5">
      {/* Header Cockpit */}
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30 animate-pulse">
            Finance Dashboard
          </span>
          <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-gray-950 dark:text-white">
            Financial Control Center
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            A unified cockpit to manage budgets, vendor bill compliance matching, payments ledger recording, accounts payable aging, and cost analytics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedAllocationId('');
            }}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold outline-none transition-all focus:border-primary"
          >
            <option value="">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refreshData}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-all hover:text-foreground disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </header>

      {/* Message Notifications */}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs font-semibold text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">{error}</div>}

      {/* Stats Quick Metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total Billed" value={formatIndianCurrency(overview.totalBilled)} sub="Total invoices submitted" icon={ReceiptIndianRupee} color="purple" />
        <MetricCard label="Approved Spend" value={formatIndianCurrency(overview.approvedSpend)} sub="Verified & approved liabilities" icon={ShieldCheck} color="emerald" />
        <MetricCard label="Payments Outflow" value={formatIndianCurrency(overview.paidSpend)} sub="Disbursed transaction volume" icon={CircleDollarSign} color="orange" />
        <MetricCard label="Vendor Outstanding" value={formatIndianCurrency(overview.outstandingSpend)} sub="Accounts payable aging total" icon={AlertTriangle} color="danger" />
      </section>

      {/* Cockpit Navigation Tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-1.5 scrollbar-none">
        {[
          { tab: 'overview', label: 'Overview', icon: LayoutDashboard },
          { tab: 'billing', label: 'Billing Desk', icon: FileText },
          { tab: 'budget', label: 'Budget Control', icon: ClipboardCheck },
          { tab: 'payments', label: 'Payments Workflow', icon: CircleDollarSign },
          { tab: 'outstanding', label: 'Vendor AP Aging', icon: ReceiptIndianRupee },
          { tab: 'analytics', label: 'Cost Analytics', icon: TrendingUp },
          { tab: 'alerts', label: 'Threshold Alerts', icon: AlertTriangle },
        ].map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab as TabType)}
            className={`flex items-center gap-1.5 h-10 whitespace-nowrap rounded-lg px-3.5 text-xs font-bold uppercase transition-all duration-200 ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground shadow-sm scale-[1.02]'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* TAB CONTENTS */}

      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Main overview flow */}
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase text-gray-400 mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Disbursement & Cash-Flow Trend
              </h2>
              <div className="h-[280px] w-full">
                <BudgetCashFlowChart
                  totalSpend={overview.paidSpend}
                  ledger={budgetDashboard.ledger}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase text-gray-400 mb-3 flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-primary" />
                Project Allocation Standings
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-gray-400">
                      <th className="pb-2">Project</th>
                      <th className="pb-2 text-right">Allocated</th>
                      <th className="pb-2 text-right">Committed</th>
                      <th className="pb-2 text-right">Spent</th>
                      <th className="pb-2 text-right">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {overview.budgetSummaries.map((item) => (
                      <tr key={item.projectId} className="hover:bg-muted/10">
                        <td className="py-2.5 font-semibold text-gray-900 dark:text-white">{item.projectName}</td>
                        <td className="py-2.5 text-right font-bold">{formatIndianCurrency(item.allocated)}</td>
                        <td className="py-2.5 text-right text-amber-600">{formatIndianCurrency(item.committed)}</td>
                        <td className="py-2.5 text-right text-red-500 font-bold">{formatIndianCurrency(item.spent)}</td>
                        <td className="py-2.5 text-right text-emerald-600 font-bold">{formatIndianCurrency(item.available)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right quick review widget */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between h-full">
              <div>
                <h2 className="text-sm font-bold uppercase text-gray-400 mb-3">Finance Desk Status</h2>
                <div className="space-y-2.5">
                  <StatusRow label="Pending Verified Bills" count={bills.filter((b) => b.status === 'verified').length} color="amber" />
                  <StatusRow label="Submitted/Open Bills" count={bills.filter((b) => b.status === 'submitted').length} color="blue" />
                  <StatusRow label="Blocked Duplicate Checks" count={bills.filter((b) => b.duplicate_detected).length} color="danger" />
                  <StatusRow label="Budget Alerts Raised" count={overview.alertsCount} color="warning" />
                </div>
              </div>
              <div className="border-t border-border mt-4 pt-3 text-center">
                <button
                  onClick={() => setActiveTab('billing')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline hover:scale-102 transition-all"
                >
                  Inspect Vendor Invoices <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BILLING DESK TAB */}
      {activeTab === 'billing' && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold">Vendor Bill Verification Desk</h2>
            </div>
            <button
              onClick={exportToCSV}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="pb-3">Bill Number</th>
                  <th className="pb-3">Vendor</th>
                  <th className="pb-3">Invoice Amount</th>
                  <th className="pb-3">Bill Date</th>
                  <th className="pb-3 text-center">Linked PO/GRN</th>
                  <th className="pb-3 text-center">QA/QC Passed</th>
                  <th className="pb-3 text-center">Duplicate Check</th>
                  <th className="pb-3 text-center">Three-Way Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {bills.map((bill) => {
                  const match = bill.three_way_matches?.[0];
                  return (
                    <tr
                      key={bill.id}
                      onClick={() => setInspectedBill(bill)}
                      className="hover:bg-muted/30 cursor-pointer transition-all"
                    >
                      <td className="py-3.5 font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        {bill.bill_number}
                        {bill.status === 'blocked' && (
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                        )}
                      </td>
                      <td className="py-3.5 font-medium text-gray-500 dark:text-gray-400">
                        {bill.vendors?.display_name || bill.vendors?.legal_name || 'Vendor'}
                      </td>
                      <td className="py-3.5 font-bold text-gray-900 dark:text-white">
                        {formatIndianCurrency(Number(bill.total_amount || 0))}
                      </td>
                      <td className="py-3.5 text-gray-500 font-semibold">{bill.bill_date}</td>
                      <td className="py-3.5 text-center">
                        {bill.purchase_order_id && bill.grn_id ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                            Linked
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
                            Partial
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-center">
                        {bill.qc_approval_verified ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/20 dark:text-red-300">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-center">
                        {bill.duplicate_detected ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            DUPLICATE
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-center">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            bill.status === 'approved' || bill.status === 'paid'
                              ? 'border-emerald-250 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300'
                              : bill.status === 'blocked'
                                ? 'border-red-250 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300'
                                : 'border-amber-250 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300'
                          }`}
                        >
                          {bill.status}
                        </span>
                        {match && (
                          <div className="text-[9px] text-gray-400 mt-0.5">Match: {match.match_status.replaceAll('_', ' ')}</div>
                        )}
                      </td>
                      <td className="py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              runAction('Bill verification completed successfully.', () => verifyVendorBill(bill.id))
                            }
                            disabled={!isBillingAdmin || bill.status !== 'submitted'}
                            className="rounded-md border border-border px-2.5 py-1.5 font-bold hover:bg-muted disabled:opacity-40 transition-colors"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              runAction('Bill approved & baseline ledger budget updated.', () => approveVendorBill(bill.id))
                            }
                            disabled={activeRole !== 'UPPER_MANAGEMENT' || bill.status !== 'verified'}
                            className="rounded-md bg-primary px-2.5 py-1.5 font-bold text-primary-foreground hover:bg-[#967332] disabled:opacity-40 transition-colors"
                          >
                            Approve
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {bills.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-background p-12 text-center text-sm font-semibold text-muted-foreground">
              No bills found. Create a vendor bill by posting a goods receipt note (GRN).
            </div>
          )}
        </section>
      )}

      {/* 3. BUDGET CONTROL TAB */}
      {activeTab === 'budget' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <section className="xl:col-span-8 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Layers3 className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Budget Allocations</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px]">
                      <th className="pb-2">Allocation Name</th>
                      <th className="pb-2">Cost Code</th>
                      <th className="pb-2 text-right">Approved Limit</th>
                      <th className="pb-2 text-right">Committed</th>
                      <th className="pb-2 text-right">Actual Spent</th>
                      <th className="pb-2 text-right">Remaining</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {budgetDashboard.allocations.map((a: BudgetAllocationRow) => {
                      const spendRatio = a.allocated_amount > 0 ? ((a.committed_amount + a.spent_amount) / a.allocated_amount) * 100 : 0;
                      return (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedAllocationId(a.id)}
                          className={`cursor-pointer hover:bg-muted/20 ${selectedAllocationId === a.id ? 'bg-orange-50/50 dark:bg-orange-950/10' : ''}`}
                        >
                          <td className="py-3 font-semibold text-gray-900 dark:text-white">
                            {a.allocation_name}
                            <div className="text-[10px] text-gray-400 font-normal">{a.budget_heads?.name}</div>
                          </td>
                          <td className="py-3 text-gray-500 font-semibold">{a.budget_heads?.cost_codes?.code || a.budget_heads?.code || '-'}</td>
                          <td className="py-3 text-right font-bold">{formatIndianCurrency(a.allocated_amount)}</td>
                          <td className="py-3 text-right text-amber-600 font-semibold">{formatIndianCurrency(a.committed_amount)}</td>
                          <td className="py-3 text-right text-red-500 font-bold">{formatIndianCurrency(a.spent_amount)}</td>
                          <td className="py-3 text-right text-emerald-600 font-bold">
                            {formatIndianCurrency(Math.max(0, a.allocated_amount - a.committed_amount - a.spent_amount))}
                          </td>
                          <td className="py-3">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                                a.status === 'approved'
                                  ? 'border-emerald-250 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-250 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {budgetDashboard.allocations.length === 0 && (
                <div className="text-center p-8 text-sm text-muted-foreground font-semibold">No active budget allocations found.</div>
              )}
            </section>

            <section className="xl:col-span-4 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Create Allocation</h2>
              </div>
              <form onSubmit={handleCreateAllocation} className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Allocation Name</label>
                  <input
                    type="text"
                    value={allocationName}
                    onChange={(e) => setAllocationName(e.target.value)}
                    placeholder="Tower B structural steel package"
                    disabled={!canManageFinance}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Budget Head & Cost Code</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={budgetHeadName}
                      onChange={(e) => setBudgetHeadName(e.target.value)}
                      placeholder="Structural Works"
                      disabled={!canManageFinance}
                      className="h-10 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={costCode}
                      onChange={(e) => setCostCode(e.target.value)}
                      placeholder="COST-004"
                      disabled={!canManageFinance}
                      className="h-10 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Approved Limit (INR)</label>
                    <input
                      type="number"
                      value={allocatedAmount}
                      onChange={(e) => setAllocatedAmount(e.target.value)}
                      placeholder="4500000"
                      disabled={!canManageFinance}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Warning % / Hard %</label>
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        value={warningThreshold}
                        onChange={(e) => setWarningThreshold(e.target.value)}
                        placeholder="80"
                        disabled={!canManageFinance}
                        className="h-10 rounded-lg border border-border bg-background px-2 text-xs text-center outline-none focus:border-primary disabled:opacity-50"
                      />
                      <input
                        type="number"
                        value={hardLimit}
                        onChange={(e) => setHardLimit(e.target.value)}
                        placeholder="100"
                        disabled={!canManageFinance}
                        className="h-10 rounded-lg border border-border bg-background px-2 text-xs text-center outline-none focus:border-primary disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={draftMode}
                    onChange={(e) => setDraftMode(e.target.checked)}
                    disabled={!canManageFinance}
                    className="rounded border-border focus:ring-primary"
                  />
                  Save as draft awaiting verification
                </label>
                <button
                  type="submit"
                  disabled={!canManageFinance}
                  className="h-10 w-full rounded-lg bg-primary font-bold text-xs text-primary-foreground hover:bg-[#967332] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Create Baseline Allocation
                </button>
              </form>
            </section>
          </div>

          {/* Budget Ledger Transactions and Revision Controls */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <section className="xl:col-span-8 rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <FileClock className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Allocations ledger trail</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px]">
                      <th className="pb-2">Posted At</th>
                      <th className="pb-2">Allocation ID</th>
                      <th className="pb-2">Transaction Type</th>
                      <th className="pb-2">Source Reference</th>
                      <th className="pb-2 text-right">Adjustment Amount</th>
                      <th className="pb-2">Log Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {budgetDashboard.ledger.map((l: BudgetLedgerRow) => (
                      <tr key={l.id} className="hover:bg-muted/10">
                        <td className="py-2 text-gray-500 font-semibold">{new Date(l.posted_at).toLocaleDateString('en-IN')}</td>
                        <td className="py-2 font-bold text-gray-900 dark:text-white">
                          {l.budget_allocations?.allocation_name || l.budget_allocation_id}
                        </td>
                        <td className="py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                              l.transaction_type === 'actual'
                                ? 'bg-red-50 text-red-700'
                                : l.transaction_type === 'commitment'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {l.transaction_type}
                          </span>
                        </td>
                        <td className="py-2 font-semibold text-gray-500">{l.source_table || 'Manual'}</td>
                        <td className="py-2 text-right font-bold">{formatIndianCurrency(l.amount)}</td>
                        <td className="py-2 text-gray-400 font-semibold">{l.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {budgetDashboard.ledger.length === 0 && (
                <div className="text-center p-8 text-sm text-muted-foreground font-semibold">No ledger postings logged yet.</div>
              )}
            </section>

            <section className="xl:col-span-4 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <FileClock className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Post Revision</h2>
              </div>
              <form onSubmit={handleReviseAllocation} className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Target Allocation</label>
                  <select
                    value={selectedAllocationId}
                    onChange={(e) => setSelectedAllocationId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                  >
                    <option value="">-- Choose Allocation --</option>
                    {budgetDashboard.allocations.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.allocation_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">New Allocation Total (INR)</label>
                  <input
                    type="number"
                    value={revisionAmount}
                    onChange={(e) => setRevisionAmount(e.target.value)}
                    placeholder="5000000"
                    disabled={!canManageFinance || !selectedAllocationId}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Adjustment Remarks</label>
                  <textarea
                    value={revisionRemarks}
                    onChange={(e) => setRevisionRemarks(e.target.value)}
                    placeholder="Revise limit due to steel price appreciation..."
                    disabled={!canManageFinance || !selectedAllocationId}
                    className="w-full min-h-[70px] rounded-lg border border-border bg-background p-3 text-xs outline-none focus:border-primary disabled:opacity-50 resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canManageFinance || !selectedAllocationId}
                  className="h-10 w-full rounded-lg bg-primary font-bold text-xs text-primary-foreground hover:bg-[#967332] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Authorize Allocation Revision
                </button>
              </form>
            </section>
          </div>
        </div>
      )}

      {/* 4. PAYMENTS WORKFLOW TAB */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Left: Approved Bills list */}
            <section className="xl:col-span-7 rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h2 className="font-heading text-lg font-semibold">Approved Bills Awaiting Payment</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[500px]">
                  <thead>
                    <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="pb-2">Bill No</th>
                      <th className="pb-2">Vendor</th>
                      <th className="pb-2 text-right">Bill Value</th>
                      <th className="pb-2">Verification Gate</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {approvedBillsForPayment.map((bill) => (
                      <tr
                        key={bill.id}
                        onClick={() => setSelectedBillForPay(bill)}
                        className={`cursor-pointer hover:bg-muted/20 ${selectedBillForPay?.id === bill.id ? 'bg-orange-50/50 dark:bg-orange-950/10' : ''}`}
                      >
                        <td className="py-2.5 font-bold text-gray-900 dark:text-white">{bill.bill_number}</td>
                        <td className="py-2.5 text-gray-500 font-semibold">
                          {bill.vendors?.display_name || bill.vendors?.legal_name || 'Vendor'}
                        </td>
                        <td className="py-2.5 text-right font-bold text-gray-900 dark:text-white">
                          {formatIndianCurrency(Number(bill.total_amount))}
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300 uppercase">
                            Approved
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBillForPay(bill);
                            }}
                            className="rounded bg-primary px-2.5 py-1 text-[10px] font-extrabold text-primary-foreground hover:bg-[#967332]"
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {approvedBillsForPayment.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground font-semibold">
                  No approved bills awaiting payout. Verify and approve bills first.
                </div>
              )}
            </section>

            {/* Right: Record payment form */}
            <section className="xl:col-span-5 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <ReceiptIndianRupee className="h-5 w-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Record Payment Details</h2>
              </div>
              {selectedBillForPay ? (
                <form onSubmit={handleRecordPayment} className="space-y-3">
                  <div className="rounded-lg bg-muted/40 p-3 border border-border space-y-1">
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Bill selected</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center justify-between">
                      <span>{selectedBillForPay.bill_number}</span>
                      <span>{formatIndianCurrency(Number(selectedBillForPay.total_amount))}</span>
                    </div>
                    <div className="text-xs text-gray-500 font-semibold">
                      Vendor: {selectedBillForPay.vendors?.display_name || selectedBillForPay.vendors?.legal_name}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Transaction reference no</label>
                    <input
                      type="text"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="UTR-26880193 / CHQ-104992"
                      disabled={!canManageFinance}
                      className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Disbursement date</label>
                      <input
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        disabled={!canManageFinance}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Payment instrument / mode</label>
                      <select
                        value={payMode}
                        onChange={(e) => setPayMode(e.target.value)}
                        disabled={!canManageFinance}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                      >
                        <option value="Bank Transfer">Bank Transfer / NEFT</option>
                        <option value="RTGS Transfer">RTGS Transfer</option>
                        <option value="UPI Pay">UPI Transfer</option>
                        <option value="Cheque">Bank Cheque</option>
                        <option value="Cash">Cash Ledger</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-450 block mb-1">Disbursement Remarks</label>
                    <textarea
                      value={payRemarks}
                      onChange={(e) => setPayRemarks(e.target.value)}
                      placeholder="RA bill settlement transaction confirmed."
                      disabled={!canManageFinance}
                      className="w-full min-h-[60px] rounded-lg border border-border bg-background p-3 text-xs outline-none focus:border-primary resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBillForPay(null)}
                      className="h-10 flex-1 rounded-lg border border-border bg-background font-bold text-xs hover:bg-muted transition-colors cursor-pointer text-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!canManageFinance}
                      className="h-10 flex-1 rounded-lg bg-primary font-bold text-xs text-primary-foreground hover:bg-[#967332] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      Record payout
                    </button>
                  </div>
                </form>
              ) : (
                <div className="h-[280px] rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-center text-xs text-muted-foreground p-8">
                  <Info className="h-6 w-6 text-gray-300 mb-2" />
                  Select an approved bill from the left list to record and post its payment transaction details.
                </div>
              )}
            </section>
          </div>

          {/* Historical recorded payments log */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold">Recorded Payments Ledger</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[700px]">
                <thead>
                  <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="pb-2">Payment Date</th>
                    <th className="pb-2">Vendor Name</th>
                    <th className="pb-2">Bill Ref</th>
                    <th className="pb-2">Transaction Ref</th>
                    <th className="pb-2 text-right">Settled Amount</th>
                    <th className="pb-2">Mode</th>
                    <th className="pb-2">Clearing Status</th>
                    <th className="pb-2">Instrument Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/10">
                      <td className="py-2.5 text-gray-500 font-semibold">
                        {p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-IN') : '-'}
                      </td>
                      <td className="py-2.5 font-bold text-gray-900 dark:text-white">
                        {p.vendor_bills?.vendors?.display_name || p.vendor_bills?.vendors?.legal_name || 'Vendor'}
                      </td>
                      <td className="py-2.5 text-gray-500 font-semibold">{p.vendor_bills?.bill_number || '-'}</td>
                      <td className="py-2.5 font-bold text-gray-955 dark:text-gray-100">{p.payment_reference}</td>
                      <td className="py-2.5 text-right font-extrabold text-gray-900 dark:text-white">{formatIndianCurrency(Number(p.amount))}</td>
                      <td className="py-2.5 text-gray-500 font-semibold">{p.payment_mode}</td>
                      <td className="py-2.5">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300 uppercase">
                          {p.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-400 font-semibold">{p.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payments.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground font-semibold">No recorded payments found.</div>
            )}
          </section>
        </div>
      )}

      {/* 5. VENDOR AP AGING TAB */}
      {activeTab === 'outstanding' && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <ReceiptIndianRupee className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold">Accounts Payable (AP) Vendor Aging Summary</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[860px]">
              <thead>
                <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="pb-3">Vendor</th>
                  <th className="pb-3 text-right">Total Billed</th>
                  <th className="pb-3 text-right">Total Paid</th>
                  <th className="pb-3 text-right">Outstanding Balance</th>
                  <th className="pb-3 text-right">0-30 Days</th>
                  <th className="pb-3 text-right">31-60 Days</th>
                  <th className="pb-3 text-right">61-90 Days</th>
                  <th className="pb-3 text-right">90+ Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {outstanding.map((row) => (
                  <tr key={row.vendorId} className="hover:bg-muted/10">
                    <td className="py-3 font-semibold text-gray-900 dark:text-white">{row.vendorName}</td>
                    <td className="py-3 text-right font-bold text-gray-500">{formatIndianCurrency(row.totalBilled)}</td>
                    <td className="py-3 text-right font-bold text-emerald-600">{formatIndianCurrency(row.totalPaid)}</td>
                    <td className="py-3 text-right font-extrabold text-red-500">{formatIndianCurrency(row.totalOutstanding)}</td>
                    <td className="py-3 text-right text-gray-700 dark:text-gray-300 font-semibold">{formatIndianCurrency(row.aging0to30)}</td>
                    <td className="py-3 text-right text-gray-700 dark:text-gray-300 font-semibold">{formatIndianCurrency(row.aging31to60)}</td>
                    <td className="py-3 text-right text-gray-700 dark:text-gray-300 font-semibold">{formatIndianCurrency(row.aging61to90)}</td>
                    <td className="py-3 text-right text-gray-700 dark:text-gray-300 font-semibold">{formatIndianCurrency(row.aging90plus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {outstanding.length === 0 && (
            <div className="text-center p-8 text-sm text-muted-foreground font-semibold">No AP liabilities recorded.</div>
          )}
        </section>
      )}

      {/* 6. COST ANALYTICS TAB */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Chart 1: Project Allocation summary */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase text-gray-400">Project Allocation Burn (Lakhs)</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsBudgetChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => [`INR ${value} L`]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Allocated" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Committed" fill="#eab308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spent" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: AP Liability Breakdown */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase text-gray-400">Vendor Liability Outstanding (Lakhs)</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendorOutstandingChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => [`INR ${value} L`]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Outstanding" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 7. ALERTS TAB */}
      {activeTab === 'alerts' && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-lg font-semibold">Budget Threshold Breaches</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[700px]">
              <thead>
                <tr className="border-b border-border text-gray-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="pb-3">Alert Details</th>
                  <th className="pb-3">Allocation</th>
                  <th className="pb-3 text-right">Trigger %</th>
                  <th className="pb-3 text-right">Current Spend %</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {activeAlerts.map((alert: BudgetAlertRow) => (
                  <tr key={alert.id} className="hover:bg-muted/10">
                    <td className="py-3">
                      <p className="font-bold capitalize">{alert.alert_type.replaceAll('_', ' ')}</p>
                      <p className="text-gray-400 font-semibold">{alert.message}</p>
                    </td>
                    <td className="py-3 font-semibold text-gray-900 dark:text-white">
                      {alert.budget_allocations?.allocation_name || '-'}
                    </td>
                    <td className="py-3 text-right font-semibold">{alert.threshold_percent?.toFixed(0)}%</td>
                    <td className="py-3 text-right font-extrabold text-red-500">{alert.actual_percent?.toFixed(1)}%</td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                          alert.status === 'pending'
                            ? 'border-red-250 bg-red-50 text-red-700'
                            : 'border-emerald-250 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {alert.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={!canManageFinance || alert.status !== 'pending'}
                          onClick={() => runAction('Alert resolved and marked resolved.', () => resolveBudgetAlert(alert.id, 'closed'))}
                          className="rounded border border-border px-2.5 py-1.5 font-bold hover:bg-muted disabled:opacity-40"
                        >
                          Acknowledge
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {activeAlerts.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-background p-12 text-center text-sm font-semibold text-muted-foreground">
              No active budget overrun alert flags. Limits are within acceptable parameters.
            </div>
          )}
        </section>
      )}

      {/* DETAILED INSPECTION MODAL FOR 3-WAY MATCH & compliance gates */}
      {inspectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl shadow-xl border border-border p-5 relative max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="font-heading text-lg font-bold text-gray-900 dark:text-white flex items-center justify-between border-b border-border pb-2.5">
              <span>Inspect Vendor Bill: {inspectedBill.bill_number}</span>
              <button
                onClick={() => setInspectedBill(null)}
                className="h-7 w-7 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                ×
              </button>
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Vendor</span>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {inspectedBill.vendors?.legal_name || 'Vendor Name'}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Bill Date</span>
                <p className="font-semibold text-gray-900 dark:text-white">{inspectedBill.bill_date}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Total Billed</span>
                <p className="font-bold text-gray-900 dark:text-white">
                  {formatIndianCurrency(Number(inspectedBill.total_amount))}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Bill Book No</span>
                <p className="font-semibold text-gray-900 dark:text-white">{inspectedBill.bill_book_number || '-'}</p>
              </div>
            </div>

            {/* Compliance verification gates list */}
            <div className="space-y-2 border-t border-border pt-3">
              <h4 className="text-[10px] font-bold uppercase text-gray-450 tracking-wider">Compliance Gates Check</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <GateCheckPill label="PO Mapped" passed={!!inspectedBill.purchase_order_id} />
                <GateCheckPill label="GRN Posted" passed={!!inspectedBill.grn_id} />
                <GateCheckPill label="Duplicate Documents Check" passed={!inspectedBill.duplicate_detected} />
                <GateCheckPill label="Required Docs Received" passed={inspectedBill.required_documents_received} />
                <GateCheckPill label="QA/QC Passed" passed={inspectedBill.qc_approval_verified} />
                <GateCheckPill label="Work Completion Verified" passed={inspectedBill.work_completion_verified} />
              </div>
            </div>

            {/* Three way match details */}
            {inspectedBill.three_way_matches?.[0] && (
              <div className="rounded-xl bg-muted/40 border border-border p-3 space-y-2.5">
                <div className="text-[10px] font-bold uppercase text-muted-foreground flex items-center justify-between">
                  <span>Three-Way Match Verification</span>
                  <span className="font-extrabold text-primary">
                    {inspectedBill.three_way_matches[0].match_status.replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                  <div className="rounded border border-border bg-card p-1">
                    <div className="text-[8px] font-bold text-gray-400 uppercase">PO Amount</div>
                    <div className="font-bold text-gray-800 dark:text-gray-200">
                      {formatIndianCurrency(inspectedBill.three_way_matches[0].po_value)}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-card p-1">
                    <div className="text-[8px] font-bold text-gray-400 uppercase">GRN Value</div>
                    <div className="font-bold text-gray-800 dark:text-gray-200">
                      {formatIndianCurrency(inspectedBill.three_way_matches[0].grn_value)}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-card p-1">
                    <div className="text-[8px] font-bold text-gray-400 uppercase">Invoice Value</div>
                    <div className="font-bold text-gray-850 dark:text-gray-50">
                      {formatIndianCurrency(inspectedBill.three_way_matches[0].invoice_value)}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 font-semibold italic">Remarks: {inspectedBill.three_way_matches[0].remarks}</p>
              </div>
            )}

            {/* RLS/Trigger blocked explanation */}
            {inspectedBill.status === 'blocked' && (
              <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-[11px] text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <XCircle className="h-4 w-4" /> Billing Gate Exception Blocked:
                </div>
                <ul className="list-disc pl-4 font-semibold text-[10px] space-y-0.5">
                  {inspectedBill.duplicate_detected && <li>Duplicate bill invoice number or document hash detected.</li>}
                  {!inspectedBill.required_documents_received && <li>Compliance requirement: Attached RA/PO PDF is missing.</li>}
                  {!inspectedBill.qc_approval_verified && <li>QA/QC checklist validation checks pending or failed.</li>}
                  {!inspectedBill.work_completion_verified && <li>Work completion measurement sheets validation pending.</li>}
                </ul>
              </div>
            )}

            <div className="border-t border-border pt-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedBill(null)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-[#967332]"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stats Cards component
function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'orange',
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  color?: 'orange' | 'emerald' | 'purple' | 'danger';
}) {
  const colorMap = {
    orange: 'text-orange-600 border-orange-100 bg-orange-50/60 dark:border-orange-950/40 dark:bg-orange-950/20',
    emerald: 'text-emerald-600 border-emerald-100 bg-emerald-50/60 dark:border-emerald-950/40 dark:bg-emerald-950/20',
    purple: 'text-purple-600 border-purple-100 bg-purple-50/60 dark:border-purple-950/40 dark:bg-purple-950/20',
    danger: 'text-red-600 border-red-100 bg-red-50/60 dark:border-red-950/40 dark:bg-red-950/20',
  };

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all hover:scale-[1.01]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">{label}</span>
        <Icon className={`h-7 w-7 rounded-lg border p-1.5 ${colorMap[color]}`} />
      </div>
      <div className="mt-3">
        <p className="text-xl font-black text-gray-950 dark:text-white leading-none">{value}</p>
        <p className="mt-1 text-[10px] font-bold text-muted-foreground">{sub}</p>
      </div>
    </article>
  );
}

// Side status helper
function StatusRow({ label, count, color = 'blue' }: { label: string; count: number; color?: string }) {
  const dotColor =
    color === 'amber'
      ? 'bg-amber-500'
      : color === 'danger'
        ? 'bg-red-500 animate-pulse'
        : color === 'warning'
          ? 'bg-orange-500'
          : 'bg-blue-500';

  return (
    <div className="flex items-center justify-between p-2 rounded-lg border border-border/80 bg-background/50 text-xs font-semibold hover:bg-muted/10 transition-colors">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
        <span className="text-gray-650 dark:text-gray-300">{label}</span>
      </div>
      <span className="font-extrabold text-gray-900 dark:text-white text-sm bg-muted rounded-md px-2 py-0.5">{count}</span>
    </div>
  );
}

// Gate compliance pills helper
function GateCheckPill({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div
      className={`rounded-lg border p-2 flex items-center justify-between font-bold text-[10.5px] select-none ${
        passed
          ? 'border-emerald-500/10 bg-emerald-500/5 text-emerald-600'
          : 'border-red-500/10 bg-red-500/5 text-red-500'
      }`}
    >
      <span>{label}</span>
      <span className="text-xs">{passed ? '✓ Passed' : '✗ Blocked'}</span>
    </div>
  );
}
