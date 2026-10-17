import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { CookieSettingsLink } from './Analytics'
import {
  ALTERNATIVES,
  BARCODE_HOME,
  BARCODE_PAGES,
  FEATURE_PAGES,
  GUIDES,
  INDUSTRY_PAGES,
  getPage,
  PRICING,
} from '@/content/registry'
import { AGENCY_URL } from '@/lib/partners'

const TYPES = ['url', 'wifi', 'vcard', 'menu', 'google-review', 'with-logo', 'whatsapp', 'pdf'].map(
  (s) => getPage(`/qr-code-generator/${s}`),
)

const COLUMNS = [
  {
    heading: 'QR codes',
    links: [...TYPES.map((p) => [p.path, p.label]), ['/qr-code-generator', 'All types']],
  },
  {
    heading: 'Free QR codes',
    links: [
      ['/dynamic-qr-code-generator', 'Dynamic QR codes'],
      ['/qr-code-no-expiration', 'No expiration'],
      ['/qr-code-stopped-working', 'Code stopped working?'],
      ['/qr-code-checker', 'QR code checker'],
      ['/qr-code-scanner', 'QR code scanner'],
      ['/qr-code-tester', 'QR code tester'],
      [PRICING.path, PRICING.label],
    ],
  },
  {
    heading: 'Features',
    links: [...FEATURE_PAGES, ...INDUSTRY_PAGES].map((p) => [p.path, p.label]),
  },
  {
    heading: 'Barcodes',
    links: [BARCODE_HOME, ...BARCODE_PAGES].map((p) => [p.path, p.label]),
  },
  { heading: 'Guides', links: GUIDES.map((p) => [p.path, p.label]) },
  {
    heading: 'Compare',
    links: ALTERNATIVES.map((p) => [p.path, p.label.replace('QRfinity vs ', 'vs ')]),
  },
] as const

const LEGAL = [
  ['/about', 'About and contact'],
  ['/report', 'Report a QR code'],
  ['/terms', 'Terms'],
  ['/acceptable-use', 'Acceptable use'],
  ['/privacy', 'Privacy'],
] as const

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-hairline">
      <div className="body-small mx-auto max-w-[1200px] px-4 py-10 text-ink-muted md:px-6">
        {/*
          Phones: each column is a full-width section that opens and closes (<details>, no
          JavaScript; the links are always in the page). Wider screens: every section is shown
          as a column (globals.css, .footer-section).
        */}
        <nav
          aria-label="Site"
          className="grid grid-cols-1 border-t border-hairline md:grid-cols-3 md:gap-8 md:border-t-0 lg:grid-cols-6"
        >
          {COLUMNS.map((c) => (
            <details
              key={c.heading}
              className="footer-section group border-b border-hairline md:border-b-0"
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-bold text-ink md:mb-3 md:min-h-0 md:cursor-auto [&::-webkit-details-marker]:hidden">
                <h2 className="label font-bold">{c.heading}</h2>
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  strokeWidth={1.75}
                  className="transition-transform group-open:rotate-180 md:hidden"
                />
              </summary>
              <ul className="flex flex-col gap-1 pb-4 md:gap-2 md:pb-0">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="inline-flex min-h-10 items-center rounded-sm hover:text-ink hover:underline md:min-h-0"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </nav>
        <div className="mt-10 flex flex-col gap-4 border-t border-hairline pt-6 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-sm hover:text-ink">
                {label}
              </Link>
            ))}
            <CookieSettingsLink className="rounded-sm text-left hover:text-ink" />
          </nav>
          <div className="flex flex-col gap-1 md:items-end">
            {AGENCY_URL ? (
              <a
                href={AGENCY_URL}
                rel="noopener"
                className="rounded-sm hover:text-ink hover:underline"
              >
                Need a QR campaign or landing page built?
              </a>
            ) : null}
            <p>
              © {new Date().getFullYear()} Teknoffice Technologies Inc. QR codes that never expire.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
