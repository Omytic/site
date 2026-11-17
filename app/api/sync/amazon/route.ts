import { NextResponse } from 'next/server'
import { adminClient, authorize, recordRun, type SyncFn } from '@/lib/integrations/server'
import { syncAmazon } from '@/lib/integrations/amazon'
import { syncAmazonFinances, syncAmazonInventory, syncAmazonTraffic } from '@/lib/integrations/amazonPlus'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
// SP-API Avrupa bölgesi İrlanda'da
export const preferredRegion = 'dub1'

/** ?part=siparis | stok | finans | trafik | hepsi (varsayılan: siparis). Cron "hepsi"ni çağırır. */
const PARTS: Record<string, { channel: string; fn: SyncFn }> = {
  siparis: { channel: 'amazon', fn: syncAmazon },
  stok: { channel: 'amazon_stok', fn: syncAmazonInventory },
  finans: { channel: 'amazon_finans', fn: syncAmazonFinances },
  trafik: { channel: 'amazon_trafik', fn: syncAmazonTraffic },
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
  const part = url.searchParams.get('part') ?? 'siparis'
  const days = url.searchParams.get('days') ? Math.max(1, Math.min(180, Number(url.searchParams.get('days')))) : undefined
  const list = part === 'hepsi' ? Object.keys(PARTS) : [part]
  if (list.some((p) => !PARTS[p])) return NextResponse.json({ ok: false, message: `Bilinmeyen bölüm: ${part}` }, { status: 400 })
  // Hepsi aynı anda: her biri kendi süre sınırıyla çalışır, biri hata verse de diğerleri devam eder
  const results = await Promise.all(list.map((p) => recordRun(db!, PARTS[p].channel, who.userId, () => PARTS[p].fn(db!, { days }))))
  if (results.length === 1) return NextResponse.json(results[0], { status: results[0].ok ? 200 : 502 })
  return NextResponse.json({ ok: results.every((r) => r.ok), results })
}
export const GET = run
export const POST = run
