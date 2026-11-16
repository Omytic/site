'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, BarChart3, CalendarDays, ExternalLink, MapPin, Pencil, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, useLocalState, write, type Fair } from '@/lib/panel/data'
import { daysBetween, num, tl, today } from '@/lib/panel/format'
import { useOpenFromQuery } from '@/components/panel/forms'
import { Button, Card, cx, Drawer, Empty, ErrorNote, Field, Input, PageHeader, Segmented, Select, Skeleton, Stat, Textarea, useUi } from '@/components/panel/ui'

const FAIR_CATEGORIES = [
  { id: 'hac-helal', label: 'Hac, umre, helal' },
  { id: 'kozmetik', label: 'Kozmetik' },
  { id: 'saglik', label: 'Sağlık, medikal' },
  { id: 'spor', label: 'Spor, outdoor' },
  { id: 'ayakkabi', label: 'Ayakkabı' },
  { id: 'tekstil', label: 'Tekstil, kumaş' },
  { id: 'mobilya', label: 'Mobilya, döşeme' },
  { id: 'otomotiv', label: 'Otomotiv' },
  { id: 'perakende', label: 'Perakende, e-ticaret' },
  { id: 'turizm', label: 'Turizm' },
  { id: 'diger', label: 'Diğer' },
]
const FAIR_STATUS: { id: string; label: string; tone: string }[] = [
  { id: 'izle', label: 'Takipte', tone: 'bg-[#F1F0EC] text-ink-soft' },
  { id: 'dusunuyoruz', label: 'Düşünüyoruz', tone: 'bg-[#eaf2fd] text-[#1d5fb0]' },
  { id: 'basvurduk', label: 'Başvurduk', tone: 'bg-[#fff4d6] text-[#8a5a00]' },
  { id: 'stand', label: 'Gidiyoruz (stand)', tone: 'bg-[#E3AB3B] text-night' },
  { id: 'ziyaret', label: 'Gidiyoruz (ziyaret)', tone: 'bg-[#e6f6ee] text-[#0a6e3a]' },
  { id: 'katildik', label: 'Katıldık', tone: 'bg-night text-white' },
  { id: 'gecildi', label: 'Geçtik', tone: 'bg-white text-ink-soft/50 line-through ring-1 ring-black/10' },
]
const PRIORITY = { yuksek: { label: 'Çok uygun', dot: 'bg-[#1baf7a]' }, orta: { label: 'Uygun', dot: 'bg-[#eda100]' }, dusuk: { label: 'Belki', dot: 'bg-[#c7c4bb]' } }
const GOING = ['stand', 'ziyaret', 'basvurduk', 'katildik']
const statusOf = (id: string) => FAIR_STATUS.find((s) => s.id === id) ?? FAIR_STATUS[0]
const catLabel = (id: string) => FAIR_CATEGORIES.find((c) => c.id === id)?.label ?? id
const norm = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '')

const fmtRange = (a: string, b: string) => {
  const A = new Date(a + 'T00:00:00')
  const B = new Date(b + 'T00:00:00')
  const m = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'short' })
  return A.getMonth() === B.getMonth() ? `${A.getDate()}–${B.getDate()} ${m(B)}` : `${A.getDate()} ${m(A)} – ${B.getDate()} ${m(B)}`
}

