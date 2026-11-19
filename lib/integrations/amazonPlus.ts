import { gunzipSync } from 'zlib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { accessToken, amazonConfigured, ENDPOINT, TR_MARKETPLACE } from './amazon'
import { istanbulDate, sleep } from './server'
import type { SyncResult } from './importer'

/*
 * Amazon'dan siparişin dışında kalan her şey (SP-API):
 *  - FBA stoğu        → GET /fba/inventory/v1/summaries                 (izin: Amazon Fulfillment)
 *  - Gerçek ücretler  → GET /finances/2024-06-19/transactions            (izin: Finance and Accounting)
 *  - Trafik/dönüşüm   → Reports API, GET_SALES_AND_TRAFFIC_REPORT        (izin: Brand Analytics / Selling Partner Insights)
 * Her biri kendi sync_runs kaydını tutar; Entegrasyonlar sayfasında ayrı satır olarak görünür.
 */

const DAY = 86_400_000

const emptyResult = (from: number, to: number): SyncResult => ({ fetched: 0, imported: 0, updated: 0, linked: 0, skipped: 0, unmatched: [], from: new Date(from).toISOString(), to: new Date(to).toISOString() })

/** İzin eksikse hangi rolü eklemek gerektiğini söyleyen istek yardımcısı. 429'da bekleyip tekrar dener. */
async function sp(path: string, query: Record<string, string | undefined>, role: string, deadline: number, init: RequestInit = {}) {
  const token = await accessToken()
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][])
  const url = `${ENDPOINT}${path}${q.toString() ? `?${q}` : ''}`
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'x-amz-access-token': token, Accept: 'application/json', 'Content-Type': 'application/json', ...(init.headers ?? {}) }, cache: 'no-store' })
    if (res.status === 429) {
      if (attempt > 6 || Date.now() + 8_000 > deadline) return null
      await sleep(Math.min(8_000, 1_500 * 2 ** attempt))
      continue
    }
    if (res.status === 403) throw new Error(`Amazon bu bilgiyi vermedi (403). Uygulamada "${role}" izni açık olmalı; izni ekledikten sonra uygulamayı yeniden yetkilendirip yeni refresh token'ı Vercel'e yazın.`)
    if (!res.ok) throw Object.assign(new Error(`Amazon ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status })
    return res.json()
  }
}

/** Amazon ürün kodu (SKU / ASIN) → panel ürünleri. Paket ilanlar birden çok ürüne açılır. */
async function codeMap(db: SupabaseClient) {
  const [{ data: listings }, { data: items }] = await Promise.all([
    db.from('channel_listings').select('external_code,item_id,components').eq('channel', 'amazon'),
    db.from('items').select('id,sku'),
  ])
  const map = new Map<string, { item_id: string; qty: number }[]>()
  ;(items ?? []).forEach((i) => i.sku && map.set(String(i.sku).trim().toLowerCase(), [{ item_id: i.id, qty: 1 }]))
  ;(listings ?? []).forEach((l) => {
    const comps = Array.isArray(l.components) ? (l.components as { item_id: string; qty: number }[]).filter((c) => c?.item_id && Number(c.qty) > 0) : []
    map.set(String(l.external_code).trim().toLowerCase(), comps.length ? comps.map((c) => ({ item_id: c.item_id, qty: Number(c.qty) })) : [{ item_id: l.item_id, qty: 1 }])
  })
  return (...codes: (string | undefined | null)[]) => {
    for (const c of codes) {
      const hit = c && map.get(c.trim().toLowerCase())
      if (hit) return hit
    }
    return null
  }
}

/* ------------------------------------------------------------------ */
/* 1) FBA stoğu                                                        */
/* ------------------------------------------------------------------ */

interface InvSummary {
  asin?: string
  fnSku?: string
  sellerSku?: string
  productName?: string
  totalQuantity?: number
  lastUpdatedTime?: string
  inventoryDetails?: {
    fulfillableQuantity?: number
    inboundWorkingQuantity?: number
    inboundShippedQuantity?: number
    inboundReceivingQuantity?: number
    reservedQuantity?: { totalReservedQuantity?: number; pendingCustomerOrderQuantity?: number }
    researchingQuantity?: { totalResearchingQuantity?: number }
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number }
  }
}

export async function syncAmazonInventory(db: SupabaseClient): Promise<SyncResult> {
  if (!amazonConfigured()) throw new Error('Amazon anahtarları tanımlı değil.')
  const started = Date.now()
  const deadline = started + 45_000
  const resolve = await codeMap(db)
  const rows: Record<string, unknown>[] = []
  let next: string | undefined
  for (let page = 0; page < 200; page++) {
    const body = await sp(
      '/fba/inventory/v1/summaries',
      { details: 'true', granularityType: 'Marketplace', granularityId: TR_MARKETPLACE, marketplaceIds: TR_MARKETPLACE, nextToken: next },
      'Amazon Fulfillment',
      deadline,
    )
    if (!body) throw new Error('Amazon çok yoğun (429); stok biraz sonra tekrar denenecek.')
    for (const s of (body.payload?.inventorySummaries ?? []) as InvSummary[]) {
      if (!s.sellerSku) continue
      const d = s.inventoryDetails ?? {}
      const reservedTotal = Number(d.reservedQuantity?.totalReservedQuantity ?? 0)
      const reservedCustomer = Number(d.reservedQuantity?.pendingCustomerOrderQuantity ?? 0)
      const parts = resolve(s.sellerSku, s.asin, s.fnSku)
      rows.push({
        marketplace_id: TR_MARKETPLACE,
        sku: s.sellerSku,
        asin: s.asin ?? null,
        fnsku: s.fnSku ?? null,
        name: s.productName ?? null,
        item_id: parts?.length === 1 && parts[0].qty === 1 ? parts[0].item_id : null,
        parts: parts ?? null,
        fulfillable: Number(d.fulfillableQuantity ?? 0),
        reserved_customer: reservedCustomer,
        reserved_other: Math.max(0, reservedTotal - reservedCustomer),
        inbound_working: Number(d.inboundWorkingQuantity ?? 0),
        inbound_shipped: Number(d.inboundShippedQuantity ?? 0),
        inbound_receiving: Number(d.inboundReceivingQuantity ?? 0),
        unfulfillable: Number(d.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0),
        researching: Number(d.researchingQuantity?.totalResearchingQuantity ?? 0),
        total: Number(s.totalQuantity ?? 0),
        // Amazon bazı ürünlerde tarihi boş metin gönderiyor
        amazon_updated_at: s.lastUpdatedTime || null,
        synced_at: new Date(started).toISOString(),
      })
    }
    next = body.pagination?.nextToken
    if (!next) break
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('amazon_inventory').upsert(rows.slice(i, i + 500), { onConflict: 'marketplace_id,sku' })
    if (error) throw new Error(error.message)
  }
  // Amazon'un artık listelemediği ürünler (stoğu tamamen bitmiş ve kaldırılmış) silinir
  await db.from('amazon_inventory').delete().eq('marketplace_id', TR_MARKETPLACE).lt('synced_at', new Date(started).toISOString())
  const r = emptyResult(started, Date.now())
  r.fetched = rows.length
  r.imported = rows.length
  // Bütün stoğu Amazon'a gönderilen markalarda (varsayılan FormStep) panelin "Amazon FBA" stoğu Amazon'un sayısına kendiliğinden eşitlenir.
  // Depo, ev vb. diğer yerlere dokunulmaz; onlar elle girilir.
  if (rows.length) r.updated = await autoAlign(db, rows)
  r.unmatched = rows.filter((x) => !x.parts).map((x) => String(x.sku))
  if (r.unmatched.length) {
    await db.from('sync_unmatched').upsert(
      rows.filter((x) => !x.parts).map((x) => ({ channel: 'amazon', external_code: String(x.sku), title: String(x.name ?? ''), sample_order: 'FBA stoğu', last_seen: new Date().toISOString() })),
      { onConflict: 'channel,external_code' },
    )
  }
  return r
}

/** AMAZON_AUTO_STOCK_BRANDS: virgülle markalar (varsayılan "formstep"); "yok" yazılırsa kapalı */
export const autoStockBrands = () => {
  const v = (process.env.AMAZON_AUTO_STOCK_BRANDS ?? 'formstep').trim().toLowerCase()
  return v === '' || v === 'yok' ? [] : v.split(',').map((x) => x.trim()).filter(Boolean)
}

async function autoAlign(db: SupabaseClient, rows: Record<string, unknown>[]) {
  const brands = autoStockBrands()
  if (!brands.length) return 0
  // Amazon'da satılabilir (müşteri siparişine ayrılanlar hariç: onlar panelde satışla zaten düştü)
  const az = new Map<string, number>()
  for (const r of rows) {
    for (const p of (r.parts as { item_id: string; qty: number }[] | null) ?? []) {
      az.set(p.item_id, (az.get(p.item_id) ?? 0) + (Number(r.fulfillable) + Number(r.reserved_other)) * Number(p.qty))
    }
  }
  if (!az.size) return 0
  const ids = Array.from(az.keys())
  const [{ data: items, error: e1 }, { data: levels, error: e2 }] = await Promise.all([
    db.from('items').select('id,brand').in('id', ids).in('brand', brands),
    db.from('stock_levels').select('item_id,qty').eq('location_id', 'amazon').in('item_id', ids),
  ])
  if (e1 || e2) throw new Error((e1 ?? e2)!.message)
  const panel = new Map((levels ?? []).map((l) => [l.item_id, Number(l.qty)]))
  const moves = (items ?? [])
    .map((i) => ({ item_id: i.id, diff: Math.round(((az.get(i.id) ?? 0) - (panel.get(i.id) ?? 0)) * 100) / 100 }))
    .filter((m) => m.diff !== 0)
    .map((m) => ({ item_id: m.item_id, location_id: 'amazon', qty: m.diff, kind: 'sayim', note: 'Amazon FBA stoğuna otomatik eşitlendi', created_by: null }))
  if (moves.length) {
    const { error } = await db.from('stock_movements').insert(moves)
    if (error) throw new Error(error.message)
  }
  return moves.length
}

/* ------------------------------------------------------------------ */
/* 2) Finans: gerçek komisyon, FBA ücreti, iadeler, depolama vb.      */
/* ------------------------------------------------------------------ */

interface Money { currencyAmount?: number | string; currencyCode?: string }
interface Breakdown { breakdownType?: string; breakdownAmount?: Money; breakdowns?: Breakdown[] }
interface FinTx {
  transactionId?: string
  transactionType?: string
  transactionStatus?: string
  description?: string
  postedDate?: string
  totalAmount?: Money
  relatedIdentifiers?: { relatedIdentifierName?: string; relatedIdentifierValue?: string }[]
  marketplaceDetails?: { marketplaceId?: string }
  breakdowns?: Breakdown[]
  items?: { breakdowns?: Breakdown[]; contexts?: { contextType?: string; sku?: string; asin?: string; quantityShipped?: number }[] }[]
}

const amt = (m?: Money) => Number(m?.currencyAmount ?? 0) || 0

/** Ücret dökümünü yapraklarına kadar gezip türlerine ayırır. Vergi (KDV) bağlı olduğu kalemin içinde sayılır. */
export function classify(tx: FinTx) {
  const out = { product: 0, commission: 0, fba: 0, other: 0 }
  const walk = (b: Breakdown, path: string[]) => {
    const p = [...path, b.breakdownType ?? '']
    if (b.breakdowns?.length) return b.breakdowns.forEach((c) => walk(c, p))
    const v = amt(b.breakdownAmount)
    if (!v) return
    const all = p.join('/')
    if (/ProductCharges|Principal|ItemPrice|Shipping(Charge|Price)|GiftWrap(Charge|Price)|Promotion/i.test(all) && !/Fee|Commission/i.test(all)) out.product += v
    else if (/FBA|Fulfil|PickPack|Weight|PerUnitFulfill/i.test(all)) out.fba += v
    else if (/Commission|Referral|ClosingFee|DigitalServices/i.test(all)) out.commission += v
    else if (/Fee|Amazon/i.test(all)) out.other += v
    else if (!/Tax|VAT|KDV/i.test(all)) out.other += v
    else out.product += v // müşteriden alınan vergi
  }
  const roots = tx.breakdowns?.length ? tx.breakdowns : (tx.items ?? []).flatMap((i) => i.breakdowns ?? [])
  roots.forEach((b) => walk(b, []))
  const r2 = (x: number) => Math.round(x * 100) / 100
  return { product: r2(out.product), commission: r2(out.commission), fba: r2(out.fba), other: r2(out.other) }
}

const orderIdOf = (tx: FinTx) => tx.relatedIdentifiers?.find((r) => r.relatedIdentifierName === 'ORDER_ID')?.relatedIdentifierValue ?? null

/** Siparişe bağlı olmayan, panelde gider/gelir olarak yazılmayacak hareketler: banka ödemesi, reklam faturası (Amazon Ads bağlantısından gelir) */
const skipLedger = (tx: FinTx) => /Transfer|Disburse|Payout|ProductAds|Advertis|Sponsored/i.test(`${tx.transactionType} ${tx.description}`)

export async function syncAmazonFinances(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!amazonConfigured()) throw new Error('Amazon anahtarları tanımlı değil.')
  const now = Date.now()
  const deadline = now + 45_000
  let from = now - Math.min(180, opts.days ?? 60) * DAY
  if (!opts.days) {
    const { data: last } = await db.from('sync_runs').select('range_to').eq('channel', 'amazon_finans').eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
    // Amazon ücretleri birkaç gün sonra işleyebilir: son senkronun 3 gün öncesinden tekrar bakılır (aynı kayıt iki kez yazılmaz)
    if (last?.range_to) from = Math.max(from, new Date(last.range_to).getTime() - 3 * DAY)
  }
  const until = now - 5 * 60_000
  const r = emptyResult(from, until)

  const txs: FinTx[] = []
  let next: string | undefined
  let complete = true
  for (let page = 0; page < 500; page++) {
    const body = await sp(
      '/finances/2024-06-19/transactions',
      { postedAfter: new Date(from).toISOString(), postedBefore: new Date(until).toISOString(), marketplaceId: TR_MARKETPLACE, nextToken: next },
      'Finance and Accounting',
      deadline,
    )
    if (!body) {
      complete = false
      break
    }
    txs.push(...((body.payload?.transactions ?? []) as FinTx[]))
    next = body.payload?.nextToken
    if (!next) break
    if (Date.now() > deadline) {
      complete = false
      break
    }
  }
  r.fetched = txs.length

  const rows = txs.map((tx) => {
    const c = classify(tx)
    const type = tx.transactionType ?? ''
    const id = tx.transactionId || `${type}|${tx.postedDate}|${orderIdOf(tx) ?? ''}|${amt(tx.totalAmount)}`
    return {
      id,
      posted_at: tx.postedDate || new Date().toISOString(),
      type,
      status: tx.transactionStatus ?? null,
      description: tx.description ?? null,
      order_id: orderIdOf(tx),
      marketplace_id: tx.marketplaceDetails?.marketplaceId ?? TR_MARKETPLACE,
      currency: tx.totalAmount?.currencyCode ?? 'TRY',
      total: Math.round(amt(tx.totalAmount) * 100) / 100,
      product_charges: /Refund/i.test(type) ? 0 : c.product,
      refund: /Refund/i.test(type) ? c.product : 0,
      commission: c.commission,
      fba_fees: c.fba,
      other_fees: c.other,
      raw: tx as unknown as Record<string, unknown>,
      synced_at: new Date().toISOString(),
    }
  })
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await db.from('amazon_transactions').upsert(rows.slice(i, i + 300), { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }
  r.imported = rows.length

  // a) Siparişlerin gerçek kesintisi: tahmini komisyon/kargo yerine Amazon'un kestiği tutar
  const orderIds = Array.from(new Set(rows.map((x) => x.order_id).filter(Boolean))) as string[]
  for (let i = 0; i < orderIds.length; i += 100) {
    const ids = orderIds.slice(i, i + 100)
    const [{ data: all }, { data: sales }] = await Promise.all([
      db.from('amazon_transactions').select('order_id,type,product_charges,refund,commission,fba_fees,other_fees').in('order_id', ids),
      db.from('sales').select('id,order_no,external_ref,status,commission,shipping_cost,fees_source,sale_items(qty,unit_price)').eq('channel', 'amazon').in('order_no', ids),
    ])
    for (const s of sales ?? []) {
      const mine = (all ?? []).filter((t) => t.order_id === s.order_no)
      if (!mine.length) continue
      const commission = Math.round(-mine.reduce((a, t) => a + Number(t.commission) + Number(t.other_fees), 0) * 100) / 100
      const fba = Math.round(-mine.reduce((a, t) => a + Number(t.fba_fees), 0) * 100) / 100
      const refunded = -mine.reduce((a, t) => a + Number(t.refund), 0)
      const gross = ((s.sale_items ?? []) as { qty: number; unit_price: number }[]).reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0)
      const patch: Record<string, unknown> = {}
      if (commission !== Number(s.commission)) patch.commission = Math.max(0, commission)
      // Kendi kargonuzla gönderdiğiniz siparişte FBA ücreti yoktur; panelde yazdığınız kargo bedeni korunur
      if (fba > 0 && fba !== Number(s.shipping_cost)) patch.shipping_cost = fba
      if (s.fees_source !== 'gercek') patch.fees_source = 'gercek'
      // Tamamı iade edildiyse satış "iade" olur (stok, iade hareketiyle geri döner)
      if (gross > 0 && refunded >= gross * 0.9 && s.status === 'tamamlandi') {
        patch.status = 'iade'
        patch.external_status = 'iade'
      }
      if (Object.keys(patch).length) {
        const { error } = await db.from('sales').update(patch).eq('id', s.id)
        if (error) throw new Error(error.message)
        r.updated++
      }
    }
  }

  // b) Siparişe bağlı olmayan ücretler (depolama, abonelik, uzun süreli depolama, tazminat…) → Finans'a gider/gelir
  const ledger = rows.filter((x) => !x.order_id && x.total !== 0 && !skipLedger(x.raw as FinTx))
  if (ledger.length) {
    const { error } = await db.from('transactions').upsert(
      ledger.map((x) => ({
        external_source: 'amazon',
        external_ref: x.id,
        tx_date: istanbulDate(new Date(x.posted_at).getTime()),
        direction: x.total < 0 ? 'gider' : 'gelir',
        category: x.total < 0 ? (/Storage|Depolama/i.test(`${x.description} ${x.type}`) ? 'kira' : 'komisyon') : 'diger_gelir',
        amount: Math.abs(x.total),
        brand: 'genel',
        channel: 'amazon',
        counterparty: 'Amazon',
        payment_status: 'odendi',
        note: `Amazon · ${x.description || x.type}`.slice(0, 300),
        created_by: null,
      })),
      { onConflict: 'external_source,external_ref' },
    )
    if (error) throw new Error(error.message)
  }
  r.skipped = rows.length - ledger.length - rows.filter((x) => x.order_id).length
  r.more = !complete
  if (!complete) r.to = new Date(Math.max(from, ...rows.map((x) => new Date(x.posted_at).getTime()))).toISOString()
  return r
}

/* ------------------------------------------------------------------ */
/* 3) Trafik ve dönüşüm (Sales & Traffic raporu, gün gün)             */
/* ------------------------------------------------------------------ */

const REPORT = 'GET_SALES_AND_TRAFFIC_REPORT'
const num = (v: unknown) => Number(v ?? 0) || 0
const amount = (v: { amount?: number } | undefined) => Number(v?.amount ?? 0) || 0

async function downloadReport(db: SupabaseClient, reportId: string, docId: string, deadline: number, dayStart: string) {
  const doc = await sp(`/reports/2021-06-30/documents/${encodeURIComponent(docId)}`, {}, 'Brand Analytics', deadline)
  if (!doc?.url) return false
  const res = await fetch(doc.url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Amazon rapor dosyası indirilemedi (${res.status})`)
  let buf = Buffer.from(await res.arrayBuffer())
  if (doc.compressionAlgorithm === 'GZIP') buf = gunzipSync(buf)
  const data = JSON.parse(buf.toString('utf8'))
  const byDate = (data.salesAndTrafficByDate ?? []) as any[]
  const byAsin = (data.salesAndTrafficByAsin ?? []) as any[]
  const daily = byDate.length
    ? byDate.map((d) => ({
        day: d.date,
        marketplace_id: TR_MARKETPLACE,
        sessions: num(d.trafficByDate?.sessions),
        page_views: num(d.trafficByDate?.pageViews),
        units: num(d.salesByDate?.unitsOrdered),
        order_items: num(d.salesByDate?.totalOrderItems),
        sales: amount(d.salesByDate?.orderedProductSales),
        units_refunded: num(d.salesByDate?.unitsRefunded),
        buy_box_pct: d.trafficByDate?.buyBoxPercentage ?? null,
        conversion_pct: d.trafficByDate?.unitSessionPercentage ?? null,
      }))
    : // O gün hiç ziyaret yoksa da "bakıldı" diye sıfır satır yazılır
      [{ day: dayStart, marketplace_id: TR_MARKETPLACE, sessions: 0, page_views: 0, units: 0, order_items: 0, sales: 0, units_refunded: 0, buy_box_pct: null, conversion_pct: null }]
  const { error } = await db.from('amazon_traffic_daily').upsert(daily, { onConflict: 'day,marketplace_id' })
  if (error) throw new Error(error.message)
  if (byAsin.length) {
    const rows = byAsin
      .filter((a) => a.childAsin || a.parentAsin)
      .map((a) => ({
        day: dayStart,
        marketplace_id: TR_MARKETPLACE,
        asin: a.childAsin ?? a.parentAsin,
        parent_asin: a.parentAsin ?? null,
        sku: a.sku ?? null,
        sessions: num(a.trafficByAsin?.sessions),
        page_views: num(a.trafficByAsin?.pageViews),
        units: num(a.salesByAsin?.unitsOrdered),
        sales: amount(a.salesByAsin?.orderedProductSales),
        buy_box_pct: a.trafficByAsin?.buyBoxPercentage ?? null,
        conversion_pct: a.trafficByAsin?.unitSessionPercentage ?? null,
      }))
    const { error: e2 } = await db.from('amazon_traffic_asin').upsert(rows, { onConflict: 'day,marketplace_id,asin' })
    if (e2) throw new Error(e2.message)
  }
  await db.from('amazon_reports').update({ status: 'DONE', done_at: new Date().toISOString() }).eq('report_id', reportId)
  return true
}

