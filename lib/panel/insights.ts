import type { AdBudget, AdSpend, ItemWithStock, LedgerRow, SaleLine, Task } from './data'
import { AD_PLATFORMS, BRANDS_WITH_GENEL, CHANNELS, label } from './constants'
import { addDays, daysBetween, monthKey, num, pct, tl, today } from './format'

export interface Velocity {
  /** Günlük ortalama satış (son N gün) */
  amazon: number
  other: number
  total: number
}

/** Ürün başına günlük satış hızı (tamamlanan satışlar). */
export function velocities(lines: SaleLine[], days = 30) {
  const from = addDays(today(), -days)
  const m = new Map<string, Velocity>()
  lines.forEach((l) => {
    if (l.status !== 'tamamlandi' || l.sale_date < from) return
    const v = m.get(l.item_id) ?? { amazon: 0, other: 0, total: 0 }
    if (l.location_id === 'amazon') v.amazon += Number(l.qty) / days
    else v.other += Number(l.qty) / days
    v.total += Number(l.qty) / days
    m.set(l.item_id, v)
  })
  return m
}

/** Stok kaç gün yeter? (satış yoksa null) */
export function coverDays(stock: number, perDay: number) {
  if (perDay <= 0) return null
  return Math.max(0, stock) / perDay
}

export interface Suggestion {
  id: string
  tone: 'critical' | 'warning' | 'info' | 'good'
  title: string
  text: string
  href?: string
}

