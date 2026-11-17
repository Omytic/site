import { runSync } from '@/lib/integrations/server'
import { syncGoogleAds } from '@/lib/integrations/googleAds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const run = (req: Request) => runSync(req, 'google_ads', syncGoogleAds)
export const GET = run
export const POST = run
