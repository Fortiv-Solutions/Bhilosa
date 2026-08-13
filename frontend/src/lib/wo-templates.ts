import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export type WoTemplateRow = {
  id: string;
  name: string;
  trade_category: string;
  default_wo_type: 'fixed_scope' | 'rate_based';
  item_columns: string[];
  terms_baseline: string | null;
  terms_category: string | null;
  source_file_name: string | null;
  is_active: boolean;
  /**
   * How bills value a line under this trade. Carried on the template so the
   * form selects it instead of guessing from substrings of the trade name — the
   * old heuristic matched 'plumb'/'tile'/'mason', never reset to standard when a
   * later template did not match, and set stage_percentage without supplying
   * any stages, which then failed its own sum-to-100 check.
   */
  default_valuation_structure: 'standard' | 'stage_percentage' | 'floor_lead';
  default_lead_percent_per_floor: number;
  default_stages: Array<{ name: string; percent: number }>;
};

export async function listWoTemplates(): Promise<WoTemplateRow[]> {
  if (!isLiveSupabase()) return [];

  const { data, error } = await supabase
    .from('wo_templates')
    .select('*')
    .eq('is_active', true)
    .order('trade_category', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(normaliseTemplate);
}

/**
 * The valuation columns arrive with 20260808160000. Defaulting here keeps the
 * form working against a database that has not applied it yet.
 */
function normaliseTemplate(row: Record<string, unknown>): WoTemplateRow {
  const rawCols = Array.isArray(row.item_columns) ? (row.item_columns as string[]) : [];
  const hasQty = rawCols.some((col) => /qty|quantity|flats/i.test(col));
  let cols = [...rawCols];
  if (!hasQty && cols.length > 0) {
    const unitIdx = cols.findIndex((col) => /unit/i.test(col));
    if (unitIdx >= 0) {
      cols.splice(unitIdx + 1, 0, 'Qty');
    } else {
      cols.splice(Math.min(2, cols.length), 0, 'Qty');
    }
  }

  const stages = Array.isArray(row.default_stages)
    ? (row.default_stages as Array<Record<string, unknown>>).map((s) => ({
        name: String(s.name ?? ''),
        percent: Number(s.percent ?? 0),
      }))
    : [];
  return {
    ...(row as unknown as WoTemplateRow),
    item_columns: cols,
    default_valuation_structure:
      (row.default_valuation_structure as WoTemplateRow['default_valuation_structure']) ??
      'standard',
    default_lead_percent_per_floor: Number(row.default_lead_percent_per_floor ?? 0),
    default_stages: stages,
  };
}

export async function getWoTemplate(id: string): Promise<WoTemplateRow | null> {
  if (!isLiveSupabase()) return null;

  const { data, error } = await supabase
    .from('wo_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? normaliseTemplate(data as Record<string, unknown>) : null;
}
