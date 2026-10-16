import { isValidEmail, isValidSlug, type RateLimiter } from '@qrfinity/core'
import { and, codes, eq, reports, type Database } from '@qrfinity/db'
import { ServiceError } from './errors'
import { rateKey, retryMessage } from './rate-limit'

export const REPORT_REASONS = {
  phishing: 'Phishing: asks for passwords, bank or card details',
  malware: 'Malware or a harmful download',
  scam: 'Scam or fraud',
  illegal: 'Illegal content',
  spam: 'Spam or misleading',
  other: 'Something else',
} as const
export type ReportReason = keyof typeof REPORT_REASONS

/** Finds the slug in what a reporter typed: a full short link, "qrfinity.link/abc1234" or just the slug. */
export function slugFromReported(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  const last = s.split('/').pop() ?? ''
  return isValidSlug(last) ? last : null
}

export async function createReport(
  db: Database,
  limiter: RateLimiter,
  rateSecret: string,
  input: {
    reported: string
    reason: string
    details?: string
    email?: string
    visitor: string
    shortDomain: string
  },
) {
  const reported = input.reported.trim().slice(0, 500)
  if (!reported)
    throw new ServiceError('Enter the short link or code you want to report.', 'invalid')
  if (!(input.reason in REPORT_REASONS)) throw new ServiceError('Choose a reason.', 'invalid')
  const email = input.email?.trim() ?? ''
  if (email && !isValidEmail(email))
    throw new ServiceError('Check your email address, or leave it empty.', 'invalid')
  const r = await limiter.hit(await rateKey(rateSecret, 'report', input.visitor), 10, 3600)
  if (!r.ok) throw new ServiceError(retryMessage(r.retryAfterSeconds), 'rate_limited')

  const slug = slugFromReported(reported)
  const [code] = slug
    ? await db
        .select({ id: codes.id })
        .from(codes)
        .where(and(eq(codes.domain, input.shortDomain), eq(codes.slug, slug)))
    : []
  await db.insert(reports).values({
    codeId: code?.id ?? null,
    reported,
    reason: input.reason,
    details: input.details?.trim().slice(0, 2000) || null,
    reporterEmail: email || null,
  })
  return { matched: !!code }
}
