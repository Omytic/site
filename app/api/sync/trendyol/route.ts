import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { syncTrendyol } from '@/lib/integrations/trendyol'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
// Trendyol Türkiye'de; en yakın bölge
export const preferredRegion = 'fra1'

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
  const days = url.searchParams.get('days') ? Math.max(1, Math.min(90, Number(url.searchParams.get('days')))) : undefined

  const { data: run } = await db.from('sync_runs').insert({ channel: 'trendyol', triggered_by: who.userId }).select('id').single()
  try {
    const r = await syncTrendyol(db, { days })
    await db
      .from('sync_runs')
      .update({ status: 'tamam', finished_at: new Date().toISOString(), range_from: r.from, range_to: r.to, fetched: r.fetched, imported: r.imported, updated: r.updated, skipped: r.skipped, message: [r.linked ? `${r.linked} sipariş elle girilmiş kayda bağlandı` : '', r.unmatched.length ? `${r.unmatched.length} ürün kodu eşleşmedi` : ''].filter(Boolean).join(' · ') || null })
      .eq('id', run?.id)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    await db.from('sync_runs').update({ status: 'hata', finished_at: new Date().toISOString(), message: String(e?.message ?? e).slice(0, 500) }).eq('id', run?.id)
    return NextResponse.json({ ok: false, message: e?.message ?? 'Senkron başarısız' }, { status: 502 })
  }
}

export const GET = run
export const POST = run
