-- =====================================================================
-- Cariler: müşteri ve tedarikçi kartları
--  - parties: firma bilgileri (iletişim, vergi, vade, indirim, markalar)
--  - party_contacts: firmadaki kişiler
--  - party_notes: görüşme / arama / ziyaret notları (zaman çizelgesi)
--  - party_agreements: anlaşmalar (dosyası "invoices" deposunda, anlasmalar/ klasöründe)
-- Satış, alım, fatura, gelir/gider ve talepler party_id ile bağlanır.
-- Elle yazılan firma adı bir cari kartının adıyla aynıysa bağlantı kendiliğinden kurulur.
-- Tekrar çalıştırılabilir.
-- =====================================================================

-- Türkçe karakterden ve büyük/küçük harften bağımsız ad karşılaştırması
create or replace function public.norm_name(t text)
returns text
language sql
immutable
as $$
  -- "Gezer Ayakkabı San. ve Tic. Ltd. Şti." = "gezer ayakkabi"
  select nullif(regexp_replace(
           regexp_replace(
             regexp_replace(lower(translate(coalesce(t, ''), 'ıİşŞğĞüÜöÖçÇâÂîÎ', 'iissgguuoocciaaii')), '[^a-z0-9]+', ' ', 'g'),
             '\m(ltd|sti|as|a s|tic|san|ve|limited|sirketi|anonim|ticaret|sanayi)\M', ' ', 'g'),
           '[^a-z0-9]+', '', 'g'), '')
$$;

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'musteri' check (kind in ('musteri', 'tedarikci', 'ikisi')),
  segment text check (segment is null or segment in ('toptan', 'magaza', 'bayi', 'kurumsal', 'bireysel', 'diger')),
  brands text[] not null default '{}',
  status text not null default 'aktif' check (status in ('aktif', 'pasif')),
  contact_name text,
  phone text,
  email text,
  website text,
  instagram text,
  city text,
  district text,
  address text,
  tax_office text,
  tax_no text,
  iban text,
  payment_days int,                 -- vade (gün)
  discount_pct numeric(5, 2),       -- anlaşmalı indirim
  price_note text,                  -- özel fiyat / koşul notu
  tags text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists parties_norm_name_uq on public.parties (public.norm_name(name));

