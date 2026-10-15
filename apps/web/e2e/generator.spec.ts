import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const scanBadge = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Your QR code' })
    .getByText(/^(Scans|Won’t scan)$/)
    .first()

async function expectScans(page: Page) {
  await expect(scanBadge(page)).toHaveText('Scans', { timeout: 15_000 })
}

test('default code renders and passes the scan check', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Free QR codes that never expire.',
  )
  await expectScans(page)
  await expect(
    page.getByRole('complementary', { name: 'Your QR code' }).getByText('Static', { exact: true }),
  ).toBeVisible()
})

test('typing a link updates the code and it still scans', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Website address').fill('example.com/menu')
  await expectScans(page)
})

test('a low-contrast design fails the scan check', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await page.goto('/')
  await page.getByText('Colours', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Code colour', exact: true }).fill('#f5c542')
  await expect(scanBadge(page)).toHaveText('Won’t scan', { timeout: 15_000 })
  await expect(
    page.getByRole('complementary', { name: 'Your QR code' }).getByText('too close for a camera'),
  ).toBeVisible()
})

test('Wi-Fi content encodes and scans', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Wi-Fi', { exact: true }).click()
  await page.getByLabel('Network name (SSID)').fill('Café Guest')
  await page.getByLabel('Password', { exact: true }).fill('welcome123')
  await expectScans(page)
})

for (const format of ['PNG', 'SVG', 'PDF', 'EPS', 'JPG'] as const) {
  test(`downloads ${format}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'covered on desktop')
    await page.goto('/')
    await expectScans(page)
    const name = format === 'PNG' ? 'Download PNG' : format
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ])
    const bytes = await readFile((await download.path())!)
    expect(bytes.length).toBeGreaterThan(200)
    const head = bytes.subarray(0, 16).toString('latin1')
    const magic = {
      PNG: '\x89PNG',
      SVG: '<svg',
      PDF: '%PDF',
      EPS: '%!PS-Adobe',
      JPG: '\xff\xd8\xff',
    }[format]
    expect(head.startsWith(magic)).toBe(true)
  })
}

test('downloads the zip with every format', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await page.goto('/')
  await expectScans(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'All formats and sizes (.zip)' }).click(),
  ])
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  for (const f of [
    'qr-code-url-512px.png',
    'qr-code-url.pdf',
    'qr-code-url.eps',
    'qr-code-url.svg',
  ]) {
    expect(bytes.includes(Buffer.from(f))).toBe(true)
  }
})

test('no horizontal scroll on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only')
  await page.goto('/')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('gradient previews reference gradients inside their own SVG', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Colours', { exact: true }).click()
  await page.getByText('Linear gradient').click()
  await expectScans(page)
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('.qr-render svg')].flatMap((svg) =>
      [...svg.querySelectorAll('[fill^="url(#"]')]
        .map((el) => el.getAttribute('fill')!.slice(5, -1))
        .filter((id) => !svg.querySelector(`[id="${id}"]`)),
    ),
  )
  expect(broken).toEqual([])
})

test('a logo raises error correction and still scans', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await page.goto('/')
  await page.getByText('Logo', { exact: true }).click()
  // A 64×64 evergreen square PNG, drawn in the page.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0f5132'
    ctx.fillRect(0, 0, 64, 64)
    return c.toDataURL('image/png').split(',')[1]!
  })
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByAltText('Your logo')).toBeVisible()
  await page.getByText('Advanced', { exact: true }).click()
  await expect(page.getByLabel('Error correction')).toBeDisabled()
  await expectScans(page)
})

test('saves a design in this browser and applies it later', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await page.goto('/')
  await page.getByText('Dots', { exact: true }).click()
  await page.getByText('Saved designs', { exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Round dots')
  await page.getByRole('button', { name: 'Save this design' }).click()
  await expect(page.getByText('Saved “Round dots”.')).toBeVisible()
  await page.getByRole('button', { name: 'Reset design' }).click()
  await page.reload()
  await page.getByText('Saved designs', { exact: true }).click()
  await page.getByRole('button', { name: 'Use' }).click()
  await expect(page.getByRole('radio', { name: 'Dots' })).toBeChecked()
})
