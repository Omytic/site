'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Eye, RefreshCw, Scale } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AFTER, invalidate, itemLabel, must, Q, useItemsWithStock, useQuery, write } from '@/lib/panel/data'
import { dateTR, num, pct, relTime, sum, tl } from '@/lib/panel/format'
import { BarChart, HBars, LineChart, ShareBar } from '@/components/panel/charts'
import { Button, Card, cx, Empty, PageHeader, Segmented, Skeleton, Stat, StatusPill, Table, useUi } from '@/components/panel/ui'

interface Inv {
  sku: string
  asin: string | null
  name: string | null
  item_id: string | null
  parts: { item_id: string; qty: number }[] | null
  fulfillable: number
  reserved_customer: number
  reserved_other: number
  inbound_working: number
  inbound_shipped: number
  inbound_receiving: number
  unfulfillable: number
  researching: number
  synced_at: string
}
interface Daily { day: string; sessions: number; page_views: number; units: number; order_items: number; sales: number; units_refunded: number; buy_box_pct: number | null; conversion_pct: number | null }
interface AsinRow { day: string; asin: string; sku: string | null; sessions: number; page_views: number; units: number; sales: number; buy_box_pct: number | null; conversion_pct: number | null }
interface FinRow { id: string; posted_at: string; type: string; description: string | null; order_id: string | null; total: number; product_charges: number; refund: number; commission: number; fba_fees: number; other_fees: number }
interface Run { channel: string; started_at: string; finished_at: string | null; status: string; message: string | null }

const DAY = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

