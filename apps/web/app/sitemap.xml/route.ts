import { ALL_PAGES } from '@/content/registry'
import { absoluteUrl } from '@/lib/seo'

export const dynamic = 'force-static'

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Every public content page, from the registry. Legal drafts join once they're approved and
 * indexable. Written by hand rather than with Next's sitemap convention so it can link
 * /sitemap.xsl, which makes the file readable when a person opens it in a browser.
 */
export function GET() {
  const urls = ALL_PAGES.map((p) => {
    const loc = escapeXml(absoluteUrl(p.path))
    return [
      '<url>',
      `<loc>${loc}</loc>`,
      `<xhtml:link rel="alternate" hreflang="en" href="${loc}" />`,
      `<lastmod>${new Date(p.updated).toISOString()}</lastmod>`,
      '</url>',
    ].join('\n')
  })
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