export async function syncAmazonTraffic(db: SupabaseClient, opts: { days?: number } = {}): Promise<SyncResult> {
  if (!amazonConfigured()) throw new Error('Amazon anahtarları tanımlı değil.')
  const now = Date.now()
  const deadline = now + 45_000
  const back = Math.min(60, opts.days ?? 30)
  const r = emptyResult(now - back * DAY, now)

  // a) Daha önce istenen raporlar hazır mı?
  const { data: pending } = await db.from('amazon_reports').select('report_id,data_start').eq('report_type', REPORT).in('status', ['IN_QUEUE', 'IN_PROGRESS']).order('requested_at').limit(20)
  for (const p of pending ?? []) {
    if (Date.now() > deadline) break
    let rep
    try {
      rep = await sp(`/reports/2021-06-30/reports/${encodeURIComponent(p.report_id)}`, {}, 'Brand Analytics', deadline)
    } catch (e: any) {
      // Amazon raporu bulamıyorsa (süresi geçmiş) bırakılır; o gün bir sonraki çalıştırmada yeniden istenir
      if (e?.status === 404 || e?.status === 400) {
        await db.from('amazon_reports').update({ status: 'FATAL', error: String(e.message).slice(0, 300), done_at: new Date().toISOString() }).eq('report_id', p.report_id)
        r.skipped++
        continue
      }
      throw e
    }
    if (!rep) break
    if (rep.processingStatus === 'DONE' && rep.reportDocumentId) {
      if (await downloadReport(db, p.report_id, rep.reportDocumentId, deadline, p.data_start)) r.imported++
    } else if (['FATAL', 'CANCELLED'].includes(rep.processingStatus)) {
      // CANCELLED: o gün için veri yok demek; sıfır yazılır ki tekrar istenmesin
      if (rep.processingStatus === 'CANCELLED')
        await db.from('amazon_traffic_daily').upsert({ day: p.data_start, marketplace_id: TR_MARKETPLACE }, { onConflict: 'day,marketplace_id' })
      await db.from('amazon_reports').update({ status: rep.processingStatus, done_at: new Date().toISOString() }).eq('report_id', p.report_id)
      r.skipped++
    } else {
      await db.from('amazon_reports').update({ status: rep.processingStatus }).eq('report_id', p.report_id)
    }
  }

  // b) Eksik günler için yeni rapor iste (Amazon trafik verisi 1-2 gün geriden gelir; her çalıştırmada en çok 15 gün)
  const days: string[] = []
  for (let d = back; d >= 2; d--) days.push(istanbulDate(now - d * DAY))
  const [{ data: have }, { data: asked }] = await Promise.all([
    db.from('amazon_traffic_daily').select('day').eq('marketplace_id', TR_MARKETPLACE).gte('day', days[0]),
    db.from('amazon_reports').select('data_start,status').eq('report_type', REPORT).gte('data_start', days[0]),
  ])
  const done = new Set((have ?? []).map((x) => x.day))
  const waiting = new Set((asked ?? []).filter((x) => !['FATAL'].includes(x.status)).map((x) => x.data_start))
  const missing = days.filter((d) => !done.has(d) && !waiting.has(d)).slice(-15)
  for (const d of missing) {
    if (Date.now() > deadline) break
    const body = await sp('/reports/2021-06-30/reports', {}, 'Brand Analytics', deadline, {
      method: 'POST',
      body: JSON.stringify({
        reportType: REPORT,
        marketplaceIds: [TR_MARKETPLACE],
        dataStartTime: `${d}T00:00:00+03:00`,
        dataEndTime: `${d}T23:59:59+03:00`,
        reportOptions: { dateGranularity: 'DAY', asinGranularity: 'CHILD' },
      }),
    })
    if (!body?.reportId) break
    await db.from('amazon_reports').insert({ report_id: body.reportId, report_type: REPORT, data_start: d, data_end: d })
    r.fetched++
  }
  r.more = missing.length > 0 || (pending ?? []).length > r.imported + r.skipped
  return r
}
