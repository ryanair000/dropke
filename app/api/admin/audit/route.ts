import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { data, error } = await getServiceClient().from('audit_logs').select('id,actor_email,action,resource,details,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) { return adminAuthResponse(error); }
}
