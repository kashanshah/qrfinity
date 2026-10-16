import { and, codes, eq, inArray, sql, subscriptions } from '@qrfinity/db'
import { adminContext } from '@/lib/server/context'
import { env } from '@/lib/server/env'
import { indexNowStatus } from '@/lib/server/indexnow'
import { getFreeAdvancedCodeAllowance } from '@/lib/server/settings'
import { AllowanceForm } from './AllowanceForm'
import { IndexNowPanel } from './IndexNowPanel'

export default async function AdminSettings() {
  const { db } = await adminContext()
  const status = indexNowStatus()
  const [allowance, [stats], paying] = await Promise.all([
    getFreeAdvancedCodeAllowance(db),
    db
      .select({
        links: sql<number>`count(*)::int`,
        owners: sql<number>`count(distinct ${codes.userId})::int`,
      })
      .from(codes)
      .where(eq(codes.customSlug, true)),
    db
      .select({ plan: subscriptions.plan, n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.status, ['active', 'trialing', 'past_due']),
          // A failed first payment after a trial doesn't count (see grantsPlan).
          sql`not (${subscriptions.status} = 'past_due' and ${subscriptions.trialEnd} is not null and ${subscriptions.currentPeriodStart} <= ${subscriptions.trialEnd})`,
        ),
      )
      .groupBy(subscriptions.plan),
  ])
  const stripe = env.stripe
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <h1 className="heading text-ink">Settings</h1>
      <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <h2 className="subheading text-ink">Free codes with advanced features</h2>
        <p className="mt-1 text-ink-muted">
          How many codes each free account can use advanced features on (custom short links and
          redirect rules; passwords later). Paid plans get 10, 100 or unlimited, and never fewer
          than this. Lowering it pauses redirect rules on each account’s newest codes beyond the new
          number (scans go to the main destination); custom short links keep working. Raising it
          resumes them.
        </p>
        <p className="body-small mt-2 text-ink-muted">
          In use: {stats?.links ?? 0} codes with advanced features across {stats?.owners ?? 0}{' '}
          accounts.
        </p>
        <div className="mt-4">
          <AllowanceForm value={allowance} />
        </div>
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <h2 className="subheading text-ink">Payments (Stripe)</h2>
        <p className="mt-1 text-ink-muted">
          Paid plans open once STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set and the site is
          redeployed. Setup steps are in docs/billing.md.
        </p>
        <ul className="body-small mt-3 flex flex-col gap-1 text-ink">
          <li>
            {stripe ? 'Yes' : 'No'}: Stripe keys are set
            {stripe ? (
              <span className="text-ink-muted">
                {' '}
                ({stripe.secretKey.includes('_live_') ? 'live mode' : 'test mode'})
              </span>
            ) : null}
          </li>
          <li className="text-ink-muted">
            Webhook endpoint: <span className="mono">{env.appUrl}/api/billing/webhook</span>
          </li>
          <li className="text-ink-muted">
            Paying now:{' '}
            {paying.length ? paying.map((p) => `${p.n} on ${p.plan}`).join(', ') : 'nobody yet'}.
          </li>
        </ul>
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
