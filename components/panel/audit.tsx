'use client'

import { BRANDS_WITH_GENEL, CATEGORY_LABEL, CHANNELS, LOCATIONS, MOVEMENT_KINDS, SALE_STATUS, SHIPMENT_STATUS, TABLE_LABELS, TASK_STATUS, AD_PLATFORMS, label } from '@/lib/panel/constants'
import type { AuditRow, Item, Profile } from '@/lib/panel/data'
import { dateTR, num, tl } from '@/lib/panel/format'

const FIELD: Record<string, string> = {
  name: 'Ad',
  title: 'Başlık',
  description: 'Açıklama',
  variant: 'Varyant',
  sku: 'SKU',
  unit: 'Birim',
  cost: 'Maliyet',
  price: 'Fiyat',
  min_stock: 'Kritik stok',
  active: 'Aktif',
  notes: 'Not',
  note: 'Not',
  sale_date: 'Tarih',
  purchase_date: 'Tarih',
  ship_date: 'Gönderim',
  received_date: 'Teslim',
  tx_date: 'Tarih',
  spend_date: 'Tarih',
  channel: 'Kanal',
  order_no: 'Sipariş no',
  customer: 'Müşteri',
  status: 'Durum',
  commission: 'Komisyon',
  shipping_cost: 'Kargo',
  payment_status: 'Ödeme',
  due_date: 'Vade',
  supplier: 'Tedarikçi',
  invoice_no: 'Fatura',
  reference: 'Sevkiyat no',
  carrier: 'Kargo firması',
  direction: 'Yön',
  category: 'Kalem',
  amount: 'Tutar',
  brand: 'Marka',
  counterparty: 'Karşı taraf',
  budget: 'Bütçe',
  platform: 'Platform',
  campaign: 'Kampanya',
  priority: 'Öncelik',
  assignee: 'Sorumlu',
  followers: 'Takipçi',
  url: 'Adres',
  handle: 'Kullanıcı adı',
  owner: 'Sorumlu',
  qty: 'Miktar',
  unit_price: 'Birim fiyat',
  unit_cost: 'Birim maliyet',
  location_id: 'Yer',
  image_url: 'Görsel',
  phone: 'Telefon',
  whatsapp: 'WhatsApp',
  email: 'E-posta',
  announcement_text: 'Duyuru',
  announcement_active: 'Duyuru açık',
  month: 'Ay',
  kind: 'Tür',
  item_id: 'Ürün',
}
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'created_by', 'completed_at', 'sale_id', 'purchase_id', 'shipment_id', 'asset_id', 'features', 'site_title', 'site_description'])
const MONEY = new Set(['cost', 'price', 'commission', 'shipping_cost', 'amount', 'budget', 'unit_price', 'unit_cost'])

export function fmtValue(key: string, v: any, ctx: { items: Item[]; profiles: Profile[] }) {
  if (v === null || v === undefined || v === '') return '—'
  if (MONEY.has(key)) return tl(Number(v), true)
  if (key === 'channel') return label(CHANNELS, v)
  if (key === 'brand') return label(BRANDS_WITH_GENEL, v)
  if (key === 'platform') return label(AD_PLATFORMS, v)
  if (key === 'location_id') return label(LOCATIONS, v)
  if (key === 'category') return CATEGORY_LABEL[v] ?? v
  if (key === 'kind') return MOVEMENT_KINDS[v] ?? v
  if (key === 'status') return label([...SALE_STATUS, ...SHIPMENT_STATUS, ...TASK_STATUS], v)
  if (key === 'payment_status') return v === 'odendi' ? 'Ödendi' : 'Bekliyor'
  if (key === 'assignee' || key === 'owner') return ctx.profiles.find((p) => p.id === v)?.full_name ?? '—'
  if (key === 'item_id') {
    const it = ctx.items.find((i) => i.id === v)
    return it ? (it.variant ? `${it.name} · ${it.variant}` : it.name) : 'silinmiş ürün'
  }
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır'
  if (/_date$|^month$/.test(key) && typeof v === 'string') return dateTR(v)
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) return num(Number(v))
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

/** Bir kaydı tek satırda özetler: "M100 · 40-41", "Trendyol #123", "Kargo 450 ₺"… */
export function summarize(row: AuditRow, ctx: { items: Item[]; profiles: Profile[] }) {
  const d = row.new_data ?? row.old_data ?? {}
  switch (row.table_name) {
    case 'items':
      return d.variant ? `${d.name} · ${d.variant}` : d.name
    case 'sales':
      return `${label(CHANNELS, d.channel)}${d.order_no ? ` #${d.order_no}` : ''}${d.customer ? ` · ${d.customer}` : ''}`
    case 'sale_items':
    case 'purchase_items':
    case 'shipment_items':
      return `${num(Number(d.qty))} × ${fmtValue('item_id', d.item_id, ctx)}`
    case 'purchases':
      return d.supplier || 'Alım'
    case 'shipments':
      return d.reference || 'Amazon sevkiyatı'
    case 'stock_movements':
      return `${fmtValue('item_id', d.item_id, ctx)} · ${Number(d.qty) > 0 ? '+' : ''}${num(Number(d.qty))} (${MOVEMENT_KINDS[d.kind] ?? d.kind}, ${label(LOCATIONS, d.location_id)})`
    case 'transactions':
      return `${CATEGORY_LABEL[d.category] ?? d.category} · ${tl(Number(d.amount))}`
    case 'ad_spend':
      return `${label(AD_PLATFORMS, d.platform)} · ${tl(Number(d.amount))}`
    case 'ad_budgets':
      return `${label(AD_PLATFORMS, d.platform)} · ${label(BRANDS_WITH_GENEL, d.brand)} · ${tl(Number(d.budget))}`
    case 'tasks':
      return d.title
    case 'assets':
      return d.name
    case 'asset_metrics':
      return `${num(Number(d.followers))} takipçi`
    case 'products':
      return d.name
    case 'settings':
      return 'Site ayarları'
    default:
      return TABLE_LABELS[row.table_name] ?? row.table_name
  }
}

export function changes(row: AuditRow) {
  if (row.action !== 'UPDATE' || !row.old_data || !row.new_data) return []
  return Object.keys(row.new_data)
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(row.old_data![k]) !== JSON.stringify(row.new_data![k]))
    .map((k) => ({ key: k, label: FIELD[k] ?? k, from: row.old_data![k], to: row.new_data![k] }))
}

export const VERB = { INSERT: 'ekledi', UPDATE: 'düzenledi', DELETE: 'sildi' } as const
