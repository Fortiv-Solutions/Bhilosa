// Renders the portfolio disbursement trend after browser layout dimensions are available.
'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BudgetLedgerRow } from '@/lib/budget';

const CRORE = 10_000_000;
const cumulativeSpendRatios = [
  { month: 'Jan', ratio: 0.12 },
  { month: 'Feb', ratio: 0.25 },
  { month: 'Mar', ratio: 0.41 },
  { month: 'Apr', ratio: 0.59 },
  { month: 'May', ratio: 0.79 },
  { month: 'Jun', ratio: 1 },
];

interface BudgetCashFlowChartProps {
  totalSpend: number;
  ledger?: BudgetLedgerRow[];
}

export default function BudgetCashFlowChart({ totalSpend, ledger = [] }: BudgetCashFlowChartProps) {
  const totalSpendInCrores = totalSpend / CRORE;
  const actualRows = ledger
    .filter((row) => row.transaction_type === 'actual' || row.transaction_type === 'release')
    .sort((a, b) => new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime());

  const cashFlowData = actualRows.length > 0
    ? Array.from(
        actualRows.reduce((months, row) => {
          const date = new Date(row.posted_at);
          const month = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
          const signedAmount = row.transaction_type === 'release' ? -Number(row.amount || 0) : Number(row.amount || 0);
          months.set(month, (months.get(month) ?? 0) + signedAmount);
          return months;
        }, new Map<string, number>()),
      ).reduce<{ month: string; outflow: number }[]>((points, [month, amount]) => {
        const previous = points.at(-1)?.outflow ?? 0;
        points.push({ month, outflow: Number((previous + amount / CRORE).toFixed(2)) });
        return points;
      }, [])
    : cumulativeSpendRatios.map(({ month, ratio }) => ({
        month,
        outflow: Number((totalSpendInCrores * ratio).toFixed(2)),
      }));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
      <AreaChart data={cashFlowData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
        <defs>
          <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#b68d40" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#b68d40" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(value) => [`INR ${value} Cr`]} />
        <Area type="monotone" dataKey="outflow" stroke="#b68d40" strokeWidth={2} fillOpacity={1} fill="url(#outflowGrad)" name="Payout" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
