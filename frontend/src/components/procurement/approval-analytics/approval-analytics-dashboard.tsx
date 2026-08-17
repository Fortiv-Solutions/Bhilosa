'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock3, Loader2, RefreshCcw, TimerReset, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getApprovalAnalytics,
  type ApprovalAnalyticsSummary,
} from '@/lib/erp/approval-analytics';

interface ApprovalAnalyticsDashboardProps {
  projectId?: string;
}

function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  icon: typeof Clock3;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs space-y-1">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-bold uppercase tracking-wider font-heading">{label}</span>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="text-xl font-extrabold text-foreground font-heading">{value}</p>
      <p className="text-[10px] text-muted-foreground font-medium">{caption}</p>
    </div>
  );
}

export function ApprovalAnalyticsDashboard({ projectId }: ApprovalAnalyticsDashboardProps) {
  const [summary, setSummary] = useState<ApprovalAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    getApprovalAnalytics(projectId)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-12 text-sm font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading approval analytics…
      </div>
    );
  }

  if (!summary) return null;

  const agingData = (['0-24h', '24-48h', '>48h'] as const).map((bucket) => ({
    bucket,
    PR: summary.pr.agingBuckets[bucket],
    PO: summary.po.agingBuckets[bucket],
  }));

  const maxTurnaround = Math.max(1, ...summary.perApprover.map((a) => a.avgTurnaroundHours));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground font-heading">Approval Analytics</h2>
          <p className="text-[11px] font-medium text-muted-foreground">
            Approval latency, made visible instead of invisible.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary.isDemoData && (
            <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Demo Data
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Avg PR Approval Time"
          value={formatHours(summary.pr.avgApprovalHours)}
          caption={`Based on ${summary.pr.sampleSize} approved PRs`}
          icon={TimerReset}
          tone="text-primary"
        />
        <StatTile
          label="Avg PO Approval Time"
          value={formatHours(summary.po.avgApprovalHours)}
          caption={`Based on ${summary.po.sampleSize} approved POs`}
          icon={TimerReset}
          tone="text-blue-500"
        />
        <StatTile
          label="PRs Pending"
          value={String(summary.pr.pendingCount)}
          caption="Awaiting a decision right now"
          icon={Clock3}
          tone="text-amber-500"
        />
        <StatTile
          label="POs Pending"
          value={String(summary.po.pendingCount)}
          caption="Awaiting a decision right now"
          icon={Clock3}
          tone="text-amber-500"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground font-heading">
            Pending Items by Age
          </h3>
        </div>
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fontWeight: 600 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 600 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700, paddingTop: '8px' }} />
              <Bar dataKey="PR" fill="#e83e8c" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="PO" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground font-heading">
            Per-Approver Turnaround
          </h3>
        </div>
        {summary.perApprover.length === 0 ? (
          <p className="p-6 text-center text-xs font-semibold text-muted-foreground">
            No approval activity recorded in this window yet.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {summary.perApprover.map((approver) => (
              <div key={approver.actorId} className="flex items-center gap-3 px-4 py-3">
                <div className="w-40 shrink-0">
                  <p className="text-xs font-bold text-foreground truncate">{approver.actorName}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {approver.actorRole || 'Unknown role'} · {approver.approvalCount} approvals
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (approver.avgTurnaroundHours / maxTurnaround) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right text-xs font-mono font-bold text-foreground">
                  {formatHours(approver.avgTurnaroundHours)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
