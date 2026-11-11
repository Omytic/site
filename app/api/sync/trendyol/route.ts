import { runSync } from '@/lib/integrations/server'
import { syncTrendyol } from '@/lib/integrations/trendyol'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
// Trendyol Türkiye'de; en yakın bölge
export const preferredRegion = 'fra1'

const run = (req: Request) => runSync(req, 'trendyol', syncTrendyol)
export const GET = run
export const POST = run
