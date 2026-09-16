import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { encryptInventoryCode, inventoryEncryptionReady } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase } = await requireAdmin(request);
    const { data, error } = await supabase.rpc('admin_batches', { p_limit: 100 });
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) { return adminAuthResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, email } = await requireAdmin(request);
    if (!inventoryEncryptionReady()) {
      return Response.json({ error: 'Inventory encryption key is not configured' }, { status: 503 });
    }

    const body = await request.json();
    const skuId = String(body.skuId ?? '');
    const supplierName = String(body.supplierName ?? '').trim();
    const supplierRef = String(body.supplierRef ?? '').trim();
    const unitCostKes = Number(body.unitCostKes);
    const rawCodes: string[] = Array.isArray(body.codes)
      ? body.codes.map((value: unknown) => String(value).trim()).filter((value: string) => Boolean(value)).slice(0, 500)
      : [];

    if (!skuId || !supplierName || !rawCodes.length || !Number.isFinite(unitCostKes) || unitCostKes < 0) {
      return Response.json({ error: 'SKU, supplier, unit cost and codes are required' }, { status: 400 });
    }

    const encrypted = rawCodes.map(encryptInventoryCode);
    const unique = encrypted.filter((item, index, all) =>
      all.findIndex((candidate) => candidate.fingerprint === item.fingerprint) === index,
    );

    const { data, error } = await supabase.rpc('admin_create_encrypted_batch', {
      p_sku_id: skuId,
      p_supplier_name: supplierName,
      p_supplier_ref: supplierRef || null,
      p_unit_cost_kes: unitCostKes,
      p_codes: unique,
      p_actor_email: email,
    });
    if (error) {
      if (error.message.includes('ALL_CODES_DUPLICATE')) {
        return Response.json({ error: 'All submitted codes already exist for this SKU' }, { status: 409 });
      }
      throw error;
    }

    const result = data?.[0];
    return Response.json({ batchRef: result?.batch_ref, quantity: Number(result?.quantity ?? 0) }, { status: 201 });
  } catch (error) { return adminAuthResponse(error); }
}
