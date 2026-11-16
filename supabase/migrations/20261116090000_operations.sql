-- =====================================================================
-- Fuar satışı (kasa), iş birlikleri, talepler (numune), faturalar,
-- pazaryeri paket ürünleri ve kampanya/indirim alanları
-- Önce 20261115200000_fairs.sql çalışmış olmalı. Tekrar çalıştırılabilir.
-- =====================================================================

-- 1) Satış: fuar kanalı, fuar bağlantısı, ödeme şekli ---------------------
alter table public.sales drop constraint if exists sales_channel_check;
alter table public.sales add constraint sales_channel_check
  check (channel in ('amazon', 'trendyol', 'hepsiburada', 'seryn_site', 'toptan', 'fuar', 'diger'));
alter table public.sales add column if not exists fair_id uuid references public.fairs(id) on delete set null;
alter table public.sales add column if not exists payment_method text;
alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check check (payment_method is null or payment_method in ('nakit', 'kart', 'havale', 'diger'));
create index if not exists sales_fair_idx on public.sales (fair_id);

-- Satır: liste fiyatı ve indirimler (indirim = bizim yaptığımız, platform_discount = pazaryerinin karşıladığı)
alter table public.sale_items add column if not exists list_price numeric(12, 2);
alter table public.sale_items add column if not exists discount numeric(12, 2) not null default 0;
alter table public.sale_items add column if not exists platform_discount numeric(12, 2) not null default 0;
alter table public.sale_items add column if not exists campaign text;

create or replace view public.sale_lines with (security_invoker = true) as
select s.id as sale_id, s.sale_date, s.channel, s.status, s.order_no,
       si.id as sale_item_id, si.item_id, i.brand, i.name, i.variant, i.unit,
       si.qty, si.unit_price, coalesce(si.unit_cost, 0) as unit_cost, si.location_id,
       (si.qty * si.unit_price)::numeric(12, 2) as revenue,
       (si.qty * coalesce(si.unit_cost, 0))::numeric(12, 2) as cogs,
       si.list_price, si.discount, si.platform_discount, si.campaign, s.fair_id, s.payment_method, s.created_at
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.items i on i.id = si.item_id;

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
  if h.fair_id is not null and h.channel <> 'fuar' then
    h.channel := 'fuar';
  end if;
  v_default_loc := case when h.channel = 'amazon' then 'amazon' else 'depo' end;
  if v_id is null then
    insert into sales (sale_date, channel, order_no, customer, status, commission, shipping_cost, payment_status, due_date, note, fair_id, payment_method)
    values (coalesce(h.sale_date, current_date), h.channel, v_order, h.customer, coalesce(h.status, 'tamamlandi'),
            coalesce(h.commission, 0), coalesce(h.shipping_cost, 0), coalesce(h.payment_status, 'odendi'), h.due_date, h.note,
            h.fair_id, h.payment_method)
    returning id into v_id;
  else
    update sales
       set sale_date = coalesce(h.sale_date, current_date), channel = h.channel, order_no = v_order, customer = h.customer,
           status = coalesce(h.status, 'tamamlandi'), commission = coalesce(h.commission, 0),
           shipping_cost = coalesce(h.shipping_cost, 0), payment_status = coalesce(h.payment_status, 'odendi'),
           due_date = h.due_date, note = h.note, fair_id = h.fair_id, payment_method = h.payment_method
     where id = v_id;
    delete from sale_items where sale_id = v_id;
  end if;
  insert into sale_items (sale_id, item_id, qty, unit_price, location_id, list_price, discount, campaign)
  select v_id, l.item_id, l.qty, coalesce(l.unit_price, 0), coalesce(l.location_id, v_default_loc),
         l.list_price, coalesce(l.discount, 0), l.campaign
    from jsonb_populate_recordset(null::sale_items, p_lines) l;
  return v_id;
end
$$;

-- 2) Fuara götürülen ürünler ---------------------------------------------
create table if not exists public.fair_items (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty_taken numeric(12, 2) not null default 0 check (qty_taken >= 0),
  price numeric(12, 2),
  created_at timestamptz not null default now(),
  unique (fair_id, item_id)
);

-- Fuar giderleri Finans'taki gelir/gider kayıtlarıdır; fuara bağlanır
alter table public.transactions add column if not exists fair_id uuid references public.fairs(id) on delete set null;
create index if not exists transactions_fair_idx on public.transactions (fair_id);

-- 3) Pazaryeri paket ürünleri: bir ilan birden çok ürün/adet olabilir -----------
-- components: [{"item_id": "...", "qty": 2}]  — boşsa ilan item_id'deki tek ürünün 1 adedidir
alter table public.channel_listings add column if not exists components jsonb;

