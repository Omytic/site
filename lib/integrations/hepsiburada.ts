import type { SupabaseClient } from '@supabase/supabase-js'
import { istanbulDate, sleep } from './server'
import { defaultFrom, importOrders, type NormLine, type NormOrder, type SaleStatus, type SyncResult } from './importer'

/*
 * Hepsiburada sipariş senkronu — Sipariş Entegrasyonu (oms-external), developers.hepsiburada.com şemasına göre.
 *  - Kimlik: HTTP Basic (Mağaza ID : Servis anahtarı) + zorunlu User-Agent (Hepsiburada'nın verdiği geliştirici kullanıcı adı)
 *  - Siparişler birkaç listeden toplanır: ödemesi tamamlanan (paketlenecek), paketlenen, kargoya verilen, teslim edilen;
 *    her yeni sipariş numarası için "Siparişe ait detay" çekilir (fiyat, indirim, komisyon kalem kalem gelir).
 *  - İptal listesi: siparişin bütün kalemleri iptalse satış "iptal" olur.
 *  - Hepsiburada bu listelerde en fazla son 1 ayı verir; tarihli sorgular 24 saatlik pencerelerle yapılır.
 * Test ortamı: HEPSIBURADA_ENV=sit (oms-external-sit). Canlı: varsayılan.
 */

const DAY = 86_400_000
const BASE = process.env.HEPSIBURADA_OMS_URL || (process.env.HEPSIBURADA_ENV === 'sit' ? 'https://oms-external-sit.hepsiburada.com' : 'https://oms-external.hepsiburada.com')

export const hepsiburadaConfigured = () => !!(process.env.HEPSIBURADA_MERCHANT_ID && process.env.HEPSIBURADA_PASSWORD && process.env.HEPSIBURADA_USERNAME)

const mid = () => process.env.HEPSIBURADA_MERCHANT_ID!
function headers() {
  // Basic kullanıcı adı varsayılan olarak mağaza ID'si; Hepsiburada farklı bir kullanıcı verdiyse HEPSIBURADA_AUTH_USER ile değiştirilir
  const user = process.env.HEPSIBURADA_AUTH_USER || mid()
  return {
    Authorization: `Basic ${Buffer.from(`${user}:${process.env.HEPSIBURADA_PASSWORD}`).toString('base64')}`,
    'User-Agent': process.env.HEPSIBURADA_USERNAME!,
    Accept: 'application/json',
  }
}

/** Hepsiburada tarih biçimi: yyyy-MM-dd HH:mm (İstanbul saati) */
function hbDate(ms: number) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}

async function hb(path: string, query: Record<string, string | number | undefined> = {}, deadline = Date.now() + 30_000): Promise<any> {
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
  const url = `${BASE}${path}${q.toString() ? `?${q}` : ''}`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: headers(), cache: 'no-store' })
    if (res.status === 429 && attempt < 4 && Date.now() + 5_000 < deadline) {
      await sleep(Number(res.headers.get('X-RateLimit-Reset') ?? 2) * 1000 || 2000)
      continue
    }
    if (res.status === 401 || res.status === 403)
      throw new Error(`Hepsiburada erişimi reddetti (${res.status}). Mağaza ID, servis anahtarı ve geliştirici kullanıcı adını (User-Agent) kontrol edin; yeni yetkilendirmenin devreye girmesi 2 saati bulabilir.`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Hepsiburada ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
}

const money = (m: any) => Number(m?.amount ?? 0) || 0

/** Sayfalı listeden sipariş numaralarını toplar */
async function collect(path: string, query: Record<string, string | number | undefined>, limit: number, pick: (x: any) => string[], deadline: number) {
  const out = new Set<string>()
  for (let offset = 0; offset < 5000; offset += limit) {
    if (Date.now() > deadline) break
    const body = await hb(path, { ...query, offset, limit }, deadline)
    const items: any[] = Array.isArray(body) ? body : body?.items ?? []
    items.forEach((x) => pick(x).forEach((n) => n && out.add(String(n))))
    const total = Array.isArray(body) ? undefined : body?.totalCount
    if (items.length < limit || (total != null && offset + limit >= total)) break
  }
  return out
}

const statusOf = (statuses: string[]): SaleStatus => {
  if (statuses.length && statuses.every((s) => /cancel/i.test(s))) return 'iptal'
  if (statuses.some((s) => /refund|return|iade/i.test(s))) return 'iade'
  return 'tamamlandi'
}

