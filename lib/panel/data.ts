'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import type { Brand, BrandOrGenel, Channel, LocationId, Unit } from './constants'
import { itemEconomics } from './economics'

// ---------------------------------------------------------------------------
// Tipler (veritabanı satırları)
// ---------------------------------------------------------------------------
export interface Profile { id: string; username: string; full_name: string; color: string }
export interface Item {
  id: string; sku: string | null; name: string; brand: Brand; variant: string | null; color?: string | null; unit: Unit
  vat_rate?: number; cost: number; price: number; min_stock: number; active: boolean; notes: string | null; created_at: string
}
export interface StockLevel { item_id: string; location_id: LocationId; qty: number }
export interface SaleItem { id?: string; item_id: string; qty: number; unit_price: number; unit_cost?: number | null; location_id?: LocationId }
export interface Sale {
  id: string; sale_date: string; channel: Channel; order_no: string | null; customer: string | null
  status: 'tamamlandi' | 'iade' | 'iptal'; commission: number; shipping_cost: number
  payment_status: 'odendi' | 'bekliyor'; due_date: string | null; note: string | null
  created_at: string; created_by: string | null; sale_items: SaleItem[]
  external_ref?: string | null; updated_at?: string; updated_by?: string | null
}
export interface PurchaseItem { id?: string; item_id: string; qty: number; unit_cost: number; location_id?: LocationId }
export interface Purchase {
  id: string; purchase_date: string; supplier: string | null; invoice_no: string | null; shipping_cost: number
  payment_status: 'odendi' | 'bekliyor'; due_date: string | null; note: string | null
  created_at: string; created_by: string | null; purchase_items: PurchaseItem[]
}
export interface ShipmentItem { id?: string; item_id: string; qty: number }
export interface Shipment {
  id: string; ship_date: string; reference: string | null; carrier: string | null
  status: 'hazirlaniyor' | 'yolda' | 'teslim_alindi' | 'iptal'; shipping_cost: number; received_date: string | null
  note: string | null; created_at: string; created_by: string | null; shipment_items: ShipmentItem[]
}
export interface Movement {
  id: string; item_id: string; location_id: LocationId; qty: number; kind: string
  sale_item_id: string | null; purchase_item_id: string | null; shipment_item_id: string | null
  moved_at: string; note: string | null; created_at: string; created_by: string | null
}
export interface LedgerRow {
  source: 'satis' | 'alim' | 'sevkiyat' | 'reklam' | 'manuel'; ref_id: string; tx_date: string
  direction: 'gelir' | 'gider'; category: string; amount: number; brand: BrandOrGenel; channel: string | null
  counterparty: string | null; payment_status: 'odendi' | 'bekliyor'; due_date: string | null; note: string | null
}
export interface Transaction {
  id: string; tx_date: string; direction: 'gelir' | 'gider'; category: string; amount: number; brand: BrandOrGenel
  channel: string | null; counterparty: string | null; payment_status: 'odendi' | 'bekliyor'; due_date: string | null
  note: string | null; created_at: string; created_by: string | null
}
export interface SaleLine {
  sale_id: string; sale_date: string; channel: Channel; status: string; item_id: string; brand: Brand
  name: string; variant: string | null; unit: Unit; qty: number; unit_price: number; unit_cost: number
  location_id: LocationId; revenue: number; cogs: number
}
export interface AdBudget { id: string; month: string; platform: string; brand: BrandOrGenel; budget: number; note: string | null }
export interface AdSpend { id: string; spend_date: string; platform: string; brand: BrandOrGenel; amount: number; campaign: string | null; note: string | null; created_by: string | null }
export interface Task {
  id: string; title: string; description: string | null; status: 'yapilacak' | 'devam' | 'bitti'
  priority: 'dusuk' | 'normal' | 'yuksek'; assignee: string | null; brand: BrandOrGenel | null; due_date: string | null
  completed_at: string | null; created_at: string; created_by: string | null
}
export interface Asset {
  id: string; kind: string; name: string; url: string | null; handle: string | null; brand: BrandOrGenel
  owner: string | null; followers: number | null; note: string | null; updated_at: string
}
export interface AssetMetric { id: string; asset_id: string; metric_date: string; followers: number }
export interface AuditRow {
  id: number; at: string; user_id: string | null; table_name: string; row_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'; old_data: Record<string, any> | null; new_data: Record<string, any> | null
}

