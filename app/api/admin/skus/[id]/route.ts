import { adminAuthResponse, requireAdmin } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return Response.json({ error: 'Invalid SKU id' }, { status: 400 });

    const { supabase, email } = await requireAdmin(request);
    const body = await request.json();
    const sellPriceKes = Number(body.sellPriceKes);
    const lowStockThreshold = Number(body.lowStockThreshold);
    if (!Number.isFinite(sellPriceKes) || sellPriceKes <= 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
      return Response.json({ error: 'Invalid SKU settings' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('gift_card_skus')
      .update({
        sell_price_kes: Math.round(sellPriceKes),
        low_stock_threshold: lowStockThreshold,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id,sku,sell_price_kes,low_stock_threshold')
      .maybeSingle();
    if (error) throw error;
    if (!updated) return Response.json({ error: 'SKU not found' }, { status: 404 });

    const { error: auditError } = await supabase.from('audit_logs').insert({
      actor_email: email,
      action: 'sku.update',
      resource: updated.sku,
      details: {
        sellPriceKes: Math.round(sellPriceKes),
        lowStockThreshold,
      },
    });
    if (auditError) throw auditError;

    return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminAuthResponse(error);
  }
}
