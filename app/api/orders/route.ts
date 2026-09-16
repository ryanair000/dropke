import { isPlatform, isRegionCode } from '@/lib/catalog';
import { createOrder, quoteToSafeCheckout } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.productId || !isPlatform(body.platform) || !isRegionCode(body.region)) return Response.json({ error: 'Invalid order request' }, { status: 400 });
    const order = await createOrder({ productId: String(body.productId), platform: body.platform, region: body.region, customStorePrice: body.customStorePrice, email: String(body.email ?? ''), phone: String(body.phone ?? '') });
    return Response.json({ ref: order.ref, reservationExpiresAt: order.reservationExpiresAt, quote: quoteToSafeCheckout(order.quote) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create order';
    if (message === 'OUT_OF_STOCK') return Response.json({ error: 'Matched credit is out of stock' }, { status: 409 });
    if (message === 'INVALID_EMAIL' || message === 'INVALID_PHONE') return Response.json({ error: 'Enter a valid email and phone number' }, { status: 400 });
    return Response.json({ error: message }, { status: 500 });
  }
}
