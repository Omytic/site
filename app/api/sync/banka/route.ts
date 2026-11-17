import { runSync } from '@/lib/integrations/server'
import { syncZiraat } from '@/lib/integrations/ziraat'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const preferredRegion = 'fra1'

const run = (req: Request) => runSync(req, 'ziraat', syncZiraat)
export const GET = run
export const POST = run
