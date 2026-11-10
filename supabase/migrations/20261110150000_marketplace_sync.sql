-- =====================================================================
-- Pazaryeri senkronu (Trendyol; ileride Hepsiburada ve Amazon)
-- Siparişler sunucuda (Vercel) çekilir, satış olarak yazılır, stok
-- mevcut tetikleyicilerle otomatik düşer. Aynı sipariş iki kez yazılmaz.
-- =====================================================================

-- Pazaryerindeki paket/sipariş kimliği: tekrar yazmayı engeller
alter table public.sales add column if not exists external_ref text;
create unique index if not exists sales_channel_external_ref_idx
  on public.sales (channel, external_ref) where external_ref is not null;

-- Pazaryeri ürün kodu (barkod / stok kodu / ASIN) → panel ürünü
create table if not exists public.channel_listings (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('amazon', 'trendyol', 'hepsiburada')),
  external_code text not null,
  item_id uuid not null references public.items(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  unique (channel, external_code)
);

-- Eşleşmeyen ürün kodları (panelde eşleştirilmeyi bekler)
create table if not exists public.sync_unmatched (
  channel text not null,
  external_code text not null,
  title text,
  sample_order text,
  seen_count int not null default 1,
  last_seen timestamptz not null default now(),
  primary key (channel, external_code)
);

-- Senkron çalışmalarının kaydı
create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  channel text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'calisiyor' check (status in ('calisiyor', 'tamam', 'hata')),
  range_from timestamptz,
  range_to timestamptz,
  fetched int not null default 0,
  imported int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  message text,
  triggered_by uuid references public.profiles(id) on delete set null
);
create index if not exists sync_runs_channel_idx on public.sync_runs (channel, started_at desc);

alter table public.channel_listings enable row level security;
drop policy if exists panel_all on public.channel_listings;
create policy panel_all on public.channel_listings for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());

alter table public.sync_unmatched enable row level security;
drop policy if exists panel_all on public.sync_unmatched;
create policy panel_all on public.sync_unmatched for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());

alter table public.sync_runs enable row level security;
drop policy if exists panel_read on public.sync_runs;
create policy panel_read on public.sync_runs for select to authenticated using (public.is_panel_user());

drop trigger if exists channel_listings_audit on public.channel_listings;
create trigger channel_listings_audit after insert or update or delete on public.channel_listings
  for each row execute function public.audit_trigger();
