import { PLANS, PLAN_DETAILS, type Plan } from '@qrfinity/core'
import { Check, Clock } from 'lucide-react'
import { Breadcrumbs } from '@/components/content/Breadcrumbs'
import { Faq, type FaqItem } from '@/components/content/Faq'
import { JsonLd, softwareApplication } from '@/components/content/JsonLd'
import { FactBlock } from '@/components/content/Prose'
import { HOME, PRICING } from '@/content/registry'
import { env } from '@/lib/server/env'
import { pageMetadata } from '@/lib/seo'
import { WaitlistForm } from './WaitlistForm'

export const metadata = pageMetadata(PRICING)

const FREE = [
  'Unlimited static QR codes, no sign-up',
  'Unlimited dynamic QR codes with a free account',
  'Edit where a dynamic code points, any time',
  'Scan analytics: totals, unique scans, devices, countries, up to 2 years of history, CSV download',
  'Every design option: colours, shapes, logo, frames',
  'Every format: PNG, JPG, SVG, PDF and EPS',
  'No watermark, no trial, no expiry',
]

const ADVANCED: { name: string; detail: string; ready: boolean }[] = [
  {
    name: 'Custom short links',
    detail: 'qrfinity.link/joes-menu instead of a random link',
    ready: true,
  },
  {
    name: 'Redirect rules',
    detail: 'iPhone to the App Store, Android to Google Play; by country or time',
    ready: false,
  },
  {
    name: 'Password protection',
    detail: 'Only people with the password can open the link',
    ready: false,
  },
]

const codes = (plan: Plan) => {
  const n = PLAN_DETAILS[plan].advancedCodes
  return Number.isFinite(n) ? `${n} ${n === 1 ? 'code' : 'codes'}` : 'every code'
}

const FAQ: FaqItem[] = [
  {
    q: 'Is QRfinity really free?',
    a: 'Yes. Every feature is free: unlimited static and dynamic codes, analytics, every design option and every download format, with no trial. Paid plans only let you use advanced features, like custom short links, on more than one code.',
  },
  {
    q: 'What counts as a code with advanced features?',
    a: 'Any dynamic code that uses at least one advanced feature, such as a custom short link or redirect rules. A code counts once however many advanced features it uses. Plain dynamic codes never count and are always unlimited.',
  },
  {
    q: 'What happens if I stop paying?',
    a: 'Nothing breaks. Every code keeps working, including its custom link, rules or password. You just can’t add advanced features to more codes than the free plan allows.',
  },
  {
    q: 'Will my free codes ever stop working?',
    a: 'No. Codes never expire and are never paused for not paying. A dynamic code only stops if you pause it yourself, or if we turn it off because it breaks our acceptable use policy (for example, phishing).',
  },
  {
    q: 'Could a free feature move to a paid plan later?',
    a: 'No. We will never move a free feature behind a paywall. That promise is part of our terms of service.',
  },
  {
    q: 'When can I buy a plan?',
    a: 'Paid plans are coming soon. Join the list below and we’ll send one email when you can sign up.',
  },
]

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4 pt-6 md:px-6 md:pt-10">
      <Breadcrumbs
        items={[
          { name: 'Home', path: HOME.path },
          { name: PRICING.label, path: PRICING.path },
        ]}
      />
      <header className="mb-8 mt-6 md:mb-10">
        <h1 className="page-title max-w-[22ch] text-ink">{PRICING.h1}</h1>
        <p className="subheading mt-3 max-w-[60ch] text-ink-muted">{PRICING.intro}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="free"
          className="rounded-xl border-[1.5px] border-evergreen bg-surface p-6 md:p-8"
        >
          <h2 id="free" className="heading text-ink">
            Free for everyone
          </h2>
          <ul className="mt-5 flex flex-col gap-3">
            {FREE.map((f) => (
              <li key={f} className="flex gap-3 text-ink">
                <Check
                  aria-hidden="true"
                  size={20}
                  strokeWidth={1.75}
                  className="mt-[3px] shrink-0 text-evergreen"
                />
                {f}
              </li>
            ))}
            <li className="flex gap-3 text-ink">
              <Check
                aria-hidden="true"
                size={20}
                strokeWidth={1.75}
                className="mt-[3px] shrink-0 text-evergreen"
              />
              Advanced features on 1 code
            </li>
          </ul>
          <p className="mt-6 rounded-lg bg-mint p-4 text-ink">
            Our promise: your codes never expire, and we never move a free feature behind a paywall.
          </p>
        </section>

        <section
          aria-labelledby="advanced"
          className="rounded-xl border border-hairline bg-surface p-6 md:p-8"
        >
          <h2 id="advanced" className="heading text-ink">
            Advanced features
          </h2>
          <p className="mt-1 text-ink-muted">
            Free on one code. Use them on more codes with a plan.
          </p>
          <ul className="mt-5 flex flex-col gap-4">
            {ADVANCED.map((a) => (
              <li key={a.name} className="flex gap-3 text-ink">
                {a.ready ? (
                  <Check
                    aria-hidden="true"
                    size={20}
                    strokeWidth={1.75}
                    className="mt-[3px] shrink-0 text-evergreen"
                  />
                ) : (
                  <Clock
                    aria-hidden="true"
                    size={20}
                    strokeWidth={1.75}
                    className="mt-[3px] shrink-0 text-ink-muted"
                  />
                )}
                <span>
                  <span className="font-bold">{a.name}</span>
                  {a.ready ? null : (
                    <span className="label ml-2 rounded-pill bg-surface-sunk px-2 py-0.5 text-ink">
                      Coming soon
                    </span>
                  )}
                  <span className="body-small block text-ink-muted">{a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="plans" className="mt-12">
        <h2 id="plans" className="heading text-ink">
          Plans
        </h2>
        <p className="mt-1 max-w-[65ch] text-ink-muted">
          Every plan includes every feature. Plans differ only in how many codes can use advanced
          features.
        </p>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const d = PLAN_DETAILS[plan]
            return (
              <li
                key={plan}
                className={`flex flex-col rounded-lg border bg-surface p-5 ${plan === 'free' ? 'border-[1.5px] border-evergreen' : 'border-hairline'}`}
              >
                <h3 className="subheading text-ink">{d.name}</h3>
                <p className="mt-2 text-ink">
                  <span className="heading">
                    {d.monthlyUsd === null ? '$0' : `$${d.monthlyUsd}`}
                  </span>
                  <span className="text-ink-muted">
                    {d.monthlyUsd === null ? ' forever' : ' /month'}
                  </span>
                </p>
                {d.yearlyUsd ? (
                  <p className="body-small text-ink-muted">or ${d.yearlyUsd} a year</p>
                ) : (
                  <p className="body-small text-ink-muted">No card needed</p>
                )}
                <p className="mt-3 text-ink">Advanced features on {codes(plan)}</p>
                <p className="label mt-auto pt-4 text-ink-muted">
                  {plan === 'free' ? 'Available now' : 'Coming soon'}
                </p>
              </li>
            )
          })}
        </ul>
        <div className="mt-8 max-w-[560px] rounded-lg border border-hairline bg-surface p-5 md:p-6">
          <h3 className="subheading mb-3 text-ink">Get one email when paid plans launch</h3>
          <WaitlistForm
            siteKey={env.turnstileDisabled ? undefined : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </div>
      </section>

      <div className="max-w-[960px]">
        <Faq items={FAQ} />
        <FactBlock />
      </div>
      <JsonLd data={softwareApplication(PRICING)} />
    </div>
  )
}
