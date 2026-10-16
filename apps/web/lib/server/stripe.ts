import {
  parsePriceLookupKey,
  priceLookupKey,
  type Billing,
  type BillingInterval,
  type PaidPlan,
  type SubscriptionState,
  type SubscriptionStatus,
  WebhookSignatureError,
} from '@qrfinity/core'
import Stripe from 'stripe'
import { env } from './env'

/** Events that can change a subscription. Each is answered by re-reading the subscription. */
const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
])

const id = (v: string | { id: string } | null | undefined) =>
  typeof v === 'string' ? v : (v?.id ?? null)

/**
 * Stripe Billing with Stripe Tax. Prices are found by lookup key (qrfinity_plus_monthly, …), so
 * no price ids live in configuration; `pnpm --filter @qrfinity/web stripe:setup` creates them.
 */
export class StripeBilling implements Billing {
  private stripe: Stripe
  private prices = new Map<string, string>()

  constructor(
    secretKey: string,
    private webhookSecret: string,
    private portalConfiguration?: string,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, appInfo: { name: 'QRfinity' } })
  }

  async createCustomer(input: { userId: string; email: string }) {
    const customer = await this.stripe.customers.create(
      { email: input.email, metadata: { userId: input.userId } },
      // A double click creates one customer, not two.
      { idempotencyKey: `customer-${input.userId}` },
    )
    return customer.id
  }

  private async priceId(plan: PaidPlan, interval: BillingInterval) {
    const key = priceLookupKey(plan, interval)
    const cached = this.prices.get(key)
    if (cached) return cached
    const { data } = await this.stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })
    const price = data[0]
    if (!price) throw new Error(`No active Stripe price with lookup key ${key}. Run stripe:setup.`)
    this.prices.set(key, price.id)
    return price.id
  }

  async checkoutUrl(input: {
    customerId: string
    plan: PaidPlan
    interval: BillingInterval
    successUrl: string
    cancelUrl: string
    trialDays?: number
  }) {
    const trial = input.trialDays ?? 0
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      line_items: [{ price: await this.priceId(input.plan, input.interval), quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      automatic_tax: { enabled: true },
      // Stripe Tax needs the address; business customers can add a tax id (reverse charge).
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      // A card is collected even with a trial, so the plan carries on after it unless cancelled.
      payment_method_collection: 'always',
      subscription_data: {
        metadata: { plan: input.plan, interval: input.interval },
        ...(trial
          ? {
              trial_period_days: trial,
              trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
            }
          : {}),
      },
      custom_text: {
        submit: {
          message: trial
            ? `Free for ${trial} days, then renews automatically every ${input.interval} until you cancel. Cancel before the trial ends and you won’t be charged. Your codes keep working either way.`
            : `Renews automatically every ${input.interval} until you cancel. Cancel any time from your account; your codes keep working either way.`,
        },
      },
    })
    if (!session.url) throw new Error('Stripe returned a checkout session without a URL')
    return session.url
  }

  async portalUrl(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(this.portalConfiguration ? { configuration: this.portalConfiguration } : {}),
    })
    return session.url
  }

  async subscription(subscriptionId: string): Promise<SubscriptionState | null> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId)
    const item = sub.items.data[0]
    const price = parsePriceLookupKey(item?.price.lookup_key)
    const customerId = id(sub.customer)
    if (!item || !price || !customerId) return null
    return {
      id: sub.id,
      customerId,
      plan: price.plan,
      interval: price.interval,
      status: sub.status as SubscriptionStatus,
      currentPeriodStart: item.current_period_start
        ? new Date(item.current_period_start * 1000)
        : null,
      currentPeriodEnd: item.current_period_end ? new Date(item.current_period_end * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      // Cancelling in the portal can set either a period-end flag or a cancel date.
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
    }
  }

  async checkoutSubscription(checkoutId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(checkoutId)
    const customerId = id(session.customer)
    const subscriptionId = id(session.subscription)
    return customerId && subscriptionId ? { customerId, subscriptionId } : null
  }

  async openSubscriptions(customerId: string) {
    const ids: string[] = []
    for await (const sub of this.stripe.subscriptions.list({ customer: customerId, status: 'all' }))
      if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') ids.push(sub.id)
    return ids
  }

  async cancelNow(subscriptionId: string) {
    await this.stripe.subscriptions.cancel(subscriptionId)
  }

  async webhook(rawBody: string, signature: string) {
    let event: Stripe.Event
    try {
      event = await this.stripe.webhooks.constructEventAsync(rawBody, signature, this.webhookSecret)
    } catch (e) {
      if (e instanceof Stripe.errors.StripeSignatureVerificationError)
        throw new WebhookSignatureError(e.message)
      throw e
    }
    if (SUBSCRIPTION_EVENTS.has(event.type))
      return { subscriptionId: (event.data.object as Stripe.Subscription).id }
    if (event.type === 'checkout.session.completed') {
      const subscriptionId = id((event.data.object as Stripe.Checkout.Session).subscription)
      return subscriptionId ? { subscriptionId } : null
    }
    return null
  }
}

let instance: Billing | null | undefined

/** The billing provider, or null while Stripe isn't configured (paid plans show "coming soon"). */
export function getBilling(): Billing | null {
  if (instance === undefined) {
    const config = env.stripe
    instance = config
      ? new StripeBilling(config.secretKey, config.webhookSecret, config.portalConfiguration)
      : null
  }
  return instance
}
