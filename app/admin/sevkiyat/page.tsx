'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, PackageCheck, Pencil, Sparkles, Trash2, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { SHIPMENT_STATUS } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, useItemsWithStock, write, type ItemWithStock, type Shipment } from '@/lib/panel/data'
import { daysBetween, dateTR, monthKey, num, tl, today } from '@/lib/panel/format'
import { velocities } from '@/lib/panel/insights'
import { emptyLine, LinesEditor, realLines, useOpenFromQuery, type Line } from '@/components/panel/forms'
import { Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, PageHeader, Select, Skeleton, Stat, StatusPill, Table, Textarea, UserDot, useUi } from '@/components/panel/ui'

const COLS = [
  { id: 'hazirlaniyor', label: 'Hazırlanıyor', hint: 'Stok henüz depoda', next: 'yolda', nextLabel: 'Yola çıktı' },
  { id: 'yolda', label: 'Yolda', hint: "Depodan düştü, Amazon'a gidiyor", next: 'teslim_alindi', nextLabel: 'Teslim alındı' },
  { id: 'teslim_alindi', label: 'Teslim alındı', hint: 'Amazon FBA stoğunda', next: null, nextLabel: '' },
] as const

const qtyOf = (s: Shipment) => s.shipment_items.reduce((a, l) => a + Number(l.qty), 0)

