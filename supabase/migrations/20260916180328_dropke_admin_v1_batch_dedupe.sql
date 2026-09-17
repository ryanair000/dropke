create or replace function public.admin_create_encrypted_batch(
  p_sku_id uuid,
  p_supplier_name text,
  p_supplier_ref text,
  p_unit_cost_kes numeric,
  p_codes jsonb
)
returns table(batch_ref text, quantity integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_batch_id uuid;
  v_batch_ref text;
  v_requested integer;
  v_inserted integer := 0;
  v_row_count integer;
  v_code jsonb;
  v_sku text;
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  if nullif(trim(p_supplier_name), '') is null then
    raise exception 'SUPPLIER_REQUIRED' using errcode = '22023';
  end if;
  if p_unit_cost_kes is null or p_unit_cost_kes < 0 then
    raise exception 'INVALID_UNIT_COST' using errcode = '22023';
  end if;
  if jsonb_typeof(p_codes) <> 'array' then
    raise exception 'INVALID_CODES' using errcode = '22023';
  end if;

  v_requested := jsonb_array_length(p_codes);
  if v_requested < 1 or v_requested > 500 then
    raise exception 'INVALID_CODE_COUNT' using errcode = '22023';
  end if;

  select g.sku into v_sku
  from public.gift_card_skus g
  where g.id = p_sku_id and g.active = true;
  if v_sku is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_batch_ref := 'BAT-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  insert into public.supplier_batches(batch_ref, sku_id, supplier_name, supplier_ref, unit_cost_kes, quantity, created_by)
  values (v_batch_ref, p_sku_id, trim(p_supplier_name), nullif(trim(coalesce(p_supplier_ref, '')), ''), p_unit_cost_kes, v_requested, v_email)
  returning id into v_batch_id;

  for v_code in select value from jsonb_array_elements(p_codes)
  loop
    if coalesce(v_code->>'fingerprint','') = '' or coalesce(v_code->>'ciphertext','') = '' or
       coalesce(v_code->>'iv','') = '' or coalesce(v_code->>'tag','') = '' or coalesce(v_code->>'hint','') = '' then
      raise exception 'INVALID_ENCRYPTED_CODE' using errcode = '22023';
    end if;

    insert into public.inventory_codes(sku_id, batch_id, fingerprint, ciphertext, iv, tag, hint)
    values (p_sku_id, v_batch_id, v_code->>'fingerprint', v_code->>'ciphertext', v_code->>'iv', v_code->>'tag', v_code->>'hint')
    on conflict (sku_id, fingerprint) do nothing;
    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  if v_inserted = 0 then
    raise exception 'ALL_CODES_DUPLICATE' using errcode = '23505';
  end if;

  update public.supplier_batches set quantity = v_inserted where id = v_batch_id;

  insert into public.audit_logs(actor_email, action, resource, details)
  values (v_email, 'batch.create', v_batch_ref, jsonb_build_object(
    'sku', v_sku,
    'quantity', v_inserted,
    'duplicatesSkipped', v_requested - v_inserted,
    'supplier', trim(p_supplier_name)
  ));

  return query select v_batch_ref, v_inserted;
end;
$$;

revoke all on function public.admin_create_encrypted_batch(uuid,text,text,numeric,jsonb) from public, anon;
grant execute on function public.admin_create_encrypted_batch(uuid,text,text,numeric,jsonb) to authenticated;
