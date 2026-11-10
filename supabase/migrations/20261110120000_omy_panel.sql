-- =====================================================================
-- OMY Panel — stok, satış, alım, Amazon sevkiyatı, finans, reklam,
-- işler, dijital varlıklar ve düzenleme geçmişi.
--
-- Temel ilke: stok elle tutulmaz. Her satış / alım / sevkiyat satırı
-- kendi stok hareketini (stock_movements) tetikleyiciyle üretir; satır
-- silinince ya da değişince hareket de otomatik silinir/yenilenir.
-- Stok = hareketlerin toplamı (stock_levels görünümü).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Kullanıcılar
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  color text not null default '#E3AB3B',
  created_at timestamptz not null default now()
);

-- Panele yalnızca profiles tablosunda kaydı olan hesaplar girebilir.
create or replace function public.is_panel_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------
-- Ürün kartları ve stok yerleri
-- ---------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  brand text not null check (brand in ('formstep', 'seryn', 'kumas', 'diger')),
  variant text,
  unit text not null default 'adet' check (unit in ('adet', 'metre', 'top', 'kg', 'paket')),
  cost numeric(12, 2) not null default 0,
  price numeric(12, 2) not null default 0,
  min_stock numeric(12, 2) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.locations (
  id text primary key,
  name text not null,
  sort int not null default 0
);

insert into public.locations (id, name, sort) values
  ('depo', 'Depo', 1),
  ('yolda', 'Amazon''a yolda', 2),
  ('amazon', 'Amazon FBA', 3)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Satışlar
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default current_date,
  channel text not null check (channel in ('amazon', 'trendyol', 'hepsiburada', 'seryn_site', 'toptan', 'diger')),
  order_no text,
  customer text,
  status text not null default 'tamamlandi' check (status in ('tamamlandi', 'iade', 'iptal')),
  commission numeric(12, 2) not null default 0,
  shipping_cost numeric(12, 2) not null default 0,
  payment_status text not null default 'odendi' check (payment_status in ('odendi', 'bekliyor')),
  due_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(12, 2) not null check (qty > 0),
  unit_price numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2),
  location_id text not null default 'depo' references public.locations(id)
);

-- ---------------------------------------------------------------------
-- Alımlar
-- ---------------------------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  supplier text,
  invoice_no text,
  shipping_cost numeric(12, 2) not null default 0,
  payment_status text not null default 'odendi' check (payment_status in ('odendi', 'bekliyor')),
  due_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(12, 2) not null check (qty > 0),
  unit_cost numeric(12, 2) not null default 0,
  location_id text not null default 'depo' references public.locations(id)
);

-- ---------------------------------------------------------------------
-- Amazon sevkiyatları (depo → yolda → Amazon FBA)
-- ---------------------------------------------------------------------
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  ship_date date not null default current_date,
  reference text,
  carrier text,
  status text not null default 'hazirlaniyor' check (status in ('hazirlaniyor', 'yolda', 'teslim_alindi', 'iptal')),
  shipping_cost numeric(12, 2) not null default 0,
  received_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(12, 2) not null check (qty > 0)
);

-- ---------------------------------------------------------------------
-- Stok hareketleri (tek gerçek kaynak)
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  location_id text not null references public.locations(id),
  qty numeric(12, 2) not null check (qty <> 0),
  kind text not null check (kind in ('acilis', 'alis', 'satis', 'iade', 'transfer', 'sayim', 'fire', 'numune')),
  sale_item_id uuid references public.sale_items(id) on delete cascade,
  purchase_item_id uuid references public.purchase_items(id) on delete cascade,
  shipment_item_id uuid references public.shipment_items(id) on delete cascade,
  moved_at date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create index if not exists stock_movements_item_idx on public.stock_movements (item_id, location_id);
create index if not exists stock_movements_sale_item_idx on public.stock_movements (sale_item_id);
create index if not exists stock_movements_purchase_item_idx on public.stock_movements (purchase_item_id);
create index if not exists stock_movements_shipment_item_idx on public.stock_movements (shipment_item_id);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index if not exists shipment_items_shipment_idx on public.shipment_items (shipment_id);
create index if not exists sales_date_idx on public.sales (sale_date desc);

