/**
 * edge-api: writes and deletes link records in KV for the app. Every request must carry a
 * valid HMAC signature (see @qrfinity/core signing). Binding-free so it tests in plain Node.
 */
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  isValidSlug,
  linkKey,
  parseLinkRecord,
  verifyRequest,
} from '@qrfinity/core/edge'

export type KvLike = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

const DOMAIN_RE = /^[a-z0-9.-]{3,253}$/

export async function handleEdgeApi(
  request: Request,
  kv: KvLike,
  secret: string,
  nowSeconds?: number,
): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/v1/health') return json({ ok: true })

  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text()
  const valid = await verifyRequest(
    secret,
    {
      method: request.method,
      path: url.pathname,
      body,
      timestamp: Number(request.headers.get(TIMESTAMP_HEADER)),
      signature: request.headers.get(SIGNATURE_HEADER),
    },
    nowSeconds,
  )
  if (!valid) return json({ error: 'unauthorized' }, 401)

  // /v1/links/{domain}/{slug}
  const m = /^\/v1\/links\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (!m) return json({ error: 'not found' }, 404)
  const domain = decodeURIComponent(m[1]!).toLowerCase()
  const slug = decodeURIComponent(m[2]!)
  if (!DOMAIN_RE.test(domain) || !isValidSlug(slug)) return json({ error: 'bad link' }, 400)
  const key = linkKey(domain, slug)

  if (request.method === 'PUT') {
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return json({ error: 'bad json' }, 400)
    }
    const record = parseLinkRecord(parsed)
    if (!record) return json({ error: 'bad record' }, 400)
    const current = parseLinkRecord(JSON.parse((await kv.get(key)) ?? 'null'))
    // A delayed write must never replace a newer version.
    if (current && current.v > record.v) return json({ ok: true, kept: current.v })
    await kv.put(key, JSON.stringify(record))
    return json({ ok: true, v: record.v })
  }

  if (request.method === 'DELETE') {
    await kv.delete(key)
    return json({ ok: true })
  }

  return json({ error: 'method not allowed' }, 405)
}

const SALT_TTL_SECONDS = 36 * 3600

/** Creates tomorrow's salt ahead of time, so every location hashes with the same one. */
export async function prepareTomorrowsSalt(kv: KvLike, now = new Date()): Promise<string> {
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
  const key = `salt:${tomorrow}`
  if (!(await kv.get(key))) {
    const salt = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    // Salts expire on their own the day after, which makes old visitor hashes unlinkable.
    await kv.put(key, salt, { expirationTtl: SALT_TTL_SECONDS })
  }
  return key
}
