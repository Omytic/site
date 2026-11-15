'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { variantLabel, type ItemWithStock } from '@/lib/panel/data'
import { num, tl } from '@/lib/panel/format'
import { cx } from './ui'

/**
 * Bir alım/sevkiyattaki satırları modele göre özetler:
 * "FormStep M100 · 300 adet · 10 numara · ₺75" — numaralar istenirse açılır.
 */
export function LinesSummary({
  lines,
  items,
  price = true,
  className,
}: {
  lines: { item_id: string; qty: number; unit_cost?: number }[]
  items: ItemWithStock[] | undefined
  price?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const byId = new Map((items ?? []).map((i) => [i.id, i]))
  const groups = new Map<string, { name: string; qty: number; total: number; prices: Set<number>; rows: { label: string; qty: number; cost?: number }[] }>()
  lines.forEach((l) => {
    const it = byId.get(l.item_id)
    const name = it?.name ?? '…'
    const g = groups.get(name) ?? { name, qty: 0, total: 0, prices: new Set<number>(), rows: [] }
    g.qty += Number(l.qty)
    g.total += Number(l.qty) * Number(l.unit_cost ?? 0)
    if (l.unit_cost !== undefined) g.prices.add(Number(l.unit_cost))
    g.rows.push({ label: it ? variantLabel(it) || it.label : '…', qty: Number(l.qty), cost: l.unit_cost })
    groups.set(name, g)
  })
  const list = Array.from(groups.values())
  const multi = list.some((g) => g.rows.length > 1)
  return (
    <div className={className}>
      <ul className="space-y-0.5">
        {list.map((g) => (
          <li key={g.name} className="text-ink-soft">
            <p className="truncate">
              <b className="text-ink">{num(g.qty)}×</b> {g.name}
              {g.rows.length > 1 && <span className="text-xs"> · {g.rows.length} çeşit</span>}
              {price && g.prices.size > 0 && <span className="text-xs"> · {g.prices.size === 1 ? `@ ${tl([...g.prices][0], true)}` : 'karışık fiyat'}</span>}
            </p>
            {open && g.rows.length > 1 && (
              <ul className="mb-1 ml-3 mt-0.5 border-l border-line pl-2 text-xs">
                {g.rows.map((r, i) => (
                  <li key={i} className="truncate">
                    <b className="text-ink">{num(r.qty)}×</b> {r.label}
                    {price && r.cost !== undefined && g.prices.size > 1 && <span> @ {tl(r.cost, true)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {multi && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft/60 hover:text-ink">
          <ChevronDown className={cx('h-3.5 w-3.5 transition', open && 'rotate-180')} />
          {open ? 'Numaraları gizle' : 'Numaraları göster'}
        </button>
      )}
    </div>
  )
}
