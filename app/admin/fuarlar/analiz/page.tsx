'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, Trophy } from 'lucide-react'
import { BRANDS } from '@/lib/panel/constants'
import { Q } from '@/lib/panel/data'
import { dateTR, num, sum, tl } from '@/lib/panel/format'
import { HBars, MiniBars, ShareBar } from '@/components/panel/charts'
import { Card, cx, Empty, PageHeader, Select, Skeleton, Stat } from '@/components/panel/ui'

const PAY_LABEL: Record<string, string> = { nakit: 'Nakit', kart: 'Kart', havale: 'Havale', diger: 'Diğer' }
const PAY_COLOR: Record<string, string> = { nakit: '#1baf7a', kart: '#2a78d6', havale: '#E3AB3B', diger: '#8a8f99' }

export default function FairAnalysis() {
  const fairs = Q.fairs()
  const lines = Q.saleLines()
  const txs = Q.transactions()
  const leads = Q.leads()
  const [sel, setSel] = useState<string>('')

  const rows = useMemo(() => {
    const L = (lines.data ?? []).filter((l) => l.fair_id && l.status === 'tamamlandi')
    const T = (txs.data ?? []).filter((t) => t.fair_id)
    return (fairs.data ?? [])
      .map((f) => {
        const s = L.filter((l) => l.fair_id === f.id)
        const e = T.filter((t) => t.fair_id === f.id)
        const revenue = sum(s, (l) => l.revenue)
        const cogs = sum(s, (l) => l.cogs)
        const list = sum(s, (l) => (l.list_price ?? l.unit_price) * l.qty)
        const cost = sum(e, (t) => (t.direction === 'gider' ? t.amount : -t.amount)) || Number(f.cost ?? 0)
        const days = Math.max(1, new Set(s.map((l) => l.sale_date)).size)
        const people = (leads.data ?? []).filter((x) => x.fair_id === f.id).length || Number(f.contacts ?? 0)
        return {
          f,
          lines: s,
          revenue,
          cogs,
          units: sum(s, (l) => l.qty),
          sales: new Set(s.map((l) => l.sale_id)).size,
          discount: Math.max(0, list - revenue),
          discountRate: list > 0 ? Math.max(0, list - revenue) / list : 0,
          cost,
          net: revenue - cogs - cost,
          roi: cost > 0 ? (revenue - cogs - cost) / cost : null,
          perDay: revenue / days,
          people,
        }
      })
      .filter((r) => r.revenue > 0 || r.cost > 0 || r.people > 0)
      .sort((a, b) => b.f.start_date.localeCompare(a.f.start_date))
  }, [fairs.data, lines.data, txs.data, leads.data])

  const cur = rows.find((r) => r.f.id === sel) ?? rows[0]
  const loading = fairs.loading || lines.loading || txs.loading

  // Seçili fuar: saat, gün, ürün, ödeme kırılımları
  const detail = useMemo(() => {
    if (!cur) return null
    const hours = Array.from({ length: 14 }, (_, i) => i + 9) // 09–22
    const byHour = hours.map((h) => sum(cur.lines.filter((l) => l.created_at && new Date(l.created_at).getHours() === h), (l) => l.revenue))
    const days = Array.from(new Set(cur.lines.map((l) => l.sale_date))).sort()
    const byDay = days.map((d) => sum(cur.lines.filter((l) => l.sale_date === d), (l) => l.revenue))
    const prod = new Map<string, { label: string; qty: number; rev: number; brand: string }>()
    cur.lines.forEach((l) => {
      const k = l.name
      const e = prod.get(k) ?? { label: l.name, qty: 0, rev: 0, brand: l.brand }
      e.qty += Number(l.qty)
      e.rev += Number(l.revenue)
      prod.set(k, e)
    })
    const pay = new Map<string, number>()
    const seen = new Set<string>()
    cur.lines.forEach((l) => {
      const k = l.payment_method ?? 'diger'
      pay.set(k, (pay.get(k) ?? 0) + Number(l.revenue))
      seen.add(l.sale_id)
    })
    return { hours, byHour, days, byDay, prod: Array.from(prod.entries()).sort((a, b) => b[1].rev - a[1].rev), pay }
  }, [cur])

  const tot = { revenue: sum(rows, (r) => r.revenue), cost: sum(rows, (r) => r.cost), net: sum(rows, (r) => r.net), units: sum(rows, (r) => r.units) }
  const best = [...rows].filter((r) => r.revenue > 0).sort((a, b) => b.net - a.net)[0]

  return (
    <>
      <Link href="/admin/fuarlar" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft/60 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Fuarlar
      </Link>
      <PageHeader title="Fuar analizleri" subtitle="Katıldığımız fuarlar ne getirdi, neye mal oldu? Satışlar fuar kasasından, giderler fuar sayfasından gelir." />

      {loading ? (
        <Skeleton className="h-80" />
      ) : rows.length === 0 ? (
        <Empty title="Henüz fuar verisi yok" text="Bir fuarın durumunu “Gidiyoruz” yapın, fuar sayfasından satış ve gider girin; analizler burada çıkar." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Fuarlardan ciro" value={tl(tot.revenue)} sub={`${num(rows.filter((r) => r.revenue > 0).length)} fuar · ${num(tot.units)} adet`} />
            <Stat label="Fuar giderleri" value={tl(tot.cost)} />
            <Stat label="Net kâr" value={tl(tot.net)} sub="ciro − ürün maliyeti − gider" />
            <Stat label="En verimli fuar" value={best ? best.f.name.split('–')[0].trim() : '—'} sub={best ? `${tl(best.net)} net` : undefined} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Fuar başına ciro">
              <HBars rows={rows.filter((r) => r.revenue > 0).map((r) => ({ id: r.f.id, label: r.f.name, value: r.revenue, sub: `${num(r.units)} adet · ${dateTR(r.f.start_date)}` }))} format={(v) => tl(v)} empty="Satış yok" />
            </Card>
            <Card title="Fuar başına net kâr">
              <HBars
                rows={rows.map((r) => ({ id: r.f.id, label: r.f.name, value: Math.max(0, r.net), color: r.net >= 0 ? '#1baf7a' : '#d03b3b', sub: r.net < 0 ? `zarar ${tl(-r.net)}` : r.roi !== null ? `harcanan her 1 ₺ için ${tl(r.roi + 1, true)} döndü` : undefined }))}
                format={(v) => tl(v)}
              />
            </Card>
          </div>

          <Card className="mt-4" pad={false} title="Karşılaştırma">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs font-semibold text-ink-soft/60">
                    <th className="px-5 py-2.5">Fuar</th>
                    <th className="px-3 py-2.5 text-right">Ciro</th>
                    <th className="px-3 py-2.5 text-right">Adet</th>
                    <th className="px-3 py-2.5 text-right">Ort. sepet</th>
                    <th className="px-3 py-2.5 text-right">İndirim</th>
                    <th className="px-3 py-2.5 text-right">Gider</th>
                    <th className="px-3 py-2.5 text-right">Net</th>
                    <th className="px-3 py-2.5 text-right">Günlük ciro</th>
                    <th className="px-5 py-2.5 text-right">Tanışılan</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.f.id} onClick={() => setSel(r.f.id)} className={cx('cursor-pointer border-b border-line/60 hover:bg-[#FAF9F6]', cur?.f.id === r.f.id && 'bg-[#FFF8E6]')}>
                      <td className="px-5 py-2.5">
                        <b className="block">{r.f.name}</b>
                        <span className="text-xs text-ink-soft/55">{dateTR(r.f.start_date)} · {r.f.city}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums">{tl(r.revenue)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{num(r.units)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{r.sales ? tl(r.revenue / r.sales) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{r.discount > 0 ? `${tl(r.discount)} (%${Math.round(r.discountRate * 100)})` : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{tl(r.cost)}</td>
                      <td className={cx('whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums', r.net < 0 ? 'text-[#b83030]' : 'text-[#0a7d0a]')}>{tl(r.net)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{tl(r.perDay)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{num(r.people)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {cur && detail && (
            <>
              <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-xl font-black">
                  <Trophy className="h-5 w-5 text-thread-deep" /> {cur.f.name}
                </h2>
                <div className="w-full sm:w-80">
                  <Select value={cur.f.id} onChange={(e) => setSel(e.target.value)}>
                    {rows.map((r) => (
                      <option key={r.f.id} value={r.f.id}>
                        {r.f.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Saatlere göre ciro">
                  {cur.lines.length ? <MiniBars labels={detail.hours.map((h) => String(h))} values={detail.byHour} format={(v) => tl(v)} height={160} /> : <p className="text-sm text-ink-soft/55">Satış yok.</p>}
                  <p className="mt-2 text-xs text-ink-soft/55">Kasaya giriş saatine göre. Kalabalık saatte stantta daha çok kişi olsun.</p>
                </Card>
                <Card title="Günlere göre ciro">
                  {detail.days.length ? <MiniBars labels={detail.days.map((d) => dateTR(d).slice(0, 6))} values={detail.byDay} format={(v) => tl(v)} height={160} color="#E3AB3B" /> : <p className="text-sm text-ink-soft/55">Satış yok.</p>}
                </Card>
                <Card title="Ödeme şekli">
                  <ShareBar parts={Array.from(detail.pay.entries()).map(([k, v]) => ({ id: k, label: PAY_LABEL[k] ?? k, value: v, color: PAY_COLOR[k] ?? '#8a8f99' }))} format={(v) => tl(v)} />
                </Card>
              </div>
              <Card className="mt-4" title="Ne sattık?">
                <HBars
                  rows={detail.prod.map(([k, v]) => ({ id: k, label: v.label, value: v.rev, color: BRANDS.find((b) => b.id === v.brand)?.color, sub: `${num(v.qty)} adet · ort. ${tl(v.rev / Math.max(1, v.qty))}` }))}
                  format={(v) => tl(v)}
                  empty="Satış yok"
                />
              </Card>
            </>
          )}
        </>
      )}
    </>
  )
}
