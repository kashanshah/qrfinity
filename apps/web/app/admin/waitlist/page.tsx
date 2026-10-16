import { Download } from 'lucide-react'
import { adminContext } from '@/lib/server/context'
import { listWaitlist } from '@/lib/server/waitlist'
import { ActionButton } from '../ActionButton'
import { removeFromWaitlistAction } from '../actions'
import { ListBar } from '../ListBar'
import { cleanParams, listOptions, type RawParams } from '../list-params'
import { Pagination } from '../Pagination'
import { SearchForm } from '../SearchForm'
import { SortHeader } from '../SortHeader'
import { table, tableWrap, td, th, tr } from '../table'

const PATH = '/admin/waitlist'
const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminWaitlist({
  searchParams,
}: {
  searchParams: Promise<RawParams>
}) {
  const params = cleanParams(await searchParams)
  const q = params.q?.trim() ?? ''
  const { db } = await adminContext()
  const list = await listWaitlist(db, q, listOptions(params))
  const head = { current: list, path: PATH, params }
  const noun = q ? 'matching addresses' : 'addresses'
  const exportHref = `${PATH}/export${q ? `?q=${encodeURIComponent(q)}` : ''}`
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="heading text-ink">Pro waitlist</h1>
          <p className="mt-1 max-w-[72ch] text-ink-muted">
            People who asked for one email when Pro launches. The privacy policy promises exactly
            that: use the list for the launch email only, then delete it. Remove anyone who asks.
          </p>
        </div>
        {list.total > 0 ? (
          <a
            href={exportHref}
            download
            className="button inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink hover:bg-surface-sunk"
          >
            <Download aria-hidden="true" size={18} strokeWidth={1.75} />
            {q ? 'Download matches (CSV)' : 'Download CSV'}
          </a>
        ) : null}
      </div>
      <SearchForm path={PATH} params={params} label="Search the waitlist" placeholder="Email" />
      <ListBar path={PATH} params={params} noun={noun} {...list} />
      {list.rows.length === 0 ? (
        <p className="text-ink-muted">{q ? 'No addresses match.' : 'Nobody has joined yet.'}</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <SortHeader label="Email" sortKey="email" {...head} />
                <SortHeader label="Joined" sortKey="joined" firstDir="desc" {...head} />
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.email} className={tr}>
                  <td className={`${td} break-all`}>{r.email}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmt.format(r.createdAt)}</td>
                  <td className={`${td} text-right`}>
                    <ActionButton
                      label="Remove"
                      action={removeFromWaitlistAction.bind(null, r.email)}
                      confirmText={`Remove ${r.email} from the waitlist?`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.pages > 1 ? <Pagination path={PATH} params={params} noun={noun} {...list} /> : null}
    </div>
  )
}
