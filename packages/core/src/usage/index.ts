/**
 * Cloudflare usage against plan limits, for the admin Usage page. Free-plan limits are daily and
 * reset at 00:00 UTC; when one is hit, Cloudflare returns errors until the reset, which for the
 * redirect Worker would mean printed codes stop opening. Figures as published by Cloudflare at the
 * time of writing: check Workers & Pages → Plans → View limits if they change.
 */

export type CloudflarePlan = 'free' | 'paid'
export const CLOUDFLARE_PLANS: readonly CloudflarePlan[] = ['free', 'paid']

export type UsageMetric = 'workerRequests' | 'kvReads' | 'kvWrites' | 'kvDeletes'

export const METRIC_LABELS: Record<UsageMetric, string> = {
  workerRequests: 'Worker requests (scans and syncs)',
  kvReads: 'KV reads',
  kvWrites: 'KV writes (code creates and edits)',
  kvDeletes: 'KV deletes',
}

/** Free: per UTC day. Paid: included per month (more is billed, never blocked). */
export const PLAN_LIMITS: Record<
  CloudflarePlan,
  { period: 'day' | 'month'; limits: Record<UsageMetric, number> }
> = {
  free: {
    period: 'day',
    limits: { workerRequests: 100_000, kvReads: 100_000, kvWrites: 1_000, kvDeletes: 1_000 },
  },
  paid: {
    period: 'month',
    limits: {
      workerRequests: 10_000_000,
      kvReads: 10_000_000,
      kvWrites: 1_000_000,
      kvDeletes: 1_000_000,
    },
  },
}

export type UsageDay = { date: string } & Partial<Record<UsageMetric, number>>

export type UsageLevel = 'ok' | 'watch' | 'upgrade'

/** Under 50%: fine. 50–80%: watch it. Over 80%: upgrade (free) or expect overage charges (paid). */
export function assessUsage(used: number, limit: number): { pct: number; level: UsageLevel } {
  const pct = limit > 0 ? (used / limit) * 100 : 0
  return { pct, level: pct >= 80 ? 'upgrade' : pct >= 50 ? 'watch' : 'ok' }
}

/**
 * The figure to compare with the limit: on the free plan the busiest of the given days (a limit is
 * hit on the worst day, not on average); on paid, the month-to-date total.
 */
export function usageAgainstLimit(
  days: UsageDay[],
  metric: UsageMetric,
  plan: CloudflarePlan,
  today: string,
) {
  const values = days.map((d) => d[metric]).filter((v): v is number => typeof v === 'number')
  if (!values.length) return null
  const used =
    plan === 'free'
      ? Math.max(...values)
      : days
          .filter((d) => d.date.slice(0, 7) === today.slice(0, 7))
          .reduce((sum, d) => sum + (d[metric] ?? 0), 0)
  const limit = PLAN_LIMITS[plan].limits[metric]
  return { used, limit, ...assessUsage(used, limit) }
}

/** Merges per-day rows from several sources (Cloudflare, our database) by date, newest first. */
export function mergeUsageDays(...sources: UsageDay[][]): UsageDay[] {
  const byDate = new Map<string, UsageDay>()
  for (const rows of sources)
    for (const r of rows) {
      const cur: UsageDay = byDate.get(r.date) ?? { date: r.date }
      for (const [k, v] of Object.entries(r) as [UsageMetric | 'date', unknown][])
        if (k !== 'date' && typeof v === 'number') cur[k] = (cur[k] ?? 0) + v
      byDate.set(r.date, cur)
    }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}
