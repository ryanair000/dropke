import 'server-only';
import { getPublicServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publicConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const serviceConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let publicDatabase = false;
  let serviceDatabase = false;

  if (publicConfigured) {
    try {
      const client = getPublicServerClient();
      const { error } = await client.from('products').select('id').limit(1);
      publicDatabase = !error;
    } catch {
      publicDatabase = false;
    }
  }

  if (serviceConfigured) {
    try {
      const client = getServiceClient();
      const { error } = await client.from('admin_users').select('id').limit(1);
      serviceDatabase = !error;
    } catch {
      serviceDatabase = false;
    }
  }

  const ok = publicDatabase && serviceDatabase;
  return Response.json(
    {
      ok,
      publicConfigured,
      publicDatabase,
      serviceConfigured,
      serviceDatabase,
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
