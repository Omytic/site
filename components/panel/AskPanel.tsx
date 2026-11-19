'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cx } from './ui'

type Step = { purpose: string; rows: number | null; error?: string }
type Turn = { role: 'user' | 'assistant'; text: string; steps?: Step[]; error?: boolean }

const EXAMPLES = [
  'Bu ay hangi kanaldan ne kadar sattık?',
  'En çok satan 5 FormStep numarası hangisi?',
  'Kimden ne kadar alacağımız var?',
  'Geçen aya göre Amazon dönüşüm oranı nasıl?',
  'Hangi reklam kampanyası en verimli?',
  'Depoda en çok hangi kumaş var?',
]

/** Basit markdown: **kalın**, madde, tablo, başlık */
function Md({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>))
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()))
        i++
      }
      i--
      out.push(
        <div key={i} className="my-2 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-black/[0.03] text-left">
                {rows[0]?.map((c, j) => (
                  <th key={j} className="px-3 py-1.5 font-semibold text-ink-soft">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, k) => (
                <tr key={k} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className={cx('px-3 py-1.5', j > 0 && /^[₺$€%\d.,\s+−-]+/.test(c) && 'text-right tabular-nums')}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    } else if (/^\s*[-•*]\s+/.test(l)) out.push(<p key={i} className="pl-4 -indent-3">• {inline(l.replace(/^\s*[-•*]\s+/, ''))}</p>)
    else if (/^#{1,4}\s/.test(l)) out.push(<p key={i} className="mt-2 font-bold">{inline(l.replace(/^#+\s/, ''))}</p>)
    else if (l.trim()) out.push(<p key={i}>{inline(l)}</p>)
    else out.push(<div key={i} className="h-2" />)
  }
  return <div className="space-y-0.5 text-[14px] leading-relaxed [overflow-wrap:anywhere]">{out}</div>
}

export function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [openSteps, setOpenSteps] = useState<number | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 250)
  }, [open])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && open && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  const ask = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    const history = turns.filter((t) => !t.error).map((t) => ({ role: t.role, text: t.text }))
    setTurns((t) => [...t, { role: 'user', text: question }])
    setQ('')
    setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/sor', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(b.message ?? 'Cevap alınamadı')
      setTurns((t) => [...t, { role: 'assistant', text: b.answer, steps: b.steps }])
    } catch (e: any) {
      setTurns((t) => [...t, { role: 'assistant', text: e.message, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-night/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-[#F7F6F2] shadow-2xl"
            role="dialog"
            aria-label="Panele sor"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-5">
              <p className="flex items-center gap-2 font-display text-lg font-black text-ink">
                <Sparkles className="h-5 w-5 text-thread" /> Panele sor
              </p>
              <div className="flex items-center gap-1">
                {turns.length > 0 && (
                  <button type="button" onClick={() => setTurns([])} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink-soft hover:bg-black/5" title="Yeni sohbet">
                    <RotateCcw className="h-4 w-4" /> Yeni
                  </button>
                )}
                <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-black/5" aria-label="Kapat">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              {turns.length === 0 ? (
                <div>
                  <p className="text-[15px] leading-relaxed text-ink-soft">
                    Satış, stok, cariler, alacaklar, reklam, Amazon… panelde ne varsa sorabilirsiniz. Cevap, verilere o anda bakılarak hazırlanır.
                  </p>
                  <div className="mt-4 grid gap-2">
                    {EXAMPLES.map((e) => (
                      <button key={e} type="button" onClick={() => ask(e)} className="rounded-xl bg-white px-4 py-3 text-left text-sm font-semibold text-ink ring-1 ring-line transition hover:ring-black/20">
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {turns.map((t, i) =>
                    t.role === 'user' ? (
                      <div key={i} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-night px-4 py-2.5 text-[14px] text-white">{t.text}</p>
                      </div>
                    ) : (
                      <div key={i} className={cx('rounded-2xl rounded-bl-md bg-white px-4 py-3 ring-1', t.error ? 'text-[#b83030] ring-[#b83030]/20' : 'text-ink ring-line')}>
                        <Md text={t.text} />
                        {!!t.steps?.length && (
                          <div className="mt-2 border-t border-line pt-2">
                            <button type="button" onClick={() => setOpenSteps(openSteps === i ? null : i)} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft/60 hover:text-ink">
                              Nelere bakıldı ({t.steps.length}) <ChevronDown className={cx('h-3.5 w-3.5 transition', openSteps === i && 'rotate-180')} />
                            </button>
                            {openSteps === i && (
                              <ul className="mt-1 space-y-0.5 text-xs text-ink-soft/70">
                                {t.steps.map((s, j) => (
                                  <li key={j}>
                                    • {s.purpose} {s.error ? <span className="text-[#b83030]">(hata)</span> : <span className="text-ink-soft/40">({s.rows} satır)</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    ),
                  )}
                  {busy && (
                    <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-ink-soft ring-1 ring-line">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-thread" style={{ animationDelay: `${d * 120}ms` }} />
                        ))}
                      </span>
                      Verilere bakılıyor…
                    </div>
                  )}
                </div>
              )}
              <div ref={end} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                ask(q)
              }}
              className="shrink-0 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-end gap-2 rounded-2xl bg-[#F4F3EF] p-1.5 ring-1 ring-line focus-within:ring-black/25">
                <textarea
                  ref={input}
                  rows={1}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      ask(q)
                    }
                  }}
                  placeholder="Ör. Gezer'e son 3 ayda ne sattık?"
                  className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-ink-soft/40"
                />
                <button type="submit" disabled={!q.trim() || busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-night text-white transition disabled:opacity-30" aria-label="Sor">
                  <ArrowUp className="h-5 w-5" />
                </button>
              </div>
            </form>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
