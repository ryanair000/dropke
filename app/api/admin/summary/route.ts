import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { inventoryEncryptionReady } from '@/lib/crypto';
import { paystackMode } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const { data, error } = await supabase.rpc('admin_summary');
    if (error) throw error;
    const row = data?.[0] ?? {};
    return Response.json({
      skuCount: Number(row.sku_count ?? 0),
      available: Number(row.available ?? 0),
      reserved: Number(row.reserved ?? 0),
      sold: Number(row.sold ?? 0),
      lowStock: Number(row.low_stock ?? 0),
      orderCount: Number(row.order_count ?? 0),
      paidPending: Number(row.paid_pending ?? 0),
      encryptionReady: inventoryEncryptionReady(),
      paystackMode: paystackMode(),
    });
  } catch (error) { return adminAuthResponse(error); }
}
