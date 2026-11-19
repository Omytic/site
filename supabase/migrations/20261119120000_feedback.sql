-- =====================================================================
-- Müşteri sesi: pazaryeri soruları, satıcı geri bildirimleri, yorumlar tek tabloda
--  source: trendyol_soru | amazon_geribildirim | hepsiburada_soru | manuel
--  kind:   soru | geribildirim | yorum
-- Tekrar çalıştırılabilir.
-- =====================================================================

create table if not exists public.customer_feedback (
  id text primary key,                         -- kaynak:dış_no
  source text not null,
  kind text not null check (kind in ('soru', 'geribildirim', 'yorum')),
  brand text,                                  -- formstep | seryn | kumas | null
  posted_at timestamptz not null,
  product_name text,
  product_url text,
  image_url text,
  customer text,
  rating int check (rating is null or rating between 1 and 5),
  text text not null,
  answer text,
  answered_at timestamptz,
  status text not null default 'bekliyor' check (status in ('bekliyor', 'cevaplandi', 'kapandi')),
  external_status text,
  order_id text,
  sentiment text check (sentiment is null or sentiment in ('olumlu', 'notr', 'olumsuz')),
  draft text,                                  -- yapay zekânın hazırladığı cevap taslağı
  note text,
  handled_by uuid references public.profiles(id) on delete set null,
  raw jsonb,
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.customer_feedback add column if not exists updated_by uuid references public.profiles(id) on delete set null;
create index if not exists customer_feedback_idx on public.customer_feedback (posted_at desc);
create index if not exists customer_feedback_status_idx on public.customer_feedback (status, kind);

do $$
begin
  alter table public.customer_feedback enable row level security;
  drop policy if exists panel_read on public.customer_feedback;
  drop policy if exists panel_update on public.customer_feedback;
  drop policy if exists panel_insert on public.customer_feedback;
  drop policy if exists panel_delete on public.customer_feedback;
  create policy panel_read on public.customer_feedback for select to authenticated using (public.is_panel_user());
  create policy panel_update on public.customer_feedback for update to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
  -- elle eklenen (ör. telefonda gelen şikâyet) kayıtlar
  create policy panel_insert on public.customer_feedback for insert to authenticated with check (public.is_panel_user() and source = 'manuel');
  create policy panel_delete on public.customer_feedback for delete to authenticated using (public.is_panel_user() and source = 'manuel');
  grant select, insert, update, delete on public.customer_feedback to authenticated;
  grant all on public.customer_feedback to service_role;
  if not exists (select 1 from pg_trigger where tgname = 'customer_feedback_touch') then
    create trigger customer_feedback_touch before update on public.customer_feedback for each row execute function public.touch_updated_at();
  end if;
end
$$;
