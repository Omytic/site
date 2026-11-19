import { NextResponse } from 'next/server'
import { adminClient, authorize, recordRun, type SyncFn } from '@/lib/integrations/server'
import { syncAmazonFeedback, syncTrendyolQuestions } from '@/lib/integrations/feedback'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const preferredRegion = 'fra1'

/** Müşteri sesi: ?part=trendyol | amazon | hepsi (varsayılan hepsi) */
const PARTS: Record<string, { channel: string; fn: SyncFn }> = {
  trendyol: { channel: 'trendyol_soru', fn: syncTrendyolQuestions },
  amazon: { channel: 'amazon_geribildirim', fn: syncAmazonFeedback },
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
  const part = new URL(req.url).searchParams.get('part') ?? 'hepsi'
  const list = part === 'hepsi' ? Object.keys(PARTS) : [part]
  if (list.some((p) => !PARTS[p])) return NextResponse.json({ ok: false, message: `Bilinmeyen bölüm: ${part}` }, { status: 400 })
  const results = await Promise.all(list.map((p) => recordRun(db!, PARTS[p].channel, who.userId, () => PARTS[p].fn(db!, {}))))
  return NextResponse.json({ ok: results.every((r) => r.ok || (r as any).skipped), results })
}
export const GET = run
export const POST = run
