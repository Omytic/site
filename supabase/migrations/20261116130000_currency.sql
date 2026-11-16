-- =====================================================================
-- Döviz: dolar / euro ile alım, satış, gider ve ürün fiyatı.
-- Kur TCMB'den otomatik gelir (fx_rates önbelleği); tutarlar ayrıca TL olarak saklanır,
-- böylece bütün raporlar ve kâr hesapları TL üzerinden çalışmaya devam eder.
-- Tekrar çalıştırılabilir.
-- =====================================================================

-- 1) TCMB kur önbelleği (bülten tarihi = TCMB'nin ilan ettiği gün)
create table if not exists public.fx_rates (
  rate_date date not null,
  currency text not null check (currency in ('USD', 'EUR')),
  buying numeric(14, 4),
  selling numeric(14, 4) not null,
  bulletin text,
  fetched_at timestamptz not null default now(),
  primary key (rate_date, currency)
);
alter table public.fx_rates enable row level security;
drop policy if exists panel_read on public.fx_rates;
create policy panel_read on public.fx_rates for select to authenticated using (public.is_panel_user());
grant select on public.fx_rates to authenticated;
grant select, insert, update, delete on public.fx_rates to service_role;

-- 2) Ürün kartı: hangi para biriminde alınıp satılıyor
alter table public.items add column if not exists currency text not null default 'TRY';
alter table public.items drop constraint if exists items_currency_check;
alter table public.items add constraint items_currency_check check (currency in ('TRY', 'USD', 'EUR'));
alter table public.items add column if not exists fx_price numeric(12, 4);
alter table public.items add column if not exists fx_cost numeric(12, 4);

-- 3) Alım, satış, gelir/gider: işlemin para birimi, kullanılan kur ve döviz tutarı
do $$
declare
  t text;
