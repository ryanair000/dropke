import 'server-only';
import { productById, regions, walletDenominations } from '@/lib/catalog';
import { getServiceClient } from '@/lib/supabase/server';
import type { Platform, Quote, RegionCode, StockRow } from '@/types/dropke';

function combinations(values: number[], maxCards = 4) {
  const results: Array<{ total: number; cards: number[] }> = [];
  function visit(cards: number[], start: number) {
    if (cards.length) results.push({ total: cards.reduce((sum, value) => sum + value, 0), cards: [...cards] });
    if (cards.length === maxCards) return;
    for (let index = start; index < values.length; index += 1) {
      cards.push(values[index]);
      visit(cards, index);
      cards.pop();
    }
  }
  visit([], 0);
  return results;
}

export function matchWalletCredit(region: RegionCode, target: number) {
  const options = combinations(walletDenominations[region]).filter((option) => option.total >= target);
  options.sort((a, b) => a.total - b.total || a.cards.length - b.cards.length);
  if (options.length) return options[0];
  const max = walletDenominations[region][walletDenominations[region].length - 1];
  const count = Math.ceil(target / max);
  return { total: max * count, cards: Array.from({ length: count }, () => max) };
}

export async function buildQuote(input: { productId: string; platform: Platform; region: RegionCode; customStorePrice?: number }): Promise<Quote> {
  const product = productById[input.productId];
  if (!product) throw new Error('UNKNOWN_PRODUCT');
  const meta = regions[input.region];
  const storePrice = product.kind === 'custom' ? Number(input.customStorePrice) : Number(product.storePrices?.[input.region]);
  if (!Number.isFinite(storePrice) || storePrice <= 0) throw new Error('INVALID_STORE_PRICE');

  const matched = matchWalletCredit(input.region, storePrice);
  const supabase = getServiceClient();
  await supabase.rpc('release_expired_inventory');
  const { data, error } = await supabase.from('sku_stock').select('*').eq('platform', input.platform).eq('region_code', input.region).eq('active', true);
  if (error) throw new Error(`QUOTE_STOCK_READ_FAILED:${error.message}`);

  const rows = (data ?? []) as StockRow[];
  const selections = matched.cards.map((denomination) => {
    const row = rows.find((candidate) => Number(candidate.denomination) === denomination);
    if (!row) return null;
    return { skuId: row.id, sku: row.sku, denomination, sellPriceKes: Number(row.sell_price_kes), available: Number(row.available_count) };
  });

  const required = new Map<string, number>();
  for (const selection of selections) if (selection) required.set(selection.skuId, (required.get(selection.skuId) ?? 0) + 1);
  const soldOut = selections.some((selection) => !selection) || selections.some((selection) => selection && selection.available < (required.get(selection.skuId) ?? 1));
  const safeSelections = selections.filter((selection): selection is NonNullable<typeof selection> => Boolean(selection));

  return {
    productId: product.id,
    productName: product.name,
    platform: input.platform,
    region: input.region,
    regionName: meta.name,
    currency: meta.currency,
    currencySymbol: meta.symbol,
    storePrice,
    matchedCredit: matched.total,
    balanceRemaining: Number((matched.total - storePrice).toFixed(2)),
    kesPrice: safeSelections.reduce((sum, selection) => sum + selection.sellPriceKes, 0),
    creditLabel: `${meta.symbol}${matched.total} ${input.platform} credit`,
    cardBreakdown: matched.cards.map((value) => `${meta.symbol}${value}`),
    skuSelections: safeSelections.map(({ available: _available, ...selection }) => selection),
    soldOut,
  };
}
