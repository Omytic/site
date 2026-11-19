'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, RefreshCw, Send, Sparkles, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRANDS } from '@/lib/panel/constants'
import { invalidate, must, useQuery, write } from '@/lib/panel/data'
import { num, relTime } from '@/lib/panel/format'
import { Button, Card, cx, Empty, PageHeader, Segmented, Skeleton, Stat, StatusPill, Textarea, useUi } from '@/components/panel/ui'

type FB = {
  id: string; source: string; kind: 'soru' | 'geribildirim' | 'yorum'; brand: string | null; posted_at: string
  product_name: string | null; product_url: string | null; image_url: string | null; customer: string | null
  rating: number | null; text: string; answer: string | null; answered_at: string | null
  status: 'bekliyor' | 'cevaplandi' | 'kapandi'; external_status: string | null; order_id: string | null
  sentiment: string | null; draft: string | null; raw: any
}
type Tab = 'bekleyen' | 'soru' | 'geribildirim' | 'hepsi'

const SRC: Record<string, { label: string; logo: string }> = {
  trendyol_soru: { label: 'Trendyol sorusu', logo: '/images/brands/trendyol.png' },
  amazon_geribildirim: { label: 'Amazon geri bildirimi', logo: '/images/brands/amazon.png' },
  hepsiburada_soru: { label: 'Hepsiburada sorusu', logo: '/images/brands/hepsiburada.png' },
  manuel: { label: 'Elle eklendi', logo: '' },
}
const DAY = 86_400_000

async function api(path: string, body?: object) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const b = await res.json().catch(() => ({}))
  if (!res.ok || b.ok === false) throw new Error(b.message ?? (b.results ?? []).find((r: any) => !r.ok && !r.skipped)?.message ?? 'İşlem başarısız')
  return b
}

const Stars = ({ n }: { n: number }) => (
  <span className="inline-flex" aria-label={`${n} yıldız`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={cx('h-3.5 w-3.5', i <= n ? (n <= 2 ? 'fill-[#d03b3b] text-[#d03b3b]' : 'fill-[#E3AB3B] text-[#E3AB3B]') : 'text-black/15')} />
    ))}
  </span>
)

