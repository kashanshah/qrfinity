import { SITE_URL } from '@/content/registry'
import { INDEXABLE } from '@/lib/seo'
import { env } from './env'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/**
 * Tells IndexNow search engines (Bing, Yandex, Seznam, Naver; shared with others) that pages
 * changed. Skipped until the site is indexable and a key is set. Up to 10,000 URLs per call.
 */
export async function submitToIndexNow(
  urls: string[],
): Promise<{ submitted: number; status?: number; skipped?: string }> {
  if (!INDEXABLE)
    return { submitted: 0, skipped: 'Site is not indexable yet (NEXT_PUBLIC_INDEXABLE).' }
  const key = env.indexNowKey
  if (!key) return { submitted: 0, skipped: 'INDEXNOW_KEY is not set.' }
  if (!urls.length) return { submitted: 0 }
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key,
      keyLocation: `${SITE_URL}/indexnow-key.txt`,
      urlList: urls.slice(0, 10_000),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  // 200 and 202 both mean accepted.
  return { submitted: res.ok ? urls.length : 0, status: res.status }
}
