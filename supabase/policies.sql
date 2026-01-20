-- Storage bucket oluşturma (Supabase Dashboard'dan yapılmalı)
-- Storage > Create bucket > bucket name: 'products' > Public: true

-- Storage Policies (Supabase Dashboard > Storage > products > Policies)

-- 1. Public Read Policy
CREATE POLICY "Public can view products"
ON storage.objects FOR SELECT
USING (bucket_id = 'products');

-- 2. Authenticated users can upload (Admin panel için)
-- Not: Bu policy'yi sadece authenticated kullanıcılar için aktif edin
-- veya service_role key kullanarak bypass edin
CREATE POLICY "Authenticated users can upload products"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'products'
  AND (storage.foldername(name))[1] = 'products'
);

-- 3. Authenticated users can update
CREATE POLICY "Authenticated users can update products"
ON storage.objects FOR UPDATE
USING (bucket_id = 'products');

-- 4. Authenticated users can delete
CREATE POLICY "Authenticated users can delete products"
ON storage.objects FOR DELETE
USING (bucket_id = 'products');

-- Alternatif: Eğer RLS kullanmak istemiyorsanız, bucket'ı public yapın
-- ve sadece service_role key ile yazma işlemlerini yapın
