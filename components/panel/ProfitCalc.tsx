'use client'

import { useEffect, useMemo, useState } from 'react'
import { CHANNELS, label } from '@/lib/panel/constants'
import { costFor, variantLabel, type ChannelCost, type Model } from '@/lib/panel/data'
import { MARKETPLACES, STOPAJ_PCT, unitEconomics } from '@/lib/panel/economics'
import { pct, tl as tl0 } from '@/lib/panel/format'

// Bu ekranda kuruş da görünsün
const tl = (v: number) => tl0(v, true)
import { Card, cx, Input, Segmented, Select } from './ui'

const CALC_CHANNELS = ['amazon', 'trendyol', 'hepsiburada', 'seryn_site'] as const
type CalcChannel = (typeof CALC_CHANNELS)[number]

// Renk her zaman kaleme bağlı (sıraya değil)
const PARTS = [
  { id: 'buy', label: 'Alış maliyeti', color: '#2a78d6' },
  { id: 'commission', label: 'Komisyon', color: '#eb6834' },
  { id: 'cargo', label: 'Kargo / FBA', color: '#eda100' },
  { id: 'vat', label: 'Ödenecek KDV', color: '#6250d6' },
  { id: 'stopaj', label: 'Stopaj', color: '#e87ba4' },
  { id: 'profit', label: 'Kâr', color: '#1baf7a' },
] as const

const n = (v: string) => Number(String(v).replace(',', '.')) || 0
const fmt = (v: number) => (Math.round(v * 100) / 100).toString()

/**
 * Bir adet satışta: komisyon, kargo, KDV (satış/alış/kargo/komisyondan), ödenecek ya da devreden KDV,
 * stopaj ve kalan kâr. Bütün tutarlar KDV dahil girilir; komisyon oranı KDV hariç (faturaya %20 eklenir).
 */
