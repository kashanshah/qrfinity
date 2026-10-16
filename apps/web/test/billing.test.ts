import {
  WebhookSignatureError,
  type Billing,
  type BillingInterval,
  type PaidPlan,
  type SubscriptionState,
} from '@qrfinity/core'
import { auditLog, eq, sql, subscriptions, user, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cancelSubscriptionsForDeletion,
  effectivePlanFor,
  handleBillingWebhook,
  planChangeUrl,
  syncCheckout,
  syncSubscription,
} from '@/lib/server/billing'
import { advancedCodeUsage } from '@/lib/server/codes'
import { getEntitlements, invalidateFlags } from '@/lib/server/entitlements'
import { ctxFor, freshDb, makeUser } from './helpers'

/** Stands in for Stripe: subscriptions live in a map the test edits. */
class FakeBilling implements Billing {
  customers: string[] = []
  subs = new Map<string, SubscriptionState>()
  checkouts = new Map<string, { customerId: string; subscriptionId: string }>()
  cancelled: string[] = []
  calls: string[] = []

  async createCustomer({ userId }: { userId: string }) {
    const id = `cus_${userId}`
    this.customers.push(id)
    return id
  }
  async checkoutUrl(i: {
    customerId: string
    plan: PaidPlan
    interval: BillingInterval
    trialDays?: number
  }) {
    this.calls.push(`checkout:${i.customerId}:${i.plan}:${i.interval}:trial=${i.trialDays ?? 0}`)
    return `https://checkout.test/${i.plan}`
  }
  async portalUrl(customerId: string) {
    this.calls.push(`portal:${customerId}`)
    return 'https://portal.test'
  }
  async subscription(id: string) {
    return this.subs.get(id) ?? null
  }
  async checkoutSubscription(id: string) {
    return this.checkouts.get(id) ?? null
  }
  async openSubscriptions(customerId: string) {
    return [...this.subs.values()]
      .filter((s) => s.customerId === customerId && s.status !== 'canceled')
      .map((s) => s.id)
  }
  async cancelNow(id: string) {
    this.cancelled.push(id)
    const s = this.subs.get(id)
    if (s) this.subs.set(id, { ...s, status: 'canceled' })
  }
  async webhook(body: string, signature: string) {
    if (signature !== 'good') throw new WebhookSignatureError()
    const event = JSON.parse(body) as { type: string; id?: string }
    return event.type.startsWith('customer.subscription.') && event.id
      ? { subscriptionId: event.id }
      : null
  }
}

const sub = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  id: 'sub_1',
  customerId: 'cus_alice',
  plan: 'plus',
  interval: 'month',
  status: 'active',
  currentPeriodStart: new Date('2026-10-16T00:00:00Z'),
  currentPeriodEnd: new Date('2026-11-16T00:00:00Z'),
  cancelAtPeriodEnd: false,
  trialEnd: null,
  ...over,
})

const urls = { success: 's', cancel: 'c', portalReturn: 'p' }

let db: Database
let billing: FakeBilling
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(
    sql`truncate subscriptions, audit_log, feature_flags, app_settings, "user" cascade`,
  )
  invalidateFlags()
  billing = new FakeBilling()
  await makeUser(db, 'alice')
  await makeUser(db, 'bob')
})

