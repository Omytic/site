'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Inbox, CheckCircle2, Circle, Info, Lightbulb, PackageSearch, Sparkles, TrendingDown, TrendingUp, Truck, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS, CHANNELS, SERIES, TABLE_LABELS } from '@/lib/panel/constants'
import { Q, useItemsWithStock, useQuery, variantLabel } from '@/lib/panel/data'
import { holt, monthEnd, reorderPlan, weekdayShare, weeklySeries } from '@/lib/panel/forecast'
import { addDays, daysBetween, dateTR, lastMonths, monthKey, monthLabel, num, relTime, tl, today } from '@/lib/panel/format'
import { buildSuggestions, type Suggestion } from '@/lib/panel/insights'
import { changes, summarize, VERB } from '@/components/panel/audit'
import { ForecastChart, HBars, Legend, LineChart, MiniBars, ShareBar, Sparkline } from '@/components/panel/charts'
import { Card, cx, Segmented, Skeleton, Stat, StatusPill } from '@/components/panel/ui'

const prevMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TONE: Record<Suggestion['tone'], { cls: string; icon: typeof Info }> = {
  critical: { cls: 'bg-[#d03b3b]/10 text-[#a32a2a]', icon: AlertTriangle },
  warning: { cls: 'bg-[#fab219]/15 text-[#8a5a00]', icon: AlertTriangle },
  info: { cls: 'bg-[#2a78d6]/10 text-[#1c5cab]', icon: Lightbulb },
  good: { cls: 'bg-[#0ca30c]/10 text-[#0a6e0a]', icon: TrendingUp },
}

