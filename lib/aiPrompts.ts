import type { SupabaseClient } from '@supabase/supabase-js'
import { BRAND_FACTS } from './ai'
import { buildDigest, ist } from './digest'
import type { JobSpec } from './aiJobs'

const DAY = 86_400_000
const BRAND_NAME: Record<string, string> = { seryn: 'SERYN', formstep: 'FormStep', kumas: 'OMY Kumaş' }

/* ------------------------------------------------------------------ */
/* İçerik fikirleri                                                    */
/* ------------------------------------------------------------------ */

const GLOBAL_REFS: Record<string, string> = {
  seryn: 'Body Glide, Megababe (Thigh Rescue), Squirrel\'s Nut Butter, Chamois Butt\'r, Gold Bond Friction Defense, Monistat Chafing Relief, Bodyglide For Her, Lanacane; koşu/bisiklet/triatlon toplulukları; hac-umre hazırlık içerikleri',
  formstep: 'Superfeet, Dr. Scholl\'s, Currex, Tread Labs, Powerstep, Spenco, Vionic, Kane/OOFOS gibi konfor markaları; podiatrist (ayak sağlığı uzmanı) içerik üreticileri; topuk dikeni/plantar fasiit, düztabanlık, uzun süre ayakta çalışanlar',
  kumas: 'döşemelik kumaş markaları ve iç mimarlık/mobilya içerik üreticileri (Kvadrat, Designers Guild, Alcantara, Crypton), mobilya ustaları ve döşemeciler',
}

export async function contentJob(db: SupabaseClient, brand: string): Promise<JobSpec> {
  const since = new Date(Date.now() - 120 * DAY).toISOString()
  const [{ data: accounts }, { data: posts }] = await Promise.all([
    db.from('social_accounts').select('id,platform,username,brand,followers,posts'),
    db.from('social_posts').select('account_id,posted_at,kind,caption,likes,comments,saves,shares,reach,views,interactions').gte('posted_at', since).order('posted_at', { ascending: false }).limit(300),
  ])
  const acc = (accounts ?? []).filter((a) => !a.brand || a.brand === brand || brand === 'genel')
  const ids = new Set(acc.map((a) => a.id))
  const mine = (posts ?? []).filter((p) => ids.has(p.account_id))
  const score = (p: any) => Number(p.interactions ?? 0) + Number(p.saves ?? 0) * 2 + Number(p.shares ?? 0) * 3
  const ranked = [...mine].sort((a, b) => score(b) - score(a))
  const fmt = (p: any) => `- ${String(p.posted_at).slice(0, 10)} · ${p.kind ?? 'gönderi'} · erişim ${p.reach ?? '?'} · izlenme ${p.views ?? '?'} · beğeni ${p.likes ?? 0} · yorum ${p.comments ?? 0} · kayıt ${p.saves ?? 0} · paylaşım ${p.shares ?? 0} · "${String(p.caption ?? '').replace(/\s+/g, ' ').slice(0, 160)}"`

  const own = mine.length
    ? `Hesaplar: ${acc.map((a) => `@${a.username} (${a.platform}, ${a.followers ?? '?'} takipçi)`).join(', ')}
Son 4 ayda ${mine.length} gönderi.
En iyi giden gönderiler:
${ranked.slice(0, 8).map(fmt).join('\n')}
En zayıf gidenler:
${ranked.slice(-5).map(fmt).join('\n')}`
    : 'Bu marka için panelde henüz sosyal medya verisi yok (Instagram bağlantısı olmayabilir). Kendi içerik analizini atla, sadece global örneklerden öneri yap.'

  return {
    web: 6,
    maxTokens: 7000,
    system: `Sen OMY Ticaret'in sosyal medya stratejistisin. Türkiye'de rakibi neredeyse olmayan ürünler için global örneklerden ve markanın kendi verisinden içerik fikri çıkarıyorsun.

${BRAND_FACTS}

Kurallar:
- Web aramasıyla global benzer markaların ve içerik üreticilerinin son dönemde iyi performans gösteren içerik tarzlarını araştır (Instagram/TikTok/YouTube Shorts formatları, kampanyalar, kullanıcı içeriği örnekleri). Instagram'a doğrudan erişemezsin; haber, blog, marka siteleri, pazarlama vaka analizleri gibi kaynakları kullan.
- Uydurma istatistik ya da sahte kaynak verme. Bir trendi bir kaynağa dayandırıyorsan kaynak adresini ver.
- Fikirler Türkiye'ye uyarlanmış, küçük bir ekibin telefonla çekebileceği, ekranda Türkçe yazı eklenebilecek türden olsun. Yapay zekâ ile insan yüzü üretmeye dayanan fikir verme.
- Tıbbi iddia ya da tedavi vaadi içeren metin yazma.
- Cevabın SONUNDA tek bir \`\`\`json bloğu ver. Şema:
{
  "ozet": "3-4 cümlelik özet",
  "kendi_icerik": { "iyi_gidenler": "neden iyi gitti, 2-3 cümle", "zayif_gidenler": "2-3 cümle", "oneriler": ["kısa madde", ...] },
  "trendler": [ { "baslik": "...", "aciklama": "2 cümle", "ornek": "hangi marka/hesap", "kaynak": "https://..." } ],
  "fikirler": [ { "baslik": "...", "format": "reels|carousel|story|post", "kanca": "ilk 2 saniyedeki cümle/görüntü", "akis": ["sahne 1", "sahne 2", "..."], "aciklama_metni": "Instagram açıklaması, emoji ölçülü, 2-4 hashtag", "neden": "neden işe yarar", "zorluk": "kolay|orta|zor" } ]
}
trendler 4-6 adet, fikirler 10 adet olsun. JSON dışındaki metin kısa olsun.`,
    prompt: `Marka: ${BRAND_NAME[brand] ?? brand}
Bugün: ${ist(Date.now())}
Global referans alanı: ${GLOBAL_REFS[brand] ?? 'benzer global markalar'}

KENDİ İÇERİĞİMİZ
${own}

Global örnekleri araştır, kendi verimizle birleştir ve önümüzdeki 2-3 hafta için içerik planı öner.`,
  }
}

