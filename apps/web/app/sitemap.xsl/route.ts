import tokens from '../../../../brand/tokens.json'
import { SITE_URL } from '@/content/registry'

export const dynamic = 'force-static'

/** The stylesheet is served outside the app's CSS, so the brand variables come from the token source. */
const themeVars = (theme: 'light' | 'dark') =>
  [...tokens.color.tokens, ...tokens.shadow.tokens]
    .map((t) => `--${t.name}: ${typeof t.value === 'string' ? t.value : t.value[theme]};`)
    .join(' ')

const rootVars = [
  ...tokens.radius.tokens.map((t) => `--${t.name}: ${t.value};`),
  ...Object.entries(tokens.type.families).map(([k, v]) => `--font-${k}: ${v};`),
].join(' ')

const css = `
:root { ${themeVars('light')} ${rootVars} color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { ${themeVars('dark')} } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--font-sans); font-size: 16px; line-height: 1.5; }
main { max-width: 960px; margin: 0 auto; padding: 40px 16px 64px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
header img { display: block; height: 32px; width: auto; }
h1 { font-family: var(--font-display); font-weight: 800; font-size: 40px; line-height: 1.1; margin: 40px 0 8px; letter-spacing: -0.01em; }
.lede { color: var(--ink-muted); margin: 0 0 32px; max-width: 60ch; }
.lede a, header a.back { color: var(--evergreen); font-weight: 700; }
.count { display: inline-block; background: var(--mint); color: var(--ink); border-radius: var(--radius-pill); padding: 2px 12px; font-weight: 700; font-size: 14px; }
.card { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); overflow: hidden; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 20px; }
th { white-space: nowrap; background: var(--surface-sunk); color: var(--ink-muted); font-size: 13px; font-weight: 700; }
tbody tr + tr td { border-top: 1px solid var(--hairline); }
tbody tr:hover td { background: var(--surface-sunk); }
td a { color: var(--ink); text-decoration: none; font-family: var(--font-mono); font-size: 14px; overflow-wrap: anywhere; }
td a:hover { color: var(--evergreen); text-decoration: underline; }
td a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }
td.date { color: var(--ink-muted); white-space: nowrap; font-size: 14px; width: 1%; }
@media (max-width: 560px) { h1 { font-size: 32px; } th, td { padding: 10px 14px; } }
`

const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  exclude-result-prefixes="sm">
  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat" />
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Sitemap | QRfinity</title>
        <style>${css}</style>
      </head>
      <body>
        <main>
          <header>
            <a href="/" aria-label="QRfinity home">
              <picture>
                <source srcset="/brand/qrfinity-logo-reversed.svg" media="(prefers-color-scheme: dark)" />
                <img src="/brand/qrfinity-logo.svg" alt="QRfinity" />
              </picture>
            </a>
            <a class="back" href="/">Make a QR code</a>
          </header>
          <h1>Sitemap</h1>
          <p class="lede">
            This is the list of pages search engines read to find QRfinity.
            <span class="count"><xsl:value-of select="count(sm:urlset/sm:url)" /> pages</span>
          </p>
          <div class="card">
            <table>
              <thead><tr><th scope="col">Page</th><th scope="col">Last updated</th></tr></thead>
              <tbody>
                <xsl:for-each select="sm:urlset/sm:url">
                  <xsl:sort select="sm:loc" />
                  <xsl:variable name="path" select="substring-after(sm:loc, '${SITE_URL}')" />
                  <tr>
                    <td>
                      <a href="{sm:loc}">
                        <xsl:choose>
                          <xsl:when test="$path = ''">/</xsl:when>
                          <xsl:otherwise><xsl:value-of select="$path" /></xsl:otherwise>
                        </xsl:choose>
                      </a>
                    </td>
                    <td class="date"><xsl:value-of select="substring(sm:lastmod, 1, 10)" /></td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
`

/** Presentation for /sitemap.xml in a browser. Crawlers ignore it. */
export function GET() {
  return new Response(xsl, {
    headers: { 'Content-Type': 'text/xsl; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  })
}
