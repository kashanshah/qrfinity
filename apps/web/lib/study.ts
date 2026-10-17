/**
 * The dead QR codes study (docs/data-story.md): how a checked code is classified and summarised.
 * Shared by the admin page (/admin/study) and the command-line script (scripts/data-story.ts).
 */
import { identifyQrService, SHORTENER_DOMAINS } from '@qrfinity/core'
import type { LinkCheck } from './server/link-check'

export const STUDY_CATEGORIES = [
  'menu',
  'poster',
  'window',
  'packaging',
  'flyer',
  'transport',
  'venue',
  'other',
] as const
export type StudyCategory = (typeof STUDY_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<StudyCategory, string> = {
  menu: 'Menus and tables',
  poster: 'Posters and noticeboards',
  window: 'Shop windows and doors',
  packaging: 'Packaging and labels',
  flyer: 'Flyers and cards',
  transport: 'Transport and parking',
  venue: 'Venues (hotels, gyms, museums…)',
  other: 'Other',
}

export type StudyOutcome = LinkCheck['outcome'] | 'unreadable' | 'not-a-link'

/** One check of a link. `manual`: someone opened it by hand, which settles the result. */
export type StudyCheck = { outcome: StudyOutcome; reason: string; at: string; manual?: true }

/** One code in the study, as both the admin page and the script see it. */
export type StudyEntry = {
  category: string
  /** 'url', 'wifi', 'vcard'…, or 'unreadable'. */
  type: string
  url: string | null
  service: string | null
  shortLink: boolean
  outcome: StudyOutcome | null
  reason: string | null
  /** Every check, oldest first; the last one is the current result. */
  checks: StudyCheck[]
}

const REASONS: Record<string, string> = {
  works: 'Works',
  deactivated: 'Turned off by the QR service (trial or plan ended)',
  broken: 'Page gone (error page)',
  'unreachable:dns': 'Domain no longer exists',
  'unreachable:timeout': 'Site not responding',
  'unreachable:connection': 'Site not responding',
  'unreachable:too-many-redirects': 'Redirect loop',
  uncertain: 'Refused an automated check: verify by hand',
  'not-a-link': 'Not a link (Wi-Fi, contact, text…): works offline',
  unreadable: 'Code could not be read from the photo',
}

export function reasonFor(r: LinkCheck | { outcome: 'unreadable' | 'not-a-link' }): string {
  if (r.outcome === 'not-checked') return `Not checked (${r.reason})`
  const key = r.outcome === 'unreachable' ? `unreachable:${r.reason}` : r.outcome
  return REASONS[key] ?? key
}

export const UNREADABLE_REASON = REASONS.unreadable!
export const NOT_A_LINK_REASON = REASONS['not-a-link']!

/** The QR service and whether the link goes through a short link (a QR service or a shortener). */
export function linkFacts(url: string): { service: string | null; shortLink: boolean } {
  const service = identifyQrService(url)?.name ?? null
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return { service, shortLink: !!service }
  }
  const shortener = (SHORTENER_DOMAINS as readonly string[]).some(
    (d) => !d.includes('/') && (host === d || host.endsWith(`.${d}`)),
  )
  return { service, shortLink: !!service || shortener }
}

/** Failed checks before a link counts as dead, and how far apart the first and last must be. */
export const RECHECK_AFTER_MS = 24 * 3600 * 1000

/**
 * Dead: a link that failed every check, with at least a day between the first and the last, or
 * one found not to work when opened by hand.
 */
export function isConfirmedDead(e: StudyEntry): boolean {
  const last = e.checks.at(-1)
  if (e.url && last?.manual) return last.outcome !== 'works'
  if (!e.url || e.checks.length < 2) return false
  if (e.checks.some((c) => c.outcome === 'works' || c.outcome === 'uncertain')) return false
  return Date.parse(last!.at) - Date.parse(e.checks[0]!.at) >= RECHECK_AFTER_MS
}

/** Failed its latest check but isn't confirmed yet: due for a re-check after a day. */
export function isPendingFailure(e: StudyEntry): boolean {
  return (
    !!e.url &&
    !!e.outcome &&
    e.outcome !== 'works' &&
    e.outcome !== 'uncertain' &&
    !e.checks.at(-1)?.manual &&
    !isConfirmedDead(e)
  )
}

export type Tally = { label: string; count: number; share: number }

const tally = (list: StudyEntry[], key: (e: StudyEntry) => string, total = list.length) => {
  const m = new Map<string, number>()
  for (const e of list) m.set(key(e), (m.get(key(e)) ?? 0) + 1)
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]): Tally => ({ label, count, share: total ? count / total : 0 }))
}

export type StudySummary = ReturnType<typeof summarizeStudy>

export function summarizeStudy(entries: StudyEntry[]) {
  const links = entries.filter((e) => e.url)
  const dead = links.filter(isConfirmedDead)
  const short = links.filter((e) => e.shortLink)
  const direct = links.filter((e) => !e.shortLink)
  const rate = (list: StudyEntry[]) => ({
    total: list.length,
    dead: list.filter(isConfirmedDead).length,
    share: list.length ? list.filter(isConfirmedDead).length / list.length : 0,
  })
  return {
    codes: entries.length,
    unreadable: entries.filter((e) => e.type === 'unreadable').length,
    links: links.length,
    dead: dead.length,
    deadShare: links.length ? dead.length / links.length : 0,
    pending: links.filter(isPendingFailure).length,
    verifyByHand: links.filter((e) => e.outcome === 'uncertain').length,
    shortLinks: rate(short),
    directLinks: rate(direct),
    byResult: tally(entries, (e) => e.reason ?? 'Not checked yet'),
    deadByReason: tally(dead, (e) => e.reason ?? ''),
    linksByCategory: tally(links, (e) => e.category || '(none)'),
    deadRateByCategory: [...new Set(links.map((e) => e.category || '(none)'))]
      .map((label) => {
        const r = rate(links.filter((e) => (e.category || '(none)') === label))
        return { label, count: r.dead, total: r.total, share: r.share }
      })
      .sort((a, b) => b.share - a.share),
    deadByService: tally(
      dead.filter((e) => e.service),
      (e) => e.service ?? '',
      dead.length,
    ),
  }
}

export const percent = (share: number) => `${(100 * share).toFixed(1)}%`
