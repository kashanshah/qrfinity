import { Check, Clock } from 'lucide-react'
import { Breadcrumbs } from '@/components/content/Breadcrumbs'
import { Faq, type FaqItem } from '@/components/content/Faq'
import { JsonLd, softwareApplication } from '@/components/content/JsonLd'
import { FactBlock } from '@/components/content/Prose'
import { HOME, PRICING } from '@/content/registry'
import { env } from '@/lib/server/env'
import { pageMetadata } from '@/lib/seo'
import { ComparePlans } from './ComparePlans'
import { PlanPicker } from './PlanPicker'
import { WaitlistForm } from './WaitlistForm'

export const metadata = pageMetadata(PRICING)

const FREE = [
  'Unlimited static QR codes, no sign-up',
  'Unlimited dynamic QR codes with a free account',
  'Edit where a dynamic code points, any time',
  'Dynamic contact cards with two page templates, updated any time',
  'Scan analytics: totals, unique scans, devices, countries, up to 2 years of history, CSV download',
  'Every design option: colours, shapes, logo, frames',
  'PNG and JPG downloads',
  'No watermark, no ads, and no trial that runs out',
]

const PLAN_EXTRAS: { name: string; detail: string }[] = [
  { name: 'Print formats', detail: 'SVG, PDF and EPS files that stay sharp at any size' },
  {
    name: 'More contact card templates',
    detail: '4 on Plus, 6 on Pro, all 8 on Unlimited',
  },
]

const ADVANCED: { name: string; detail: string; ready: boolean }[] = [
  {
    name: 'Custom short links',
    detail: 'qrfinity.link/joes-menu instead of a random link',
    ready: true,
  },
  {
    name: 'Redirect rules',
    detail: 'iPhone to the App Store, Android to Google Play; by country, day or time',
    ready: true,
  },
  {
    name: 'Password protection',
    detail: 'Only people with the password can open the link',
    ready: false,
  },
]

const FAQ: FaqItem[] = [
  {
    q: 'Is QRfinity really free?',
    a: 'Yes. Unlimited static and dynamic codes, scan analytics, every design option and PNG and JPG downloads are free. Paid plans add print-ready SVG, PDF and EPS files and more contact card templates, and let you use advanced features, like custom short links and redirect rules, on more codes.',
  },
  {
    q: 'What counts as a code with advanced features?',
    a: 'Any dynamic code that uses at least one advanced feature, such as a custom short link or redirect rules. A code counts once however many advanced features it uses. Plain dynamic codes never count and are always unlimited.',
  },
  {
    q: 'What happens if I stop paying?',
    a: 'Every code keeps working, and custom short links keep working too, so nothing you printed breaks. Advanced features stay on as many codes as the free plan covers (your oldest); on the others, redirect rules pause and scans go to each code’s main destination. Choose a plan again and they switch straight back on.',
  },
  {
    q: 'Will my free codes ever stop working?',
    a: 'No. Codes never expire and are never paused for not paying. A dynamic code only stops if you pause it yourself, or if we turn it off because it breaks our acceptable use policy (for example, phishing).',
  },
  {
    q: 'Can plans change?',
    a: 'As QRfinity grows we may change what each plan includes or costs. We’ll tell you before a change affects a plan you pay for, and codes you’ve already made keep working either way.',
  },
]

const SOON: FaqItem = {
  q: 'When can I buy a plan?',
  a: 'Paid plans are coming soon. Join the list below and we’ll send one email when you can sign up.',
}

const BILLING: FaqItem[] = [
  {
    q: 'Is there a free trial?',
    a: 'Yes. Your first plan is free for a month, with every feature of that plan. You add a card at checkout and we charge it after 30 days unless you cancel before then; we email you a reminder first. If that first payment fails, the plan’s extra advanced features pause until it’s paid. Your codes and short links keep working throughout.',
  },
  {
    q: 'How do I cancel or change my plan?',
    a: 'From your account page, open Manage plan and billing. You can switch plans, update your card, download invoices or cancel there. After cancelling, your plan stays until the end of the period you paid for.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes, within 14 days of your first payment for a plan: email hello@qrfinity.com and we’ll refund it in full. Renewals aren’t refunded, but you can cancel any time so the next one never happens.',
  },
  {
    q: 'Do prices include tax?',
    a: 'Prices are in US dollars before tax. Sales tax, VAT or GST is added at checkout where the law requires it, based on your billing address. Businesses can add a tax ID.',
  },
]

export default function PricingPage() {
  // Read at build time: set the Stripe keys, then redeploy to switch plans on.
  const billingOn = env.stripe !== null
  const faq = billingOn ? [...FAQ, ...BILLING] : [...FAQ, SOON]
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
            Codes you make keep working, whether you pay or not.
          </p>
        </section>

        <section
          aria-labelledby="advanced"
          className="rounded-xl border border-hairline bg-surface p-6 md:p-8"
        >
          <h2 id="advanced" className="heading text-ink">
            Paid plans add
          </h2>
          <ul className="mt-5 flex flex-col gap-4">
            {PLAN_EXTRAS.map((a) => (
              <li key={a.name} className="flex gap-3 text-ink">
                <Check
                  aria-hidden="true"
                  size={20}
                  strokeWidth={1.75}
                  className="mt-[3px] shrink-0 text-evergreen"
                />
                <span>
                  <span className="font-bold">{a.name}</span>
                  <span className="body-small block text-ink-muted">{a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <h3 className="subheading mt-6 text-ink">Advanced features on more codes</h3>
          <p className="mt-1 text-ink-muted">Free on one code. A plan covers more.</p>
          <ul className="mt-4 flex flex-col gap-4">
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
          Paid plans add print formats and more contact card templates, and let more codes use
          advanced features.{' '}
          <a href="#compare" className="text-evergreen underline">
            Compare plans
          </a>
        </p>
        <PlanPicker billingOn={billingOn} />
        {billingOn ? null : (
          <div className="mt-8 max-w-[560px] rounded-lg border border-hairline bg-surface p-5 md:p-6">
            <h3 className="subheading mb-3 text-ink">Get one email when paid plans launch</h3>
            <WaitlistForm
              siteKey={
                env.turnstileDisabled ? undefined : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
              }
            />
          </div>
        )}
      </section>

      <ComparePlans />

      <div className="max-w-[960px]">
        <Faq items={faq} />
        <FactBlock />
      </div>
      <JsonLd data={softwareApplication(PRICING)} />
    </div>
  )
}