export function ProfitCalc({ model, costs, title = 'Kâr ve KDV hesabı' }: { model?: Model | null; costs?: ChannelCost[]; title?: string }) {
  const [ch, setCh] = useState<CalcChannel>('amazon')
  // Fiyatı / maliyeti farklı varyantlar (ör. SERYN 10 g, 18 g, lansman) ayrı seçilebilir
  const distinct = model ? model.items.filter((x, k, a) => a.findIndex((y) => y.price === x.price && y.cost === x.cost && (y.vat_rate ?? 20) === (x.vat_rate ?? 20)) === k) : []
  const [vid, setVid] = useState('')
  const fromModel = () => {
    const i = model?.items.find((x) => x.id === vid) ?? model?.items[0]
    const vat = Number(i?.vat_rate ?? 20)
    const c = model ? costFor(costs, ch, model.name) : costFor(costs, ch, '')
    return {
      price: i ? fmt(i.price) : '',
      vat: String(vat),
      buy: i?.cost ? fmt(i.cost * (1 + vat / 100)) : '',
      buyVat: String(vat),
      commissionPct: c ? fmt(Number(c.commission_pct)) : '',
      cargo: c ? fmt(Number(c.fee_per_unit)) : '',
      stopaj: MARKETPLACES.includes(ch),
    }
  }
  const [f, setF] = useState(fromModel)
  // Model ya da kanal değişince alanlar o ürünün kartından ve kanal maliyetinden yeniden dolar
  useEffect(() => {
    setF(fromModel())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.key, ch, costs, vid])
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  const r = useMemo(
    () =>
      unitEconomics({
        price: n(f.price),
        vat: n(f.vat),
        buy: n(f.buy),
        buyVat: n(f.buyVat),
        commissionPct: n(f.commissionPct),
        cargo: n(f.cargo),
        stopajPct: f.stopaj ? STOPAJ_PCT : 0,
      }),
    [f],
  )
  const price = n(f.price)
  const parts = PARTS.map((p) => ({
    ...p,
    value: p.id === 'buy' ? n(f.buy) : p.id === 'commission' ? r.commission : p.id === 'cargo' ? r.cargo : p.id === 'vat' ? Math.max(0, r.payableVat) : p.id === 'stopaj' ? r.stopaj : Math.max(0, r.profit),
  }))
  const barTotal = parts.reduce((a, p) => a + p.value, 0)

  const field = (k: keyof typeof f, lab: string, suffix: string, hint?: string) => (
    <label>
      <span className="mb-1 block text-xs font-semibold text-ink-soft/60">{lab}</span>
      <div className="relative">
        <Input type="number" inputMode="decimal" min="0" step="any" className="pr-10" value={f[k] as string} onChange={(e) => set({ [k]: e.target.value } as any)} placeholder="0" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-soft/50">{suffix}</span>
      </div>
      {hint && <span className="mt-1 block text-[11px] text-ink-soft/60">{hint}</span>}
    </label>
  )
  const vatSelect = (k: 'vat' | 'buyVat', lab: string) => (
    <label>
      <span className="mb-1 block text-xs font-semibold text-ink-soft/60">{lab}</span>
      <Select value={f[k]} onChange={(e) => set({ [k]: e.target.value } as any)}>
        {['0', '1', '10', '20'].map((v) => (
          <option key={v} value={v}>
            %{v}
          </option>
        ))}
      </Select>
    </label>
  )

  return (
    <Card title={title} action={<Segmented value={ch} onChange={setCh} size="sm" options={CALC_CHANNELS.map((c) => ({ id: c, label: label(CHANNELS, c) }))} />}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-3">
          {distinct.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft/60">Varyant</span>
              <Select value={vid || distinct[0].id} onChange={(e) => setVid(e.target.value)}>
                {distinct.map((x) => (
                  <option key={x.id} value={x.id}>
                    {variantLabel(x) || x.name} · {tl(x.price)}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            {field('price', 'Satış fiyatı (KDV dahil)', '₺', price > 0 ? `KDV hariç ${tl(r.netSale)} · içindeki KDV ${tl(r.saleVat)}` : undefined)}
            {vatSelect('vat', 'Satış KDV')}
            {field('buy', 'Alış fiyatı (KDV dahil)', '₺', n(f.buy) > 0 ? `KDV hariç ${tl(n(f.buy) - r.buyVat)} · içindeki KDV ${tl(r.buyVat)}` : undefined)}
            {vatSelect('buyVat', 'Alış KDV')}
            {field('commissionPct', 'Komisyon (KDV hariç oran)', '%', r.commission > 0 ? `Fatura ${tl(r.commission)} (içinde ${tl(r.commissionVat)} KDV)` : undefined)}
            {field('cargo', ch === 'amazon' ? 'FBA / kargo (KDV dahil)' : 'Kargo (KDV dahil)', '₺', r.cargo > 0 ? `içindeki KDV ${tl(r.cargoVat)}` : undefined)}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={f.stopaj} onChange={(e) => set({ stopaj: e.target.checked })} className="h-4 w-4 accent-[#0E1527]" />
            %{STOPAJ_PCT} e-ticaret stopajı (pazaryeri keser, yıl sonunda vergiden düşülür)
          </label>
          <p className="text-[11px] text-ink-soft/60">
            Alanlar ürün kartından ve {label(CHANNELS, ch)} kanal maliyetinden doldu; burada değiştirmek kayıtlara dokunmaz, sadece hesaplar.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className={cx('rounded-2xl p-3.5 text-white', r.profit < 0 ? 'bg-[#b83030]' : 'bg-[#0E1527]')}>
              <p className="text-xs text-white/60">{r.profit < 0 ? 'Zarar' : 'Kâr'} / adet</p>
              <p className="font-display text-2xl font-black tabular-nums">{tl(r.profit)}</p>
            </div>
            <Mini label="Kâr marjı" value={r.margin === null ? '—' : pct(r.margin * 100)} sub="satış fiyatına göre" />
            <Mini label="Getiri" value={r.roi === null ? '—' : pct(r.roi * 100)} sub="alış fiyatına göre" />
            <Mini label={r.payableVat >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'} value={tl(Math.abs(r.payableVat))} sub={r.payableVat >= 0 ? 'devlete' : 'devletten alacak'} tone={r.payableVat < 0 ? 'good' : undefined} />
          </div>

          <div className="rounded-2xl bg-[#FBF3E3] p-3.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-center sm:grid-cols-5">
              <VatCell label="Satıştan" value={r.saleVat} />
              <VatCell label="Alıştan" value={-r.buyVat} />
              <VatCell label="Kargodan" value={-r.cargoVat} />
              <VatCell label="Komisyondan" value={-r.commissionVat} />
              <VatCell label={r.payableVat >= 0 ? 'Ödenecek' : 'Devreden'} value={r.payableVat} strong />
            </div>
            <p className="mt-2.5 border-t border-[#E3AB3B]/30 pt-2 text-center text-xs text-ink-soft">
              {price <= 0
                ? 'Satış fiyatını girin.'
                : r.payableVat >= 0
                  ? `Bu satıştan devlete ${tl(r.payableVat)} KDV ödersiniz: satışta ${tl(r.saleVat)} KDV aldınız, alış, kargo ve komisyonda ${tl(r.buyVat + r.cargoVat + r.commissionVat)} KDV ödediniz.`
                  : `Devlet size ${tl(-r.payableVat)} KDV borçlu sayılır: ödediğiniz KDV (${tl(r.buyVat + r.cargoVat + r.commissionVat)}) satışta aldığınızdan (${tl(r.saleVat)}) fazla. Bu tutar ödenmez, sonraki aylarda ödeyeceğiniz KDV'den düşülür.`}
            </p>
          </div>

          {price > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold text-ink">{tl(price)} satış fiyatı nereye gidiyor?</p>
              <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-[#F4F3EF]">
                {parts
                  .filter((p) => p.value > 0)
                  .map((p) => (
                    <div key={p.id} title={`${p.label}: ${tl(p.value)}`} style={{ width: `${(p.value / Math.max(barTotal, price)) * 100}%`, backgroundColor: p.color }} />
                  ))}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                {parts.map((p) => (
                  <span key={p.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-ink-soft">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </span>
                    <b className="tabular-nums text-ink">{tl(p.id === 'profit' ? r.profit : p.id === 'vat' ? r.payableVat : p.value)}</b>
                  </span>
                ))}
              </div>
              {r.payableVat < 0 && <p className="mt-2 text-[11px] text-ink-soft/70">Devreden KDV ({tl(-r.payableVat)}) nakit değil, ileride ödenecek KDV'den düşülen alacak; kâra eklenmiş olarak gösterildi.</p>}
              {r.profit < 0 && <p className="mt-2 text-[11px] font-semibold text-[#b83030]">Giderler satış fiyatını aşıyor: bu fiyatla her satışta {tl(-r.profit)} zarar.</p>}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Mini({ label: l, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' }) {
  return (
    <div className="rounded-2xl bg-[#F7F6F2] p-3.5">
      <p className="text-xs text-ink-soft/70">{l}</p>
      <p className={cx('font-display text-xl font-black tabular-nums', tone === 'good' ? 'text-[#0a7d0a]' : 'text-ink')}>{value}</p>
      {sub && <p className="text-[11px] text-ink-soft/60">{sub}</p>}
    </div>
  )
}

function VatCell({ label: l, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-ink-soft/70">{l}</p>
      <p className={cx('tabular-nums', strong ? 'font-display text-base font-black' : 'text-sm font-semibold', strong && value < 0 ? 'text-[#0a7d0a]' : 'text-ink')}>
        {strong ? tl(Math.abs(value)) : `${value < 0 ? '−' : '+'}${tl(Math.abs(value))}`}
      </p>
    </div>
  )
}