export default function CustomerVoicePage() {
  const { toast } = useUi()
  const list = useQuery('customer_feedback', () => must<FB[]>(supabase.from('customer_feedback').select('*').gte('posted_at', new Date(Date.now() - 180 * DAY).toISOString()).order('posted_at', { ascending: false }).limit(1000)))
  const runs = useQuery('feedback_runs', () => must<any[]>(supabase.from('sync_runs').select('channel,status,message,started_at').in('channel', ['trendyol_soru', 'amazon_geribildirim']).order('started_at', { ascending: false }).limit(10)))
  const [tab, setTab] = useState<Tab>('bekleyen')
  const [brand, setBrand] = useState('all')
  const [busy, setBusy] = useState(false)

  const all = list.data ?? []
  const shown = all.filter(
    (f) => (brand === 'all' || f.brand === brand) && (tab === 'hepsi' || (tab === 'bekleyen' ? f.status === 'bekliyor' : f.kind === tab)),
  )
  const stats = useMemo(() => {
    const since30 = Date.now() - 30 * DAY
    const waiting = all.filter((f) => f.status === 'bekliyor' && f.kind === 'soru').length
    const answered = all.filter((f) => f.kind === 'soru' && f.answered_at && Date.parse(f.posted_at) > since30)
    const avgH = answered.length ? answered.reduce((a, f) => a + (Date.parse(f.answered_at!) - Date.parse(f.posted_at)), 0) / answered.length / 3_600_000 : null
    const fb = all.filter((f) => f.kind === 'geribildirim' && f.rating)
    const avgR = fb.length ? fb.reduce((a, f) => a + f.rating!, 0) / fb.length : null
    const neg = all.filter((f) => f.sentiment === 'olumsuz' && Date.parse(f.posted_at) > since30).length
    return { waiting, avgH, avgR, fbCount: fb.length, neg }
  }, [all])
  const latest = new Map<string, any>()
  ;(runs.data ?? []).forEach((r) => !latest.has(r.channel) && latest.set(r.channel, r))
  const errs = [...latest.values()].filter((r) => r.status === 'hata')

  const sync = async () => {
    setBusy(true)
    try {
      await api('/api/sync/geribildirim')
      toast('Sorular ve geri bildirimler güncellendi.')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
      invalidate('customer_feedback', 'feedback_runs')
    }
  }

  return (
    <>
      <PageHeader
        title="Müşteri sesi"
        subtitle="Trendyol'daki müşteri soruları ve Amazon satıcı geri bildirimleri tek yerde. Cevap taslağını yapay zekâ yazar, siz kontrol edip gönderirsiniz."
        actions={
          <Button variant="secondary" icon={<RefreshCw className={cx('h-4 w-4', busy && 'animate-spin')} />} onClick={sync} disabled={busy}>
            Şimdi güncelle
          </Button>
        }
      />

      {errs.map((r) => (
        <p key={r.channel} className="mb-3 rounded-xl bg-[#fdecec] px-4 py-3 text-sm text-[#8f2424]">
          {r.channel === 'trendyol_soru' ? 'Trendyol soruları' : 'Amazon geri bildirimleri'}: {r.message}
        </p>
      ))}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone={stats.waiting ? 'dark' : undefined} label="Cevap bekleyen soru" value={num(stats.waiting)} sub="Trendyol cevap süresini puanlıyor" />
        <Stat label="Ortalama cevap süresi" value={stats.avgH === null ? '—' : stats.avgH < 24 ? `${num(Math.round(stats.avgH))} saat` : `${num(Math.round(stats.avgH / 24))} gün`} sub="son 30 günde sorulanlar" />
        <Stat label="Amazon satıcı puanı" value={stats.avgR === null ? '—' : stats.avgR.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sub={`${num(stats.fbCount)} geri bildirim · son 90 gün`} />
        <Stat label="Olumsuz (1–2 yıldız)" value={num(stats.neg)} sub="son 30 gün" />
      </div>

      <Card className="mt-4" pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { id: 'bekleyen', label: `Bekleyenler${all.filter((f) => f.status === 'bekliyor').length ? ` (${all.filter((f) => f.status === 'bekliyor').length})` : ''}` },
              { id: 'soru', label: 'Sorular' },
              { id: 'geribildirim', label: 'Amazon geri bildirim' },
              { id: 'hepsi', label: 'Hepsi' },
            ]}
          />
          <div className="flex flex-wrap gap-1">
            {[{ id: 'all', label: 'Tüm markalar', color: '' }, ...BRANDS.filter((b) => b.id !== 'diger')].map((b) => (
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
        </div>

        {list.loading ? (
          <div className="p-5">
            <Skeleton className="h-60" />
          </div>
        ) : shown.length === 0 ? (
          <Empty
            title={tab === 'bekleyen' ? 'Bekleyen bir şey yok' : 'Kayıt yok'}
            text={all.length ? 'Bütün sorular cevaplanmış görünüyor.' : '"Şimdi güncelle" ile Trendyol sorularını ve Amazon geri bildirimlerini çekin. Sonrasında her 3 saatte bir kendiliğinden güncellenir.'}
          />
        ) : (
          <ul className="divide-y divide-line">
            {shown.slice(0, 150).map((f) => (
              <FeedbackRow key={f.id} f={f} />
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft/60">
        Trendyol ve Amazon ürün yorumlarını resmi yoldan vermiyor (Amazon&apos;un yorum servisi Türkiye&apos;de açık değil). Bu yüzden burada soru ve satıcı geri bildirimleri var. Hepsiburada bağlanınca onun soruları da eklenecek.
      </p>
    </>
  )
}

function FeedbackRow({ f }: { f: FB }) {
  const { toast } = useUi()
  const [text, setText] = useState(f.draft ?? '')
  const [hint, setHint] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'' | 'draft' | 'send' | 'close'>('')
  const [copied, setCopied] = useState(false)
  const src = SRC[f.source] ?? { label: f.source, logo: '' }
  const canSend = f.source === 'trendyol_soru' && f.status === 'bekliyor'
  const rejected = f.raw?.rejectedAnswer?.text

  const draft = async () => {
    setBusy('draft')
    try {
      const b = await api('/api/geribildirim/taslak', { id: f.id, hint })
      setText(b.draft)
      setOpen(true)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }
  const send = async () => {
    setBusy('send')
    try {
      await api('/api/geribildirim/cevap', { id: f.id, text })
      toast("Cevap Trendyol'a gönderildi. Onaylanınca yayınlanır.")
      invalidate('customer_feedback')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }
  const close = async () => {
    setBusy('close')
    try {
      await write(supabase.from('customer_feedback').update({ status: f.status === 'kapandi' ? 'bekliyor' : 'kapandi' }).eq('id', f.id))
      invalidate('customer_feedback')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy('')
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <li className={cx('px-4 py-4 sm:px-5', f.sentiment === 'olumsuz' && f.status === 'bekliyor' && 'bg-[#fff6f6]')}>
      <div className="flex gap-3">
        {f.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.image_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-line" />
        ) : src.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src.logo} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-2 ring-1 ring-line" />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-xl bg-black/5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft/60">
            <b className="text-ink-soft">{src.label}</b>
            <span>{relTime(f.posted_at)}</span>
            {f.customer && <span>{f.customer}</span>}
            {f.order_id && <span>Sipariş {f.order_id}</span>}
            {f.rating && <Stars n={f.rating} />}
            {f.status === 'bekliyor' ? (
              <StatusPill tone={f.sentiment === 'olumsuz' ? 'critical' : 'warning'}>{f.kind === 'soru' ? 'Cevap bekliyor' : 'İlgilenilmeli'}</StatusPill>
            ) : f.status === 'cevaplandi' ? (
              <StatusPill tone="good">{f.external_status === 'WAITING_FOR_APPROVE' ? 'Cevap onayda' : 'Cevaplandı'}</StatusPill>
            ) : (
              <StatusPill tone="neutral">Kapandı</StatusPill>
            )}
          </p>
          {f.product_name && (
            <p className="mt-1 text-xs font-semibold text-ink-soft">
              {f.product_url ? (
                <a href={f.product_url} target="_blank" rel="noreferrer" className="hover:underline">
                  {f.product_name}
                </a>
              ) : (
                f.product_name
              )}
            </p>
          )}
          <p className="mt-1.5 whitespace-pre-line text-[15px] text-ink [overflow-wrap:anywhere]">{f.text}</p>
          {f.answer && <p className="mt-2 whitespace-pre-line rounded-xl bg-[#e9f6ef] px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">↳ {f.answer}</p>}
          {rejected && f.status === 'bekliyor' && (
            <p className="mt-2 rounded-xl bg-[#fdecec] px-3 py-2 text-xs text-[#8f2424]">Trendyol önceki cevabı reddetti: “{rejected}”</p>
          )}

          {f.status !== 'cevaplandi' && (
            <div className="mt-3">
              {!open && !text ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4 text-thread" />} loading={busy === 'draft'} onClick={draft}>
                    Cevap taslağı yaz
                  </Button>
                  {canSend && (
                    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
                      Kendim yazayım
                    </Button>
                  )}
                  {f.source !== 'trendyol_soru' && (
                    <Button size="sm" variant="ghost" icon={f.status === 'kapandi' ? undefined : <Check className="h-4 w-4" />} loading={busy === 'close'} onClick={close}>
                      {f.status === 'kapandi' ? 'Tekrar aç' : 'İlgilenildi'}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2 rounded-xl bg-black/[0.03] p-3">
                  <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cevabınız (10–2000 karakter)" />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      placeholder="Taslağa not: ör. yarın kargoya veriyoruz"
                      className="h-9 min-w-[200px] flex-1 rounded-lg bg-white px-3 text-sm ring-1 ring-line outline-none focus:ring-black/25"
                    />
                    <Button size="sm" variant="ghost" icon={<Sparkles className="h-4 w-4 text-thread" />} loading={busy === 'draft'} onClick={draft}>
                      {text ? 'Yeniden yaz' : 'Taslak yaz'}
                    </Button>
                    {canSend ? (
                      <Button size="sm" icon={<Send className="h-4 w-4" />} loading={busy === 'send'} disabled={text.trim().length < 10} onClick={send}>
                        Trendyol&apos;a gönder
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="secondary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy} disabled={!text}>
                          {copied ? 'Kopyalandı' : 'Kopyala'}
                        </Button>
                        {f.source === 'amazon_geribildirim' && (
                          <a
                            href="https://sellercentral.amazon.com.tr/feedback-manager/index.html"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-[#1d5fb0] hover:underline"
                          >
                            Seller Central&apos;da cevapla <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <Button size="sm" variant="ghost" icon={<Check className="h-4 w-4" />} loading={busy === 'close'} onClick={close}>
                          İlgilenildi
                        </Button>
                      </>
                    )}
                  </div>
                  {canSend && <p className="text-[11px] text-ink-soft/55">Trendyol cevapta telefon, e-posta, web adresi ve başka satış kanalı yazılmasına izin vermiyor; cevap Trendyol onayından sonra yayınlanır.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
