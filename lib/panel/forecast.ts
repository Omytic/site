import type { ItemWithStock, SaleLine } from './data'
import { addDays, daysBetween, today, toISODate } from './format'

/*
 * Satış tahmini — basit, açıklanabilir yöntemler:
 *  - Haftalık seri: Pazartesi başlayan haftalar.
 *  - Tahmin: sönümlü trendli üstel düzeltme (Holt). Trend her hafta biraz sönümlenir; uç değerlere aşırı tepki vermez.
 *  - Bant: geçmiş tahmin hatalarının standart sapması, ileriye gittikçe genişler.
 *  - Ay sonu: bu ay şimdiye kadar + son 28 günün günlük ortalaması × kalan gün (haftanın günlerine göre ağırlıklı).
 */

const done = (l: SaleLine) => l.status === 'tamamlandi'

export const weekStart = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  const wd = (d.getDay() + 6) % 7 // pazartesi 0
  d.setDate(d.getDate() - wd)
  return toISODate(d)
}

export interface WeekPoint {
  week: string
  revenue: number
  units: number
  profit: number
}

/** Son `n` tamamlanmış hafta + içinde bulunulan hafta (son eleman, eksik). */
export function weeklySeries(lines: SaleLine[], n = 16, filter?: (l: SaleLine) => boolean): WeekPoint[] {
  const cur = weekStart(today())
  const weeks = Array.from({ length: n + 1 }, (_, i) => addDays(cur, (i - n) * 7))
  const idx = new Map(weeks.map((w, i) => [w, i]))
  const out = weeks.map((week) => ({ week, revenue: 0, units: 0, profit: 0 }))
  lines.forEach((l) => {
    if (!done(l) || (filter && !filter(l))) return
    const i = idx.get(weekStart(l.sale_date))
    if (i === undefined) return
    out[i].revenue += Number(l.revenue)
    out[i].units += Number(l.qty)
    out[i].profit += Number(l.revenue) - Number(l.cogs)
  })
  return out
}

export interface Forecast {
  /** Tahmin edilen değerler (h adım) */
  values: number[]
  lower: number[]
  upper: number[]
  /** Haftalık trend: + büyüyor, − küçülüyor (oran) */
  trend: number
  reliable: boolean
}

/** Sönümlü Holt. `series` geçmiş haftalar (içinde bulunulan eksik hafta HARİÇ). */
export function holt(series: number[], h = 8, alpha = 0.45, beta = 0.2, phi = 0.85): Forecast {
  const s = series.slice()
  // baştaki sıfırları at (ürün henüz satılmıyordu)
  while (s.length > 1 && s[0] === 0) s.shift()
  if (s.length < 3) {
    const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0
    return { values: Array(h).fill(avg), lower: Array(h).fill(avg * 0.6), upper: Array(h).fill(avg * 1.4), trend: 0, reliable: false }
  }
  let level = s[0]
  let trend = (s[Math.min(3, s.length - 1)] - s[0]) / Math.min(3, s.length - 1)
  const errs: number[] = []
  for (let i = 1; i < s.length; i++) {
    const pred = level + phi * trend
    errs.push(s[i] - pred)
    const prevLevel = level
    level = alpha * s[i] + (1 - alpha) * pred
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend
  }
  const sd = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / Math.max(1, errs.length))
  const values: number[] = []
  const lower: number[] = []
  const upper: number[] = []
  let damp = 0
  for (let k = 1; k <= h; k++) {
    damp += Math.pow(phi, k)
    const v = Math.max(0, level + damp * trend)
    const band = sd * Math.sqrt(k) * 0.9
    values.push(v)
    lower.push(Math.max(0, v - band))
    upper.push(v + band)
  }
  return { values, lower, upper, trend: level > 0 ? trend / level : 0, reliable: s.length >= 6 }
}

