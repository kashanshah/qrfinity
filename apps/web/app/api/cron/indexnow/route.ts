import { env } from '@/lib/server/env'
import { pagesToSubmit, submitToIndexNow } from '@/lib/server/indexnow'

export const dynamic = 'force-dynamic'

/**
 * Daily (vercel.json): submit pages whose `updated` date in the registry is within the last
 * two days. `?all=1` submits every page (run once at launch, and after big content changes).
 */
export async function GET(req: Request) {
  const secret = env.cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 })
  const all = new URL(req.url).searchParams.get('all') === '1'
  return Response.json(await submitToIndexNow(pagesToSubmit(all)))
}
