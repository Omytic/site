'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, FileText, Paperclip, Search, Sparkles, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS_WITH_GENEL, colorOf, label, type BrandOrGenel } from '@/lib/panel/constants'
import { AFTER, invalidate, Q, write, type Invoice } from '@/lib/panel/data'
import { dateTR, monthKey, monthLabel, norm, num, sum, tl, today } from '@/lib/panel/format'
import { useOpenFromQuery } from '@/components/panel/forms'
import { PartyNameInput } from '@/components/panel/parties'
import { Badge, Button, Card, cx, Drawer, Empty, Field, Input, PageHeader, Select, Skeleton, Stat, Textarea, useUi } from '@/components/panel/ui'

const KINDS = [
  { id: 'satis', label: 'Satış faturası', color: '#1baf7a' },
  { id: 'alis', label: 'Alış faturası', color: '#2a78d6' },
  { id: 'gider', label: 'Gider faturası', color: '#E3AB3B' },
  { id: 'iade', label: 'İade faturası', color: '#d03b3b' },
]
type SortKey = 'inv_date' | 'amount' | 'counterparty' | 'kind' | 'issuer' | 'number'
const BUCKET = 'invoices'
const safe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)

export default function InvoicesPage() {
  const invoices = Q.invoices()
  const { toast } = useUi()
  const [kind, setKind] = useState('all')
  const [issuer, setIssuer] = useState('all')
  const [month, setMonth] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'inv_date', dir: -1 })
  const [form, setForm] = useState<Invoice | 'new' | null>(null)
  const [drag, setDrag] = useState(false)
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const [preset, setPreset] = useState('')
  useOpenFromQuery((p) => {
    setPreset(p.get('cari') ?? '')
    setForm('new')
  })

  const all = invoices.data ?? []
  const issuers = Array.from(new Set(all.map((i) => i.issuer).filter(Boolean))) as string[]
  const months = Array.from(new Set(all.map((i) => monthKey(i.inv_date)))).sort().reverse()
  const list = useMemo(() => {
    const l = all.filter(
      (i) =>
        (kind === 'all' || i.kind === kind) &&
        (issuer === 'all' || i.issuer === issuer) &&
        (month === 'all' || monthKey(i.inv_date) === month) &&
        (!q || norm(`${i.counterparty ?? ''} ${i.number ?? ''} ${i.note ?? ''} ${i.file_name ?? ''}`).includes(norm(q))),
    )
    return [...l].sort((a, b) => {
      const A = a[sort.key] ?? ''
      const B = b[sort.key] ?? ''
      const c = typeof A === 'number' || typeof B === 'number' ? Number(A) - Number(B) : String(A).localeCompare(String(B), 'tr')
      return c * sort.dir
    })
  }, [all, kind, issuer, month, q, sort])

  const mk = monthKey(today())
  const thisMonth = all.filter((i) => monthKey(i.inv_date) === mk)
  const sales = sum(thisMonth.filter((i) => i.kind === 'satis'), (i) => i.amount ?? 0) - sum(thisMonth.filter((i) => i.kind === 'iade'), (i) => i.amount ?? 0)
  const buys = sum(thisMonth.filter((i) => i.kind === 'alis' || i.kind === 'gider'), (i) => i.amount ?? 0)
  const missingFile = all.filter((i) => !i.file_path).length

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.size > 0)
    if (!arr.length) return
    setUploading(arr.length)
    let ok = 0
    for (const file of arr) {
      if (file.size > 20 * 1024 * 1024) {
        toast(`${file.name}: 20 MB'tan büyük`, 'error')
        continue
      }
      const d = today()
      const path = `${d.slice(0, 4)}/${d.slice(5, 7)}/${crypto.randomUUID()}-${safe(file.name)}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (error) {
        toast(`${file.name}: ${error.message}`, 'error')
        continue
      }
      try {
        await write(supabase.from('invoices').insert({ inv_date: d, kind: 'satis', file_path: path, file_name: file.name, file_size: file.size }))
        ok++
      } catch (e: any) {
        toast(e.message, 'error')
      }
      setUploading((n) => n - 1)
    }
    setUploading(0)
    invalidate(...AFTER.invoices)
    if (ok) toast(`${ok} dosya yüklendi. Tarih, tutar ve karşı tarafı satıra tıklayıp doldurun.`)
  }

  const open = async (i: Invoice) => {
    if (!i.file_path) return
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(i.file_path, 120)
    if (error || !data) return toast(error?.message ?? 'Dosya açılamadı', 'error')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={cx('px-3 py-2.5', right && 'text-right')}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : k === 'inv_date' || k === 'amount' ? -1 : 1 }))} className={cx('inline-flex items-center gap-1 hover:text-ink', sort.key === k && 'text-ink')}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )

  return (
    <>
      <PageHeader
        title="Faturalar"
        subtitle="Kestiğimiz ve aldığımız bütün faturalar tek yerde. Şimdilik PDF'leri buraya yükleyin; fatura sistemleri bağlanınca kendiliğinden gelecek."
        actions={
          <>
            <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => setForm('new')}>
              Elle ekle
            </Button>
            <Button variant="gold" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()} loading={uploading > 0}>
              Dosya yükle
            </Button>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.xml,.html,.zip,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`${monthLabel(mk, true)} satış faturaları`} value={tl(sales)} sub="iadeler düşülmüş" />
        <Stat label="Alış ve gider faturaları" value={tl(buys)} sub="bu ay" />
        <Stat label="Bu ay fatura" value={num(thisMonth.length)} sub={`toplam ${num(all.length)}`} />
        <Stat label="Dosyası eksik" value={num(missingFile)} sub="PDF yüklenmemiş kayıt" />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          uploadFiles(e.dataTransfer.files)
        }}
        onClick={() => fileRef.current?.click()}
        className={cx('mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-5 text-sm transition', drag ? 'border-thread bg-[#FFF8E6] text-ink' : 'border-black/10 text-ink-soft/60 hover:border-black/25')}
      >
        <Upload className="h-5 w-5" />
        {uploading ? `${uploading} dosya yükleniyor…` : 'Fatura PDF’lerini buraya sürükleyin ya da tıklayın (birden çok dosya olur)'}
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              { v: kind, set: setKind, opts: [{ id: 'all', label: 'Tüm türler' }, ...KINDS] },
              { v: issuer, set: setIssuer, opts: [{ id: 'all', label: 'Tüm sistemler' }, ...issuers.map((x) => ({ id: x, label: x }))] },
              { v: month, set: setMonth, opts: [{ id: 'all', label: 'Tüm aylar' }, ...months.map((m) => ({ id: m, label: monthLabel(m, true) }))] },
            ].map((s, i) => (
              <div key={i} className="w-40">
                <Select value={s.v} onChange={(e) => s.set(e.target.value)} className="h-9 py-0 text-sm">
                  {s.opts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Firma, fatura no…" className="h-9 w-full pl-9 lg:w-60" />
          </div>
        </div>
        {invoices.loading ? (
          <div className="p-5">
            <Skeleton className="h-48" />
          </div>
        ) : list.length === 0 ? (
          <Empty title="Fatura yok" text="Dosya yükleyin ya da elle ekleyin." icon={<FileText className="h-6 w-6" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-ink-soft/60">
                  <Th k="inv_date">Tarih</Th>
                  <Th k="kind">Tür</Th>
                  <Th k="counterparty">Karşı taraf</Th>
                  <Th k="number">Fatura no</Th>
                  <Th k="issuer">Kesen sistem</Th>
                  <Th k="amount" right>
                    Tutar
                  </Th>
                  <th className="px-3 py-2.5 text-right">KDV</th>
                  <th className="px-5 py-2.5">Dosya</th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} onClick={() => setForm(i)} className="cursor-pointer border-b border-line/60 hover:bg-[#FAF9F6]">
                    <td className="whitespace-nowrap px-3 py-2.5">{dateTR(i.inv_date)}</td>
                    <td className="px-3 py-2.5">
                      <Badge color={colorOf(KINDS, i.kind)}>{label(KINDS, i.kind)}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <b>{i.counterparty || <span className="font-normal text-ink-soft/40">doldurulmadı</span>}</b>
                      {i.brand && <span className="ml-2 text-xs text-ink-soft/55">{label(BRANDS_WITH_GENEL, i.brand)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{i.number || '—'}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{i.issuer || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">{i.amount != null ? tl(i.amount, true) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{i.vat != null ? tl(i.vat, true) : '—'}</td>
                    <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {i.file_path ? (
                        <button type="button" onClick={() => open(i)} className="inline-flex max-w-[180px] items-center gap-1 truncate text-xs font-semibold text-ink hover:underline">
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{i.file_name ?? 'Aç'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-ink-soft/40">yok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={5} className="px-3 py-3 text-right text-xs text-ink-soft/60">
                    {num(list.length)} fatura
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{tl(sum(list, (i) => (i.kind === 'iade' ? -(i.amount ?? 0) : i.amount ?? 0)), true)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{tl(sum(list, (i) => i.vat ?? 0), true)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      {form && <InvoiceForm invoice={form === 'new' ? null : form} preset={form === 'new' ? preset : ''} issuers={issuers} onClose={() => (setForm(null), setPreset(''))} onOpen={open} />}
    </>
  )
}

function InvoiceForm({ invoice, preset = '', issuers, onClose, onOpen }: { invoice: Invoice | null; preset?: string; issuers: string[]; onClose: () => void; onOpen: (i: Invoice) => void }) {
  const { toast, confirm } = useUi()
  const [f, setF] = useState({
    inv_date: invoice?.inv_date ?? today(),
    kind: invoice?.kind ?? 'satis',
    issuer: invoice?.issuer ?? '',
    number: invoice?.number ?? '',
    counterparty: invoice?.counterparty ?? preset,
    amount: invoice?.amount != null ? String(Number(invoice.amount)) : '',
    vat: invoice?.vat != null ? String(Number(invoice.vat)) : '',
    brand: (invoice?.brand ?? '') as BrandOrGenel | '',
    note: invoice?.note ?? '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  // Yüklenen faturayı yapay zekâyla okuyup alanları doldurur
  const readFile = async (src: File) => {
    if (src.size > 3 * 1024 * 1024) return toast('Okumak için dosya 3 MB’den küçük olmalı.', 'error')
    setReading(true)
    try {
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1] ?? '')
        r.onerror = () => rej(new Error('Dosya okunamadı'))
        r.readAsDataURL(src)
      })
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch('/api/fatura/oku', { method: 'POST', headers: { Authorization: `Bearer ${s.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: src.name, type: src.type, data }) })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(b.message ?? 'Fatura okunamadı')
      const kind = ['satis', 'alis', 'gider', 'iade'].includes(b.tur) ? b.tur : f.kind
      const other = kind === 'satis' ? b.alici : b.satici
      const num = (v: any) => (typeof v === 'number' && isFinite(v) ? String(v).replace('.', ',') : '')
      const lines = Array.isArray(b.kalemler) ? b.kalemler.slice(0, 6).map((k: any) => `${k.ad}${k.adet ? ` × ${k.adet}` : ''}`).join(', ') : ''
      setF((x) => ({
        ...x,
        inv_date: /^\d{4}-\d{2}-\d{2}$/.test(b.tarih ?? '') ? b.tarih : x.inv_date,
        kind,
        number: b.fatura_no || x.number,
        counterparty: other?.unvan || x.counterparty,
        amount: num(b.toplam) || x.amount,
        vat: num(b.kdv) || x.vat,
        issuer: x.issuer || b.kesen_sistem || '',
        brand: (['formstep', 'seryn', 'kumas'].includes(b.marka) ? b.marka : x.brand) as BrandOrGenel | '',
        note: x.note || [other?.vkn ? `VKN/TCKN: ${other.vkn}` : '', lines].filter(Boolean).join(' · '),
      }))
      toast('Fatura okundu; alanları kontrol edip kaydedin.')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setReading(false)
    }
  }
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      let filePatch = {}
      if (file) {
        const path = `${f.inv_date.slice(0, 4)}/${f.inv_date.slice(5, 7)}/${crypto.randomUUID()}-${safe(file.name)}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (error) throw new Error(error.message)
        filePatch = { file_path: path, file_name: file.name, file_size: file.size }
        if (invoice?.file_path) await supabase.storage.from(BUCKET).remove([invoice.file_path])
      }
      const row = { ...f, issuer: f.issuer.trim() || null, number: f.number || null, counterparty: f.counterparty || null, amount: n(f.amount), vat: n(f.vat), brand: f.brand || null, note: f.note || null, ...filePatch }
      await write(invoice ? supabase.from('invoices').update(row).eq('id', invoice.id) : supabase.from('invoices').insert(row))
      invalidate(...AFTER.invoices)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!invoice || !(await confirm('Fatura kaydı ve dosyası silinsin mi?'))) return
    try {
      if (invoice.file_path) await supabase.storage.from(BUCKET).remove([invoice.file_path])
      await write(supabase.from('invoices').delete().eq('id', invoice.id))
      invalidate(...AFTER.invoices)
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={invoice ? 'Faturayı düzenle' : 'Fatura ekle'}
      footer={
        <>
          {invoice && (
            <Button variant="ghost" className="mr-auto text-[#b83030]" onClick={del}>
              Sil
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button form="inv-form" type="submit" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="inv-form" onSubmit={save} className="space-y-4">
        {invoice?.file_path && (
          <button type="button" onClick={() => onOpen(invoice)} className="flex w-full items-center gap-2 rounded-xl bg-[#F7F6F2] p-3 text-left text-sm font-semibold hover:bg-[#EFEDE7]">
            <Paperclip className="h-4 w-4" /> {invoice.file_name} <span className="ml-auto text-xs text-ink-soft/60">aç</span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fatura tarihi">
            <Input type="date" required value={f.inv_date} onChange={(e) => set({ inv_date: e.target.value })} />
          </Field>
          <Field label="Tür">
            <Select value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Karşı taraf" className="col-span-2">
            <PartyNameInput value={f.counterparty} onChange={(v) => set({ counterparty: v })} placeholder="Müşteri ya da tedarikçi" />
          </Field>
          <Field label="Fatura no">
            <Input value={f.number} onChange={(e) => set({ number: e.target.value })} />
          </Field>
          <Field label="Kesen sistem / site">
            <Input list="issuers" value={f.issuer} onChange={(e) => set({ issuer: e.target.value })} placeholder="ör. Paraşüt" />
            <datalist id="issuers">
              {issuers.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label="Tutar (KDV dahil)">
            <Input inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="KDV tutarı">
            <Input inputMode="decimal" value={f.vat} onChange={(e) => set({ vat: e.target.value })} />
          </Field>
          <Field label="Marka" className="col-span-2">
            <Select value={f.brand} onChange={(e) => set({ brand: e.target.value as BrandOrGenel })}>
              <option value="">—</option>
              {BRANDS_WITH_GENEL.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id === 'genel' ? 'OMY Ticaret' : b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={invoice?.file_path ? 'Dosyayı değiştir' : 'Dosya'} hint="PDF, fotoğraf ya da e-fatura XML yüklerseniz bilgiler kendiliğinden doldurulabilir">
          <Input
            type="file"
            accept=".pdf,.xml,.html,.zip,image/*"
            onChange={(e) => {
              const x = e.target.files?.[0] ?? null
              setFile(x)
              // Yeni faturada alanlar boşsa dosya seçilir seçilmez okunur
              if (x && !invoice && !f.amount && !f.number && /pdf|image|xml|html/i.test(x.type || x.name)) readFile(x)
            }}
          />
          {file && /pdf|image|xml|html/i.test(file.type || file.name) && (
            <Button type="button" size="sm" variant="secondary" className="mt-2" icon={<Sparkles className="h-4 w-4 text-thread" />} loading={reading} onClick={() => readFile(file)}>
              {reading ? 'Fatura okunuyor…' : 'Faturayı oku, alanları doldur'}
            </Button>
          )}
        </Field>
        <Field label="Not">
          <Textarea rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Drawer>
  )
}
