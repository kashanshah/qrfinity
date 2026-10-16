import { FACT_BLOCK, SITE_NAME, SITE_URL, type ContentPage } from '@/content/registry'
import { absoluteUrl } from '@/lib/seo'

type Json = Record<string, unknown>

/** Renders structured data. "<" is escaped so content can never close the script tag. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

export const organization = (): Json => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/brand/qrfinity-mark.svg`,
  description: FACT_BLOCK,
  parentOrganization: { '@type': 'Organization', name: 'Teknoffice Technologies Inc.' },
})

export const softwareApplication = (page: ContentPage): Json => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: page.kind === 'home' ? SITE_NAME : `${SITE_NAME}: ${page.h1}`,
  url: absoluteUrl(page.path),
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any (web browser)',
  description: page.description,
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@id': `${SITE_URL}/#organization` },
})

export const faqPage = (faq: { q: string; a: string }[]): Json => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
})

export const breadcrumbList = (items: { name: string; path: string }[]): Json => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: absoluteUrl(it.path),
  })),
})

export const article = (page: ContentPage): Json => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: page.h1,
  description: page.description,
  datePublished: page.updated,
  dateModified: page.updated,
  mainEntityOfPage: absoluteUrl(page.path),
  image: `${absoluteUrl(page.path)}/opengraph-image`,
  author: { '@id': `${SITE_URL}/#organization` },
  publisher: { '@id': `${SITE_URL}/#organization` },
})
