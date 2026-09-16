import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serviceClient: SupabaseClient | null = null;
let publicServerClient: SupabaseClient | null = null;

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) throw new Error('SUPABASE_PUBLIC_SERVER_NOT_CONFIGURED');
  return { url, publishableKey };
}

export function getServiceClient() {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVER_NOT_CONFIGURED');
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

export function getPublicServerClient() {
  if (publicServerClient) return publicServerClient;
  const { url, publishableKey } = publicConfig();
  publicServerClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicServerClient;
}

export function getAuthenticatedServerClient(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new Error('SUPABASE_AUTH_HEADER_REQUIRED');
  const { url, publishableKey } = publicConfig();
  return createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
