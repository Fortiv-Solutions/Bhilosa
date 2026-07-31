import { createClient } from '@supabase/supabase-js';

const isServer = typeof window === 'undefined';
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseUrl = rawUrl ? rawUrl : (isServer ? 'https://your-project.supabase.co' : window.location.origin + '/supabase-api');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    !supabaseUrl.includes('invalid') &&
    supabaseAnonKey !== 'your-publishable-key',
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Map legacy hardcoded frontend project IDs to Supabase project UUIDs.
// Prefer passing the real projects.id UUID (the app store now loads projects from
// the database); this map exists only for older call sites that still use slugs.
//
// 2026-07-30: 'central-park' previously pointed at f6704467-df8c-4f51-a49b-ddfdc40c39af,
// which does not exist in the projects table. Every budget/procurement lookup that
// resolved through it silently returned zero rows. Corrected to the real CP-001 row.
const projectToSiteMap: Record<string, string> = {
  'one-tapi': 'a1b2c3d4-0000-0000-0000-000000000001',
  'aranya-3': 'a1b2c3d4-0000-0000-0000-000000000002',
  'satva': 'a1b2c3d4-0000-0000-0000-000000000003',
  'central-park': '00000000-0000-0000-0000-000000000001',
  'f6704467-df8c-4f51-a49b-ddfdc40c39af': '00000000-0000-0000-0000-000000000001',
  'orbit-4': 'e8a7c213-df8c-4f51-a49b-ddfdc40c39af',
};

// Map Supabase site UUIDs back to frontend project IDs
const siteToProjectMap: Record<string, string> = Object.entries(projectToSiteMap).reduce(
  (acc, [key, val]) => ({ ...acc, [val]: key }),
  {}
);

// Map frontend user IDs to Supabase seeded user UUIDs
const userMap: Record<string, string> = {
  'u1': 'b2c3d4e5-0000-0000-0000-000000000001', // Vikram Patel -> Mahesh Pramukh (MD)
  'u2': 'b2c3d4e5-0000-0000-0000-000000000001', // Aravind Sharma -> Mahesh Pramukh (MD)
  'u3': 'b2c3d4e5-0000-0000-0000-000000000002', // Rohan Mehta -> Arvind Shah (PM)
  'u4': 'b2c3d4e5-0000-0000-0000-000000000003', // Priya Nair -> Ramesh Patel (Site Eng)
  'u5': 'b2c3d4e5-0000-0000-0000-000000000005', // Kunal Sen -> Priya Mehta (Purchase)
  'u6': 'b2c3d4e5-0000-0000-0000-000000000005', // Sanjay Rawat -> Priya Mehta (Purchase)
  'u7': 'b2c3d4e5-0000-0000-0000-000000000005', // Client -> Priya Mehta (Purchase)
};

export function getDbSiteId(projectId: string): string {
  return projectToSiteMap[projectId] || projectId;
}

export function getFrontendProjectId(siteId: string): string {
  return siteToProjectMap[siteId] || siteId;
}

export function getDbUserId(frontendUserId: string): string {
  if (userMap[frontendUserId]) {
    return userMap[frontendUserId];
  }
  // Check if frontendUserId is already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(frontendUserId)) {
    return frontendUserId;
  }
  return 'b2c3d4e5-0000-0000-0000-000000000002'; // default to Arvind Shah PM
}

export async function getSupabaseJsonHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
