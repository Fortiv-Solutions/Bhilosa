'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, icon: Icon, iconClassName, action, className, children }: SectionCardProps) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-6 shadow-sm ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`h-5 w-5 ${iconClassName ?? 'text-primary'}`} />}
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground uppercase tracking-wider">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground font-semibold">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
