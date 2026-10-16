import { describe, expect, it } from 'vitest'
import { aeRollupQueries, reportFromRollups, rollupsFromAe } from '../src/analytics/rollup'

const empty = { data: [] }

describe('daily roll-ups', () => {
  it('builds one-day Analytics Engine queries and refuses bad input', () => {
    const q = aeRollupQueries('2026-10-15')
    expect(q.totals).toContain("toDateTime('2026-10-15 00:00:00')")
    expect(q.totals).toContain("toDateTime('2026-10-16 00:00:00')")
    expect(q.countries).toContain('GROUP BY code, key')
    expect(() => aeRollupQueries("2026-10-15'; DROP")).toThrow()
  })

  it('parses responses into per-code rows and reports over long ranges', () => {
    const rollups = rollupsFromAe('2026-10-15', {
      totals: {
        data: [
          { code: 'a', scans: 5, uniques: 3 },
          { code: 'b', scans: 0, uniques: 0 },
        ],
      },
      hours: { data: [{ code: 'a', t: '2026-10-15 13:00:00', scans: 5 }] },
      countries: {
        data: [
          { code: 'a', key: 'CA', scans: 4 },
          { code: 'a', key: 'US', scans: 1 },
        ],
      },
      cities: empty,
      devices: { data: [{ code: 'a', key: 'mobile', scans: 5 }] },
      os: empty,
      browsers: empty,
      referrers: empty,
    })
    expect(rollups).toHaveLength(1)
    expect(rollups[0]).toMatchObject({
      codeId: 'a',
      scans: 5,
      uniques: 3,
      breakdowns: { countries: { CA: 4, US: 1 } },
    })
    expect(rollups[0]!.hours[13]).toBe(5)

    const now = new Date('2027-01-10T12:00:00Z')
    const report = reportFromRollups(
      365,
      [rollups[0]!, { ...rollups[0]!, day: '2027-01-02', scans: 2, uniques: 2 }],
      now,
    )
    expect(report.daily).toHaveLength(365)
    expect(report.totals.scans).toBe(7)
    expect(report.countries[0]).toEqual({ key: 'CA', scans: 8 })
    expect(report.hourOfDay[13]).toBe(10)
  })
})
