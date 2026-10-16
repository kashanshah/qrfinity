import path from 'node:path'
import createMDX from '@next/mdx'
import type { NextConfig } from 'next'

// Google Analytics loads only when NEXT_PUBLIC_GA_ID is set; PostHog is proxied through /ingest.
const ga = process.env.NEXT_PUBLIC_GA_ID?.trim()
const gaScript = ga ? ' https://www.googletagmanager.com' : ''
const gaConnect = ga
  ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com'
  : ''
// Address suggestions (Google Places) load only when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set.
const maps = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim())
const mapsScript = maps ? ' https://maps.googleapis.com' : ''
const mapsConnect = maps ? ' https://maps.googleapis.com https://places.googleapis.com' : ''
const mapsImg = maps ? ' https://maps.gstatic.com https://maps.googleapis.com' : ''
const posthogHost = (
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com'
).replace(/\/$/, '')
const posthogAssets = posthogHost.replace('.i.posthog.com', '-assets.i.posthog.com')

// Static generation runs entirely in the browser; the scan check needs WebAssembly and a worker.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com${gaScript}${mapsScript}`,
  // Turnstile renders its check in an iframe.
  'frame-src https://challenges.cloudflare.com',
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${ga ? ' https://*.google-analytics.com https://*.googletagmanager.com' : ''}${mapsImg}`,
  "font-src 'self'",
  `connect-src 'self'${gaConnect}${mapsConnect}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['@qrfinity/core'],
  // The app imports brand/tokens.css from the repository root.
  turbopack: { root: path.resolve(process.cwd(), '../..') },
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  // PostHog through our own domain: not blocked by ad blockers, and no third-party CSP entries.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()) return []
    return [
      { source: '/ingest/static/:path*', destination: `${posthogAssets}/static/:path*` },
      { source: '/ingest/array/:path*', destination: `${posthogAssets}/array/:path*` },
      { source: '/ingest/:path*', destination: `${posthogHost}/:path*` },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

// Content pages (legal and SEO pages) are MDX. Plugins are named by string so Turbopack can load them.
export default createMDX({ options: { remarkPlugins: ['remark-gfm'] } })(nextConfig)
