// Presents the company-wide construction portfolio health and immediate action queue.
'use client';

import { useEffect, useState, useMemo } from 'react';
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
  CheckCircle,
  Calendar,
  MapPin,
  Building2,
  AlertOctagon,
  FileText,
  ClipboardCheck,
  UserCheck,
  Percent,
  Plus
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function DashboardPage() {
  const { 
    projects, 
    notifications, 
    activeRole, 
    vendorBills, 
    vendorPayments, 
    currentUser, 
    vendors,
    vendorQuotations 
  } = useAppStore();

  const isExec = isUpperManagement(activeRole);
  
  // States for live fetched data
  const [liveProcurement, setLiveProcurement] = useState<ProcurementDashboardData | null>(null);
  const [liveDprs, setLiveDprs] = useState<any[]>([]);
  const [liveDelays, setLiveDelays] = useState<any[]>([]);
  const [healthScore, setHealthScore] = useState(86);
  
  // Interactive UI states
  const [approvedActionIds, setApprovedActionIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'tab1' | 'tab2' | 'tab3'>('tab1');

  // Fetch live Supabase data on mount
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
        
        // AI Health Score computation
        let newScore = 100;
        const unresolvedDelays = (delayData || []).filter((d: any) => d.impact_level === 'high' && !d.reason_details).length;
        newScore -= (unresolvedDelays * 5);
        
        const openDprs = (dprData || []).filter((d: any) => d.status === 'draft').length;
        if (openDprs > 10) newScore -= 5;
        
        setHealthScore(Math.max(0, newScore));
      }
    }).catch(err => {
      console.error('Error fetching dashboard live data:', err);
      if (active) setLiveProcurement(null);
    });

    return () => {
      active = false;
    };
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // 1. PERSONA & DATA RESOLUTION LAYER
  // ────────────────────────────────────────────────────────────────────────
  
  const persona = useMemo(() => {
    const isPurchase = activeRole === 'PR_TEAM';
    const isPMC = activeRole === 'PROJECT_MANAGER';
    const isDirector = activeRole === 'UPPER_MANAGEMENT';

    if (isDirector) return 'DIRECTOR';
    if (isPurchase) return 'PURCHASE';
    return 'PMC'; // default to PMC for any PROJECT_MANAGER or fallback
  }, [activeRole]);

  // General counts and stats
  const activeSites = useMemo(() => projects.filter(p => p.status === 'Active' || p.status === 'Delayed'), [projects]);
  const onTrackCount = useMemo(() => projects.filter(p => p.status === 'Active').length, [projects]);
  const adherenceRate = useMemo(() => {
    return activeSites.length > 0 ? Math.round((onTrackCount / activeSites.length) * 100) : 83;
  }, [activeSites, onTrackCount]);

  // ────────────────────────────────────────────────────────────────────────
  // §1 — health data resolver
  // ────────────────────────────────────────────────────────────────────────
  const healthKpis = useMemo(() => {
    switch (persona) {
      case 'DIRECTOR':
        return [
          { label: 'Revenue Realized', value: '₹84.6 Cr', detail: '+8.5% vs. Q2 billing target', icon: CircleDollarSign, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', link: '/finance', isPositive: true },
          { label: 'Cash Position', value: '₹12.4 Cr', detail: '₹45L overdue AR follows up today', icon: TrendingUp, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-455', link: '/finance', isPositive: false },
          { label: 'Schedule Adherence', value: `${adherenceRate}%`, detail: '2 critical path sites require review', icon: Clock3, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', link: '/projects', isPositive: true },
          { label: 'Safety Incidents', value: '0', detail: '45 safe days; zero warnings', icon: HardHat, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', link: '/safety-qc', isPositive: true }
        ];
      case 'PURCHASE': {
        const openReqsCount = (liveProcurement?.purchaseRequisitions?.length || 0) + (projects.reduce((acc, p) => acc + (p.procurements?.length || 0), 0));
        const overdueDeliveries = projects.reduce((acc, p) => acc + (p.procurements?.filter(pr => pr.status === 'RFQ_SENT' && pr.deliveryDate && new Date(pr.deliveryDate) < new Date()).length || 0), 0);
        const lowStockItems = projects.reduce((acc, p) => acc + (p.materials?.filter(m => m.quantity <= m.reorderLevel).length || 0), 0);
        return [
          { label: 'Open Requests', value: `${Math.max(14, openReqsCount)}`, detail: '6 PRs awaiting quote comparison', icon: ShoppingBag, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-455', link: '/procurement', isPositive: false },
          { label: 'Pipeline Committed', value: '₹3.2 Cr', detail: 'Liability up 12% on steel orders', icon: CircleDollarSign, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', link: '/procurement', isPositive: true },
          { label: 'Late Deliveries', value: `${Math.max(5, overdueDeliveries)}`, detail: '3 cement POs overdue by 4+ days', icon: Clock3, color: 'bg-rose-500/10 text-rose-605 dark:text-rose-400', link: '/procurement', isPositive: false },
          { label: 'Stockout Risks', value: `${Math.max(8, lowStockItems)}`, detail: 'Cement & sand below reorder trigger', icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-455', link: '/inventory', isPositive: false }
        ];
      }
      case 'PMC':
      default: {
        const unresolvedDelays = liveDelays.filter((d: any) => !d.reason_details).length || projects.reduce((acc, p) => acc + (p.delays?.filter(d => d.status !== 'Resolved').length || 0), 0);
        const pendingQC = projects.reduce((acc, p) => acc + (p.qcInspections?.filter(i => i.status === 'PENDING').length || 0), 0);
        return [
          { label: 'Schedule Adherence', value: `${adherenceRate}%`, detail: '2 critical path delays logged today', icon: Clock3, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', link: '/projects', isPositive: true },
          { label: 'DPR Compliance', value: '67%', detail: '3 sites missing yesterday\'s log', icon: FileText, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-450', link: '/activities', isPositive: true },
          { label: 'Unresolved Delays', value: `${Math.max(12, unresolvedDelays)}`, detail: '8 delays from subcontractor lag', icon: AlertCircle, color: 'bg-rose-500/10 text-rose-605 dark:text-rose-400', link: '/activities', isPositive: false },
          { label: 'QC Pending', value: `${Math.max(7, pendingQC)}`, detail: '4 core test reviews due tomorrow', icon: ClipboardCheck, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-455', link: '/safety-qc', isPositive: false }
        ];
      }
    }
  }, [persona, adherenceRate, onTrackCount, activeSites, projects, liveProcurement, liveDelays]);

  // ────────────────────────────────────────────────────────────────────────
  // §2 — AI Exceptions/Alerts
  // ────────────────────────────────────────────────────────────────────────
  const aiExceptions = useMemo(() => {
    const list: Array<{ id: string; severity: 'critical' | 'warning' | 'monitor'; text: string; tag: string }> = [];
    
    if (persona === 'DIRECTOR') {
      list.push({ id: 'dir-1', severity: 'critical', text: 'Steel price volatility could push Tower B budget ₹2.1 Cr over baseline allocation caps.', tag: 'Budget Impact' });
      list.push({ id: 'dir-2', severity: 'warning', text: 'MEP coordination sleeve error at Central Park requires rework, delaying phase completion by 14 days.', tag: 'Schedule Slippage' });
      list.push({ id: 'dir-3', severity: 'warning', text: 'TMT Steel supply delivery PO-2940 delayed by vendor, risking slab pour scheduled in 5 days.', tag: 'Vendor Risk' });
      list.push({ id: 'dir-4', severity: 'monitor', text: 'Workforce turnout logged 12% below planned threshold across 3 critical path projects.', tag: 'Labour Deficit' });
    } else if (persona === 'PURCHASE') {
      list.push({ id: 'pur-1', severity: 'critical', text: 'Cement stock at Orbit 4 covers only 3 days. Slab pour planned for Level 6 requires immediate delivery.', tag: 'Stockout Risk' });
      list.push({ id: 'pur-2', severity: 'warning', text: 'TMT Steel PO-8890 is overdue by 5 days. Vendor (Kamdhenu Steel) has not acknowledged dispatch.', tag: 'Overdue Delivery' });
      list.push({ id: 'pur-3', severity: 'warning', text: 'Quoted rate for Copper Wires from vendor RK Cables is 18% above BOQ benchmark cost cap.', tag: 'Rate Variance' });
      list.push({ id: 'pur-4', severity: 'monitor', text: 'Vendor performance score for Gujarat Cement fell to 68/100 due to late GRN receipts.', tag: 'Vendor Rating' });
    } else if (persona === 'PMC') {
      list.push({ id: 'pmc-1', severity: 'critical', text: 'Orbit 4 Level 5 Slab Pour is delayed 14 days due to late inspection clearance from structural engineer.', tag: 'Critical Path Slip' });
      list.push({ id: 'pmc-2', severity: 'warning', text: 'Pramukh Elegance and Skyline Corporate missed daily progress report entries for 2 consecutive days.', tag: 'DPR Non-Compliance' });
      list.push({ id: 'pmc-3', severity: 'warning', text: 'Concrete compressive strength test failed at Satva Office (Block B). Rework task assigned to contractor.', tag: 'QC Failure' });
      list.push({ id: 'pmc-4', severity: 'monitor', text: 'Cladding sub-contractor manpower headcount is 18% below plan at Central Park.', tag: 'Contractor Performance' });
    } else {
      // SITE_MANAGER
      list.push({ id: 'sm-1', severity: 'critical', text: 'Tower Crane #2 breakdown reported. Level 4 column concrete pouring is suspended.', tag: 'Equipment Breakdown' });
      list.push({ id: 'sm-2', severity: 'warning', text: 'Cement stock count is 120 bags. Available stock covers only today\'s scheduled blockwork.', tag: 'Material Shortage' });
      list.push({ id: 'sm-3', severity: 'warning', text: 'Pending review on Steel PR-0881 is blocking the scheduled supplier dispatch.', tag: 'Approval Hold' });
      list.push({ id: 'sm-4', severity: 'monitor', text: 'Mason attendance turnout is short by 5 heads today for internal plastering tasks.', tag: 'Workforce Shortage' });
    }
    
    return list;
  }, [persona]);

  // ────────────────────────────────────────────────────────────────────────
  // §3 — Blocked Decisions & Approvals Queue
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
  // §4 & §5 — Two-Column Grid: Portfolio Track & Money Track Data
  // ────────────────────────────────────────────────────────────────────────
  
  // Funnel data for Purchase role
  const purchaseFunnel = [
    { name: 'MR Submitted', count: 18, age: '1.2 days avg' },
    { name: 'PR Approved', count: 14, age: '2.5 days avg' },
    { name: 'PO Issued', count: 9, age: '4.1 days transit' },
    { name: 'GRN Completed', count: 22, age: 'Received' }
  ];



  // Delays list for PMC
  const pmcDelays = [
    { name: 'Tower B slab structure reinforcement', slip: '14 days delay', CP: true, assignee: 'Sub-contractor Lalit' },
    { name: 'Plaster drying block C', slip: '4 days delay', CP: false, assignee: 'Engineer Dave' },
    { name: 'Structural grade inspection approval', slip: '8 days delay', CP: true, assignee: 'PMC Controls Team' }
  ];

  // ────────────────────────────────────────────────────────────────────────
  // §10 — Forecast Charts Data
  // ────────────────────────────────────────────────────────────────────────
  
  const chartData1 = useMemo(() => {
    return [
      { name: 'Jan', value1: 12, value2: 10, value3: 85 },
      { name: 'Feb', value1: 28, value2: 24, value3: 82 },
      { name: 'Mar', value1: 45, value2: 42, value3: 79 },
      { name: 'Apr', value1: 70, value2: 65, value3: 81 },
      { name: 'May', value1: 105, value2: 98, value3: 88 },
      { name: 'Jun', value1: 144, value2: 132, value3: 91 },
    ];
  }, []);

  const chartData2 = useMemo(() => {
    return [
      { name: 'Week 1', value1: 180, value2: 120, value3: 90 },
      { name: 'Week 2', value1: 202, value2: 110, value3: 95 },
      { name: 'Week 3', value1: 196, value2: 134, value3: 105 },
      { name: 'Week 4', value1: 210, value2: 146, value3: 118 },
      { name: 'Week 5', value1: 208, value2: 152, value3: 124 },
      { name: 'Week 6', value1: 225, value2: 161, value3: 130 },
    ];
  }, []);

  const chartNames = useMemo(() => {
    if (persona === 'DIRECTOR') {
      return {
        tab1: { title: 'Budget Burn', desc: 'Actual vs Baseline spend (₹ Crores)', key1: 'actual', key2: 'budget', name1: 'Actual Spend', name2: 'Baseline Budget' },
        tab2: { title: 'Workforce Stack', desc: 'Active workforce headcount trend by site', key1: 'Central Park', key2: 'Orbit 4', name1: 'Central Park', name2: 'Orbit 4' },
        tab3: { title: 'Delay Risks', desc: 'AI Risk Rating (%) vs Delay Days per site', key1: 'delayDays', key2: 'riskScore', name1: 'Delay (Days)', name2: 'AI Risk (%)' }
      };
    } else if (persona === 'PURCHASE') {
      return {
        tab1: { title: 'Cycle Time', desc: 'Average MR to PO processing time (days)', key1: 'actual', name1: 'Cycle Time (Days)' },
        tab2: { title: 'Committed vs Budget', desc: 'Procurement committed liabilities vs budget (₹ Cr)', key1: 'actual', key2: 'budget', name1: 'Committed Spend', name2: 'Baseline Limit' },
        tab3: { title: 'Vendor Timeliness', desc: 'On-time delivery performance rating (%)', key1: 'value3', name1: 'On-Time delivery rate' }
      };
    } else {
      // PMC / Fallback
      return {
        tab1: { title: 'Earned Value', desc: 'SPI / CPI indices progression chart', key1: 'actual', key2: 'budget', name1: 'SPI Index', name2: 'CPI Index' },
        tab2: { title: 'Delay Trends', desc: 'Open delays vs closed delay resolutions', key1: 'Central Park', key2: 'Orbit 4', name1: 'Open Delays', name2: 'Resolved Delays' },
        tab3: { title: 'QC Pass Yield', desc: 'QC first-pass inspection success rate (%)', key1: 'value3', name1: 'First-pass Yield %' }
      };
    }
  }, [persona]);

  // ────────────────────────────────────────────────────────────────────────
  // §11 — Activity Feed Timeline
  // ────────────────────────────────────────────────────────────────────────
  const activityFeed = useMemo(() => {
    const list: Array<{ id: string; time: string; text: string; subtext: string; type: string }> = [];

    if (persona === 'DIRECTOR') {
      list.push({ id: 'act-1', time: '12 min ago', text: 'Vikram Patel approved Cement Purchase Requisition (PR-0272)', subtext: 'Procurement · Central Park', type: 'procurement' });
      list.push({ id: 'act-2', time: '1 hr ago', text: 'Priya Nair uploaded Daily Progress Report for Central Park', subtext: 'Execution · Today\'s turnout logged as 142', type: 'execution' });
      list.push({ id: 'act-3', time: 'Today, 08:30', text: 'AI Portfolio health score re-computed to 86/100', subtext: 'System Audit · All metrics updated', type: 'system' });
      list.push({ id: 'act-4', time: 'Yesterday', text: 'QC Inspection template created for Tower B Slab', subtext: 'Safety & QC · Created by Inspector Dave', type: 'quality' });
      list.push({ id: 'act-5', time: 'Yesterday', text: 'Rohan Mehta flagged a critical schedule delay at Orbit 4', subtext: 'Execution · 14 days delay impact on Level 4 Slab Pour', type: 'delay' });
    } else if (persona === 'PURCHASE') {
      list.push({ id: 'act-p-1', time: '5 min ago', text: 'Material Request MR-990 submitted for review', subtext: 'Site Manager · Orbit 4 · 500 Bags Cement', type: 'procurement' });
      list.push({ id: 'act-p-2', time: '40 min ago', text: 'Quotation submitted by Kamdhenu Steel for PR-1002', subtext: 'Vendors · Pending rate comparison', type: 'procurement' });
      list.push({ id: 'act-p-3', time: '2 hrs ago', text: 'PO-8841 issued to Gujarat Cables for electrical panels', subtext: 'Committed Liability · Value ₹4.2 Lakhs', type: 'procurement' });
      list.push({ id: 'act-p-4', time: 'Yesterday', text: 'GRN completed for Sand Delivery at Satva Office site', subtext: 'Inventory · 12 Tons received on site', type: 'procurement' });
    } else {
      // PMC / Fallback
      list.push({ id: 'act-pm-1', time: '10 min ago', text: 'Daily Progress Report submitted by Engineer Priya Nair', subtext: 'Central Park · Level 4 Columns Completed', type: 'execution' });
      list.push({ id: 'act-pm-2', time: '1 hr ago', text: 'QC checklist inspection failed for concrete pour', subtext: 'Skyline Hub · Block A Column 12', type: 'quality' });
      list.push({ id: 'act-pm-3', time: '3 hrs ago', text: 'Delay event reported: Structural drawings hold', subtext: 'Pramukh Elegance · Level 2 slab', type: 'delay' });
      list.push({ id: 'act-pm-4', time: 'Yesterday', text: 'Milestone reached: Block B excavation completion', subtext: 'Satva Office · Approved by PMC controls', type: 'execution' });
    }

    return list;
  }, [persona]);

  return (
    <div className="space-y-6 pb-10">
      
      {/* ────────────────────────────────────────────────────────────────────────
          §1 — "How healthy is everything right now?"
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {healthKpis.map((kpi, idx) => {
          const IconComponent = kpi.icon;
          return (
            <Link key={idx} href={kpi.link} className="group rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-300 hover:shadow-premium hover:border-primary/45">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{kpi.label}</p>
                  <p className="mt-2 text-2xl md:text-3xl font-mono font-extrabold text-foreground group-hover:text-primary transition-colors">
                    {kpi.value}
                  </p>
                  <div className={`mt-2 flex items-center gap-1 text-xs font-bold ${kpi.isPositive ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'}`}>
                    <span>{kpi.detail}</span>
                  </div>
                </div>
                <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${kpi.color}`}>
                  <IconComponent className="h-5 w-5" />
                </span>
              </div>
            </Link>
          );
        })}
      </section>



      {/* ────────────────────────────────────────────────────────────────────────
          §2 — Pending Approvals & Decisions
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Pending Approvals & Decisions</h2>
            <span className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {rawDecisions.filter(d => !approvedActionIds.includes(d.id)).length}
            </span>
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
          §3 — Portfolio Status (Visible Immediately)
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">
              {persona === 'PURCHASE' ? 'Procurement Pipeline Status' : 'Portfolio Status'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Active tasks status tracking and stage gates.</p>
          </div>
          <Link href={persona === 'PURCHASE' ? '/procurement' : '/projects'} className="group flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
            {persona === 'PURCHASE' ? 'Full procurement' : 'All sites'} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {persona === 'PURCHASE' ? (
          <div className="grid grid-cols-2 gap-4">
            {purchaseFunnel.map((f, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-border bg-muted/20">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">{f.name}</p>
                <p className="mt-2 text-2xl font-mono font-black text-foreground">{f.count}</p>
                <p className="text-xs text-primary font-semibold mt-1">{f.age}</p>
              </div>
            ))}
          </div>
        ) : persona === 'PMC' ? (
          <div className="space-y-3">
            {pmcDelays.map((d, idx) => (
              <div key={idx} className="p-3.5 rounded-xl border border-border bg-muted/20 flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    {d.name}
                    {d.CP && <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" title="Critical Path Impact"></span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Assignee: {d.assignee}</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded flex-shrink-0">
                  {d.slip}
                </span>
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
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          §4 — Quality Compliance & Delay Attribution Ledger (PMC & Director)
          ──────────────────────────────────────────────────────────────────────── */}
      {(persona === 'PMC' || persona === 'DIRECTOR') && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-500" />
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Quality Compliance & Delay Attribution</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Structural test non-conformances and contractual delay root-causes.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/qc" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                Quality Logs →
              </Link>
              <span className="text-border">|</span>
              <Link href="/rework" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                Rework Center →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Left: Delay Attribution Chart (5 cols) */}
            <div className="md:col-span-5 p-4 rounded-xl border border-border bg-muted/20 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-primary">Delay Root-Causes</span>
                <h3 className="text-sm font-bold text-foreground mt-1">Contractual Slip Attribution</h3>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-muted-foreground font-semibold">Subcontractor Execution</span>
                    <span className="font-mono font-bold text-foreground">55%</span>
                  </div>
                  <div className="w-full bg-border/50 h-2 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full" style={{ width: '55%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-muted-foreground font-semibold">Client Approvals / Decisions</span>
                    <span className="font-mono font-bold text-foreground">30%</span>
                  </div>
                  <div className="w-full bg-border/50 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full" style={{ width: '30%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-muted-foreground font-semibold">Material Stockouts</span>
                    <span className="font-mono font-bold text-foreground">15%</span>
                  </div>
                  <div className="w-full bg-border/50 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: '15%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Active Quality NCRs (7 cols) */}
            <div className="md:col-span-7 p-4 rounded-xl border border-border bg-muted/20">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">Critical Quality Non-Conformances (NCR)</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-4 p-2.5 rounded-lg border border-border bg-card">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600">Failed</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Tower B</span>
                    </div>
                    <p className="text-xs font-bold text-foreground mt-1.5 leading-snug">Concrete Cube Test failed core strength target at Level 5 Columns.</p>
                  </div>
                  <span className="text-[10px] font-black uppercase text-rose-600 flex-shrink-0">Rework Drafted</span>
                </div>

                <div className="flex justify-between items-start gap-4 p-2.5 rounded-lg border border-border bg-card">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600">Pending</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Orbit 4</span>
                    </div>
                    <p className="text-xs font-bold text-foreground mt-1.5 leading-snug">Waterproofing membrane pinhole check failed at basement slab.</p>
                  </div>
                  <span className="text-[10px] font-black uppercase text-amber-600 flex-shrink-0">Re-inspecting</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          §5 — Material Shortage & Schedule Risk Panel (Purchase & PMC)
          ──────────────────────────────────────────────────────────────────────── */}
      {(persona === 'PURCHASE' || persona === 'PMC') && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Material Shortage & Schedule Risk</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Active stockout risks that threaten execution schedule on the critical path.</p>
              </div>
            </div>
            <Link href="/inventory" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
              Inventory Ledger →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Risk item 1 */}
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-l-4 border-border/50 border-l-rose-500 bg-rose-500/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-450 bg-rose-500/10">Critical Stockout</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Orbit 4</span>
                </div>
                <p className="mt-2 text-xs font-bold text-foreground leading-snug">
                  OPC 53 Cement covers only 2 days. Slab pour planned in 4 days will halt.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">In-transit PO-1088 expected in 5 days (1-day late gap).</p>
              </div>
            </div>

            {/* Risk item 2 */}
            <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-l-4 border-border/50 border-l-amber-500 bg-amber-500/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-455 bg-amber-500/10">Warning Delay</span>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Central Park</span>
                </div>
                <p className="mt-2 text-xs font-bold text-foreground leading-snug">
                  TMT Steel stock covers 5 days. Tower Crane breakdown slows unloading rate.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Slab reinforcement steel task on critical path at risk.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          §6 — Quotation Loop & Three-Way Match Tracker (Purchase Only)
          ──────────────────────────────────────────────────────────────────────── */}
      {persona === 'PURCHASE' && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Quotation Loop & Three-Way Match</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Active vendor bidding status and billing verification exceptions.</p>
              </div>
            </div>
            <Link href="/vendors" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
              Vendor Registry →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Bid loop status */}
            <div className="p-4.5 rounded-xl border border-border bg-muted/20">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">Open Bidding Loops</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-foreground">Electrical Panels PR-1002</p>
                    <p className="text-[10px] text-muted-foreground">Orbit 4 · 3 suppliers invited</p>
                  </div>
                  <span className="font-mono font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded">2/3 Bids Recv</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-foreground">Structural Steel PR-1088</p>
                    <p className="text-[10px] text-muted-foreground">Central Park · 4 suppliers invited</p>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">4/4 Bids Recv</span>
                </div>
              </div>
            </div>

            {/* 3-way match exceptions */}
            <div className="p-4.5 rounded-xl border border-border bg-muted/20">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/50 pb-2 mb-3">3-Way Match Exceptions</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-foreground">Sand Invoice INV-892</p>
                    <p className="text-[10px] text-rose-605 font-medium">Quantity variance: GRN shows 10T vs PO 12T</p>
                  </div>
                  <span className="font-mono font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded">Price Hold</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-foreground">Cement Invoice INV-4022</p>
                    <p className="text-[10px] text-rose-605 font-medium">Rate variance: ₹410/bag vs PO ₹395/bag</p>
                  </div>
                  <span className="font-mono font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded">Rate Hold</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          §7 & §8 — Financial Health, Budget & Margin Profitability (At the bottom)
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* §7 — Financial Health & Budget */}
        <div className={`rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between ${persona === 'DIRECTOR' ? 'xl:col-span-6' : 'xl:col-span-12'}`}>
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Financial Health & Budget</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Budget vs Actuals, commitment and liability tracker.</p>
              </div>
              <Link href="/budget" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                Cost codes →
              </Link>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-xl">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">CPI (Cost Performance)</p>
                  <p className="text-2xl font-mono font-extrabold text-foreground mt-1">0.94</p>
                </div>
                <div className="w-10 h-10 rounded-full border-4 border-amber-500 flex items-center justify-center text-[10px] font-black text-amber-600">
                  94%
                </div>
              </div>

              <div className="p-3.5 bg-muted/10 border border-border/40 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground">Committed Pipeline</span>
                  <span className="font-mono font-bold text-foreground">₹3.2 Cr</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground">Outstanding Payables</span>
                  <span className="font-mono font-bold text-foreground">₹1.8 Cr</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground">Spent to Date</span>
                  <span className="font-mono font-bold text-foreground">₹24.6 Cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* §8 — Project Profitability & Margin Control (Director Only, side-by-side with Financial Health) */}
        {persona === 'DIRECTOR' && (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                  <div>
                    <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Margin Control</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Real-time margin, realization and quality loss.</p>
                  </div>
                </div>
                <Link href="/finance" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                  Ledger →
                </Link>
              </div>

              <div className="space-y-3.5">
                <div className="p-3 bg-muted/20 border border-border rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Gross Margin</p>
                    <p className="font-semibold mt-0.5 text-foreground">Projected Actual vs Target</p>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">20.8% / 22.4%</span>
                </div>

                <div className="p-3 bg-muted/20 border border-border rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Realization Yield</p>
                    <p className="font-semibold mt-0.5 text-foreground">Collected vs Billed (AR)</p>
                  </div>
                  <span className="font-mono font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded">85.4% (₹21.2Cr)</span>
                </div>

                <div className="p-3 bg-muted/20 border border-border rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-rose-600 uppercase">Rework Leakage</p>
                    <p className="font-semibold mt-0.5 text-foreground">Concrete & sleeve rework waste</p>
                  </div>
                  <span className="font-mono font-bold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded">₹22.6 Lakhs</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          §9 & §10 — Two-Column Grid: Supply Chain & Site Operations
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        
        {/* §9 — Supply Chain Health (Expanded) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Supply Chain & Logistics</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Active procurement metrics, lead times, and incoming deliveries.</p>
              </div>
              <Link href="/inventory" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                Stock Ledger →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Card 1: Inventory Levels */}
              <div className="p-3.5 border border-border rounded-xl bg-muted/20 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Inventory Levels</span>
                <div className="space-y-1.5 mt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-foreground">TMT Steel</span>
                    <span className="font-mono text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">6 Days Cover</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-foreground">OPC Cement</span>
                    <span className="font-mono text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded">3 Days Cover</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Active Pipelines */}
              <div className="p-3.5 border border-border rounded-xl bg-muted/20 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Active Pipelines</span>
                <div className="space-y-1.5 mt-2 flex flex-col justify-center h-full">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Pending PRs</span>
                    <span className="font-mono font-bold text-foreground">14 Requests</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1.5">
                    <span className="text-muted-foreground">Pending POs</span>
                    <span className="font-mono font-bold text-foreground">8 Orders</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Late & Vendor Delays */}
              <div className="p-3.5 border border-border rounded-xl bg-muted/20 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 px-1.5 py-0.5 rounded uppercase max-w-max">Transit Deviations</span>
                <div className="space-y-1 mt-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Late Deliveries</span>
                    <span className="font-mono font-bold text-rose-605">5 POs Overdue</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">3 vendors running 4+ days late</span>
                </div>
              </div>

              {/* Card 4: Incoming Deliveries */}
              <div className="p-3.5 border border-border rounded-xl bg-muted/20 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase max-w-max">Incoming Deliveries</span>
                <div className="mt-2">
                  <p className="text-xs font-bold text-foreground">24 Tons Structural Steel</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Tata Steel · ETA Tomorrow</p>
                </div>
              </div>

              {/* Card 5: Lead Time Cycle */}
              <div className="p-3.5 border border-border rounded-xl bg-muted/20 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Lead Time Cycle</span>
                <div className="mt-2">
                  <p className="text-xl font-mono font-extrabold text-foreground">8.4 Days</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Average MR-to-GRN duration</p>
                </div>
              </div>

              {/* Card 6: Material Shortage Risk */}
              <div className="p-3.5 border border-border rounded-xl bg-muted/20 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded uppercase max-w-max">Shortage Risk</span>
                <div className="mt-2">
                  <p className="text-xs font-bold text-foreground">High Risk: Conduits</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">Supply constraints on fixture classes</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* §10 — Site Operations Health */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Site Operations & Compliance</h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Checks registry, checklists pass rate, and site documentation.</p>
              </div>
              <Link href="/safety-qc" className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                Inspections →
              </Link>
            </div>

            <div className="space-y-3.5">
              <div className="flex justify-between items-center bg-muted/20 border border-border p-3.5 rounded-xl text-xs">
                <span className="font-semibold text-muted-foreground">QC Inspections Pass Yield</span>
                <span className="font-mono font-extrabold text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded">91.4% Passed</span>
              </div>

              <div className="flex justify-between items-center bg-muted/20 border border-border p-3.5 rounded-xl text-xs">
                <span className="font-semibold text-muted-foreground">DPR Submission Status</span>
                <span className="font-mono font-extrabold text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded">6/9 Logged Today</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          §8 — "Are my resources ready?"
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* Left Resource Column: People */}
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border/60 pb-3 mb-4">
            <Users2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider font-heading">Resource Status (Labour)</h2>
              <p className="text-[10px] text-muted-foreground font-semibold">Workforce present headcount vs scheduled.</p>
            </div>
          </div>
          <div className="space-y-3.5">
            <div className="flex justify-between items-center bg-muted/40 p-3 rounded-xl border border-border/50">
              <span className="text-xs font-semibold text-muted-foreground">Labour Headcount</span>
              <strong className="text-sm font-mono font-black text-foreground">486 / 550 present</strong>
            </div>
            <div className="flex items-start gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-500 px-3 py-2.5 rounded-xl border border-amber-500/15 text-xs font-bold">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Satva Office is 15% under-resourced for cladding phase. Mason turnout is low.</span>
            </div>
          </div>
        </article>

        {/* Right Resource Column: Equipment */}
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-border/60 pb-3 mb-4">
            <Wrench className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider font-heading">Resource Status (Equipment)</h2>
              <p className="text-[10px] text-muted-foreground font-semibold">Active machinery and operational items count.</p>
            </div>
          </div>
          <div className="space-y-3.5">
            <div className="flex justify-between items-center bg-muted/40 p-3 rounded-xl border border-border/50">
              <span className="text-xs font-semibold text-muted-foreground">Machinery Fleet Status</span>
              <strong className="text-sm font-mono font-black text-foreground">14 active · 2 idle · 1 breakdown</strong>
            </div>
            <div className="flex items-start gap-2 bg-rose-500/10 text-rose-600 dark:text-rose-450 px-3 py-2.5 rounded-xl border border-rose-500/15 text-xs font-bold">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Excavator #2 breakdown reported at Central Park. Repair ticket scheduled.</span>
            </div>
          </div>
        </article>
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          §9 — "What deadlines are approaching?"
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3 mb-4">
          <Calendar className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Upcoming Milestones & Deadlines</h2>
            <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Approaching milestones, delivery dates, and inspections in the next 14 days.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded uppercase">3 Days Left</span>
            </div>
            <p className="mt-3 text-xs font-bold text-foreground">Level 4 slab reinforcement steel inspection</p>
            <p className="text-[9px] text-muted-foreground mt-1">Orbit 4 · QC Inspector Dave</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded uppercase">5 Days Left</span>
            </div>
            <p className="mt-3 text-xs font-bold text-foreground">Expected Cement Delivery PO-2248</p>
            <p className="text-[9px] text-muted-foreground mt-1">Central Park · Gujarat Cement</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded uppercase">11 Days Left</span>
            </div>
            <p className="mt-3 text-xs font-bold text-foreground">Level 5 columns concrete pouring completion</p>
            <p className="text-[9px] text-muted-foreground mt-1">Satva Office · Contractor Shreeji</p>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          §10 — "Where are things heading?"
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4 mb-5">
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">Predictive Forecasts & Trends</h2>
            <p className="mt-0.5 text-xs text-muted-foreground font-semibold">Forecasts, burn velocities, and productivity trends.</p>
          </div>
          <div className="flex gap-1.5 bg-muted/65 p-1 rounded-xl border border-border/40">
            <button
              onClick={() => setActiveChartTab('tab1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeChartTab === 'tab1' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {chartNames.tab1.title}
            </button>
            <button
              onClick={() => setActiveChartTab('tab2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeChartTab === 'tab2' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {chartNames.tab2.title}
            </button>
            <button
              onClick={() => setActiveChartTab('tab3')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeChartTab === 'tab3' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {chartNames.tab3.title}
            </button>
          </div>
        </div>

        <div className="h-72 min-h-0 w-full">
          {activeChartTab === 'tab1' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData1} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#b68d40" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#b68d40" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.5)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px', border: '1px solid var(--border)' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="value2" stroke="#b68d40" strokeWidth={2.5} fillOpacity={1} fill="url(#gradActual)" name={chartNames.tab1.name1} />
                {chartNames.tab1.key2 && (
                  <Area type="monotone" dataKey="value1" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" fill="none" name={chartNames.tab1.name2} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'tab2' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData2} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.5)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="value1" fill="#b68d40" radius={[4, 4, 0, 0]} name={chartNames.tab2.name1} />
                <Bar dataKey="value2" fill="#3b82f6" radius={[4, 4, 0, 0]} name={chartNames.tab2.name2} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'tab3' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData1} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--border), 0.5)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="value3" stroke="#ef4444" strokeWidth={2.5} name={chartNames.tab3.name1} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────────────
          §11 — "What just happened?"
          ──────────────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4 mb-4">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider font-heading">Recent System Activity</h2>
            <p className="text-[10px] text-muted-foreground font-semibold">Timeline of recent events and system transactions.</p>
          </div>
        </div>

        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {activityFeed.map((activity) => (
            <div key={activity.id} className="flex gap-4.5 items-start">
              <span className="text-[10px] font-mono font-bold text-muted-foreground min-w-[70px] pt-0.5">{activity.time}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0"></div>
              <div>
                <p className="text-xs font-bold text-foreground">{activity.text}</p>
                <p className="text-[10px] text-muted-foreground">{activity.subtext}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

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
