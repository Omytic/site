'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowLeft, Banknote, CreditCard, Landmark, Minus, PackageOpen, Plus, Receipt, ShoppingCart, Trash2, UserPlus, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS, colorOf, itemImage } from '@/lib/panel/constants'
import { AFTER, groupModels, invalidate, Q, useItemsWithStock, variantLabel, write, type ItemWithStock, type Model, type SaleLine } from '@/lib/panel/data'
import { dateTR, num, sum, tl, today } from '@/lib/panel/format'
import { LinesEditor, type Line } from '@/components/panel/forms'
import { Button, Card, cx, Drawer, Empty, Field, Input, Segmented, Select, Skeleton, Stat, Textarea, useUi } from '@/components/panel/ui'

const PAY = [
  { id: 'nakit', label: 'Nakit', icon: Banknote },
  { id: 'kart', label: 'Kart', icon: CreditCard },
  { id: 'havale', label: 'Havale', icon: Landmark },
] as const
const EXPENSE_KINDS = ['Stand ücreti', 'Yol', 'Konaklama', 'Yemek', 'Baskı / afiş / roll-up', 'Kargo', 'Personel', 'Diğer']

type CartLine = { item: ItemWithStock; qty: number; price: number }

export default function FairPage() {
  const { id } = useParams<{ id: string }>()
  const fairs = Q.fairs()
  const fair = (fairs.data ?? []).find((f) => f.id === id)
  const items = useItemsWithStock()
  const lines = Q.saleLines()
  const fairItems = Q.fairItems()
  const txs = Q.transactions()
  const leads = Q.leads()
  const [tab, setTab] = useState<'kasa' | 'urunler' | 'giderler' | 'kisiler'>('kasa')

  const all = items.data ?? []
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all])
  const sold = useMemo(() => (lines.data ?? []).filter((l) => l.fair_id === id && l.status === 'tamamlandi'), [lines.data, id])
  const taken = (fairItems.data ?? []).filter((f) => f.fair_id === id)
  const expenses = (txs.data ?? []).filter((t) => t.fair_id === id)
  const people = (leads.data ?? []).filter((l) => l.fair_id === id)

  const revenue = sum(sold, (l) => l.revenue)
  const cogs = sum(sold, (l) => l.cogs)
  const units = sum(sold, (l) => l.qty)
  const spent = sum(expenses, (t) => (t.direction === 'gider' ? t.amount : -t.amount))
  const net = revenue - cogs - spent
  const listTotal = sum(sold, (l) => (l.list_price ?? l.unit_price) * l.qty)
  const discountTotal = Math.max(0, listTotal - revenue)

  if (fairs.loading || items.loading) return <Skeleton className="h-96" />
  if (!fair) return <Empty title="Fuar bulunamadı" action={<Link href="/admin/fuarlar" className="font-semibold underline">Fuarlara dön</Link>} />

  return (
    <>
      <Link href="/admin/fuarlar" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft/60 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Fuarlar
      </Link>
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-black leading-tight text-ink sm:text-3xl">{fair.name}</h1>
        <p className="text-sm text-ink-soft/70">
          {dateTR(fair.start_date)} – {dateTR(fair.end_date)} · {[fair.city, fair.venue].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fuar cirosu" value={tl(revenue)} sub={`${num(units)} adet · ${num(new Set(sold.map((l) => l.sale_id)).size)} satış`} />
        <Stat label="Yapılan indirim" value={tl(discountTotal)} sub={listTotal > 0 ? `liste fiyatına göre %${Math.round((discountTotal / listTotal) * 100)}` : 'liste fiyatına göre'} />
        <Stat label="Fuar giderleri" value={tl(spent)} sub="stand, yol, konaklama…" />
        <Stat label="Net kâr" value={tl(net)} sub="ciro − ürün maliyeti − giderler" />
      </div>

      <div className="mb-4 mt-6 overflow-x-auto [scrollbar-width:none]">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'kasa', label: 'Kasa (satış gir)' },
            { id: 'urunler', label: `Götürülen ürünler${taken.length ? ` · ${taken.length}` : ''}` },
            { id: 'giderler', label: `Giderler${expenses.length ? ` · ${expenses.length}` : ''}` },
            { id: 'kisiler', label: `Tanıştıklarımız${people.length ? ` · ${people.length}` : ''}` },
          ]}
        />
      </div>

      {tab === 'kasa' && <Register fairId={id} fairEnd={fair.end_date} fairStart={fair.start_date} items={all} takenIds={taken.map((t) => t.item_id)} fairPrices={new Map(taken.filter((t) => t.price != null).map((t) => [t.item_id, Number(t.price)]))} sold={sold} byId={byId} />}
      {tab === 'urunler' && <Taken fairId={id} items={all} taken={taken} sold={sold} byId={byId} />}
      {tab === 'giderler' && <Expenses fairId={id} fairStart={fair.start_date} expenses={expenses} />}
      {tab === 'kisiler' && <People fairId={id} people={people} />}
    </>
  )
}

