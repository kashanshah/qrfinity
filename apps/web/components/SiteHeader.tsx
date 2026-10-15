import Link from 'next/link'

export function SiteHeader() {
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center px-4 md:px-6">
        <Link href="/" aria-label="QRfinity home" className="rounded-sm">
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
      </div>
    </header>
  )
}
