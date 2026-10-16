/**
 * Redirect logic, kept free of Cloudflare bindings so it can be tested in plain Node.
 * index.ts wires it to KV, the Cache API, Hyperdrive and Analytics Engine.
 */
import { isValidSlug, parseLinkRecord, type LinkRecord } from '@qrfinity/core/edge'
import { disabledPage, notFoundPage, pausedPage } from './pages'

export type RedirectDeps = {
  defaultDomain: string
  siteOrigin: string
  /** KV read (with edge caching). Returns the parsed JSON or null. */
  getRecord(domain: string, slug: string): Promise<unknown>
  /** Writes a record found in Postgres back to KV. */
  putRecord(domain: string, slug: string, record: LinkRecord): Promise<void>
  /** Short-lived "not found" cache, so slug guessing can't hammer Postgres. */
  isKnownMissing(domain: string, slug: string): Promise<boolean>
  rememberMissing(domain: string, slug: string): Promise<void>
  /** Postgres fallback (read-only role, redirect_lookup view). Undefined when not configured. */
  lookupDatabase?: (domain: string, slug: string) => Promise<LinkRecord | null>
  /** Throttles database fallbacks per visitor. Returns false when over the limit. */
  allowFallback(request: Request): Promise<boolean>
  /** Records the scan after the response is sent. */
  recordScan(request: Request, record: LinkRecord): Promise<void>
  waitUntil(promise: Promise<unknown>): void
}

const baseHeaders = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
}

const html = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      ...baseHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  })

export async function resolveRecord(
  deps: RedirectDeps,
  request: Request,
  domain: string,
  slug: string,
): Promise<LinkRecord | null> {
  const cached = parseLinkRecord(await deps.getRecord(domain, slug))
  if (cached) return cached
  if (!deps.lookupDatabase || (await deps.isKnownMissing(domain, slug))) return null
  if (!(await deps.allowFallback(request))) return null
  const found = await deps.lookupDatabase(domain, slug)
  if (!found) {
    deps.waitUntil(deps.rememberMissing(domain, slug))
    return null
  }
  deps.waitUntil(deps.putRecord(domain, slug, found))
  return found
}

export async function handleRequest(request: Request, deps: RedirectDeps): Promise<Response> {
  const url = new URL(request.url)
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...baseHeaders, Allow: 'GET, HEAD' },
    })
  }
  if (url.pathname === '/robots.txt') {
    // Crawling is allowed so search engines see the noindex header and our warning pages.
    return new Response('User-agent: *\nAllow: /\n', {
      headers: { ...baseHeaders, 'Content-Type': 'text/plain' },
    })
  }
  if (url.pathname === '/' || url.pathname === '') {
    return new Response(null, {
      status: 302,
      headers: { ...baseHeaders, Location: deps.siteOrigin },
    })
  }

  const slug = url.pathname.slice(1).replace(/\/$/, '')
  if (!isValidSlug(slug)) return html(notFoundPage(deps.siteOrigin), 404)

  const domain = deps.defaultDomain
  const record = await resolveRecord(deps, request, domain, slug)
  if (!record) return html(notFoundPage(deps.siteOrigin, slug), 404)
  if (record.status === 'disabled') return html(disabledPage(deps.siteOrigin, slug), 403)
  if (record.status === 'paused') return html(pausedPage(deps.siteOrigin, slug), 200)

  if (request.method === 'GET')
    deps.waitUntil(deps.recordScan(request, record).catch(() => undefined))
  // 302, never 301: destinations are editable, so phones must not cache them.
  return new Response(null, { status: 302, headers: { ...baseHeaders, Location: record.dest } })
}
