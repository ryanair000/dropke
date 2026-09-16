import { adminAuthResponse, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const { error: releaseError } = await supabase.rpc('release_expired_inventory');
    if (releaseError) throw releaseError;

    const { data, error } = await supabase
      .from('sku_stock')
      .select('id,sku,platform,region_code,region_name,currency,denomination,sell_price_kes,low_stock_threshold,active,available_count,reserved_count,sold_count')
      .order('platform')
      .order('region_code')
      .order('denomination');
    if (error) throw error;
    return Response.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return adminAuthResponse(error);
  }
}
