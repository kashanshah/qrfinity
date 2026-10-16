import { listBlocklist } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { ActionButton } from '../ActionButton'
import { removeBlockAction } from '../actions'
import { formatDate } from '../CodeParts'
import { ListBar } from '../ListBar'
import { cleanParams, listOptions, type RawParams } from '../list-params'
import { Pagination } from '../Pagination'
import { SearchForm } from '../SearchForm'
import { SortHeader } from '../SortHeader'
import { table, tableWrap, td, th, tr } from '../table'
import { AddBlockForm } from './AddBlockForm'

const PATH = '/admin/blocklist'

const KIND_LABEL = {
  domain: 'Domain (and subdomains)',
  tld: 'Top-level domain',
  contains: 'Address contains',
} as const

export default async function AdminBlocklist({
  searchParams,
}: {
  searchParams: Promise<RawParams>
}) {
  const params = cleanParams(await searchParams)
  const q = params.q?.trim() ?? ''
  const { db } = await adminContext()
  const list = await listBlocklist(db, q, listOptions(params))
  const head = { current: list, path: PATH, params }
  const noun = q ? 'matching entries' : 'entries'
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Blocklist</h1>
      <p className="max-w-[72ch] text-ink-muted">
        New and edited codes can’t point to these. Existing codes that match are flagged at their
        next re-check, not turned off automatically. Other URL shorteners and raw IP addresses are
        always refused.
      </p>
      <AddBlockForm />
      <SearchForm
        path={PATH}
        params={params}
        label="Search the blocklist"
        placeholder="Domain, text or reason"
      />
      <ListBar path={PATH} params={params} noun={noun} {...list} />
      {list.rows.length === 0 ? (
        <p className="text-ink-muted">{q ? 'No entries match.' : 'The blocklist is empty.'}</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <SortHeader label="Blocked" sortKey="value" {...head} />
                <SortHeader label="Type" sortKey="kind" {...head} />
                <SortHeader label="Reason" sortKey="reason" {...head} />
                <SortHeader label="Added by" sortKey="by" {...head} />
                <SortHeader label="Added" sortKey="added" firstDir="desc" {...head} />
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.id} className={tr}>
                  <td className={`${td} mono break-all`}>{r.value}</td>
                  <td className={`${td} whitespace-nowrap`}>{KIND_LABEL[r.kind]}</td>
                  <td className={`${td} text-ink-muted`}>{r.reason ?? '–'}</td>
                  <td className={`${td} break-all`}>
                    {r.createdBy === 'system' ? 'Default list' : r.createdBy}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.createdAt)}</td>
                  <td className={td}>
                    <ActionButton
                      label="Remove"
                      action={removeBlockAction.bind(null, r.id)}
                      confirmText={`Remove ${r.value} from the blocklist?`}
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
