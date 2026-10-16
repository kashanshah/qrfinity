/**
 * One scan → one Analytics Engine data point. The blob order is fixed here and used by
 * both the writer (redirect Worker) and the SQL queries, so they can't drift apart.
 * No raw IP is ever written: uniqueness uses a hash with a salt that rotates daily.
 */
import { sha256Hex } from '../links/signing'
import { parseUserAgent, type DeviceType } from './ua'

export const SCAN_DATASET = 'qrfinity_scans'

/** blob1 … blob10, in order. New fields only ever go at the end. */
export const SCAN_BLOBS = [
  'country',
  'region',
  'city',
  'device',
  'os',
  'browser',
  'referrer',
  'visitor',
  'owner',
  /** The redirect rule that sent the scan ('' = the main destination). */
  'rule',
] as const
export type ScanBlob = (typeof SCAN_BLOBS)[number]
export const blobColumn = (name: ScanBlob) => `blob${SCAN_BLOBS.indexOf(name) + 1}`

export type ScanEvent = {
  codeId: string
  owner: string
  country: string
  region: string
  city: string
  device: DeviceType
  os: string
  browser: string
  referrer: string
  visitor: string
  rule: string
}

export type ScanRequestInfo = {
  codeId: string
  owner: string
  userAgent: string | null
  referer: string | null
  ip: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  /** Today's salt (rotated daily, then deleted). */
  salt: string
  /** Label of the redirect rule that matched, or '' for the main destination. */
  rule?: string
}

export function refererHost(referer: string | null | undefined): string {
  if (!referer) return ''
  try {
    return new URL(referer).hostname.slice(0, 100)
  } catch {
    return ''
  }
}

/** Truncated SHA-256 of salt + IP + user agent + code: unique per visitor per code per day. */
export async function visitorHash(
  salt: string,
  ip: string,
  ua: string,
  codeId: string,
): Promise<string> {
  return (await sha256Hex(`${salt}|${ip}|${ua}|${codeId}`)).slice(0, 16)
}

export async function buildScanEvent(info: ScanRequestInfo): Promise<ScanEvent> {
  const ua = parseUserAgent(info.userAgent)
  return {
    codeId: info.codeId,
    owner: info.owner,
    country: (info.country ?? '').slice(0, 2).toUpperCase(),
    region: (info.region ?? '').slice(0, 80),
    city: (info.city ?? '').slice(0, 80),
    device: ua.device,
    os: ua.os,
    browser: ua.browser,
    referrer: refererHost(info.referer),
    visitor: info.ip
      ? await visitorHash(info.salt, info.ip, info.userAgent ?? '', info.codeId)
      : '',
    rule: (info.rule ?? '').slice(0, 60),
  }
}

export function toDataPoint(e: ScanEvent): {
  indexes: string[]
  blobs: string[]
  doubles: number[]
} {
  return { indexes: [e.codeId], blobs: SCAN_BLOBS.map((b) => e[b]), doubles: [1] }
}
