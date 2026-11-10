'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { BRANDS, LOCATIONS, type LocationId } from '@/lib/panel/constants'
import type { ItemWithStock } from '@/lib/panel/data'
import { num, tl } from '@/lib/panel/format'
import { Button, cx, Input, Select } from './ui'

/** ?yeni=1 ile gelinirse formu aç, sonra adres çubuğunu temizle. */
export function useOpenFromQuery(open: () => void) {
  const params = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    if (params.get('yeni') === '1') {
      open()
      router.replace(window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
}

export function ItemSelect({
  items,
  value,
  onChange,
  showStock,
  required,
}: {
  items: ItemWithStock[]
  value: string
  onChange: (id: string) => void
  showStock?: LocationId | 'total'
  required?: boolean
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">Ürün seçin…</option>
      {BRANDS.map((b) => {
        const list = items.filter((i) => i.brand === b.id && (i.active || i.id === value))
        if (!list.length) return null
        return (
          <optgroup key={b.id} label={b.label}>
            {list.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
                {showStock ? ` — ${num(showStock === 'total' ? i.total : i.stock[showStock])} ${i.unit}` : ''}
              </option>
            ))}
          </optgroup>
        )
      })}
    </Select>
  )
}

export interface Line {
  item_id: string
  qty: string
  price: string
  location_id?: LocationId
}

/** Satış / alım / sevkiyat satırları. */
export function LinesEditor({
  items,
  lines,
  setLines,
  priceLabel,
  priceFrom,
  stockFrom,
  showLocation,
  noPrice,
}: {
  items: ItemWithStock[]
  lines: Line[]
  setLines: (l: Line[]) => void
  priceLabel?: string
  priceFrom?: 'price' | 'cost'
  /** Bu konumdaki stoğa göre uyarı göster (satış/sevkiyat). */
  stockFrom?: (l: Line) => LocationId
  showLocation?: boolean
  noPrice?: boolean
}) {
  const upd = (i: number, patch: Partial<Line>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
  return (
    <div className="space-y-2.5">
      {lines.map((l, i) => {
        const it = items.find((x) => x.id === l.item_id)
        const loc = stockFrom?.(l)
        const avail = it && loc ? it.stock[loc] : null
        const short = avail !== null && Number(l.qty) > avail
        return (
          <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-line">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ItemSelect
                  items={items}
                  value={l.item_id}
                  required
                  showStock={loc}
                  onChange={(id) => {
                    const sel = items.find((x) => x.id === id)
                    const p = sel && priceFrom ? sel[priceFrom] : 0
                    upd(i, { item_id: id, price: l.price || (p ? String(p) : '') })
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setLines(lines.filter((_, k) => k !== i))}
                disabled={lines.length === 1}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-soft/50 hover:bg-[#d03b3b]/10 hover:text-[#d03b3b] disabled:opacity-30"
                aria-label="Satırı sil"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className={cx('mt-2 grid gap-2', noPrice ? 'grid-cols-1' : showLocation ? 'grid-cols-3' : 'grid-cols-2')}>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink-soft/60">Miktar{it ? ` (${it.unit})` : ''}</span>
                <Input type="number" inputMode="decimal" min="0.01" step="any" required value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} />
              </label>
              {!noPrice && (
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink-soft/60">{priceLabel ?? 'Birim fiyat'} (₺)</span>
                  <Input type="number" inputMode="decimal" min="0" step="any" value={l.price} onChange={(e) => upd(i, { price: e.target.value })} />
                </label>
              )}
              {showLocation && (
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink-soft/60">Stok yeri</span>
                  <Select value={l.location_id ?? 'depo'} onChange={(e) => upd(i, { location_id: e.target.value as LocationId })}>
                    {LOCATIONS.filter((x) => x.id !== 'yolda').map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
            </div>
            {short && (
              <p className="mt-2 rounded-lg bg-[#fab219]/15 px-2.5 py-1.5 text-xs font-semibold text-[#8a5a00]">
                ▲ {LOCATIONS.find((x) => x.id === loc)?.label} stoğunda {num(avail!)} {it!.unit} var. Kaydedersen stok eksiye düşer.
              </p>
            )}
          </div>
        )
      })}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setLines([...lines, { item_id: '', qty: '1', price: '' }])}>
          Satır ekle
        </Button>
        {!noPrice && (
          <p className="text-sm text-ink-soft">
            Ara toplam <b className="ml-1 font-display text-lg font-black text-ink">{tl(total)}</b>
          </p>
        )}
      </div>
    </div>
  )
}

export const emptyLine = (): Line => ({ item_id: '', qty: '1', price: '' })
