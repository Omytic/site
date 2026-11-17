-- =====================================================================
-- Banka hareketleri (Ziraat Katılım ve diğerleri)
--  - Banka API'si (bankanın verdiği bilgilerle) ya da internet şubesinden kopyalanan ekstre ile gelir
--  - Aynı hareket iki kez yazılmaz (hash)
--  - Her hareket Finans'taki bir gelir/gidere bağlanabilir ya da oradan yeni kayıt açılır
-- Tekrar çalıştırılabilir.
-- =====================================================================

create table if not exists public.bank_accounts (
  id text primary key,                         -- ör. ziraat-katilim-tl
  bank text not null,
  name text not null,
  iban text,
  currency text not null default 'TRY',
  balance numeric(14, 2),
  balance_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references public.bank_accounts(id) on delete cascade,
  tx_at timestamptz not null,
  amount numeric(14, 2) not null,              -- giren +, çıkan −
  balance numeric(14, 2),
  description text,
  channel text,
  code text,
  hash text not null,
  source text not null default 'ekstre',       -- api | ekstre
  transaction_id uuid references public.transactions(id) on delete set null,
  ignored boolean not null default false,      -- kendi hesaplar arası virman vb.
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  unique (account_id, hash)
);
create index if not exists bank_transactions_at_idx on public.bank_transactions (account_id, tx_at desc);

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
drop policy if exists panel_all on public.bank_accounts;
create policy panel_all on public.bank_accounts for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
drop policy if exists panel_all on public.bank_transactions;
create policy panel_all on public.bank_transactions for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
grant select, insert, update, delete on public.bank_accounts, public.bank_transactions to authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'audit_bank_transactions') then
    create trigger audit_bank_transactions after insert or update or delete on public.bank_transactions
      for each row execute function public.audit_trigger();
  end if;
end
$$;

insert into public.bank_accounts (id, bank, name, currency) values ('ziraat-katilim-tl', 'Ziraat Katılım', 'Ziraat Katılım · TL', 'TRY')
on conflict (id) do nothing;
