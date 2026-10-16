import {
  effectivePlan,
  grantsPlan,
  isPlan,
  type Billing,
  type BillingInterval,
  type PaidPlan,
  type Plan,
} from '@qrfinity/core'
import { and, desc, eq, isNull, subscriptions, user, type Database } from '@qrfinity/db'
import { audit } from './admin'
import { ServiceError } from './errors'

/**
 * Paid plans. Postgres keeps a copy of each subscription, refreshed from the provider on every
 * webhook (re-read, never trusted from the event body, so late or repeated events are harmless).
 */

/** The plan in effect: the higher of the admin-set plan and any paying subscription. */
export async function effectivePlanFor(db: Database, userId: string): Promise<Plan> {
  const [[row], subs] = await Promise.all([
    db.select({ plan: user.plan }).from(user).where(eq(user.id, userId)),
    db
      .select({ plan: subscriptions.plan, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId)),
  ])
  return effectivePlan(isPlan(row?.plan) ? row.plan : 'free', subs)
}

/** The subscription to show on the account page: a paying one first, else the latest. */
export async function currentSubscription(db: Database, userId: string) {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
  return subs.find((s) => grantsPlan(s.status)) ?? subs[0] ?? null
}

async function customerFor(db: Database, billing: Billing, userId: string) {
  const [row] = await db
    .select({ email: user.email, customerId: user.billingCustomerId })
    .from(user)
    .where(eq(user.id, userId))
  if (!row) throw new ServiceError('Sign in again to choose a plan.', 'invalid')
  if (row.customerId) return row.customerId
  const created = await billing.createCustomer({ userId, email: row.email })
  // Only fill an empty slot, so two tabs racing end up with one customer id.
  await db
    .update(user)
    .set({ billingCustomerId: created })
    .where(and(eq(user.id, userId), isNull(user.billingCustomerId)))
  const [saved] = await db
    .select({ customerId: user.billingCustomerId })
    .from(user)
    .where(eq(user.id, userId))
  return saved?.customerId ?? created
}

/**
 * Where "Choose a plan" sends someone: checkout for a first plan, or the billing portal when they
 * already pay (plan changes happen there, with proration).
 */
export async function planChangeUrl(
  db: Database,
  billing: Billing,
  userId: string,
  plan: PaidPlan,
  interval: BillingInterval,
  urls: { success: string; cancel: string; portalReturn: string },
) {
  const customerId = await customerFor(db, billing, userId)
  const current = await currentSubscription(db, userId)
  if (current && grantsPlan(current.status)) return billing.portalUrl(customerId, urls.portalReturn)
  return billing.checkoutUrl({
    customerId,
    plan,
    interval,
    successUrl: urls.success,
    cancelUrl: urls.cancel,
  })
}

export async function billingPortalUrl(
  db: Database,
  billing: Billing,
  userId: string,
  returnUrl: string,
) {
  const [row] = await db
    .select({ customerId: user.billingCustomerId })
    .from(user)
    .where(eq(user.id, userId))
  if (!row?.customerId) throw new ServiceError('You don’t have a paid plan yet.', 'invalid')
  return billing.portalUrl(row.customerId, returnUrl)
}

/** Re-reads one subscription from the provider and stores it. Unknown customers are ignored. */
export async function syncSubscription(db: Database, billing: Billing, subscriptionId: string) {
  const state = await billing.subscription(subscriptionId)
  if (!state) return null
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.billingCustomerId, state.customerId))
  if (!owner) {
    console.warn(`Subscription ${state.id} belongs to an unknown customer ${state.customerId}`)
    return null
  }
  const [before] = await db
    .select({ plan: subscriptions.plan, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.id, state.id))
  const values = {
    userId: owner.id,
    customerId: state.customerId,
    plan: state.plan,
    interval: state.interval,
    status: state.status,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  }
  await db
    .insert(subscriptions)
    .values({ id: state.id, ...values })
    .onConflictDoUpdate({ target: subscriptions.id, set: values })
  if (before?.plan !== state.plan || before?.status !== state.status)
    await audit(db, 'billing', 'billing.subscription', 'user', owner.id, {
      subscription: state.id,
      plan: state.plan,
      interval: state.interval,
      status: state.status,
    })
  return { userId: owner.id, ...state }
}

/** Verifies and applies a webhook. Throws on a bad signature. */
export async function handleBillingWebhook(
  db: Database,
  billing: Billing,
  rawBody: string,
  signature: string,
) {
  const event = await billing.webhook(rawBody, signature)
  if (event) await syncSubscription(db, billing, event.subscriptionId)
}

/**
 * Applies a finished checkout straight away when the customer comes back, so the new plan shows
 * without waiting for the webhook. Only for the signed-in user's own checkout.
 */
export async function syncCheckout(
  db: Database,
  billing: Billing,
  userId: string,
  checkoutId: string,
) {
  const [row] = await db
    .select({ customerId: user.billingCustomerId })
    .from(user)
    .where(eq(user.id, userId))
  const done = await billing.checkoutSubscription(checkoutId)
  if (!done || !row?.customerId || done.customerId !== row.customerId) return null
  return syncSubscription(db, billing, done.subscriptionId)
}

/** Account deletion: end every open subscription now, so a deleted account is never charged. */
export async function cancelSubscriptionsForDeletion(
  db: Database,
  billing: Billing,
  userId: string,
) {
  const [row] = await db
    .select({ customerId: user.billingCustomerId })
    .from(user)
    .where(eq(user.id, userId))
  if (!row?.customerId) return 0
  const open = await billing.openSubscriptions(row.customerId)
  for (const id of open) {
    await billing.cancelNow(id)
    await syncSubscription(db, billing, id)
  }
  return open.length
}
