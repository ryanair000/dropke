import { adminAuthResponse, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const { data, error } = await supabase.rpc('admin_orders', { p_limit: 100 });
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) { return adminAuthResponse(error); }
}
