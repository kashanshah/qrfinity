import {
  reportFromRollups,
  utcDay,
  type ReportScope,
  type ScanAnalytics,
  type ScanReport,
} from '@qrfinity/core'
import { and, codes, eq, gt, inArray, lt, scanDaily, type Database } from '@qrfinity/db'

const DAY_MS = 86_400_000

/**
 * Rolls the last `days` complete UTC days into scan_daily (default: yesterday and the day before,
 * so late events are caught). Re-running a day replaces it, so the job is safe to repeat.
 * Runs for every code, free or paid: if someone upgrades later, their history is already there.
 */
export async function runRollup(
  db: Database,
  analytics: ScanAnalytics,
  { now = new Date(), days = 2 }: { now?: Date; days?: number } = {},
) {
  const summary: { day: string; codes: number }[] = []
  for (let i = Math.min(Math.max(days, 1), 90); i >= 1; i--) {
    const day = utcDay(new Date(now.getTime() - i * DAY_MS))
    const rollups = await analytics.dailyRollup(day)
    // Only codes we know (the analytics store may hold test or malformed ids).
    const ids = rollups.map((r) => r.codeId).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    const known = ids.length
      ? new Set(
          (await db.select({ id: codes.id }).from(codes).where(inArray(codes.id, ids))).map(
            (c) => c.id,
          ),
        )
      : new Set<string>()
    const rows = rollups.filter((r) => known.has(r.codeId))
    await db.transaction(async (tx) => {
      await tx.delete(scanDaily).where(eq(scanDaily.day, day))
      for (let j = 0; j < rows.length; j += 500) {
        await tx.insert(scanDaily).values(
          rows.slice(j, j + 500).map((r) => ({
            codeId: r.codeId,
            day: r.day,
            scans: r.scans,
            uniques: r.uniques,
            hours: r.hours,
            breakdowns: r.breakdowns,
          })),
        )
      }
    })
    summary.push({ day, codes: rows.length })
  }
  return summary
}

/** A report over a long range (up to two years), from roll-ups. Covers complete days up to yesterday. */
export async function historyReport(
  db: Database,
  scope: ReportScope,
  days: number,
  now = new Date(),
): Promise<ScanReport> {
  const since = utcDay(new Date(now.getTime() - days * DAY_MS))
  const today = utcDay(now)
  const rows = await db
    .select({
      day: scanDaily.day,
      scans: scanDaily.scans,
      uniques: scanDaily.uniques,
      hours: scanDaily.hours,
      breakdowns: scanDaily.breakdowns,
    })
    .from(scanDaily)
    .innerJoin(codes, eq(codes.id, scanDaily.codeId))
    .where(
      and(
        scope.kind === 'code'
          ? eq(scanDaily.codeId, scope.codeId)
          : eq(codes.userId, scope.ownerId),
        gt(scanDaily.day, since),
        lt(scanDaily.day, today),
      ),
    )
  return reportFromRollups(days, rows, now)
}
