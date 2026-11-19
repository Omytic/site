import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, authorize } from '@/lib/integrations/server'
import { aiConfigured } from '@/lib/ai'
import { startJob, stepJob } from '@/lib/aiJobs'
import { contentJob, listingJob, weeklyJob } from '@/lib/aiPrompts'
import { emailConfigured, sendEmail } from '@/lib/notify'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'
export const maxDuration = 60

/**
 * Yapay zekâ raporları.
 *  POST { kind: 'icerik', brand }                                   → içerik fikirleri (web aramalı)
 *  POST { kind: 'urun_metni', brand, model, marketplaces, current } → ürün sayfası metni
 *  POST { kind: 'haftalik' }                                         → haftalık rapor
 *  POST { id }                                                       → yarım kalan işi sürdür
 *  GET  (Vercel Cron, pazartesi)                                     → haftalık raporu hazırla ve e-postayla gönder
 */
export async function POST(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok || !auth.userId) return NextResponse.json({ message: auth.ok ? 'Oturum gerekli' : auth.message }, { status: auth.ok ? 401 : auth.status })
  if (!aiConfigured()) return NextResponse.json({ message: 'ANTHROPIC_API_KEY tanımlı değil.' }, { status: 503 })
  const deadline = Date.now() + 52_000
  const body = await req.json().catch(() => ({}))
  try {
    let id: string = body.id
    if (!id) {
      const kind = String(body.kind)
      if (kind === 'icerik') {
        const brand = ['seryn', 'formstep', 'kumas'].includes(body.brand) ? body.brand : 'seryn'
        id = await startJob(db, { kind, brand, created_by: auth.userId }, await contentJob(db, brand))
      } else if (kind === 'urun_metni') {
        const o = { brand: String(body.brand ?? 'formstep'), model: String(body.model ?? '').slice(0, 100), marketplaces: (Array.isArray(body.marketplaces) ? body.marketplaces : ['Amazon', 'Trendyol']).slice(0, 3), current: body.current ? String(body.current) : undefined, notes: body.notes ? String(body.notes) : undefined }
        if (!o.model) return NextResponse.json({ message: 'Ürün seçin' }, { status: 400 })
        id = await startJob(db, { kind, brand: o.brand, subject: o.model, input: { marketplaces: o.marketplaces, notes: o.notes ?? null }, created_by: auth.userId }, await listingJob(db, o))
      } else if (kind === 'haftalik') {
        const spec = await weeklyJob(db)
        id = await startJob(db, { kind, subject: spec.subject, created_by: auth.userId }, spec)
      } else return NextResponse.json({ message: 'Bilinmeyen rapor türü' }, { status: 400 })
    }
    const r = await stepJob(db, id, deadline)
    return NextResponse.json({ id, ...r })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok || auth.userId) return NextResponse.json({ message: 'Sadece zamanlanmış görev' }, { status: 403 })
  if (!aiConfigured()) return NextResponse.json({ ok: false, skipped: true, message: 'ANTHROPIC_API_KEY tanımlı değil' })
  const deadline = Date.now() + 55_000
  const spec = await weeklyJob(db)
  const id = await startJob(db, { kind: 'haftalik', subject: spec.subject }, spec)
  let r = await stepJob(db, id, deadline)
  if (!r.done) return NextResponse.json({ ok: false, id, message: 'Rapor yetişmedi' })
  return NextResponse.json({ ok: r.status === 'hazir', id, sent: await mailWeekly(db, id) })
}

async function mailWeekly(db: SupabaseClient, id: string) {
  if (!emailConfigured()) return 0
  const [{ data: rep }, { data: people }] = await Promise.all([
    db.from('ai_reports').select('text,subject').eq('id', id).single(),
    db.from('notify_recipients').select('name,email').eq('active', true).contains('topics', ['haftalik']).contains('channels', ['email']),
  ])
  if (!rep?.text) return 0
  const html = mdToHtml(rep.text) + `<p style="margin-top:20px;font-size:13px;color:#6b6f7a">Ayrıntılar: <a href="${process.env.PANEL_URL || 'https://omytic.com/admin'}">OMY Panel</a></p>`
  let n = 0
  for (const p of people ?? []) {
    if (!p.email) continue
    try {
      await sendEmail(p.email, `OMY haftalık rapor · ${rep.subject}`, html, rep.text)
      await db.from('notify_log').insert({ topic: 'haftalik', channel: 'email', recipient: p.email, ok: true })
      n++
    } catch (e: any) {
      await db.from('notify_log').insert({ topic: 'haftalik', channel: 'email', recipient: p.email, ok: false, error: e.message })
    }
  }
  return n
}

/** Basit markdown → e-posta HTML'i (başlık, madde, kalın, tablo). */
function mdToHtml(md: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  const out: string[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
        i++
      }
      i--
      out.push(`<table style="border-collapse:collapse;margin:8px 0;font-size:14px">${rows.map((r, k) => `<tr>${r.map((c) => `<${k ? 'td' : 'th'} style="border:1px solid #e6e4de;padding:4px 8px;text-align:left">${inline(c)}</${k ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`)
    } else if (/^#{1,4}\s/.test(l)) out.push(`<h3 style="margin:16px 0 6px;font-size:16px">${inline(l.replace(/^#+\s/, ''))}</h3>`)
    else if (/^\s*[-*•]\s/.test(l)) out.push(`<div style="margin:2px 0 2px 12px">• ${inline(l.replace(/^\s*[-*•]\s/, ''))}</div>`)
    else if (l.trim()) out.push(`<p style="margin:6px 0">${inline(l)}</p>`)
  }
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#11131a;max-width:640px">${out.join('')}</div>`
}
