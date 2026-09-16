import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase/server';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = await requireAdmin(request);
    const body = await request.json();
    const sellPriceKes = Number(body.sellPriceKes);
    const lowStockThreshold = Number(body.lowStockThreshold);
    if (!Number.isFinite(sellPriceKes) || sellPriceKes <= 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) return Response.json({ error: 'Invalid SKU settings' }, { status: 400 });
    const { data, error } = await getServiceClient().from('gift_card_skus').update({ sell_price_kes: Math.round(sellPriceKes), low_stock_threshold: lowStockThreshold, updated_at: new Date().toISOString() }).eq('id', id).select('id,sku,sell_price_kes,low_stock_threshold').single();
    if (error) throw error;
    await writeAudit(admin.email, 'sku.update', data.sku, { sellPriceKes: data.sell_price_kes, lowStockThreshold: data.low_stock_threshold });
    return Response.json(data);
  } catch (error) { return adminAuthResponse(error); }
}
