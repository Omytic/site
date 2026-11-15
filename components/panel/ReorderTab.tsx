'use client'

import { Fragment, useMemo, useState } from 'react'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { BRANDS, colorOf, label, UNITS } from '@/lib/panel/constants'
import { groupModels, useLocalState, variantLabel, type ItemWithStock, type SaleLine } from '@/lib/panel/data'
import { dateTR, num } from '@/lib/panel/format'
import { reorderPlan, type Reorder } from '@/lib/panel/forecast'
import { Button, Card, cx, Empty, Input, Skeleton, StatusPill } from './ui'

const URG: Record<Reorder['urgency'], { tone: 'critical' | 'warning' | 'good' | 'neutral'; text: string }> = {
  now: { tone: 'critical', text: 'Hemen sipariş ver' },
  soon: { tone: 'warning', text: 'Yakında' },
  ok: { tone: 'good', text: 'Yeterli' },
  none: { tone: 'neutral', text: 'Satış yok' },
}
const rank = { now: 0, soon: 1, ok: 2, none: 3 }

/** Stok › Sipariş önerisi: hangi varyant ne zaman biter, kaç adet sipariş verilmeli. */
export function ReorderTab({ items, lines, loading }: { items: ItemWithStock[]; lines: SaleLine[]; loading: boolean }) {
  const [lead, setLead] = useLocalState('omy-reorder-lead', 30)
  const [cover, setCover] = useLocalState('omy-reorder-cover', 60)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)

  const plan = useMemo(() => reorderPlan(items, lines, { leadDays: lead, coverDays: cover }), [items, lines, lead, cover])
  const byId = useMemo(() => new Map(plan.map((r) => [r.item.id, r])), [plan])
  const models = useMemo(() => {
    return groupModels(items.filter((i) => byId.has(i.id)))
      .map((m) => {
        const rows = m.items.map((i) => byId.get(i.id)!).sort((a, b) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9))
        const worst = rows.reduce<Reorder['urgency']>((w, r) => (rank[r.urgency] < rank[w] ? r.urgency : w), 'none')
        return { m, rows, worst, suggest: rows.reduce((a, r) => a + r.suggest, 0), perDay: rows.reduce((a, r) => a + r.perDay, 0), stock: rows.reduce((a, r) => a + r.stock, 0) }
      })
      .sort((a, b) => rank[a.worst] - rank[b.worst] || b.suggest - a.suggest)
  }, [items, byId])

  const toOrder = models.filter((x) => x.suggest > 0)
  const copyList = async () => {
    const text = toOrder
      .map((x) => `${x.m.name}\n${x.rows.filter((r) => r.suggest > 0).map((r) => `  ${variantLabel(r.item) || '-'}: ${num(r.suggest)} ${label(UNITS, r.item.unit)}`).join('\n')}`)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (loading) return <Skeleton className="h-72" />
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-xl">
            <p className="font-bold text-ink">Ne zaman, ne kadar sipariş verilmeli?</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft/70">
              Son 30 ve 90 günün satış hızından hesaplanır. Öneri = (tedarik süresi + hedef kapsama) × günlük satış − eldeki stok (depo + yolda + Amazon).
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-36 text-xs font-semibold text-ink-soft/70">
              Tedarik süresi (gün)
              <Input type="number" min={1} value={lead} onChange={(e) => setLead(Math.max(1, Number(e.target.value) || 1))} className="mt-1" />
            </label>
            <label className="block w-36 text-xs font-semibold text-ink-soft/70">
              Kaç günlük stok
              <Input type="number" min={7} value={cover} onChange={(e) => setCover(Math.max(7, Number(e.target.value) || 7))} className="mt-1" />
            </label>
            <Button variant="secondary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copyList} disabled={!toOrder.length}>
              {copied ? 'Kopyalandı' : 'Sipariş listesini kopyala'}
            </Button>
          </div>
        </div>
      </Card>

      {models.length === 0 ? (
        <Empty title="Ürün yok" text="Bu markada aktif ürün bulunmuyor." />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-ink-soft/60">
                  <th className="px-5 py-3">Ürün</th>
                  <th className="px-3 py-3 text-right">Eldeki</th>
                  <th className="px-3 py-3 text-right">Günlük satış</th>
                  <th className="px-3 py-3 text-right" title="Modelde ilk bitecek varyanta göre">Yeter (ilk biten)</th>
                  <th className="px-3 py-3">Biter</th>
                  <th className="px-3 py-3 text-right">Önerilen sipariş</th>
                  <th className="px-5 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {models.map(({ m, rows, worst, suggest, perDay, stock }) => {
                  const multi = rows.length > 1
                  const isOpen = open.has(m.key)
                  const first = rows[0]
                  return (
                    <Fragment key={m.key}>
                      <tr
                        className={cx('border-b border-line/70', multi && 'cursor-pointer hover:bg-[#FAF9F6]')}
                        onClick={() => multi && setOpen((s) => (s.has(m.key) ? (s.delete(m.key), new Set(s)) : new Set(s.add(m.key))))}
                      >
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-2">
                            {multi ? <ChevronRight className={cx('h-4 w-4 shrink-0 text-ink-soft/40 transition', isOpen && 'rotate-90')} /> : <span className="w-4" />}
                            <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: colorOf(BRANDS, m.brand) }} />
                            <span>
                              <b className="block text-ink">{multi ? m.name : first.item.label}</b>
                              {multi && <span className="text-xs text-ink-soft/55">{rows.length} varyant · ilk biten {variantLabel(first.item) || '—'}</span>}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{num(stock)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-ink-soft">{perDay > 0 ? perDay.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '—'}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{first.daysLeft === null ? '—' : `${num(Math.floor(first.daysLeft))} gün`}</td>
                        <td className="px-3 py-3 text-ink-soft">{first.runOut ? dateTR(first.runOut) : '—'}</td>
                        <td className="px-3 py-3 text-right">
                          {suggest > 0 ? <b className="font-display text-base tabular-nums text-ink">{num(suggest)}</b> : <span className="text-ink-soft/40">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <StatusPill tone={URG[worst].tone}>{URG[worst].text}</StatusPill>
                        </td>
                      </tr>
                      {multi &&
                        isOpen &&
                        rows.map((r) => (
                          <tr key={r.item.id} className="border-b border-line/40 bg-[#FAF9F6] text-[13px]">
                            <td className="py-2 pl-[70px] pr-3 text-ink-soft">{variantLabel(r.item) || r.item.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{num(r.stock)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{r.perDay > 0 ? r.perDay.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.daysLeft === null ? '—' : `${num(Math.floor(r.daysLeft))} gün`}</td>
                            <td className="px-3 py-2 text-ink-soft">{r.runOut ? dateTR(r.runOut) : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.suggest > 0 ? num(r.suggest) : '—'}</td>
                            <td className="px-5 py-2">
                              <StatusPill tone={URG[r.urgency].tone}>{URG[r.urgency].text}</StatusPill>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
