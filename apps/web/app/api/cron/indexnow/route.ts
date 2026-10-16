import { ALL_PAGES } from '@/content/registry'
import { env } from '@/lib/server/env'
import { submitToIndexNow } from '@/lib/server/indexnow'
import { absoluteUrl } from '@/lib/seo'

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
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const urls = ALL_PAGES.filter((p) => all || p.updated >= since).map((p) => absoluteUrl(p.path))
  return Response.json(await submitToIndexNow(urls))
}
