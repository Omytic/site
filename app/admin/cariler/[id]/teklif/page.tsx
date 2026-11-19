'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Printer, Save, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS, itemImage, label, UNITS } from '@/lib/panel/constants'
import { groupModels, invalidate, modelTitle, must, Q, useItemsWithStock, useQuery, write } from '@/lib/panel/data'
import { addDays, dateTR, today } from '@/lib/panel/format'
import { Button, Card, cx, Empty, Input, Segmented, Skeleton, Textarea, useUi } from '@/components/panel/ui'

/*
 * Cari kartından teklif / fiyat listesi: ürünler seçilir, firmanın indirimi ve vadesi işlenir,
 * tarayıcının "PDF olarak kaydet"i ile PDF alınır. Fiyatlar KDV hariç gösterilir, KDV ayrı eklenir.
 */

type Line = { key: string; name: string; brand: string; unit: string; vat: number; qty: string; price: string; disc: string; image: string | null }
type Mode = 'teklif' | 'liste'

const fmt = (v: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const n = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0
const r2 = (v: number) => Math.round(v * 100) / 100

export default function QuotePage() {
  const { id } = useParams<{ id: string }>()
  const party = Q.party(id)
  const settings = useQuery('settings:row', () => must<any[]>(supabase.from('settings').select('phone,email,address').limit(1) as any))
  const { data: items, loading } = useItemsWithStock()
  const { toast } = useUi()
  const p = party.data
  const [mode, setMode] = useState<Mode>('teklif')
  const [brand, setBrand] = useState<string>('all')
  const [lines, setLines] = useState<Line[]>([])
  const [valid, setValid] = useState(addDays(today(), 15))
  const [terms, setTerms] = useState('')
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState(false)
  const [no] = useState(() => `T-${today().replace(/-/g, '').slice(2)}-${String(Math.floor(Math.random() * 900) + 100)}`)

  useEffect(() => {
    if (!p) return
    if (p.brands.length === 1) setBrand(p.brands[0])
    setTerms(
      [p.payment_days ? `Ödeme: fatura tarihinden itibaren ${p.payment_days} gün vadeli.` : 'Ödeme: peşin.', 'Fiyatlara KDV dahil değildir.', 'Kargo/teslimat koşulları ayrıca belirtilir.'].join('\n'),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id])

  const models = useMemo(() => groupModels((items ?? []).filter((i) => i.active)).filter((m) => brand === 'all' || m.brand === brand), [items, brand])
  const disc = Number(p?.discount_pct ?? 0)

  const addModel = (key: string) => {
    const m = models.find((x) => x.key === key)
    if (!m || lines.some((l) => l.key === key)) return
    const i = m.items[0]
    const vat = Number(i.vat_rate ?? 20)
    const net = Number(i.price) / (1 + vat / 100)
    setLines((ls) => [...ls, { key, name: modelTitle(m), brand: m.brand, unit: i.unit, vat, qty: mode === 'teklif' ? '1' : '', price: net ? fmt(r2(net)) : '', disc: disc ? String(disc) : '', image: itemImage(i) }])
  }
  const set = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)))

  const calc = lines.map((l) => {
    const net = r2(n(l.price) * (1 - n(l.disc) / 100))
    const total = r2(net * (mode === 'teklif' ? n(l.qty) : 0))
    return { ...l, net, total, vatAmt: r2((total * l.vat) / 100) }
  })
  const sub = r2(calc.reduce((a, l) => a + l.total, 0))
  const vatTotal = r2(calc.reduce((a, l) => a + l.vatAmt, 0))
  const vatRates = [...new Set(calc.map((l) => l.vat))]

  const saveNote = async () => {
    if (!p || !calc.length) return
    const body = `${mode === 'teklif' ? 'Teklif' : 'Fiyat listesi'} ${no} verildi (geçerlilik ${dateTR(valid)}):\n${calc
      .map((l) => `• ${l.name}: ${mode === 'teklif' ? `${l.qty} ${label(UNITS, l.unit)} × ` : ''}${fmt(l.net)} TL + KDV`)
      .join('\n')}${mode === 'teklif' ? `\nToplam: ${fmt(sub + vatTotal)} TL (KDV dahil)` : ''}`
    try {
      await write(supabase.from('party_notes').insert({ party_id: p.id, kind: 'teklif', body, next_date: valid }))
      invalidate(`party:${p.id}`, 'party_summary')
      toast('Cari notlarına kaydedildi; geçerlilik günü aranacaklar listesine düştü.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  if (party.loading || loading) return <Skeleton className="h-96" />
  if (!p) return <Empty title="Cari bulunamadı" />
  const s = settings.data?.[0] ?? {}

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #quote-doc, #quote-doc * { visibility: visible !important; }
          #quote-doc { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          #quote-doc input { box-shadow: none !important; background: transparent !important; outline: none !important; }
        }
      `}</style>

      <div className="no-print">
        <Link href={`/admin/cariler/${p.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft/70 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {p.name}
        </Link>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-ink">Teklif / fiyat listesi</h1>
            <p className="mt-1 text-sm text-ink-soft/70">
              Ürünleri ekleyin, fiyatı ve adedi düzenleyin. {disc ? `Firmanın %${disc} indirimi işlendi. ` : ''}&quot;PDF olarak kaydet&quot; ile indirip gönderin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented<Mode> value={mode} onChange={setMode} options={[{ id: 'teklif', label: 'Teklif' }, { id: 'liste', label: 'Fiyat listesi' }]} />
            <Button variant="secondary" icon={<Save className="h-4 w-4" />} onClick={saveNote} disabled={!lines.length}>
              Cariye not düş
            </Button>
            <Button variant="gold" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={!lines.length}>
              PDF olarak kaydet
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Belge */}
        <div id="quote-doc" className="min-w-0 overflow-x-auto rounded-2xl bg-white p-6 text-[13px] text-[#11131a] shadow-sm ring-1 ring-line sm:p-10">
          <div className="min-w-[640px]">
            <div className="flex items-start justify-between gap-6 border-b-2 border-[#11131a] pb-5">
              <div>
                <p className="font-display text-3xl font-black tracking-tight">OMY</p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6b6f7a]">Ticaret</p>
                <p className="mt-2 text-xs leading-relaxed text-[#6b6f7a]">
                  {[s.address, s.phone, s.email || 'info@omytic.com', 'omytic.com'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black uppercase tracking-wide">{mode === 'teklif' ? 'Fiyat teklifi' : 'Fiyat listesi'}</p>
                <p className="mt-1 text-xs text-[#6b6f7a]">
                  No: <b className="text-[#11131a]">{no}</b>
                </p>
                <p className="text-xs text-[#6b6f7a]">
                  Tarih: <b className="text-[#11131a]">{dateTR(today())}</b>
                </p>
                <p className="flex items-center justify-end gap-1 text-xs text-[#6b6f7a]">
                  Geçerlilik:
                  <input type="date" value={valid} onChange={(e) => setValid(e.target.value)} className="no-print rounded border border-line px-1 text-xs" />
                  <b className="hidden text-[#11131a] print:inline">{dateTR(valid)}</b>
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b6f7a]">Sayın</p>
                <p className="mt-1 text-base font-bold">{p.name}</p>
                {p.contact_name && <p>{p.contact_name}</p>}
                <p className="text-[#6b6f7a]">{[p.address, p.district, p.city].filter(Boolean).join(', ')}</p>
                {(p.tax_office || p.tax_no) && <p className="text-[#6b6f7a]">{[p.tax_office, p.tax_no].filter(Boolean).join(' · ')}</p>}
              </div>
              <div className="text-right text-[#6b6f7a]">
                {p.phone && <p>{p.phone}</p>}
                {p.email && <p>{p.email}</p>}
              </div>
            </div>

            <table className="mt-6 w-full border-collapse">
              <thead>
                <tr className="border-y border-[#11131a] text-left text-[11px] uppercase tracking-wider">
                  <th className="py-2 pr-2">Ürün</th>
                  {mode === 'teklif' && <th className="py-2 pr-2 text-right">Miktar</th>}
                  <th className="py-2 pr-2 text-right">Birim fiyat</th>
                  <th className="py-2 pr-2 text-right">İskonto</th>
                  <th className="py-2 pr-2 text-right">{mode === 'teklif' ? 'Net birim' : 'Net fiyat'}</th>
                  <th className="py-2 pr-2 text-right">KDV</th>
                  {mode === 'teklif' && <th className="py-2 text-right">Tutar</th>}
                  <th className="no-print w-8" />
                </tr>
              </thead>
              <tbody>
                {calc.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#6b6f7a]">
                      <span className="no-print">Sağdan ürün ekleyin.</span>
                    </td>
                  </tr>
                )}
                {calc.map((l) => (
                  <tr key={l.key} className="border-b border-[#e6e4de] align-middle">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2.5">
                        {l.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                        )}
                        <div className="min-w-0">
                          <input value={l.name} onChange={(e) => set(l.key, { name: e.target.value })} className="w-full bg-transparent font-semibold outline-none focus:bg-[#fff8e6]" />
                          <p className="text-[11px] text-[#6b6f7a]">{label(BRANDS, l.brand)}</p>
                        </div>
                      </div>
                    </td>
                    {mode === 'teklif' && (
                      <td className="py-2 pr-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <input value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} inputMode="decimal" className="w-16 rounded bg-transparent text-right tabular-nums outline-none ring-1 ring-transparent focus:bg-[#fff8e6] focus:ring-[#E3AB3B]/40" />
                          <span className="text-[11px] text-[#6b6f7a]">{label(UNITS, l.unit)}</span>
                        </span>
                      </td>
                    )}
                    <td className="py-2 pr-2 text-right">
                      <input value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} inputMode="decimal" className="w-24 bg-transparent text-right tabular-nums outline-none focus:bg-[#fff8e6]" />
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <span className="inline-flex items-center">
                        %<input value={l.disc} onChange={(e) => set(l.key, { disc: e.target.value })} inputMode="decimal" placeholder="0" className="w-10 bg-transparent text-right tabular-nums outline-none focus:bg-[#fff8e6]" />
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-right font-semibold tabular-nums">
                      {fmt(l.net)} <span className="text-[11px] font-normal text-[#6b6f7a]">₺/{label(UNITS, l.unit)}</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-[#6b6f7a]">%{l.vat}</td>
                    {mode === 'teklif' && <td className="whitespace-nowrap py-2 text-right font-bold tabular-nums">{fmt(l.total)} ₺</td>}
                    <td className="no-print pl-2 text-right">
                      <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-[#b5b2aa] hover:text-[#b83030]" aria-label="Satırı sil">
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {mode === 'teklif' && calc.length > 0 && (
              <div className="ml-auto mt-4 w-72 space-y-1 text-sm">
                <p className="flex justify-between">
                  <span className="text-[#6b6f7a]">Ara toplam (KDV hariç)</span>
                  <b className="tabular-nums">{fmt(sub)} ₺</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-[#6b6f7a]">KDV{vatRates.length === 1 ? ` (%${vatRates[0]})` : ''}</span>
                  <b className="tabular-nums">{fmt(vatTotal)} ₺</b>
                </p>
                <p className="flex justify-between border-t-2 border-[#11131a] pt-2 text-base">
                  <b>Genel toplam</b>
                  <b className="tabular-nums">{fmt(sub + vatTotal)} ₺</b>
                </p>
              </div>
            )}

            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-[#e6e4de] pt-4 text-xs leading-relaxed">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b6f7a]">Koşullar</p>
                <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={4} className="no-print w-full resize-none rounded border border-line p-2 outline-none" />
                <p className="hidden whitespace-pre-line print:block">{terms}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b6f7a]">Not</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="İsteğe bağlı" className="no-print w-full resize-none rounded border border-line p-2 outline-none" />
                <p className="hidden whitespace-pre-line print:block">{note}</p>
              </div>
            </div>
            <p className="mt-8 text-center text-[11px] text-[#9a9da6]">OMY Ticaret · FormStep · SERYN · Kumaş — Bu teklif {dateTR(valid)} tarihine kadar geçerlidir.</p>
          </div>
        </div>

        {/* Ürün seçici */}
        <Card className={cx('no-print h-fit xl:sticky xl:top-24', !picker && 'hidden xl:block')} title="Ürün ekle" pad={false}>
          <div className="flex flex-wrap gap-1 border-b border-line p-3">
            {[{ id: 'all', label: 'Hepsi', color: '' }, ...BRANDS.filter((b) => b.id !== 'diger')].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrand(b.id)}
                className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1', brand === b.id ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10')}
              >
                {b.color && <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />}
                {b.label}
              </button>
            ))}
          </div>
          <ul id="quote-picker" className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {models.map((m) => {
              const added = lines.some((l) => l.key === m.key)
              const i = m.items[0]
              return (
                <li key={m.key}>
                  <button type="button" disabled={added} onClick={() => addModel(m.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#FAF9F6] disabled:opacity-40">
                    {itemImage(i) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={itemImage(i)!} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="h-9 w-9 shrink-0 rounded-lg bg-black/5" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{modelTitle(m)}</span>
                      <span className="block text-xs text-ink-soft/60">
                        {label(BRANDS, m.brand)} · {Number(i.price) ? `${fmt(Number(i.price) / (1 + Number(i.vat_rate ?? 20) / 100))} ₺ + KDV` : 'fiyat yok'}
                      </span>
                    </span>
                    {added ? <span className="text-xs text-ink-soft/60">eklendi</span> : <Plus className="h-4 w-4 text-ink-soft/50" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <div className="no-print fixed bottom-20 right-4 xl:hidden">
        <Button variant="gold" icon={picker ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} onClick={() => setPicker((v) => !v)}>
          {picker ? 'Kapat' : 'Ürün ekle'}
        </Button>
      </div>
      {lines.length > 0 && (
        <button type="button" onClick={() => setLines([])} className="no-print mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft/60 hover:text-[#b83030]">
          <Trash2 className="h-4 w-4" /> Hepsini temizle
        </button>
      )}
    </>
  )
}
