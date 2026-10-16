import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/content/registry'

/**
 * Crawlers (search engines and AI assistants alike) may read every public page. Until launch the
 * pages carry a noindex tag instead of a robots block, because a blocked page can't see its noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/admin', '/api/', '/login'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
