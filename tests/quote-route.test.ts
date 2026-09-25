import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseWalletRoute } from '@/lib/quote';
import type { StockRow } from '@/types/dropke';

function stock(overrides: Partial<StockRow> & Pick<StockRow, 'id' | 'sku' | 'denomination' | 'sell_price_kes' | 'available_count'>): StockRow {
  return {
    platform: 'PlayStation',
    region_code: 'US',
    region_name: 'USA',
    currency: 'USD',
    low_stock_threshold: 2,
    active: true,
    reserved_count: 0,
    sold_count: 0,
    ...overrides,
  };
}

test('wallet routing prefers the lowest KSh cost', () => {
  const route = chooseWalletRoute([
    stock({ id: 'small', sku: 'SMALL', denomination: 10, sell_price_kes: 1_000, available_count: 2 }),
    stock({ id: 'large', sku: 'LARGE', denomination: 25, sell_price_kes: 1_500, available_count: 1 }),
  ], 20);

  assert.equal(route?.kesPrice, 1_500);
  assert.equal(route?.matchedCredit, 25);
  assert.deepEqual(route?.selections.map((item) => item.sku), ['LARGE']);
});

test('wallet routing respects stock and the six-card limit', () => {
  const route = chooseWalletRoute([
    stock({ id: 'only', sku: 'ONLY', denomination: 10, sell_price_kes: 100, available_count: 10 }),
  ], 70);

  assert.equal(route, null);
});

test('wallet routing uses lower overage when prices tie', () => {
  const route = chooseWalletRoute([
    stock({ id: 'exact', sku: 'EXACT', denomination: 20, sell_price_kes: 1_000, available_count: 1 }),
    stock({ id: 'over', sku: 'OVER', denomination: 25, sell_price_kes: 1_000, available_count: 1 }),
  ], 20);

  assert.equal(route?.selections[0].sku, 'EXACT');
});
