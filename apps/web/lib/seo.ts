import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, type ContentPage } from '@/content/registry'

/** Content pages are indexable only after launch approval (NEXT_PUBLIC_INDEXABLE=true). */
export const INDEXABLE = process.env.NEXT_PUBLIC_INDEXABLE === 'true'

export function absoluteUrl(path: string) {
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`
}

/**
 * Metadata for a registered page: exact title, description, canonical (query strings
 * from the generator canonicalise to the clean URL), Open Graph and language alternates.
 * Only English exists today; add locales to `languages` when translations ship.
 */
export function pageMetadata(page: ContentPage): Metadata {
  const url = absoluteUrl(page.path)
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: url, languages: { en: url, 'x-default': url } },
    openGraph: {
      type: page.kind === 'guide' ? 'article' : 'website',
      url,
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      locale: 'en',
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
    robots: INDEXABLE ? { index: true, follow: true } : { index: false, follow: true },
  }
}
