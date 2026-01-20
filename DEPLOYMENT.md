# 🚀 Deployment Rehberi

## Vercel Deployment Adımları

### 1. GitHub Repository Oluşturma

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/omytic.git
git push -u origin main
```

### 2. Vercel Projesi Oluşturma

1. [Vercel Dashboard](https://vercel.com/dashboard) > "Add New" > "Project"
2. GitHub repository'nizi seçin
3. **Project Settings:**
   - Framework Preset: Next.js (otomatik)
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `.next`

### 3. Environment Variables Ekleme

Vercel Dashboard > Project > Settings > Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key (opsiyonel)
NEXT_PUBLIC_ADMIN_PASSWORD=your_secure_password
```

**Önemli:** Tüm environment variables'ı hem Production, hem Preview, hem Development için ekleyin.

### 4. Deploy

"Deploy" butonuna tıklayın. İlk deploy 2-3 dakika sürebilir.

## Supabase Kurulumu

### 1. Database Setup

1. [Supabase Dashboard](https://app.supabase.com) > SQL Editor
2. `supabase/schema.sql` dosyasındaki tüm SQL kodunu kopyalayıp çalıştırın
3. Tablo ve policy'ler oluşturulacak

### 2. Storage Setup

1. Supabase Dashboard > Storage > "New bucket"
2. **Bucket name:** `products`
3. **Public bucket:** ✅ (işaretleyin)
4. "Create bucket" butonuna tıklayın

### 3. Storage Policies

1. Storage > `products` bucket > Policies
2. `supabase/policies.sql` dosyasındaki policy'leri ekleyin:

**Policy 1: Public Read**
```sql
CREATE POLICY "Public can view products"
ON storage.objects FOR SELECT
USING (bucket_id = 'products');
```

**Policy 2: Public Upload** (Admin panel için)
```sql
CREATE POLICY "Public can upload products"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'products');
```

**Policy 3: Public Update**
```sql
CREATE POLICY "Public can update products"
ON storage.objects FOR UPDATE
USING (bucket_id = 'products');
```

**Policy 4: Public Delete**
```sql
CREATE POLICY "Public can delete products"
ON storage.objects FOR DELETE
USING (bucket_id = 'products');
```

### 4. Supabase URL ve Keys

1. Supabase Dashboard > Settings > API
2. **Project URL:** `NEXT_PUBLIC_SUPABASE_URL`
3. **anon public key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **service_role key:** `SUPABASE_SERVICE_ROLE_KEY` (gizli tutun!)

## Post-Deployment Kontrol Listesi

- [ ] Vercel deployment başarılı
- [ ] Environment variables eklendi
- [ ] Supabase database tablosu oluşturuldu
- [ ] Supabase storage bucket oluşturuldu
- [ ] Storage policies eklendi
- [ ] Site açılıyor
- [ ] Admin paneli çalışıyor (`/admin`)
- [ ] Ürün ekleme/düzenleme/silme çalışıyor
- [ ] Görsel yükleme çalışıyor

## Sorun Giderme

### Görseller yüklenmiyor
- Storage bucket'ın public olduğundan emin olun
- Storage policies'in doğru eklendiğini kontrol edin

### Admin paneli çalışmıyor
- `NEXT_PUBLIC_ADMIN_PASSWORD` environment variable'ının eklendiğini kontrol edin
- Tarayıcı console'da hata var mı kontrol edin

### Ürünler görünmüyor
- Supabase database'de `products` tablosunun oluşturulduğunu kontrol edin
- RLS policy'lerin doğru olduğunu kontrol edin

## Güvenlik Notları

⚠️ **Önemli:**
- `SUPABASE_SERVICE_ROLE_KEY` asla client-side'da kullanmayın
- Admin şifresini güçlü tutun
- Production'da Supabase Auth kullanmayı düşünün (daha güvenli)
