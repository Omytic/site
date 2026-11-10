import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { trendyolConfigured } from '@/lib/integrations/trendyol'

export const dynamic = 'force-dynamic'

/** Hangi entegrasyonun anahtarları tanımlı? (Değerleri asla döndürmez.) */
export async function GET(req: Request) {
  let db
  try {
    db = adminClient()
  } catch {
    return NextResponse.json({ serviceRole: false, trendyol: trendyolConfigured(), hepsiburada: false, amazon: false })
  }
  const who = await authorize(req, db)
  if (!who.ok) return NextResponse.json({ message: who.message }, { status: who.status })
  return NextResponse.json({
    serviceRole: true,
    trendyol: trendyolConfigured(),
    hepsiburada: !!(process.env.HEPSIBURADA_MERCHANT_ID && process.env.HEPSIBURADA_USERNAME && process.env.HEPSIBURADA_PASSWORD),
    amazon: !!(process.env.AMAZON_SP_CLIENT_ID && process.env.AMAZON_SP_CLIENT_SECRET && process.env.AMAZON_SP_REFRESH_TOKEN),
    cron: !!process.env.CRON_SECRET,
  })
}
