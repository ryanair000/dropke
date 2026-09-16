import { finalizePaidOrder, getOrder } from '@/lib/orders';
import { verifyPaystackWebhook } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature') ?? '';
  if (!verifyPaystackWebhook(rawBody, signature)) return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  try {
    const event = JSON.parse(rawBody);
    if (event.event === 'charge.success' && event.data?.reference) {
      const order = await getOrder(String(event.data.reference));
      if (order && event.data.status === 'success' && String(event.data.currency) === 'KES' && Number(event.data.amount) === Number(order.kes_price) * 100) {
        await finalizePaidOrder(order.ref, String(event.data.reference));
      }
    }
    return Response.json({ received: true });
  } catch {
    return Response.json({ received: true });
  }
}
