import { finalizePaidOrder, getOrder } from '@/lib/orders';
import { finishPaymentEvent, markPaymentAttemptPaid, recordPaymentEvent } from '@/lib/payment-ledger';
import { verifyPaystack } from '@/lib/paystack';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    if (!await consumeRateLimit(request, 'paystack:verify', 30, 10 * 60)) return rateLimitResponse();
    const { ref } = await params;
    const order = await getOrder(ref);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
    if (order.status === 'delivered') return Response.json({ status: 'delivered', ref: order.ref });
    const result = await verifyPaystack(ref);
    const data = result.data;
    if (data.status !== 'success') return Response.json({ error: 'Payment has not been confirmed' }, { status: 402 });
    if (String(data.currency) !== 'KES' || Number(data.amount) !== Number(order.kes_price) * 100) return Response.json({ error: 'Payment verification mismatch' }, { status: 409 });
    const eventKey = `verify:${String(data.id ?? data.reference)}`;
    await recordPaymentEvent({
      key: eventKey,
      orderRef: order.ref,
      eventType: 'transaction.verify',
      providerStatus: String(data.status),
      amount: Number(data.amount),
      currency: String(data.currency),
    });
    await markPaymentAttemptPaid(order.ref);
    const fulfilment = await finalizePaidOrder(order.ref, String(data.reference));
    await finishPaymentEvent(
      eventKey,
      fulfilment.status === 'delivered' ? 'processed' : 'failed',
      fulfilment.status === 'delivered' ? undefined : 'PAID_PENDING_FULFILMENT',
    );
    return Response.json(
      { status: fulfilment.status, ref: order.ref },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('DROPKE Paystack verification failed', error);
    return Response.json({ error: 'Could not verify payment' }, { status: 502 });
  }
}
