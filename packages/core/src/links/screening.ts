/**
 * Destination screening rules that don't need a network call: known URL shorteners and
 * a configurable blocklist (domains, top-level domains, URL substrings). The Web Risk
 * reputation check runs on top of these in the app.
 */

/** Other shorteners (and QR redirectors) hide the real destination, so they're refused. */
export const SHORTENER_DOMAINS = [
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'shorturl.at',
  'rb.gy',
  'tiny.cc',
  's.id',
  't.ly',
  'bl.ink',
  'v.gd',
  'shorte.st',
  'adf.ly',
  'bc.vc',
  'soo.gd',
  'clck.ru',
  'qps.ru',
  'u.to',
  'lnkd.in',
  'trib.al',
  'dlvr.it',
  'tinyurl.is',
  'short.io',
  'shor.by',
  'lnk.bio',
  'qrco.de',
  'qr1.be',
  'l.ead.me',
  'qr.codes',
  'qrfy.io',
  'me-qr.com',
  'qr.io',
  'linktr.ee/s',
] as const

export type BlocklistKind = 'domain' | 'tld' | 'contains'
export type BlocklistEntry = { kind: BlocklistKind; value: string; reason?: string | null }

export type ScreeningHit = { rule: 'shortener' | BlocklistKind; value: string; message: string }

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith('.' + domain)

export function screenDestination(
  url: string,
  blocklist: readonly BlocklistEntry[] = [],
): ScreeningHit | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      rule: 'contains',
      value: url,
      message: 'Enter a full web address, like example.com/menu.',
    }
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  const hostPath = host + parsed.pathname.toLowerCase()
  for (const s of SHORTENER_DOMAINS) {
    const matches = s.includes('/') ? hostPath.startsWith(s) : hostMatches(host, s)
    if (matches) {
      return {
        rule: 'shortener',
        value: s,
        message:
          'Short links from other services hide where they go. Use the final address instead.',
      }
    }
  }
  const lowerUrl = url.toLowerCase()
  for (const e of blocklist) {
    const v = e.value.toLowerCase().trim()
    if (!v) continue
    const hit =
      (e.kind === 'domain' && hostMatches(host, v.replace(/^\*\./, ''))) ||
      (e.kind === 'tld' && host.endsWith('.' + v.replace(/^\./, ''))) ||
      (e.kind === 'contains' && lowerUrl.includes(v))
    if (hit) {
      return {
        rule: e.kind,
        value: e.value,
        message: 'We don’t allow codes that point to this address. See our acceptable use policy.',
      }
    }
  }
  return null
}

/** Web Risk threat types. The first two are confident enough to turn a live code off automatically. */
export const HIGH_CONFIDENCE_THREATS = ['MALWARE', 'SOCIAL_ENGINEERING'] as const
export const ALL_THREATS = [
  ...HIGH_CONFIDENCE_THREATS,
  'UNWANTED_SOFTWARE',
  'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
] as const
export type ThreatType = (typeof ALL_THREATS)[number]

export type ReputationResult =
  | { status: 'clean' }
  | { status: 'threat'; threats: ThreatType[] }
  /** The check couldn't run (not configured, timeout, quota). */
  | { status: 'unknown'; reason: string }

export function isHighConfidence(threats: readonly ThreatType[]): boolean {
  return threats.some((t) => (HIGH_CONFIDENCE_THREATS as readonly string[]).includes(t))
}
