import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptInventoryCode } from '@/lib/crypto';
import { getServiceClient } from '@/lib/supabase/server';
import type { PublicOrder, SafeCheckout } from '@/types/dropke';

type OrderRecord = {
  ref: string;
  product_name: string;
  platform: PublicOrder['platform'];
  region_name: string;
  currency: string;
  store_price: number | string;
  matched_credit: number | string;
  balance_remaining: number | string;
  kes_price: number | string;
  status: PublicOrder['status'];
  payment_status: PublicOrder['paymentStatus'];
  created_at: string;
  delivered_at?: string | null;
  delivery_token_hash?: string | null;
  email: string;
  phone: string;
};

type QuoteSnapshot = {
  product_name: string;
  platform: SafeCheckout['platform'];
  region_name: string;
  store_price: number | string;
  matched_credit: number | string;
  balance_remaining: number | string;
  kes_price: number | string;
  credit_label: string;
  card_breakdown: unknown;
};

function makeOrderRef() {
  return `DRP-${randomBytes(12).toString('hex').toUpperCase()}`;
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('254')) return `+${digits}`;
  if (digits.length === 9 && /^[17]/.test(digits)) return `+254${digits}`;
  if (digits.length >= 9 && digits.length <= 15) return `+${digits}`;
  return '';
}

function hashDeliveryToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function contactMatches(order: { email: string; phone: string }, contact: string) {
  const normalized = contact.trim().toLowerCase();
  const normalizedPhone = normalizePhone(normalized);
  return order.email.toLowerCase() === normalized
    || Boolean(normalizedPhone && order.phone === normalizedPhone);
}

function deliveryTokenMatches(expectedHash: string | null | undefined, token: string | undefined) {
  if (!expectedHash || !token) return false;
  const actual = hashDeliveryToken(token);
  if (actual.length !== expectedHash.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
}

async function hydrateOrder(order: OrderRecord, includeCodes = false): Promise<PublicOrder> {
  let codes: string[] = [];
  if (includeCodes && order.status === 'delivered') {
    const { data, error } = await getServiceClient()
      .from('inventory_codes')
      .select('ciphertext,iv,tag,key_version')
      .eq('order_ref', order.ref)
      .eq('status', 'sold')
      .order('sold_at');
    if (error) throw new Error(`ORDER_DELIVERY_READ_FAILED:${error.message}`);
    codes = (data ?? []).map((record) => decryptInventoryCode(record));
  }

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

export async function createOrder(input: { quoteId: string; email: string; phone: string }) {
  if (process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== 'true') throw new Error('CHECKOUT_DISABLED');
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('INVALID_EMAIL');
  if (!phone) throw new Error('INVALID_PHONE');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.quoteId)) {
    throw new Error('INVALID_QUOTE');
  }

  const ref = makeOrderRef();
  const deliveryToken = randomBytes(32).toString('base64url');
  const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await getServiceClient().rpc('create_order_from_quote', {
    p_quote_id: input.quoteId,
    p_order_ref: ref,
    p_email: email,
    p_phone: phone,
    p_delivery_token_hash: hashDeliveryToken(deliveryToken),
    p_reservation_expires_at: reservationExpiresAt,
  });

  if (error) {
    if (error.message.includes('QUOTE_EXPIRED')) throw new Error('QUOTE_EXPIRED');
    if (error.message.includes('OUT_OF_STOCK')) throw new Error('OUT_OF_STOCK');
    throw new Error(`ORDER_CREATE_FAILED:${error.message}`);
  }

  const order = await getOrder(ref);
  if (!order) throw new Error('ORDER_CREATE_FAILED:order was not returned');
  const { data: snapshot, error: snapshotError } = await getServiceClient()
    .from('checkout_quotes')
    .select('product_name,platform,region_name,store_price,matched_credit,balance_remaining,kes_price,credit_label,card_breakdown')
    .eq('id', input.quoteId)
    .single();
  if (snapshotError || !snapshot) throw new Error(`ORDER_QUOTE_READ_FAILED:${snapshotError?.message ?? 'missing quote'}`);
  return { ref, deliveryToken, reservationExpiresAt, quote: snapshotToSafeCheckout(snapshot) };
}

export async function getOrder(ref: string) {
  const { data, error } = await getServiceClient().from('orders').select('*').eq('ref', ref).maybeSingle();
  if (error) throw new Error(`ORDER_READ_FAILED:${error.message}`);
  return data;
}

export async function getPublicOrder(ref: string, contact: string, deliveryToken?: string) {
  const order = await getOrder(ref);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (!contactMatches(order, contact)) throw new Error('CONTACT_MISMATCH');
  return hydrateOrder(order, deliveryTokenMatches(order.delivery_token_hash, deliveryToken));
}

export async function finalizePaidOrder(ref: string, paymentReference: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc('finalize_paid_order', {
    p_order_ref: ref,
    p_payment_reference: paymentReference,
  });
  if (error) throw new Error(`ORDER_FINALIZE_FAILED:${error.message}`);

  const result = data?.[0];
  const order = await getOrder(ref);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  return {
    order: await hydrateOrder(order, false),
    status: String(result?.order_status ?? order.status),
    deliveredCount: Number(result?.delivered_count ?? 0),
    expectedCount: Number(result?.expected_count ?? 0),
  };
}

function snapshotToSafeCheckout(snapshot: QuoteSnapshot): SafeCheckout {
  return {
    productName: String(snapshot.product_name),
    platform: snapshot.platform,
    regionName: String(snapshot.region_name),
    storePrice: Number(snapshot.store_price),
    matchedCredit: Number(snapshot.matched_credit),
    balanceRemaining: Number(snapshot.balance_remaining),
    kesPrice: Number(snapshot.kes_price),
    creditLabel: String(snapshot.credit_label),
    cardBreakdown: Array.isArray(snapshot.card_breakdown) ? snapshot.card_breakdown.map(String) : [],
    soldOut: false,
  };
}
