import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { rateFor } from '@/lib/integrations/tcmb'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'

/** GET /api/kur?tarih=YYYY-MM-DD → o gün yapılan işlem için geçerli TCMB kuru (önceki iş gününün bülteni). */
export async function GET(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  const tarih = new URL(req.url).searchParams.get('tarih') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return NextResponse.json({ message: 'tarih YYYY-MM-DD olmalı' }, { status: 400 })
  try {
    const b = await rateFor(db, tarih)
    if (!b) return NextResponse.json({ message: 'Bu tarih için TCMB kuru bulunamadı. Kuru elle girin.' }, { status: 404 })
    return NextResponse.json({ forDate: tarih, bulletinDate: b.date, bulletin: b.bulletin, rates: b.rates })
  } catch (e: any) {
    return NextResponse.json({ message: `TCMB'ye ulaşılamadı: ${e.message}. Kuru elle girebilirsiniz.` }, { status: 502 })
  }
}
