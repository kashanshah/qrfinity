import type { MetadataRoute } from 'next'
import { ALL_PAGES } from '@/content/registry'
import { absoluteUrl } from '@/lib/seo'

/** Every public content page, from the registry. Legal drafts join once they're approved and indexable. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ALL_PAGES.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: p.updated,
    alternates: { languages: { en: absoluteUrl(p.path) } },
  }))
}
