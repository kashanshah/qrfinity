import { headers } from 'next/headers'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { checkLink } from '@/lib/server/link-check'
import { LIMITS, PostgresRateLimiter, rateKey, retryMessage } from '@/lib/server/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * The QR code checker's "does this link still work?" button. The link is checked and answered;
 * it is never stored or logged. Rate-limited per visitor (a keyed hash, never the raw IP).
 */
export async function POST(req: Request) {
  let url = ''
  try {
    const body = (await req.json()) as { url?: unknown }
    url = typeof body.url === 'string' ? body.url.slice(0, 2048) : ''
  } catch {
    // fall through to the empty-url answer
  }
  if (!url) return Response.json({ error: 'No link to check.' }, { status: 400 })

  const h = await headers()
  const visitor = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
  const { limit, window } = LIMITS.linkCheckPerVisitor
  const r = await new PostgresRateLimiter(getDb()).hit(
    await rateKey(env.rateLimitSecret, 'link-check', visitor),
    limit,
    window,
  )
  if (!r.ok) return Response.json({ error: retryMessage(r.retryAfterSeconds) }, { status: 429 })

  return Response.json(await checkLink(url), { headers: { 'Cache-Control': 'no-store' } })
}
