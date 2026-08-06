import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(
  supabaseUrl || 'https://uanazwednpluwllhfzlh.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
);

export interface ItemRecord {
  id: string;
  resource_type: 'material' | 'equipment' | 'service';
  item_code: string;
  item_description: string;
  tax_rate: number;
  lead_period_days: number;
  status: 'active' | 'pending_approval' | 'draft' | 'archived';
  is_inactive: boolean;
  item_group_id?: string;
  primary_uom_id?: string;
  item_groups?: {
    id: string;
    code: string;
    name: string;
  } | null;
  units_of_measure?: {
    id: string;
    code: string;
    name: string;
  } | null;
  uom_code?: string;
  group_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
}

export interface ItemGroup {
  id: string;
  code: string;
  name: string;
  resource_type: string;
}

/**
 * Fetch active items for dropdowns and selection controls
 */
export async function fetchActiveItems(resourceType?: string): Promise<ItemRecord[]> {
  try {
    let allItems: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 5) {
      let query = supabase
        .from('items')
        .select(`
          id,
          resource_type,
          item_code,
          item_description,
          tax_rate,
          lead_period_days,
          status,
          is_inactive,
          item_group_id,
          primary_uom_id,
          item_groups:item_group_id (id, code, name),
          units_of_measure:primary_uom_id (id, code, name)
        `)
        .eq('status', 'active')
        .eq('is_inactive', false)
        .order('item_code', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (resourceType) {
        query = query.eq('resource_type', resourceType.toLowerCase());
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching active items:', error);
        break;
      }

      if (data && data.length > 0) {
        allItems = [...allItems, ...data];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return allItems.map((item: any) => ({
      ...item,
      uom_code: item.units_of_measure?.code || 'NOS',
      group_name: item.item_groups?.name || 'General'
    }));
  } catch (err) {
    console.error('Unexpected error in fetchActiveItems:', err);
    return [];
  }
}

/**
 * Fetch all items for Item Master management view
 */
export async function fetchAllItems(params?: {
  resourceType?: string;
  searchQuery?: string;
  status?: string;
}): Promise<ItemRecord[]> {
  try {
    let allItems: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore && page < 5) { // Up to 5,000 items
      let query = supabase
        .from('items')
        .select(`
          id,
          resource_type,
          item_code,
          item_description,
          tax_rate,
          lead_period_days,
          status,
          is_inactive,
          created_at,
          item_group_id,
          primary_uom_id,
          item_groups:item_group_id (id, code, name),
          units_of_measure:primary_uom_id (id, code, name)
        `)
        .order('created_at', { ascending: false })
        .order('item_code', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (params?.resourceType && params.resourceType !== 'all') {
        query = query.eq('resource_type', params.resourceType.toLowerCase());
      }

      if (params?.status && params.status !== 'all') {
        query = query.eq('status', params.status.toLowerCase());
      }

      if (params?.searchQuery && params.searchQuery.trim()) {
        const term = params.searchQuery.trim();
        query = query.or(`item_code.ilike.%${term}%,item_description.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching items master list:', error);
        break;
      }

      if (data && data.length > 0) {
        allItems = [...allItems, ...data];
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return allItems.map((item: any) => ({
      ...item,
      uom_code: item.units_of_measure?.code || 'NOS',
      group_name: item.item_groups?.name || 'General'
    }));
  } catch (err) {
    console.error('Unexpected error in fetchAllItems:', err);
    return [];
  }
}

/**
 * Fetch Units of Measure master list
 */
export async function fetchUnitsOfMeasure(): Promise<UnitOfMeasure[]> {
  const { data, error } = await supabase
    .from('units_of_measure')
    .select('id, code, name')
    .order('code', { ascending: true });

  if (error) {
    console.error('Error fetching UOMs:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch Item Groups master list
 */
export async function fetchItemGroups(resourceType?: string): Promise<ItemGroup[]> {
  let query = supabase
    .from('item_groups')
    .select('id, code, name, resource_type')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (resourceType) {
    query = query.eq('resource_type', resourceType.toLowerCase());
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching item groups:', error);
    return [];
  }
  return data || [];
}

/**
 * Generate sequential Item Code based on Item Group Initials (e.g. AG0012, CM0089, PL0043)
 */
export async function generateNextItemCode(groupName: string, groupCode?: string): Promise<string> {
  try {
    // 1. Calculate prefix from groupName/groupCode initials
    let prefix = '';
    if (groupCode && groupCode.length <= 4 && !groupCode.includes('-')) {
      prefix = groupCode.toUpperCase();
    } else {
      const words = groupName.replace('&', '').replace('-', ' ').split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        prefix = (words[0][0] + words[1][0]).toUpperCase();
      } else if (words.length === 1 && words[0].length >= 2) {
        prefix = words[0].slice(0, 2).toUpperCase();
      } else {
        prefix = 'IT';
      }
    }

    // 2. Fetch existing codes starting with prefix
    const { data } = await supabase
      .from('items')
      .select('item_code')
      .ilike('item_code', `${prefix}%`)
      .limit(2000);

    let maxSeq = 0;
    if (data) {
      for (const row of data) {
        const code = row.item_code;
        const numPart = code.slice(prefix.length);
        if (/^\d+$/.test(numPart)) {
          const val = parseInt(numPart, 10);
          if (val > maxSeq) maxSeq = val;
        }
      }
    }

    const nextSeq = maxSeq + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  } catch (err) {
    console.error('Error generating item code:', err);
    return `IT${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

/**
 * Create a single new item with auto-code support using Group Initials
 */
export async function createItem(item: {
  resource_type: 'material' | 'equipment' | 'service';
  item_code?: string;
  item_group_id: string;
  item_description: string;
  primary_uom_id: string;
  tax_rate: number;
  lead_period_days: number;
  status?: 'active' | 'pending_approval' | 'draft';
  is_inactive?: boolean;
}): Promise<{ success: boolean; data?: ItemRecord; error?: string }> {
  try {
    let finalCode = item.item_code?.trim();

    // Auto-generate code if empty using group initials style
    if (!finalCode) {
      const { data: grp } = await supabase
        .from('item_groups')
        .select('name, code')
        .eq('id', item.item_group_id)
        .single();

      finalCode = await generateNextItemCode(grp?.name || 'Item', grp?.code);
    }

    const { data, error } = await supabase
      .from('items')
      .insert({
        resource_type: item.resource_type,
        item_code: finalCode,
        item_group_id: item.item_group_id,
        item_description: item.item_description,
        primary_uom_id: item.primary_uom_id,
        tax_rate: item.tax_rate || 0,
        lead_period_days: item.lead_period_days || 0,
        status: item.status || 'active',
        is_inactive: item.is_inactive ?? false
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create item' };
  }
}

/**
 * Update any/all fields of an existing item in Supabase
 */
export async function updateItem(
  id: string,
  updates: {
    resource_type?: 'material' | 'equipment' | 'service';
    item_code?: string;
    item_group_id?: string;
    item_description?: string;
    primary_uom_id?: string;
    tax_rate?: number;
    lead_period_days?: number;
    status?: 'active' | 'pending_approval' | 'draft' | 'archived';
    is_inactive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('items')
      .update(payload)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update item' };
  }
}

/**
 * Update existing item status or active flag
 */
export async function updateItemStatus(
  id: string,
  status: 'active' | 'pending_approval' | 'draft' | 'archived',
  is_inactive?: boolean
): Promise<boolean> {
  const res = await updateItem(id, { status, is_inactive });
  return res.success;
}