describe('billing', () => {
  it('sends a first-time buyer to checkout and creates one customer for them', async () => {
    const url = await planChangeUrl(db, billing, 'alice', 'pro', 'year', urls)
    expect(url).toBe('https://checkout.test/pro')
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    expect(billing.customers).toEqual(['cus_alice'])
    const [row] = await db.select().from(user).where(eq(user.id, 'alice'))
    expect(row?.billingCustomerId).toBe('cus_alice')
  })

  it('gives a free month on the first plan only', async () => {
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    expect(billing.calls.at(-1)).toBe('checkout:cus_alice:plus:month:trial=30')
    // Subscribed once (even if it ended): the next checkout is charged from day one.
    billing.subs.set('sub_1', sub({ status: 'canceled' }))
    await syncSubscription(db, billing, 'sub_1')
    await planChangeUrl(db, billing, 'alice', 'pro', 'month', urls)
    expect(billing.calls.at(-1)).toBe('checkout:cus_alice:pro:month:trial=0')
  })

  it('pauses advanced features when the first payment after the trial fails', async () => {
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    const trialEnd = new Date('2026-11-15T00:00:00Z')
    billing.subs.set('sub_1', sub({ status: 'trialing', trialEnd }))
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('plus')
    billing.subs.set('sub_1', sub({ status: 'past_due', trialEnd, currentPeriodStart: trialEnd }))
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('free')
    // Paying later (Stripe retries, or a new card) brings the plan back.
    billing.subs.set('sub_1', sub({ status: 'active', trialEnd, currentPeriodStart: trialEnd }))
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('plus')
  })

  it('sends someone who already pays to the portal instead of a second checkout', async () => {
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    billing.subs.set('sub_1', sub())
    await syncSubscription(db, billing, 'sub_1')
    expect(await planChangeUrl(db, billing, 'alice', 'pro', 'month', urls)).toBe(
      'https://portal.test',
    )
  })

  it('raises the allowance while paying and lowers it, without touching codes, when it ends', async () => {
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    billing.subs.set('sub_1', sub())
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('plus')
    expect((await advancedCodeUsage(ctxFor(db, 'alice'))).allowance).toBe(10)
    expect((await getEntitlements(db, 'alice')).has('customSlugs')).toBe(true)

    billing.subs.set('sub_1', sub({ status: 'past_due' }))
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('plus')

    billing.subs.set('sub_1', sub({ status: 'canceled' }))
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('free')
    expect((await advancedCodeUsage(ctxFor(db, 'alice'))).allowance).toBe(1)
  })

  it('keeps an admin-granted plan when it is higher than the paid one', async () => {
    await db.update(user).set({ plan: 'pro' }).where(eq(user.id, 'alice'))
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    billing.subs.set('sub_1', sub())
    await syncSubscription(db, billing, 'sub_1')
    expect(await effectivePlanFor(db, 'alice')).toBe('pro')
  })

  it('applies webhooks by re-reading the subscription, and audits plan changes once', async () => {
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    billing.subs.set('sub_1', sub({ plan: 'unlimited' }))
    const body = JSON.stringify({ type: 'customer.subscription.updated', id: 'sub_1' })
    await handleBillingWebhook(db, billing, body, 'good')
    await handleBillingWebhook(db, billing, body, 'good')
    expect(await effectivePlanFor(db, 'alice')).toBe('unlimited')
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'billing.subscription'))
    expect(audits).toHaveLength(1)
    await handleBillingWebhook(db, billing, JSON.stringify({ type: 'invoice.paid' }), 'good')
    await expect(handleBillingWebhook(db, billing, body, 'forged')).rejects.toBeInstanceOf(
      WebhookSignatureError,
    )
  })

  it('ignores subscriptions of customers it does not know', async () => {
    billing.subs.set('sub_x', sub({ id: 'sub_x', customerId: 'cus_stranger' }))
    expect(await syncSubscription(db, billing, 'sub_x')).toBeNull()
    expect(await db.select().from(subscriptions)).toHaveLength(0)
  })

  it('only syncs a returning checkout for the customer who made it', async () => {
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    await planChangeUrl(db, billing, 'bob', 'plus', 'month', urls)
    billing.subs.set('sub_1', sub())
    billing.checkouts.set('cs_1', { customerId: 'cus_alice', subscriptionId: 'sub_1' })
    expect(await syncCheckout(db, billing, 'bob', 'cs_1')).toBeNull()
    expect(await effectivePlanFor(db, 'bob')).toBe('free')
    expect((await syncCheckout(db, billing, 'alice', 'cs_1'))?.plan).toBe('plus')
    expect(await effectivePlanFor(db, 'alice')).toBe('plus')
  })

  it('cancels open subscriptions when an account is deleted', async () => {
    expect(await cancelSubscriptionsForDeletion(db, billing, 'alice')).toBe(0)
    await planChangeUrl(db, billing, 'alice', 'plus', 'month', urls)
    billing.subs.set('sub_1', sub())
    await syncSubscription(db, billing, 'sub_1')
    expect(await cancelSubscriptionsForDeletion(db, billing, 'alice')).toBe(1)
    expect(billing.cancelled).toEqual(['sub_1'])
    expect(await effectivePlanFor(db, 'alice')).toBe('free')
  })
})
