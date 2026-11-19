import type { SupabaseClient } from '@supabase/supabase-js'
import { reorderPlan } from './panel/forecast'
import type { ItemWithStock, SaleLine } from './panel/data'
import type { LocationId } from './panel/constants'

/*
 * Sabah özeti: dünün satışı, biten stok, Amazon'a gönderilecekler, tahsilat, aranacaklar, reklam, hatalar.
 * Sunucuda çalışır (servis anahtarıyla); panel önizlemesi, WhatsApp ve e-posta aynı veriyi kullanır.
 */

const DAY = 86_400_000
const CH: Record<string, string> = { trendyol: 'Trendyol', amazon: 'Amazon', hepsiburada: 'Hepsiburada', site: 'Site', seryn: 'serynskin.com', toptan: 'Toptan', fuar: 'Fuar', diger: 'Diğer', instagram: 'Instagram' }
const SYNC: Record<string, string> = {
  trendyol: 'Trendyol',
  amazon: 'Amazon siparişleri',
  amazon_stok: 'Amazon FBA stoğu',
  amazon_finans: 'Amazon ücretleri',
  amazon_trafik: 'Amazon trafik',
  amazon_ads: 'Amazon Ads',
  hepsiburada: 'Hepsiburada',
  meta_reklam: 'Meta reklam',
  meta_instagram: 'Instagram',
  google_ads: 'Google Ads',
  banka: 'Banka',
}

