'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

/*
 * Bağımlılıksız SVG grafikleri.
 * Kurallar (dataviz): ince işaretler, 4px yuvarlak veri uçları tabana oturur, 2px çizgiler,
 * yığılmış dilimler arasında 2px boşluk, geri planda kalan ızgara, tek eksen,
 * ≥2 seri için açıklama (legend), her grafikte üzerine gelince ipucu.
 */

const GRID = '#ECEAE4'
const AXIS_TEXT = '#7A8090'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** "Güzel" eksen adımları. */
function niceTicks(min: number, max: number, count = 4) {
  if (max === min) max = min + 1
  const span = max - min
  const step0 = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const norm = step0 / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

const shortNum = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`
  if (a >= 1000) return `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B`
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
}

export interface Series {
  id: string
  label: string
  color: string
  values: number[]
  dashed?: boolean
}

export function Legend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-ink-soft', className)}>
      {items.map((s) => (
        <li key={s.label} className="inline-flex items-center gap-1.5">
          {s.dashed ? (
            <svg width="16" height="4" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          ) : (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 90), w - 90)
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[160px] -translate-x-1/2 -translate-y-full rounded-xl bg-night px-3 py-2.5 text-xs text-white shadow-xl"
      style={{ left, top: y - 10 }}
    >
      {children}
    </div>
  )
}
const TipRow = ({ color, label, value, dashed }: { color?: string; label: string; value: string; dashed?: boolean }) => (
  <div className="flex items-center justify-between gap-4 py-0.5">
    <span className="inline-flex items-center gap-1.5 text-white/70">
      {color && (dashed ? <span className="h-0.5 w-3" style={{ backgroundColor: color }} /> : <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: color }} />)}
      {label}
    </span>
    <span className="font-bold tabular-nums">{value}</span>
  </div>
)

/* ------------------------------------------------------------------ */
/* Çizgi / alan grafiği (zaman serisi)                                 */
/* ------------------------------------------------------------------ */
export function LineChart({
  labels,
  series,
  height = 260,
  format = shortNum,
  area = true,
  tooltipLabels,
}: {
  labels: string[]
  series: Series[]
  height?: number
  format?: (v: number) => string
  area?: boolean
  tooltipLabels?: string[]
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 48
  const padR = 12
  const padT = 12
  const padB = 28
  const all = series.flatMap((s) => s.values)
  const ticks = niceTicks(Math.min(0, ...all), Math.max(1, ...all))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const iw = Math.max(1, w - padL - padR)
  const ih = height - padT - padB
  const n = labels.length
  const X = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const Y = (v: number) => padT + ih - ((v - yMin) / (yMax - yMin)) * ih
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))))

  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.id} id={`g-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity="0.18" />
                <stop offset="1" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? '#D6D3CA' : GRID} />
              <text x={padL - 8} y={Y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={AXIS_TEXT}>
                {shortNum(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={i} x={X(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>
                {l}
              </text>
            ) : null,
          )}
          {area &&
            series
              .filter((s) => !s.dashed)
              .map((s) => <path key={s.id} d={`${path(s.values)}L${X(n - 1)},${Y(Math.max(0, yMin))}L${X(0)},${Y(Math.max(0, yMin))}Z`} fill={`url(#g-${s.id})`} />)}
          {series.map((s) => (
            <path key={s.id} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
          ))}
          {hover !== null && (
            <>
              <line x1={X(hover)} x2={X(hover)} y1={padT} y2={padT + ih} stroke="#0E1527" strokeOpacity="0.25" />
              {series.map((s) => (
                <circle key={s.id} cx={X(hover)} cy={Y(s.values[hover])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
              ))}
            </>
          )}
          <rect
            x={padL}
            y={0}
            width={iw}
            height={height}
            fill="transparent"
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
              const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1))
              setHover(Math.max(0, Math.min(n - 1, i)))
            }}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && w > 0 && (
        <Tooltip x={X(hover)} y={Math.min(...series.map((s) => Y(s.values[hover])))} w={w}>
          <p className="mb-1 font-bold">{tooltipLabels?.[hover] ?? labels[hover]}</p>
          {series.map((s) => (
            <TipRow key={s.id} color={s.color} label={s.label} value={format(s.values[hover])} dashed={s.dashed} />
          ))}
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sütun grafiği (gruplu ya da yığılmış)                               */
/* ------------------------------------------------------------------ */
export function BarChart({
  labels,
  series,
  stacked = false,
  height = 260,
  format = shortNum,
  tooltipLabels,
  line,
}: {
  labels: string[]
  series: Series[]
  stacked?: boolean
  height?: number
  format?: (v: number) => string
  tooltipLabels?: string[]
  /** Sütunların üzerine çizilen tek çizgi (ör. net kâr) — aynı eksen. */
  line?: Series
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 48
  const padR = 8
  const padT = 12
  const padB = 28
  const n = labels.length
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + Math.max(0, s.values[i]), 0) : Math.max(0, ...series.map((s) => s.values[i]))))
  const lows = [...(line?.values ?? []), 0]
  const ticks = niceTicks(Math.min(...lows), Math.max(1, ...totals, ...(line?.values ?? [])))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const iw = Math.max(1, w - padL - padR)
  const ih = height - padT - padB
  const band = iw / Math.max(1, n)
  const groupW = Math.min(band * 0.66, stacked ? 44 : 22 * series.length + 4)
  const barW = stacked ? groupW : Math.max(3, (groupW - (series.length - 1) * 2) / series.length)
  const Y = (v: number) => padT + ih - ((v - yMin) / (yMax - yMin)) * ih
  const cxAt = (i: number) => padL + band * i + band / 2
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))))

  const rr = (x: number, y: number, bw: number, bh: number, r: number) => {
    if (bh <= 0) return ''
    const rad = Math.min(r, bw / 2, bh)
    return `M${x},${y + bh}V${y + rad}Q${x},${y} ${x + rad},${y}H${x + bw - rad}Q${x + bw},${y} ${x + bw},${y + rad}V${y + bh}Z`
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? '#D6D3CA' : GRID} />
              <text x={padL - 8} y={Y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={AXIS_TEXT}>
                {shortNum(t)}
              </text>
            </g>
          ))}
          {hover !== null && <rect x={padL + band * hover} y={padT} width={band} height={ih} fill="#0E1527" fillOpacity="0.04" rx="6" />}
          {labels.map((l, i) => {
            const x0 = cxAt(i) - groupW / 2
            let acc = 0
            return (
              <g key={i}>
                {series.map((s, si) => {
                  const v = Math.max(0, s.values[i])
                  if (stacked) {
                    const yTop = Y(acc + v)
                    const yBot = Y(acc)
                    const isTop = series.slice(si + 1).every((o) => Math.max(0, o.values[i]) === 0)
                    acc += v
                    const h = Math.max(0, yBot - yTop - (si > 0 ? 2 : 0))
                    if (v === 0) return null
                    return isTop ? (
                      <path key={s.id} d={rr(x0, yTop, barW, h, 4)} fill={s.color} />
                    ) : (
                      <rect key={s.id} x={x0} y={yTop} width={barW} height={h} fill={s.color} />
                    )
                  }
                  const x = x0 + si * (barW + 2)
                  return <path key={s.id} d={rr(x, Y(v), barW, Y(0) - Y(v), 4)} fill={s.color} />
                })}
                {(i % every === 0 || i === n - 1) && (
                  <text x={cxAt(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>
                    {l}
                  </text>
                )}
              </g>
            )
          })}
          {line && (
            <>
              <path
                d={line.values.map((v, i) => `${i ? 'L' : 'M'}${cxAt(i)},${Y(v)}`).join('')}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                strokeDasharray={line.dashed ? '5 4' : undefined}
              />
              {line.values.map((v, i) => (
                <circle key={i} cx={cxAt(i)} cy={Y(v)} r={hover === i ? 5 : 3} fill={line.color} stroke="#fff" strokeWidth="2" />
              ))}
            </>
          )}
          <rect
            x={padL}
            y={0}
            width={iw}
            height={height}
            fill="transparent"
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
              setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))))
            }}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && w > 0 && (
        <Tooltip x={cxAt(hover)} y={Y(Math.max(totals[hover], line?.values[hover] ?? 0))} w={w}>
          <p className="mb-1 font-bold">{tooltipLabels?.[hover] ?? labels[hover]}</p>
          {series.map((s) => (
            <TipRow key={s.id} color={s.color} label={s.label} value={format(s.values[hover])} />
          ))}
          {stacked && series.length > 1 && (
            <div className="mt-1 border-t border-white/15 pt-1">
              <TipRow label="Toplam" value={format(totals[hover])} />
            </div>
          )}
          {line && <TipRow color={line.color} label={line.label} value={format(line.values[hover])} dashed />}
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Yatay sıralama çubukları                                            */
/* ------------------------------------------------------------------ */
export function HBars({
  rows,
  format = shortNum,
  max,
  empty = 'Henüz veri yok',
}: {
  rows: { id: string; label: ReactNode; value: number; color?: string; sub?: ReactNode }[]
  format?: (v: number) => string
  max?: number
  empty?: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-soft/50">{empty}</p>
  const m = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink">{r.label}</span>
            <span className="shrink-0 font-bold tabular-nums text-ink">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.05]">
            <div
              className="h-full rounded-full transition-[width,opacity] duration-700 ease-out"
              style={{ width: `${Math.max(1.5, (r.value / m) * 100)}%`, backgroundColor: r.color ?? '#2a78d6', opacity: hover && hover !== r.id ? 0.45 : 1 }}
            />
          </div>
          {r.sub && <p className="mt-1 text-xs text-ink-soft/60">{r.sub}</p>}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Şelale: ciro → maliyetler → net kâr                                 */
/* ------------------------------------------------------------------ */
export function Waterfall({ steps, height = 240, format = shortNum }: { steps: { label: string; value: number; kind: 'start' | 'minus' | 'plus' | 'total' }[]; height?: number; format?: (v: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 48
  const padR = 8
  const padT = 20
  const padB = 34
  let run = 0
  const bars = steps.map((s) => {
    let from = 0
    let to = 0
    if (s.kind === 'start' || s.kind === 'total') {
      from = 0
      to = s.kind === 'start' ? s.value : run
      run = to
    } else {
      from = run
      to = run + (s.kind === 'plus' ? s.value : -s.value)
      run = to
    }
    return { ...s, from, to }
  })
  const vals = bars.flatMap((b) => [b.from, b.to])
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(1, ...vals))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const iw = Math.max(1, w - padL - padR)
  const ih = height - padT - padB
  const band = iw / steps.length
  const bw = Math.min(56, band * 0.6)
  const Y = (v: number) => padT + ih - ((v - yMin) / (yMax - yMin)) * ih
  const color = (b: (typeof bars)[number]) =>
    b.kind === 'start' ? '#2a78d6' : b.kind === 'total' ? (b.to >= 0 ? '#0E1527' : '#d03b3b') : b.kind === 'plus' ? '#1baf7a' : '#eb6834'
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label="Ciro ve maliyetlerden net kâra">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? '#D6D3CA' : GRID} />
              <text x={padL - 8} y={Y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={AXIS_TEXT}>
                {shortNum(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = padL + band * i + (band - bw) / 2
            const top = Y(Math.max(b.from, b.to))
            const h = Math.max(2, Math.abs(Y(b.from) - Y(b.to)))
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + band * i} y={padT} width={band} height={ih} fill={hover === i ? '#0E1527' : 'transparent'} fillOpacity="0.04" rx="6" />
                <rect x={x} y={top} width={bw} height={h} rx="4" fill={color(b)} />
                {i < bars.length - 1 && <line x1={x + bw} x2={x + band} y1={Y(b.to)} y2={Y(b.to)} stroke="#B9B6AD" strokeDasharray="3 3" />}
                <text x={x + bw / 2} y={top - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0E1527">
                  {b.kind === 'minus' ? '−' : ''}
                  {shortNum(b.kind === 'total' ? b.to : b.value)}
                </text>
                <text x={x + bw / 2} y={height - 10} textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && w > 0 && (
        <Tooltip x={padL + band * hover + band / 2} y={Y(Math.max(bars[hover].from, bars[hover].to))} w={w}>
          <TipRow color={color(bars[hover])} label={bars[hover].label} value={format(bars[hover].kind === 'total' ? bars[hover].to : bars[hover].value)} />
        </Tooltip>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Günlük satış ısı haritası (son N hafta)                              */
/* ------------------------------------------------------------------ */
const BLUE_RAMP = ['#EEF4FC', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']
export function CalendarHeat({ days, format = shortNum, weeks = 18 }: { days: Map<string, number>; format?: (v: number) => string; weeks?: number }) {
  const [hover, setHover] = useState<{ d: string; v: number; x: number; y: number } | null>(null)
  const cells = useMemo(() => {
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const dow = (end.getDay() + 6) % 7 // Pazartesi = 0
    const start = new Date(end)
    start.setDate(end.getDate() - dow - (weeks - 1) * 7)
    const out: { d: string; v: number; col: number; row: number; future: boolean }[] = []
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
      out.push({ d: iso, v: days.get(iso) ?? 0, col: Math.floor(i / 7), row: i % 7, future: d > end })
    }
    return out
  }, [days, weeks])
  const max = Math.max(1, ...cells.map((c) => c.v))
  const step = (v: number) => (v <= 0 ? 0 : Math.min(BLUE_RAMP.length - 1, 1 + Math.floor((v / max) * (BLUE_RAMP.length - 1.01))))
  const size = 13
  const gap = 3
  const W = weeks * (size + gap) + 26
  const H = 7 * (size + gap)
  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg width={W} height={H + 4} role="img" aria-label="Günlük satış adedi">
          {['Pzt', '', 'Çar', '', 'Cum', '', 'Paz'].map((l, i) => (
            <text key={i} x={0} y={i * (size + gap) + size - 2} fontSize="10" fill={AXIS_TEXT}>
              {l}
            </text>
          ))}
          {cells.map((c) => (
            <rect
              key={c.d}
              x={26 + c.col * (size + gap)}
              y={c.row * (size + gap)}
              width={size}
              height={size}
              rx="3"
              fill={c.future ? 'transparent' : BLUE_RAMP[step(c.v)]}
              stroke={c.future ? '#EEE' : hover?.d === c.d ? '#0E1527' : 'none'}
              onMouseEnter={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                const rr = e.currentTarget.getBoundingClientRect()
                setHover({ d: c.d, v: c.v, x: rr.left - r.left + size / 2, y: rr.top - r.top })
              }}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-soft/60">
        Az
        {BLUE_RAMP.map((c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        Çok
      </div>
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-night px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: hover.x, top: hover.y - 6 }}>
          <b>{new Date(hover.d + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}</b>
          <span className="ml-2 tabular-nums">{format(hover.v)}</span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bütçe/doluluk göstergesi                                            */
/* ------------------------------------------------------------------ */
export function Meter({ value, max, color = '#2a78d6' }: { value: number; max: number; color?: string }) {
  const r = max > 0 ? value / max : 0
  const over = r > 1
  const warn = r >= 0.9
  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="meter" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.min(100, r * 100)}%`, backgroundColor: over ? '#d03b3b' : warn ? '#fab219' : color }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Mini çizgi                                                          */
/* ------------------------------------------------------------------ */
export function Sparkline({ values, color = '#E3AB3B', width = 96, height = 30 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const X = (i: number) => (i / (values.length - 1)) * (width - 4) + 2
  const Y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join('')
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={`${d}L${X(values.length - 1)},${height}L${X(0)},${height}Z`} fill={color} fillOpacity="0.15" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r="2.5" fill={color} />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Pay çubuğu: tek yatay şerit, dilimler arasında 2px boşluk            */
/* ------------------------------------------------------------------ */
export function ShareBar({ parts, format = shortNum }: { parts: { id: string; label: string; value: number; color: string }[]; format?: (v: number) => string }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (total <= 0) return <p className="py-6 text-center text-sm text-ink-soft/50">Henüz veri yok</p>
  const shown = parts.filter((p) => p.value > 0)
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">
        {shown.map((p) => (
          <div
            key={p.id}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(null)}
            className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color, opacity: hover && hover !== p.id ? 0.4 : 1 }}
            title={`${p.label}: ${format(p.value)}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {shown.map((p) => (
          <li key={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} className={cx('flex items-center justify-between gap-2 text-sm transition-opacity', hover && hover !== p.id && 'opacity-50')}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
              <span className="truncate text-ink-soft">{p.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <b className="text-ink">{format(p.value)}</b>
              <span className="ml-1 text-xs text-ink-soft/60">%{Math.round((p.value / total) * 100)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
