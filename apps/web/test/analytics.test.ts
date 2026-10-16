import { scanEvents, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresAnalyticsBackend } from '@/lib/server/analytics'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'
import { freshDb } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())

const CODE = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

describe('Postgres analytics backend', () => {
  it('builds the same report shape as Analytics Engine, excluding bots', async () => {
    const base = {
      owner: 'alice',
      country: 'CA',
      region: 'Ontario',
      city: 'Toronto',
      device: 'mobile',
      os: 'iOS',
      browser: 'Safari',
      referrer: '',
    }
    await db.insert(scanEvents).values([
      { ...base, codeId: CODE, visitor: 'v1', at: sql`now()` },
      { ...base, codeId: CODE, visitor: 'v1', at: sql`now()` },
      {
        ...base,
        codeId: CODE,
        visitor: 'v2',
        country: 'US',
        city: 'Seattle',
        device: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        at: sql`now() - interval '2 days'`,
      },
      { ...base, codeId: CODE, visitor: 'bot', device: 'bot', at: sql`now()` },
      { ...base, codeId: OTHER, visitor: 'v3', at: sql`now()` },
      { ...base, codeId: CODE, visitor: 'old', at: sql`now() - interval '120 days'` },
    ])
    const backend = new PostgresAnalyticsBackend(db)
    const r = await backend.report({ kind: 'code', codeId: CODE }, 30)
    expect(r.totals).toEqual({ scans: 3, uniques: 2 })
    expect(r.daily).toHaveLength(30)
    expect(r.daily.at(-1)).toMatchObject({ scans: 2, uniques: 1 })
    expect(r.countries).toEqual([
      { key: 'CA', scans: 2 },
      { key: 'US', scans: 1 },
    ])
    expect(r.devices.map((d) => d.key)).not.toContain('bot')
    expect(r.hourOfDay.reduce((a, b) => a + b, 0)).toBe(3)
    expect(r.referrers).toEqual([])

    const owner = await backend.report({ kind: 'owner', ownerId: 'alice' })
    expect(owner.totals.scans).toBe(4)
    const totals = await backend.codeTotals('alice')
    expect(totals.get(CODE)).toBe(3)
    expect(totals.get(OTHER)).toBe(1)
  })
})

describe('Postgres rate limiter', () => {
  it('allows up to the limit, then reports when to retry', async () => {
    const limiter = new PostgresRateLimiter(db)
    for (let i = 0; i < 3; i++) expect(await limiter.hit('k1', 3, 60)).toEqual({ ok: true })
    const r = await limiter.hit('k1', 3, 60)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryAfterSeconds).toBeGreaterThan(50)
    await db.execute(
      sql`update rate_limits set window_start = now() - interval '2 minutes' where key = 'k1'`,
    )
    expect(await limiter.hit('k1', 3, 60)).toEqual({ ok: true })
  })
})
