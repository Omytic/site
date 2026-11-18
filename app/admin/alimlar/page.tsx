'use client'

import { useMemo, useState } from 'react'
import { PackagePlus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, useItemsWithStock, write, type Purchase } from '@/lib/panel/data'
import { dateTR, lastMonths, money, monthKey, monthLabel, norm, num, tl, today } from '@/lib/panel/format'
import { BarChart, HBars, Legend } from '@/components/panel/charts'
import { LinesSummary } from '@/components/panel/LinesSummary'
import { emptyLine, LinesEditor, realLines, useOpenFromQuery, type Line } from '@/components/panel/forms'
import { PartyNameInput } from '@/components/panel/parties'
import { CurrencyBar } from '@/components/panel/CurrencyBar'
import { useFxRate, type Currency } from '@/lib/panel/fx'
import { Button, Card, Drawer, Empty, ErrorNote, Field, Input, PageHeader, SearchBox, Select, Skeleton, Stat, StatusPill, Table, Textarea, UserDot, useUi } from '@/components/panel/ui'

const purchaseTotal = (p: Purchase) => p.purchase_items.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost), 0)

export default function PurchasesPage() {
  const purchases = Q.purchases()
  const { data: items } = useItemsWithStock()
  const { byId } = useAuth()
  const { toast, confirm } = useUi()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Purchase | 'new' | null>(null)
  const [preset, setPreset] = useState('')
  useOpenFromQuery((p) => {
    setPreset(p.get('cari') ?? '')
    setEditing('new')
  })

  const list = useMemo(
    () => (purchases.data ?? []).filter((p) => !q || norm(`${p.supplier ?? ''} ${p.invoice_no ?? ''} ${p.note ?? ''}`).includes(norm(q))),
    [purchases.data, q],
  )
  const months = lastMonths(12)
  const brandOf = (id: string) => items?.find((i) => i.id === id)?.brand
  const series = BRANDS.map((b) => ({
    id: b.id,
    label: b.label,
    color: b.color,
    values: months.map((m) =>
      (purchases.data ?? [])
        .filter((p) => monthKey(p.purchase_date) === m)
        .reduce((a, p) => a + p.purchase_items.filter((l) => brandOf(l.item_id) === b.id).reduce((x, l) => x + Number(l.qty) * Number(l.unit_cost), 0), 0),
    ),
  })).filter((s) => s.values.some((v) => v > 0))

  const thisMonth = (purchases.data ?? []).filter((p) => monthKey(p.purchase_date) === monthKey(today()))
  const unpaid = (purchases.data ?? []).filter((p) => p.payment_status === 'bekliyor')
  const suppliers = useMemo(() => {
    const m = new Map<string, number>()
    ;(purchases.data ?? []).forEach((p) => m.set(p.supplier || 'Belirtilmemiş', (m.get(p.supplier || 'Belirtilmemiş') ?? 0) + purchaseTotal(p) + Number(p.shipping_cost)))
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [purchases.data])

  const remove = async (p: Purchase) => {
    if (!(await confirm('Bu alım silinsin mi?', 'Alımla gelen stok geri düşülür.'))) return
    try {
      await write(supabase.from('purchases').delete().eq('id', p.id))
      invalidate(...AFTER.purchase)
      toast('Alım silindi, stok düzeltildi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const markPaid = async (p: Purchase) => {
    try {
      await write(supabase.from('purchases').update({ payment_status: 'odendi' }).eq('id', p.id))
      invalidate(...AFTER.purchase)
      toast('Ödendi olarak işaretlendi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Alımlar"
        subtitle="Mal alımı girince stok otomatik artar, ürünün maliyeti son alış fiyatıyla güncellenir."
        actions={
          <Button variant="gold" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Alım ekle
          </Button>
        }
      />
      <ErrorNote message={purchases.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Bu ay alım" value={tl(thisMonth.reduce((a, p) => a + purchaseTotal(p), 0))} sub={`${thisMonth.length} kayıt`} />
        <Stat label="Ödenmemiş" value={tl(unpaid.reduce((a, p) => a + purchaseTotal(p) + Number(p.shipping_cost), 0))} sub={`${unpaid.length} fatura`} />
        <Stat label="Toplam alım" value={tl((purchases.data ?? []).reduce((a, p) => a + purchaseTotal(p), 0))} />
        <Stat label="Tedarikçi" value={num(new Set((purchases.data ?? []).map((p) => p.supplier).filter(Boolean)).size)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Aylık alım, marka bazında" action={<Legend items={series} />}>
          {purchases.loading ? <Skeleton className="h-[240px]" /> : <BarChart labels={months.map((m) => monthLabel(m))} tooltipLabels={months.map((m) => monthLabel(m, true))} series={series} stacked height={240} format={(v) => tl(v)} />}
        </Card>
        <Card title="En çok alım yapılan tedarikçiler">
          <HBars rows={suppliers.map(([s, v]) => ({ id: s, label: s, value: v, color: '#2a78d6' }))} format={(v) => tl(v)} />
        </Card>
      </div>

      <Card className="mt-4" pad={false} title={<span>Alım kayıtları</span>} action={<SearchBox value={q} onChange={setQ} placeholder="Tedarikçi, fatura…" />}>
        <div className="pt-3">
          {purchases.loading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : list.length === 0 ? (
            <div className="p-5">
              <Empty icon={<PackagePlus className="h-5 w-5" />} title="Henüz alım yok" text="İlk mal alımınızı girin; stok ve maliyetler buradan beslenir." action={<Button onClick={() => setEditing('new')}>Alım ekle</Button>} />
            </div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Tarih</th>
                  <th>Tedarikçi</th>
                  <th>Ürünler</th>
                  <th className="text-right">Tutar</th>
                  <th>Ödeme</th>
                  <th>Giren</th>
                  <th />
                </tr>
              }
            >
              {list.map((p) => {
                const u = byId(p.created_by)
                const overdue = p.payment_status === 'bekliyor' && p.due_date && p.due_date < today()
                return (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap text-ink-soft">{dateTR(p.purchase_date)}</td>
                    <td>
                      <p className="font-semibold text-ink">{p.supplier || '—'}</p>
                      {p.invoice_no && <p className="text-xs text-ink-soft/60">Fatura {p.invoice_no}</p>}
                    </td>
                    <td className="max-w-[320px]">
                      <LinesSummary lines={p.purchase_items} items={items} />
                    </td>
                    <td className="text-right font-bold tabular-nums">
                      {tl(purchaseTotal(p))}
                      {p.currency && p.currency !== 'TRY' && (
                        <p className="text-xs font-semibold text-[#1d5fb0]">
                          {money(p.purchase_items.reduce((a, l) => a + Number(l.qty) * Number(l.fx_unit_cost ?? 0), 0), p.currency)} · kur {Number(p.fx_rate).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                        </p>
                      )}
                      {Number(p.shipping_cost) > 0 && <p className="text-xs font-normal text-ink-soft/60">+ {tl(p.shipping_cost)} kargo</p>}
                    </td>
                    <td>
                      {p.payment_status === 'odendi' ? (
                        <StatusPill tone="good">Ödendi</StatusPill>
                      ) : (
                        <button onClick={() => markPaid(p)} title="Ödendi olarak işaretle">
                          <StatusPill tone={overdue ? 'critical' : 'warning'}>{overdue ? `Vadesi geçti · ${dateTR(p.due_date)}` : p.due_date ? `Vade ${dateTR(p.due_date)}` : 'Bekliyor'}</StatusPill>
                        </button>
                      )}
                    </td>
                    <td>
                      <UserDot name={u?.full_name} color={u?.color} />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label="Düzenle">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(p)} aria-label="Sil">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>

      {editing && items && <PurchaseForm purchase={editing === 'new' ? null : editing} preset={editing === 'new' ? preset : ''} items={items} onClose={() => (setEditing(null), setPreset(''))} />}
    </>
  )
}

function PurchaseForm({ purchase, preset = '', items, onClose }: { purchase: Purchase | null; preset?: string; items: NonNullable<ReturnType<typeof useItemsWithStock>['data']>; onClose: () => void }) {
  const { toast } = useUi()
  const [f, setF] = useState({
    purchase_date: purchase?.purchase_date ?? today(),
    supplier: purchase?.supplier ?? preset,
    invoice_no: purchase?.invoice_no ?? '',
    shipping_cost: purchase ? String(purchase.shipping_cost) : '',
    payment_status: purchase?.payment_status ?? 'odendi',
    due_date: purchase?.due_date ?? '',
    note: purchase?.note ?? '',
  })
  // Para birimi: dolar/euro seçilirse fiyatlar o dövizde girilir, alım tarihinin TCMB kuruyla TL'ye çevrilir
  const [currency, setCurrencyRaw] = useState<Currency>((purchase?.currency as Currency) ?? 'TRY')
  const fx = useFxRate(currency, f.purchase_date, 'selling', purchase?.fx_rate ?? null)
  const [rawLines, setLines] = useState<Line[]>(
    purchase?.purchase_items.map((l) => ({
      item_id: l.item_id,
      qty: String(l.qty),
      price: String(purchase.currency && purchase.currency !== 'TRY' && l.fx_unit_cost != null ? Number(l.fx_unit_cost) : l.unit_cost),
      location_id: l.location_id,
    })) ?? [emptyLine()],
  )
  const setCurrency = (c: Currency) => {
    if (c === currency) return
    setCurrencyRaw(c)
    // Fiyatlar yeni para biriminde ürün kartından yeniden gelsin
    setLines(rawLines.map((l) => ({ ...l, price: '' })))
  }
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const goods = rawLines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
  const goodsTL = goods * fx.rate
  const total = goodsTL + (Number(f.shipping_cost) || 0)
  // Ürün kartındaki KDV oranıyla (maliyetler KDV hariç tutulur)
  const vat = rawLines.reduce((a, l) => a + ((Number(l.qty) || 0) * (Number(l.price) || 0) * fx.rate * Number(items.find((i) => i.id === l.item_id)?.vat_rate ?? 20)) / 100, 0)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = realLines(rawLines)
    if (!lines.length) return toast('En az bir ürün için adet girin.', 'error')
    if (currency !== 'TRY' && !(fx.rate > 0)) return toast('Kur yok. Kuru elle girin.', 'error')
    setBusy(true)
    try {
      await write(
        supabase.rpc('save_purchase', {
          p_header: {
            id: purchase?.id ?? null,
            ...f,
            supplier: f.supplier || null,
            invoice_no: f.invoice_no || null,
            note: f.note || null,
            shipping_cost: Number(f.shipping_cost) || 0,
            due_date: f.payment_status === 'bekliyor' && f.due_date ? f.due_date : null,
            currency,
            fx_rate: currency === 'TRY' ? null : fx.rate,
          },
          p_lines: lines.map((l) => ({
            item_id: l.item_id,
            qty: Number(l.qty),
            // Maliyet her zaman TL saklanır (alım günü kuruyla); döviz tutarı ayrıca
            unit_cost: Math.round((Number(l.price) || 0) * fx.rate * 100) / 100,
            fx_unit_cost: currency === 'TRY' ? null : Number(l.price) || 0,
            location_id: l.location_id ?? 'depo',
          })),
        }),
      )
      invalidate(...AFTER.purchase)
      toast(purchase ? 'Alım güncellendi.' : 'Alım kaydedildi, stok arttı.')
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
      title={purchase ? 'Alımı düzenle' : 'Yeni mal alımı'}
      footer={
        <>
          <p className="mr-auto text-sm text-ink-soft">
            {currency !== 'TRY' && <span className="mr-2">{money(goods, currency)} ×{' '}{fx.rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} =</span>}
            Toplam <b className="font-display text-lg font-black text-ink">{money(total, 'TRY', false)}</b>
            {vat > 0 && <span className="ml-2 text-xs">+ {tl(vat)} KDV = <b className="text-ink">{tl(total + vat)}</b></span>}
          </p>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="purchase-form" type="submit" loading={busy}>
            {purchase ? 'Güncelle' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <form id="purchase-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tarih">
            <Input type="date" required value={f.purchase_date} onChange={(e) => set({ purchase_date: e.target.value })} />
          </Field>
          <Field label="Tedarikçi" className="sm:col-span-2">
            <PartyNameInput value={f.supplier} onChange={(v) => set({ supplier: v })} placeholder="Firma adı" kind="tedarikci" />
          </Field>
          <Field label="Fatura no">
            <Input value={f.invoice_no} onChange={(e) => set({ invoice_no: e.target.value })} />
          </Field>
          <Field label="Nakliye (₺)">
            <Input type="number" min="0" step="any" value={f.shipping_cost} onChange={(e) => set({ shipping_cost: e.target.value })} placeholder="0" />
          </Field>
        </div>
        <CurrencyBar currency={currency} setCurrency={setCurrency} fx={fx} hint="Maliyetler bu kurla TL'ye çevrilip kaydedilir." />
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Gelen ürünler</p>
          <LinesEditor key={currency} items={items} lines={rawLines} setLines={setLines} priceFrom="cost" priceLabel="Birim maliyet" showLocation priceFromCard allowNew currency={currency} rate={fx.rate} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ödeme">
            <Select value={f.payment_status} onChange={(e) => set({ payment_status: e.target.value as any })}>
              <option value="odendi">Ödendi</option>
              <option value="bekliyor">Ödenecek (borç)</option>
            </Select>
          </Field>
          {f.payment_status === 'bekliyor' && (
            <Field label="Vade tarihi">
              <Input type="date" value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Not">
          <Textarea value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}
