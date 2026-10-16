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
  'Scan analytics: totals, unique scans, devices, countries, 90 days of history',
  'Every design option: colours, shapes, logo, frames',
  'Every format: PNG, JPG, SVG, PDF and EPS',
  'No watermark, no trial, no expiry',
]

const PRO = [
  'Full analytics history and CSV export',
  'Your own branded short domain',
  'Bulk creation from a spreadsheet',
  'Redirect rules by country, device or time',
  'Password-protected codes',
  'UTM link builder and retargeting pixels',
]

const FAQ: FaqItem[] = [
  {
    q: 'Is QRfinity really free?',
    a: 'Yes. Static and dynamic codes, analytics, every design option and every download format are free, with no trial and no limit on how many codes you make. Pro will add new tools for heavy users; it will not take anything away from the free plan.',
  },
  {
    q: 'Will my free codes stop working if I don’t upgrade?',
    a: 'No. Codes never expire and are never paused for not paying. A dynamic code only stops if you pause it yourself, or if we turn it off because it breaks our acceptable use policy (for example, phishing).',
  },
  {
    q: 'Could a free feature move to Pro later?',
    a: 'No. We will never move an existing free feature behind a paywall. Paid plans only add capabilities that don’t exist today.',
  },
  {
    q: 'How do you pay for free dynamic codes?',
    a: 'Redirects run on a lean edge network that costs a few dollars per ten million scans, and Pro will pay for the rest. We don’t sell data and we don’t show ads on the generator, the dashboard or the redirect.',
  },
  {
    q: 'When will Pro launch and what will it cost?',
    a: 'We haven’t set a date or a final price. Join the waitlist and we’ll send one email when it’s ready.',
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

      <div className="grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="free"
          className="rounded-xl border-[1.5px] border-evergreen bg-surface p-6 md:p-8"
        >
          <h2 id="free" className="heading text-ink">
            Free
          </h2>
          <p className="mt-1 text-ink-muted">
            <span className="display-l text-ink">$0</span> forever
          </p>
          <ul className="mt-6 flex flex-col gap-3">
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
          </ul>
          <p className="mt-6 rounded-lg bg-mint p-4 text-ink">
            Our promise: your codes never expire, and we never move a free feature behind a paywall.
          </p>
        </section>

        <section
          aria-labelledby="pro"
          className="rounded-xl border border-hairline bg-surface p-6 md:p-8"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="pro" className="heading text-ink">
              Pro
            </h2>
            <span className="label inline-flex items-center gap-1.5 rounded-pill bg-surface-sunk px-3 py-1 text-ink">
              <Clock aria-hidden="true" size={14} strokeWidth={1.75} />
              Coming soon
            </span>
          </div>
          <p className="mt-1 text-ink-muted">
            For teams and heavy users. Everything in Free, plus:
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {PRO.map((f) => (
              <li key={f} className="flex gap-3 text-ink">
                <Check
                  aria-hidden="true"
                  size={20}
                  strokeWidth={1.75}
                  className="mt-[3px] shrink-0 text-ink-muted"
                />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-hairline pt-6">
            <h3 className="subheading mb-3 text-ink">Get one email when Pro launches</h3>
            <WaitlistForm
              siteKey={
                env.turnstileDisabled ? undefined : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
              }
            />
          </div>
        </section>
      </div>

      <div className="max-w-[960px]">
        <Faq items={FAQ} />
        <FactBlock />
      </div>
      <JsonLd data={softwareApplication(PRICING)} />
    </div>
  )
}
