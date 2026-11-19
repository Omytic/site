-- =====================================================================
-- Sabah özeti ve bildirimler
--  - notify_recipients: özeti kim, hangi kanaldan alacak (WhatsApp / e-posta)
--  - notify_log: gönderim kayıtları (başarılı / hatalı)
-- Tekrar çalıştırılabilir.
-- =====================================================================

create table if not exists public.notify_recipients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,                       -- WhatsApp için, 05xx ya da +90…
  email text,
  channels text[] not null default '{whatsapp}',
  topics text[] not null default '{ozet}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.notify_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  topic text not null default 'ozet',
  channel text not null,            -- whatsapp | email
  recipient text not null,
  ok boolean not null,
  error text,
  ref text                          -- WhatsApp mesaj no / e-posta no
);
create index if not exists notify_log_idx on public.notify_log (sent_at desc);

do $$
begin
  alter table public.notify_recipients enable row level security;
  drop policy if exists panel_all on public.notify_recipients;
  create policy panel_all on public.notify_recipients for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
  grant select, insert, update, delete on public.notify_recipients to authenticated, service_role;
  if not exists (select 1 from pg_trigger where tgname = 'notify_recipients_audit') then
    create trigger notify_recipients_audit after insert or update or delete on public.notify_recipients for each row execute function public.audit_trigger();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'notify_recipients_touch') then
    create trigger notify_recipients_touch before update on public.notify_recipients for each row execute function public.touch_updated_at();
  end if;

  alter table public.notify_log enable row level security;
  drop policy if exists panel_read on public.notify_log;
  create policy panel_read on public.notify_log for select to authenticated using (public.is_panel_user());
  grant select on public.notify_log to authenticated;
  grant select, insert on public.notify_log to service_role;
end
$$;
