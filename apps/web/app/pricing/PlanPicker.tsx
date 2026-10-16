'use client'

import { PLANS, PLAN_DETAILS, type BillingInterval, type Plan } from '@qrfinity/core'
import { useState, useTransition } from 'react'
import { track } from '@/lib/analytics'
import { choosePlanAction } from './actions'

const codes = (plan: Plan) => {
  const n = PLAN_DETAILS[plan].advancedCodes
  return Number.isFinite(n) ? `${n} ${n === 1 ? 'code' : 'codes'}` : 'every code'
}

const pill = (on: boolean) =>
  `label rounded-md px-3 py-2 ${on ? 'bg-mint font-bold text-ink' : 'text-ink-muted hover:bg-surface-sunk hover:text-ink'}`

/** The plan grid. With billing on, paid plans get a monthly/yearly switch and a checkout button. */
export function PlanPicker({ billingOn }: { billingOn: boolean }) {
  const [interval, setBillingInterval] = useState<BillingInterval>('month')
  const [busy, setBusy] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  const choose = (plan: Plan) =>
    start(async () => {
      setBusy(plan)
      setError(null)
      const r = await choosePlanAction({ plan, interval })
      if (r.ok) {
        track('checkout_started', { plan, interval })
        window.location.assign(r.url)
        return
      }
      setBusy(null)
      if ('signIn' in r) window.location.assign(`/login?next=${encodeURIComponent('/pricing')}`)
      else setError(r.error)
    })

  return (
    <div className="mt-5">
      {billingOn ? (
        <p className="mb-4 max-w-[65ch] rounded-lg bg-mint px-4 py-3 text-ink">
          Your first plan is free for a month. Add a card at checkout; we charge it after 30 days
          unless you cancel before then.
        </p>
      ) : null}
      {billingOn ? (
        <div role="group" aria-label="Billing period" className="mb-4 flex gap-1">
          <button
            type="button"
            className={pill(interval === 'month')}
            aria-pressed={interval === 'month'}
            onClick={() => setBillingInterval('month')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={pill(interval === 'year')}
            aria-pressed={interval === 'year'}
            onClick={() => setBillingInterval('year')}
          >
            Yearly, 2 months free
          </button>
        </div>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const d = PLAN_DETAILS[plan]
          const yearly = billingOn && interval === 'year'
          const price = d.monthlyUsd === null ? 0 : yearly ? d.yearlyUsd : d.monthlyUsd
          return (
            <li
              key={plan}
              className={`flex flex-col rounded-lg border bg-surface p-5 ${plan === 'free' ? 'border-[1.5px] border-evergreen' : 'border-hairline'}`}
            >
              <h3 className="subheading text-ink">{d.name}</h3>
              <p className="mt-2 text-ink">
                <span className="heading">${price}</span>
                <span className="text-ink-muted">
                  {d.monthlyUsd === null ? ' forever' : yearly ? ' /year' : ' /month'}
                </span>
              </p>
              <p className="body-small text-ink-muted">
                {d.monthlyUsd === null
                  ? 'No card needed'
                  : yearly
                    ? `Instead of $${d.monthlyUsd * 12}`
                    : `or $${d.yearlyUsd} a year`}
              </p>
              <p className="mt-3 text-ink">Advanced features on {codes(plan)}</p>
              <div className="mt-auto pt-4">
                {plan === 'free' ? (
                  <p className="label text-ink-muted">Available now</p>
                ) : billingOn ? (
                  <button
                    type="button"
                    onClick={() => choose(plan)}
                    disabled={busy !== null}
                    className="button inline-flex min-h-11 w-full items-center justify-center rounded-md bg-evergreen px-6 py-3 text-on-evergreen hover:bg-evergreen-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === plan ? 'Opening checkout…' : `Choose ${d.name}`}
                  </button>
                ) : (
                  <p className="label text-ink-muted">Coming soon</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {error ? (
        <p role="alert" className="mt-4 text-scan-fail">
          {error}
        </p>
      ) : null}
      {billingOn ? (
        <p className="body-small mt-4 max-w-[70ch] text-ink-muted">
          Prices in US dollars. Tax is added at checkout where it applies. Plans renew automatically
          until you cancel, which you can do any time from your account. Already on a plan? Choosing
          another opens your billing page, where you can switch.
        </p>
      ) : null}
    </div>
  )
}
