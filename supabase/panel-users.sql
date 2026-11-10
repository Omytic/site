-- Panel kullanıcılarını oluşturur (Supabase SQL Editor'da bir kez çalıştırın).
-- Kullanıcı adıyla giriş yapılır; arka planda <kullanıcı>@omytic.com e-postası kullanılır.
-- :SIFRE yerine başlangıç şifresini yazın. Şifreyi bu dosyaya yazıp GitHub'a göndermeyin;
-- herkes panelde "Hesabım" bölümünden kendi şifresini değiştirebilir.

do $$
declare
  u record;
  uid uuid;
  v_password text := ':SIFRE';
begin
  if v_password = ':SIFRE' or length(v_password) < 6 then
    raise exception 'Önce :SIFRE yerine şifreyi yazın';
  end if;
  for u in
    select * from (values ('yunus', 'Yunus', '#E3AB3B'), ('yusuf', 'Yusuf', '#4EA1E1'), ('omer', 'Ömer', '#B85C4E')) as v(username, full_name, color)
  loop
    select id into uid from auth.users where email = u.username || '@omytic.com';
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.username || '@omytic.com', extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u.full_name), now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.username || '@omytic.com', 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
    insert into public.profiles (id, username, full_name, color)
    values (uid, u.username, u.full_name, u.color)
    on conflict (id) do update set username = excluded.username, full_name = excluded.full_name;
  end loop;
end
$$;
