import { Menu } from 'lucide-react'
import Link from 'next/link'
import { HeaderAccountLink } from './HeaderAccountLink'

const NAV = [
  { href: '/qr-code-generator', label: 'QR code types' },
  { href: '/dynamic-qr-code-generator', label: 'Dynamic codes' },
  { href: '/guides', label: 'Guides' },
  { href: '/pricing', label: 'Pricing' },
]

export function SiteHeader() {
  return (
    <header className="border-b border-hairline bg-ground">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 md:px-6">
        <Link href="/" aria-label="QRfinity home" className="shrink-0 rounded-sm">
          <picture>
            <source
              srcSet="/brand/qrfinity-logo-reversed.svg"
              media="(prefers-color-scheme: dark)"
            />
            <img
              src="/brand/qrfinity-logo.svg"
              alt="QRfinity"
              width={122}
              height={32}
              className="h-8 w-auto"
            />
          </picture>
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="label rounded-md px-3 py-2 text-ink-muted hover:bg-surface-sunk hover:text-ink"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
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
              className="absolute right-0 top-12 z-40 w-56 rounded-lg border border-hairline bg-surface p-2 shadow-card"
            >
              <ul className="flex flex-col">
                {NAV.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex min-h-11 items-center rounded-md px-3 text-ink hover:bg-surface-sunk"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
