import { adminContextOrNull } from '@/lib/server/context'
import { exportWaitlist } from '@/lib/server/waitlist'

export const dynamic = 'force-dynamic'

/** Downloads the Pro waitlist as CSV (admins only). `?q=` limits it to matching addresses. */
export async function GET(req: Request) {
  const ctx = await adminContextOrNull()
  if (!ctx) return new Response('Not found', { status: 404 })
  const { csv } = await exportWaitlist(ctx, new URL(req.url).searchParams.get('q') ?? '')
  const day = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="qrfinity-pro-waitlist-${day}.csv"`,
      // Personal data: never cached by the browser or a proxy.
      'Cache-Control': 'no-store',
    },
  })
}