-- 4) Stok hareketi türleri ve bağlantıları ---------------------------------
alter table public.stock_movements drop constraint if exists stock_movements_kind_check;
alter table public.stock_movements add constraint stock_movements_kind_check
  check (kind in ('acilis', 'alis', 'satis', 'iade', 'transfer', 'sayim', 'fire', 'numune', 'isbirligi'));

-- 5) İş birlikleri ---------------------------------------------------------
create table if not exists public.collaborations (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  handle text,
  platform text not null default 'instagram' check (platform in ('instagram', 'tiktok', 'youtube', 'x', 'diger')),
  brand text not null default 'seryn' check (brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  scope text,
  fee numeric(12, 2) not null default 0 check (fee >= 0),
  shipping numeric(12, 2) not null default 0 check (shipping >= 0),
  status text not null default 'planlandi' check (status in ('planlandi', 'gonderildi', 'paylasildi', 'tamamlandi', 'iptal')),
  sent_date date,
  post_url text,
  phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);
create table if not exists public.collab_items (
  id uuid primary key default gen_random_uuid(),
  collab_id uuid not null references public.collaborations(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(12, 2) not null check (qty > 0)
);
alter table public.stock_movements add column if not exists collab_item_id uuid references public.collab_items(id) on delete cascade;
alter table public.ad_spend add column if not exists collab_id uuid references public.collaborations(id) on delete cascade;

-- Gönderildiğinde ürünler depodan düşer; ücret + kargo Reklam'a (dolayısıyla Finans'a) gider olarak yazılır
create or replace function public.sync_collab(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  c collaborations;
begin
  delete from stock_movements where collab_item_id in (select id from collab_items where collab_id = p_id);
  delete from ad_spend where collab_id = p_id;
  select * into c from collaborations where id = p_id;
  if not found or c.status = 'iptal' then
    return;
  end if;
  if c.sent_date is not null then
    insert into stock_movements (item_id, location_id, qty, kind, moved_at, note, collab_item_id)
    select ci.item_id, 'depo', -ci.qty, 'isbirligi', c.sent_date, 'İş birliği: ' || c.person, ci.id
      from collab_items ci where ci.collab_id = p_id;
  end if;
  if c.fee + c.shipping > 0 then
    insert into ad_spend (spend_date, platform, brand, amount, campaign, note, collab_id)
    values (coalesce(c.sent_date, c.created_at::date), 'isbirligi', c.brand, c.fee + c.shipping,
            c.person || coalesce(' (' || c.handle || ')', ''),
            concat_ws(' · ', nullif(c.scope, ''), case when c.fee > 0 then 'ücret ' || c.fee end, case when c.shipping > 0 then 'kargo ' || c.shipping end),
            p_id);
  end if;
end
$$;

create or replace function public.collab_after()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'collaborations' then
    if tg_op <> 'DELETE' then
      perform sync_collab(new.id);
    end if;
  else
    perform sync_collab(coalesce(new.collab_id, old.collab_id));
  end if;
  return null;
end
$$;
drop trigger if exists collaborations_sync on public.collaborations;
create trigger collaborations_sync after insert or update on public.collaborations for each row execute function public.collab_after();
drop trigger if exists collab_items_sync on public.collab_items;
create trigger collab_items_sync after insert or update or delete on public.collab_items for each row execute function public.collab_after();

create or replace function public.save_collab(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  h collaborations;
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  h := jsonb_populate_record(null::collaborations, p_header);
  if v_id is null then
    insert into collaborations (person, handle, platform, brand, scope, fee, shipping, status, sent_date, post_url, phone, note)
    values (h.person, h.handle, coalesce(h.platform, 'instagram'), coalesce(h.brand, 'seryn'), h.scope, coalesce(h.fee, 0), coalesce(h.shipping, 0),
            coalesce(h.status, 'planlandi'), h.sent_date, h.post_url, h.phone, h.note)
    returning id into v_id;
  else
    update collaborations
       set person = h.person, handle = h.handle, platform = coalesce(h.platform, 'instagram'), brand = coalesce(h.brand, 'seryn'),
           scope = h.scope, fee = coalesce(h.fee, 0), shipping = coalesce(h.shipping, 0), status = coalesce(h.status, 'planlandi'),
           sent_date = h.sent_date, post_url = h.post_url, phone = h.phone, note = h.note
     where id = v_id;
    delete from collab_items where collab_id = v_id;
  end if;
  insert into collab_items (collab_id, item_id, qty)
  select v_id, l.item_id, l.qty from jsonb_populate_recordset(null::collab_items, coalesce(p_lines, '[]'::jsonb)) l where l.qty > 0;
  return v_id;
end
$$;

-- 6) Talepler (toptan teklif, bayilik, numune) ------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'telefon' check (source in ('site', 'fuar', 'telefon', 'whatsapp', 'instagram', 'eposta', 'diger')),
  kind text not null default 'toptan' check (kind in ('toptan', 'bayi', 'numune', 'isbirligi', 'diger')),
  brand text check (brand is null or brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  name text not null,
  company text,
  phone text,
  email text,
  city text,
  address text,
  message text,
  status text not null default 'yeni' check (status in ('yeni', 'gorusuldu', 'teklif', 'numune', 'kazanildi', 'kaybedildi')),
  owner uuid references public.profiles(id) on delete set null,
  next_date date,
  fair_id uuid references public.fairs(id) on delete set null,
  sample_sent_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists leads_status_idx on public.leads (status, created_at desc);
create table if not exists public.lead_items (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(12, 2) not null default 1 check (qty > 0)
);
alter table public.stock_movements add column if not exists lead_item_id uuid references public.lead_items(id) on delete cascade;

-- Numune gönderildi tarihi girilince istenen ürünler depodan "numune" olarak düşer
create or replace function public.sync_lead(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  l leads;
begin
  delete from stock_movements where lead_item_id in (select id from lead_items where lead_id = p_id);
  select * into l from leads where id = p_id;
  if found and l.sample_sent_at is not null then
    insert into stock_movements (item_id, location_id, qty, kind, moved_at, note, lead_item_id)
    select li.item_id, 'depo', -li.qty, 'numune', l.sample_sent_at, 'Numune: ' || coalesce(l.company, l.name), li.id
      from lead_items li where li.lead_id = p_id;
  end if;
end
$$;
create or replace function public.lead_after()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'leads' then
    if tg_op <> 'DELETE' then
      perform sync_lead(new.id);
    end if;
  else
    perform sync_lead(coalesce(new.lead_id, old.lead_id));
  end if;
  return null;
end
$$;
drop trigger if exists leads_sync on public.leads;
create trigger leads_sync after insert or update on public.leads for each row execute function public.lead_after();
drop trigger if exists lead_items_sync on public.lead_items;
create trigger lead_items_sync after insert or update or delete on public.lead_items for each row execute function public.lead_after();

create or replace function public.save_lead(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  h leads;
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  h := jsonb_populate_record(null::leads, p_header);
  if v_id is null then
    insert into leads (source, kind, brand, name, company, phone, email, city, address, message, status, owner, next_date, fair_id, sample_sent_at, note)
    values (coalesce(h.source, 'telefon'), coalesce(h.kind, 'toptan'), h.brand, h.name, h.company, h.phone, h.email, h.city, h.address, h.message,
            coalesce(h.status, 'yeni'), h.owner, h.next_date, h.fair_id, h.sample_sent_at, h.note)
    returning id into v_id;
  else
    update leads
       set source = coalesce(h.source, 'telefon'), kind = coalesce(h.kind, 'toptan'), brand = h.brand, name = h.name, company = h.company,
           phone = h.phone, email = h.email, city = h.city, address = h.address, message = h.message, status = coalesce(h.status, 'yeni'),
           owner = h.owner, next_date = h.next_date, fair_id = h.fair_id, sample_sent_at = h.sample_sent_at, note = h.note
     where id = v_id;
    delete from lead_items where lead_id = v_id;
  end if;
  insert into lead_items (lead_id, item_id, qty)
  select v_id, x.item_id, x.qty from jsonb_populate_recordset(null::lead_items, coalesce(p_lines, '[]'::jsonb)) x where x.qty > 0;
  return v_id;
end
$$;

-- 7) Faturalar ---------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  inv_date date not null default current_date,
  kind text not null default 'satis' check (kind in ('satis', 'alis', 'gider', 'iade')),
  issuer text,
  number text,
  counterparty text,
  amount numeric(12, 2),
  vat numeric(12, 2),
  brand text check (brand is null or brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  file_path text,
  file_name text,
  file_size int,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists invoices_date_idx on public.invoices (inv_date desc);

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('invoices', 'invoices', false, 20971520)
    on conflict (id) do nothing;
    execute 'drop policy if exists invoices_panel on storage.objects';
    execute $p$create policy invoices_panel on storage.objects for all to authenticated
      using (bucket_id = 'invoices' and public.is_panel_user())
      with check (bucket_id = 'invoices' and public.is_panel_user())$p$;
  end if;
end
$$;

-- 8) Güvenlik, güncelleme izi, düzenleme geçmişi ------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['fair_items', 'collaborations', 'collab_items', 'leads', 'lead_items', 'invoices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists panel_all on public.%I', t);
    execute format('create policy panel_all on public.%I for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
  foreach t in array array['collaborations', 'leads', 'invoices'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end
$$;
grant execute on function public.save_collab(jsonb, jsonb), public.save_lead(jsonb, jsonb) to authenticated;
