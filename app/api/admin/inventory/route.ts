import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { data, error } = await getServiceClient().from('sku_stock').select('*').order('sku');
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) { return adminAuthResponse(error); }
}
