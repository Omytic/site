-- Basit Storage Policies (Development için)
-- Bu SQL'i Supabase Dashboard > Storage > products > Policies bölümünde çalıştırın

-- 1. Herkesin okuyabildiği policy (Public Read)
CREATE POLICY "Public can view products"
ON storage.objects FOR SELECT
USING (bucket_id = 'products');

-- 2. Herkesin yazabildiği policy (Development için - Production'da değiştirin!)
CREATE POLICY "Public can upload products"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'products');

-- 3. Herkesin güncelleyebildiği policy
CREATE POLICY "Public can update products"
ON storage.objects FOR UPDATE
USING (bucket_id = 'products');

-- 4. Herkesin silebildiği policy
CREATE POLICY "Public can delete products"
ON storage.objects FOR DELETE
USING (bucket_id = 'products');
