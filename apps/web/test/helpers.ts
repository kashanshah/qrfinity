import {
  DEFAULT_DESIGN,
  type EdgeSync,
  type LinkRecord,
  type RateLimiter,
  type ReputationResult,
  type UrlReputation,
} from '@qrfinity/core'
import { createDb, runMigrations, sql, user, type Database } from '@qrfinity/db'
import type { ServiceContext } from '@/lib/server/codes'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://qrfinity:qrfinity@localhost:5432/qrfinity_test'

export async function freshDb(): Promise<Database> {
  const admin = createDb(TEST_DATABASE_URL, { max: 1 })
  await admin.execute(
    sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
  )
  await admin.$client.end()
  await runMigrations(TEST_DATABASE_URL)
  return createDb(TEST_DATABASE_URL)
}

/** Records edge calls; can be told to fail. */
export class FakeEdge implements EdgeSync {
  calls: Array<{ op: 'put' | 'remove'; slug: string; record?: LinkRecord }> = []
  failing = false
  async put(_d: string, slug: string, record: LinkRecord) {
    if (this.failing) throw new Error('edge down')
    this.calls.push({ op: 'put', slug, record })
  }
  async remove(_d: string, slug: string) {
    if (this.failing) throw new Error('edge down')
    this.calls.push({ op: 'remove', slug })
  }
  last() {
    return this.calls.at(-1)
  }
}

/** Web Risk stand-in: flags any URL containing a listed fragment. */
export class FakeReputation implements UrlReputation {
  configured = true
  flagged = new Map<string, ReputationResult>()
  calls: string[] = []
  down = false
  async check(url: string): Promise<ReputationResult> {
    this.calls.push(url)
    if (this.down) return { status: 'unknown', reason: 'down' }
    for (const [fragment, r] of this.flagged) if (url.includes(fragment)) return r
    return { status: 'clean' }
  }
}

export async function makeUser(db: Database, id: string) {
  await db
    .insert(user)
    .values({ id, name: id, email: `${id}@example.com` })
    .onConflictDoNothing()
}

export function ctxFor(
  db: Database,
  userId: string,
  edge = new FakeEdge(),
  limiter: RateLimiter = new PostgresRateLimiter(db),
  reputation = new FakeReputation(),
): ServiceContext & { edge: FakeEdge; reputation: FakeReputation } {
  return { db, edge, limiter, reputation, userId, shortDomain: 'qrfinity.link', rateSecret: 'test' }
}

export const design = DEFAULT_DESIGN
