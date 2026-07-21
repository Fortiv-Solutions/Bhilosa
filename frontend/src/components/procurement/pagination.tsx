'use client';

// Reusable pager:  < Previous | 1 | 2 | 3 | … | Next >
// Highlights the current page and collapses long ranges with ellipses.

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;        // 1-based current page
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function pageItems(current: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | 'gap')[] = [1];
  if (current > 3) items.push('gap');
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  for (let i = start; i <= end; i++) items.push(i);
  if (current < totalPages - 2) items.push('gap');
  items.push(totalPages);
  return items;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const items = pageItems(page, totalPages);

  const btn = 'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground tabular-nums">{from}–{to}</span> of <span className="font-semibold text-foreground tabular-nums">{total}</span>
      </p>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${btn} border-border bg-background hover:bg-muted`}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>

        {items.map((it, idx) =>
          it === 'gap' ? (
            <span key={`gap-${idx}`} className="px-1.5 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPageChange(it)}
              aria-current={it === page ? 'page' : undefined}
              className={`${btn} tabular-nums ${
                it === page
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted'
              }`}
            >
              {it}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={`${btn} border-border bg-background hover:bg-muted`}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </nav>
    </div>
  );
}
