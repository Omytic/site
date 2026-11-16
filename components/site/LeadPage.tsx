'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2, Send } from 'lucide-react'
import { OmyMark } from './Nav'
import { SiteFooter } from './Contact'

/*
 * Sitedeki iki form: toptan teklif / bayilik ve kumaş numunesi.
 * Gönderilen form panelde Talepler'e "Site formu" olarak düşer.
 */

const input =
  'h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-ink outline-none transition placeholder:text-ink-soft/40 focus:border-thread focus:ring-4 focus:ring-thread/15'

function Shell({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="relative overflow-hidden bg-night text-white">
        <div aria-hidden className="weave absolute inset-0" />
        <div aria-hidden className="absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-thread/15 blur-[140px]" />
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-6 sm:px-8 sm:pb-20">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="OMY Ticaret ana sayfa" className="text-lg">
              <OmyMark />
            </Link>
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Ana sayfa
            </Link>
          </div>
          <p className="mt-14 text-sm font-bold uppercase tracking-[0.2em] text-thread">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-[0.98] sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/65">{lead}</p>
        </div>
      </header>
      <div className="mx-auto -mt-8 max-w-5xl px-5 pb-24 sm:px-8">{children}</div>
      <SiteFooter />
    </main>
  )
}

function useSubmit() {
  const started = useRef(Date.now())
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const submit = async (payload: Record<string, unknown>) => {
    setState('busy')
    setError(null)
    try {
      const r = await fetch('/api/talep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, t: started.current }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.message || 'Gönderilemedi.')
      setState('done')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      setError(e.message)
      setState('idle')
    }
  }
  return { state, error, submit }
}

function Done({ text }: { text: string }) {
  return (
    <div className="rounded-[26px] bg-white p-8 text-center shadow-[0_30px_60px_-30px_rgba(14,21,39,0.35)] sm:p-12">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-thread text-night">
        <Check className="h-7 w-7" />
      </span>
      <h2 className="mt-5 font-display text-3xl font-black">Aldık, teşekkürler!</h2>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink-soft/80">{text}</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-night px-6 font-bold text-white hover:bg-ink">
        Ana sayfaya dön
      </Link>
    </div>
  )
}

function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Web siteniz
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  )
}

