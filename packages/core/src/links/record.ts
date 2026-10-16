/** The record the redirect Worker reads from KV for every scan. Postgres is the source of truth. */
import { parsePage, type HostedPage } from './page'
import { parseRules, type RedirectRule } from './rules'

export const LINK_STATUSES = ['active', 'paused', 'disabled'] as const
export type LinkStatus = (typeof LINK_STATUSES)[number]

export type LinkRecord = {
  /** Code id (uuid): the Analytics Engine index. */
  id: string
  /** Where scans go. Empty for a hosted page, which the Worker shows instead. */
  dest: string
  status: LinkStatus
  /** Owner's user id, so account-wide analytics can filter on it. */
  owner: string
  /** Increases with every change; a lower version never overwrites a higher one. */
  v: number
  /** Redirect rules, checked in order before `dest`. Absent when none, or when paused. */
  rules?: RedirectRule[]
  /** A page served on the short domain instead of a redirect (a contact card). */
  page?: HostedPage
}

export function linkKey(domain: string, slug: string): string {
  return `l:${domain.toLowerCase()}:${slug}`
}

export function parseLinkRecord(value: unknown): LinkRecord | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  if (
    typeof r.id !== 'string' ||
    typeof r.dest !== 'string' ||
    typeof r.owner !== 'string' ||
    typeof r.v !== 'number' ||
    !LINK_STATUSES.includes(r.status as LinkStatus)
  ) {
    return null
  }
  const page = parsePage(r.page)
  if (r.status === 'active' && !page && !/^https?:\/\//i.test(r.dest)) return null
  // A hosted page never redirects, so rules don't apply to it.
  const rules = page ? undefined : parseRules(r.rules)
  return {
    id: r.id,
    dest: page ? '' : r.dest,
    status: r.status as LinkStatus,
    owner: r.owner,
    v: r.v,
    ...(rules ? { rules } : {}),
    ...(page ? { page } : {}),
  }
}

/** Builds the public short link for a code. `origin` overrides the domain in local development. */
export function shortLinkUrl(domain: string, slug: string, origin?: string): string {
  return `${origin ?? `https://${domain}`}/${slug}`
}
