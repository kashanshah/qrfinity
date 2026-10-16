import Link from 'next/link'
import { searchUsers } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { ActionButton } from '../ActionButton'
import { suspendUserAction, unsuspendUserAction } from '../actions'
import { formatDate } from '../CodeParts'
import { ListBar } from '../ListBar'
import { cleanParams, listOptions, type RawParams } from '../list-params'
import { Pagination } from '../Pagination'
import { SearchForm } from '../SearchForm'
import { SortHeader } from '../SortHeader'
import { table, tableWrap, td, th, tr } from '../table'
import { PlanSelect } from './PlanSelect'

const PATH = '/admin/users'

export default async function AdminUsers({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = cleanParams(await searchParams)
  const q = params.q?.trim() ?? ''
  const { db, actor } = await adminContext()
  const list = await searchUsers(db, q, listOptions(params))
  const head = { current: list, path: PATH, params }
  const noun = q ? 'matching users' : 'users'
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Users</h1>
      <SearchForm
        path={PATH}
        params={params}
        label="Search by email or name"
        placeholder="Email or name"
      />
      <p className="body-small text-ink-muted">
        Suspending signs the person out and blocks sign-in. Their codes keep working; disable
        abusive codes one by one. Plans are set by hand until billing exists; free features never
        depend on the plan.
      </p>
      <ListBar path={PATH} params={params} noun={noun} {...list} />
      {list.rows.length === 0 ? (
        <p className="text-ink-muted">{q ? 'No users match.' : 'No users yet.'}</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <thead>
              <tr>
                <SortHeader label="User" sortKey="email" {...head} />
                <SortHeader label="Joined" sortKey="joined" firstDir="desc" {...head} />
                <SortHeader label="Codes" sortKey="codes" firstDir="desc" {...head} />
                <SortHeader label="Plan" sortKey="plan" {...head} />
                <SortHeader label="Status" sortKey="status" firstDir="desc" {...head} />
                <th scope="col" className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((u) => (
                <tr key={u.id} className={tr}>
                  <td className={`${td} min-w-[14rem]`}>
                    <p className="break-all font-bold">
                      {u.email}{' '}
                      {u.role === 'admin' ? (
                        <span className="label font-normal text-ink-muted">(admin)</span>
                      ) : null}
                    </p>
                    {u.name && u.name !== u.email ? (
                      <p className="text-ink-muted">{u.name}</p>
                    ) : null}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(u.createdAt)}</td>
                  <td className={td}>
                    <Link
                      href={`/admin/codes?q=${encodeURIComponent(u.email)}`}
                      className="text-evergreen underline"
                    >
                      {u.codes}
                      <span className="sr-only"> codes by {u.email}</span>
                    </Link>
                  </td>
                  <td className={td}>
                    <PlanSelect userId={u.id} email={u.email} plan={u.plan} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {u.suspendedAt ? `Suspended ${formatDate(u.suspendedAt)}` : 'Active'}
                  </td>
                  <td className={td}>
                    {u.id === actor ? null : u.suspendedAt ? (
                      <ActionButton
                        label="Unsuspend"
                        action={unsuspendUserAction.bind(null, u.id)}
                        confirmText={`Let ${u.email} sign in again?`}
                      />
                    ) : (
                      <ActionButton
                        label="Suspend"
                        tone="danger"
                        ask={`Why suspend ${u.email}? (kept in the audit log)`}
                        action={suspendUserAction.bind(null, u.id)}
                      />
                    )}
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
