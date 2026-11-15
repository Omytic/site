-- Güvenlik (15 Kasım 2026)
-- 1) İlk girişte herkes kendi şifresini belirler (ortak şifre bir kez kullanılır).
-- 2) Vitrin ürünleri ve site ayarları sadece panel kullanıcılarınca değiştirilebilir (eski info@ istisnası kaldırıldı).

alter table public.profiles add column if not exists must_change_password boolean not null default true;

do $$
begin
  if to_regclass('public.products') is not null then
    drop policy if exists panel_write on public.products;
    create policy panel_write on public.products for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
  end if;
  if to_regclass('public.settings') is not null then
    drop policy if exists panel_write on public.settings;
    create policy panel_write on public.settings for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
  end if;
end
$$;
