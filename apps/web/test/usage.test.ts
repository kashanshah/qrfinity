import { utcDay, type CloudflareUsage } from '@qrfinity/core'
import { scanDaily, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AdminContext } from '@/lib/server/admin'
import { parseUsage } from '@/lib/server/cloudflare-usage'
import { createDynamicCode, updateDestination } from '@/lib/server/codes'
import { getCloudflarePlan, setCloudflarePlan } from '@/lib/server/settings'
import { usageReport } from '@/lib/server/usage'
import { FakeEdge, ctxFor, design, freshDb, makeUser } from './helpers'

describe('Cloudflare usage response', () => {
  it('keeps only our Workers and maps KV actions', () => {
    const days = parseUsage({
      data: {
        viewer: {
          accounts: [
            {
              workers: [
                {
                  sum: { requests: 900 },
                  dimensions: { date: '2026-10-16', scriptName: 'qrfinity-redirect' },
                },
                {
                  sum: { requests: 100 },
                  dimensions: { date: '2026-10-16', scriptName: 'qrfinity-edge-api' },
                },
                {
                  sum: { requests: 5000 },
                  dimensions: { date: '2026-10-16', scriptName: 'someone-else' },
                },
              ],
              kv: [
                { sum: { requests: 700 }, dimensions: { date: '2026-10-16', actionType: 'read' } },
                { sum: { requests: 12 }, dimensions: { date: '2026-10-16', actionType: 'write' } },
                { sum: { requests: 3 }, dimensions: { date: '2026-10-15', actionType: 'list' } },
              ],
            },
          ],
        },
      },
    })
    expect(days).toEqual([{ date: '2026-10-16', workerRequests: 1000, kvReads: 700, kvWrites: 12 }])
  })

  it('reports API errors plainly', () => {
    expect(() => parseUsage({ errors: [{ message: 'not authorized for that account' }] })).toThrow(
      'not authorized',
    )
    expect(() => parseUsage({ data: { viewer: { accounts: [] } } })).toThrow('CF_ACCOUNT_ID')
  })
})

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(
    sql`truncate codes, app_settings, rate_limits, edge_sync_outbox, audit_log, "user" cascade`,
  )
  await makeUser(db, 'alice')
})

const admin = (): AdminContext => ({
  db,
  edge: new FakeEdge(),
  mailer: { send: async () => {} },
  actor: 'admin',
  abuseEmail: 'abuse@example.com',
  siteUrl: 'https://qrfinity.com',
})

describe('usage report', () => {
  it('estimates KV writes from our database when Cloudflare is unavailable', async () => {
    const ctx = ctxFor(db, 'alice')
    const c = await createDynamicCode(ctx, { name: 'Menu', destination: 'example.com/a', design })
    await updateDestination(ctx, c.id, { destination: 'example.com/b' })
    const yesterday = utcDay(new Date(Date.now() - 86_400_000))
    await db.insert(scanDaily).values({
      codeId: c.id,
      day: yesterday,
      scans: 42,
      uniques: 30,
      hours: Array(24).fill(0),
      breakdowns: {},
    })

    const r = await usageReport(db, null, 'free')
    expect(r.source).toBe('estimate')
    expect(r.cloudflareError).toMatch('CF_ANALYTICS_TOKEN')
    const today = r.table[0]!
    expect(today).toMatchObject({ codesCreated: 1, destinationChanges: 2, kvWrites: 3 })
    expect(r.table[1]!.scans).toBe(42)
    expect(r.metrics.find((m) => m.metric === 'kvWrites')).toMatchObject({
      used: 3,
      limit: 1000,
      level: 'ok',
    })
    expect(r.metrics.find((m) => m.metric === 'workerRequests')?.used).toBeUndefined()
  })

  it('uses Cloudflare’s numbers when available, and the plan setting', async () => {
    const today = utcDay(new Date())
    const cf: CloudflareUsage = {
      daily: async () => [{ date: today, workerRequests: 85_000, kvReads: 40_000, kvWrites: 20 }],
    }
    const free = await usageReport(db, cf, 'free')
    expect(free.source).toBe('cloudflare')
    expect(free.metrics.find((m) => m.metric === 'workerRequests')).toMatchObject({
      used: 85_000,
      level: 'upgrade',
    })

    expect(await getCloudflarePlan(db)).toBe('free')
    await setCloudflarePlan(admin(), 'paid')
    expect(await getCloudflarePlan(db)).toBe('paid')
    const paid = await usageReport(db, cf, 'paid')
    expect(paid.metrics.find((m) => m.metric === 'workerRequests')).toMatchObject({
      limit: 10_000_000,
      level: 'ok',
    })
    await expect(setCloudflarePlan(admin(), 'enterprise')).rejects.toThrow('free or paid')
  })

  it('shows the error but keeps the estimate when Cloudflare fails', async () => {
    const cf: CloudflareUsage = {
      daily: async () => {
        throw new Error('Cloudflare responded 403')
      },
    }
    const r = await usageReport(db, cf, 'free')
    expect(r).toMatchObject({ source: 'estimate', cloudflareError: 'Cloudflare responded 403' })
  })
})
