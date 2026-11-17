import { runSync } from '@/lib/integrations/server'
import { syncAmazonAds } from '@/lib/integrations/amazonAds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const run = (req: Request) => runSync(req, 'amazon_ads', syncAmazonAds)
export const GET = run
export const POST = run
