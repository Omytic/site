'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Handshake, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS, BRANDS_WITH_GENEL, colorOf, label, type BrandOrGenel } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, useItemsWithStock, write, type Collab } from '@/lib/panel/data'
import { dateTR, norm, num, sum, tl, today } from '@/lib/panel/format'
import { LinesEditor, useOpenFromQuery, type Line } from '@/components/panel/forms'
import { LinesSummary } from '@/components/panel/LinesSummary'
import { Badge, Button, Card, cx, Drawer, Empty, Field, Input, PageHeader, Segmented, Select, Skeleton, Stat, Textarea, useUi } from '@/components/panel/ui'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', url: (h: string) => `https://instagram.com/${h}` },
  { id: 'tiktok', label: 'TikTok', url: (h: string) => `https://tiktok.com/@${h}` },
  { id: 'youtube', label: 'YouTube', url: (h: string) => `https://youtube.com/@${h}` },
  { id: 'x', label: 'X', url: (h: string) => `https://x.com/${h}` },
  { id: 'diger', label: 'Diğer', url: () => '' },
]
const STATUS = [
  { id: 'planlandi', label: 'Planlandı', tone: 'bg-[#F1F0EC] text-ink-soft' },
  { id: 'gonderildi', label: 'Gönderildi', tone: 'bg-[#eaf2fd] text-[#1d5fb0]' },
  { id: 'paylasildi', label: 'Paylaşıldı', tone: 'bg-[#e6f6ee] text-[#0a6e3a]' },
  { id: 'tamamlandi', label: 'Tamamlandı', tone: 'bg-night text-white' },
  { id: 'iptal', label: 'İptal', tone: 'bg-white text-ink-soft/50 line-through ring-1 ring-black/10' },
]
const SCOPE_CHIPS = ['1 reels', '2 reels', '1 story', '2 story', '3 story', '1 gönderi', 'TikTok video', 'YouTube video', 'Ürün yorumu']
const cleanHandle = (h: string) => h.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?[^/]+\//, '').replace(/\/.*$/, '')

