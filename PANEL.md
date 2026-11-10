# OMY Panel (/admin)

Stok, satış, alım, Amazon sevkiyatı, finans, reklam, işler, dijital varlıklar ve düzenleme geçmişi.
Yunus, Yusuf ve Ömer kullanıcı adıyla girer (`/login`). Arka planda `<kullanıcı>@omytic.com` e-postası kullanılır.

## Kurulum (bir kez)

1. Supabase → SQL Editor'da `supabase/migrations/20261110120000_omy_panel.sql` dosyasını çalıştırın
   (ya da terminalde `supabase db push`). Dosya tekrar çalıştırılabilir; mevcut veriyi silmez.
2. `supabase/panel-users.sql` içindeki `:SIFRE` yerine başlangıç şifresini yazıp SQL Editor'da çalıştırın.
   Şifreyi bu dosyaya yazıp GitHub'a göndermeyin. Herkes panelde **Hesabım**'dan kendi şifresini değiştirebilir.

## Stok nasıl hesaplanıyor?

Stok elle tutulmaz; `stock_movements` tablosundaki hareketlerin toplamıdır (`stock_levels` görünümü).

| İşlem | Stok etkisi |
|---|---|
| Satış (Amazon kanalı) | Amazon FBA − |
| Satış (diğer kanallar) | Depo − |
| Satış iade | Satış ve iade hareketi birlikte, net 0 |
| Satış iptal / silme | Hareket silinir, stok geri gelir |
| Alım | Depo + (ürünün maliyeti son alış fiyatıyla güncellenir) |
| Sevkiyat "Yolda" | Depo −, Yolda + |
| Sevkiyat "Teslim alındı" | Depo −, Amazon FBA + |
| Sayım / fire / numune | Stok sayfasından elle |

Bir kayıt düzenlenince ya da silinince ilgili hareketler veritabanı tetikleyicileriyle otomatik yenilenir.

## Finans

`ledger` görünümü satış, komisyon, kargo, alım, sevkiyat kargosu, reklam ve elle girilen gelir/giderleri tek defterde toplar.
Kâr hesabı satılan malın satış anındaki maliyetini (`sale_items.unit_cost`) kullanır.

## Güvenlik

Tüm panel tabloları RLS ile korunur; yalnızca `profiles` tablosunda kaydı olan hesaplar okuyup yazabilir.
Vitrin tabloları (`products`, `settings`) herkese açık okunur, yalnızca panel kullanıcıları yazar.
Her ekleme/düzenleme/silme `audit_log` tablosuna kimin yaptığıyla birlikte yazılır.
