import { NextResponse } from 'next/server'
import { adminClient, authorize, recordRun, type SyncFn } from '@/lib/integrations/server'
import { syncInstagram, syncMetaAds } from '@/lib/integrations/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** ?part=reklam | instagram | hepsi (varsayılan: hepsi) */
const PARTS: Record<string, { channel: string; fn: SyncFn }> = {
  reklam: { channel: 'meta_reklam', fn: syncMetaAds },
  instagram: { channel: 'meta_instagram', fn: syncInstagram },
}

async function run(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 })
  }
  const who = await authorize(req, db)
  if (!who.ok) return NextResponse.json({ ok: false, message: who.message }, { status: who.status })
  const url = new URL(req.url)
  const part = url.searchParams.get('part') ?? 'hepsi'
  const days = url.searchParams.get('days') ? Math.max(1, Math.min(365, Number(url.searchParams.get('days')))) : undefined
  // Anahtarı olmayan bölüm cron'da atlanır (ör. reklam hesabı henüz bağlanmadıysa Instagram yine çalışır)
  const list = part === 'hepsi' ? Object.keys(PARTS).filter((p) => p !== 'reklam' || process.env.META_AD_ACCOUNT_ID) : [part]
  if (list.some((p) => !PARTS[p])) return NextResponse.json({ ok: false, message: `Bilinmeyen bölüm: ${part}` }, { status: 400 })
  const results = await Promise.all(list.map((p) => recordRun(db!, PARTS[p].channel, who.userId, () => PARTS[p].fn(db!, { days }))))
  if (results.length === 1) return NextResponse.json(results[0], { status: results[0].ok ? 200 : 502 })
  return NextResponse.json({ ok: results.every((r) => r.ok), results })
}
export const GET = run
export const POST = run
