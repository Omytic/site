'use client'

import { Loader2, RotateCcw } from 'lucide-react'
import { CURRENCIES, type Currency, type useFxRate } from '@/lib/panel/fx'
import { cx, Input } from './ui'

/** Formların üstünde: TL / Dolar / Euro seçimi ve TCMB kuru (otomatik, istenirse elle). */
export function CurrencyBar({ currency, setCurrency, fx, hint }: { currency: Currency; setCurrency: (c: Currency) => void; fx: ReturnType<typeof useFxRate>; hint?: string }) {
  return (
    <div className="rounded-2xl bg-[#F7F6F2] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-black/[0.06]" role="radiogroup" aria-label="Para birimi">
          {CURRENCIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={currency === c.id}
              onClick={() => setCurrency(c.id)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-bold transition', currency === c.id ? 'bg-night text-white' : 'text-ink-soft hover:text-ink')}
            >
              {c.sym} {c.label}
            </button>
          ))}
        </div>
        {currency !== 'TRY' && (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-soft">1 {CURRENCIES.find((c) => c.id === currency)?.sym} =</span>
            <div className="relative w-28">
              <Input inputMode="decimal" aria-label="Kur" value={fx.rateText} onChange={(e) => fx.setRate(e.target.value)} className="h-9 pr-6 text-right tabular-nums" />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-soft/50">₺</span>
            </div>
            {fx.loading && <Loader2 className="h-4 w-4 animate-spin text-ink-soft/50" />}
            {fx.manual && fx.auto && (
              <button type="button" onClick={fx.resetToAuto} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft/70 hover:text-ink">
                <RotateCcw className="h-3 w-3" /> TCMB kuruna dön ({fx.auto.toLocaleString('tr-TR', { maximumFractionDigits: 4 })})
              </button>
            )}
          </div>
        )}
      </div>
      {currency !== 'TRY' && (
        <p className={cx('mt-2 text-xs', fx.error ? 'font-semibold text-[#b83030]' : 'text-ink-soft/65')}>
          {fx.error ? fx.error : fx.manual ? 'Kuru elle girdiniz.' : fx.note ?? 'Kur getiriliyor…'}
          {!fx.error && hint ? `. ${hint}` : ''}
        </p>
      )}
    </div>
  )
}
