/**
 * Redirect logic, kept free of Cloudflare bindings so it can be tested in plain Node.
 * index.ts wires it to KV, the Cache API, Hyperdrive and Analytics Engine.
 */
import {
  isValidSlug,
  parseLinkRecord,
  parseUserAgent,
  pickDestination,
  renderContactPage,
  resolveAccent,
  vcardFile,
  vcardFileName,
  verifyPassword,
  DEFAULT_PAGE_STYLE,
  type LinkRecord,
} from '@qrfinity/core/edge'
import { disabledPage, notFoundPage, passwordPage, pausedPage } from './pages'

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
  /** Records the scan after the response is sent, with the redirect rule that matched ('' = none). */
  recordScan(request: Request, record: LinkRecord, rule: string): Promise<void>
  waitUntil(promise: Promise<unknown>): void
  /** The clock for time-based rules (tests pass a fixed one). */
  now?: () => Date
  /** Throttles password attempts per visitor and code. Returns false when over the limit. */
  allowUnlock?: (request: Request, record: LinkRecord) => Promise<boolean>
}

/** The password from a posted form, or null. Bodies are small; anything big is refused. */
async function postedPassword(request: Request): Promise<string | null> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.startsWith('application/x-www-form-urlencoded')) return null
  const body = await request.text()
  if (body.length > 2048) return null
  return new URLSearchParams(body).get('password')
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
  // POST is only for the password form of a protected code (checked below).
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'POST') {
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

  const path = url.pathname.slice(1).replace(/\/$/, '')
  // "Save contact" on a contact card downloads /{slug}.vcf.
  const wantsVcf = path.endsWith('.vcf')
  const slug = wantsVcf ? path.slice(0, -4) : path
  if (!isValidSlug(slug)) return html(notFoundPage(deps.siteOrigin), 404)

  const domain = deps.defaultDomain
  const record = await resolveRecord(deps, request, domain, slug)
  if (!record) return html(notFoundPage(deps.siteOrigin, slug), 404)
  if (record.status === 'disabled') return html(disabledPage(deps.siteOrigin, slug), 403)
  if (record.status === 'paused') return html(pausedPage(deps.siteOrigin, slug), 200)

  // Password protection: ask first (the scan counts here), then check the posted password.
  let unlocked: string | undefined
  if (record.lock) {
    if (request.method !== 'POST') {
      if (request.method === 'GET')
        deps.waitUntil(deps.recordScan(request, record, '').catch(() => undefined))
      return html(passwordPage(deps.siteOrigin, slug, { vcf: wantsVcf }), 200)
    }
    if (deps.allowUnlock && !(await deps.allowUnlock(request, record)))
      return html(passwordPage(deps.siteOrigin, slug, { vcf: wantsVcf, error: 'slow-down' }), 429)
    const typed = await postedPassword(request)
    if (typed === null || !(await verifyPassword(typed, record.lock)))
      return html(passwordPage(deps.siteOrigin, slug, { vcf: wantsVcf, error: 'wrong' }), 401)
    unlocked = typed
  } else if (request.method === 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...baseHeaders, Allow: 'GET, HEAD' },
    })
  }

  if (record.page) {
    if (wantsVcf) {
      const file = vcardFile(record.page.fields)
      if (!file) return html(notFoundPage(deps.siteOrigin, slug), 404)
      return new Response(file, {
        headers: {
          ...baseHeaders,
          'Content-Type': 'text/vcard; charset=utf-8',
          'Content-Disposition': `inline; filename="${vcardFileName(record.page.fields)}"`,
        },
      })
    }
    // The page view is the scan; saving the contact afterwards isn't counted again.
    if (request.method === 'GET')
      deps.waitUntil(deps.recordScan(request, record, '').catch(() => undefined))
    const style = record.page.style ?? DEFAULT_PAGE_STYLE
    return html(
      renderContactPage({
        fields: record.page.fields,
        style,
        accent: resolveAccent(style.accent),
        slug,
        siteOrigin: deps.siteOrigin,
        ...(unlocked !== undefined ? { unlock: unlocked } : {}),
      }),
      200,
    )
  }
  if (wantsVcf) return html(notFoundPage(deps.siteOrigin, slug), 404)

  // Redirect rules: the first that matches the phone, country or time picks the destination.
  const cf = (request as Request & { cf?: { country?: string } }).cf
  const { dest, rule } = pickDestination(record.dest, record.rules, {
    os: parseUserAgent(request.headers.get('user-agent')).os,
    country: cf?.country ?? '',
    now: deps.now?.() ?? new Date(),
  })

  if (request.method === 'GET')
    deps.waitUntil(deps.recordScan(request, record, rule).catch(() => undefined))
  // 302, never 301: destinations (and which rule applies) change, so phones must not cache them.
  // After a password form, 303 so the browser follows with a GET.
  return new Response(null, {
    status: request.method === 'POST' ? 303 : 302,
    headers: { ...baseHeaders, Location: dest },
  })
}