begin
  foreach t in array array['purchases', 'sales', 'transactions'] loop
    execute format('alter table public.%I add column if not exists currency text not null default ''TRY''', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_currency_check');
    execute format('alter table public.%I add constraint %I check (currency in (''TRY'', ''USD'', ''EUR''))', t, t || '_currency_check');
    execute format('alter table public.%I add column if not exists fx_rate numeric(14, 4)', t);
  end loop;
end
$$;
alter table public.purchase_items add column if not exists fx_unit_cost numeric(12, 4);
alter table public.sale_items add column if not exists fx_unit_price numeric(12, 4);
alter table public.transactions add column if not exists fx_amount numeric(12, 2);

-- 4) Alım kaydı: döviz alanlarıyla
create or replace function public.save_purchase(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  h purchases;
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;
  h := jsonb_populate_record(null::purchases, p_header);
  if coalesce(h.currency, 'TRY') <> 'TRY' and coalesce(h.fx_rate, 0) <= 0 then
    raise exception 'Döviz kuru eksik. Kuru girin ya da TCMB kurunun gelmesini bekleyin.';
  end if;
  if v_id is null then
    insert into purchases (purchase_date, supplier, invoice_no, shipping_cost, payment_status, due_date, note, currency, fx_rate)
    values (coalesce(h.purchase_date, current_date), h.supplier, h.invoice_no, coalesce(h.shipping_cost, 0),
            coalesce(h.payment_status, 'odendi'), h.due_date, h.note, coalesce(h.currency, 'TRY'),
            case when coalesce(h.currency, 'TRY') = 'TRY' then null else h.fx_rate end)
    returning id into v_id;
  else
    update purchases
       set purchase_date = coalesce(h.purchase_date, current_date), supplier = h.supplier, invoice_no = h.invoice_no,
           shipping_cost = coalesce(h.shipping_cost, 0), payment_status = coalesce(h.payment_status, 'odendi'),
           due_date = h.due_date, note = h.note, currency = coalesce(h.currency, 'TRY'),
           fx_rate = case when coalesce(h.currency, 'TRY') = 'TRY' then null else h.fx_rate end
     where id = v_id;
    delete from purchase_items where purchase_id = v_id;
  end if;
  insert into purchase_items (purchase_id, item_id, qty, unit_cost, location_id, fx_unit_cost)
  select v_id, l.item_id, l.qty, coalesce(l.unit_cost, 0), coalesce(l.location_id, 'depo'), l.fx_unit_cost
    from jsonb_populate_recordset(null::purchase_items, p_lines) l;
  return v_id;
end
$$;

-- Alımdan sonra ürün kartının son maliyeti: TL her zaman; ürün dövizle tutuluyorsa döviz maliyeti de
create or replace function public.purchase_items_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur text;
begin
  perform sync_purchase_item(new.id);
  if new.unit_cost > 0 then
    update items set cost = new.unit_cost where id = new.item_id and cost is distinct from new.unit_cost;
  end if;
  if new.fx_unit_cost > 0 then
    select currency into v_cur from purchases where id = new.purchase_id;
    update items set fx_cost = new.fx_unit_cost where id = new.item_id and currency = v_cur and fx_cost is distinct from new.fx_unit_cost;
  end if;
  return null;
end
$$;

-- 5) Satış kaydı: döviz alanlarıyla (önceki sürümün bütün kuralları aynen)
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
  v_fx numeric;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;
  h := jsonb_populate_record(null::sales, p_header);
  if coalesce(h.currency, 'TRY') <> 'TRY' and coalesce(h.fx_rate, 0) <= 0 then
    raise exception 'Döviz kuru eksik. Kuru girin ya da TCMB kurunun gelmesini bekleyin.';
  end if;
  v_fx := case when coalesce(h.currency, 'TRY') = 'TRY' then null else h.fx_rate end;
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
  if h.fair_id is not null and h.channel <> 'fuar' then
    h.channel := 'fuar';
  end if;
  v_default_loc := case when h.channel = 'amazon' then 'amazon' else 'depo' end;
  if v_id is null then
    insert into sales (sale_date, channel, order_no, customer, status, commission, shipping_cost, payment_status, due_date, note, fair_id, payment_method, currency, fx_rate)
    values (coalesce(h.sale_date, current_date), h.channel, v_order, h.customer, coalesce(h.status, 'tamamlandi'),
            coalesce(h.commission, 0), coalesce(h.shipping_cost, 0), coalesce(h.payment_status, 'odendi'), h.due_date, h.note,
            h.fair_id, h.payment_method, coalesce(h.currency, 'TRY'), v_fx)
    returning id into v_id;
  else
    update sales
       set sale_date = coalesce(h.sale_date, current_date), channel = h.channel, order_no = v_order, customer = h.customer,
           status = coalesce(h.status, 'tamamlandi'), commission = coalesce(h.commission, 0),
           shipping_cost = coalesce(h.shipping_cost, 0), payment_status = coalesce(h.payment_status, 'odendi'),
           due_date = h.due_date, note = h.note, fair_id = h.fair_id, payment_method = h.payment_method,
           currency = coalesce(h.currency, 'TRY'), fx_rate = v_fx
     where id = v_id;
    delete from sale_items where sale_id = v_id;
  end if;
  insert into sale_items (sale_id, item_id, qty, unit_price, location_id, list_price, discount, campaign, fx_unit_price)
  select v_id, l.item_id, l.qty, coalesce(l.unit_price, 0), coalesce(l.location_id, v_default_loc),
         l.list_price, coalesce(l.discount, 0), l.campaign, l.fx_unit_price
    from jsonb_populate_recordset(null::sale_items, p_lines) l;
  return v_id;
end
$$;

-- 6) Dövizli ürünlerin TL satış fiyatını son TCMB kuruna göre güncelle (her gün kur gelince çağrılır)
create or replace function public.refresh_fx_prices()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with r as (
    select distinct on (currency) currency, selling from fx_rates order by currency, rate_date desc
  )
  update items i
     set price = round(i.fx_price * r.selling, 2)
    from r
   where i.currency = r.currency and i.fx_price > 0 and i.price is distinct from round(i.fx_price * r.selling, 2);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.refresh_fx_prices() from public, anon;
grant execute on function public.refresh_fx_prices() to authenticated, service_role;
