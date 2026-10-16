import { WebhookSignatureError } from '@qrfinity/core'
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { StripeBilling } from '@/lib/server/stripe'

const secret = 'whsec_test_secret'
const billing = new StripeBilling('sk_test_unused', secret)

const signed = (event: object) => {
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', ...event })
  return { payload, header: Stripe.webhooks.generateTestHeaderString({ payload, secret }) }
}

describe('Stripe webhooks', () => {
  it('names the subscription to re-read for subscription events', async () => {
    const { payload, header } = signed({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_123', object: 'subscription' } },
    })
    expect(await billing.webhook(payload, header)).toEqual({ subscriptionId: 'sub_123' })
  })

  it('reads the subscription off a completed checkout', async () => {
    const { payload, header } = signed({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', object: 'checkout.session', subscription: 'sub_9' } },
    })
    expect(await billing.webhook(payload, header)).toEqual({ subscriptionId: 'sub_9' })
  })

  it('ignores other events', async () => {
    const { payload, header } = signed({ type: 'invoice.paid', data: { object: {} } })
    expect(await billing.webhook(payload, header)).toBeNull()
  })

  it('rejects a forged or altered request', async () => {
    const { payload, header } = signed({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })
    await expect(billing.webhook(payload.replace('sub_1', 'sub_2'), header)).rejects.toBeInstanceOf(
      WebhookSignatureError,
    )
    await expect(billing.webhook(payload, 't=1,v1=bad')).rejects.toBeInstanceOf(
      WebhookSignatureError,
    )
  })
})
