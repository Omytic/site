'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  FileSignature,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  ShoppingBag,
  PackagePlus,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS, BRANDS_WITH_GENEL, CHANNELS, label } from '@/lib/panel/constants'
import { AFTER, invalidate, itemLabel, Q, write, type PartyAgreement, type PartyDetail, type PartyNote } from '@/lib/panel/data'
import { dateTR, lastMonths, monthKey, monthLabel, num, relTime, tl, today } from '@/lib/panel/format'
import { MiniBars } from '@/components/panel/charts'
import { kindLabel, mapLink, PartyForm, reminderText, segmentLabel, telLink, waLink } from '@/components/panel/parties'
import { Badge, Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, Segmented, Select, Skeleton, Stat, StatusPill, Textarea, useUi } from '@/components/panel/ui'

const NOTE_KINDS = [
  { id: 'not', label: 'Not' },
  { id: 'arama', label: 'Telefon' },
  { id: 'gorusme', label: 'Görüşme' },
  { id: 'ziyaret', label: 'Ziyaret' },
  { id: 'teklif', label: 'Teklif' },
  { id: 'eposta', label: 'E-posta' },
]
const AG_STATUS = [
  { id: 'aktif', label: 'Geçerli' },
  { id: 'taslak', label: 'Konuşuluyor' },
  { id: 'bitti', label: 'Bitti' },
]
const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
const saleSum = (s: { sale_items: { qty: number; unit_price: number }[] }) => s.sale_items.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0)
const purchaseSum = (p: { shipping_cost: number; purchase_items: { qty: number; unit_cost: number }[] }) =>
  Number(p.shipping_cost) + p.purchase_items.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost), 0)

type Ev = { id: string; date: string; type: 'satis' | 'alim' | 'fatura' | 'para' | 'not' | 'talep'; title: string; sub?: string; amount?: number; tone?: 'in' | 'out'; badge?: React.ReactNode; file?: string | null }
const EV_LABEL: Record<Ev['type'], string> = { satis: 'Satış', alim: 'Alım', fatura: 'Fatura', para: 'Ödeme', not: 'Not', talep: 'Talep' }
const EV_ICON: Record<Ev['type'], React.ReactNode> = {
  satis: <ShoppingBag className="h-4 w-4" />,
  alim: <PackagePlus className="h-4 w-4" />,
  fatura: <FileText className="h-4 w-4" />,
  para: <span className="text-sm font-black">₺</span>,
  not: <MessageCircle className="h-4 w-4" />,
  talep: <Mail className="h-4 w-4" />,
}

