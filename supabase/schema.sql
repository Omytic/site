-- Products tablosunu oluştur
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT NOT NULL CHECK (category IN ('kumaş', 'diğer')),
  amazon_link TEXT,
  features TEXT[], -- Array olarak özellikler
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Updated_at için trigger oluştur
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- RLS (Row Level Security) - Public read, authenticated write
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Herkesin okuyabildiği policy (public read)
CREATE POLICY "Public read access" ON products
    FOR SELECT USING (true);

-- Insert policy (herkes ekleyebilir - admin panel şifre kontrolü yapıyor)
CREATE POLICY "Public insert access" ON products
    FOR INSERT WITH CHECK (true);

-- Update policy (herkes güncelleyebilir - admin panel şifre kontrolü yapıyor)
CREATE POLICY "Public update access" ON products
    FOR UPDATE USING (true);

-- Delete policy (herkes silebilir - admin panel şifre kontrolü yapıyor)
CREATE POLICY "Public delete access" ON products
    FOR DELETE USING (true);

-- Not: Admin panel client-side şifre kontrolü yapıyor.
-- Production'da daha güvenli bir yöntem (Supabase Auth veya API route) kullanılabilir.
