import { finalizePaidOrder, getOrder } from '@/lib/orders';
import { verifyPaystackWebhook } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature') ?? '';
  if (!verifyPaystackWebhook(rawBody, signature)) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  if (event.event !== 'charge.success' || !event.data?.reference) {
    return Response.json({ received: true, ignored: true });
  }

  try {
    const order = await getOrder(String(event.data.reference));
    if (!order) {
      console.warn('DROPKE Paystack webhook references unknown order', event.data.reference);
      return Response.json({ received: true, ignored: true });
    }

    const validPayment =
      event.data.status === 'success'
      && String(event.data.currency) === 'KES'
      && Number(event.data.amount) === Number(order.kes_price) * 100;

    if (!validPayment) {
      console.warn('DROPKE Paystack webhook failed order validation', order.ref);
      return Response.json({ received: true, ignored: true });
    }

    await finalizePaidOrder(order.ref, String(event.data.reference));
    return Response.json({ received: true });
  } catch (error) {
    console.error('DROPKE Paystack webhook processing failed', error);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