export async function syncHepsiburada(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!hepsiburadaConfigured()) throw new Error('Hepsiburada anahtarları tanımlı değil (HEPSIBURADA_MERCHANT_ID, HEPSIBURADA_USERNAME, HEPSIBURADA_PASSWORD).')
  const now = Date.now()
  const deadline = now + 50_000
  // Hepsiburada listeleri en fazla son 30 günü verir
  const from = Math.max(await defaultFrom(db, 'hepsiburada', now, opts.days, 30), now - 29 * DAY)
  const m = mid()

  const numbers = new Set<string>()
  const add = (s: Set<string>) => s.forEach((n) => numbers.add(n))
  // 1) Ödemesi tamamlanmış, paketlenmeyi bekleyen
  add(await collect(`/orders/merchantid/${m}`, {}, 100, (x) => [x.orderNumber], deadline))
  // 2) Paketlenmiş (son 30 gün, saat cinsinden)
  add(await collect(`/packages/merchantid/${m}`, { timespan: Math.ceil((now - from) / 3_600_000) }, 10, (x) => (x.items ?? []).map((i: any) => i.orderNumber), deadline))
  // 3-4) Kargoya verilen ve teslim edilen: 24 saatlik pencereler
  for (let a = from; a < now; a += DAY) {
    if (Date.now() > deadline) break
    const range = { begindate: hbDate(a), enddate: hbDate(Math.min(now, a + DAY)) }
    for (const kind of ['shipped', 'delivered']) {
      add(await collect(`/packages/merchantid/${m}/${kind}`, range, 50, (x) => [x.OrderNumber ?? x.orderNumber, ...(x.OrderNumbers ?? x.orderNumbers ?? [])], deadline))
    }
  }
  // 5) İptaller: sipariş → iptal edilen kalem adedi
  const cancelled = new Map<string, number>()
  for (let a = from; a < now; a += DAY) {
    if (Date.now() > deadline) break
    for (let offset = 0; offset < 2000; offset += 50) {
      const body = await hb(`/orders/merchantid/${m}/cancelled`, { begindate: hbDate(a), enddate: hbDate(Math.min(now, a + DAY)), offset, limit: 50 }, deadline)
      const items: any[] = body?.items ?? []
      items.forEach((x) => cancelled.set(String(x.orderNumber), (cancelled.get(String(x.orderNumber)) ?? 0) + Number(x.quantity ?? 0)))
      if (items.length < 50) break
    }
  }
  cancelled.forEach((_, n) => numbers.add(n))

  // Zaten panelde olan ve durumu değişmeyecek siparişler için detay istenmez
  const list = Array.from(numbers)
  const known = new Map<string, string | null>()
  for (let i = 0; i < list.length; i += 200) {
    const { data } = await db.from('sales').select('external_ref,external_status').eq('channel', 'hepsiburada').in('external_ref', list.slice(i, i + 200))
    ;(data ?? []).forEach((s) => known.set(String(s.external_ref), s.external_status))
  }

  const orders: NormOrder[] = []
  let reached = now
  for (const no of list) {
    if (known.has(no) && !cancelled.has(no)) continue
    if (Date.now() > deadline) {
      reached = from
      break
    }
    const d = await hb(`/orders/merchantid/${m}/ordernumber/${encodeURIComponent(no)}`, {}, deadline)
    const items: any[] = d?.items ?? []
    if (!items.length) continue
    const totalQty = items.reduce((a, it) => a + Number(it.quantity ?? 0), 0)
    const status: SaleStatus = cancelled.has(no) && (cancelled.get(no) ?? 0) >= totalQty ? 'iptal' : statusOf(items.map((it) => String(it.status ?? '')))
    const lines: NormLine[] = items
      .filter((it) => !/cancel/i.test(String(it.status ?? '')))
      .map((it) => {
        const qty = Number(it.quantity ?? 0) || 0
        const unit = money(it.unitPrice)
        const total = money(it.totalPrice) || unit * qty
        // Satıcı indirimi bizim cebimizden; Hepsiburada indirimi bize yansımaz
        const merchantDisc = Math.abs(money(it.merchantDiscount?.totalPrice ?? it.merchantDiscount?.totalDiscount ?? it.merchantDiscount))
        const hbDisc = Math.abs(money(it.hbDiscount?.totalPrice ?? it.hbDiscount?.totalDiscount ?? it.hbDiscount))
        const listUnit = qty ? (total + merchantDisc + hbDisc) / qty : unit
        const campaigns = (it.discountInfo ?? []).map((c: any) => c.campaignName).filter(Boolean)
        return {
          codes: [it.merchantSKU, it.productBarcode, it.barcode, it.sku],
          title: it.name,
          qty,
          unitPrice: qty ? (total + hbDisc) / qty : unit,
          listPrice: listUnit || undefined,
          discount: merchantDisc,
          platformDiscount: hbDisc,
          campaign: campaigns.length ? Array.from(new Set(campaigns)).join(', ') : undefined,
          location: 'depo' as const,
        }
      })
    const commission = items.reduce((a, it) => a + Math.abs(money(it.commission)), 0)
    const date = d.orderDate ?? d.createdDate ?? items[0]?.orderDate
    orders.push({
      ref: no,
      orderNo: no,
      saleDate: istanbulDate(date ? new Date(date).getTime() : now),
      status,
      commission: commission || undefined,
      lines,
    })
  }

  const result: SyncResult = { fetched: numbers.size, imported: 0, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(reached).toISOString(), more: reached < now }
  await importOrders(db, 'hepsiburada', orders, result, { deadline: now + 57_000 })
  return result
}
