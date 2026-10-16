import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { serviceContext } from '@/lib/server/context'
import { scanReportFor } from '@/lib/server/scan-report'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const ctx = await serviceContext('/dashboard/analytics')
  const r = await scanReportFor(
    ctx,
    { kind: 'owner', ownerId: ctx.userId },
    (await searchParams).days,
  )
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading text-ink">Analytics</h1>
        <p className="mt-1 text-ink-muted">
          Scans across all your dynamic codes. Free for the last 90 days.
        </p>
      </div>
      <AnalyticsView {...r} basePath="/dashboard/analytics" />
    </div>
  )
}
