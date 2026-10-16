/**
 * Scan reports: the shape the dashboard renders, the Analytics Engine SQL that fills it,
 * and parsing of the SQL API's JSON. Times are UTC.
 */
import { SCAN_DATASET, blobColumn, type ScanBlob } from './scan'

export const ANALYTICS_WINDOW_DAYS = 90

export type ReportScope = { kind: 'code'; codeId: string } | { kind: 'owner'; ownerId: string }
export type Breakdown = { key: string; scans: number }[]

export type ScanReport = {
  days: number
  totals: { scans: number; uniques: number }
  /** One row per UTC day, oldest first, zero-filled. */
  daily: { date: string; scans: number; uniques: number }[]
  /** Scans by UTC hour of day, 0–23. */
  hourOfDay: number[]
  countries: Breakdown
  cities: Breakdown
  devices: Breakdown
  os: Breakdown
  browsers: Breakdown
  referrers: Breakdown
  rules: Breakdown
}

export const BREAKDOWNS = {
  countries: 'country',
  cities: 'city',
  devices: 'device',
  os: 'os',
  browsers: 'browser',
  referrers: 'referrer',
  rules: 'rule',
} as const satisfies Record<string, ScanBlob>

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The SQL API takes no parameters, so ids are checked against a strict pattern before use. */
function scopeWhere(scope: ReportScope, days: number): string {
  const id = scope.kind === 'code' ? scope.codeId : scope.ownerId
  if (!SAFE_ID.test(id)) throw new Error('Invalid analytics scope id')
  const d = Math.max(1, Math.min(ANALYTICS_WINDOW_DAYS, Math.floor(days)))
  const filter = scope.kind === 'code' ? `index1 = '${id}'` : `${blobColumn('owner')} = '${id}'`
  return `${filter} AND timestamp > NOW() - INTERVAL '${d}' DAY AND ${blobColumn('device')} != 'bot'`
}

export function aeQueries(scope: ReportScope, days = ANALYTICS_WINDOW_DAYS) {
  const where = scopeWhere(scope, days)
  const from = `FROM ${SCAN_DATASET} WHERE ${where}`
  const breakdowns = Object.fromEntries(
    Object.entries(BREAKDOWNS).map(([name, blob]) => [
      name,
      `SELECT ${blobColumn(blob)} AS key, SUM(_sample_interval) AS scans ${from} GROUP BY key ORDER BY scans DESC LIMIT 10 FORMAT JSON`,
    ]),
  ) as Record<keyof typeof BREAKDOWNS, string>
  return {
    daily: `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS t, SUM(_sample_interval) AS scans, COUNT(DISTINCT ${blobColumn('visitor')}) AS uniques ${from} GROUP BY t ORDER BY t FORMAT JSON`,
    hourly: `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS t, SUM(_sample_interval) AS scans ${from} GROUP BY t ORDER BY t FORMAT JSON`,
    ...breakdowns,
  }
}

/** Totals per code for the dashboard list. */
export function aeCodeTotalsQuery(ownerId: string, days = ANALYTICS_WINDOW_DAYS): string {
  return `SELECT index1 AS code, SUM(_sample_interval) AS scans FROM ${SCAN_DATASET} WHERE ${scopeWhere({ kind: 'owner', ownerId }, days)} GROUP BY code FORMAT JSON`
}

/** Scans of one code since a moment, for scan limits. */
export function aeScanCountQuery(codeId: string, since: Date): string {
  if (!SAFE_ID.test(codeId)) throw new Error('Invalid analytics scope id')
  const t = since.toISOString().slice(0, 19).replace('T', ' ')
  return `SELECT SUM(_sample_interval) AS scans FROM ${SCAN_DATASET} WHERE index1 = '${codeId}' AND timestamp >= toDateTime('${t}') AND ${blobColumn('device')} != 'bot' FORMAT JSON`
}

export type AeResponse = { data: Record<string, unknown>[] }

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

/** "2026-10-15 13:00:00" → Date (UTC). */
function aeTime(v: unknown): Date {
  return new Date(String(v).replace(' ', 'T') + (String(v).endsWith('Z') ? '' : 'Z'))
}

export function parseBreakdown(res: AeResponse): Breakdown {
  return res.data
    .map((r) => ({ key: String(r.key ?? ''), scans: Math.round(num(r.scans)) }))
    .filter((r) => r.scans > 0)
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Assembles a report from per-day, per-hour and breakdown rows (any backend). */
export function assembleReport(input: {
  days: number
  now?: Date
  daily: { date: string; scans: number; uniques: number }[]
  hourly: { hour: number; scans: number }[]
  breakdowns: Record<keyof typeof BREAKDOWNS, Breakdown>
}): ScanReport {
  const now = input.now ?? new Date()
  const byDate = new Map(input.daily.map((d) => [d.date, d]))
  const daily: ScanReport['daily'] = []
  for (let i = input.days - 1; i >= 0; i--) {
    const date = utcDay(new Date(now.getTime() - i * 86_400_000))
    const row = byDate.get(date)
    daily.push({ date, scans: row?.scans ?? 0, uniques: row?.uniques ?? 0 })
  }
  const hourOfDay = Array.from({ length: 24 }, () => 0)
  for (const h of input.hourly) hourOfDay[h.hour] = (hourOfDay[h.hour] ?? 0) + h.scans
  return {
    days: input.days,
    totals: daily.reduce((t, d) => ({ scans: t.scans + d.scans, uniques: t.uniques + d.uniques }), {
      scans: 0,
      uniques: 0,
    }),
    daily,
    hourOfDay,
    ...input.breakdowns,
  }
}

/** Builds a report from Analytics Engine SQL API responses. */
export function reportFromAe(
  days: number,
  res: { daily: AeResponse; hourly: AeResponse } & Record<keyof typeof BREAKDOWNS, AeResponse>,
  now?: Date,
): ScanReport {
  return assembleReport({
    days,
    now,
    daily: res.daily.data.map((r) => ({
      date: utcDay(aeTime(r.t)),
      scans: Math.round(num(r.scans)),
      uniques: Math.round(num(r.uniques)),
    })),
    hourly: res.hourly.data.map((r) => ({
      hour: aeTime(r.t).getUTCHours(),
      scans: Math.round(num(r.scans)),
    })),
    breakdowns: Object.fromEntries(
      Object.keys(BREAKDOWNS).map((k) => [k, parseBreakdown(res[k as keyof typeof BREAKDOWNS])]),
    ) as Record<keyof typeof BREAKDOWNS, Breakdown>,
  })
}

/** Weekly totals (weeks start Monday, UTC) from a daily series. */
export function weekly(
  daily: ScanReport['daily'],
): { week: string; scans: number; uniques: number }[] {
  const out = new Map<string, { week: string; scans: number; uniques: number }>()
  for (const d of daily) {
    const date = new Date(d.date + 'T00:00:00Z')
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000)
    const key = utcDay(monday)
    const w = out.get(key) ?? { week: key, scans: 0, uniques: 0 }
    w.scans += d.scans
    w.uniques += d.uniques
    out.set(key, w)
  }
  return [...out.values()]
}
