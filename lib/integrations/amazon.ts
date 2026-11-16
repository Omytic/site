import type { SupabaseClient } from '@supabase/supabase-js'
import { istanbulDate, sleep } from './server'
import { defaultFrom, importOrders, type NormOrder, type SaleStatus, type SyncResult } from './importer'

/*
 * Amazon (amazon.com.tr) sipariş senkronu — SP-API Orders v2026-01-01 searchOrders.
 *  - Erişim: LWA refresh token → access token (https://api.amazon.com/auth/o2/token)
 *  - Uç: GET {eu}/orders/2026-01-01/orders  (ürün satırları aynı yanıtta gelir)
 *  - Sınır: 0.0056 istek/sn, 20'lik ani hak. Bu yüzden zaman pencereleriyle ilerlenir;
 *    süre yetmezse `more: true` döner ve bir sonraki çalıştırma kaldığı yerden devam eder.
 *  - FBA (AMAZON) siparişleri Amazon FBA stoğundan, kendi kargonuz (MERCHANT) depodan düşer.
 *  - Komisyon bu API'de yok (Finance izni gerekir); Stok → Kanal maliyetleri'ndeki % ve adet başı ücretle hesaplanır.
 */

const TR_MARKETPLACE = 'A33AVAJ2PDY3EV'
const ENDPOINT = process.env.AMAZON_SP_ENDPOINT || 'https://sellingpartnerapi-eu.amazon.com'
const LWA_URL = process.env.AMAZON_LWA_URL || 'https://api.amazon.com/auth/o2/token'
const DAY = 86_400_000
const WINDOW = 7 * DAY

interface Money { amount?: string | number; currencyCode?: string }
interface AzItem {
  orderItemId: string
  quantityOrdered: number
  product?: { asin?: string; title?: string; sellerSku?: string; price?: { unitPrice?: Money } }
  proceeds?: { proceedsTotal?: Money; breakdowns?: { type?: string; subtotal?: Money }[] }
  promotion?: { breakdowns?: { promotionId?: string }[] }
}
interface AzOrder {
  orderId: string
  createdTime: string
  lastUpdatedTime: string
  salesChannel?: { channelName?: string; marketplaceId?: string }
  fulfillment?: { fulfillmentStatus?: string; fulfilledBy?: 'AMAZON' | 'MERCHANT' }
  orderItems?: AzItem[]
}

export function amazonConfigured() {
  return !!(process.env.AMAZON_SP_CLIENT_ID && process.env.AMAZON_SP_CLIENT_SECRET && process.env.AMAZON_SP_REFRESH_TOKEN)
}

async function accessToken() {
  const res = await fetch(LWA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.AMAZON_SP_REFRESH_TOKEN!,
      client_id: process.env.AMAZON_SP_CLIENT_ID!,
      client_secret: process.env.AMAZON_SP_CLIENT_SECRET!,
    }),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    const why = String(body.error_description || body.error || res.status)
    if (/invalid_client/i.test(why) || /client/i.test(why)) throw new Error(`Amazon anahtarı reddetti: Client ID / Client Secret hatalı ya da süresi dolmuş (${why}).`)
    if (/invalid_grant/i.test(why) || /refresh/i.test(why)) throw new Error(`Amazon refresh token geçersiz; Solution Provider Portal'dan yeniden oluşturun (${why}).`)
    throw new Error(`Amazon girişi başarısız: ${why}`)
  }
  return body.access_token as string
}