/* --------------------------------------------------------------------------------------------- */
/* Kasa: ürüne dokun → sepete eklenir, fiyat değiştirilebilir (indirim), ödeme şekli → Satışı kaydet */
/* --------------------------------------------------------------------------------------------- */
function Register({
  fairId,
  fairStart,
  fairEnd,
  items,
  takenIds,
  fairPrices,
  sold,
  byId,
}: {
  fairId: string
  fairStart: string
  fairEnd: string
  items: ItemWithStock[]
  takenIds: string[]
  fairPrices: Map<string, number>
  sold: SaleLine[]
  byId: Map<string, ItemWithStock>
}) {
  const { toast, confirm } = useUi()
  const [onlyTaken, setOnlyTaken] = useState(takenIds.length > 0)
  const [cart, setCart] = useState<CartLine[]>([])
  const [pay, setPay] = useState<string>('nakit')
  const [note, setNote] = useState('')
  const t = today()
  const [date, setDate] = useState(t < fairStart ? fairStart : t > fairEnd ? fairEnd : t)
  const [pick, setPick] = useState<Model | null>(null)
  const [busy, setBusy] = useState(false)

  const pool = items.filter((i) => i.active && (!onlyTaken || takenIds.includes(i.id)))
  const models = groupModels(pool)
  const priceOf = (i: ItemWithStock) => fairPrices.get(i.id) ?? Number(i.price)

  const add = (i: ItemWithStock) =>
    setCart((c) => {
      const ex = c.find((x) => x.item.id === i.id)
      return ex ? c.map((x) => (x.item.id === i.id ? { ...x, qty: x.qty + 1 } : x)) : [...c, { item: i, qty: 1, price: priceOf(i) }]
    })
  const total = sum(cart, (c) => c.qty * c.price)
  const listTotal = sum(cart, (c) => c.qty * Number(c.item.price))

  const save = async () => {
    if (!cart.length) return
    setBusy(true)
    try {
      await write(
        supabase.rpc('save_sale', {
          p_header: { channel: 'fuar', fair_id: fairId, sale_date: date, payment_method: pay, payment_status: 'odendi', note: note || null, commission: 0, shipping_cost: 0 },
          p_lines: cart.map((c) => ({
            item_id: c.item.id,
            qty: c.qty,
            unit_price: c.price,
            list_price: Number(c.item.price) || null,
            discount: Math.max(0, (Number(c.item.price) - c.price) * c.qty),
            location_id: 'depo',
          })),
        }),
      )
      invalidate(...AFTER.fair)
      toast(`Satış kaydedildi: ${tl(total)}`)
      setCart([])
      setNote('')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const undo = async (saleId: string) => {
    if (!(await confirm('Bu satış silinsin mi?', 'Ürünler stoğa geri döner.'))) return
    try {
      await write(supabase.from('sales').delete().eq('id', saleId))
      invalidate(...AFTER.fair)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  // Son satışlar: satış başına grupla, en yeni üstte
  const recent = useMemo(() => {
    const m = new Map<string, { id: string; at: string; date: string; pay: string | null; lines: SaleLine[] }>()
    sold.forEach((l) => {
      const e = m.get(l.sale_id) ?? { id: l.sale_id, at: l.created_at ?? '', date: l.sale_date, pay: l.payment_method ?? null, lines: [] }
      e.lines.push(l)
      m.set(l.sale_id, e)
    })
    return Array.from(m.values()).sort((a, b) => b.at.localeCompare(a.at))
  }, [sold])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
      <Card
        title="Ürüne dokunun"
        action={
          takenIds.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <input type="checkbox" checked={onlyTaken} onChange={(e) => setOnlyTaken(e.target.checked)} className="h-4 w-4 accent-[#0E1527]" />
              Sadece fuara götürdüklerimiz
            </label>
          )
        }
      >
        {models.length === 0 ? (
          <Empty title="Ürün yok" text="Önce “Götürülen ürünler” sekmesinden fuara götürdüğünüz ürünleri ekleyin." />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4 [&>*]:min-w-0">
            {models.map((m) => {
              const img = itemImage(m.items[0])
              const single = m.items.length === 1
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => (single ? add(m.items[0]) : setPick(m))}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white text-left ring-1 ring-black/[0.08] transition hover:-translate-y-0.5 hover:shadow-md hover:ring-black/20 active:translate-y-0"
                >
                  <div className="relative aspect-[4/3] w-full bg-[#F4F3EF]">
                    {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <PackageOpen className="absolute inset-0 m-auto h-8 w-8 text-ink-soft/25" />}
                    <span className="absolute left-2 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(BRANDS, m.brand) }} />
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{single ? m.items[0].label : m.name}</p>
                    <p className="mt-0.5 text-xs text-ink-soft/60">{single ? tl(priceOf(m.items[0])) : `${m.items.length} çeşit · numara/renk seç`}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <div className="space-y-4" id="sepet">
        <Card
          title={
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-ink-soft/60" /> Sepet
            </span>
          }
          action={cart.length > 0 && <button onClick={() => setCart([])} className="text-xs font-semibold text-ink-soft/50 hover:text-ink">Temizle</button>}
        >
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft/55">Soldan ürüne dokunun, sepete eklensin.</p>
          ) : (
            <ul className="divide-y divide-line">
              {cart.map((c) => {
                const off = Number(c.item.price) - c.price
                return (
                  <li key={c.item.id} className="flex items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.item.label}</p>
                      {off > 0.009 && <p className="text-[11px] font-semibold text-[#b26b00]">Liste {tl(c.item.price)} · {tl(off, true)} indirim</p>}
                    </div>
                    <div className="flex items-center rounded-lg ring-1 ring-black/10">
                      <button type="button" aria-label="Azalt" className="px-2 py-1.5" onClick={() => setCart((x) => x.flatMap((y) => (y.item.id === c.item.id ? (y.qty > 1 ? [{ ...y, qty: y.qty - 1 }] : []) : [y])))}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold tabular-nums">{c.qty}</span>
                      <button type="button" aria-label="Arttır" className="px-2 py-1.5" onClick={() => add(c.item)}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="relative w-24">
                      <Input
                        inputMode="decimal"
                        aria-label="Birim fiyat"
                        value={String(c.price)}
                        onChange={(e) => {
                          const v = Number(e.target.value.replace(',', '.'))
                          setCart((x) => x.map((y) => (y.item.id === c.item.id ? { ...y, price: Number.isFinite(v) ? v : 0 } : y)))
                        }}
                        className="h-9 pr-6 text-right text-sm tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft/50">₺</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-end justify-between">
              <span className="text-sm text-ink-soft/70">Toplam</span>
              <span className="text-right">
                {listTotal - total > 0.009 && <span className="mr-2 text-sm text-ink-soft/45 line-through">{tl(listTotal)}</span>}
                <b className="font-display text-3xl font-black tabular-nums">{tl(total)}</b>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {PAY.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPay(p.id)}
                  className={cx('flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold ring-1 transition', pay === p.id ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
                >
                  <p.icon className="h-4 w-4" />
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı): müşteri, kampanya…" className="h-10 text-sm" />
              <Input type="date" value={date} min={fairStart} onChange={(e) => setDate(e.target.value)} className="h-10 w-[140px] text-sm" aria-label="Satış günü" />
            </div>
            <Button variant="gold" className="mt-3 h-12 w-full text-base" disabled={!cart.length} loading={busy} onClick={save}>
              Satışı kaydet {cart.length > 0 && `· ${tl(total)}`}
            </Button>
          </div>
        </Card>

        <Card title={`Bu fuardaki satışlar · ${recent.length}`}>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-soft/55">Henüz satış yok.</p>
          ) : (
            <ul className="max-h-[420px] space-y-1 overflow-y-auto">
              {recent.map((r) => {
                const tot = sum(r.lines, (l) => l.revenue)
                const at = r.at ? new Date(r.at) : null
                return (
                  <li key={r.id} className="group flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-[#FAF9F6]">
                    <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-ink-soft/55">
                      {at ? at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      <span className="block text-[10px] font-normal">{dateTR(r.date).slice(0, 6)}</span>
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      {r.lines.map((l, i) => (
                        <span key={i} className="block truncate">
                          <b>{num(l.qty)}×</b> {byId.get(l.item_id)?.label ?? l.name}
                          {l.list_price && Number(l.list_price) > Number(l.unit_price) + 0.009 && <span className="text-[11px] text-[#b26b00]"> · indirimli</span>}
                        </span>
                      ))}
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="block text-sm tabular-nums">{tl(tot)}</b>
                      <span className="text-[11px] text-ink-soft/55">{PAY.find((p) => p.id === r.pay)?.label ?? ''}</span>
                    </span>
                    <button type="button" onClick={() => undo(r.id)} aria-label="Satışı sil" className="mt-0.5 shrink-0 rounded-lg p-1 text-ink-soft/30 opacity-0 transition hover:bg-[#fdecec] hover:text-[#b83030] group-hover:opacity-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => document.getElementById('sepet')?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed inset-x-3 bottom-[84px] z-30 flex items-center justify-between rounded-2xl bg-night px-4 py-3 text-white shadow-xl xl:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4 text-thread" /> {sum(cart, (c) => c.qty)} ürün
          </span>
          <span className="font-display text-lg font-black">{tl(total)} · Sepete git</span>
        </button>
      )}
      <Drawer open={!!pick} onClose={() => setPick(null)} title={pick ? `${pick.name}: hangisi?` : ''}>
        {pick && (
          <div className="grid grid-cols-3 gap-2">
            {pick.items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  add(i)
                  setPick(null)
                }}
                className="rounded-xl bg-white px-2 py-3 text-center ring-1 ring-black/10 transition hover:bg-night hover:text-white"
              >
                <span className="block text-sm font-bold">{variantLabel(i) || i.label}</span>
                <span className="block text-[11px] opacity-60">{num(i.stock.depo)} depoda</span>
              </button>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  )
}

/* Götürülen ürünler: ne götürdük, ne sattık, ne geri gelmeli ------------------------------------- */
function Taken({ fairId, items, taken, sold, byId }: { fairId: string; items: ItemWithStock[]; taken: { id: string; item_id: string; qty_taken: number; price: number | null }[]; sold: SaleLine[]; byId: Map<string, ItemWithStock> }) {
  const { toast } = useUi()
  const [open, setOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const soldBy = new Map<string, number>()
  sold.forEach((l) => soldBy.set(l.item_id, (soldBy.get(l.item_id) ?? 0) + Number(l.qty)))
  const ids = Array.from(new Set([...taken.map((t) => t.item_id), ...Array.from(soldBy.keys())]))

  const save = async () => {
    const rows = lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ fair_id: fairId, item_id: l.item_id, qty_taken: Number(l.qty), price: l.price ? Number(l.price) : null }))
    if (!rows.length) return setOpen(false)
    try {
      await write(supabase.from('fair_items').upsert(rows, { onConflict: 'fair_id,item_id' }))
      invalidate(...AFTER.fair)
      setOpen(false)
      setLines([])
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const update = async (id: string, patch: Record<string, number | null>) => {
    try {
      await write(supabase.from('fair_items').update(patch).eq('id', id))
      invalidate('fair_items')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const remove = async (id: string) => {
    await write(supabase.from('fair_items').delete().eq('id', id)).catch((e) => toast(e.message, 'error'))
    invalidate('fair_items')
  }

  return (
    <Card
      pad={false}
      title="Fuara ne götürdük, ne sattık?"
      action={
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Ürün ekle
        </Button>
      }
    >
      <p className="px-5 pb-3 text-sm text-ink-soft/70">
        Götürdüğünüz adetleri girin; satılanlar kasadan kendiliğinden düşer. “Geri gelmeli” sütunu fuar dönüşü sayım için. Stok sadece satış olunca düşer.
      </p>
      {ids.length === 0 ? (
        <Empty title="Henüz ürün eklenmedi" text="Fuara götürdüğünüz ürünleri ve adetlerini ekleyin." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs font-semibold text-ink-soft/60">
                <th className="px-5 py-2.5">Ürün</th>
                <th className="px-3 py-2.5 text-right">Götürülen</th>
                <th className="px-3 py-2.5 text-right">Satılan</th>
                <th className="px-3 py-2.5 text-right">Geri gelmeli</th>
                <th className="px-3 py-2.5 text-right">Fuar fiyatı</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {ids.map((iid) => {
                const t = taken.find((x) => x.item_id === iid)
                const s = soldBy.get(iid) ?? 0
                const left = (t ? Number(t.qty_taken) : 0) - s
                const it = byId.get(iid)
                return (
                  <tr key={iid} className="border-b border-line/60">
                    <td className="px-5 py-2.5 font-semibold">{it?.label ?? '…'}</td>
                    <td className="px-3 py-2 text-right">
                      {t ? (
                        <Input inputMode="numeric" defaultValue={String(Number(t.qty_taken))} onBlur={(e) => Number(e.target.value) !== Number(t.qty_taken) && update(t.id, { qty_taken: Number(e.target.value) || 0 })} className="ml-auto h-8 w-20 text-right tabular-nums" />
                      ) : (
                        <span className="text-ink-soft/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{num(s)}</td>
                    <td className={cx('px-3 py-2.5 text-right tabular-nums', t && left < 0 ? 'font-bold text-[#b83030]' : '')}>{t ? num(left) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {t ? (
                        <Input inputMode="decimal" placeholder={it ? String(Number(it.price)) : ''} defaultValue={t.price != null ? String(Number(t.price)) : ''} onBlur={(e) => update(t.id, { price: e.target.value ? Number(e.target.value.replace(',', '.')) : null })} className="ml-auto h-8 w-24 text-right tabular-nums" />
                      ) : (
                        <span className="text-ink-soft/40">—</span>
                      )}
                    </td>
                    <td className="pr-3">{t && <button aria-label="Kaldır" onClick={() => remove(t.id)} className="rounded-lg p-1 text-ink-soft/30 hover:text-[#b83030]"><X className="h-4 w-4" /></button>}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="px-5 py-3">Toplam</td>
                <td className="px-3 py-3 text-right tabular-nums">{num(sum(taken, (t) => t.qty_taken))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{num(sum(Array.from(soldBy.values()), (v) => v))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{num(sum(taken, (t) => t.qty_taken) - sum(sold.filter((l) => taken.some((t) => t.item_id === l.item_id)), (l) => l.qty))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Fuara götürülen ürünler"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button onClick={save}>Kaydet</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-soft/70">Adetleri yazın. Fiyat boş kalırsa ürün kartındaki satış fiyatı kullanılır; fuara özel fiyat varsa yazın.</p>
        <LinesEditor pickTitle="Fuara ne götürdünüz? Ürünü seçin" items={items} lines={lines} setLines={setLines} priceLabel="Fuar fiyatı (isteğe bağlı)" stockFrom={() => 'depo'} />
      </Drawer>
    </Card>
  )
}

/* Giderler: Finans'a "Fuar / etkinlik" gideri olarak yazılır ------------------------------------- */
function Expenses({ fairId, fairStart, expenses }: { fairId: string; fairStart: string; expenses: { id: string; tx_date: string; amount: number; counterparty: string | null; note: string | null; direction: string; payment_status: string }[] }) {
  const { toast, confirm } = useUi()
  const [kind, setKind] = useState(EXPENSE_KINDS[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(fairStart)
  const [note, setNote] = useState('')
  const [paid, setPaid] = useState(true)
  const [busy, setBusy] = useState(false)
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = Number(amount.replace(/\./g, '').replace(',', '.'))
    if (!(v > 0)) return toast('Tutar girin.', 'error')
    setBusy(true)
    try {
      await write(
        supabase.from('transactions').insert({ tx_date: date, direction: 'gider', category: 'fuar', amount: v, brand: 'genel', counterparty: kind, note: note || null, fair_id: fairId, payment_status: paid ? 'odendi' : 'bekliyor' }),
      )
      invalidate(...AFTER.fair)
      setAmount('')
      setNote('')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async (id: string) => {
    if (!(await confirm('Gider silinsin mi?'))) return
    await write(supabase.from('transactions').delete().eq('id', id)).catch((e) => toast(e.message, 'error'))
    invalidate(...AFTER.fair)
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card title="Gider ekle">
        <form onSubmit={add} className="space-y-3">
          <Field label="Ne için?">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {EXPENSE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tutar (₺)">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
            <Field label="Tarih">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Not">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. 9 m² stand, 2 gece otel" />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-[#0E1527]" />
            Ödendi
          </label>
          <Button type="submit" loading={busy} className="w-full">
            Ekle
          </Button>
          <p className="text-xs text-ink-soft/55">Giderler Finans'ta “Fuar / etkinlik” olarak da görünür.</p>
        </form>
      </Card>
      <Card pad={false} title={`Giderler · ${tl(sum(expenses, (x) => x.amount))}`}>
        {expenses.length === 0 ? (
          <Empty title="Gider yok" text="Stand ücreti, yol, konaklama gibi masrafları soldan ekleyin." icon={<Receipt className="h-6 w-6" />} />
        ) : (
          <ul className="divide-y divide-line">
            {expenses.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-20 shrink-0 text-xs text-ink-soft/60">{dateTR(x.tx_date)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{x.counterparty ?? 'Gider'}</b>
                  {x.note && <span className="block truncate text-xs text-ink-soft/60">{x.note}</span>}
                </span>
                {x.payment_status === 'bekliyor' && <span className="rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">Ödenmedi</span>}
                <b className="tabular-nums">{tl(x.amount)}</b>
                <button aria-label="Sil" onClick={() => del(x.id)} className="rounded-lg p-1 text-ink-soft/30 hover:text-[#b83030]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* Fuarda tanıştıklarımız → Talepler'e düşer ----------------------------------------------------- */
function People({ fairId, people }: { fairId: string; people: { id: string; name: string; company: string | null; phone: string | null; message: string | null; status: string; kind: string }[] }) {
  const { toast } = useUi()
  const [f, setF] = useState({ name: '', company: '', phone: '', email: '', kind: 'toptan', message: '' })
  const [busy, setBusy] = useState(false)
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    try {
      await write(
        supabase.rpc('save_lead', {
          p_header: { source: 'fuar', fair_id: fairId, name: f.name.trim(), company: f.company || null, phone: f.phone || null, email: f.email || null, kind: f.kind, message: f.message || null },
          p_lines: [],
        }),
      )
      invalidate(...AFTER.leads)
      setF({ name: '', company: '', phone: '', email: '', kind: 'toptan', message: '' })
      toast('Eklendi. Talepler sayfasından takip edebilirsiniz.')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card title={<span className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-ink-soft/60" /> Kişi ekle</span>}>
        <form onSubmit={add} className="space-y-3">
          <Field label="Ad soyad">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Firma">
              <Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="E-posta">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Ne istiyor?">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="toptan">Toptan alım</option>
              <option value="bayi">Bayilik</option>
              <option value="numune">Numune</option>
              <option value="isbirligi">İş birliği</option>
              <option value="diger">Diğer</option>
            </Select>
          </Field>
          <Field label="Not">
            <Textarea rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="ör. 500 adet M100 fiyatı istedi, haftaya ara" />
          </Field>
          <Button type="submit" loading={busy} className="w-full">Ekle</Button>
        </form>
      </Card>
      <Card pad={false} title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-ink-soft/60" /> Bu fuarda tanıştıklarımız</span>} action={<Link href="/admin/talepler" className="text-xs font-semibold text-ink-soft/60 hover:text-ink">Talepler →</Link>}>
        {people.length === 0 ? (
          <Empty title="Henüz kimse eklenmedi" text="Kartvizit aldığınız herkesi buraya yazın; sonra Talepler'den takip edersiniz." />
        ) : (
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.id} className="px-5 py-3">
                <b className="text-sm">{p.name}</b>
                {p.company && <span className="text-sm text-ink-soft"> · {p.company}</span>}
                {p.phone && <span className="ml-2 text-xs text-ink-soft/60">{p.phone}</span>}
                {p.message && <p className="mt-0.5 text-xs text-ink-soft/70">{p.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
