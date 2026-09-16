import { isPlatform, isRegionCode } from '@/lib/catalog';
import { buildQuote } from '@/lib/quote';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.productId || !isPlatform(body.platform) || !isRegionCode(body.region)) {
      return Response.json({ error: 'Invalid quote request' }, { status: 400 });
    }
    const quote = await buildQuote({
      productId: String(body.productId),
      platform: body.platform,
      region: body.region,
      customStorePrice: body.customStorePrice,
    });
    return Response.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not build quote';
    const status = message.includes('SUPABASE') ? 503 : 400;
    return Response.json({ error: message === 'INVALID_STORE_PRICE' ? 'Enter a valid Fortnite store price' : message }, { status });
  }
}