/* ------------------------------------------------------------------ */
/* Ürün sayfası metinleri                                              */
/* ------------------------------------------------------------------ */

export async function listingJob(db: SupabaseClient, o: { brand: string; model: string; marketplaces: string[]; current?: string; notes?: string }): Promise<JobSpec> {
  const since = ist(Date.now() - 60 * DAY)
  const [{ data: items }, { data: listings }] = await Promise.all([
    db.from('items').select('id,sku,name,variant,color,price,unit').eq('brand', o.brand).ilike('name', `%${o.model}%`),
    db.from('channel_listings').select('channel,external_code,item_id'),
  ])
  const itemIds = new Set((items ?? []).map((i) => i.id))
  const codes = (listings ?? []).filter((l) => itemIds.has(l.item_id)).map((l) => l.external_code)
  const skus = (items ?? []).map((i) => i.sku).filter(Boolean) as string[]
  const { data: traffic } = await db.from('amazon_traffic_asin').select('asin,sku,sessions,page_views,units,sales,conversion_pct,buy_box_pct').gte('day', since)
  const mine = (traffic ?? []).filter((t) => (t.sku && (skus.includes(t.sku) || codes.includes(t.sku))) || codes.includes(t.asin))
  const sum = (k: string) => mine.reduce((a, t: any) => a + Number(t[k] ?? 0), 0)
  const sessions = sum('sessions')
  const units = sum('units')
  const { data: allTraffic } = await db.from('amazon_traffic_daily').select('sessions,units').gte('day', since)
  const storeConv = (() => {
    const s = (allTraffic ?? []).reduce((a, t: any) => a + Number(t.sessions ?? 0), 0)
    const u = (allTraffic ?? []).reduce((a, t: any) => a + Number(t.units ?? 0), 0)
    return s ? (u / s) * 100 : null
  })()
  const { data: fb } = await db.from('customer_feedback').select('text,rating,product_name').ilike('product_name', `%${o.model}%`).limit(30)

  const data = [
    `Ürün: ${BRAND_NAME[o.brand] ?? o.brand} ${o.model}`,
    items?.length ? `Varyantlar: ${(items ?? []).map((i) => [i.variant, i.color].filter(Boolean).join(' ') || i.name).join(', ')}` : '',
    items?.[0]?.price ? `Satış fiyatı: ${items[0].price} TL` : '',
    sessions ? `Amazon son 60 gün: ${sessions} oturum, ${units} adet satış, dönüşüm %${((units / sessions) * 100).toFixed(1)}${storeConv !== null ? ` (mağaza ortalaması %${storeConv.toFixed(1)})` : ''}` : 'Amazon trafik verisi bu ürün için yok.',
    fb?.length ? `Müşteri soruları/geri bildirimleri:\n${fb.map((f) => `- ${f.rating ? `${f.rating}★ ` : ''}${String(f.text).slice(0, 160)}`).join('\n')}` : '',
    o.current ? `MEVCUT SAYFA METNİ:\n${o.current.slice(0, 6000)}` : 'Mevcut sayfa metni verilmedi.',
    o.notes ? `Ekibin notu: ${o.notes.slice(0, 1000)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    web: 4,
    maxTokens: 6000,
    system: `Sen Türkiye pazaryerleri (Amazon.com.tr, Trendyol, Hepsiburada) için ürün sayfası metni yazan uzmansın.

${BRAND_FACTS}

Kurallar:
- Web aramasıyla Amazon.com.tr ve Trendyol'da bu kategoride müşterilerin hangi kelimelerle aradığını ve rakip başlıkların yapısını kısaca araştır.
- Sadece verilen ve bilinen özellikleri yaz; ölçü, malzeme oranı, sertifika gibi bilgileri UYDURMA. Emin olmadığın yere [doğrula: …] notu koy.
- Tıbbi iddia yasak: "iyileştirir, tedavi eder" yerine "destekler, rahatlatır, konfor sağlar" gibi ifadeler.
- Amazon başlığı en fazla 200 karakter, marka adıyla başlar; 5 madde işareti, her biri BÜYÜK HARFLİ kısa başlık + açıklama, en fazla 250 karakter; arka plan arama terimleri 250 bayt, virgülsüz, tekrar yok.
- Trendyol başlığı en fazla 100 karakter; açıklama kısa paragraflar ve maddeler.
- Mevcut metin verildiyse neyi neden değiştirdiğini kısaca söyle; dönüşüm mağaza ortalamasından düşükse bunun olası sebeplerini (görsel, fiyat, başlık, yorum) belirt.
- Cevabın SONUNDA tek bir \`\`\`json bloğu ver:
{
  "analiz": "3-5 cümle: mevcut durum, dönüşüm, ana fırsatlar",
  "anahtar_kelimeler": ["...", "..."],
  "amazon": { "baslik": "...", "maddeler": ["...", "...", "...", "...", "..."], "aciklama": "...", "arama_terimleri": "..." },
  "trendyol": { "baslik": "...", "aciklama": "..." },
  "gorsel_onerileri": ["ana görsel ve galeri için kısa öneriler"],
  "dogrulanacaklar": ["ekibin kontrol etmesi gereken bilgiler"]
}
İstenmeyen pazaryerinin alanını boş bırakabilirsin.`,
    prompt: `İstenen pazaryerleri: ${o.marketplaces.join(', ')}\n\n${data}`,
  }
}

