import Link from 'next/link'
import { HeaderAccountLink } from './HeaderAccountLink'
import { DesktopNav, MobileNav } from './SiteNav'
import { ThemeSwitch } from './ThemeSwitch'

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

        <DesktopNav />

        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitch />
          <HeaderAccountLink />
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
