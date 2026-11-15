'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { BRANDS, LOCATIONS, productImage, type LocationId } from '@/lib/panel/constants'
import { groupModels, variantLabel, type ItemWithStock, type Model } from '@/lib/panel/data'
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

/*
 * Satış / alım / sevkiyat satırları — model bazında.
 * Önce model seçilir (FormStep M100, SERYN…); numarası/rengi olan modellerde bütün varyantlar
 * küçük kutular hâlinde açılır, sadece adetler yazılır. Fiyat ve stok yeri model için bir kez girilir.
 * Dışarıya yine ürün başına satır listesi verilir; adedi boş/0 olan varyant satır sayılmaz.
 */
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
  const models = useMemo(() => groupModels(items.filter((i) => i.active || lines.some((l) => l.item_id === i.id))), [items, lines])
  const modelOf = (itemId: string) => models.find((m) => m.items.some((i) => i.id === itemId))
  const real = lines.filter((l) => l.item_id)

  // Açık model blokları: mevcut satırlardan başlar, "Ürün ekle" ile yenisi açılır
  const [open, setOpen] = useState<string[]>(() => Array.from(new Set(real.map((l) => modelOf(l.item_id)?.key).filter(Boolean) as string[])))
  useEffect(() => {
    // Dışarıdan satır gelirse (ör. öneriden doldurma) bloklarını da aç
    const keys = real.map((l) => modelOf(l.item_id)?.key).filter(Boolean) as string[]
    const missing = keys.filter((k) => !open.includes(k))
    if (missing.length) setOpen((o) => Array.from(new Set([...o, ...missing])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, models])
  const [blockPrice, setBlockPrice] = useState<Record<string, string>>({})
  const [blockLoc, setBlockLoc] = useState<Record<string, LocationId>>({})

  const linesOf = (m: Model) => real.filter((l) => m.items.some((i) => i.id === l.item_id))
  const priceOf = (m: Model) => {
    const ex = linesOf(m)[0]?.price
    if (ex !== undefined && ex !== '') return ex
    if (blockPrice[m.key] !== undefined) return blockPrice[m.key]
    const p = priceFrom ? m.items[0]?.[priceFrom] : 0
    return p ? String(p) : ''
  }
  const locOf = (m: Model) => linesOf(m)[0]?.location_id ?? blockLoc[m.key]

  const setQty = (m: Model, itemId: string, qty: string) => {
    const others = real.filter((l) => l.item_id !== itemId)
    const prev = real.find((l) => l.item_id === itemId)
    const next = Number(qty) > 0 || (qty !== '' && qty !== '0') ? [...others, { item_id: itemId, qty, price: prev?.price ?? priceOf(m), location_id: prev?.location_id ?? locOf(m) }] : others
    // satır sırası model sırasını korusun
    const order = open.flatMap((k) => models.find((x) => x.key === k)?.items.map((i) => i.id) ?? [])
    setLines(next.sort((a, b) => order.indexOf(a.item_id) - order.indexOf(b.item_id)))
  }
  const setPrice = (m: Model, price: string) => {
    setBlockPrice((p) => ({ ...p, [m.key]: price }))
    setLines(real.map((l) => (m.items.some((i) => i.id === l.item_id) ? { ...l, price } : l)))
  }
  const setLoc = (m: Model, loc: LocationId) => {
    setBlockLoc((p) => ({ ...p, [m.key]: loc }))
    setLines(real.map((l) => (m.items.some((i) => i.id === l.item_id) ? { ...l, location_id: loc } : l)))
  }
  const remove = (m: Model) => {
    setOpen((o) => o.filter((k) => k !== m.key))
    setLines(real.filter((l) => !m.items.some((i) => i.id === l.item_id)))
  }

  const total = real.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
  const units = real.reduce((a, l) => a + (Number(l.qty) || 0), 0)
  const addable = models.filter((m) => !open.includes(m.key) && m.items.some((i) => i.active))

  return (
    <div className="space-y-3">
      {open.map((k) => {
        const m = models.find((x) => x.key === k)
        if (!m) return null
        const ls = linesOf(m)
        const blockQty = ls.reduce((a, l) => a + (Number(l.qty) || 0), 0)
        const single = m.items.length === 1 && !m.items[0].variant && !m.items[0].color
        const img = productImage(m.items[0]?.sku)
        const loc = stockFrom?.({ item_id: m.items[0].id, qty: '', price: '', location_id: locOf(m) })
        const shorts = ls.filter((l) => {
          const it = m.items.find((i) => i.id === l.item_id)
          return it && loc && Number(l.qty) > it.stock[loc]
        })
        const colors = Array.from(new Set(m.items.map((i) => i.color ?? '')))
        return (
          <div key={k} className="rounded-2xl bg-white p-3 ring-1 ring-line">
            <div className="flex items-center gap-2.5">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-[#F4F3EF] object-contain p-0.5" />
              ) : (
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: BRANDS.find((b) => b.id === m.brand)?.color }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{m.name}</p>
                {!single && (
                  <p className="text-xs text-ink-soft/60">
                    {blockQty > 0 ? (
                      <>
                        Toplam <b className="text-ink">{num(blockQty)}</b> {m.items[0].unit} · {ls.length} varyant
                      </>
                    ) : (
                      'Adet yazın, boş bırakılan varyant eklenmez'
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(m)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-soft/50 hover:bg-[#d03b3b]/10 hover:text-[#d03b3b]"
                aria-label={`${m.name} satırlarını sil`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {single ? (
              <div className="mt-2.5">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink-soft/60">
                    Miktar ({m.items[0].unit}){loc ? ` · ${LOCATIONS.find((x) => x.id === loc)?.short} stoğu ${num(m.items[0].stock[loc])}` : ''}
                  </span>
                  <Input type="number" inputMode="decimal" min="0" step="any" value={ls[0]?.qty ?? ''} onChange={(e) => setQty(m, m.items[0].id, e.target.value)} placeholder="0" />
                </label>
              </div>
            ) : (
              colors.map((c) => (
                <div key={c} className="mt-2.5">
                  {colors.length > 1 && <p className="mb-1.5 text-xs font-bold text-ink-soft">{c || 'Renksiz'}</p>}
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {m.items
                      .filter((i) => (i.color ?? '') === c && (i.active || ls.some((l) => l.item_id === i.id)))
                      .map((i) => {
                        const l = ls.find((x) => x.item_id === i.id)
                        const has = l && Number(l.qty) > 0
                        const st = loc ? i.stock[loc] : null
                        return (
                          <label
                            key={i.id}
                            className={cx('rounded-xl px-2 pb-1.5 pt-1 ring-1 transition', has ? 'bg-[#E3AB3B]/10 ring-[#E3AB3B]' : 'bg-[#F7F6F2] ring-transparent')}
                          >
                            <span className="flex items-baseline justify-between gap-1">
                              <span className="truncate text-xs font-bold text-ink">{i.variant || i.color || '—'}</span>
                              {st !== null && <span className={cx('text-[10px] tabular-nums', st <= 0 ? 'text-[#b83030]' : 'text-ink-soft/50')}>{num(st)}</span>}
                            </span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="any"
                              value={l?.qty ?? ''}
                              placeholder="0"
                              onChange={(e) => setQty(m, i.id, e.target.value)}
                              className="mt-0.5 h-8 w-full rounded-lg border-0 bg-white px-2 text-center font-display text-base font-black tabular-nums text-ink outline-none ring-1 ring-line placeholder:font-normal placeholder:text-ink-soft/30 focus:ring-2 focus:ring-[#E3AB3B]"
                              aria-label={`${m.name} ${variantLabel(i)} adet`}
                            />
                          </label>
                        )
                      })}
                  </div>
                </div>
              ))
            )}

            {(!noPrice || showLocation) && (
              <div className={cx('mt-2.5 grid gap-2', !noPrice && showLocation ? 'grid-cols-2' : 'grid-cols-1')}>
                {!noPrice && (
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink-soft/60">
                      {priceLabel ?? 'Birim fiyat'} (₺){single ? '' : ', bütün numaralar için'}
                    </span>
                    <Input type="number" inputMode="decimal" min="0" step="any" value={priceOf(m)} onChange={(e) => setPrice(m, e.target.value)} />
                  </label>
                )}
                {showLocation && (
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink-soft/60">Stok yeri</span>
                    <Select value={locOf(m) ?? loc ?? 'depo'} onChange={(e) => setLoc(m, e.target.value as LocationId)}>
                      {LOCATIONS.filter((x) => x.id !== 'yolda').map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            )}

            {shorts.length > 0 && loc && (
              <p className="mt-2 rounded-lg bg-[#fab219]/15 px-2.5 py-1.5 text-xs font-semibold text-[#8a5a00]">
                ▲ {LOCATIONS.find((x) => x.id === loc)?.label} stoğu yetmiyor:{' '}
                {shorts.map((l) => {
                  const it = m.items.find((i) => i.id === l.item_id)!
                  return `${variantLabel(it) || it.name} (${num(it.stock[loc])} var)`
                }).join(', ')}
                . Kaydedersen stok eksiye düşer.
              </p>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="w-full sm:w-72">
          <Select
            value=""
            onChange={(e) => e.target.value && setOpen((o) => [...o, e.target.value])}
            aria-label="Ürün ekle"
            className={cx(open.length === 0 && 'ring-2 ring-[#E3AB3B]')}
          >
            <option value="">{open.length ? '+ Başka ürün ekle…' : 'Ürün seçin…'}</option>
            {BRANDS.map((b) => {
              const list = addable.filter((m) => m.brand === b.id)
              if (!list.length) return null
              return (
                <optgroup key={b.id} label={b.label}>
                  {list.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.name}
                      {m.items.length > 1 ? ` (${m.items.length} varyant)` : m.items[0].variant ? ` · ${variantLabel(m.items[0])}` : ''}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </Select>
        </div>
        {!noPrice ? (
          <p className="text-sm text-ink-soft">
            {num(units)} adet · Ara toplam <b className="ml-1 font-display text-lg font-black text-ink">{tl(total)}</b>
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            Toplam <b className="font-display text-lg font-black text-ink">{num(units)}</b> adet
          </p>
        )}
      </div>
    </div>
  )
}

export const emptyLine = (): Line => ({ item_id: '', qty: '1', price: '' })

/** Kaydetmeden önce: ürünü ve adedi olan satırlar. */
export const realLines = (lines: Line[]) => lines.filter((l) => l.item_id && Number(l.qty) > 0)
