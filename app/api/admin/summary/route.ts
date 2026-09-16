import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { inventoryEncryptionReady } from '@/lib/crypto';
import { getServiceClient } from '@/lib/db';
import { paystackMode } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const supabase = getServiceClient();
    const [{ data: stock }, { data: orders }] = await Promise.all([
      supabase.from('sku_stock').select('available_count,reserved_count,sold_count,low_stock_threshold'),
      supabase.from('orders').select('status'),
    ]);
    const rows = stock ?? [];
    return Response.json({
      skuCount: rows.length,
      available: rows.reduce((sum, row) => sum + Number(row.available_count), 0),
      reserved: rows.reduce((sum, row) => sum + Number(row.reserved_count), 0),
      sold: rows.reduce((sum, row) => sum + Number(row.sold_count), 0),
      lowStock: rows.filter((row) => Number(row.available_count) <= Number(row.low_stock_threshold)).length,
      orderCount: orders?.length ?? 0,
      paidPending: (orders ?? []).filter((order) => order.status === 'paid_pending_fulfilment').length,
      encryptionReady: inventoryEncryptionReady(),
      paystackMode: paystackMode(),
    });
  } catch (error) { return adminAuthResponse(error); }
}
