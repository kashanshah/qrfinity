'use server'

import { isBillingInterval, isPaidPlan } from '@qrfinity/core'
import { headers } from 'next/headers'
import { planChangeUrl } from '@/lib/server/billing'
import { getSessionUser } from '@/lib/server/context'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { ServiceError } from '@/lib/server/errors'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'
import { getBilling } from '@/lib/server/stripe'
import { verifyTurnstile } from '@/lib/server/turnstile'
import { joinWaitlist } from '@/lib/server/waitlist'

export async function joinWaitlistAction(input: { email: string; token: string | null }) {
  if (!(await verifyTurnstile(input.token)))
    return { ok: false as const, error: 'Please complete the check that you’re not a robot.' }
  const h = await headers()
  const visitor = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
  try {
    const db = getDb()
    await joinWaitlist(db, new PostgresRateLimiter(db), env.rateLimitSecret, {
      email: input.email,
      visitor,
    })
    return { ok: true as const }
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false as const, error: e.message }
    console.error(e)
    return { ok: false as const, error: 'We couldn’t add you just now. Please try again.' }
  }
}

/**
 * "Choose Plus": a Stripe checkout page for a first plan, or the billing portal for someone who
 * already pays (plan changes happen there). Signed-out visitors are sent to sign in first.
 */
export async function choosePlanAction(input: { plan: string; interval: string }) {
  const billing = getBilling()
  if (!billing) return { ok: false as const, error: 'Paid plans aren’t available yet.' }
  if (!isPaidPlan(input.plan) || !isBillingInterval(input.interval))
    return { ok: false as const, error: 'Choose a plan.' }
  const user = await getSessionUser()
  if (!user) return { ok: false as const, signIn: true as const }
  const app = env.appUrl
  try {
    const url = await planChangeUrl(getDb(), billing, user.id, input.plan, input.interval, {
      // Stripe fills in {CHECKOUT_SESSION_ID}; the account page uses it to show the plan at once.
      success: `${app}/dashboard/account?checkout={CHECKOUT_SESSION_ID}`,
      cancel: `${app}/pricing?checkout=cancelled`,
      portalReturn: `${app}/dashboard/account`,
    })
    return { ok: true as const, url }
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false as const, error: e.message }
    console.error(e)
    return {
      ok: false as const,
      error: 'We couldn’t open the checkout just now. Nothing was charged; please try again.',
    }
  }
}