-- ---------------------------------------------------------------------
-- Finans, reklam, işler, dijital varlıklar
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  tx_date date not null default current_date,
  direction text not null check (direction in ('gelir', 'gider')),
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  brand text not null default 'genel' check (brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  channel text,
  counterparty text,
  payment_status text not null default 'odendi' check (payment_status in ('odendi', 'bekliyor')),
  due_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.ad_budgets (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  platform text not null,
  brand text not null check (brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  budget numeric(12, 2) not null check (budget >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  unique (month, platform, brand)
);

create table if not exists public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  spend_date date not null default current_date,
  platform text not null,
  brand text not null check (brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  amount numeric(12, 2) not null check (amount > 0),
  campaign text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'yapilacak' check (status in ('yapilacak', 'devam', 'bitti')),
  priority text not null default 'normal' check (priority in ('dusuk', 'normal', 'yuksek')),
  assignee uuid references public.profiles(id) on delete set null,
  brand text check (brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('site', 'instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin', 'pazaryeri', 'diger')),
  name text not null,
  url text unique,
  handle text,
  brand text not null default 'genel' check (brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  owner uuid references public.profiles(id) on delete set null,
  followers int,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

create table if not exists public.asset_metrics (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  metric_date date not null default current_date,
  followers int not null check (followers >= 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Düzenleme geçmişi
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  row_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);

-- =====================================================================
-- Otomatik stok
-- =====================================================================

-- Satış satırı → stok hareketi
create or replace function public.sync_sale_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  delete from stock_movements where sale_item_id = p_id;
  select si.item_id, si.qty, si.location_id, s.status, s.sale_date
    into r
    from sale_items si
    join sales s on s.id = si.sale_id
   where si.id = p_id;
  if not found then
    return;
  end if;
  if r.status in ('tamamlandi', 'iade') then
    insert into stock_movements (item_id, location_id, qty, kind, sale_item_id, moved_at, created_by)
    values (r.item_id, r.location_id, -r.qty, 'satis', p_id, r.sale_date, auth.uid());
  end if;
  if r.status = 'iade' then
    insert into stock_movements (item_id, location_id, qty, kind, sale_item_id, moved_at, created_by)
    values (r.item_id, r.location_id, r.qty, 'iade', p_id, r.sale_date, auth.uid());
  end if;
end
$$;

create or replace function public.sale_items_before()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Kâr hesabı için satış anındaki maliyeti sabitle
  if new.unit_cost is null then
    select cost into new.unit_cost from items where id = new.item_id;
  end if;
  return new;
end
$$;

create or replace function public.sale_items_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_sale_item(new.id);
  return null;
end
$$;

create or replace function public.sales_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if new.status is distinct from old.status or new.sale_date is distinct from old.sale_date then
    for v in select id from sale_items where sale_id = new.id loop
      perform sync_sale_item(v);
    end loop;
  end if;
  return null;
end
$$;

drop trigger if exists sale_items_before on public.sale_items;
create trigger sale_items_before before insert or update on public.sale_items
  for each row execute function public.sale_items_before();
drop trigger if exists sale_items_after on public.sale_items;
create trigger sale_items_after after insert or update on public.sale_items
  for each row execute function public.sale_items_after();
drop trigger if exists sales_after_update on public.sales;
create trigger sales_after_update after update on public.sales
  for each row execute function public.sales_after_update();

-- Alım satırı → stok hareketi (+ ürünün son alış maliyeti)
create or replace function public.sync_purchase_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  delete from stock_movements where purchase_item_id = p_id;
  select pi.item_id, pi.qty, pi.unit_cost, pi.location_id, p.purchase_date
    into r
    from purchase_items pi
    join purchases p on p.id = pi.purchase_id
   where pi.id = p_id;
  if not found then
    return;
  end if;
  insert into stock_movements (item_id, location_id, qty, kind, purchase_item_id, moved_at, created_by)
  values (r.item_id, r.location_id, r.qty, 'alis', p_id, r.purchase_date, auth.uid());
end
$$;

create or replace function public.purchase_items_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_purchase_item(new.id);
  if new.unit_cost > 0 then
    update items set cost = new.unit_cost where id = new.item_id and cost is distinct from new.unit_cost;
  end if;
  return null;
end
$$;

create or replace function public.purchases_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if new.purchase_date is distinct from old.purchase_date then
    for v in select id from purchase_items where purchase_id = new.id loop
      perform sync_purchase_item(v);
    end loop;
  end if;
  return null;
end
$$;

drop trigger if exists purchase_items_after on public.purchase_items;
create trigger purchase_items_after after insert or update on public.purchase_items
  for each row execute function public.purchase_items_after();
drop trigger if exists purchases_after_update on public.purchases;
create trigger purchases_after_update after update on public.purchases
  for each row execute function public.purchases_after_update();

-- Sevkiyat satırı → transfer hareketleri (duruma göre)
--   hazirlaniyor : hareket yok (stok depoda)
--   yolda        : depo −, yolda +
--   teslim_alindi: depo −, amazon +
--   iptal        : hareket yok
create or replace function public.sync_shipment_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_target text;
begin
  delete from stock_movements where shipment_item_id = p_id;
  select si.item_id, si.qty, s.status, s.ship_date, coalesce(s.received_date, s.ship_date) as recv
    into r
    from shipment_items si
    join shipments s on s.id = si.shipment_id
   where si.id = p_id;
  if not found or r.status in ('hazirlaniyor', 'iptal') then
    return;
  end if;
  v_target := case when r.status = 'yolda' then 'yolda' else 'amazon' end;
  insert into stock_movements (item_id, location_id, qty, kind, shipment_item_id, moved_at, created_by)
  values
    (r.item_id, 'depo', -r.qty, 'transfer', p_id, r.ship_date, auth.uid()),
    (r.item_id, v_target, r.qty, 'transfer', p_id, case when v_target = 'amazon' then r.recv else r.ship_date end, auth.uid());
end
$$;

create or replace function public.shipment_items_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_shipment_item(new.id);
  return null;
end
$$;

create or replace function public.shipments_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'teslim_alindi' and old.status is distinct from 'teslim_alindi' and new.received_date is null then
    new.received_date := current_date;
  end if;
  return new;
end
$$;

create or replace function public.shipments_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if new.status is distinct from old.status
     or new.ship_date is distinct from old.ship_date
     or new.received_date is distinct from old.received_date then
    for v in select id from shipment_items where shipment_id = new.id loop
      perform sync_shipment_item(v);
    end loop;
  end if;
  return null;
end
$$;

drop trigger if exists shipment_items_after on public.shipment_items;
create trigger shipment_items_after after insert or update on public.shipment_items
  for each row execute function public.shipment_items_after();
drop trigger if exists shipments_before_update on public.shipments;
create trigger shipments_before_update before update on public.shipments
  for each row execute function public.shipments_before_update();
drop trigger if exists shipments_after_update on public.shipments;
create trigger shipments_after_update after update on public.shipments
  for each row execute function public.shipments_after_update();

-- İş bitince tamamlanma zamanı
create or replace function public.tasks_before()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'bitti' and (tg_op = 'INSERT' or old.status is distinct from 'bitti') then
    new.completed_at := now();
  elsif new.status <> 'bitti' then
    new.completed_at := null;
  end if;
  return new;
end
$$;
drop trigger if exists tasks_before on public.tasks;
create trigger tasks_before before insert or update on public.tasks
  for each row execute function public.tasks_before();

-- Takipçi ölçümü → hesabın güncel takipçisi
create or replace function public.asset_metrics_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update assets a
     set followers = m.followers
    from (
      select followers from asset_metrics
       where asset_id = coalesce(new.asset_id, old.asset_id)
       order by metric_date desc, created_at desc
       limit 1
    ) m
   where a.id = coalesce(new.asset_id, old.asset_id);
  return null;
end
$$;
drop trigger if exists asset_metrics_after on public.asset_metrics;
create trigger asset_metrics_after after insert or update or delete on public.asset_metrics
  for each row execute function public.asset_metrics_after();

-- updated_at
do $$
declare
  t text;
begin
  foreach t in array array['items', 'sales', 'purchases', 'shipments', 'transactions', 'ad_budgets', 'ad_spend', 'tasks', 'assets'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end
$$;

-- =====================================================================
-- Kaydet fonksiyonları (başlık + satırlar tek işlemde)
-- =====================================================================
create or replace function public.save_sale(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  h sales;
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
  v_default_loc text;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;
  h := jsonb_populate_record(null::sales, p_header);
  v_default_loc := case when h.channel = 'amazon' then 'amazon' else 'depo' end;
  if v_id is null then
    insert into sales (sale_date, channel, order_no, customer, status, commission, shipping_cost, payment_status, due_date, note)
    values (coalesce(h.sale_date, current_date), h.channel, h.order_no, h.customer, coalesce(h.status, 'tamamlandi'),
            coalesce(h.commission, 0), coalesce(h.shipping_cost, 0), coalesce(h.payment_status, 'odendi'), h.due_date, h.note)
    returning id into v_id;
  else
    update sales
       set sale_date = coalesce(h.sale_date, current_date), channel = h.channel, order_no = h.order_no, customer = h.customer,
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
  if v_id is null then
    insert into purchases (purchase_date, supplier, invoice_no, shipping_cost, payment_status, due_date, note)
    values (coalesce(h.purchase_date, current_date), h.supplier, h.invoice_no, coalesce(h.shipping_cost, 0),
            coalesce(h.payment_status, 'odendi'), h.due_date, h.note)
    returning id into v_id;
  else
    update purchases
       set purchase_date = coalesce(h.purchase_date, current_date), supplier = h.supplier, invoice_no = h.invoice_no,
           shipping_cost = coalesce(h.shipping_cost, 0), payment_status = coalesce(h.payment_status, 'odendi'),
           due_date = h.due_date, note = h.note
     where id = v_id;
    delete from purchase_items where purchase_id = v_id;
  end if;
  insert into purchase_items (purchase_id, item_id, qty, unit_cost, location_id)
  select v_id, l.item_id, l.qty, coalesce(l.unit_cost, 0), coalesce(l.location_id, 'depo')
    from jsonb_populate_recordset(null::purchase_items, p_lines) l;
  return v_id;
end
$$;

create or replace function public.save_shipment(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  h shipments;
  v_id uuid := nullif(p_header ->> 'id', '')::uuid;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'En az bir ürün satırı gerekli';
  end if;
  h := jsonb_populate_record(null::shipments, p_header);
  if v_id is null then
    insert into shipments (ship_date, reference, carrier, status, shipping_cost, received_date, note)
    values (coalesce(h.ship_date, current_date), h.reference, h.carrier, coalesce(h.status, 'hazirlaniyor'),
            coalesce(h.shipping_cost, 0), h.received_date, h.note)
    returning id into v_id;
  else
    update shipments
       set ship_date = coalesce(h.ship_date, current_date), reference = h.reference, carrier = h.carrier,
           status = coalesce(h.status, 'hazirlaniyor'), shipping_cost = coalesce(h.shipping_cost, 0),
           received_date = h.received_date, note = h.note
     where id = v_id;
    delete from shipment_items where shipment_id = v_id;
  end if;
  insert into shipment_items (shipment_id, item_id, qty)
  select v_id, l.item_id, l.qty
    from jsonb_populate_recordset(null::shipment_items, p_lines) l;
  return v_id;
end
$$;

-- =====================================================================
-- Düzenleme geçmişi tetikleyicisi
-- =====================================================================
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
  -- Satış/alım/sevkiyattan otomatik doğan hareketler ayrıca loglanmaz; asıl kayıt loglanıyor.
  if tg_table_name = 'stock_movements'
     and (v_row ->> 'sale_item_id' is not null or v_row ->> 'purchase_item_id' is not null or v_row ->> 'shipment_item_id' is not null) then
    return null;
  end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
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

do $$
declare
  t text;
begin
  foreach t in array array[
    'items', 'sales', 'sale_items', 'purchases', 'purchase_items', 'shipments', 'shipment_items',
    'stock_movements', 'transactions', 'ad_budgets', 'ad_spend', 'tasks', 'assets', 'asset_metrics',
    'products', 'settings'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I_audit on public.%I', t, t);
      execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
    end if;
  end loop;
end
$$;

-- =====================================================================
-- Görünümler (RLS'e tabi: security_invoker)
-- =====================================================================
create or replace view public.stock_levels with (security_invoker = true) as
select i.id as item_id, l.id as location_id, coalesce(sum(m.qty), 0)::numeric(12, 2) as qty
  from public.items i
 cross join public.locations l
  left join public.stock_movements m on m.item_id = i.id and m.location_id = l.id
 group by i.id, l.id;

create or replace view public.sale_lines with (security_invoker = true) as
select s.id as sale_id, s.sale_date, s.channel, s.status, s.order_no,
       si.id as sale_item_id, si.item_id, i.brand, i.name, i.variant, i.unit,
       si.qty, si.unit_price, coalesce(si.unit_cost, 0) as unit_cost, si.location_id,
       (si.qty * si.unit_price)::numeric(12, 2) as revenue,
       (si.qty * coalesce(si.unit_cost, 0))::numeric(12, 2) as cogs
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.items i on i.id = si.item_id;

-- Tek defter: satış, alım, sevkiyat kargosu, reklam ve elle girilen kayıtlar
create or replace view public.ledger with (security_invoker = true) as
with sale_brand as (
  select si.sale_id, i.brand, sum(si.qty * si.unit_price) as amount,
         row_number() over (partition by si.sale_id order by sum(si.qty * si.unit_price) desc) as rn
    from public.sale_items si join public.items i on i.id = si.item_id
   group by si.sale_id, i.brand
),
purchase_brand as (
  select pi.purchase_id, i.brand, sum(pi.qty * pi.unit_cost) as amount,
         row_number() over (partition by pi.purchase_id order by sum(pi.qty * pi.unit_cost) desc) as rn
    from public.purchase_items pi join public.items i on i.id = pi.item_id
   group by pi.purchase_id, i.brand
),
shipment_brand as (
  select si.shipment_id, i.brand,
         row_number() over (partition by si.shipment_id order by sum(si.qty) desc) as rn
    from public.shipment_items si join public.items i on i.id = si.item_id
   group by si.shipment_id, i.brand
)
select 'satis'::text as source, s.id as ref_id, s.sale_date as tx_date, 'gelir'::text as direction, 'satis'::text as category,
       sb.amount::numeric(12, 2) as amount, sb.brand, s.channel, coalesce(s.customer, s.order_no) as counterparty,
       s.payment_status, s.due_date, s.note
  from public.sales s join sale_brand sb on sb.sale_id = s.id
 where s.status = 'tamamlandi' and sb.amount > 0
union all
select 'satis', s.id, s.sale_date, 'gider', 'komisyon', s.commission, sb.brand, s.channel, s.order_no, 'odendi', null, null
  from public.sales s join sale_brand sb on sb.sale_id = s.id and sb.rn = 1
 where s.status = 'tamamlandi' and s.commission > 0
union all
select 'satis', s.id, s.sale_date, 'gider', 'kargo', s.shipping_cost, sb.brand, s.channel, s.order_no, 'odendi', null, null
  from public.sales s join sale_brand sb on sb.sale_id = s.id and sb.rn = 1
 where s.status <> 'iptal' and s.shipping_cost > 0
union all
select 'alim', p.id, p.purchase_date, 'gider', 'mal_alimi', pb.amount::numeric(12, 2), pb.brand, null, p.supplier,
       p.payment_status, p.due_date, p.note
  from public.purchases p join purchase_brand pb on pb.purchase_id = p.id
 where pb.amount > 0
union all
select 'alim', p.id, p.purchase_date, 'gider', 'kargo', p.shipping_cost, pb.brand, null, p.supplier, p.payment_status, p.due_date, null
  from public.purchases p join purchase_brand pb on pb.purchase_id = p.id and pb.rn = 1
 where p.shipping_cost > 0
union all
select 'sevkiyat', sh.id, sh.ship_date, 'gider', 'kargo', sh.shipping_cost, sb.brand, 'amazon', sh.carrier, 'odendi', null, sh.reference
  from public.shipments sh join shipment_brand sb on sb.shipment_id = sh.id and sb.rn = 1
 where sh.status <> 'iptal' and sh.shipping_cost > 0
union all
select 'reklam', a.id, a.spend_date, 'gider', 'reklam', a.amount, a.brand, a.platform, a.campaign, 'odendi', null, a.note
  from public.ad_spend a
union all
select 'manuel', t.id, t.tx_date, t.direction, t.category, t.amount, t.brand, t.channel, t.counterparty,
       t.payment_status, t.due_date, t.note
  from public.transactions t;

-- =====================================================================
-- Güvenlik (RLS)
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'items', 'sales', 'sale_items', 'purchases', 'purchase_items', 'shipments', 'shipment_items',
    'stock_movements', 'transactions', 'ad_budgets', 'ad_spend', 'tasks', 'assets', 'asset_metrics'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists panel_all on public.%I', t);
    execute format('create policy panel_all on public.%I for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user())', t);
  end loop;
end
$$;

alter table public.profiles enable row level security;
drop policy if exists panel_read on public.profiles;
create policy panel_read on public.profiles for select to authenticated using (public.is_panel_user());
drop policy if exists own_update on public.profiles;
create policy own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.locations enable row level security;
drop policy if exists panel_read on public.locations;
create policy panel_read on public.locations for select to authenticated using (public.is_panel_user());

alter table public.audit_log enable row level security;
drop policy if exists panel_read on public.audit_log;
create policy panel_read on public.audit_log for select to authenticated using (public.is_panel_user());

-- Vitrin tabloları: herkes okur, yalnızca panel kullanıcıları yazar.
-- (Önceden anon anahtarıyla herkes yazabiliyordu.)
do $$
begin
  if to_regclass('public.products') is not null then
    drop policy if exists "Public insert access" on public.products;
    drop policy if exists "Public update access" on public.products;
    drop policy if exists "Public delete access" on public.products;
    -- Canlı veritabanında elle eklenmiş adlar
    drop policy if exists "public insert products" on public.products;
    drop policy if exists "public update products" on public.products;
    drop policy if exists "public delete products" on public.products;
    drop policy if exists "Enable insert for authenticated users only" on public.products;
    drop policy if exists panel_write on public.products;
    create policy panel_write on public.products for all to authenticated
      using (public.is_panel_user() or auth.jwt() ->> 'email' = 'info@omytic.com')
      with check (public.is_panel_user() or auth.jwt() ->> 'email' = 'info@omytic.com');
  end if;
  if to_regclass('public.settings') is not null then
    drop policy if exists "Public update access" on public.settings;
    drop policy if exists "Public insert access" on public.settings;
    drop policy if exists panel_write on public.settings;
    create policy panel_write on public.settings for all to authenticated
      using (public.is_panel_user() or auth.jwt() ->> 'email' = 'info@omytic.com')
      with check (public.is_panel_user() or auth.jwt() ->> 'email' = 'info@omytic.com');
  end if;
end
$$;

grant execute on function public.save_sale(jsonb, jsonb) to authenticated;
grant execute on function public.save_purchase(jsonb, jsonb) to authenticated;
grant execute on function public.save_shipment(jsonb, jsonb) to authenticated;
grant execute on function public.is_panel_user() to authenticated, anon;

-- =====================================================================
-- Başlangıç verisi: ürün kartları ve dijital varlıklar
-- =====================================================================
insert into public.items (sku, name, brand, variant, unit, price, min_stock)
select 'FS-' || m || '-' || replace(sz, '-', ''), 'FormStep ' || m, 'formstep', sz, 'adet', 200, 5
  from unnest(array['M100', 'M300', 'M900']) as m
 cross join unnest(array['36-37', '37-38', '38-39', '39-40', '40-41', '41-42', '42-43', '43-44', '44-45', '45-48']) as sz
on conflict (sku) do nothing;

insert into public.items (sku, name, brand, variant, unit, price, min_stock) values
  ('SR-18G', 'SERYN Barrier Care Stick', 'seryn', '18 g', 'adet', 499, 20),
  ('SR-10G', 'SERYN Barrier Care Stick', 'seryn', '10 g', 'adet', 399, 20)
on conflict (sku) do nothing;

insert into public.assets (kind, name, url, handle, brand) values
  ('site', 'omytic.com', 'https://omytic.com', null, 'genel'),
  ('site', 'formstep.tr', 'https://formstep.tr', null, 'formstep'),
  ('site', 'seryn.com.tr', 'https://seryn.com.tr', null, 'seryn'),
  ('instagram', 'SERYN Instagram', 'https://instagram.com/seryncare', '@seryncare', 'seryn'),
  ('pazaryeri', 'OMY Amazon mağazası', 'https://www.amazon.com.tr/s?me=A1D8844Z4S0BOA&marketplaceID=A33AVAJ2PDY3EV', null, 'genel'),
  ('pazaryeri', 'OMY Trendyol mağazası', 'https://www.trendyol.com/sr?mid=1288801&os=1', null, 'genel'),
  ('pazaryeri', 'OMY Hepsiburada mağazası', 'https://www.hepsiburada.com/magaza/omy', null, 'genel')
on conflict (url) do nothing;
