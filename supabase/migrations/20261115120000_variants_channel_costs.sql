-- Model / varyant ve kanal maliyetleri (15 Kasım 2026)
-- 1) Ürünlere renk varyantı. Model = aynı marka + aynı ürün adı; varyant = numara (+ renk).
-- 2) Kanal maliyetleri: kanal (ve isteğe bağlı model) başına komisyon % ve adet başı kargo / FBA ücreti.
--    Satış girerken ve pazaryeri senkronunda komisyon ile kargo bundan otomatik hesaplanır.

alter table public.items add column if not exists color text;

create table if not exists public.channel_costs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('amazon', 'trendyol', 'hepsiburada', 'seryn_site', 'toptan', 'diger')),
  -- items.name ile aynı (ör. 'FormStep M100'); boş = bu kanaldaki bütün ürünler
  model text,
  commission_pct numeric(6, 2) not null default 0 check (commission_pct >= 0 and commission_pct < 100),
  fee_per_unit numeric(12, 2) not null default 0 check (fee_per_unit >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists channel_costs_channel_model_idx on public.channel_costs (channel, coalesce(model, ''));

alter table public.channel_costs enable row level security;
drop policy if exists panel_all on public.channel_costs;
create policy panel_all on public.channel_costs for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());

drop trigger if exists channel_costs_touch on public.channel_costs;
create trigger channel_costs_touch before update on public.channel_costs
  for each row execute function public.touch_updated_at();
drop trigger if exists channel_costs_audit on public.channel_costs;
create trigger channel_costs_audit after insert or update or delete on public.channel_costs
  for each row execute function public.audit_trigger();
