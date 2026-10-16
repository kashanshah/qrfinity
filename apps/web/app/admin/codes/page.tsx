import { searchCodes } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { CodeRow } from '../CodeRow'

export default async function AdminCodes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { db } = await adminContext()
  const rows = await searchCodes(db, q)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Codes</h1>
      <form className="flex gap-2" action="/admin/codes" role="search">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Short link, slug, destination, owner email or name"
          className="flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink"
        />
        <button className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink">
          Search
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="text-ink-muted">{q.trim() ? 'No codes match.' : 'No codes yet.'}</p>
      ) : (
        <p className="body-small text-ink-muted">
          {q.trim() ? 'Matching codes, newest first' : 'Newest codes'}
          {rows.length === 100 ? ' (first 100)' : ''}
        </p>
      )}
      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4 empty:hidden">
        {rows.map(({ code, ownerEmail }) => (
          <CodeRow key={code.id} code={code} ownerEmail={ownerEmail} />
        ))}
      </div>
    </div>
  )
}
