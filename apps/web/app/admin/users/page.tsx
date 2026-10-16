import Link from 'next/link'
import { searchUsers } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { ActionButton } from '../ActionButton'
import { PlanSelect } from './PlanSelect'
import { suspendUserAction, unsuspendUserAction } from '../actions'

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' })

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { db, actor } = await adminContext()
  const users = await searchUsers(db, q)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Users</h1>
      <form className="flex gap-2" action="/admin/users" role="search">
        <label htmlFor="q" className="sr-only">
          Search by email
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Email"
          className="flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink"
        />
        <button className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink">
          Search
        </button>
      </form>
      <p className="body-small text-ink-muted">
        Suspending signs the person out and blocks sign-in. Their codes keep working; disable
        abusive codes one by one. Plans are set by hand until billing exists; a plan only sets how
        many codes can use advanced features.
      </p>
      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4">
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
    </div>
  )
}
