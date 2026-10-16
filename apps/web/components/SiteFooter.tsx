import Link from 'next/link'

const LINKS = [
  ['/report', 'Report a QR code'],
  ['/terms', 'Terms'],
  ['/acceptable-use', 'Acceptable use'],
  ['/privacy', 'Privacy'],
] as const

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-hairline">
      <div className="body-small mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-ink-muted md:flex-row md:items-center md:justify-between md:px-6">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-sm hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <p>© {new Date().getFullYear()} Teknoffice Technologies Inc. QR codes that never expire.</p>
      </div>
    </footer>
  )
}
