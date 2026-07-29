'use client';

import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { BudgetLedgerRow } from '@/lib/budget';
import {
  CircleDollarSign,
  TrendingUp,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Download,
  Filter,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface MonthlyCashFlowPoint {
  month: string;
  plannedCumulative: number; // Planned S-Curve (₹ Cr)
  actualCumulative: number | null; // Actual Billed Outflow (₹ Cr)
  forecastCumulative: number; // AI Projected Forecast (₹ Cr)
  monthlyPlanned: number; // Monthly Outflow (₹ Lakhs)
  monthlyActual: number | null; // Monthly Billed (₹ Lakhs)
  milestones: string;
  varianceStatus: 'On Track' | 'Ahead' | 'Behind';
}

const FULL_LIFECYCLE_SCURVE_DATA: MonthlyCashFlowPoint[] = [
  { month: 'Jan 26', plannedCumulative: 2.5, actualCumulative: 2.4, forecastCumulative: 2.4, monthlyPlanned: 250, monthlyActual: 240, milestones: 'Site Excavation & D-Wall Start', varianceStatus: 'On Track' },
  { month: 'Feb 26', plannedCumulative: 5.8, actualCumulative: 5.6, forecastCumulative: 5.6, monthlyPlanned: 330, monthlyActual: 320, milestones: 'Piling & Substructure Concreting', varianceStatus: 'On Track' },
  { month: 'Mar 26', plannedCumulative: 10.2, actualCumulative: 10.5, forecastCumulative: 10.5, monthlyPlanned: 440, monthlyActual: 490, milestones: 'Basement Slab Pouring', varianceStatus: 'Ahead' },
  { month: 'Apr 26', plannedCumulative: 15.6, actualCumulative: 15.9, forecastCumulative: 15.9, monthlyPlanned: 540, monthlyActual: 540, milestones: 'Ground & Podium Floor RCC', varianceStatus: 'On Track' },
  { month: 'May 26', plannedCumulative: 21.8, actualCumulative: 22.1, forecastCumulative: 22.1, monthlyPlanned: 620, monthlyActual: 620, milestones: 'Tower A Slab 1 to 5 RCC', varianceStatus: 'On Track' },
  { month: 'Jun 26', plannedCumulative: 28.5, actualCumulative: 29.2, forecastCumulative: 29.2, monthlyPlanned: 670, monthlyActual: 710, milestones: 'Tower A Slab 6 to 10 & Masonry', varianceStatus: 'Ahead' },
  { month: 'Jul 26', plannedCumulative: 35.8, actualCumulative: 32.95, forecastCumulative: 35.9, monthlyPlanned: 730, monthlyActual: 375, milestones: 'RA Bill 14 Slab 12 & Civil Labour', varianceStatus: 'On Track' },
  { month: 'Aug 26', plannedCumulative: 42.4, actualCumulative: null, forecastCumulative: 43.1, monthlyPlanned: 660, monthlyActual: null, milestones: 'Top Slab Pour & MEP Rough-Ins', varianceStatus: 'On Track' },
  { month: 'Sep 26', plannedCumulative: 48.6, actualCumulative: null, forecastCumulative: 49.5, monthlyPlanned: 620, monthlyActual: null, milestones: 'External Façade Glazing Launch', varianceStatus: 'On Track' },
  { month: 'Oct 26', plannedCumulative: 53.8, actualCumulative: null, forecastCumulative: 54.8, monthlyPlanned: 520, monthlyActual: null, milestones: 'Plumbing, Electrical & Elevator Install', varianceStatus: 'On Track' },
  { month: 'Nov 26', plannedCumulative: 57.5, actualCumulative: null, forecastCumulative: 58.6, monthlyPlanned: 370, monthlyActual: null, milestones: 'Internal Finishes & Flooring', varianceStatus: 'On Track' },
  { month: 'Dec 26', plannedCumulative: 60.0, actualCumulative: null, forecastCumulative: 61.2, monthlyPlanned: 250, monthlyActual: null, milestones: 'Handover & Final Retention Release', varianceStatus: 'On Track' },
];

interface BudgetCashFlowChartProps {
  totalSpend?: number;
  ledger?: BudgetLedgerRow[];
}

export default function BudgetCashFlowChart({ totalSpend, ledger = [] }: BudgetCashFlowChartProps) {
  const [viewMode, setViewMode] = useState<'cumulative' | 'monthly'>('cumulative');
  const [timeRange, setTimeRange] = useState<'all' | 'q1' | 'q2' | 'q3' | 'q4'>('all');

  const filteredData = FULL_LIFECYCLE_SCURVE_DATA.filter((item) => {
    if (timeRange === 'q1') return ['Jan 26', 'Feb 26', 'Mar 26'].includes(item.month);
    if (timeRange === 'q2') return ['Apr 26', 'May 26', 'Jun 26'].includes(item.month);
    if (timeRange === 'q3') return ['Jul 26', 'Aug 26', 'Sep 26'].includes(item.month);
    if (timeRange === 'q4') return ['Oct 26', 'Nov 26', 'Dec 26'].includes(item.month);
    return true;
  });

  const peakOutflowItem = FULL_LIFECYCLE_SCURVE_DATA.reduce((prev, current) =>
    (current.monthlyPlanned > prev.monthlyPlanned) ? current : prev
  );

  return (
    <div className="space-y-6 select-none font-sans">
      {/* 1. TOP CASH FLOW EXECUTIVE METRICS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Cumulative Billed Outflow</p>
          <p className="mt-1 text-xl font-mono font-black text-emerald-600">₹32.95 Cr</p>
          <p className="mt-0.5 text-xs text-muted-foreground">54.9% of total lifecycle budget</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">Peak Cash Outflow Month</p>
          <p className="mt-1 text-xl font-mono font-black text-foreground">Jul 26 (₹7.30 Cr)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{peakOutflowItem.milestones}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">Average Monthly Outflow</p>
          <p className="mt-1 text-xl font-mono font-black text-foreground">₹4.85 Cr / mo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Project lifecycle run rate</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">Schedule Performance (SPI)</p>
          <p className="mt-1 text-xl font-mono font-black text-amber-800 dark:text-amber-300">1.02 (On Schedule)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Outflow tracking baseline curve</p>
        </div>
      </div>

      {/* 2. CHART CONTROLS & HEADER */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="font-heading text-base font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Project Cash Outflow S-Curve &amp; Forecast
            </h3>
            <p className="text-xs text-muted-foreground">Planned Baseline S-Curve (Blue) vs Actual Verified Billed Outflow (Green) vs AI Forecast (Amber Dotted)</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('cumulative')}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${viewMode === 'cumulative' ? 'bg-card text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Cumulative S-Curve (₹ Cr)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('monthly')}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${viewMode === 'monthly' ? 'bg-card text-primary shadow-2xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Monthly Outflow (₹ Lakhs)
              </button>
            </div>

            {/* Time Range Filter */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none"
            >
              <option value="all">Full Lifecycle (12 Mo)</option>
              <option value="q1">Q1 2026 (Jan - Mar)</option>
              <option value="q2">Q2 2026 (Apr - Jun)</option>
              <option value="q3">Q3 2026 (Jul - Sep)</option>
              <option value="q4">Q4 2026 (Oct - Dec)</option>
            </select>
          </div>
        </div>

        {/* 3. RECHARTS S-CURVE CANVAS */}
        <div className="h-[380px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {viewMode === 'cumulative' ? (
              <AreaChart data={filteredData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 11, fontWeight: 600 }} unit=" Cr" />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `₹${Number(value).toFixed(2)} Cr`,
                    name === 'plannedCumulative' ? 'Planned Baseline S-Curve' : name === 'actualCumulative' ? 'Actual Verified Outflow' : 'AI Projected Forecast',
                  ]}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Legend
                  formatter={(value) =>
                    value === 'plannedCumulative' ? 'Planned Baseline S-Curve' : value === 'actualCumulative' ? 'Actual Verified Outflow' : 'AI Projected Forecast'
                  }
                  wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '10px' }}
                />

                <Area type="monotone" dataKey="plannedCumulative" stroke="#2563eb" strokeWidth={2.5} strokeDasharray="4 4" fill="url(#plannedGrad)" fillOpacity={1} name="plannedCumulative" />
                <Area type="monotone" dataKey="actualCumulative" stroke="#10b981" strokeWidth={3} fill="url(#actualGrad)" fillOpacity={1} name="actualCumulative" />
                <Line type="monotone" dataKey="forecastCumulative" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="3 3" dot={{ r: 3 }} name="forecastCumulative" />
              </AreaChart>
            ) : (
              <AreaChart data={filteredData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="monthlyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 11, fontWeight: 600 }} unit=" L" />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `₹${Number(value).toFixed(0)} Lakhs`,
                    name === 'monthlyPlanned' ? 'Monthly Planned Outflow' : 'Monthly Actual Billed',
                  ]}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '10px' }} />
                <Area type="monotone" dataKey="monthlyPlanned" stroke="#f59e0b" strokeWidth={2.5} fill="url(#monthlyGrad)" fillOpacity={1} name="Monthly Planned (Lakhs)" />
                <Line type="monotone" dataKey="monthlyActual" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} name="Monthly Actual (Lakhs)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. DISBURSEMENT SCHEDULE & MILESTONES TABLE */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              Monthly Disbursement Schedule &amp; Major Milestones
            </h3>
            <p className="text-xs text-muted-foreground">Itemized month-by-month cash outflow schedule mapped to major site construction milestones</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800 uppercase">
            12-Month Schedule
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground select-none">
                <th className="px-3.5 py-2.5 border-r border-border">Month</th>
                <th className="px-4 py-2.5 text-right font-mono border-r border-border">Planned S-Curve (₹ Cr)</th>
                <th className="px-4 py-2.5 text-right font-mono border-r border-border">Actual Billed (₹ Cr)</th>
                <th className="px-4 py-2.5 text-right font-mono border-r border-border">Monthly Outflow (₹ L)</th>
                <th className="px-4 py-2.5 min-w-[260px] border-r border-border">Major Construction Milestone</th>
                <th className="px-3.5 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle">
                  <td className="px-3.5 py-2.5 font-bold text-foreground border-r border-border">{row.month}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-blue-700 dark:text-blue-300 border-r border-border">
                    ₹{row.plannedCumulative.toFixed(2)} Cr
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-black border-r border-border">
                    {row.actualCumulative !== null ? (
                      <span className="text-emerald-700 dark:text-emerald-300">₹{row.actualCumulative.toFixed(2)} Cr</span>
                    ) : (
                      <span className="text-muted-foreground font-normal italic">Forecast ₹{row.forecastCumulative.toFixed(2)} Cr</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground border-r border-border">
                    ₹{row.monthlyPlanned} Lakhs
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-semibold border-r border-border">
                    {row.milestones}
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                      row.actualCumulative !== null
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {row.actualCumulative !== null ? 'Verified' : 'Projected'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
