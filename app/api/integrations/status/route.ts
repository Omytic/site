import { NextResponse } from 'next/server'
import { adminClient, authorize } from '@/lib/integrations/server'
import { trendyolConfigured } from '@/lib/integrations/trendyol'
import { amazonConfigured } from '@/lib/integrations/amazon'
import { amazonAdsConfigured } from '@/lib/integrations/amazonAds'
import { googleAdsConfigured } from '@/lib/integrations/googleAds'
import { ziraatConfigured } from '@/lib/integrations/ziraat'
import { hepsiburadaConfigured } from '@/lib/integrations/hepsiburada'
import { metaAdsConfigured, metaConfigured } from '@/lib/integrations/meta'

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
    hepsiburada: hepsiburadaConfigured(),
    amazon: amazonConfigured(),
    meta: metaConfigured(),
    meta_ads: metaAdsConfigured(),
    google_ads: googleAdsConfigured(),
    amazon_ads: amazonAdsConfigured(),
    ziraat: ziraatConfigured(),
    cron: !!process.env.CRON_SECRET,
  })
}