/* ------------------------------------------------------------------ */
/* Haftalık rapor                                                      */
/* ------------------------------------------------------------------ */

export async function weeklyData(db: SupabaseClient, now = Date.now()) {
  // Geçen hafta: pazartesi–pazar (İstanbul)
  const t = ist(now)
  const d = new Date(t + 'T12:00:00Z')
  const wd = (d.getUTCDay() + 6) % 7
  const thisMon = new Date(d.getTime() - wd * DAY)
  const a = ist(thisMon.getTime() - 7 * DAY)
  const b = ist(thisMon.getTime() - DAY)
  const pa = ist(thisMon.getTime() - 14 * DAY)
  const pb = ist(thisMon.getTime() - 8 * DAY)

  const [{ data: lines }, { data: ads }, { data: traffic }, { data: social }, { data: leads }, { data: parties }] = await Promise.all([
    db.from('sale_lines').select('sale_id,sale_date,channel,status,brand,name,variant,qty,revenue,cogs').gte('sale_date', pa).lte('sale_date', b).limit(10000),
    db.from('ad_insights').select('day,platform,brand,spend,clicks,conversions,conv_value').gte('day', pa).lte('day', b).limit(10000),
    db.from('amazon_traffic_daily').select('day,sessions,units').gte('day', pa).lte('day', b),
    db.from('social_daily').select('account_id,day,followers,reach,interactions').gte('day', pa).lte('day', b),
    db.from('leads').select('created_at,status').gte('created_at', pa),
    db.from('parties').select('created_at').gte('created_at', pa),
  ])
  const inW = (day: string, s: string, e: string) => day >= s && day <= e
  const agg = (s: string, e: string) => {
    const L = (lines ?? []).filter((l) => l.status === 'tamamlandi' && inW(l.sale_date, s, e))
    const by = (k: 'channel' | 'brand') => Object.entries(L.reduce<Record<string, number>>((m, l: any) => ((m[l[k]] = (m[l[k]] ?? 0) + Number(l.revenue)), m), {})).map(([key, v]) => ({ key, ciro: Math.round(v) }))
    const items = Object.entries(L.reduce<Record<string, { adet: number; ciro: number }>>((m, l) => {
      const k = [l.name, l.variant].filter(Boolean).join(' · ')
      m[k] = m[k] ?? { adet: 0, ciro: 0 }
      m[k].adet += Number(l.qty)
      m[k].ciro += Number(l.revenue)
      return m
    }, {}))
      .sort((x, y) => y[1].ciro - x[1].ciro)
      .slice(0, 8)
      .map(([k, v]) => ({ urun: k, adet: v.adet, ciro: Math.round(v.ciro) }))
    const A = (ads ?? []).filter((x) => inW(x.day, s, e))
    const spend = A.reduce((m, x) => m + Number(x.spend), 0)
    const value = A.reduce((m, x) => m + Number(x.conv_value ?? 0), 0)
    const T = (traffic ?? []).filter((x) => inW(x.day, s, e))
    const ses = T.reduce((m, x: any) => m + Number(x.sessions ?? 0), 0)
    const un = T.reduce((m, x: any) => m + Number(x.units ?? 0), 0)
    return {
      donem: `${s} – ${e}`,
      ciro: Math.round(L.reduce((m, l) => m + Number(l.revenue), 0)),
      brut_kar: Math.round(L.reduce((m, l) => m + Number(l.revenue) - Number(l.cogs), 0)),
      siparis: new Set(L.map((l) => l.sale_id)).size,
      adet: L.reduce((m, l) => m + Number(l.qty), 0),
      kanal: by('channel'),
      marka: by('brand'),
      en_cok_satanlar: items,
      reklam: { harcama: Math.round(spend), donusum_degeri: Math.round(value), roas: spend ? +(value / spend).toFixed(2) : null, platform: Object.entries(A.reduce<Record<string, number>>((m, x) => ((m[x.platform] = (m[x.platform] ?? 0) + Number(x.spend)), m), {})).map(([k, v]) => ({ platform: k, harcama: Math.round(v) })) },
      amazon_trafik: { oturum: ses, adet: un, donusum: ses ? +((un / ses) * 100).toFixed(1) : null },
      yeni_talep: (leads ?? []).filter((x) => inW(String(x.created_at).slice(0, 10), s, e)).length,
      yeni_cari: (parties ?? []).filter((x) => inW(String(x.created_at).slice(0, 10), s, e)).length,
    }
  }
  const digest = await buildDigest(db, now)
  return {
    gecen_hafta: agg(a, b),
    onceki_hafta: agg(pa, pb),
    simdi: {
      siparis_verilecek: digest.stock,
      amazona_gonderilecek: digest.fba,
      bekleyen_alacak: digest.receivableTotal,
      geciken_alacak: digest.overdueTotal,
      geciken_firmalar: digest.receivables.filter((r) => r.late > 0).map((r) => ({ firma: r.party, tutar: Math.round(r.amount), gun: r.late })),
      bekleyen_soru: digest.voice.waiting,
      satis_getirmeyen_reklam: digest.ads,
    },
    sosyal: social ?? [],
  }
}

