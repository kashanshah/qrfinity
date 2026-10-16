import { PLAN_DETAILS, grantsPlan, planPrice, type Plan } from '@qrfinity/core'
import type { subscriptions } from '@qrfinity/db'
import { CreditCard, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { billingPortalAction } from './actions'

type Subscription = typeof subscriptions.$inferSelect

const date = (d: Date) =>
  d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

const codes = (n: number) =>
  Number.isFinite(n) ? `${n.toLocaleString('en')} ${n === 1 ? 'code' : 'codes'}` : 'every code'

export function PlanSection({
  plan,
  used,
  allowance,
  subscription,
  billingOn,
  justSubscribed,
  portalError,
}: {
  plan: Plan
  used: number
  allowance: number
  subscription: Subscription | null
  billingOn: boolean
  justSubscribed: boolean
  portalError: boolean
}) {
  const paying = subscription && grantsPlan(subscription.status) ? subscription : null
  const end = paying?.currentPeriodEnd ? date(paying.currentPeriodEnd) : null

  return (
    <section
      aria-labelledby="plan"
      className="rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CreditCard
            aria-hidden="true"
            size={20}
            strokeWidth={1.75}
            className="mt-1 shrink-0 text-evergreen"
          />
          <div>
            <h2 id="plan" className="subheading text-ink">
              {PLAN_DETAILS[plan].name} plan
            </h2>
            <p className="mt-1 text-ink-muted">
              Advanced features on {used.toLocaleString('en')} of {codes(allowance)}
              {Number.isFinite(allowance) ? ' used' : ''}. Every other feature is free and
              unlimited.
            </p>
            {paying ? (
              <p className="body-small mt-2 text-ink">
                ${planPrice(paying.plan, paying.interval)} a {paying.interval}
                {end ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {paying.cancelAtPeriodEnd ? `Ends on ${end}` : `Renews on ${end}`}
                  </>
                ) : null}
              </p>
            ) : plan !== 'free' ? (
              <p className="body-small mt-2 text-ink-muted">Given to you by QRfinity.</p>
            ) : null}
          </div>
        </div>
        {paying || subscription ? (
          <form action={billingPortalAction} className="shrink-0">
            <button
              type="submit"
              className="button inline-flex min-h-11 items-center justify-center rounded-md border-[1.5px] border-control-border bg-surface px-6 py-3 text-ink hover:bg-surface-sunk"
            >
              {paying ? 'Manage plan and billing' : 'Billing history'}
            </button>
          </form>
        ) : billingOn ? (
          <Link
            href="/pricing#plans"
            className="button inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-evergreen px-6 py-3 text-on-evergreen hover:bg-evergreen-deep"
          >
            See plans
          </Link>
        ) : (
          <Link href="/pricing" className="shrink-0 text-evergreen underline">
            Paid plans are coming soon
          </Link>
        )}
      </div>

      {justSubscribed && paying ? (
        <p role="status" className="mt-4 rounded-lg bg-mint px-4 py-3 text-ink">
          Thanks! You’re on {PLAN_DETAILS[paying.plan].name}. Your receipt is on its way by email.
        </p>
      ) : justSubscribed ? (
        <p role="status" className="mt-4 rounded-lg bg-mint px-4 py-3 text-ink">
          Thanks! Your payment is being confirmed; your plan appears here within a minute.
        </p>
      ) : null}
      {paying?.status === 'past_due' ? (
        <p className="mt-4 flex gap-3 rounded-md border-[1.5px] border-scan-fail px-4 py-3 text-ink">
          <TriangleAlert
            aria-hidden="true"
            size={20}
            strokeWidth={1.75}
            className="mt-[3px] shrink-0"
          />
          <span>
            Your last payment didn’t go through. Update your card under Manage plan and billing to
            keep your plan. Your codes keep working either way.
          </span>
        </p>
      ) : null}
      {portalError ? (
        <p role="alert" className="mt-4 text-scan-fail">
          We couldn’t open billing just now. Please try again in a moment.
        </p>
      ) : null}
    </section>
  )
}
