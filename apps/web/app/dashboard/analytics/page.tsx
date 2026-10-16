import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { getAnalytics } from '@/lib/server/analytics'
import { parseDays } from '@/lib/days'
import { serviceContext } from '@/lib/server/context'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const days = parseDays((await searchParams).days)
  const ctx = await serviceContext('/dashboard/analytics')
  const analytics = getAnalytics()
  const report = await analytics.report({ kind: 'owner', ownerId: ctx.userId }, days)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading text-ink">Analytics</h1>
        <p className="mt-1 text-ink-muted">
          Scans across all your dynamic codes. Free for the last 90 days.
        </p>
      </div>
      <AnalyticsView
        report={report}
        days={days}
        live={analytics.live}
        basePath="/dashboard/analytics"
      />
    </div>
  )
}
