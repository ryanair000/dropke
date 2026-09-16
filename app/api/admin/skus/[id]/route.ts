import { adminAuthResponse, requireAdmin } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, email } = await requireAdmin(request);
    const body = await request.json();
    const sellPriceKes = Number(body.sellPriceKes);
    const lowStockThreshold = Number(body.lowStockThreshold);
    if (!Number.isFinite(sellPriceKes) || sellPriceKes <= 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      return Response.json({ error: 'Invalid SKU settings' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('admin_update_sku', {
      p_id: id,
      p_sell_price_kes: Math.round(sellPriceKes),
      p_low_stock_threshold: lowStockThreshold,
      p_actor_email: email,
    });
    if (error) throw error;
    return Response.json(data?.[0] ?? null);
  } catch (error) { return adminAuthResponse(error); }
}
