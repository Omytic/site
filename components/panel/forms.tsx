'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { BRANDS, itemImage, LOCATIONS, type LocationId } from '@/lib/panel/constants'
import { addVariants, groupModels, modelTitle, variantLabel, type ItemWithStock, type Model } from '@/lib/panel/data'
import { ItemForm } from './ItemForm'
import { num, tl } from '@/lib/panel/format'
import { Button, cx, Input, Select, useUi } from './ui'

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
  priceFromCard,
  allowNew,
  pickTitle,
  currency = 'TRY',
  rate = 1,
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
  /** Fiyat ürün kartından gelir, sadece "değiştir" denirse kutu açılır (alım: birim maliyet). */
  priceFromCard?: boolean
  /** Satırda yeni numara / renk ve yeni ürün (kumaş vb.) eklenebilsin (alım). */
  allowNew?: boolean
  /** Ürün seçme başlığı (varsayılan: "Ne alındı / satıldı?") */
  pickTitle?: string
  /** Fiyatlar bu para biriminde girilir (dolar/euro). Ürün kartında aynı dövizde fiyat varsa o gelir, yoksa TL fiyat kura bölünür. */
  currency?: 'TRY' | 'USD' | 'EUR'
  rate?: number
}) {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺'
  const { toast } = useUi()
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
  const [pendingIds, setPendingIds] = useState<string[]>([])
  useEffect(() => {
    if (!pendingIds.length) return
    const ks = pendingIds.map((id) => modelOf(id)?.key).filter(Boolean) as string[]
    if (ks.length) {
      setOpen((o) => Array.from(new Set([...o, ...ks])))
      setPicking(false)
      setPendingIds([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, pendingIds])
  const [picking, setPicking] = useState(false)
  const [newItem, setNewItem] = useState(false)
  const [editPrice, setEditPrice] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState<Record<string, { v: string; c: string; busy?: boolean }>>({})
  const addVariant = async (m: Model) => {
    const a = adding[m.key]
    const vs = (a?.v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    const cs = (a?.c ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    if (!vs.length && !cs.length) return toast('Numara ya da renk yazın.', 'error')
    // Sadece renk yazıldıysa o renk modelin bütün numaralarıyla açılır
    const sizes = vs.length ? vs : Array.from(new Set(m.items.map((i) => i.variant).filter(Boolean) as string[]))
    // Sadece numara yazıldıysa modelin her rengi için açılır
    const colorsFor = cs.length ? cs : Array.from(new Set(m.items.map((i) => i.color ?? '')))
    setAdding((x) => ({ ...x, [m.key]: { ...a, busy: true } }))
    try {
      const ids = await addVariants(m, sizes, colorsFor)
      toast(ids.length ? `${m.name}: ${ids.length} yeni varyant eklendi, adedini yazabilirsiniz.` : 'Bu numara/renk zaten var.')
      setAdding((x) => {
        const n = { ...x }
        delete n[m.key]
        return n
      })
    } catch (e: any) {
      toast(e.message, 'error')
      setAdding((x) => ({ ...x, [m.key]: { ...a, busy: false } }))
    }
  }
  const [blockPrice, setBlockPrice] = useState<Record<string, string>>({})
  const [blockLoc, setBlockLoc] = useState<Record<string, LocationId>>({})

  const linesOf = (m: Model) => real.filter((l) => m.items.some((i) => i.id === l.item_id))
  const priceOf = (m: Model) => {
    const ex = linesOf(m)[0]?.price
    if (ex !== undefined && ex !== '') return ex
    if (blockPrice[m.key] !== undefined) return blockPrice[m.key]
    if (!priceFrom) return ''
    const it = m.items[0]
    if (currency !== 'TRY') {
      const fx = it?.currency === currency ? (priceFrom === 'price' ? it.fx_price : it.fx_cost) : null
      if (fx) return String(Number(fx))
      const tlv = Number(it?.[priceFrom] ?? 0)
      return tlv && rate > 0 ? String(Math.round((tlv / rate) * 100) / 100) : ''
    }
    const p = it?.[priceFrom]
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
        const single = m.brand === 'seryn' || (m.items.length === 1 && !m.items[0].variant && !m.items[0].color)
        const img = itemImage(m.items[0])
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
                <p className="truncate font-semibold text-ink">{modelTitle(m)}</p>
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
                {!noPrice &&
                  (priceFromCard && !editPrice[m.key] ? (
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-ink-soft/60">{priceLabel ?? 'Birim fiyat'}</span>
                      <div className="flex h-11 items-center justify-between gap-2 rounded-xl bg-[#F7F6F2] px-3 text-sm">
                        <span>
                          <b className="tabular-nums text-ink">{priceOf(m) ? `${sym}${Number(priceOf(m)).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}` : 'girilmemiş'}</b>
                          <span className="text-ink-soft/60"> {priceOf(m) ? `KDV hariç · %${num(m.items[0].vat_rate ?? 20)} KDV` : ''}</span>
                        </span>
                        <button type="button" onClick={() => setEditPrice((x) => ({ ...x, [m.key]: true }))} className="flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
                          <Pencil className="h-3 w-3" /> {priceOf(m) ? 'Bu alımda farklı' : 'Gir'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label>
                      <span className="mb-1 block text-xs font-semibold text-ink-soft/60">
                        {priceLabel ?? 'Birim fiyat'} ({sym}){single ? '' : ', bütün numaralar için'}
                      </span>
                      <Input type="number" inputMode="decimal" min="0" step="any" value={priceOf(m)} onChange={(e) => setPrice(m, e.target.value)} />
                    </label>
                  ))}
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

            {allowNew && m.brand !== 'seryn' &&
              (adding[m.key] ? (
                <div className="mt-2.5 rounded-xl bg-[#F7F6F2] p-2.5">
                  <p className="mb-2 text-xs font-semibold text-ink-soft">
                    {m.name} için yeni numara ve/veya renk. Sadece renk yazarsanız o renk bütün numaralarla açılır. Birden çoksa virgülle ayırın.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="min-w-[120px] flex-1">
                      <span className="mb-1 block text-xs font-semibold text-ink-soft/60">{m.brand === 'kumas' ? 'Ebat / tip' : 'Numara'}</span>
                      <Input className="h-10" value={adding[m.key].v} placeholder={m.brand === 'kumas' ? '150 cm' : '46-47'} onChange={(e) => setAdding((x) => ({ ...x, [m.key]: { ...x[m.key], v: e.target.value } }))} />
                    </label>
                    <label className="min-w-[120px] flex-1">
                      <span className="mb-1 block text-xs font-semibold text-ink-soft/60">Renk</span>
                      <Input className="h-10" value={adding[m.key].c} placeholder="Lacivert" onChange={(e) => setAdding((x) => ({ ...x, [m.key]: { ...x[m.key], c: e.target.value } }))} />
                    </label>
                    <Button type="button" size="sm" loading={adding[m.key].busy} onClick={() => addVariant(m)}>
                      Ekle
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAdding((x) => { const n = { ...x }; delete n[m.key]; return n })}>
                      Vazgeç
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding((x) => ({ ...x, [m.key]: { v: '', c: '' } }))} className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
                  <Plus className="h-3.5 w-3.5" /> {m.brand === 'kumas' ? 'Yeni renk / tip ekle' : 'Yeni numara / renk ekle'}
                </button>
              ))}

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

      {open.length === 0 || picking ? (
        <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink">{open.length ? 'Başka ürün ekle' : pickTitle ?? 'Ne alındı / satıldı? Ürünü seçin'}</p>
            {open.length > 0 && (
              <button type="button" className="text-xs font-semibold text-ink-soft hover:text-ink" onClick={() => setPicking(false)}>
                Kapat
              </button>
            )}
          </div>
          {BRANDS.map((b) => {
            const list = addable.filter((m) => m.brand === b.id)
            if (!list.length) return null
            return (
              <div key={b.id} className="mb-2.5 last:mb-0">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft/50">{b.id === 'formstep' ? 'Tabanlıklar' : b.id === 'kumas' ? 'Kumaşlar' : b.label}</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {list.map((m) => {
                    const img = itemImage(m.items[0])
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => {
                          setOpen((o) => [...o, m.key])
                          setPicking(false)
                        }}
                        className="flex items-center gap-2 rounded-xl bg-[#F7F6F2] p-2 text-left ring-1 ring-transparent transition hover:ring-[#E3AB3B]"
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5" />
                        ) : (
                          <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{m.brand === 'seryn' ? m.items[0].variant || m.name : m.name.replace(/^FormStep /, '')}</span>
                          <span className="block truncate text-[11px] text-ink-soft/60">
                            {m.brand === 'seryn' ? `${num(m.total)} stok` : `${m.items.length > 1 ? `${m.items.length} varyant` : variantLabel(m.items[0]) || m.items[0].unit} · ${num(m.total)} stok`}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {allowNew && (
            <button type="button" onClick={() => setNewItem(true)} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-ink-soft hover:border-[#E3AB3B] hover:text-ink">
              <Plus className="h-4 w-4" /> Listede yok: yeni ürün / kumaş ekle
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {open.length > 0 && !picking ? (
          <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
            Başka ürün ekle
          </Button>
        ) : (
          <span />
        )}
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
      {newItem && <ItemForm item={null} defaultBrand="kumas" onClose={() => setNewItem(false)} onSaved={(ids) => setPendingIds(ids)} />}
    </div>
  )
}

export const emptyLine = (): Line => ({ item_id: '', qty: '1', price: '' })

/** Kaydetmeden önce: ürünü ve adedi olan satırlar. */
export const realLines = (lines: Line[]) => lines.filter((l) => l.item_id && Number(l.qty) > 0)