export default function ShipmentsPage() {
  const shipments = Q.shipments()
  const lines = Q.saleLines()
  const { data: items } = useItemsWithStock()
  const { byId } = useAuth()
  const { toast, confirm } = useUi()
  const [editing, setEditing] = useState<Shipment | 'new' | null>(null)
  const [prefill, setPrefill] = useState<Line[] | null>(null)
  useOpenFromQuery(() => setEditing('new'))

  const all = shipments.data ?? []
  const label = (id: string) => items?.find((i) => i.id === id)?.label ?? '…'
  const fbaTotal = (items ?? []).reduce((a, i) => a + i.stock.amazon, 0)
  const onWay = all.filter((s) => s.status === 'yolda').reduce((a, s) => a + qtyOf(s), 0)
  const sentThisMonth = all.filter((s) => s.status !== 'iptal' && monthKey(s.ship_date) === monthKey(today())).reduce((a, s) => a + qtyOf(s), 0)
  const received = all.filter((s) => s.status === 'teslim_alindi' && s.received_date)
  const avgLead = received.length ? received.reduce((a, s) => a + daysBetween(s.ship_date, s.received_date!), 0) / received.length : null

  // Öneri: son 30 gün Amazon hızına göre 30 günlük stok
  const suggestion = useMemo(() => {
    if (!items || !lines.data) return []
    const v = velocities(lines.data, 30)
    return items
      .map((i) => {
        const perDay = v.get(i.id)?.amazon ?? 0
        const pipe = i.stock.amazon + i.stock.yolda
        const want = Math.ceil(perDay * 30 - pipe)
        const can = Math.min(want, Math.floor(i.stock.depo))
        return { i, perDay, pipe, want, can, days: perDay > 0 ? pipe / perDay : null }
      })
      .filter((x) => x.want > 0 && x.can > 0)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
  }, [items, lines.data])

  const advance = async (s: Shipment, status: string) => {
    try {
      await write(supabase.from('shipments').update({ status }).eq('id', s.id))
      invalidate(...AFTER.shipment)
      toast(status === 'yolda' ? 'Yola çıktı: stok depodan düştü.' : status === 'teslim_alindi' ? 'Teslim alındı: stok Amazon FBA\'ya geçti.' : 'Güncellendi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const remove = async (s: Shipment) => {
    if (!(await confirm('Sevkiyat silinsin mi?', 'Bu sevkiyatın yaptığı tüm stok transferleri geri alınır.'))) return
    try {
      await write(supabase.from('shipments').delete().eq('id', s.id))
      invalidate(...AFTER.shipment)
      toast('Sevkiyat silindi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Amazon sevkiyatı"
        subtitle="Depodan Amazon FBA'ya gönderimler. Durum ilerledikçe stok depo → yolda → Amazon olarak otomatik taşınır."
        actions={
          <Button variant="gold" icon={<Truck className="h-4 w-4" />} onClick={() => (setPrefill(null), setEditing('new'))}>
            Sevkiyat oluştur
          </Button>
        }
      />
      <ErrorNote message={shipments.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Amazon FBA stoğu" value={num(fbaTotal)} sub="adet" />
        <Stat label="Yolda" value={num(onWay)} sub="adet" />
        <Stat label="Bu ay gönderilen" value={num(sentThisMonth)} sub="adet" />
        <Stat label="Ortalama teslim süresi" value={avgLead === null ? '—' : `${num(Math.round(avgLead * 10) / 10)} gün`} sub={`${received.length} sevkiyattan`} />
      </div>

      {suggestion.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 overflow-hidden rounded-2xl bg-night p-5 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-bold">
                <Sparkles className="h-4 w-4 text-thread" /> Önerilen gönderim
              </p>
              <p className="mt-1 text-sm text-white/60">Son 30 günün Amazon satış hızına göre FBA'da 30 günlük stok olması için:</p>
            </div>
            <Button
              variant="gold"
              onClick={() => {
                setPrefill(suggestion.map((x) => ({ item_id: x.i.id, qty: String(x.can), price: '' })))
                setEditing('new')
              }}
            >
              Bu ürünlerle sevkiyat hazırla
            </Button>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestion.slice(0, 9).map((x) => (
              <li key={x.i.id} className="rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-sm">
                <p className="font-semibold">{x.i.label}</p>
                <p className="mt-0.5 text-xs text-white/60">
                  <b className="text-thread">{num(x.can)} {x.i.unit}</b> gönder · FBA+yolda {num(x.pipe)}, {x.days !== null ? `~${Math.floor(x.days)} gün yeter` : ''} · günde {num(Math.round(x.perDay * 10) / 10)}
                </p>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Akış panosu */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {COLS.map((c) => {
          const list = all.filter((s) => s.status === c.id).slice(0, c.id === 'teslim_alindi' ? 6 : 50)
          return (
            <div key={c.id} className="rounded-2xl bg-black/[0.035] p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <p className="font-bold text-ink">{c.label}</p>
                  <p className="text-xs text-ink-soft/60">{c.hint}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-bold text-ink ring-1 ring-line">{all.filter((s) => s.status === c.id).length}</span>
              </div>
              {shipments.loading ? (
                <Skeleton className="h-28" />
              ) : list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-sm text-ink-soft/50">Boş</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((s) => (
                    <motion.li layout key={s.id} className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-black/[0.05]">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-ink">{s.reference || 'Referanssız sevkiyat'}</p>
                          <p className="text-xs text-ink-soft/60">
                            {dateTR(s.ship_date)}
                            {s.carrier ? ` · ${s.carrier}` : ''}
                            {s.received_date ? ` → ${dateTR(s.received_date)}` : ''}
                          </p>
                        </div>
                        <span className="font-display text-lg font-black text-ink">{num(qtyOf(s))}</span>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
                        {s.shipment_items.slice(0, 4).map((l, i) => (
                          <li key={i} className="truncate">
                            <b className="text-ink">{num(l.qty)}×</b> {label(l.item_id)}
                          </li>
                        ))}
                        {s.shipment_items.length > 4 && <li>+{s.shipment_items.length - 4} ürün daha</li>}
                      </ul>
                      <div className="mt-3 flex items-center gap-1">
                        {c.next && (
                          <Button size="sm" onClick={() => advance(s, c.next!)} icon={c.next === 'yolda' ? <ArrowRight className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}>
                            {c.nextLabel}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => (setPrefill(null), setEditing(s))} aria-label="Düzenle">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove(s)} aria-label="Sil">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <span className="ml-auto">
                          <UserDot name={byId(s.created_by)?.full_name} color={byId(s.created_by)?.color} />
                        </span>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* Amazon stok tablosu */}
      <Card className="mt-4" title="Amazon stok durumu" pad={false}>
        <div className="pt-2">
          {!items ? (
            <Skeleton className="m-5 h-24" />
          ) : (
            <FbaTable items={items} lines={lines.data ?? []} />
          )}
        </div>
      </Card>

      {all.some((s) => s.status === 'iptal') && (
        <p className="mt-3 text-xs text-ink-soft/60">{all.filter((s) => s.status === 'iptal').length} iptal edilmiş sevkiyat stok hesabına katılmıyor.</p>
      )}

      {editing && items && <ShipmentForm shipment={editing === 'new' ? null : editing} prefill={prefill} items={items} onClose={() => setEditing(null)} />}
    </>
  )
}

function FbaTable({ items, lines }: { items: ItemWithStock[]; lines: NonNullable<ReturnType<typeof Q.saleLines>['data']> }) {
  const v = velocities(lines, 30)
  const rows = items
    .filter((i) => i.stock.amazon !== 0 || i.stock.yolda !== 0 || (v.get(i.id)?.amazon ?? 0) > 0)
    .map((i) => ({ i, perDay: v.get(i.id)?.amazon ?? 0 }))
    .sort((a, b) => b.perDay - a.perDay)
  if (!rows.length) return <div className="p-5"><Empty title="Amazon'da henüz stok yok" text="İlk sevkiyatı teslim alındı olarak işaretlediğinizde burada görünür." /></div>
  return (
    <Table
      head={
        <tr>
          <th>Ürün</th>
          <th className="text-right">FBA</th>
          <th className="text-right">Yolda</th>
          <th className="text-right">Günlük satış</th>
          <th>Yeter mi?</th>
        </tr>
      }
    >
      {rows.map(({ i, perDay }) => {
        const days = perDay > 0 ? (i.stock.amazon + i.stock.yolda) / perDay : null
        return (
          <tr key={i.id}>
            <td className="font-semibold text-ink">{i.label}</td>
            <td className={cx('text-right font-bold tabular-nums', i.stock.amazon < 0 && 'text-[#d03b3b]')}>{num(i.stock.amazon)}</td>
            <td className="text-right tabular-nums text-ink-soft">{num(i.stock.yolda)}</td>
            <td className="text-right tabular-nums text-ink-soft">{perDay ? num(Math.round(perDay * 10) / 10) : '—'}</td>
            <td>
              {days === null ? (
                <StatusPill tone="neutral">Satış yok</StatusPill>
              ) : days < 7 ? (
                <StatusPill tone="critical">~{Math.floor(days)} gün</StatusPill>
              ) : days < 21 ? (
                <StatusPill tone="warning">~{Math.floor(days)} gün</StatusPill>
              ) : (
                <StatusPill tone="good">~{Math.floor(days)} gün</StatusPill>
              )}
            </td>
          </tr>
        )
      })}
    </Table>
  )
}

function ShipmentForm({ shipment, prefill, items, onClose }: { shipment: Shipment | null; prefill: Line[] | null; items: ItemWithStock[]; onClose: () => void }) {
  const { toast } = useUi()
  const [f, setF] = useState({
    ship_date: shipment?.ship_date ?? today(),
    reference: shipment?.reference ?? '',
    carrier: shipment?.carrier ?? '',
    status: shipment?.status ?? 'hazirlaniyor',
    shipping_cost: shipment ? String(shipment.shipping_cost) : '',
    received_date: shipment?.received_date ?? '',
    note: shipment?.note ?? '',
  })
  const [rawLines, setLines] = useState<Line[]>(shipment?.shipment_items.map((l) => ({ item_id: l.item_id, qty: String(l.qty), price: '' })) ?? prefill ?? [emptyLine()])
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = realLines(rawLines)
    if (!lines.length) return toast('En az bir ürün için adet girin.', 'error')
    setBusy(true)
    try {
      await write(
        supabase.rpc('save_shipment', {
          p_header: {
            id: shipment?.id ?? null,
            ...f,
            reference: f.reference || null,
            carrier: f.carrier || null,
            note: f.note || null,
            shipping_cost: Number(f.shipping_cost) || 0,
            received_date: f.status === 'teslim_alindi' ? f.received_date || today() : null,
          },
          p_lines: lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })),
        }),
      )
      invalidate(...AFTER.shipment)
      toast(shipment ? 'Sevkiyat güncellendi.' : 'Sevkiyat oluşturuldu.')
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
      wide
      onClose={onClose}
      title={shipment ? 'Sevkiyatı düzenle' : "Amazon'a sevkiyat"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="ship-form" type="submit" loading={busy}>
            {shipment ? 'Güncelle' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <form id="ship-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Gönderim tarihi">
            <Input type="date" required value={f.ship_date} onChange={(e) => set({ ship_date: e.target.value })} />
          </Field>
          <Field label="FBA sevkiyat no">
            <Input value={f.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="FBA1A2B3C" />
          </Field>
          <Field label="Kargo firması">
            <Input value={f.carrier} onChange={(e) => set({ carrier: e.target.value })} />
          </Field>
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value as any })}>
              {SHIPMENT_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          {f.status === 'teslim_alindi' && (
            <Field label="Teslim tarihi">
              <Input type="date" value={f.received_date || today()} onChange={(e) => set({ received_date: e.target.value })} />
            </Field>
          )}
          <Field label="Kargo ücreti (₺)">
            <Input type="number" min="0" step="any" value={f.shipping_cost} onChange={(e) => set({ shipping_cost: e.target.value })} placeholder="0" />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Gönderilen ürünler</p>
          <LinesEditor items={items} lines={rawLines} setLines={setLines} noPrice stockFrom={() => 'depo'} />
        </div>
        <Field label="Not">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}
