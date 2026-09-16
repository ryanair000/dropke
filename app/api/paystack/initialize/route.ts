import { getOrder } from '@/lib/orders';
import { initializePaystack, paystackCheckoutReady, paystackMode } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { orderRef } = await request.json();
    if (!orderRef) return Response.json({ error: 'Order reference is required' }, { status: 400 });
    if (process.env.NEXT_PUBLIC_CHECKOUT_ENABLED !== 'true') return Response.json({ error: 'DROPKE checkout is not enabled yet' }, { status: 503 });
    if (!paystackCheckoutReady()) return Response.json({ error: paystackMode() === 'live' ? 'Live Paystack is still locked' : 'Paystack is not configured' }, { status: 503 });
    const order = await getOrder(String(orderRef));
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 });
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const result = await initializePaystack({ reference: order.ref, email: order.email, amountKes: Number(order.kes_price), callbackUrl: `${baseUrl}/?payment=paystack&reference=${encodeURIComponent(order.ref)}`, phone: order.phone, productName: order.product_name });
    return Response.json({ authorizationUrl: result.data.authorization_url, accessCode: result.data.access_code, reference: order.ref });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not start Paystack checkout' }, { status: 502 }); }
}
