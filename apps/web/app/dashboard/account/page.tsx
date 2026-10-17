import { account, and, codes, eq, isNull, sql } from '@qrfinity/db'
import { Download, FileJson, FileSpreadsheet, Infinity as InfinityIcon } from 'lucide-react'
import { grantsPlan } from '@qrfinity/core'
import type { Metadata } from 'next'
import { currentSubscription, syncCheckout } from '@/lib/server/billing'
import { advancedCodeUsage } from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'
import { getBilling } from '@/lib/server/stripe'
import { Avatar } from '../DashboardNav'
import { DeleteAccount } from './DeleteAccount'
import { PlanSection } from './PlanSection'

export const metadata: Metadata = { title: 'Account' }

const date = (d: Date) =>
  d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; billing?: string }>
}) {
  const params = await searchParams
  const ctx = await serviceContext('/dashboard/account')
  const { user, db } = ctx
  const billing = getBilling()
  // Back from Stripe checkout: store the new subscription now rather than waiting for the webhook.
  const checkout = params.checkout?.startsWith('cs_') ? params.checkout : null
  if (billing && checkout) {
    await syncCheckout(db, billing, user.id, checkout, ctx.edge).catch((e) => console.error(e))
  }
  const [providers, [counts], usage, subscription] = await Promise.all([
    db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, user.id)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(codes)
      .where(and(eq(codes.userId, user.id), isNull(codes.deletedAt))),
    advancedCodeUsage(ctx),
    currentSubscription(db, user.id),
  ])
  const google = providers.some((p) => p.providerId === 'google')
  const total = counts?.total ?? 0

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <h1 className="heading text-ink">Account</h1>

      <section
        aria-label="Profile"
        className="flex flex-wrap items-center gap-4 rounded-lg border border-hairline bg-surface p-4 md:p-6"
      >
        <Avatar email={user.email} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink [overflow-wrap:anywhere] sm:text-[20px] sm:leading-7">
            {user.email}
          </p>
          <p className="body-small text-ink-muted">
            {google ? 'Signs in with Google' : 'Signs in with an email link'}
            <span aria-hidden="true"> · </span>
            <br className="sm:hidden" />
            Member since {date(new Date(user.createdAt))}
          </p>
        </div>
        <dl className="flex w-full gap-6 border-t border-hairline pt-4 sm:w-auto sm:border-0 sm:pt-0">
          <div>
            <dt className="label text-ink-muted">Dynamic codes</dt>
            <dd className="heading text-ink">{total.toLocaleString('en')}</dd>
          </div>
        </dl>
      </section>

      <p className="flex items-start gap-3 rounded-lg bg-mint px-4 py-3 text-ink">
        <InfinityIcon
          aria-hidden="true"
          size={20}
          strokeWidth={1.75}
          className="mt-[3px] shrink-0 text-evergreen"
        />
        <span>Your codes never expire and are never paused, whether or not you sign in again.</span>
      </p>

      <PlanSection
        plan={usage.plan}
        used={usage.used}
        allowance={usage.allowance}
        subscription={subscription}
        billingOn={billing !== null}
        justSubscribed={checkout !== null}
        checkoutId={checkout}
        portalError={params.billing === 'error'}
      />

      <section
        aria-labelledby="export"
        className="rounded-lg border border-hairline bg-surface p-4 md:p-6"
      >
        <div className="flex items-start gap-3">
          <Download
            aria-hidden="true"
            size={20}
            strokeWidth={1.75}
            className="mt-1 shrink-0 text-evergreen"
          />
          <div>
            <h2 id="export" className="subheading text-ink">
              Export your data
            </h2>
            <p className="mt-1 text-ink-muted">
              Every code with its short link, destination, status, folder, tags and full destination
              history.
            </p>
          </div>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <ExportLink
            href="/api/export?format=csv"
            icon={FileSpreadsheet}
            title="Download CSV"
            hint="For spreadsheets"
          />
          <ExportLink
            href="/api/export?format=json"
            icon={FileJson}
            title="Download JSON"
            hint="Includes designs, for backups"
          />
        </ul>
      </section>

      <DeleteAccount
        email={user.email}
        paying={subscription !== null && grantsPlan(subscription)}
      />
    </div>
  )
}

function ExportLink({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string
  icon: typeof FileJson
  title: string
  hint: string
}) {
  return (
    <li>
      <a
        href={href}
        className="flex min-h-14 items-center gap-3 rounded-md border-[1.5px] border-control-border bg-surface px-4 py-3 hover:border-evergreen hover:bg-surface-sunk"
      >
        <Icon aria-hidden="true" size={22} strokeWidth={1.75} className="shrink-0 text-ink-muted" />
        <span className="flex flex-col">
          <span className="button text-ink">{title}</span>
          <span className="body-small text-ink-muted">{hint}</span>
        </span>
      </a>
    </li>
  )
}
