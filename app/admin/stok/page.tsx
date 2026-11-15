'use client'

import { Fragment, useMemo, useState } from 'react'
import { Boxes, ChevronRight, ClipboardCheck, Percent, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS, CHANNELS, colorOf, label, LOCATIONS, MOVEMENT_KINDS, productImage, SERIES, UNITS, type Brand, type LocationId } from '@/lib/panel/constants'
import { AFTER, costFor, estimateStock, groupModels, invalidate, Q, useItemsWithStock, variantLabel, write, type ChannelCost, type ItemWithStock, type Model } from '@/lib/panel/data'
import { addDays, dateTR, norm, num, pct, tl, today } from '@/lib/panel/format'
import { coverDays, velocities } from '@/lib/panel/insights'
import { HBars, ShareBar } from '@/components/panel/charts'
import { ItemSelect, useOpenFromQuery } from '@/components/panel/forms'
import { Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, PageHeader, SearchBox, Segmented, Select, ShowMore, Skeleton, Stat, StatusPill, Table, Textarea, UserDot, useShowMore, useUi } from '@/components/panel/ui'

type Tab = 'urunler' | 'hareketler'

export default function StockPage() {
  const { data: items, loading, error } = useItemsWithStock()
  const lines = Q.saleLines()
  const [tab, setTab] = useState<Tab>('urunler')
  const [brand, setBrand] = useState<'all' | Brand>('all')
  const [q, setQ] = useState('')
  const [showPassive, setShowPassive] = useState(false)
  const [itemForm, setItemForm] = useState<ItemWithStock | 'new' | null>(null)
  const [adjust, setAdjust] = useState<ItemWithStock | 'new' | null>(null)
  const [count, setCount] = useState(false)
  const [modelForm, setModelForm] = useState<Model | null>(null)
  const [costsOpen, setCostsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const channelCosts = Q.channelCosts()
  useOpenFromQuery(() => setItemForm('new'))

  const vel = useMemo(() => velocities(lines.data ?? [], 30), [lines.data])
  const list = useMemo(
    () =>
      (items ?? []).filter(
        (i) => (showPassive || i.active) && (brand === 'all' || i.brand === brand) && (!q || norm(`${i.label} ${i.sku ?? ''}`).includes(norm(q))),
      ),
    [items, brand, q, showPassive],
  )
  const models = useMemo(() => groupModels(list), [list])

  // Üstteki kartlar ve grafikler de seçili markaya göre
  const active = (items ?? []).filter((i) => i.active && (brand === 'all' || i.brand === brand))
  const est = useMemo(() => estimateStock(active, lines.data ?? [], channelCosts.data, addDays(today(), -180)), [active, lines.data, channelCosts.data])
  const critical = active.filter((i) => i.min_stock > 0 && i.total <= i.min_stock)
  const negative = active.filter((i) => i.stock.depo < 0 || i.stock.amazon < 0 || i.stock.yolda < 0)
  const activeModels = groupModels(active)
  const brandName = brand === 'all' ? 'Genel' : label(BRANDS, brand)

  return (
    <>
      <PageHeader
        title="Stok"
        subtitle="Stok satış, alım ve sevkiyatlardan otomatik hesaplanır. Buradan sadece ürün kartı, sayım ve fire girersiniz."
        actions={
          <>
            <Button variant="secondary" icon={<Percent className="h-4 w-4" />} onClick={() => setCostsOpen(true)}>
              Kanal maliyetleri
            </Button>
            <Button variant="secondary" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setCount(true)}>
              Toplu sayım
            </Button>
            <Button variant="secondary" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setAdjust('new')}>
              Stok düzelt
            </Button>
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setItemForm('new')}>
              Ürün ekle
            </Button>
          </>
        }
      />
      <ErrorNote message={error} />

      <div className="mb-3">
        <Segmented value={brand} onChange={setBrand} size="sm" options={[{ id: 'all', label: 'Genel' }, ...BRANDS.map((b) => ({ id: b.id, label: b.label }))]} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label={`Stok değeri · maliyet`} value={tl(est.cost)} sub={`${brandName} · ${num(activeModels.length)} model, ${num(active.length)} varyant`} />
        <Stat label="Stok değeri · satış fiyatıyla" value={tl(est.retail)} sub={est.cost > 0 ? `maliyetin ${(est.retail / est.cost).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} katı` : 'maliyet girilmemiş'} />
        <Stat
          label="Tahmini kâr"
          value={tl(est.profit)}
          sub={
            est.fees > 0
              ? `${tl(est.fees)} komisyon ve kargo düşüldü${est.coverage < 0.95 ? ` · stoğun %${Math.round(est.coverage * 100)}'i için` : ''}`
              : 'Kanal maliyeti girilince komisyon ve kargo da düşülür'
          }
        />
        <Stat label="Kritik stok" value={num(critical.length)} sub={negative.length ? `${num(negative.length)} varyant eksi, sayım gerekli` : 'varyant alt sınırda ya da altında'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={brand === 'all' ? 'Stok değeri, marka bazında' : `${brandName} stok değeri, model bazında`}>
          <ShareBar
            parts={
              brand === 'all'
                ? BRANDS.map((b) => ({ id: b.id, label: b.label, color: b.color, value: active.filter((i) => i.brand === b.id).reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0) }))
                : activeModels.slice(0, 6).map((m, k) => ({ id: m.key, label: m.name, color: SERIES[k], value: m.items.reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0) }))
            }
            format={(v) => tl(v)}
          />
        </Card>
        <Card title={`Stok nerede?${brand === 'all' ? '' : ` · ${brandName}`}`}>
          <HBars
            rows={LOCATIONS.map((l, k) => ({
              id: l.id,
              label: l.label,
              value: active.reduce((a, i) => a + Math.max(0, i.stock[l.id]) * (i.cost || 0), 0),
              color: ['#2a78d6', '#eda100', '#1baf7a'][k],
              sub: `${num(active.reduce((a, i) => a + Math.max(0, i.stock[l.id]), 0))} birim`,
            }))}
            format={(v) => tl(v)}
          />
        </Card>
      </div>

      <div className="mb-3 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[{ id: 'urunler', label: 'Ürünler' }, { id: 'hareketler', label: 'Hareketler' }]} />
        </div>
        {tab === 'urunler' && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={showPassive} onChange={(e) => setShowPassive(e.target.checked)} className="h-4 w-4 accent-[#0E1527]" />
              Pasifler
            </label>
            <SearchBox value={q} onChange={setQ} placeholder="Ürün, numara, SKU…" />
          </div>
        )}
      </div>

      {tab === 'urunler' ? (
        <Card pad={false}>
          {loading ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <div className="p-5">
              <Empty icon={<Boxes className="h-5 w-5" />} title="Ürün bulunamadı" text="Kumaşlarınızı ve diğer ürünlerinizi kart olarak ekleyin." action={<Button onClick={() => setItemForm('new')}>Ürün ekle</Button>} />
            </div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Ürün</th>
                  <th className="text-right">Depo</th>
                  <th className="text-right">Yolda</th>
                  <th className="text-right">FBA</th>
                  <th className="text-right">Toplam</th>
                  <th className="text-right">Maliyet / Fiyat</th>
                  <th className="text-right">Marj</th>
                  <th>Yeter mi?</th>
                  <th />
                </tr>
              }
            >
              {models.map((m) => {
                const grouped = m.items.length > 1
                if (!grouped) return <ItemRow key={m.key} i={m.items[0]} vel={vel} onAdjust={setAdjust} onEdit={setItemForm} />
                const isOpen = expanded.has(m.key) || !!q
                const v = m.items.reduce((a, i) => a + (vel.get(i.id)?.total ?? 0), 0)
                const days = coverDays(m.total, v)
                const lows = m.items.filter((i) => i.active && i.min_stock > 0 && i.total <= i.min_stock)
                const prices = Array.from(new Set(m.items.map((i) => i.price)))
                const costs = Array.from(new Set(m.items.map((i) => i.cost)))
                const price = prices.length === 1 ? prices[0] : null
                const cost = costs.length === 1 ? costs[0] : null
                const margin = price && cost ? (price - cost) / price : null
                const toggle = () =>
                  setExpanded((x) => {
                    const n = new Set(x)
                    n.has(m.key) ? n.delete(m.key) : n.add(m.key)
                    return n
                  })
                const img = productImage(m.items[0].sku)
                return (
                  <Fragment key={m.key}>
                    <tr className="cursor-pointer" onClick={toggle}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <ChevronRight className={cx('h-4 w-4 shrink-0 text-ink-soft/50 transition', isOpen && 'rotate-90')} />
                          {img ? (
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F3EF]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img} alt="" className="h-8 w-8 object-contain" loading="lazy" />
                              <span className="absolute -left-1 top-2 h-6 w-1 rounded-full" style={{ backgroundColor: colorOf(BRANDS, m.brand) }} />
                            </span>
                          ) : (
                            <span className="h-8 w-1 rounded-full" style={{ backgroundColor: colorOf(BRANDS, m.brand) }} />
                          )}
                          <div>
                            <p className="font-semibold text-ink">{m.name}</p>
                            <p className="text-xs text-ink-soft/50">
                              {label(BRANDS, m.brand)} · {m.items.length} varyant
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-right">{qtyCell(m.stock.depo)}</td>
                      <td className="text-right">{qtyCell(m.stock.yolda)}</td>
                      <td className="text-right">{qtyCell(m.stock.amazon)}</td>
                      <td className="text-right">
                        <b className={cx('font-display text-base tabular-nums', m.total < 0 && 'text-[#d03b3b]')}>{num(m.total)}</b>
                        <span className="ml-1 text-xs text-ink-soft/50">{m.items[0].unit}</span>
                      </td>
                      <td className="whitespace-nowrap text-right text-ink-soft tabular-nums">
                        {cost === null ? 'karışık' : cost ? tl(cost, true) : <span className="text-[#b07a00]">maliyet yok</span>} / {price === null ? 'karışık' : tl(price, true)}
                      </td>
                      <td className="text-right tabular-nums">{margin === null ? '—' : <span className={margin < 0.25 ? 'font-bold text-[#b83030]' : ''}>{pct(margin * 100)}</span>}</td>
                      <td>
                        {lows.length ? (
                          <StatusPill tone="critical">{lows.length === m.items.length ? 'Hepsi kritik' : `${lows.length} varyant kritik`}</StatusPill>
                        ) : days === null ? (
                          <StatusPill tone="neutral">Satış yok</StatusPill>
                        ) : days < 14 ? (
                          <StatusPill tone="warning">~{Math.floor(days)} gün</StatusPill>
                        ) : (
                          <StatusPill tone="good">~{Math.floor(days)} gün</StatusPill>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setModelForm(m)} title="Modeli düzenle: fiyat, maliyet, varyant ekle">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <>
                        {m.items.map((i) => (
                          <ItemRow key={i.id} i={i} vel={vel} onAdjust={setAdjust} onEdit={setItemForm} child />
                        ))}
                        <tr className="bg-[#FBFAF7]">
                          <td colSpan={9} className="!py-2.5 pl-12">
                            <NetProfit model={m} costs={channelCosts.data} onSetup={() => setCostsOpen(true)} />
                          </td>
                        </tr>
                      </>
                    )}
                  </Fragment>
                )
              })}
            </Table>
          )}
        </Card>
      ) : (
        <Movements items={items ?? []} />
      )}

      {itemForm && <ItemForm item={itemForm === 'new' ? null : itemForm} onClose={() => setItemForm(null)} />}
      {adjust && items && <AdjustForm items={items} preset={adjust === 'new' ? null : adjust} onClose={() => setAdjust(null)} />}
      {count && items && <CountSheet items={items} onClose={() => setCount(false)} />}
      {modelForm && <ModelForm model={modelForm} onClose={() => setModelForm(null)} onAddVariant={() => setItemForm({ ...modelForm.items[0], id: '', sku: '', variant: '', color: modelForm.items[0].color } as ItemWithStock)} />}
      {costsOpen && items && <CostsDrawer items={items} costs={channelCosts.data ?? []} onClose={() => setCostsOpen(false)} />}
    </>
  )
}


