import { lt, rateLimits, sql } from '@qrfinity/db'
import { processOutbox } from '@/lib/server/codes'
import { getDb } from '@/lib/server/db'
import { getEdgeSync } from '@/lib/server/edge-sync'
import { env } from '@/lib/server/env'

export const dynamic = 'force-dynamic'

/** Every minute (vercel.json): retry queued edge updates and clear old rate-limit windows. */
export async function GET(req: Request) {
  const secret = env.cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const db = getDb()
  const result = await processOutbox(db, getEdgeSync())
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, sql`now() - interval '2 days'`))
  return Response.json(result)
}