export default function Overview() {
  const { me, profiles, byId } = useAuth()
  const { data: items } = useItemsWithStock()
  const lines = Q.saleLines()
  const ledger = Q.ledger()
  const budgets = Q.adBudgets()
  const spend = Q.adSpend()
  const tasks = Q.tasks()
  const shipments = Q.shipments()
  const audit = Q.audit(40)
  const itemsQ = Q.items()
  const movements = Q.movements()
  const fairs = Q.fairs()
  const leads = Q.leads()
  const channelCosts = Q.channelCosts()
  const unmatched = useQuery('sync_unmatched', async () => {
    const { data, error } = await supabase.from('sync_unmatched').select('*').order('last_seen', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })
  const [trendView, setTrendView] = useState<'hafta' | 'ay'>('hafta')
  const [metric, setMetric] = useState<'ciro' | 'adet'>('ciro')
  const [mix, setMix] = useState<'kanal' | 'marka'>('kanal')

  const t = today()
  const mk = monthKey(t)
  const pm = prevMonth(mk)
  const dayOfMonth = Number(t.slice(8, 10))

  const sl = (lines.data ?? []).filter((l) => l.status === 'tamamlandi')
  const revOf = (m: string) => sl.filter((l) => monthKey(l.sale_date) === m).reduce((a, l) => a + Number(l.revenue), 0)
  const unitsOf = (m: string) => sl.filter((l) => monthKey(l.sale_date) === m).reduce((a, l) => a + Number(l.qty), 0)
  const cogsOf = (m: string) => sl.filter((l) => monthKey(l.sale_date) === m).reduce((a, l) => a + Number(l.cogs), 0)
  const opexOf = (m: string) =>
    (ledger.data ?? []).filter((r) => r.direction === 'gider' && r.category !== 'mal_alimi' && monthKey(r.tx_date) === m).reduce((a, r) => a + Number(r.amount), 0)
  const otherIncOf = (m: string) => (ledger.data ?? []).filter((r) => r.direction === 'gelir' && r.source === 'manuel' && monthKey(r.tx_date) === m).reduce((a, r) => a + Number(r.amount), 0)
  const profitOf = (m: string) => revOf(m) - cogsOf(m) - opexOf(m) + otherIncOf(m)

  // Geçen ayın aynı gününe kadar olan ciro ile karşılaştır (adil kıyas)
  const prevSameDay = sl
    .filter((l) => monthKey(l.sale_date) === pm && Number(l.sale_date.slice(8, 10)) <= dayOfMonth)
    .reduce((a, l) => a + Number(l.revenue), 0)
  const rev = revOf(mk)
  const delta = prevSameDay > 0 ? rev / prevSameDay - 1 : null

  const months = lastMonths(12)
  const revSeries = months.map(revOf)
  const costSeries = months.map((m) => cogsOf(m) + opexOf(m))
  const profitSeries = months.map(profitOf)

  const last30 = sl.filter((l) => l.sale_date >= addDays(t, -30))
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(t, i - 29)
    return sl.filter((l) => l.sale_date === d).reduce((a, l) => a + Number(l.revenue), 0)
  })

  const stockValue = (items ?? []).filter((i) => i.active).reduce((a, i) => a + Math.max(0, i.total) * i.cost, 0)

  const topItems = useMemo(() => {
    const m = new Map<string, { label: string; qty: number; rev: number; brand: string }>()
    last30.forEach((l) => {
      const k = l.item_id
      const cur = m.get(k) ?? { label: l.variant ? `${l.name} · ${l.variant}` : l.name, qty: 0, rev: 0, brand: l.brand }
      cur.qty += Number(l.qty)
      cur.rev += Number(l.revenue)
      m.set(k, cur)
    })
    return Array.from(m.entries())
      .sort((a, b) => b[1].rev - a[1].rev)
      .slice(0, 6)
  }, [last30])

  const suggestions = useMemo(
    () =>
      items && lines.data && ledger.data && budgets.data && spend.data && tasks.data
        ? buildSuggestions({ items, lines: lines.data, ledger: ledger.data, budgets: budgets.data, spend: spend.data, tasks: tasks.data })
        : null,
    [items, lines.data, ledger.data, budgets.data, spend.data, tasks.data],
  )

  // Ajanda: yaklaşan 14 gün
  const agenda = useMemo(() => {
    const out: { date: string; kind: 'task' | 'pay' | 'ship' | 'fair' | 'lead'; text: string; sub?: string; href: string; late?: boolean }[] = []
    ;(tasks.data ?? [])
      .filter((x) => x.status !== 'bitti' && x.due_date && x.due_date <= addDays(t, 14))
      .forEach((x) => out.push({ date: x.due_date!, kind: 'task', text: x.title, sub: byId(x.assignee)?.full_name, href: '/admin/isler', late: x.due_date! < t }))
    ;(ledger.data ?? [])
      .filter((r) => r.payment_status === 'bekliyor' && r.due_date && r.due_date <= addDays(t, 14))
      .forEach((r) =>
        out.push({
          date: r.due_date!,
          kind: 'pay',
          text: `${r.direction === 'gelir' ? 'Tahsilat' : 'Ödeme'}: ${tl(r.amount)}`,
          sub: r.counterparty ?? undefined,
          href: '/admin/finans',
          late: r.due_date! < t,
        }),
      )
    ;(shipments.data ?? [])
      .filter((s) => s.status === 'yolda')
      .forEach((s) => out.push({ date: s.ship_date, kind: 'ship', text: `${s.reference || 'Sevkiyat'} yolda`, sub: `${s.shipment_items.reduce((a, l) => a + Number(l.qty), 0)} adet · ${daysBetween(s.ship_date, t)} gündür`, href: '/admin/sevkiyat' }))
    // Talepler: cevap bekleyen yeniler ve arama günü gelenler
    ;(leads.data ?? [])
      .filter((l) => l.status === 'yeni' || (['gorusuldu', 'teklif', 'numune'].includes(l.status) && l.next_date && l.next_date <= addDays(t, 14)))
      .forEach((l) =>
        out.push({ date: l.status === 'yeni' ? l.created_at.slice(0, 10) : l.next_date!, kind: 'lead', text: `${l.status === 'yeni' ? 'Yeni talep' : 'Ara'}: ${l.company || l.name}`, sub: l.message?.slice(0, 60) ?? undefined, href: '/admin/talepler', late: l.status !== 'yeni' && l.next_date! < t }),
      )
    // Takip ettiğimiz ya da çok uygun fuarlar, 45 gün kala
    ;(fairs.data ?? [])
      .filter((f) => f.end_date >= t && f.start_date <= addDays(t, 45) && f.status !== 'gecildi' && (f.priority === 'yuksek' || f.status !== 'izle'))
      .forEach((f) => out.push({ date: f.start_date, kind: 'fair', text: f.name, sub: [f.city, f.status === 'izle' ? 'karar verilmedi' : null].filter(Boolean).join(' · '), href: '/admin/fuarlar' }))
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10)
  }, [tasks.data, ledger.data, shipments.data, fairs.data, leads.data, t, byId])

  // --- Tahminler ---
  const weeks = useMemo(() => weeklySeries(lines.data ?? [], 16), [lines.data])
  const wVals = weeks.map((w) => (metric === 'ciro' ? w.revenue : w.units))
  const fc = useMemo(() => holt(wVals.slice(0, -1), 8), [wVals.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const fcLabels = [...weeks.map((w) => w.week), ...Array.from({ length: 8 }, (_, k) => addDays(weeks[weeks.length - 1].week, (k + 1) * 7))].map((d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
  )
  // içinde bulunulan haftanın tahmini fc.values[0]; sonraki 4 hafta 1..4
  const next4 = fc.values.slice(1, 5).reduce((a, b) => a + b, 0)
  const me_ = useMemo(() => monthEnd(lines.data ?? []), [lines.data])
  const wd = useMemo(() => weekdayShare(lines.data ?? [], 84), [lines.data])
  const WD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
  const bestDay = wd.totals.indexOf(Math.max(...wd.totals))
  const plan = useMemo(() => (items && lines.data ? reorderPlan(items, lines.data) : []), [items, lines.data])
  const urgent = plan.filter((r) => r.urgency === 'now' || r.urgency === 'soon')
  // acil bir şey yoksa yine de en erken bitecekleri göster
  const runningOut = (urgent.length ? urgent : plan.filter((r) => r.daysLeft !== null)).slice(0, 6)

  // --- Kurulum: rakamların doğru çıkması için önce yapılması gerekenler ---
  const activeItems = (items ?? []).filter((i) => i.active)
  const noCost = activeItems.filter((i) => !(Number(i.cost) > 0))
  const counted = (movements.data ?? []).some((m) => m.kind === 'acilis' || m.kind === 'sayim')
  const setup = [
    { done: noCost.length === 0, text: noCost.length ? `${num(noCost.length)} ürünün birim maliyeti boş` : 'Ürün maliyetleri girildi', sub: 'Kâr ve stok değeri maliyetten hesaplanır', href: '/admin/urunler' },
    { done: (channelCosts.data ?? []).length > 0, text: 'Kanal maliyetleri (komisyon %, kargo)', sub: 'Trendyol, Amazon, Hepsiburada için bir kez', href: '/admin/stok?maliyet=1' },
    { done: counted, text: 'Açılış stoku sayımı', sub: 'Depoda ve Amazon’da şu an kaç adet var', href: '/admin/stok?sayim=1' },
    { done: (unmatched.data ?? []).length === 0, text: (unmatched.data ?? []).length ? `${num((unmatched.data ?? []).length)} pazaryeri ürünü eşleşmedi` : 'Pazaryeri ürünleri eşleşti', sub: 'Eşleşmeyen ürünün siparişleri içeri alınmaz', href: '/admin/entegrasyonlar' },
  ]
  const setupReady = !!items && !movements.loading && !channelCosts.loading && !unmatched.loading
  const setupLeft = setup.filter((x) => !x.done).length

  const loading = lines.loading || ledger.loading
  const hour = new Date().getHours()
  const greet = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'

  return (
    <>
      {/* Karşılama */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-5 overflow-hidden rounded-3xl bg-night px-6 py-7 text-white sm:px-8"
      >
        <div aria-hidden className="weave absolute inset-0" />
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-thread/25 blur-[90px]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-white/60">
              {greet}, {me.full_name}
            </p>
            <h1 className="mt-1 font-display text-3xl font-black tracking-tight sm:text-4xl">
              {monthLabel(mk, true)}: {loading ? '…' : tl(rev)} ciro
            </h1>
            <p className="mt-2 text-white/60">
              {delta === null ? 'Geçen aya göre kıyaslanacak veri yok.' : `Geçen ayın aynı dönemine göre %${Math.abs(Math.round(delta * 100))} ${delta >= 0 ? 'fazla' : 'az'}.`}
              {suggestions && suggestions.filter((s) => s.tone === 'critical').length > 0 && (
                <span className="ml-1 font-semibold text-thread-soft">{suggestions.filter((s) => s.tone === 'critical').length} acil konu var.</span>
              )}
            </p>
            {!loading && me_.estimate > 0 && (
              <div className="mt-4 max-w-md">
                <div className="flex justify-between text-xs text-white/55">
                  <span>Ay sonu tahmini</span>
                  <b className="text-white">{tl(me_.estimate)}</b>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-thread" style={{ width: `${Math.min(100, (rev / me_.estimate) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-end gap-3">
            <div>
              <p className="text-xs text-white/50">Son 30 gün, günlük ciro</p>
              <Sparkline values={daily} width={220} height={54} color="#E3AB3B" />
            </div>
          </div>
        </div>
      </motion.section>

      {setupReady && setupLeft > 0 && (
        <Card
          className="mb-4"
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-thread-deep" /> Rakamların doğru çıkması için
            </span>
          }
          action={<span className="text-xs font-semibold text-ink-soft/60">{setup.length - setupLeft}/{setup.length} tamam</span>}
        >
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
            <div className="h-full rounded-full bg-[#1baf7a]" style={{ width: `${((setup.length - setupLeft) / setup.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {setup.map((x) => (
              <li key={x.text}>
                <Link
                  href={x.href}
                  className={cx('group flex h-full gap-3 rounded-xl p-3 ring-1 transition', x.done ? 'bg-[#F7F6F2] ring-transparent' : 'bg-white ring-black/[0.08] hover:ring-black/20')}
                >
                  {x.done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1baf7a]" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft/30" />}
                  <span className="min-w-0">
                    <span className={cx('block text-sm font-bold', x.done ? 'text-ink-soft/50 line-through' : 'text-ink')}>{x.text}</span>
                    <span className="block text-xs text-ink-soft/60">{x.sub}</span>
                  </span>
                  {!x.done && <ArrowRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-ink-soft/30 transition group-hover:translate-x-0.5 group-hover:text-ink" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bu ay ciro" value={tl(rev)} delta={delta} sub="geçen ayın aynı günlerine göre" />
        <Stat label="Ay sonu tahmini" value={loading ? '…' : tl(me_.estimate)} sub={`kalan ${num(me_.daysLeft)} günde ~${tl(me_.rest)} daha`} />
        <Stat label="Bu ay net kâr" value={tl(profitOf(mk))} sub={rev ? `marj %${Math.round((profitOf(mk) / rev) * 100)}` : undefined} />
        <Stat label="Bu ay satılan" value={num(unitsOf(mk))} sub={`geçen ay ${num(unitsOf(pm))} · stok ${tl(stockValue)}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card
          title={trendView === 'hafta' ? 'Haftalık satış ve tahmin' : 'Son 12 ay'}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {trendView === 'hafta' && <Segmented size="sm" value={metric} onChange={setMetric} options={[{ id: 'ciro', label: 'Ciro' }, { id: 'adet', label: 'Adet' }]} />}
              <Segmented size="sm" value={trendView} onChange={setTrendView} options={[{ id: 'hafta', label: 'Haftalık' }, { id: 'ay', label: '12 ay' }]} />
            </div>
          }
        >
          {loading ? (
            <Skeleton className="h-[280px]" />
          ) : trendView === 'hafta' ? (
            <>
              <ForecastChart
                height={250}
                labels={fcLabels}
                actual={wVals}
                partialLast
                forecast={fc.values}
                lower={fc.lower}
                upper={fc.upper}
                format={(v) => (metric === 'ciro' ? tl(v) : `${num(Math.round(v))} adet`)}
              />
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <p className="text-xs text-ink-soft/60">Önümüzdeki 4 hafta</p>
                  <p className="font-display text-base font-black sm:text-xl">{metric === 'ciro' ? tl(next4) : `${num(Math.round(next4))} adet`}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-soft/60">Gidişat</p>
                  <p className={cx('flex items-center gap-1 whitespace-nowrap font-display text-base font-black sm:text-xl', fc.trend >= 0.01 ? 'text-[#0a7d0a]' : fc.trend <= -0.01 ? 'text-[#b83030]' : 'text-ink')}>
                    {fc.trend >= 0.01 ? <TrendingUp className="hidden h-5 w-5 sm:block" /> : fc.trend <= -0.01 ? <TrendingDown className="hidden h-5 w-5 sm:block" /> : null}
                    {Math.abs(fc.trend) < 0.01 ? 'Yatay' : `${fc.trend > 0 ? '+' : '−'}%${Math.abs(Math.round(fc.trend * 100))}/hafta`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-soft/60">En çok satılan gün</p>
                  <p className="font-display text-base font-black sm:text-xl">{wd.totals.some((v) => v > 0) ? ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][bestDay] : '—'}</p>
                </div>
              </div>
              {!fc.reliable && <p className="mt-3 text-xs text-ink-soft/55">Henüz birkaç haftalık satış var; tahmin veri biriktikçe netleşir.</p>}
            </>
          ) : (
            <LineChart
              height={280}
              labels={months.map((m) => monthLabel(m))}
              tooltipLabels={months.map((m) => monthLabel(m, true))}
              series={[
                { id: 'rev', label: 'Ciro', color: SERIES[0], values: revSeries },
                { id: 'cost', label: 'Maliyet + gider', color: SERIES[1], values: costSeries },
                { id: 'profit', label: 'Net kâr', color: '#0E1527', values: profitSeries, dashed: true },
              ]}
              format={(v) => tl(v)}
            />
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-thread-deep" /> Öneriler
            </span>
          }
          action={suggestions && <span className="text-xs text-ink-soft/50">{suggestions.length} konu</span>}
        >
          {!suggestions ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#0ca30c]" />
              <p className="mt-2 font-semibold">Şu an dikkat edilecek bir şey yok</p>
              <p className="text-sm text-ink-soft/60">Satış ve stok verisi geldikçe öneriler burada çıkar.</p>
            </div>
          ) : (
            <ul className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {suggestions.slice(0, 10).map((s, i) => {
                const T = TONE[s.tone]
                return (
                  <motion.li key={s.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link href={s.href ?? '#'} className="group flex gap-3 rounded-xl p-3 transition hover:bg-[#F7F6F2]">
                      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', T.cls)}>
                        <T.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-ink">{s.title}</span>
                        <span className="block text-xs leading-relaxed text-ink-soft/70">{s.text}</span>
                      </span>
                      <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-ink-soft/30 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                    </Link>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title={
            <span className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-ink-soft/60" /> Stok ne zaman biter?
            </span>
          }
          action={
            <Link href="/admin/stok?sekme=siparis" className="text-xs font-semibold text-ink-soft/60 hover:text-ink">
              Sipariş önerisi →
            </Link>
          }
        >
          {!items || lines.loading ? (
            <Skeleton className="h-48" />
          ) : runningOut.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-[#0ca30c]" />
              <p className="mt-2 font-semibold">Henüz satış hızı yok</p>
              <p className="text-sm text-ink-soft/60">Satış girildikçe hangi ürünün ne zaman biteceği burada çıkar.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {!urgent.length && <li className="px-2 pb-1 text-xs text-ink-soft/60">7 hafta içinde biten yok. En erken bitecekler:</li>}
              {runningOut.map((r) => (
                <li key={r.item.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className={cx('h-8 w-1 shrink-0 rounded-full', r.urgency === 'now' ? 'bg-[#d03b3b]' : r.urgency === 'soon' ? 'bg-[#eda100]' : 'bg-[#1baf7a]')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {r.item.name}
                      {variantLabel(r.item) && <span className="font-normal text-ink-soft/70"> · {variantLabel(r.item)}</span>}
                    </span>
                    <span className="block text-xs text-ink-soft/60">
                      {num(r.stock)} kaldı · ~{num(Math.floor(r.daysLeft ?? 0))} gün{r.runOut ? ` (${dateTR(r.runOut)})` : ''}
                    </span>
                  </span>
                  {r.urgency === 'ok' ? (
                    <StatusPill tone="good">Yeterli</StatusPill>
                  ) : (
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black tabular-nums">{num(r.suggest)}</span>
                      <span className="block text-[11px] text-ink-soft/50">sipariş</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Bu ay nereden geldi?" action={<Segmented size="sm" value={mix} onChange={setMix} options={[{ id: 'kanal', label: 'Kanal' }, { id: 'marka', label: 'Marka' }]} />}>
          {mix === 'kanal' ? (
            <ShareBar
              parts={CHANNELS.map((c) => ({ id: c.id, label: c.label, color: c.color, value: sl.filter((l) => l.channel === c.id && monthKey(l.sale_date) === mk).reduce((a, l) => a + Number(l.revenue), 0) }))}
              format={(v) => tl(v)}
            />
          ) : (
            <ShareBar
              parts={BRANDS.map((b) => ({ id: b.id, label: b.label, color: b.color, value: sl.filter((l) => l.brand === b.id && monthKey(l.sale_date) === mk).reduce((a, l) => a + Number(l.revenue), 0) }))}
              format={(v) => tl(v)}
            />
          )}
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-3 text-xs font-semibold text-ink-soft/60">Haftanın günlerine göre ciro · son 12 hafta</p>
            <MiniBars labels={WD} values={wd.totals} format={(v) => tl(v)} height={110} />
          </div>
        </Card>
        <Card title="En çok satanlar · 30 gün">
          <HBars
            rows={topItems.map(([id, v]) => ({ id, label: v.label, value: v.rev, color: BRANDS.find((b) => b.id === v.brand)?.color, sub: `${num(v.qty)} adet` }))}
            format={(v) => tl(v)}
            empty="Son 30 günde satış yok"
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-ink-soft/60" /> Yaklaşanlar
            </span>
          }
        >
          {agenda.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft/50">Önümüzdeki 2 haftada tarihli iş, ödeme ya da yoldaki sevkiyat yok.</p>
          ) : (
            <ul className="space-y-1">
              {agenda.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[#F7F6F2]">
                    <span className="w-14 shrink-0 text-center">
                      <span className="block font-display text-lg font-black leading-none">{new Date(a.date + 'T00:00:00').getDate()}</span>
                      <span className="block text-[11px] text-ink-soft/60">{new Date(a.date + 'T00:00:00').toLocaleDateString('tr-TR', { month: 'short' })}</span>
                    </span>
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', a.kind === 'task' ? 'bg-thread/15 text-thread-deep' : a.kind === 'pay' ? 'bg-[#2a78d6]/10 text-[#1c5cab]' : a.kind === 'fair' ? 'bg-[#E3AB3B]/20 text-[#8a5a00]' : a.kind === 'lead' ? 'bg-[#7a3aa8]/10 text-[#7a3aa8]' : 'bg-[#1baf7a]/12 text-[#0f7a54]')}>
                      {a.kind === 'task' ? <CheckCircle2 className="h-4 w-4" /> : a.kind === 'pay' ? <Wallet className="h-4 w-4" /> : a.kind === 'fair' ? <CalendarDays className="h-4 w-4" /> : a.kind === 'lead' ? <Inbox className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{a.text}</span>
                      {a.sub && <span className="block truncate text-xs text-ink-soft/60">{a.sub}</span>}
                    </span>
                    {a.late && <StatusPill tone="critical">Gecikti</StatusPill>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Son hareketler" action={<Link href="/admin/gecmis" className="text-xs font-semibold text-ink-soft/60 hover:text-ink">Tüm geçmiş →</Link>}>
          {audit.loading ? (
            <Skeleton className="h-48" />
          ) : (
            <ul className="space-y-0.5">
              {(audit.data ?? [])
                .filter((r) => !r.table_name.endsWith('_items'))
                .slice(0, 7)
                .map((r) => {
                  const u = byId(r.user_id)
                  const diff = changes(r)
                  return (
                    <li key={r.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-night" style={{ backgroundColor: u?.color ?? '#D6D3CA' }}>
                        {(u?.full_name ?? 'S').slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-ink">
                          <b>{u?.full_name ?? 'Sistem'}</b> {(TABLE_LABELS[r.table_name] ?? r.table_name).toLocaleLowerCase('tr-TR')} {VERB[r.action]}
                        </span>
                        <span className="block truncate text-xs text-ink-soft/60">
                          {summarize(r, { items: itemsQ.data ?? [], profiles })}
                          {diff.length ? ` · ${diff.map((d) => d.label).join(', ')}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-soft/40">{relTime(r.at)}</span>
                    </li>
                  )
                })}
              {(audit.data ?? []).length === 0 && <li className="py-8 text-center text-sm text-ink-soft/50">Henüz kayıt yok.</li>}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
