import { NextResponse } from 'next/server'
import { adminClient, authorize, istanbulDate } from '@/lib/integrations/server'
import { bulletinOn } from '@/lib/integrations/tcmb'

export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'

/**
 * Her iş günü TCMB bülteninden sonra (16.00) çalışır: bugünün kurunu kaydeder,
 * dolar/euro fiyatlı ürünlerin TL satış fiyatını yeni kura göre günceller.
 */
async function run(req: Request) {
  let db
  try {
    db = adminClient()
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 503 })
  }
  const auth = await authorize(req, db)
  if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status })
  try {
    const b = await bulletinOn(db, istanbulDate(Date.now()))
    const { data: updated, error } = await db.rpc('refresh_fx_prices')
    if (error) throw new Error(error.message)
    return NextResponse.json({ bulletin: b ? { date: b.date, rates: b.rates } : null, updatedItems: updated })
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 502 })
  }
}
export const GET = run
export const POST = run
