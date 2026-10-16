import { CODE_CSV_COLUMNS, exportAll, toCsv } from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'

export const dynamic = 'force-dynamic'

/** Download all of the signed-in user's codes as CSV or JSON. */
export async function GET(req: Request) {
  const ctx = await serviceContext('/dashboard/account')
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const data = await exportAll(ctx)
  const date = new Date().toISOString().slice(0, 10)
  if (format === 'csv') {
    return new Response(toCsv(data, CODE_CSV_COLUMNS), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="qrfinity-codes-${date}.csv"`,
      },
    })
  }
  return new Response(
    JSON.stringify({ exported_at: new Date().toISOString(), codes: data }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="qrfinity-codes-${date}.json"`,
      },
    },
  )
}
