import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuth } from './auth'
import type { ServiceContext } from './codes'
import { getDb } from './db'
import { getEdgeSync } from './edge-sync'
import { env } from './env'
import { PostgresRateLimiter } from './rate-limit'

export async function getSessionUser() {
  const session = await getAuth().api.getSession({ headers: await headers() })
  return session?.user ?? null
}

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
    userId: user.id,
    shortDomain: env.shortDomain,
    rateSecret: env.rateLimitSecret,
  }
}

export function shortLinkOrigin() {
  return env.shortLinkOrigin
}
