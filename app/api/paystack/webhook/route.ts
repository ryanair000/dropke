import { finalizePaidOrder, getOrder } from '@/lib/orders';
import {
  finishPaymentEvent,
  markPaymentAttemptPaid,
  paymentEventKey,
  recordPaymentEvent,
  shouldProcessPaymentEvent,
  type PaystackEvent,
} from '@/lib/payment-ledger';
import { verifyPaystackWebhook } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature') ?? '';
  if (!verifyPaystackWebhook(rawBody, signature)) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  if (event.event !== 'charge.success' || !event.data?.reference) {
    return Response.json({ received: true, ignored: true });
  }

  const ref = String(event.data.reference);
  const key = paymentEventKey(rawBody, event);
  try {
    const order = await getOrder(ref);
    const ledgerEntry = await recordPaymentEvent({
      key,
      orderRef: order?.ref,
      eventType: String(event.event),
      providerStatus: String(event.data.status ?? ''),
      amount: Number(event.data.amount),
      currency: String(event.data.currency ?? ''),
    });
    if (!shouldProcessPaymentEvent(ledgerEntry)) {
      return Response.json({ received: true, duplicate: true });
    }

    if (!order) {
      await finishPaymentEvent(key, 'ignored', 'UNKNOWN_ORDER');
      console.warn('DROPKE Paystack webhook references unknown order', ref);
      return Response.json({ received: true, ignored: true });
    }

    const validPayment = event.data.status === 'success'
      && String(event.data.currency) === 'KES'
      && Number(event.data.amount) === Number(order.kes_price) * 100;
    if (!validPayment) {
      await finishPaymentEvent(key, 'ignored', 'PAYMENT_VALIDATION_MISMATCH');
      console.warn('DROPKE Paystack webhook failed order validation', order.ref);
      return Response.json({ received: true, ignored: true });
    }

    await markPaymentAttemptPaid(order.ref);
    const fulfilment = await finalizePaidOrder(order.ref, String(event.data.reference));
    if (fulfilment.status !== 'delivered') {
      await finishPaymentEvent(key, 'failed', 'PAID_PENDING_FULFILMENT');
      return Response.json({ error: 'Fulfilment retry required' }, { status: 500 });
    }
    await finishPaymentEvent(key, 'processed');
    return Response.json({ received: true, status: fulfilment.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WEBHOOK_PROCESSING_FAILED';
    try {
      await finishPaymentEvent(key, 'failed', message);
    } catch (ledgerError) {
      console.error('DROPKE payment event failure could not be recorded', ledgerError);
    }
    console.error('DROPKE Paystack webhook processing failed', error);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
