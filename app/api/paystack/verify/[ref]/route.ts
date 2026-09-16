import { finalizePaidOrder, getOrder } from '@/lib/orders';
import { verifyPaystack } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { ref: string } }) {
  try {
    const order = await getOrder(params.ref);
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
    if (order.status === 'delivered') return Response.json({ status: 'delivered', ref: order.ref });
    const result = await verifyPaystack(params.ref);
    const data = result.data;
    if (data.status !== 'success') return Response.json({ error: 'Payment has not been confirmed' }, { status: 402 });
    if (String(data.currency) !== 'KES' || Number(data.amount) !== Number(order.kes_price) * 100) return Response.json({ error: 'Payment verification mismatch' }, { status: 409 });
    const fulfilled = await finalizePaidOrder(order.ref, String(data.reference));
    return Response.json({ status: fulfilled?.status ?? 'paid_pending_fulfilment', ref: order.ref });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not verify payment' }, { status: 502 });
  }
}
