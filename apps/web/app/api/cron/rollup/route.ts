import { getAnalytics } from '@/lib/server/analytics'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { runRollup } from '@/lib/server/rollup'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily (vercel.json): roll yesterday's scans into scan_daily so history outlives Analytics
 * Engine's 90-day retention. `?days=90` backfills (run once after the first deploy).
 */
export async function GET(req: Request) {
  const secret = env.cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 })
  const days = Number(new URL(req.url).searchParams.get('days')) || 2
  return Response.json(await runRollup(getDb(), getAnalytics(), { days }))
}
