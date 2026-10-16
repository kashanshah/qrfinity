/**
 * Creates (or updates) everything QRfinity needs in a Stripe account. Safe to run again.
 *
 *   STRIPE_SECRET_KEY=sk_test_... pnpm --filter @qrfinity/web stripe:setup [--webhook https://qrfinity.com]
 *
 * - One product per paid plan, with a monthly and a yearly USD price found by lookup key
 *   (qrfinity_plus_monthly, …). A changed price in PLAN_DETAILS gets a new Stripe price that takes
 *   over the lookup key; existing subscribers stay on their old price until they change plan.
 * - A customer portal configuration: switch plans (upgrades now with proration, downgrades at the
 *   end of the period), update card and address, invoices, cancel at period end. Prints its id
 *   for STRIPE_PORTAL_CONFIGURATION.
 * - With --webhook <site>, a webhook endpoint at <site>/api/billing/webhook. Prints the signing
 *   secret for STRIPE_WEBHOOK_SECRET (Stripe shows it only when the endpoint is created).
 */
import {
  BILLING_INTERVALS,
  PAID_PLANS,
  PLAN_DETAILS,
  planPrice,
  priceLookupKey,
} from '@qrfinity/core'
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('Set STRIPE_SECRET_KEY (test mode first: sk_test_...).')
  process.exit(1)
}
const stripe = new Stripe(key)
const site = 'https://qrfinity.com'
const webhookFlag = process.argv.indexOf('--webhook')
const webhookSite = webhookFlag > -1 ? process.argv[webhookFlag + 1] : undefined

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]

const codes = (n: number) => (Number.isFinite(n) ? `${n} codes` : 'every code')

async function main() {
  console.log(`Stripe ${key!.includes('_live_') ? 'LIVE' : 'test'} mode\n`)
  const existing = await stripe.products.list({ limit: 100 })
  const portalProducts: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[] =
    []

  for (const plan of PAID_PLANS) {
    const d = PLAN_DETAILS[plan]
    const fields = {
      name: `QRfinity ${d.name}`,
      description: `Advanced features on ${codes(d.advancedCodes)}. Every other feature stays free.`,
      metadata: { qrfinity_plan: plan },
    }
    let product = existing.data.find((p) => p.metadata.qrfinity_plan === plan)
    if (product) product = await stripe.products.update(product.id, fields)
    else product = await stripe.products.create(fields)
    console.log(`${product.name}: ${product.id}`)

    const prices: string[] = []
    for (const interval of BILLING_INTERVALS) {
      const lookup = priceLookupKey(plan, interval)
      const cents = planPrice(plan, interval) * 100
      const [current] = (await stripe.prices.list({ lookup_keys: [lookup], limit: 1 })).data
      if (
        current &&
        current.active &&
        current.unit_amount === cents &&
        current.currency === 'usd' &&
        current.product === product.id
      ) {
        console.log(`  ${lookup}: $${cents / 100} (unchanged) ${current.id}`)
        prices.push(current.id)
        continue
      }
      const price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: cents,
        recurring: { interval },
        // Prices are shown before tax; Stripe Tax adds VAT/GST/sales tax where it applies.
        tax_behavior: 'exclusive',
        lookup_key: lookup,
        transfer_lookup_key: true,
      })
      if (current) await stripe.prices.update(current.id, { active: false })
      console.log(`  ${lookup}: $${cents / 100} (new) ${price.id}`)
      prices.push(price.id)
    }
    portalProducts.push({ product: product.id, prices })
  }

  const portal: Stripe.BillingPortal.ConfigurationCreateParams = {
    name: 'QRfinity',
    business_profile: {
      headline: 'QRfinity: manage your plan',
      privacy_policy_url: `${site}/privacy`,
      terms_of_service_url: `${site}/terms`,
    },
    default_return_url: `${site}/dashboard/account`,
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'unused', 'missing_features', 'switched_service', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: portalProducts,
        // Moving to a smaller plan or monthly billing waits for the end of what's paid for.
        schedule_at_period_end: {
          conditions: [{ type: 'decreasing_item_amount' }, { type: 'shortening_interval' }],
        },
      },
    },
    metadata: { qrfinity: 'portal' },
  }
  const configs = await stripe.billingPortal.configurations.list({ limit: 100, active: true })
  const mine = configs.data.find((c) => c.metadata?.qrfinity === 'portal')
  const config = mine
    ? await stripe.billingPortal.configurations.update(mine.id, portal)
    : await stripe.billingPortal.configurations.create(portal)
  console.log(`\nPortal configuration: ${config.id}`)
  console.log(`  Set STRIPE_PORTAL_CONFIGURATION=${config.id}`)

  if (webhookSite) {
    const url = `${webhookSite.replace(/\/$/, '')}/api/billing/webhook`
    const hooks = await stripe.webhookEndpoints.list({ limit: 100 })
    const hook = hooks.data.find((h) => h.url === url)
    if (hook) {
      await stripe.webhookEndpoints.update(hook.id, { enabled_events: WEBHOOK_EVENTS })
      console.log(`\nWebhook ${url} already exists (${hook.id}); events updated.`)
      console.log('  Its signing secret is in the Stripe dashboard under Developers → Webhooks.')
    } else {
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: WEBHOOK_EVENTS,
        description: 'QRfinity subscriptions',
      })
      console.log(`\nWebhook created: ${url}`)
      console.log(`  Set STRIPE_WEBHOOK_SECRET=${created.secret}`)
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
