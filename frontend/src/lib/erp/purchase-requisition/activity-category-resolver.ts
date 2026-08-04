// ============================================================================
// ACTIVITY -> MASTER BUDGET CATEGORY RESOLVER
// File: frontend/src/lib/erp/purchase-requisition/activity-category-resolver.ts
//
// Resolves the activity names on a PR's lines to Master Budget categories.
//
// Order of resolution, cheapest and most certain first:
//   1. exact  — normalised activity name equals a category name (or one of its
//               line-item descriptions). Free, instant, deterministic.
//   2. cache  — a previous resolution stored in activity_budget_category_map.
//               Includes any human override, which always wins.
//   3. llm    — /api/ai/map-activity-category, for names never seen before.
//               Sends ONLY activity names + category names. The result is
//               written straight back to the cache, so a given activity costs
//               at most one model call ever.
//   4. none   — falls into the Miscellaneous bucket, shown explicitly.
//
// The model never sees a budget figure and never produces one. It only picks a
// label; every rupee value is computed afterwards from Master Budget and
// Variance data.
// ============================================================================

import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import type { MasterBudgetCategory } from '@/lib/budget';

import {
  miscellaneousResolution as miscellaneous,
  normalizeActivityKey,
  type ActivityMatchSource,
  type ActivityResolutionMap,
  type ResolvedActivity,
} from './activity-mapping';

// Re-exported so callers can import the whole activity-mapping vocabulary from
// this module without also reaching into the pure helper file.
export {
  normalizeActivityKey,
  MISCELLANEOUS_ID,
  MISCELLANEOUS_LABEL,
} from './activity-mapping';
export type { ActivityMatchSource, ActivityResolutionMap, ResolvedActivity };

// ---------------------------------------------------------------------------
// 1. Exact matching (free)
// ---------------------------------------------------------------------------

interface ExactIndex {
  byCategoryName: Map<string, MasterBudgetCategory>;
  byItemDescription: Map<string, MasterBudgetCategory>;
}

function buildExactIndex(categories: MasterBudgetCategory[]): ExactIndex {
  const byCategoryName = new Map<string, MasterBudgetCategory>();
  const byItemDescription = new Map<string, MasterBudgetCategory>();

  for (const cat of categories) {
    const key = normalizeActivityKey(cat.categoryName);
    if (key && !byCategoryName.has(key)) byCategoryName.set(key, cat);

    for (const item of cat.items) {
      const itemKey = normalizeActivityKey(item.item);
      // First category wins — an ambiguous description must not flip between
      // categories depending on iteration order.
      if (itemKey && !byItemDescription.has(itemKey)) byItemDescription.set(itemKey, cat);
    }
  }

  return { byCategoryName, byItemDescription };
}

