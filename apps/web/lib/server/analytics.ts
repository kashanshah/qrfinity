/**
 * Scan analytics backends. Production reads Workers Analytics Engine through its SQL API;
 * local development (and self-hosting) reads the scan_events table in Postgres.
 */
import {
  ANALYTICS_WINDOW_DAYS,
  BREAKDOWNS,
  aeCodeTotalsQuery,
  aeQueries,
  assembleReport,
  reportFromAe,
  type AeResponse,
  type Breakdown,
  type ReportScope,
  type ScanAnalytics,
  type ScanReport,
} from '@qrfinity/core'
import { and, desc, eq, gt, ne, scanEvents, sql, type Database, type SQL } from '@qrfinity/db'
import { getDb } from './db'
import { env } from './env'

const clampDays = (days?: number) =>
  Math.max(1, Math.min(ANALYTICS_WINDOW_DAYS, Math.floor(days ?? ANALYTICS_WINDOW_DAYS)))

export class AnalyticsEngineBackend implements ScanAnalytics {
  readonly live = true
  constructor(
    private accountId: string,
    private token: string,
  ) {}

  private async query(sqlText: string): Promise<AeResponse> {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/analytics_engine/sql`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: sqlText,
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!res.ok) throw new Error(`Analytics Engine responded ${res.status}`)
    return (await res.json()) as AeResponse
  }

  async report(scope: ReportScope, days?: number): Promise<ScanReport> {
    const d = clampDays(days)
    const q = aeQueries(scope, d)
    const entries = await Promise.all(
      Object.entries(q).map(async ([k, s]) => [k, await this.query(s)] as const),
    )
    return reportFromAe(d, Object.fromEntries(entries) as Parameters<typeof reportFromAe>[1])
  }

  async codeTotals(ownerId: string, days?: number) {
    const res = await this.query(aeCodeTotalsQuery(ownerId, clampDays(days)))
    return new Map(res.data.map((r) => [String(r.code), Math.round(Number(r.scans) || 0)]))
  }
}

export class PostgresAnalyticsBackend implements ScanAnalytics {
  readonly live = true
  constructor(private db: Database) {}

  private where(scope: ReportScope, days: number): SQL {
    return and(
      scope.kind === 'code'
        ? eq(scanEvents.codeId, scope.codeId)
        : eq(scanEvents.owner, scope.ownerId),
      gt(scanEvents.at, sql`now() - make_interval(days => ${days})`),
      ne(scanEvents.device, 'bot'),
    )!
  }

  async report(scope: ReportScope, days?: number): Promise<ScanReport> {
    const d = clampDays(days)
    const where = this.where(scope, d)
    const dayExpr = sql<string>`to_char(date_trunc('day', ${scanEvents.at} at time zone 'UTC'), 'YYYY-MM-DD')`
    const hourExpr = sql<number>`extract(hour from ${scanEvents.at} at time zone 'UTC')::int`
    const [daily, hourly, ...breakdowns] = await Promise.all([
      this.db
        .select({
          date: dayExpr,
          scans: sql<number>`count(*)::int`,
          uniques: sql<number>`count(distinct ${scanEvents.visitor})::int`,
        })
        .from(scanEvents)
        .where(where)
        .groupBy(dayExpr),
      this.db
        .select({ hour: hourExpr, scans: sql<number>`count(*)::int` })
        .from(scanEvents)
        .where(where)
        .groupBy(hourExpr),
      ...Object.values(BREAKDOWNS).map((col) => {
        const column = scanEvents[col]
        return this.db
          .select({ key: column, scans: sql<number>`count(*)::int` })
          .from(scanEvents)
          .where(and(where, ne(column, '')))
          .groupBy(column)
          .orderBy(desc(sql`count(*)`))
          .limit(10)
      }),
    ])
    return assembleReport({
      days: d,
      daily,
      hourly,
      breakdowns: Object.fromEntries(
        Object.keys(BREAKDOWNS).map((k, i) => [k, breakdowns[i] as Breakdown]),
      ) as Record<keyof typeof BREAKDOWNS, Breakdown>,
    })
  }

  async codeTotals(ownerId: string, days?: number) {
    const rows = await this.db
      .select({ code: scanEvents.codeId, scans: sql<number>`count(*)::int` })
      .from(scanEvents)
      .where(this.where({ kind: 'owner', ownerId }, clampDays(days)))
      .groupBy(scanEvents.codeId)
    return new Map(rows.map((r) => [r.code, r.scans]))
  }
}

/** No backend configured: empty reports, clearly flagged as not live. */
export class UnconfiguredAnalytics implements ScanAnalytics {
  readonly live = false
  async report(_scope: ReportScope, days?: number) {
    const d = clampDays(days)
    const empty = Object.fromEntries(
      Object.keys(BREAKDOWNS).map((k) => [k, []]),
    ) as unknown as Record<keyof typeof BREAKDOWNS, Breakdown>
    return assembleReport({ days: d, daily: [], hourly: [], breakdowns: empty })
  }
  async codeTotals() {
    return new Map<string, number>()
  }
}

export function getAnalytics(): ScanAnalytics {
  if (env.analyticsBackend === 'postgres') return new PostgresAnalyticsBackend(getDb())
  const cf = env.cloudflareAnalytics
  if (env.analyticsBackend === 'analytics-engine' && cf)
    return new AnalyticsEngineBackend(cf.accountId, cf.token)
  return new UnconfiguredAnalytics()
}