async function fetchWindow(token: string, from: number, to: number, deadline: number) {
  const out: AzOrder[] = []
  let next: string | undefined
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({
      marketplaceIds: TR_MARKETPLACE,
      lastUpdatedAfter: new Date(from).toISOString(),
      lastUpdatedBefore: new Date(to).toISOString(),
      fulfillmentStatuses: 'UNSHIPPED,PARTIALLY_SHIPPED,SHIPPED,CANCELLED',
      maxResultsPerPage: '100',
      // FULFILLMENT: iptal ve FBA/FBM bilgisi · PROCEEDS: tutar ve indirim · PROMOTION: kampanya kodları
      includedData: 'FULFILLMENT,PROCEEDS,PROMOTION',
    })
    if (next) q.set('paginationToken', next)
    const res = await fetch(`${ENDPOINT}/orders/2026-01-01/orders?${q}`, { headers: { 'x-amz-access-token': token, Accept: 'application/json' }, cache: 'no-store' })
    if (res.status === 429) {
      if (Date.now() + 10_000 > deadline) return null
      await sleep(5000)
      page--
      continue
    }
    if (res.status === 403) throw new Error('Amazon erişimi reddetti (403). Uygulamada "Inventory and Order Tracking" izni olmalı ve refresh token bu mağaza için oluşturulmuş olmalı.')
    if (!res.ok) throw new Error(`Amazon ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json()
    out.push(...((body.orders ?? []) as AzOrder[]))
    next = body.pagination?.nextToken
    if (!next) return out
    if (Date.now() > deadline) return null
  }
  return out
}

const statusOf = (o: AzOrder): SaleStatus => (o.fulfillment?.fulfillmentStatus === 'CANCELLED' ? 'iptal' : 'tamamlandi')
const money = (m?: Money) => Number(m?.amount ?? 0) || 0

export async function syncAmazon(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!amazonConfigured()) throw new Error('Amazon anahtarları tanımlı değil (AMAZON_SP_CLIENT_ID, AMAZON_SP_CLIENT_SECRET, AMAZON_SP_REFRESH_TOKEN).')
  const now = Date.now()
  const deadline = now + 45_000
  // Amazon son 2 dakikayı vermez
  const until = now - 3 * 60_000
  const from = await defaultFrom(db, 'amazon', now, opts.days)
  const token = await accessToken()

  const orders = new Map<string, AzOrder>()
  let reached = from
  let more = false
  for (let a = from; a < until; a += WINDOW) {
    const b = Math.min(until, a + WINDOW)
    const list = await fetchWindow(token, a, b, deadline)
    if (!list) {
      more = true
      break
    }
    list.forEach((o) => orders.set(o.orderId, o))
    reached = b
    if (Date.now() > deadline) {
      more = b < until
      break
    }
  }

  const norm: NormOrder[] = Array.from(orders.values())
    // Amazon dışı kanallar (MCF: başka sitedeki satışın FBA'dan gönderilmesi) o kanalın kendi satışı sayılır
    .filter((o) => (o.salesChannel?.channelName ?? 'AMAZON') === 'AMAZON')
    .map((o) => ({
      ref: o.orderId,
      orderNo: o.orderId,
      saleDate: istanbulDate(new Date(o.createdTime).getTime()),
      status: statusOf(o),
      lines: (o.orderItems ?? []).map((it) => {
        const qty = Number(it.quantityOrdered) || 0
        const list = money(it.product?.price?.unitPrice)
        const bd = it.proceeds?.breakdowns ?? []
        const itemTotal = bd.filter((b) => b.type === 'ITEM').reduce((a, b) => a + money(b.subtotal), 0)
        // Satıcı kampanyası (bizim karşıladığımız). Amazon'un kendi yaptığı indirim bize yansımaz, tutarı değiştirmez.
        const disc = Math.abs(bd.filter((b) => b.type === 'DISCOUNT').reduce((a, b) => a + money(b.subtotal), 0))
        const promos = (it.promotion?.breakdowns ?? []).map((p) => p.promotionId).filter(Boolean)
        const unitPrice = itemTotal > 0 && qty > 0 ? (itemTotal - disc) / qty : list
        return {
          codes: [it.product?.sellerSku, it.product?.asin],
          title: it.product?.title,
          qty,
          unitPrice,
          listPrice: itemTotal > 0 && qty > 0 ? itemTotal / qty : list || undefined,
          discount: disc,
          platformDiscount: 0,
          campaign: promos.length ? promos.join(', ') : undefined,
          location: o.fulfillment?.fulfilledBy === 'MERCHANT' ? ('depo' as const) : ('amazon' as const),
        }
      }),
    }))

  const result: SyncResult = { fetched: orders.size, imported: 0, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(reached).toISOString(), more }
  await importOrders(db, 'amazon', norm, result)
  return result
}
