-- Settings tablosunu oluştur (tek satırlık)
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- İletişim Bilgileri
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  
  -- Sosyal Medya
  instagram TEXT,
  linkedin TEXT,
  
  -- Duyuru Yönetimi
  announcement_text TEXT,
  announcement_visible BOOLEAN DEFAULT false,
  
  -- SEO
  site_title TEXT,
  site_description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Updated_at için trigger
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_settings_updated_at();

-- RLS (Row Level Security)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access" ON settings
    FOR SELECT USING (true);

-- Public update access (admin panel şifre kontrolü yapıyor)
CREATE POLICY "Public update access" ON settings
    FOR UPDATE USING (true);

-- İlk ayarları ekle (eğer yoksa)
INSERT INTO settings (
  phone, whatsapp, email, address,
  instagram, linkedin,
  announcement_text, announcement_visible,
  site_title, site_description
) VALUES (
  '+90 553 588 69 36',
  '+90 553 588 69 36',
  'info@omytic.com',
  '',
  '',
  '',
  '',
  false,
  'OMY Ticaret - Kaliteli Toptan Ticaret',
  'OMY Ticaret; kaliteli ürün yelpazesi ve hızlı tedarik zinciriyle, müşterilerinin ihtiyaçlarına özel çözümler sunan güvenilir bir iş ortağıdır.'
) ON CONFLICT DO NOTHING;
