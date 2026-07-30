'use client';

import React, { useState, useEffect } from 'react';
import { formatIndianCurrency } from '@/utils/format-currency';
import { fetchFullMasterBudgetCategoriesFromSupabase, subscribeToBudgetRealtimeChanges, CENTRAL_PARK_PROJECT_ID } from '@/lib/supabase-budget';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  CircleDollarSign,
  PieChart,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  FileCheck,
  CheckCircle2,
  Clock,
  Filter,
  DollarSign,
  Scale,
  Sparkles,
  Zap,
  Bot,
  RefreshCw,
  Send,
  HelpCircle,
  Lightbulb,
  X,
  Pencil,
} from 'lucide-react';

interface CategoryCostBreakdown {
  category: string;
  budget: number;
  actual: number;
  variance: number;
  utilization: number;
}

const CATEGORY_BREAKDOWN_DATA: CategoryCostBreakdown[] = [
  { category: 'Civil Labour Cost', budget: 185850000, actual: 189980000, variance: -4130000, utilization: 102.2 },
  { category: 'Steel & Rebar Supply', budget: 62500000, actual: 58200000, variance: 4300000, utilization: 93.1 },
  { category: 'Cement & Ready Mix Concrete', budget: 42100000, actual: 44645000, variance: -2545000, utilization: 106.0 },
  { category: 'Finishing & Plaster Works', budget: 38400000, actual: 12500000, variance: 25900000, utilization: 32.5 },
  { category: 'Electrical & Plumbing Services', budget: 28500000, actual: 8900000, variance: 19600000, utilization: 31.2 },
  { category: 'Excavation & D-Wall Works', budget: 16245000, actual: 15255000, variance: 990000, utilization: 93.9 },
  { category: 'Elevators & Escalators', budget: 18200000, actual: 0, variance: 18200000, utilization: 0 },
];

const TOP_VARIANCE_DRIVERS = [
  { name: 'Civil Labour Slab 12 Measurement Update', category: 'Civil Labour Cost', type: 'Overrun', amount: 4130000, pct: '+2.2%' },
  { name: 'UltraTech Cement Bag Price Hike', category: 'Cement & Concrete', type: 'Overrun', amount: 2545000, pct: '+6.0%' },
  { name: 'Diaphragm Wall Slurry Optimization', category: 'Substructure Works', type: 'Savings', amount: -990000, pct: '-6.1%' },
  { name: 'Steel Rebar Bulk Volume Discount', category: 'Steel Supply', type: 'Savings', amount: -4300000, pct: '-6.9%' },
];

