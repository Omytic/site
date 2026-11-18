'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Building2, ChevronRight, MessageCircle, Phone, Plus, Search, Sparkles } from 'lucide-react'
import { BRANDS } from '@/lib/panel/constants'
import { partyKey, Q, type Party, type PartySummary } from '@/lib/panel/data'
import { dateTR, daysBetween, norm, num, tl, today } from '@/lib/panel/format'
import { useOpenFromQuery } from '@/components/panel/forms'
import { kindLabel, PartyForm, segmentLabel, telLink, waLink } from '@/components/panel/parties'
import { Button, Card, cx, Empty, Input, PageHeader, Segmented, Skeleton, Stat, StatusPill } from '@/components/panel/ui'

type Filter = 'all' | 'musteri' | 'tedarikci' | 'alacak'
type Suggestion = { key: string; name: string; kind: 'musteri' | 'tedarikci'; count: number; total: number; last: string; from: string[]; lead?: { phone: string | null; email: string | null; city: string | null; address: string | null; contact: string } }

const since = (iso: string | null) => {
  if (!iso) return 'hiç işlem yok'
  const d = daysBetween(iso.slice(0, 10), today())
  if (d <= 0) return 'bugün'
  if (d === 1) return 'dün'
  if (d < 31) return `${d} gün önce`
  if (d < 365) return `${Math.round(d / 30)} ay önce`
  return dateTR(iso)
}

