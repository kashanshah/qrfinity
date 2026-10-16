import { expect, test } from '@playwright/test'
import { ALL_PAGES, SITE_URL } from '../content/registry'

/** Every registered page renders with its own title, description, canonical and valid structured data. */
test.describe('content pages', () => {
  test.skip(({ isMobile }) => isMobile, 'markup checks run once, on desktop')

  for (const p of ALL_PAGES) {
    test(`renders ${p.path}`, async ({ request }) => {
      const res = await request.get(p.path)
      expect(res.status()).toBe(200)
      const html = await res.text()
      const attr = (re: RegExp) =>
        html
          .match(re)?.[1]
          ?.replace(/&amp;/g, '&')
          .replace(/&#x27;/g, "'")
      expect(attr(/<title>([^<]*)<\/title>/)).toBe(p.title)
      expect(attr(/<meta name="description" content="([^"]*)"/)).toBe(p.description)
      expect(attr(/<link rel="canonical" href="([^"]*)"/)).toBe(
        p.path === '/' ? SITE_URL : `${SITE_URL}${p.path}`,
      )
      // Pages stay out of search results until launch approval.
      if (process.env.NEXT_PUBLIC_INDEXABLE !== 'true')
        expect(html).toMatch(/<meta name="robots" content="noindex/)
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(html).toContain('/opengraph-image')
      const blocks = [
        ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g),
      ].map((m) => JSON.parse(m[1]!))
      const types = blocks.map((b) => b['@type'])
      expect(types).toContain('Organization')
      if (p.kind !== 'home') expect(types).toContain('BreadcrumbList')
      if (p.kind === 'guide' || p.kind === 'alternative') expect(types).toContain('Article')
      if (p.kind === 'use-case' || p.kind === 'home' || p.kind === 'pricing')
        expect(types).toContain('SoftwareApplication')
      if (p.kind === 'use-case' || p.kind === 'guide' || p.kind === 'alternative') {
        const faq = blocks.find((b) => b['@type'] === 'FAQPage')
        expect(faq?.mainEntity.length).toBeGreaterThanOrEqual(4)
      }
      expect(html).not.toContain('PLACEHOLDER')
    })
  }

  test('query strings canonicalise to the clean URL', async ({ request }) => {
    const html = await (await request.get('/qr-code-generator/wifi?utm_source=test&ref=x')).text()
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/qr-code-generator/wifi"/>`)
  })

  test('sitemap lists every page and robots points to it', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    for (const p of ALL_PAGES)
      expect(xml).toContain(`<loc>${p.path === '/' ? SITE_URL : SITE_URL + p.path}</loc>`)
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
    expect(robots).toContain('Disallow: /dashboard')
  })

  test('the Wi-Fi page preloads the Wi-Fi generator and scans', async ({ page }) => {
    await page.goto('/qr-code-generator/wifi')
    await expect(page.getByLabel('Network name (SSID)')).toBeVisible()
    await page.getByLabel('Network name (SSID)').fill('Cafe Guest')
    await page.getByLabel('Password', { exact: true }).fill('coffee-and-cake')
    await expect(page.getByText('Scans', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  })

  test('the pricing waitlist accepts an email', async ({ page }) => {
    await page.goto('/pricing')
    await page.getByLabel('Your email').fill(`waitlist-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Tell me when Pro launches' }).click()
    await expect(page.getByText('You’re on the list.')).toBeVisible()
  })
})
