import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseServerConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes('your-project') &&
      !supabaseAnonKey.includes('...')
  );
}

export function createRequestSupabaseClient(accessToken?: string | null): SupabaseClient | null {
  if (!isSupabaseServerConfigured() || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function requireSupabaseUser(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return { error: 'Authentication required', status: 401 as const };
  }

  const supabase = createRequestSupabaseClient(accessToken);
  if (!supabase) {
    return { error: 'Supabase is not configured', status: 503 as const };
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return { error: 'Invalid or expired session', status: 401 as const };
  }

  return { supabase, user: data.user, accessToken };
}
