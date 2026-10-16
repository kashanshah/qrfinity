/**
 * Billing rules that don't depend on the payment provider (Stripe today, see ports.ts).
 *
 * A user's plan is the higher of the plan an admin set and the plan of any subscription that is
 * paying (or being retried after a failed payment). Ending a subscription only lowers the
 * allowance for new codes; nothing that already exists stops working.
 */
import { PLANS, PLAN_DETAILS, isPlan, type Plan } from '../plans'

export const BILLING_INTERVALS = ['month', 'year'] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

export const PAID_PLANS = PLANS.filter((p) => p !== 'free') as Exclude<Plan, 'free'>[]
export type PaidPlan = (typeof PAID_PLANS)[number]

export function isBillingInterval(v: unknown): v is BillingInterval {
  return v === 'month' || v === 'year'
}

export function isPaidPlan(v: unknown): v is PaidPlan {
  return isPlan(v) && v !== 'free'
}

/** The provider's price id for a plan is found by this key, so no price ids live in config. */
export function priceLookupKey(plan: PaidPlan, interval: BillingInterval): string {
  return `qrfinity_${plan}_${interval}ly`
}

export function parsePriceLookupKey(
  key: string | null | undefined,
): { plan: PaidPlan; interval: BillingInterval } | null {
  const m = /^qrfinity_([a-z]+)_(month|year)ly$/.exec(key ?? '')
  if (!m || !isPaidPlan(m[1]) || !isBillingInterval(m[2])) return null
  return { plan: m[1], interval: m[2] }
}

/** Price in whole US dollars for one billing period. */
export function planPrice(plan: PaidPlan, interval: BillingInterval): number {
  const d = PLAN_DETAILS[plan]
  return (interval === 'month' ? d.monthlyUsd : d.yearlyUsd) ?? 0
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'

/**
 * Statuses that give the plan. Past due keeps it while the provider retries the card, so a
 * failed renewal doesn't take anything away before the customer has had a chance to fix it.
 */
export const PLAN_GRANTING_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
]

export function grantsPlan(status: string): boolean {
  return (PLAN_GRANTING_STATUSES as readonly string[]).includes(status)
}

/** The current state of one subscription, as the app stores it. */
export type SubscriptionState = {
  id: string
  customerId: string
  plan: PaidPlan
  interval: BillingInterval
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export function planRank(plan: Plan): number {
  return PLANS.indexOf(plan)
}

/** The higher of the admin-set plan and every subscription that grants a plan. */
export function effectivePlan(
  adminPlan: Plan,
  subscriptions: readonly Pick<SubscriptionState, 'plan' | 'status'>[],
): Plan {
  let best = adminPlan
  for (const s of subscriptions)
    if (grantsPlan(s.status) && planRank(s.plan) > planRank(best)) best = s.plan
  return best
}

/** Thrown by Billing.webhook when a request isn't signed by the provider. */
export class WebhookSignatureError extends Error {
  constructor(message = 'Webhook signature did not verify') {
    super(message)
    this.name = 'WebhookSignatureError'
  }
}
