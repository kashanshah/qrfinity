import Link from 'next/link'
import { PER_PAGE_OPTIONS, perPageFrom, searchUsers } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { ActionButton } from '../ActionButton'
import { Pagination } from '../Pagination'
import { PerPageSelect } from '../PerPageSelect'
import { PlanSelect } from './PlanSelect'
import { suspendUserAction, unsuspendUserAction } from '../actions'

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' })

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>
}) {
  const sp = await searchParams
  const q = sp.q ?? ''
  const { db, actor } = await adminContext()
  const {
    rows: users,
    total,
    page,
    pages,
    perPage,
  } = await searchUsers(db, q, {
    page: Number(sp.page) || 1,
    perPage: perPageFrom(sp.per),
  })
  const params = { q: q.trim() || undefined, per: sp.per ? String(perPage) : undefined }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Users</h1>
      <form className="flex gap-2" action="/admin/users" role="search">
        <label htmlFor="q" className="sr-only">
          Search by email or name
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Email or name"
          className="flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink"
        />
        {sp.per ? <input type="hidden" name="per" value={perPage} /> : null}
        <button className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink">
          Search
        </button>
      </form>
      <p className="body-small text-ink-muted">
        Suspending signs the person out and blocks sign-in. Their codes keep working; disable
        abusive codes one by one. Plans are set by hand until billing exists; free features never
        depend on the plan.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pagination
          path="/admin/users"
          params={params}
          page={page}
          pages={pages}
          perPage={perPage}
          total={total}
          noun={q.trim() ? 'matching users' : 'users'}
        />
        <PerPageSelect value={perPage} options={PER_PAGE_OPTIONS} />
      </div>
      {users.length === 0 ? (
        <p className="text-ink-muted">{q.trim() ? 'No users match.' : 'No users yet.'}</p>
      ) : null}
      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4 empty:hidden">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-bold text-ink">
                {u.email}{' '}
                {u.role === 'admin' ? <span className="label text-ink-muted">(admin)</span> : null}
              </p>
              <p className="body-small text-ink-muted">
                Joined {fmt.format(u.createdAt)} ·{' '}
                <Link
                  href={`/admin/codes?q=${encodeURIComponent(u.email)}`}
                  className="text-evergreen underline"
                >
                  {u.codes} codes
                </Link>
                {u.suspendedAt ? ` · suspended ${fmt.format(u.suspendedAt)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PlanSelect userId={u.id} email={u.email} plan={u.plan} />
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
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <Pagination
          path="/admin/users"
          params={params}
          page={page}
          pages={pages}
          perPage={perPage}
          total={total}
          noun={q.trim() ? 'matching users' : 'users'}
        />
      ) : null}
    </div>
  )
}