export default function CollabsPage() {
  const collabs = Q.collabs()
  const items = useItemsWithStock()
  const { toast } = useUi()
  const [brand, setBrand] = useState<'all' | string>('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [form, setForm] = useState<Collab | 'new' | null>(null)
  useOpenFromQuery(() => setForm('new'))

  const byId = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data])
  const all = collabs.data ?? []
  const list = all.filter(
    (c) => (brand === 'all' || c.brand === brand) && (status === 'all' || c.status === status) && (!q || norm(`${c.person} ${c.handle ?? ''} ${c.scope ?? ''} ${c.note ?? ''}`).includes(norm(q))),
  )
  const live = all.filter((c) => c.status !== 'iptal')
  const goodsCost = (c: Collab) => sum(c.collab_items, (l) => Number(l.qty) * Number(byId.get(l.item_id)?.cost ?? 0))
  const spent = sum(live, (c) => Number(c.fee) + Number(c.shipping))
  const goods = sum(live, goodsCost)
  const units = sum(live.filter((c) => c.sent_date), (c) => sum(c.collab_items, (l) => l.qty))
  const waiting = all.filter((c) => c.status === 'gonderildi').length

  const setSt = async (c: Collab, st: string) => {
    const patch: Record<string, unknown> = { status: st }
    if (st !== 'planlandi' && st !== 'iptal' && !c.sent_date) patch.sent_date = today()
    try {
      await write(supabase.from('collaborations').update(patch).eq('id', c.id))
      invalidate(...AFTER.collabs)
      if (patch.sent_date) toast('Gönderim tarihi bugün olarak girildi; ürünler stoktan düştü.')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="İş birlikleri"
        subtitle="Ücretsiz ürün gönderdiğimiz ve anlaştığımız kişiler. Gönderilince ürünler stoktan düşer; ücret ve kargo Reklam'a gider olarak yazılır."
        actions={
          <Button variant="gold" icon={<Plus className="h-4 w-4" />} onClick={() => setForm('new')}>
            İş birliği ekle
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="İş birliği" value={num(live.length)} sub={`${num(waiting)} tanesinden paylaşım bekleniyor`} />
        <Stat label="Gönderilen ürün" value={num(units)} sub="adet, stoktan düşen" />
        <Stat label="Ödenen (ücret + kargo)" value={tl(spent)} sub="Reklam ve Finans'a yazıldı" />
        <Stat label="Toplam maliyet" value={tl(spent + goods)} sub={`ürünlerin maliyeti ${tl(goods)} dahil`} />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={brand} onChange={setBrand} options={[{ id: 'all', label: 'Hepsi' }, ...BRANDS.filter((b) => b.id !== 'diger').map((b) => ({ id: b.id, label: b.label }))]} />
            <div className="w-40">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 py-0 text-sm">
                <option value="all">Tüm durumlar</option>
                {STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi, kullanıcı adı…" className="h-9 w-full pl-9 lg:w-60" />
          </div>
        </div>
        {collabs.loading || items.loading ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : list.length === 0 ? (
          <Empty title="Henüz iş birliği yok" text="Ürün gönderdiğiniz ya da anlaştığınız kişileri ekleyin." icon={<Handshake className="h-6 w-6" />} action={<Button onClick={() => setForm('new')}>İş birliği ekle</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-ink-soft/60">
                  <th className="px-5 py-2.5">Kişi</th>
                  <th className="px-3 py-2.5">Kapsam</th>
                  <th className="px-3 py-2.5">Gönderilen</th>
                  <th className="px-3 py-2.5 text-right">Ücret</th>
                  <th className="px-3 py-2.5 text-right">Kargo</th>
                  <th className="px-3 py-2.5 text-right">Ürün maliyeti</th>
                  <th className="px-3 py-2.5">Gönderim</th>
                  <th className="px-5 py-2.5">Durum</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const pf = PLATFORMS.find((p) => p.id === c.platform)
                  const link = c.handle && pf ? pf.url(c.handle) : ''
                  const st = STATUS.find((s) => s.id === c.status) ?? STATUS[0]
                  return (
                    <tr key={c.id} className="cursor-pointer border-b border-line/60 align-top hover:bg-[#FAF9F6]" onClick={() => setForm(c)}>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2">
                          <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: colorOf(BRANDS_WITH_GENEL, c.brand) }} />
                          <span>
                            <b className="block">{c.person}</b>
                            {c.handle && (
                              <a href={link || undefined} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-ink-soft/60 hover:text-ink">
                                @{c.handle} · {pf?.label}
                              </a>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[200px] px-3 py-3 text-ink-soft">
                        {c.scope || '—'}
                        {c.post_url && (
                          <a href={c.post_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-ink hover:underline">
                            Paylaşım <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {c.note && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft/60">{c.note}</p>}
                      </td>
                      <td className="max-w-[240px] px-3 py-3">{c.collab_items.length ? <LinesSummary lines={c.collab_items} items={items.data} price={false} /> : <span className="text-ink-soft/40">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{Number(c.fee) ? tl(c.fee) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{Number(c.shipping) ? tl(c.shipping) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">{goodsCost(c) ? tl(goodsCost(c)) : '—'}</td>
                      <td className="px-3 py-3 text-ink-soft">{c.sent_date ? dateTR(c.sent_date) : <span className="text-ink-soft/40">gönderilmedi</span>}</td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <select value={c.status} onChange={(e) => setSt(c, e.target.value)} aria-label="Durum" className={cx('h-8 cursor-pointer rounded-full border-0 px-3 text-xs font-bold outline-none', st.tone)}>
                          {STATUS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <CollabForm collab={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  )
}

function CollabForm({ collab, onClose }: { collab: Collab | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const items = useItemsWithStock()
  const [f, setF] = useState({
    person: collab?.person ?? '',
    handle: collab?.handle ?? '',
    platform: collab?.platform ?? 'instagram',
    brand: (collab?.brand ?? 'seryn') as BrandOrGenel,
    phone: collab?.phone ?? '',
    scope: collab?.scope ?? '',
    fee: collab ? String(Number(collab.fee) || '') : '',
    shipping: collab ? String(Number(collab.shipping) || '') : '',
    status: collab?.status ?? 'planlandi',
    sent_date: collab?.sent_date ?? '',
    post_url: collab?.post_url ?? '',
    note: collab?.note ?? '',
  })
  const [lines, setLines] = useState<Line[]>(collab?.collab_items.map((l) => ({ item_id: l.item_id, qty: String(Number(l.qty)), price: '' })) ?? [])
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const n = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.person.trim()) return
    setBusy(true)
    const sent = f.sent_date || (['gonderildi', 'paylasildi', 'tamamlandi'].includes(f.status) ? today() : '')
    try {
      await write(
        supabase.rpc('save_collab', {
          p_header: {
            id: collab?.id ?? null,
            person: f.person.trim(),
            handle: f.handle ? cleanHandle(f.handle) : null,
            platform: f.platform,
            brand: f.brand,
            phone: f.phone || null,
            scope: f.scope || null,
            fee: n(f.fee),
            shipping: n(f.shipping),
            status: f.status,
            sent_date: sent || null,
            post_url: f.post_url || null,
            note: f.note || null,
          },
          p_lines: lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })),
        }),
      )
      invalidate(...AFTER.collabs)
      toast('Kaydedildi.')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!collab || !(await confirm('İş birliği silinsin mi?', 'Gönderilen ürünler stoğa geri eklenir, gider kaydı silinir.'))) return
    try {
      await write(supabase.from('collaborations').delete().eq('id', collab.id))
      invalidate(...AFTER.collabs)
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
      title={collab ? 'İş birliğini düzenle' : 'Yeni iş birliği'}
      footer={
        <>
          {collab && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="collab-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="collab-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kişi / hesap adı">
            <Input required value={f.person} onChange={(e) => set({ person: e.target.value })} placeholder="ör. Can Ayaz" />
          </Field>
          <Field label="Kullanıcı adı">
            <Input value={f.handle} onChange={(e) => set({ handle: e.target.value })} placeholder="@kullaniciadi" />
          </Field>
          <Field label="Platform">
            <Select value={f.platform} onChange={(e) => set({ platform: e.target.value })}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marka">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as BrandOrGenel })}>
              {BRANDS_WITH_GENEL.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id === 'genel' ? 'OMY Ticaret' : b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Kapsam (karşılığında ne yapacak?)">
          <Input value={f.scope} onChange={(e) => set({ scope: e.target.value })} placeholder="ör. 2 reels + 2 story" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SCOPE_CHIPS.map((c) => (
              <button key={c} type="button" onClick={() => set({ scope: f.scope ? `${f.scope} + ${c}` : c })} className="rounded-full bg-[#F4F3EF] px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-night hover:text-white">
                + {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Gönderilen ürünler" hint="Gönderim tarihi girilince depodan düşer">
          {items.data && <LinesEditor pickTitle="Ne gönderildi? Ürünü seçin" items={items.data} lines={lines} setLines={setLines} noPrice stockFrom={() => 'depo'} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Ödenen ücret (₺)">
            <Input inputMode="decimal" value={f.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Kargo (₺)">
            <Input inputMode="decimal" value={f.shipping} onChange={(e) => set({ shipping: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Gönderim tarihi">
            <Input type="date" value={f.sent_date} onChange={(e) => set({ sent_date: e.target.value })} />
          </Field>
          <Field label="Durum">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Telefon" className="sm:col-span-2">
            <Input inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Paylaşım bağlantısı">
          <Input value={f.post_url} onChange={(e) => set({ post_url: e.target.value })} placeholder="https://instagram.com/reel/…" />
        </Field>
        <Field label="Notlar" hint="anlaşma detayı, sonuç, tekrar çalışılır mı…">
          <Textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        <p className="rounded-xl bg-[#F7F6F2] p-3 text-xs leading-relaxed text-ink-soft">
          Ücret + kargo toplamı ({tl(n(f.fee) + n(f.shipping))}) Reklam sayfasına “{label([{ id: 'isbirligi', label: 'İş birliği' }], 'isbirligi')}” gideri olarak, oradan da Finans'a yazılır. İptal edilirse gider ve stok düşüşü geri alınır.
        </p>
      </form>
    </Drawer>
  )
}
