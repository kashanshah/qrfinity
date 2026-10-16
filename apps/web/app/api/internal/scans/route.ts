import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRequest, type ScanEvent } from '@qrfinity/core'
import { scanEvents } from '@qrfinity/db'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'

export const dynamic = 'force-dynamic'

/**
 * Scan sink for the Postgres analytics backend (local development and self-hosting).
 * The redirect Worker posts signed events here; production uses Analytics Engine instead.
 */
export async function POST(req: Request) {
  const secret = env.scanSinkSecret
  if (env.analyticsBackend !== 'postgres' || !secret)
    return new Response('Not found', { status: 404 })
  const body = await req.text()
  const ok = await verifyRequest(secret, {
    method: 'POST',
    path: new URL(req.url).pathname,
    body,
    timestamp: Number(req.headers.get(TIMESTAMP_HEADER)),
    signature: req.headers.get(SIGNATURE_HEADER),
  })
  if (!ok) return new Response('Unauthorized', { status: 401 })
  const e = JSON.parse(body) as ScanEvent
  await getDb().insert(scanEvents).values({
    codeId: e.codeId,
    owner: e.owner,
    country: e.country,
    region: e.region,
    city: e.city,
    device: e.device,
    os: e.os,
    browser: e.browser,
    referrer: e.referrer,
    visitor: e.visitor,
  })
  return Response.json({ ok: true })
}
