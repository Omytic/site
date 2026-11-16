'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Inbox, Mail, MessageCircle, Phone, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/panel/auth'
import { BRANDS_WITH_GENEL, label, type BrandOrGenel } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, useItemsWithStock, write, type Lead } from '@/lib/panel/data'
import { dateTR, monthKey, norm, num, relTime, today } from '@/lib/panel/format'
import { LinesEditor, useOpenFromQuery, type Line } from '@/components/panel/forms'
import { LinesSummary } from '@/components/panel/LinesSummary'
import { Button, Card, cx, Drawer, Empty, Field, Input, PageHeader, Select, Skeleton, Stat, Textarea, UserDot, useUi } from '@/components/panel/ui'

const STATUS = [
  { id: 'yeni', label: 'Yeni', tone: 'bg-[#E3AB3B] text-night' },
  { id: 'gorusuldu', label: 'Görüşüldü', tone: 'bg-[#eaf2fd] text-[#1d5fb0]' },
  { id: 'teklif', label: 'Teklif verildi', tone: 'bg-[#f3e8fb] text-[#7a3aa8]' },
  { id: 'numune', label: 'Numune gönderildi', tone: 'bg-[#fff4d6] text-[#8a5a00]' },
  { id: 'kazanildi', label: 'Kazanıldı', tone: 'bg-[#e6f6ee] text-[#0a6e3a]' },
  { id: 'kaybedildi', label: 'Olmadı', tone: 'bg-white text-ink-soft/50 ring-1 ring-black/10' },
]
const KINDS = [
  { id: 'toptan', label: 'Toptan teklif' },
  { id: 'bayi', label: 'Bayilik' },
  { id: 'numune', label: 'Numune' },
  { id: 'isbirligi', label: 'İş birliği' },
  { id: 'diger', label: 'Diğer' },
]
const SOURCES = [
  { id: 'site', label: 'Site formu' },
  { id: 'fuar', label: 'Fuar' },
  { id: 'telefon', label: 'Telefon' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'eposta', label: 'E-posta' },
  { id: 'diger', label: 'Diğer' },
]
const OPEN = ['yeni', 'gorusuldu', 'teklif', 'numune']
const wa = (p: string) => `https://wa.me/${p.replace(/\D/g, '').replace(/^0/, '90')}`

