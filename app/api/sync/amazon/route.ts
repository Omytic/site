import { runSync } from '@/lib/integrations/server'
import { syncAmazon } from '@/lib/integrations/amazon'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
// SP-API Avrupa bölgesi İrlanda'da
export const preferredRegion = 'dub1'

const run = (req: Request) => runSync(req, 'amazon', syncAmazon)
export const GET = run
export const POST = run
