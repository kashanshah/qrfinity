import { auditLog, scanEvents, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AdminContext } from '@/lib/server/admin'
import { PostgresAnalyticsBackend } from '@/lib/server/analytics'
import { createDynamicCode } from '@/lib/server/codes'
import { getEntitlements, invalidateFlags, setFlag, setUserPlan } from '@/lib/server/entitlements'
import { historyReport, runRollup } from '@/lib/server/rollup'
import { scanReportFor } from '@/lib/server/scan-report'
import { FakeEdge, ctxFor, design, freshDb, makeUser } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(sql`truncate codes, feature_flags, scan_events, audit_log, "user" cascade`)
  invalidateFlags()
  await makeUser(db, 'alice')
  await makeUser(db, 'bob')
})

const admin = (): AdminContext => ({
  db,
  edge: new FakeEdge(),
  mailer: { send: async () => {} },
  actor: 'admin',
  abuseEmail: 'abuse@example.com',
  siteUrl: 'https://qrfinity.com',
})

describe('plans and feature flags', () => {
  it('gives everyone every released feature, on any plan', async () => {
    const e = await getEntitlements(db, 'alice')
    expect(e.has('dynamicCodes')).toBe(true)
    expect(e.has('analyticsHistory')).toBe(true)
    expect(e.has('customSlugs')).toBe(true)
    expect(e.has('redirectRules')).toBe(false)
  })

  it('lets an admin set a plan, audited', async () => {
    await setUserPlan(admin(), 'alice', 'plus')
    await expect(setUserPlan(admin(), 'alice', 'gold')).rejects.toThrow(
      'Choose free, starter, plus, pro or unlimited',
    )
    expect(await db.select().from(auditLog)).toMatchObject([
      { action: 'user.plan', targetId: 'alice' },
    ])
  })

  it('switches a flag on for listed accounts or everyone, and refuses unknown emails', async () => {
    await setFlag(admin(), 'bulkCreate', { enabled: false, emails: ['Alice@example.com'] })
    expect((await getEntitlements(db, 'alice')).has('bulkCreate')).toBe(true)
    expect((await getEntitlements(db, 'bob')).has('bulkCreate')).toBe(false)
    await setFlag(admin(), 'bulkCreate', { enabled: true, emails: [] })
    expect((await getEntitlements(db, 'bob')).has('bulkCreate')).toBe(true)
    await expect(
      setFlag(admin(), 'bulkCreate', { enabled: false, emails: ['nobody@example.com'] }),
    ).rejects.toThrow('No account for nobody@example.com')
    await expect(setFlag(admin(), 'dynamicCodes2', { enabled: true, emails: [] })).rejects.toThrow(
      'Unknown feature',
    )
  })
})

describe('analytics roll-ups', () => {
  it('rolls complete days into daily totals and serves long ranges from them', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await createDynamicCode(ctx, { name: 'Menu', destination: 'example.com', design })
    const base = {
      codeId: code.id,
      owner: 'alice',
      region: '',
      city: 'Toronto',
      os: 'iOS',
      browser: 'Safari',
      referrer: '',
    }
    await db.insert(scanEvents).values([
      {
        ...base,
        country: 'CA',
        device: 'mobile',
        visitor: 'v1',
        at: sql`(current_date - 1) + time '13:00' at time zone 'UTC'`,
      },
      {
        ...base,
        country: 'CA',
        device: 'mobile',
        visitor: 'v2',
        at: sql`(current_date - 1) + time '13:30' at time zone 'UTC'`,
      },
      {
        ...base,
        country: 'US',
        device: 'bot',
        visitor: 'v3',
        at: sql`(current_date - 1) + time '14:00' at time zone 'UTC'`,
      },
      {
        ...base,
        country: 'US',
        device: 'desktop',
        visitor: 'v4',
        at: sql`(current_date - 2) + time '09:00' at time zone 'UTC'`,
      },
      // Another code that doesn't exist in codes is skipped.
      {
        ...base,
        codeId: '00000000-0000-4000-8000-00000000dead',
        country: 'CA',
        device: 'mobile',
        visitor: 'x',
        at: sql`(current_date - 1) + time '10:00' at time zone 'UTC'`,
      },
    ])
    const backend = new PostgresAnalyticsBackend(db)
    const summary = await runRollup(db, backend)
    expect(summary.map((s) => s.codes)).toEqual([1, 1])
    // Running again replaces, never doubles.
    await runRollup(db, backend)

    const report = await historyReport(db, { kind: 'owner', ownerId: 'alice' }, 365)
    expect(report.daily).toHaveLength(365)
    expect(report.totals).toEqual({ scans: 3, uniques: 3 })
    expect(report.countries[0]).toEqual({ key: 'CA', scans: 2 })
    expect(report.hourOfDay[13]).toBe(2)
    expect((await historyReport(db, { kind: 'owner', ownerId: 'bob' }, 365)).totals.scans).toBe(0)

    // Long history is free for everyone: a year comes from the roll-ups.
    const free = await scanReportFor(ctx, { kind: 'owner', ownerId: 'alice' }, '365')
    expect(free.ranges).toEqual([7, 30, 90, 365, 730])
    expect(free).toMatchObject({ days: 365, history: true })
  })
})