/** Haftanın günlerine göre satış payı (pzt..paz), son `days` gün. Veri azsa eşit. */
export function weekdayShare(lines: SaleLine[], days = 84, value: (l: SaleLine) => number = (l) => Number(l.revenue)) {
  const from = addDays(today(), -days)
  const tot = Array(7).fill(0)
  lines.forEach((l) => {
    if (!done(l) || l.sale_date < from || l.sale_date >= today()) return
    tot[(new Date(l.sale_date + 'T00:00:00').getDay() + 6) % 7] += value(l)
  })
  const all = tot.reduce((a, b) => a + b, 0)
  return { totals: tot, share: all > 0 ? tot.map((v) => v / all) : Array(7).fill(1 / 7) }
}

/** Ay sonu tahmini (ciro). */
export function monthEnd(lines: SaleLine[]) {
  const t = today()
  const mk = t.slice(0, 7)
  const mtd = lines.filter((l) => done(l) && l.sale_date.slice(0, 7) === mk).reduce((a, l) => a + Number(l.revenue), 0)
  const from = addDays(t, -28)
  const last28 = lines.filter((l) => done(l) && l.sale_date >= from && l.sale_date < t).reduce((a, l) => a + Number(l.revenue), 0)
  const { share } = weekdayShare(lines, 84)
  const perWeek = last28 / 4
  const d = new Date(t + 'T00:00:00')
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  let rest = 0
  // bugün dahil: bugünün satışı henüz tamamlanmadı, bugünün yarısını say
  for (let day = d.getDate(); day <= lastDay; day++) {
    const wd = (new Date(d.getFullYear(), d.getMonth(), day).getDay() + 6) % 7
    rest += perWeek * share[wd] * (day === d.getDate() ? 0.5 : 1)
  }
  return { mtd, estimate: mtd + rest, rest, daysLeft: lastDay - d.getDate() }
}

// ---------------------------------------------------------------------------
// Stok bitişi ve sipariş önerisi
// ---------------------------------------------------------------------------

export interface Reorder {
  item: ItemWithStock
  /** Günlük satış (30 ve 90 günün harmanı) */
  perDay: number
  stock: number
  daysLeft: number | null
  runOut: string | null
  /** Tedarik süresi + hedef kapsama için önerilen sipariş adedi */
  suggest: number
  urgency: 'now' | 'soon' | 'ok' | 'none'
}

export function reorderPlan(items: ItemWithStock[], lines: SaleLine[], opts: { leadDays?: number; coverDays?: number } = {}) {
  const lead = opts.leadDays ?? 30
  const cover = opts.coverDays ?? 60
  const t = today()
  const d30 = addDays(t, -30)
  const d90 = addDays(t, -90)
  const q30 = new Map<string, number>()
  const q90 = new Map<string, number>()
  const first = new Map<string, string>()
  lines.forEach((l) => {
    if (!done(l)) return
    if (!first.has(l.item_id) || l.sale_date < first.get(l.item_id)!) first.set(l.item_id, l.sale_date)
    if (l.sale_date >= d90) q90.set(l.item_id, (q90.get(l.item_id) ?? 0) + Number(l.qty))
    if (l.sale_date >= d30) q30.set(l.item_id, (q30.get(l.item_id) ?? 0) + Number(l.qty))
  })
  return items
    .filter((i) => i.active)
    .map<Reorder>((item) => {
      // yeni ürünlerde 90 güne bölmek hızı düşürür: satıldığı gün sayısına böl
      const age = first.has(item.id) ? Math.max(14, Math.min(90, daysBetween(first.get(item.id)!, t))) : 90
      const v30 = (q30.get(item.id) ?? 0) / Math.min(30, age)
      const v90 = (q90.get(item.id) ?? 0) / age
      const perDay = v30 * 0.6 + v90 * 0.4
      const stock = Math.max(0, item.total)
      const daysLeft = perDay > 0 ? stock / perDay : null
      const runOut = daysLeft === null ? null : addDays(t, Math.floor(daysLeft))
      const suggest = perDay > 0 ? Math.max(0, Math.ceil(perDay * (lead + cover) - stock)) : 0
      const urgency: Reorder['urgency'] = daysLeft === null ? 'none' : daysLeft <= lead ? 'now' : daysLeft <= lead + 21 ? 'soon' : 'ok'
      return { item, perDay, stock, daysLeft, runOut, suggest, urgency }
    })
    .sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9))
}
