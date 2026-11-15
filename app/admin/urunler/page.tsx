'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Boxes, Palette, Pencil, Plus, Ruler } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS, itemImage, label, type Brand } from '@/lib/panel/constants'
import { addVariants, AFTER, groupModels, invalidate, Q, useItemsWithStock, variantLabel, write, type ItemWithStock, type Model } from '@/lib/panel/data'
import { num, tl } from '@/lib/panel/format'
import { ItemForm } from '@/components/panel/ItemForm'
import { CostsDrawer, NetProfit } from '@/components/panel/costs'
import { Button, Card, cx, Empty, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton, Stat, StatusPill, Table, useUi } from '@/components/panel/ui'

/*
 * Ürünler: Tabanlıklar (FormStep) / SERYN / Kumaşlar.
 * Her model (FormStep M100, Alcantara…) kendi sayfasında: fiyat, maliyet ve KDV bütün varyantlara bir kerede,
 * yeni numara ve yeni renk (bütün numaralarıyla) eklenir. Alımlarda birim maliyet buradan gelir.
 */

const TABS: { id: Brand; label: string; add: string }[] = [
  { id: 'formstep', label: 'Tabanlıklar', add: 'Yeni tabanlık modeli' },
  { id: 'seryn', label: 'SERYN', add: 'Yeni SERYN ürünü' },
  { id: 'kumas', label: 'Kumaşlar', add: 'Kumaş ekle' },
  { id: 'diger', label: 'Diğer', add: 'Ürün ekle' },
]

export default function ProductsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Products />
    </Suspense>
  )
}

function Products() {
  const params = useSearchParams()
  const router = useRouter()
  const { data: items, loading, error } = useItemsWithStock()
  const [newItem, setNewItem] = useState(false)
  const modelKeyParam = params.get('model')
  const brand = (params.get('marka') as Brand) || (modelKeyParam?.split('|')[0] as Brand) || 'formstep'
  const setBrand = (b: Brand) => router.push(`/admin/urunler?marka=${b}`)

  const models = useMemo(() => groupModels((items ?? []).filter((i) => i.active || modelKeyParam)), [items, modelKeyParam])
  const model = modelKeyParam ? models.find((m) => m.key === modelKeyParam) : null
  const tab = TABS.find((t) => t.id === brand) ?? TABS[0]

  if (modelKeyParam) {
    if (loading) return <Skeleton className="h-60" />
    if (!model)
      return (
        <Empty
          title="Ürün bulunamadı"
          text="Adı değişmiş ya da silinmiş olabilir."
          action={
            <Button onClick={() => router.push(`/admin/urunler?marka=${brand}`)} variant="secondary">
              Ürünlere dön
            </Button>
          }
        />
      )
    return <ModelPage model={model} />
  }

  const list = models.filter((m) => m.brand === brand)
  return (
    <>
      <PageHeader
        title="Ürünler"
        subtitle="Her model kendi sayfasında: fiyat, maliyet ve KDV bütün numaralara bir kerede; yeni numara ve renk buradan eklenir. Alımlarda birim maliyet buradan gelir."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setNewItem(true)}>
            {tab.add}
          </Button>
        }
      />
      <ErrorNote message={error} />
      <div className="mb-4">
        <Segmented value={brand} onChange={setBrand} options={TABS.map((t) => ({ id: t.id, label: t.label }))} />
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty
          icon={<Boxes className="h-5 w-5" />}
          title={`${tab.label} henüz yok`}
          text={brand === 'kumas' ? 'Elinizdeki kumaşları ekleyin; mal alımında da “Listede yok: yeni ürün / kumaş ekle” ile anında eklenebilir.' : 'İlk ürünü ekleyin.'}
          action={<Button onClick={() => setNewItem(true)}>{tab.add}</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <ModelCard key={m.key} m={m} />
          ))}
        </div>
      )}
      {newItem && <ItemForm item={null} defaultBrand={brand} onClose={() => setNewItem(false)} />}
    </>
  )
}

const uniq = <T,>(a: T[]) => Array.from(new Set(a))
const sameOrNull = (m: Model, k: 'price' | 'cost' | 'vat_rate' | 'min_stock') => {
  const v = uniq(m.items.map((i) => Number(i[k] ?? 0)))
  return v.length === 1 ? v[0] : null
}

