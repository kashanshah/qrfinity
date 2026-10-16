import { Mail } from 'lucide-react'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/content/Breadcrumbs'
import { JsonLd } from '@/components/content/JsonLd'
import { FactBlock } from '@/components/content/Prose'
import { ABOUT, HOME, SITE_URL } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata(ABOUT)

const CONTACTS = [
  {
    email: 'hello@qrfinity.com',
    what: 'Questions, feedback and corrections to anything on this site',
  },
  {
    email: 'abuse@qrfinity.com',
    what: 'A QRfinity code that leads somewhere harmful (or use the report form)',
  },
  { email: 'legal@qrfinity.com', what: 'Terms, privacy requests and legal notices' },
  { email: 'info@qrfinity.com', what: 'Press and partnerships' },
]

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4 pt-6 md:px-6 md:pt-10">
      <Breadcrumbs
        items={[
          { name: 'Home', path: HOME.path },
          { name: ABOUT.label, path: ABOUT.path },
        ]}
      />
      <header className="mb-10 mt-6">
        <h1 className="page-title text-ink">{ABOUT.h1}</h1>
        <p className="subheading mt-3 max-w-[60ch] text-ink-muted">{ABOUT.intro}</p>
      </header>

      <div className="flex max-w-[760px] flex-col gap-10 text-ink">
        <section aria-labelledby="what">
          <h2 id="what" className="heading mb-4">
            What QRfinity is
          </h2>
          <p className="mb-4">
            QRfinity is a free QR code generator. Static codes are made in your browser with no
            sign-up. Dynamic codes, which you can edit and track, need a free account. Both are
            unlimited, and neither ever expires.
          </p>
          <p>
            It’s made by Teknoffice Technologies Inc., a software company in Ontario, Canada.
            QRfinity launched in 2026.
          </p>
        </section>

        <section aria-labelledby="why">
          <h2 id="why" className="heading mb-4">
            Why we built it
          </h2>
          <p className="mb-4">
            Many generators that call themselves free make dynamic codes that stop working when a 7
            to 14 day trial ends, often after the codes are already printed on menus, packaging and
            signs. The fix is to pay, or to reprint everything.
          </p>
          <p>
            We think a QR code should work for as long as the paper it’s printed on. So that’s the
            promise, and it’s written into our{' '}
            <Link href="/terms" className="text-evergreen underline">
              terms
            </Link>
            , not just our marketing: codes never expire, and free features never move behind a
            paywall.
          </p>
        </section>

        <section aria-labelledby="free">
          <h2 id="free" className="heading mb-4">
            How it stays free
          </h2>
          <p className="mb-4">
            Static codes cost us nothing: they’re made on your device. Dynamic codes run on an edge
            network that costs a few dollars per ten million scans. Every feature is free;{' '}
            <Link href="/pricing" className="text-evergreen underline">
              paid plans
            </Link>{' '}
            let heavy users put advanced features on more codes. We don’t show ads and we don’t sell
            data.
          </p>
        </section>

        <section aria-labelledby="contact">
          <h2 id="contact" className="heading mb-4">
            Contact us
          </h2>
          <p className="mb-4">A person reads every email, usually within two business days.</p>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {CONTACTS.map((c) => (
              <li key={c.email} className="flex flex-wrap items-start gap-3 p-4">
                <Mail
                  aria-hidden="true"
                  size={20}
                  strokeWidth={1.75}
                  className="mt-[3px] shrink-0 text-evergreen"
                />
                <div>
                  <a href={`mailto:${c.email}`} className="font-bold text-evergreen underline">
                    {c.email}
                  </a>
                  <p className="body-small text-ink-muted">{c.what}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="max-w-[960px]">
        <FactBlock />
      </div>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          url: `${SITE_URL}${ABOUT.path}`,
          name: ABOUT.title,
          about: { '@id': `${SITE_URL}/#organization` },
        }}
      />
    </div>
  )
}
