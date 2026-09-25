import { getPublicCatalog } from '@/lib/public-catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const catalog = await getPublicCatalog();

    return Response.json(catalog, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('DROPKE catalog failed', error);
    return Response.json({ error: 'Catalog is temporarily unavailable' }, { status: 503 });
  }
}
