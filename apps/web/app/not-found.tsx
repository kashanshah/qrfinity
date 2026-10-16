import { ArrowRight, QrCode } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageGrid } from '@/components/content/PageGrid'
import { getPage } from '@/content/registry'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

const SUGGESTIONS = [
  '/qr-code-generator',
  '/dynamic-qr-code-generator',
  '/guides',
  '/qr-code-no-expiration',
]

/** Shown for unknown addresses and wherever a page calls notFound(). */
export default function NotFound() {
  const stoppedWorking = getPage('/qr-code-stopped-working')
  return (
    <div className="mx-auto max-w-[960px] px-4 pb-16 pt-10 md:px-6 md:pt-16">
      <p className="label text-ink-muted">Error 404</p>
      <h1 className="page-title mt-2 max-w-[22ch] text-ink">We can’t find that page</h1>
      <p className="subheading mt-3 max-w-[60ch] text-ink-muted">
        The address may be mistyped, or the page may have moved.
      </p>

      <div className="mt-8">
        <Link
          href="/"
          className="button inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-evergreen px-6 py-3 text-on-evergreen transition-colors hover:bg-evergreen-deep"
        >
          <QrCode aria-hidden="true" size={18} strokeWidth={1.75} />
          Make a QR code
        </Link>
      </div>

      <div className="mt-10 rounded-lg bg-mint p-4 md:p-6">
        <h2 className="subheading text-ink">Scanned a QR code and ended up here?</h2>
        <p className="body mt-1 max-w-[60ch] text-ink">
          The code itself is likely fine; the page it points to just isn’t here. QRfinity codes
          never expire, and the owner of a dynamic code can point it somewhere new.
        </p>
        <Link
          href={stoppedWorking.path}
          className="label mt-3 inline-flex items-center gap-1 rounded-sm font-bold text-evergreen underline"
        >
          What to do when a QR code stops working
          <ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} />
        </Link>
      </div>

      <section className="mt-12">
        <h2 className="heading mb-4 text-ink">Or try one of these</h2>
        <PageGrid pages={SUGGESTIONS.map(getPage)} columns="sm:grid-cols-2" />
      </section>
    </div>
  )
}
