import {
  PLAN_DETAILS,
  grantsPlan,
  planPrice,
  type Plan,
  CONTACT_TEMPLATES_BY_PLAN,
} from '@qrfinity/core'
import type { subscriptions } from '@qrfinity/db'
import { CreditCard, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { TrackedLink } from '@/components/TrackedLink'
import { CheckoutComplete, PortalButton } from './BillingTracking'

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
  checkoutId,
  portalError,
}: {
  plan: Plan
  used: number
  allowance: number
  subscription: Subscription | null
  billingOn: boolean
  justSubscribed: boolean
  /** The Stripe checkout just finished, for site analytics. */
  checkoutId: string | null
  portalError: boolean
}) {
  const paying = subscription && grantsPlan(subscription) ? subscription : null
  const end = paying?.currentPeriodEnd ? date(paying.currentPeriodEnd) : null
  // Trial over and the first charge failed: the plan doesn't apply until it's paid.
  const firstPaymentFailed = !paying && subscription?.status === 'past_due'

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
              {Number.isFinite(allowance) ? ' used' : ''}.{' '}
              {plan === 'free'
                ? 'Paid plans add SVG, PDF and EPS downloads and more contact card templates.'
                : `Includes SVG, PDF and EPS downloads and ${CONTACT_TEMPLATES_BY_PLAN[plan]} contact card templates.`}
            </p>
            {paying?.status === 'trialing' ? (
              <p className="body-small mt-2 text-ink">
                {paying.cancelAtPeriodEnd
                  ? `Free trial until ${end ?? 'the end of the month'}. You won’t be charged.`
                  : `Free trial until ${end ?? 'the end of the month'}, then $${planPrice(paying.plan, paying.interval)} a ${paying.interval}.`}
              </p>
            ) : paying ? (
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
          <PortalButton
            plan={plan}
            label={paying || firstPaymentFailed ? 'Manage plan and billing' : 'Billing history'}
          />
        ) : billingOn ? (
          <TrackedLink
            href="/pricing#plans"
            className="button inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-evergreen px-6 py-3 text-on-evergreen hover:bg-evergreen-deep"
            event={{ name: 'upgrade_prompt_clicked', props: { feature: 'account_plan' } }}
          >
            See plans
          </TrackedLink>
        ) : (
          <Link href="/pricing" className="shrink-0 text-evergreen underline">
            Paid plans are coming soon
          </Link>
        )}
      </div>

      {justSubscribed && paying && checkoutId ? (
        <CheckoutComplete
          checkoutId={checkoutId}
          plan={paying.plan}
          interval={paying.interval}
          trial={paying.status === 'trialing'}
        />
      ) : null}
      {justSubscribed && paying ? (
        <p role="status" className="mt-4 rounded-lg bg-mint px-4 py-3 text-ink">
          {paying.status === 'trialing'
            ? `Thanks! Your free month of ${PLAN_DETAILS[paying.plan].name} has started. We’ll email you before it ends.`
            : `Thanks! You’re on ${PLAN_DETAILS[paying.plan].name}. Your receipt is on its way by email.`}
        </p>
      ) : justSubscribed ? (
        <p role="status" className="mt-4 rounded-lg bg-mint px-4 py-3 text-ink">
          Thanks! Your payment is being confirmed; your plan appears here within a minute.
        </p>
      ) : null}
      {firstPaymentFailed ? (
        <p className="mt-4 flex gap-3 rounded-md border-[1.5px] border-scan-fail px-4 py-3 text-ink">
          <TriangleAlert
            aria-hidden="true"
            size={20}
            strokeWidth={1.75}
            className="mt-[3px] shrink-0"
          />
          <span>
            Your free trial has ended and the first payment didn’t go through, so redirect rules on
            codes beyond the free one are paused (scans go to each code’s main destination). Update
            your card under Manage plan and billing to turn them back on. Every code and short link
            keeps working.
          </span>
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
