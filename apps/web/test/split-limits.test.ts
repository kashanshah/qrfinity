import type { ScanAnalytics } from '@qrfinity/core'
import { codes, eq, scanDaily, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  advancedCodeUsage,
  checkScanLimits,
  createDynamicCode,
  getCode,
  setLimits,
  setSplit,
  updateDestination,
} from '@/lib/server/codes'
import { invalidateFlags, setUserPlan } from '@/lib/server/entitlements'
import { FakeEdge, ctxFor, design, freshDb, makeUser } from './helpers'

let db: Database
let edge: FakeEdge
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(
    sql`truncate codes, feature_flags, app_settings, rate_limits, edge_sync_outbox, audit_log, subscriptions, scan_daily, "user" cascade`,
  )
  invalidateFlags()
  edge = new FakeEdge()
  await makeUser(db, 'alice')
})

const ctx = () => ctxFor(db, 'alice', edge)
const admin = () => ({
  db,
  edge,
  mailer: { send: async () => {} },
  actor: 'admin',
  abuseEmail: 'abuse@example.com',
  siteUrl: 'https://qrfinity.com',
})
const make = (name = 'Menu') =>
  createDynamicCode(ctx(), { name, destination: 'example.com/menu', design })
const lastSent = async (id: string) => {
  const [row] = await db.select().from(codes).where(eq(codes.id, id))
  return edge.calls.filter((c) => c.slug === row!.slug && c.op === 'put').at(-1)?.record
}

/** Scan counts by code id, ignoring `since` (the cron's maths is what's under test). */
function fakeAnalytics(counts: Record<string, number>, seen: Date[] = []): ScanAnalytics {
  return {
    live: true,
    report: async () => {
      throw new Error('unused')
    },
    codeTotals: async () => new Map(),
    dailyRollup: async () => [],
    scanCount: async (id, since) => {
      seen.push(since)
      return counts[id] ?? 0
    },
  }
}

describe('split traffic', () => {
  it('saves versions, sends them to the edge and removes them', async () => {
    const c = await make()
    const saved = await setSplit(ctx(), c.id, [
      { name: 'New', dest: 'example.com/new', percent: 40 },
    ])
    expect(saved.split).toEqual({
      variants: [{ name: 'New', dest: 'https://example.com/new', percent: 40 }],
    })
    expect((await lastSent(c.id))?.split).toEqual(saved.split)
    expect((await advancedCodeUsage(ctx())).used).toBe(1)
    const removed = await setSplit(ctx(), c.id, [])
    expect(removed.split).toBeNull()
    expect((await lastSent(c.id))?.split).toBeUndefined()
    expect((await advancedCodeUsage(ctx())).used).toBe(0)
  })

  it('takes a place in the allowance and refuses contact cards', async () => {
    const a = await make('A')
    const b = await make('B')
    await setSplit(ctx(), a.id, [{ name: '', dest: 'example.com/b', percent: 50 }])
    await expect(
      setSplit(ctx(), b.id, [{ name: '', dest: 'example.com/b', percent: 50 }]),
    ).rejects.toThrow('Choose a plan to add split traffic to more codes.')
    await expect(
      updateDestination(ctx(), a.id, {
        content: {
          type: 'vcard',
          fields: { firstName: 'Ada' } as never,
        },
      }),
    ).rejects.toThrow('before turning it into a contact card')
  })

  it('pauses with the plan: scans go to the main destination', async () => {
    await setUserPlan(admin(), 'alice', 'plus')
    const a = await make('A')
    const b = await make('B')
    await setSplit(ctx(), a.id, [{ name: '', dest: 'example.com/x', percent: 50 }])
    await setSplit(ctx(), b.id, [{ name: '', dest: 'example.com/y', percent: 50 }])
    await setUserPlan(admin(), 'alice', 'free')
    expect((await getCode(ctx(), b.id)).advancedPaused).toBe(true)
    expect((await lastSent(b.id))?.split).toBeUndefined()
    expect((await lastSent(a.id))?.split).toBeDefined()
    const [view] = await db.execute<{ split: unknown }>(
      sql`select split from redirect_lookup where id = ${b.id}`,
    )
    expect(view!.split).toBeNull()
  })
})

