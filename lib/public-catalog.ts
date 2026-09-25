import 'server-only';

import { getPublicServerClient } from '@/lib/supabase/server';
import type { Platform, ProductKind, PublicCatalog, RegionCode } from '@/types/dropke';

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const supabase = getPublicServerClient();
  const [{ data: products, error: productError }, { data: setups, error: setupError }] = await Promise.all([
    supabase
      .from('products')
      .select('id,name,short_name,description,kind,vbucks_amount,sort_order')
      .eq('active', true)
      .order('sort_order'),
    supabase
      .from('platform_region_settings')
      .select('platform,region_code,region_name,store_currency,wallet_currency')
      .eq('public_enabled', true)
      .order('platform')
      .order('region_code'),
  ]);

  if (productError) throw productError;
  if (setupError) throw setupError;

  return {
    products: (products ?? []).map((product) => ({
      id: String(product.id),
      name: String(product.name),
      shortName: String(product.short_name),
      description: String(product.description),
      kind: String(product.kind) as ProductKind,
      vbucksAmount: product.vbucks_amount == null ? undefined : Number(product.vbucks_amount),
    })),
    setups: (setups ?? []).map((setup) => ({
      platform: String(setup.platform) as Platform,
      region: String(setup.region_code) as RegionCode,
      regionName: String(setup.region_name),
      storeCurrency: String(setup.store_currency),
      walletCurrency: String(setup.wallet_currency),
    })),
  };
}
