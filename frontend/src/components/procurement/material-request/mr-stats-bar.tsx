'use client';

import {
  ClipboardList,
  Zap,
  Flame,
  AlertTriangle,
  Eye,
  MessageSquare,
  CheckCircle2,
  ShoppingCart,
} from 'lucide-react';

interface MRStatsBarProps {
  stats: {
    total: number;
    pending: number;
    critical: number;
    overdue: number;
    underReview: number;
    clarification: number;
    fulfilled: number;
    converted: number;
  };
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof ClipboardList; label: string; value: number; accent?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-3 flex items-center gap-3 ${value > 0 && accent ? 'ring-1 ' + accent : ''}`}>
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${value > 0 && accent ? 'bg-opacity-20' : ''}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-lg font-bold text-foreground leading-none">{value}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground font-medium">{label}</div>
      </div>
    </div>
  );
}

export function MRStatsBar({ stats }: MRStatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <StatCard icon={ClipboardList} label="Total MRs" value={stats.total} />
      <StatCard icon={Zap} label="Submitted" value={stats.pending} accent="ring-blue-200 dark:ring-blue-800" />
      <StatCard icon={Flame} label="Critical" value={stats.critical} accent="ring-red-200 dark:ring-red-800" />
      <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue} accent="ring-orange-200 dark:ring-orange-800" />
      <StatCard icon={Eye} label="Under Review" value={stats.underReview} />
      <StatCard icon={MessageSquare} label="Clarification" value={stats.clarification} />
      <StatCard icon={CheckCircle2} label="Fulfilled" value={stats.fulfilled} />
      <StatCard icon={ShoppingCart} label="Converted PR" value={stats.converted} />
    </div>
  );
}
