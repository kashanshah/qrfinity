import { listAudit } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { ListBar } from '../ListBar'
import { cleanParams, listOptions, type RawParams } from '../list-params'
import { Pagination } from '../Pagination'
import { SearchForm } from '../SearchForm'
import { SortHeader } from '../SortHeader'
import { table, tableWrap, td, th, tr } from '../table'

const PATH = '/admin/audit'
const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'medium' })

export default async function AdminAudit({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = cleanParams(await searchParams)
  const q = params.q?.trim() ?? ''
  const { db } = await adminContext()
  const list = await listAudit(db, q, listOptions(params))
  const head = { current: list, path: PATH, params }
  const noun = q ? 'matching entries' : 'entries'
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Audit log</h1>
      <SearchForm
        path={PATH}
        params={params}
        label="Search the audit log"
        placeholder="Who, action, target ID or details"
      />
      <ListBar path={PATH} params={params} noun={noun} {...list} />
      {list.rows.length === 0 ? (
        <p className="text-ink-muted">{q ? 'No entries match.' : 'Nothing logged yet.'}</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <SortHeader label="When" sortKey="when" firstDir="desc" {...head} />
                <SortHeader label="Who" sortKey="who" {...head} />
                <SortHeader label="Action" sortKey="action" {...head} />
                <SortHeader label="Target" sortKey="target" {...head} />
                <th scope="col" className={th}>
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className={tr}>
                  <td className={`${td} whitespace-nowrap`}>{fmt.format(r.createdAt)}</td>
                  <td className={`${td} mono`}>{r.actor}</td>
                  <td className={td}>{r.action}</td>
                  <td className={`${td} mono`}>
                    {r.targetType}:{r.targetId}
                  </td>
                  <td className={`${td} mono max-w-[40ch] break-all text-ink-muted`}>
                    {r.details ? JSON.stringify(r.details) : ''}
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