const qtyCell = (n: number) => <span className={cx('tabular-nums', n < 0 ? 'font-bold text-[#d03b3b]' : n === 0 ? 'text-ink-soft/40' : '')}>{num(n)}</span>

function ItemRow({ i, vel, onAdjust, onEdit, child }: { i: ItemWithStock; vel: Map<string, { total: number }>; onAdjust: (i: ItemWithStock) => void; onEdit: (i: ItemWithStock) => void; child?: boolean }) {
  const v = vel.get(i.id)?.total ?? 0
  const days = coverDays(i.total, v)
  const low = i.min_stock > 0 && i.total <= i.min_stock
  const margin = i.price > 0 && i.cost > 0 ? (i.price - i.cost) / i.price : null
  const cell = qtyCell
  const setAdjust = onAdjust
  const setItemForm = onEdit
                return (
                  <tr className={cx(!i.active && 'opacity-50', child && 'bg-[#FBFAF7]')}>
                    <td className={cx(child && '!pl-14')}>
                      {child ? (
                        <div>
                          <p className="font-semibold text-ink">{variantLabel(i) || i.name}</p>
                          {i.sku && <p className="text-xs text-ink-soft/50">{i.sku}</p>}
                        </div>
                      ) : (
                      <div className="flex items-center gap-2.5">
                        {productImage(i.sku) ? (
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F3EF]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={productImage(i.sku)!} alt="" className="h-8 w-8 object-contain" loading="lazy" />
                            <span className="absolute -left-1 top-2 h-6 w-1 rounded-full" style={{ backgroundColor: colorOf(BRANDS, i.brand) }} />
                          </span>
                        ) : (
                          <span className="h-8 w-1 rounded-full" style={{ backgroundColor: colorOf(BRANDS, i.brand) }} />
                        )}
                        <div>
                          <p className="font-semibold text-ink">{i.label}</p>
                          <p className="text-xs text-ink-soft/50">
                            {label(BRANDS, i.brand)}
                            {i.sku ? ` · ${i.sku}` : ''}
                          </p>
                        </div>
                      </div>
                      )}
                    </td>
                    <td className="text-right">{cell(i.stock.depo)}</td>
                    <td className="text-right">{cell(i.stock.yolda)}</td>
                    <td className="text-right">{cell(i.stock.amazon)}</td>
                    <td className="text-right">
                      <b className={cx('font-display text-base tabular-nums', i.total < 0 && 'text-[#d03b3b]')}>{num(i.total)}</b>
                      <span className="ml-1 text-xs text-ink-soft/50">{i.unit}</span>
                    </td>
                    <td className="whitespace-nowrap text-right text-ink-soft tabular-nums">
                      {i.cost ? tl(i.cost, true) : <span className="text-[#b07a00]">maliyet yok</span>} / {tl(i.price, true)}
                    </td>
                    <td className="text-right tabular-nums">{margin === null ? '—' : <span className={margin < 0.25 ? 'font-bold text-[#b83030]' : ''}>{pct(margin * 100)}</span>}</td>
                    <td>
                      {low ? (
                        <StatusPill tone="critical">Kritik</StatusPill>
                      ) : days === null ? (
                        <StatusPill tone="neutral">Satış yok</StatusPill>
                      ) : days < 14 ? (
                        <StatusPill tone="warning">~{Math.floor(days)} gün</StatusPill>
                      ) : (
                        <StatusPill tone="good">~{Math.floor(days)} gün</StatusPill>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setAdjust(i)} title="Stok düzelt">
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setItemForm(i)} title="Ürünü düzenle">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
}

