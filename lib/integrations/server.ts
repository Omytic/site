import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SyncResult } from './importer'

/** Sunucuda servis anahtarıyla çalışan istemci. Asla tarayıcıya gitmez. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY tanımlı değil (Vercel → Environment Variables).')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * İsteği kim yaptı?
 *  - Panel kullanıcısı: Authorization: Bearer <oturum token'ı>
 *  - Vercel Cron: Authorization: Bearer <CRON_SECRET> (tanımlıysa) ya da vercel-cron user-agent'ı
 */
export async function authorize(req: Request, db: SupabaseClient): Promise<{ ok: true; userId: string | null } | { ok: false; status: number; message: string }> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && token === cronSecret) return { ok: true, userId: null }
  if (!cronSecret && (req.headers.get('user-agent') ?? '').startsWith('vercel-cron')) return { ok: true, userId: null }
  if (!token) return { ok: false, status: 401, message: 'Oturum gerekli' }
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return { ok: false, status: 401, message: 'Oturum geçersiz, tekrar giriş yapın' }
  const { data: prof } = await db.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
  if (!prof) return { ok: false, status: 403, message: 'Bu hesabın panele erişimi yok' }
  return { ok: true, userId: data.user.id }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Epoch ms → İstanbul saatine göre YYYY-MM-DD */
export function istanbulDate(ms: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
}

/** Senkron uçlarının ortak gövdesi: yetki, sync_runs kaydı, hata yönetimi. */
export async function runSync(req: Request, channel: 'trendyol' | 'hepsiburada' | 'amazon', fn: (db: SupabaseClient, opts: { days?: number }) => Promise<SyncResult>) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 })
  }
  const who = await authorize(req, db)
  if (!who.ok) return NextResponse.json({ ok: false, message: who.message }, { status: who.status })

  const url = new URL(req.url)
  const days = url.searchParams.get('days') ? Math.max(1, Math.min(90, Number(url.searchParams.get('days')))) : undefined

  const { data: run } = await db.from('sync_runs').insert({ channel, triggered_by: who.userId }).select('id').single()
  try {
    const r = await fn(db, { days })
    const message = [r.more ? 'devamı var' : '', r.linked ? `${r.linked} sipariş elle girilmiş kayda bağlandı` : '', r.unmatched.length ? `${r.unmatched.length} ürün kodu eşleşmedi` : ''].filter(Boolean).join(' · ') || null
    await db
      .from('sync_runs')
      .update({ status: 'tamam', finished_at: new Date().toISOString(), range_from: r.from, range_to: r.to, fetched: r.fetched, imported: r.imported, updated: r.updated, skipped: r.skipped, message })
      .eq('id', run?.id)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    await db.from('sync_runs').update({ status: 'hata', finished_at: new Date().toISOString(), message: String(e?.message ?? e).slice(0, 500) }).eq('id', run?.id)
    return NextResponse.json({ ok: false, message: e?.message ?? 'Senkron başarısız' }, { status: 502 })
  }
}
