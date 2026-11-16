import type { SupabaseClient } from '@supabase/supabase-js'

/*
 * Bütün pazaryerleri için ortak içe aktarma kuralları:
 *  - Aynı paket/sipariş iki kez eklenmez (sales.external_ref).
 *  - Panelde elle girilmiş aynı sipariş numarası varsa yeni satış açılmaz, o kayda bağlanır.
 *  - Durum yalnızca pazaryerinde değişince güncellenir (sales.external_status); elle düzenleme ezilmez.
 *  - Panelden silinen sipariş bir daha içe aktarılmaz (sync_ignored).
 *  - Ürün eşleşmezse satış atlanır, ürün kodu "Eşleşmeyen ürünler" listesine düşer.
 */

export type MarketChannel = 'trendyol' | 'hepsiburada' | 'amazon'
export type SaleStatus = 'tamamlandi' | 'iade' | 'iptal'

export interface NormLine {
  /** Eşleştirmede sırayla denenecek kodlar (barkod, SKU, ASIN…). İlki "eşleşmeyen" listesinde gösterilir. */
  codes: (string | null | undefined)[]
  title?: string
  qty: number
  /** Bize kalan birim fiyat (bizim indirimimiz düşülmüş, pazaryerinin karşıladığı indirim düşülmemiş) */
  unitPrice: number
  location: 'depo' | 'amazon'
  /** İndirimsiz birim liste fiyatı */
  listPrice?: number
  /** Satırdaki toplam indirim: bizim karşıladığımız */
  discount?: number
  /** Satırdaki toplam indirim: pazaryerinin karşıladığı (bize maliyeti yok) */
  platformDiscount?: number
  /** Kampanya / promosyon adı ya da kodu */
  campaign?: string
}
export interface NormOrder {
  ref: string
  orderNo: string
  saleDate: string
  status: SaleStatus
  commission?: number
  /** Satır bilgisi ayrı istekle geliyorsa (Amazon) sadece gerektiğinde yüklenir. */
  lines: NormLine[] | (() => Promise<NormLine[]>)
}

export interface SyncResult {
  fetched: number
  imported: number
  updated: number
  linked: number
  skipped: number
  unmatched: string[]
  from: string
  to: string
  /** Süre yetmediyse true: kalan siparişler bir sonraki çalıştırmada, `to` noktasından devam eder. */
  more?: boolean
}

const DAY = 86_400_000

/** Başlangıç noktası: son başarılı senkronun bittiği yerden 1 gün geri; ilk seferde ya da yeni eşleştirme varsa 60 gün. */
export async function defaultFrom(db: SupabaseClient, channel: MarketChannel, now: number, days?: number, maxDays = 90) {
  let from = now - Math.min(maxDays, days ?? 60) * DAY
  if (days) return from
  const { data: last } = await db.from('sync_runs').select('started_at,range_to').eq('channel', channel).eq('status', 'tamam').order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (last) {
    const { data: newer } = await db.from('channel_listings').select('id').eq('channel', channel).gt('created_at', last.started_at).limit(1)
    if (!newer?.length) from = Math.max(from, new Date(last.range_to ?? last.started_at).getTime() - DAY)
  }
  return from
}

