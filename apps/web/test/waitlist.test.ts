import { auditLog, eq, proWaitlist, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'
import type { AdminContext } from '@/lib/server/admin'
import {
  exportWaitlist,
  joinWaitlist,
  listWaitlist,
  removeFromWaitlist,
} from '@/lib/server/waitlist'
import { FakeEdge, freshDb } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())

describe('Pro waitlist', () => {
  it('stores one lower-cased row per address and rejects bad input', async () => {
    const limiter = new PostgresRateLimiter(db)
    await joinWaitlist(db, limiter, 's', { email: ' Amira@Example.com ', visitor: 'a' })
    await joinWaitlist(db, limiter, 's', { email: 'amira@example.com', visitor: 'a' })
    expect(await db.select().from(proWaitlist)).toMatchObject([{ email: 'amira@example.com' }])
    await expect(
      joinWaitlist(db, limiter, 's', { email: 'not-an-email', visitor: 'a' }),
    ).rejects.toThrow('Check your email')
  })

  it('rate-limits one visitor', async () => {
    const limiter = new PostgresRateLimiter(db)
    for (let i = 0; i < 10; i++)
      await joinWaitlist(db, limiter, 's', { email: `p${i}@example.com`, visitor: 'busy' })
    await expect(
      joinWaitlist(db, limiter, 's', { email: 'p10@example.com', visitor: 'busy' }),
    ).rejects.toThrow('limit')
  })
})

describe('Pro waitlist admin', () => {
  const admin = (): AdminContext => ({
    db,
    edge: new FakeEdge(),
    mailer: { send: async () => {} },
    actor: 'admin-1',
    abuseEmail: 'abuse@qrfinity.com',
    siteUrl: 'https://qrfinity.com',
  })

  it('lists, sorts, searches, exports and removes, auditing exports and removals', async () => {
    await db.execute(sql`truncate pro_waitlist, audit_log`)
    await db.insert(proWaitlist).values([
      { email: 'zoe@example.com', createdAt: new Date('2026-10-01T10:00:00Z') },
      { email: 'adam@example.com', createdAt: new Date('2026-10-03T10:00:00Z') },
      // Stored before validation existed, or typed oddly: must not become a spreadsheet formula.
      { email: '=cmd@example.com', createdAt: new Date('2026-10-02T10:00:00Z') },
    ])

    const newest = await listWaitlist(db)
    expect(newest).toMatchObject({ total: 3, sort: 'joined', dir: 'desc' })
    expect(newest.rows.map((r) => r.email)).toEqual([
      'adam@example.com',
      '=cmd@example.com',
      'zoe@example.com',
    ])
    const byEmail = await listWaitlist(db, '', { sort: 'email', dir: 'asc' })
    expect(byEmail.rows.at(-1)?.email).toBe('zoe@example.com')
    expect((await listWaitlist(db, 'ZOE')).rows.map((r) => r.email)).toEqual(['zoe@example.com'])

    const { csv, rows } = await exportWaitlist(admin())
    expect(rows).toBe(3)
    expect(csv.startsWith('\uFEFFemail,joined_at\r\n')).toBe(true)
    // Oldest first, ISO timestamps, and the formula-like address defused.
    expect(csv.split('\r\n').slice(1, 4)).toEqual([
      'zoe@example.com,2026-10-01T10:00:00.000Z',
      "'=cmd@example.com,2026-10-02T10:00:00.000Z",
      'adam@example.com,2026-10-03T10:00:00.000Z',
    ])
    expect((await exportWaitlist(admin(), 'adam')).rows).toBe(1)

    await removeFromWaitlist(admin(), 'zoe@example.com')
    expect((await listWaitlist(db)).total).toBe(2)
    const logged = await db.select().from(auditLog).where(eq(auditLog.actor, 'admin-1'))
    expect(logged.map((a) => a.action).sort()).toEqual([
      'waitlist.export',
      'waitlist.export',
      'waitlist.remove',
    ])
    expect(logged.find((a) => a.details?.search === 'adam')).toMatchObject({
      details: { rows: 1, search: 'adam' },
    })
  })
})