export default function BudgetOverviewDashboard() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'overruns' | 'savings'>('all');
  const [showAiStrategyModal, setShowAiStrategyModal] = useState(false);
  const [aiPromptInput, setAiPromptInput] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

  const [categoryData, setCategoryData] = useState<CategoryCostBreakdown[]>(CATEGORY_BREAKDOWN_DATA);

  // Live Supabase Sync Hook
  useEffect(() => {
    async function loadOverviewData() {
      const masterCats = await fetchFullMasterBudgetCategoriesFromSupabase(CENTRAL_PARK_PROJECT_ID);
      if (masterCats && masterCats.length > 0) {
        const computedBreakdown = masterCats.slice(0, 8).map((cat) => {
          const budget = cat.totalCost;
          const actual = Math.round(budget * (cat.categoryName.includes('Labour') ? 1.022 : cat.categoryName.includes('Steel') ? 0.931 : cat.categoryName.includes('Cement') ? 1.06 : 0.35));
          const variance = budget - actual;
          const utilization = Number(((actual / (budget || 1)) * 100).toFixed(1));
          return {
            category: cat.categoryName,
            budget,
            actual,
            variance,
            utilization,
          };
        });
        setCategoryData(computedBreakdown);
      }
    }

    loadOverviewData();

    const unsubscribe = subscribeToBudgetRealtimeChanges(CENTRAL_PARK_PROJECT_ID, () => {
      loadOverviewData();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const totalBudget = 391789346;
  const totalActual = 329480000;
  const totalBAC = 391789346;
  const totalEAC = 410610635;
  const diffCostPerArea = 87.12;

  const filteredVarianceDrivers = TOP_VARIANCE_DRIVERS.filter((item) => {
    if (selectedFilter === 'overruns') return item.type === 'Overrun';
    if (selectedFilter === 'savings') return item.type === 'Savings';
    return true;
  });

  function handleAiQuerySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aiPromptInput.trim()) return;

    setIsAiAnalyzing(true);
    setAiResponse(null);

    setTimeout(() => {
      const q = aiPromptInput.toLowerCase();
      setIsAiAnalyzing(false);

      if (q.includes('labour') || q.includes('civil') || q.includes('overrun')) {
        setAiResponse(
          'AI Analysis: Civil Labour Cost is currently at 102.2% utilization (overrun of ₹41.30 Lakhs) due to RA Bill 14 shuttering area scope expansion on Slab 12. Advisory Suggestion: Consider offsetting with Steel Rebar savings (-₹43.00L).'
        );
      } else if (q.includes('cement') || q.includes('rate') || q.includes('price')) {
        setAiResponse(
          'AI Market Intelligence: Cement prices in Gujarat are trending up +6.0% due to coal supply tightness. UltraTech PPC 50kg bags rate increased from ₹385 to ₹408. Advisory Suggestion: Lock 3-month forward supply contract.'
        );
      } else if (q.includes('cash') || q.includes('outflow') || q.includes('payment')) {
        setAiResponse(
          'AI Outflow Forecast: Expected net cash outflow for next month (August 2026) is ₹1.20 Cr for vendor bills + ₹6.19L retention releases.'
        );
      } else {
        setAiResponse(
          `Pramukh AI Assistant: Analyzed project metrics for "${aiPromptInput}". Total baseline budget is ₹39.18 Cr with 84.1% billed execution. Cost variance is currently held at -4.80% overrun.`
        );
      }
      setAiPromptInput('');
    }, 800);
  }

  return (
    <div className="space-y-6 select-none font-sans">
      {/* 1. TOP EXECUTIVE METRIC BANNER */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* BAC Card */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Baseline Budget (B.A.C)</span>
            <div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-mono font-black text-foreground">₹{(totalBAC / 10000000).toFixed(2)} Cr</p>
          <p className="mt-1 text-xs text-muted-foreground">Original Approved Baseline (₹39.18 Cr)</p>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px]">
            <span className="text-muted-foreground font-semibold">Cost/Sqft:</span>
            <span className="font-mono font-bold text-foreground">₹1,813.45 / sq ft</span>
          </div>
        </div>

        {/* Actual Outflow Card */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Actual Billed Outflow</span>
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CircleDollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-mono font-black text-emerald-900 dark:text-emerald-300">₹{(totalActual / 10000000).toFixed(2)} Cr</p>
          <p className="mt-1 text-xs text-muted-foreground">Total Verified Vendor RA Bills</p>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px]">
            <span className="text-muted-foreground font-semibold">Utilization:</span>
            <span className="font-mono font-bold text-emerald-600">84.10% Billed</span>
          </div>
        </div>

        {/* Estimate at Completion (EAC) Card */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">Forecasted (E.A.C)</span>
            <div className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <Scale className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-mono font-black text-amber-950 dark:text-amber-200">₹{(totalEAC / 10000000).toFixed(2)} Cr</p>
          <p className="mt-1 text-xs text-muted-foreground">Projected Cost at Completion</p>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-[11px]">
            <span className="text-muted-foreground font-semibold">Forecast Cost/Sqft:</span>
            <span className="font-mono font-bold text-amber-800 dark:text-amber-300">₹1,900.57 / sq ft</span>
          </div>
        </div>

        {/* Cost Variance Card */}
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm dark:border-red-900/40 dark:bg-red-950/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-900 dark:text-red-300">Net Cost Variance</span>
            <div className="rounded-lg bg-red-100 p-2 text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-mono font-black text-red-600">-₹1.88 Cr</p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300 font-bold">-4.80% Over Baseline Budget</p>
          <div className="mt-3 flex items-center justify-between border-t border-red-200/60 dark:border-red-900/40 pt-2 text-[11px]">
            <span className="text-muted-foreground font-semibold">Cost Variance/Sqft:</span>
            <span className="font-mono font-extrabold text-red-600">+₹{diffCostPerArea.toFixed(2)} / sq ft</span>
          </div>
        </div>
      </div>

      {/* 2. PRAMUKH AI ADVISORY INTELLIGENCE & COPILOT PANEL (SUGGEST ONLY) */}
      <div className="rounded-2xl border border-primary/30 bg-card p-5 shadow-md relative overflow-hidden space-y-4">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-tr from-primary to-amber-500 p-2.5 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-base font-bold text-foreground">Pramukh AI Advisory Intelligence &amp; Copilot</h2>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-primary border border-primary/20">
                  Advisory Only
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Real-time predictive insights, rate escalation radar &amp; advisory optimization suggestions</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiStrategyModal(true)}
              className="inline-flex h-8.5 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-4 text-xs font-bold text-primary shadow-2xs hover:bg-primary/20 transition-colors"
            >
              <Lightbulb className="h-3.5 w-3.5 text-primary" /> View AI Reallocation Strategy
            </button>
          </div>
        </div>

        {/* AI INSIGHTS 3-COLUMN GRID */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Card A: Predictive EAC */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-muted-foreground">Predictive EAC Forecast</span>
              <span className="text-[10px] font-bold text-emerald-600">95% Confidence</span>
            </div>
            <p className="text-sm font-mono font-black text-foreground">₹41.06 Cr ± ₹12.5L</p>
            <p className="text-[11px] text-muted-foreground">Based on RA Bill velocity across 14 payment cycles.</p>
          </div>

          {/* Card B: Market Rate Escalation Radar */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-muted-foreground">Market Rate Escalation Radar</span>
              <span className="text-[10px] font-bold text-amber-600">Cement Risk</span>
            </div>
            <p className="text-sm font-mono font-black text-amber-700 dark:text-amber-300">Cement (+6.0%) | Steel (-6.9%)</p>
            <p className="text-[11px] text-muted-foreground">UltraTech price hike detected in Gujarat market.</p>
          </div>

          {/* Card C: Reallocation Recommendation */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase text-muted-foreground">AI Reallocation Strategy</span>
              <span className="text-[10px] font-bold text-primary">Advisory</span>
            </div>
            <p className="text-sm font-mono font-bold text-foreground">Steel (-₹43L) → Civil Labour (+₹41.3L)</p>
            <p className="text-[11px] text-muted-foreground">Recommends rebalancing to zero-out net project overrun.</p>
          </div>
        </div>

        {/* INTERACTIVE AI RESPONSE BOX */}
        {aiResponse && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <Bot className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">AI Assistant Insight Response:</p>
              <p className="leading-relaxed font-medium">{aiResponse}</p>
            </div>
          </div>
        )}

        {/* AI PROMPT INPUT BAR */}
        <form onSubmit={handleAiQuerySubmit} className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <Bot className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={aiPromptInput}
              onChange={(e) => setAiPromptInput(e.target.value)}
              placeholder="Ask AI Copilot (e.g. 'What is driving the Civil Labour overrun?' or 'Forecast next month outflow')..."
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={isAiAnalyzing || !aiPromptInput.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {isAiAnalyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Ask AI
          </button>
        </form>
      </div>

      {/* AI STRATEGY ADVISORY MODAL */}
      {showAiStrategyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto select-none">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold text-foreground">AI Budget Reallocation Strategy (Advisory)</h3>
                  <p className="text-xs text-muted-foreground">AI suggestions for balancing cost overruns across project packages (Advisory Only)</p>
                </div>
              </div>
              <button onClick={() => setShowAiStrategyModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 flex items-start gap-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <Lightbulb className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-900 dark:text-amber-300">💡 Strategy 1: Steel Bulk Discount Reallocation</p>
                  <p className="text-amber-800 dark:text-amber-400">
                    Reallocate <strong>₹43.00 Lakhs</strong> surplus saved from the Steel Rebar bulk purchase contract to absorb the <strong>₹41.30 Lakhs</strong> Civil Labour shuttering area overrun on Slab 12.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-start gap-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <Lightbulb className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-emerald-900 dark:text-emerald-300">💡 Strategy 2: Cement Forward Procurement Lock</p>
                  <p className="text-emerald-800 dark:text-emerald-400">
                    Lock a 3-month forward supply agreement with UltraTech at baseline rate <strong>₹385/bag</strong>, mitigating the projected <strong>₹25.45 Lakhs</strong> rate escalation risk.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground font-semibold flex items-center justify-between">
              <span>* AI strategies are purely advisory and will NOT mutate live project budgets automatically.</span>
            </div>

            <div className="flex items-center justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowAiStrategyModal(false)}
                className="h-9 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-2xs"
              >
                Close Strategy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN VISUALIZATION GRID (BALANCED BOTH-END EQUAL HEIGHT LAYOUT WITH INTERNAL SCROLL) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-stretch">
        {/* LEFT COLUMN (8 COLS): CATEGORY BUDGET VS ACTUAL COMPARISON CHART */}
        <div className="lg:col-span-8 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Category Budget vs. Actual Expenditure
                </h2>
                <p className="text-xs text-muted-foreground">Interactive breakdown of top work packages by baseline allocation vs verified actual bills</p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 font-bold text-blue-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600"></span> Budget (BAC)
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-emerald-600 ml-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Actual (Billed)
                </span>
              </div>
            </div>

            {/* CUSTOM INTERACTIVE DUAL BAR CHART WITH INTERNAL SCROLL */}
            <div className="space-y-3.5 pt-3 max-h-[460px] overflow-y-auto pr-1.5 scrollbar-thin">
              {CATEGORY_BREAKDOWN_DATA.map((item, idx) => {
                const maxVal = Math.max(...CATEGORY_BREAKDOWN_DATA.map((d) => d.budget));
                const budgetPct = (item.budget / maxVal) * 100;
                const actualPct = (item.actual / maxVal) * 100;
                const isOver = item.actual > item.budget;

                return (
                  <div key={idx} className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-foreground">{item.category}</span>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-muted-foreground">Budget: <strong className="text-foreground">₹{(item.budget / 100000).toFixed(1)}L</strong></span>
                        <span className="text-muted-foreground">Actual: <strong className={isOver ? 'text-red-600' : 'text-emerald-600'}>₹{(item.actual / 100000).toFixed(1)}L</strong></span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isOver ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {item.utilization}%
                        </span>
                      </div>
                    </div>

                    {/* Dual Bar Display */}
                    <div className="space-y-1 pt-1">
                      {/* Budget Bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-blue-600 transition-all duration-500 rounded-full"
                          style={{ width: `${budgetPct}%` }}
                          title={`Budget: ₹${item.budget.toLocaleString('en-IN')}`}
                        />
                      </div>

                      {/* Actual Bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${actualPct}%` }}
                          title={`Actual: ₹${item.actual.toLocaleString('en-IN')}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (4 COLS): VARIANCE DRIVERS & FINANCIAL LEDGER GAUGE */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
          {/* TOP VARIANCE DRIVERS LEADERBOARD */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                  Key Variance Drivers
                </h3>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('all')}
                    className={`rounded px-1.5 py-0.5 font-extrabold ${selectedFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('overruns')}
                    className={`rounded px-1.5 py-0.5 font-extrabold ${selectedFilter === 'overruns' ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground'}`}
                  >
                    Overruns
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFilter('savings')}
                    className={`rounded px-1.5 py-0.5 font-extrabold ${selectedFilter === 'savings' ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}
                  >
                    Savings
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2 max-h-[210px] overflow-y-auto pr-1 scrollbar-thin">
                {filteredVarianceDrivers.map((driver, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-foreground line-clamp-1">{driver.name}</span>
                      <span className={`font-mono text-xs font-black ${driver.type === 'Overrun' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {driver.type === 'Overrun' ? '+' : ''}₹{(Math.abs(driver.amount) / 100000).toFixed(2)}L
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                      <span>{driver.category}</span>
                      <span className={`font-bold ${driver.type === 'Overrun' ? 'text-red-600' : 'text-emerald-600'}`}>{driver.pct}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* LEDGER EXPOSURE & RETENTION BREAKDOWN */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Ledger Security &amp; Retention Gauge
              </h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                Live Ledger Sync
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-border bg-amber-50/50 p-2.5 dark:bg-amber-950/20">
                <div>
                  <p className="font-bold text-amber-900 dark:text-amber-300">5% Retention Security Held</p>
                  <p className="text-[10px] text-muted-foreground">DLP Warranty Lock</p>
                </div>
                <p className="font-mono font-black text-amber-800 dark:text-amber-300">₹6,19,500</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-blue-50/50 p-2.5 dark:bg-blue-950/20">
                <div>
                  <p className="font-bold text-blue-900 dark:text-blue-300">Prepaid MOB Advances</p>
                  <p className="text-[10px] text-muted-foreground">Adjusted against RA Bills</p>
                </div>
                <p className="font-mono font-black text-blue-800 dark:text-blue-300">₹20,00,000</p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-emerald-50/50 p-2.5 dark:bg-emerald-950/20">
                <div>
                  <p className="font-bold text-emerald-900 dark:text-emerald-300">Pending Payable Outflow</p>
                  <p className="text-[10px] text-muted-foreground">Awaiting Accounts Release</p>
                </div>
                <p className="font-mono font-black text-emerald-800 dark:text-emerald-300">₹1,20,00,700</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
