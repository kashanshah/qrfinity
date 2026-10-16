import { expect, test } from '@playwright/test'
import { scan, signIn } from './helpers'

test('create a dynamic code, scan it, edit the destination, scan again', async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`
  await signIn(page, request, email)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('No codes yet')).toBeVisible()

  await page.getByRole('link', { name: 'New dynamic code' }).click()
  await page.getByLabel('Website address').fill('example.com/first')
  await page.getByLabel('Name (only you see it)').fill('Café menu')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Café menu')

  const shortLink = 'http://' + (await page.locator('header .mono').first().textContent())!.trim()
  expect(shortLink).toMatch(/^http:\/\/localhost:8787\/[0-9A-Za-z]{7}$/)

  // First scan: 302 to the destination.
  expect(await scan(request, shortLink)).toMatchObject({
    status: 302,
    location: 'https://example.com/first',
  })

  // Edit the destination; the printed code (short link) stays the same.
  await page.getByLabel('Website address').fill('example.com/second')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText(/^Saved\./)).toBeVisible()
  await expect
    .poll(async () => (await scan(request, shortLink)).location, { timeout: 45_000 })
    .toBe('https://example.com/second')

  // The scans show up in analytics, and the history lists both destinations.
  await expect
    .poll(
      async () => {
        await page.reload()
        return page
          .getByText('Scans', { exact: true })
          .locator('..')
          .locator('p')
          .nth(1)
          .textContent()
      },
      { timeout: 20_000 },
    )
    .not.toBe('0')
  await expect(
    page
      .getByRole('region', { name: 'Destination history' })
      .getByText('https://example.com/first'),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Destination history' })
      .getByText('https://example.com/second'),
  ).toBeVisible()

  // Pause: scans see the paused page. Turn back on: redirects again.
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByText(/Paused\. Scans now show/)).toBeVisible()
  await expect
    .poll(async () => (await scan(request, shortLink)).status, { timeout: 45_000 })
    .toBe(200)
  expect((await scan(request, shortLink)).body).toContain('This QR code is paused')
  await page.getByRole('button', { name: 'Turn back on' }).click()
  await expect
    .poll(async () => (await scan(request, shortLink)).location, { timeout: 45_000 })
    .toBe('https://example.com/second')

  // Unknown slugs get the friendly 404.
  const missing = await request.get('http://localhost:8787/zzzzzz9', { maxRedirects: 0 })
  expect(missing.status()).toBe(404)
})

test('a dynamic code designed on the homepage survives sign-in', async ({ page, request }) => {
  await page.goto('/')
  // Wait for hydration (the live scan check only runs once React is up) before typing.
  await expect(
    page.getByRole('complementary', { name: 'Your QR code' }).getByText('Scans', { exact: true }),
  ).toBeVisible({ timeout: 15_000 })
  await page.getByText('Dynamic: editable, with scan stats, free account').click()
  await page.getByLabel('Website address').fill('example.com/from-home')
  await page.getByText('Dots', { exact: true }).click()
  await page.getByRole('button', { name: 'Continue with a free account' }).click()
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fnew/)
  await signIn(page, request, `e2e-home-${Date.now()}@example.com`, '/dashboard/new')
  await expect(page).toHaveURL(/\/dashboard\/new/)
  await expect(page.getByLabel('Website address')).toHaveValue('example.com/from-home')
  await expect(page.getByRole('radio', { name: 'Dots' })).toBeChecked()
})

test('the dashboard requires sign-in and export works', async ({ page, request }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
  await signIn(page, request, `e2e-export-${Date.now()}@example.com`)
  await page.goto('/dashboard/account')
  // Without Stripe keys, the plan section shows the free plan and no checkout.
  await expect(page.getByRole('heading', { name: 'Free plan' })).toBeVisible()
  await expect(page.getByText('Advanced features on 0 of 1 code used.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Paid plans are coming soon' })).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^qrfinity-codes-\d{4}-\d{2}-\d{2}\.csv$/)
})

test('a custom short link redirects, and the free allowance is shown', async ({
  page,
  request,
}) => {
  const email = `e2e-slug-${Date.now()}@example.com`
  const slug = `menu-${Date.now().toString(36)}`
  await signIn(page, request, email)
  await page.goto('/dashboard/new')
  await page.getByLabel('Website address').fill('example.com/custom')
  await expect(page.getByText('0 of 1 code used.', { exact: false })).toBeVisible()
  await page.getByLabel('Custom short link (optional)').fill(slug)
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  await expect(page.locator('header .mono').first()).toHaveText(`localhost:8787/${slug}`)
  expect(await scan(request, `http://localhost:8787/${slug}`)).toMatchObject({
    status: 302,
    location: 'https://example.com/custom',
  })
  await page.goto('/dashboard/new')
  await expect(page.getByText('advanced features on 1 of 1 code', { exact: false })).toBeVisible()
})

