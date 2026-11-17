-- =====================================================================
-- Reklam ve sosyal medya: Meta (Facebook/Instagram), Google Ads, Amazon Ads.
--  - ad_insights: kampanya × gün performansı (harcama, gösterim, tıklama, dönüşüm)
--  - social_accounts / social_daily / social_posts: takipçi ve gönderi etkileşimleri
-- Reklam harcaması ayrıca ad_spend'e yazılır (Reklam sayfası ve kâr hesapları için).
-- Tekrar çalıştırılabilir.
-- =====================================================================

create table if not exists public.ad_insights (
  platform text not null,                 -- meta | google | amazon_ads
  day date not null,
  campaign_id text not null,
  campaign_name text,
  account_id text,
  brand text not null default 'genel',
  currency text not null default 'TRY',
  fx_rate numeric(14, 4),                 -- TL'ye çevirmede kullanılan kur (TL ise boş)
  spend numeric(14, 2) not null default 0,         -- TL
  spend_fx numeric(14, 2),                          -- hesabın kendi para biriminde
  impressions bigint not null default 0,
  reach bigint,
  clicks bigint not null default 0,
  link_clicks bigint,
  conversions numeric(14, 2) not null default 0,  -- satın alma / sipariş
  conv_value numeric(14, 2) not null default 0,   -- TL
  extra jsonb,
  synced_at timestamptz not null default now(),
  primary key (platform, day, campaign_id)
);
create index if not exists ad_insights_day_idx on public.ad_insights (day desc);

create table if not exists public.social_accounts (
  id text primary key,                    -- platformdaki hesap numarası
  platform text not null,                 -- instagram | facebook
  username text,
  name text,
  picture text,
  brand text not null default 'genel',
  followers int,
  following int,
  posts int,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_daily (
  account_id text not null references public.social_accounts(id) on delete cascade,
  day date not null,
  followers int,
  following int,
  posts int,
  reach int,
  views int,
  interactions int,
  accounts_engaged int,
  profile_taps int,
  follows int,
  unfollows int,
  primary key (account_id, day)
);

create table if not exists public.social_posts (
  id text primary key,
  account_id text not null references public.social_accounts(id) on delete cascade,
  posted_at timestamptz not null,
  kind text,                              -- IMAGE | VIDEO | CAROUSEL_ALBUM | REELS | STORY
  caption text,
  permalink text,
  thumb text,
  likes int not null default 0,
  comments int not null default 0,
  saves int,
  shares int,
  reach int,
  views int,
  interactions int,
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_account_idx on public.social_posts (account_id, posted_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['ad_insights', 'social_accounts', 'social_daily', 'social_posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists panel_read on public.%I', t);
    execute format('create policy panel_read on public.%I for select to authenticated using (public.is_panel_user())', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

-- Hesabın hangi markaya ait olduğu panelden değiştirilebilir
drop policy if exists panel_update on public.social_accounts;
create policy panel_update on public.social_accounts for update to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
grant update (brand) on public.social_accounts to authenticated;