export async function weeklyJob(db: SupabaseClient): Promise<JobSpec & { subject: string }> {
  const data = await weeklyData(db)
  return {
    subject: data.gecen_hafta.donem,
    web: 0,
    maxTokens: 3500,
    system: `Sen OMY Ticaret'in iş analistisin. Her pazartesi ekibe (Ömer, Yunus, Yusuf, Eymen) geçen haftanın kısa raporunu yazıyorsun.

${BRAND_FACTS}

Kurallar:
- Türkçe, sade, telefonda okunacak kadar kısa (en fazla ~350 kelime). Markdown kullan: ## başlıklar, maddeler, en fazla bir küçük tablo.
- Bölümler: ## Kısaca (2-3 cümle) · ## Rakamlar (geçen hafta / önceki hafta / değişim tablosu: ciro, brüt kâr, sipariş, reklam harcaması, ROAS, Amazon dönüşüm) · ## İyi gidenler · ## Dikkat · ## Bu hafta yapılacaklar (en fazla 5 net madde, kim/ne).
- Sadece verilen rakamları kullan; hesapladığın yüzdeleri doğru hesapla. Veri yoksa "veri yok" de, tahmin yürütme.
- Tutarları ₺ ve Türkçe binlik ayırıcıyla yaz.`,
    prompt: `Veriler (JSON):\n${JSON.stringify(data).slice(0, 60_000)}`,
  }
}
