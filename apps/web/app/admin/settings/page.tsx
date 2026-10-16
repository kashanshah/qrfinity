import { codes, eq, sql } from '@qrfinity/db'
import { adminContext } from '@/lib/server/context'
import { indexNowStatus } from '@/lib/server/indexnow'
import { getFreeCustomSlugAllowance } from '@/lib/server/settings'
import { AllowanceForm } from './AllowanceForm'
import { IndexNowPanel } from './IndexNowPanel'

export default async function AdminSettings() {
  const { db } = await adminContext()
  const status = indexNowStatus()
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

      <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <h2 className="subheading text-ink">Search engines (IndexNow)</h2>
        <p className="mt-1 text-ink-muted">
          Tells Bing and the other IndexNow search engines that pages are new or changed, so they
          crawl them sooner. A daily job already sends pages whose content date changed; use this
          after launch or a big update. Google doesn’t use IndexNow: submit the sitemap in Search
          Console.
        </p>
        <ul className="body-small mt-3 flex flex-col gap-1 text-ink">
          <li>
            {status.indexable ? 'Yes' : 'No'}: site is indexable{' '}
            {status.indexable ? null : (
              <span className="text-ink-muted">(set NEXT_PUBLIC_INDEXABLE=true)</span>
            )}
          </li>
          <li>
            {status.keySet ? 'Yes' : 'No'}: INDEXNOW_KEY is set{' '}
            {status.keySet ? (
              <a
                href={status.keyUrl}
                target="_blank"
                rel="noopener"
                className="text-evergreen underline"
              >
                (check the key file)
              </a>
            ) : (
              <span className="text-ink-muted">(generate one with openssl rand -hex 16)</span>
            )}
          </li>
          <li className="text-ink-muted">{status.pages} public pages in the sitemap.</li>
        </ul>
        <div className="mt-4">
          <IndexNowPanel ready={status.indexable && status.keySet} />
        </div>
      </section>
    </div>
  )
}
