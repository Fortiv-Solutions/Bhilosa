import React from 'react';

export function formatCurrency(value: number) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
}

export function statusLabel(value?: string | null) {
  return (value || 'pending').replaceAll('_', ' ');
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = statusLabel(status);
  return (
    <span className="inline-flex rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
      {normalized}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-heading text-base font-semibold text-foreground">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
