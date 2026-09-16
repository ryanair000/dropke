import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { data, error } = await getServiceClient().from('orders').select('ref,product_name,platform,region_name,kes_price,payment_status,status,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) { return adminAuthResponse(error); }
}
