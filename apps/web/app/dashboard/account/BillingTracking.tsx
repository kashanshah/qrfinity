'use client'

import { planPrice, type BillingInterval, type PaidPlan } from '@qrfinity/core'
import { useEffect } from 'react'
import { track } from '@/lib/analytics'
import { billingPortalAction } from './actions'

const SEEN_KEY = 'qrfinity-checkouts-tracked'

/**
 * Back from Stripe checkout with the plan in place: counts the new subscription once (a reload
 * or a second tab doesn't count it again), as a purchase too when no free trial applies.
 */
export function CheckoutComplete({
  checkoutId,
  plan,
  interval,
  trial,
}: {
  checkoutId: string
  plan: PaidPlan
  interval: BillingInterval
  trial: boolean
}) {
  useEffect(() => {
    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]
    } catch {
      // Unreadable: count it.
    }
    if (seen.includes(checkoutId)) return
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([checkoutId, ...seen].slice(0, 10)))
    } catch {
      // Private mode: a reload may count it again; GA still counts the purchase once by its id.
    }
    const value = planPrice(plan, interval)
    track('subscription_started', { plan, interval, trial, value, currency: 'USD' })
    if (!trial)
      track('purchase', { transaction_id: checkoutId, plan, interval, value, currency: 'USD' })
  }, [checkoutId, plan, interval, trial])
  return null
}

/** The billing portal button, counted when pressed. */
export function PortalButton({ label, plan }: { label: string; plan: string }) {
  return (
    <form
      action={billingPortalAction}
      className="shrink-0"
      onSubmit={() => track('billing_portal_opened', { plan })}
    >
      <button
        type="submit"
        className="button inline-flex min-h-11 items-center justify-center rounded-md border-[1.5px] border-control-border bg-surface px-6 py-3 text-ink hover:bg-surface-sunk"
      >
        {label}
      </button>
    </form>
  )
}
