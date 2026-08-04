// Presents the company-wide construction portfolio health and immediate action queue.
'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  ShoppingBag,
  AlertCircle,
  Layers3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { listProcurementDashboard, type ProcurementDashboardData } from '@/lib/procurement';
import { getDPRs } from '@/lib/dpr';
import { getDelays } from '@/lib/delays';
import { listBudgetDashboard, type BudgetDashboardData } from '@/lib/budget';
import { isUpperManagement } from '@/lib/rbac';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard } from '@/components/ui/stat-card';

// Fallback content shown when Supabase isn't configured (demo/offline mode) or a fetch is still in flight.
const MOCK_PROCUREMENT_FUNNEL = [
  { name: 'Material Requests', count: 18, sub: '1.2 days avg' },
  { name: 'Purchase Requisitions', count: 14, sub: '2.5 days avg' },
  { name: 'RFQs Issued', count: 11, sub: 'Awaiting quotations' },
  { name: 'Purchase Orders', count: 9, sub: '4.1 days transit' },
  { name: 'GRNs Received', count: 22, sub: 'Received' },
];

const MOCK_UNRESOLVED_DELAYS = [
  { project: 'Central Park', activity: 'Tower B slab reinforcement', impact: 'high' },
  { project: 'Orbit 4', activity: 'Structural grade inspection approval', impact: 'high' },
];

const MOCK_OPEN_DPRS = 3;
const MOCK_PENDING_APPROVALS = 6;
const MOCK_PENDING_VENDOR_BILLS = 4;

const MOCK_BUDGET_TOTALS = { allocated: 300000000, committed: 32000000, spent: 246000000 };

const MOCK_TOP_AT_RISK_BUDGETS = [
  { project_name: 'Central Park', utilization_percent: 96, alert: true },
  { project_name: 'Orbit 4', utilization_percent: 88, alert: false },
  { project_name: 'Skyline Hub', utilization_percent: 74, alert: false },
];

type FetchState = 'idle' | 'loading' | 'ready' | 'error';

