import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { openGenerator, scan, setPlan, signIn } from './helpers'

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
  // Wait for hydration (the typing hint only runs once React is up) before typing.
  await expect(page.locator('.typing-caret')).toBeVisible()
  await page.getByRole('radio', { name: /^Dynamic/ }).check({ force: true })
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
  // Every advanced section says so (rules, split, limits, password), faded, with a solid crown.
  await expect(page.getByText('advanced features on 1 of 1 code', { exact: false })).toHaveCount(4)
  await expect(
    page.getByTitle('Advanced feature: you’ve used your free 1 code').first(),
  ).toBeVisible()
})

test('split traffic and a date limit change where scans go', async ({ page, request }) => {
  await signIn(page, request, `e2e-split-${Date.now()}@example.com`)
  await page.goto('/dashboard/new')
  // A free account sees a faint crown beside the custom short link while its free code is unused.
  await expect(page.getByTitle('Advanced feature: free on 1 code, 0 used').first()).toBeVisible()
  await page.getByLabel('Website address').fill('example.com/a')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  const link = `http://${await page.locator('header .mono').first().innerText()}`

  await page.getByRole('button', { name: 'Split traffic 50/50' }).click()
  await page
    .getByRole('region', { name: 'Split traffic' })
    .getByLabel('Send people to')
    .fill('example.com/b')
  await page.getByRole('button', { name: 'Save split' }).click()
  await expect(page.getByText('Saved. Scans follow the new split')).toBeVisible()
  const seen = new Set<string>()
  for (let i = 0; i < 20 && seen.size < 2; i++) seen.add((await scan(request, link)).location!)
  expect([...seen].sort()).toEqual(['https://example.com/a', 'https://example.com/b'])

  // A date in the past switches every scan to the "ended" page.
  const limits = page.getByRole('region', { name: 'Date and scan limits' })
  await limits.getByLabel('After this date').fill('2020-01-01')
  await limits.getByLabel('Then send people to').fill('example.com/ended')
  await page.getByRole('button', { name: 'Save limits' }).click()
  await expect(page.getByText(/^Limit reached/)).toBeVisible()
  expect(await scan(request, link)).toMatchObject({
    status: 302,
    location: 'https://example.com/ended',
  })
  // The crown is now solid: the free code is used.
  await expect(
    page.getByTitle('Advanced feature: you’ve used your free 1 code').first(),
  ).toBeVisible()
})

test('a password-protected code asks for the password on every scan', async ({ page, request }) => {
  await signIn(page, request, `e2e-lock-${Date.now()}@example.com`)
  await page.goto('/dashboard/new')
  await page.getByLabel('Website address').fill('example.com/secret')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/codes\/[0-9a-f-]{36}\?created=1/)
  const link = `http://${await page.locator('header .mono').first().innerText()}`

  await page.getByLabel('Password', { exact: true }).fill('let me in')
  await page.getByRole('button', { name: 'Protect this code' }).click()
  await expect(page.getByText('This code is protected.')).toBeVisible()

  // A scan shows the password page instead of redirecting.
  const locked = await request.get(link, { maxRedirects: 0 })
  expect(locked.status()).toBe(200)
  expect(await locked.text()).toContain('This QR code is protected')
  // A wrong password is refused; the right one redirects.
  const wrong = await request.post(link, { form: { password: 'nope' }, maxRedirects: 0 })
  expect(wrong.status()).toBe(401)
  const right = await request.post(link, { form: { password: 'let me in' }, maxRedirects: 0 })
  expect(right.status()).toBe(303)
  expect(right.headers()['location']).toBe('https://example.com/secret')

  // Removing the password opens the code to everyone again.
  await page.getByRole('button', { name: 'Remove password' }).click()
  await expect(page.getByText(/^Password removed\./)).toBeVisible()
  expect(await scan(request, link)).toMatchObject({
    status: 302,
    location: 'https://example.com/secret',
  })
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
  await page.getByRole('radio', { name: 'Centered' }).check({ force: true })
  await page.getByRole('button', { name: 'Save look' }).click()
  await expect(page.getByText('Saved. Scans show the new look')).toBeVisible()
  await expect
    .poll(async () => (await (await request.get(link)).text()).includes('class="t-centered"'))
    .toBe(true)

  // Paid templates can be previewed, but saving one points to the plan it needs.
  await page.getByRole('radio', { name: 'Spotlight (Unlimited)' }).check({ force: true })
  await expect(page.getByText(/comes with Unlimited and\s+above/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save look' })).toBeDisabled()
  await page.getByRole('radio', { name: 'Centered' }).check({ force: true })

  // Update the card: same printed code, new details.
  await page.getByLabel('Last name').fill('Smith')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Scans show the updated card')).toBeVisible()
  await expect
    .poll(async () => (await (await request.get(link)).text()).includes('<h1>Jane Smith</h1>'))
    .toBe(true)
})

test('a paid plan downloads SVG, PDF and EPS', async ({ page, request }) => {
  const email = `e2e-plus-${Date.now()}@example.com`
  await signIn(page, request, email)
  await setPlan(email, 'plus')
  await openGenerator(page)
  await expect(
    page.getByRole('complementary', { name: 'Your QR code' }).getByText(/^(Scans|Won’t scan)$/),
  ).toHaveText('Scans', { timeout: 15_000 })
  for (const [format, magic] of [
    ['SVG', '<svg'],
    ['PDF', '%PDF'],
    ['EPS', '%!PS-Adobe'],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: format, exact: true }).click(),
    ])
    const bytes = await readFile((await download.path())!)
    expect(bytes.subarray(0, 16).toString('latin1').startsWith(magic), format).toBe(true)
  }
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'All formats and sizes (.zip)' }).click(),
  ])
  expect((await readFile((await zip.path())!)).includes(Buffer.from('qr-code-url.eps'))).toBe(true)
})
