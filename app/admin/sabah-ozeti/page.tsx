'use client'

import { useState } from 'react'
import { CalendarRange, Check, Copy, Mail, MessageCircle, Pencil, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import { Markdown, runAiJob, type AiReport } from '@/components/panel/aiJob'
import { supabase } from '@/lib/supabase'
import { invalidate, must, useQuery, write } from '@/lib/panel/data'
import { dateTimeTR, relTime } from '@/lib/panel/format'
import { Button, Card, cx, Drawer, Empty, Field, Input, PageHeader, Skeleton, StatusPill, useUi } from '@/components/panel/ui'

type Recipient = { id: string; name: string; phone: string | null; email: string | null; channels: string[]; topics: string[]; active: boolean }
type Log = { id: number; sent_at: string; channel: string; recipient: string; ok: boolean; error: string | null }
type Preview = { text: string; channels: { whatsapp: boolean; email: boolean } }

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` }
}

/** *kalın* → <b>, satırlar korunur */
function WaText({ text }: { text: string }) {
  return (
    <div className="space-y-0.5 text-[14px] leading-relaxed text-ink">
      {text.split('\n').map((l, i) =>
        l ? (
          <p key={i} className="[overflow-wrap:anywhere]">
            {l.split(/(\*[^*]+\*)/g).map((p, j) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <b key={j}>{p.slice(1, -1)}</b> : <span key={j}>{p}</span>))}
          </p>
        ) : (
          <div key={i} className="h-2" />
        ),
      )}
    </div>
  )
}

export default function MorningDigestPage() {
  const { toast } = useUi()
  const preview = useQuery<Preview>('ozet:preview', async () => {
    const res = await fetch('/api/ozet', { headers: await authHeader(), cache: 'no-store' })
    const b = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(b.message ?? 'Özet hazırlanamadı')
    return b
  })
  const people = useQuery('notify_recipients', () => must<Recipient[]>(supabase.from('notify_recipients').select('*').order('created_at')))
  const log = useQuery('notify_log', () => must<Log[]>(supabase.from('notify_log').select('*').order('sent_at', { ascending: false }).limit(30)))
  const [form, setForm] = useState<Recipient | 'new' | null>(null)
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState(false)

  const text = preview.data?.text ?? ''
  const ch = preview.data?.channels
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  const sendNow = async (only?: Recipient) => {
    setBusy(only?.id ?? 'all')
    try {
      const res = await fetch(`/api/ozet${only ? `?alici=${only.id}` : ''}`, { method: 'POST', headers: await authHeader() })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(b.message ?? 'Gönderilemedi')
      const failed = (b.results ?? []).filter((r: any) => !r.ok)
      if (!(b.results ?? []).length) toast('Gönderilecek kişi yok. Önce alıcı ekleyin.', 'error')
      else if (failed.length) toast(`${b.sent} gönderildi, ${failed.length} gönderilemedi: ${failed[0].error}`, 'error')
      else toast(`${b.sent} kişiye gönderildi`)
      invalidate('notify_log')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHeader
        title="Sabah özeti"
        subtitle="Her sabah 08.30'da dünün satışı, biten stok, Amazon'a gönderilecekler, tahsilat ve aranacaklar telefona gelir."
        actions={
          <Button variant="gold" icon={<Send className="h-4 w-4" />} loading={busy === 'all'} onClick={() => sendNow()} disabled={!ch?.whatsapp && !ch?.email}>
            Şimdi gönder
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          title="Bugünkü özet"
          action={
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy} disabled={!text}>
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </Button>
            </div>
          }
        >
          {preview.loading ? (
            <Skeleton className="h-72" />
          ) : preview.error ? (
            <p className="text-sm text-[#b83030]">{preview.error}</p>
          ) : (
            <>
              <div className="rounded-2xl bg-[#e7f6e9] p-4 ring-1 ring-[#25D366]/20 sm:p-5">
                <WaText text={text} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:bg-[#1fb857]"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp&apos;ta paylaş
                </a>
                <p className="text-xs text-ink-soft/60">Kendi telefonunuzdan istediğiniz gruba ya da kişiye gönderebilirsiniz.</p>
              </div>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <WeeklyCard />
          <Card title="Bağlantılar">
            <ul className="-my-1 divide-y divide-line text-sm">
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <MessageCircle className="h-4 w-4 text-[#128C7E]" /> WhatsApp (SERYN numarası)
                </span>
                {ch ? <StatusPill tone={ch.whatsapp ? 'good' : 'neutral'}>{ch.whatsapp ? 'Bağlı' : 'Bağlı değil'}</StatusPill> : null}
              </li>
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <Mail className="h-4 w-4 text-ink-soft" /> E-posta
                </span>
                {ch ? <StatusPill tone={ch.email ? 'good' : 'neutral'}>{ch.email ? 'Bağlı' : 'Bağlı değil'}</StatusPill> : null}
              </li>
            </ul>
            {ch && !ch.whatsapp && !ch.email && (
              <p className="mt-3 rounded-xl bg-black/[0.03] p-3 text-xs leading-relaxed text-ink-soft/80">
                Otomatik gönderim için WhatsApp ya da e-posta bağlantısı gerekiyor. Bağlanana kadar &quot;WhatsApp&apos;ta paylaş&quot; ile elle gönderebilirsiniz.
              </p>
            )}
          </Card>

          <Card
            title="Kimlere gidecek"
            action={
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm('new')}>
                Ekle
              </Button>
            }
          >
            {people.loading ? (
              <Skeleton className="h-24" />
            ) : !(people.data ?? []).length ? (
              <Empty title="Henüz kimse yok" text="Ömer'i ve abilerini ekleyin; her sabah kendi WhatsApp'larına gelsin." />
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {(people.data ?? []).map((p) => (
                  <li key={p.id} className={cx('flex items-center gap-2 py-2.5', !p.active && 'opacity-50')}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{p.name}</p>
                      <p className="truncate text-xs text-ink-soft/60">
                        {[p.channels.includes('whatsapp') && p.phone, p.channels.includes('email') && p.email].filter(Boolean).join(' · ') || 'kanal seçilmedi'}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" loading={busy === p.id} onClick={() => sendNow(p)} title="Bu kişiye deneme gönder" disabled={!ch?.whatsapp && !ch?.email}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm(p)} title="Düzenle">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(log.data ?? []).length > 0 && (
            <Card title="Son gönderimler">
              <ul className="-my-1 divide-y divide-line text-sm">
                {(log.data ?? []).slice(0, 8).map((l) => (
                  <li key={l.id} className="py-2">
                    <p className="flex items-center justify-between gap-2">
                      <span className="truncate text-ink">{l.recipient}</span>
                      <StatusPill tone={l.ok ? 'good' : 'critical'}>{l.ok ? 'Gitti' : 'Hata'}</StatusPill>
                    </p>
                    <p className="text-xs text-ink-soft/60">
                      {l.channel === 'whatsapp' ? 'WhatsApp' : 'E-posta'} · {relTime(l.sent_at)}
                      {l.error && <span className="block text-[#b83030]">{l.error}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {form && <RecipientForm r={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  )
}

function RecipientForm({ r, onClose }: { r: Recipient | null; onClose: () => void }) {
  const { toast, confirm } = useUi()
  const [f, setF] = useState({ name: r?.name ?? '', phone: r?.phone ?? '', email: r?.email ?? '', wa: r ? r.channels.includes('whatsapp') : false, mail: r ? r.channels.includes('email') : true, active: r?.active ?? true, ozet: r ? r.topics.includes('ozet') : true, haftalik: r ? r.topics.includes('haftalik') : true })
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return toast('Ad yazın', 'error')
    if (f.wa && !f.phone.trim()) return toast('WhatsApp için telefon yazın', 'error')
    if (f.mail && !f.email.trim()) return toast('E-posta adresini yazın', 'error')
    setBusy(true)
    try {
      const row = { name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, channels: [f.wa && 'whatsapp', f.mail && 'email'].filter(Boolean), topics: [f.ozet && 'ozet', f.haftalik && 'haftalik'].filter(Boolean), active: f.active }
      await write(r ? supabase.from('notify_recipients').update(row).eq('id', r.id) : supabase.from('notify_recipients').insert(row))
      invalidate('notify_recipients')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    if (!r || !(await confirm(`${r.name} listeden çıkarılsın mı?`))) return
    try {
      await write(supabase.from('notify_recipients').delete().eq('id', r.id))
      invalidate('notify_recipients')
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }
  const box = (on: boolean, set: (v: boolean) => void, text: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-[#11131a]" />
      {text}
    </label>
  )
  return (
    <Drawer
      open
      onClose={onClose}
      title={r ? 'Alıcıyı düzenle' : 'Yeni alıcı'}
      footer={
        <>
          {r && (
            <Button type="button" variant="ghost" className="mr-auto text-[#b83030]" icon={<Trash2 className="h-4 w-4" />} onClick={del}>
              Çıkar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="rcp-form" loading={busy}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="rcp-form" onSubmit={save} className="space-y-4">
        <Field label="Ad">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ör. Ömer" autoFocus required />
        </Field>
        <Field label="Telefon (isteğe bağlı)">
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} type="tel" inputMode="tel" placeholder="05xx xxx xx xx" />
        </Field>
        <Field label="E-posta">
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" />
        </Field>
        <div className="space-y-2 rounded-xl bg-black/[0.03] p-3">
          {box(f.mail, (v) => setF({ ...f, mail: v }), 'E-posta ile gelsin')}
          {box(f.wa, (v) => setF({ ...f, wa: v }), 'WhatsApp ile gelsin (WhatsApp bağlanınca)')}
          <div className="my-1 border-t border-line" />
          {box(f.ozet, (v) => setF({ ...f, ozet: v }), 'Her sabah özet')}
          {box(f.haftalik, (v) => setF({ ...f, haftalik: v }), 'Pazartesi haftalık rapor')}
          {r && box(f.active, (v) => setF({ ...f, active: v }), 'Gönderim açık')}
        </div>
      </form>
    </Drawer>
  )
}

function WeeklyCard() {
  const { toast } = useUi()
  const reps = useQuery('ai:haftalik', () => must<AiReport[]>(supabase.from('ai_reports').select('*').eq('kind', 'haftalik').order('created_at', { ascending: false }).limit(8)))
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const list = reps.data ?? []
  const make = async () => {
    setBusy(true)
    try {
      const id = await runAiJob({ kind: 'haftalik' })
      invalidate('ai:haftalik')
      setOpen(id)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const cur = list.find((x) => x.id === open)
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-ink-soft" /> Haftalık rapor
        </span>
      }
      action={
        <Button size="sm" variant="ghost" icon={<Sparkles className="h-4 w-4 text-thread" />} loading={busy} onClick={make}>
          Şimdi hazırla
        </Button>
      }
    >
      <p className="-mt-1 mb-2 text-xs text-ink-soft/60">Her pazartesi 09.00&apos;da geçen haftanın raporu yazılır ve &quot;haftalık rapor&quot; işaretli kişilere e-postayla gider.</p>
      {list.length === 0 ? (
        <p className="text-sm text-ink-soft/60">Henüz rapor yok.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {list.map((x) => (
            <li key={x.id} className="py-2">
              <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} className="w-full text-left text-sm font-semibold text-ink hover:underline">
                {x.subject ?? dateTimeTR(x.created_at)}
                {x.status !== 'hazir' && <span className="ml-1 text-xs font-normal text-[#b83030]">{x.status === 'hata' ? '(hata)' : '(sürüyor)'}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {cur && (
        <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl bg-black/[0.03] p-3">
          {cur.status === 'hata' ? <p className="text-sm text-[#b83030]">{cur.error}</p> : <Markdown text={cur.text ?? ''} />}
        </div>
      )}
    </Card>
  )
}
