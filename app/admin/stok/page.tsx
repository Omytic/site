'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Boxes, ChevronRight, ClipboardCheck, Percent, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS, CHANNELS, colorOf, label, LOCATIONS, MOVEMENT_KINDS, productImage, SERIES, UNITS, type Brand, type LocationId } from '@/lib/panel/constants'
import { AFTER, costFor, estimateStock, groupModels, invalidate, modelTitle, Q, useItemsWithStock, variantLabel, write, type ChannelCost, type ItemWithStock, type Model } from '@/lib/panel/data'
import { addDays, dateTR, norm, num, pct, tl, today } from '@/lib/panel/format'
import { coverDays, velocities } from '@/lib/panel/insights'
import { HBars, ShareBar } from '@/components/panel/charts'
import { ItemSelect, useOpenFromQuery } from '@/components/panel/forms'
import { ItemForm } from '@/components/panel/ItemForm'
import { CostsDrawer, NetProfit } from '@/components/panel/costs'
import { useRouter, useSearchParams } from 'next/navigation'
import { ReorderTab } from '@/components/panel/ReorderTab'
import { Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, PageHeader, SearchBox, Segmented, Select, ShowMore, Skeleton, Stat, StatusPill, Table, Textarea, UserDot, useShowMore, useUi } from '@/components/panel/ui'

type Tab = 'urunler' | 'siparis' | 'hareketler'

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
  const router = useRouter()
  const [costsOpen, setCostsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const channelCosts = Q.channelCosts()
  useOpenFromQuery(() => setItemForm('new'))
  // Genel bakıştan gelen kısayollar: ?sekme=siparis, ?sayim=1, ?maliyet=1
  const params = useSearchParams()
  useEffect(() => {
    const t = params.get('sekme')
    if (t === 'siparis' || t === 'hareketler') setTab(t)
    if (params.get('sayim') === '1') setCount(true)
    if (params.get('maliyet') === '1') setCostsOpen(true)
    if (params.get('sayim') || params.get('maliyet')) router.replace(window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

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
        subtitle="Satış, alım ve sevkiyat girildikçe stok kendiliğinden değişir. Buraya sadece sayım ve fire girilir."
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
              ? `${tl(est.fees)} komisyon ve kargo, ${tl(est.vat)} KDV ve stopaj düşüldü${est.coverage < 0.95 ? ` · kanal maliyeti stoğun %${Math.round(est.coverage * 100)}'i için var` : ''}`
              : `${tl(est.vat)} KDV düşüldü · kanal maliyeti girilince komisyon ve kargo da düşülür`
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
                : activeModels.slice(0, 6).map((m, k) => ({ id: m.key, label: modelTitle(m), color: SERIES[k], value: m.items.reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0) }))
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
          <Segmented value={tab} onChange={setTab} options={[{ id: 'urunler', label: 'Ürünler' }, { id: 'siparis', label: 'Sipariş önerisi' }, { id: 'hareketler', label: 'Hareketler' }]} />
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

      {tab === 'siparis' ? (
        <ReorderTab items={active} lines={lines.data ?? []} loading={loading || lines.loading} />
      ) : tab === 'urunler' ? (
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
              {models.flatMap((m) => {
                if (m.brand === 'seryn') return m.items.map((i) => <ItemRow key={i.id} i={i} vel={vel} onAdjust={setAdjust} onEdit={setItemForm} />)
                const grouped = m.items.length > 1
                if (!grouped) return [<ItemRow key={m.key} i={m.items[0]} vel={vel} onAdjust={setAdjust} onEdit={setItemForm} />]
                const isOpen = expanded.has(m.key) || !!q
                const v = m.items.reduce((a, i) => a + (vel.get(i.id)?.total ?? 0), 0)
                const days = coverDays(m.total, v)
                const lows = m.items.filter((i) => i.active && i.min_stock > 0 && i.total <= i.min_stock)
                const prices = Array.from(new Set(m.items.map((i) => i.price)))
                const costs = Array.from(new Set(m.items.map((i) => i.cost)))
                const price = prices.length === 1 ? prices[0] : null
                const cost = costs.length === 1 ? costs[0] : null
                const vat0 = m.items[0].vat_rate ?? 20
                const margin = price && cost ? (price / (1 + vat0 / 100) - cost) / (price / (1 + vat0 / 100)) : null
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
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/urunler?model=${encodeURIComponent(m.key)}`)} title="Ürün sayfası: fiyat, maliyet, KDV, numara / renk ekle">
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
      {costsOpen && items && <CostsDrawer items={items} costs={channelCosts.data ?? []} onClose={() => setCostsOpen(false)} />}
    </>
  )
}


const qtyCell = (n: number) => <span className={cx('tabular-nums', n < 0 ? 'font-bold text-[#d03b3b]' : n === 0 ? 'text-ink-soft/40' : '')}>{num(n)}</span>

function ItemRow({ i, vel, onAdjust, onEdit, child }: { i: ItemWithStock; vel: Map<string, { total: number }>; onAdjust: (i: ItemWithStock) => void; onEdit: (i: ItemWithStock) => void; child?: boolean }) {
  const v = vel.get(i.id)?.total ?? 0
  const days = coverDays(i.total, v)
  const low = i.min_stock > 0 && i.total <= i.min_stock
  const net = i.price / (1 + (i.vat_rate ?? 20) / 100)
  const margin = i.price > 0 && i.cost > 0 ? (net - i.cost) / net : null
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
                          <p className="font-semibold text-ink">{i.brand === 'seryn' ? i.variant || i.name : i.label}</p>
                          <p className="text-xs text-ink-soft/50">
                            {i.brand === 'seryn' ? i.name : label(BRANDS, i.brand)}
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

