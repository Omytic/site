-- Fuarlar: takip listesi (TOBB takvimi ve diğer kaynaklar) + katılım durumu
create table if not exists public.fairs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  city text,
  venue text,
  organizer text,
  website text,
  country text not null default 'Türkiye',
  category text not null default 'diger'
    check (category in ('kozmetik', 'saglik', 'spor', 'hac-helal', 'ayakkabi', 'tekstil', 'mobilya', 'otomotiv', 'perakende', 'turizm', 'diger')),
  brands text[] not null default '{}',
  priority text not null default 'orta' check (priority in ('yuksek', 'orta', 'dusuk')),
  status text not null default 'izle'
    check (status in ('izle', 'dusunuyoruz', 'basvurduk', 'stand', 'ziyaret', 'katildik', 'gecildi')),
  why text,
  note text,
  budget numeric(12, 2),
  cost numeric(12, 2),
  contacts int,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (name, start_date),
  check (end_date >= start_date)
);
create index if not exists fairs_start_idx on public.fairs (start_date);

alter table public.fairs enable row level security;
drop policy if exists panel_all on public.fairs;
create policy panel_all on public.fairs for all to authenticated using (public.is_panel_user()) with check (public.is_panel_user());
grant select, insert, update, delete on public.fairs to authenticated, service_role;

drop trigger if exists fairs_touch on public.fairs;
create trigger fairs_touch before update on public.fairs for each row execute function public.touch_updated_at();

