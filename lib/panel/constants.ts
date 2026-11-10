// Panel genelindeki sabitler: etiketler ve sabit grafik renkleri.
// Renk her zaman varlığa bağlıdır (kanal, marka), sıraya değil — filtre değişse de aynı kalır.
// Kategorik renkler dataviz doğrulayıcısından geçmiş sıradadır.

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#008300', '#e34948']

export type Brand = 'formstep' | 'seryn' | 'kumas' | 'diger'
export type BrandOrGenel = Brand | 'genel'
export type Channel = 'amazon' | 'trendyol' | 'hepsiburada' | 'seryn_site' | 'toptan' | 'diger'
export type LocationId = 'depo' | 'yolda' | 'amazon'
export type Unit = 'adet' | 'metre' | 'top' | 'kg' | 'paket'

export const BRANDS: { id: Brand; label: string; color: string }[] = [
  { id: 'formstep', label: 'FormStep', color: SERIES[0] },
  { id: 'seryn', label: 'SERYN', color: SERIES[1] },
  { id: 'kumas', label: 'Kumaş', color: SERIES[2] },
  { id: 'diger', label: 'Diğer', color: SERIES[5] },
]
export const BRANDS_WITH_GENEL: { id: BrandOrGenel; label: string; color: string }[] = [
  ...BRANDS,
  { id: 'genel', label: 'Genel', color: '#8a8f99' },
]

export const CHANNELS: { id: Channel; label: string; color: string }[] = [
  { id: 'amazon', label: 'Amazon', color: SERIES[0] },
  { id: 'trendyol', label: 'Trendyol', color: SERIES[1] },
  { id: 'hepsiburada', label: 'Hepsiburada', color: SERIES[2] },
  { id: 'seryn_site', label: 'seryn.com.tr', color: SERIES[3] },
  { id: 'toptan', label: 'Toptan', color: SERIES[4] },
  { id: 'diger', label: 'Diğer', color: SERIES[5] },
]

export const LOCATIONS: { id: LocationId; label: string; short: string }[] = [
  { id: 'depo', label: 'Depo', short: 'Depo' },
  { id: 'yolda', label: "Amazon'a yolda", short: 'Yolda' },
  { id: 'amazon', label: 'Amazon FBA', short: 'FBA' },
]

export const UNITS: { id: Unit; label: string }[] = [
  { id: 'adet', label: 'adet' },
  { id: 'metre', label: 'metre' },
  { id: 'top', label: 'top' },
  { id: 'kg', label: 'kg' },
  { id: 'paket', label: 'paket' },
]

export const SALE_STATUS = [
  { id: 'tamamlandi', label: 'Tamamlandı' },
  { id: 'iade', label: 'İade' },
  { id: 'iptal', label: 'İptal' },
] as const

export const SHIPMENT_STATUS = [
  { id: 'hazirlaniyor', label: 'Hazırlanıyor' },
  { id: 'yolda', label: 'Yolda' },
  { id: 'teslim_alindi', label: 'Teslim alındı' },
  { id: 'iptal', label: 'İptal' },
] as const

export const PAYMENT_STATUS = [
  { id: 'odendi', label: 'Ödendi' },
  { id: 'bekliyor', label: 'Bekliyor' },
] as const

export const MOVEMENT_KINDS: Record<string, string> = {
  acilis: 'Açılış stoğu',
  alis: 'Alım',
  satis: 'Satış',
  iade: 'İade',
  transfer: 'Transfer',
  sayim: 'Sayım düzeltmesi',
  fire: 'Fire / hasar',
  numune: 'Numune / hediye',
}

export const EXPENSE_CATEGORIES = [
  { id: 'mal_alimi', label: 'Mal alımı' },
  { id: 'kargo', label: 'Kargo' },
  { id: 'komisyon', label: 'Pazaryeri komisyonu' },
  { id: 'reklam', label: 'Reklam' },
  { id: 'ambalaj', label: 'Ambalaj / etiket' },
  { id: 'uretim', label: 'Üretim / fason' },
  { id: 'personel', label: 'Personel' },
  { id: 'kira', label: 'Kira / depo' },
  { id: 'vergi', label: 'Vergi / muhasebe' },
  { id: 'yazilim', label: 'Yazılım / abonelik' },
  { id: 'fuar', label: 'Fuar / etkinlik' },
  { id: 'diger_gider', label: 'Diğer gider' },
]
export const INCOME_CATEGORIES = [
  { id: 'satis', label: 'Satış' },
  { id: 'hakedis', label: 'Pazaryeri hakedişi' },
  { id: 'diger_gelir', label: 'Diğer gelir' },
]
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => [c.id, c.label]),
)

export const AD_PLATFORMS = [
  { id: 'meta', label: 'Meta (Instagram/Facebook)', color: SERIES[0] },
  { id: 'google', label: 'Google', color: SERIES[1] },
  { id: 'amazon_ads', label: 'Amazon Reklam', color: SERIES[2] },
  { id: 'trendyol_ads', label: 'Trendyol Reklam', color: SERIES[3] },
  { id: 'hepsiburada_ads', label: 'Hepsiburada Reklam', color: SERIES[4] },
  { id: 'tiktok', label: 'TikTok', color: SERIES[5] },
  { id: 'diger', label: 'Diğer', color: '#8a8f99' },
]

export const TASK_STATUS = [
  { id: 'yapilacak', label: 'Yapılacak' },
  { id: 'devam', label: 'Devam ediyor' },
  { id: 'bitti', label: 'Bitti' },
] as const
export const TASK_PRIORITY = [
  { id: 'dusuk', label: 'Düşük' },
  { id: 'normal', label: 'Normal' },
  { id: 'yuksek', label: 'Yüksek' },
] as const

export const ASSET_KINDS = [
  { id: 'site', label: 'Web sitesi' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'pazaryeri', label: 'Pazaryeri mağazası' },
  { id: 'diger', label: 'Diğer' },
]

export const TABLE_LABELS: Record<string, string> = {
  items: 'Ürün kartı',
  sales: 'Satış',
  sale_items: 'Satış satırı',
  purchases: 'Alım',
  purchase_items: 'Alım satırı',
  shipments: 'Amazon sevkiyatı',
  shipment_items: 'Sevkiyat satırı',
  stock_movements: 'Stok düzeltmesi',
  transactions: 'Gelir / gider',
  ad_budgets: 'Reklam bütçesi',
  ad_spend: 'Reklam harcaması',
  tasks: 'İş',
  assets: 'Dijital varlık',
  asset_metrics: 'Takipçi ölçümü',
  products: 'Vitrin ürünü',
  settings: 'Site ayarları',
}

export const label = <T extends { id: string; label: string }>(list: readonly T[], id: string | null | undefined) =>
  list.find((x) => x.id === id)?.label ?? id ?? '—'
export const colorOf = <T extends { id: string; color: string }>(list: readonly T[], id: string | null | undefined) =>
  list.find((x) => x.id === id)?.color ?? '#8a8f99'
