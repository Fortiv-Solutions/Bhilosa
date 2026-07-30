'use client';

import type { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  accent?: string;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, accent, className }: StatCardProps) {
  const hasAccent = Boolean(accent) && (typeof value !== 'number' || value > 0);
  return (
    <div className={`rounded-xl border border-border bg-card p-3 flex items-center gap-3 ${hasAccent ? 'ring-1 ' + accent : ''} ${className ?? ''}`}>
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ${hasAccent ? 'bg-opacity-20' : ''}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-lg font-bold text-foreground leading-none">{value}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground font-medium">{label}</div>
      </div>
    </div>
  );
}
