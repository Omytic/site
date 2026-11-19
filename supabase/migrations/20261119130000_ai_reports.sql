-- =====================================================================
-- Yapay zekâ raporları: içerik fikirleri, ürün sayfası metinleri, haftalık rapor.
-- Uzun süren işler birkaç adımda tamamlanır (messages'ta kaldığı yer saklanır).
-- Tekrar çalıştırılabilir.
-- =====================================================================

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('icerik', 'urun_metni', 'haftalik')),
  brand text,
  subject text,                       -- ör. ürün adı / ASIN
  status text not null default 'calisiyor' check (status in ('calisiyor', 'hazir', 'hata')),
  input jsonb,                        -- isteğin parametreleri
  messages jsonb,                     -- devam etmek için konuşma
  result jsonb,                       -- yapılandırılmış çıktı
  text text,                          -- düz metin çıktı
  sources jsonb,                      -- web kaynakları
  error text,
  steps int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists ai_reports_idx on public.ai_reports (kind, created_at desc);

do $$
begin
  alter table public.ai_reports enable row level security;
  drop policy if exists panel_read on public.ai_reports;
  drop policy if exists panel_delete on public.ai_reports;
  create policy panel_read on public.ai_reports for select to authenticated using (public.is_panel_user());
  create policy panel_delete on public.ai_reports for delete to authenticated using (public.is_panel_user());
  grant select, delete on public.ai_reports to authenticated;
  grant all on public.ai_reports to service_role;
  if not exists (select 1 from pg_trigger where tgname = 'ai_reports_touch') then
    create trigger ai_reports_touch before update on public.ai_reports for each row execute function public.touch_updated_at();
  end if;
end
$$;
