import { runSync } from '@/lib/integrations/server'
import { syncHepsiburada } from '@/lib/integrations/hepsiburada'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const preferredRegion = 'fra1'

const run = (req: Request) => runSync(req, 'hepsiburada', syncHepsiburada)
export const GET = run
export const POST = run