export default function AmazonPage() {
  const { toast, confirm } = useUi()
  const [range, setRange] = useState<'30' | '90'>('30')
  const since = isoDay(Date.now() - Number(range) * DAY)
  const inv = useQuery('amazon_inventory', () => must<Inv[]>(supabase.from('amazon_inventory').select('*').order('sku')))
  const daily = useQuery(`amazon_daily:${range}`, () => must<Daily[]>(supabase.from('amazon_traffic_daily').select('*').gte('day', since).order('day')))
  const asin = useQuery(`amazon_asin:${range}`, () => must<AsinRow[]>(supabase.from('amazon_traffic_asin').select('*').gte('day', since)))
  const fin = useQuery(`amazon_fin:${range}`, () => must<FinRow[]>(supabase.from('amazon_transactions').select('id,posted_at,type,description,order_id,total,product_charges,refund,commission,fba_fees,other_fees').gte('posted_at', since).order('posted_at', { ascending: false })))
  const runs = useQuery('amazon_runs', () => must<Run[]>(supabase.from('sync_runs').select('channel,started_at,finished_at,status,message').like('channel', 'amazon%').order('started_at', { ascending: false }).limit(40)))
  const items = useItemsWithStock().data
  const [busy, setBusy] = useState('')

  const syncNow = async (part: string) => {
    setBusy(part)
    try {
      const res = await fetch(`/api/sync/amazon?part=${part}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } })
      const b = await res.json().catch(() => ({}))
      if (!res.ok || b.ok === false) throw new Error(b.message ?? (b.results ?? []).find((r: any) => !r.ok)?.message ?? 'Senkron başarısız')
      toast('Amazon verileri güncellendi.')
      invalidate('amazon_inventory', `amazon_daily:${range}`, `amazon_asin:${range}`, `amazon_fin:${range}`, 'amazon_runs', ...AFTER.sale)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  // ---------- Trafik ----------
  const t = useMemo(() => {
    const d = daily.data ?? []
    const sessions = sum(d, (x) => x.sessions)
    const units = sum(d, (x) => x.units)
    const sales = sum(d, (x) => x.sales)
    const views = sum(d, (x) => x.page_views)
    const bb = d.filter((x) => x.buy_box_pct != null)
    return {
      sessions,
      units,
      sales,
      views,
      conv: sessions ? units / sessions : 0,
      buyBox: bb.length ? sum(bb, (x) => Number(x.buy_box_pct)) / bb.length : null,
      refunded: sum(d, (x) => x.units_refunded),
    }
  }, [daily.data])

  const asinRows = useMemo(() => {
    const by = new Map<string, { asin: string; sku: string | null; sessions: number; views: number; units: number; sales: number; bb: number[] }>()
    for (const r of asin.data ?? []) {
      const e = by.get(r.asin) ?? { asin: r.asin, sku: r.sku, sessions: 0, views: 0, units: 0, sales: 0, bb: [] }
      e.sessions += r.sessions
      e.views += r.page_views
      e.units += r.units
      e.sales += Number(r.sales)
      if (r.buy_box_pct != null) e.bb.push(Number(r.buy_box_pct))
      by.set(r.asin, e)
    }
    const nameOf = new Map<string, string>()
    ;(inv.data ?? []).forEach((i) => {
      if (i.asin) nameOf.set(i.asin, i.name ?? i.sku)
    })
    return Array.from(by.values())
      .map((e) => ({ ...e, name: nameOf.get(e.asin) ?? e.sku ?? e.asin, conv: e.sessions ? e.units / e.sessions : 0, buyBox: e.bb.length ? e.bb.reduce((a, b) => a + b, 0) / e.bb.length : null }))
      .sort((a, b) => b.sessions - a.sessions)
  }, [asin.data, inv.data])

  // ---------- Finans ----------
  const f = useMemo(() => {
    const rows = fin.data ?? []
    const orders = rows.filter((r) => r.order_id && /Shipment/i.test(r.type))
    const gross = sum(orders, (r) => Number(r.product_charges))
    const commission = -sum(rows.filter((r) => r.order_id), (r) => Number(r.commission) + Number(r.other_fees))
    const fba = -sum(rows.filter((r) => r.order_id), (r) => Number(r.fba_fees))
    const refunds = -sum(rows, (r) => Number(r.refund))
    const other = rows.filter((r) => !r.order_id && !/Transfer|Disburse|ProductAds|Advertis/i.test(`${r.type} ${r.description}`))
    const otherCost = -sum(other.filter((r) => Number(r.total) < 0), (r) => Number(r.total))
    const otherIn = sum(other.filter((r) => Number(r.total) > 0), (r) => Number(r.total))
    const payouts = -sum(rows.filter((r) => /Transfer|Disburse/i.test(`${r.type} ${r.description}`)), (r) => Number(r.total))
    const orderCount = new Set(orders.map((r) => r.order_id)).size
    return { gross, commission, fba, refunds, otherCost, otherIn, payouts, orderCount, other }
  }, [fin.data])

  // ---------- Stok karşılaştırma ----------
  const stockRows = useMemo(() => {
    const panelAz = new Map<string, number>()
    ;(items ?? []).forEach((i) => panelAz.set(i.id, Number(i.stock.amazon ?? 0)))
    const amazonOf = new Map<string, number>()
    const inboundOf = new Map<string, number>()
    const brokenOf = new Map<string, number>()
    for (const r of inv.data ?? []) {
      for (const p of r.parts ?? []) {
        amazonOf.set(p.item_id, (amazonOf.get(p.item_id) ?? 0) + (r.fulfillable + r.reserved_other) * p.qty)
        inboundOf.set(p.item_id, (inboundOf.get(p.item_id) ?? 0) + (r.inbound_working + r.inbound_shipped + r.inbound_receiving) * p.qty)
        brokenOf.set(p.item_id, (brokenOf.get(p.item_id) ?? 0) + r.unfulfillable * p.qty)
      }
    }
    return Array.from(amazonOf.keys())
      .map((id) => {
        const it = (items ?? []).find((i) => i.id === id)
        return { id, label: it ? itemLabel(it) : id, amazon: amazonOf.get(id) ?? 0, panel: panelAz.get(id) ?? 0, inbound: inboundOf.get(id) ?? 0, broken: brokenOf.get(id) ?? 0 }
      })
      .map((r) => ({ ...r, diff: r.amazon - r.panel }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  }, [inv.data, items])
  const unmatchedInv = (inv.data ?? []).filter((r) => !r.parts?.length)
  const diffs = stockRows.filter((r) => r.diff !== 0)

  const align = async () => {
    const ok = await confirm(
      'Panel stoğu Amazon’a eşitlensin mi?',
      `${diffs.length} ürünün "Amazon FBA" stoğu, Amazon’un söylediği satılabilir adede çekilecek. Her biri "Sayım düzeltmesi" olarak kaydedilir, geçmişte kimin yaptığı görünür.`,
      'Eşitle',
    )
    if (!ok) return
    try {
      const n = await write(supabase.rpc('align_amazon_stock', { p_item_ids: null }))
      toast(`${n} ürünün Amazon stoğu eşitlendi.`)
      invalidate(...AFTER.stock, 'amazon_inventory')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const lastOf = (ch: string) => (runs.data ?? []).find((r) => r.channel === ch)
  const loading = inv.loading || daily.loading || fin.loading
  const nothing = !loading && !(inv.data ?? []).length && !(daily.data ?? []).length && !(fin.data ?? []).length

  const labels = (daily.data ?? []).map((d) => dateTR(d.day).slice(0, 6))

  return (
    <>
      <PageHeader
        title="Amazon"
        subtitle="Amazon’dan otomatik gelenler: ziyaret ve dönüşüm, Amazon’un gerçekte kestiği komisyon ve ücretler, FBA depodaki stok. Her gece kendiliğinden güncellenir."
        actions={
          <>
            <Segmented value={range} onChange={setRange} options={[{ id: '30', label: '30 gün' }, { id: '90', label: '90 gün' }]} />
            <Button variant="ghost" onClick={() => syncNow('hepsi')} loading={busy === 'hepsi'} icon={<RefreshCw className="h-4 w-4" />}>
              Şimdi güncelle
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {[
          ['amazon', 'Siparişler'],
          ['amazon_stok', 'FBA stoğu'],
          ['amazon_finans', 'Ücretler'],
          ['amazon_trafik', 'Trafik'],
        ].map(([ch, l]) => {
          const r = lastOf(ch)
          return (
            <span key={ch} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-line">
              <span className={cx('h-2 w-2 rounded-full', !r ? 'bg-black/20' : r.status === 'tamam' ? 'bg-[#1baf7a]' : r.status === 'hata' ? 'bg-[#d03b3b]' : 'bg-[#E3AB3B]')} />
              <b>{l}</b>
              <span className="text-ink-soft/60">{r ? relTime(r.finished_at ?? r.started_at) : 'hiç çalışmadı'}</span>
            </span>
          )
        })}
      </div>
      {(runs.data ?? []).filter((r, i, a) => a.findIndex((x) => x.channel === r.channel) === i && r.status === 'hata').map((r) => (
        <div key={r.channel} className="mb-3 flex gap-2 rounded-xl bg-[#FDECEC] px-4 py-3 text-sm text-[#8a1f1f]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{r.message}</span>
        </div>
      ))}

      {loading ? (
        <Skeleton className="h-96" />
      ) : nothing ? (
        <Empty
          title="Amazon’dan henüz veri gelmedi"
          text="Amazon anahtarları Vercel’e girildikten sonra “Şimdi güncelle”ye basın ya da gece senkronunu bekleyin. Trafik raporunu Amazon birkaç dakikada hazırlar; ilk günlerin verisi ikinci güncellemede gelir."
          action={
            <Link href="/admin/entegrasyonlar">
              <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" />}>
                Entegrasyonlar
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* -------- Trafik -------- */}
          <h2 className="mb-3 mt-2 flex items-center gap-2 font-display text-xl font-black">
            <Eye className="h-5 w-5 text-thread-deep" /> Ziyaret ve dönüşüm
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ziyaret (oturum)" value={num(t.sessions)} sub={`${num(t.views)} sayfa görüntüleme`} tone="dark" />
            <Stat label="Dönüşüm" value={pct(t.conv * 100)} sub="ziyaretlerin ne kadarı satın aldı" />
            <Stat label="Satılan" value={`${num(t.units)} adet`} sub={tl(t.sales)} />
            <Stat label="Öne çıkan teklif (Buy Box)" value={t.buyBox == null ? '—' : `%${t.buyBox.toFixed(0)}`} sub={t.refunded ? `${num(t.refunded)} adet iade` : 'sepete ekle düğmesi sizde'} />
          </div>
          {(daily.data ?? []).length > 1 && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Günlük ziyaret ve satış adedi">
                <BarChart
                  labels={labels}
                  tooltipLabels={(daily.data ?? []).map((d) => dateTR(d.day))}
                  series={[{ id: 's', label: 'Ziyaret', color: '#2a78d6', values: (daily.data ?? []).map((d) => d.sessions) }]}
                  line={{ id: 'u', label: 'Satılan adet', color: '#E3AB3B', values: (daily.data ?? []).map((d) => d.units) }}
                  format={(v) => num(v)}
                />
              </Card>
              <Card title="Dönüşüm oranı (%)">
                <LineChart
                  labels={labels}
                  tooltipLabels={(daily.data ?? []).map((d) => dateTR(d.day))}
                  series={[{ id: 'c', label: 'Dönüşüm', color: '#1baf7a', values: (daily.data ?? []).map((d) => Number(d.conversion_pct ?? 0)) }]}
                  format={(v) => `%${v.toFixed(1)}`}
                />
              </Card>
            </div>
          )}
          {asinRows.length > 0 && (
            <Card className="mt-4" pad={false} title="Ürün ürün">
              <Table
                head={
                  <tr>
                    <th>Ürün</th>
                    <th className="text-right">Ziyaret</th>
                    <th className="text-right">Satılan</th>
                    <th className="text-right">Dönüşüm</th>
                    <th className="text-right">Buy Box</th>
                    <th className="text-right">Ciro</th>
                  </tr>
                }
              >
                {asinRows.map((r) => (
                  <tr key={r.asin}>
                    <td>
                      <b className="block">{r.name}</b>
                      <span className="text-xs text-ink-soft/55">{r.asin}</span>
                    </td>
                    <td className="text-right tabular-nums">{num(r.sessions)}</td>
                    <td className="text-right tabular-nums">{num(r.units)}</td>
                    <td className={cx('text-right font-bold tabular-nums', r.conv < t.conv * 0.6 && r.sessions >= 30 && 'text-[#b83030]')}>{pct(r.conv * 100)}</td>
                    <td className={cx('text-right tabular-nums', r.buyBox != null && r.buyBox < 90 && 'font-bold text-[#b83030]')}>{r.buyBox == null ? '—' : `%${r.buyBox.toFixed(0)}`}</td>
                    <td className="text-right tabular-nums">{tl(r.sales)}</td>
                  </tr>
                ))}
              </Table>
              <p className="px-5 py-3 text-xs text-ink-soft/60">Kırmızı dönüşüm: çok ziyaret alıp az satan ürün (görsel, fiyat ya da yorumlara bakın). Kırmızı Buy Box: sepete ekle düğmesi zaman zaman başka satıcıda.</p>
            </Card>
          )}

          {/* -------- Finans -------- */}
          <h2 className="mb-3 mt-8 flex items-center gap-2 font-display text-xl font-black">
            <Scale className="h-5 w-5 text-thread-deep" /> Amazon ne kesti?
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ödenen siparişler" value={tl(f.gross)} sub={`${num(f.orderCount)} sipariş`} tone="dark" />
            <Stat label="Komisyon" value={tl(f.commission)} sub={f.gross ? `cironun ${pct((f.commission / f.gross) * 100)}’i` : undefined} />
            <Stat label="FBA gönderim ücreti" value={tl(f.fba)} sub={f.orderCount ? `sipariş başı ${tl(f.fba / f.orderCount)}` : undefined} />
            <Stat label="İade" value={tl(f.refunds)} sub={f.otherCost ? `diğer ücretler ${tl(f.otherCost)}` : undefined} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Ciro nereye gitti?">
              <ShareBar
                parts={[
                  { id: 'k', label: 'Bize kalan', value: Math.max(0, f.gross - f.commission - f.fba - f.refunds - f.otherCost), color: '#1baf7a' },
                  { id: 'c', label: 'Komisyon', value: f.commission, color: '#e8743b' },
                  { id: 'f', label: 'FBA ücreti', value: f.fba, color: '#2a78d6' },
                  { id: 'r', label: 'İade', value: f.refunds, color: '#d03b3b' },
                  { id: 'o', label: 'Depolama ve diğer', value: f.otherCost, color: '#8a8f99' },
                ]}
                format={(v) => tl(v)}
              />
              <p className="mt-3 text-xs text-ink-soft/60">
                Satışlardaki komisyon ve kargo tutarları artık tahmin değil, Amazon’un gerçek kesintisi (satış listesinde “gerçek” işaretli). Depolama ve abonelik gibi siparişe bağlı olmayan ücretler Finans’a kendiliğinden gider olarak düşer.
              </p>
            </Card>
            <Card title="Siparişe bağlı olmayan ücretler">
              <HBars
                rows={Object.entries(
                  f.other.reduce<Record<string, number>>((a, r) => {
                    const k = r.description || r.type
                    a[k] = (a[k] ?? 0) + Math.abs(Number(r.total))
                    return a
                  }, {}),
                ).map(([k, v]) => ({ id: k, label: k, value: v, color: '#8a8f99' }))}
                format={(v) => tl(v)}
                empty="Bu dönemde yok"
              />
              {f.payouts > 0 && <p className="mt-3 text-xs text-ink-soft/60">Bu dönemde Amazon’dan bankaya aktarılan: {tl(f.payouts)}</p>}
            </Card>
          </div>

          {/* -------- Stok -------- */}
          <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-black">
              <RefreshCw className="h-5 w-5 text-thread-deep" /> FBA stoğu: Amazon ne diyor, panel ne diyor?
            </h2>
            {diffs.length > 0 && (
              <Button onClick={align} icon={<Scale className="h-4 w-4" />}>
                Paneli Amazon’a eşitle ({diffs.length})
              </Button>
            )}
          </div>
          <Card pad={false}>
            {stockRows.length === 0 ? (
              <p className="p-6 text-sm text-ink-soft/60">Amazon stoğu henüz gelmedi.</p>
            ) : (
              <Table
                head={
                  <tr>
                    <th>Ürün</th>
                    <th className="text-right">Amazon’da satılabilir</th>
                    <th className="text-right">Panelde</th>
                    <th className="text-right">Fark</th>
                    <th className="text-right">Yolda (Amazon’a)</th>
                    <th className="text-right">Hasarlı</th>
                  </tr>
                }
              >
                {stockRows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.label}</td>
                    <td className="text-right font-bold tabular-nums">{num(r.amazon)}</td>
                    <td className="text-right tabular-nums">{num(r.panel)}</td>
                    <td className="text-right">{r.diff === 0 ? <StatusPill tone="good">aynı</StatusPill> : <StatusPill tone={Math.abs(r.diff) > 5 ? 'critical' : 'warning'}>{r.diff > 0 ? '+' : ''}{num(r.diff)}</StatusPill>}</td>
                    <td className="text-right tabular-nums">{r.inbound ? num(r.inbound) : '—'}</td>
                    <td className={cx('text-right tabular-nums', r.broken > 0 && 'font-bold text-[#b83030]')}>{r.broken ? num(r.broken) : '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
            {unmatchedInv.length > 0 && (
              <p className="border-t border-line px-5 py-3 text-xs text-ink-soft/70">
                <b>{unmatchedInv.length} Amazon ürünü panelde bir ürüne bağlı değil</b> ({unmatchedInv.slice(0, 3).map((r) => r.sku).join(', ')}
                {unmatchedInv.length > 3 ? '…' : ''}). <Link href="/admin/entegrasyonlar" className="font-semibold underline">Entegrasyonlar → Eşleşmeyen ürünler</Link>’den bağlayın.
              </p>
            )}
            <p className="border-t border-line px-5 py-3 text-xs text-ink-soft/60">
              Fark varsa: ya bir satış/sevkiyat panele girilmemiş, ya Amazon ürünü kaybetmiş ya da hasarlı ayırmış. “Eşitle” paneli Amazon’un sayısına çeker ve farkı sayım düzeltmesi olarak kaydeder. <b>FormStep</b> ürünlerinin Amazon stoğu her senkronda kendiliğinden eşitlenir; depo ve elinizdeki diğer stoklar elle girilir.
            </p>
          </Card>
        </>
      )}
    </>
  )
}
