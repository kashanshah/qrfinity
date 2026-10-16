import { codes, eq, sql } from '@qrfinity/db'
import { adminContext } from '@/lib/server/context'
import { getFreeCustomSlugAllowance } from '@/lib/server/settings'
import { AllowanceForm } from './AllowanceForm'

export default async function AdminSettings() {
  const { db } = await adminContext()
  const [allowance, [stats]] = await Promise.all([
    getFreeCustomSlugAllowance(db),
    db
      .select({
        links: sql<number>`count(*)::int`,
        owners: sql<number>`count(distinct ${codes.userId})::int`,
      })
      .from(codes)
      .where(eq(codes.customSlug, true)),
  ])
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <h1 className="heading text-ink">Settings</h1>
      <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <h2 className="subheading text-ink">Free custom short links per account</h2>
        <p className="mt-1 text-ink-muted">
          How many links like qrfinity.link/joes-menu each free account can create. Accounts with
          “More custom short links” (Pro, or the feature flag) get up to 100. Lowering this only
          affects new links; existing ones keep working and stay with their owners.
        </p>
        <p className="body-small mt-2 text-ink-muted">
          In use: {stats?.links ?? 0} custom links across {stats?.owners ?? 0} accounts.
        </p>
        <div className="mt-4">
          <AllowanceForm value={allowance} />
        </div>
      </section>
    </div>
  )
}
