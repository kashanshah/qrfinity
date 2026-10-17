import { adminContextOrNull } from '@/lib/server/context'
import { exportStudy } from '@/lib/server/study'

export const dynamic = 'force-dynamic'

/** Downloads every code in the dead QR codes study as CSV (admins only). */
export async function GET() {
  const ctx = await adminContextOrNull()
  if (!ctx) return new Response('Not found', { status: 404 })
  const csv = await exportStudy(ctx)
  const day = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="qrfinity-study-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
