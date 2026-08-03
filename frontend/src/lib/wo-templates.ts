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
};

export async function listWoTemplates(): Promise<WoTemplateRow[]> {
  if (!isLiveSupabase()) return [];

  const { data, error } = await supabase
    .from('wo_templates')
    .select('*')
    .eq('is_active', true)
    .order('trade_category', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WoTemplateRow[];
}

export async function getWoTemplate(id: string): Promise<WoTemplateRow | null> {
  if (!isLiveSupabase()) return null;

  const { data, error } = await supabase
    .from('wo_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as WoTemplateRow | null;
}
