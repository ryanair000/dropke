import { getPublicOrder } from '@/lib/orders';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    if (!await consumeRateLimit(request, 'orders:track', 15, 10 * 60)) return rateLimitResponse();
    const { ref } = await params;
    const body = await request.json();
    const contact = String(body.contact ?? '').trim();
    const deliveryToken = body.deliveryToken ? String(body.deliveryToken) : undefined;
    if (!contact) return Response.json({ error: 'Checkout contact is required' }, { status: 400 });
    const order = await getPublicOrder(ref, contact, deliveryToken);
    return Response.json(order, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not find order';
    if (message === 'ORDER_NOT_FOUND' || message === 'CONTACT_MISMATCH') {
      return Response.json({ error: 'Order not found for those details' }, { status: 404 });
    }
    console.error('DROPKE order lookup failed', error);
    return Response.json({ error: 'Could not load order' }, { status: 500 });
  }
}
