import { isValidEmail, type RateLimiter } from '@qrfinity/core'
import { asc, count, eq, ilike, proWaitlist, type Database } from '@qrfinity/db'
import { audit, type AdminContext } from './admin'
import { ServiceError } from './errors'
import { likePattern, lower, paged, type ListOptions, type Orderable } from './listing'
import { rateKey, retryMessage } from './rate-limit'

/** Adds an address to the waitlist for paid plans. Joining twice is not an error; the reply is the same. */
export async function joinWaitlist(
  db: Database,
  limiter: RateLimiter,
  rateSecret: string,
  input: { email: string; visitor: string },
): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email) || email.length > 254)
    throw new ServiceError('Check your email address.', 'invalid')
  const r = await limiter.hit(await rateKey(rateSecret, 'waitlist', input.visitor), 10, 3600)
  if (!r.ok) throw new ServiceError(retryMessage(r.retryAfterSeconds), 'rate_limited')
  await db.insert(proWaitlist).values({ email }).onConflictDoNothing()
}

// ---------------------------------------------------------------------------
// Admin

export const WAITLIST_SORTS = ['email', 'joined'] as const
export type WaitlistSort = (typeof WAITLIST_SORTS)[number]

const waitlistWhere = (q: string) => {
  const term = q.trim()
  return term ? ilike(proWaitlist.email, likePattern(term)) : undefined
}

/** The waitlist for the admin page: newest first by default, searchable by email. */
export async function listWaitlist(db: Database, q = '', opts: ListOptions = {}) {
  const where = waitlistWhere(q)
  return paged(opts, {
    sorts: {
      email: lower(proWaitlist.email),
      joined: proWaitlist.createdAt,
    } satisfies Record<WaitlistSort, Orderable>,
    defaultSort: 'joined',
    defaultDir: 'desc',
    tiebreak: proWaitlist.email,
    count: async () => {
      const [r] = await db.select({ n: count() }).from(proWaitlist).where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select()
        .from(proWaitlist)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

/**
 * One CSV cell. Quotes when needed, and defuses values a spreadsheet would run as a formula
 * (a leading =, +, -, @, tab or carriage return).
 */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * The whole waitlist (or the rows matching a search) as CSV, oldest first, for an email tool.
 * Starts with a byte-order mark so Excel reads it as UTF-8. Every export is audited: it's a list
 * of personal email addresses leaving the system.
 */
export async function exportWaitlist(ctx: AdminContext, q = '') {
  const rows = await ctx.db
    .select()
    .from(proWaitlist)
    .where(waitlistWhere(q))
    .orderBy(asc(proWaitlist.createdAt), asc(proWaitlist.email))
  const lines = [
    'email,joined_at',
    ...rows.map((r) => `${csvCell(r.email)},${r.createdAt.toISOString()}`),
  ]
  await audit(ctx.db, ctx.actor, 'waitlist.export', 'waitlist', 'pro', {
    rows: rows.length,
    ...(q.trim() ? { search: q.trim() } : {}),
  })
  return { csv: '\uFEFF' + lines.join('\r\n') + '\r\n', rows: rows.length }
}

/** Removes someone who asked to be taken off the list. */
export async function removeFromWaitlist(ctx: AdminContext, email: string) {
  const [row] = await ctx.db.delete(proWaitlist).where(eq(proWaitlist.email, email)).returning()
  if (row) await audit(ctx.db, ctx.actor, 'waitlist.remove', 'waitlist', row.email)
}