function ModelCard({ m }: { m: Model }) {
  const img = itemImage(m.items[0])
  const cost = sameOrNull(m, 'cost')
  const vat = sameOrNull(m, 'vat_rate')
  const price = sameOrNull(m, 'price')
  const sizes = uniq(m.items.map((i) => i.variant).filter(Boolean))
  const colors = uniq(m.items.map((i) => i.color).filter(Boolean))
  const lows = m.items.filter((i) => i.min_stock > 0 && i.total <= i.min_stock).length
  return (
    <Link href={`/admin/urunler?model=${encodeURIComponent(m.key)}`} className="group block">
      <Card className="h-full transition group-hover:ring-[#E3AB3B]">
        <div className="flex gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F4F3EF]">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className={cx('h-full w-full', m.brand === 'kumas' ? 'object-cover' : 'object-contain p-2')} />
            ) : (
              <Boxes className="h-8 w-8 text-ink-soft/30" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-black text-ink">{m.name}</p>
            <p className="text-xs text-ink-soft/60">
              {sizes.length > 0 && `${sizes.length} ${m.brand === 'kumas' ? 'tip' : 'numara'}`}
              {sizes.length > 0 && colors.length > 0 && ' · '}
              {colors.length > 0 && `${colors.length} renk`}
              {!sizes.length && !colors.length && label(BRANDS, m.brand)}
            </p>
            <p className="mt-2 font-display text-2xl font-black tabular-nums text-ink">
              {num(m.total)} <span className="text-sm font-semibold text-ink-soft/60">{m.items[0].unit}</span>
            </p>
            <p className="text-xs text-ink-soft/60">
              depo {num(m.stock.depo)} · FBA {num(m.stock.amazon)}
              {m.stock.yolda ? ` · yolda ${num(m.stock.yolda)}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-soft">
          <span>
            Maliyet{' '}
            <b className="text-ink">{cost === null ? 'karışık' : cost ? tl(cost, true) : <span className="text-[#b07a00]">yok</span>}</b>
            {cost ? ` + %${num(vat ?? 20)} KDV` : ''} · Satış <b className="text-ink">{price === null ? 'karışık' : tl(price, true)}</b>
          </span>
          {lows > 0 && <StatusPill tone="critical">{lows} kritik</StatusPill>}
        </div>
      </Card>
    </Link>
  )
}

function ModelPage({ model }: { model: Model }) {
  const router = useRouter()
  const { toast } = useUi()
  const costs = Q.channelCosts()
  const [costsOpen, setCostsOpen] = useState(false)
  const [edit, setEdit] = useState<ItemWithStock | null>(null)
  const first = model.items[0]
  const img = itemImage(first)
  const isFabric = model.brand === 'kumas'
  const sizes = uniq(model.items.map((i) => i.variant).filter(Boolean) as string[])
  const colors = uniq(model.items.map((i) => i.color ?? ''))

  // Fiyat ve maliyet: bütün varyantlara
  const init = () => {
    const c = sameOrNull(model, 'cost')
    const v = sameOrNull(model, 'vat_rate')
    return {
      name: first.name,
      price: sameOrNull(model, 'price')?.toString() ?? '',
      cost: c?.toString() ?? '',
      vat: (v ?? 20).toString(),
      costInc: c !== null ? (c * (1 + (v ?? 20) / 100)).toFixed(2).replace(/\.00$/, '') : '',
      min_stock: sameOrNull(model, 'min_stock')?.toString() ?? '',
    }
  }
  const [f, setF] = useState(init)
  const [busy, setBusy] = useState(false)
  const setCost = (cost: string) => setF((x) => ({ ...x, cost, costInc: cost === '' ? '' : ((Number(cost) || 0) * (1 + (Number(x.vat) || 0) / 100)).toFixed(2).replace(/\.00$/, '') }))
  const setCostInc = (costInc: string) => setF((x) => ({ ...x, costInc, cost: costInc === '' ? '' : ((Number(costInc) || 0) / (1 + (Number(x.vat) || 0) / 100)).toFixed(2).replace(/\.00$/, '') }))
  const setVat = (vat: string) => setF((x) => ({ ...x, vat, costInc: x.cost === '' ? '' : ((Number(x.cost) || 0) * (1 + (Number(vat) || 0) / 100)).toFixed(2).replace(/\.00$/, '') }))

  const saveAll = async (e: React.FormEvent) => {
    e.preventDefault()
    const patch: Record<string, unknown> = { vat_rate: Number(f.vat) || 0 }
    if (f.name.trim() && f.name.trim() !== first.name) patch.name = f.name.trim()
    if (f.price !== '') patch.price = Number(f.price) || 0
    if (f.cost !== '') patch.cost = Number(f.cost) || 0
    if (f.min_stock !== '') patch.min_stock = Number(f.min_stock) || 0
    setBusy(true)
    try {
      await write(supabase.from('items').update(patch).in('id', model.items.map((i) => i.id)))
      invalidate(...AFTER.item)
      toast(`${model.items.length} varyant güncellendi. Alımlarda bu maliyet kullanılacak.`)
      if (patch.name) router.replace(`/admin/urunler?model=${encodeURIComponent(`${model.brand}|${String(patch.name).toLocaleLowerCase('tr')}`)}`)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Yeni numara / yeni renk
  const [newSize, setNewSize] = useState('')
  const [newColor, setNewColor] = useState('')
  const [colorSizes, setColorSizes] = useState<string[]>(sizes)
  const [adding, setAdding] = useState<'size' | 'color' | null>(null)
  const add = async (kind: 'size' | 'color') => {
    try {
      setAdding(kind)
      let ids: string[] = []
      if (kind === 'size') {
        const vs = newSize.split(',').map((x) => x.trim()).filter(Boolean)
        if (!vs.length) return toast(isFabric ? 'Tip / ebat yazın.' : 'Numara yazın.', 'error')
        ids = await addVariants(model, vs, colors)
        setNewSize('')
      } else {
        const cs = newColor.split(',').map((x) => x.trim()).filter(Boolean)
        if (!cs.length) return toast('Renk yazın.', 'error')
        if (sizes.length && !colorSizes.length) return toast('En az bir numara seçin.', 'error')
        ids = await addVariants(model, sizes.length ? colorSizes : [], cs)
        setNewColor('')
      }
      toast(ids.length ? `${ids.length} yeni varyant eklendi. Stoğunu mal alımıyla ya da Stok → Toplu sayım ile girin.` : 'Bunlar zaten var.')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setAdding(null)
    }
  }
  const toggleActive = async (i: ItemWithStock) => {
    try {
      await write(supabase.from('items').update({ active: !i.active }).eq('id', i.id))
      invalidate(...AFTER.item)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  const lows = model.items.filter((i) => i.active && i.min_stock > 0 && i.total <= i.min_stock)
  const value = model.items.reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0)
  const retail = model.items.reduce((a, i) => a + Math.max(0, i.total) * i.price, 0)

  return (
    <>
      <button type="button" onClick={() => router.push(`/admin/urunler?marka=${model.brand}`)} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {TABS.find((t) => t.id === model.brand)?.label ?? 'Ürünler'}
      </button>

      <div className="mb-5 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white ring-1 ring-line">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={model.name} className={cx('h-full w-full', isFabric ? 'object-cover' : 'object-contain p-3')} />
          ) : (
            <Boxes className="h-10 w-10 text-ink-soft/30" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-soft/60">{label(BRANDS, model.brand)}</p>
          <h1 className="font-display text-4xl font-black tracking-tight text-ink">{model.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {sizes.length > 0 && `${sizes.length} ${isFabric ? 'tip' : 'numara'}`}
            {sizes.length > 0 && colors.filter(Boolean).length > 0 && ' · '}
            {colors.filter(Boolean).length > 0 && `${colors.filter(Boolean).length} renk`} · {model.items.length} varyant
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Toplam stok" value={`${num(model.total)} ${first.unit}`} sub={`depo ${num(model.stock.depo)} · FBA ${num(model.stock.amazon)}${model.stock.yolda ? ` · yolda ${num(model.stock.yolda)}` : ''}`} />
        <Stat label="Stok değeri · maliyet" value={tl(value)} sub="KDV hariç" />
        <Stat label="Stok değeri · satış fiyatıyla" value={tl(retail)} />
        <Stat label="Kritik varyant" value={num(lows.length)} sub={lows.length ? lows.map((i) => variantLabel(i)).slice(0, 4).join(', ') : 'yok'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Fiyat, maliyet ve KDV" action={<span className="text-xs text-ink-soft/60">{model.items.length} varyantın hepsine</span>}>
          <form onSubmit={saveAll} className="space-y-3">
            <Field label="Ürün / model adı">
              <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Birim maliyet, KDV hariç (₺)">
                <Input type="number" min="0" step="any" value={f.cost} placeholder="karışık" onChange={(e) => setCost(e.target.value)} />
              </Field>
              <Field label="KDV %">
                <Select value={f.vat} onChange={(e) => setVat(e.target.value)}>
                  {['0', '1', '10', '20'].map((v) => (
                    <option key={v} value={v}>
                      %{v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Birim maliyet, KDV dahil (₺)" hint="İkisinden birini yazmanız yeter.">
                <Input type="number" min="0" step="any" value={f.costInc} placeholder="karışık" onChange={(e) => setCostInc(e.target.value)} />
              </Field>
              <Field label={`Satış fiyatı (₺${isFabric ? ' / ' + first.unit : ''})`}>
                <Input type="number" min="0" step="any" value={f.price} placeholder="karışık" onChange={(e) => setF({ ...f, price: e.target.value })} />
              </Field>
              <Field label="Kritik stok sınırı" hint="Her varyant için ayrı ayrı.">
                <Input type="number" min="0" step="any" value={f.min_stock} placeholder="karışık" onChange={(e) => setF({ ...f, min_stock: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-ink-soft/60">Boş bıraktığınız alan değişmez.</p>
              <Button type="submit" loading={busy}>
                Hepsine kaydet
              </Button>
            </div>
          </form>
          <div className="mt-4 border-t border-line pt-3">
            <NetProfit model={model} costs={costs.data} onSetup={() => setCostsOpen(true)} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title={isFabric ? 'Yeni tip / ebat ekle' : 'Yeni numara ekle'}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[160px] flex-1">
                <span className="mb-1 block text-xs font-semibold text-ink-soft/60">{isFabric ? 'Tip / ebat' : 'Numara'} (birden çoksa virgülle)</span>
                <Input value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder={isFabric ? '150 cm, 180 cm' : '46-47'} />
              </label>
              <Button icon={<Ruler className="h-4 w-4" />} loading={adding === 'size'} onClick={() => add('size')}>
                Ekle
              </Button>
            </div>
            {colors.filter(Boolean).length > 0 && <p className="mt-2 text-xs text-ink-soft/60">Her renk için ayrı açılır: {colors.map((c) => c || 'renksiz').join(', ')}.</p>}
          </Card>

          <Card title="Yeni renk ekle">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[160px] flex-1">
                <span className="mb-1 block text-xs font-semibold text-ink-soft/60">Renk (birden çoksa virgülle)</span>
                <Input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="Lacivert" />
              </label>
              <Button icon={<Palette className="h-4 w-4" />} loading={adding === 'color'} onClick={() => add('color')}>
                Ekle
              </Button>
            </div>
            {sizes.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-ink-soft/60">Bu renkte hangi {isFabric ? 'tipler' : 'numaralar'} var?</p>
                <div className="flex flex-wrap gap-1.5">
                  {sizes.map((s) => {
                    const on = colorSizes.includes(s)
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setColorSizes((x) => (on ? x.filter((y) => y !== s) : [...x, s]))}
                        className={cx('rounded-lg px-2.5 py-1 text-xs font-bold ring-1 transition', on ? 'bg-[#E3AB3B]/15 text-ink ring-[#E3AB3B]' : 'bg-white text-ink-soft/50 ring-line')}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4" pad={false} title="Varyantlar" action={<span className="text-xs text-ink-soft/60">Tek bir numarayı ayrı fiyatlamak için kalem</span>}>
        <div className="pt-3">
          <Table
            head={
              <tr>
                <th>{isFabric ? 'Tip' : 'Numara'}</th>
                <th>Renk</th>
                <th className="text-right">Depo</th>
                <th className="text-right">Yolda</th>
                <th className="text-right">FBA</th>
                <th className="text-right">Toplam</th>
                <th className="text-right">Maliyet / Satış</th>
                <th>Durum</th>
                <th />
              </tr>
            }
          >
            {model.items.map((i) => {
              const low = i.active && i.min_stock > 0 && i.total <= i.min_stock
              const differs = i.cost !== Number(f.cost || i.cost) || i.price !== Number(f.price || i.price)
              const c = (n: number) => <span className={cx('tabular-nums', n < 0 ? 'font-bold text-[#d03b3b]' : n === 0 ? 'text-ink-soft/40' : '')}>{num(n)}</span>
              return (
                <tr key={i.id} className={cx(!i.active && 'opacity-50')}>
                  <td>
                    <p className="font-semibold text-ink">{i.variant || '—'}</p>
                    {i.sku && <p className="text-xs text-ink-soft/50">{i.sku}</p>}
                  </td>
                  <td className="text-ink-soft">{i.color || '—'}</td>
                  <td className="text-right">{c(i.stock.depo)}</td>
                  <td className="text-right">{c(i.stock.yolda)}</td>
                  <td className="text-right">{c(i.stock.amazon)}</td>
                  <td className="text-right">
                    <b className="font-display tabular-nums">{num(i.total)}</b>
                  </td>
                  <td className={cx('whitespace-nowrap text-right tabular-nums', differs ? 'font-semibold text-[#8a5a00]' : 'text-ink-soft')}>
                    {i.cost ? tl(i.cost, true) : '—'} / {tl(i.price, true)}
                  </td>
                  <td>
                    <button type="button" onClick={() => toggleActive(i)} title={i.active ? 'Pasife al (listelerde gizlenir)' : 'Aktif yap'}>
                      {!i.active ? <StatusPill tone="neutral">Pasif</StatusPill> : low ? <StatusPill tone="critical">Kritik</StatusPill> : <StatusPill tone="good">Aktif</StatusPill>}
                    </button>
                  </td>
                  <td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEdit(i)} title="Bu varyantı düzenle">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </Table>
        </div>
      </Card>

      {edit && <ItemForm item={edit} onClose={() => setEdit(null)} />}
      {costsOpen && <CostsDrawer items={model.items} costs={costs.data ?? []} onClose={() => setCostsOpen(false)} />}
    </>
  )
}