// ---------------------------------------------------------------------------
// Basit önbellekli sorgu katmanı: aynı veri birden çok sayfada tekrar çekilmez,
// bir kayıt değişince ilgili anahtarlar geçersiz kılınır ve yeniden çekilir.
// ---------------------------------------------------------------------------
type Entry = { data?: unknown; error?: string; loading: boolean; promise?: Promise<void>; stamp: number }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
const fetchers = new Map<string, () => Promise<unknown>>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

async function run(key: string) {
  const fn = fetchers.get(key)
  if (!fn) return
  const prev = cache.get(key)
  cache.set(key, { ...prev, loading: true, stamp: prev?.stamp ?? 0 } as Entry)
  emit()
  try {
    const data = await fn()
    cache.set(key, { data, loading: false, stamp: Date.now() })
  } catch (e: any) {
    cache.set(key, { data: prev?.data, error: e?.message ?? 'Veri yüklenemedi', loading: false, stamp: Date.now() })
  }
  emit()
}

export function invalidate(...keys: string[]) {
  const targets = keys.length ? keys : Array.from(fetchers.keys())
  targets.forEach((k) => {
    if (fetchers.has(k)) run(k)
  })
}

export function useQuery<T>(key: string, fn: () => Promise<T>) {
  fetchers.set(key, fn)
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
    () => 0,
  )
  useEffect(() => {
    const e = cache.get(key)
    if (!e || (!e.loading && Date.now() - e.stamp > 60_000)) run(key)
  }, [key])
  const e = cache.get(key)
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: !e || (e.loading && e.data === undefined),
    refreshing: !!e?.loading,
    reload: () => run(key),
  }
}

// Sekmeye geri dönülünce (başka kardeş kayıt girmiş olabilir) tazele
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    const stale = Array.from(cache.entries()).filter(([, e]) => Date.now() - e.stamp > 30_000)
    stale.forEach(([k]) => run(k))
  })
}

const must = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return (data ?? []) as T
}

// Supabase satır limiti 1000; büyük tablolar sayfalanarak çekilir.
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const rows = await must<T[]>(build(from, from + 999))
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Hazır sorgular
// ---------------------------------------------------------------------------
export const Q = {
  profiles: () => useQuery('profiles', () => must<Profile[]>(supabase.from('profiles').select('id,username,full_name,color').order('username'))),
  items: () => useQuery('items', () => all<Item>((a, b) => supabase.from('items').select('*').order('brand').order('name').order('variant').range(a, b))),
  stock: () => useQuery('stock', () => all<StockLevel>((a, b) => supabase.from('stock_levels').select('*').range(a, b))),
  sales: () =>
    useQuery('sales', () =>
      all<Sale>((a, b) => supabase.from('sales').select('*, sale_items(*)').order('sale_date', { ascending: false }).order('created_at', { ascending: false }).range(a, b)),
    ),
  saleLines: () => useQuery('sale_lines', () => all<SaleLine>((a, b) => supabase.from('sale_lines').select('*').range(a, b))),
  purchases: () =>
    useQuery('purchases', () =>
      all<Purchase>((a, b) => supabase.from('purchases').select('*, purchase_items(*)').order('purchase_date', { ascending: false }).range(a, b)),
    ),
  shipments: () =>
    useQuery('shipments', () =>
      all<Shipment>((a, b) => supabase.from('shipments').select('*, shipment_items(*)').order('ship_date', { ascending: false }).range(a, b)),
    ),
  movements: () =>
    useQuery('movements', () => all<Movement>((a, b) => supabase.from('stock_movements').select('*').order('moved_at', { ascending: false }).order('created_at', { ascending: false }).range(a, b))),
  ledger: () => useQuery('ledger', () => all<LedgerRow>((a, b) => supabase.from('ledger').select('*').order('tx_date', { ascending: false }).range(a, b))),
  transactions: () => useQuery('transactions', () => all<Transaction>((a, b) => supabase.from('transactions').select('*').order('tx_date', { ascending: false }).range(a, b))),
  adBudgets: () => useQuery('ad_budgets', () => must<AdBudget[]>(supabase.from('ad_budgets').select('*').order('month', { ascending: false }))),
  adSpend: () => useQuery('ad_spend', () => all<AdSpend>((a, b) => supabase.from('ad_spend').select('*').order('spend_date', { ascending: false }).range(a, b))),
  tasks: () => useQuery('tasks', () => must<Task[]>(supabase.from('tasks').select('*').order('created_at', { ascending: false }))),
  assets: () => useQuery('assets', () => must<Asset[]>(supabase.from('assets').select('*').order('brand').order('name'))),
  assetMetrics: () => useQuery('asset_metrics', () => must<AssetMetric[]>(supabase.from('asset_metrics').select('*').order('metric_date'))),
  channelCosts: () => useQuery('channel_costs', () => must<ChannelCost[]>(supabase.from('channel_costs').select('*').order('channel'))),
  audit: (limit = 300) =>
    useQuery(`audit:${limit}`, () => must<AuditRow[]>(supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(limit))),
}

