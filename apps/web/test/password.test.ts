import { DEFAULT_FIELDS, isPasswordHash, verifyPassword } from '@qrfinity/core'
import { codes, eq, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  advancedCodeUsage,
  createDynamicCode,
  deleteCode,
  exportAll,
  getCode,
  listCodes,
  setPassword,
  setRules,
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
    sql`truncate codes, feature_flags, app_settings, rate_limits, edge_sync_outbox, audit_log, subscriptions, "user" cascade`,
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
const stored = async (id: string) => (await db.select().from(codes).where(eq(codes.id, id)))[0]!
const sentLock = async (id: string) => {
  const row = await stored(id)
  return edge.calls.filter((c) => c.slug === row.slug && c.op === 'put').at(-1)?.record?.lock
}

describe('password protection', () => {
  it('stores only a hash, sends it to the edge, and never to a browser', async () => {
    const c = await make()
    const view = await setPassword(ctx(), c.id, 'open sesame')
    expect(view.hasPassword).toBe(true)
    expect('passwordHash' in view).toBe(false)
    expect(view.version).toBe(c.version + 1)

    const row = await stored(c.id)
    expect(isPasswordHash(row.passwordHash)).toBe(true)
    expect(row.passwordHash).not.toContain('open sesame')
    expect(await verifyPassword('open sesame', row.passwordHash!)).toBe(true)
    expect(await sentLock(c.id)).toBe(row.passwordHash)

    const [listed] = await listCodes(ctx())
    expect('passwordHash' in listed!).toBe(false)
    expect(listed!.hasPassword).toBe(true)
    const [exported] = await exportAll(ctx())
    expect(exported!.password_protected).toBe(true)
    expect(JSON.stringify(exported)).not.toContain('pbkdf2')

    // The Worker's database fallback sees the hash too.
    const [lookup] = await db.execute<{ password_hash: string | null }>(
      sql`select password_hash from redirect_lookup where id = ${c.id}`,
    )
    expect(lookup!.password_hash).toBe(row.passwordHash)

    const removed = await setPassword(ctx(), c.id, null)
    expect(removed.hasPassword).toBe(false)
    expect((await stored(c.id)).passwordHash).toBeNull()
    expect(await sentLock(c.id)).toBeUndefined()
  })

  it('checks the length', async () => {
    const c = await make()
    await expect(setPassword(ctx(), c.id, 'abc')).rejects.toThrow('Use at least 4 characters.')
    await expect(setPassword(ctx(), c.id, 'x'.repeat(65))).rejects.toThrow(
      'Use at most 64 characters.',
    )
  })

  it('counts toward the advanced allowance once per code', async () => {
    const a = await make('A')
    const b = await make('B')
    await setPassword(ctx(), a.id, 'first one')
    expect((await advancedCodeUsage(ctx())).used).toBe(1)
    // Rules on the same code don't take another place.
    await setRules(ctx(), a.id, [
      { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'apps.apple.com/x' },
    ])
    expect((await advancedCodeUsage(ctx())).used).toBe(1)
    await expect(setPassword(ctx(), b.id, 'second one')).rejects.toThrow(
      'You’re using advanced features on 1 of 1 code. Choose a plan to add a password to more codes.',
    )
    // Changing the password on the code that already has one is fine.
    await setPassword(ctx(), a.id, 'changed it')
    await setUserPlan(admin(), 'alice', 'plus')
    expect((await setPassword(ctx(), b.id, 'second one')).hasPassword).toBe(true)
  })

  it('stays on when advanced features pause, and removing it frees a place', async () => {
    await setUserPlan(admin(), 'alice', 'plus')
    const a = await make('A')
    const b = await make('B')
    await setPassword(ctx(), a.id, 'older code')
    await setPassword(ctx(), b.id, 'newer code')
    await setUserPlan(admin(), 'alice', 'free')

    const paused = await getCode(ctx(), b.id)
    expect(paused.advancedPaused).toBe(true)
    // Protection is never paused: the edge still has the lock.
    expect(await sentLock(b.id)).toBeTruthy()
    const [lookup] = await db.execute<{ password_hash: string | null }>(
      sql`select password_hash from redirect_lookup where id = ${b.id}`,
    )
    expect(lookup!.password_hash).toBeTruthy()

    // A paused code can change its password but not gain one it never had.
    await setPassword(ctx(), b.id, 'new newer code')
    const c = await make('C')
    await expect(setPassword(ctx(), c.id, 'third code')).rejects.toThrow('2 of 1 code')

    // Removing A's password frees the place: B gets its features back.
    await setPassword(ctx(), a.id, null)
    expect((await getCode(ctx(), b.id)).advancedPaused).toBe(false)
  })

  it('frees the place when a protected code is deleted', async () => {
    const a = await make('A')
    const b = await make('B')
    await setPassword(ctx(), a.id, 'to delete')
    await deleteCode(ctx(), a.id)
    expect((await advancedCodeUsage(ctx())).used).toBe(0)
    expect((await setPassword(ctx(), b.id, 'now this')).hasPassword).toBe(true)
  })

  it('protects contact cards too', async () => {
    const card = await createDynamicCode(ctx(), {
      name: 'Card',
      content: {
        type: 'vcard',
        fields: { ...DEFAULT_FIELDS.vcard, firstName: 'Ada', lastName: 'Lovelace' },
      },
      design,
    })
    await setPassword(ctx(), card.id, 'card pass')
    const row = await stored(card.id)
    const sent = edge.calls.filter((c) => c.slug === row.slug && c.op === 'put').at(-1)?.record
    expect(sent?.page?.type).toBe('vcard')
    expect(sent?.lock).toBe(row.passwordHash)
  })
})