/* ------------------------------------------------------------------ */
export function QuotePage() {
  const { state, error, submit } = useSubmit()
  const [brand, setBrand] = useState('kumas')
  const [kind, setKind] = useState('toptan')
  if (state === 'done')
    return (
      <Shell eyebrow="Toptan teklif" title="Teklif isteğiniz bize ulaştı" lead="En geç bir iş günü içinde size dönüyoruz.">
        <Done text="Ekibimiz talebinizi inceleyip telefon ya da e-postayla fiyat ve termin bilgisini iletecek." />
      </Shell>
    )
  return (
    <Shell
      eyebrow="Toptan teklif · Bayilik"
      title="Size özel toptan fiyat alın"
      lead="Kumaş, FormStep tabanlık ya da SERYN için toptan alım veya bayilik isteğinizi bırakın; stok durumuna göre fiyat ve termini iletelim."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          submit({ ...Object.fromEntries(f.entries()), brand, kind })
        }}
        className="relative space-y-5 rounded-[26px] bg-white p-6 shadow-[0_30px_60px_-30px_rgba(14,21,39,0.35)] sm:p-10"
      >
        <Honeypot />
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-soft">Ne ile ilgileniyorsunuz?</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'kumas', label: 'Kumaş' },
              { id: 'formstep', label: 'FormStep tabanlık' },
              { id: 'seryn', label: 'SERYN' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBrand(b.id)}
                className={`h-12 rounded-2xl text-sm font-bold ring-1 transition sm:text-base ${brand === b.id ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25'}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-ink-soft">
          {[
            { id: 'toptan', label: 'Toptan alım' },
            { id: 'bayi', label: 'Bayi olmak istiyorum' },
          ].map((k) => (
            <label key={k.id} className="flex cursor-pointer items-center gap-2">
              <input type="radio" name="kind_ui" checked={kind === k.id} onChange={() => setKind(k.id)} className="h-4 w-4 accent-[#E3AB3B]" />
              {k.label}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hangi ürün / renk?">
            <input name="products" className={input} placeholder={brand === 'kumas' ? 'ör. Alcantara lacivert, Welsoft krem' : brand === 'formstep' ? 'ör. M100, 40-45 numaralar' : 'ör. SERYN 18 g'} />
          </Field>
          <Field label="Yaklaşık miktar">
            <input name="quantity" className={input} placeholder={brand === 'kumas' ? 'ör. 300 metre' : 'ör. 500 adet'} />
          </Field>
          <Field label="Ad soyad">
            <input name="name" required autoComplete="name" className={input} />
          </Field>
          <Field label="Firma">
            <input name="company" autoComplete="organization" className={input} />
          </Field>
          <Field label="Telefon">
            <input name="phone" type="tel" autoComplete="tel" className={input} placeholder="05xx xxx xx xx" />
          </Field>
          <Field label="E-posta">
            <input name="email" type="email" autoComplete="email" className={input} />
          </Field>
          <Field label="Şehir" className="sm:col-span-2">
            <input name="city" autoComplete="address-level1" className={input} />
          </Field>
        </div>
        <Field label="Eklemek istedikleriniz">
          <textarea name="message" rows={4} className={`${input} h-auto resize-none py-3`} />
        </Field>
        {error && <p className="rounded-2xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#a32a2a]">{error}</p>}
        <button type="submit" disabled={state === 'busy'} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-night text-lg font-bold text-white transition hover:bg-ink disabled:opacity-60">
          {state === 'busy' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          Teklif iste
        </button>
        <p className="text-center text-xs text-ink-soft/55">Bilgileriniz yalnızca size dönüş yapmak için kullanılır.</p>
      </form>
    </Shell>
  )
}

/* ------------------------------------------------------------------ */
type Fabric = { id: string; name: string; variant: string | null; color: string | null }

export function SamplePage() {
  const { state, error, submit } = useSubmit()
  const [fabrics, setFabrics] = useState<Fabric[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/talep/kumaslar')
      .then((r) => r.json())
      .then((j) => setFabrics(j.items ?? []))
      .catch(() => setFabrics([]))
  }, [])
  const groups = useMemo(() => {
    const m = new Map<string, Fabric[]>()
    ;(fabrics ?? []).forEach((f) => m.set(f.name, [...(m.get(f.name) ?? []), f]))
    return Array.from(m.entries())
  }, [fabrics])
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 8 ? c : [...c, id]))

  if (state === 'done')
    return (
      <Shell eyebrow="Kumaş numunesi" title="Numune isteğiniz alındı" lead="Seçtiğiniz renkleri hazırlayıp kargoluyoruz.">
        <Done text="Kargoya verince sizi bilgilendireceğiz. Sorunuz olursa WhatsApp'tan da yazabilirsiniz." />
      </Shell>
    )
  return (
    <Shell
      eyebrow="Ücretsiz kumaş numunesi"
      title="Rengi elinizde görün, sonra karar verin"
      lead="Döşemeci, mobilya üreticisi ya da oto koltuk atölyesiyseniz istediğiniz renklerin numunesini adresinize gönderelim. En çok 8 renk seçebilirsiniz."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!chosen.length) return setLocalError('En az bir renk seçin.')
          setLocalError(null)
          const f = new FormData(e.currentTarget)
          submit({ ...Object.fromEntries(f.entries()), kind: 'numune', brand: 'kumas', samples: chosen.map((id) => ({ item_id: id, qty: 1 })) })
        }}
        className="relative space-y-6 rounded-[26px] bg-white p-6 shadow-[0_30px_60px_-30px_rgba(14,21,39,0.35)] sm:p-10"
      >
        <Honeypot />
        <div>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-2xl font-black">1. Renkleri seçin</h2>
            <span className="text-sm font-semibold text-ink-soft/60">{chosen.length}/8 seçildi</span>
          </div>
          {fabrics === null ? (
            <p className="flex items-center gap-2 py-6 text-ink-soft/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Kumaşlar yükleniyor…
            </p>
          ) : groups.length === 0 ? (
            <p className="py-4 text-ink-soft/70">Kumaş listesi şu an yüklenemedi. Hangi renkleri istediğinizi aşağıdaki not alanına yazabilirsiniz.</p>
          ) : (
            <div className="space-y-4">
              {groups.map(([name, list]) => (
                <div key={name}>
                  <p className="mb-2 font-bold">{name}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((f) => {
                      const on = chosen.includes(f.id)
                      const label = [f.variant, f.color].filter(Boolean).join(' · ') || name
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggle(f.id)}
                          aria-pressed={on}
                          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${on ? 'bg-night text-white ring-night' : 'bg-white text-ink-soft ring-black/10 hover:ring-black/25'}`}
                        >
                          {on && <Check className="h-4 w-4 text-thread" />}
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-3 font-display text-2xl font-black">2. Nereye gönderelim?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ad soyad">
              <input name="name" required autoComplete="name" className={input} />
            </Field>
            <Field label="Firma / atölye">
              <input name="company" autoComplete="organization" className={input} />
            </Field>
            <Field label="Telefon">
              <input name="phone" type="tel" required autoComplete="tel" className={input} placeholder="05xx xxx xx xx" />
            </Field>
            <Field label="E-posta">
              <input name="email" type="email" autoComplete="email" className={input} />
            </Field>
            <Field label="Şehir">
              <input name="city" required autoComplete="address-level1" className={input} />
            </Field>
            <Field label="Ne üretiyorsunuz?">
              <input name="products" className={input} placeholder="ör. koltuk takımı, oto koltuk, yatak başlığı" />
            </Field>
            <Field label="Açık adres" className="sm:col-span-2">
              <textarea name="address" required rows={2} autoComplete="street-address" className={`${input} h-auto resize-none py-3`} />
            </Field>
            <Field label="Not" className="sm:col-span-2">
              <input name="message" className={input} placeholder="İsterseniz ek bilgi" />
            </Field>
          </div>
        </div>
        {(localError || error) && <p className="rounded-2xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#a32a2a]">{localError || error}</p>}
        <button type="submit" disabled={state === 'busy'} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-night text-lg font-bold text-white transition hover:bg-ink disabled:opacity-60">
          {state === 'busy' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          Numune iste
        </button>
      </form>
    </Shell>
  )
}
