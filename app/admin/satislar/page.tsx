'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil, ShoppingBag, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { CHANNELS, colorOf, label, PAYMENT_STATUS, productImage, SALE_STATUS, type Channel } from '@/lib/panel/constants'
import { AFTER, estimateCosts, invalidate, partyKey, Q, useItemsWithStock, write, type Sale } from '@/lib/panel/data'
import { PartyNameInput } from '@/components/panel/parties'
import { addDays, dateTimeTR, dateTR, relTime, lastMonths, money, monthKey, monthLabel, norm, num, tl, today } from '@/lib/panel/format'
import { BarChart, CalendarHeat, Legend } from '@/components/panel/charts'
import { emptyLine, LinesEditor, realLines, useOpenFromQuery, type Line } from '@/components/panel/forms'
import { CurrencyBar } from '@/components/panel/CurrencyBar'
import { useFxRate, type Currency } from '@/lib/panel/fx'
import { Badge, Button, Card, Drawer, Empty, ErrorNote, Field, Input, PageHeader, SearchBox, Segmented, Select, ShowMore, Skeleton, Stat, StatusPill, Table, Textarea, UserDot, useShowMore, useUi } from '@/components/panel/ui'

type Range = '30' | '90' | '365' | 'all'

const saleTotal = (s: Sale) => s.sale_items.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0)