export default function DashboardPage() {
  const { projects, activeRole, currentUser } = useAppStore();

  const scopeProjectId = useMemo(
    () => (isUpperManagement(activeRole) ? undefined : (currentUser.project_id ?? undefined)),
    [activeRole, currentUser.project_id]
  );

  // Live fetched data
  const [liveProcurement, setLiveProcurement] = useState<ProcurementDashboardData | null>(null);
  const [liveDprs, setLiveDprs] = useState<any[]>([]);
  const [liveDelays, setLiveDelays] = useState<any[]>([]);
  const [liveBudget, setLiveBudget] = useState<BudgetDashboardData | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  // Interactive UI states
  const [approvedActionIds, setApprovedActionIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showAllDecisions, setShowAllDecisions] = useState(false);

  // Fetch live Supabase data on mount / when the user's project scope changes
  useEffect(() => {
    if (!isLiveSupabase()) return;
    let active = true;
    setFetchState('loading');

    // Each source is caught independently — one table's permission/RLS error
    // (e.g. budget_ledger) must not blank out the other three that succeeded.
    Promise.all([
      listProcurementDashboard(scopeProjectId).catch(err => { console.error('Procurement fetch failed:', err); return null; }),
      getDPRs(scopeProjectId).catch(err => { console.error('DPR fetch failed:', err); return null; }),
      getDelays(scopeProjectId).catch(err => { console.error('Delays fetch failed:', err); return null; }),
      listBudgetDashboard(scopeProjectId).catch(err => { console.error('Budget fetch failed:', err); return null; }),
    ]).then(([procData, dprData, delayData, budgetData]) => {
      if (!active) return;
      setLiveProcurement(procData);
      setLiveDprs(dprData || []);
      setLiveDelays(delayData || []);
      setLiveBudget(budgetData);
      setFetchState('ready');
    });

    return () => {
      active = false;
    };
  }, [scopeProjectId]);

  // Real data is only trusted once the batch fetch has completed; each section
  // additionally guards on its own live value being non-null, so a source that
  // failed independently (see catches above) falls back to its MOCK_* constant
  // while the others still render real data.
  const useLiveData = fetchState === 'ready';

  // ────────────────────────────────────────────────────────────────────────
  // Persona resolution
  // ────────────────────────────────────────────────────────────────────────
  const persona = useMemo(() => {
    const isPurchase = activeRole === 'PR_TEAM';
    const isDirector = activeRole === 'UPPER_MANAGEMENT';
    if (isDirector) return 'DIRECTOR';
    if (isPurchase) return 'PURCHASE';
    return 'PMC'; // default to PMC for any PROJECT_MANAGER or fallback
  }, [activeRole]);

  // ────────────────────────────────────────────────────────────────────────
  // My Tasks (cross-project, real — sourced from the store's fetchDbTasks())
  // ────────────────────────────────────────────────────────────────────────
  const myTasks = useMemo(
    () => projects.flatMap(p => p.tasks || []).filter((t: any) => t.assigneeId === currentUser.id),
    [projects, currentUser.id]
  );

  const myTasksRollup = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOpen = (t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED';
    const overdue = myTasks.filter((t: any) => isOpen(t) && t.endDate && new Date(t.endDate) < today);
    const dueToday = myTasks.filter((t: any) => t.endDate && new Date(t.endDate).toDateString() === today.toDateString());
    const inProgress = myTasks.filter((t: any) => t.status === 'IN_PROGRESS');
    return { overdue, dueToday, inProgress };
  }, [myTasks]);

  // ────────────────────────────────────────────────────────────────────────
  // "What Needs Me Today" KPI strip
  // ────────────────────────────────────────────────────────────────────────
  const pendingApprovalsCount = useMemo(() => {
    if (!useLiveData || !liveProcurement) return MOCK_PENDING_APPROVALS;
    const prs = liveProcurement.purchaseRequisitions?.filter((pr: any) => pr.status === 'pending_approval').length ?? 0;
    const pos = liveProcurement.purchaseOrders?.filter((po: any) => po.status === 'pending_approval').length ?? 0;
    return prs + pos;
  }, [useLiveData, liveProcurement]);

  const openDprsCount = useMemo(() => {
    if (!useLiveData) return MOCK_OPEN_DPRS;
    return liveDprs.filter((d: any) => d?.status === 'draft').length;
  }, [useLiveData, liveDprs]);

  const pendingVendorBillsCount = useMemo(() => {
    if (!useLiveData || !liveProcurement) return MOCK_PENDING_VENDOR_BILLS;
    return liveProcurement.vendorBills?.filter((b: any) => !['approved', 'paid', 'rejected'].includes(b?.status)).length ?? 0;
  }, [useLiveData, liveProcurement]);

  const overdueTasksCount = myTasksRollup.overdue.length;

  const needsTodayKpis = useMemo(() => [
    { label: 'Pending Approvals', value: `${pendingApprovalsCount}`, detail: 'Purchase requisitions & orders awaiting sign-off', icon: ShoppingBag, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', link: '/procurement', isPositive: pendingApprovalsCount === 0 },
    { label: 'Overdue Tasks', value: `${overdueTasksCount}`, detail: 'Assigned to you, past due date', icon: Clock3, color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', link: '/projects', isPositive: overdueTasksCount === 0 },
    { label: 'Open DPRs', value: `${openDprsCount}`, detail: 'Daily progress reports still in draft', icon: FileText, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', link: '/activities', isPositive: openDprsCount === 0 },
    { label: 'Pending Vendor Bills', value: `${pendingVendorBillsCount}`, detail: 'Bills awaiting verification or approval', icon: CircleDollarSign, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', link: '/billing', isPositive: pendingVendorBillsCount === 0 },
  ], [pendingApprovalsCount, overdueTasksCount, openDprsCount, pendingVendorBillsCount]);

  // ────────────────────────────────────────────────────────────────────────
  // Procurement Pipeline (Purchase persona) — real PR→RFQ→PO→GRN funnel
  // ────────────────────────────────────────────────────────────────────────
  const procurementFunnel = useMemo(() => {
    if (!useLiveData || !liveProcurement) return MOCK_PROCUREMENT_FUNNEL;
    const pendingPRs = liveProcurement.purchaseRequisitions.filter((pr: any) => pr.status === 'pending_approval').length;
    return [
      { name: 'Material Requests', count: liveProcurement.materialRequests.length, sub: 'Submitted' },
      { name: 'Purchase Requisitions', count: liveProcurement.purchaseRequisitions.length, sub: `${pendingPRs} pending approval` },
      { name: 'RFQs Issued', count: liveProcurement.rfqs.length, sub: 'Awaiting quotations' },
      { name: 'Purchase Orders', count: liveProcurement.purchaseOrders.length, sub: 'Issued to vendors' },
      { name: 'GRNs Received', count: liveProcurement.grns.length, sub: 'Goods received' },
    ];
  }, [useLiveData, liveProcurement]);

  // ────────────────────────────────────────────────────────────────────────
  // Pending Approvals & Decisions queue (still illustrative — no itemized
  // cross-entity approvals-queue service function exists yet)
  // ────────────────────────────────────────────────────────────────────────
  const rawDecisions = useMemo(() => {
    const list: Array<{ id: string; category: string; title: string; context: string; due: string; icon: any; color: string }> = [];

    if (persona === 'DIRECTOR') {
      list.push({ id: 'dec-dir-1', category: 'Procurement', title: 'Approve Requisition - Steel PR-9948', context: 'Central Park · ₹24.5L · High Value TMT Order', due: 'Today', icon: ShoppingBag, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' });
      list.push({ id: 'dec-dir-2', category: 'Finance', title: 'Pay Overdue Bill - Cement Invoice INV-4022', context: 'Orbit 4 · ₹12.8L · Due for payment', due: 'Tomorrow', icon: CircleDollarSign, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' });
      list.push({ id: 'dec-dir-3', category: 'Execution', title: 'Sign-off Project Delay - level 4 structural hold', context: 'Skyline Hub · 11 days delay severity', due: 'Awaiting review', icon: Clock3, color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' });
      list.push({ id: 'dec-dir-4', category: 'Budget', title: 'Approve Budget Revision Request - Block B foundation', context: 'Satva Office · ₹6.2L increment', due: '3 days ago', icon: Layers3, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' });
    } else if (persona === 'PURCHASE') {
      list.push({ id: 'dec-pur-1', category: 'Procurement', title: 'Convert Material Request to PR - Brick MR-0091', context: 'Pramukh Elegance · 12,000 Pcs requested', due: 'Today', icon: ShoppingBag, color: 'bg-amber-500/10 text-amber-600' });
      list.push({ id: 'dec-pur-2', category: 'Procurement', title: 'Compare Vendor Quotations - Electrical Cables', context: '3 quotations received · Orbit 4', due: 'Tomorrow', icon: Layers3, color: 'bg-blue-500/10 text-blue-600' });
      list.push({ id: 'dec-pur-3', category: 'Finance', title: 'Verify Vendor Bill - Sand Invoice INV-892', context: 'Match GRN-998 · ₹4.6L', due: 'Within 2 days', icon: CircleDollarSign, color: 'bg-emerald-500/10 text-emerald-600' });
      list.push({ id: 'dec-pur-4', category: 'Procurement', title: 'Resolve Pending GRN Shortage - Cement Delivery', context: 'Gujarat Cement · 40 bags missing receipt', due: 'Awaiting Log', icon: AlertCircle, color: 'bg-rose-500/10 text-rose-600' });
    } else {
      // PMC / Fallback
      list.push({ id: 'dec-pmc-1', category: 'Execution', title: 'Review Daily Progress Report - yesterday\'s log', context: 'Central Park · Site Engineer Priya Nair', due: 'Today', icon: FileText, color: 'bg-blue-500/10 text-blue-600' });
      list.push({ id: 'dec-pmc-2', category: 'Execution', title: 'Assign Remedial Corrective Task - Plaster Crack', context: 'Block A Level 3 · Quality audit', due: 'Tomorrow', icon: ClipboardCheck, color: 'bg-amber-500/10 text-amber-600' });
      list.push({ id: 'dec-pmc-3', category: 'Execution', title: 'Resolve Critical Delay Log - Crane breakdown', context: 'Orbit 4 · Schedule impact assessment', due: 'Immediate', icon: Clock3, color: 'bg-rose-500/10 text-rose-600' });
      list.push({ id: 'dec-pmc-4', category: 'QC', title: 'Schedule QC Re-inspection - Tower B Column', context: 'Satva Office · Failed structural grade', due: '2 days left', icon: CheckCircle, color: 'bg-emerald-500/10 text-emerald-600' });
    }

    return list;
  }, [persona]);

  const visibleDecisions = useMemo(() => {
    const filtered = rawDecisions.filter(d => !approvedActionIds.includes(d.id));
    return showAllDecisions ? filtered : filtered.slice(0, 4);
  }, [rawDecisions, approvedActionIds, showAllDecisions]);

  const handleApprove = (actionId: string, title: string) => {
    setApprovedActionIds(prev => [...prev, actionId]);
    setToastMsg(`Actioned: ${title}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // ────────────────────────────────────────────────────────────────────────
  // Delays & DPR Risk (PMC + Director) — real unresolved high-impact delays
  // ────────────────────────────────────────────────────────────────────────
  const displayedDelays = useMemo(() => {
    if (!useLiveData) return MOCK_UNRESOLVED_DELAYS;
    return liveDelays
      .filter((d: any) => d?.impact_level === 'high' && !d?.reason_details)
      .map((d: any) => ({
        project: d?.projects?.name || 'Unknown project',
        activity: d?.construction_activities?.title || 'Delay event',
        impact: d?.impact_level || 'unknown',
      }));
  }, [useLiveData, liveDelays]);

  // ────────────────────────────────────────────────────────────────────────
  // Budget Health — real allocation/commitment/spend totals + utilization
  // ────────────────────────────────────────────────────────────────────────
  const budgetTotals = useMemo(() => {
    if (!useLiveData || !liveBudget) return MOCK_BUDGET_TOTALS;
    return liveBudget.summaries.reduce((acc, r) => ({
      allocated: acc.allocated + Number(r.allocated_amount || 0),
      committed: acc.committed + Number(r.committed_amount || 0),
      spent: acc.spent + Number(r.spent_amount || 0),
    }), { allocated: 0, committed: 0, spent: 0 });
  }, [useLiveData, liveBudget]);

  const topAtRiskBudgets = useMemo(() => {
    if (!useLiveData || !liveBudget) return MOCK_TOP_AT_RISK_BUDGETS;
    return [...liveBudget.summaries]
      .filter(r => (r.utilization_percent ?? 0) > 0)
      .sort((a, b) => (b.utilization_percent ?? 0) - (a.utilization_percent ?? 0))
      .slice(0, 5)
      .map(r => ({ project_name: r.project_name, utilization_percent: r.utilization_percent ?? 0, alert: (r.utilization_percent ?? 0) >= 90 }));
  }, [useLiveData, liveBudget]);

  return (
    <div className="space-y-6 pb-10">

      {/* ────────────────────────────────────────────────────────────────────────
          What Needs Me Today
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {needsTodayKpis.map((kpi, idx) => {
          const IconComponent = kpi.icon;
          return (
            <Link
              key={idx}
              href={kpi.link}
              className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-premium hover:border-primary/40 hover:scale-[1.01]"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-muted-foreground truncate">{kpi.label}</span>
                  <span className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${kpi.color}`}>
                    <IconComponent className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-2.5 text-xl lg:text-2xl font-mono font-black text-foreground group-hover:text-primary transition-colors leading-none">
                  {kpi.value}
                </p>
              </div>
              <p className={`mt-3.5 text-[10px] font-semibold leading-relaxed ${kpi.isPositive ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'}`}>
                {kpi.detail}
              </p>
            </Link>
          );
        })}
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          Portfolio Status / Procurement Pipeline
          ──────────────────────────────────────────────────────────────────────── */}
      <SectionCard
        title={persona === 'PURCHASE' ? 'Procurement Pipeline Status' : 'Portfolio Status'}
        subtitle="Active tasks status tracking and stage gates."
        action={
          <Link href={persona === 'PURCHASE' ? '/procurement' : '/projects'} className="group flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
            {persona === 'PURCHASE' ? 'Full procurement' : 'All sites'} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      >
        {persona === 'PURCHASE' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {procurementFunnel.map((f, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-border bg-muted/20">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">{f.name}</p>
                <p className="mt-2 text-2xl font-mono font-black text-foreground">{f.count}</p>
                <p className="text-xs text-primary font-semibold mt-1">{f.sub}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((project) => {
              let statusColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
              if (project.status === 'Delayed') {
                statusColor = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
              } else if (project.status === 'On Hold') {
                statusColor = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
              }
              return (
                <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-border p-4.5 transition-all duration-200 hover:bg-muted/40 hover:border-primary/20 bg-muted/5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground leading-none">{project.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground font-medium">{project.location} · {project.currentPhase}</p>
                    </div>
                    <div className="flex items-center gap-4.5 sm:text-right sm:justify-end">
                      <div className="text-left sm:text-right">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Progress</p>
                        <p className="text-xs font-mono font-semibold text-foreground">
                          {project.progress}% Complete
                        </p>
                      </div>
                      <div>
                        <span className={`inline-flex items-center rounded border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                          {project.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ────────────────────────────────────────────────────────────────────────
          Pending Approvals & Decisions
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Pending Approvals & Decisions</h2>
                <span className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {rawDecisions.filter(d => !approvedActionIds.includes(d.id)).length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Illustrative queue — not yet wired to a live approvals source.</p>
            </div>
          </div>
          {rawDecisions.filter(d => !approvedActionIds.includes(d.id)).length > 4 && (
            <button
              onClick={() => setShowAllDecisions(!showAllDecisions)}
              className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors cursor-pointer"
            >
              {showAllDecisions ? (
                <>Collapse <ChevronUp className="h-3.5 w-3.5" /></>
              ) : (
                <>View all decisions <ChevronDown className="h-3.5 w-3.5" /></>
              )}
            </button>
          )}
        </div>

        {visibleDecisions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
            <p className="text-sm font-bold text-foreground">All clear!</p>
            <p className="text-xs text-muted-foreground mt-0.5">No pending approval tickets or reviews assigned to you.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {visibleDecisions.map((decision) => {
              const IconComponent = decision.icon;
              return (
                <div key={decision.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0 gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${decision.color}`}>
                      <IconComponent className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{decision.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground font-medium">{decision.context} · Due {decision.due}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <button
                      onClick={() => handleApprove(decision.id, decision.title)}
                      className="px-3.5 py-1.5 text-xs font-bold bg-primary/10 border border-primary/20 hover:bg-primary text-primary hover:text-white rounded-lg transition-all shadow-xs cursor-pointer"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          Delays & DPR Risk (PMC & Director)
          ──────────────────────────────────────────────────────────────────────── */}
      {(persona === 'PMC' || persona === 'DIRECTOR') && (
        <SectionCard
          title="Delays & DPR Risk"
          subtitle="Unresolved high-impact delays and outstanding daily progress reports."
          icon={AlertTriangle}
          iconClassName="text-rose-500"
          action={<Link href="/activities" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">Execution Log →</Link>}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-4">
              <StatCard icon={FileText} label="Open DPRs (Draft)" value={openDprsCount} />
            </div>
            <div className="md:col-span-8 space-y-3">
              {displayedDelays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-sm font-bold text-foreground">No unresolved high-impact delays</p>
                </div>
              ) : (
                displayedDelays.map((d, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-border bg-muted/20 flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">{d.activity}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{d.project}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded flex-shrink-0">
                      {d.impact} impact
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          Budget Health
          ──────────────────────────────────────────────────────────────────────── */}
      <SectionCard
        title="Budget Health"
        subtitle="Company-wide allocation, commitment and burn rate."
        icon={CircleDollarSign}
        iconClassName="text-emerald-600"
        action={<Link href="/budget" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">Cost codes →</Link>}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-5 p-3.5 bg-muted/10 border border-border/40 rounded-xl space-y-2 text-xs h-max">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Allocated</span>
              <span className="font-mono font-bold text-foreground">{formatIndianCurrency(budgetTotals.allocated)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Committed</span>
              <span className="font-mono font-bold text-foreground">{formatIndianCurrency(budgetTotals.committed)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Spent to Date</span>
              <span className="font-mono font-bold text-foreground">{formatIndianCurrency(budgetTotals.spent)}</span>
            </div>
          </div>
          <div className="md:col-span-7">
            <h3 className="text-[10px] font-black uppercase text-muted-foreground mb-2">Top Projects by Utilization</h3>
            {topAtRiskBudgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-bold text-foreground">No budget data yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topAtRiskBudgets.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 text-xs">
                    <span className="font-semibold text-foreground">{r.project_name}</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded ${r.alert ? 'text-rose-600 bg-rose-500/10' : 'text-foreground bg-muted/40'}`}>{r.utilization_percent}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ────────────────────────────────────────────────────────────────────────
          My Tasks
          ──────────────────────────────────────────────────────────────────────── */}
      <SectionCard
        title="My Tasks"
        subtitle="Tasks assigned to you across all projects."
        icon={CheckCircle}
        action={<Link href="/projects" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">All projects →</Link>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatCard icon={AlertTriangle} label="Overdue" value={myTasksRollup.overdue.length} accent="ring-rose-200 dark:ring-rose-800" />
          <StatCard icon={Clock3} label="Due Today" value={myTasksRollup.dueToday.length} accent="ring-amber-200 dark:ring-amber-800" />
          <StatCard icon={ClipboardCheck} label="In Progress" value={myTasksRollup.inProgress.length} />
        </div>
        {myTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center bg-muted/20 rounded-xl border border-dashed border-border">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
            <p className="text-sm font-bold text-foreground">No tasks assigned to you</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...myTasksRollup.overdue, ...myTasksRollup.dueToday].slice(0, 5).map((t: any) => (
              <Link key={t.id} href={`/projects/${t.projectId}`} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 text-xs transition-colors">
                <span className="font-semibold text-foreground truncate">{t.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0 ml-2">{t.endDate}</span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Action toast notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg border border-emerald-500 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 className="h-4.5 w-4.5" />
          <span className="text-xs font-bold">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
