import { METRIC_LABELS, type UsageLevel } from '@qrfinity/core'
import { CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { getCloudflareUsage } from '@/lib/server/cloudflare-usage'
import { adminContext } from '@/lib/server/context'
import { getCloudflarePlan } from '@/lib/server/settings'
import { usageReport } from '@/lib/server/usage'
import { CloudflarePlanSelect } from './PlanSelect'

export const dynamic = 'force-dynamic'

const num = new Intl.NumberFormat('en')
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : num.format(n))

const LEVEL: Record<UsageLevel, { label: string; bar: string; Icon: typeof Info }> = {
  ok: { label: 'Fine', bar: 'bg-evergreen', Icon: CircleCheck },
  watch: { label: 'Watch', bar: 'bg-signal', Icon: Info },
  upgrade: { label: 'Upgrade now', bar: 'bg-scan-fail', Icon: TriangleAlert },
}

export default async function AdminUsage() {
  const { db } = await adminContext()
  const plan = await getCloudflarePlan(db)
  const r = await usageReport(db, getCloudflareUsage(), plan)
  const worst = r.metrics.reduce<UsageLevel>(
    (w, m) => (m.level === 'upgrade' || (m.level === 'watch' && w === 'ok') ? m.level : w),
    'ok',
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="heading text-ink">Usage</h1>
          <p className="mt-1 max-w-[72ch] text-ink-muted">
            The qrfinity.link Cloudflare account against its plan limits.{' '}
            {plan === 'free'
              ? 'Free-plan limits are per UTC day and reset at 00:00 UTC. When one is hit, Cloudflare returns errors until the reset, so printed codes stop opening.'
              : 'Paid-plan figures are included amounts per month; going over is billed, never blocked.'}
          </p>
        </div>
        <CloudflarePlanSelect plan={plan} />
      </div>

      {plan === 'free' && r.source === 'cloudflare' ? (
        <p
          role="status"
          className={`flex gap-3 rounded-lg px-4 py-3 text-ink ${worst === 'ok' ? 'bg-mint' : 'border-[1.5px] border-scan-fail bg-surface'}`}
        >
          {worst === 'ok'
            ? 'Comfortably inside the free plan. Upgrade to Workers Paid ($5/month) before announcing publicly anyway.'
            : worst === 'watch'
              ? 'Over half a free limit on the busiest recent day. Plan the upgrade to Workers Paid ($5/month) soon.'
              : 'Close to a free limit. Upgrade to Workers Paid ($5/month) now: Cloudflare dashboard → Compute → Workers plans.'}
        </p>
      ) : null}

      {r.cloudflareError ? (
        <p className="flex gap-3 rounded-lg bg-surface-sunk px-4 py-3 text-ink">
          <Info aria-hidden="true" size={20} strokeWidth={1.75} className="mt-[3px] shrink-0" />
          <span>
            Couldn’t read Cloudflare’s numbers ({r.cloudflareError}). KV writes below are estimated
            from our database; Worker requests and KV reads need the API. The token in
            CF_ANALYTICS_TOKEN needs “Account Analytics: Read”.
          </span>
        </p>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2">
        {r.metrics.map((m) => {
          const level = m.level ? LEVEL[m.level] : null
          return (
            <li key={m.metric} className="rounded-lg border border-hairline bg-surface p-4 md:p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-bold text-ink">{METRIC_LABELS[m.metric]}</h2>
                {level ? (
                  <span className="label inline-flex items-center gap-1.5 text-ink">
                    <level.Icon aria-hidden="true" size={16} strokeWidth={1.75} />
                    {level.label}
                  </span>
                ) : null}
              </div>
              {m.used === undefined ? (
                <p className="body-small mt-2 text-ink-muted">
                  No data (needs the Cloudflare API).
                </p>
              ) : (
                <>
                  <p className="mt-2 text-ink">
                    <span className="heading">{fmt(m.used)}</span>{' '}
                    <span className="text-ink-muted">
                      of {fmt(m.limit)}{' '}
                      {r.period === 'day' ? 'on the busiest of the last 7 days' : 'this month'}
                    </span>
                  </p>
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-sunk"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(m.pct ?? 0)}
                    aria-label={`${METRIC_LABELS[m.metric]}: ${Math.round(m.pct ?? 0)}% of the limit`}
                  >
                    <div
                      className={`h-full ${level?.bar ?? 'bg-evergreen'}`}
                      style={{ width: `${Math.min(100, m.pct ?? 0)}%` }}
                    />
                  </div>
                  <p className="body-small mt-2 text-ink-muted">
                    Today so far: {fmt(m.today)} · {Math.round(m.pct ?? 0)}% of the limit
                    {r.source === 'estimate' && m.metric === 'kvWrites' ? ' · estimated' : ''}
                  </p>
                </>
              )}
            </li>
          )
        })}
      </ul>

      <section
        aria-labelledby="days"
        className="rounded-lg border border-hairline bg-surface p-4 md:p-5"
      >
        <h2 id="days" className="subheading text-ink">
          Last 7 days (UTC)
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="label text-ink-muted">
                {[
                  'Day',
                  'Worker requests',
                  'KV reads',
                  'KV writes',
                  'Scans',
                  'Codes created',
                  'Destination changes',
                ].map((h) => (
                  <th key={h} className="border-b border-hairline px-2 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="body-small text-ink">
              {r.table.map((d) => (
                <tr key={d.date}>
                  <td className="border-b border-hairline px-2 py-2 font-mono">{d.date}</td>
                  <td className="border-b border-hairline px-2 py-2">{fmt(d.workerRequests)}</td>
                  <td className="border-b border-hairline px-2 py-2">{fmt(d.kvReads)}</td>
                  <td className="border-b border-hairline px-2 py-2">{fmt(d.kvWrites)}</td>
                  <td className="border-b border-hairline px-2 py-2">{fmt(d.scans)}</td>
                  <td className="border-b border-hairline px-2 py-2">{fmt(d.codesCreated)}</td>
                  <td className="border-b border-hairline px-2 py-2">
                    {fmt(d.destinationChanges)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="body-small mt-3 text-ink-muted">
          Scans come from the nightly roll-up, so today’s count appears tomorrow. Sync queue:{' '}
          {r.syncBacklog} waiting
          {r.syncStuck
            ? `, ${r.syncStuck} failing repeatedly (check EDGE_API_URL and EDGE_API_SECRET)`
            : ''}
          .
        </p>
      </section>
    </div>
  )
}
