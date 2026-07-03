// Presents the company-wide construction portfolio health and immediate action queue.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  TrendingUp,
  TrendingDown,
  Users2,
  ShoppingBag,
  Award,
  AlertCircle,
  Layers3,
  CheckCircle2,
  HardHat,
  ShieldAlert,
  Activity,
  Wrench,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { listProcurementDashboard, type ProcurementDashboardData } from '@/lib/procurement';
import { getDPRs } from '@/lib/dpr';
import { getDelays } from '@/lib/delays';
import { isUpperManagement } from '@/lib/rbac';
import { getDbSiteId } from '@/utils/supabase-client';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function DashboardPage() {
  const { projects, notifications, activeRole, vendorBills, vendorPayments } = useAppStore();
  const isExec = isUpperManagement(activeRole);
  const [activeChartTab, setActiveChartTab] = useState<'burn' | 'workforce' | 'delays'>('burn');
  const [liveProcurement, setLiveProcurement] = useState<ProcurementDashboardData | null>(null);
  const [liveDprs, setLiveDprs] = useState<any[]>([]);
  const [liveDelays, setLiveDelays] = useState<any[]>([]);
  const [healthScore, setHealthScore] = useState(86);
  
  // Interactive Decision Queue state
  const [approvedActionIds, setApprovedActionIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showAllDecisions, setShowAllDecisions] = useState(false);

  useEffect(() => {
    if (!isLiveSupabase()) return;
    let active = true;
    
    Promise.all([
      listProcurementDashboard(),
      getDPRs(),
      getDelays()
    ]).then(([procData, dprData, delayData]) => {
      if (active) {
        setLiveProcurement(procData);
        setLiveDprs(dprData || []);
        setLiveDelays(delayData || []);
        
        // Project Health AI computation
        let newScore = 100;
        const unresolvedDelays = (delayData || []).filter((d: any) => d.impact_level === 'high' && !d.reason_details).length;
        newScore -= (unresolvedDelays * 5); // minus 5 per unresolved critical delay
        
        const openDprs = (dprData || []).filter((d: any) => d.status === 'draft').length;
        if (openDprs > 10) newScore -= 5;
        
        setHealthScore(Math.max(0, newScore));
      }
    }).catch(err => {
      console.error(err);
      if (active) setLiveProcurement(null);
    });

    return () => {
      active = false;
    };
  }, []);

  // Adherence Rate Calculation
  const activeSitesCount = projects.filter(p => p.status === 'Active' || p.status === 'Delayed' || p.status === 'On Hold').length;
  const onTrackSitesCount = projects.filter(p => p.status === 'Active').length;
  const adherenceRate = activeSitesCount > 0
    ? Math.round((onTrackSitesCount / activeSitesCount) * 100)
    : 83; // fallback

  // Helper: Get days since last progress log
  const getDaysSinceLastLog = (project: any) => {
    let latestDateStr = '';
    
    if (liveDprs.length > 0) {
      const dbSiteId = getDbSiteId(project.id);
      const projectDprs = liveDprs.filter((d: any) => d.project_id === dbSiteId || d.project_id === project.id);
      if (projectDprs.length > 0) {
        latestDateStr = projectDprs[0].report_date || projectDprs[0].created_at || '';
      }
    }
    
    if (!latestDateStr && project.dailyActivities && project.dailyActivities.length > 0) {
      latestDateStr = project.dailyActivities[0].date;
    }

    if (!latestDateStr) return 'No data logged';
    
    const logDate = new Date(latestDateStr);
    const today = new Date();
    logDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    
    const diffTime = today.getTime() - logDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    return logDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // Compile Unified Action Queue
  const prActions = liveProcurement
    ? liveProcurement.purchaseRequisitions
        .filter((r: any) => ['submitted', 'in_review'].includes(r.status))
        .map((r: any) => ({
          id: r.id,
          type: 'procurement',
          title: `Approve Requisition - PR #${r.id.substring(0, 6)}`,
          context: `Live Project · ${formatIndianCurrency(Number(r.estimated_cost || 0))} · High Value`,
          dueDate: r.target_delivery_date || 'No due date',
        }))
    : projects.flatMap((p) =>
        p.procurements
          .filter((req) => ['DRAFT', 'RFQ_SENT'].includes(req.status))
          .map((req) => ({
            id: req.id,
            type: 'procurement',
            title: `Approve PR - ${req.title}`,
            context: `${p.name} · ${formatIndianCurrency(req.cost)}`,
            dueDate: req.deliveryDate || 'Within 5 days',
          }))
      );

  const billActions = (vendorBills || [])
    .filter((b) => ['DUE', 'VERIFIED'].includes(b.status))
    .map((b) => ({
      id: b.id,
      type: 'finance',
      title: `Pay Vendor Bill - ${b.invoiceNumber}`,
      context: `${b.vendorName} · ${formatIndianCurrency(b.amount)} · Due soon`,
      dueDate: b.date,
    }));

  const delayActions = liveDelays.length > 0
    ? liveDelays
        .filter((d: any) => !d.reason_details)
        .map((d: any) => ({
          id: d.id,
          type: 'execution',
          title: `Sign-off Delay - ${d.construction_activities?.title || 'Activity'}`,
          context: `${d.projects?.name || 'Live Project'} · ${d.impact_days || 0} days delay impact`,
          dueDate: d.created_at || 'Awaiting Review',
        }))
    : projects.flatMap((p) =>
        (p.delays || [])
          .filter((d) => ['Under Review', 'Open'].includes(d.status))
          .map((d) => ({
            id: d.id,
            type: 'execution',
            title: `Sign-off Delay - ${d.siteTowerBlock || 'Activity'}`,
            context: `${p.name} · ${d.delayDays} days delay · ${d.severity} Severity`,
            dueDate: d.actionDueDate || 'Awaiting Review',
          }))
      );

  const allActions = [
    ...prActions.map(a => ({ ...a, category: 'Procurement', icon: ShoppingBag, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-450' })),
    ...billActions.map(a => ({ ...a, category: 'Finance', icon: CircleDollarSign, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' })),
    ...delayActions.map(a => ({ ...a, category: 'Execution', icon: Clock3, color: 'bg-rose-500/10 text-rose-650 dark:text-rose-400' }))
  ];

  const pendingActions = allActions.filter(a => !approvedActionIds.includes(a.id));
  const visibleDecisions = showAllDecisions ? pendingActions : pendingActions.slice(0, 4);

  const handleApprove = (action: any) => {
    setApprovedActionIds(prev => [...prev, action.id]);
    setToastMsg(`Approved: ${action.title}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Recharts burnData
  const burnData = [
    { name: 'Jan', budget: 12, actual: 10, progress: 8 },
    { name: 'Feb', budget: 28, actual: 24, progress: 18 },
    { name: 'Mar', budget: 45, actual: 42, progress: 30 },
    { name: 'Apr', budget: 70, actual: 65, progress: 48 },
    { name: 'May', budget: 105, actual: 98, progress: 65 },
    { name: 'Jun', budget: 144, actual: 132, progress: 79 },
  ];

  // Recharts workforceTrendData
  const workforceTrendData = [
    { name: 'Week 1', 'Central Park': 180, 'Orbit 4': 120, 'Satva Office': 90 },
    { name: 'Week 2', 'Central Park': 202, 'Orbit 4': 110, 'Satva Office': 95 },
    { name: 'Week 3', 'Central Park': 196, 'Orbit 4': 134, 'Satva Office': 105 },
    { name: 'Week 4', 'Central Park': 210, 'Orbit 4': 146, 'Satva Office': 118 },
    { name: 'Week 5', 'Central Park': 208, 'Orbit 4': 152, 'Satva Office': 124 },
    { name: 'Week 6', 'Central Park': 225, 'Orbit 4': 161, 'Satva Office': 130 },
  ];

  // Recharts delayData (Live/Mock fallback)
  const delayData = liveDelays.length > 0 
    ? Object.entries(
        liveDelays.reduce((acc, delay) => {
          const name = delay.projects?.name || 'Unknown Project';
          if (!acc[name]) acc[name] = { name, delayDays: 0, riskScore: 0, count: 0 };
          acc[name].delayDays += delay.impact_days || 0;
          acc[name].count += 1;
          acc[name].riskScore = Math.min(100, acc[name].count * 20 + acc[name].delayDays * 5);
          return acc;
        }, {} as Record<string, any>)
      ).map(([_, v]) => v)
    : [
        { name: 'Central Park', delayDays: 14, riskScore: 82 },
        { name: 'Orbit 4', delayDays: 6, riskScore: 48 },
        { name: 'Satva Office', delayDays: 0, riskScore: 24 },
        { name: 'Aranya 3', delayDays: 11, riskScore: 70 },
      ];

  return (
    <div className="space-y-6 pb-10">
      {/* SECTION 1 - KPI Strip */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* KPI 1: Revenue realized */}
        <article className="group rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-300 hover:shadow-premium hover:border-primary/45">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Revenue Realized</p>
              <p className="mt-2 text-2xl md:text-3xl font-heading font-extrabold text-foreground group-hover:text-primary transition-colors">
                ₹84.6 Cr
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-500">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>+8.5% vs last period</span>
              </div>
            </div>
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CircleDollarSign className="h-5 w-5" />
            </span>
          </div>
        </article>

        {/* KPI 2: Cash position */}
        <article className="group rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-300 hover:shadow-premium hover:border-primary/45">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Cash Position</p>
              <p className="mt-2 text-2xl md:text-3xl font-heading font-extrabold text-foreground group-hover:text-primary transition-colors">
                ₹12.4 Cr
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/15">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>₹45L Overdue AR</span>
              </div>
            </div>
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-450">
              <TrendingDown className="h-5 w-5" />
            </span>
          </div>
        </article>

        {/* KPI 3: Schedule adherence */}
        <article className="group rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-300 hover:shadow-premium hover:border-primary/45">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Schedule Adherence</p>
              <p className="mt-2 text-2xl md:text-3xl font-heading font-extrabold text-foreground group-hover:text-primary transition-colors">
                {adherenceRate}%
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                {onTrackSitesCount} of {activeSitesCount || projects.length} active sites on track
              </p>
            </div>
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Clock3 className="h-5 w-5" />
            </span>
          </div>
        </article>

        {/* KPI 4: Safety incidents */}
        <article className="group rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs transition-all duration-300 hover:shadow-premium hover:border-emerald-500/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-450 truncate">Safety Incidents</p>
              <p className="mt-2 text-2xl md:text-3xl font-heading font-extrabold text-emerald-700 dark:text-emerald-450">
                0
              </p>
              <p className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" />
                No incidents (last 30 days)
              </p>
            </div>
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <HardHat className="h-5 w-5" />
            </span>
          </div>
        </article>
      </section>

      {/* SECTION 2 - Needs Your Decision Queue */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Needs Your Decision</h2>
            <span className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {pendingActions.length}
            </span>
          </div>
          {pendingActions.length > 4 && (
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

        {pendingActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
            <p className="text-sm font-bold text-foreground">All clear!</p>
            <p className="text-xs text-muted-foreground mt-0.5">No decisions pending your attention today.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {visibleDecisions.map((decision) => {
              const Icon = decision.icon;
              return (
                <div key={decision.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0 gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ${decision.color}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{decision.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground font-medium">{decision.context} · Due {decision.dueDate}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex gap-2">
                    <button
                      onClick={() => handleApprove(decision)}
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

      {/* SECTIONS 3 & 4 - Double-Column Layout */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* SECTION 3 - Site Health Registry */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Site Health Registry</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Current logging status and physical completion track.</p>
              </div>
              <Link href="/projects" className="group flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                All sites <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {projects.map((project) => {
                const daysSinceLastLog = getDaysSinceLastLog(project);
                let statusPill = 'On Track';
                let statusColor = 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-455 border-emerald-500/20';
                
                if (project.status === 'Delayed') {
                  statusPill = 'Delayed';
                  statusColor = 'bg-rose-500/10 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400 border-rose-500/20';
                } else if (project.status === 'On Hold') {
                  statusPill = 'On Hold';
                  statusColor = 'bg-amber-500/10 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 border-amber-500/20';
                } else if (project.progress < 35 && project.progress > 0) {
                  statusPill = 'At Risk';
                  statusColor = 'bg-amber-500/10 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 border-amber-500/20';
                }

                return (
                  <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-border p-4.5 transition-all duration-200 hover:bg-muted/40 hover:border-primary/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-foreground leading-none">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground font-medium">{project.location} · {project.currentPhase}</p>
                      </div>
                      <div className="flex items-center gap-4.5 sm:text-right sm:justify-end">
                        <div className="text-left sm:text-right">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Logging Status</p>
                          <p className={`text-xs font-semibold ${daysSinceLastLog === 'No data logged' ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                            {daysSinceLastLog}
                          </p>
                        </div>
                        <div>
                          <span className={`inline-flex items-center rounded border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                            {statusPill}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECTION 4 - Top Operational Risks */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Top Operational Risks</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Ranked active schedule and budget exposures.</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Risk 1 */}
              <div className="flex gap-3 items-start p-3 bg-muted/20 rounded-xl border border-border/40">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 flex-shrink-0 relative">
                  <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75"></span>
                </span>
                <div>
                  <p className="text-xs font-bold text-foreground leading-snug">Steel price volatility could push Tower B ₹2.1 Cr over cap</p>
                  <p className="text-[9px] text-rose-500 font-bold uppercase tracking-wider mt-1">Critical · Budget Impact</p>
                </div>
              </div>

              {/* Risk 2 */}
              <div className="flex gap-3 items-start p-3 bg-muted/20 rounded-xl border border-border/40">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 flex-shrink-0"></span>
                <div>
                  <p className="text-xs font-bold text-foreground leading-snug">Cement stock at Orbit 4 covers only 6 days of pour schedule</p>
                  <p className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-1">Warning · Inventory Stockout</p>
                </div>
              </div>

              {/* Risk 3 */}
              <div className="flex gap-3 items-start p-3 bg-muted/20 rounded-xl border border-border/40">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 flex-shrink-0"></span>
                <div>
                  <p className="text-xs font-bold text-foreground leading-snug">486 workforce logged, 12% below plan for slab phase</p>
                  <p className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-1">Warning · Labour Deficit</p>
                </div>
              </div>

              {/* Risk 4 */}
              <div className="flex gap-3 items-start p-3 bg-muted/20 rounded-xl border border-border/40">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 flex-shrink-0 relative">
                  <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75"></span>
                </span>
                <div>
                  <p className="text-xs font-bold text-foreground leading-snug">MEP coordination sleeve error at Central Park requires rework</p>
                  <p className="text-[9px] text-rose-500 font-bold uppercase tracking-wider mt-1">Critical · Quality Failure</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 - Enterprise Analytics & Charts */}
      {isExec && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4 mb-5">
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Enterprise Analytics</h2>
              <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Budget burn velocity, workforce allocation trends, and delay risks.</p>
            </div>
            <div className="flex gap-1.5 bg-muted/65 p-1 rounded-xl border border-border/40">
              <button
                onClick={() => setActiveChartTab('burn')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeChartTab === 'burn' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Budget Burn
              </button>
              <button
                onClick={() => setActiveChartTab('workforce')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeChartTab === 'workforce' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Workforce Allocation
              </button>
              <button
                onClick={() => setActiveChartTab('delays')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeChartTab === 'delays' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Schedule Risks
              </button>
            </div>
          </div>

          <div className="h-72 min-h-0 w-full">
            {activeChartTab === 'burn' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={burnData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b68d40" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#b68d40" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.5)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: 'Spend (₹ Crores)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: 'currentColor' } }} />
                  <Tooltip formatter={(value) => [`₹ ${value} Cr`]} contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid var(--border)' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Area type="monotone" dataKey="actual" stroke="#b68d40" strokeWidth={2.5} fillOpacity={1} fill="url(#gradActual)" name="Actual Spend" />
                  <Area type="monotone" dataKey="budget" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" fill="none" name="Baseline Budget" />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {activeChartTab === 'workforce' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workforceTrendData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.5)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: 'Workers count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10 } }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="Central Park" fill="#b68d40" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Orbit 4" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Satva Office" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {activeChartTab === 'delays' && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={delayData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.5)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="delayDays" fill="#ef4444" radius={[4, 4, 0, 0]} name="Delay (Days)" />
                  <Bar dataKey="riskScore" fill="#f59e0b" radius={[4, 4, 0, 0]} name="AI Risk Rating (%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      )}

      {/* SECTION 6 - Geographic Project Map */}
      {isExec && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm min-h-[320px]">
          <div className="border-b border-border/60 pb-3 flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Project Map Overview</h2>
              <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Active geographic hubs and live status tracks.</p>
            </div>
            <span className="bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-primary">Live Data</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-3 items-center">
            {/* Styled CSS/SVG Map */}
            <div className="lg:col-span-7 relative h-48 bg-muted/30 rounded-2xl border border-border/60 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 opacity-15" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2500/svg'%3E%3Cpath d='M0 0h20v20H0zm20 20h20v20H20z' fill='none' stroke='%239ca3af' stroke-width='0.5'/%3E%3C/svg%3E")`,
                backgroundSize: '20px 20px'
              }}></div>
              
              {/* Surat Marker */}
              <div className="absolute top-[45%] left-[65%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <span className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500 flex items-center justify-center text-[10px] font-black text-emerald-650 dark:text-emerald-450 relative">
                  6
                  <span className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping"></span>
                </span>
                <span className="text-[9px] font-black text-foreground mt-1 bg-card px-1.5 py-0.5 rounded border border-border shadow-xs">Surat</span>
              </div>

              {/* Ahmedabad Marker */}
              <div className="absolute top-[25%] left-[40%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <span className="w-8 h-8 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-[10px] font-black text-primary relative">
                  4
                  <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping"></span>
                </span>
                <span className="text-[9px] font-black text-foreground mt-1 bg-card px-1.5 py-0.5 rounded border border-border shadow-xs">Ahmedabad</span>
              </div>

              {/* Mumbai Marker */}
              <div className="absolute top-[75%] left-[80%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <span className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500 flex items-center justify-center text-[10px] font-black text-emerald-650 dark:text-emerald-400 relative">
                  2
                  <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping"></span>
                </span>
                <span className="text-[9px] font-black text-foreground mt-1 bg-card px-1.5 py-0.5 rounded border border-border shadow-xs">Mumbai</span>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center gap-3 p-3 bg-muted/40 border border-border/40 rounded-xl">
                <div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0"></div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-foreground">Surat Hub</span>
                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">6 Active</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">Orbit 4, Central Park, Aranya 3</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/40 border border-border/40 rounded-xl">
                <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0"></div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-foreground">Ahmedabad Hub</span>
                    <span className="text-[10px] font-black text-primary uppercase">4 Active</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">Pramukh Elegance, Skyline Corporate</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/40 border border-border/40 rounded-xl">
                <div className="w-3 h-3 rounded-full bg-emerald-500 flex-shrink-0"></div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-foreground">Mumbai Hub</span>
                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">2 Active</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">Sea Breeze Villa Resort</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 7 - Labour & Equipment snapshot */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Labour snapshot */}
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border/60 pb-3 mb-4">
            <Users2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider font-heading">Labour Snapshot</h2>
              <p className="text-[10px] text-muted-foreground font-semibold">Turnout vs planned manpower logs.</p>
            </div>
          </div>
          <div className="space-y-3.5">
            <div className="flex justify-between items-center bg-muted/40 p-3 rounded-xl border border-border/50">
              <span className="text-xs font-semibold text-muted-foreground">Workforce Present Today</span>
              <strong className="text-sm font-black text-foreground">486 / 550 planned</strong>
            </div>
            <div className="flex items-start gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-500 px-3 py-2.5 rounded-xl border border-amber-500/15 text-xs font-bold">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 animate-bounce" />
              <span>Satva Office: 15% under-resourced for cladding phase. Mason turnout is low.</span>
            </div>
          </div>
        </article>

        {/* Equipment snapshot */}
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border/60 pb-3 mb-4">
            <Wrench className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider font-heading">Equipment Snapshot</h2>
              <p className="text-[10px] text-muted-foreground font-semibold">Active machinery and fleet availability.</p>
            </div>
          </div>
          <div className="space-y-3.5">
            <div className="flex justify-between items-center bg-muted/40 p-3 rounded-xl border border-border/50">
              <span className="text-xs font-semibold text-muted-foreground">Fleet Status</span>
              <strong className="text-sm font-black text-foreground">14 active · 2 idle · 1 in service</strong>
            </div>
            <div className="flex items-start gap-2 bg-rose-500/10 text-rose-600 dark:text-rose-450 px-3 py-2.5 rounded-xl border border-rose-500/15 text-xs font-bold">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>2 units idle at Central Park. Tower Crane #2 breakdown reported at Orbit 4.</span>
            </div>
          </div>
        </article>
      </section>

      {/* SECTION 8 - Recent Activity Feed */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider font-heading">Recent Activity Feed</h2>
            <p className="text-[10px] text-muted-foreground font-semibold">Cross-module operations and approval timeline.</p>
          </div>
        </div>

        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {/* Activity 1 */}
          <div className="flex gap-4.5 items-start">
            <span className="text-[10px] font-bold text-muted-foreground min-w-[70px] pt-0.5">12 min ago</span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
            <div>
              <p className="text-xs font-bold text-foreground">Vikram Patel approved Cement Purchase Requisition (PR-0272)</p>
              <p className="text-[10px] text-muted-foreground">Procurement · Central Park</p>
            </div>
          </div>

          {/* Activity 2 */}
          <div className="flex gap-4.5 items-start">
            <span className="text-[10px] font-bold text-muted-foreground min-w-[70px] pt-0.5">1 hr ago</span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
            <div>
              <p className="text-xs font-bold text-foreground">Priya Nair uploaded Daily Progress Report for Central Park</p>
              <p className="text-[10px] text-muted-foreground">Execution · Today's turnout logged as 96</p>
            </div>
          </div>

          {/* Activity 3 */}
          <div className="flex gap-4.5 items-start">
            <span className="text-[10px] font-bold text-muted-foreground min-w-[70px] pt-0.5">Today, 08:30</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5"></div>
            <div>
              <p className="text-xs font-bold text-foreground">AI Portfolio health score re-computed to 86/100</p>
              <p className="text-[10px] text-muted-foreground">System Audit · All metrics updated</p>
            </div>
          </div>

          {/* Activity 4 */}
          <div className="flex gap-4.5 items-start">
            <span className="text-[10px] font-bold text-muted-foreground min-w-[70px] pt-0.5">Yesterday</span>
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5"></div>
            <div>
              <p className="text-xs font-bold text-foreground">QC Inspection template created for Tower B Slab</p>
              <p className="text-[10px] text-muted-foreground">Safety & QC · Created by Inspector Dave</p>
            </div>
          </div>

          {/* Activity 5 */}
          <div className="flex gap-4.5 items-start">
            <span className="text-[10px] font-bold text-muted-foreground min-w-[70px] pt-0.5">Yesterday</span>
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5"></div>
            <div>
              <p className="text-xs font-bold text-foreground">Rohan Mehta flagged a critical schedule delay at Orbit 4</p>
              <p className="text-[10px] text-muted-foreground">Execution · 14 days delay impact on Level 4 Slab Pour</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive decision toast notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg border border-emerald-500 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 className="h-4.5 w-4.5" />
          <span className="text-xs font-bold">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
