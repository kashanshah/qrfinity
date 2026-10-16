import { ANALYTICS_WINDOW_DAYS, analyticsRanges, type ReportScope } from '@qrfinity/core'
import { parseDays } from '@/lib/days'
import { getAnalytics } from './analytics'
import type { ServiceContext } from './codes'
import { getEntitlements } from './entitlements'
import { historyReport } from './rollup'

/**
 * The report a dashboard page shows: live data for up to 90 days (everyone, free forever);
 * longer ranges from daily roll-ups when the user has analytics history.
 */
export async function scanReportFor(
  ctx: ServiceContext,
  scope: ReportScope,
  rawDays: string | undefined,
) {
  const ranges = analyticsRanges(await getEntitlements(ctx.db, ctx.userId))
  const days = parseDays(rawDays, ranges)
  const analytics = getAnalytics()
  const report =
    days > ANALYTICS_WINDOW_DAYS
      ? await historyReport(ctx.db, scope, days)
      : await analytics.report(scope, days)
  return { report, days, ranges, live: analytics.live, history: days > ANALYTICS_WINDOW_DAYS }
}