export default function PartyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const party = Q.party(id)
  const summary = Q.partySummary()
  const sales = Q.sales()
  const purchases = Q.purchases()
  const invoices = Q.invoices()
  const transactions = Q.transactions()
  const leads = Q.leads()
  const items = Q.items()
  const { toast } = useUi()
  const [tab, setTab] = useState<'hareket' | 'urun' | 'anlasma' | 'not'>('hareket')
  const [evFilter, setEvFilter] = useState<'all' | Ev['type']>('all')
  const [editing, setEditing] = useState(false)
  const [agForm, setAgForm] = useState<PartyAgreement | 'new' | null>(null)

  const p = party.data
  const s = (summary.data ?? []).find((x) => x.party_id === id)
  const mySales = useMemo(() => (sales.data ?? []).filter((x) => x.party_id === id), [sales.data, id])
  const myPurchases = useMemo(() => (purchases.data ?? []).filter((x) => x.party_id === id), [purchases.data, id])
  const myInvoices = useMemo(() => (invoices.data ?? []).filter((x) => x.party_id === id), [invoices.data, id])
  const myTx = useMemo(() => (transactions.data ?? []).filter((x) => x.party_id === id), [transactions.data, id])
  const myLeads = useMemo(() => (leads.data ?? []).filter((x) => x.party_id === id), [leads.data, id])
  const itemName = (iid: string) => {
    const i = (items.data ?? []).find((x) => x.id === iid)
    return i ? itemLabel(i) : 'Ürün'
  }

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 120)
    if (error || !data) return toast('Dosya açılamadı', 'error')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  // Hareketler: satış, alım, fatura, ödeme, not, talep tek zaman çizelgesinde
  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = []
    for (const x of mySales) {
      const lines = x.sale_items.map((l) => `${num(l.qty)} × ${itemName(l.item_id)}`)
      out.push({
        id: `s${x.id}`,
        date: x.sale_date,
        type: 'satis',
        title: lines.slice(0, 2).join(', ') + (lines.length > 2 ? ` +${lines.length - 2} kalem` : '') || 'Satış',
        sub: [label(CHANNELS, x.channel), x.order_no].filter(Boolean).join(' · '),
        amount: x.status === 'iptal' ? undefined : saleSum(x),
        tone: 'in',
        badge:
          x.status !== 'tamamlandi' ? (
            <StatusPill tone="neutral">{x.status === 'iade' ? 'İade' : 'İptal'}</StatusPill>
          ) : x.payment_status === 'bekliyor' ? (
            <StatusPill tone={x.due_date && x.due_date < today() ? 'critical' : 'warning'}>{x.due_date ? `Vade ${dateTR(x.due_date)}` : 'Ödeme bekliyor'}</StatusPill>
          ) : (
            <StatusPill tone="good">Ödendi</StatusPill>
          ),
      })
    }
    for (const x of myPurchases) {
      const lines = x.purchase_items.map((l) => `${num(l.qty)} × ${itemName(l.item_id)}`)
      out.push({
        id: `p${x.id}`,
        date: x.purchase_date,
        type: 'alim',
        title: lines.slice(0, 2).join(', ') + (lines.length > 2 ? ` +${lines.length - 2} kalem` : '') || 'Alım',
        sub: x.invoice_no ? `Fatura ${x.invoice_no}` : undefined,
        amount: purchaseSum(x),
        tone: 'out',
        badge: x.payment_status === 'bekliyor' ? <StatusPill tone="info">{x.due_date ? `Ödenecek ${dateTR(x.due_date)}` : 'Ödenecek'}</StatusPill> : undefined,
      })
    }
    for (const x of myInvoices)
      out.push({
        id: `i${x.id}`,
        date: x.inv_date,
        type: 'fatura',
        title: `${x.kind === 'satis' ? 'Satış faturası' : x.kind === 'alis' ? 'Alış faturası' : x.kind === 'iade' ? 'İade faturası' : 'Gider faturası'}${x.number ? ` ${x.number}` : ''}`,
        sub: x.note ?? undefined,
        amount: x.amount ?? undefined,
        file: x.file_path,
      })
    for (const x of myTx)
      out.push({
        id: `t${x.id}`,
        date: x.tx_date,
        type: 'para',
        title: x.note || (x.direction === 'gelir' ? 'Tahsilat / gelir' : 'Ödeme / gider'),
        amount: Number(x.amount),
        tone: x.direction === 'gelir' ? 'in' : 'out',
        badge: x.payment_status === 'bekliyor' ? <StatusPill tone="warning">Bekliyor</StatusPill> : undefined,
      })
    for (const x of p?.party_notes ?? [])
      out.push({ id: `n${x.id}`, date: x.created_at, type: 'not', title: x.body, sub: NOTE_KINDS.find((k) => k.id === x.kind)?.label })
    for (const x of myLeads) out.push({ id: `l${x.id}`, date: x.created_at, type: 'talep', title: x.message || 'Talep', sub: x.name })
    return out.sort((a, b) => b.date.localeCompare(a.date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySales, myPurchases, myInvoices, myTx, myLeads, p?.party_notes, items.data])

  // Ne sattık / ne aldık: ürün bazında toplam, son fiyat, son tarih
  const products = useMemo(() => {
    type Row = { item_id: string; qty: number; total: number; last: string; lastPrice: number; count: number }
    const agg = (rows: { date: string; item_id: string; qty: number; price: number }[]) => {
      const m = new Map<string, Row>()
      for (const r of rows.sort((a, b) => a.date.localeCompare(b.date))) {
        const c = m.get(r.item_id) ?? { item_id: r.item_id, qty: 0, total: 0, last: r.date, lastPrice: r.price, count: 0 }
        c.qty += r.qty
        c.total += r.qty * r.price
        c.last = r.date
        c.lastPrice = r.price
        c.count++
        m.set(r.item_id, c)
      }
      return [...m.values()].sort((a, b) => b.last.localeCompare(a.last) || b.total - a.total)
    }
    return {
      sold: agg(mySales.filter((x) => x.status === 'tamamlandi').flatMap((x) => x.sale_items.map((l) => ({ date: x.sale_date, item_id: l.item_id, qty: Number(l.qty), price: Number(l.unit_price) })))),
      bought: agg(myPurchases.flatMap((x) => x.purchase_items.map((l) => ({ date: x.purchase_date, item_id: l.item_id, qty: Number(l.qty), price: Number(l.unit_cost) })))),
    }
  }, [mySales, myPurchases])

  if (party.loading) return <Skeleton className="h-96" />
  if (party.error) return <ErrorNote message={party.error} />
  if (!p)
    return (
      <Empty
        title="Cari bulunamadı"
        text="Bu kart silinmiş olabilir."
        action={
          <Link href="/admin/cariler">
            <Button variant="secondary">Carilere dön</Button>
          </Link>
        }
      />
    )

  // Ödeme hatırlatması: bekleyen satışlar ve gelir kayıtları
  const pendingRows = [
    ...mySales.filter((x) => x.status === 'tamamlandi' && x.payment_status === 'bekliyor').map((x) => ({ date: x.sale_date, amount: saleSum(x), due: x.due_date })),
    ...myTx.filter((x) => x.direction === 'gelir' && x.payment_status === 'bekliyor').map((x) => ({ date: x.tx_date, amount: Number(x.amount), due: x.due_date })),
  ].filter((r) => r.amount > 0)
  const remindPhone = p.phone ?? p.party_contacts.find((c) => c.phone)?.phone ?? null
  const isCustomer = p.kind !== 'tedarikci'
  const isSupplier = p.kind !== 'musteri'
  const months = lastMonths(12)
  const monthly = months.map((m) =>
    isCustomer
      ? mySales.filter((x) => x.status === 'tamamlandi' && monthKey(x.sale_date) === m).reduce((a, x) => a + saleSum(x), 0)
      : myPurchases.filter((x) => monthKey(x.purchase_date) === m).reduce((a, x) => a + purchaseSum(x), 0),
  )
  const year = today().slice(0, 4)
  const yearRevenue = mySales.filter((x) => x.status === 'tamamlandi' && x.sale_date.startsWith(year)).reduce((a, x) => a + saleSum(x), 0)
  const q = encodeURIComponent(p.name)
  const counts: Record<string, number> = {}
  events.forEach((e) => (counts[e.type] = (counts[e.type] ?? 0) + 1))

  return (
    <>
      <Link href="/admin/cariler" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-soft/70 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Cariler
      </Link>

      {/* Başlık */}
      <section className="rounded-2xl bg-night p-5 text-white sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[28px] font-black leading-tight tracking-tight sm:text-4xl">{p.name}</h1>
              {p.status === 'pasif' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/70">Pasif</span>}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/65">
              <span>{[kindLabel(p.kind), segmentLabel(p.segment)].filter(Boolean).join(' · ')}</span>
              {p.brands.map((b) => {
                const br = BRANDS.find((x) => x.id === b)
                return br ? (
                  <span key={b} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: br.color }} />
                    {br.label}
                  </span>
                ) : null
              })}
              {(p.city || p.district) && <span>{[p.district, p.city].filter(Boolean).join(', ')}</span>}
              {p.contact_name && <span>Yetkili: {p.contact_name}</span>}
            </p>
          </div>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {p.phone && (
              <>
                <HeadBtn href={telLink(p.phone)} icon={<Phone className="h-4 w-4" />}>
                  Ara
                </HeadBtn>
                <HeadBtn href={waLink(p.phone)} icon={<MessageCircle className="h-4 w-4" />} external>
                  WhatsApp
                </HeadBtn>
              </>
            )}
            {p.email && (
              <HeadBtn href={`mailto:${p.email}`} icon={<Mail className="h-4 w-4" />}>
                E-posta
              </HeadBtn>
            )}
            {(p.address || p.city) && (
              <HeadBtn href={mapLink(p)} icon={<MapPin className="h-4 w-4" />} external>
                Harita
              </HeadBtn>
            )}
            {pendingRows.length > 0 && remindPhone && (
              <a
                href={`${waLink(remindPhone)}?text=${encodeURIComponent(reminderText(p, pendingRows))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25D366] px-3.5 text-sm font-bold text-white hover:bg-[#1fb857]"
                title="Hazır mesajla WhatsApp açılır, göndermeden önce düzenleyebilirsiniz"
              >
                <MessageCircle className="h-4 w-4" /> Ödeme hatırlat
              </a>
            )}
            <button type="button" onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-thread px-3.5 text-sm font-bold text-night hover:bg-thread-soft">
              <Pencil className="h-4 w-4" /> Düzenle
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {isCustomer && (
            <Link href={`/admin/satislar?yeni=1&cari=${q}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
              <Plus className="h-4 w-4" /> Satış gir
            </Link>
          )}
          {isSupplier && (
            <Link href={`/admin/alimlar?yeni=1&cari=${q}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
              <Plus className="h-4 w-4" /> Alım gir
            </Link>
          )}
          {isCustomer && (
            <Link href={`/admin/cariler/${p.id}/teklif`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
              <FileText className="h-4 w-4" /> Teklif / fiyat listesi
            </Link>
          )}
          <Link href={`/admin/faturalar?yeni=1&cari=${q}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
            <Plus className="h-4 w-4" /> Fatura ekle
          </Link>
          <button type="button" onClick={() => setAgForm('new')} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
            <Plus className="h-4 w-4" /> Anlaşma ekle
          </button>
          <button type="button" onClick={() => setTab('not')} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
            <Plus className="h-4 w-4" /> Not / görüşme
          </button>
        </div>
      </section>

      {/* Özet */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isCustomer && <Stat label="Toplam satış" value={tl(s?.revenue ?? 0)} sub={`${num(s?.sale_count ?? 0)} satış · bu yıl ${tl(yearRevenue)}`} />}
        {isCustomer && (
          <Stat
            label="Tahsil edilecek"
            value={tl(s?.receivable ?? 0)}
            sub={Number(s?.overdue ?? 0) > 0 ? <span className="font-semibold text-[#b83030]">{tl(s?.overdue)} vadesi geçmiş</span> : 'vadesi geçen yok'}
          />
        )}
        {isSupplier && <Stat label="Toplam alım" value={tl(s?.spent ?? 0)} sub={`${num(s?.purchase_count ?? 0)} alım`} />}
        {isSupplier && <Stat label="Ödenecek" value={tl(s?.payable ?? 0)} sub="bu firmaya borcumuz" />}
        <Stat
          label={isCustomer ? 'Son satış' : 'Son alım'}
          value={(isCustomer ? s?.last_sale : s?.last_purchase) ? dateTR(isCustomer ? s?.last_sale : s?.last_purchase) : '—'}
          sub={s?.next_date ? `Tekrar aranacak: ${dateTR(s.next_date)}` : undefined}
        />
        {p.kind !== 'ikisi' && <Stat label="Anlaşma" value={num(p.party_agreements.filter((a) => a.status === 'aktif').length)} sub="geçerli anlaşma" />}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {monthly.some((v) => v > 0) && (
            <Card title={isCustomer ? 'Aylık satış (son 12 ay)' : 'Aylık alım (son 12 ay)'}>
              <MiniBars labels={months.map((m) => monthLabel(m).split(' ')[0])} values={monthly} format={(v) => tl(v)} height={140} />
            </Card>
          )}

          <Card pad={false}>
            <div className="border-b border-line p-3 sm:p-4">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { id: 'hareket', label: 'Hareketler' },
                  { id: 'urun', label: 'Ürünler' },
                  { id: 'anlasma', label: `Anlaşmalar${p.party_agreements.length ? ` (${p.party_agreements.length})` : ''}` },
                  { id: 'not', label: `Notlar${p.party_notes.length ? ` (${p.party_notes.length})` : ''}` },
                ]}
              />
            </div>

            {tab === 'hareket' && (
              <>
                {events.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                    {(['all', 'satis', 'alim', 'fatura', 'para', 'not', 'talep'] as const)
                      .filter((k) => k === 'all' || counts[k])
                      .map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEvFilter(k)}
                          className={cx('rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition', evFilter === k ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
                        >
                          {k === 'all' ? 'Hepsi' : EV_LABEL[k]} <span className="opacity-60">{k === 'all' ? events.length : counts[k]}</span>
                        </button>
                      ))}
                  </div>
                )}
                {events.length === 0 ? (
                  <Empty title="Henüz hareket yok" text="Bu firmaya satış, alım ya da fatura girdiğinizde (firma adını aynı yazmanız yeter) burada görünür." />
                ) : (
                  <ul className="divide-y divide-line">
                    {events
                      .filter((e) => evFilter === 'all' || e.type === evFilter)
                      .slice(0, 200)
                      .map((e) => (
                        <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                          <span
                            className={cx(
                              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                              e.type === 'satis' ? 'bg-[#e6f6ee] text-[#0a6e3a]' : e.type === 'alim' ? 'bg-[#eaf2fd] text-[#1d5fb0]' : 'bg-black/[0.05] text-ink-soft',
                            )}
                          >
                            {EV_ICON[e.type]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{e.title}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft/60">
                              <span>{EV_LABEL[e.type]}</span>
                              <span>{e.date.length > 10 ? relTime(e.date) : dateTR(e.date)}</span>
                              {e.sub && <span>{e.sub}</span>}
                              {e.badge}
                              {e.file && (
                                <button type="button" onClick={() => openFile(e.file!)} className="inline-flex items-center gap-1 font-semibold text-[#1d5fb0] hover:underline">
                                  <Paperclip className="h-3 w-3" /> Dosyayı aç
                                </button>
                              )}
                            </p>
                          </div>
                          {e.amount != null && (
                            <span className={cx('shrink-0 text-sm font-bold tabular-nums', e.tone === 'out' ? 'text-ink-soft' : 'text-ink')}>
                              {e.tone === 'out' ? '−' : ''}
                              {tl(e.amount)}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}

            {tab === 'urun' && (
              <div className="space-y-5 p-4">
                {products.sold.length === 0 && products.bought.length === 0 && <Empty title="Ürün hareketi yok" text="Satış ve alımlardaki ürünler burada toplanır: ne kadar, hangi fiyattan, en son ne zaman." />}
                {products.sold.length > 0 && <ProductTable title="Sattıklarımız" rows={products.sold} name={itemName} priceLabel="Son satış fiyatı" />}
                {products.bought.length > 0 && <ProductTable title="Aldıklarımız" rows={products.bought} name={itemName} priceLabel="Son alış fiyatı" />}
              </div>
            )}

            {tab === 'anlasma' && <Agreements party={p} onEdit={setAgForm} openFile={openFile} />}
            {tab === 'not' && <Notes party={p} />}
          </Card>
        </div>

        <div className="space-y-4">
          <InfoCard party={p} />
          <Contacts party={p} />
        </div>
      </div>

      {editing && <PartyForm party={p} onClose={() => setEditing(false)} onSaved={(nid) => !nid && router.push('/admin/cariler')} />}
      {agForm && <AgreementForm party={p} agreement={agForm === 'new' ? null : agForm} onClose={() => setAgForm(null)} />}
    </>
  )
}

function HeadBtn({ href, icon, children, external }: { href: string; icon: React.ReactNode; children: React.ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 hover:bg-white/15"
    >
      {icon}
      {children}
    </a>
  )
}

function ProductTable({ title, rows, name, priceLabel }: { title: string; rows: { item_id: string; qty: number; total: number; last: string; lastPrice: number; count: number }[]; name: (id: string) => string; priceLabel: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">{title}</p>
      <div className="overflow-hidden rounded-xl ring-1 ring-line">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.item_id} className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_90px_110px_120px]">
              <span className="col-span-2 font-semibold text-ink sm:col-span-1">{name(r.item_id)}</span>
              <span className="text-ink-soft/70 sm:text-right">
                {num(r.qty)} <span className="text-xs">({num(r.count)} kez)</span>
              </span>
              <span className="text-right font-bold tabular-nums text-ink">{tl(r.total)}</span>
              <span className="col-span-2 text-xs text-ink-soft/60 sm:col-span-1 sm:text-right">
                {priceLabel}: <b className="text-ink-soft">{tl(r.lastPrice, true)}</b>
                <br className="hidden sm:block" /> <span className="sm:hidden">·</span> {dateTR(r.last)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function CopyRow({ label: l, value, copy }: { label: string; value: string; copy?: boolean }) {
  const { toast } = useUi()
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-ink-soft/55">{l}</p>
        <p className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{value}</p>
      </div>
      {copy && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(value).then(() => toast('Kopyalandı'))}
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-soft/50 hover:bg-black/5 hover:text-ink"
          aria-label={`${l} kopyala`}
        >
          <Copy className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function InfoCard({ party: p }: { party: PartyDetail }) {
  const terms = [
    p.payment_days != null && `Vade ${num(p.payment_days)} gün`,
    p.discount_pct != null && Number(p.discount_pct) > 0 && `%${num(p.discount_pct)} indirim`,
  ].filter(Boolean) as string[]
  const rows: [string, string | null, boolean?][] = [
    ['Telefon', p.phone, true],
    ['E-posta', p.email, true],
    ['Adres', [p.address, p.district, p.city].filter(Boolean).join(', ') || null, true],
    ['Vergi dairesi / no', [p.tax_office, p.tax_no].filter(Boolean).join(' · ') || null, true],
    ['IBAN', p.iban, true],
    ['Web', p.website],
    ['Instagram', p.instagram ? `@${p.instagram}` : null],
  ]
  const shown = rows.filter((r) => r[1])
  return (
    <Card title="Bilgiler">
      {(terms.length > 0 || p.price_note) && (
        <div className="-mt-1 mb-3 rounded-xl bg-[#fff8e6] p-3 ring-1 ring-[#E3AB3B]/30">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8a5a00]">Çalışma koşulları</p>
          {terms.length > 0 && <p className="mt-1 text-sm font-bold text-ink">{terms.join(' · ')}</p>}
          {p.price_note && <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{p.price_note}</p>}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-ink-soft/60">Telefon, adres, vergi bilgisi eklenmemiş. &quot;Düzenle&quot;den ekleyebilirsiniz.</p>
      ) : (
        <div className="-my-2 divide-y divide-line">
          {shown.map(([l, v, c]) => (
            <CopyRow key={l} label={l} value={v!} copy={c} />
          ))}
        </div>
      )}
      {p.note && <p className="mt-3 whitespace-pre-line rounded-xl bg-black/[0.03] p-3 text-sm text-ink-soft">{p.note}</p>}
    </Card>
  )
}

function Contacts({ party: p }: { party: PartyDetail }) {
  const { toast, confirm } = useUi()
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', role: '', phone: '', email: '' })
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    try {
      await write(supabase.from('party_contacts').insert({ party_id: p.id, name: f.name.trim(), role: f.role.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null }))
      invalidate(`party:${p.id}`)
      setF({ name: '', role: '', phone: '', email: '' })
      setAdding(false)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async (cid: string, name: string) => {
    if (!(await confirm(`${name} silinsin mi?`))) return
    try {
      await write(supabase.from('party_contacts').delete().eq('id', cid))
      invalidate(`party:${p.id}`)
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Card
      title="Kişiler"
      action={
        !adding && (
          <Button size="sm" variant="ghost" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Ekle
          </Button>
        )
      }
    >
      {p.party_contacts.length === 0 && !adding && <p className="text-sm text-ink-soft/60">Satın almacı, muhasebeci, depo sorumlusu… firmada konuştuğumuz herkes.</p>}
      <ul className="-my-1 divide-y divide-line">
        {p.party_contacts.map((c) => (
          <li key={c.id} className="group flex items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {c.name} {c.role && <span className="font-normal text-ink-soft/60">· {c.role}</span>}
              </p>
              <p className="text-xs text-ink-soft/60">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
            </div>
            {c.phone && (
              <>
                <a href={telLink(c.phone)} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.04] text-ink-soft hover:bg-black/[0.08]" aria-label={`${c.name} ara`}>
                  <Phone className="h-3.5 w-3.5" />
                </a>
                <a href={waLink(c.phone)} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/12 text-[#128C7E]" aria-label={`${c.name} WhatsApp`}>
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              </>
            )}
            <button type="button" onClick={() => del(c.id, c.name)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft/40 hover:bg-black/5 hover:text-[#b83030]" aria-label={`${c.name} sil`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={save} className="mt-2 space-y-2 rounded-xl bg-black/[0.03] p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ad soyad" autoFocus required className="col-span-2" />
            <Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Görevi" />
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Telefon" type="tel" />
            <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="E-posta" type="email" className="col-span-2" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Vazgeç
            </Button>
            <Button type="submit" size="sm" loading={busy}>
              Kaydet
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function Notes({ party: p }: { party: PartyDetail }) {
  const { toast, confirm } = useUi()
  const { byId } = useAuth()
  const [kind, setKind] = useState('arama')
  const [body, setBody] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const notes = [...p.party_notes].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const t = today()
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      await write(supabase.from('party_notes').insert({ party_id: p.id, kind, body: body.trim(), next_date: next || null }))
      invalidate(`party:${p.id}`, 'party_summary')
      setBody('')
      setNext('')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (n: PartyNote) => {
    try {
      await write(supabase.from('party_notes').update({ done: !n.done }).eq('id', n.id))
      invalidate(`party:${p.id}`, 'party_summary')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  const del = async (n: PartyNote) => {
    if (!(await confirm('Not silinsin mi?'))) return
    try {
      await write(supabase.from('party_notes').delete().eq('id', n.id))
      invalidate(`party:${p.id}`, 'party_summary')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <div className="p-4">
      <form onSubmit={save} className="rounded-xl bg-black/[0.03] p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {NOTE_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cx('rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition', kind === k.id ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
            >
              {k.label}
            </button>
          ))}
        </div>
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ne konuşuldu? Ör. Ocak için 500 çift FormStep istiyorlar, fiyat bekliyorlar." />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <label className="text-xs font-semibold text-ink-soft/70">
            Tekrar aranacak gün (isteğe bağlı)
            <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1 h-9 w-44" />
          </label>
          <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
            Notu kaydet
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="mt-4 text-center text-sm text-ink-soft/60">Henüz not yok.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {notes.map((n) => {
            const who = byId(n.created_by)
            const due = n.next_date && !n.done
            return (
              <li key={n.id} className="group py-3">
                <p className="whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">{n.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft/60">
                  <Badge className="bg-black/[0.05]">{NOTE_KINDS.find((k) => k.id === n.kind)?.label ?? n.kind}</Badge>
                  <span>{relTime(n.created_at)}</span>
                  {who && <span>{who.full_name || who.username}</span>}
                  {n.next_date && (
                    <button type="button" onClick={() => toggle(n)} className="inline-flex items-center gap-1" title={n.done ? 'Geri al' : 'Arandı olarak işaretle'}>
                      {n.done ? (
                        <StatusPill tone="good">
                          <Check className="h-3 w-3" /> Arandı
                        </StatusPill>
                      ) : (
                        <StatusPill tone={due && n.next_date! <= t ? 'critical' : 'warning'}>
                          <CalendarClock className="h-3 w-3" /> {dateTR(n.next_date)} aranacak
                        </StatusPill>
                      )}
                    </button>
                  )}
                  <button type="button" onClick={() => del(n)} className="ml-auto text-ink-soft/40 opacity-100 hover:text-[#b83030] sm:opacity-0 sm:group-hover:opacity-100" aria-label="Notu sil">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Agreements({ party: p, onEdit, openFile }: { party: PartyDetail; onEdit: (a: PartyAgreement | 'new') => void; openFile: (path: string) => void }) {
  const list = [...p.party_agreements].sort((a, b) => (a.status === 'aktif' ? -1 : 1) - (b.status === 'aktif' ? -1 : 1) || (b.start_date ?? '').localeCompare(a.start_date ?? ''))
  const t = today()
  if (list.length === 0)
    return (
      <Empty
        title="Anlaşma yok"
        text="Fiyat listesi, bayilik sözleşmesi, kampanya koşulu… Dosyasıyla birlikte ekleyin, kimse aramak zorunda kalmasın."
        icon={<FileSignature className="h-6 w-6" />}
        action={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => onEdit('new')}>
            Anlaşma ekle
          </Button>
        }
      />
    )
  return (
    <div className="p-4">
      <ul className="space-y-2">
        {list.map((a) => {
          const expired = a.status === 'aktif' && a.end_date && a.end_date < t
          return (
            <li key={a.id} className={cx('rounded-xl p-3.5 ring-1 ring-line', a.status === 'bitti' && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft/50" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <b className="text-ink">{a.title}</b>
                    <StatusPill tone={expired ? 'critical' : a.status === 'aktif' ? 'good' : a.status === 'taslak' ? 'warning' : 'neutral'}>
                      {expired ? 'Süresi doldu' : AG_STATUS.find((x) => x.id === a.status)?.label}
                    </StatusPill>
                    {a.brand && <Badge color={BRANDS_WITH_GENEL.find((b) => b.id === a.brand)?.color}>{label(BRANDS_WITH_GENEL, a.brand)}</Badge>}
                  </p>
                  {(a.start_date || a.end_date) && (
                    <p className="mt-0.5 text-xs text-ink-soft/60">
                      {a.start_date ? dateTR(a.start_date) : '…'} – {a.end_date ? dateTR(a.end_date) : 'süresiz'}
                    </p>
                  )}
                  {a.terms && <p className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">{a.terms}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    {a.file_path && (
                      <button type="button" onClick={() => openFile(a.file_path!)} className="inline-flex items-center gap-1 font-semibold text-[#1d5fb0] hover:underline">
                        <Paperclip className="h-3.5 w-3.5" /> {a.file_name ?? 'Dosya'}
                      </button>
                    )}
                    <button type="button" onClick={() => onEdit(a)} className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink">
                      <Pencil className="h-3.5 w-3.5" /> Düzenle
                    </button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <Button className="mt-3" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onEdit('new')}>
        Anlaşma ekle
      </Button>
    </div>
  )
}

function AgreementForm({ party, agreement, onClose }: { party: PartyDetail; agreement: PartyAgreement | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    title: agreement?.title ?? '',
    brand: agreement?.brand ?? (party.brands.length === 1 ? party.brands[0] : ''),
    start_date: agreement?.start_date ?? today(),
    end_date: agreement?.end_date ?? '',
    status: agreement?.status ?? 'aktif',
    terms: agreement?.terms ?? '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return toast('Başlık yazın', 'error')
    setBusy(true)
    try {
      let filePatch = {}
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Dosya 20 MB’den büyük olamaz')
        const path = `anlasmalar/${party.id}/${crypto.randomUUID()}-${safe(file.name)}`
        const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw new Error(error.message)
        filePatch = { file_path: path, file_name: file.name, file_size: file.size }
        if (agreement?.file_path) await supabase.storage.from('invoices').remove([agreement.file_path])
      }
      const row = { party_id: party.id, title: f.title.trim(), brand: f.brand || null, start_date: f.start_date || null, end_date: f.end_date || null, status: f.status, terms: f.terms.trim() || null, ...filePatch }
      await write(agreement ? supabase.from('party_agreements').update(row).eq('id', agreement.id) : supabase.from('party_agreements').insert(row))
      invalidate(`party:${party.id}`, 'audit:300', 'audit:40')
      toast('Anlaşma kaydedildi')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!agreement || !(await confirm('Anlaşma ve dosyası silinsin mi?'))) return
    try {
      if (agreement.file_path) await supabase.storage.from('invoices').remove([agreement.file_path])
      await write(supabase.from('party_agreements').delete().eq('id', agreement.id))
      invalidate(`party:${party.id}`)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={agreement ? 'Anlaşmayı düzenle' : `${party.name} · yeni anlaşma`}
      footer={
        <>
          {agreement && (
            <Button type="button" variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="ag-form" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="ag-form" onSubmit={save} className="space-y-4">
        <Field label="Başlık">
          <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ör. 2027 FormStep toptan fiyat anlaşması" autoFocus required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value })}>
              <option value="">Seçilmedi</option>
              {BRANDS_WITH_GENEL.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value as PartyAgreement['status'] })}>
              {AG_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Başlangıç">
            <Input type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} />
          </Field>
          <Field label="Bitiş" hint="Süresizse boş bırakın">
            <Input type="date" value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Koşullar">
          <Textarea rows={5} value={f.terms} onChange={(e) => set({ terms: e.target.value })} placeholder="Fiyatlar, minimum adet, vade, kargo, iade koşulları…" />
        </Field>
        <Field label={agreement?.file_name ? `Dosya (şu an: ${agreement.file_name})` : 'Dosya (sözleşme, fiyat listesi)'} hint="PDF, Word, Excel ya da fotoğraf · en fazla 20 MB">
          <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </form>
    </Drawer>
  )
}
