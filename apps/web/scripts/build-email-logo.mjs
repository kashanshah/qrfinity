// Email clients (Gmail, Outlook) don't show SVG, so emails use a PNG of the reversed logo.
// Run after the logo changes: node scripts/build-email-logo.mjs (needs a Chromium for Playwright;
// set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled one).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const logo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'brand', 'logo')
const svg = readFileSync(join(logo, 'qrfinity-logo-reversed.svg'), 'utf8')
// Shown at 122 × 32; drawn at 3× so it stays sharp on high-density screens.
const [width, height] = [367, 96]
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })
const page = await browser.newPage({ viewport: { width, height } })
await page.setContent(
  `<body style="margin:0">${svg.replace('<svg ', `<svg width="${width}" height="${height}" `)}</body>`,
)
await page.locator('svg').screenshot({
  path: join(logo, 'qrfinity-logo-reversed-email.png'),
  omitBackground: true,
})
await browser.close()
