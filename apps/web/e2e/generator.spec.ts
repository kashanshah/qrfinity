import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { openGenerator } from './helpers'

const scanBadge = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Your QR code' })
    .getByText(/^(Scans|Won’t scan)$/)
    .first()

async function expectScans(page: Page) {
  await expect(scanBadge(page)).toHaveText('Scans', { timeout: 15_000 })
}

test('default code renders and passes the scan check', async ({ page }) => {
  await openGenerator(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Free QR codes that never expire.',
  )
  await expectScans(page)
  await expect(
    page.getByRole('complementary', { name: 'Your QR code' }).getByText('Static', { exact: true }),
  ).toBeVisible()
})

test('typing a link updates the code and it still scans', async ({ page }) => {
  await openGenerator(page)
  await page.getByLabel('Website address').fill('example.com/menu')
  await expectScans(page)
})

test('a low-contrast design fails the scan check', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await openGenerator(page)
  await page.getByText('Colours', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Code colour', exact: true }).fill('#f5c542')
  await expect(scanBadge(page)).toHaveText('Won’t scan', { timeout: 15_000 })
  await expect(
    page.getByRole('complementary', { name: 'Your QR code' }).getByText('too close for a camera'),
  ).toBeVisible()
})

test('Wi-Fi content encodes and scans', async ({ page }) => {
  await openGenerator(page)
  await page.getByRole('radio', { name: 'Wi-Fi' }).check({ force: true })
  await page.getByLabel('Network name (SSID)').fill('Café Guest')
  await page.getByLabel('Password', { exact: true }).fill('welcome123')
  await expectScans(page)
})

for (const format of ['PNG', 'JPG'] as const) {
  test(`downloads ${format}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'covered on desktop')
    await openGenerator(page)
    await expectScans(page)
    const name = format === 'PNG' ? 'Download PNG' : format
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ])
    const bytes = await readFile((await download.path())!)
    expect(bytes.length).toBeGreaterThan(200)
    const head = bytes.subarray(0, 16).toString('latin1')
    const magic = { PNG: '\x89PNG', JPG: '\xff\xd8\xff' }[format]
    expect(head.startsWith(magic)).toBe(true)
  })
}

test('SVG, PDF and EPS point to paid plans on the free plan', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await openGenerator(page)
  await expectScans(page)
  let downloaded = false
  page.on('download', () => (downloaded = true))
  await page.getByRole('button', { name: 'EPS', exact: true }).click()
  await expect(page.getByText('SVG, PDF and EPS come with any paid plan')).toBeVisible()
  await expect(page.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', '/pricing')
  expect(downloaded).toBe(false)
})

test('the free zip holds PNG and JPG in every size', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await openGenerator(page)
  await expectScans(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PNG and JPG in every size (.zip)' }).click(),
  ])
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  for (const f of ['qr-code-url-512px.png', 'qr-code-url-1024px.jpg'])
    expect(bytes.includes(Buffer.from(f))).toBe(true)
  for (const f of ['qr-code-url.pdf', 'qr-code-url.eps', 'qr-code-url.svg'])
    expect(bytes.includes(Buffer.from(f))).toBe(false)
})

test('no horizontal scroll on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phones only')
  await openGenerator(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('gradient previews reference gradients inside their own SVG', async ({ page }) => {
  await openGenerator(page)
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
  await openGenerator(page)
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
  await openGenerator(page)
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

test('a Pix payment code encodes and scans', async ({ page }) => {
  await page.goto('/qr-code-generator/pix')
  // Typing before React is up would be lost: retry until the key sticks.
  const key = page.getByLabel('Pix key')
  await expect(async () => {
    await key.fill('+55 11 91234 5678')
    await expect(key).toHaveValue('+55 11 91234 5678', { timeout: 500 })
    await page.waitForTimeout(300)
    await expect(key).toHaveValue('+55 11 91234 5678', { timeout: 100 })
  }).toPass()
  await page.getByLabel('Name on the account').fill('Café Bordô')
  await page.getByLabel('City', { exact: true }).fill('São Paulo')
  await page.getByLabel('Amount (optional)').fill('12,50')
  await expectScans(page)
  // UPI and Pix are read by the payer's app, so their pages make static codes only.
  await expect(page.getByRole('radio', { name: /^Dynamic/ })).toHaveCount(0)
})

test('dynamic payment codes offer only link methods', async ({ page }) => {
  await openGenerator(page)
  await page.getByRole('radio', { name: /^Dynamic/ }).check({ force: true })
  await page.getByRole('radio', { name: 'Payment' }).check({ force: true })
  await expect(page.getByLabel('Pay with').locator('option')).toHaveText([
    'PayPal',
    'Venmo',
    'Cash App',
  ])
})

test('frame text in any language is drawn as outlines and still scans', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'covered on desktop')
  await openGenerator(page)
  await page.locator('summary', { hasText: /^Frame/ }).click()
  await page.getByRole('radio', { name: /Label below/ }).check({ force: true })
  const field = page.getByRole('textbox', { name: 'Frame text' })
  const preview = page.getByRole('complementary', { name: 'Your QR code' }).getByRole('img', {
    name: 'QR code preview',
  })
  for (const text of ['扫码加我微信', 'امسح الرمز']) {
    await field.fill(text)
    // Outlines replace the text element once the fonts have loaded.
    await expect(preview.locator('text')).toHaveCount(0)
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    await expectScans(page)
  }
  await field.fill('Hi 😀')
  await expect(page.getByText('We can’t draw 😀 yet, so it’s left out.')).toBeVisible()
})

test('the website address field types a hint while it is empty', async ({ page }) => {
  await page.goto('/')
  const field = page.getByLabel('Website address')
  await expect(field).toHaveValue('')
  await expect(page.locator('.typing-caret')).toBeVisible()
  await expect(field).toHaveClass(/url-hint-ring/)
  // In the field, the hint keeps typing (the browser's caret blinks instead of ours)...
  await field.click()
  await expect(field).not.toHaveClass(/url-hint-ring/)
  await expect(page.locator('[data-url-hint]')).toBeVisible()
  // ...until the first letter, and it comes back when the field is cleared.
  await page.keyboard.type('e')
  await expect(page.locator('[data-url-hint]')).toHaveCount(0)
  await page.keyboard.type('xample.com/menu')
  await expect(field).toHaveValue('example.com/menu')
  await field.fill('')
  await field.blur()
  await expect(page.locator('.typing-caret')).toBeVisible()
})

test('the typing hint stays still for people who prefer less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByLabel('Website address')).toHaveClass(/url-hint-ring/)
  await expect(page.locator('.typing-caret')).toHaveCount(0)
  await expect(page.getByLabel('Website address')).toHaveAttribute(
    'placeholder',
    'yourcafe.com/menu',
  )
})
