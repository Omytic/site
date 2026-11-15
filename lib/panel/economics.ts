/*
 * Bir adet satışın kâr ve KDV hesabı (nesatilir.com'daki pazaryeri hesabıyla aynı mantık).
 * Bütün tutarlar KDV DAHİL girilir:
 *  - Satıştan oluşan KDV  = satış × kdv / (1 + kdv)
 *  - Alıştan oluşan KDV   = alış × alış kdv / (1 + alış kdv)
 *  - Komisyon             = satış × komisyon % + %20 KDV   (pazaryerleri oranı KDV hariç verir, faturaya KDV eklenir)
 *  - Kargo                = adet başı kargo / FBA ücreti (KDV dahil, içinde %20 KDV)
 *  - Ödenecek KDV         = satış KDV − alış KDV − komisyon KDV − kargo KDV
 *                           (eksi çıkarsa ödenmez, sonraki aylara "devreden KDV" olur)
 *  - Stopaj               = KDV hariç satış × %1 (pazaryeri keser; yıl sonu vergiden düşülür)
 *  - Kâr                  = satış − alış − komisyon − kargo − ödenecek KDV − stopaj
 */

export const MARKETPLACES = ['amazon', 'trendyol', 'hepsiburada']
export const STOPAJ_PCT = 1

export interface UnitInput {
  price: number // satış, KDV dahil
  vat: number // satış KDV %
  buy: number // alış, KDV dahil
  buyVat: number // alış KDV %
  commissionPct: number
  commissionVat?: number // komisyon faturasındaki KDV % (varsayılan 20)
  cargo: number // adet başı kargo / FBA, KDV dahil
  cargoVat?: number // kargo faturasındaki KDV % (varsayılan 20)
  stopajPct?: number // pazaryerinde 1, kendi sitede 0
}

export interface UnitResult {
  netSale: number
  saleVat: number
  buyVat: number
  commission: number
  commissionVat: number
  cargo: number
  cargoVat: number
  payableVat: number
  stopaj: number
  profit: number
  margin: number | null // kâr / satış
  roi: number | null // kâr / alış
}

const inner = (amount: number, pct: number) => (amount * pct) / (100 + pct)

export function unitEconomics(i: UnitInput): UnitResult {
  const price = Math.max(0, i.price || 0)
  const buy = Math.max(0, i.buy || 0)
  const cargo = Math.max(0, i.cargo || 0)
  const saleVat = inner(price, i.vat || 0)
  const buyVat = inner(buy, i.buyVat || 0)
  const commissionNet = (price * (i.commissionPct || 0)) / 100
  const commissionVat = (commissionNet * (i.commissionVat ?? 20)) / 100
  const commission = commissionNet + commissionVat
  const cargoVat = inner(cargo, i.cargoVat ?? 20)
  const payableVat = saleVat - buyVat - commissionVat - cargoVat
  const netSale = price - saleVat
  const stopaj = (netSale * (i.stopajPct ?? 0)) / 100
  const profit = price - buy - commission - cargo - payableVat - stopaj
  return {
    netSale,
    saleVat,
    buyVat,
    commission,
    commissionVat,
    cargo,
    cargoVat,
    payableVat,
    stopaj,
    profit,
    margin: price > 0 ? profit / price : null,
    roi: buy > 0 ? profit / buy : null,
  }
}

/** Panel verisinden: ürün (satış KDV dahil, maliyet KDV hariç) + kanal maliyeti. */
export function itemEconomics(
  item: { price: number; cost: number; vat_rate?: number },
  cost: { commission_pct: number; fee_per_unit: number } | null,
  channel: string | null,
) {
  const vat = Number(item.vat_rate ?? 20)
  return unitEconomics({
    price: item.price,
    vat,
    buy: item.cost * (1 + vat / 100),
    buyVat: vat,
    commissionPct: Number(cost?.commission_pct ?? 0),
    cargo: Number(cost?.fee_per_unit ?? 0),
    stopajPct: channel && MARKETPLACES.includes(channel) ? STOPAJ_PCT : 0,
  })
}

/** Komisyon faturası tutarı (KDV dahil): oran KDV hariç satış tutarı üzerinden değil, satış fiyatı üzerinden; üstüne %20 KDV. */
export const commissionWithVat = (revenue: number, pct: number, vat = 20) => (revenue * pct * (1 + vat / 100)) / 100
