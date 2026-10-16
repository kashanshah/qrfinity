/**
 * Nightly roll-ups: one row per code per UTC day, so scan history outlives Analytics Engine's
 * 90-day retention. The same shape comes from either backend; history reports are built from it.
 */
import {
  BREAKDOWNS,
  assembleReport,
  utcDay,
  type AeResponse,
  type Breakdown,
  type ScanReport,
} from './report'
import { SCAN_DATASET, blobColumn } from './scan'

export type BreakdownName = keyof typeof BREAKDOWNS

export type DailyRollup = {
  codeId: string
  day: string
  scans: number
  uniques: number
  /** Scans per UTC hour, 24 numbers. */
  hours: number[]
  breakdowns: Partial<Record<BreakdownName, Record<string, number>>>
}

/** Keys kept per breakdown per code and day. Enough for any top-10 over a long range. */
export const ROLLUP_TOP_KEYS = 25

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Analytics Engine SQL for one UTC day, grouped by code. */
export function aeRollupQueries(day: string) {
  if (!DAY.test(day)) throw new Error('Invalid day')
  const next = utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000))
  const from = `FROM ${SCAN_DATASET} WHERE timestamp >= toDateTime('${day} 00:00:00') AND timestamp < toDateTime('${next} 00:00:00') AND ${blobColumn('device')} != 'bot'`
  return {
    totals: `SELECT index1 AS code, SUM(_sample_interval) AS scans, COUNT(DISTINCT ${blobColumn('visitor')}) AS uniques ${from} GROUP BY code FORMAT JSON`,
    hours: `SELECT index1 AS code, toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS t, SUM(_sample_interval) AS scans ${from} GROUP BY code, t FORMAT JSON`,
    ...(Object.fromEntries(
      Object.entries(BREAKDOWNS).map(([name, blob]) => [
        name,
        `SELECT index1 AS code, ${blobColumn(blob)} AS key, SUM(_sample_interval) AS scans ${from} GROUP BY code, key FORMAT JSON`,
      ]),
    ) as Record<BreakdownName, string>),
  }
}

type Row = { code: string; key?: string; hour?: number; scans: number; uniques?: number }

const num = (v: unknown) => Math.round(typeof v === 'number' ? v : Number(v) || 0)

/** Combines per-code totals, hours and breakdown rows into roll-ups (any backend). */
export function assembleRollups(
  day: string,
  totals: Row[],
  hours: Row[],
  breakdowns: Record<BreakdownName, Row[]>,
): DailyRollup[] {
  const out = new Map<string, DailyRollup>()
  for (const t of totals) {
    if (t.scans <= 0) continue
    out.set(t.code, {
      codeId: t.code,
      day,
      scans: t.scans,
      uniques: t.uniques ?? 0,
      hours: Array(24).fill(0),
      breakdowns: {},
    })
  }
  for (const h of hours) {
    const r = out.get(h.code)
    if (r && h.hour !== undefined && h.hour >= 0 && h.hour < 24) r.hours[h.hour]! += h.scans
  }
  for (const name of Object.keys(BREAKDOWNS) as BreakdownName[]) {
    const byCode = new Map<string, Row[]>()
    for (const row of breakdowns[name]) {
      if (!row.key || row.scans <= 0 || !out.has(row.code)) continue
      byCode.set(row.code, [...(byCode.get(row.code) ?? []), row])
    }
    for (const [code, rows] of byCode) {
      rows.sort((a, b) => b.scans - a.scans)
      out.get(code)!.breakdowns[name] = Object.fromEntries(
        rows.slice(0, ROLLUP_TOP_KEYS).map((r) => [r.key!, r.scans]),
      )
    }
  }
  return [...out.values()]
}

/** Parses the SQL API responses for aeRollupQueries. */
export function rollupsFromAe(
  day: string,
  res: Record<keyof ReturnType<typeof aeRollupQueries>, AeResponse>,
): DailyRollup[] {
  const rows = (r: AeResponse) =>
    r.data.map((d) => ({
      code: String(d.code ?? ''),
      key: d.key === undefined ? undefined : String(d.key),
      hour:
        d.t === undefined ? undefined : new Date(String(d.t).replace(' ', 'T') + 'Z').getUTCHours(),
      scans: num(d.scans),
      uniques: d.uniques === undefined ? undefined : num(d.uniques),
    }))
  return assembleRollups(
    day,
    rows(res.totals),
    rows(res.hours),
    Object.fromEntries(
      Object.keys(BREAKDOWNS).map((k) => [k, rows(res[k as BreakdownName])]),
    ) as Record<BreakdownName, Row[]>,
  )
}

/** A report over any number of days, from stored roll-ups. */
export function reportFromRollups(
  days: number,
  rollups: Omit<DailyRollup, 'codeId'>[],
  now?: Date,
): ScanReport {
  const daily = new Map<string, { scans: number; uniques: number }>()
  const hourly = Array.from({ length: 24 }, () => 0)
  const sums = Object.fromEntries(
    Object.keys(BREAKDOWNS).map((k) => [k, new Map<string, number>()]),
  ) as Record<BreakdownName, Map<string, number>>
  for (const r of rollups) {
    const d = daily.get(r.day) ?? { scans: 0, uniques: 0 }
    daily.set(r.day, { scans: d.scans + r.scans, uniques: d.uniques + r.uniques })
    r.hours.forEach((n, i) => (hourly[i]! += n))
    for (const [name, keys] of Object.entries(r.breakdowns) as [
      BreakdownName,
      Record<string, number>,
    ][]) {
      for (const [k, n] of Object.entries(keys)) sums[name].set(k, (sums[name].get(k) ?? 0) + n)
    }
  }
  const top = (m: Map<string, number>): Breakdown =>
    [...m]
      .map(([key, scans]) => ({ key, scans }))
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 10)
  return assembleReport({
    days,
    now,
    daily: [...daily].map(([date, v]) => ({ date, ...v })),
    hourly: hourly.map((scans, hour) => ({ hour, scans })),
    breakdowns: Object.fromEntries(Object.entries(sums).map(([k, m]) => [k, top(m)])) as Record<
      BreakdownName,
      Breakdown
    >,
  })
}