create table if not exists public.party_contacts (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.party_notes (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  kind text not null default 'not' check (kind in ('not', 'gorusme', 'arama', 'ziyaret', 'eposta', 'teklif')),
  body text not null,
  next_date date,                   -- tekrar ne zaman aranacak
  done boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);
create index if not exists party_notes_idx on public.party_notes (party_id, created_at desc);

create table if not exists public.party_agreements (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  title text not null,
  brand text check (brand is null or brand in ('formstep', 'seryn', 'kumas', 'diger', 'genel')),
  start_date date,
  end_date date,
  terms text,
  status text not null default 'aktif' check (status in ('taslak', 'aktif', 'bitti')),
  file_path text,
  file_name text,
  file_size int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

-- Bağlantı sütunları
alter table public.sales add column if not exists party_id uuid references public.parties(id) on delete set null;
alter table public.purchases add column if not exists party_id uuid references public.parties(id) on delete set null;
alter table public.transactions add column if not exists party_id uuid references public.parties(id) on delete set null;
alter table public.invoices add column if not exists party_id uuid references public.parties(id) on delete set null;
alter table public.leads add column if not exists party_id uuid references public.parties(id) on delete set null;
create index if not exists sales_party_idx on public.sales (party_id);
create index if not exists purchases_party_idx on public.purchases (party_id);
create index if not exists transactions_party_idx on public.transactions (party_id);
create index if not exists invoices_party_idx on public.invoices (party_id);
create index if not exists leads_party_idx on public.leads (party_id);

-- Yazılan firma adından cari bulma (satış: customer, alım: supplier, fatura/gelir-gider: counterparty, talep: company ya da name)
create or replace function public.set_party_from_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n jsonb := to_jsonb(new);
  o jsonb;
  v_name text;
  v_old text;
begin
  v_name := case tg_table_name
    when 'sales' then n ->> 'customer'
    when 'purchases' then n ->> 'supplier'
    when 'leads' then coalesce(nullif(n ->> 'company', ''), n ->> 'name')
    else n ->> 'counterparty'
  end;
  -- Ad değiştiyse eski bağlantı bırakılır, yeni ada göre tekrar aranır
  if tg_op = 'UPDATE' and new.party_id is not distinct from old.party_id then
    o := to_jsonb(old);
    v_old := case tg_table_name
      when 'sales' then o ->> 'customer'
      when 'purchases' then o ->> 'supplier'
      when 'leads' then coalesce(nullif(o ->> 'company', ''), o ->> 'name')
      else o ->> 'counterparty'
    end;
    if public.norm_name(v_old) is distinct from public.norm_name(v_name) then
      new.party_id := null;
    end if;
  end if;
  if new.party_id is null and public.norm_name(v_name) is not null then
    select id into new.party_id from parties where public.norm_name(name) = public.norm_name(v_name) limit 1;
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['sales', 'purchases', 'transactions', 'invoices', 'leads'] loop
    execute format('drop trigger if exists set_party on public.%I', t);
    execute format('create trigger set_party before insert or update on public.%I for each row execute function public.set_party_from_name()', t);
  end loop;
end
$$;

-- Yeni cari açılınca ya da adı değişince eski kayıtlar da bağlanır
create or replace function public.link_party_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := public.norm_name(new.name);
begin
  if k is null then
    return null;
  end if;
  update sales set party_id = new.id where party_id is null and public.norm_name(customer) = k;
  update purchases set party_id = new.id where party_id is null and public.norm_name(supplier) = k;
  update transactions set party_id = new.id where party_id is null and public.norm_name(counterparty) = k;
  update invoices set party_id = new.id where party_id is null and public.norm_name(counterparty) = k;
  update leads set party_id = new.id where party_id is null and public.norm_name(coalesce(nullif(company, ''), name)) = k;
  return null;
end
$$;
drop trigger if exists link_records on public.parties;
create trigger link_records after insert or update of name on public.parties for each row execute function public.link_party_records();

-- Cari özeti: ciro, son satış, açık alacak/borç (liste ve kart için)
create or replace view public.party_summary with (security_invoker = true) as
select
  p.id as party_id,
  coalesce(s.sale_count, 0) as sale_count,
  coalesce(s.revenue, 0)::numeric(14, 2) as revenue,
  s.last_sale,
  coalesce(s.receivable, 0)::numeric(14, 2) + coalesce(t.receivable, 0)::numeric(14, 2) as receivable,
  coalesce(s.overdue, 0)::numeric(14, 2) + coalesce(t.overdue_in, 0)::numeric(14, 2) as overdue,
  coalesce(pu.purchase_count, 0) as purchase_count,
  coalesce(pu.spent, 0)::numeric(14, 2) as spent,
  pu.last_purchase,
  coalesce(pu.payable, 0)::numeric(14, 2) + coalesce(t.payable, 0)::numeric(14, 2) as payable,
  greatest(s.last_sale, pu.last_purchase, n.last_note::date) as last_activity,
  n.next_date
from public.parties p
left join lateral (
  select count(*) filter (where x.status = 'tamamlandi') as sale_count,
         sum(x.total) filter (where x.status = 'tamamlandi') as revenue,
         max(x.sale_date) filter (where x.status <> 'iptal') as last_sale,
         sum(x.total) filter (where x.status = 'tamamlandi' and x.payment_status = 'bekliyor') as receivable,
         sum(x.total) filter (where x.status = 'tamamlandi' and x.payment_status = 'bekliyor' and x.due_date < current_date) as overdue
    from (select s.*, (select coalesce(sum(si.qty * si.unit_price), 0) from public.sale_items si where si.sale_id = s.id) as total
            from public.sales s where s.party_id = p.id) x
) s on true
left join lateral (
  select count(*) as purchase_count,
         sum(y.total) as spent,
         max(y.purchase_date) as last_purchase,
         sum(y.total) filter (where y.payment_status = 'bekliyor') as payable
    from (select pu.*, pu.shipping_cost + (select coalesce(sum(pi.qty * pi.unit_cost), 0) from public.purchase_items pi where pi.purchase_id = pu.id) as total
            from public.purchases pu where pu.party_id = p.id) y
) pu on true
left join lateral (
  select sum(amount) filter (where direction = 'gelir' and payment_status = 'bekliyor') as receivable,
         sum(amount) filter (where direction = 'gelir' and payment_status = 'bekliyor' and due_date < current_date) as overdue_in,
         sum(amount) filter (where direction = 'gider' and payment_status = 'bekliyor') as payable
    from public.transactions where party_id = p.id
) t on true
left join lateral (
  select max(created_at) as last_note, min(next_date) filter (where not done and next_date is not null) as next_date
    from public.party_notes where party_id = p.id
) n on true;

-- Yetkiler, denetim ve güncelleme zamanı
do $$
declare
  t text;
begin
  foreach t in array array['parties', 'party_contacts', 'party_notes', 'party_agreements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists panel_all on public.%I', t);
    execute format('create policy panel_all on public.%I for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    if not exists (select 1 from pg_trigger where tgname = t || '_audit') then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t || '_audit', t);
    end if;
  end loop;
  foreach t in array array['parties', 'party_agreements'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_touch') then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    end if;
  end loop;
end
$$;
grant select on public.party_summary to authenticated;
