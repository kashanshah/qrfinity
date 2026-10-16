import { Check } from 'lucide-react'
import Link from 'next/link'
import { Faq, type FaqItem } from '@/components/content/Faq'
import { JsonLd, softwareApplication, website } from '@/components/content/JsonLd'
import { PageGrid } from '@/components/content/PageGrid'
import { FactBlock } from '@/components/content/Prose'
import { Generator } from '@/components/generator/Generator'
import { getPage, GUIDES, HOME } from '@/content/registry'
import { pageMetadata } from '@/lib/seo'
import { shortLinkBase } from '@/lib/short-link'

export const metadata = pageMetadata(HOME)

const POPULAR = [
  'wifi',
  'url',
  'vcard',
  'menu',
  'google-review',
  'with-logo',
  'whatsapp',
  'pdf',
  'business-card',
].map((s) => getPage(`/qr-code-generator/${s}`))

const FAQ: FaqItem[] = [
  {
    q: 'Do QRfinity codes expire?',
    a: 'No. Static codes hold your content directly, so they work for as long as the printed code is readable. Dynamic codes run through our short link, and we never deactivate, pause or limit them, on any plan.',
  },
  {
    q: 'Do I need an account?',
    a: 'Not for static codes: make and download as many as you like without signing up. A free account is needed only for dynamic codes, so that you, and only you, can change where they point.',
  },
  {
    q: 'What is the difference between static and dynamic QR codes?',
    a: 'A static code stores the link or text itself and can’t be changed after printing. A dynamic code stores a short link that forwards to your destination, so you can edit it later and count scans.',
  },
  {
    q: 'Is there a watermark or a scan limit?',
    a: 'No watermark, no forced branding and no scan limit. PNG and JPG downloads are free; print-ready SVG, PDF and EPS come with a paid plan.',
  },
  {
    q: 'How is this free?',
    a: 'Static codes are made in your browser and cost us nothing. Redirects for dynamic codes cost a few dollars per ten million scans. Paid plans add print formats and more contact card templates, and let you use advanced features, like custom short links, on more codes.',
  },
]

const PROMISES = [
  'Static codes: free, unlimited, no sign-up, never expire.',
  'Dynamic codes: free with an account, never paused for not paying.',
  'No watermark and no forced branding on your codes.',
]

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <section className="pb-8 pt-8 md:pb-12 md:pt-16">
        <h1 className="hero-title max-w-[16ch] text-ink">Free QR codes that never expire.</h1>
        <p className="subheading mt-4 max-w-[60ch] text-ink-muted">
          Print it once. It works forever. No sign-up, no trial, no watermark.
        </p>
      </section>

      <Generator kindChoice shortLinkBase={shortLinkBase()} />

      <section aria-labelledby="promise" className="mt-12 grid gap-8 md:mt-16 md:grid-cols-2">
        <div>
          <h2 id="promise" className="heading text-ink">
            Our promise
          </h2>
          <p className="mt-4 max-w-[60ch] text-ink">
            Many “free” generators make codes that stop working after a 7 to 14 day trial, often
            after they’re printed. Ours don’t. A static code holds your content directly, so it
            keeps working even if QRfinity disappeared.
          </p>
        </div>
        <ul className="flex flex-col gap-3 self-center">
          {PROMISES.map((p) => (
            <li key={p} className="flex gap-3 text-ink">
              <Check
                aria-hidden="true"
                size={20}
                strokeWidth={1.75}
                className="mt-[3px] shrink-0 text-evergreen"
              />
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="types" className="mt-12 md:mt-16">
        <h2 id="types" className="heading mb-4 text-ink">
          Popular QR codes
        </h2>
        <PageGrid pages={POPULAR} />
        <p className="mt-4">
          <Link href="/qr-code-generator" className="label text-evergreen underline">
            See all QR code types
          </Link>
        </p>
      </section>

      <section aria-labelledby="guides" className="mt-12">
        <h2 id="guides" className="heading mb-4 text-ink">
          Guides
        </h2>
        <PageGrid pages={GUIDES} />
      </section>

      <div className="max-w-[960px]">
        <Faq items={FAQ} />
        <FactBlock />
      </div>
      <JsonLd data={[website(), softwareApplication(HOME)]} />
    </div>
  )
}