-- Başlangıç listesi: 2027 TOBB Ana Fuar Takvimi + 2026'nın kalan fuarları (SERYN, FormStep, kumaş ile ilgili olanlar)
insert into public.fairs (name, start_date, end_date, city, venue, organizer, website, category, brands, priority, why, source) values
  ('Fashionteks Gaziantep Moda ve Tekstil Fuarı', '2026-11-17', '2026-11-20', 'Gaziantep', 'Ortadoğu Fuar Merkezi', null, 'https://fashionteks.com.tr', 'tekstil', array['kumas']::text[], 'dusuk', 'Tekstil üreticileri; kumaş tedariki ve bağlantı için.', 'TOBB Ana Fuar Takvimi'),
  ('Anatex – Anadolu Döşemelik Kumaş, Deri ve Üretim Teknolojileri Fuarı', '2026-11-19', '2026-11-22', 'Kayseri', 'Kayseri OSB Fuar ve Kongre Merkezi', 'Nobel Expo', 'https://nobelanatex.com', 'mobilya', array['kumas']::text[], 'yuksek', 'Doğrudan döşemelik kumaş fuarı; Kayseri mobilya üreticileri ve döşemeciler alıcı.', 'TOBB Ana Fuar Takvimi'),
  ('Uluslararası Helal Expo / Dünya Helal Zirvesi', '2026-11-25', '2026-11-28', 'İstanbul', 'İstanbul Fuar Merkezi', 'Discover Events', 'https://discoverevents.com', 'hac-helal', array['seryn']::text[], 'yuksek', 'Helal kozmetik alıcıları; Körfez ve Orta Doğu distribütörleri geliyor.', 'TOBB Ana Fuar Takvimi'),
  ('Ethexpo Eurasia Turizm ve Sağlık Fuarı', '2026-11-25', '2026-11-28', 'İstanbul', 'İstanbul Fuar Merkezi', 'Asel Expo', 'https://aselexpo.com', 'saglik', array['seryn','formstep']::text[], 'orta', 'Sağlık turizmi ve sağlıklı yaşam ziyaretçisi.', 'TOBB Ana Fuar Takvimi'),
  ('Git Kamp Karavan Outdoor Fuarı', '2026-12-02', '2026-12-06', 'İzmir', 'Fuarizmir', 'Tactfair', 'https://tactfair.com', 'spor', array['formstep','seryn']::text[], 'orta', 'Yürüyüş ve kampçılar: uzun yürüyüşte ayak ağrısı ve sürtünme.', 'TOBB Ana Fuar Takvimi'),
  ('İstanbul Yerel Marketler Buluşması ve Fuarı', '2026-12-09', '2026-12-10', 'İstanbul', 'WOW İstanbul', 'Focus Fuar', 'https://focusfairs.com', 'perakende', array['seryn','formstep']::text[], 'dusuk', 'Yerel market zincirleri satın almacıları; raf girişi için.', 'TOBB Ana Fuar Takvimi'),
  ('Gafshoes 38 – Ayakkabı, Terlik ve Yan Sanayi Fuarı', '2026-12-16', '2026-12-19', 'Gaziantep', 'Ortadoğu Fuar Merkezi', 'Akort', 'https://akort.com', 'ayakkabi', array['formstep']::text[], 'yuksek', 'Ayakkabı üreticileri ve yan sanayi: toptan tabanlık müşterisi.', 'TOBB Ana Fuar Takvimi'),
  ('IIFF – Uluslararası İstanbul Mobilya Fuarı', '2027-01-19', '2027-01-23', 'İstanbul', 'Tüyap + İstanbul Fuar Merkezi', 'Tüyap / MOS', 'https://iiff.com.tr', 'mobilya', array['kumas']::text[], 'yuksek', 'Türkiye''nin en büyük mobilya fuarı; döşemelik kumaş alıcıları burada.', 'TOBB Ana Fuar Takvimi'),
  ('Intermoda Ayakkabı Fuarı', '2027-01-19', '2027-01-22', 'İzmir', 'Fuarizmir', 'Akort', 'https://intermodashoes.com', 'ayakkabi', array['formstep']::text[], 'orta', 'Ayakkabı markaları ve toptancılar.', 'TOBB Ana Fuar Takvimi'),
  ('Modexpo Hazır Giyim ve Tekstil Fuarı', '2027-01-19', '2027-01-22', 'İzmir', 'Fuarizmir', 'Akort', 'https://akort.com', 'tekstil', array['kumas']::text[], 'dusuk', 'Tekstil ve kumaş tedarikçileri.', 'TOBB Ana Fuar Takvimi'),
  ('Organic & Pure Expo', '2027-01-29', '2027-01-31', 'İstanbul', 'Lütfi Kırdar', 'Expotim', 'https://organicandpure.com.tr', 'kozmetik', array['seryn']::text[], 'yuksek', 'Doğal/temiz içerikli kozmetik ziyaretçisi; SERYN''in hikâyesine birebir.', 'TOBB Ana Fuar Takvimi'),
  ('Gaziantep Penye, Tekstil, Hazır Giyim, Kumaş ve Yan Sanayileri Fuarı', '2027-02-02', '2027-02-05', 'Gaziantep', 'Ortadoğu Fuar Merkezi', 'GSOMEM', 'https://gsomem.com.tr', 'tekstil', array['kumas']::text[], 'orta', 'Kumaş alım-satımı; Gaziantep tekstil üreticileri.', 'TOBB Ana Fuar Takvimi'),
  ('Karavanist İstanbul – Karavan, Outdoor ve Kamp Fuarı', '2027-02-03', '2027-02-07', 'İstanbul', 'Tüyap', 'Tüyap', 'https://tuyap.com.tr', 'spor', array['formstep','seryn']::text[], 'orta', 'Outdoor ve kamp ziyaretçisi; perakende satış ve outdoor mağazaları.', 'TOBB Ana Fuar Takvimi'),
  ('EMITT – Doğu Akdeniz Uluslararası Turizm ve Seyahat Fuarı', '2027-02-04', '2027-02-06', 'İstanbul', 'İstanbul Fuar Merkezi', 'ICA', 'https://emittistanbul.com', 'turizm', array['seryn','formstep']::text[], 'orta', 'Hac/umre acenteleri katılıyor: hacı setine SERYN + FormStep girmek için B2B görüşme.', 'TOBB Ana Fuar Takvimi'),
  ('Texhibition İstanbul – Kumaş, Denim, Tekstil Aksesuarları ve İplik', '2027-03-03', '2027-03-05', 'İstanbul', 'İstanbul Fuar Merkezi', 'İTKİB', 'https://texhibitionist.com', 'tekstil', array['kumas']::text[], 'yuksek', 'Türkiye''nin ana kumaş fuarı; tedarikçi ve alıcı bulmak için.', 'TOBB Ana Fuar Takvimi'),
  ('AYMOD – Uluslararası Ayakkabı Moda Fuarı', '2027-03-17', '2027-03-20', 'İstanbul', 'İstanbul Fuar Merkezi', 'TASD', 'https://aymod.com', 'ayakkabi', array['formstep']::text[], 'yuksek', 'Ayakkabı markaları ve alıcılar; özel etiket tabanlık için en doğru yer.', 'TOBB Ana Fuar Takvimi'),
  ('İzfurnex İzmir Mobilya Fuarı', '2027-03-17', '2027-03-21', 'İzmir', 'Fuarizmir', 'EFR', 'https://izfurnex.com', 'mobilya', array['kumas']::text[], 'orta', 'Ege mobilya üreticileri; döşemelik kumaş.', 'TOBB Ana Fuar Takvimi'),
  ('Güzellik & Bakım – Profesyonel Kozmetik, Spa & Wellness Fuarı', '2027-03-18', '2027-03-21', 'İstanbul', 'Lütfi Kırdar', 'TG Ekspo', 'https://guzellikvebakim.com', 'kozmetik', array['seryn']::text[], 'yuksek', 'Kozmetik perakende, eczane ve spa alıcıları.', 'TOBB Ana Fuar Takvimi'),
  ('Automechanika İstanbul', '2027-03-24', '2027-03-27', 'İstanbul', 'Tüyap', 'Messe Frankfurt', 'https://automechanika.com.tr', 'otomotiv', array['kumas']::text[], 'yuksek', 'Oto koltuk döşemecileri ve iç döşeme üreticileri: Alcantara/kadife alıcısı.', 'TOBB Ana Fuar Takvimi'),
  ('Ankara Kamp Karavan ve Doğa Sporları Fuarı', '2027-03-24', '2027-03-28', 'Ankara', 'Altınpark', 'Zümrüt Fuarcılık', 'https://zumrutfuarcilik.com.tr', 'spor', array['formstep','seryn']::text[], 'dusuk', 'Doğa sporu ve yürüyüş ziyaretçisi.', 'TOBB Ana Fuar Takvimi'),
  ('Modef – Uluslararası Mobilya ve Dekorasyon Fuarı (İnegöl)', '2027-04-06', '2027-04-10', 'Bursa', 'İnegöl Fuar Alanı', 'Modef', 'https://modef.com.tr', 'mobilya', array['kumas']::text[], 'yuksek', 'İnegöl mobilya üreticileri; döşemelik kumaşın en büyük alıcı kitlesi.', 'TOBB Ana Fuar Takvimi'),
  ('Expomed Eurasia – Tıbbi Ürünler ve Rehabilitasyon Fuarı', '2027-04-15', '2027-04-18', 'İstanbul', 'Tüyap', 'Reed Tüyap', 'https://expomedistanbul.com', 'saglik', array['formstep','seryn']::text[], 'yuksek', 'Ortopedi ve medikal bayileri: tabanlık için ortopedi mağazaları, eczane distribütörleri.', 'TOBB Ana Fuar Takvimi'),
  ('Eurobike İstanbul', '2027-04-21', '2027-04-24', 'İstanbul', 'İstanbul Fuar Merkezi', 'Messe Frankfurt', 'https://messefrankfurt.com.tr', 'spor', array['seryn','formstep']::text[], 'orta', 'Bisikletçilerde sürtünme yarası en yaygın şikâyet; bisiklet mağazaları.', 'TOBB Ana Fuar Takvimi'),
  ('Naturfest – Kamp, Karavan, Offroad ve Doğa Sporları Fuarı', '2027-04-29', '2027-05-02', 'İstanbul', 'Yenikapı Gösteri ve Sanat Merkezi', 'Prizma', 'https://naturfest.net', 'spor', array['formstep','seryn']::text[], 'dusuk', 'Son tüketiciye doğrudan satış.', 'TOBB Ana Fuar Takvimi'),
  ('Camp & Nature – Kamp, Avcılık, Doğa ve Su Sporları Fuarı', '2027-05-06', '2027-05-09', 'Antalya', 'Cam Piramit', 'Geoexpo', 'https://geoexpo.tr', 'spor', array['formstep','seryn']::text[], 'dusuk', 'Doğa sporu ziyaretçisi.', 'TOBB Ana Fuar Takvimi'),
  ('Worldef E-Ticaret Hizmetleri Fuarı', '2027-05-12', '2027-05-14', 'İstanbul', 'Yenikapı Gösteri ve Sanat Merkezi', 'Worldef', 'https://worldef.net', 'perakende', array['seryn','formstep','kumas']::text[], 'orta', 'Pazaryeri, kargo, reklam ajansları; e-ticareti büyütmek için.', 'TOBB Ana Fuar Takvimi'),
  ('Hometex – Uluslararası Ev Tekstili Fuarı', '2027-05-25', '2027-05-29', 'İstanbul', 'İstanbul Fuar Merkezi', 'KFA', 'https://hometex.com.tr', 'tekstil', array['kumas']::text[], 'yuksek', 'Ev tekstili ve döşemelik kumaş; yabancı alıcı yoğun.', 'TOBB Ana Fuar Takvimi'),
  ('İstanbul Av Silah ve Doğa Sporları Fuarı (ProHunt)', '2027-06-02', '2027-06-05', 'İstanbul', 'İstanbul Fuar Merkezi', 'Efem', 'https://istanbulprohunt.com', 'spor', array['formstep']::text[], 'dusuk', 'Avcılar ve doğa yürüyüşçüleri uzun süre ayakta.', 'TOBB Ana Fuar Takvimi'),
  ('Uluslararası İstanbul Perakende Fuarı', '2027-06-02', '2027-06-03', 'İstanbul', 'Haliç Kongre Merkezi', 'Soysal', 'https://perakendegunleri.com', 'perakende', array['seryn','formstep']::text[], 'orta', 'Zincir mağaza satın almacıları.', 'TOBB Ana Fuar Takvimi'),
  ('Beauty İstanbul – Kozmetik, Güzellik, Private Label ve Ambalaj', '2027-06-03', '2027-06-05', 'İstanbul', 'Tüyap', 'İpekyolu Fuarcılık', 'https://beauty-istanbul.com', 'kozmetik', array['seryn']::text[], 'yuksek', 'Kozmetik distribütörleri ve yurt dışı alıcıları.', 'TOBB Ana Fuar Takvimi'),
  ('CHC Cosmetics & Home Care Ingredients', '2027-06-09', '2027-06-11', 'İstanbul', 'İstanbul Fuar Merkezi', 'Artkim', 'https://chcistanbul.com', 'kozmetik', array['seryn']::text[], 'dusuk', 'Hammadde ve ambalaj tedarikçileri: maliyeti düşürmek için.', 'TOBB Ana Fuar Takvimi'),
  ('Umre ve Turizm Profesyonelleri Fuarı', '2027-06-19', '2027-06-20', 'İstanbul', 'Lütfi Kırdar', 'HUITM', 'https://huitm.org', 'hac-helal', array['seryn','formstep']::text[], 'yuksek', 'Doğrudan hac/umre acenteleri: hacı setine tabanlık + sürtünme balmı.', 'TOBB Ana Fuar Takvimi'),
  ('Texhibition İstanbul (Eylül)', '2027-09-01', '2027-09-03', 'İstanbul', 'İstanbul Fuar Merkezi', 'İTKİB', 'https://texhibitionist.com', 'tekstil', array['kumas']::text[], 'yuksek', 'Kumaş fuarının sonbahar dönemi.', 'TOBB Ana Fuar Takvimi'),
  ('Longevity ve Sağlıklı Yaşam Fuarı', '2027-09-02', '2027-09-04', 'İstanbul', 'Yenikapı Gösteri ve Sanat Merkezi', 'Asel Expo', 'https://aselexpo.com', 'saglik', array['seryn','formstep']::text[], 'dusuk', 'Sağlıklı yaşam ziyaretçisi.', 'TOBB Ana Fuar Takvimi'),
  ('World Sports İstanbul – Fitness ve Spor Teknolojileri', '2027-09-09', '2027-09-12', 'İstanbul', 'Yenikapı Gösteri ve Sanat Merkezi', 'Tam Fuarcılık', 'https://worldsportsistanbul.com', 'spor', array['seryn','formstep']::text[], 'yuksek', 'Spor salonları, koşucular ve spor mağazaları: iki ürün için de hedef kitle.', 'TOBB Ana Fuar Takvimi'),
  ('FDI – Furnishings and Design İstanbul', '2027-09-23', '2027-09-25', 'İstanbul', 'İstanbul Fuar Merkezi', 'MOS', 'https://fdistanbul.com', 'mobilya', array['kumas']::text[], 'orta', 'Mobilya tasarım ve döşeme.', 'TOBB Ana Fuar Takvimi'),
  ('AYMOD – Uluslararası Ayakkabı Moda Fuarı (Eylül)', '2027-09-29', '2027-10-02', 'İstanbul', 'İstanbul Fuar Merkezi', 'TASD', 'https://aymod.com', 'ayakkabi', array['formstep']::text[], 'yuksek', 'Ayakkabı fuarının sonbahar dönemi.', 'TOBB Ana Fuar Takvimi'),
  ('Uluslararası Helal Expo / Dünya Helal Zirvesi', '2027-09-29', '2027-10-02', 'İstanbul', 'İstanbul Fuar Merkezi', 'Discover Events', 'https://discoverevents.com', 'hac-helal', array['seryn']::text[], 'yuksek', 'Helal kozmetik; Körfez alıcıları.', 'TOBB Ana Fuar Takvimi'),
  ('Nobel Master Shoes – Ayakkabı ve Çanta Moda Fuarı', '2027-10-06', '2027-10-09', 'Konya', 'KTO-Tüyap Konya', 'Nobel Expo', 'https://nobelexpo.com', 'ayakkabi', array['formstep']::text[], 'orta', 'Konya ayakkabı üreticileri.', 'TOBB Ana Fuar Takvimi'),
  ('Modef Expo – Mobilya ve Dekorasyon Fuarı (İnegöl, Ekim)', '2027-10-12', '2027-10-16', 'Bursa', 'İnegöl Fuar Alanı', 'Modef', 'https://modef.com.tr', 'mobilya', array['kumas']::text[], 'yuksek', 'İnegöl mobilya fuarının sonbahar dönemi.', 'TOBB Ana Fuar Takvimi'),
  ('NOV Naturel Organik Vegan Fuarı + Private Label Expo', '2027-10-27', '2027-10-30', 'İstanbul', null, 'Asel Expo', 'https://aselexpo.com', 'kozmetik', array['seryn']::text[], 'orta', 'Doğal kozmetik ve fason üretim bağlantıları.', 'TOBB Ana Fuar Takvimi'),
  ('İstanbul Maraton ve Spor Fuarı', '2027-11-04', '2027-11-06', 'İstanbul', 'Yenikapı Gösteri ve Sanat Merkezi', 'Thor Expo', 'https://thorajans.com', 'spor', array['seryn','formstep']::text[], 'yuksek', 'Maratoncular: sürtünme ve ayak ağrısı en büyük derdi; yarış kiti alanında satış.', 'TOBB Ana Fuar Takvimi'),
  ('AYSAF – Uluslararası Ayakkabı Yan Sanayi Fuarı', '2027-11-10', '2027-11-12', 'İstanbul', null, 'AYSAF', 'https://aysafexpo.com', 'ayakkabi', array['formstep']::text[], 'yuksek', 'Tabanlık doğrudan ayakkabı yan sanayi: üretici ve alıcılar burada.', 'TOBB Ana Fuar Takvimi'),
  ('Gaziantep Penye, Tekstil, Hazır Giyim, Kumaş Fuarı (Kış)', '2027-11-30', '2027-12-03', 'Gaziantep', 'Ortadoğu Fuar Merkezi', 'GSOMEM', 'https://gsomem.com.tr', 'tekstil', array['kumas']::text[], 'orta', 'Kumaş alım-satımı.', 'TOBB Ana Fuar Takvimi'),
  ('Beauty Eurasia – Kozmetik, Güzellik, Ambalaj, Hammadde ve Private Label', '2027-12-15', '2027-12-17', 'İstanbul', 'İstanbul Fuar Merkezi', 'ICA', 'https://icaevents.com.tr', 'kozmetik', array['seryn']::text[], 'yuksek', 'Türkiye''nin büyük kozmetik B2B fuarlarından.', 'TOBB Ana Fuar Takvimi'),
  ('Gafshoes 39 – Ayakkabı, Terlik ve Yan Sanayi Fuarı', '2027-12-15', '2027-12-18', 'Gaziantep', 'Ortadoğu Fuar Merkezi', 'Akort', 'https://akort.com', 'ayakkabi', array['formstep']::text[], 'yuksek', 'Ayakkabı yan sanayi; toptan tabanlık.', 'TOBB Ana Fuar Takvimi')
on conflict (name, start_date) do nothing;

-- Düzenleme geçmişi: başlangıç listesi geçmişe yazılmasın diye tetikleyici en sonda
drop trigger if exists fairs_audit on public.fairs;
create trigger fairs_audit after insert or update or delete on public.fairs for each row execute function public.audit_trigger();
