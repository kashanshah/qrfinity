import { getAnalytics } from '@/lib/server/analytics'
import { checkScanLimits } from '@/lib/server/codes'
import { getDb } from '@/lib/server/db'
import { getEdgeSync } from '@/lib/server/edge-sync'
import { env } from '@/lib/server/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Every 5 minutes (vercel.json): switch codes whose scan limit has been reached. */
export async function GET(req: Request) {
  const secret = env.cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 })
  return Response.json(await checkScanLimits(getDb(), getAnalytics(), getEdgeSync()))
}
