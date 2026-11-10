import type { SupabaseClient } from '@supabase/supabase-js'
import { istanbulDate, sleep } from './server'

/*
 * Trendyol sipariş senkronu.
 * Uç: GET {base}/integration/order/sellers/{sellerId}/orders/stream  (Basic auth: apiKey:apiSecret)
 * Kurallar (developers.trendyol.com): tarih aralığı en fazla 14 gün, en eski 3 ay,
 * sayfa en fazla 200, istekler arasında bekleme önerilir, User-Agent zorunlu.
 */

const BASE = process.env.TRENDYOL_BASE_URL || 'https://apigw.trendyol.com'
const DAY = 86_400_000
const WINDOW = 14 * DAY

interface TyLine {
  barcode?: string
  stockCode?: string
  productName?: string
  quantity: number
  lineUnitPrice?: number
  lineGrossAmount?: number
  commission?: number
}
interface TyPackage {
  shipmentPackageId: number | string
  orderNumber: string
  orderDate: number
  lastModifiedDate?: number
  status?: string
  shipmentPackageStatus?: string
  packageTotalPrice?: number
  lines: TyLine[]
}

export function trendyolConfigured() {
  return !!(process.env.TRENDYOL_SELLER_ID && process.env.TRENDYOL_API_KEY && process.env.TRENDYOL_API_SECRET)
}

function headers() {
  const id = process.env.TRENDYOL_SELLER_ID!
  const basic = Buffer.from(`${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`).toString('base64')
  return { Authorization: `Basic ${basic}`, 'User-Agent': `${id} - SelfIntegration`, Accept: 'application/json' }
}

