-- Ürün kartında KDV oranı (15 Kasım 2026). Birim maliyet KDV hariç tutulur; KDV dahil tutar panelde hesaplanır.
alter table public.items add column if not exists vat_rate numeric(5, 2) not null default 20 check (vat_rate >= 0 and vat_rate <= 100);
