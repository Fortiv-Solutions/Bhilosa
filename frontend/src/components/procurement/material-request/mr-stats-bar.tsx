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
import { StatCard } from '@/components/ui/stat-card';

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

export function MRStatsBar({ stats }: MRStatsBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={ClipboardList} label="Total MRs" value={stats.total} />
      <StatCard icon={ShoppingCart} label="Active (Approved)" value={stats.converted} accent="ring-blue-200 dark:ring-blue-800" />
      <StatCard icon={CheckCircle2} label="Fulfilled" value={stats.fulfilled} accent="ring-emerald-200 dark:ring-emerald-800" />
      <StatCard icon={AlertTriangle} label="Overdue" value={stats.overdue} accent="ring-orange-200 dark:ring-orange-800" />
    </div>
  );
}
