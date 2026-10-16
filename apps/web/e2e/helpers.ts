import { expect, type APIRequestContext, type Page } from '@playwright/test'

export async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
  next = '/dashboard',
) {
  // Links already in the mailbox belong to earlier sign-ins (another test may use the same
  // account at the same time): wait for a new one, so nobody follows a used link.
  const links = async () =>
    (
      (await (await request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`)).json()) as {
        text: string
      }[]
    ).flatMap((m) => m.text.match(/https?:\/\/\S+/)?.[0] ?? [])
  const before = new Set(await links())
  if (!page.url().includes('/login')) await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()
  let link = ''
  await expect
    .poll(async () => {
      link = (await links()).find((l) => !before.has(l)) ?? ''
      return link
    })
    .not.toBe('')
  await page.goto(link)
}

/** "Scans" the code over HTTP, without following the redirect. */
export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1'

export async function scan(request: APIRequestContext, shortLink: string, userAgent = IPHONE_UA) {
  const res = await request.get(shortLink, {
    maxRedirects: 0,
    headers: { 'User-Agent': userAgent },
  })
  return {
    status: res.status(),
    location: res.headers()['location'] ?? null,
    body: res.status() === 200 ? await res.text() : '',
  }
}

/** Gives an account a plan straight in the e2e database, as an admin grant would. */
export async function setPlan(email: string, plan: 'free' | 'plus' | 'pro' | 'unlimited') {
  const { createDb, sql } = await import('@qrfinity/db')
  const { E2E_DB } = await import('../playwright.config')
  const db = createDb(E2E_DB, { max: 1 })
  try {
    await db.execute(sql`update "user" set plan = ${plan} where email = ${email}`)
  } finally {
    await db.$client.end()
  }
}

/**
 * The home page with a link filled in. The website field starts empty, so there's no code until
 * something is typed; the typing hint appears once React is up, so typing isn't lost.
 */
export async function openGenerator(page: Page, url = 'https://qrfinity.com', path = '/') {
  await page.goto(path)
  await expect(page.locator('.typing-caret')).toBeVisible()
  await page.getByLabel('Website address').fill(url)
}
