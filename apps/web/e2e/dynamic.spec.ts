import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

async function signIn(page: Page, request: APIRequestContext, email: string, next = '/dashboard') {
  if (!page.url().includes('/login')) await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()
  let link = ''
  await expect
    .poll(async () => {
      const mail = (await (
        await request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)
      ).json()) as { text: string }[]
      link = mail[0]?.text.match(/https?:\/\/\S+/)?.[0] ?? ''
      return link
    })
    .not.toBe('')
  await page.goto(link)
}

/** "Scans" the code over HTTP, without following the redirect. */
async function scan(request: APIRequestContext, shortLink: string) {
  const res = await request.get(shortLink, {
    maxRedirects: 0,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1',
    },
  })
  return {
    status: res.status(),
    location: res.headers()['location'] ?? null,
    body: res.status() === 200 ? await res.text() : '',
  }
}

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
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^qrfinity-codes-\d{4}-\d{2}-\d{2}\.csv$/)
})
