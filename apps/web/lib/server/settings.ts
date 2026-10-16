import { CLOUDFLARE_PLANS, DEFAULT_FREE_CUSTOM_SLUGS, type CloudflarePlan } from '@qrfinity/core'
import { appSettings, eq, type Database } from '@qrfinity/db'
import { audit, type AdminContext } from './admin'
import { ServiceError } from './errors'

const FREE_CUSTOM_SLUGS = 'free_custom_slugs'

/** Free custom short links per account (admin setting; default 1). */
export async function getFreeCustomSlugAllowance(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, FREE_CUSTOM_SLUGS))
  const n = Number(row?.value)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_FREE_CUSTOM_SLUGS
}

/**
 * Changes the free allowance. Lowering it only affects new links: custom links people already
 * have keep working and stay theirs.
 */
export async function setFreeCustomSlugAllowance(ctx: AdminContext, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 50)
    throw new ServiceError('Enter a whole number from 0 to 50.', 'invalid')
  await ctx.db
    .insert(appSettings)
    .values({ key: FREE_CUSTOM_SLUGS, value, updatedBy: ctx.actor })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: ctx.actor, updatedAt: new Date() },
    })
  await audit(ctx.db, ctx.actor, 'setting.free_custom_slugs', 'setting', FREE_CUSTOM_SLUGS, {
    value,
  })
}

const CLOUDFLARE_PLAN = 'cloudflare_plan'

/** Which Cloudflare Workers plan the qrfinity.link account is on (admin setting; default free). */
export async function getCloudflarePlan(db: Database): Promise<CloudflarePlan> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, CLOUDFLARE_PLAN))
  return row?.value === 'paid' ? 'paid' : 'free'
}

export async function setCloudflarePlan(ctx: AdminContext, value: string) {
  if (!CLOUDFLARE_PLANS.includes(value as CloudflarePlan))
    throw new ServiceError('Choose free or paid.', 'invalid')
  await ctx.db
    .insert(appSettings)
    .values({ key: CLOUDFLARE_PLAN, value, updatedBy: ctx.actor })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: ctx.actor, updatedAt: new Date() },
    })
  await audit(ctx.db, ctx.actor, 'setting.cloudflare_plan', 'setting', CLOUDFLARE_PLAN, { value })
}
