# OMY Ticaret - Kurumsal Vitrin Sitesi

Modern ve şık bir kurumsal vitrin sitesi. Next.js, Tailwind CSS ve Supabase kullanılarak geliştirilmiştir.

## 🚀 Hızlı Başlangıç

### Yerel Geliştirme

1. **Bağımlılıkları yükleyin:**
```bash
npm install
```

2. **Environment variables ayarlayın:**
```bash
cp .env.example .env.local
```

3. **`.env.local` dosyasını düzenleyin:**
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_ADMIN_PASSWORD=your_admin_password_here
```

4. **Supabase kurulumu:**
   - [Supabase](https://supabase.com) hesabı oluşturun
   - Yeni proje oluşturun
   - SQL Editor'da `supabase/schema.sql` dosyasındaki SQL kodunu çalıştırın
   - Storage > Create bucket > bucket name: `products` > Public: ✅
   - Storage > Policies > `supabase/policies.sql` dosyasındaki policy'leri ekleyin

5. **Geliştirme sunucusunu başlatın:**
```bash
npm run dev
```

Site `http://localhost:3003` adresinde çalışacak.

## 📦 Vercel Deployment

### 1. GitHub'a Push Edin
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-github-repo-url
git push -u origin main
```

### 2. Vercel'e Deploy Edin

1. [Vercel](https://vercel.com) hesabınıza giriş yapın
2. "New Project" butonuna tıklayın
3. GitHub repository'nizi seçin
4. **Environment Variables** ekleyin:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (opsiyonel, admin işlemleri için)
   - `NEXT_PUBLIC_ADMIN_PASSWORD`
5. "Deploy" butonuna tıklayın

### 3. Vercel Ayarları

- **Framework Preset:** Next.js (otomatik algılanır)
- **Build Command:** `npm run build` (varsayılan)
- **Output Directory:** `.next` (varsayılan)
- **Install Command:** `npm install` (varsayılan)

## 🗄️ Supabase Kurulumu

### Database Setup

1. Supabase Dashboard > SQL Editor
2. `supabase/schema.sql` dosyasındaki tüm SQL kodunu çalıştırın
3. Tablo ve policy'ler oluşturulacak

### Storage Setup

1. Supabase Dashboard > Storage > Create bucket
2. **Bucket name:** `products`
3. **Public bucket:** ✅ (işaretleyin)
4. Storage > Policies > `supabase/policies.sql` dosyasındaki policy'leri ekleyin

### Güvenlik Notları

- Admin panel client-side şifre kontrolü yapıyor
- Production'da daha güvenli bir yöntem (Supabase Auth) kullanılabilir
- `SUPABASE_SERVICE_ROLE_KEY` sadece server-side kullanılmalı (şu an kullanılmıyor)

## Admin Paneli

Admin paneline `/admin` adresinden erişebilirsiniz. Şifre `.env.local` dosyasındaki `NEXT_PUBLIC_ADMIN_PASSWORD` değişkeninden alınır.

## Ürün Verilerini Ekleme

### Yöntem 1: SQL ile (Hızlı - Önerilen)
1. Supabase Dashboard > SQL Editor
2. `supabase/seed-data.sql` dosyasındaki SQL kodunu kopyalayın
3. SQL Editor'da çalıştırın
4. Tüm ürünler otomatik eklenecek

### Yöntem 2: Admin Panel ile
1. `/admin` adresine gidin
2. Şifrenizi girin
3. "Yeni Ürün" butonuna tıklayın
4. Ürün bilgilerini doldurun:
   - **Kumaşlar için:** 
     - Airfile: `/images/airfile.jpg`
     - Alcantara: `/images/alcantara.jpg`
     - Welsoft: `/images/welsoft.png`
   - **Diğer ürünler için:** 
     - Tabanlık: `/images/tabanlik.jpeg` (Amazon linki: `https://amzn.eu/d/6zPNjFa`)
     - Paspas: `/images/paspas.jpeg` (admin panelden düzenlenebilir)
5. Amazon linki varsa ekleyin
6. Özellikleri her satıra bir özellik olacak şekilde ekleyin

### Hazır Ürün Verileri

**Kumaşlar:**
- Airfile Kumaş - Hava geçirgenliği yüksek, teknik dokuma
- Alcantara Kumaş - Yumuşak dokulu, lüks ve dayanıklı döşemelik
- Welsoft Kumaş - Sıcak tutan, yumuşak ve anti-bakteriyel doku

**Diğer Ürünler:**
- FormStep M900 Memory Foam Tabanlık - Amazon linki ile
- Banyo Paspası - Admin panelden düzenlenebilir

## Özellikler

- ✅ Modern ve şık tasarım (Clean Luxury teması)
- ✅ Responsive tasarım
- ✅ Ürün yönetimi (Supabase)
- ✅ Admin paneli (Ekleme/Düzenleme/Silme)
- ✅ Görsel yükleme (Supabase Storage)
- ✅ Başarı/Hata mesajları
- ✅ Modal ile ürün detayları
- ✅ Amazon entegrasyonu
- ✅ Framer Motion animasyonları