export default function PartiesPage() {
  const router = useRouter()
  const parties = Q.parties()
  const summary = Q.partySummary()
  const sales = Q.sales()
  const purchases = Q.purchases()
  const invoices = Q.invoices()
  const leads = Q.leads()
  const [filter, setFilter] = useState<Filter>('all')
  const [brand, setBrand] = useState('all')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ initial?: Partial<Party> } | null>(null)
  const [showAllSug, setShowAllSug] = useState(false)
  // Talepler sayfasından "Cari kartı aç" ile gelindiyse bilgiler dolu gelir
  useOpenFromQuery((p) => {
    const v = (k: string) => p.get(k) || null
    setForm(v('ad') ? { initial: { name: v('ad')!, kind: 'musteri', segment: 'toptan', contact_name: v('kisi'), phone: v('tel'), email: v('eposta'), city: v('sehir'), address: v('adres') } } : {})
  })

  const all = parties.data ?? []
  const sum = useMemo(() => new Map((summary.data ?? []).map((s) => [s.party_id, s])), [summary.data])
  const S = (id: string): PartySummary =>
    sum.get(id) ?? { party_id: id, sale_count: 0, revenue: 0, last_sale: null, receivable: 0, overdue: 0, purchase_count: 0, spent: 0, last_purchase: null, payable: 0, last_activity: null, next_date: null }
  const t = today()

  const list = all
    .filter(
      (p) =>
        (filter === 'all' ||
          (filter === 'alacak' ? Number(S(p.id).receivable) > 0 : p.kind === filter || p.kind === 'ikisi')) &&
        (brand === 'all' || p.brands.includes(brand)) &&
        (!q || norm(`${p.name} ${p.contact_name ?? ''} ${p.phone ?? ''} ${p.email ?? ''} ${p.city ?? ''} ${p.district ?? ''} ${p.tags.join(' ')}`).includes(norm(q))),
    )
    .sort((a, b) => (a.status === b.status ? (S(b.id).last_activity ?? '').localeCompare(S(a.id).last_activity ?? '') || a.name.localeCompare(b.name, 'tr') : a.status === 'aktif' ? -1 : 1))

  const totalReceivable = (summary.data ?? []).reduce((a, s) => a + Number(s.receivable), 0)
  const totalOverdue = (summary.data ?? []).reduce((a, s) => a + Number(s.overdue), 0)
  const totalPayable = (summary.data ?? []).reduce((a, s) => a + Number(s.payable), 0)
  const toCall = (summary.data ?? []).filter((s) => s.next_date && s.next_date <= t).length

  // Kayıtlarda adı geçen ama kartı olmayan firmalar: tek tıkla kart açılır, eski kayıtlar bağlanır
  const suggestions = useMemo(() => {
    const known = new Set(all.map((p) => partyKey(p.name)))
    const m = new Map<string, Suggestion>()
    const add = (name: string | null | undefined, kind: 'musteri' | 'tedarikci', amount: number, date: string, from: string, lead?: Suggestion['lead']) => {
      const k = partyKey(name)
      if (!k || k.length < 2 || known.has(k)) return
      const cur = m.get(k) ?? { key: k, name: name!.trim(), kind, count: 0, total: 0, last: date, from: [] }
      cur.count++
      cur.total += amount
      if (date > cur.last) cur.last = date
      if (!cur.from.includes(from)) cur.from.push(from)
      if (lead && !cur.lead) cur.lead = lead
      m.set(k, cur)
    }
    for (const s of sales.data ?? []) if (s.status !== 'iptal') add(s.customer, 'musteri', s.sale_items.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0), s.sale_date, 'satış')
    for (const p of purchases.data ?? []) add(p.supplier, 'tedarikci', Number(p.shipping_cost) + p.purchase_items.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost), 0), p.purchase_date, 'alım')
    for (const i of invoices.data ?? []) add(i.counterparty, i.kind === 'alis' || i.kind === 'gider' ? 'tedarikci' : 'musteri', 0, i.inv_date, 'fatura')
    // Gelir-gider karşı tarafı çoğu zaman açıklama ("Depo kirası" gibi), öneriye alınmaz
    for (const l of leads.data ?? [])
      if (l.company && ['kazanildi', 'teklif', 'numune'].includes(l.status))
        add(l.company, 'musteri', 0, l.created_at.slice(0, 10), 'talep', { phone: l.phone, email: l.email, city: l.city, address: l.address, contact: l.name })
    return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
  }, [all, sales.data, purchases.data, invoices.data, leads.data])

  const openSuggestion = (s: Suggestion) =>
    setForm({
      initial: {
        name: s.name,
        kind: s.kind,
        segment: s.kind === 'musteri' ? 'toptan' : null,
        contact_name: s.lead?.contact ?? null,
        phone: s.lead?.phone ?? null,
        email: s.lead?.email ?? null,
        city: s.lead?.city ?? null,
        address: s.lead?.address ?? null,
      },
    })

  const loading = parties.loading || summary.loading
  return (
    <>
      <PageHeader
        title="Cariler"
        subtitle="Mal sattığımız ve aldığımız firmalar. Her firmanın kartında iletişim bilgisi, satışlar, faturalar, anlaşmalar ve notlar bir arada."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
            Yeni cari
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kayıtlı firma" value={num(all.filter((p) => p.status === 'aktif').length)} sub={`${num(all.filter((p) => p.kind !== 'tedarikci').length)} müşteri · ${num(all.filter((p) => p.kind !== 'musteri').length)} tedarikçi`} />
        <Stat label="Tahsil edilecek" value={tl(totalReceivable)} sub={totalOverdue > 0 ? <span className="font-semibold text-[#b83030]">{tl(totalOverdue)} vadesi geçmiş</span> : 'vadesi geçen yok'} />
        <Stat label="Ödenecek" value={tl(totalPayable)} sub="tedarikçilere borç" />
        <Stat label="Aranacak" value={num(toCall)} sub="arama günü gelen firma" />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'Hepsi' },
              { id: 'musteri', label: 'Müşteriler' },
              { id: 'tedarikci', label: 'Tedarikçiler' },
              { id: 'alacak', label: 'Alacağımız olan' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {[{ id: 'all', label: 'Tüm markalar', color: '' }, ...BRANDS.filter((b) => b.id !== 'diger')].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBrand(b.id)}
                  className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition', brand === b.id ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
                >
                  {b.color && <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />}
                  {b.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firma, kişi, telefon, şehir…" className="h-9 w-full pl-9 sm:w-60" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : list.length === 0 ? (
          <Empty
            title={all.length ? 'Bu filtrede firma yok' : 'Henüz cari yok'}
            text={all.length ? undefined : 'İlk firmayı ekleyin ya da aşağıdaki öneri listesinden tek tıkla kart açın; geçmiş satış ve faturaları kendiliğinden bağlanır.'}
            icon={<Building2 className="h-6 w-6" />}
            action={
              !all.length && (
                <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})}>
                  Yeni cari
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((p) => {
              const s = S(p.id)
              const call = s.next_date && s.next_date <= t
              return (
                <li key={p.id} className={cx('group relative flex items-center gap-3 px-4 py-3.5 hover:bg-[#FAF9F6] sm:px-5', p.status === 'pasif' && 'opacity-55')}>
                  <Link href={`/admin/cariler/${p.id}`} className="absolute inset-0" aria-label={p.name} />
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-night font-display text-base font-black text-thread">{p.name.trim().charAt(0).toLocaleUpperCase('tr-TR')}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <b className="truncate text-ink">{p.name}</b>
                      <span className="text-xs text-ink-soft/55">
                        {[kindLabel(p.kind), segmentLabel(p.segment), p.city].filter(Boolean).join(' · ')}
                      </span>
                      {p.brands.map((b) => {
                        const br = BRANDS.find((x) => x.id === b)
                        return br ? <span key={b} title={br.label} className="h-2 w-2 rounded-full" style={{ background: br.color }} /> : null
                      })}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-soft/60">
                      <span>Son işlem: {since(s.last_activity)}</span>
                      {s.sale_count > 0 && <span>{num(s.sale_count)} satış · {tl(s.revenue)}</span>}
                      {s.purchase_count > 0 && <span>{num(s.purchase_count)} alım · {tl(s.spent)}</span>}
                      {p.contact_name && <span className="hidden sm:inline">{p.contact_name}</span>}
                      {Number(s.receivable) > 0 && <span className={cx('font-semibold sm:hidden', Number(s.overdue) > 0 ? 'text-[#b83030]' : 'text-[#8a5a00]')}>{tl(s.receivable)} alacak</span>}
                      {Number(s.payable) > 0 && <span className="font-semibold text-[#1c5cab] sm:hidden">{tl(s.payable)} borcumuz</span>}
                    </p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    {Number(s.overdue) > 0 ? (
                      <StatusPill tone="critical">{tl(s.overdue)} gecikmiş</StatusPill>
                    ) : Number(s.receivable) > 0 ? (
                      <StatusPill tone="warning">{tl(s.receivable)} alacak</StatusPill>
                    ) : null}
                    {Number(s.payable) > 0 && <StatusPill tone="info">{tl(s.payable)} borcumuz</StatusPill>}
                    {call && <StatusPill tone="warning">Aranacak</StatusPill>}
                  </div>
                  {p.phone && (
                    <div className="relative z-[1] flex shrink-0 gap-1">
                      <a href={telLink(p.phone)} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.04] text-ink-soft hover:bg-black/[0.08]" aria-label="Ara" title="Ara">
                        <Phone className="h-4 w-4" />
                      </a>
                      <a href={waLink(p.phone)} target="_blank" rel="noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/12 text-[#128C7E] hover:bg-[#25D366]/20" aria-label="WhatsApp" title="WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft/30 group-hover:text-ink-soft" />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {suggestions.length > 0 && (
        <Card
          className="mt-4"
          title={
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-thread" /> Kayıtlarda geçen ama kartı olmayan firmalar
            </span>
          }
        >
          <p className="-mt-2 mb-3 text-sm text-ink-soft/65">Satış, alım, fatura ve taleplerde adı yazılmış. &quot;Kart aç&quot; derseniz o firmanın geçmiş kayıtları kartına kendiliğinden bağlanır.</p>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {(showAllSug ? suggestions : suggestions.slice(0, 6)).map((s) => (
              <li key={s.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{s.name}</p>
                  <p className="text-xs text-ink-soft/60">
                    {s.kind === 'musteri' ? 'Müşteri' : 'Tedarikçi'} · {num(s.count)} kayıt ({s.from.join(', ')}){s.total > 0 && ` · ${tl(s.total)}`} · son {dateTR(s.last)}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => openSuggestion(s)}>
                  Kart aç
                </Button>
              </li>
            ))}
          </ul>
          {suggestions.length > 6 && (
            <button type="button" onClick={() => setShowAllSug((v) => !v)} className="mt-3 text-sm font-semibold text-[#1d5fb0] hover:underline">
              {showAllSug ? 'Daha az göster' : `${suggestions.length - 6} firma daha`}
            </button>
          )}
        </Card>
      )}

      {form && <PartyForm party={null} initial={form.initial} onClose={() => setForm(null)} onSaved={(id) => id && !form.initial && router.push(`/admin/cariler/${id}`)} />}
    </>
  )
}
