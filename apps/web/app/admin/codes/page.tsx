import { searchCodes } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { CodeActions, CodeSummary, formatDate, ShortLink, STATUS_LABEL } from '../CodeParts'
import { ListBar } from '../ListBar'
import { cleanParams, listOptions, type RawParams } from '../list-params'
import { Pagination } from '../Pagination'
import { SearchForm } from '../SearchForm'
import { SortHeader } from '../SortHeader'
import { table, tableWrap, td, th, tr } from '../table'

const PATH = '/admin/codes'

export default async function AdminCodes({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = cleanParams(await searchParams)
  const q = params.q?.trim() ?? ''
  const { db } = await adminContext()
  const list = await searchCodes(db, q, listOptions(params))
  const head = { current: list, path: PATH, params }
  const noun = q ? 'matching codes' : 'codes'
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Codes</h1>
      <SearchForm
        path={PATH}
        params={params}
        label="Search codes"
        placeholder="Short link, slug, destination, owner email or name"
      />
      <ListBar path={PATH} params={params} noun={noun} {...list} />
      {list.rows.length === 0 ? (
        <p className="text-ink-muted">{q ? 'No codes match.' : 'No codes yet.'}</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <SortHeader label="Code" sortKey="name" {...head} />
                <SortHeader label="Short link" sortKey="link" {...head} />
                <SortHeader label="Owner" sortKey="owner" {...head} />
                <SortHeader label="Status" sortKey="status" {...head} />
                <SortHeader label="Created" sortKey="created" firstDir="desc" {...head} />
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(({ code, ownerEmail }) => (
                <tr key={code.id} className={tr}>
                  <td className={td}>
                    <CodeSummary code={code} badge={false} />
                  </td>
                  <td className={td}>
                    <ShortLink slug={code.slug} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{ownerEmail}</td>
                  <td className={`${td} whitespace-nowrap`}>{STATUS_LABEL[code.status]}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(code.createdAt)}</td>
                  <td className={td}>
                    <CodeActions code={code} />
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
