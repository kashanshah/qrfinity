import { fileURLToPath } from 'node:url'
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
      ].flatMap((m) => JSON.parse(m[1]!))
      const types = blocks.map((b) => b['@type'])
      expect(types).toContain('Organization')
      if (p.kind !== 'home' && p.kind !== 'legal') expect(types).toContain('BreadcrumbList')
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
    expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>')
    const xsl = await request.get('/sitemap.xsl')
    expect(xsl.headers()['content-type']).toContain('text/xsl')
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
    expect(robots).toContain('Disallow: /dashboard')
  })

  test('the scanner reads a QR code image and pre-fills the generator', async ({ page }) => {
    await page.goto('/qr-code-scanner')
    await page
      .locator('input[type=file]')
      .setInputFiles(fileURLToPath(new URL('./fixtures/wifi-qr.png', import.meta.url)))
    await expect(
      page.getByRole('heading', { name: 'This code holds a Wi-Fi network' }),
    ).toBeVisible()
    await expect(page.getByText('Cafe Guest', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open in the generator' }).click()
    await expect(page.getByLabel('Network name (SSID)')).toHaveValue('Cafe Guest')
  })

  test('the tester passes a good design and fails a pale one', async ({ page }) => {
    await page.goto('/qr-code-tester')
    const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
    await page.locator('input[type=file]').setInputFiles(fixture('wifi-qr.png'))
    await expect(page.getByRole('heading', { name: 'This code should scan well' })).toBeVisible()
    await expect(page.getByText(/Print it at least/)).toBeVisible()
    await page.getByRole('button', { name: 'Open in the generator' }).click()
    await expect(page.getByLabel('Network name (SSID)')).toHaveValue('Cafe Guest')
    await page.getByRole('button', { name: 'Test another code' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture('pale-qr.png'))
    await expect(page.getByRole('heading', { name: 'This code is likely to fail' })).toBeVisible()
    await expect(page.getByText('Contrast is too low')).toBeVisible()
  })

  test('the WeChat page restyles a WeChat code without changing it', async ({ page }) => {
    await page.goto('/qr-code-generator/wechat')
    await page
      .locator('input[type=file]')
      .setInputFiles(fileURLToPath(new URL('./fixtures/wechat-group-qr.png', import.meta.url)))
    await expect(page.getByRole('heading', { name: '1. Your WeChat group code' })).toBeVisible()
    await expect(page.getByText('https://weixin.qq.com/g/AbCdEf123456')).toBeVisible()
    await expect(page.getByText(/stop working 7 days after WeChat makes them/)).toBeVisible()
    // Static only, no content form, the WeChat icon by default, and the copy still scans.
    await expect(page.getByText('Type of code')).toHaveCount(0)
    await expect(page.getByText('The WeChat icon', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('complementary', { name: 'Your QR code' }).getByText(/^(Scans|Won’t scan)$/),
    ).toHaveText('Scans', { timeout: 15_000 })
  })

  test('unknown addresses get the 404 page', async ({ page }) => {
    const res = await page.goto('/no-such-page')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('We can’t find that page')
    await expect(page.getByRole('link', { name: 'Make a QR code', exact: true })).toHaveAttribute('href', '/')
  })

  test('the Wi-Fi page preloads the Wi-Fi generator and scans', async ({ page }) => {
    await page.goto('/qr-code-generator/wifi')
    await expect(page.getByLabel('Network name (SSID)')).toBeVisible()
    await page.getByLabel('Network name (SSID)').fill('Cafe Guest')
    await page.getByLabel('Password', { exact: true }).fill('coffee-and-cake')
    await expect(
      page.getByRole('complementary', { name: 'Your QR code' }).getByText(/^(Scans|Won’t scan)$/),
    ).toHaveText('Scans', { timeout: 15_000 })
  })

  test('the pricing page compares every plan', async ({ page }) => {
    await page.goto('/pricing')
    const table = page.getByRole('table', { name: 'Features and limits of each QRfinity plan' })
    await expect(table.getByRole('columnheader', { name: /Unlimited/ })).toBeVisible()
    const row = table.getByRole('row', { name: /Codes that can use advanced features/ })
    await expect(row).toContainText('1 code')
    await expect(row).toContainText('100 codes')
    await expect(row).toContainText('Every code')
    await expect(table.getByRole('row', { name: /Free trial/ })).toContainText('30 days')
  })

  test('the pricing waitlist accepts an email', async ({ page }) => {
    await page.goto('/pricing')
    await page.getByLabel('Your email').fill(`waitlist-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Tell me when plans launch' }).click()
    await expect(page.getByText('You’re on the list.')).toBeVisible()
  })
})

test('the theme follows the device, and a choice in the header is remembered', async ({
  page,
  isMobile,
}) => {
  // Wider screens: a dropdown in the header. Phones: the same choices in the menu.
  const choose = async (current: string, next: string) => {
    if (isMobile) await page.getByLabel('Menu').click()
    else await page.getByLabel(`Theme: ${current}`).click()
    await page.getByRole('button', { name: next }).click()
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/pricing')
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-theme')
  await expect(page.getByRole('img', { name: 'QRfinity' }).first()).toHaveAttribute(
    'src',
    '/brand/qrfinity-logo.svg',
  )

  await choose('Auto (match device)', 'Dark')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#0e1411',
  )

  // Set before the first paint on the next page, from storage.
  await page.goto('/')
  await expect(html).toHaveAttribute('data-theme', 'dark')
  const logo = page.locator('header img:visible')
  await expect(logo).toHaveCount(1)
  await expect(logo).toHaveAttribute('src', '/brand/qrfinity-logo-reversed.svg')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(14, 20, 17)',
  )

  await choose('Dark', 'Auto (match device)')
  await expect(html).not.toHaveAttribute('data-theme')
  await page.reload()
  await expect(html).not.toHaveAttribute('data-theme')
})
