import { expect, test } from '@playwright/test'
import { scan, signIn } from './helpers'

test('a reported code is turned off by an admin and scans see the warning page', async ({
  browser,
  request,
}) => {
  // The owner creates a code.
  const owner = await (await browser.newContext()).newPage()
  await signIn(owner, request, `e2e-owner-${Date.now()}@example.com`)
  await owner.goto('/dashboard/new')
  await owner.getByLabel('Website address').fill('example.com/totally-legit')
  await owner.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(owner).toHaveURL(/\/dashboard\/codes\//)
  const shortLink = 'http://' + (await owner.locator('header .mono').first().textContent())!.trim()
  const slug = shortLink.split('/').pop()!
  const codePage = owner.url()
  expect((await scan(request, shortLink)).status).toBe(302)

  // Someone reports it from the link on the short domain's pages.
  const reporter = await (await browser.newContext()).newPage()
  await reporter.goto(`/report?code=${slug}`)
  await expect(reporter.getByLabel('The QR code’s link')).toHaveValue(`qrfinity.link/${slug}`)
  await reporter.getByText('Scam or fraud').click()
  await reporter.getByLabel('Details (optional)').fill('Fake parking fine page')
  await reporter.getByRole('button', { name: 'Send report' }).click()
  await expect(reporter.getByText('We’ve received your report.')).toBeVisible()

  // Non-admins get a 404 for /admin.
  const nosy = await owner.goto('/admin')
  expect(nosy?.status()).toBe(404)

  // The admin sees it in the queue and disables the code in one click.
  const admin = await (await browser.newContext()).newPage()
  await signIn(admin, request, 'e2e-admin@example.com', '/admin')
  await expect(admin.getByRole('heading', { name: 'Abuse queue' })).toBeVisible()
  await expect(admin.getByText('Fake parking fine page')).toBeVisible()
  admin.once('dialog', (d) => d.accept('Fake parking fine (scam)'))
  await admin.getByRole('button', { name: 'Disable' }).first().click()
  await expect(admin.getByText('No open reports.')).toBeVisible()

  // Scans now see the warning page, never the destination.
  await expect
    .poll(async () => (await scan(request, shortLink)).status, { timeout: 45_000 })
    .toBe(403)
  const warning = await scan(request, shortLink)
  expect(warning.location).toBeNull()
  // The audit log records it, and the owner sees why.
  await admin.goto('/admin/audit')
  await expect(admin.getByRole('cell', { name: 'code.disable' })).toBeVisible()
  await owner.goto(codePage)
  await expect(owner.getByText('We turned off this code.')).toBeVisible()
  await expect(owner.getByText('Fake parking fine (scam)')).toBeVisible()
})

test('new codes cannot point at other shorteners or blocklisted domains', async ({
  page,
  request,
}) => {
  await signIn(page, request, `e2e-block-${Date.now()}@example.com`)
  await page.goto('/dashboard/new')
  await page.getByLabel('Website address').fill('bit.ly/3xYz')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'hide where they go' })).toBeVisible()
  await page.getByLabel('Website address').fill('invoice.zip')
  await page.getByRole('button', { name: 'Create dynamic code' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'acceptable use policy' })).toBeVisible()
})

test('legal pages are reachable from the footer and in effect', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Terms' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of service')
  await expect(page.getByText('Effective October 16, 2026')).toBeVisible()
  await expect(page.getByText('Draft for legal review')).toHaveCount(0)
  await expect(page.getByText('Codes never expire.').first()).toBeVisible()
})

test('every admin page opens for an admin', async ({ page, request }) => {
  await signIn(page, request, 'e2e-admin@example.com', '/admin')
  for (const [path, heading] of [
    ['/admin', null],
    ['/admin/codes', null],
    ['/admin/users', 'Users'],
    ['/admin/blocklist', null],
    ['/admin/flags', 'Feature flags'],
    ['/admin/usage', 'Usage'],
    ['/admin/settings', 'Settings'],
    ['/admin/audit', null],
    ['/admin/study', 'Dead QR codes study'],
  ] as const) {
    const res = await page.goto(path)
    expect(res?.status(), path).toBe(200)
    if (heading) await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(heading)
    await expect(page.getByText('Application error'), path).toHaveCount(0)
  }
})

test('the study takes photos, counts each code once and keeps the photos private', async ({
  page,
  request,
}) => {
  await signIn(page, request, 'e2e-admin@example.com', '/admin/study')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dead QR codes study')
  await page.getByLabel('City').fill('Testville')
  const fixture = (f: string) => new URL(`./fixtures/${f}`, import.meta.url).pathname
  // The same code twice, and a photo with no code at all.
  await page
    .getByLabel('Choose photos')
    .setInputFiles([fixture('pale-qr.png'), fixture('pale-qr.png'), fixture('no-code.png')])
  const progress = page.getByRole('list').filter({ hasText: 'no-code.png' })
  await expect(progress.getByText('Seen before, counted once.')).toBeVisible({ timeout: 60_000 })
  await expect(
    progress
      .getByText('No code found', { exact: false })
      .or(progress.getByText('could not be read')),
  ).toBeVisible({ timeout: 60_000 })

  await page.reload()
  const row = page.getByRole('row').filter({ hasText: 'https://example.com/menu' })
  await expect(row).toHaveCount(1)
  await expect(row.getByText('Seen 2 times')).toBeVisible()
  await expect(row.getByText('Testville', { exact: false })).toBeVisible()

  // Photos are served to admins only.
  const src = await row.getByRole('img').first().getAttribute('src')
  expect((await page.request.get(src!)).headers()['content-type']).toBe('image/jpeg')
  expect((await request.get(src!)).status()).toBe(404)

  // Hand checks settle a result; the CSV has every code.
  await row.getByRole('button', { name: 'Doesn’t work' }).click()
  await expect(row.getByText('Doesn’t work (checked by hand)')).toBeVisible()
  const csv = await (await page.request.get('/admin/study/export')).text()
  expect(csv).toContain('https://example.com/menu')
  expect(csv).toContain('Testville')

  page.once('dialog', (d) => d.accept())
  await row.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'https://example.com/menu' })).toHaveCount(0)
  expect((await page.request.get(src!)).status()).toBe(404)
})
