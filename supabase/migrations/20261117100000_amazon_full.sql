-- =====================================================================
-- Amazon tam bağlantı: FBA stoğu, gerçek komisyon/ücretler (Finances API),
-- trafik ve dönüşüm (Sales & Traffic raporu).
-- Ayrıca bütün otomatik kaynaklar için ortak "dış kayıt" işaretleri:
-- aynı Amazon ücreti / reklam harcaması iki kez yazılmaz.
-- Tekrar çalıştırılabilir.
-- =====================================================================

-- 1) Otomatik gelen gider ve reklam satırları: kaynağı ve kaynaktaki numarası
alter table public.transactions add column if not exists external_source text;
alter table public.transactions add column if not exists external_ref text;
-- Elle girilen satırlarda ikisi de boş kalır (boşlar birbirine çakışmaz)
create unique index if not exists transactions_external_uq on public.transactions (external_source, external_ref);

alter table public.ad_spend add column if not exists external_source text;
alter table public.ad_spend add column if not exists external_ref text;
create unique index if not exists ad_spend_external_uq on public.ad_spend (external_source, external_ref);

-- Satışın komisyon/kargo tutarı nereden: tahmin (kanal maliyeti) mi, pazaryerinin gerçek kesintisi mi
alter table public.sales add column if not exists fees_source text not null default 'tahmin';
alter table public.sales drop constraint if exists sales_fees_source_check;
alter table public.sales add constraint sales_fees_source_check check (fees_source in ('tahmin', 'gercek'));

-- 2) Amazon FBA stoğu (Amazon'un söylediği; panel stoğuyla karşılaştırmak için)
create table if not exists public.amazon_inventory (
  marketplace_id text not null default 'A33AVAJ2PDY3EV',
  sku text not null,
  asin text,
  fnsku text,
  name text,
  item_id uuid references public.items(id) on delete set null,
  -- Paket ilanlarda (ör. 2'li SERYN) bir Amazon ürünü birden çok panel ürününe açılır: [{item_id, qty}]
  parts jsonb,
  fulfillable int not null default 0,
  reserved_customer int not null default 0,
  reserved_other int not null default 0,
  inbound_working int not null default 0,
  inbound_shipped int not null default 0,
  inbound_receiving int not null default 0,
  unfulfillable int not null default 0,
  researching int not null default 0,
  total int not null default 0,
  amazon_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (marketplace_id, sku)
);

-- 3) Amazon finans hareketleri (sipariş ödemesi, iade, depolama ücreti, abonelik…)
create table if not exists public.amazon_transactions (
  id text primary key,
  posted_at timestamptz not null,
  type text,
  status text,
  description text,
  order_id text,
  marketplace_id text,
  currency text,
  total numeric(14, 2) not null default 0,
  product_charges numeric(14, 2) not null default 0,
  commission numeric(14, 2) not null default 0,
  fba_fees numeric(14, 2) not null default 0,
  other_fees numeric(14, 2) not null default 0,
  refund numeric(14, 2) not null default 0,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists amazon_transactions_order_idx on public.amazon_transactions (order_id);
create index if not exists amazon_transactions_posted_idx on public.amazon_transactions (posted_at desc);

-- 4) Trafik ve dönüşüm: günlük toplam ve ürün (ASIN) bazında
create table if not exists public.amazon_traffic_daily (
  day date not null,
  marketplace_id text not null default 'A33AVAJ2PDY3EV',
  sessions int not null default 0,
  page_views int not null default 0,
  units int not null default 0,
  order_items int not null default 0,
  sales numeric(14, 2) not null default 0,
  units_refunded int not null default 0,
  buy_box_pct numeric(6, 2),
  conversion_pct numeric(6, 2),
  primary key (day, marketplace_id)
);
create table if not exists public.amazon_traffic_asin (
  day date not null,
  marketplace_id text not null default 'A33AVAJ2PDY3EV',
  asin text not null,
  parent_asin text,
  sku text,
  sessions int not null default 0,
  page_views int not null default 0,
  units int not null default 0,
  sales numeric(14, 2) not null default 0,
  buy_box_pct numeric(6, 2),
  conversion_pct numeric(6, 2),
  primary key (day, marketplace_id, asin)
);

-- 5) Amazon raporları sırayla hazırlanır: istenir, sonraki çalıştırmada indirilir
create table if not exists public.amazon_reports (
  report_id text primary key,
  report_type text not null,
  data_start date not null,
  data_end date not null,
  status text not null default 'IN_QUEUE',
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  error text
);

-- Okuma izni panel kullanıcılarına; yazma yalnızca senkron (service_role)
do $$
declare
  t text;
begin
  foreach t in array array['amazon_inventory', 'amazon_transactions', 'amazon_traffic_daily', 'amazon_traffic_asin', 'amazon_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists panel_read on public.%I', t);
    execute format('create policy panel_read on public.%I for select to authenticated using (public.is_panel_user())', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

-- 6) Panel stoğunu Amazon FBA'daki gerçek sayıya eşitle (sayım düzeltmesi olarak; kim yaptığı geçmişte görünür)
create or replace function public.align_amazon_stock(p_item_ids uuid[] default null)
returns int
language plpgsql
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if not is_panel_user() then
    raise exception 'Bu işlem için yetkiniz yok';
  end if;
  for r in
    with az as (
      -- Satılabilir + Amazon'un iç işlemi (müşteri siparişi için ayrılanlar panelde zaten satıştan düşmüş)
      select (p ->> 'item_id')::uuid as item_id, sum((a.fulfillable + a.reserved_other) * (p ->> 'qty')::numeric) as qty
        from amazon_inventory a
       cross join lateral jsonb_array_elements(coalesce(a.parts, '[]'::jsonb)) p
       group by 1
    ),
    panel as (
      select item_id, coalesce(sum(qty), 0) as qty from stock_levels where location_id = 'amazon' group by item_id
    )
    select az.item_id, az.qty - coalesce(panel.qty, 0) as diff
      from az left join panel on panel.item_id = az.item_id
     where (p_item_ids is null or az.item_id = any (p_item_ids))
       and az.qty - coalesce(panel.qty, 0) <> 0
  loop
    insert into stock_movements (item_id, location_id, qty, kind, note)
    values (r.item_id, 'amazon', r.diff, 'sayim', 'Amazon FBA stoğuna eşitlendi');
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function public.align_amazon_stock(uuid[]) from public, anon;
grant execute on function public.align_amazon_stock(uuid[]) to authenticated;
