import { effectivePlan, isPlan, type Plan } from '@qrfinity/core'
import { eq, subscriptions, user, type Database } from '@qrfinity/db'

/**
 * The plan in effect: the higher of the admin-set plan and any subscription that gives its plan
 * (active, trialing, or past due while the card is retried; see grantsPlan in @qrfinity/core).
 */
export async function effectivePlanFor(db: Database, userId: string): Promise<Plan> {
  const [[row], subs] = await Promise.all([
    db.select({ plan: user.plan }).from(user).where(eq(user.id, userId)),
    db
      .select({
        plan: subscriptions.plan,
        status: subscriptions.status,
        trialEnd: subscriptions.trialEnd,
        currentPeriodStart: subscriptions.currentPeriodStart,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId)),
  ])
  return effectivePlan(isPlan(row?.plan) ? row.plan : 'free', subs)
}
