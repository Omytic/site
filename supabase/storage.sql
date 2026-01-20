-- Storage bucket oluştur (Supabase Dashboard'dan veya SQL Editor'dan çalıştırın)
-- Storage > Create bucket > bucket name: 'products'

-- Veya SQL ile oluşturmak için (Supabase Dashboard > SQL Editor):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true);

-- Storage policy'leri (herkesin okuyabildiği, sadece authenticated kullanıcıların yazabildiği)
-- Bu policy'leri Supabase Dashboard > Storage > products bucket > Policies'den oluşturabilirsiniz

-- Public read policy:
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'products');

-- Authenticated users can upload:
-- CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');

-- Authenticated users can update their own files:
-- CREATE POLICY "Authenticated users can update" ON storage.objects FOR UPDATE USING (bucket_id = 'products' AND auth.role() = 'authenticated');

-- Authenticated users can delete their own files:
-- CREATE POLICY "Authenticated users can delete" ON storage.objects FOR DELETE USING (bucket_id = 'products' AND auth.role() = 'authenticated');
