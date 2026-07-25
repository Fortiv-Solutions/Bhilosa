import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uanazwednpluwllhfzlh.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhbmF6d2VkbnBsdXdsbGhmemxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjY0NDMsImV4cCI6MjEwMDIwMjQ0M30.eEbmPE6QQds7-WmS9YOKMb1lhlrG5PZy2ySUVY9bjZs';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    supabaseAnonKey !== 'your-publishable-key',
);

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://uanazwednpluwllhfzlh.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhbmF6d2VkbnBsdXdsbGhmemxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjY0NDMsImV4cCI6MjEwMDIwMjQ0M30.eEbmPE6QQds7-WmS9YOKMb1lhlrG5PZy2ySUVY9bjZs',
);

// Map frontend project IDs to Supabase site UUIDs
const projectToSiteMap: Record<string, string> = {
  'one-tapi': 'a1b2c3d4-0000-0000-0000-000000000001',
  'aranya-3': 'a1b2c3d4-0000-0000-0000-000000000002',
  'satva': 'a1b2c3d4-0000-0000-0000-000000000003',
  'central-park': 'af6fca4d-3498-48c0-b87d-bb234c23728d',
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
