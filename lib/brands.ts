// "Diğer İşlerimiz" bölümündeki markaların linkleri.
// Bir link değişirse sadece burayı güncellemek yeterli.

export type StoreKey = 'amazon' | 'trendyol' | 'hepsiburada'

export interface StoreLink {
  key: StoreKey
  label: string
  logo: string
  href: string
}

const OMY_STORES = {
  amazon: 'https://www.amazon.com.tr/s?me=A1D8844Z4S0BOA&marketplaceID=A33AVAJ2PDY3EV',
  trendyol: 'https://www.trendyol.com/sr?mid=1288801&os=1',
  hepsiburada: 'https://www.hepsiburada.com/magaza/omy',
}

const store = (key: StoreKey, href: string): StoreLink => ({
  key,
  href,
  label: { amazon: 'Amazon', trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' }[key],
  logo: `/images/brands/${key}.png`,
})

export const FORMSTEP = {
  name: 'FormStep',
  site: 'https://formstep.tr',
  siteLabel: 'formstep.tr',
  stores: [
    store('amazon', OMY_STORES.amazon),
    store('trendyol', OMY_STORES.trendyol),
    store('hepsiburada', OMY_STORES.hepsiburada),
  ],
}

// TODO: SERYN'in ürün sayfası linkleri varsa buraya koyun.
// Şimdilik OMY mağazalarında "seryn" araması açılıyor.
export const SERYN = {
  name: 'SERYN',
  site: 'https://seryn.com.tr',
  siteLabel: 'seryn.com.tr',
  stores: [
    store('amazon', `${OMY_STORES.amazon}&k=seryn`),
    store('trendyol', 'https://www.trendyol.com/sr?mid=1288801&q=seryn&os=1'),
    store('hepsiburada', OMY_STORES.hepsiburada),
  ],
}
