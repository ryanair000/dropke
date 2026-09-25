import { isPlatform, isRegionCode } from '@/lib/catalog';
import { buildQuote, createCheckoutQuote } from '@/lib/quote';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!await consumeRateLimit(request, 'quote', 80, 60)) return rateLimitResponse();
    const body = await request.json();
    if (!body.productId || !isPlatform(body.platform) || !isRegionCode(body.region)) {
      return Response.json({ error: 'Invalid quote request' }, { status: 400 });
    }
    const input = {
      productId: String(body.productId),
      platform: body.platform,
      region: body.region,
      customStorePrice: body.customStorePrice,
    };
    const quote = body.preview === true
      ? await buildQuote(input)
      : await createCheckoutQuote(input);
    return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not build quote';
    if (message === 'INVALID_STORE_PRICE') return Response.json({ error: 'Enter a valid Fortnite store price' }, { status: 400 });
    if (['UNKNOWN_PRODUCT', 'PLATFORM_REGION_UNAVAILABLE', 'PRICE_NOT_CONFIGURED', 'CURRENCY_ROUTE_NOT_CONFIGURED'].includes(message)) {
      return Response.json({ error: 'This product and account setup is not currently available' }, { status: 409 });
    }
    console.error('DROPKE quote failed', error);
    return Response.json({ error: 'Could not build quote' }, { status: 503 });
  }
}
