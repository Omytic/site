'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Info, Lightbulb, Sparkles, TrendingUp, Truck, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS, CHANNELS, SERIES, TABLE_LABELS } from '@/lib/panel/constants'
import { Q, useItemsWithStock } from '@/lib/panel/data'
import { addDays, daysBetween, dateTR, lastMonths, monthKey, monthLabel, num, relTime, tl, today } from '@/lib/panel/format'
import { buildSuggestions, type Suggestion } from '@/lib/panel/insights'
import { changes, summarize, VERB } from '@/components/panel/audit'
import { HBars, Legend, LineChart, ShareBar, Sparkline } from '@/components/panel/charts'
import { Card, cx, Skeleton, Stat, StatusPill } from '@/components/panel/ui'

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
    const out: { date: string; kind: 'task' | 'pay' | 'ship'; text: string; sub?: string; href: string; late?: boolean }[] = []
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
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
  }, [tasks.data, ledger.data, shipments.data, t, byId])

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
          </div>
          <div className="flex items-end gap-3">
            <div>
              <p className="text-xs text-white/50">Son 30 gün, günlük ciro</p>
              <Sparkline values={daily} width={220} height={54} color="#E3AB3B" />
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bu ay ciro" value={tl(rev)} delta={delta} sub="geçen ayın aynı günlerine göre" />
        <Stat label="Bu ay net kâr" value={tl(profitOf(mk))} sub={rev ? `marj %${Math.round((profitOf(mk) / rev) * 100)}` : undefined} />
        <Stat label="Bu ay satılan" value={num(unitsOf(mk))} sub={`geçen ay ${num(unitsOf(pm))}`} />
        <Stat label="Stok değeri" value={tl(stockValue)} sub="maliyet fiyatıyla" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card
          title="Son 12 ay"
          action={
            <Legend
              items={[
                { label: 'Ciro', color: SERIES[0] },
                { label: 'Maliyet + gider', color: SERIES[1] },
                { label: 'Net kâr', color: '#0E1527', dashed: true },
              ]}
            />
          }
        >
          {loading ? (
            <Skeleton className="h-[280px]" />
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
        <Card title="Bu ay kanallar">
          <ShareBar
            parts={CHANNELS.map((c) => ({ id: c.id, label: c.label, color: c.color, value: sl.filter((l) => l.channel === c.id && monthKey(l.sale_date) === mk).reduce((a, l) => a + Number(l.revenue), 0) }))}
            format={(v) => tl(v)}
          />
        </Card>
        <Card title="Bu ay markalar">
          <ShareBar
            parts={BRANDS.map((b) => ({ id: b.id, label: b.label, color: b.color, value: sl.filter((l) => l.brand === b.id && monthKey(l.sale_date) === mk).reduce((a, l) => a + Number(l.revenue), 0) }))}
            format={(v) => tl(v)}
          />
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
                    <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', a.kind === 'task' ? 'bg-thread/15 text-thread-deep' : a.kind === 'pay' ? 'bg-[#2a78d6]/10 text-[#1c5cab]' : 'bg-[#1baf7a]/12 text-[#0f7a54]')}>
                      {a.kind === 'task' ? <CheckCircle2 className="h-4 w-4" /> : a.kind === 'pay' ? <Wallet className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
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
                .slice(0, 9)
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
