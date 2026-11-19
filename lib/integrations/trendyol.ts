import type { SupabaseClient } from '@supabase/supabase-js'
import { istanbulDate, sleep } from './server'
import { defaultFrom, importOrders, type NormOrder, type SaleStatus, type SyncResult } from './importer'

export type { SyncResult }

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
  lineSellerDiscount?: number
  lineTyDiscount?: number
  discountDetails?: { lineItemPrice?: number; lineItemSellerDiscount?: number; lineItemTyDiscount?: number }[]
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

export const TRENDYOL_BASE = BASE

export function headers() {
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

const statusOf = (p: TyPackage): SaleStatus => {
  const s = (p.shipmentPackageStatus || p.status || '').toLowerCase()
  if (s.includes('cancel') || s.includes('unsupplied') || s.includes('unpacked')) return 'iptal'
  if (s.includes('return')) return 'iade'
  return 'tamamlandi'
}

export async function syncTrendyol(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!trendyolConfigured()) throw new Error('Trendyol anahtarları tanımlı değil (TRENDYOL_SELLER_ID, TRENDYOL_API_KEY, TRENDYOL_API_SECRET).')
  const now = Date.now()
  const deadline = now + 45_000
  const from = await defaultFrom(db, 'trendyol', now, opts.days)

  const packages = new Map<string, TyPackage>()
  for (let a = from; a < now; a += WINDOW) {
    const list = await fetchWindow(a, Math.min(now, a + WINDOW), deadline)
    list.forEach((p) => packages.set(String(p.shipmentPackageId), p))
  }

  const orders: NormOrder[] = Array.from(packages.entries()).map(([ref, p]) => ({
    ref,
    orderNo: String(p.orderNumber),
    saleDate: istanbulDate(p.orderDate),
    status: statusOf(p),
    commission: p.lines.reduce((a, l) => a + ((l.lineUnitPrice ?? 0) * l.quantity * (l.commission ?? 0)) / 100, 0),
    lines: p.lines.map((l) => tyLine(l)),
  }))
  const result: SyncResult = { fetched: packages.size, imported: 0, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(now).toISOString() }
  await importOrders(db, 'trendyol', orders, result)
  return result
}

/**
 * Trendyol satırı: lineGrossAmount indirimsiz birim fiyat; satıcı indirimi bizden, Trendyol indirimi Trendyol'dan çıkar.
 * Bize kalan = brüt − satıcı indirimi (Trendyol'un karşıladığı indirim hakedişe eklenir).
 */
function tyLine(l: TyLine) {
  const qty = Number(l.quantity) || 0
  const det = l.discountDetails ?? []
  const seller = det.length ? det.reduce((a, d) => a + Number(d.lineItemSellerDiscount ?? 0), 0) : Number(l.lineSellerDiscount ?? 0)
  const ty = det.length ? det.reduce((a, d) => a + Number(d.lineItemTyDiscount ?? 0), 0) : Number(l.lineTyDiscount ?? 0)
  const gross = l.lineGrossAmount != null ? Number(l.lineGrossAmount) : null
  const unitPrice = gross != null && qty > 0 ? gross - seller / qty : Number(l.lineUnitPrice ?? 0)
  return {
    codes: [l.barcode, l.stockCode],
    title: l.productName,
    qty,
    unitPrice,
    listPrice: gross ?? undefined,
    discount: seller,
    platformDiscount: ty,
    campaign: seller > 0 || ty > 0 ? 'Trendyol indirimi' : undefined,
    location: 'depo' as const,
  }
}
