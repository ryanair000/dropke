import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { normalizePhone } from '@/lib/orders';
import { shouldProcessPaymentEvent } from '@/lib/payment-ledger';
import { verifyPaystackWebhook } from '@/lib/paystack';

test('Kenyan checkout phone numbers normalize to E.164', () => {
  assert.equal(normalizePhone('0712 345 678'), '+254712345678');
  assert.equal(normalizePhone('254712345678'), '+254712345678');
  assert.equal(normalizePhone('+254 712 345 678'), '+254712345678');
  assert.equal(normalizePhone('not-a-phone'), '');
});

test('Paystack webhook validation accepts only the correct signature', () => {
  const previous = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_dropke_test_secret';
  const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'DRP-TEST' } });
  const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(payload).digest('hex');

  assert.equal(verifyPaystackWebhook(payload, signature), true);
  assert.equal(verifyPaystackWebhook(`${payload} `, signature), false);
  if (previous === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previous;
});

test('failed Paystack events remain retryable while terminal events are idempotent', () => {
  assert.equal(shouldProcessPaymentEvent({ created: true, status: 'received' }), true);
  assert.equal(shouldProcessPaymentEvent({ created: false, status: 'failed' }), true);
  assert.equal(shouldProcessPaymentEvent({ created: false, status: 'received' }), true);
  assert.equal(shouldProcessPaymentEvent({ created: false, status: 'processed' }), false);
  assert.equal(shouldProcessPaymentEvent({ created: false, status: 'ignored' }), false);
});
