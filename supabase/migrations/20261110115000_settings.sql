-- Site ayarları tablosu (vitrin: iletişim, duyuru, SEO). Canlıda yoktu; panel kurulumundan önce çalışır.
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  phone text,
  whatsapp text,
  email text,
  address text,
  instagram text,
  linkedin text,
  announcement_text text,
  announcement_active boolean not null default false,
  site_title text,
  site_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
drop policy if exists "Public read access" on public.settings;
create policy "Public read access" on public.settings for select using (true);
