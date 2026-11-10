'use client'

import { useMemo, useState } from 'react'
import { Boxes, ClipboardCheck, Pencil, Plus, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS, colorOf, label, LOCATIONS, MOVEMENT_KINDS, UNITS, type Brand, type LocationId } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, useItemsWithStock, write, type ItemWithStock } from '@/lib/panel/data'
import { dateTR, norm, num, pct, tl, today } from '@/lib/panel/format'
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
  useOpenFromQuery(() => setItemForm('new'))

  const vel = useMemo(() => velocities(lines.data ?? [], 30), [lines.data])
  const list = useMemo(
    () =>
      (items ?? []).filter(
        (i) => (showPassive || i.active) && (brand === 'all' || i.brand === brand) && (!q || norm(`${i.label} ${i.sku ?? ''}`).includes(norm(q))),
      ),
    [items, brand, q, showPassive],
  )

  const active = (items ?? []).filter((i) => i.active)
  const value = active.reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0)
  const retail = active.reduce((a, i) => a + Math.max(0, i.total) * i.price, 0)
  const critical = active.filter((i) => i.min_stock > 0 && i.total <= i.min_stock)
  const negative = active.filter((i) => i.stock.depo < 0 || i.stock.amazon < 0 || i.stock.yolda < 0)

  return (
    <>
      <PageHeader
        title="Stok"
        subtitle="Stok satış, alım ve sevkiyatlardan otomatik hesaplanır. Buradan sadece ürün kartı, sayım ve fire girersiniz."
        actions={
          <>
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Stok değeri (maliyet)" value={tl(value)} sub={`satış fiyatıyla ${tl(retail)}`} />
        <Stat label="Aktif ürün" value={num(active.length)} sub={`${BRANDS.filter((b) => active.some((i) => i.brand === b.id)).length} marka`} />
        <Stat label="Kritik stok" value={num(critical.length)} sub="alt sınırda ya da altında" />
        <Stat label="Eksi stok" value={num(negative.length)} sub={negative.length ? 'sayım gerekli' : 'sorun yok'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Stok değeri, marka bazında">
          <ShareBar
            parts={BRANDS.map((b) => ({ id: b.id, label: b.label, color: b.color, value: active.filter((i) => i.brand === b.id).reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0) }))}
            format={(v) => tl(v)}
          />
        </Card>
        <Card title="Stok nerede?">
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
          {tab === 'urunler' && (
            <Segmented value={brand} onChange={setBrand} size="sm" options={[{ id: 'all', label: 'Tümü' }, ...BRANDS.map((b) => ({ id: b.id, label: b.label }))]} />
          )}
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
          ) : list.length === 0 ? (
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
              {list.map((i) => {
                const v = vel.get(i.id)?.total ?? 0
                const days = coverDays(i.total, v)
                const low = i.min_stock > 0 && i.total <= i.min_stock
                const margin = i.price > 0 && i.cost > 0 ? (i.price - i.cost) / i.price : null
                const cell = (n: number) => <span className={cx('tabular-nums', n < 0 ? 'font-bold text-[#d03b3b]' : n === 0 ? 'text-ink-soft/40' : '')}>{num(n)}</span>
                return (
                  <tr key={i.id} className={cx(!i.active && 'opacity-50')}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="h-8 w-1 rounded-full" style={{ backgroundColor: colorOf(BRANDS, i.brand) }} />
                        <div>
                          <p className="font-semibold text-ink">{i.label}</p>
                          <p className="text-xs text-ink-soft/50">
                            {label(BRANDS, i.brand)}
                            {i.sku ? ` · ${i.sku}` : ''}
                          </p>
                        </div>
                      </div>
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
    </>
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

function ItemForm({ item, onClose }: { item: ItemWithStock | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    name: item?.name ?? '',
    brand: (item?.brand ?? 'kumas') as Brand,
    variant: item?.variant ?? '',
    sku: item?.sku ?? '',
    unit: item?.unit ?? 'metre',
    cost: item ? String(item.cost) : '',
    price: item ? String(item.price) : '',
    min_stock: item ? String(item.min_stock) : '',
    active: item?.active ?? true,
    notes: item?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const row = {
      name: f.name.trim(),
      brand: f.brand,
      variant: f.variant.trim() || null,
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
      title={item ? 'Ürünü düzenle' : 'Yeni ürün kartı'}
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
          <Field label="Varyant" hint="Numara, renk, gramaj…">
            <Input value={f.variant} onChange={(e) => set({ variant: e.target.value })} placeholder={f.brand === 'kumas' ? 'Lacivert' : '40-41'} />
          </Field>
          <Field label="SKU / kod">
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
