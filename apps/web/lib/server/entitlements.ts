import {
  entitlements,
  isFeature,
  isPlan,
  type Feature,
  type FeatureFlag,
  type Plan,
} from '@qrfinity/core'
import { eq, featureFlags, inArray, user, type Database } from '@qrfinity/db'
import { audit, type AdminContext } from './admin'
import { ServiceError } from './errors'

let cache: { at: number; flags: FeatureFlag[] } | null = null
const TTL_MS = 30_000

/** All feature flags, cached for 30 seconds per server instance. */
export async function loadFlags(db: Database): Promise<FeatureFlag[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags
  const rows = await db.select().from(featureFlags)
  const flags = rows.flatMap((r) =>
    isFeature(r.key) ? [{ key: r.key, enabled: r.enabled, userIds: r.userIds }] : [],
  )
  cache = { at: Date.now(), flags }
  return flags
}

export function invalidateFlags() {
  cache = null
}

/** What a user can use: their plan plus flags. Free features are always included. */
export async function getEntitlements(db: Database, userId: string): Promise<Set<Feature>> {
  const [row] = await db.select({ plan: user.plan }).from(user).where(eq(user.id, userId))
  const plan: Plan = isPlan(row?.plan) ? row.plan : 'free'
  return entitlements(plan, await loadFlags(db), userId)
}

export async function setUserPlan(ctx: AdminContext, userId: string, plan: string) {
  if (!isPlan(plan))
    throw new ServiceError('Choose free, starter, plus, pro or unlimited.', 'invalid')
  await ctx.db.update(user).set({ plan }).where(eq(user.id, userId))
  await audit(ctx.db, ctx.actor, 'user.plan', 'user', userId, { plan })
}

/**
 * Switches a flag on for everyone, or for the listed users (by email). Unknown emails are
 * refused so a typo can't silently do nothing.
 */
export async function setFlag(
  ctx: AdminContext,
  key: string,
  input: { enabled: boolean; emails: string[] },
) {
  if (!isFeature(key)) throw new ServiceError('Unknown feature.', 'invalid')
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const found = emails.length
    ? await ctx.db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(inArray(user.email, emails))
    : []
  const missing = emails.filter((e) => !found.some((f) => f.email.toLowerCase() === e))
  if (missing.length) throw new ServiceError(`No account for ${missing.join(', ')}.`, 'invalid')
  const values = {
    key,
    enabled: input.enabled,
    userIds: found.map((f) => f.id),
    updatedBy: ctx.actor,
  }
  await ctx.db
    .insert(featureFlags)
    .values(values)
    .onConflictDoUpdate({ target: featureFlags.key, set: { ...values, updatedAt: new Date() } })
  invalidateFlags()
  await audit(ctx.db, ctx.actor, 'flag.set', 'flag', key, {
    enabled: input.enabled,
    users: emails.length,
  })
}

/** Flags with the emails of their listed users, for the admin page. */
export async function listFlags(db: Database) {
  const flags = await db.select().from(featureFlags)
  const ids = [...new Set(flags.flatMap((f) => f.userIds))]
  const people = ids.length
    ? await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, ids))
    : []
  const email = new Map(people.map((p) => [p.id, p.email]))
  return new Map(
    flags.map((f) => [
      f.key,
      {
        enabled: f.enabled,
        emails: f.userIds.map((id) => email.get(id) ?? id),
        updatedAt: f.updatedAt,
      },
    ]),
  )
}
