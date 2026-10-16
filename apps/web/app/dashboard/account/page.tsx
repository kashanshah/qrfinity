import { Download } from 'lucide-react'
import { requireUser } from '@/lib/server/context'
import { DeleteAccount } from './DeleteAccount'

export default async function AccountPage() {
  const user = await requireUser('/dashboard/account')
  const link =
    'button inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-control-border bg-surface px-6 py-3 text-ink hover:bg-surface-sunk'
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <div>
        <h1 className="heading text-ink">Account</h1>
        <p className="mt-1 text-ink-muted">
          Signed in as <strong className="font-bold text-ink">{user.email}</strong>.
        </p>
      </div>
      <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <h2 className="subheading text-ink">Export your data</h2>
        <p className="text-ink-muted">
          Download every code: name, short link, destination, status, folder, tags and the full
          destination history. JSON also includes designs.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export?format=csv" className={link}>
            <Download aria-hidden="true" size={18} strokeWidth={1.75} />
            Download CSV
          </a>
          <a href="/api/export?format=json" className={link}>
            <Download aria-hidden="true" size={18} strokeWidth={1.75} />
            Download JSON
          </a>
        </div>
      </section>
      <section className="rounded-lg bg-mint p-4 text-ink md:p-6">
        <h2 className="subheading">Our promise</h2>
        <p className="mt-2">
          Your codes never expire and are never deactivated, whether or not you sign in again. Free
          features stay free. Paid plans, when they come, only add new things.
        </p>
      </section>
      <DeleteAccount email={user.email} />
    </div>
  )
}
