import {
  buildScanEvent,
  linkKey,
  parseLinkRecord,
  sha256Hex,
  signedHeaders,
  toDataPoint,
  type LinkRecord,
} from '@qrfinity/core/edge'
import postgres from 'postgres'
import { handleRequest } from './handler'

export interface Env {
  LINKS: KVNamespace
  SCANS: AnalyticsEngineDataset
  HYPERDRIVE?: Hyperdrive
  MISS_LIMIT?: RateLimit
  /** Password attempts per visitor and code. */
  UNLOCK_LIMIT?: RateLimit
  DEFAULT_DOMAIN: string
  SITE_ORIGIN: string
  /** Local development only: also send scans to the app's Postgres analytics backend. */
  SCAN_SINK_URL?: string
  SCAN_SINK_SECRET?: string
}

const SALT_TTL_SECONDS = 36 * 3600

/** Today's visitor-hash salt. Created on demand if the edge-api cron hasn't made it; expires on its own. */
async function dailySalt(env: Env): Promise<string> {
  const key = `salt:${new Date().toISOString().slice(0, 10)}`
  const existing = await env.LINKS.get(key, { cacheTtl: 3600 })
  if (existing) return existing
  const salt = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  await env.LINKS.put(key, salt, { expirationTtl: SALT_TTL_SECONDS })
  return salt
}

async function lookupDatabase(
  env: Env,
  ctx: ExecutionContext,
  domain: string,
  slug: string,
): Promise<LinkRecord | null> {
  if (!env.HYPERDRIVE) return null
  const sql = postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
    prepare: false,
  })
  try {
    const rows = await sql<
      {
        id: string
        user_id: string
        destination: string | null
        status: LinkRecord['status']
        version: number
        rules: unknown
        page: unknown
        password_hash: string | null
      }[]
    >`
      select id, user_id, destination, status, version, rules, page, password_hash from redirect_lookup where domain = ${domain} and slug = ${slug} limit 1`
    const r = rows[0]
    if (!r || (!r.destination && !r.page)) return null
    // Same checks as a KV record, so malformed rules are dropped rather than followed.
    return parseLinkRecord({
      id: r.id,
      owner: r.user_id,
      dest: r.destination ?? '',
      status: r.status,
      v: r.version,
      rules: r.rules,
      page: r.page,
      lock: r.password_hash,
    })
  } finally {
    ctx.waitUntil(sql.end())
  }
}

const negativeKey = (domain: string, slug: string) =>
  new Request(`https://negative-cache.invalid/${domain}/${slug}`)

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return handleRequest(request, {
      defaultDomain: env.DEFAULT_DOMAIN,
      siteOrigin: env.SITE_ORIGIN,
      getRecord: (domain, slug) =>
        env.LINKS.get(linkKey(domain, slug), { type: 'json', cacheTtl: 30 }),
      putRecord: async (domain, slug, record) => {
        const key = linkKey(domain, slug)
        // Don't overwrite a record the edge-api wrote while we were reading Postgres.
        if (!(await env.LINKS.get(key))) await env.LINKS.put(key, JSON.stringify(record))
      },
      isKnownMissing: async (domain, slug) =>
        !!(await caches.default.match(negativeKey(domain, slug))),
      rememberMissing: (domain, slug) =>
        caches.default.put(
          negativeKey(domain, slug),
          new Response('', { headers: { 'Cache-Control': 'max-age=300' } }),
        ),
      lookupDatabase: env.HYPERDRIVE
        ? (domain, slug) => lookupDatabase(env, ctx, domain, slug)
        : undefined,
      allowFallback: async (req) => {
        if (!env.MISS_LIMIT) return true
        // The limiter only sees a hash of the IP.
        const key = (await sha256Hex(req.headers.get('cf-connecting-ip') ?? 'unknown')).slice(0, 16)
        return (await env.MISS_LIMIT.limit({ key })).success
      },
      allowUnlock: async (req, record) => {
        if (!env.UNLOCK_LIMIT) return true
        // Keyed on a hash of the IP and the code: guessing one code doesn't lock out others.
        const ip = (await sha256Hex(req.headers.get('cf-connecting-ip') ?? 'unknown')).slice(0, 16)
        return (await env.UNLOCK_LIMIT.limit({ key: `${ip}:${record.id}` })).success
      },
      recordScan: async (req, record, rule) => {
        const cf = (req.cf ?? {}) as { country?: string; region?: string; city?: string }
        const event = await buildScanEvent({
          codeId: record.id,
          owner: record.owner,
          userAgent: req.headers.get('user-agent'),
          referer: req.headers.get('referer'),
          ip: req.headers.get('cf-connecting-ip'),
          country: cf.country,
          region: cf.region,
          city: cf.city,
          salt: await dailySalt(env),
          rule,
        })
        env.SCANS.writeDataPoint(toDataPoint(event))
        if (env.SCAN_SINK_URL && env.SCAN_SINK_SECRET) {
          const body = JSON.stringify(event)
          const path = new URL(env.SCAN_SINK_URL).pathname
          await fetch(env.SCAN_SINK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(await signedHeaders(env.SCAN_SINK_SECRET, 'POST', path, body)),
            },
            body,
          })
        }
      },
      waitUntil: (p) => ctx.waitUntil(p),
    })
  },
} satisfies ExportedHandler<Env>