describe('date and scan limits', () => {
  it('sends the switch moment to the edge', async () => {
    const c = await make()
    const saved = await setLimits(ctx(), c.id, {
      dest: 'example.com/ended',
      date: '2026-12-31',
      time: '23:00',
      timezone: 'America/Toronto',
      scans: '',
    })
    expect(saved.limits).toMatchObject({
      dest: 'https://example.com/ended',
      at: '2027-01-01T04:00:00.000Z',
    })
    expect((await lastSent(c.id))?.limit).toEqual({
      at: '2027-01-01T04:00:00.000Z',
      dest: 'https://example.com/ended',
    })
    // The Worker's database fallback gets the same limits.
    const [view] = await db.execute<{ limits: { at: string } | null }>(
      sql`select limits from redirect_lookup where id = ${c.id}`,
    )
    expect(view!.limits?.at).toBe('2027-01-01T04:00:00.000Z')

    expect((await setLimits(ctx(), c.id, null)).limits).toBeNull()
    expect((await lastSent(c.id))?.limit).toBeUndefined()
  })

  it('switches a code once its scan limit is reached', async () => {
    const c = await make()
    await setLimits(ctx(), c.id, {
      dest: 'example.com/sold-out',
      date: '',
      time: '',
      timezone: '',
      scans: '100',
    })
    // Not reached yet: nothing changes and the edge has no switch.
    expect(await checkScanLimits(db, fakeAnalytics({ [c.id]: 99 }), edge)).toEqual({
      checked: 1,
      switched: 0,
    })
    expect((await lastSent(c.id))?.limit).toBeUndefined()

    const now = new Date()
    expect(await checkScanLimits(db, fakeAnalytics({ [c.id]: 100 }), edge, now)).toEqual({
      checked: 1,
      switched: 1,
    })
    expect((await getCode(ctx(), c.id)).limits?.reachedAt).toBe(now.toISOString())
    expect((await lastSent(c.id))?.limit).toEqual({
      at: now.toISOString(),
      dest: 'https://example.com/sold-out',
    })
    // Once reached, it's no longer checked.
    expect(await checkScanLimits(db, fakeAnalytics({ [c.id]: 500 }), edge)).toEqual({
      checked: 0,
      switched: 0,
    })
  })

  it('counts old scans from the daily roll-ups', async () => {
    const c = await make()
    await setLimits(ctx(), c.id, {
      dest: 'example.com/sold-out',
      date: '',
      time: '',
      timezone: '',
      scans: '100',
    })
    const now = new Date()
    const since = new Date(now.getTime() - 120 * 86_400_000)
    await db
      .update(codes)
      .set({
        limits: sql`jsonb_set(${codes.limits}, '{since}', to_jsonb(${since.toISOString()}::text))`,
      })
      .where(eq(codes.id, c.id))
    await db.insert(scanDaily).values({
      codeId: c.id,
      day: new Date(now.getTime() - 100 * 86_400_000).toISOString().slice(0, 10),
      scans: 60,
      uniques: 60,
      hours: Array(24).fill(0),
      breakdowns: {},
    })
    const seen: Date[] = []
    // 60 from the roll-ups plus 40 live.
    expect(await checkScanLimits(db, fakeAnalytics({ [c.id]: 40 }, seen), edge, now)).toMatchObject(
      { switched: 1 },
    )
    // Live data is only asked for the window it still holds.
    expect(seen[0]!.getTime()).toBeGreaterThan(now.getTime() - 89 * 86_400_000)
  })

  it('validates and needs an allowance place', async () => {
    const a = await make('A')
    const b = await make('B')
    await expect(
      setLimits(ctx(), a.id, {
        dest: 'example.com/x',
        date: '',
        time: '',
        timezone: '',
        scans: '',
      }),
    ).rejects.toThrow('Set a date, a number of scans, or both.')
    await setLimits(ctx(), a.id, {
      dest: 'example.com/x',
      date: '',
      time: '',
      timezone: '',
      scans: '5',
    })
    await expect(
      setLimits(ctx(), b.id, {
        dest: 'example.com/x',
        date: '',
        time: '',
        timezone: '',
        scans: '5',
      }),
    ).rejects.toThrow('Choose a plan to add limits to more codes.')
  })
})
