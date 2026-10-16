import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import zlib from 'node:zlib'

/**
 * Follows the link inside a scanned QR code and reports whether it still works, for the QR code
 * checker. The visitor asks for it explicitly; nothing about the link is stored or logged.
 *
 * Because the address comes from a visitor, every connection goes through `safeLookup`: the host
 * is resolved here, every address must be public, and the socket connects to the checked address
 * (so a second DNS answer can't point it at a private network). Only ports 80 and 443, at most 8
 * redirects, short timeouts, and at most 256 KB of the final page is read.
 */

export type LinkHop = { url: string; status: number }

export type LinkCheck =
  | { outcome: 'works'; finalUrl: string; status: number; hops: LinkHop[] }
  /** The page loads, but says the code or link has been turned off (a trial or plan ended). */
  | { outcome: 'deactivated'; finalUrl: string; status: number; hops: LinkHop[]; evidence: string }
  | { outcome: 'broken'; finalUrl: string; status: number; hops: LinkHop[] }
  /** The site refused an automated check (401, 403, 429…): it may still open in a browser. */
  | { outcome: 'uncertain'; finalUrl: string; status: number; hops: LinkHop[] }
  | {
      outcome: 'unreachable'
      finalUrl: string
      hops: LinkHop[]
      reason: 'dns' | 'timeout' | 'connection' | 'too-many-redirects'
    }
  | { outcome: 'not-checked'; reason: 'not-a-web-link' | 'private-address' | 'unusual-port' }

const MAX_REDIRECTS = 8
const HOP_TIMEOUT_MS = 6000
const TOTAL_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 256 * 1024
const USER_AGENT =
  'Mozilla/5.0 (compatible; QRfinityLinkCheck/1.0; +https://qrfinity.com/qr-code-checker)'

/** Private, loopback, link-local, carrier-grade NAT, multicast and other reserved ranges. */
const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96],
] as const)
  BLOCKED.addSubnet(net, prefix, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !BLOCKED.check(address, 'ipv4')
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
    if (mapped) return !BLOCKED.check(mapped[1]!, 'ipv4')
    return !BLOCKED.check(address, 'ipv6')
  }
  return false
}

class PrivateAddressError extends Error {}

/** Resolves like the system resolver, but refuses any answer that includes a non-public address. */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, '', 0)
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      return callback(new PrivateAddressError(hostname), '', 0)
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses)
    }
    callback(null, addresses[0]!.address, addresses[0]!.family)
  })
}

/** Phrases QR services and link shorteners show on a code that has been switched off. */
const DEACTIVATED = [
  /qr code (?:is|has been) (?:inactive|deactivated|disabled|paused|suspended)/i,
  /this qr code (?:is no longer active|has expired|is expired)/i,
  /(?:trial|subscription|plan) (?:has )?(?:expired|ended)/i,
  /(?:link|code) (?:is|has been) (?:deactivated|disabled|suspended)/i,
  /qr code (?:not|no longer) (?:active|available)/i,
]

type HopResult =
  | { status: number; location: string | null; body: string }
  | { error: 'dns' | 'timeout' | 'connection' | 'private' }

type Options = {
  /** Tests only: a resolver that allows the local test server. */
  lookup?: LookupFunction
  /** Tests only: allow the test server's port. */
  anyPort?: boolean
}

function requestOnce(
  url: URL,
  readBody: boolean,
  deadline: number,
  lookup: LookupFunction,
): Promise<HopResult> {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http
    const timeout = Math.min(HOP_TIMEOUT_MS, Math.max(1, deadline - Date.now()))
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup,
        timeout,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location ?? null
        const type = String(res.headers['content-type'] ?? '')
        if (!readBody || (status >= 300 && status < 400) || !/html|text/i.test(type)) {
          res.destroy()
          return resolve({ status, location, body: '' })
        }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
        const stream =
          enc === 'gzip'
            ? res.pipe(zlib.createGunzip())
            : enc === 'deflate'
              ? res.pipe(zlib.createInflate())
              : enc === 'br'
                ? res.pipe(zlib.createBrotliDecompress())
                : res
        const chunks: Buffer[] = []
        let size = 0
        const done = () => {
          res.destroy()
          resolve({ status, location, body: Buffer.concat(chunks).toString('utf8') })
        }
        stream.on('data', (c: Buffer) => {
          chunks.push(c)
          size += c.length
          if (size >= MAX_BODY_BYTES) done()
        })
        stream.on('end', done)
        stream.on('error', done)
      },
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ error: 'timeout' })
    })
    req.on('error', (e: NodeJS.ErrnoException) => {
      if (e instanceof PrivateAddressError) resolve({ error: 'private' })
      else if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') resolve({ error: 'dns' })
      else resolve({ error: 'connection' })
    })
    req.end()
  })
}

/** Visible text of an HTML page, roughly: enough to look for a "deactivated" notice. */
function visibleText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

export async function checkLink(input: string, options: Options = {}): Promise<LinkCheck> {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { outcome: 'not-checked', reason: 'not-a-web-link' }
  }
  const deadline = Date.now() + TOTAL_TIMEOUT_MS
  const hops: LinkHop[] = []
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return i === 0
        ? { outcome: 'not-checked', reason: 'not-a-web-link' }
        : { outcome: 'unreachable', finalUrl: url.href, hops, reason: 'connection' }
    }
    const oddPort = url.port && url.port !== '80' && url.port !== '443' && !options.anyPort
    if (url.username || url.password || oddPort) {
      return { outcome: 'not-checked', reason: 'unusual-port' }
    }
    if (Date.now() >= deadline) {
      return { outcome: 'unreachable', finalUrl: url.href, hops, reason: 'timeout' }
    }
    const r = await requestOnce(url, true, deadline, options.lookup ?? safeLookup)
    if ('error' in r) {
      if (r.error === 'private') return { outcome: 'not-checked', reason: 'private-address' }
      return { outcome: 'unreachable', finalUrl: url.href, hops, reason: r.error }
    }
    hops.push({ url: url.href, status: r.status })
    if (r.status >= 300 && r.status < 400 && r.location) {
      try {
        url = new URL(r.location, url)
      } catch {
        return { outcome: 'broken', finalUrl: url.href, status: r.status, hops }
      }
      continue
    }
    const finalUrl = url.href
    if ([401, 403, 405, 406, 429, 451, 503].includes(r.status)) {
      return { outcome: 'uncertain', finalUrl, status: r.status, hops }
    }
    if (r.status >= 400) return { outcome: 'broken', finalUrl, status: r.status, hops }
    const text = visibleText(r.body)
    for (const re of DEACTIVATED) {
      const m = re.exec(text)
      if (m) return { outcome: 'deactivated', finalUrl, status: r.status, hops, evidence: m[0] }
    }
    if (/\/(expired|inactive|deactivated|disabled)(\/|$|\?)/i.test(url.pathname)) {
      return { outcome: 'deactivated', finalUrl, status: r.status, hops, evidence: url.pathname }
    }
    return { outcome: 'works', finalUrl, status: r.status, hops }
  }
  return { outcome: 'unreachable', finalUrl: url.href, hops, reason: 'too-many-redirects' }
}
