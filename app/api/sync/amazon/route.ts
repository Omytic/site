import { NextResponse } from 'next/server'
import { adminClient, authorize, recordRun, type SyncFn } from '@/lib/integrations/server'
import { syncAmazon } from '@/lib/integrations/amazon'
import { syncAmazonFinances, syncAmazonInventory, syncAmazonTraffic } from '@/lib/integrations/amazonPlus'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
// SP-API Avrupa bölgesi İrlanda'da
export const preferredRegion = 'dub1'

/** ?part=siparis | stok | finans | trafik | diger | hepsi (varsayılan: siparis). Gece önce siparis, 15 dk sonra diger çalışır. */
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
  // hepsi: siparişler + diğerleri (panel düğmesi). diger: stok, finans, trafik (gece, siparişlerden sonra ayrı çalışır)
  const list = part === 'hepsi' ? Object.keys(PARTS) : part === 'diger' ? ['stok', 'finans', 'trafik'] : [part]
  if (list.some((p) => !PARTS[p])) return NextResponse.json({ ok: false, message: `Bilinmeyen bölüm: ${part}` }, { status: 400 })
  const go = (p: string) => recordRun(db!, PARTS[p].channel, who.userId, () => PARTS[p].fn(db!, { days }))
  // Önce siparişler (stok eşitlemesi yeni satışları da hesaba katsın diye), sonra diğerleri aynı anda
  const results = list.includes('siparis') && list.length > 1 ? [await go('siparis'), ...(await Promise.all(list.filter((p) => p !== 'siparis').map(go)))] : await Promise.all(list.map(go))
  if (results.length === 1) return NextResponse.json(results[0], { status: results[0].ok ? 200 : 502 })
  return NextResponse.json({ ok: results.every((r) => r.ok), results })
}
export const GET = run
export const POST = run