function Movements({ items }: { items: ItemWithStock[] }) {
  const mv = Q.movements()
  const { byId } = useAuth()
  const [kind, setKind] = useState('all')
  const [loc, setLoc] = useState<'all' | LocationId>('all')
  const page = useShowMore(60)
  const all = (mv.data ?? []).filter((m) => (kind === 'all' || m.kind === kind) && (loc === 'all' || m.location_id === loc))
  const list = all.slice(0, page.n)
  const it = (id: string) => items.find((x) => x.id === id)
  const source = (m: (typeof list)[number]) =>
    m.sale_item_id ? 'Satıştan otomatik' : m.purchase_item_id ? 'Alımdan otomatik' : m.shipment_item_id ? 'Sevkiyattan otomatik' : 'Elle girildi'
  return (
    <Card pad={false}>
      <div className="flex flex-wrap gap-2 px-5 pt-4">
        <div className="w-56">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10">
          <option value="all">Tüm hareketler</option>
          {Object.entries(MOVEMENT_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        </div>
        <div className="w-48">
        <Select value={loc} onChange={(e) => setLoc(e.target.value as any)} className="h-10">
          <option value="all">Tüm yerler</option>
          {LOCATIONS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </Select>
        </div>
      </div>
      <div className="pt-3">
        {mv.loading ? (
          <Skeleton className="m-5 h-40" />
        ) : list.length === 0 ? (
          <div className="p-5">
            <Empty title="Hareket yok" />
          </div>
        ) : (
          <Table
            head={
              <tr>
                <th>Tarih</th>
                <th>Ürün</th>
                <th>Yer</th>
                <th>Hareket</th>
                <th className="text-right">Miktar</th>
                <th>Kaynak</th>
                <th>Kim</th>
              </tr>
            }
          >
            {list.map((m) => {
              const u = byId(m.created_by)
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-ink-soft">{dateTR(m.moved_at)}</td>
                  <td className="font-medium text-ink">{it(m.item_id)?.label ?? '…'}</td>
                  <td className="text-ink-soft">{label(LOCATIONS, m.location_id)}</td>
                  <td>{MOVEMENT_KINDS[m.kind] ?? m.kind}</td>
                  <td className={cx('text-right font-bold tabular-nums', Number(m.qty) > 0 ? 'text-[#0a7d0a]' : 'text-[#b83030]')}>
                    {Number(m.qty) > 0 ? '+' : ''}
                    {num(m.qty)}
                  </td>
                  <td className="text-xs text-ink-soft/70">
                    {source(m)}
                    {m.note && <p className="text-ink-soft">{m.note}</p>}
                  </td>
                  <td>
                    <UserDot name={u?.full_name} color={u?.color} />
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
        <ShowMore shown={list.length} total={all.length} onMore={page.more} />
      </div>
    </Card>
  )
}

function ItemForm({ item: given, onClose }: { item: ItemWithStock | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  // id'si boş gelen kayıt = mevcut modele yeni varyant (ad, marka, fiyat dolu gelir)
  const item = given?.id ? given : null
  const preset = given
  const [f, setF] = useState({
    name: preset?.name ?? '',
    brand: (preset?.brand ?? 'kumas') as Brand,
    variant: item?.variant ?? '',
    color: preset?.color ?? '',
    sku: item?.sku ?? '',
    unit: preset?.unit ?? 'metre',
    cost: preset ? String(preset.cost) : '',
    price: preset ? String(preset.price) : '',
    min_stock: preset ? String(preset.min_stock) : '',
    active: item?.active ?? true,
    notes: item?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    // Yeni üründe "36-37, 37-38, 38-39" gibi virgülle yazılırsa her numara ayrı varyant açılır
    const variants = item ? [f.variant.trim()] : f.variant.split(',').map((v) => v.trim()).filter(Boolean)
    if (variants.length > 1) {
      const rows = variants.map((v) => ({
        name: f.name.trim(),
        brand: f.brand,
        variant: v,
        color: f.color.trim() || null,
        sku: f.sku.trim() ? `${f.sku.trim()}-${v.replace(/[^0-9A-Za-z]/g, '')}${f.color.trim() ? `-${f.color.trim().slice(0, 3).toUpperCase()}` : ''}` : null,
        unit: f.unit,
        cost: Number(f.cost) || 0,
        price: Number(f.price) || 0,
        min_stock: Number(f.min_stock) || 0,
        active: f.active,
        notes: f.notes || null,
      }))
      try {
        await write(supabase.from('items').insert(rows))
        invalidate(...AFTER.item)
        toast(`${rows.length} varyant açıldı. Açılış stoğunu "Toplu sayım"dan girebilirsiniz.`)
        onClose()
      } catch (err: any) {
        toast(err.message, 'error')
      } finally {
        setBusy(false)
      }
      return
    }
    const row = {
      name: f.name.trim(),
      brand: f.brand,
      variant: f.variant.trim() || null,
      color: f.color.trim() || null,
      sku: f.sku.trim() || null,
      unit: f.unit,
      cost: Number(f.cost) || 0,
      price: Number(f.price) || 0,
      min_stock: Number(f.min_stock) || 0,
      active: f.active,
      notes: f.notes || null,
    }
    try {
      await write(item ? supabase.from('items').update(row).eq('id', item.id) : supabase.from('items').insert(row))
      invalidate(...AFTER.item)
      toast(item ? 'Ürün güncellendi.' : 'Ürün eklendi. Açılış stoğunu "Toplu sayım"dan girebilirsiniz.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!item || !(await confirm('Ürün kartı silinsin mi?', 'Satış/alım kaydı olan ürünler silinemez; pasife alın.'))) return
    try {
      await write(supabase.from('items').delete().eq('id', item.id))
      invalidate(...AFTER.item)
      toast('Ürün silindi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={item ? 'Varyantı düzenle' : preset ? `${preset.name} · yeni varyant` : 'Yeni ürün kartı'}
      footer={
        <>
          {item && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="item-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as Brand, unit: e.target.value === 'kumas' ? 'metre' : 'adet' })}>
              {BRANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Birim">
            <Select value={f.unit} onChange={(e) => set({ unit: e.target.value as any })}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Ürün adı">
          <Input required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.brand === 'kumas' ? 'Alcantara' : 'Ürün adı'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={item ? 'Numara / varyant' : 'Numara / varyant'} hint={item ? 'Numara, gramaj, ebat…' : 'Birden çok numara için virgülle ayırın: 36-37, 37-38, 38-39'}>
            <Input value={f.variant} onChange={(e) => set({ variant: e.target.value })} placeholder={f.brand === 'kumas' ? '150 cm' : '40-41'} />
          </Field>
          <Field label="Renk" hint="Varsa. Aynı model farklı renkte ayrı varyant olur.">
            <Input value={f.color} onChange={(e) => set({ color: e.target.value })} placeholder={f.brand === 'kumas' ? 'Lacivert' : 'Siyah'} />
          </Field>
          <Field label="SKU / kod" hint={!item && f.variant.includes(',') ? 'Her numaraya sonuna numara eklenerek verilir.' : undefined}>
            <Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} />
          </Field>
          <Field label="Birim maliyet (₺)" hint="Alım girildikçe otomatik güncellenir.">
            <Input type="number" min="0" step="any" value={f.cost} onChange={(e) => set({ cost: e.target.value })} />
          </Field>
          <Field label="Satış fiyatı (₺)">
            <Input type="number" min="0" step="any" value={f.price} onChange={(e) => set({ price: e.target.value })} />
          </Field>
          <Field label="Kritik stok sınırı" hint="Bunun altına düşünce uyarı verir.">
            <Input type="number" min="0" step="any" value={f.min_stock} onChange={(e) => set({ min_stock: e.target.value })} />
          </Field>
          <Field label="Durum">
            <Select value={f.active ? '1' : '0'} onChange={(e) => set({ active: e.target.value === '1' })}>
              <option value="1">Aktif</option>
              <option value="0">Pasif (listelerde gizlenir)</option>
            </Select>
          </Field>
        </div>
        <Field label="Not">
          <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}

function AdjustForm({ items, preset, onClose }: { items: ItemWithStock[]; preset: ItemWithStock | null; onClose: () => void }) {
  const { toast } = useUi()
  const [f, setF] = useState({ item_id: preset?.id ?? '', location_id: 'depo' as LocationId, kind: 'sayim', dir: '-', qty: '', moved_at: today(), note: '' })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const it = items.find((i) => i.id === f.item_id)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = Number(f.qty)
    if (!f.item_id || !(q > 0)) return toast('Ürün ve miktar girin.', 'error')
    setBusy(true)
    try {
      await write(
        supabase.from('stock_movements').insert({
          item_id: f.item_id,
          location_id: f.location_id,
          qty: f.dir === '+' ? q : -q,
          kind: f.kind,
          moved_at: f.moved_at,
          note: f.note || null,
        }),
      )
      invalidate(...AFTER.stock)
      toast('Stok düzeltildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title="Stok düzelt"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="adj-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="adj-form" onSubmit={save} className="space-y-4">
        <Field label="Ürün">
          <ItemSelect items={items} value={f.item_id} onChange={(id) => set({ item_id: id })} required />
        </Field>
        {it && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {LOCATIONS.map((l) => (
              <div key={l.id} className={cx('rounded-xl bg-white p-2.5 ring-1', f.location_id === l.id ? 'ring-ink' : 'ring-line')}>
                <p className="text-xs text-ink-soft/60">{l.short}</p>
                <p className="font-display text-lg font-black">{num(it.stock[l.id])}</p>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Yer">
            <Select value={f.location_id} onChange={(e) => set({ location_id: e.target.value as LocationId })}>
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Neden">
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value, dir: e.target.value === 'acilis' ? '+' : f.dir })}>
              {['acilis', 'sayim', 'fire', 'numune', 'iade'].map((k) => (
                <option key={k} value={k}>
                  {MOVEMENT_KINDS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Yön">
            <Segmented value={f.dir} onChange={(v) => set({ dir: v })} options={[{ id: '+', label: '+ Ekle' }, { id: '-', label: '− Çıkar' }]} />
          </Field>
          <Field label={`Miktar${it ? ` (${it.unit})` : ''}`}>
            <Input type="number" min="0.01" step="any" required value={f.qty} onChange={(e) => set({ qty: e.target.value })} />
          </Field>
          <Field label="Tarih">
            <Input type="date" value={f.moved_at} onChange={(e) => set({ moved_at: e.target.value })} />
          </Field>
        </div>
        <Field label="Açıklama">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ör. 2 adet kutusu hasarlı geldi" />
        </Field>
      </form>
    </Drawer>
  )
}

/** Gerçek sayımı gir; sistem farkı hareket olarak yazar. */
function CountSheet({ items, onClose }: { items: ItemWithStock[]; onClose: () => void }) {
  const { toast } = useUi()
  const [brand, setBrand] = useState<'all' | Brand>('all')
  const [vals, setVals] = useState<Record<string, { depo?: string; amazon?: string }>>({})
  const [busy, setBusy] = useState(false)
  const list = items.filter((i) => i.active && (brand === 'all' || i.brand === brand))
  const diffs = Object.entries(vals).flatMap(([id, v]) => {
    const it = items.find((x) => x.id === id)
    if (!it) return []
    return (['depo', 'amazon'] as const)
      .filter((loc) => v[loc] !== undefined && v[loc] !== '' && Number(v[loc]) !== it.stock[loc])
      .map((loc) => ({ it, loc, diff: Number(v[loc]) - it.stock[loc] }))
  })
  const save = async () => {
    if (!diffs.length) return toast('Değişen sayım yok.', 'error')
    setBusy(true)
    try {
      await write(
        supabase.from('stock_movements').insert(
          diffs.map((d) => ({
            item_id: d.it.id,
            location_id: d.loc,
            qty: d.diff,
            kind: d.it.total === 0 && d.it.stock.depo === 0 && d.it.stock.amazon === 0 ? 'acilis' : 'sayim',
            note: 'Toplu sayım',
          })),
        ),
      )
      invalidate(...AFTER.stock)
      toast(`${diffs.length} stok kalemi güncellendi.`)
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title="Toplu sayım"
      footer={
        <>
          <p className="mr-auto text-sm text-ink-soft">{diffs.length} değişiklik</p>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy} disabled={!diffs.length}>
            Sayımı kaydet
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-thread/10 p-3.5 text-sm text-ink">
        Elinizdeki gerçek miktarları yazın. Boş bıraktıklarınız değişmez. Sistem farkı "sayım düzeltmesi" (ilk girişte "açılış stoğu") olarak kaydeder.
      </p>
      <div className="mb-3">
        <Segmented value={brand} onChange={setBrand} size="sm" options={[{ id: 'all', label: 'Tümü' }, ...BRANDS.map((b) => ({ id: b.id, label: b.label }))]} />
      </div>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
        <div className="grid grid-cols-[1fr_96px_96px] gap-2 border-b border-line px-4 py-2.5 text-xs font-semibold text-ink-soft/60">
          <span>Ürün (sistemde)</span>
          <span>Depo</span>
          <span>Amazon FBA</span>
        </div>
        {list.map((i) => (
          <div key={i.id} className="grid grid-cols-[1fr_96px_96px] items-center gap-2 border-b border-black/[0.04] px-4 py-2 last:border-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{i.label}</p>
              <p className="text-xs text-ink-soft/50">
                depo {num(i.stock.depo)} · FBA {num(i.stock.amazon)} {i.unit}
              </p>
            </div>
            {(['depo', 'amazon'] as const).map((loc) => (
              <Input
                key={loc}
                type="number"
                step="any"
                inputMode="decimal"
                className="h-9 px-2.5 text-sm"
                placeholder={num(i.stock[loc])}
                value={vals[i.id]?.[loc] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [i.id]: { ...v[i.id], [loc]: e.target.value } }))}
              />
            ))}
          </div>
        ))}
      </div>
    </Drawer>
  )
}

const COST_CHANNELS = ['amazon', 'trendyol', 'hepsiburada', 'seryn_site'] as const
const COST_HINTS: Record<string, string> = {
  amazon: 'Amazon satış komisyonu % ve adet başı FBA gönderim ücreti. Seller Central’daki ücret önizlemesinden bakabilirsiniz.',
  trendyol: 'Otomatik gelen Trendyol siparişlerinde komisyon Trendyol’dan gelir; buradaki % elle girilen satışlarda ve tahminde kullanılır.',
  hepsiburada: 'Hepsiburada komisyonu % ve adet başı kargo.',
  seryn_site: 'Ödeme altyapısı (PayTR vb.) kesintisi % ve adet başı kargo.',
}

/** Bir modelin satış kanalına göre adet başı net kârı. */
function NetProfit({ model, costs, onSetup }: { model: Model; costs: ChannelCost[] | undefined; onSetup: () => void }) {
  const i = model.items[0]
  const rows = COST_CHANNELS.map((ch) => {
    const c = costFor(costs, ch, model.name)
    if (!c) return null
    const fees = (i.price * Number(c.commission_pct)) / 100 + Number(c.fee_per_unit)
    return { ch, fees, net: i.price - i.cost - fees }
  }).filter(Boolean) as { ch: string; fees: number; net: number }[]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-soft">
      <span className="font-bold text-ink">Adet başı net kâr</span>
      {rows.length === 0 ? (
        <span>
          Komisyon ve kargo tanımlı değil.{' '}
          <button type="button" className="font-semibold text-ink underline" onClick={onSetup}>
            Kanal maliyetlerini gir
          </button>
        </span>
      ) : (
        rows.map((r) => (
          <span key={r.ch} title={`${tl(i.price)} satış − ${tl(i.cost)} maliyet − ${tl(r.fees)} komisyon/kargo`}>
            {label(CHANNELS, r.ch)}{' '}
            <b className={cx('tabular-nums', r.net < 0 ? 'text-[#b83030]' : 'text-ink')}>{tl(r.net)}</b>
            <span className="text-ink-soft/50"> (−{tl(r.fees)} gider)</span>
          </span>
        ))
      )}
      {!i.cost && <span className="text-[#b07a00]">Maliyet girilmemiş, kâr fazla görünür.</span>}
    </div>
  )
}

/** Modeldeki bütün numaralara aynı fiyat / maliyet / kritik sınır. */
function ModelForm({ model, onClose, onAddVariant }: { model: Model; onClose: () => void; onAddVariant: () => void }) {
  const { toast } = useUi()
  const first = model.items[0]
  const same = (k: 'price' | 'cost' | 'min_stock') => (model.items.every((i) => i[k] === first[k]) ? String(first[k]) : '')
  const [f, setF] = useState({ name: first.name, price: same('price'), cost: same('cost'), min_stock: same('min_stock') })
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const patch: Record<string, unknown> = {}
    if (f.name.trim() && f.name.trim() !== first.name) patch.name = f.name.trim()
    if (f.price !== '') patch.price = Number(f.price) || 0
    if (f.cost !== '') patch.cost = Number(f.cost) || 0
    if (f.min_stock !== '') patch.min_stock = Number(f.min_stock) || 0
    if (!Object.keys(patch).length) return onClose()
    setBusy(true)
    try {
      await write(supabase.from('items').update(patch).in('id', model.items.map((i) => i.id)))
      invalidate(...AFTER.item)
      toast(`${model.items.length} varyant güncellendi.`)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${model.name} · model`}
      footer={
        <>
          <Button variant="secondary" className="mr-auto" icon={<Plus className="h-4 w-4" />} onClick={onAddVariant}>
            Numara / renk ekle
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="model-form" type="submit" loading={busy}>
            Hepsine uygula
          </Button>
        </>
      }
    >
      <form id="model-form" onSubmit={save} className="space-y-4">
        <p className="rounded-xl bg-[#F7F6F2] p-3 text-sm text-ink-soft">
          Buraya yazdığınız değer bu modelin <b className="text-ink">{model.items.length} varyantının</b> hepsine yazılır. Boş bıraktığınız alan değişmez. Tek bir numarayı ayrı düzenlemek için listede o numaranın kalemine basın.
        </p>
        <Field label="Model adı" hint="Değiştirirseniz bütün varyantların adı değişir.">
          <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Satış fiyatı (₺)" hint={same('price') ? undefined : 'Varyantlarda farklı fiyat var.'}>
            <Input type="number" min="0" step="any" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="karışık" />
          </Field>
          <Field label="Birim maliyet (₺)" hint={same('cost') ? undefined : 'Varyantlarda farklı maliyet var.'}>
            <Input type="number" min="0" step="any" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="karışık" />
          </Field>
          <Field label="Kritik stok sınırı (her varyant için)">
            <Input type="number" min="0" step="any" value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} placeholder="karışık" />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Varyantlar</p>
          <div className="flex flex-wrap gap-1.5">
            {model.items.map((i) => (
              <span key={i.id} className={cx('rounded-lg bg-[#F4F3EF] px-2.5 py-1 text-xs font-semibold', !i.active && 'opacity-50')}>
                {variantLabel(i) || '—'} · <span className="tabular-nums">{num(i.total)}</span>
              </span>
            ))}
          </div>
        </div>
      </form>
    </Drawer>
  )
}

/** Kanal başına (ve isteğe bağlı model başına) komisyon % ve adet başı kargo / FBA ücreti. */
function CostsDrawer({ items, costs, onClose }: { items: ItemWithStock[]; costs: ChannelCost[]; onClose: () => void }) {
  const { toast } = useUi()
  const models = groupModels(items.filter((i) => i.active))
  const keyOf = (ch: string, model: string | null) => `${ch}|${model ?? ''}`
  const initial = () => {
    const m: Record<string, { pct: string; fee: string }> = {}
    costs.forEach((c) => (m[keyOf(c.channel, c.model)] = { pct: String(Number(c.commission_pct)), fee: String(Number(c.fee_per_unit)) }))
    return m
  }
  const [v, setV] = useState(initial)
  const [ch, setCh] = useState<(typeof COST_CHANNELS)[number]>('amazon')
  const [busy, setBusy] = useState(false)
  const val = (model: string | null) => v[keyOf(ch, model)] ?? { pct: '', fee: '' }
  const put = (model: string | null, p: Partial<{ pct: string; fee: string }>) => setV((x) => ({ ...x, [keyOf(ch, model)]: { ...val(model), ...p } }))

  const save = async () => {
    setBusy(true)
    try {
      for (const [k, x] of Object.entries(v)) {
        const [channel, m] = k.split('|')
        const model = m || null
        const ex = costs.find((c) => c.channel === channel && (c.model ?? '') === (model ?? ''))
        const empty = x.pct === '' && x.fee === ''
        if (empty) {
          if (ex) await write(supabase.from('channel_costs').delete().eq('id', ex.id))
          continue
        }
        const row = { channel, model, commission_pct: Number(x.pct) || 0, fee_per_unit: Number(x.fee) || 0 }
        if (ex) {
          if (Number(ex.commission_pct) !== row.commission_pct || Number(ex.fee_per_unit) !== row.fee_per_unit) await write(supabase.from('channel_costs').update(row).eq('id', ex.id))
        } else await write(supabase.from('channel_costs').insert(row))
      }
      invalidate(...AFTER.costs)
      toast('Kanal maliyetleri kaydedildi. Yeni satışlarda komisyon ve kargo otomatik hesaplanır.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const general = val(null)
  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title="Kanal maliyetleri"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-soft">
        Her kanal için bir kez girin: satış girerken ve pazaryeri senkronunda komisyon ile kargo otomatik hesaplanır, Stok’taki tahmini kâr ve adet başı net kâr da bundan çıkar. Modele özel değer girmezseniz “Bütün ürünler” satırı kullanılır.
      </p>
      <Segmented value={ch} onChange={setCh} size="sm" options={COST_CHANNELS.map((c) => ({ id: c, label: label(CHANNELS, c) }))} />
      <p className="mt-3 text-xs text-ink-soft/70">{COST_HINTS[ch]}</p>
      <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
        <div className="grid grid-cols-[1fr_96px_112px_100px] items-center gap-2 bg-[#F7F6F2] px-3 py-2 text-xs font-semibold text-ink-soft/70">
          <span>Ürün</span>
          <span>Komisyon %</span>
          <span>{ch === 'amazon' ? 'FBA/kargo ₺/adet' : 'Kargo ₺/adet'}</span>
          <span className="text-right">Net kâr/adet</span>
        </div>
        {[null, ...models].map((m) => {
          const name = m ? m.name : null
          const x = val(name)
          const eff = x.pct !== '' || x.fee !== '' ? x : name ? general : x
          const i = m?.items[0]
          const net = i && (eff.pct !== '' || eff.fee !== '') ? i.price - i.cost - (i.price * (Number(eff.pct) || 0)) / 100 - (Number(eff.fee) || 0) : null
          return (
            <div key={name ?? 'all'} className={cx('grid grid-cols-[1fr_96px_112px_100px] items-center gap-2 border-t border-line px-3 py-2', !m && 'bg-[#FBFAF7]')}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{m ? m.name : 'Bütün ürünler'}</p>
                {m && <p className="text-xs text-ink-soft/50">{tl(m.items[0].price, true)} satış · {m.items[0].cost ? tl(m.items[0].cost, true) : 'maliyet yok'}</p>}
              </div>
              <Input type="number" min="0" max="99" step="any" className="h-9" value={x.pct} placeholder={m && general.pct !== '' ? general.pct : '0'} onChange={(e) => put(name, { pct: e.target.value })} />
              <Input type="number" min="0" step="any" className="h-9" value={x.fee} placeholder={m && general.fee !== '' ? general.fee : '0'} onChange={(e) => put(name, { fee: e.target.value })} />
              <span className={cx('text-right text-sm font-bold tabular-nums', net !== null && net < 0 ? 'text-[#b83030]' : 'text-ink')}>{net === null ? '—' : tl(net, true)}</span>
            </div>
          )
        })}
      </div>
    </Drawer>
  )
}
