import {
  TRIAL_DAYS,
  grantsPlan,
  type Billing,
  type BillingInterval,
  type EdgeSync,
  type PaidPlan,
} from '@qrfinity/core'
import { and, desc, eq, isNull, subscriptions, user, type Database } from '@qrfinity/db'
import { audit } from './admin'
import { refreshAdvancedFeatures } from './codes'
import { ServiceError } from './errors'

/**
 * Paid plans. Postgres keeps a copy of each subscription, refreshed from the provider on every
 * webhook (re-read, never trusted from the event body, so late or repeated events are harmless).
 */

export { effectivePlanFor } from './plan'

/** True when the user has never had a subscription, so their first plan starts with a free month. */
export async function trialAvailable(db: Database, userId: string) {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)
  return !row
}

/** The subscription to show on the account page: a paying one first, else the latest. */
export async function currentSubscription(db: Database, userId: string) {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt))
  return subs.find((s) => grantsPlan(s)) ?? subs[0] ?? null
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
  if (current && grantsPlan(current)) return billing.portalUrl(customerId, urls.portalReturn)
  return billing.checkoutUrl({
    customerId,
    plan,
    interval,
    successUrl: urls.success,
    cancelUrl: urls.cancel,
    // The free month is for a first plan only: anyone who has subscribed before pays from day one.
    ...((await trialAvailable(db, userId)) ? { trialDays: TRIAL_DAYS } : {}),
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

/**
 * Re-reads one subscription from the provider and stores it, then applies the (possibly new)
 * allowance to the owner's codes. Unknown customers are ignored. With `edge`, codes whose advanced
 * features pause or resume are pushed now; otherwise the outbox cron pushes them.
 */
export async function syncSubscription(
  db: Database,
  billing: Billing,
  subscriptionId: string,
  edge?: EdgeSync,
) {
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
    currentPeriodStart: state.currentPeriodStart,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    trialEnd: state.trialEnd,
  }
  await db
    .insert(subscriptions)
    .values({ id: state.id, ...values })
    .onConflictDoUpdate({ target: subscriptions.id, set: values })
  await refreshAdvancedFeatures(db, owner.id, edge)
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
  edge?: EdgeSync,
) {
  const event = await billing.webhook(rawBody, signature)
  if (event) await syncSubscription(db, billing, event.subscriptionId, edge)
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
  edge?: EdgeSync,
) {
  const [row] = await db
    .select({ customerId: user.billingCustomerId })
    .from(user)
    .where(eq(user.id, userId))
  const done = await billing.checkoutSubscription(checkoutId)
  if (!done || !row?.customerId || done.customerId !== row.customerId) return null
  return syncSubscription(db, billing, done.subscriptionId, edge)
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