/** Bir kayıt değişince etkilenen her şey. */
export const AFTER = {
  sale: ['sales', 'sale_lines', 'stock', 'movements', 'ledger', 'items', 'audit:300', 'audit:40'],
  purchase: ['purchases', 'stock', 'movements', 'ledger', 'items', 'audit:300', 'audit:40'],
  shipment: ['shipments', 'stock', 'movements', 'ledger', 'audit:300', 'audit:40'],
  stock: ['stock', 'movements', 'audit:300', 'audit:40'],
  item: ['items', 'stock', 'audit:300', 'audit:40'],
  money: ['transactions', 'ledger', 'audit:300', 'audit:40'],
  ads: ['ad_budgets', 'ad_spend', 'ledger', 'audit:300', 'audit:40'],
  tasks: ['tasks', 'audit:300', 'audit:40'],
  assets: ['assets', 'asset_metrics', 'audit:300', 'audit:40'],
  costs: ['channel_costs', 'audit:300', 'audit:40'],
}

/** Supabase yazma işlemini çalıştırır, hata varsa Türkçe mesajla fırlatır. */
export async function write<T = unknown>(p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>) {
  const { data, error } = await p
  if (error) {
    const msg = error.message
    if (msg.includes('row-level security')) throw new Error('Bu işlem için yetkiniz yok. Çıkış yapıp tekrar girin.')
    if (msg.includes('violates foreign key') && msg.includes('restrict')) throw new Error('Bu ürün satış/alım kayıtlarında kullanıldığı için silinemez. Pasife alabilirsiniz.')
    if (msg.includes('foreign key')) throw new Error('Bu kayıt başka kayıtlarda kullanılıyor, silinemez.')
    if (msg.includes('duplicate key')) throw new Error('Aynı kayıt zaten var (ör. aynı SKU ya da aynı ay/platform bütçesi).')
    throw new Error(msg)
  }
  return data as T
}

export function useNow(intervalMs = 60_000) {
  const [n, setN] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return n
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) setV(JSON.parse(raw))
    } catch {}
  }, [key])
  const set = useCallback(
    (nv: T) => {
      setV(nv)
      try {
        localStorage.setItem(key, JSON.stringify(nv))
      } catch {}
    },
    [key],
  )
  return [v, set] as const
}

// ---------------------------------------------------------------------------
// Türetilmiş: ürün + stok birleşimi
// ---------------------------------------------------------------------------
export interface ItemWithStock extends Item {
  stock: Record<LocationId, number>
  total: number
  label: string
}
export function variantLabel(i: Pick<Item, 'variant' | 'color'>) {
  return [i.variant, i.color].filter(Boolean).join(' · ')
}
export function itemLabel(i: Pick<Item, 'name' | 'variant' | 'color'>) {
  const v = variantLabel(i)
  return v ? `${i.name} · ${v}` : i.name
}

// ---------------------------------------------------------------------------
// Model = aynı marka + aynı ürün adı (ör. FormStep M100). Varyantlar = numara / renk.
// ---------------------------------------------------------------------------
export interface Model<T extends ItemWithStock = ItemWithStock> {
  key: string
  name: string
  brand: Brand
  items: T[]
  stock: Record<LocationId, number>
  total: number
}
export const modelKey = (i: Pick<Item, 'brand' | 'name'>) => `${i.brand}|${i.name.trim().toLocaleLowerCase('tr')}`

