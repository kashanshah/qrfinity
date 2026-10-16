import { env } from '@/lib/server/env'

/** The IndexNow key file: proves to search engines that our submissions come from this site. */
export function GET() {
  const key = env.indexNowKey
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
