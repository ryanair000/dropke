import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() { return process.env.PAYSTACK_SECRET_KEY?.trim() ?? ''; }

export function paystackMode() {
  const value = secret();
  if (!value) return 'disabled';
  if (value.startsWith('sk_test_')) return 'test';
  if (value.startsWith('sk_live_')) return 'live';
  return 'invalid';
}

export function paystackCheckoutReady() {
  const mode = paystackMode();
  if (mode === 'test') return true;
  return mode === 'live' && process.env.PAYSTACK_LIVE_ENABLED === 'true';
}

async function request(path: string, init?: RequestInit) {
  if (!paystackCheckoutReady()) throw new Error('PAYSTACK_NOT_ENABLED');
  const response = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || !payload.status) throw new Error(payload.message ?? 'PAYSTACK_REQUEST_FAILED');
  return payload;
}

export async function initializePaystack(input: { reference: string; email: string; amountKes: number; callbackUrl: string; phone: string; productName: string }) {
  return request('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: input.email, amount: Math.round(input.amountKes * 100), currency: 'KES', reference: input.reference, callback_url: input.callbackUrl, metadata: { order_ref: input.reference, phone: input.phone, product: input.productName } }) });
}

export async function verifyPaystack(reference: string) { return request(`/transaction/verify/${encodeURIComponent(reference)}`); }

export function verifyPaystackWebhook(rawBody: string, signature: string) {
  if (!paystackCheckoutReady() || !signature) return false;
  const expected = createHmac('sha512', secret()).update(rawBody).digest('hex');
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
