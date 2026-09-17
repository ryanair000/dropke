import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { inventoryEncryptionReady } from '@/lib/crypto';
import { paystackMode } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const { error: releaseError } = await supabase.rpc('release_expired_inventory');
    if (releaseError) throw releaseError;

    const [{ data: stock, error: stockError }, { data: orders, error: ordersError }] = await Promise.all([
      supabase.from('sku_stock').select('available_count,reserved_count,sold_count,low_stock_threshold'),
      supabase.from('orders').select('status'),
    ]);
    if (stockError) throw stockError;
    if (ordersError) throw ordersError;

    const rows = stock ?? [];
    const orderRows = orders ?? [];
    return Response.json({
      skuCount: rows.length,
      available: rows.reduce((sum, row) => sum + Number(row.available_count ?? 0), 0),
      reserved: rows.reduce((sum, row) => sum + Number(row.reserved_count ?? 0), 0),
      sold: rows.reduce((sum, row) => sum + Number(row.sold_count ?? 0), 0),
      lowStock: rows.filter((row) => Number(row.available_count ?? 0) <= Number(row.low_stock_threshold ?? 0)).length,
      orderCount: orderRows.length,
      paidPending: orderRows.filter((order) => order.status === 'paid_pending_fulfilment').length,
      encryptionReady: inventoryEncryptionReady(),
      paystackMode: paystackMode(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminAuthResponse(error);
  }
}
