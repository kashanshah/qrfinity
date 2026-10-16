/**
 * Screenshots of QRfinity's own generator for the use-case pages ("How to make…" steps).
 * Fills each page's preloaded generator with example data and saves public/screens/<slug>.jpg.
 *
 *   pnpm dev            # in another terminal
 *   node scripts/screenshots.mjs [slug…]
 *
 * Uses PLAYWRIGHT_CHROMIUM_PATH when set, like the e2e tests. BASE_URL defaults to localhost:3000.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = new URL('../public/screens/', import.meta.url)

/** Example data per page: [field label, value] pairs, typed into the generator by label. */
const FILLS = {
  url: [['Website address', 'https://maplecafe.ca']],
  wifi: [
    ['Network name (SSID)', 'Maple Café Guest'],
    ['Password', 'coffee-and-cake-24'],
  ],
  vcard: [
    ['First name', 'Amira'],
    ['Last name', 'Haddad'],
    ['Company', 'Haddad Design'],
    ['Mobile', '+1 416 555 0142'],
    ['Email', 'amira@haddad.design'],
  ],
  'with-logo': [['Website address', 'https://maplecafe.ca']],
  'google-review': [['Website address', 'https://g.page/r/maple-cafe/review']],
  instagram: [['Username or profile link', 'maplecafe']],
  whatsapp: [
    ['WhatsApp number', '+1 416 555 0142'],
    ['Message (optional)', 'Hi, I’d like to book a table.'],
  ],
  pdf: [['Website address', 'https://maplecafe.ca/catering-menu.pdf']],
  menu: [['Website address', 'https://maplecafe.ca/menu']],
  'business-card': [
    ['First name', 'Amira'],
    ['Last name', 'Haddad'],
    ['Job title', 'Designer'],
    ['Mobile', '+1 416 555 0142'],
    ['Email', 'amira@haddad.design'],
  ],
  email: [
    ['Send to', 'hello@maplecafe.ca'],
    ['Subject', 'Catering request'],
  ],
  sms: [
    ['Phone number', '+1 416 555 0142'],
    ['Message', 'JOIN'],
  ],
  location: [['Address or place name', '100 Queen St W, Toronto']],
  event: [
    ['Event name', 'Spring open house'],
    ['Location', 'Maple Café, Toronto'],
  ],
  'app-store': [['App link', 'https://apps.apple.com/app/id000000000']],
  youtube: [['Username or profile link', '@maplecafe']],
  spotify: [['Website address', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M']],
  'payment-link': [['Website address', 'https://buy.stripe.com/test_maplecafe']],
  'amazon-review': [['Website address', 'https://maplecafe.ca/setup-guide']],
  telegram: [['Username or profile link', 'maplecafe']],
  // Restyles an uploaded code instead of filling a form (see below).
  wechat: [],
  bulk: [],
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FILLS)
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
)
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
})

for (const slug of slugs) {
  await page.goto(`${BASE}/qr-code-generator/${slug}`, { waitUntil: 'networkidle' })
  if (slug === 'bulk') {
    // No generator on the bulk page: show the home generator's design step, where templates are saved.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  }
  for (const [label, value] of FILLS[slug] ?? [])
    await page.getByRole('textbox', { name: label, exact: true }).first().fill(value)
  if (slug === 'wechat') {
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(new URL('../e2e/fixtures/wechat-group-qr.png', import.meta.url).pathname)
    await page.locator('#step-content').waitFor()
  }
  if (slug === 'with-logo') {
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(new URL('../app/apple-icon.png', import.meta.url).pathname)
  }
  const target = slug === 'bulk' ? page.locator('#step-design') : page.locator('#step-content')
  await target.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 40),
  )
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.waitForTimeout(1000) // let the preview and scan check settle
  const file = new URL(`${slug}.jpg`, OUT)
  await page.screenshot({ path: file.pathname, type: 'jpeg', quality: 78 })
  console.log('saved', file.pathname)
}
await browser.close()
