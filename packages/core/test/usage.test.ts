import { describe, expect, it } from 'vitest'
import { assessUsage, mergeUsageDays, usageAgainstLimit } from '../src/usage'

describe('Cloudflare usage', () => {
  it('rates usage against a limit', () => {
    expect(assessUsage(10_000, 100_000)).toEqual({ pct: 10, level: 'ok' })
    expect(assessUsage(60_000, 100_000).level).toBe('watch')
    expect(assessUsage(850, 1_000).level).toBe('upgrade')
  })

  it('uses the busiest day on free and the month to date on paid', () => {
    const days = [
      { date: '2026-10-16', workerRequests: 20_000, kvWrites: 40 },
      { date: '2026-10-15', workerRequests: 70_000, kvWrites: 900 },
      { date: '2026-09-30', workerRequests: 5_000_000 },
    ]
    expect(
      usageAgainstLimit(days.slice(0, 2), 'workerRequests', 'free', '2026-10-16'),
    ).toMatchObject({
      used: 70_000,
      limit: 100_000,
      level: 'watch',
    })
    expect(usageAgainstLimit(days, 'kvWrites', 'free', '2026-10-16')?.level).toBe('upgrade')
    expect(usageAgainstLimit(days, 'workerRequests', 'paid', '2026-10-16')).toMatchObject({
      used: 90_000,
      level: 'ok',
    })
    expect(usageAgainstLimit(days, 'kvReads', 'free', '2026-10-16')).toBeNull()
  })

  it('merges sources by day, newest first', () => {
    expect(
      mergeUsageDays(
        [{ date: '2026-10-15', kvWrites: 3 }],
        [
          { date: '2026-10-16', kvWrites: 1 },
          { date: '2026-10-15', kvWrites: 2 },
        ],
      ),
    ).toEqual([
      { date: '2026-10-16', kvWrites: 1 },
      { date: '2026-10-15', kvWrites: 5 },
    ])
  })
})