async function fetchWindow(from: number, to: number, deadline: number) {
  const out: TyPackage[] = []
  let cursor: string | undefined
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ lastModifiedStartDate: String(from), lastModifiedEndDate: String(to), size: '200' })
    if (cursor) q.set('nextCursor', cursor)
    const res = await fetch(`${BASE}/integration/order/sellers/${process.env.TRENDYOL_SELLER_ID}/orders/stream?${q}`, { headers: headers(), cache: 'no-store' })
    if (res.status === 401) throw new Error('Trendyol API anahtarı ya da satıcı ID hatalı (401).')
    if (res.status === 403) throw new Error('Trendyol isteği reddetti (403). User-Agent ya da IP engeli olabilir.')
    if (res.status === 429) {
      await sleep(5000)
      page--
      continue
    }
    if (!res.ok) throw new Error(`Trendyol ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = await res.json()
    out.push(...((body.content ?? []) as TyPackage[]))
    if (!body.hasMore || !body.nextCursor) break
    cursor = body.nextCursor
    if (Date.now() > deadline) throw new Error('Süre doldu; kalan siparişler bir sonraki senkronda alınacak.')
    await sleep(1500)
  }
  return out
}

const statusOf = (p: TyPackage): 'tamamlandi' | 'iade' | 'iptal' => {
  const s = (p.shipmentPackageStatus || p.status || '').toLowerCase()
  if (s.includes('cancel') || s.includes('unsupplied') || s.includes('unpacked')) return 'iptal'
  if (s.includes('return')) return 'iade'
  return 'tamamlandi'
}

export interface SyncResult {
  fetched: number
  imported: number
  updated: number
  skipped: number
  unmatched: string[]
  from: string
  to: string
}

export async function syncTrendyol(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!trendyolConfigured()) throw new Error('Trendyol anahtarları tanımlı değil (TRENDYOL_SELLER_ID, TRENDYOL_API_KEY, TRENDYOL_API_SECRET).')
  const now = Date.now()
  const deadline = now + 45_000

  // Başlangıç: son başarılı senkrondan 1 gün öncesi; ilk seferde son 60 gün (en fazla 90).
  // Son senkrondan sonra yeni ürün eşleştirildiyse, o ürünün eski siparişleri de gelsin diye 60 güne geri gidilir.
  let from = now - Math.min(90, opts.days ?? 60) * DAY
  if (!opts.days) {
    const { data: last } = await db.from('sync_runs').select('started_at').eq('channel', 'trendyol').eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
    if (last) {
      const { data: newer } = await db.from('channel_listings').select('id').eq('channel', 'trendyol').gt('created_at', last.started_at).limit(1)
      if (!newer?.length) from = Math.max(from, new Date(last.started_at).getTime() - DAY)
    }
  }

  const packages = new Map<string, TyPackage>()
  for (let a = from; a < now; a += WINDOW) {
    const list = await fetchWindow(a, Math.min(now, a + WINDOW), deadline)
    list.forEach((p) => packages.set(String(p.shipmentPackageId), p))
  }

  // Eşleştirme tablosu + SKU'ya göre yedek eşleşme
  const [{ data: listings }, { data: items }] = await Promise.all([
    db.from('channel_listings').select('external_code,item_id').eq('channel', 'trendyol'),
    db.from('items').select('id,sku'),
  ])
  const map = new Map<string, string>()
  ;(items ?? []).forEach((i) => i.sku && map.set(i.sku.trim().toLowerCase(), i.id))
  ;(listings ?? []).forEach((l) => map.set(l.external_code.trim().toLowerCase(), l.item_id))
  const resolve = (l: TyLine) => (l.barcode && map.get(l.barcode.trim().toLowerCase())) || (l.stockCode && map.get(l.stockCode.trim().toLowerCase())) || null

  const refs = Array.from(packages.keys())
  const existing = new Map<string, { id: string; status: string; sale_date: string }>()
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await db.from('sales').select('id,status,sale_date,external_ref').eq('channel', 'trendyol').in('external_ref', refs.slice(i, i + 200))
    ;(data ?? []).forEach((s) => existing.set(s.external_ref as string, s))
  }

  const result: SyncResult = { fetched: packages.size, imported: 0, updated: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(now).toISOString() }
  const unmatched = new Map<string, { title: string; order: string }>()

  for (const [ref, p] of Array.from(packages.entries())) {
    const status = statusOf(p)
    const saleDate = istanbulDate(p.orderDate)
    const prev = existing.get(ref)
    if (prev) {
      if (prev.status !== status) {
        const { error } = await db.from('sales').update({ status }).eq('id', prev.id)
        if (error) throw new Error(error.message)
        result.updated++
      }
      continue
    }
    if (status === 'iptal') {
      result.skipped++
      continue
    }
    const lines = p.lines.map((l) => ({ l, item: resolve(l) }))
    const missing = lines.filter((x) => !x.item)
    if (missing.length) {
      missing.forEach(({ l }) => unmatched.set(l.barcode || l.stockCode || '?', { title: l.productName ?? '', order: p.orderNumber }))
      result.skipped++
      continue
    }
    const commission = lines.reduce((a, { l }) => a + ((l.lineUnitPrice ?? 0) * l.quantity * (l.commission ?? 0)) / 100, 0)
    const { data: sale, error } = await db
      .from('sales')
      .insert({ channel: 'trendyol', sale_date: saleDate, order_no: p.orderNumber, external_ref: ref, status, commission: Math.round(commission * 100) / 100, note: 'Trendyol senkronu' })
      .select('id')
      .single()
    if (error) {
      if (error.message.includes('duplicate')) continue
      throw new Error(error.message)
    }
    const { error: e2 } = await db.from('sale_items').insert(
      lines.map(({ l, item }) => ({ sale_id: sale.id, item_id: item, qty: l.quantity, unit_price: l.lineUnitPrice ?? l.lineGrossAmount ?? 0, location_id: 'depo' })),
    )
    if (e2) {
      await db.from('sales').delete().eq('id', sale.id)
      throw new Error(e2.message)
    }
    result.imported++
  }

  if (unmatched.size) {
    const rows = Array.from(unmatched.entries()).map(([code, v]) => ({ channel: 'trendyol', external_code: code, title: v.title, sample_order: v.order, last_seen: new Date().toISOString() }))
    await db.from('sync_unmatched').upsert(rows, { onConflict: 'channel,external_code' })
    result.unmatched = rows.map((r) => r.external_code)
  }
  return result
}
