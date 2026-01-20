-- Gerçek ürün verilerini ekle
-- Bu SQL'i Supabase SQL Editor'da çalıştırabilirsiniz veya admin panelinden ekleyebilirsiniz

-- ÖNEMLİ: Önce mevcut verileri temizlemek için (opsiyonel):
-- DELETE FROM products;

-- Kumaşlar Bölümü
INSERT INTO products (name, description, image_url, category, amazon_link, features) VALUES
(
  'Airfile Kumaş',
  'Hava geçirgenliği yüksek, teknik dokuma',
  '/images/airfile.jpg',
  'kumaş',
  NULL,
  ARRAY['Hava geçirgenliği yüksek', 'Teknik dokuma', 'Nefes alabilir yapı', 'Dayanıklı']
),
(
  'Alcantara Kumaş',
  'Yumuşak dokulu, lüks ve dayanıklı döşemelik',
  '/images/alcantara.jpg',
  'kumaş',
  NULL,
  ARRAY['Yumuşak dokulu', 'Lüks görünüm', 'Dayanıklı', 'Döşemelik için ideal']
),
(
  'Welsoft Kumaş',
  'Sıcak tutan, yumuşak ve anti-bakteriyel doku',
  '/images/welsoft.png',
  'kumaş',
  NULL,
  ARRAY['Sıcak tutan', 'Yumuşak doku', 'Anti-bakteriyel', 'Rahat kullanım']
);

-- Diğer Ürünler Bölümü
INSERT INTO products (name, description, image_url, category, amazon_link, features) VALUES
(
  'FormStep M900 Memory Foam İç Ayakkabı Tabanlık',
  'Ortopedik, topuk dikeni için rahat, koşu ve konfor için darbe emici memory foam tabanlık. Ayak sağlığınız için ideal çözüm.',
  '/images/tabanlik.jpeg',
  'diğer',
  'https://amzn.eu/d/6zPNjFa',
  ARRAY['Memory Foam teknolojisi', 'Ortopedik destek', 'Topuk dikeni için ideal', 'Darbe emici yapı', 'Rahat ve konforlu', 'Koşu ve günlük kullanım için uygun']
),
(
  'Banyo Paspası',
  'Kaliteli banyo paspası - detaylar admin panelinden düzenlenebilir',
  '/images/paspas.jpeg',
  'diğer',
  NULL,
  ARRAY['Su emici özellik', 'Kaymaz taban', 'Kolay temizlik', 'Dayanıklı yapı']
);
