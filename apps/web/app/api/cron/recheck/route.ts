import { runRiskChecks } from '@/lib/server/admin'
import { getDb } from '@/lib/server/db'
import { getEdgeSync } from '@/lib/server/edge-sync'
import { env } from '@/lib/server/env'
import { getMailer } from '@/lib/server/mailer'
import { getReputation } from '@/lib/server/reputation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Daily (vercel.json): re-check due destinations against the blocklist and Google Web Risk. */
export async function GET(req: Request) {
  const secret = env.cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 })
  const summary = await runRiskChecks(
    {
      db: getDb(),
      edge: getEdgeSync(),
      mailer: getMailer(),
      abuseEmail: env.abuseEmail,
      siteUrl: env.appUrl,
    },
    getReputation(),
    env.recheckBudget,
  )
  return Response.json(summary)
}