test('redirect rules send each phone to its own store', async ({ page, request }) => {
  await signIn(page, request, `e2e-rules-${Date.now()}@example.com`)
  await page.goto('/dashboard/new')
  await page.getByLabel('Website address').fill('example.com/app')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  const link = `http://${await page.locator('header .mono').first().innerText()}`

  await page.getByRole('button', { name: 'Add App Store and Google Play rules' }).click()
  const dest = page.getByLabel('Send people to')
  await dest.nth(0).fill('apps.apple.com/app/id123')
  await dest.nth(1).fill('play.google.com/store/apps/details?id=com.example')
  await page.getByRole('button', { name: 'Save rules' }).click()
  await expect(page.getByText('Saved. Scans follow the new rules')).toBeVisible()
  await expect(
    page.getByText('In effect: App Store → Google Play → main destination.'),
  ).toBeVisible()

  expect(await scan(request, link)).toMatchObject({
    status: 302,
    location: 'https://apps.apple.com/app/id123',
  })
  expect(
    await scan(request, link, 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari/537.36'),
  ).toMatchObject({ location: 'https://play.google.com/store/apps/details?id=com.example' })
  expect(
    await scan(
      request,
      link,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36',
    ),
  ).toMatchObject({ location: 'https://example.com/app' })

  // The free code is used: a second code can't have rules too.
  await page.goto('/dashboard/new')
  await page.getByLabel('Website address').fill('example.com/second')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  await expect(page.getByText('advanced features on 1 of 1 code', { exact: false })).toBeVisible()
})

test('a dynamic contact card opens a contact page you can update', async ({ page, request }) => {
  await signIn(page, request, `e2e-card-${Date.now()}@example.com`)
  await page.goto('/dashboard/new')
  await page.getByRole('radio', { name: 'Contact' }).check({ force: true })
  await page.getByLabel('First name').fill('Jane')
  await page.getByLabel('Last name').fill('Doe')
  await page.getByLabel('Mobile').fill('+1 416 555 0100')
  await expect(page.getByPlaceholder('Jane Doe')).toBeVisible()
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  const link = `http://${await page.locator('header .mono').first().innerText()}`
  // A contact card has no redirect rules.
  await expect(page.getByRole('heading', { name: /Redirect rules/ })).toHaveCount(0)

  const res = await request.get(link, { maxRedirects: 0 })
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toContain('<h1>Jane Doe</h1>')
  expect(html).toContain('href="tel:+14165550100"')
  const vcf = await request.get(`${link}.vcf`)
  expect(vcf.headers()['content-type']).toBe('text/vcard; charset=utf-8')
  expect(await vcf.text()).toContain('FN:Jane Doe')

  // Pick a template: the live page uses it.
  await expect(page.getByTitle('Contact page preview')).toBeVisible()
  await page.getByRole('radio', { name: 'Banner' }).check({ force: true })
  await page.getByRole('button', { name: 'Save look' }).click()
  await expect(page.getByText('Saved. Scans show the new look')).toBeVisible()
  await expect
    .poll(async () => (await (await request.get(link)).text()).includes('class="t-banner"'))
    .toBe(true)

  // Update the card: same printed code, new details.
  await page.getByLabel('Last name').fill('Smith')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Scans show the updated card')).toBeVisible()
  await expect
    .poll(async () => (await (await request.get(link)).text()).includes('<h1>Jane Smith</h1>'))
    .toBe(true)
})
