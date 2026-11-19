import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, authorize } from '@/lib/integrations/server'
import { buildDigest, digestHtml, digestParams, digestText, type Digest } from '@/lib/digest'
import { emailConfigured, sendEmail, sendWhatsAppTemplate, sendWhatsAppText, whatsappConfigured } from '@/lib/notify'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'
export const maxDuration = 60

const PANEL = process.env.PANEL_URL || 'https://omytic.com/admin'

/**
 * Sabah özeti.
 *  GET  (Vercel Cron)      → herkese gönderir (her sabah 08.30)
 *  GET  (panel kullanıcısı) → önizleme: veri + metin + hangi kanallar hazır
 *  POST (panel kullanıcısı) → şimdi gönder; ?alici=<id> ile tek kişiye deneme
 */
export async function GET(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  try {
    const d = await buildDigest(db)
    if (auth.userId) return NextResponse.json({ digest: d, text: digestText(d, PANEL), params: digestParams(d), channels: { whatsapp: whatsappConfigured(), email: emailConfigured() } })
    return NextResponse.json(await send(db, d))
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok || !auth.userId) return NextResponse.json({ message: auth.ok ? 'Oturum gerekli' : auth.message }, { status: auth.ok ? 401 : auth.status })
  try {
    const d = await buildDigest(db)
    const only = new URL(req.url).searchParams.get('alici')
    return NextResponse.json(await send(db, d, only))
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 })
  }
}

async function send(db: SupabaseClient, d: Digest, only?: string | null) {
  let q = db.from('notify_recipients').select('*').eq('active', true).contains('topics', ['ozet'])
  if (only) q = db.from('notify_recipients').select('*').eq('id', only)
  const { data: people, error } = await q
  if (error) throw new Error(error.message)
  const text = digestText(d, PANEL)
  const params = digestParams(d)
  const html = digestHtml(d, PANEL)
  const results: { name: string; channel: string; ok: boolean; error?: string }[] = []
  const log = async (channel: string, recipient: string, ok: boolean, err?: string, ref?: string) => {
    await db.from('notify_log').insert({ topic: 'ozet', channel, recipient, ok, error: err ?? null, ref: ref ?? null })
  }

  for (const p of people ?? []) {
    if (p.channels.includes('whatsapp') && p.phone) {
      if (!whatsappConfigured()) results.push({ name: p.name, channel: 'whatsapp', ok: false, error: 'WhatsApp bağlı değil' })
      else {
        try {
          // Önce tam metni dene (kişi son 24 saatte yazdıysa gider), olmazsa onaylı şablonla
          let id: string
          try {
            id = await sendWhatsAppText(p.phone, text)
          } catch (e: any) {
            if (!/131047|131026|re-engagement|24 hour/i.test(String(e.message))) throw e
            id = await sendWhatsAppTemplate(p.phone, params)
          }
          await log('whatsapp', p.phone, true, undefined, id)
          results.push({ name: p.name, channel: 'whatsapp', ok: true })
        } catch (e: any) {
          await log('whatsapp', p.phone, false, e.message)
          results.push({ name: p.name, channel: 'whatsapp', ok: false, error: e.message })
        }
      }
    }
    if (p.channels.includes('email') && p.email) {
      if (!emailConfigured()) results.push({ name: p.name, channel: 'email', ok: false, error: 'E-posta gönderimi ayarlı değil' })
      else {
        try {
          const id = await sendEmail(p.email, `OMY sabah özeti · ${params[0]}`, html, text)
          await log('email', p.email, true, undefined, id)
          results.push({ name: p.name, channel: 'email', ok: true })
        } catch (e: any) {
          await log('email', p.email, false, e.message)
          results.push({ name: p.name, channel: 'email', ok: false, error: e.message })
        }
      }
    }
  }
  return { ok: results.every((r) => r.ok), sent: results.filter((r) => r.ok).length, results }
}
