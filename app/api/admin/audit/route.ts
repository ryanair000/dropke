import { adminAuthResponse, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id,actor_email,action,resource,details,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminAuthResponse(error);
  }
}
