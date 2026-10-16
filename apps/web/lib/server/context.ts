import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { isAdmin, type AdminContext } from './admin'
import { getAuth } from './auth'
import { getMailer } from './mailer'
import type { ServiceContext } from './codes'
import { getDb } from './db'
import { getEdgeSync } from './edge-sync'
import { env } from './env'
import { PostgresRateLimiter } from './rate-limit'
import { getReputation } from './reputation'

/**
 * The signed-in user. Cached for the request, so a layout and its page share one session lookup
 * instead of each going to the database.
 */
export const getSessionUser = cache(async () => {
  const session = await getAuth().api.getSession({ headers: await headers() })
  return session?.user ?? null
})

/** The signed-in user, or a redirect to sign-in that comes back to `next`. */
export async function requireUser(next = '/dashboard') {
  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`)
  return user
}

export async function serviceContext(
  next?: string,
): Promise<ServiceContext & { user: Awaited<ReturnType<typeof requireUser>> }> {
  const user = await requireUser(next)
  const db = getDb()
  return {
    user,
    db,
    edge: getEdgeSync(),
    limiter: new PostgresRateLimiter(db),
    reputation: getReputation(),
    userId: user.id,
    shortDomain: env.shortDomain,
    rateSecret: env.rateLimitSecret,
  }
}

export function shortLinkOrigin() {
  return env.shortLinkOrigin
}

/** Admin pages and actions: anyone else gets a plain 404, so /admin isn't discoverable. */
export async function adminContext(): Promise<AdminContext> {
  const user = await requireUser('/admin')
  if (!isAdmin(user as { email: string; role?: string }, env.adminEmails)) notFound()
  return {
    db: getDb(),
    edge: getEdgeSync(),
    mailer: getMailer(),
    actor: user.id,
    abuseEmail: env.abuseEmail,
    siteUrl: env.appUrl,
  }
}
