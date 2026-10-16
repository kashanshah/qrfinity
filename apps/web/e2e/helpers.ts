import { expect, type APIRequestContext, type Page } from '@playwright/test'

export async function signIn(
  page: Page,
  request: APIRequestContext,
  email: string,
  next = '/dashboard',
) {
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
