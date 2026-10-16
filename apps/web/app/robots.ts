import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/content/registry'

const PRIVATE = ['/dashboard', '/admin', '/api/', '/login']

/**
 * Search engines and AI assistants may read every public page. AI crawlers are named explicitly
 * so the intent is unambiguous (and so a stricter `*` rule later can't block them by accident).
 * Before launch, pages carry a noindex tag instead of a robots block, because a blocked page
 * can't see its noindex.
 */
const AI_AND_SEARCH = [
  'Googlebot',
  'Bingbot',
  'Google-Extended',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Applebot',
  'Applebot-Extended',
  'DuckAssistBot',
  'meta-externalagent',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_AND_SEARCH, allow: '/', disallow: PRIVATE },
      { userAgent: '*', allow: '/', disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
