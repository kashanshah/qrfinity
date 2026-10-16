import type { RedirectRule } from '@qrfinity/core'
import { codes, eq, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AdminContext } from '@/lib/server/admin'
import { runRiskChecks } from '@/lib/server/admin'
import { advancedCodeUsage, createDynamicCode, deleteCode, setRules } from '@/lib/server/codes'
import { invalidateFlags, setUserPlan } from '@/lib/server/entitlements'
import { FakeEdge, FakeReputation, ctxFor, design, freshDb, makeUser } from './helpers'

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

const ctx = (reputation = new FakeReputation()) => ctxFor(db, 'alice', edge, undefined, reputation)
const admin = (): AdminContext => ({
  db,
  edge,
  mailer: { send: async () => {} },
  actor: 'admin',
  abuseEmail: 'abuse@example.com',
  siteUrl: 'https://qrfinity.com',
})
const make = (name = 'Menu', slug?: string) =>
  createDynamicCode(ctx(), { name, destination: 'example.com/menu', design, slug })
const appRules = [
  { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'apps.apple.com/app/123' },
  {
    name: 'Play',
    when: { type: 'device', devices: ['android'] },
    dest: 'https://play.google.com/x',
  },
]
const sentRules = async (id: string) => {
  const [row] = await db.select().from(codes).where(eq(codes.id, id))
  return edge.calls.filter((c) => c.slug === row!.slug && c.op === 'put').at(-1)?.record?.rules
}

describe('redirect rules', () => {
  it('saves rules, cleans destinations and sends them to the edge', async () => {
    const c = await make()
    const saved = await setRules(ctx(), c.id, appRules)
    expect(saved.rules).toEqual<RedirectRule[]>([
      {
        name: '',
        when: { type: 'device', devices: ['ios'] },
        dest: 'https://apps.apple.com/app/123',
      },
      {
        name: 'Play',
        when: { type: 'device', devices: ['android'] },
        dest: 'https://play.google.com/x',
      },
    ])
    expect(await sentRules(c.id)).toEqual(saved.rules)
    expect(saved.version).toBe(c.version + 1)
    // An empty list removes them.
    expect((await setRules(ctx(), c.id, [])).rules).toBeNull()
    expect(await sentRules(c.id)).toBeUndefined()
  })

  it('refuses invalid rules and unsafe destinations', async () => {
    const c = await make()
    await expect(
      setRules(ctx(), c.id, [{ when: { type: 'device', devices: [] }, dest: 'a.com' }]),
    ).rejects.toThrow('Rule 1: Choose at least one kind of phone.')
    const rep = new FakeReputation()
    rep.flagged.set('evil.example', { status: 'threat', threats: ['SOCIAL_ENGINEERING'] })
    await expect(
      setRules(ctx(rep), c.id, [
        { when: { type: 'country', countries: ['CA'] }, dest: 'evil.example/login' },
      ]),
    ).rejects.toThrow('Google flags this address as unsafe')
  })

  it('counts a code once, whether it has a custom link, rules or both', async () => {
    const a = await make('A', 'joes-menu')
    await setRules(ctx(), a.id, appRules)
    expect(await advancedCodeUsage(ctx())).toMatchObject({ used: 1, allowance: 1 })
    const b = await make('B')
    await expect(setRules(ctx(), b.id, appRules)).rejects.toThrow(
      'advanced features on 1 of 1 code. Choose a plan',
    )
  })

  it('pauses rules on codes beyond the allowance and resumes them, oldest first', async () => {
    await setUserPlan(admin(), 'alice', 'plus')
    const a = await make('A')
    const b = await make('B')
    const c = await make('C', 'cafe-c')
    await setRules(ctx(), a.id, appRules)
    await setRules(ctx(), b.id, appRules)

    // Back to free (1 code): the oldest keeps its rules; B's stop; C's short link keeps working.
    await setUserPlan(admin(), 'alice', 'free')
    const paused = async (id: string) =>
      (await db.select().from(codes).where(eq(codes.id, id)))[0]!.advancedPaused
    expect([await paused(a.id), await paused(b.id), await paused(c.id)]).toEqual([
      false,
      true,
      true,
    ])
    expect(await sentRules(a.id)).toHaveLength(2)
    expect(await sentRules(b.id)).toBeUndefined()
    const [view] = await db.execute<{ rules: unknown }>(
      sql`select rules from redirect_lookup where id = ${b.id}`,
    )
    expect(view?.rules).toBeNull()
    await expect(setRules(ctx(), b.id, appRules)).rejects.toThrow('paused because your plan')

    // Deleting A frees its place: B gets its rules back.
    await deleteCode(ctx(), a.id)
    expect(await paused(b.id)).toBe(false)
    expect(await sentRules(b.id)).toHaveLength(2)

    // A plan again: everything resumes.
    await setUserPlan(admin(), 'alice', 'pro')
    expect(await paused(c.id)).toBe(false)
  })

  it('removing rules frees a place for a paused code', async () => {
    await setUserPlan(admin(), 'alice', 'plus')
    const a = await make('A')
    const b = await make('B')
    await setRules(ctx(), a.id, appRules)
    await setRules(ctx(), b.id, appRules)
    await setUserPlan(admin(), 'alice', 'free')
    await setRules(ctx(), a.id, [])
    expect(await sentRules(b.id)).toHaveLength(2)
  })

  it('re-checks rule destinations with the main one', async () => {
    const c = await make()
    await setRules(ctx(), c.id, appRules)
    await db
      .update(codes)
      .set({ nextRiskCheckAt: new Date(0) })
      .where(eq(codes.id, c.id))
    const rep = new FakeReputation()
    rep.flagged.set('play.google.com', { status: 'threat', threats: ['SOCIAL_ENGINEERING'] })
    await runRiskChecks(admin(), rep, 10)
    expect(rep.calls).toEqual([
      'https://example.com/menu',
      'https://apps.apple.com/app/123',
      'https://play.google.com/x',
    ])
    const [row] = await db.select().from(codes).where(eq(codes.id, c.id))
    expect(row?.status).toBe('disabled')
  })
})