export default function SalesPage() {
  const sales = Q.sales()
  const { data: items } = useItemsWithStock()
  const { byId } = useAuth()
  const { toast, confirm } = useUi()
  const [range, setRange] = useState<Range>('90')
  const [channel, setChannel] = useState<'all' | Channel>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Sale | 'new' | null>(null)
  const [preset, setPreset] = useState('')
  const page = useShowMore(50)
  useOpenFromQuery((p) => {
    setPreset(p.get('cari') ?? '')
    setEditing('new')
  })

  const list = useMemo(() => {
    const from = range === 'all' ? '0000' : addDays(today(), -Number(range))
    return (sales.data ?? []).filter(
      (s) =>
        s.sale_date >= from &&
        (channel === 'all' || s.channel === channel) &&
        (!q || norm(`${s.order_no ?? ''} ${s.customer ?? ''} ${s.note ?? ''}`).includes(norm(q))),
    )
  }, [sales.data, range, channel, q])

  const done = list.filter((s) => s.status === 'tamamlandi')
  const revenue = done.reduce((a, s) => a + saleTotal(s), 0)
  const units = done.reduce((a, s) => a + s.sale_items.reduce((b, l) => b + Number(l.qty), 0), 0)
  const fees = done.reduce((a, s) => a + Number(s.commission) + Number(s.shipping_cost), 0)
  const returns = list.filter((s) => s.status === 'iade').length

  const months = lastMonths(12)
  const byMonth = CHANNELS.map((c) => ({
    id: c.id,
    label: c.label,
    color: c.color,
    values: months.map((m) =>
      (sales.data ?? []).filter((s) => s.status === 'tamamlandi' && s.channel === c.id && monthKey(s.sale_date) === m).reduce((a, s) => a + saleTotal(s), 0),
    ),
  })).filter((s) => s.values.some((v) => v > 0))

  const daily = useMemo(() => {
    const m = new Map<string, number>()
    ;(sales.data ?? [])
      .filter((s) => s.status === 'tamamlandi' && (channel === 'all' || s.channel === channel))
      .forEach((s) => m.set(s.sale_date, (m.get(s.sale_date) ?? 0) + s.sale_items.reduce((a, l) => a + Number(l.qty), 0)))
    return m
  }, [sales.data, channel])

  const remove = async (s: Sale) => {
    const auto = s.external_ref ? ` Bu sipariş ${label(CHANNELS, s.channel)}'dan otomatik geldi; silerseniz bir daha içe aktarılmaz.` : ''
    if (!(await confirm('Bu satış silinsin mi?', `Satıştan düşen stok geri eklenir. Bu işlem düzenleme geçmişine kaydedilir.${auto}`))) return
    try {
      await write(supabase.from('sales').delete().eq('id', s.id))
      invalidate(...AFTER.sale)
      toast('Satış silindi, stok geri eklendi.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Satışlar"
        subtitle="Satış girdiğiniz anda stok düşer: Amazon satışları Amazon FBA'dan, diğerleri depodan."
        actions={
          <Button variant="gold" icon={<ShoppingBag className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Satış ekle
          </Button>
        }
      />
      <ErrorNote message={sales.error} />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { id: '30', label: '30 gün' },
              { id: '90', label: '90 gün' },
              { id: '365', label: '1 yıl' },
              { id: 'all', label: 'Tümü' },
            ]}
          />
          <Segmented value={channel} onChange={setChannel} options={[{ id: 'all', label: 'Tüm kanallar' }, ...CHANNELS.map((c) => ({ id: c.id, label: c.label }))]} />
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Sipariş no, müşteri…" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Ciro" value={tl(revenue)} sub={`${done.length} sipariş`} />
        <Stat label="Satılan" value={num(units)} sub="adet / metre" />
        <Stat label="Ortalama sipariş" value={tl(done.length ? revenue / done.length : 0)} />
        <Stat label="Komisyon + kargo" value={tl(fees)} sub={`${returns} iade`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Aylık ciro, kanal kanal" action={<Legend items={byMonth} />}>
          {sales.loading ? <Skeleton className="h-[260px]" /> : <BarChart labels={months.map((m) => monthLabel(m))} tooltipLabels={months.map((m) => monthLabel(m, true))} series={byMonth} stacked format={(v) => tl(v)} />}
        </Card>
        <Card title="Günlük satış adedi">
          <CalendarHeat days={daily} format={(v) => `${num(v)} adet`} weeks={20} />
          <p className="mt-3 text-xs text-ink-soft/60">Son 20 hafta. Koyu kareler yoğun günler.</p>
        </Card>
      </div>

      <Card className="mt-4" pad={false}>
        {sales.loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="p-5">
            <Empty icon={<ShoppingBag className="h-5 w-5" />} title="Bu aralıkta satış yok" text="Yeni satış girdiğinizde stok otomatik düşer ve finansa gelir olarak yansır." action={<Button onClick={() => setEditing('new')}>Satış ekle</Button>} />
          </div>
        ) : (
          <Table
            head={
              <tr>
                <th>Tarih</th>
                <th>Kanal</th>
                <th>Sipariş</th>
                <th>Ürünler</th>
                <th className="text-right">Tutar</th>
                <th className="text-right">Net</th>
                <th>Durum</th>
                <th>Giren</th>
                <th />
              </tr>
            }
          >
            {list.slice(0, page.n).map((s) => {
              const total = saleTotal(s)
              const net = total - Number(s.commission) - Number(s.shipping_cost)
              const u = byId(s.created_by)
              return (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-ink-soft">{dateTR(s.sale_date)}</td>
                  <td className="whitespace-nowrap">
                    <Badge color={colorOf(CHANNELS, s.channel)}>{label(CHANNELS, s.channel)}</Badge>
                  </td>
                  <td className="whitespace-nowrap">
                    <p className="font-semibold text-ink">{s.order_no || '—'}</p>
                    {s.customer && <p className="text-xs text-ink-soft/60">{s.customer}</p>}
                  </td>
                  <td className="max-w-[260px]">
                    {s.sale_items.map((l, i) => {
                      const it = items?.find((x) => x.id === l.item_id)
                      return (
                        <p key={i} className="flex items-center gap-1.5 truncate text-ink-soft">
                          {productImage(it?.sku) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={productImage(it?.sku)!} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
                          )}
                          <span className="truncate">
                            <b className="text-ink">{num(l.qty)}×</b> {it?.label ?? '…'}
                          </span>
                        </p>
                      )
                    })}
                  </td>
                  <td className="text-right font-bold tabular-nums">
                    {tl(total)}
                    {s.currency && s.currency !== 'TRY' && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-[#1d5fb0]">
                        {money(s.sale_items.reduce((a, l) => a + Number(l.qty) * Number(l.fx_unit_price ?? 0), 0), s.currency)} · kur {Number(s.fx_rate).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                      </span>
                    )}
                    {(() => {
                      const own = s.sale_items.reduce((a, l) => a + Number(l.discount ?? 0), 0)
                      const plat = s.sale_items.reduce((a, l) => a + Number(l.platform_discount ?? 0), 0)
                      const camp = s.sale_items.map((l) => l.campaign).find(Boolean)
                      if (!(own > 0) && !(plat > 0)) return null
                      return (
                        <span className="mt-0.5 block text-[11px] font-semibold text-[#b26b00]" title={camp ?? undefined}>
                          {own > 0 && `${tl(own)} bizim indirim`}
                          {own > 0 && plat > 0 && ' · '}
                          {plat > 0 && `${tl(plat)} ${label(CHANNELS, s.channel)} karşıladı`}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="text-right tabular-nums text-ink-soft">{tl(net)}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill tone={s.status === 'tamamlandi' ? 'good' : s.status === 'iade' ? 'warning' : 'neutral'}>{label(SALE_STATUS, s.status)}</StatusPill>
                      {s.payment_status === 'bekliyor' && <StatusPill tone="info">Tahsilat bekliyor</StatusPill>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {u ? (
                      <UserDot name={u.full_name} color={u.color} />
                    ) : s.external_ref ? (
                      <span className="text-sm text-ink-soft">Otomatik · {label(CHANNELS, s.channel)}</span>
                    ) : (
                      <UserDot />
                    )}
                    {(() => {
                      const edited = s.updated_at && new Date(s.updated_at).getTime() - new Date(s.created_at).getTime() > 2000
                      if (!edited) return null
                      const e = byId(s.updated_by)
                      return (
                        <p className="mt-0.5 text-xs text-ink-soft/60" title={dateTimeTR(s.updated_at!)}>
                          son: {e?.full_name ?? 'otomatik'}, {relTime(s.updated_at!)}
                        </p>
                      )
                    })()}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label="Düzenle">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(s)} aria-label="Sil">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
        <ShowMore shown={Math.min(page.n, list.length)} total={list.length} onMore={page.more} />
      </Card>

      {editing && items && <SaleForm sale={editing === 'new' ? null : editing} preset={editing === 'new' ? preset : ''} items={items} onClose={() => (setEditing(null), setPreset(''))} />}
    </>
  )
}

function SaleForm({ sale, preset = '', items, onClose }: { sale: Sale | null; preset?: string; items: NonNullable<ReturnType<typeof useItemsWithStock>['data']>; onClose: () => void }) {
  const { toast } = useUi()
  // Cari kartından "Satış gir" ile gelindiyse: firma adı dolu, kanal toptan, vadesi varsa ödeme bekliyor + vade günü
  const presetParty = (Q.parties().data ?? []).find((p) => preset && partyKey(p.name) === partyKey(preset))
  const presetDays = presetParty?.payment_days ?? null
  const [f, setF] = useState({
    sale_date: sale?.sale_date ?? today(),
    channel: (sale?.channel ?? (preset ? 'toptan' : 'trendyol')) as Channel,
    order_no: sale?.order_no ?? '',
    customer: sale?.customer ?? preset,
    status: sale?.status ?? 'tamamlandi',
    commission: sale ? String(sale.commission) : '',
    shipping_cost: sale ? String(sale.shipping_cost) : '',
    payment_status: sale?.payment_status ?? (presetDays ? 'bekliyor' : 'odendi'),
    due_date: sale?.due_date ?? (presetDays ? addDays(today(), presetDays) : ''),
    note: sale?.note ?? '',
  })
  // Para birimi: dolar/euro ile satışta fiyat o dövizde girilir, satış gününün TCMB döviz alış kuruyla TL'ye çevrilir
  const [currency, setCurrencyRaw] = useState<Currency>((sale?.currency as Currency) ?? 'TRY')
  const fx = useFxRate(currency, f.sale_date, 'buying', sale?.fx_rate ?? null)
  const [rawLines, setLines] = useState<Line[]>(
    sale?.sale_items.map((l) => ({
      item_id: l.item_id,
      qty: String(l.qty),
      price: String(sale.currency && sale.currency !== 'TRY' && l.fx_unit_price != null ? Number(l.fx_unit_price) : l.unit_price),
      location_id: l.location_id,
    })) ?? [emptyLine()],
  )
  const setCurrency = (c: Currency) => {
    if (c === currency) return
    setCurrencyRaw(c)
    setLines(rawLines.map((l) => ({ ...l, price: '' })))
  }
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const defaultLoc = f.channel === 'amazon' ? 'amazon' : 'depo'
  const fxSubtotal = rawLines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0)
  const subtotal = fxSubtotal * fx.rate
  const net = subtotal - (Number(f.commission) || 0) - (Number(f.shipping_cost) || 0)

  // Komisyon ve kargo, Stok → Kanal maliyetleri'nden otomatik hesaplanır; elle değiştirilirse dokunulmaz.
  const costs = Q.channelCosts()
  const [autoCost, setAutoCost] = useState(!sale || (Number(sale.commission) === 0 && Number(sale.shipping_cost) === 0))
  const est = useMemo(
    () =>
      estimateCosts(
        costs.data,
        f.channel,
        realLines(rawLines).map((l) => ({ name: items.find((i) => i.id === l.item_id)?.name ?? '', qty: Number(l.qty), price: (Number(l.price) || 0) * fx.rate })),
      ),
    [costs.data, f.channel, rawLines, items, fx.rate],
  )
  useEffect(() => {
    if (!autoCost) return
    setF((x) => ({ ...x, commission: est ? String(est.commission) : '', shipping_cost: est ? String(est.fee) : '' }))
  }, [est, autoCost])

  // Düzenlerken, bu satışın kendi düştüğü stok uyarıda tekrar sayılmasın
  const adjusted = useMemo(() => {
    if (!sale) return items
    return items.map((i) => {
      const back = sale.sale_items.filter((l) => l.item_id === i.id && sale.status !== 'iptal')
      if (!back.length || sale.status === 'iade') return i
      const s = { ...i.stock }
      back.forEach((l) => (s[(l.location_id ?? 'depo') as keyof typeof s] += Number(l.qty)))
      return { ...i, stock: s }
    })
  }, [items, sale])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = realLines(rawLines)
    if (!lines.length) return toast('En az bir ürün için adet girin.', 'error')
    if (currency !== 'TRY' && !(fx.rate > 0)) return toast('Kur yok. Kuru elle girin.', 'error')
    setBusy(true)
    // Düzenlemede fuar bağlantısı, ödeme şekli ve satır indirimleri korunsun
    const prev = new Map((sale?.sale_items ?? []).map((l) => [l.item_id, l]))
    try {
      await write(
        supabase.rpc('save_sale', {
          p_header: {
            id: sale?.id ?? null,
            fair_id: (sale as any)?.fair_id ?? null,
            payment_method: (sale as any)?.payment_method ?? null,
            currency,
            fx_rate: currency === 'TRY' ? null : fx.rate,
            ...f,
            commission: Number(f.commission) || 0,
            shipping_cost: Number(f.shipping_cost) || 0,
            due_date: f.payment_status === 'bekliyor' && f.due_date ? f.due_date : null,
            order_no: f.order_no || null,
            customer: f.customer || null,
            note: f.note || null,
          },
          p_lines: lines.map((l) => {
            const old = prev.get(l.item_id)
            return {
              item_id: l.item_id,
              qty: Number(l.qty),
              unit_price: Math.round((Number(l.price) || 0) * fx.rate * 100) / 100,
              fx_unit_price: currency === 'TRY' ? null : Number(l.price) || 0,
              location_id: l.location_id ?? defaultLoc,
              list_price: old?.list_price ?? null,
              discount: old?.discount ?? 0,
              campaign: old?.campaign ?? null,
            }
          }),
        }),
      )
      invalidate(...AFTER.sale)
      toast(sale ? 'Satış güncellendi, stok yeniden hesaplandı.' : 'Satış kaydedildi, stok düştü.')
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
      title={sale ? 'Satışı düzenle' : 'Yeni satış'}
      footer={
        <>
          <p className="mr-auto text-sm text-ink-soft">
            {currency !== 'TRY' && <span className="mr-2">{money(fxSubtotal, currency)} × {fx.rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ·</span>}
            Net <b className="font-display text-lg font-black text-ink">{money(net, 'TRY', false)}</b>
          </p>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="sale-form" type="submit" loading={busy}>
            {sale ? 'Güncelle' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <form id="sale-form" onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kanal">
            <Select
              value={f.channel}
              onChange={(e) => {
                const ch = e.target.value as Channel
                set({ channel: ch })
                setLines(rawLines.map((l) => ({ ...l, location_id: ch === 'amazon' ? 'amazon' : l.location_id === 'amazon' ? 'depo' : l.location_id })))
              }}
            >
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tarih">
            <Input type="date" required value={f.sale_date} onChange={(e) => set({ sale_date: e.target.value })} />
          </Field>
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value as any })}>
              {SALE_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sipariş no">
            <Input value={f.order_no} onChange={(e) => set({ order_no: e.target.value })} placeholder="İsteğe bağlı" />
          </Field>
          <Field label="Müşteri" className="sm:col-span-2">
            <PartyNameInput value={f.customer} onChange={(v) => set({ customer: v })} placeholder="Toptan satışlarda firma adı" kind="musteri" />
          </Field>
        </div>

        <CurrencyBar currency={currency} setCurrency={setCurrency} fx={fx} hint="Satış bu kurla TL'ye çevrilip kaydedilir; komisyon ve kargo TL girilir." />
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Ürünler</p>
          <LinesEditor key={currency} items={adjusted} lines={rawLines} setLines={setLines} priceFrom="price" priceLabel="Satış fiyatı" stockFrom={(l) => l.location_id ?? defaultLoc} showLocation currency={currency} rate={fx.rate} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pazaryeri komisyonu (₺)" hint={autoCost && est ? 'Kanal maliyetinden otomatik hesaplandı.' : 'Ciro ve net kâr ayrı izlensin diye masraf olarak düşülür.'}>
            <Input
              type="number"
              min="0"
              step="any"
              value={f.commission}
              onChange={(e) => {
                setAutoCost(false)
                set({ commission: e.target.value })
              }}
              placeholder="0"
            />
          </Field>
          <Field label="Kargo / FBA masrafı (₺)" hint={autoCost && est ? 'Kanal maliyetinden otomatik hesaplandı.' : undefined}>
            <Input
              type="number"
              min="0"
              step="any"
              value={f.shipping_cost}
              onChange={(e) => {
                setAutoCost(false)
                set({ shipping_cost: e.target.value })
              }}
              placeholder="0"
            />
          </Field>
          {!autoCost && est && (
            <p className="-mt-1 text-xs text-ink-soft sm:col-span-2">
              Kanal maliyetine göre {tl(est.commission)} komisyon, {tl(est.fee)} kargo olmalı.{' '}
              <button type="button" className="font-semibold text-ink underline" onClick={() => setAutoCost(true)}>
                Otomatik hesaba dön
              </button>
            </p>
          )}
          {!est && ['amazon', 'trendyol', 'hepsiburada'].includes(f.channel) && (
            <p className="-mt-1 text-xs text-ink-soft/70 sm:col-span-2">Bu kanal için komisyon ve kargo tanımlı değil. Stok → Kanal maliyetleri’nden bir kez girerseniz her satışta otomatik hesaplanır.</p>
          )}
          <Field label="Tahsilat">
            <Select value={f.payment_status} onChange={(e) => set({ payment_status: e.target.value as any })}>
              {PAYMENT_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === 'odendi' ? 'Tahsil edildi' : 'Tahsilat bekliyor'}
                </option>
              ))}
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
