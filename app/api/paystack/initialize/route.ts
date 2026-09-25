import { getOrder } from '@/lib/orders';
import { beginPaymentAttempt, markPaymentAttemptFailed, markPaymentInitialized } from '@/lib/payment-ledger';
import { initializePaystack, paystackCheckoutReady, paystackMode } from '@/lib/paystack';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let currentOrderRef = '';
  try {
    if (!await consumeRateLimit(request, 'paystack:initialize', 10, 10 * 60)) return rateLimitResponse();
    const { orderRef } = await request.json();
    if (!orderRef) return Response.json({ error: 'Order reference is required' }, { status: 400 });
    currentOrderRef = String(orderRef);
    if (process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== 'true') return Response.json({ error: 'DROPKE checkout is not enabled yet' }, { status: 503 });
    if (!paystackCheckoutReady()) return Response.json({ error: paystackMode() === 'live' ? 'Live Paystack is still locked' : 'Paystack is not configured' }, { status: 503 });

    const order = await getOrder(currentOrderRef);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'awaiting_payment' || order.payment_status !== 'pending') {
      return Response.json({ error: 'This order can no longer start a new payment' }, { status: 409 });
    }

    const expiresAt = order.reservation_expires_at ? Date.parse(order.reservation_expires_at) : Number.NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      const supabase = getServiceClient();
      await supabase.rpc('release_order_inventory', { p_order_ref: order.ref });
      await supabase.from('orders').update({ status: 'cancelled' }).eq('ref', order.ref).eq('payment_status', 'pending');
      return Response.json({ error: 'Checkout session expired. Refresh the price and create a new order.' }, { status: 409 });
    }

    const existingAttempt = await beginPaymentAttempt(order);
    if (existingAttempt?.status === 'initialized' && existingAttempt.authorization_url) {
      return Response.json({ authorizationUrl: existingAttempt.authorization_url, reference: order.ref });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const result = await initializePaystack({
      reference: order.ref,
      email: order.email,
      amountKes: Number(order.kes_price),
      callbackUrl: `${baseUrl}/?payment=paystack&reference=${encodeURIComponent(order.ref)}`,
      phone: order.phone,
      productName: order.product_name,
    });
    await markPaymentInitialized(order.ref, result);

    return Response.json(
      { authorizationUrl: result.data.authorization_url, reference: order.ref },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (currentOrderRef) await markPaymentAttemptFailed(currentOrderRef, error);
    console.error('DROPKE Paystack initialization failed', error);
    return Response.json({ error: 'Could not start Paystack checkout' }, { status: 502 });
  }
}
