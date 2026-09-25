import { createOrder } from '@/lib/orders';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== 'true') return Response.json({ error: 'DROPKE checkout is not enabled yet' }, { status: 503 });
    if (!await consumeRateLimit(request, 'orders:create', 5, 30 * 60)) return rateLimitResponse();
    const body = await request.json();
    if (!body.quoteId) return Response.json({ error: 'A current quote is required' }, { status: 400 });
    const order = await createOrder({ quoteId: String(body.quoteId), email: String(body.email ?? ''), phone: String(body.phone ?? '') });
    return Response.json(order, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create order';
    if (message === 'CHECKOUT_DISABLED') return Response.json({ error: 'DROPKE checkout is not enabled yet' }, { status: 503 });
    if (message === 'QUOTE_EXPIRED' || message === 'INVALID_QUOTE') return Response.json({ error: 'Your quote expired. Refresh the price before paying.' }, { status: 409 });
    if (message === 'OUT_OF_STOCK') return Response.json({ error: 'Matched credit is out of stock' }, { status: 409 });
    if (message === 'INVALID_EMAIL' || message === 'INVALID_PHONE') return Response.json({ error: 'Enter a valid email and phone number' }, { status: 400 });
    console.error('DROPKE order creation failed', error);
    return Response.json({ error: 'Could not create order' }, { status: 500 });
  }
}
