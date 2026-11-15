-- İki adımlı doğrulama zorunlu (15 Kasım 2026)
-- Panel verilerine sadece şifre + doğrulama kodu ile girmiş (aal2) oturumlar erişebilir.
-- Yeni giriş ekranı yayına çıktıktan SONRA uygulanmalı; yoksa eski ekranla girenler veri göremez.
create or replace function public.is_panel_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;
