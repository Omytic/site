-- =====================================================================
-- "Sor" kutusu: yapay zekânın panel verisini okuyabilmesi için salt-okur sorgu.
--  - Çağıran kullanıcının yetkisiyle çalışır (security invoker): panel kullanıcısının
--    zaten görebildiğinden fazlasını göremez.
--  - Yalnızca tek bir SELECT / WITH sorgusu; değiştiren komutlar reddedilir.
--  - En fazla 500 satır, 8 saniye.
-- Tekrar çalıştırılabilir.
-- =====================================================================

create or replace function public.panel_query(q text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  s text := btrim(coalesce(q, ''));
  res jsonb;
begin
  if not public.is_panel_user() then
    raise exception 'Yetki yok';
  end if;
  s := regexp_replace(s, ';\s*$', '');
  if s !~* '^\s*(select|with)\s' then
    raise exception 'Sadece SELECT sorgusu çalıştırılabilir';
  end if;
  if position(';' in s) > 0 then
    raise exception 'Tek sorgu gönderin';
  end if;
  if s ~* '\m(insert|update|delete|merge|alter|drop|create|grant|revoke|truncate|copy|call|do|execute|reset|lock|vacuum|analyze|refresh|comment|listen|notify|prepare|deallocate|discard|security|set_config|pg_sleep|pg_read|pg_ls|lo_import|lo_export|dblink)\M'
     or s ~* '\m(auth|storage|vault|pgsodium|supabase_functions|extensions|net|cron)\s*\.'
     or s ~* '\mset\s+(local\s+|session\s+)?[a-z_]+\s*(=|to)\M' then
    raise exception 'Bu sorgu izin verilmeyen bir ifade içeriyor';
  end if;
  perform set_config('statement_timeout', '8000', true);
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) x limit 500) t', s) into res;
  return res;
end
$$;

revoke all on function public.panel_query(text) from public, anon;
grant execute on function public.panel_query(text) to authenticated;
