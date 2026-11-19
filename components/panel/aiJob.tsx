'use client'

import { Fragment, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cx } from './ui'

export type AiReport = {
  id: string; kind: string; brand: string | null; subject: string | null; status: 'calisiyor' | 'hazir' | 'hata'
  input: any; result: any; text: string | null; sources: { url: string; title: string }[] | null; error: string | null
  created_at: string; created_by: string | null
}

/** Raporu başlatır ve bitene kadar "devam" ister (her istek ~50 sn). */
export async function runAiJob(body: object, onStep?: (n: number) => void) {
  const { data } = await supabase.auth.getSession()
  const headers = { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' }
  let payload: object = body
  for (let i = 0; i < 8; i++) {
    onStep?.(i)
    const res = await fetch('/api/ai/rapor', { method: 'POST', headers, body: JSON.stringify(payload) })
    const b = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(b.message ?? 'Rapor hazırlanamadı')
    if (b.status === 'hata') throw new Error(b.error ?? 'Rapor hazırlanamadı')
    if (b.done) return b.id as string
    payload = { id: b.id }
  }
  throw new Error('Rapor çok uzun sürdü, birazdan listeden kontrol edin.')
}

export function CopyBtn({ text, label = 'Kopyala', className }: { text: string; label?: string; className?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setOk(true)
          setTimeout(() => setOk(false), 1600)
        } catch {}
      }}
      className={cx('inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-black/5 hover:text-ink', className)}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {ok ? 'Kopyalandı' : label}
    </button>
  )
}

/** Basit markdown gösterimi: başlık, madde, kalın, tablo */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>))
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
        <div key={i} className="my-3 overflow-x-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, k) => (
                <tr key={k} className={cx(k === 0 ? 'bg-black/[0.03] font-semibold text-ink-soft' : 'border-t border-line')}>
                  {r.map((c, j) => (
                    <td key={j} className={cx('px-3 py-1.5', j > 0 && 'text-right tabular-nums')}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    } else if (/^#{1,4}\s/.test(l)) out.push(<p key={i} className="mt-4 font-display text-lg font-black text-ink first:mt-0">{inline(l.replace(/^#+\s/, ''))}</p>)
    else if (/^\s*[-*•]\s+/.test(l)) out.push(<p key={i} className="pl-4 -indent-3">• {inline(l.replace(/^\s*[-*•]\s+/, ''))}</p>)
    else if (/^\s*\d+[.)]\s+/.test(l)) out.push(<p key={i} className="pl-4 -indent-3">{inline(l.trim())}</p>)
    else if (l.trim()) out.push(<p key={i}>{inline(l)}</p>)
    else out.push(<div key={i} className="h-2" />)
  }
  return <div className="space-y-1 text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">{out}</div>
}
