import { getPublicOrder } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const contact = new URL(request.url).searchParams.get('contact') ?? '';
    if (!contact) return Response.json({ error: 'Order reference and checkout contact are required' }, { status: 401 });
    return Response.json(await getPublicOrder(ref, contact));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not find order';
    if (message === 'ORDER_NOT_FOUND') return Response.json({ error: 'Order not found' }, { status: 404 });
    if (message === 'CONTACT_MISMATCH') return Response.json({ error: 'Checkout contact does not match this order' }, { status: 401 });
    return Response.json({ error: 'Could not load order' }, { status: 500 });
  }
}
