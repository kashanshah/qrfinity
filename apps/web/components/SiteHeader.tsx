import { ChevronDown, Menu } from 'lucide-react'
import Link from 'next/link'
import { HeaderAccountLink } from './HeaderAccountLink'
import { ThemeOptions, ThemeSwitch } from './ThemeSwitch'

type NavLink = { href: string; label: string }
type NavItem = NavLink & { children?: NavLink[] }

/** Groups open on hover and on keyboard focus (CSS only), and their heading links to the hub. */
const NAV: NavItem[] = [
  {
    href: '/qr-code-generator',
    label: 'QR codes',
    children: [
      { href: '/qr-code-generator', label: 'All QR code types' },
      { href: '/dynamic-qr-code-generator', label: 'Dynamic QR codes' },
      { href: '/password-protected-qr-code', label: 'Password protection' },
      { href: '/qr-code-redirect', label: 'Redirect rules' },
      { href: '/custom-short-link-qr-code', label: 'Custom short links' },
      { href: '/qr-code-no-expiration', label: 'Codes that never expire' },
    ],
  },
  {
    href: '/barcode-generator',
    label: 'Barcodes',
    children: [
      { href: '/barcode-generator', label: 'Barcode generator' },
      { href: '/barcode-generator/upc', label: 'UPC' },
      { href: '/barcode-generator/ean-13', label: 'EAN-13' },
      { href: '/barcode-generator/amazon-fnsku', label: 'Amazon FNSKU labels' },
      { href: '/barcode-generator/isbn', label: 'ISBN for books' },
      { href: '/barcode-generator/code-128', label: 'Code 128' },
      { href: '/barcode-generator/itf-14', label: 'ITF-14 for cartons' },
    ],
  },
  {
    href: '/qr-code-scanner',
    label: 'Tools',
    children: [
      { href: '/qr-code-scanner', label: 'QR code scanner' },
      { href: '/qr-code-checker', label: 'QR code checker' },
      { href: '/qr-code-tester', label: 'QR code tester' },
    ],
  },
  { href: '/guides', label: 'Guides' },
  { href: '/pricing', label: 'Pricing' },
]

export function SiteHeader() {
  return (
    <header className="border-b border-hairline bg-ground">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-6">
        <Link href="/" aria-label="QRfinity home" className="shrink-0 rounded-sm">
          {/* Both logos are in the page; CSS shows the one for the theme (auto, or the visitor's choice). */}
          <img
            src="/brand/qrfinity-logo.svg"
            alt="QRfinity"
            width={122}
            height={32}
            className="theme-light-only h-8 w-auto"
          />
          <img
            src="/brand/qrfinity-logo-reversed.svg"
            alt="QRfinity"
            width={122}
            height={32}
            className="theme-dark-only h-8 w-auto"
          />
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((l) => (
              <li key={l.label} className="group relative">
                <Link
                  href={l.href}
                  className="label flex items-center gap-1 rounded-md px-3 py-2 text-ink-muted hover:bg-surface-sunk hover:text-ink"
                >
                  {l.label}
                  {l.children ? (
                    <ChevronDown
                      aria-hidden="true"
                      size={14}
                      strokeWidth={2}
                      className="transition-transform group-focus-within:rotate-180 group-hover:rotate-180"
                    />
                  ) : null}
                </Link>
                {l.children ? (
                  // pt-2 keeps the pointer inside the group while it moves down to the panel.
                  <div className="invisible absolute left-0 top-full z-40 pt-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    <ul className="w-60 rounded-lg border border-hairline bg-surface p-2 shadow-card">
                      {l.children.map((c) => (
                        <li key={c.href + c.label}>
                          <Link
                            href={c.href}
                            className="flex min-h-10 items-center rounded-md px-3 text-ink hover:bg-surface-sunk"
                          >
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <HeaderAccountLink />
          {/* Phones: the same links in a disclosure, so the menu works without JavaScript. */}
          <details className="group relative md:hidden">
            <summary
              aria-label="Menu"
              className="flex size-11 list-none items-center justify-center rounded-md text-ink hover:bg-surface-sunk [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden="true" size={22} strokeWidth={1.75} />
            </summary>
            <nav
              aria-label="Main"
              className="absolute right-0 top-12 z-40 w-64 rounded-lg border border-hairline bg-surface p-2 shadow-card"
            >
              <ul className="flex max-h-[70vh] flex-col overflow-y-auto">
                {NAV.map((l) =>
                  l.children ? (
                    <li key={l.label} className="mb-1">
                      <p className="label px-3 pb-1 pt-2 text-ink-muted">{l.label}</p>
                      <ul>
                        {l.children.map((c) => (
                          <li key={c.href + c.label}>
                            <Link
                              href={c.href}
                              className="flex min-h-11 items-center rounded-md px-3 text-ink hover:bg-surface-sunk"
                            >
                              {c.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="flex min-h-11 items-center rounded-md px-3 text-ink hover:bg-surface-sunk"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
              <div className="mt-2 border-t border-hairline pt-2">
                <p className="label px-3 pb-1 text-ink-muted">Theme</p>
                <ThemeOptions />
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