export const ist = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
const tl = (v: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Math.round(v))
const n = (v: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY)
const dTR = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const label = (i: { name: string; variant: string | null; color: string | null }) => [i.name, [i.variant, i.color].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')

async function all<T>(q: (a: number, b: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

export interface Digest {
  date: string
  sales: { yesterday: number; orders: number; units: number; byChannel: { channel: string; revenue: number; orders: number }[]; mtd: number; prevMtd: number; month: string }
  stock: { item: string; daysLeft: number; runOut: string; suggest: number; unit: string }[]
  fba: { item: string; daysLeft: number | null; send: number; depo: number; short: boolean }[]
  receivables: { party: string; partyId: string | null; phone: string | null; amount: number; due: string | null; late: number }[]
  receivableTotal: number
  overdueTotal: number
  calls: { party: string; partyId: string; phone: string | null; note: string; date: string }[]
  newLeads: { name: string; created: string }[]
  ads: { platform: string; campaign: string; spend: number }[]
  errors: { channel: string; message: string }[]
}

export async function buildDigest(db: SupabaseClient, now = Date.now()): Promise<Digest> {
  const t = ist(now)
  const y = ist(now - DAY)
  const from90 = ist(now - 92 * DAY)

  const [lines, items, stock, pendingSales, pendingTx, parties, notes, leads, ads, runs, shipments] = await Promise.all([
    all<SaleLine>((a, b) => db.from('sale_lines').select('sale_id,sale_date,channel,status,item_id,qty,revenue,cogs,brand,name,variant,unit,unit_price,unit_cost,location_id').gte('sale_date', from90).range(a, b)),
    all<any>((a, b) => db.from('items').select('*').range(a, b)),
    all<{ item_id: string; location_id: LocationId; qty: number }>((a, b) => db.from('stock_levels').select('*').range(a, b)),
    all<any>((a, b) => db.from('sales').select('id,customer,party_id,sale_date,due_date,sale_items(qty,unit_price)').eq('status', 'tamamlandi').eq('payment_status', 'bekliyor').range(a, b)),
    all<any>((a, b) => db.from('transactions').select('id,counterparty,party_id,amount,due_date,tx_date').eq('direction', 'gelir').eq('payment_status', 'bekliyor').range(a, b)),
    all<{ id: string; name: string; phone: string | null }>((a, b) => db.from('parties').select('id,name,phone').range(a, b)),
    all<any>((a, b) => db.from('party_notes').select('party_id,body,next_date').eq('done', false).not('next_date', 'is', null).lte('next_date', t).range(a, b)),
    all<any>((a, b) => db.from('leads').select('name,company,created_at').eq('status', 'yeni').range(a, b)),
    all<any>((a, b) => db.from('ad_insights').select('platform,campaign_id,campaign_name,spend,conversions,day').gte('day', ist(now - 7 * DAY)).range(a, b)),
    db.from('sync_runs').select('channel,status,message,started_at').gte('started_at', new Date(now - 36 * 3600_000).toISOString()).order('started_at', { ascending: false }).limit(200),
    db.from('shipments').select('ship_date,received_date').eq('status', 'teslim_alindi').not('received_date', 'is', null).order('ship_date', { ascending: false }).limit(10),
  ])
  const party = new Map(parties.map((p) => [p.id, p]))

  // --- Satış ---
  const done = lines.filter((l) => l.status === 'tamamlandi')
  const yl = done.filter((l) => l.sale_date === y)
  const byCh = new Map<string, { revenue: number; orders: Set<string> }>()
  yl.forEach((l) => {
    const c = byCh.get(l.channel) ?? { revenue: 0, orders: new Set<string>() }
    c.revenue += Number(l.revenue)
    c.orders.add(l.sale_id)
    byCh.set(l.channel, c)
  })
  const month = t.slice(0, 7)
  const prevMonthDate = new Date(Date.parse(t + 'T12:00:00Z'))
  prevMonthDate.setUTCDate(1)
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1)
  const pm = prevMonthDate.toISOString().slice(0, 7)
  const dom = Number(t.slice(8, 10))
  // bugün henüz bitmedi: ay toplamı dün dahil
  const mtd = done.filter((l) => l.sale_date.slice(0, 7) === month && l.sale_date < t).reduce((a, l) => a + Number(l.revenue), 0)
  const prevMtd = done.filter((l) => l.sale_date.slice(0, 7) === pm && Number(l.sale_date.slice(8, 10)) < dom).reduce((a, l) => a + Number(l.revenue), 0)

  // --- Stok: tedarikçiden sipariş ---
  const withStock: ItemWithStock[] = items.map((i) => {
    const s: Record<LocationId, number> = { depo: 0, yolda: 0, amazon: 0 }
    stock.forEach((l) => l.item_id === i.id && (s[l.location_id] = Number(l.qty)))
    return { ...i, cost: Number(i.cost), price: Number(i.price), min_stock: Number(i.min_stock), stock: s, total: s.depo + s.yolda + s.amazon, label: label(i) }
  })
  const plan = reorderPlan(withStock, lines, { leadDays: 30, coverDays: 60 })
  const stockOut = plan
    .filter((r) => r.urgency === 'now' && r.daysLeft !== null)
    .slice(0, 8)
    .map((r) => ({ item: r.item.label, daysLeft: Math.floor(r.daysLeft!), runOut: r.runOut!, suggest: r.suggest, unit: r.item.unit }))

  // --- Amazon'a gönderilecekler: Amazon satış hızı, ortalama yol süresi + 30 gün ---
  const transit = shipments.data?.length ? Math.round(shipments.data.reduce((a: number, s: any) => a + dayDiff(s.ship_date, s.received_date), 0) / shipments.data.length) : 10
  const amz = new Map<string, { q30: number; q90: number }>()
  done.forEach((l) => {
    if (l.channel !== 'amazon') return
    const c = amz.get(l.item_id) ?? { q30: 0, q90: 0 }
    c.q90 += Number(l.qty)
    if (l.sale_date >= ist(now - 30 * DAY)) c.q30 += Number(l.qty)
    amz.set(l.item_id, c)
  })
  const fba = withStock
    .filter((i) => i.active && amz.has(i.id))
    .map((i) => {
      const v = amz.get(i.id)!
      const perDay = (v.q30 / 30) * 0.6 + (v.q90 / 90) * 0.4
      const pipe = Math.max(0, i.stock.amazon) + Math.max(0, i.stock.yolda)
      const daysLeft = perDay > 0 ? pipe / perDay : null
      const want = Math.ceil(perDay * (transit + 30) - pipe)
      return { item: i.label, daysLeft: daysLeft === null ? null : Math.floor(daysLeft), send: want, depo: Math.max(0, Math.floor(i.stock.depo)), short: i.stock.depo < want }
    })
    .filter((x) => x.daysLeft !== null && x.daysLeft <= transit + 14 && x.send > 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 8)

  // --- Tahsilat ---
  const recv = new Map<string, Digest['receivables'][number]>()
  const addRecv = (partyId: string | null, name: string | null, amount: number, due: string | null) => {
    const p = partyId ? party.get(partyId) : undefined
    const key = partyId ?? (name ?? 'Adı yazılmamış').trim().toLocaleLowerCase('tr')
    const cur = recv.get(key) ?? { party: p?.name ?? name ?? 'Adı yazılmamış', partyId, phone: p?.phone ?? null, amount: 0, due: null, late: 0 }
    cur.amount += amount
    if (due && (!cur.due || due < cur.due)) cur.due = due
    cur.late = cur.due && cur.due < t ? dayDiff(cur.due, t) : 0
    recv.set(key, cur)
  }
  pendingSales.forEach((s) => addRecv(s.party_id, s.customer, (s.sale_items ?? []).reduce((a: number, l: any) => a + Number(l.qty) * Number(l.unit_price), 0), s.due_date))
  pendingTx.forEach((x) => addRecv(x.party_id, x.counterparty, Number(x.amount), x.due_date))
  const receivables = [...recv.values()].filter((r) => r.amount > 0).sort((a, b) => b.late - a.late || b.amount - a.amount)
  const soon = ist(now + 3 * DAY)

  // --- Reklam: son 7 günde 500 TL+ harcayıp hiç dönüşüm getirmeyen kampanyalar ---
  const camp = new Map<string, { platform: string; campaign: string; spend: number; conv: number }>()
  ads.forEach((r) => {
    const k = `${r.platform}:${r.campaign_id}`
    const c = camp.get(k) ?? { platform: r.platform, campaign: r.campaign_name ?? r.campaign_id, spend: 0, conv: 0 }
    c.spend += Number(r.spend)
    c.conv += Number(r.conversions ?? 0)
    camp.set(k, c)
  })
  const adWaste = [...camp.values()].filter((c) => c.spend >= 500 && c.conv === 0).sort((a, b) => b.spend - a.spend).slice(0, 5)

  // --- Senkron hataları: her kanalın en son çalışması hatalıysa ---
  const latest = new Map<string, any>()
  ;(runs.data ?? []).forEach((r: any) => !latest.has(r.channel) && latest.set(r.channel, r))
  const errors = [...latest.values()].filter((r) => r.status === 'hata').map((r) => ({ channel: SYNC[r.channel] ?? r.channel, message: String(r.message ?? '').slice(0, 140) }))

  return {
    date: t,
    sales: {
      yesterday: yl.reduce((a, l) => a + Number(l.revenue), 0),
      orders: new Set(yl.map((l) => l.sale_id)).size,
      units: yl.reduce((a, l) => a + Number(l.qty), 0),
      byChannel: [...byCh.entries()].map(([channel, c]) => ({ channel: CH[channel] ?? channel, revenue: c.revenue, orders: c.orders.size })).sort((a, b) => b.revenue - a.revenue),
      mtd,
      prevMtd,
      month,
    },
    stock: stockOut,
    fba,
    receivables: receivables.filter((r) => r.late > 0 || (r.due && r.due <= soon)).slice(0, 10),
    receivableTotal: receivables.reduce((a, r) => a + r.amount, 0),
    overdueTotal: receivables.filter((r) => r.late > 0).reduce((a, r) => a + r.amount, 0),
    calls: notes
      .map((x) => ({ party: party.get(x.party_id)?.name ?? '—', partyId: x.party_id, phone: party.get(x.party_id)?.phone ?? null, note: String(x.body).slice(0, 80), date: x.next_date }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8),
    newLeads: leads.map((l) => ({ name: l.company || l.name, created: String(l.created_at).slice(0, 10) })).slice(0, 8),
    ads: adWaste.map((c) => ({ platform: c.platform, campaign: c.campaign, spend: c.spend })),
    errors,
  }
}

// ---------------------------------------------------------------------------
// Metinler
// ---------------------------------------------------------------------------

const PLAT: Record<string, string> = { meta: 'Meta', google: 'Google', amazon_ads: 'Amazon' }

/** Tam metin (WhatsApp biçimi: *kalın*). Panel önizlemesi, "WhatsApp'ta paylaş" ve 24 saatlik pencerede serbest mesaj için. */
export function digestText(d: Digest, panelUrl = 'https://omytic.com/admin') {
  const L: string[] = []
  L.push(`*OMY sabah özeti · ${dTR(d.date)}*`)
  L.push('')
  const s = d.sales
  L.push(`🛒 *Dün:* ${s.orders ? `${tl(s.yesterday)} · ${n(s.orders)} sipariş · ${n(s.units)} adet` : 'satış yok'}`)
  if (s.byChannel.length > 1) L.push(`   ${s.byChannel.map((c) => `${c.channel} ${tl(c.revenue)}`).join(' · ')}`)
  const delta = s.prevMtd > 0 ? Math.round((s.mtd / s.prevMtd - 1) * 100) : null
  L.push(`📈 *Bu ay:* ${tl(s.mtd)}${delta === null ? '' : ` (geçen ayın aynı dönemine göre %${Math.abs(delta)} ${delta >= 0 ? 'fazla' : 'az'})`}`)

  if (d.stock.length) {
    L.push('')
    L.push('📦 *Sipariş verilmesi gerekenler*')
    d.stock.forEach((x) => L.push(`• ${x.item}: ${x.daysLeft <= 0 ? 'bitti' : `${n(x.daysLeft)} gün yeter (${dTR(x.runOut)})`} → ${n(x.suggest)} ${x.unit} sipariş`))
  }
  if (d.fba.length) {
    L.push('')
    L.push("🚚 *Amazon'a gönderilecekler*")
    d.fba.forEach((x) => L.push(`• ${x.item}: FBA'da ${x.daysLeft === null ? '?' : n(x.daysLeft)} gün kaldı → ${n(x.send)} adet gönder${x.short ? ` (depoda ${n(x.depo)} var)` : ''}`))
  }
  if (d.receivables.length || d.overdueTotal > 0) {
    L.push('')
    L.push(`💰 *Tahsilat* · bekleyen ${tl(d.receivableTotal)}${d.overdueTotal > 0 ? `, vadesi geçen ${tl(d.overdueTotal)}` : ''}`)
    d.receivables.forEach((r) => L.push(`• ${r.party}: ${tl(r.amount)} ${r.late > 0 ? `· ${n(r.late)} gün gecikti` : r.due ? `· vade ${dTR(r.due)}` : ''}`))
  }
  if (d.calls.length || d.newLeads.length) {
    L.push('')
    L.push('📞 *Aranacaklar*')
    d.calls.forEach((c) => L.push(`• ${c.party}: ${c.note}`))
    if (d.newLeads.length) L.push(`• ${n(d.newLeads.length)} yeni talep cevap bekliyor: ${d.newLeads.slice(0, 4).map((l) => l.name).join(', ')}`)
  }
  if (d.ads.length) {
    L.push('')
    L.push('📣 *Satış getirmeyen reklamlar (7 gün)*')
    d.ads.forEach((a) => L.push(`• ${PLAT[a.platform] ?? a.platform} · ${a.campaign}: ${tl(a.spend)} harcandı, satış yok`))
  }
  if (d.errors.length) {
    L.push('')
    L.push('⚠️ *Bağlantı hatası*')
    d.errors.forEach((e) => L.push(`• ${e.channel}: ${e.message}`))
  }
  if (!d.stock.length && !d.fba.length && !d.receivables.length && !d.calls.length && !d.newLeads.length && !d.ads.length && !d.errors.length) {
    L.push('')
    L.push('✅ Bugün acil bir iş yok.')
  }
  L.push('')
  L.push(`Ayrıntılar: ${panelUrl}`)
  return L.join('\n')
}

/**
 * WhatsApp şablon değişkenleri. Meta, şablon değişkenlerinde satır sonuna izin vermez;
 * her bölüm tek satır olarak gider. Şablon: {{1}} tarih, {{2}} satış, {{3}} stok, {{4}} tahsilat, {{5}} diğer.
 */
export function digestParams(d: Digest): string[] {
  const clip = (s: string, max = 300) => (s.length > max ? s.slice(0, max - 1) + '…' : s).replace(/\s+/g, ' ').trim() || '—'
  const s = d.sales
  const delta = s.prevMtd > 0 ? Math.round((s.mtd / s.prevMtd - 1) * 100) : null
  const sales = `${s.orders ? `dün ${tl(s.yesterday)}, ${n(s.orders)} sipariş` : 'dün satış yok'}; bu ay ${tl(s.mtd)}${delta === null ? '' : ` (%${Math.abs(delta)} ${delta >= 0 ? '↑' : '↓'})`}`
  const stock = [
    d.stock.length ? `sipariş ver: ${d.stock.slice(0, 3).map((x) => `${x.item} (${n(Math.max(0, x.daysLeft))} gün)`).join(', ')}${d.stock.length > 3 ? ` +${d.stock.length - 3}` : ''}` : '',
    d.fba.length ? `Amazon'a gönder: ${d.fba.slice(0, 3).map((x) => `${x.item} ${n(x.send)} ad.`).join(', ')}${d.fba.length > 3 ? ` +${d.fba.length - 3}` : ''}` : '',
  ].filter(Boolean).join(' | ') || 'sorun yok'
  const money = d.receivableTotal > 0 ? `bekleyen ${tl(d.receivableTotal)}${d.overdueTotal > 0 ? `, gecikmiş ${tl(d.overdueTotal)}: ${d.receivables.filter((r) => r.late > 0).slice(0, 3).map((r) => r.party).join(', ')}` : ''}` : 'bekleyen yok'
  const other = [
    d.calls.length ? `${n(d.calls.length)} arama` : '',
    d.newLeads.length ? `${n(d.newLeads.length)} yeni talep` : '',
    d.ads.length ? `${n(d.ads.length)} reklam satış getirmiyor` : '',
    d.errors.length ? `bağlantı hatası: ${d.errors.map((e) => e.channel).join(', ')}` : '',
  ].filter(Boolean).join(' · ') || 'yok'
  return [dTR(d.date), clip(sales), clip(stock), clip(money), clip(other)]
}

/** E-posta için basit HTML (metinden). */
export function digestHtml(d: Digest, panelUrl = 'https://omytic.com/admin') {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = esc(digestText(d, panelUrl))
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')
    .split('\n')
    .map((l) => (l ? `<div style="margin:2px 0">${l}</div>` : '<div style="height:10px"></div>'))
    .join('')
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#11131a;max-width:620px">${body}</div>`
}
