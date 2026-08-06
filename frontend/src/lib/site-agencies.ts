import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export type SiteAgencyRow = {
  id: string;
  project_id: string;
  agency_name: string;
  trade_category: string;
  contact_person: string | null;
  phone: string | null;
  assigned_zone: string | null;
  status: string;
};

export async function listAgencies(projectId?: string): Promise<SiteAgencyRow[]> {
  if (!isLiveSupabase()) return [];

  let query = supabase
    .from('site_agencies')
    .select('*')
    .eq('status', 'active')
    .order('agency_name', { ascending: true });

  if (projectId) {
    const dbProjectId = getDbSiteId(projectId);
    query = query.eq('project_id', dbProjectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SiteAgencyRow[];
}

export type CreateAgencyInput = {
  projectId: string;
  agencyName: string;
  tradeCategory: string;
  contactPerson?: string;
  phone?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createAgency(input: CreateAgencyInput): Promise<SiteAgencyRow> {
  if (!input.agencyName.trim()) throw new Error('Agency name is required.');
  if (!input.tradeCategory.trim()) throw new Error('Trade category is required.');

  let dbProjectId = getDbSiteId(input.projectId);

  // If the resolved dbProjectId is not a valid UUID format, lookup an actual project UUID from database
  if (!UUID_REGEX.test(dbProjectId)) {
    const { data: pData } = await supabase.from('projects').select('id').limit(1).maybeSingle();
    if (pData?.id) {
      dbProjectId = pData.id as string;
    } else {
      dbProjectId = '00000000-0000-0000-0000-000000000001';
    }
  }

  const { data, error } = await supabase
    .from('site_agencies')
    .insert({
      project_id: dbProjectId,
      agency_name: input.agencyName.trim(),
      trade_category: input.tradeCategory.trim(),
      contact_person: input.contactPerson || null,
      phone: input.phone || null,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as SiteAgencyRow;
}

/** Finds an existing agency by exact name (case-insensitive) within a project, or creates one — the "growing list" behavior shared by DPR and Work Orders. */
export async function findOrCreateAgency(input: CreateAgencyInput): Promise<SiteAgencyRow> {
  let dbProjectId = getDbSiteId(input.projectId);
  if (!UUID_REGEX.test(dbProjectId)) {
    const { data: pData } = await supabase.from('projects').select('id').limit(1).maybeSingle();
    if (pData?.id) {
      dbProjectId = pData.id as string;
    } else {
      dbProjectId = '00000000-0000-0000-0000-000000000001';
    }
  }

  const { data: existing, error } = await supabase
    .from('site_agencies')
    .select('*')
    .eq('project_id', dbProjectId)
    .ilike('agency_name', input.agencyName.trim())
    .maybeSingle();

  if (!error && existing) return existing as SiteAgencyRow;

  return createAgency({ ...input, projectId: dbProjectId });
}