/** Numaraları doğal sırayla dizer: 36-37 < 37-38 < … < 43-45; renk varsa önce renk. */
export function sortVariants<T extends Pick<Item, 'variant' | 'color'>>(list: T[]) {
  const n = (v: string | null) => {
    const m = (v ?? '').match(/\d+(?:[.,]\d+)?/)
    return m ? Number(m[0].replace(',', '.')) : Number.MAX_SAFE_INTEGER
  }
  return [...list].sort((a, b) => (a.color ?? '').localeCompare(b.color ?? '', 'tr') || n(a.variant) - n(b.variant) || (a.variant ?? '').localeCompare(b.variant ?? '', 'tr'))
}

export function groupModels<T extends ItemWithStock>(items: T[]): Model<T>[] {
  const map = new Map<string, Model<T>>()
  items.forEach((i) => {
    const k = modelKey(i)
    let m = map.get(k)
    if (!m) {
      m = { key: k, name: i.name, brand: i.brand, items: [], stock: { depo: 0, yolda: 0, amazon: 0 }, total: 0 }
      map.set(k, m)
    }
    m.items.push(i)
    m.stock.depo += i.stock.depo
    m.stock.yolda += i.stock.yolda
    m.stock.amazon += i.stock.amazon
    m.total += i.total
  })
  return Array.from(map.values()).map((m) => ({ ...m, items: sortVariants(m.items) }))
}

// ---------------------------------------------------------------------------
// Kanal maliyetleri: komisyon % + adet başı kargo / FBA ücreti
// ---------------------------------------------------------------------------
export interface ChannelCost {
  id: string; channel: Channel; model: string | null; commission_pct: number; fee_per_unit: number; note: string | null
  updated_at: string; updated_by: string | null; created_by: string | null
}
/** Önce modele özel tanım, yoksa kanalın genel tanımı. */
export function costFor(costs: ChannelCost[] | undefined, channel: string, model: string) {
  const list = (costs ?? []).filter((c) => c.channel === channel)
  const m = model.trim().toLocaleLowerCase('tr')
  return list.find((c) => c.model && c.model.trim().toLocaleLowerCase('tr') === m) ?? list.find((c) => !c.model) ?? null
}
/** Satır listesinden komisyon ve kargo tutarı. Tanım yoksa null. */
export function estimateCosts(costs: ChannelCost[] | undefined, channel: string, lines: { name: string; qty: number; price: number }[]) {
  let commission = 0
  let fee = 0
  let any = false
  lines.forEach((l) => {
    const c = costFor(costs, channel, l.name)
    if (!c) return
    any = true
    // oran KDV hariç; komisyon faturasına %20 KDV eklenir
    commission += (l.qty * l.price * Number(c.commission_pct) * 1.2) / 100
    fee += l.qty * Number(c.fee_per_unit)
  })
  return any ? { commission: Math.round(commission * 100) / 100, fee: Math.round(fee * 100) / 100 } : null
}
export function useItemsWithStock() {
  const items = Q.items()
  const stock = Q.stock()
  const list: ItemWithStock[] | undefined =
    items.data && stock.data
      ? items.data.map((i) => {
          const s: Record<LocationId, number> = { depo: 0, yolda: 0, amazon: 0 }
          stock.data!.forEach((l) => {
            if (l.item_id === i.id) s[l.location_id] = Number(l.qty)
          })
          return { ...i, cost: Number(i.cost), vat_rate: Number(i.vat_rate ?? 20), price: Number(i.price), min_stock: Number(i.min_stock), stock: s, total: s.depo + s.yolda + s.amazon, label: itemLabel(i) }
        })
      : undefined
  return { data: list, loading: items.loading || stock.loading, error: items.error || stock.error }
}

/**
 * Elimizdeki stok satılırsa: satış değeri, maliyet, komisyon + kargo, KDV ve stopaj sonrası kalan kâr.
 * FBA'daki ve Amazon'a yoldaki stok Amazon maliyetiyle; depodaki stok o modelin son 180 günlük
 * kanal dağılımına göre hesaplanır (satış yoksa kanal gideri düşülmez, sadece KDV).
 */
