import { randomBytes } from 'node:crypto';
import { adminAuthResponse, requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { encryptInventoryCode, inventoryEncryptionReady } from '@/lib/crypto';
import { getServiceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { data, error } = await getServiceClient().from('supplier_batches').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) { return adminAuthResponse(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!inventoryEncryptionReady()) return Response.json({ error: 'Inventory encryption key is not configured' }, { status: 503 });
    const body = await request.json();
    const skuId = String(body.skuId ?? '');
    const supplierName = String(body.supplierName ?? '').trim();
    const supplierRef = String(body.supplierRef ?? '').trim();
    const unitCostKes = Number(body.unitCostKes);
    const rawCodes = Array.isArray(body.codes) ? body.codes.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 200) : [];
    if (!skuId || !supplierName || !rawCodes.length || !Number.isFinite(unitCostKes) || unitCostKes < 0) return Response.json({ error: 'SKU, supplier, unit cost and codes are required' }, { status: 400 });

    const supabase = getServiceClient();
    const { data: sku, error: skuError } = await supabase.from('gift_card_skus').select('id,sku').eq('id', skuId).single();
    if (skuError || !sku) return Response.json({ error: 'SKU not found' }, { status: 404 });

    const encrypted = rawCodes.map(encryptInventoryCode);
    const fingerprints = [...new Set(encrypted.map((item) => item.fingerprint))];
    const { data: existing } = await supabase.from('inventory_codes').select('fingerprint').eq('sku_id', skuId).in('fingerprint', fingerprints);
    const known = new Set((existing ?? []).map((item) => item.fingerprint));
    const unique = encrypted.filter((item, index, all) => !known.has(item.fingerprint) && all.findIndex((candidate) => candidate.fingerprint === item.fingerprint) === index);
    if (!unique.length) return Response.json({ error: 'All submitted codes already exist for this SKU' }, { status: 409 });

    const batchRef = `BAT-${randomBytes(5).toString('hex').toUpperCase()}`;
    const { data: batch, error: batchError } = await supabase.from('supplier_batches').insert({ batch_ref: batchRef, sku_id: skuId, supplier_name: supplierName, supplier_ref: supplierRef || null, unit_cost_kes: unitCostKes, quantity: unique.length, created_by: admin.email }).select('id,batch_ref').single();
    if (batchError || !batch) throw batchError ?? new Error('Could not create batch');

    const { error: codeError } = await supabase.from('inventory_codes').insert(unique.map((item) => ({ sku_id: skuId, batch_id: batch.id, fingerprint: item.fingerprint, ciphertext: item.ciphertext, iv: item.iv, tag: item.tag, hint: item.hint, status: 'available' })));
    if (codeError) { await supabase.from('supplier_batches').delete().eq('id', batch.id); throw codeError; }

    await writeAudit(admin.email, 'vault_batch.create', sku.sku, { batchRef, quantity: unique.length, unitCostKes });
    return Response.json({ batchRef, quantity: unique.length }, { status: 201 });
  } catch (error) { return adminAuthResponse(error); }
}
