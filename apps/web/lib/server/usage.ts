import {
  mergeUsageDays,
  PLAN_LIMITS,
  usageAgainstLimit,
  utcDay,
  type CloudflarePlan,
  type CloudflareUsage,
  type UsageDay,
  type UsageMetric,
} from '@qrfinity/core'
import {
  and,
  codes,
  destinationHistory,
  edgeSyncOutbox,
  eq,
  gte,
  scanDaily,
  sql,
  type Database,
} from '@qrfinity/db'

const DAY_MS = 86_400_000

/** What our own database knows, per UTC day: code activity, scans (from roll-ups) and the sync queue. */
export async function databaseActivity(db: Database, from: string) {
  const dayOf = (col: unknown) => sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`
  const since = sql`${from}::date at time zone 'UTC'`
  const [created, changes, scans, [backlog]] = await Promise.all([
    db
      .select({ date: dayOf(codes.createdAt), n: sql<number>`count(*)::int` })
      .from(codes)
      .where(and(eq(codes.kind, 'dynamic'), gte(codes.createdAt, since)))
      .groupBy(dayOf(codes.createdAt)),
    db
      .select({ date: dayOf(destinationHistory.changedAt), n: sql<number>`count(*)::int` })
      .from(destinationHistory)
      .where(gte(destinationHistory.changedAt, since))
      .groupBy(dayOf(destinationHistory.changedAt)),
    db
      .select({
        date: sql<string>`${scanDaily.day}::text`,
        n: sql<number>`sum(${scanDaily.scans})::int`,
      })
      .from(scanDaily)
      .where(gte(scanDaily.day, from))
      .groupBy(scanDaily.day),
    db
      .select({
        n: sql<number>`count(*)::int`,
        stuck: sql<number>`count(*) filter (where ${edgeSyncOutbox.attempts} >= 3)::int`,
      })
      .from(edgeSyncOutbox),
  ])
  const rows = new Map<
    string,
    { date: string; codesCreated: number; destinationChanges: number; scans: number | null }
  >()
  const row = (date: string) =>
    rows.get(date) ??
    rows.set(date, { date, codesCreated: 0, destinationChanges: 0, scans: null }).get(date)!
  for (const r of created) row(r.date).codesCreated = r.n
  for (const r of changes) row(r.date).destinationChanges = r.n
  for (const r of scans) row(r.date).scans = r.n
  return { days: rows, backlog: backlog?.n ?? 0, stuck: backlog?.stuck ?? 0 }
}

export type UsageReport = Awaited<ReturnType<typeof usageReport>>

/**
 * The last 7 UTC days of usage against the plan's limits. Cloudflare's own numbers when the API is
 * reachable; otherwise an estimate of KV writes from our database (each create or destination change
 * is one write, plus one a day for the visitor salt).
 */
export async function usageReport(
  db: Database,
  cf: CloudflareUsage | null,
  plan: CloudflarePlan,
  now = new Date(),
) {
  const today = utcDay(now)
  // Paid limits are monthly, so read from the 1st of the month (or 7 days back, whichever is earlier).
  const weekAgo = utcDay(new Date(now.getTime() - 6 * DAY_MS))
  const from =
    plan === 'paid' && `${today.slice(0, 7)}-01` < weekAgo ? `${today.slice(0, 7)}-01` : weekAgo

  const local = await databaseActivity(db, from)
  let cloudflare: UsageDay[] = []
  let cloudflareError: string | null = null
  if (cf) {
    try {
      cloudflare = await cf.daily(from, today)
    } catch (e) {
      cloudflareError = e instanceof Error ? e.message : 'Cloudflare usage is unavailable.'
    }
  } else cloudflareError = 'CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN aren’t set'

  const estimated: UsageDay[] = cloudflare.length
    ? []
    : [...local.days.values()].map((d) => ({ date: d.date, kvWrites: d.destinationChanges + 1 }))
  const days = mergeUsageDays(cloudflare, estimated)
  const last7 = days.filter((d) => d.date >= weekAgo)
  const metrics = (Object.keys(PLAN_LIMITS[plan].limits) as UsageMetric[]).map((metric) => ({
    metric,
    today: days.find((d) => d.date === today)?.[metric] ?? null,
    ...(usageAgainstLimit(plan === 'free' ? last7 : days, metric, plan, today) ?? {}),
  }))

  const table = Array.from({ length: 7 }, (_, i) => {
    const date = utcDay(new Date(now.getTime() - i * DAY_MS))
    const cfDay = days.find((d) => d.date === date)
    const db = local.days.get(date)
    return {
      date,
      workerRequests: cfDay?.workerRequests ?? null,
      kvReads: cfDay?.kvReads ?? null,
      kvWrites: cfDay?.kvWrites ?? null,
      codesCreated: db?.codesCreated ?? 0,
      destinationChanges: db?.destinationChanges ?? 0,
      scans: db?.scans ?? null,
    }
  })

  return {
    plan,
    period: PLAN_LIMITS[plan].period,
    source: cloudflare.length ? ('cloudflare' as const) : ('estimate' as const),
    cloudflareError,
    metrics,
    table,
    syncBacklog: local.backlog,
    syncStuck: local.stuck,
  }
}
