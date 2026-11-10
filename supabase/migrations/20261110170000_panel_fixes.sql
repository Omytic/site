-- Panel düzeltmeleri (10 Kasım 2026)
-- 1) FormStep bedenleri: 36-37 … 42-43 ve 43-45 (43-44, 44-45, 45-48 yok)
-- 2) SERYN 18 g lansman ürünü
-- 3) Kullanıcı adı "ömer"
-- 4) Son düzenleyen (updated_by) kaydı
-- 5) Pazaryeri senkronu ile elle girilen kayıtların çakışmaması

-- 1) FormStep bedenleri ---------------------------------------------------------
delete from public.items i
 where i.sku ~ '^FS-M(100|300|900)-(4344|4445|4548)$'
   and not exists (select 1 from public.sale_items x where x.item_id = i.id)
   and not exists (select 1 from public.purchase_items x where x.item_id = i.id)
   and not exists (select 1 from public.shipment_items x where x.item_id = i.id)
   and not exists (select 1 from public.stock_movements x where x.item_id = i.id)
   and not exists (select 1 from public.channel_listings x where x.item_id = i.id);

insert into public.items (sku, name, brand, variant, unit, price, min_stock)
select 'FS-' || m || '-4345', 'FormStep ' || m, 'formstep', '43-45', 'adet', 200, 5
  from unnest(array['M100', 'M300', 'M900']) as m
on conflict (sku) do nothing;

-- 2) SERYN lansman ------------------------------------------------------------------
insert into public.items (sku, name, brand, variant, unit, price, min_stock) values
  ('SR-18G-L', 'SERYN Barrier Care Stick', 'seryn', '18 g · Lansman', 'adet', 499, 20)
on conflict (sku) do nothing;

-- 3) Kullanıcı adı ------------------------------------------------------------------
update public.profiles set username = 'ömer', full_name = 'Ömer' where username = 'omer';

-- 4) Son düzenleyen -----------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['items', 'sales', 'purchases', 'shipments', 'transactions', 'ad_budgets', 'ad_spend', 'tasks', 'assets'] loop
    execute format('alter table public.%I add column if not exists updated_by uuid references public.profiles(id) on delete set null', t);
  end loop;
end
$$;

-- Panel kullanıcısı değiştirdiyse onu, otomatik senkron değiştirdiyse boş (= otomatik) yazar
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := case when exists (select 1 from profiles where id = auth.uid()) then auth.uid() end;
  return new;
end
$$;

-- Sadece "son düzenleyen" değiştiyse geçmişe boş kayıt düşmesin
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);
  if tg_table_name = 'stock_movements'
     and (v_row ->> 'sale_item_id' is not null or v_row ->> 'purchase_item_id' is not null or v_row ->> 'shipment_item_id' is not null) then
    return null;
  end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at' - 'updated_by') = (v_new - 'updated_at' - 'updated_by') then
    return null;
  end if;
  insert into audit_log (user_id, table_name, row_id, action, old_data, new_data)
  values (
    case when exists (select 1 from profiles where id = auth.uid()) then auth.uid() end,
    tg_table_name, v_row ->> 'id', tg_op, v_old, v_new
  );
  return null;
end
$$;

-- 5) Senkron ile elle girişin çakışmaması -----------------------------------------
-- Pazaryerinin son bildirdiği durum: senkron sadece bu değişince satış durumunu günceller,
-- böylece elle yapılan durum değişikliği ezilmez.
alter table public.sales add column if not exists external_status text;

-- Panelden silinen pazaryeri siparişleri: senkron bunları bir daha içe aktarmaz.
create table if not exists public.sync_ignored (
  channel text not null,
  external_ref text not null,
  order_no text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.profiles(id) on delete set null,
  primary key (channel, external_ref)
);
alter table public.sync_ignored enable row level security;
drop policy if exists panel_all on public.sync_ignored;
create policy panel_all on public.sync_ignored for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());

create or replace function public.sales_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.external_ref is not null then
    insert into sync_ignored (channel, external_ref, order_no, deleted_by)
    values (old.channel, old.external_ref, old.order_no,
            case when exists (select 1 from profiles where id = auth.uid()) then auth.uid() end)
    on conflict do nothing;
  end if;
  return old;
end
$$;
drop trigger if exists sales_before_delete on public.sales;
create trigger sales_before_delete before delete on public.sales
  for each row execute function public.sales_before_delete();

-- Elle satış girerken: pazaryeri satışında sipariş no zorunlu ve aynı sipariş iki kez girilemez
create or replace function public.save_sale(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  h sales;
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
  v_default_loc text;
  v_order text;
  v_dup record;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;
  h := jsonb_populate_record(null::sales, p_header);
  v_order := nullif(btrim(h.order_no), '');
  if h.channel in ('trendyol', 'hepsiburada') and v_order is null then
    raise exception 'Trendyol ve Hepsiburada satışlarında sipariş numarası zorunlu (otomatik gelen siparişle çakışmasın diye).';
  end if;
  if h.channel in ('trendyol', 'hepsiburada', 'amazon') and v_order is not null then
    select s.sale_date, s.created_by, p.full_name into v_dup
      from sales s left join profiles p on p.id = s.created_by
     where s.channel = h.channel and btrim(s.order_no) = v_order and s.id is distinct from v_id
     limit 1;
    if found then
      raise exception 'Bu sipariş (%) zaten kayıtlı: % tarihli, % girmiş. Aynı siparişi tekrar girmeyin, mevcut kaydı düzenleyin.',
        v_order, to_char(v_dup.sale_date, 'DD.MM.YYYY'), coalesce(v_dup.full_name, 'otomatik senkron');
    end if;
  end if;
  v_default_loc := case when h.channel = 'amazon' then 'amazon' else 'depo' end;
  if v_id is null then
    insert into sales (sale_date, channel, order_no, customer, status, commission, shipping_cost, payment_status, due_date, note)
    values (coalesce(h.sale_date, current_date), h.channel, v_order, h.customer, coalesce(h.status, 'tamamlandi'),
            coalesce(h.commission, 0), coalesce(h.shipping_cost, 0), coalesce(h.payment_status, 'odendi'), h.due_date, h.note)
    returning id into v_id;
  else
    update sales
       set sale_date = coalesce(h.sale_date, current_date), channel = h.channel, order_no = v_order, customer = h.customer,
           status = coalesce(h.status, 'tamamlandi'), commission = coalesce(h.commission, 0),
           shipping_cost = coalesce(h.shipping_cost, 0), payment_status = coalesce(h.payment_status, 'odendi'),
           due_date = h.due_date, note = h.note
     where id = v_id;
    delete from sale_items where sale_id = v_id;
  end if;
  insert into sale_items (sale_id, item_id, qty, unit_price, location_id)
  select v_id, l.item_id, l.qty, coalesce(l.unit_price, 0), coalesce(l.location_id, v_default_loc)
    from jsonb_populate_recordset(null::sale_items, p_lines) l;
  return v_id;
end
$$;
grant execute on function public.save_sale(jsonb, jsonb) to authenticated;
