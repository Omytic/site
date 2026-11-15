'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CHANNELS, label } from '@/lib/panel/constants'
import { AFTER, costFor, groupModels, invalidate, write, type ChannelCost, type ItemWithStock, type Model } from '@/lib/panel/data'
import { itemEconomics } from '@/lib/panel/economics'
import { tl } from '@/lib/panel/format'
import { Button, cx, Drawer, Input, Segmented, useUi } from './ui'

export const COST_CHANNELS = ['amazon', 'trendyol', 'hepsiburada', 'seryn_site'] as const
const COST_HINTS: Record<string, string> = {
  amazon: 'Amazon satış komisyonu % ve adet başı FBA gönderim ücreti. Seller Central’daki ücret önizlemesinden bakabilirsiniz.',
  trendyol: 'Otomatik gelen Trendyol siparişlerinde komisyon Trendyol’dan gelir; buradaki % elle girilen satışlarda ve tahminde kullanılır.',
  hepsiburada: 'Hepsiburada komisyonu % ve adet başı kargo.',
  seryn_site: 'Ödeme altyapısı (PayTR vb.) kesintisi % ve adet başı kargo.',
}

/** Bir modelin satış kanalına göre adet başı net kârı (komisyon, kargo, KDV ve stopaj sonrası). */
export function NetProfit({ model, costs, onSetup }: { model: Model; costs: ChannelCost[] | undefined; onSetup: () => void }) {
  const i = model.items[0]
  const rows = COST_CHANNELS.map((ch) => {
    const c = costFor(costs, ch, model.name)
    if (!c) return null
    return { ch, e: itemEconomics(i, c, ch) }
  }).filter(Boolean) as { ch: string; e: ReturnType<typeof itemEconomics> }[]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-soft">
      <span className="font-bold text-ink">Adet başı net kâr</span>
      {rows.length === 0 ? (
        <span>
          Komisyon ve kargo tanımlı değil.{' '}
          <button type="button" className="font-semibold text-ink underline" onClick={onSetup}>
            Kanal maliyetlerini gir
          </button>
        </span>
      ) : (
        rows.map(({ ch, e }) => (
          <span key={ch} title={`Komisyon ${tl(e.commission)} · kargo ${tl(e.cargo)} · ödenecek KDV ${tl(e.payableVat)} · stopaj ${tl(e.stopaj)}`}>
            {label(CHANNELS, ch)}{' '}
            <b className={cx('tabular-nums', e.profit < 0 ? 'text-[#b83030]' : 'text-ink')}>{tl(e.profit)}</b>
          </span>
        ))
      )}
      {!i.cost && <span className="text-[#b07a00]">Maliyet girilmemiş, kâr fazla görünür.</span>}
    </div>
  )
}