export function buildSuggestions(opts: {
  items: ItemWithStock[]
  lines: SaleLine[]
  ledger: LedgerRow[]
  budgets: AdBudget[]
  spend: AdSpend[]
  tasks: Task[]
}) {
  const { items, lines, ledger, budgets, spend, tasks } = opts
  const out: Suggestion[] = []
  const vel = velocities(lines, 30)
  const t = today()
  const TARGET_FBA_DAYS = 30
  const LEAD_DAYS = 21

  // 1) Amazon FBA yenileme önerisi
  const fbaNeeds = items
    .map((i) => {
      const v = vel.get(i.id)?.amazon ?? 0
      if (v <= 0) return null
      const pipeline = i.stock.amazon + i.stock.yolda
      const days = pipeline / v
      if (days >= LEAD_DAYS) return null
      const need = Math.ceil(v * TARGET_FBA_DAYS - pipeline)
      return { i, days, need: Math.min(need, Math.max(0, Math.floor(i.stock.depo))), want: need }
    })
    .filter(Boolean) as { i: ItemWithStock; days: number; need: number; want: number }[]
  fbaNeeds
    .sort((a, b) => a.days - b.days)
    .slice(0, 4)
    .forEach(({ i, days, need, want }) =>
      out.push({
        id: `fba-${i.id}`,
        tone: days < 7 ? 'critical' : 'warning',
        title: `${i.label}: Amazon'da ~${Math.floor(days)} güne yeter`,
        text:
          need > 0
            ? `30 günlük stok için ~${num(want)} ${i.unit} gönderilmeli. Depoda ${num(i.stock.depo)} var, ${num(need)} ${i.unit} ile sevkiyat hazırlayabilirsiniz.`
            : `30 günlük stok için ~${num(want)} ${i.unit} gerekiyor ama depoda yok. Önce alım yapılmalı.`,
        href: '/admin/sevkiyat?yeni=1',
      }),
    )

  // 2) Depo bitiş tahmini ve kritik stok
  items
    .filter((i) => i.active)
    .forEach((i) => {
      const v = vel.get(i.id)?.other ?? 0
      const days = coverDays(i.stock.depo, v)
      if (i.total < 0 || i.stock.depo < 0 || i.stock.amazon < 0) {
        out.push({ id: `neg-${i.id}`, tone: 'critical', title: `${i.label}: stok eksiye düşmüş`, text: 'Bir satış ya da sevkiyat stoktan fazla girilmiş olabilir. Sayım düzeltmesi yapın.', href: '/admin/stok' })
      } else if (days !== null && days < 14) {
        out.push({
          id: `depo-${i.id}`,
          tone: days < 5 ? 'critical' : 'warning',
          title: `${i.label}: depo ~${Math.floor(days)} günde bitecek`,
          text: `Günde ortalama ${num(Math.round(v * 10) / 10)} ${i.unit} satılıyor, depoda ${num(i.stock.depo)} var. Alım planlayın.`,
          href: '/admin/alimlar?yeni=1',
        })
      } else if (i.min_stock > 0 && i.total <= i.min_stock) {
        out.push({ id: `min-${i.id}`, tone: 'warning', title: `${i.label}: kritik stok seviyesinde`, text: `Toplam ${num(i.total)} ${i.unit}, alt sınır ${num(i.min_stock)}.`, href: '/admin/stok' })
      }
    })

  // 3) Reklam bütçesi doluluğu (bu ay)
  const mk = monthKey(t)
  budgets
    .filter((b) => monthKey(b.month) === mk && b.budget > 0)
    .forEach((b) => {
      const used = spend.filter((s) => monthKey(s.spend_date) === mk && s.platform === b.platform && s.brand === b.brand).reduce((a, s) => a + Number(s.amount), 0)
      const r = used / Number(b.budget)
      if (r >= 0.9)
        out.push({
          id: `ad-${b.id}`,
          tone: r > 1 ? 'critical' : 'warning',
          title: `Reklam bütçesi ${r > 1 ? 'aşıldı' : 'dolmak üzere'}: ${label(AD_PLATFORMS, b.platform)} · ${label(BRANDS_WITH_GENEL, b.brand)}`,
          text: `${tl(used)} / ${tl(b.budget)} (${pct(r * 100)}) harcandı.`,
          href: '/admin/reklam',
        })
    })

  // 4) Vadesi geçen / yaklaşan ödemeler
  const pending = ledger.filter((l) => l.payment_status === 'bekliyor')
  const overdue = pending.filter((l) => l.due_date && l.due_date < t)
  const soon = pending.filter((l) => l.due_date && l.due_date >= t && daysBetween(t, l.due_date) <= 7)
  const sumOf = (arr: LedgerRow[], d: 'gelir' | 'gider') => arr.filter((x) => x.direction === d).reduce((a, x) => a + Number(x.amount), 0)
  if (overdue.length)
    out.push({
      id: 'overdue',
      tone: 'critical',
      title: `${overdue.length} ödemenin vadesi geçti`,
      text: `Tahsil edilecek ${tl(sumOf(overdue, 'gelir'))}, ödenecek ${tl(sumOf(overdue, 'gider'))}.`,
      href: '/admin/finans',
    })
  if (soon.length)
    out.push({
      id: 'soon',
      tone: 'info',
      title: `Bu hafta ${soon.length} ödeme var`,
      text: `Gelecek: ${tl(sumOf(soon, 'gelir'))}, gidecek: ${tl(sumOf(soon, 'gider'))}.`,
      href: '/admin/finans',
    })

  // 5) Kanal değişimi (son 30 gün vs önceki 30 gün)
  const r30 = addDays(t, -30)
  const r60 = addDays(t, -60)
  CHANNELS.forEach((c) => {
    const cur = lines.filter((l) => l.status === 'tamamlandi' && l.channel === c.id && l.sale_date >= r30).reduce((a, l) => a + Number(l.revenue), 0)
    const prev = lines.filter((l) => l.status === 'tamamlandi' && l.channel === c.id && l.sale_date >= r60 && l.sale_date < r30).reduce((a, l) => a + Number(l.revenue), 0)
    if (prev >= 2000 && cur < prev * 0.7)
      out.push({ id: `ch-${c.id}`, tone: 'warning', title: `${label(CHANNELS, c.id)} satışları düştü`, text: `Son 30 gün ${tl(cur)}, önceki 30 gün ${tl(prev)} (%${Math.round((1 - cur / prev) * 100)} düşüş).`, href: '/admin/satislar' })
    if (prev >= 2000 && cur > prev * 1.3)
      out.push({ id: `chu-${c.id}`, tone: 'good', title: `${label(CHANNELS, c.id)} büyüyor`, text: `Son 30 gün ${tl(cur)}, önceki 30 gün ${tl(prev)} (%${Math.round((cur / prev - 1) * 100)} artış).`, href: '/admin/satislar' })
  })

  // 6) Düşük marjlı ürünler
  items
    .filter((i) => i.active && i.cost > 0 && i.price > 0 && (i.price - i.cost) / i.price < 0.25)
    .slice(0, 3)
    .forEach((i) =>
      out.push({
        id: `mg-${i.id}`,
        tone: 'info',
        title: `${i.label}: brüt marj ${pct(((i.price - i.cost) / i.price) * 100)}`,
        text: `Satış ${tl(i.price)}, maliyet ${tl(i.cost)}. Komisyon ve kargo düşülünce zarar ediyor olabilir.`,
        href: '/admin/stok',
      }),
    )

  // 7) Geciken işler
  const late = tasks.filter((x) => x.status !== 'bitti' && x.due_date && x.due_date < t)
  if (late.length) out.push({ id: 'late', tone: 'warning', title: `${late.length} işin tarihi geçti`, text: late.slice(0, 3).map((x) => x.title).join(', ') + (late.length > 3 ? '…' : ''), href: '/admin/isler' })

  // 8) Maliyeti girilmemiş ürünler (kâr hesabı eksik kalır)
  const noCost = items.filter((i) => i.active && i.cost <= 0 && lines.some((l) => l.item_id === i.id))
  if (noCost.length)
    out.push({ id: 'nocost', tone: 'info', title: `${noCost.length} satılan ürünün maliyeti girilmemiş`, text: 'Kâr hesabı bu ürünlerde eksik çıkar. Stok sayfasından maliyet girin ya da alım kaydı oluşturun.', href: '/admin/stok' })

  const rank = { critical: 0, warning: 1, info: 2, good: 3 }
  return out.sort((a, b) => rank[a.tone] - rank[b.tone])
}
