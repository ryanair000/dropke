import 'server-only';
import { currencySymbol } from '@/lib/catalog';
import { getServiceClient } from '@/lib/supabase/server';
import type { Platform, Quote, RegionCode, StockRow } from '@/types/dropke';

const MAX_WALLET_CARDS = 6;

type CandidateSku = {
  skuId: string;
  sku: string;
  denomination: number;
  sellPriceKes: number;
  available: number;
};

type WalletRoute = {
  matchedCredit: number;
  kesPrice: number;
  selections: CandidateSku[];
};

function betterRoute(next: WalletRoute, current: WalletRoute | null, target: number) {
  if (!current) return true;
  if (next.kesPrice !== current.kesPrice) return next.kesPrice < current.kesPrice;
  const nextOverage = Number((next.matchedCredit - target).toFixed(2));
  const currentOverage = Number((current.matchedCredit - target).toFixed(2));
  if (nextOverage !== currentOverage) return nextOverage < currentOverage;
  if (next.selections.length !== current.selections.length) return next.selections.length < current.selections.length;
  return next.matchedCredit < current.matchedCredit;
}

export function chooseWalletRoute(rows: StockRow[], target: number): WalletRoute | null {
  const candidates: CandidateSku[] = rows
    .filter((row) => row.active && Number(row.available_count) > 0 && Number(row.sell_price_kes) > 0)
    .map((row) => ({
      skuId: row.id,
      sku: row.sku,
      denomination: Number(row.denomination),
      sellPriceKes: Number(row.sell_price_kes),
      available: Math.max(0, Number(row.available_count)),
    }))
    .sort((a, b) => a.denomination - b.denomination);

  let best: WalletRoute | null = null;

  function visit(index: number, selections: CandidateSku[], credit: number, kes: number) {
    if (credit >= target) {
      const route = { matchedCredit: Number(credit.toFixed(2)), kesPrice: kes, selections: [...selections] };
      if (betterRoute(route, best, target)) best = route;
      return;
    }
    if (index >= candidates.length || selections.length >= MAX_WALLET_CARDS) return;

    const candidate = candidates[index];
    const room = MAX_WALLET_CARDS - selections.length;
    const maxQuantity = Math.min(candidate.available, room);

    for (let quantity = 0; quantity <= maxQuantity; quantity += 1) {
      for (let count = 0; count < quantity; count += 1) selections.push(candidate);
      visit(
        index + 1,
        selections,
        credit + candidate.denomination * quantity,
        kes + candidate.sellPriceKes * quantity,
      );
      for (let count = 0; count < quantity; count += 1) selections.pop();
    }
  }

  visit(0, [], 0, 0);
  return best;
}

export async function buildQuote(input: {
  productId: string;
  platform: Platform;
  region: RegionCode;
  customStorePrice?: number;
}): Promise<Quote> {
  // Quotes are public API responses, but inventory reads happen through the
  // server-only service client. Browser roles never receive inventory access.
  const supabase = getServiceClient();

  const [{ data: product, error: productError }, { data: setup, error: setupError }] = await Promise.all([
    supabase
      .from('products')
      .select('id,name,kind')
      .eq('id', input.productId)
      .eq('active', true)
      .maybeSingle(),
    supabase
      .from('platform_region_settings')
      .select('platform,region_code,region_name,store_currency,wallet_currency')
      .eq('platform', input.platform)
      .eq('region_code', input.region)
      .eq('public_enabled', true)
      .maybeSingle(),
  ]);

  if (productError) throw new Error(`QUOTE_PRODUCT_READ_FAILED:${productError.message}`);
  if (!product) throw new Error('UNKNOWN_PRODUCT');
  if (setupError) throw new Error(`QUOTE_SETUP_READ_FAILED:${setupError.message}`);
  if (!setup) throw new Error('PLATFORM_REGION_UNAVAILABLE');

  let storePrice: number;
  let storeCurrency = String(setup.store_currency);
  const walletCurrency = String(setup.wallet_currency);

  if (product.kind === 'custom') {
    storePrice = Number(input.customStorePrice);
  } else {
    const { data: price, error: priceError } = await supabase
      .from('product_prices')
      .select('store_price,store_currency')
      .eq('product_id', input.productId)
      .eq('platform', input.platform)
      .eq('region_code', input.region)
      .eq('is_current', true)
      .maybeSingle();
    if (priceError) throw new Error(`QUOTE_PRICE_READ_FAILED:${priceError.message}`);
    if (!price) throw new Error('PRICE_NOT_CONFIGURED');
    storePrice = Number(price.store_price);
    storeCurrency = String(price.store_currency);
  }

  if (!Number.isFinite(storePrice) || storePrice <= 0 || storePrice > 100000) {
    throw new Error('INVALID_STORE_PRICE');
  }

  // V2 currently routes wallet value only when the storefront and wallet use
  // the same currency. If a future region requires FX conversion, that must be
  // an explicit pricing rule rather than an accidental denomination match.
  if (storeCurrency !== walletCurrency) {
    throw new Error('CURRENCY_ROUTE_NOT_CONFIGURED');
  }

  const { error: releaseError } = await supabase.rpc('release_expired_inventory');
  if (releaseError) throw new Error(`QUOTE_RELEASE_FAILED:${releaseError.message}`);

  const { data, error } = await supabase
    .from('sku_stock')
    .select('id,sku,platform,region_code,region_name,currency,denomination,sell_price_kes,low_stock_threshold,active,available_count,reserved_count,sold_count')
    .eq('platform', input.platform)
    .eq('region_code', input.region)
    .eq('currency', walletCurrency)
    .eq('active', true)
    .order('denomination');
  if (error) throw new Error(`QUOTE_STOCK_READ_FAILED:${error.message}`);

  const rows = (data ?? []) as StockRow[];
  const route = chooseWalletRoute(rows, storePrice);
  const storeSymbol = currencySymbol(storeCurrency);
  const walletSymbol = currencySymbol(walletCurrency);

  if (!route) {
    return {
      productId: String(product.id),
      productName: String(product.name),
      platform: input.platform,
      region: input.region,
      regionName: String(setup.region_name),
      currency: storeCurrency,
      currencySymbol: storeSymbol,
      walletCurrency,
      storePrice,
      matchedCredit: 0,
      balanceRemaining: 0,
      kesPrice: 0,
      creditLabel: 'Out of stock',
      cardBreakdown: [],
      skuSelections: [],
      soldOut: true,
    };
  }

  return {
    productId: String(product.id),
    productName: String(product.name),
    platform: input.platform,
    region: input.region,
    regionName: String(setup.region_name),
    currency: storeCurrency,
    currencySymbol: storeSymbol,
    walletCurrency,
    storePrice,
    matchedCredit: route.matchedCredit,
    balanceRemaining: Number((route.matchedCredit - storePrice).toFixed(2)),
    kesPrice: route.kesPrice,
    creditLabel: `${walletSymbol}${route.matchedCredit} ${input.platform} credit`,
    cardBreakdown: route.selections.map((selection) => `${walletSymbol}${selection.denomination}`),
    skuSelections: route.selections.map((selection) => ({
      skuId: selection.skuId,
      sku: selection.sku,
      denomination: selection.denomination,
      sellPriceKes: selection.sellPriceKes,
    })),
    soldOut: false,
  };
}
