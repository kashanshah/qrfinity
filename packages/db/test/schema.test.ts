import { DEFAULT_DESIGN } from '@qrfinity/core'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { codes, redirectLookup, user, type Database } from '../src'
import { resetTestDb } from './helpers'

let db: Database
beforeAll(async () => {
  db = await resetTestDb()
  await db.insert(user).values({ id: 'u1', name: 'Ada', email: 'ada@example.com' })
})
afterAll(() => db.$client.end())

describe('schema', () => {
  it('redirect_lookup shows live dynamic codes only', async () => {
    const base = {
      userId: 'u1',
      name: 'x',
      design: DEFAULT_DESIGN,
      domain: 'qrfinity.link',
      destination: 'https://example.com',
    }
    await db.insert(codes).values([
      { ...base, kind: 'dynamic', slug: 'live001' },
      { ...base, kind: 'dynamic', slug: 'gone001', deletedAt: new Date() },
      { ...base, kind: 'static', slug: null, domain: null },
    ])
    const rows = await db.select().from(redirectLookup)
    expect(rows.map((r) => r.slug)).toEqual(['live001'])
  })
  it('never reuses a slug on the same domain', async () => {
    await expect(
      db.insert(codes).values({
        userId: 'u1',
        name: 'dup',
        kind: 'dynamic',
        domain: 'qrfinity.link',
        slug: 'gone001',
        design: DEFAULT_DESIGN,
      }),
    ).rejects.toThrow()
  })
  it('bumps updated_at on update', async () => {
    const [before] = await db.select().from(codes).where(eq(codes.slug, 'live001'))
    await new Promise((r) => setTimeout(r, 5))
    await db.update(codes).set({ name: 'renamed' }).where(eq(codes.id, before!.id))
    const [after] = await db.select().from(codes).where(eq(codes.id, before!.id))
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())
  })
})