function resolveExact(activity: string, index: ExactIndex): ResolvedActivity | null {
  const key = normalizeActivityKey(activity);
  if (!key) return null;

  const direct = index.byCategoryName.get(key);
  if (direct) {
    return {
      activity,
      key,
      categoryId: direct.id,
      categoryName: direct.categoryName,
      source: 'exact',
      confidence: 1,
      reasoning: 'Exact Master Budget category name',
    };
  }

  const viaItem = index.byItemDescription.get(key);
  if (viaItem) {
    return {
      activity,
      key,
      categoryId: viaItem.id,
      categoryName: viaItem.categoryName,
      source: 'exact',
      confidence: 1,
      reasoning: 'Exact Master Budget line-item match',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. Cache
// ---------------------------------------------------------------------------

interface CacheRow {
  activity_key: string;
  activity_label: string;
  category_id: string | null;
  source: string;
  confidence: number;
  reasoning: string | null;
}

async function readCache(dbProjectId: string, keys: string[]): Promise<Map<string, CacheRow>> {
  const out = new Map<string, CacheRow>();
  if (keys.length === 0) return out;

  try {
    const { data, error } = await supabase
      .from('activity_budget_category_map')
      .select('activity_key, activity_label, category_id, source, confidence, reasoning')
      .eq('project_id', dbProjectId)
      .in('activity_key', keys);

    if (error) return out;
    for (const row of (data ?? []) as CacheRow[]) out.set(row.activity_key, row);
  } catch {
    /* the table may not exist yet — fall through to exact + miscellaneous */
  }
  return out;
}

async function writeCache(
  dbProjectId: string,
  entry: ResolvedActivity,
  model: string | null,
): Promise<void> {
  try {
    await supabase.rpc('rpc_upsert_activity_category_map', {
      p_project_id: dbProjectId,
      p_activity_key: entry.key,
      p_activity_label: entry.activity,
      p_category_id: entry.categoryId,
      p_source: entry.source === 'cache' ? 'llm' : entry.source,
      p_confidence: entry.confidence,
      p_reasoning: entry.reasoning || null,
      p_model: model,
    });
  } catch {
    /* caching is best-effort; a failure just means we ask again next time */
  }
}

// ---------------------------------------------------------------------------
// 3. LLM (names only)
// ---------------------------------------------------------------------------

interface LlmMapping {
  activity: string;
  categoryIndex: number | null;
  confidence: number;
  reasoning: string;
}

async function resolveViaModel(
  activities: string[],
  categories: MasterBudgetCategory[],
): Promise<{ mappings: LlmMapping[]; model: string | null }> {
  if (activities.length === 0) return { mappings: [], model: null };

  const response = await fetch('/api/ai/map-activity-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Names only. No ids, no amounts, no project identity.
      activities,
      categories: categories.map((c) => c.categoryName),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Activity mapping request failed (HTTP ${response.status}).`);
  }

  const payload = (await response.json()) as { mappings?: LlmMapping[]; model?: string };
  return { mappings: payload.mappings ?? [], model: payload.model ?? null };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Set false to skip the model entirely (exact + cache only). */
  useModel?: boolean;
}

export interface ResolveResult {
  map: ActivityResolutionMap;
  /** True when a model call actually ran during this resolution. */
  usedModel: boolean;
  /** Populated when the model was wanted but unavailable / failed. */
  modelError: string | null;
}

/**
 * Resolve every distinct activity name to a Master Budget category.
 * Safe to call on every render — exact matches and cache hits cost nothing, and
 * only genuinely new activity names reach the model.
 */
export async function resolveActivityCategories(
  projectId: string,
  activities: string[],
  categories: MasterBudgetCategory[],
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const map: ActivityResolutionMap = new Map();
  const distinct = Array.from(
    new Map(
      activities
        .map((a) => (a || '').trim())
        .filter(Boolean)
        .map((a) => [normalizeActivityKey(a), a] as const),
    ).values(),
  );

  if (distinct.length === 0 || categories.length === 0) {
    for (const activity of distinct) {
      map.set(
        normalizeActivityKey(activity),
        miscellaneous(activity, 'No Master Budget categories available'),
      );
    }
    return { map, usedModel: false, modelError: null };
  }

  const index = buildExactIndex(categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const unresolved: string[] = [];

  // Pass 1 — exact.
  for (const activity of distinct) {
    const hit = resolveExact(activity, index);
    if (hit) map.set(hit.key, hit);
    else unresolved.push(activity);
  }

  if (unresolved.length === 0 || !isLiveSupabase()) {
    for (const activity of unresolved) {
      map.set(normalizeActivityKey(activity), miscellaneous(activity, 'No matching budget category'));
    }
    return { map, usedModel: false, modelError: null };
  }

  const dbProjectId = getDbSiteId(projectId);

  // Pass 2 — cache.
  const cached = await readCache(
    dbProjectId,
    unresolved.map((a) => normalizeActivityKey(a)),
  );
  const stillUnresolved: string[] = [];

  for (const activity of unresolved) {
    const key = normalizeActivityKey(activity);
    const row = cached.get(key);
    if (!row) {
      stillUnresolved.push(activity);
      continue;
    }

    const cat = row.category_id ? categoryById.get(row.category_id) : undefined;
    if (!cat) {
      // Cached as unmappable, or the category has since been deleted.
      map.set(
        key,
        row.source === 'manual' || row.source === 'miscellaneous'
          ? miscellaneous(activity, row.reasoning || 'Marked as miscellaneous')
          : miscellaneous(activity, 'Previously mapped category no longer exists'),
      );
      continue;
    }

    map.set(key, {
      activity,
      key,
      categoryId: cat.id,
      categoryName: cat.categoryName,
      source: row.source === 'manual' ? 'manual' : 'cache',
      confidence: Number(row.confidence ?? 0),
      reasoning:
        row.reasoning ||
        (row.source === 'manual' ? 'Confirmed by a user' : 'Previously mapped'),
    });
  }

  if (stillUnresolved.length === 0) {
    return { map, usedModel: false, modelError: null };
  }

  // Pass 3 — model, names only.
  if (options.useModel === false) {
    for (const activity of stillUnresolved) {
      map.set(normalizeActivityKey(activity), miscellaneous(activity, 'Not yet mapped'));
    }
    return { map, usedModel: false, modelError: null };
  }

  try {
    const { mappings, model } = await resolveViaModel(stillUnresolved, categories);
    const byActivity = new Map(mappings.map((m) => [m.activity.toLowerCase(), m]));

    for (const activity of stillUnresolved) {
      const key = normalizeActivityKey(activity);
      const mapping = byActivity.get(activity.toLowerCase());
      const cat =
        mapping && mapping.categoryIndex != null ? categories[mapping.categoryIndex] : undefined;

      const resolved: ResolvedActivity = cat
        ? {
            activity,
            key,
            categoryId: cat.id,
            categoryName: cat.categoryName,
            source: 'llm',
            confidence: mapping?.confidence ?? 0,
            reasoning: mapping?.reasoning || `AI matched to "${cat.categoryName}"`,
          }
        : miscellaneous(activity, mapping?.reasoning || 'AI found no suitable category');

      map.set(key, resolved);
      void writeCache(dbProjectId, resolved, model);
    }

    return { map, usedModel: true, modelError: null };
  } catch (error) {
    // Degrade honestly: everything unresolved becomes Miscellaneous and the UI
    // reports that AI mapping was unavailable rather than implying it ran.
    for (const activity of stillUnresolved) {
      map.set(normalizeActivityKey(activity), miscellaneous(activity, 'AI mapping unavailable'));
    }
    return {
      map,
      usedModel: false,
      modelError: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Persist a human's mapping decision. Outranks every automated pass. */
export async function saveManualActivityMapping(
  projectId: string,
  activity: string,
  categoryId: string | null,
): Promise<void> {
  if (!isLiveSupabase()) return;
  await supabase.rpc('rpc_upsert_activity_category_map', {
    p_project_id: getDbSiteId(projectId),
    p_activity_key: normalizeActivityKey(activity),
    p_activity_label: activity,
    p_category_id: categoryId,
    p_source: 'manual',
    p_confidence: 1,
    p_reasoning: 'Confirmed by a user',
    p_model: null,
  });
}
