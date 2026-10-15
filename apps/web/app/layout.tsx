import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import './globals.css'

// Pages stay out of search results until launch (set NEXT_PUBLIC_INDEXABLE=true to allow).
const indexable = process.env.NEXT_PUBLIC_INDEXABLE === 'true'

export const metadata: Metadata = {
  metadataBase: new URL('https://qrfinity.com'),
  title: {
    default: 'Free QR code generator: codes that never expire | QRfinity',
    template: '%s | QRfinity',
  },
  description:
    'Make free QR codes that never expire. No sign-up, no watermark, every format free: PNG, SVG, PDF and EPS.',
  robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1411' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  )
}