export default function FairsPage() {
  const fairs = Q.fairs()
  const { toast } = useUi()
  const [brand, setBrand] = useLocalState<'all' | string>('omy-fuar-marka', 'all')
  const [cat, setCat] = useLocalState<string>('omy-fuar-kategori', 'all')
  const [onlyTop, setOnlyTop] = useLocalState('omy-fuar-yuksek', false)
  const [mine, setMine] = useLocalState('omy-fuar-bizimkiler', false)
  const [past, setPast] = useState(false)
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Fair | 'new' | null>(null)
  useOpenFromQuery(() => setForm('new'))

  const t = today()
  const all = fairs.data ?? []
  const list = useMemo(
    () =>
      all.filter(
        (f) =>
          (past ? f.end_date < t : f.end_date >= t) &&
          (brand === 'all' || f.brands.includes(brand)) &&
          (cat === 'all' || f.category === cat) &&
          (!onlyTop || f.priority === 'yuksek') &&
          (!mine || ['dusunuyoruz', 'basvurduk', 'stand', 'ziyaret', 'katildik'].includes(f.status)) &&
          (!q || norm(`${f.name} ${f.city ?? ''} ${f.organizer ?? ''} ${f.why ?? ''}`).includes(norm(q))),
      ),
    [all, brand, cat, onlyTop, mine, past, q, t],
  )
  const ordered = past ? [...list].reverse() : list
  const months = useMemo(() => {
    const m = new Map<string, Fair[]>()
    ordered.forEach((f) => m.set(f.start_date.slice(0, 7), [...(m.get(f.start_date.slice(0, 7)) ?? []), f]))
    return Array.from(m.entries())
  }, [ordered])

  const upcoming = all.filter((f) => f.end_date >= t && f.status !== 'gecildi')
  const next = upcoming.find((f) => ['stand', 'ziyaret', 'basvurduk'].includes(f.status)) ?? upcoming.find((f) => f.priority === 'yuksek')
  const in90 = upcoming.filter((f) => daysBetween(t, f.start_date) <= 90)
  const going = upcoming.filter((f) => ['stand', 'ziyaret', 'basvurduk'].includes(f.status))
  const year = t.slice(0, 4)
  const spent = all.filter((f) => f.start_date.startsWith(year) || f.start_date.startsWith(String(Number(year) + 1))).reduce((a, f) => a + Number(f.cost ?? 0), 0)

  const setStatus = async (f: Fair, status: string) => {
    try {
      await write(supabase.from('fairs').update({ status }).eq('id', f.id))
      invalidate(...AFTER.fairs)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Fuarlar"
        subtitle="SERYN, FormStep ve kumaşla ilgili Türkiye fuarları. Durumu “Gidiyoruz” yapınca fuarın kendi sayfası açılır: kasa, giderler, götürülen ürünler."
        actions={
          <>
            <Link href="/admin/fuarlar/analiz" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold ring-1 ring-black/10 hover:ring-black/25">
              <BarChart3 className="h-4 w-4" /> Fuar analizleri
            </Link>
            <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setForm('new')}>
              Fuar ekle
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl bg-night p-5 text-white lg:col-span-1">
          <p className="text-sm text-white/60">Sıradaki önemli fuar</p>
          {next ? (
            <>
              <p className="mt-1 line-clamp-2 font-display text-lg font-black leading-tight">{next.name}</p>
              <p className="mt-1 text-sm text-thread-soft">
                {daysBetween(t, next.start_date) <= 0 ? 'Şu an devam ediyor' : `${num(daysBetween(t, next.start_date))} gün kaldı`} · {fmtRange(next.start_date, next.end_date)}
              </p>
            </>
          ) : (
            <p className="mt-1 font-semibold">—</p>
          )}
        </div>
        <Stat label="Önümüzdeki 90 gün" value={num(in90.length)} sub="fuar" />
        <Stat label="Gidiyoruz / başvurduk" value={num(going.length)} sub="stand, ziyaret ya da başvuru" />
        <Stat label="Fuar harcaması" value={tl(spent)} sub={`${year}–${Number(year) + 1}, girilen masraflar`} />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={brand} onChange={setBrand} options={[{ id: 'all', label: 'Hepsi' }, ...BRANDS.filter((b) => b.id !== 'diger').map((b) => ({ id: b.id, label: b.label }))]} />
            <div className="w-44"><Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 py-0 text-sm">
              <option value="all">Tüm konular</option>
              {FAIR_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select></div>
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <input type="checkbox" checked={onlyTop} onChange={(e) => setOnlyTop(e.target.checked)} className="h-4 w-4 accent-[#0E1527]" />
              Sadece çok uygun
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-[#0E1527]" />
              Sadece ilgilendiklerimiz
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={past ? 'gecmis' : 'yaklasan'} onChange={(v) => setPast(v === 'gecmis')} options={[{ id: 'yaklasan', label: 'Yaklaşan' }, { id: 'gecmis', label: 'Geçmiş' }]} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fuar, şehir…" className="h-9 w-full pl-9 lg:w-56" />
            </div>
          </div>
        </div>

        {fairs.error ? (
          <div className="p-5">
            <ErrorNote message={fairs.error.includes('fairs') ? 'Fuar tablosu henüz kurulmamış. Supabase’de fuar SQL’ini çalıştırın.' : fairs.error} />
          </div>
        ) : fairs.loading ? (
          <div className="p-5">
            <Skeleton className="h-64" />
          </div>
        ) : months.length === 0 ? (
          <Empty title="Bu filtreye uyan fuar yok" text="Filtreleri değiştirin ya da yeni fuar ekleyin." />
        ) : (
          <div>
            {months.map(([mk, rows]) => (
              <section key={mk}>
                <h3 className="sticky top-[64px] z-[1] border-b border-line bg-[#FAF9F6]/95 px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft/60 backdrop-blur">
                  {new Date(mk + '-01T00:00:00').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} · {rows.length} fuar
                </h3>
                <ul>
                  {rows.map((f) => {
                    const st = statusOf(f.status)
                    const d = daysBetween(t, f.start_date)
                    const live = f.start_date <= t && f.end_date >= t
                    return (
                      <li key={f.id} className={cx('flex flex-col gap-3 border-b border-line/70 px-5 py-4 sm:flex-row sm:items-start', f.status === 'gecildi' && 'opacity-55')}>
                        <div className="flex w-full shrink-0 items-center gap-3 sm:w-[132px] sm:flex-col sm:items-start sm:gap-1">
                          <span className="font-display text-[15px] font-black text-ink">{fmtRange(f.start_date, f.end_date)}</span>
                          {!past && (
                            <span className={cx('text-xs font-semibold', live ? 'text-[#0a7d0a]' : d <= 30 ? 'text-[#b26b00]' : 'text-ink-soft/55')}>
                              {live ? 'Şu an devam ediyor' : `${num(d)} gün sonra`}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <span className={cx('mt-[7px] h-2 w-2 shrink-0 rounded-full', PRIORITY[f.priority].dot)} title={PRIORITY[f.priority].label} />
                            {GOING.includes(f.status) ? (
                              <Link href={`/admin/fuarlar/${f.id}`} className="font-bold leading-snug text-ink underline decoration-thread decoration-2 underline-offset-4 hover:decoration-ink">
                                {f.name}
                              </Link>
                            ) : (
                              <p className="font-bold leading-snug text-ink">{f.name}</p>
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft/65">
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {[f.city, f.venue].filter(Boolean).join(' · ') || '—'}
                            </span>
                            <span>{catLabel(f.category)}</span>
                            {f.website && (
                              <a href={f.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold text-ink-soft hover:text-ink">
                                Sitesi <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </p>
                          {f.why && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{f.why}</p>}
                          {f.note && <p className="mt-1.5 rounded-lg bg-[#FFF8E6] px-2.5 py-1.5 text-[12.5px] text-[#6b4a00]">{f.note}</p>}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {f.brands.map((b) => {
                              const br = BRANDS.find((x) => x.id === b)
                              return (
                                <span key={b} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-black/[0.08]">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: br?.color }} />
                                  {br?.label ?? b}
                                </span>
                              )
                            })}
                            {(f.cost || f.contacts) && (
                              <span className="rounded-full bg-[#F1F0EC] px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                                {[f.cost ? `${tl(f.cost)} harcandı` : '', f.contacts ? `${num(f.contacts)} kişiyle görüşüldü` : ''].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                          <select
                            value={f.status}
                            onChange={(e) => setStatus(f, e.target.value)}
                            aria-label="Durum"
                            className={cx('h-8 cursor-pointer rounded-full border-0 px-3 text-xs font-bold outline-none', st.tone)}
                          >
                            {FAIR_STATUS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          {GOING.includes(f.status) && (
                            <Link href={`/admin/fuarlar/${f.id}`} className="inline-flex items-center gap-1 rounded-full bg-night px-3 py-1.5 text-xs font-bold text-white hover:bg-black">
                              Fuar sayfası <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          <button type="button" onClick={() => setForm(f)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft/60 hover:bg-[#F4F3EF] hover:text-ink">
                            <Pencil className="h-3.5 w-3.5" /> Düzenle
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft/55">
        <CalendarDays className="h-3.5 w-3.5" /> Kaynak: TOBB Ana Fuar Takvimi (fuarlar.tobb.org.tr). Yeşil nokta: ürünlerimize çok uygun, sarı: uygun, gri: belki.
      </p>

      {form && <FairForm fair={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  )
}

function FairForm({ fair, onClose }: { fair: Fair | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    name: fair?.name ?? '',
    start_date: fair?.start_date ?? today(),
    end_date: fair?.end_date ?? today(),
    city: fair?.city ?? '',
    venue: fair?.venue ?? '',
    organizer: fair?.organizer ?? '',
    website: fair?.website ?? '',
    category: fair?.category ?? 'diger',
    brands: fair?.brands ?? ([] as string[]),
    priority: fair?.priority ?? 'orta',
    status: fair?.status ?? 'izle',
    why: fair?.why ?? '',
    note: fair?.note ?? '',
    budget: fair?.budget?.toString() ?? '',
    cost: fair?.cost?.toString() ?? '',
    contacts: fair?.contacts?.toString() ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.end_date < f.start_date) return toast('Bitiş tarihi başlangıçtan önce olamaz.', 'error')
    setBusy(true)
    const site = f.website.trim()
    const row = {
      ...f,
      city: f.city || null,
      venue: f.venue || null,
      organizer: f.organizer || null,
      website: site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : null,
      why: f.why || null,
      note: f.note || null,
      budget: numOrNull(f.budget),
      cost: numOrNull(f.cost),
      contacts: numOrNull(f.contacts),
      ...(fair ? {} : { source: 'Elle eklendi' }),
    }
    try {
      await write(fair ? supabase.from('fairs').update(row).eq('id', fair.id) : supabase.from('fairs').insert(row))
      invalidate(...AFTER.fairs)
      toast('Kaydedildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!fair || !(await confirm('Fuar listeden silinsin mi?', 'İlgilenmiyorsanız silmek yerine durumu "Geçtik" yapabilirsiniz.'))) return
    try {
      await write(supabase.from('fairs').delete().eq('id', fair.id))
      invalidate(...AFTER.fairs)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={fair ? 'Fuarı düzenle' : 'Yeni fuar'}
      footer={
        <>
          {fair && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="fair-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="fair-form" onSubmit={save} className="space-y-4">
        <Field label="Fuarın adı">
          <Input required value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlangıç">
            <Input type="date" required value={f.start_date} onChange={(e) => set({ start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date })} />
          </Field>
          <Field label="Bitiş">
            <Input type="date" required value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} />
          </Field>
          <Field label="Şehir">
            <Input value={f.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="Yer">
            <Input value={f.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="ör. İstanbul Fuar Merkezi" />
          </Field>
          <Field label="Düzenleyen">
            <Input value={f.organizer} onChange={(e) => set({ organizer: e.target.value })} />
          </Field>
          <Field label="Web sitesi">
            <Input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="ornek.com" />
          </Field>
          <Field label="Konu">
            <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
              {FAIR_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ne kadar uygun?">
            <Select value={f.priority} onChange={(e) => set({ priority: e.target.value as Fair['priority'] })}>
              <option value="yuksek">Çok uygun</option>
              <option value="orta">Uygun</option>
              <option value="dusuk">Belki</option>
            </Select>
          </Field>
        </div>
        <Field label="Hangi markalar için?">
          <div className="flex flex-wrap gap-2">
            {BRANDS.filter((b) => b.id !== 'diger').map((b) => {
              const on = f.brands.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => set({ brands: on ? f.brands.filter((x) => x !== b.id) : [...f.brands, b.id] })}
                  className={cx('flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition', on ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25')}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                  {b.label}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Neden işimize yarar?">
          <Textarea rows={2} value={f.why} onChange={(e) => set({ why: e.target.value })} />
        </Field>
        <Field label="Durum">
          <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {FAIR_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bütçe (₺)">
            <Input inputMode="decimal" value={f.budget} onChange={(e) => set({ budget: e.target.value })} />
          </Field>
          <Field label="Harcanan (₺)" hint="stand, yol, konaklama">
            <Input inputMode="decimal" value={f.cost} onChange={(e) => set({ cost: e.target.value })} />
          </Field>
          <Field label="Görüşülen kişi">
            <Input inputMode="numeric" value={f.contacts} onChange={(e) => set({ contacts: e.target.value })} />
          </Field>
        </div>
        <Field label="Notlar" hint="başvuru son tarihi, stand fiyatı, kiminle görüşüldü…">
          <Textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}