export async function importOrders(db: SupabaseClient, channel: MarketChannel, orders: NormOrder[], result: SyncResult, opts: { deadline?: number; onProcessed?: (o: NormOrder) => void } = {}) {
  const label = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', amazon: 'Amazon' }[channel]

  const [{ data: listings }, { data: items }, { data: costs }] = await Promise.all([
    db.from('channel_listings').select('external_code,item_id,components').eq('channel', channel),
    db.from('items').select('id,sku,name,price'),
    db.from('channel_costs').select('model,commission_pct,fee_per_unit').eq('channel', channel),
  ])
  const nameOf = new Map<string, string>()
  ;(items ?? []).forEach((i) => nameOf.set(i.id, String(i.name).trim().toLocaleLowerCase('tr')))
  // Stok → Kanal maliyetleri: önce modele özel tanım, yoksa kanalın genel tanımı
  const costOf = (itemId: string) => {
    const n = nameOf.get(itemId)
    return (costs ?? []).find((c) => c.model && c.model.trim().toLocaleLowerCase('tr') === n) ?? (costs ?? []).find((c) => !c.model) ?? null
  }
  // Kod → ürün(ler). Paket ilanlarda (ör. "2'li SERYN") bir kod birden çok ürün/adede açılır.
  type Part = { item_id: string; qty: number }
  const priceOf = new Map<string, number>()
  ;(items ?? []).forEach((i) => priceOf.set(i.id, Number(i.price ?? 0)))
  const map = new Map<string, Part[]>()
  ;(items ?? []).forEach((i) => i.sku && map.set(i.sku.trim().toLowerCase(), [{ item_id: i.id, qty: 1 }]))
  ;(listings ?? []).forEach((l) => {
    const comps = Array.isArray(l.components) ? (l.components as Part[]).filter((c) => c?.item_id && Number(c.qty) > 0) : []
    map.set(l.external_code.trim().toLowerCase(), comps.length ? comps.map((c) => ({ item_id: c.item_id, qty: Number(c.qty) })) : [{ item_id: l.item_id, qty: 1 }])
  })
  const resolve = (l: NormLine) => {
    for (const c of l.codes) {
      const hit = c && map.get(c.trim().toLowerCase())
      if (hit) return hit
    }
    return null
  }
  /** Bir pazaryeri satırını panel satırlarına açar; tutar ve indirimler ürünlerin liste fiyatına göre paylaştırılır. */
  const expand = (l: NormLine, parts: Part[]) => {
    if (parts.length === 1 && parts[0].qty === 1) {
      return [{ item: parts[0].item_id, qty: l.qty, unitPrice: l.unitPrice, listPrice: l.listPrice ?? null, discount: l.discount ?? 0, platformDiscount: l.platformDiscount ?? 0 }]
    }
    const weights = parts.map((p) => Math.max(0.01, priceOf.get(p.item_id) || 1) * p.qty)
    const wsum = weights.reduce((a, b) => a + b, 0)
    return parts.map((p, i) => {
      const share = weights[i] / wsum
      const qty = l.qty * p.qty
      return {
        item: p.item_id,
        qty,
        unitPrice: (l.unitPrice * l.qty * share) / qty,
        listPrice: l.listPrice != null ? (l.listPrice * l.qty * share) / qty : null,
        discount: (l.discount ?? 0) * share,
        platformDiscount: (l.platformDiscount ?? 0) * share,
      }
    })
  }

  const refs = orders.map((o) => o.ref)
  const orderNos = Array.from(new Set(orders.map((o) => o.orderNo.trim())))
  const existing = new Map<string, { id: string; status: string; external_status: string | null }>()
  const manual = new Map<string, { id: string; external_ref: string | null }>()
  const ignored = new Set<string>()
  for (let i = 0; i < refs.length; i += 200) {
    const chunk = refs.slice(i, i + 200)
    const [{ data: a, error: e1 }, { data: b, error: e2 }] = await Promise.all([
      db.from('sales').select('id,status,external_status,external_ref').eq('channel', channel).in('external_ref', chunk),
      db.from('sync_ignored').select('external_ref').eq('channel', channel).in('external_ref', chunk),
    ])
    if (e1 || e2) throw new Error((e1 ?? e2)!.message)
    ;(a ?? []).forEach((s) => existing.set(s.external_ref as string, s))
    ;(b ?? []).forEach((r) => ignored.add(r.external_ref as string))
  }
  for (let i = 0; i < orderNos.length; i += 200) {
    // created_by dolu = bir panel kullanıcısı elle girmiş
    const { data, error } = await db.from('sales').select('id,order_no,external_ref').eq('channel', channel).not('created_by', 'is', null).in('order_no', orderNos.slice(i, i + 200))
    if (error) throw new Error(error.message)
    ;(data ?? []).forEach((s) => manual.set(String(s.order_no).trim(), s))
  }

  const unmatched = new Map<string, { title: string; order: string }>()
  for (const o of orders) {
    if (opts.deadline && Date.now() > opts.deadline) {
      result.more = true
      break
    }
    await processOne(o)
    opts.onProcessed?.(o)
  }

  async function processOne(o: NormOrder) {
    if (ignored.has(o.ref)) {
      result.skipped++
      return
    }
    const prev = existing.get(o.ref)
    if (prev) {
      // Durum sadece pazaryerinde değiştiyse güncellenir; panelde elle yapılan değişiklik ezilmez.
      if (prev.external_status !== o.status) {
        const patch = prev.external_status === null ? { external_status: o.status } : { status: o.status, external_status: o.status }
        const { error } = await db.from('sales').update(patch).eq('id', prev.id)
        if (error) throw new Error(error.message)
        if ('status' in patch && prev.status !== o.status) result.updated++
        prev.external_status = o.status
      }
      return
    }
    const hand = manual.get(o.orderNo.trim())
    if (hand) {
      // Aynı sipariş panelde elle girilmiş: ikinci kez eklenmez, elle girilen kayıt bu pakete bağlanır.
      if (!hand.external_ref) {
        const { error } = await db.from('sales').update({ external_ref: o.ref, external_status: o.status }).eq('id', hand.id)
        if (error) throw new Error(error.message)
        hand.external_ref = o.ref
        result.linked++
      } else {
        result.skipped++
      }
      return
    }
    if (o.status === 'iptal') {
      result.skipped++
      return
    }
    const raw = typeof o.lines === 'function' ? await o.lines() : o.lines
    const matched = raw.filter((l) => l.qty > 0).map((l) => ({ l, parts: resolve(l) }))
    const missing = matched.filter((x) => !x.parts)
    if (!matched.length || missing.length) {
      missing.forEach(({ l }) => unmatched.set(l.codes.find(Boolean) || '?', { title: l.title ?? '', order: o.orderNo }))
      result.skipped++
      return
    }
    const lines = matched.flatMap(({ l, parts }) => expand(l, parts!).map((x) => ({ l, ...x })))
    // Pazaryeri komisyonu vermiyorsa (Amazon) kanal maliyetindeki %; kargo / FBA ücreti adet başı tanımdan
    // Komisyon faturası KDV dahil yazılır: pazaryerleri oranı KDV hariç verir, faturaya %20 KDV eklenir
    let commission = (o.commission ?? 0) * 1.2
    let shipping = 0
    if (!(commission > 0)) commission = lines.reduce((a, x) => a + (x.qty * x.unitPrice * Number(costOf(x.item)?.commission_pct ?? 0) * 1.2) / 100, 0)
    // Kargo / FBA ücreti pazaryeri satırı (paket) başına
    shipping = matched.reduce((a, { l, parts }) => a + l.qty * Number(costOf(parts![0].item_id)?.fee_per_unit ?? 0), 0)
    const { data: sale, error } = await db
      .from('sales')
      .insert({
        channel,
        sale_date: o.saleDate,
        order_no: o.orderNo,
        external_ref: o.ref,
        external_status: o.status,
        status: o.status,
        commission: Math.round(commission * 100) / 100,
        shipping_cost: Math.round(shipping * 100) / 100,
        note: `${label} senkronu`,
      })
      .select('id')
      .single()
    if (error) {
      if (error.message.includes('duplicate')) return
      throw new Error(error.message)
    }
    const { error: e2 } = await db.from('sale_items').insert(
      lines.map((x) => ({
        sale_id: sale.id,
        item_id: x.item,
        qty: x.qty,
        unit_price: Math.round(x.unitPrice * 100) / 100,
        location_id: x.l.location,
        list_price: x.listPrice != null ? Math.round(x.listPrice * 100) / 100 : null,
        discount: Math.round(x.discount * 100) / 100,
        platform_discount: Math.round(x.platformDiscount * 100) / 100,
        campaign: x.l.campaign ?? null,
      })),
    )
    if (e2) {
      // Yarım kalan kaydı geri al; silme tetikleyicisinin "bir daha alma" işaretini de kaldır.
      await db.from('sales').delete().eq('id', sale.id)
      await db.from('sync_ignored').delete().eq('channel', channel).eq('external_ref', o.ref)
      throw new Error(e2.message)
    }
    result.imported++
  }

  if (unmatched.size) {
    const rows = Array.from(unmatched.entries()).map(([code, v]) => ({ channel, external_code: code, title: v.title, sample_order: v.order, last_seen: new Date().toISOString() }))
    await db.from('sync_unmatched').upsert(rows, { onConflict: 'channel,external_code' })
    result.unmatched = rows.map((r) => r.external_code)
  }
}
