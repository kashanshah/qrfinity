import Link from 'next/link'
import { CookieSettingsLink } from './Analytics'
import {
  ALTERNATIVES,
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
        <nav aria-label="Site" className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          {COLUMNS.map((c) => (
            <div key={c.heading}>
              <h2 className="label mb-3 font-bold text-ink">{c.heading}</h2>
              <ul className="flex flex-col gap-2">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="rounded-sm hover:text-ink hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
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
