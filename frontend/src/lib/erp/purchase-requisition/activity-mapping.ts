// ============================================================================
// ACTIVITY -> BUDGET CATEGORY: SHARED PURE TYPES & HELPERS
// File: frontend/src/lib/erp/purchase-requisition/activity-mapping.ts
//
// Deliberately dependency-free.
//
// budget-analysis.ts is pure arithmetic and must stay unit-testable in a bare
// Node process. activity-category-resolver.ts talks to Supabase and to the
// mapping API. Keeping the shared vocabulary here stops the calculation module
// from transitively importing a realtime websocket client just to read a type.
// ============================================================================

/** How an activity found its Master Budget category. */
export type ActivityMatchSource = 'exact' | 'cache' | 'llm' | 'manual' | 'miscellaneous';

export interface ResolvedActivity {
  /** Activity name exactly as it appears on the PR line. */
  activity: string;
  /** Normalised lookup key. */
  key: string;
  categoryId: string | null;
  categoryName: string | null;
  source: ActivityMatchSource;
  /** 0..1. Advisory only — never scales a budget figure. */
  confidence: number;
  reasoning: string;
}

export type ActivityResolutionMap = Map<string, ResolvedActivity>;

export const MISCELLANEOUS_ID = '__miscellaneous__';
export const MISCELLANEOUS_LABEL = 'Miscellaneous';

/**
 * Lowercase, strip punctuation, collapse whitespace.
 *
 * Must stay in step with the SQL side so 'Masonry / Brickwork' and
 * 'masonry brickwork' cannot produce two competing cache rows.
 */
export function normalizeActivityKey(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function miscellaneousResolution(activity: string, reasoning: string): ResolvedActivity {
  return {
    activity,
    key: normalizeActivityKey(activity),
    categoryId: null,
    categoryName: null,
    source: 'miscellaneous',
    confidence: 0,
    reasoning,
  };
}