/** Kanal başına (ve isteğe bağlı model başına) komisyon % ve adet başı kargo / FBA ücreti. */
export function CostsDrawer({ items, costs, onClose }: { items: ItemWithStock[]; costs: ChannelCost[]; onClose: () => void }) {
  const { toast } = useUi()
  const models = groupModels(items.filter((i) => i.active))
  const keyOf = (ch: string, model: string | null) => `${ch}|${model ?? ''}`
  const initial = () => {
    const m: Record<string, { pct: string; fee: string }> = {}
    costs.forEach((c) => (m[keyOf(c.channel, c.model)] = { pct: String(Number(c.commission_pct)), fee: String(Number(c.fee_per_unit)) }))
    return m
  }
  const [v, setV] = useState(initial)
  const [ch, setCh] = useState<(typeof COST_CHANNELS)[number]>('amazon')
  const [busy, setBusy] = useState(false)
  const val = (model: string | null) => v[keyOf(ch, model)] ?? { pct: '', fee: '' }
  const put = (model: string | null, p: Partial<{ pct: string; fee: string }>) => setV((x) => ({ ...x, [keyOf(ch, model)]: { ...val(model), ...p } }))

  const save = async () => {
    setBusy(true)
    try {
      for (const [k, x] of Object.entries(v)) {
        const [channel, m] = k.split('|')
        const model = m || null
        const ex = costs.find((c) => c.channel === channel && (c.model ?? '') === (model ?? ''))
        const empty = x.pct === '' && x.fee === ''
        if (empty) {
          if (ex) await write(supabase.from('channel_costs').delete().eq('id', ex.id))
          continue
        }
        const row = { channel, model, commission_pct: Number(x.pct) || 0, fee_per_unit: Number(x.fee) || 0 }
        if (ex) {
          if (Number(ex.commission_pct) !== row.commission_pct || Number(ex.fee_per_unit) !== row.fee_per_unit) await write(supabase.from('channel_costs').update(row).eq('id', ex.id))
        } else await write(supabase.from('channel_costs').insert(row))
      }
      invalidate(...AFTER.costs)
      toast('Kanal maliyetleri kaydedildi. Yeni satışlarda komisyon ve kargo otomatik hesaplanır.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const general = val(null)
  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title="Kanal maliyetleri"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-soft">
        Komisyon oranını pazaryerinin verdiği gibi (KDV hariç) yazın, faturadaki %20 KDV otomatik eklenir. Kargo / FBA ücretini KDV dahil yazın. Net kâr; komisyon, kargo, ödenecek KDV ve pazaryerinde %1 stopaj düşülerek hesaplanır. Her kanal için bir kez girin: satış girerken ve pazaryeri senkronunda komisyon ile kargo otomatik hesaplanır, Stok’taki tahmini kâr ve adet başı net kâr da bundan çıkar. Modele özel değer girmezseniz “Bütün ürünler” satırı kullanılır.
      </p>
      <Segmented value={ch} onChange={setCh} size="sm" options={COST_CHANNELS.map((c) => ({ id: c, label: label(CHANNELS, c) }))} />
      <p className="mt-3 text-xs text-ink-soft/70">{COST_HINTS[ch]}</p>
      <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
        <div className="grid grid-cols-[1fr_96px_112px_100px] items-center gap-2 bg-[#F7F6F2] px-3 py-2 text-xs font-semibold text-ink-soft/70">
          <span>Ürün</span>
          <span>Komisyon %</span>
          <span>{ch === 'amazon' ? 'FBA/kargo ₺/adet' : 'Kargo ₺/adet'} (KDV dahil)</span>
          <span className="text-right">Net kâr/adet</span>
        </div>
        {[null, ...models].map((m) => {
          const name = m ? m.name : null
          const x = val(name)
          const eff = x.pct !== '' || x.fee !== '' ? x : name ? general : x
          const i = m?.items[0]
          const net = i && (eff.pct !== '' || eff.fee !== '') ? itemEconomics(i, { commission_pct: Number(eff.pct) || 0, fee_per_unit: Number(eff.fee) || 0 }, ch).profit : null
          return (
            <div key={name ?? 'all'} className={cx('grid grid-cols-[1fr_96px_112px_100px] items-center gap-2 border-t border-line px-3 py-2', !m && 'bg-[#FBFAF7]')}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{m ? m.name : 'Bütün ürünler'}</p>
                {m && <p className="text-xs text-ink-soft/50">{tl(m.items[0].price, true)} satış · {m.items[0].cost ? tl(m.items[0].cost, true) : 'maliyet yok'}</p>}
              </div>
              <Input type="number" min="0" max="99" step="any" className="h-9" value={x.pct} placeholder={m && general.pct !== '' ? general.pct : '0'} onChange={(e) => put(name, { pct: e.target.value })} />
              <Input type="number" min="0" step="any" className="h-9" value={x.fee} placeholder={m && general.fee !== '' ? general.fee : '0'} onChange={(e) => put(name, { fee: e.target.value })} />
              <span className={cx('text-right text-sm font-bold tabular-nums', net !== null && net < 0 ? 'text-[#b83030]' : 'text-ink')}>{net === null ? '—' : tl(net, true)}</span>
            </div>
          )
        })}
      </div>
    </Drawer>
  )
}
