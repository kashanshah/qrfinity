import { WebhookSignatureError } from '@qrfinity/core'
import { handleBillingWebhook } from '@/lib/server/billing'
import { getDb } from '@/lib/server/db'
import { getBilling } from '@/lib/server/stripe'

export const dynamic = 'force-dynamic'

/**
 * Stripe webhook. Point it at https://qrfinity.com/api/billing/webhook with the events
 * customer.subscription.* and checkout.session.completed (docs/billing.md).
 */
export async function POST(req: Request) {
  const billing = getBilling()
  if (!billing) return new Response('Billing is not configured', { status: 404 })
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })
  const body = await req.text()
  try {
    await handleBillingWebhook(getDb(), billing, body, signature)
  } catch (e) {
    if (e instanceof WebhookSignatureError) return new Response('Bad signature', { status: 400 })
    console.error('Billing webhook failed', e)
    // Stripe retries on a 5xx, which is what we want for a database or network hiccup.
    return new Response('Could not process the event', { status: 500 })
  }
  return Response.json({ received: true })
}
