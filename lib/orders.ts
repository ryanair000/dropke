import { randomBytes } from 'node:crypto';
import { decryptInventoryCode } from '@/lib/crypto';
import { getServiceClient } from '@/lib/db';
import { buildQuote } from '@/lib/quote';
import type { Platform, PublicOrder, Quote, RegionCode } from '@/types/dropke';

function makeOrderRef() {
  return `DRP-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function normalizePhone(value: string) {
  return value.replace(/\s+/g, '').trim();
}

function contactMatches(order: { email: string; phone: string }, contact: string) {
  const normalized = contact.trim().toLowerCase();
  return order.email.toLowerCase() === normalized || normalizePhone(order.phone).toLowerCase() === normalizePhone(normalized).toLowerCase();
}

async function hydrateOrder(order: any): Promise<PublicOrder> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('inventory_codes')
    .select('ciphertext,iv,tag')
    .eq('order_ref', order.ref)
    .eq('status', 'sold')
    .order('sold_at');
  const codes = (data ?? []).map((record) => decryptInventoryCode(record));
  return {
    ref: order.ref,
    productName: order.product_name,
    platform: order.platform,
    regionName: order.region_name,
    currency: order.currency,
    storePrice: Number(order.store_price),
    matchedCredit: Number(order.matched_credit),
    balanceRemaining: Number(order.balance_remaining),
    kesPrice: Number(order.kes_price),
    status: order.status,
    paymentStatus: order.payment_status,
    createdAt: order.created_at,
    deliveredAt: order.delivered_at ?? undefined,
    codes: codes.length ? codes : undefined,
  };
}

export async function createOrder(input: {
  productId: string;
  platform: Platform;
  region: RegionCode;
  customStorePrice?: number;
  email: string;
  phone: string;
}) {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');
  if (phone.length < 9) throw new Error('INVALID_PHONE');

  const quote = await buildQuote(input);
  if (quote.soldOut || quote.skuSelections.length !== quote.cardBreakdown.length) throw new Error('OUT_OF_STOCK');

  const supabase = getServiceClient();
  const ref = makeOrderRef();
  const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const skuIds = quote.skuSelections.map((selection) => selection.skuId);

  const { error: reserveError } = await supabase.rpc('reserve_inventory', {
    p_order_ref: ref,
    p_sku_ids: skuIds,
    p_expires_at: reservationExpiresAt,
  });
  if (reserveError) throw new Error('OUT_OF_STOCK');

  const { error: orderError } = await supabase.from('orders').insert({
    ref,
    status: 'awaiting_payment',
    payment_status: 'pending',
    payment_provider: 'paystack',
    product_id: quote.productId,
    product_name: quote.productName,
    platform: quote.platform,
    region_code: quote.region,
    region_name: quote.regionName,
    currency: quote.currency,
    store_price: quote.storePrice,
    matched_credit: quote.matchedCredit,
    balance_remaining: quote.balanceRemaining,
    kes_price: quote.kesPrice,
    email,
    phone,
    reservation_expires_at: reservationExpiresAt,
  });
  if (orderError) {
    await supabase.rpc('release_order_inventory', { p_order_ref: ref });
    throw new Error(`ORDER_CREATE_FAILED:${orderError.message}`);
  }

  const items = quote.skuSelections.map((selection, index) => ({
    order_ref: ref,
    sku_id: selection.skuId,
    denomination: selection.denomination,
    position: index + 1,
  }));
  const { error: itemError } = await supabase.from('order_items').insert(items);
  if (itemError) {
    await supabase.rpc('release_order_inventory', { p_order_ref: ref });
    await supabase.from('orders').delete().eq('ref', ref);
    throw new Error(`ORDER_ITEMS_FAILED:${itemError.message}`);
  }

  return { ref, quote, reservationExpiresAt, email, phone };
}

export async function getOrder(ref: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from('orders').select('*').eq('ref', ref).maybeSingle();
  if (error) throw new Error(`ORDER_READ_FAILED:${error.message}`);
  return data;
}

export async function getPublicOrder(ref: string, contact: string) {
  const order = await getOrder(ref);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (!contactMatches(order, contact)) throw new Error('CONTACT_MISMATCH');
  return hydrateOrder(order);
}

export async function finalizePaidOrder(ref: string, paymentReference: string) {
  const supabase = getServiceClient();
  const order = await getOrder(ref);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.status === 'delivered') return hydrateOrder(order);

  const paidAt = order.paid_at ?? new Date().toISOString();
  await supabase.from('orders').update({
    status: 'paid_pending_fulfilment',
    payment_status: 'success',
    payment_reference: paymentReference,
    paid_at: paidAt,
  }).eq('ref', ref);

  await supabase.rpc('finalize_inventory', { p_order_ref: ref });

  const [{ count: expected }, { count: delivered }] = await Promise.all([
    supabase.from('order_items').select('*', { count: 'exact', head: true }).eq('order_ref', ref),
    supabase.from('inventory_codes').select('*', { count: 'exact', head: true }).eq('order_ref', ref).eq('status', 'sold'),
  ]);

  if (!expected || delivered !== expected) {
    const pending = await getOrder(ref);
    return pending ? hydrateOrder(pending) : null;
  }

  const deliveredAt = new Date().toISOString();
  await supabase.from('orders').update({
    status: 'delivered',
    payment_status: 'success',
    delivered_at: deliveredAt,
  }).eq('ref', ref);

  const finalOrder = await getOrder(ref);
  return finalOrder ? hydrateOrder(finalOrder) : null;
}

export function quoteToSafeCheckout(quote: Quote) {
  return {
    productName: quote.productName,
    platform: quote.platform,
    regionName: quote.regionName,
    storePrice: quote.storePrice,
    matchedCredit: quote.matchedCredit,
    balanceRemaining: quote.balanceRemaining,
    kesPrice: quote.kesPrice,
    creditLabel: quote.creditLabel,
    cardBreakdown: quote.cardBreakdown,
    soldOut: quote.soldOut,
  };
}