export default function LeadsPage() {
  const leads = Q.leads()
  const fairs = Q.fairs()
  const items = useItemsWithStock()
  const { byId } = useAuth()
  const { toast } = useUi()
  const [status, setStatus] = useState<'acik' | string>('acik')
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Lead | 'new' | null>(null)
  useOpenFromQuery(() => setForm('new'))

  const all = leads.data ?? []
  const fairName = (id: string | null) => (fairs.data ?? []).find((f) => f.id === id)?.name
  const list = all.filter(
    (l) =>
      (status === 'acik' ? OPEN.includes(l.status) : status === 'all' || l.status === status) &&
      (kind === 'all' || l.kind === kind) &&
      (!q || norm(`${l.name} ${l.company ?? ''} ${l.phone ?? ''} ${l.email ?? ''} ${l.city ?? ''} ${l.message ?? ''}`).includes(norm(q))),
  )
  const t = today()
  const count = (s: string) => all.filter((l) => l.status === s).length

  const setSt = async (l: Lead, st: string) => {
    try {
      await write(supabase.from('leads').update({ status: st }).eq('id', l.id))
      invalidate(...AFTER.leads)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Talepler"
        subtitle="Siteden gelen teklif ve numune istekleri, fuarda tanıştıklarımız, arayanlar. Kimden cevap bekleniyor, kime numune gitti burada."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setForm('new')}>
            Talep ekle
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cevap bekleyen" value={num(count('yeni'))} sub="yeni gelen, henüz dönülmedi" />
        <Stat label="Süren görüşme" value={num(count('gorusuldu') + count('teklif') + count('numune'))} sub={`${num(all.filter((l) => OPEN.includes(l.status) && l.next_date && l.next_date <= t).length)} tanesinde arama günü geldi`} />
        <Stat label="Bu ay gelen" value={num(all.filter((l) => monthKey(l.created_at) === monthKey(t)).length)} />
        <Stat label="Kazanılan" value={num(count('kazanildi'))} sub={all.length ? `%${Math.round((count('kazanildi') / Math.max(1, count('kazanildi') + count('kaybedildi'))) * 100)} dönüşüm (kapananlarda)` : undefined} />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {[{ id: 'acik', label: 'Açık olanlar' }, ...STATUS, { id: 'all', label: 'Hepsi' }].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatus(s.id)}
                className={cx('rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition', status === s.id ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
              >
                {s.label}
                {s.id !== 'acik' && s.id !== 'all' && <span className="ml-1 opacity-60">{count(s.id)}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="w-36">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 py-0 text-sm">
                <option value="all">Tüm türler</option>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, firma, telefon…" className="h-9 w-full pl-9 lg:w-56" />
            </div>
          </div>
        </div>
        {leads.loading ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : list.length === 0 ? (
          <Empty title="Talep yok" text="Siteden gelen formlar ve fuarda eklediğiniz kişiler burada görünür." icon={<Inbox className="h-6 w-6" />} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((l) => {
              const st = STATUS.find((s) => s.id === l.status) ?? STATUS[0]
              const late = OPEN.includes(l.status) && l.next_date && l.next_date <= t
              const owner = byId(l.owner)
              return (
                <li key={l.id} className="flex cursor-pointer flex-col gap-3 px-5 py-4 hover:bg-[#FAF9F6] md:flex-row md:items-start" onClick={() => setForm(l)}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <b className="text-ink">{l.company || l.name}</b>
                      {l.company && <span className="text-sm text-ink-soft">{l.name}</span>}
                      <span className="rounded-full bg-[#F4F3EF] px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{label(KINDS, l.kind)}</span>
                      {l.brand && <span className="text-[11px] font-semibold text-ink-soft/60">{label(BRANDS_WITH_GENEL, l.brand)}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft/60">
                      {label(SOURCES, l.source)}
                      {l.fair_id && fairName(l.fair_id) ? `: ${fairName(l.fair_id)}` : ''} · {relTime(l.created_at)}
                      {l.city ? ` · ${l.city}` : ''}
                    </p>
                    {l.message && <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{l.message}</p>}
                    {l.lead_items.length > 0 && (
                      <div className="mt-1.5 text-xs">
                        <span className="font-semibold text-ink-soft/60">İstenen numune: </span>
                        <LinesSummary lines={l.lead_items} items={items.data} price={false} className="inline-block align-top" />
                        {l.sample_sent_at && <span className="ml-1 font-semibold text-[#0a6e3a]">· {dateTR(l.sample_sent_at)} gönderildi</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end" onClick={(e) => e.stopPropagation()}>
                    <select value={l.status} onChange={(e) => setSt(l, e.target.value)} aria-label="Durum" className={cx('h-8 cursor-pointer rounded-full border-0 px-3 text-xs font-bold outline-none', st.tone)}>
                      {STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      {l.phone && (
                        <>
                          <a href={`tel:${l.phone}`} className="rounded-lg p-1.5 text-ink-soft/60 ring-1 ring-black/10 hover:text-ink" aria-label="Ara">
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                          <a href={wa(l.phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-ink-soft/60 ring-1 ring-black/10 hover:text-[#128c4b]" aria-label="WhatsApp">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        </>
                      )}
                      {l.email && (
                        <a href={`mailto:${l.email}`} className="rounded-lg p-1.5 text-ink-soft/60 ring-1 ring-black/10 hover:text-ink" aria-label="E-posta">
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {owner && <UserDot name={owner.full_name} color={owner.color ?? undefined} />}
                    </div>
                    {l.next_date && OPEN.includes(l.status) && <span className={cx('text-[11px] font-semibold', late ? 'text-[#b83030]' : 'text-ink-soft/55')}>{late ? 'Aranacaktı: ' : 'Sonraki adım: '}{dateTR(l.next_date)}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {form && <LeadForm lead={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  )
}

function LeadForm({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const { profiles } = useAuth()
  const items = useItemsWithStock()
  const fairs = Q.fairs()
  const [f, setF] = useState({
    name: lead?.name ?? '',
    company: lead?.company ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    city: lead?.city ?? '',
    address: lead?.address ?? '',
    kind: lead?.kind ?? 'toptan',
    source: lead?.source ?? 'telefon',
    brand: (lead?.brand ?? '') as BrandOrGenel | '',
    status: lead?.status ?? 'yeni',
    owner: lead?.owner ?? '',
    next_date: lead?.next_date ?? '',
    fair_id: lead?.fair_id ?? '',
    sample_sent_at: lead?.sample_sent_at ?? '',
    message: lead?.message ?? '',
    note: lead?.note ?? '',
  })
  const [lines, setLines] = useState<Line[]>(lead?.lead_items.map((l) => ({ item_id: l.item_id, qty: String(Number(l.qty)), price: '' })) ?? [])
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await write(
        supabase.rpc('save_lead', {
          p_header: {
            id: lead?.id ?? null,
            ...f,
            company: f.company || null,
            phone: f.phone || null,
            email: f.email || null,
            city: f.city || null,
            address: f.address || null,
            brand: f.brand || null,
            owner: f.owner || null,
            next_date: f.next_date || null,
            fair_id: f.fair_id || null,
            sample_sent_at: f.sample_sent_at || null,
            message: f.message || null,
            note: f.note || null,
            status: f.sample_sent_at && ['yeni', 'gorusuldu'].includes(f.status) ? 'numune' : f.status,
          },
          p_lines: lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })),
        }),
      )
      invalidate(...AFTER.leads)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!lead || !(await confirm('Talep silinsin mi?', 'Numune gönderildiyse ürünler stoğa geri eklenir.'))) return
    try {
      await write(supabase.from('leads').delete().eq('id', lead.id))
      invalidate(...AFTER.leads)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={lead ? 'Talep' : 'Yeni talep'}
      footer={
        <>
          {lead && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="lead-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="lead-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ad soyad">
            <Input required value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Firma">
            <Input value={f.company} onChange={(e) => set({ company: e.target.value })} />
          </Field>
          <Field label="Telefon">
            <Input inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="E-posta">
            <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Ne istiyor?">
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as BrandOrGenel })}>
              <option value="">—</option>
              {BRANDS_WITH_GENEL.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id === 'genel' ? 'Genel' : b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nereden geldi?">
            <Select value={f.source} onChange={(e) => set({ source: e.target.value })}>
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          {f.source === 'fuar' ? (
            <Field label="Hangi fuar?">
              <Select value={f.fair_id} onChange={(e) => set({ fair_id: e.target.value })}>
                <option value="">—</option>
                {(fairs.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({dateTR(x.start_date)})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Şehir">
              <Input value={f.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Mesaj / ne istedi?">
          <Textarea rows={3} value={f.message} onChange={(e) => set({ message: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kim ilgileniyor?">
            <Select value={f.owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sonraki adım günü">
            <Input type="date" value={f.next_date} onChange={(e) => set({ next_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Numune" hint="Gönderim tarihi girince ürünler depodan “numune” olarak düşer">
          {items.data && <LinesEditor pickTitle="Hangi numuneler? Ürünü seçin" items={items.data} lines={lines} setLines={setLines} noPrice stockFrom={() => 'depo'} />}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Numune gönderim tarihi">
              <Input type="date" value={f.sample_sent_at} onChange={(e) => set({ sample_sent_at: e.target.value })} />
            </Field>
            <Field label="Adres">
              <Input value={f.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
        </Field>
        <Field label="Notlar (iç)">
          <Textarea rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="ör. fiyat listesi gönderildi, haftaya tekrar ara" />
        </Field>
        {lead?.fair_id && (
          <p className="text-xs text-ink-soft/60">
            Fuarda tanışıldı: <Link className="font-semibold underline" href={`/admin/fuarlar/${lead.fair_id}`}>fuar sayfası</Link>
          </p>
        )}
      </form>
    </Drawer>
  )
}