export function estimateStock(items: ItemWithStock[], lines: SaleLine[], costs: ChannelCost[] | undefined, since: string) {
  const mix = new Map<string, Map<string, number>>()
  lines.forEach((l) => {
    if (l.status !== 'tamamlandi' || l.sale_date < since) return
    const k = l.name.trim().toLocaleLowerCase('tr')
    const m = mix.get(k) ?? new Map<string, number>()
    m.set(l.channel, (m.get(l.channel) ?? 0) + Number(l.qty))
    mix.set(k, m)
  })
  let retail = 0
  let cost = 0
  let fees = 0
  let vat = 0
  let profit = 0
  let covered = 0
  let units = 0
  items.forEach((i) => {
    const az = Math.max(0, i.stock.amazon) + Math.max(0, i.stock.yolda)
    const dp = Math.max(0, i.stock.depo)
    const q = az + dp
    if (!q) return
    units += q
    retail += q * i.price
    cost += q * i.cost
    const add = (n: number, ch: string | null) => {
      const c = ch ? costFor(costs, ch, i.name) : null
      const e = itemEconomics(i, c, c ? ch : null)
      fees += n * (e.commission + e.cargo)
      vat += n * (e.payableVat + e.stopaj)
      profit += n * e.profit
      if (c) covered += n
    }
    if (az) add(az, 'amazon')
    const m = mix.get(i.name.trim().toLocaleLowerCase('tr'))
    const tot = m ? Array.from(m.values()).reduce((a, b) => a + b, 0) : 0
    if (dp) {
      if (m && tot > 0) m.forEach((n, ch) => add((dp * n) / tot, ch))
      else add(dp, null)
    }
  })
  return { retail, cost, fees, vat, profit, coverage: units ? covered / units : 0 }
}

/** Yeni numara/renk için SKU: modeldeki SKU'ların ön ekinden (FS-M900-4647-LAC gibi). */
export function nextSku(model: Model, variant: string, color: string) {
  const pref = model.items.map((i) => i.sku?.match(/^(.*)-[^-]+(?:-[A-ZÇĞİÖŞÜ]{3})?$/)?.[1]).find(Boolean)
  if (!pref) return null
  const v = variant.replace(/[^0-9A-Za-z]/g, '')
  const c = color ? `-${color.trim().toLocaleUpperCase('tr').replace(/[^A-ZÇĞİÖŞÜ]/g, '').slice(0, 3)}` : ''
  let sku = `${pref}-${v || 'X'}${c}`
  const taken = new Set(model.items.map((i) => i.sku))
  for (let k = 2; taken.has(sku); k++) sku = `${pref}-${v || 'X'}${c}-${k}`
  return sku
}

/** Modele yeni numara(lar) ve/veya renk ekler: ad, marka, birim, fiyat, maliyet, KDV, kritik sınır modelden gelir. */
export async function addVariants(model: Model, variants: string[], colors: string[]) {
  const base = model.items[0]
  const vs = variants.length ? variants : [null]
  const cs = colors.length ? Array.from(new Set(colors.map((c) => c.trim() || null))) : [null]
  const exists = (v: string | null, c: string | null) =>
    model.items.some((i) => (i.variant ?? '').trim().toLocaleLowerCase('tr') === (v ?? '').trim().toLocaleLowerCase('tr') && (i.color ?? '').trim().toLocaleLowerCase('tr') === (c ?? '').trim().toLocaleLowerCase('tr'))
  const rows = vs.flatMap((v) =>
    cs
      .filter((c) => !exists(v, c))
      .map((c) => ({
        name: base.name,
        brand: base.brand,
        unit: base.unit,
        variant: v,
        color: c,
        sku: nextSku(model, v ?? '', c ?? ''),
        cost: base.cost,
        vat_rate: base.vat_rate ?? 20,
        price: base.price,
        min_stock: base.min_stock,
        active: true,
      })),
  )
  // aynı istekte aynı SKU iki kez üretilmesin
  const seen = new Set<string>()
  rows.forEach((r) => {
    if (!r.sku) return
    let s = r.sku
    for (let k = 2; seen.has(s); k++) s = `${r.sku}-${k}`
    seen.add(s)
    r.sku = s
  })
  if (!rows.length) return []
  const made = await write<{ id: string }[]>(supabase.from('items').insert(rows).select('id'))
  invalidate(...AFTER.item)
  return (made ?? []).map((r) => r.id)
}
